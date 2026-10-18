import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { getDomain } from 'tldts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { GoogleStartInputSchema, ConnectionSummarySchema } from '@beforeyou/contracts';
import { DomainError } from '@beforeyou/fixtures';
import { encryptCredentials, credentialKey, decryptCredentials } from './credentials.js';
import type { ApiConfig } from './config.js';
import type { Pool } from 'pg';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const owner = (req: FastifyRequest) => (req as FastifyRequest & {
    ownerId: string;
}).ownerId;
const scope = 'https://www.googleapis.com/auth/gmail.readonly';
const callbackPath = '/v1/connections/gmail/callback';
const loopback = new Set(['localhost', '127.0.0.1', '[::1]']);
export interface OAuthDependencies { env?: NodeJS.ProcessEnv; fetch?: typeof fetch; now?: () => number }

/** Schemeful site matching includes private public-suffix entries used by shared hosting. */
export function assertOAuthDeployment(config: Pick<ApiConfig, 'webOrigin' | 'apiOrigin'>, redirectUri: string): void {
    let web: URL, api: URL;
    try { web = new URL(config.webOrigin); api = new URL(config.apiOrigin); }
    catch { throw new DomainError('CONFIG_MISSING', 'WEB_ORIGIN and API_ORIGIN must be valid origins.', 503); }
    const site = (url: URL) => isIP(url.hostname.replace(/^\[|\]$/g, '')) ? url.hostname : getDomain(url.hostname, { allowPrivateDomains: true }) ?? url.hostname;
    if (web.origin !== config.webOrigin || api.origin !== config.apiOrigin || web.protocol !== api.protocol || site(web) !== site(api))
        throw new DomainError('CONFIG_MISSING', 'Gmail authorization requires WEB_ORIGIN and API_ORIGIN on the same site and scheme. Use 127.0.0.1 for both locally, or HTTPS app and API subdomains of the same custom domain.', 503);
    if (api.protocol !== 'https:' && !(api.protocol === 'http:' && loopback.has(api.hostname) && loopback.has(web.hostname)))
        throw new DomainError('CONFIG_MISSING', 'Gmail authorization requires HTTPS except on matching loopback hosts.', 503);
    if (redirectUri !== `${api.origin}${callbackPath}`)
        throw new DomainError('CONFIG_MISSING', `GOOGLE_REDIRECT_URI must be ${api.origin}${callbackPath}.`, 503);
}
function nonceCookie(config: ApiConfig, value: string, maxAge: number): string {
    const secure = new URL(config.apiOrigin).protocol === 'https:';
    // The host prefix prevents a sibling subdomain from injecting the production cookie.
    return `${secure ? '__Host-beforeyou_oauth' : 'beforeyou_oauth'}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}
function readNonce(config: ApiConfig, header?: string): string | undefined {
    const name = new URL(config.apiOrigin).protocol === 'https:' ? '__Host-beforeyou_oauth' : 'beforeyou_oauth';
    const matches = (header ?? '').split(';').map(part => part.trim()).filter(part => part.startsWith(`${name}=`));
    if (matches.length !== 1) return undefined;
    const nonce = matches[0]!.slice(name.length + 1);
    return /^[A-Za-z0-9_-]{32}$/.test(nonce) ? nonce : undefined;
}
export function registerOAuth(app: FastifyInstance, config: ApiConfig, pool: Pool, dependencies: OAuthDependencies = {}) {
    const env = dependencies.env ?? process.env, fetchProvider = dependencies.fetch ?? fetch, currentTime = dependencies.now ?? Date.now;
    const configuration = () => {
        const missing = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'CREDENTIAL_ENCRYPTION_KEY'].filter(key => !env[key]);
        if (missing.length) throw new DomainError('CONFIG_MISSING', `Google connection is missing ${missing.join(', ')}.`, 503);
        assertOAuthDeployment(config, env.GOOGLE_REDIRECT_URI!);
        return credentialKey(env.CREDENTIAL_ENCRYPTION_KEY);
    };
    app.post('/v1/connections/gmail/start', async (req, reply) => {
        const input = GoogleStartInputSchema.parse(req.body);
        if (!['/connections', '/'].includes(input.returnTo))
            throw new DomainError('VALIDATION_ERROR', 'Choose the Connections page as the return path.');
        if (req.headers.origin !== config.webOrigin)
            throw new DomainError('FORBIDDEN', 'Start Gmail authorization from the Connections page.', 403);
        configuration();
        const state = randomBytes(32).toString('base64url'), nonce = randomBytes(24).toString('base64url'), verifier = randomBytes(32).toString('base64url'), expiresAt = new Date(currentTime() + 600000).toISOString();
        await pool.query('INSERT INTO oauth_states(state_hash,owner_id,pkce_verifier,return_to,expires_at) VALUES($1,$2,$3,$4,$5)', [digest(`${state}:${nonce}`), owner(req), verifier, input.returnTo, expiresAt]);
        const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        auth.search = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID!, redirect_uri: env.GOOGLE_REDIRECT_URI!, response_type: 'code', scope, access_type: 'offline', prompt: 'consent', state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }).toString();
        reply.header('Set-Cookie', nonceCookie(config, nonce, 600));
        reply.header('Cache-Control', 'no-store');
        return { data: { authorizationUrl: auth.toString(), expiresAt }, meta: { requestId: req.id, schemaVersion: '1' } };
    });
    app.get('/v1/connections/gmail/callback', async (req, reply) => {
        const key = configuration();
        const q = z.object({ state: z.string().regex(/^[A-Za-z0-9_-]{43}$/), code: z.string().min(1).max(4096).optional(), error: z.string().max(200).optional() }).parse(req.query);
        const nonce = readNonce(config, req.headers.cookie);
        if (!nonce)
            throw new DomainError('FORBIDDEN', 'This authorization session expired. Start again from Connections.', 403);
        const result = await pool.query('UPDATE oauth_states SET taken_at=now() WHERE state_hash=$1 AND taken_at IS NULL AND expires_at>now() RETURNING *', [digest(`${q.state}:${nonce}`)]);
        const state = result.rows[0] as {
            owner_id: string;
            pkce_verifier: string;
            return_to: string;
        } | undefined;
        if (!state)
            throw new DomainError('FORBIDDEN', 'This authorization session expired or was already used.', 403);
        reply.header('Set-Cookie', nonceCookie(config, '', 0));
        reply.header('Cache-Control', 'no-store');
        reply.header('Referrer-Policy', 'no-referrer');
        if (!['/connections', '/'].includes(state.return_to))
            throw new DomainError('FORBIDDEN', 'This authorization return path is unavailable. Start again from Connections.', 403);
        if (q.error || !q.code)
            return reply.redirect(`${config.webOrigin}/connections?connection=cancelled`);
        const response = await fetchProvider('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID!, client_secret: env.GOOGLE_CLIENT_SECRET!, redirect_uri: env.GOOGLE_REDIRECT_URI!, grant_type: 'authorization_code', code: q.code, code_verifier: state.pkce_verifier }), signal: AbortSignal.timeout(15000) });
        if (!response.ok)
            throw new DomainError('PROVIDER_ACCESS_DENIED', 'Google could not complete authorization. Start the connection again.', 503);
        const tokens = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1).optional(), scope: z.string(), expires_in: z.number().positive() }).parse(await response.json());
        if (!tokens.scope.split(' ').includes(scope))
            throw new DomainError('PROVIDER_ACCESS_DENIED', 'The Gmail read permission was not granted.', 403);
        const profileResponse = await fetchProvider('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { Authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(15000) });
        if (!profileResponse.ok)
            throw new DomainError('PROVIDER_ACCESS_DENIED', 'Gmail access is unavailable for this account.', 503);
        const profile = z.object({ emailAddress: z.email(), historyId: z.string() }).parse(await profileResponse.json());
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [state.owner_id]);
            const previous = await client.query("SELECT * FROM connections WHERE owner_id=$1 AND kind='gmail' FOR UPDATE", [state.owner_id]);
            const existing = previous.rows.find(row => row.provider_account_id === profile.emailAddress) as {
                id: string;
                provider_account_id: string;
                encrypted_credentials: string | null;
            } | undefined;
            if (previous.rows.some(row => row.provider_account_id !== profile.emailAddress && row.status !== 'disconnected' && row.status !== 'not_connected'))
                throw new DomainError('FORBIDDEN', 'Disconnect the existing Gmail account before connecting another account.', 409);
            const refreshToken = tokens.refresh_token ?? (existing?.encrypted_credentials ? decryptCredentials<{
                refreshToken: string;
            }>(existing.encrypted_credentials, key).refreshToken : null);
            if (!refreshToken)
                throw new DomainError('CONNECTION_REQUIRED', 'Google did not supply offline access. Reconnect with consent.', 503);
            const id = existing?.id ?? randomUUID(), dto = ConnectionSummarySchema.parse({ id, kind: 'gmail', status: 'connected', accountLabel: profile.emailAddress, grantedScopes: tokens.scope.split(' '), lastSyncedAt: null, lastErrorCode: null });
            const syncConfig = { initialCutoff: new Date(currentTime() - 7 * 86400000).toISOString(), initialCap: 50, initialComplete: false, startingCheckpoint: profile.historyId, excludedByCap: false, coverageGap: false };
            await client.query("INSERT INTO connections(id,owner_id,kind,provider_account_id,status,dto,encrypted_credentials,sync_cursor,sync_config) VALUES($1,$2,'gmail',$3,'connected',$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET status='connected',dto=EXCLUDED.dto,encrypted_credentials=EXCLUDED.encrypted_credentials,sync_cursor=EXCLUDED.sync_cursor,sync_config=EXCLUDED.sync_config,updated_at=now()", [id, state.owner_id, profile.emailAddress, dto, encryptCredentials({ refreshToken }, key), profile.historyId, syncConfig]);
            await client.query("INSERT INTO activity_events(owner_id,type,case_id,source_revision,payload) VALUES($1,'connection.updated',NULL,NULL,$2)", [state.owner_id, { connection: dto }]);
            await client.query('COMMIT');
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
        return reply.redirect(`${config.webOrigin}${state.return_to}?connected=gmail`);
    });
}
