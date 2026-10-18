import { createHash, randomUUID } from 'node:crypto';
import { PgBoss } from 'pg-boss';
import { z } from 'zod';
import { PostgresRepository, supabaseBackendKey, supabaseServiceHeaders, type RunConfiguration } from '@beforeyou/db';
import { browserRuntimeFromEnv, createLiveAgent, type AgentConfig, type EvidenceCapture } from '@beforeyou/agent';
import { EvidenceSchema, SourceEventSchema, ErrorCodeSchema, LimitationSchema, INVESTIGATION_PROMPT_VERSION, INVESTIGATION_POLICY_VERSION, INVESTIGATION_TOOL_VERSION, type ApiError, type Evidence } from '@beforeyou/contracts';
import { gmailTestModeEnabled, pollGmail } from './gmail.js';
import { investigationContext } from './investigation-context.js';
const JobData = z.object({ ownerId: z.uuid(), sourceEventId: z.uuid().optional(), runId: z.uuid().optional(), caseId: z.uuid().optional() });
const positive = (key: string, fallback: number) => z.coerce.number().int().positive().parse(process.env[key] ?? fallback);
function runtimeConfig(): AgentConfig {
    const required = ['FACTORY_API_KEY', 'ANTHROPIC_API_KEY', 'CLAUDE_MODEL_ID'];
    const missing = required.filter(k => !process.env[k]);
    if (missing.length) throw Object.assign(new Error(`Investigation is not configured: ${missing.join(', ')}.`), { code: 'CONFIG_MISSING' });
    return { factoryApiKey: process.env.FACTORY_API_KEY!, anthropicApiKey: process.env.ANTHROPIC_API_KEY!, anthropicWorkspaceId: process.env.ANTHROPIC_WORKSPACE_ID?.trim() || undefined, claudeModelId: process.env.CLAUDE_MODEL_ID!, daytonaApiKey: process.env.DAYTONA_API_KEY ?? '', daytonaSnapshot: process.env.DAYTONA_SNAPSHOT ?? '', allowedDomains: (process.env.INVESTIGATION_ALLOWED_DOMAINS ?? '').split(',').map(v => v.trim()).filter(Boolean), maxSteps: positive('MAX_INVESTIGATION_STEPS', 12), timeoutMs: positive('INVESTIGATION_TIMEOUT_MS', 180000), maxOutputTokens: positive('MODEL_MAX_OUTPUT_TOKENS', 4000), droidExecPath: process.env.DROID_EXEC_PATH?.trim() || undefined, runtimeDirectory: process.env.AGENT_RUNTIME_DIRECTORY?.trim() || undefined, browserRuntime: browserRuntimeFromEnv(process.env.BROWSER_RUNTIME), controlledFixtureOrigin: process.env.CONTROLLED_FIXTURE_ORIGIN?.trim() || undefined };
}
function sanitizedError(error: unknown): ApiError['error'] { const typed = error as {
    code?: string;
    name?: string;
}; const parsed = ErrorCodeSchema.safeParse(typed.code); const code = parsed.success ? parsed.data : typed.name === 'ZodError' ? 'OUTPUT_INVALID' : 'PROVIDER_UNAVAILABLE'; const message = code === 'CONFIG_MISSING' ? 'The investigation provider is not configured.' : code === 'OUTPUT_INVALID' ? 'The provider response did not satisfy evidence requirements.' : code === 'TARGET_BLOCKED' ? 'The requested page is outside the permitted investigation scope.' : 'The investigation could not complete. Recheck when the provider is available.'; return { code, message, retryable: ['PROVIDER_UNAVAILABLE', 'RATE_LIMITED'].includes(code), requestId: randomUUID() }; }
export async function startLiveWorker() {
    if (!process.env.DATABASE_URL)
        throw new Error('Live worker blocked: DATABASE_URL is missing.');
    const repo = new PostgresRepository(process.env.DATABASE_URL), boss = new PgBoss({ connectionString: process.env.DATABASE_URL, schema: 'pgboss', max: 6 });
    boss.on('error', () => console.error('Durable queue operation failed; provider secrets are redacted.'));
    await boss.start();
    for (const queue of ['triage', 'investigate'])
        await boss.createQueue(queue, { retryLimit: 2, retryDelay: 10, expireInSeconds: Math.ceil(positive('INVESTIGATION_TIMEOUT_MS', 180000) / 1000) + 120 });
    const configuration: RunConfiguration = { modelId: process.env.CLAUDE_MODEL_ID ?? 'not_configured', promptVersion: INVESTIGATION_PROMPT_VERSION, policyVersion: INVESTIGATION_POLICY_VERSION, toolVersion: INVESTIGATION_TOOL_VERSION, execution: 'live' };
    const controller = new AbortController();
    let stopped = false;
    const sourcesFor = async (ownerId: string, caseId: string) => { const result = await repo.pool.query('SELECT s.id,s.dto,s.content,s.links FROM source_events s JOIN case_sources cs ON cs.source_event_id=s.id AND cs.owner_id=s.owner_id WHERE cs.owner_id=$1 AND cs.case_id=$2 ORDER BY s.created_at,s.id', [ownerId, caseId]); return result.rows.map(row => ({ id: row.id as string, title: SourceEventSchema.parse(row.dto).title, content: row.content as string, links: row.links as string[] })); };
    const saveCapture = async (ownerId: string, runId: string, caseId: string, generation: number, capture: EvidenceCapture): Promise<Evidence> => {
        const id = randomUUID(), artifactId = capture.artifactBytes ? randomUUID() : null;
        let storageKey: string | null = null;
        let uploaded = false;
        const storageKeyCredential=supabaseBackendKey();
        try {
        if (capture.artifactBytes && artifactId) {
            if (!process.env.SUPABASE_URL || !storageKeyCredential || !process.env.SUPABASE_STORAGE_BUCKET)
                throw Object.assign(new Error('Private evidence storage is not configured.'), { code: 'CONFIG_MISSING' });
            if (capture.artifactBytes.length > 8 * 1024 * 1024)
                throw Object.assign(new Error('Evidence capture exceeds the size limit.'), { code: 'OUTPUT_INVALID' });
            storageKey = `${ownerId}/${caseId}/${artifactId}`;
            const artifactHash = createHash('sha256').update(capture.artifactBytes).digest('hex');
            const response = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/${encodeURIComponent(process.env.SUPABASE_STORAGE_BUCKET)}/${storageKey}`, { method: 'POST', headers: { ...supabaseServiceHeaders(storageKeyCredential), 'Content-Type': capture.artifactMime ?? 'image/png', 'x-upsert': 'false' }, body: Buffer.from(capture.artifactBytes), signal: AbortSignal.timeout(15000) });
            if (!response.ok)
                throw Object.assign(new Error('Private evidence upload failed.'), { code: 'PROVIDER_UNAVAILABLE' });
            uploaded = true;
            await repo.transaction(ownerId, async (client) => { await client.query('INSERT INTO artifacts(id,owner_id,case_id,storage_key,mime_type,byte_length,content_hash,retain_until) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [artifactId, ownerId, caseId, storageKey, capture.artifactMime ?? 'image/png', capture.artifactBytes!.length, artifactHash, new Date(Date.now() + 30 * 86400000)]); });
        }
        const evidence = EvidenceSchema.parse({ id, caseId, runId, sourceEventId: capture.sourceEventId, stepId: capture.stepId, kind: capture.kind, observedAt: new Date().toISOString(), sourceLabel: capture.sourceLabel, displayUrl: capture.displayUrl, excerpt: capture.excerpt, artifactId, contentHash: capture.contentHash, provenance: capture.provenance });
        return await repo.saveEvidence(ownerId, runId, generation, evidence);
        } catch (error) {
            if (uploaded && storageKey && artifactId) {
                // Only an unreferenced failed capture may be removed. Published evidence is immutable.
                const referenced = await repo.pool.query('SELECT id FROM evidence WHERE artifact_id=$1 AND owner_id=$2', [artifactId, ownerId]).catch(() => null);
                if (referenced && referenced.rows.length === 0) {
                    const removed = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/${encodeURIComponent(process.env.SUPABASE_STORAGE_BUCKET!)}/${storageKey}`, { method: 'DELETE', headers: { ...supabaseServiceHeaders(storageKeyCredential!) }, signal: AbortSignal.timeout(10000) }).catch(() => null);
                    if (removed?.ok) await repo.pool.query('DELETE FROM artifacts WHERE id=$1 AND owner_id=$2 AND NOT EXISTS(SELECT 1 FROM evidence WHERE artifact_id=$1)', [artifactId, ownerId]);
                    else console.error('A failed private capture needs storage cleanup; no artifact URL was published.');
                }
            }
            throw error;
        }
    };
    await boss.work('triage', async (jobs) => { for (const job of jobs) {
        const data = JobData.parse(job.data);
        if (!data.sourceEventId)
            continue;
        try {
            const result = await repo.pool.query("SELECT s.dto,s.content,s.links,c.status AS connection_status FROM source_events s JOIN connections c ON c.id=s.connection_id AND c.owner_id=s.owner_id WHERE s.id=$1 AND s.owner_id=$2", [data.sourceEventId, data.ownerId]);
            const row = result.rows[0];
            if (!row || row.connection_status !== 'connected')
                continue;
            const source = SourceEventSchema.parse(row.dto);
            if (source.processingStatus === 'complete')
                continue;
            const candidates = await repo.candidateCases(data.ownerId, source.id);
            const agent = createLiveAgent(runtimeConfig());
            const proposal = await agent.triage({ source: { id: source.id, title: source.title, content: row.content, links: row.links }, candidateCases: candidates.map(c => ({ id: c.id, title: c.title })), signal: controller.signal });
            await repo.acceptTriage(data.ownerId, source.id, proposal, configuration);
        }
        catch (error) {
            const failure = sanitizedError(error);
            console.error('Triage did not complete:', failure.code, error instanceof Error ? `${error.name}: ${error.message.replace(/sk-[A-Za-z0-9_-]+/g, '[key]').slice(0, 300)}` : 'Unknown');
            await repo.failTriage(data.ownerId, data.sourceEventId, failure);
            if (failure.retryable)
                throw error;
        }
    } });
    await boss.work('investigate', async (jobs) => {
        for (const job of jobs) {
            const data = JobData.parse(job.data);
            if (!data.runId)
                continue;
            let generation: number | undefined;
            let heartbeat: ReturnType<typeof setInterval> | undefined;
            const runAbort = new AbortController();
            const abort = () => runAbort.abort();
            controller.signal.addEventListener('abort', abort, { once: true });
            try {
                const lease = await repo.claimRun(data.ownerId, data.runId, 120000);
                generation = lease.generation;
                heartbeat = setInterval(() => { void repo.renewLease(data.ownerId, data.runId!, lease.generation, 120000).catch(() => runAbort.abort()); }, 30000);
                const sources = await sourcesFor(data.ownerId, lease.run.caseId);
                const context = await investigationContext(repo, data.ownerId, lease.run, generation, sources);
                const agent = createLiveAgent(runtimeConfig());
                const result = await agent.investigate({ ownerId: data.ownerId, caseId: lease.run.caseId, runId: data.runId, sourceRevision: lease.run.sourceRevision, dataOrigin: lease.run.provenance.dataOrigin, sources, ...context, saveEvidence: capture => saveCapture(data.ownerId, data.runId!, lease.run.caseId, lease.generation, capture), onStep: async (step) => { await repo.addStep(data.ownerId, data.runId!, lease.generation, step); }, signal: runAbort.signal });
                await repo.pool.query('UPDATE investigation_runs SET provider_session_id=$3 WHERE id=$1 AND owner_id=$2 AND lease_generation=$4', [data.runId, data.ownerId, result.sessionId, generation]);
                await repo.publishAssessment(data.ownerId, data.runId, generation, result.proposal, 'live', result.limitations.length ? 'limited' : 'complete');
            }
            catch (error) {
                const failure = sanitizedError(error);
                console.error('Investigation did not complete:', failure.code, error instanceof Error ? `${error.name}: ${error.message.replace(/sk-[A-Za-z0-9_-]+/g, '[key]').slice(0, 300)}` : 'Unknown');
                if (generation !== undefined) {
                    const limitation = LimitationSchema.safeParse((error as {limitation?: unknown})?.limitation);
                    if (limitation.success) await repo.publishAssessment(data.ownerId, data.runId, generation, {verdict:null,impacts:[],finding:null,nextAction:null,checkedScope:[],limitations:[limitation.data],changeSummary:null}, 'live', 'limited').catch(() => {});
                    else await repo.failRun(data.ownerId, data.runId, generation, failure).catch(() => { });
                }
            }
            finally {
                if (heartbeat)
                    clearInterval(heartbeat);
                controller.signal.removeEventListener('abort', abort);
            }
        }
    });
    const pump = async () => { const client = await repo.pool.connect(); try {
        await client.query('BEGIN');
        const result = await client.query("SELECT * FROM outbox_events WHERE delivered_at IS NULL AND topic IN ('triage','investigate') ORDER BY created_at LIMIT 25 FOR UPDATE SKIP LOCKED");
        for (const row of result.rows) {
            await boss.send(row.topic, row.payload, { singletonKey: row.dedupe_key, retryLimit: 2 });
            await client.query('UPDATE outbox_events SET delivered_at=now(),attempts=attempts+1 WHERE id=$1', [row.id]);
        }
        await client.query("UPDATE outbox_events SET delivered_at=now() WHERE topic='event' AND delivered_at IS NULL");
        await client.query('COMMIT');
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
        client.release();
    } };
    for (const signal of ['SIGINT', 'SIGTERM'] as const)
        process.on(signal, () => { stopped = true; controller.abort(); });
    let lastSync = 0, lastRecovery = 0, syncTask: Promise<void> | undefined;
    console.info(`Before You worker · Live mode — durable queue and independent Gmail polling · browser runtime: ${browserRuntimeFromEnv(process.env.BROWSER_RUNTIME) === 'local_controlled' ? 'local controlled-fixture browser (not Daytona)' : 'Daytona sandbox'} · Gmail import: ${gmailTestModeEnabled() ? 'test mode, subjects containing [BY-TEST] only' : 'normal mailbox sync'}`);
    while (!stopped) {
        try {
            await pump();
            if (Date.now() - lastRecovery > 30000) {
                lastRecovery = Date.now();
                const owners = await repo.pool.query("SELECT DISTINCT owner_id FROM investigation_runs WHERE status='checking' AND lease_expires_at<now()");
                for (const row of owners.rows)
                    await repo.recoverExpiredRuns(row.owner_id);
            }
            if (!syncTask && Date.now() - lastSync > positive('GMAIL_POLL_INTERVAL_SECONDS', 15) * 1000) {
                lastSync = Date.now();
                syncTask = pollGmail(repo).catch(() => console.error('Gmail synchronization failed; see Connections for account state.')).finally(() => { syncTask = undefined; });
            }
        }
        catch {
            console.error('Worker iteration failed; durable jobs remain queued.');
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    await syncTask;
    await boss.stop({ graceful: true, timeout: 10000 });
    await repo.close();
}
