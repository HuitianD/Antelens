import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { PostgresRepository, decryptCredentials } from '@beforeyou/db';
import { SourceEventSchema, ConnectionSummarySchema, type ConnectionSummary } from '@beforeyou/contracts';
const Header = z.object({ name: z.string(), value: z.string() });
interface Part {
    mimeType?: string;
    body?: {
        data?: string;
    };
    parts?: Part[];
    headers?: {
        name: string;
        value: string;
    }[];
}
const Message = z.object({ id: z.string(), threadId: z.string(), internalDate: z.string(), labelIds: z.array(z.string()).optional(), snippet: z.string().optional(), payload: z.object({ mimeType: z.string().optional(), headers: z.array(Header).optional(), body: z.object({ data: z.string().optional() }).optional(), parts: z.array(z.unknown()).optional() }).optional() });
export interface SyncConfig {
    initialCutoff: string;
    initialCap: number;
    initialComplete: boolean;
    startingCheckpoint: string;
    excludedByCap?: boolean;
    coverageGap?: boolean;
    nextAttemptAt?: string;
    failureCount?: number;
}
interface GmailConnection {
    id: string;
    owner_id: string;
    dto: ConnectionSummary;
    encrypted_credentials: string;
    sync_cursor: string | null;
    sync_config: SyncConfig;
}
export class GmailError extends Error {
    constructor(public code: 'CONNECTION_EXPIRED' | 'RATE_LIMITED' | 'PROVIDER_UNAVAILABLE' | 'PROVIDER_ACCESS_DENIED', public retryable: boolean) { super(code); }
}
/** Checkpoint token. Replies match because their subject still contains this text, for example `Re: [BY-TEST] …`. */
export const GMAIL_TEST_SUBJECT = '[BY-TEST]';
/** Explicit checkpoint switch. Unset or any other value keeps the normal mailbox sync. */
export function gmailTestModeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
    return ['1', 'true', 'yes'].includes((env.GMAIL_TEST_MODE ?? '').trim().toLowerCase());
}
export function subjectMatchesGmailTest(subject: string | undefined): boolean {
    return (subject ?? '').includes(GMAIL_TEST_SUBJECT);
}
export function extractMessage(part: Part): {
    content: string;
    links: string[];
} {
    const texts: string[] = [], htmls: string[] = [];
    const walk = (p: Part, depth = 0) => { if (depth > 12)
        return; if (p.body?.data) {
        const text = Buffer.from(p.body.data, 'base64url').toString('utf8').slice(0, 100000);
        if (p.mimeType === 'text/plain')
            texts.push(text);
        else if (p.mimeType === 'text/html')
            htmls.push(text);
    } for (const child of p.parts ?? [])
        walk(child, depth + 1); };
    walk(part);
    const raw = htmls.join('\n');
    const content = (texts.length ? texts.join('\n') : raw.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')).slice(0, 100000);
    const candidates = [...raw.matchAll(/href\s*=\s*["'](https?:\/\/[^"'<>\s]+)["']/gi)].map(m => m[1]!), plain = [...content.matchAll(/https?:\/\/[^\s<>"']+/g)].map(m => m[0]);
    return { content, links: [...new Set([...candidates, ...plain])].filter(link => { try {
            const u = new URL(link);
            return !u.username && !u.password && link.length <= 2048;
        }
        catch {
            return false;
        } }).slice(0, 100) };
}
async function gmailFetch(token: string, endpoint: string) { const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${endpoint}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) }); if (response.status === 404)
    return null; if (!response.ok)
    throw new GmailError(response.status === 429 ? 'RATE_LIMITED' : response.status === 401 ? 'CONNECTION_EXPIRED' : response.status === 403 ? 'PROVIDER_ACCESS_DENIED' : 'PROVIDER_UNAVAILABLE', response.status === 429 || response.status >= 500); return response.json(); }
async function accessToken(encrypted: string): Promise<string> { const { refreshToken } = decryptCredentials<{
    refreshToken: string;
}>(encrypted); const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, refresh_token: refreshToken, grant_type: 'refresh_token' }), signal: AbortSignal.timeout(15000) }); if (!response.ok)
    throw new GmailError(response.status === 400 || response.status === 401 ? 'CONNECTION_EXPIRED' : 'PROVIDER_UNAVAILABLE', response.status >= 500); return z.object({ access_token: z.string() }).parse(await response.json()).access_token; }
async function ingest(repo: PostgresRepository, c: GmailConnection, token: string, ids: string[]) { for (const id of [...new Set(ids)]) {
    const raw = await gmailFetch(token, `messages/${encodeURIComponent(id)}?format=full`);
    if (!raw)
        continue;
    const m = Message.parse(raw);
    if (m.labelIds?.some(label => ['SPAM', 'TRASH'].includes(label)))
        continue;
    const headers = m.payload?.headers ?? [], header = (name: string) => headers.find(h => h.name.toLowerCase() === name)?.value;
    // Reject before reading the body into a source or queueing triage. Applies to the initial list and later history.
    if (gmailTestModeEnabled() && !subjectMatchesGmailTest(header('subject')))
        continue;
    const data = extractMessage((m.payload ?? {}) as Part);
    const source = SourceEventSchema.parse({ id: randomUUID(), connectionId: c.id, kind: 'gmail', externalId: m.id, externalThreadId: m.threadId, receivedAt: new Date().toISOString(), occurredAt: new Date(Number(m.internalDate)).toISOString(), title: (header('subject') ?? '(No subject)').slice(0, 1000), senderLabel: (header('from') ?? 'Unknown sender').slice(0, 1000), previewText: (m.snippet ?? data.content).slice(0, 8000), contentRef: `private:${randomUUID()}`, disposition: 'pending', processingStatus: 'queued', lastErrorCode: null, dataOrigin: (process.env.SYNTHETIC_GMAIL_ACCOUNT_IDS ?? '').split(',').includes(c.dto.accountLabel) ? 'synthetic' : 'user' });
    await repo.ingestSource(c.owner_id, source, data.content, data.links, `https://mail.google.com/mail/u/0/#all/${m.id}`);
} }
async function history(repo: PostgresRepository, c: GmailConnection, token: string, cursor: string): Promise<string | null> { let page: string | undefined, next = cursor; for (let count = 0; count < 20; count++) {
    const params = new URLSearchParams({ startHistoryId: cursor, historyTypes: 'messageAdded', maxResults: '500', ...(page ? { pageToken: page } : {}) });
    const raw = await gmailFetch(token, `history?${params}`);
    if (!raw)
        return null;
    const result = z.object({ historyId: z.string(), nextPageToken: z.string().optional(), history: z.array(z.object({ messagesAdded: z.array(z.object({ message: z.object({ id: z.string() }) })).optional() })).optional() }).parse(raw);
    await ingest(repo, c, token, (result.history ?? []).flatMap(h => (h.messagesAdded ?? []).map(m => m.message.id)));
    next = result.historyId;
    if (!result.nextPageToken)
        return next;
    page = result.nextPageToken;
} throw new GmailError('RATE_LIMITED', true); }
async function fullSync(repo: PostgresRepository, c: GmailConnection, token: string) { const profile = z.object({ historyId: z.string() }).parse(await gmailFetch(token, 'profile')); const start = profile.historyId; const cutoff = Math.floor(Date.parse(c.sync_config.initialCutoff ?? new Date(Date.now() - 7 * 86400000).toISOString()) / 1000); const params = new URLSearchParams({ q: [`after:${cutoff}`, '-in:spam', '-in:trash', ...(gmailTestModeEnabled() ? [`subject:"${GMAIL_TEST_SUBJECT}"`] : [])].join(' '), maxResults: '51', includeSpamTrash: 'false' }); const list = z.object({ messages: z.array(z.object({ id: z.string() })).optional(), nextPageToken: z.string().optional() }).parse(await gmailFetch(token, `messages?${params}`)); const messages = list.messages ?? []; c.sync_config.excludedByCap = messages.length > 50 || Boolean(list.nextPageToken); await ingest(repo, c, token, messages.slice(0, 50).map(m => m.id)); const cursor = await history(repo, c, token, start); if (!cursor)
    throw new GmailError('PROVIDER_UNAVAILABLE', true); c.sync_config.initialComplete = true; return cursor; }
export async function pollGmail(repo: PostgresRepository) {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.CREDENTIAL_ENCRYPTION_KEY)
        return;
    const result = await repo.pool.query("SELECT * FROM connections WHERE kind='gmail' AND encrypted_credentials IS NOT NULL AND COALESCE((sync_config->>'synthetic')::boolean,false)=false AND (status='connected' OR (status='needs_attention' AND dto->>'lastErrorCode' IN ('RATE_LIMITED','PROVIDER_UNAVAILABLE')))");
    for (const c of result.rows as GmailConnection[]) {
        if (c.sync_config.nextAttemptAt && Date.parse(c.sync_config.nextAttemptAt) > Date.now())
            continue;
        const client = await repo.pool.connect();
        let locked = false;
        try {
            const lock = await client.query('SELECT pg_try_advisory_lock(hashtextextended($1,1)) AS locked', [c.id]);
            locked = Boolean(lock.rows[0].locked);
            if (!locked)
                continue;
            // A recoverable connection is enabled before ingest so ownership/status checks still apply.
            if (c.dto.status === 'needs_attention')
                await repo.pool.query("UPDATE connections SET status='connected' WHERE id=$1 AND owner_id=$2 AND encrypted_credentials IS NOT NULL", [c.id, c.owner_id]);
            const token = await accessToken(c.encrypted_credentials);
            let cursor = c.sync_cursor;
            if (!c.sync_config.initialComplete || !cursor)
                cursor = await fullSync(repo, c, token);
            else {
                const next = await history(repo, c, token, cursor);
                if (next)
                    cursor = next;
                else {
                    c.sync_config.coverageGap = true;
                    c.sync_config.initialCutoff = new Date(Date.now() - 7 * 86400000).toISOString();
                    cursor = await fullSync(repo, c, token);
                }
            }
            c.sync_config.failureCount = 0;
            c.sync_config.nextAttemptAt = undefined;
            const dto = ConnectionSummarySchema.parse({ ...c.dto, status: 'connected', lastSyncedAt: new Date().toISOString(), lastErrorCode: null });
            await repo.transaction(c.owner_id, async (tx) => { const saved = await tx.query("UPDATE connections SET sync_cursor=$3,sync_config=$4,status='connected',dto=$5,updated_at=now() WHERE id=$1 AND owner_id=$2 AND encrypted_credentials IS NOT NULL RETURNING id", [c.id, c.owner_id, cursor, c.sync_config, dto]); if (saved.rowCount)
                await repo.emit(tx, c.owner_id, { type: 'connection.updated', caseId: null, sourceRevision: null, data: { connection: dto } }); });
        }
        catch (error) {
            const failure = error instanceof GmailError ? error : new GmailError('PROVIDER_UNAVAILABLE', true);
            c.sync_config.failureCount = (c.sync_config.failureCount ?? 0) + 1;
            c.sync_config.nextAttemptAt = failure.retryable ? new Date(Date.now() + Math.min(3600000, 15000 * 2 ** Math.min(8, c.sync_config.failureCount))).toISOString() : undefined;
            const dto = { ...c.dto, status: 'needs_attention' as const, lastErrorCode: failure.code };
            await repo.transaction(c.owner_id, async (tx) => { const saved = await tx.query("UPDATE connections SET status='needs_attention',dto=$3,sync_config=$4,updated_at=now() WHERE id=$1 AND owner_id=$2 AND encrypted_credentials IS NOT NULL RETURNING id", [c.id, c.owner_id, dto, c.sync_config]); if (saved.rowCount)
                await repo.emit(tx, c.owner_id, { type: 'connection.updated', caseId: null, sourceRevision: null, data: { connection: dto } }); });
        }
        finally {
            if (locked)
                await client.query('SELECT pg_advisory_unlock(hashtextextended($1,1))', [c.id]);
            client.release();
        }
    }
}
