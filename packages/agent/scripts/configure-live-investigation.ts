import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { listModels } from '@factory/droid-sdk/node';
import { Daytona, Image, SnapshotState } from '@daytona/sdk';
import { byokModel } from '../src/runtime.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const envPath = join(repoRoot, '.env.local');
import { loadEnvLocal } from '../../../scripts/load-env-local.js';
loadEnvLocal(envPath);

function upsertEnv(keys: Record<string, string>) {
  const lines = existsSync(envPath) ? readFileSync(envPath, 'utf8').split('\n') : [];
  const seen = new Set<string>();
  const out = lines.map(line => {
    const match = line.match(/^([A-Z_]+)=/);
    if (!match) return line;
    const key = match[1]!;
    if (key in keys) {
      seen.add(key);
      return `${key}=${keys[key]}`;
    }
    return line;
  });
  for (const [key, value] of Object.entries(keys)) {
    if (!seen.has(key)) out.push(`${key}=${value}`);
  }
  writeFileSync(envPath, out.filter((line, index, all) => line.length || index < all.length - 1).join('\n').replace(/\n?$/, '\n'), { mode: 0o600 });
}

const CLAUDE_CANDIDATES = [
  'claude-sonnet-4-6',
  'claude-sonnet-4-20250514',
  'claude-3-7-sonnet-20250219',
  'claude-3-5-sonnet-20241022',
] as const;

async function selectClaudeModel(): Promise<string> {
  const factoryApiKey = process.env.FACTORY_API_KEY?.trim();
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!factoryApiKey || !anthropicApiKey) throw new Error('FACTORY_API_KEY and ANTHROPIC_API_KEY are required.');
  const execPath = process.env.DROID_EXEC_PATH?.trim() || join(dirname(createRequire(pathToFileURL(import.meta.url).href).resolve('droid/package.json')), 'bin', 'droid');
  for (const candidate of CLAUDE_CANDIDATES) {
    const cwd = await mkdtemp(join(tmpdir(), 'beforeyou-byok-'));
    try {
      await mkdir(join(cwd, '.factory'), { recursive: true });
      await writeFile(join(cwd, '.factory', 'settings.json'), JSON.stringify({
        cloudSessionSync: false,
        customModels: [byokModel({ claudeModelId: candidate, anthropicWorkspaceId: process.env.ANTHROPIC_WORKSPACE_ID?.trim() || undefined })],
      }), { mode: 0o600 });
      const env: Record<string, string> = { ...process.env as Record<string, string>, FACTORY_HOME_OVERRIDE: cwd, ANTHROPIC_API_KEY: anthropicApiKey, FACTORY_API_KEY: factoryApiKey, TERM: 'dumb', CI: '1' };
      const models = await listModels({ apiKey: factoryApiKey, cwd, env, execPath });
      const model = models.find(m => m.id === `custom:${candidate}`)
        ?? models.find(m => m.isCustom && m.modelProvider === 'anthropic' && !m.disabled && m.displayName === 'Before You Claude');
      if (model?.isCustom && model.modelProvider === 'anthropic' && !model.disabled) {
        const settings = await readFile(join(cwd, '.factory', 'settings.json'), 'utf8');
        if (!settings.includes('"provider":"anthropic"') || !settings.includes('api.anthropic.com') || !settings.includes('${ANTHROPIC_API_KEY}')) {
          throw new Error('BYOK settings did not retain Anthropic provider configuration.');
        }
        console.log(`Selected Claude model: ${candidate}`);
        return candidate;
      }
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }
  throw new Error('No Anthropic BYOK Claude model was enabled via Factory listModels. Confirm BYOK in the Factory account and that the Anthropic key can access the chosen model.');
}

async function ensureSnapshot(name: string): Promise<string> {
  const apiKey = process.env.DAYTONA_API_KEY?.trim();
  if (!apiKey) throw new Error('DAYTONA_API_KEY is required.');
  const daytona = new Daytona({ apiKey, requestTimeoutMs: 600000 });
  try {
    const existing = await daytona.snapshot.get(name);
    if (existing.state === SnapshotState.ACTIVE) {
      console.log(`Daytona snapshot ready: ${name}`);
      return name;
    }
  } catch {
    /* create below */
  }
  const dockerfile = join(repoRoot, 'deployment/daytona/Dockerfile');
  const image = Image.fromDockerfile(dockerfile);
  console.log(`Creating Daytona snapshot ${name} from deployment/daytona (this may take several minutes)...`);
  const created = await daytona.snapshot.create({ name, image, resources: { cpu: 2, memory: 4, disk: 10 } }, {
    timeout: 900,
    onLogs: chunk => {
      const line = chunk.trim();
      if (line) console.log('[daytona-build]', line.slice(0, 200));
    },
  });
  const deadline = Date.now() + 900000;
  let snapshot = created;
  while (Date.now() < deadline) {
    snapshot = await daytona.snapshot.get(name);
    if (snapshot.state === SnapshotState.ACTIVE) {
      console.log(`Daytona snapshot ready: ${name}`);
      return name;
    }
    if (snapshot.state === SnapshotState.ERROR || snapshot.state === SnapshotState.BUILD_FAILED) {
      throw new Error(`Snapshot creation failed: ${snapshot.errorReason ?? 'unknown error'}`);
    }
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
  throw new Error('Timed out waiting for Daytona snapshot activation.');
}

async function resolveFixtureOrigin(): Promise<{ origin: string; domain: string }> {
  const existing = process.env.CONTROLLED_FIXTURE_ORIGIN?.trim();
  const domains = process.env.INVESTIGATION_ALLOWED_DOMAINS?.trim();
  if (existing && domains) {
    const domain = new URL(existing).hostname;
    if (domains.split(',').map(v => v.trim()).includes(domain)) return { origin: existing.replace(/\/$/, ''), domain };
  }
  const ngrokApi = await fetch('http://127.0.0.1:4040/api/tunnels', { signal: AbortSignal.timeout(3000) }).catch(() => null);
  if (!ngrokApi?.ok) throw new Error('Fixture tunnel is unavailable. Start scripts/fixture-host.ts and ngrok http 4080 before configuring.');
  const body = await ngrokApi.json() as { tunnels?: Array<{ public_url?: string; proto?: string }> };
  const tunnel = body.tunnels?.find(t => t.proto === 'https' && t.public_url);
  if (!tunnel?.public_url) throw new Error('No HTTPS ngrok tunnel found on port 4040.');
  const origin = tunnel.public_url.replace(/\/$/, '');
  return { origin, domain: new URL(origin).hostname };
}

const snapshotName = process.env.DAYTONA_SNAPSHOT?.trim() || 'beforeyou-browser-v1';
const modelId = await selectClaudeModel();
const snapshot = await ensureSnapshot(snapshotName);
const fixture = await resolveFixtureOrigin();
upsertEnv({
  CLAUDE_MODEL_ID: modelId,
  DAYTONA_SNAPSHOT: snapshot,
  CONTROLLED_FIXTURE_ORIGIN: fixture.origin,
  INVESTIGATION_ALLOWED_DOMAINS: fixture.domain,
});
console.log('Updated .env.local with CLAUDE_MODEL_ID, DAYTONA_SNAPSHOT, CONTROLLED_FIXTURE_ORIGIN, and INVESTIGATION_ALLOWED_DOMAINS.');
