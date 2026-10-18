import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { AutonomyLevel, createSession, listModels, OutputFormatType } from '@factory/droid-sdk/node';
import { loadEnvLocal } from '../../../scripts/load-env-local.js';
import { byokModel } from '../src/runtime.js';

loadEnvLocal(resolve(dirname(fileURLToPath(import.meta.url)), '../../..', '.env.local'));
const factoryApiKey = process.env.FACTORY_API_KEY!, anthropicApiKey = process.env.ANTHROPIC_API_KEY!, claudeModelId = process.env.CLAUDE_MODEL_ID!;
const anthropicWorkspaceId = process.env.ANTHROPIC_WORKSPACE_ID?.trim() || undefined;
console.log(`workspace header: ${anthropicWorkspaceId ? 'extraHeaders env reference' : 'absent'} · key prefix class: ${anthropicApiKey.startsWith('sk-ant-usr-') ? 'sk-ant-usr' : anthropicApiKey.startsWith('sk-ant-api') ? 'sk-ant-api' : 'other'}`);
const cwd = await mkdtemp(join(tmpdir(), 'droid-byok-'));
await mkdir(join(cwd, '.factory'), { recursive: true });
const modelSettings = byokModel({ claudeModelId, anthropicWorkspaceId });
if (JSON.stringify(modelSettings).includes(anthropicWorkspaceId ?? '___absent___')) throw new Error('Workspace id was written into settings.');
await writeFile(join(cwd, '.factory/settings.json'), JSON.stringify({ cloudSessionSync: false, customModels: [modelSettings] }), { mode: 0o600 });
const execPath = join(dirname(createRequire(import.meta.url).resolve('droid/package.json')), 'bin', 'droid');
const env = { ...process.env as Record<string, string>, FACTORY_HOME_OVERRIDE: cwd, TERM: 'dumb', CI: '1', ANTHROPIC_API_KEY: anthropicApiKey, FACTORY_API_KEY: factoryApiKey, ...(anthropicWorkspaceId ? { ANTHROPIC_WORKSPACE_ID: anthropicWorkspaceId } : {}) };
const models = await listModels({ apiKey: factoryApiKey, cwd, env, execPath });
const model = models.find(m => m.isCustom && m.displayName === 'Before You Claude');
console.log('resolved BYOK model id:', model?.id, '| provider:', model?.modelProvider, '| disabled:', model?.disabled);
if (!model) process.exit(1);

function summarize(message: Record<string, unknown>) {
  const keep = ['type', 'subtype', 'success', 'error', 'structuredOutputError', 'structuredOutput', 'stopReason', 'isError', 'errorMessage'];
  return Object.fromEntries(Object.entries(message).filter(([k]) => keep.includes(k)).map(([k, v]) => [k, typeof v === 'string' && v.length > 400 ? v.slice(0, 400) + '…' : v]));
}

async function run(label: string, prompt: string, outputFormat?: { type: typeof OutputFormatType.JsonSchema; schema: Record<string, unknown> }) {
  const session = await createSession({ cwd, env, disableBuiltinSkills: true, modelId: model!.id, apiKey: factoryApiKey, execPath, autonomyLevel: AutonomyLevel.Off, mcpServers: [] });
  try {
    console.log(`\n== ${label} ==`);
    for await (const message of session.stream(prompt, { ...(outputFormat ? { outputFormat } : {}), abortSignal: AbortSignal.timeout(90000) })) {
      const m = message as Record<string, unknown>;
      if (m.type === 'assistant' || m.type === 'text') {
        const content = (m as { content?: unknown; text?: unknown }).content ?? (m as { text?: unknown }).text;
        console.log('assistant:', typeof content === 'string' ? content.slice(0, 300) : JSON.stringify(content)?.slice(0, 300));
      } else if (m.type === 'result' || m.type === 'error' || m.type === 'system') {
        console.log(m.type, JSON.stringify(summarize(m), null, 0));
      }
    }
  } catch (error) {
    console.log('stream threw:', error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  } finally { await session.close(); }
}

await run('plain text', 'Reply with exactly: BYOK OK');
await run('structured output', 'Return JSON with answer set to the string "yes".', { type: OutputFormatType.JsonSchema, schema: { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'], additionalProperties: false } });
await rm(cwd, { recursive: true, force: true });
