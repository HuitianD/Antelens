import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { AutonomyLevel, createSession, listModels } from '@factory/droid-sdk/node';
import { loadEnvLocal } from '../../../scripts/load-env-local.js';

loadEnvLocal(resolve(dirname(fileURLToPath(import.meta.url)), '../../..', '.env.local'));
const config = {
  factoryApiKey: process.env.FACTORY_API_KEY!,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
  claudeModelId: process.env.CLAUDE_MODEL_ID!,
};
const cwd = await mkdtemp(join(tmpdir(), 'droid-tools-'));
await mkdir(join(cwd, '.factory'), { recursive: true });
await writeFile(join(cwd, '.factory/settings.json'), JSON.stringify({
  cloudSessionSync: false,
  customModels: [{ model: config.claudeModelId, displayName: 'Before You Claude', provider: 'anthropic', baseUrl: 'https://api.anthropic.com', apiKey: '${ANTHROPIC_API_KEY}', maxOutputTokens: 4096 }],
}));
const execPath = join(dirname(createRequire(import.meta.url).resolve('droid/package.json')), 'bin', 'droid');
const env = { ...process.env as Record<string, string>, FACTORY_HOME_OVERRIDE: cwd, TERM: 'dumb', CI: '1', ANTHROPIC_API_KEY: config.anthropicApiKey, FACTORY_API_KEY: config.factoryApiKey };
const models = await listModels({ apiKey: config.factoryApiKey, cwd, env, execPath });
const model = models.find(m => m.displayName === 'Before You Claude' && m.isCustom) ?? models.find(m => m.id === `custom:${config.claudeModelId}`);
if (!model) throw new Error('BYOK model unavailable');
const session = await createSession({ cwd, env, disableBuiltinSkills: true, modelId: model.id, apiKey: config.factoryApiKey, execPath, autonomyLevel: AutonomyLevel.Off, mcpServers: [] });
const before = await session.listTools();
console.log('before disable', before.filter(t => t.allowed).map(t => t.id));
await session.updateSettings({ disabledToolIds: before.map(t => t.id) });
const after = await session.listTools();
console.log('after disable all', after.filter(t => t.allowed).map(t => t.id));
await session.close();
await rm(cwd, { recursive: true, force: true });
