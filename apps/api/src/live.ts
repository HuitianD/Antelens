import { randomUUID } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import * as C from '@beforeyou/contracts';
import { PostgresRepository,supabaseServiceHeaders } from '@beforeyou/db';
import { DomainError, hash } from '@beforeyou/fixtures';
import type { ApiConfig } from './config.js';
import { registerOAuth } from './oauth.js';
import { decryptCredentials } from './credentials.js';
import {browserEventContent} from './browser-content.js';
import {ingestSyntheticInvestigation,ingestSyntheticTestRecord} from './synthetic-ingest.js';
export async function registerLiveRoutes(app: FastifyInstance, config: ApiConfig) {
    const repo = new PostgresRepository(config.databaseUrl!);
    const streams = new Set<ServerResponse>();
    app.addHook('preClose', async () => {for(const stream of streams)stream.end();streams.clear();});
    app.addHook('onClose', async () => { await repo.pool.end(); });
    const owner = (r: FastifyRequest) => (r as FastifyRequest & {
        ownerId: string;
    }).ownerId;
    const id = (r: FastifyRequest) => C.IdSchema.parse((r.params as {
        id: string;
    }).id);
    const ok = (r: FastifyRequest, data: unknown, eventCursor?: string) => ({ data, meta: { schemaVersion: '1', requestId: r.id, ...(eventCursor ? { eventCursor } : {}) } });
    const model = { modelId: process.env.CLAUDE_MODEL_ID ?? 'not_configured', promptVersion: C.INVESTIGATION_PROMPT_VERSION, policyVersion: C.INVESTIGATION_POLICY_VERSION, toolVersion: C.INVESTIGATION_TOOL_VERSION, execution: 'live' as const };
    registerOAuth(app, config, repo.pool);
    app.get('/v1/dashboard', async (r) => { const snapshot = await repo.snapshot(owner(r)); return ok(r, snapshot.data, snapshot.eventCursor); });
    app.get('/v1/cases', async (r) => ok(r, await repo.listCases(owner(r), C.CaseFiltersSchema.parse(r.query))));
    app.get('/v1/cases/:id', async (r) => ok(r, await repo.caseDetail(owner(r), id(r))));
    app.get('/v1/cases/:id/assessments', async (r) => { const q = C.PaginationInputSchema.parse(r.query); return ok(r, await repo.history(owner(r), id(r), q.cursor, q.limit)); });
    app.get('/v1/messages', async (r) => ok(r, await repo.listMessages(owner(r), C.MessageFiltersSchema.parse(r.query))));
    app.get('/v1/messages/:id', async (r) => ok(r, await repo.messageDetail(owner(r), id(r))));
    app.get('/v1/evidence/:id', async (r) => {
        const evidence = await repo.evidence(owner(r), id(r));
        let artifactUrl: string | null = null, expiresAt: string | null = null;
        if (evidence.artifactId) {
            const result = await repo.pool.query('SELECT storage_key FROM artifacts WHERE id=$1 AND owner_id=$2', [evidence.artifactId, owner(r)]);
            const artifact = result.rows[0] as {
                storage_key: string;
            } | undefined;
            if (!artifact)
                throw new DomainError('NOT_FOUND', 'Evidence artifact not found.', 404);
            const response = await fetch(`${config.supabaseUrl}/storage/v1/object/sign/${encodeURIComponent(process.env.SUPABASE_STORAGE_BUCKET ?? 'evidence')}/${artifact.storage_key.split('/').map(encodeURIComponent).join('/')}`, { method: 'POST', headers: { ...supabaseServiceHeaders(config.supabaseKey!), 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 60 }), signal: AbortSignal.timeout(10000) });
            if (!response.ok)
                throw new DomainError('PROVIDER_UNAVAILABLE', 'Evidence storage is temporarily unavailable.', 503);
            const signed = await response.json() as {
                signedURL?: string;
            };
            if (!signed.signedURL)
                throw new DomainError('PROVIDER_UNAVAILABLE', 'Evidence access could not be created.', 503);
            artifactUrl = `${config.supabaseUrl}/storage/v1${signed.signedURL}`;
            expiresAt = new Date(Date.now() + 60000).toISOString();
        }
        return ok(r, { evidence, artifactUrl, expiresAt });
    });
    app.post('/v1/cases/:id/viewed', async (r) => ok(r, await repo.viewed(owner(r), id(r), C.ViewedInputSchema.parse(r.body).assessmentId)));
    app.post('/v1/cases/:id/rechecks', async (r, reply) => reply.status(202).send(ok(r, await repo.recheck(owner(r), id(r), C.RecheckInputSchema.parse(r.body), model, { key: r.headers['idempotency-key'] as string | undefined, requestHash: hash(r.body) }))));
    app.get('/v1/runs/:id', async (r) => ok(r, await repo.run(owner(r), id(r))));
    app.get('/v1/activity', async (r) => { const q = C.PaginationInputSchema.parse(r.query); return ok(r, await repo.activity(owner(r), q.cursor, q.limit)); });
    app.get('/v1/connections', async (r) => ok(r, await repo.connections(owner(r))));
    app.post('/v1/synthetic/events', async (r, reply) => {
        const source = await ingestSyntheticTestRecord(repo, owner(r));
        return reply.status(202).send(ok(r, { sourceEventId: source.id, caseId: null, runId: null, label: 'Synthetic test record' }));
    });
    app.post('/v1/synthetic/investigations', async (r, reply) => {
        const result = await ingestSyntheticInvestigation(repo, owner(r));
        return reply.status(202).send(ok(r, { sourceEventId: result.source.id, caseId: null, runId: null, label: 'Synthetic test record', fixtureUrl: result.fixtureUrl }));
    });
    app.get('/v1/connections/:id/scope', async r => {
        const result=await repo.pool.query('SELECT sync_config FROM connections WHERE owner_id=$1 AND id=$2',[owner(r),id(r)]);
        if(!result.rows[0])throw new DomainError('NOT_FOUND','Connection not found.',404);
        const sync=result.rows[0].sync_config;
        return ok(r,C.ConnectionSyncScopeSchema.parse({initialCutoff:sync.initialCutoff??null,initialCap:sync.initialCap??50,excludedByCap:sync.excludedByCap??false,coverageGap:sync.coverageGap??false,initialComplete:sync.initialComplete??false}));
    });
    app.delete('/v1/connections/:id', async (r) => {
        const client = await repo.pool.connect();
        let encrypted: string | null = null, cancelledRunCount = 0;
        try {
            await client.query('BEGIN');
            await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [owner(r)]);
            const result = await client.query('SELECT * FROM connections WHERE id=$1 AND owner_id=$2 FOR UPDATE', [id(r), owner(r)]);
            const connection = result.rows[0] as {
                dto: C.ConnectionSummary;
                encrypted_credentials: string | null;
            } | undefined;
            if (!connection)
                throw new DomainError('NOT_FOUND', 'Connection not found.', 404);
            encrypted = connection.encrypted_credentials;
            const dto = { ...connection.dto, status: 'disconnected' as const };
            await client.query("UPDATE connections SET status='disconnected',encrypted_credentials=NULL,dto=$3,updated_at=now() WHERE id=$1 AND owner_id=$2", [id(r), owner(r), dto]);
            const runs = await client.query("SELECT DISTINCT r.id,r.case_id,r.dto FROM investigation_runs r JOIN case_sources cs ON cs.case_id=r.case_id AND cs.owner_id=r.owner_id JOIN source_events s ON s.id=cs.source_event_id AND s.owner_id=cs.owner_id WHERE s.connection_id=$1 AND s.owner_id=$2 AND r.status IN ('queued','checking')", [id(r), owner(r)]);
            for (const row of runs.rows as {
                id: string;
                case_id: string;
                dto: C.InvestigationRun;
            }[]) {
                const run = { ...row.dto, status: 'cancelled', finishedAt: new Date().toISOString() };
                await client.query("UPDATE investigation_runs SET status='cancelled',dto=$3,lease_expires_at=NULL WHERE id=$1 AND owner_id=$2", [row.id, owner(r), run]);
                cancelledRunCount++;
                await client.query("INSERT INTO activity_events(owner_id,type,case_id,source_revision,payload) VALUES($1,'investigation.cancelled',$2,$3,$4)", [owner(r), row.case_id, run.sourceRevision, { runId: run.id, status: 'cancelled', limitations: [], errorCode: null }]);
            }
            const cases = await client.query('SELECT DISTINCT c.id,c.dto FROM cases c JOIN case_sources cs ON cs.case_id=c.id AND cs.owner_id=c.owner_id JOIN source_events s ON s.id=cs.source_event_id AND s.owner_id=cs.owner_id WHERE s.connection_id=$1 AND s.owner_id=$2', [id(r), owner(r)]);
            for (const row of cases.rows as {
                id: string;
                dto: C.CaseSummary;
            }[]) {
                const dto = { ...row.dto, recordVersion: row.dto.recordVersion + 1, updatedAt: new Date().toISOString(), freshness: row.dto.currentAssessment ? 'stale' : 'current', activeRunId: null, latestRunStatus: row.dto.activeRunId ? 'cancelled' : row.dto.latestRunStatus };
                await client.query('UPDATE cases SET active_run_id=NULL,record_version=$3,dto=$4,updated_at=now() WHERE id=$1 AND owner_id=$2', [row.id, owner(r), dto.recordVersion, dto]);
                await client.query("INSERT INTO activity_events(owner_id,type,case_id,source_revision,payload) VALUES($1,'case.updated',$2,$3,$4)", [owner(r), row.id, dto.sourceRevision, { case: dto }]);
            }
            await client.query("INSERT INTO activity_events(owner_id,type,payload) VALUES($1,'connection.updated',$2)", [owner(r), { connection: dto }]);
            await client.query('COMMIT');
        }
        catch (e) {
            await client.query('ROLLBACK');
            throw e;
        }
        finally {
            client.release();
        }
        let providerRevocation: 'revoked' | 'unavailable' | 'not_required' = 'not_required';
        if (encrypted) {
            try {
                const tokens = decryptCredentials<{
                    refreshToken: string;
                }>(encrypted);
                const response = await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: tokens.refreshToken }), signal: AbortSignal.timeout(10000) });
                providerRevocation = response.ok ? 'revoked' : 'unavailable';
            }
            catch {
                providerRevocation = 'unavailable';
            }
        }
        return ok(r, { connectionId: id(r), cancelledRunCount, providerRevocation });
    });
    app.post('/v1/browser/installations', async (r) => { const input = C.BrowserInstallationInputSchema.parse(r.body), client = await repo.pool.connect(); try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [owner(r)]);
        const existing = await client.query('SELECT id,connection_id FROM browser_installations WHERE owner_id=$1 AND client_installation_id=$2', [owner(r), input.clientInstallationId]);
        if (existing.rows[0]) {
            await client.query('COMMIT');
            return ok(r, { installationId: existing.rows[0].id, connectionId: existing.rows[0].connection_id });
        }
        const connectionId = randomUUID(), installationId = randomUUID(), dto = C.ConnectionSummarySchema.parse({ id: connectionId, kind: 'browser', status: 'connected', accountLabel: input.displayName, grantedScopes: [], lastSyncedAt: null, lastErrorCode: null });
        await client.query("INSERT INTO connections(id,owner_id,kind,provider_account_id,status,dto) VALUES($1,$2,'browser',$3,'connected',$4)", [connectionId, owner(r), input.clientInstallationId, dto]);
        await client.query('INSERT INTO browser_installations(id,owner_id,client_installation_id,connection_id,display_name) VALUES($1,$2,$3,$4,$5)', [installationId, owner(r), input.clientInstallationId, connectionId, input.displayName]);
        await client.query("INSERT INTO activity_events(owner_id,type,payload) VALUES($1,'connection.updated',$2)", [owner(r), { connection: dto }]);
        await client.query('COMMIT');
        return ok(r, { installationId, connectionId });
    }
    catch (e) {
        await client.query('ROLLBACK');
        throw e;
    }
    finally {
        client.release();
    } });
    app.post('/v1/browser/events', async (r, reply) => { const input = C.BrowserEventInputSchema.parse(r.body); for (const value of [input.pageUrl, input.request.destinationUrl].filter(Boolean) as string[]) {
        const u = new URL(value);
        const allowed = (process.env.INVESTIGATION_ALLOWED_DOMAINS ?? '').split(',').map(v => v.trim());
        if (u.protocol !== 'https:' || u.username || u.password || !allowed.includes(u.hostname))
            throw new DomainError('TARGET_BLOCKED', 'This page is outside the supported site allowlist.', 403);
    } const result = await repo.pool.query("SELECT i.connection_id FROM browser_installations i JOIN connections c ON c.id=i.connection_id AND c.owner_id=i.owner_id WHERE i.id=$1 AND i.owner_id=$2 AND c.status='connected'", [input.installationId, owner(r)]); if (!result.rows[0])
        throw new DomainError('CONNECTION_REQUIRED', 'Register or reconnect this browser installation.', 503); const source = C.SourceEventSchema.parse({ id: randomUUID(), connectionId: result.rows[0].connection_id, kind: 'browser', externalId: input.clientEventId, externalThreadId: null, receivedAt: new Date().toISOString(), occurredAt: input.observedAt, title: input.pageTitle || 'Page request', senderLabel: null, previewText: input.request.visibleText, contentRef: `private:${randomUUID()}`, disposition: 'pending', processingStatus: 'queued', lastErrorCode: null, dataOrigin: 'user' }); const accepted = await repo.ingestSource(owner(r), source, browserEventContent(input), [input.pageUrl, ...(input.request.destinationUrl ? [input.request.destinationUrl] : [])], input.pageUrl, {route:'browser-events',key:r.headers['idempotency-key'] as string|undefined,requestHash:hash(input)}); return reply.status(202).send(ok(r, { sourceEventId: accepted.source.id, caseId: null, runId: null })); });
    app.get('/v1/events', async (r, reply) => { let cursor = String(r.headers['last-event-id'] ?? '0'); if (!/^\d+$/.test(cursor))
        throw new DomainError('VALIDATION_ERROR', 'Invalid event cursor.'); const expires = (r as FastifyRequest & {
        authExpiresAt: number;
    }).authExpiresAt; reply.hijack(); streams.add(reply.raw); reply.raw.on('close', () => streams.delete(reply.raw)); reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no', ...(r.headers.origin ? { 'Access-Control-Allow-Origin': r.headers.origin, 'Vary': 'Origin', 'Access-Control-Allow-Credentials': 'true' } : {}) }); let busy = false; const send = async () => { if (busy || reply.raw.destroyed)
        return; if (Date.now() >= expires) {
        reply.raw.end();
        return;
    } busy = true; try {
        const events = await repo.eventsSince(owner(r), cursor);
        for (const e of events) {
            reply.raw.write(`id: ${e.id}\nevent: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
            cursor = e.id;
        }
    }
    catch {
        reply.raw.end();
    }
    finally {
        busy = false;
    } }; await send(); const timer = setInterval(() => void send(), 1000), heartbeat = setInterval(() => reply.raw.write(': heartbeat\n\n'), 15000); reply.raw.on('close', () => { clearInterval(timer); clearInterval(heartbeat); }); });
}
