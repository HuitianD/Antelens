import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AcceptedRun, ActivityEvent, Assessment, CaseDetail, CaseSummary, ConnectionSummary, Evidence, InvestigationRun, JourneyStep, SourceEvent } from '@beforeyou/contracts';
import { ActivityEventSchema, AssessmentSchema, CaseSummarySchema, SourceEventSchema, EvidenceSchema, InvestigationRunSchema } from '@beforeyou/contracts';
import { DEMO_BROWSER, DEMO_GMAIL, DEMO_OWNER, DEMO_PROVENANCE, scenarios } from './index.js';
export class DomainError extends Error {
    constructor(public code: string, message: string, public status = 400) { super(message); }
}
export interface SourceRecord {
    source: SourceEvent;
    content: string;
    caseIds: string[];
    scenarioId: string;
    ownerId: string;
    originalUrl: string | null;
}
interface DemoJob {
    id: string;
    type: 'triage' | 'investigate';
    sourceId?: string;
    runId?: string;
    stage: number;
    dueAt: number;
    generation: string;
}
export interface DemoState {
    version: 1;
    cursor: number;
    cases: CaseSummary[];
    sources: SourceRecord[];
    runs: InvestigationRun[];
    assessments: Assessment[];
    evidence: Evidence[];
    steps: JourneyStep[];
    events: ActivityEvent[];
    connections: ConnectionSummary[];
    jobs: DemoJob[];
    runGenerations: Record<string, string>;
    installations: {
        id: string;
        clientInstallationId: string;
        connectionId: string;
        ownerId: string;
    }[];
    idempotency: Record<string, {
        hash: string;
        result: unknown;
    }>;
    reviews: {
        caseId: string;
        assessmentId: string;
        status: 'viewed' | 'verification_requested';
        at: string;
    }[];
    workerHeartbeat: string | null;
}
export const now = () => new Date().toISOString();
export const hash = (input: unknown) => createHash('sha256').update(typeof input === 'string' ? input : JSON.stringify(input)).digest('hex');
function event(s: DemoState, type: ActivityEvent['type'], data: Record<string, unknown>, c?: CaseSummary) {
    const next = ActivityEventSchema.parse({ id: String(++s.cursor), schemaVersion: '1', type, occurredAt: now(), caseId: c?.id ?? null, sourceRevision: c?.sourceRevision ?? null, data });
    s.events.push(next);
}
function changed(s: DemoState, c: CaseSummary) { c.recordVersion++; c.updatedAt = now(); event(s, 'case.updated', { case: structuredClone(c) }, c); }
function sourceEvent(s: DemoState, record: SourceRecord, type: 'source.received' | 'source.updated') {
    event(s, type, { sourceEventId: record.source.id, kind: record.source.kind, disposition: record.source.disposition, processingStatus: record.source.processingStatus, lastErrorCode: record.source.lastErrorCode, caseIds: record.caseIds });
}
export function createDemoState(): DemoState {
    const s: DemoState = { version: 1, cursor: 0, cases: [], sources: [], runs: [], assessments: [], evidence: [], steps: [], events: [], jobs: [], runGenerations: {}, installations: [], idempotency: {}, reviews: [], workerHeartbeat: null, connections: [{ id: DEMO_GMAIL, kind: 'gmail', status: 'connected', accountLabel: 'Sample inbox · Demo data', grantedScopes: [], lastSyncedAt: now(), lastErrorCode: null }, { id: DEMO_BROWSER, kind: 'browser', status: 'connected', accountLabel: 'Controlled pages · Demo data', grantedScopes: [], lastSyncedAt: now(), lastErrorCode: null }] };
    for (const id of ['SC-01', 'SC-03', 'SC-04', 'SC-06', 'SC-08', 'SC-07'])
        ingestDemo(s, id, `initial-${id}`);
    for (let i = 0; i < 6; i++)
        processDemoJobs(s, true);
    s.events = s.events.map((e, index) => ({ ...e, occurredAt: new Date(Date.now() - (s.events.length - index) * 45000).toISOString() }));
    return s;
}
export function ingestDemo(s: DemoState, scenarioId: string, externalId: string = randomUUID(), override?: Partial<SourceRecord> & {
    sourcePatch?: Partial<SourceEvent>;
}): SourceRecord {
    const scenario = scenarios[scenarioId];
    if (!scenario)
        throw new DomainError('VALIDATION_ERROR', 'Unknown demo scenario.');
    const connectionId = override?.sourcePatch?.connectionId ?? DEMO_GMAIL;
    const existing = s.sources.find(r => r.source.externalId === externalId && r.source.connectionId === connectionId);
    if (existing)
        return existing;
    const connected = s.connections.find(c => c.id === connectionId)?.status === 'connected';
    if (!connected)
        throw new DomainError('CONNECTION_REQUIRED', 'Reconnect the demo inbox before adding a sample message.', 503);
    const source = SourceEventSchema.parse({ id: randomUUID(), connectionId: DEMO_GMAIL, kind: 'gmail', externalId, externalThreadId: scenarioId === 'SC-02' ? 'thread-SC-01' : `thread-${scenarioId}-${externalId.startsWith('initial-') ? 'initial' : externalId}`, receivedAt: now(), occurredAt: now(), title: scenario.title, senderLabel: scenario.sender, previewText: scenario.content, contentRef: `demo:${randomUUID()}`, disposition: 'pending', processingStatus: 'queued', lastErrorCode: null, dataOrigin: 'synthetic' });
    if (scenarioId === 'SC-01')
        source.externalThreadId = 'thread-SC-01';
    const { sourcePatch, ...recordOverride } = override ?? {};
    if (sourcePatch)
        Object.assign(source, sourcePatch);
    const record: SourceRecord = { source, content: scenario.content, caseIds: [], scenarioId, ownerId: DEMO_OWNER, originalUrl: null, ...recordOverride };
    s.sources.push(record);
    s.jobs.push({ id: randomUUID(), type: 'triage', sourceId: source.id, stage: 0, dueAt: Date.now() + 800, generation: randomUUID() });
    sourceEvent(s, record, 'source.received');
    return record;
}
function queueRun(s: DemoState, c: CaseSummary, trigger: InvestigationRun['trigger']): AcceptedRun {
    const active = s.runs.find(r => r.id === c.activeRunId);
    if (active && ['queued', 'checking'].includes(active.status) && active.sourceRevision === c.sourceRevision)
        return { caseId: c.id, runId: active.id, status: active.status as 'queued' | 'checking', reused: true };
    if (active && ['queued', 'checking'].includes(active.status)) {
        active.status = 'cancelled';
        active.finishedAt = now();
        s.jobs = s.jobs.filter(j => j.runId !== active.id);
        event(s, 'investigation.cancelled', { runId: active.id, status: 'cancelled', limitations: [], errorCode: null }, c);
    }
    const run = InvestigationRunSchema.parse({ id: randomUUID(), caseId: c.id, sourceRevision: c.sourceRevision, trigger, status: 'queued', attempt: 1, startedAt: null, finishedAt: null, modelId: 'fixture-simulator-v1', promptVersion: 'demo-1', policyVersion: '1', toolVersion: '1', provenance: DEMO_PROVENANCE, limitations: [], error: null });
    const generation = randomUUID();
    s.runGenerations[run.id] = generation;
    s.runs.push(run);
    s.jobs.push({ id: randomUUID(), type: 'investigate', runId: run.id, stage: 0, dueAt: Date.now() + 900, generation });
    c.activeRunId = run.id;
    c.latestRunStatus = 'queued';
    if (c.currentAssessment)
        c.freshness = 'stale';
    changed(s, c);
    event(s, 'investigation.queued', { runId: run.id, status: 'queued' }, c);
    return { caseId: c.id, runId: run.id, status: 'queued', reused: false };
}
function triage(s: DemoState, record: SourceRecord) {
    if (record.scenarioId === 'SC-07') {
        record.source.disposition = 'no_action';
        record.source.processingStatus = 'complete';
        sourceEvent(s, record, 'source.updated');
        return;
    }
    let c: CaseSummary | undefined;
    if (record.scenarioId === 'SC-02') {
        const original = s.sources.find(r => r.scenarioId === 'SC-01' && r.caseIds.length);
        c = s.cases.find(c => c.id === original?.caseIds[0]);
    }
    if (!c) {
        c = CaseSummarySchema.parse({ id: randomUUID(), recordVersion: 1, title: record.source.title, sourceKinds: [record.source.kind], sourceRevision: 1, currentAssessment: null, activeRunId: null, latestRunStatus: null, freshness: 'current', reviewStatus: 'unreviewed', updatedAt: now() });
        s.cases.push(c);
        event(s, 'case.created', { case: structuredClone(c) }, c);
    }
    else
        c.sourceRevision++;
    if (!c.sourceKinds.includes(record.source.kind))
        c.sourceKinds.push(record.source.kind);
    record.caseIds = [c.id];
    record.source.disposition = 'action_required';
    record.source.processingStatus = 'complete';
    sourceEvent(s, record, 'source.updated');
    queueRun(s, c, c.sourceRevision === 1 ? 'new_source' : 'new_evidence');
}
function captureDemo(s: DemoState, c: CaseSummary, run: InvestigationRun) {
    const records = s.sources.filter(r => r.caseIds.includes(c.id));
    const source = records.at(-1)!;
    const scenario = scenarios[source.scenarioId]!;
    const stepId = randomUUID();
    const evidenceIds: string[] = [];
    for (const record of records) {
        const evidence = EvidenceSchema.parse({ id: randomUUID(), caseId: c.id, runId: run.id, sourceEventId: record.source.id, stepId, kind: 'message_excerpt', observedAt: now(), sourceLabel: `Demo message · ${record.source.senderLabel}`, displayUrl: null, excerpt: record.content, artifactId: null, contentHash: hash(record.content), provenance: DEMO_PROVENANCE });
        s.evidence.push(evidence);
        evidenceIds.push(evidence.id);
    }
    const e = EvidenceSchema.parse({ id: randomUUID(), caseId: c.id, runId: run.id, sourceEventId: source.source.id, stepId, kind: source.scenarioId === 'SC-04' ? 'permission_request' : source.scenarioId === 'SC-05' ? 'download_metadata' : 'page_excerpt', observedAt: now(), sourceLabel: 'Simulated fixture page', displayUrl: `https://${source.scenarioId === 'SC-01' || source.scenarioId === 'SC-02' ? 'maple' : 'controlled'}.example.test/application`, excerpt: scenario.page, artifactId: null, contentHash: hash(scenario.page), provenance: DEMO_PROVENANCE });
    s.evidence.push(e);
    evidenceIds.push(e.id);
    const step: JourneyStep = { id: stepId, runId: run.id, index: 0, kind: 'compare_sources', status: scenario.limitation ? 'limited' : 'complete', label: scenario.limitation ? 'Simulation reached a protected boundary' : 'Simulation compared the message and visible fixture terms', fromDisplayUrl: null, toDisplayUrl: e.displayUrl, evidenceIds, occurredAt: now() };
    s.steps.push(step);
    event(s, 'investigation.step_completed', { runId: run.id, stepId, label: step.label, evidenceIds }, c);
}
export function publishDemo(s: DemoState, c: CaseSummary, run: InvestigationRun, generation: string): boolean {
    if (s.runGenerations[run.id] !== generation || c.activeRunId !== run.id || run.status !== 'checking')
        return false;
    const record = s.sources.filter(r => r.caseIds.includes(c.id)).at(-1)!;
    const scenario = scenarios[record.scenarioId]!;
    if (run.sourceRevision !== c.sourceRevision) {
        run.status = 'cancelled';
        run.finishedAt = now();
        queueRun(s, c, 'new_evidence');
        return false;
    }
    const evidence = s.evidence.filter(e => e.caseId === c.id && e.runId === run.id);
    const limitations = scenario.limitation ? [{ ...scenario.limitation, evidenceIds: evidence.map(e => e.id) }] : [];
    run.status = limitations.length ? 'limited' : 'complete';
    run.limitations = limitations;
    run.finishedAt = now();
    c.latestRunStatus = run.status;
    c.activeRunId = null;
    if (scenario.verdict) {
        const assessment = AssessmentSchema.parse({ id: randomUUID(), caseId: c.id, runId: run.id, version: s.assessments.filter(a => a.caseId === c.id).length + 1, sourceRevision: run.sourceRevision, verdict: scenario.verdict, impacts: scenario.impacts, finding: { headline: scenario.headline, consequence: scenario.consequence, evidenceIds: evidence.map(e => e.id) }, nextAction: scenario.verdict === 'no_issues_found' ? { kind: 'review_steps', label: scenario.action } : { kind: 'review_evidence', label: scenario.action, evidenceId: evidence.at(-1)!.id }, checkedScope: scenario.scope, limitations, changeSummary: record.scenarioId === 'SC-02' ? 'The sender says membership is optional; the simulated checkout still requires recurring membership.' : c.currentAssessment ? 'Rechecked the same controlled fixture. No terms changed.' : null, supersedesAssessmentId: c.currentAssessment?.id ?? null, createdAt: now(), provenance: DEMO_PROVENANCE });
        s.assessments.push(assessment);
        c.currentAssessment = assessment;
        c.reviewStatus = 'unreviewed';
        c.freshness = 'current';
        changed(s, c);
        event(s, 'assessment.published', { assessment, case: structuredClone(c) }, c);
    }
    else {
        changed(s, c);
        event(s, 'investigation.limited', { runId: run.id, status: 'limited', limitations, errorCode: 'INVESTIGATION_LIMITED' }, c);
    }
    return true;
}
export function processDemoJobs(s: DemoState, immediate = false) {
    s.workerHeartbeat = now();
    const jobs = [...s.jobs];
    for (const job of jobs) {
        if (!immediate && job.dueAt > Date.now())
            continue;
        if (job.type === 'triage') {
            const record = s.sources.find(r => r.source.id === job.sourceId);
            if (record)
                triage(s, record);
            s.jobs = s.jobs.filter(j => j.id !== job.id);
            continue;
        }
        const run = s.runs.find(r => r.id === job.runId), c = s.cases.find(c => c.id === run?.caseId);
        if (!run || !c || c.activeRunId !== run.id) {
            s.jobs = s.jobs.filter(j => j.id !== job.id);
            continue;
        }
        if (job.stage === 0) {
            run.status = 'checking';
            run.startedAt = now();
            c.latestRunStatus = 'checking';
            changed(s, c);
            event(s, 'investigation.started', { runId: run.id, status: 'checking' }, c);
        }
        else if (job.stage === 1)
            captureDemo(s, c, run);
        else {
            publishDemo(s, c, run, job.generation);
            s.jobs = s.jobs.filter(j => j.id !== job.id);
            continue;
        }
        job.stage++;
        job.dueAt = Date.now() + 1200;
    }
}
export function recheckDemo(s: DemoState, caseId: string, reason: 'user_recheck' | 'verification_requested', note?: string): AcceptedRun {
    const c = getCase(s, caseId);
    if (note) {
        const id = randomUUID();
        s.evidence.push({ id, caseId, runId: null, sourceEventId: null, stepId: null, kind: 'user_statement', observedAt: now(), sourceLabel: 'Your verification note · Demo data', displayUrl: null, excerpt: note, artifactId: null, contentHash: hash(note), provenance: DEMO_PROVENANCE });
        c.sourceRevision++;
    }
    if (reason === 'verification_requested' && c.currentAssessment) {
        c.reviewStatus = 'verification_requested';
        s.reviews.push({ caseId, assessmentId: c.currentAssessment.id, status: 'verification_requested', at: now() });
        event(s, 'review.updated', { assessmentId: c.currentAssessment.id, reviewStatus: 'verification_requested' }, c);
    }
    return queueRun(s, c, 'user_recheck');
}
export function getCase(s: DemoState, id: string) { const c = s.cases.find(c => c.id === id); if (!c)
    throw new DomainError('NOT_FOUND', 'Case not found.', 404); return c; }
export function caseDetail(s: DemoState, id: string): CaseDetail { const c = getCase(s, id); const runs = s.runs.filter(r => r.caseId === id); const latest = runs.at(-1) ?? null; return { case: c, sources: s.sources.filter(r => r.caseIds.includes(id)).map(r => r.source), currentAssessment: c.currentAssessment, activeRun: runs.find(r => r.id === c.activeRunId) ?? null, latestRun: latest, journey: s.steps.filter(step => step.runId === latest?.id), evidence: s.evidence.filter(e => e.caseId === id), historyCursor: null }; }
export function viewedDemo(s: DemoState, caseId: string, assessmentId: string) { const c = getCase(s, caseId); if (!s.assessments.find(a => a.id === assessmentId && a.caseId === caseId))
    throw new DomainError('NOT_FOUND', 'Assessment not found.', 404); if (!s.reviews.find(r => r.assessmentId === assessmentId && r.status === 'viewed')) {
    s.reviews.push({ caseId, assessmentId, status: 'viewed', at: now() });
    if (c.currentAssessment?.id === assessmentId && c.reviewStatus === 'unreviewed') {
        c.reviewStatus = 'viewed';
        changed(s, c);
    }
    event(s, 'review.updated', { assessmentId, reviewStatus: 'viewed' }, c);
} return { assessmentId, reviewStatus: c.currentAssessment?.id === assessmentId ? c.reviewStatus : 'viewed' }; }
export function disconnectDemo(s: DemoState, id: string) { const c = s.connections.find(c => c.id === id); if (!c)
    throw new DomainError('NOT_FOUND', 'Connection not found.', 404); c.status = 'disconnected'; let cancelledRunCount = 0; const caseIds = s.sources.filter(r => r.source.connectionId === id).flatMap(r => r.caseIds); s.jobs = s.jobs.filter(job => { const run = s.runs.find(r => r.id === job.runId); const source = s.sources.find(r => r.source.id === job.sourceId); if (source?.source.connectionId === id)
    return false; if (run && caseIds.includes(run.caseId)) {
    run.status = 'cancelled';
    run.finishedAt = now();
    cancelledRunCount++;
    return false;
} return true; }); for (const c of s.cases.filter(c => caseIds.includes(c.id))) {
    if (c.currentAssessment)
        c.freshness = 'stale';
    if (c.activeRunId) {
        const run = s.runs.find(r => r.id === c.activeRunId);
        event(s, 'investigation.cancelled', { runId: c.activeRunId, status: 'cancelled', limitations: [], errorCode: null }, c);
        c.activeRunId = null;
        c.latestRunStatus = run?.status ?? 'cancelled';
    }
    changed(s, c);
} event(s, 'connection.updated', { connection: c }); return { connectionId: c.id, cancelledRunCount, providerRevocation: 'not_required' as const }; }
export function reconnectDemo(s: DemoState, id: string) { const c = s.connections.find(c => c.id === id); if (!c)
    throw new DomainError('NOT_FOUND', 'Connection not found.', 404); c.status = 'connected'; c.lastSyncedAt = now(); event(s, 'connection.updated', { connection: c }); return c; }
export function idempotent<T>(s: DemoState, route: string, key: string | undefined, input: unknown, action: () => T): T { if (!key)
    return action(); if (key.length > 160)
    throw new DomainError('VALIDATION_ERROR', 'Idempotency key is too long.'); const id = `${DEMO_OWNER}:${route}:${key}`, digest = hash(input), prior = s.idempotency[id]; if (prior) {
    if (prior.hash !== digest)
        throw new DomainError('IDEMPOTENCY_CONFLICT', 'This idempotency key was already used for different input.', 409);
    return prior.result as T;
} const result = action(); s.idempotency[id] = { hash: digest, result }; return result; }
export class DemoStore {
    constructor(public file = process.env.DEMO_DATA_PATH ?? process.env.DEMO_STATE_FILE ?? path.resolve(process.cwd(), '../../.data/demo-state.json')) { }
    async transaction<T>(fn: (s: DemoState) => T | Promise<T>): Promise<T> {
        const lock = `${this.file}.lock`;
        await mkdir(path.dirname(this.file), { recursive: true });
        const start = Date.now();
        for (;;) {
            try {
                await mkdir(lock);
                break;
            }
            catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'EEXIST')
                    throw error;
                try {
                    const info = await stat(lock);
                    if (Date.now() - info.mtimeMs > 30000) {
                        await rm(lock, { recursive: true, force: true });
                        continue;
                    }
                }
                catch { }
                if (Date.now() - start > 35000)
                    throw new Error('Demo state lock timed out.');
                await new Promise(resolve => setTimeout(resolve, 25));
            }
        }
        try {
            let s: DemoState;
            try {
                s = JSON.parse(await readFile(this.file, 'utf8')) as DemoState;
                if (s.version !== 1)
                    throw new Error('Unsupported demo data version.');
            }
            catch (e) {
                if ((e as NodeJS.ErrnoException).code !== 'ENOENT')
                    throw e;
                s = createDemoState();
            }
            const result = await fn(s);
            const temp = `${this.file}.${process.pid}.${randomUUID()}.tmp`;
            await writeFile(temp, JSON.stringify(s), { mode: 0o600 });
            await rename(temp, this.file);
            return result;
        }
        finally {
            await rm(lock, { recursive: true, force: true });
        }
    }
    async read(): Promise<DemoState> { return this.transaction(s => structuredClone(s)); }
    async reset() { return this.transaction(s => { const fresh = createDemoState(); Object.assign(s, fresh); return { reset: true, mode: 'demo' }; }); }
}
