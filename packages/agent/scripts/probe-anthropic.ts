import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvLocal } from '../../../scripts/load-env-local.js';

loadEnvLocal(resolve(dirname(fileURLToPath(import.meta.url)), '../../..', '.env.local'));
const key = process.env.ANTHROPIC_API_KEY?.trim();
const model = process.env.CLAUDE_MODEL_ID?.trim();
const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
if (!key || !model) { console.error('BLOCKED: ANTHROPIC_API_KEY or CLAUDE_MODEL_ID missing'); process.exit(2); }

const base: Record<string, string> = { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', ...(workspaceId ? { 'anthropic-workspace-id': workspaceId } : {}) };
const prefix = key.startsWith('sk-ant-usr-') ? 'sk-ant-usr' : key.startsWith('sk-ant-api') ? 'sk-ant-api' : key.startsWith('sk-ant-admin') ? 'sk-ant-admin' : 'other';
console.log(`key prefix class: ${prefix} · model: ${model} · workspace header: ${workspaceId ? 'set' : 'absent'}`);

type Body = { error?: { type?: string; message?: string }; content?: Array<{ text?: string }>; model?: string; data?: Array<{ id?: string }> } | null;
async function call(label: string, url: string, init: RequestInit) {
  const response = await fetch(url, { ...init, headers: base, signal: AbortSignal.timeout(30000) });
  const body = await response.json().catch(() => null) as Body;
  const detail = body?.error ? `${body.error.type}: ${String(body.error.message).slice(0, 180)}` : body?.content ? `text=${JSON.stringify(body.content[0]?.text)} model=${body.model}` : body?.data ? `${body.data.length} items` : '';
  console.log(`${label.padEnd(28)} HTTP ${response.status} ${detail}`);
  return response.status;
}

await call('GET /v1/models', 'https://api.anthropic.com/v1/models', { method: 'GET' });
await call('GET organizations/workspaces', 'https://api.anthropic.com/v1/organizations/workspaces', { method: 'GET' });
const status = await call('POST /v1/messages', 'https://api.anthropic.com/v1/messages', { method: 'POST', body: JSON.stringify({ model, max_tokens: 16, messages: [{ role: 'user', content: 'Reply with the single word OK.' }] }) });
process.exitCode = status === 200 ? 0 : 1;
