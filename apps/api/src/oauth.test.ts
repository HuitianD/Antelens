import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';
import Fastify, { type FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { DomainError } from '@beforeyou/fixtures';
import { decryptCredentials } from '@beforeyou/db';
import { assertOAuthDeployment, registerOAuth } from './oauth.js';
import type { ApiConfig } from './config.js';

const config: ApiConfig = { mode: 'live', host: '127.0.0.1', port: 4000, apiOrigin: 'http://127.0.0.1:4000', webOrigin: 'http://127.0.0.1:3000', allowedOrigins: ['http://127.0.0.1:3000'] };
const key = Buffer.alloc(32, 7);
const env = { GOOGLE_CLIENT_ID: 'synthetic-client-id', GOOGLE_CLIENT_SECRET: 'synthetic-client-secret', GOOGLE_REDIRECT_URI: `${config.apiOrigin}/v1/connections/gmail/callback`, CREDENTIAL_ENCRYPTION_KEY: key.toString('base64') };
const scope = 'https://www.googleapis.com/auth/gmail.readonly';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
type State = { state_hash: string; owner_id: string; pkce_verifier: string; return_to: string; expires_at: string; taken_at: number | null };

async function setup(overrides: Partial<ApiConfig> = {}, envOverrides: Partial<typeof env> = {}) {
  const settings = { ...config, ...overrides }; const ownerId = randomUUID();
  const states = new Map<string, State>(); const connections: Record<string, any>[] = []; const activity: unknown[] = []; const providerCalls: { url: string; body: URLSearchParams | undefined }[] = [];
  let time = Date.now();
  let providerEmail = 'synthetic@example.com';
  let tokenStatus = 200;
  const query = async (sql: string, params: any[] = []) => {
    if (sql.startsWith('INSERT INTO oauth_states')) {
      const [state_hash, owner_id, pkce_verifier, return_to, expires_at] = params;
      states.set(state_hash, { state_hash, owner_id, pkce_verifier, return_to, expires_at, taken_at: null }); return { rows: [], rowCount: 1 };
    }
    if (sql.startsWith('UPDATE oauth_states')) {
      const state = states.get(params[0]);
      if (!state || state.taken_at !== null || Date.parse(state.expires_at) <= time) return { rows: [], rowCount: 0 };
      state.taken_at = time; return { rows: [{ ...state }], rowCount: 1 };
    }
    if (sql.startsWith('SELECT * FROM connections')) return { rows: connections.filter(row => row.owner_id === params[0]), rowCount: connections.length };
    if (sql.startsWith('INSERT INTO connections')) {
      const [id, owner_id, provider_account_id, dto, encrypted_credentials, sync_cursor, sync_config] = params;
      const value = { id, owner_id, provider_account_id, status: 'connected', dto, encrypted_credentials, sync_cursor, sync_config };
      const index = connections.findIndex(row => row.id === id); if (index < 0) connections.push(value); else connections[index] = value;
      return { rows: [], rowCount: 1 };
    }
    if (sql.startsWith('INSERT INTO activity_events')) { activity.push(params); return { rows: [], rowCount: 1 }; }
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql) || sql.startsWith('SELECT pg_advisory_xact_lock')) return { rows: [], rowCount: 0 };
    throw new Error(`Unexpected SQL in offline OAuth test: ${sql}`);
  };
  const pool = { query, connect: async () => ({ query, release() {} }) } as unknown as Pool;
  const provider: typeof fetch = async (input, init) => {
    const url = String(input); providerCalls.push({ url, body: init?.body instanceof URLSearchParams ? init.body : undefined });
    if (url === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'synthetic-access-token', refresh_token: 'synthetic-refresh-token', scope, expires_in: 3600 }, { status: tokenStatus });
    if (url === 'https://gmail.googleapis.com/gmail/v1/users/me/profile') return Response.json({ emailAddress: providerEmail, historyId: '1000' });
    throw new Error('Unexpected provider URL.');
  };
  const app = Fastify({ logger: false });
  app.decorateRequest('ownerId', '');
  app.addHook('onRequest', async request => { (request as FastifyRequest & { ownerId: string }).ownerId = ownerId; });
  app.setErrorHandler((error, _request, reply) => { const e = error as Error; return reply.status(e instanceof DomainError ? e.status : 400).send({ error: { code: e instanceof DomainError ? e.code : 'VALIDATION_ERROR', message: e.message } }); });
  registerOAuth(app, settings, pool, { env: { ...env, ...envOverrides }, fetch: provider, now: () => time });
  const start = async (origin = settings.webOrigin, returnTo = '/connections') => {
    const response = await app.inject({ method: 'POST', url: '/v1/connections/gmail/start', headers: { origin }, payload: { returnTo } });
    if (response.statusCode !== 200) return { response, state: '', cookie: '', authorization: new URL('https://invalid.example') };
    const authorization = new URL(response.json().data.authorizationUrl);
    return { response, state: authorization.searchParams.get('state')!, cookie: String(response.headers['set-cookie']).split(';')[0]!, authorization };
  };
  const callback = (state: string, cookie?: string, error?: string) => app.inject({ url: `/v1/connections/gmail/callback?${new URLSearchParams({ state, ...(error ? { error } : { code: 'synthetic-code' }) })}`, headers: cookie ? { cookie } : {} });
  return { app, start, callback, states, connections, activity, providerCalls, ownerId, advanceTime: (ms: number) => { time += ms; }, providerEmail: (value: string) => { providerEmail = value; }, tokenStatus: (status: number) => { tokenStatus = status; } };
}

test('OAuth browser binding, PKCE, one-time state and encrypted persistence (mock provider/database; no live Google)', async t => {
  const h = await setup(); t.after(() => h.app.close());
  const started = await h.start(); assert.equal(started.response.statusCode, 200);
  assert.match(String(started.response.headers['set-cookie']), /HttpOnly; SameSite=Lax; Path=\/; Max-Age=600/);
  assert.ok(!String(started.response.headers['set-cookie']).includes('Domain='));
  const nonce = started.cookie.split('=')[1]!;
  const stored = h.states.get(digest(`${started.state}:${nonce}`))!;
  assert.equal(stored.owner_id, h.ownerId);
  assert.notEqual(stored.state_hash, started.state);
  assert.equal(started.authorization.searchParams.get('scope'), scope);
  assert.equal(started.authorization.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(started.authorization.searchParams.get('code_challenge'), createHash('sha256').update(stored.pkce_verifier).digest('base64url'));
  assert.equal((await h.callback(started.state)).statusCode, 403);
  assert.equal((await h.callback(started.state, `beforeyou_oauth=${'a'.repeat(32)}`)).statusCode, 403);
  assert.equal((await h.callback(started.state, `${started.cookie}; ${started.cookie}`)).statusCode, 403);
  assert.equal(stored.taken_at, null); assert.equal(h.providerCalls.length, 0);
  const result = await h.callback(started.state, started.cookie);
  assert.equal(result.statusCode, 302); assert.equal(result.headers.location, `${config.webOrigin}/connections?connected=gmail`);
  assert.match(String(result.headers['set-cookie']), /Max-Age=0/);
  assert.equal(h.providerCalls[0]!.body?.get('code_verifier'), stored.pkce_verifier);
  assert.equal(h.connections.length, 1); assert.equal(h.connections[0]!.owner_id, h.ownerId);
  assert.ok(!h.connections[0]!.encrypted_credentials.includes('synthetic-refresh-token'));
  assert.deepEqual(decryptCredentials(h.connections[0]!.encrypted_credentials, key), { refreshToken: 'synthetic-refresh-token' });
  assert.equal(h.activity.length, 1); assert.equal(h.connections[0]!.sync_config.initialCap, 50);
  assert.equal((await h.callback(started.state, started.cookie)).statusCode, 403);
  assert.equal(h.providerCalls.length, 2); assert.equal(h.connections.length, 1);
});

test('expired state, cancellation, untrusted origins and unsafe return paths cannot connect Gmail (offline)', async t => {
  const h = await setup(); t.after(() => h.app.close());
  assert.equal((await h.start('https://untrusted.example')).response.statusCode, 403);
  assert.equal((await h.start(config.webOrigin, '//untrusted.example')).response.statusCode, 400);
  assert.equal((await h.start(config.webOrigin, '/activity')).response.statusCode, 400);
  assert.equal(h.states.size, 0);
  const expired = await h.start(); h.advanceTime(600001);
  assert.equal((await h.callback(expired.state, expired.cookie)).statusCode, 403);
  const cancelled = await h.start(); const response = await h.callback(cancelled.state, cancelled.cookie, 'access_denied');
  assert.equal(response.headers.location, `${config.webOrigin}/connections?connection=cancelled`);
  assert.equal((await h.callback(cancelled.state, cancelled.cookie)).statusCode, 403);
  assert.equal(h.providerCalls.length, 0); assert.equal(h.connections.length, 0);
});

test('provider failure consumes state and clears the browser nonce without claiming connection success (offline)', async t => {
  const h = await setup(); t.after(() => h.app.close()); const started = await h.start(); h.tokenStatus(403);
  const result = await h.callback(started.state, started.cookie);
  assert.equal(result.statusCode, 503); assert.equal(result.json().error.code, 'PROVIDER_ACCESS_DENIED');
  assert.match(String(result.headers['set-cookie']), /Max-Age=0/); assert.equal(h.connections.length, 0);
  assert.equal((await h.callback(started.state, started.cookie)).statusCode, 403);
});

test('OAuth deployment rejects cross-site hosts and uses a host-bound secure cookie in production (offline)', async t => {
  assert.doesNotThrow(() => assertOAuthDeployment(config, env.GOOGLE_REDIRECT_URI));
  const production = { webOrigin: 'https://app.beforeyou.example', apiOrigin: 'https://api.beforeyou.example' };
  assert.doesNotThrow(() => assertOAuthDeployment(production, `${production.apiOrigin}/v1/connections/gmail/callback`));
  for (const invalid of [
    { webOrigin: 'http://localhost:3000', apiOrigin: config.apiOrigin },
    { webOrigin: 'https://app.example.com', apiOrigin: 'https://api.different.example' },
    { webOrigin: 'https://web.up.railway.app', apiOrigin: 'https://api.up.railway.app' },
    { webOrigin: 'http://app.example.com', apiOrigin: 'http://api.example.com' },
  ]) assert.throws(() => assertOAuthDeployment(invalid, `${invalid.apiOrigin}/v1/connections/gmail/callback`), /same site|HTTPS/);
  assert.throws(() => assertOAuthDeployment(config, 'http://127.0.0.1:4000/other-callback'), /GOOGLE_REDIRECT_URI/);
  const h = await setup(production, { GOOGLE_REDIRECT_URI: `${production.apiOrigin}/v1/connections/gmail/callback` }); t.after(() => h.app.close());
  const started = await h.start(); assert.equal(started.response.statusCode, 200);
  assert.match(String(started.response.headers['set-cookie']), /^__Host-beforeyou_oauth=.*; HttpOnly; SameSite=Lax; Path=\/; Max-Age=600; Secure$/);
  const cancelled = await h.callback(started.state, started.cookie, 'access_denied');
  assert.match(String(cancelled.headers['set-cookie']), /^__Host-beforeyou_oauth=;.*Max-Age=0; Secure$/);
});
