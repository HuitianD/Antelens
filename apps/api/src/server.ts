import Fastify, { type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import type { ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { z, ZodError } from 'zod';
import * as C from '@beforeyou/contracts';
import { DemoStore, DomainError, caseDetail, getCase, ingestDemo, idempotent, viewedDemo, recheckDemo, disconnectDemo, reconnectDemo, scenarios, fixturePage, DEMO_OWNER, DEMO_BROWSER, type DemoState } from '@beforeyou/fixtures';
import { authenticate } from './auth.js';
import { guardRequest, loadConfig } from './config.js';
function paged<T extends {
    id: string;
}>(items: T[], cursor: string | undefined, limit = 25) { let offset = 0; if (cursor) {
    try {
        const id = Buffer.from(cursor, 'base64url').toString();
        offset = items.findIndex(i => i.id === id) + 1;
        if (offset === 0)
            throw new Error();
    }
    catch {
        throw new DomainError('VALIDATION_ERROR', 'The page cursor is invalid.');
    }
} const batch = items.slice(offset, offset + limit); return { items: batch, nextCursor: offset + limit < items.length ? Buffer.from(batch.at(-1)!.id).toString('base64url') : null }; }
const paramId = (req: FastifyRequest) => C.IdSchema.parse((req.params as {
    id: string;
}).id);
function sortedCases(s: DemoState) { return [...s.cases].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id)); }
export async function createServer(config = loadConfig(), store = new DemoStore()) {
    const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'warn', redact: ['req.headers.authorization', 'req.headers.cookie', 'req.query', 'req.body'] }, disableRequestLogging: true, bodyLimit: 65536, genReqId: () => randomUUID() });
    const streams = new Set<ServerResponse>();
    app.addHook('preClose', async () => { for (const stream of streams) stream.end(); streams.clear(); });
    await app.register(cors, { credentials: true, origin: (origin, cb) => cb(null, !origin || config.allowedOrigins.includes(origin)), allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'Last-Event-ID'], methods: ['GET', 'POST', 'DELETE', 'OPTIONS'] });
    app.decorateRequest('ownerId', '');
    app.decorateRequest('authExpiresAt', 0);
    app.addHook('onRequest', async (req, reply) => { reply.header('X-Content-Type-Options', 'nosniff'); reply.header('Cache-Control', 'no-store'); if (req.method === 'OPTIONS')
        return; guardRequest(config, req.headers, !['GET', 'HEAD', 'OPTIONS'].includes(req.method)); if (req.url.startsWith('/v1') && !req.url.startsWith('/v1/connections/gmail/callback')) {
        const auth = await authenticate(config, req.headers.authorization);
        (req as FastifyRequest & {
            ownerId: string;
            authExpiresAt: number;
        }).ownerId = auth.ownerId;
        (req as FastifyRequest & {
            authExpiresAt: number;
        }).authExpiresAt = auth.expiresAt;
    } });
    app.setErrorHandler((error, req, reply) => { const e = error as Error & {
        statusCode?: number;
    }; const isValidation = e instanceof ZodError; const repository = e.name === 'RepositoryError' ? e as Error & {
        code: string;
    } : null; const domain = e instanceof DomainError; const status = isValidation ? 400 : domain ? e.status : repository ? ({ NOT_FOUND: 404, STALE_REVISION: 409, IDEMPOTENCY_CONFLICT: 409, CONNECTION_REQUIRED: 503, VALIDATION_ERROR: 400 }[repository.code] ?? 500) : e.statusCode === 413 ? 413 : 500; reply.status(status).send({ error: { code: isValidation ? 'VALIDATION_ERROR' : domain ? e.code : repository ? repository.code : status === 413 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR', message: isValidation ? 'Check the request fields and try again.' : domain ? e.message : repository ? e.message : status === 413 ? 'The request is too large.' : 'The request could not be completed.', retryable: status >= 500, requestId: req.id, ...(isValidation ? { details: { fieldErrors: e.flatten().fieldErrors } } : {}) } }); if (status === 500)
        app.log.error({ requestId: req.id, errorName: e.name }, 'Request failed'); });
    const ok = (req: FastifyRequest, data: unknown, cursor?: string) => ({ data, meta: { requestId: req.id, schemaVersion: '1' as const, ...(cursor === undefined ? {} : { eventCursor: cursor }) } });
    app.get('/health/live', async () => ({ status: 'ok', mode: config.mode }));
    app.get('/v1/system/capabilities', async (req) => ok(req, { mode: config.mode, capabilities: [...(config.mode === 'demo' ? [{ provider: 'Local demo', status: 'ready', reason: 'Synthetic data and simulated investigations. No provider calls.', nextStep: 'Use the sample event controls to exercise background updates.' }] : []), ...(['Supabase', 'Gmail', 'Factory / Claude', 'Daytona'] as const).map((provider) => { const keys = provider === 'Supabase' ? ['SUPABASE_URL', 'DATABASE_URL'] : provider === 'Gmail' ? ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] : provider === 'Factory / Claude' ? ['FACTORY_API_KEY', 'ANTHROPIC_API_KEY', 'CLAUDE_MODEL_ID'] : ['DAYTONA_API_KEY', 'DAYTONA_SNAPSHOT']; const missing = keys.filter(k => !process.env[k]); return { provider, status: missing.length ? 'missing_configuration' : 'needs_authorization', reason: missing.length ? `Missing ${missing.join(', ')}.` : 'Configuration is present; a live account check is still required.', nextStep: missing.length ? 'Add these fields to the ignored local environment file.' : 'Complete the live connection check.' }; })] }));
    app.get('/fixtures/:scenario', async (req, reply) => { const id = (req.params as {
        scenario: string;
    }).scenario; const scenario = scenarios[id]; if (!scenario)
        throw new DomainError('NOT_FOUND', 'Fixture not found.', 404); const fee = z.coerce.number().int().min(0).max(999).default(29).parse((req.query as {
        monthlyFee?: string;
    }).monthlyFee); return reply.header('Content-Type', 'text/html; charset=utf-8').header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; frame-ancestors 'none'").send(fixturePage(scenario, fee)); });
    if (config.mode === 'live') {
        const { registerLiveRoutes } = await import('./live.js');
        await registerLiveRoutes(app, config);
        return app;
    }
    app.get('/v1/dashboard', async (req) => { const s = await store.read(); const counts = { pause_here: 0, confirm_first: 0, no_issues_found: 0, checking: 0, limited: 0, stale: 0 }; for (const c of s.cases) {
        if (c.freshness === 'current' && c.currentAssessment)
            counts[c.currentAssessment.verdict]++;
        if (c.latestRunStatus === 'queued' || c.latestRunStatus === 'checking')
            counts.checking++;
        if (c.latestRunStatus === 'limited')
            counts.limited++;
        if (c.freshness === 'stale')
            counts.stale++;
    } return ok(req, C.DashboardSnapshotSchema.parse({ mode: 'demo', counts, cases: paged(sortedCases(s), undefined), activity: [...s.events].reverse().slice(0, 12), connections: s.connections }), String(s.cursor)); });
    app.get('/v1/cases', async (req) => { const f = C.CaseFiltersSchema.parse(req.query), s = await store.read(); const items = sortedCases(s).filter(c => (!f.verdict || (c.currentAssessment?.verdict === f.verdict && c.freshness === (f.freshness ?? 'current'))) && (!f.impact || c.currentAssessment?.impacts.includes(f.impact)) && (!f.reviewStatus || c.reviewStatus === f.reviewStatus) && (!f.freshness || c.freshness === f.freshness) && (!f.q || `${c.title} ${c.currentAssessment?.finding.headline ?? ''} ${s.sources.filter(r => r.caseIds.includes(c.id)).map(r => r.source.senderLabel).join(' ')}`.toLowerCase().includes(f.q.toLowerCase()))); return ok(req, paged(items, f.cursor, f.limit), String(s.cursor)); });
    app.get('/v1/cases/:id', async (req) => ok(req, C.CaseDetailSchema.parse(caseDetail(await store.read(), paramId(req)))));
    app.get('/v1/cases/:id/assessments', async (req) => { const s = await store.read(), id = paramId(req), q = C.PaginationInputSchema.parse(req.query); getCase(s, id); return ok(req, paged([...s.assessments].reverse().filter(a => a.caseId === id), q.cursor, q.limit)); });
    app.get('/v1/messages', async (req) => { const f = C.MessageFiltersSchema.parse(req.query), s = await store.read(); const items = [...s.sources].reverse().filter(r => (!f.disposition || r.source.disposition === f.disposition) && (!f.source || r.source.kind === f.source) && (!f.q || `${r.source.title} ${r.source.senderLabel} ${r.source.previewText}`.toLowerCase().includes(f.q.toLowerCase()))).map(r => ({ ...r.source, caseIds: r.caseIds })); return ok(req, paged(items, f.cursor, f.limit)); });
    app.get('/v1/messages/:id', async (req) => { const s = await store.read(), r = s.sources.find(r => r.source.id === paramId(req)); if (!r)
        throw new DomainError('NOT_FOUND', 'Message not found.', 404); return ok(req, C.MessageDetailSchema.parse({ source: r.source, content: r.content, caseIds: r.caseIds, originalUrl: r.originalUrl })); });
    app.get('/v1/evidence/:id', async (req) => { const s = await store.read(), e = s.evidence.find(e => e.id === paramId(req)); if (!e)
        throw new DomainError('NOT_FOUND', 'Evidence not found.', 404); return ok(req, { evidence: e, artifactUrl: null, expiresAt: null }); });
    app.post('/v1/cases/:id/viewed', async (req) => { const input = C.ViewedInputSchema.parse(req.body), id = paramId(req); return ok(req, await store.transaction(s => viewedDemo(s, id, input.assessmentId))); });
    app.post('/v1/cases/:id/rechecks', async (req, reply) => { const input = C.RecheckInputSchema.parse(req.body), id = paramId(req); const result = await store.transaction(s => idempotent(s, `recheck:${id}`, req.headers['idempotency-key'] as string | undefined, input, () => recheckDemo(s, id, input.reason, input.note))); return reply.status(202).send(ok(req, result)); });
    app.get('/v1/runs/:id', async (req) => { const s = await store.read(), run = s.runs.find(r => r.id === paramId(req)); if (!run)
        throw new DomainError('NOT_FOUND', 'Investigation not found.', 404); return ok(req, { run, steps: s.steps.filter(step => step.runId === run.id) }); });
    app.get('/v1/activity', async (req) => { const s = await store.read(), q = C.PaginationInputSchema.parse(req.query); return ok(req, paged([...s.events].reverse(), q.cursor, q.limit)); });
    app.get('/v1/connections', async (req) => ok(req, (await store.read()).connections));
    app.get('/v1/connections/:id/scope', async req => { const state=await store.read();if(!state.connections.some(c=>c.id===paramId(req)))throw new DomainError('NOT_FOUND','Connection not found.',404);return ok(req,C.ConnectionSyncScopeSchema.parse({initialCutoff:null,initialCap:50,excludedByCap:false,coverageGap:false,initialComplete:true})); });
    app.delete('/v1/connections/:id', async (req) => ok(req, await store.transaction(s => disconnectDemo(s, paramId(req)))));
    app.post('/v1/connections/gmail/start', async () => { throw new DomainError('CONFIG_MISSING', 'Google authorization is available in live mode. Demo sources use synthetic messages.', 503); });
    app.post('/v1/demo/connections/:id/reconnect', async (req) => ok(req, await store.transaction(s => reconnectDemo(s, paramId(req)))));
    app.post('/v1/demo/events', async (req, reply) => { const input = z.strictObject({ scenario: z.enum(['SC-01', 'SC-02', 'SC-03', 'SC-04', 'SC-05', 'SC-06', 'SC-07', 'SC-08', 'SC-09']), externalId: z.string().max(100).optional() }).parse(req.body); const result = await store.transaction(s => idempotent(s, 'demo-event', req.headers['idempotency-key'] as string | undefined, input, () => { const r = ingestDemo(s, input.scenario, input.externalId); return { sourceEventId: r.source.id, caseId: r.caseIds[0] ?? null, runId: null }; })); return reply.status(202).send(ok(req, result)); });
    app.post('/v1/demo/seed', async (req) => { await store.read(); return ok(req, { seeded: true, mode: 'demo' }); });
    app.post('/v1/demo/reset', async (req) => ok(req, await store.reset()));
    app.post('/v1/browser/installations', async (req) => { const input = C.BrowserInstallationInputSchema.parse(req.body); const result = await store.transaction(s => { const existing = s.installations.find(i => i.clientInstallationId === input.clientInstallationId && i.ownerId === DEMO_OWNER); if (existing)
        return { installationId: existing.id, connectionId: existing.connectionId }; const i = { id: randomUUID(), clientInstallationId: input.clientInstallationId, connectionId: DEMO_BROWSER, ownerId: DEMO_OWNER }; s.installations.push(i); return { installationId: i.id, connectionId: i.connectionId }; }); return ok(req, result); });
    app.post('/v1/browser/events', async (req, reply) => { const input = C.BrowserEventInputSchema.parse(req.body), url = new URL(input.pageUrl); if (!['localhost', '127.0.0.1'].includes(url.hostname) || !url.pathname.startsWith('/fixtures/'))
        throw new DomainError('TARGET_BLOCKED', 'Demo browser observations are limited to local controlled fixture pages.', 403); const scenario = url.pathname.split('/')[2] ?? ''; const result = await store.transaction(s => { const installation = s.installations.find(i => i.id === input.installationId && i.ownerId === DEMO_OWNER); if (!installation)
        throw new DomainError('NOT_FOUND', 'Browser installation not found.', 404); if (s.connections.find(c => c.id === installation.connectionId)?.status !== 'connected')
        throw new DomainError('CONNECTION_REQUIRED', 'Reconnect the demo browser source.', 503); return idempotent(s, 'browser-event', req.headers['idempotency-key'] as string | undefined, input, () => { const existing = s.sources.find(r => r.source.externalId === input.clientEventId); if (existing)
        return { sourceEventId: existing.source.id, caseId: existing.caseIds[0] ?? null, runId: null }; const r = ingestDemo(s, scenario, input.clientEventId, { sourcePatch: { kind: 'browser', connectionId: installation.connectionId, title: input.pageTitle || scenarios[scenario]!.title }, originalUrl: input.pageUrl }); return { sourceEventId: r.source.id, caseId: null, runId: null }; }); }); return reply.status(202).send(ok(req, result)); });
    app.get('/v1/events', async (req, reply) => { const raw = String(req.headers['last-event-id'] ?? '0'); if (!/^\d+$/.test(raw))
        throw new DomainError('VALIDATION_ERROR', 'The event cursor is invalid.'); let cursor = Number(raw), busy = false; reply.hijack(); streams.add(reply.raw); reply.raw.on('close', () => streams.delete(reply.raw)); reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no', ...(req.headers.origin ? { 'Access-Control-Allow-Origin': req.headers.origin, 'Vary': 'Origin', 'Access-Control-Allow-Credentials': 'true' } : {}) }); reply.raw.write(': connected\n\n'); const flush = async () => { if (busy || reply.raw.destroyed)
        return; busy = true; try {
        const s = await store.read();
        if (cursor > s.cursor) {
            const e = { id: String(s.cursor), schemaVersion: '1', type: 'resync.required', occurredAt: new Date().toISOString(), caseId: null, sourceRevision: null, data: { reason: 'snapshot_gap' } };
            reply.raw.write(`id: ${e.id}\nevent: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
            cursor = s.cursor;
        }
        for (const e of s.events.filter(e => Number(e.id) > cursor)) {
            reply.raw.write(`id: ${e.id}\nevent: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
            cursor = Number(e.id);
        }
    }
    catch {
        reply.raw.end();
    }
    finally {
        busy = false;
    } }; await flush(); const interval = setInterval(() => void flush(), 800), heartbeat = setInterval(() => reply.raw.write(': heartbeat\n\n'), 15000); reply.raw.on('close', () => { clearInterval(interval); clearInterval(heartbeat); }); });
    return app;
}
