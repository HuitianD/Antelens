import { randomUUID, createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { Pool, type PoolClient } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';
import {
  ActivityEventSchema, AssessmentSchema, CaseSummarySchema, ConnectionSummarySchema, EvidenceSchema, InvestigationRunSchema, JourneyStepSchema, SourceEventSchema,
  PageCaptureInputSchema, StoredPageCaptureSchema, CAPTURE_LABEL,CAPTURE_PROMPT_VERSION,CAPTURE_TOOL_VERSION,
  assertAssessmentProposal, assertTriageProposal, assertRunTransition, dashboardCounts,
  type AcceptedRun, type ActivityEvent, type AppMode, type Assessment, type AssessmentProposal, type CaseDetail, type CaseFilters, type CaseSummary, type ConnectionSummary,
  type DashboardSnapshot, type Evidence, type InvestigationRun, type JourneyStep, type MessageDetail, type MessageFilters, type MessageSummary, type Page, type RecheckInput, type SourceEvent, type TriageProposal, type ApiError,
  type PageCaptureInput, type StoredPageCapture, type AcceptedPageCapture,
} from '@beforeyou/contracts';

export class RepositoryError extends Error {
  constructor(readonly code: 'NOT_FOUND' | 'STALE_REVISION' | 'IDEMPOTENCY_CONFLICT' | 'CONNECTION_REQUIRED' | 'VALIDATION_ERROR', message: string) { super(message); this.name = 'RepositoryError'; }
}
export interface RunConfiguration { modelId: string; promptVersion: string; policyVersion: string; toolVersion: string; execution: 'live' | 'simulated' }
export interface Lease { run: InvestigationRun; generation: number; expiresAt: string }
type DbCase = { dto: CaseSummary; current_assessment_id: string | null; active_run_id: string | null; source_revision: number };
type DbRun = { dto: InvestigationRun; lease_generation: number; lease_expires_at: Date | null };
type EventInput = ActivityEvent extends infer E ? E extends ActivityEvent ? Omit<E, 'id' | 'schemaVersion' | 'occurredAt'> : never : never;
const now = () => new Date().toISOString();
const notFound = () => new RepositoryError('NOT_FOUND', 'This record is unavailable.');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

function presentConnection(row: { dto: unknown; sync_config?: unknown }): ConnectionSummary {
  const connection = ConnectionSummarySchema.parse(row.dto);
  if (row.sync_config && typeof row.sync_config === 'object' && (row.sync_config as { synthetic?: boolean }).synthetic) {
    return { ...connection, status: 'not_connected', accountLabel: connection.accountLabel.includes('Synthetic') ? connection.accountLabel : 'Synthetic fixture mailbox (development only)' };
  }
  return connection;
}

function encodeCursor(date: string, id: string): string { return Buffer.from(JSON.stringify([date, id])).toString('base64url'); }
function decodeCursor(cursor?: string): [string, string] | null {
  if (!cursor) return null;
  try {
    const data: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    if (!Array.isArray(data) || data.length !== 2 || typeof data[0] !== 'string' || typeof data[1] !== 'string' || !Number.isFinite(Date.parse(data[0])) || !/^[0-9a-f-]{36}$/.test(data[1])) throw new Error();
    return [data[0], data[1]];
  } catch { throw new RepositoryError('VALIDATION_ERROR', 'The page cursor is invalid.'); }
}
function eventRow(row: { id: string; type: string; created_at: Date; case_id: string | null; source_revision: number | null; payload: unknown }): ActivityEvent {
  return ActivityEventSchema.parse({ id: String(row.id), schemaVersion: '1', type: row.type, occurredAt: row.created_at.toISOString(), caseId: row.case_id, sourceRevision: row.source_revision, data: row.payload });
}

export class PostgresRepository {
  readonly pool: Pool;
  readonly db: ReturnType<typeof drizzle<typeof schema>>;
  constructor(connection: string | Pool) {
    this.pool = typeof connection === 'string' ? new Pool({ connectionString: connection, max: 10, connectionTimeoutMillis: 10000, statement_timeout: 15000 }) : connection;
    this.db = drizzle(this.pool, { schema });
  }
  async close() { await this.pool.end(); }

  /** Serialize each owner's writes so durable cursors reflect commit order, not sequence allocation order. */
  async transaction<T>(ownerId: string, callback: (client: PoolClient) => Promise<T>, readOnly = false): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
      if (!readOnly) await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [ownerId]);
      await client.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [ownerId]);
      const result = await callback(client); await client.query('COMMIT'); return result;
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }

  async emit(client: PoolClient, ownerId: string, input: EventInput): Promise<ActivityEvent> {
    ActivityEventSchema.parse({ ...input, id: 'pending', schemaVersion: '1', occurredAt: now() });
    const result = await client.query('INSERT INTO activity_events(owner_id,type,case_id,source_revision,payload) VALUES($1,$2,$3,$4,$5) RETURNING *', [ownerId, input.type, input.caseId, input.sourceRevision, input.data]);
    const event = eventRow(result.rows[0]);
    await this.outbox(client, ownerId, 'event', event.id, event);
    return event;
  }
  async outbox(client: PoolClient, ownerId: string, topic: string, dedupeKey: string, payload: unknown) {
    await client.query('INSERT INTO outbox_events(id,owner_id,topic,dedupe_key,payload) VALUES($1,$2,$3,$4,$5) ON CONFLICT(owner_id,topic,dedupe_key) DO NOTHING', [randomUUID(), ownerId, topic, dedupeKey, payload]);
  }
  private async saveCase(client: PoolClient, ownerId: string, item: CaseSummary) {
    CaseSummarySchema.parse(item);
    const result = await client.query('UPDATE cases SET source_revision=$3,record_version=$4,current_assessment_id=$5,active_run_id=$6,dto=$7,updated_at=$8 WHERE owner_id=$1 AND id=$2', [ownerId, item.id, item.sourceRevision, item.recordVersion, item.currentAssessment?.id ?? null, item.activeRunId, item, item.updatedAt]);
    if (!result.rowCount) throw notFound();
  }
  private async lockedCase(client: PoolClient, ownerId: string, caseId: string): Promise<CaseSummary> {
    const result = await client.query<DbCase>('SELECT * FROM cases WHERE owner_id=$1 AND id=$2 FOR UPDATE', [ownerId, caseId]);
    if (!result.rows[0]) throw notFound(); return CaseSummarySchema.parse(result.rows[0].dto);
  }
  private async saveRun(client: PoolClient, ownerId: string, run: InvestigationRun) {
    InvestigationRunSchema.parse(run);
    await client.query('UPDATE investigation_runs SET status=$3,dto=$4 WHERE owner_id=$1 AND id=$2', [ownerId, run.id, run.status, run]);
  }
  private async newRun(client: PoolClient, ownerId: string, item: CaseSummary, trigger: InvestigationRun['trigger'], config: RunConfiguration, origin: SourceEvent['dataOrigin'], pageCaptureId?:string): Promise<InvestigationRun> {
    const run = InvestigationRunSchema.parse({ id: randomUUID(), caseId: item.id, sourceRevision: item.sourceRevision, trigger, status: 'queued', attempt: 0, startedAt: null, finishedAt: null, modelId: config.modelId, promptVersion: pageCaptureId?CAPTURE_PROMPT_VERSION:config.promptVersion, policyVersion: config.policyVersion, toolVersion: pageCaptureId?CAPTURE_TOOL_VERSION:config.toolVersion, provenance: { dataOrigin: origin, execution: config.execution }, limitations: [], error: null, ...(pageCaptureId?{pageCaptureId}:{}) });
    await client.query('INSERT INTO investigation_runs(id,owner_id,case_id,source_revision,status,dto) VALUES($1,$2,$3,$4,$5,$6)', [run.id, ownerId, item.id, run.sourceRevision, run.status, run]);
    item.activeRunId = run.id; item.latestRunStatus = 'queued'; item.freshness = item.currentAssessment ? 'stale' : 'current';
    await this.outbox(client, ownerId, 'investigate', run.id, { ownerId, caseId: item.id, runId: run.id });
    return run;
  }

  async snapshot(ownerId: string, mode: AppMode = 'live'): Promise<{ data: DashboardSnapshot; eventCursor: string }> {
    return this.transaction(ownerId, async (client) => {
      const rows = await client.query<{ dto: CaseSummary }>('SELECT dto FROM cases WHERE owner_id=$1 ORDER BY updated_at DESC,id DESC', [ownerId]);
      const all = rows.rows.map((row) => CaseSummarySchema.parse(row.dto));
      const events = await client.query('SELECT * FROM activity_events WHERE owner_id=$1 ORDER BY id DESC LIMIT 25', [ownerId]);
      const cursor = await client.query('SELECT COALESCE(max(id),0)::text AS cursor FROM activity_events WHERE owner_id=$1', [ownerId]);
      const first = all.slice(0, 25); const last = first.at(-1);
      const connectionRows = await client.query('SELECT dto,sync_config FROM connections WHERE owner_id=$1 ORDER BY created_at,id', [ownerId]);
      return { data: { mode, counts: dashboardCounts(all), cases: { items: first, nextCursor: all.length > 25 && last ? encodeCursor(last.updatedAt, last.id) : null }, activity: events.rows.map(eventRow), connections: connectionRows.rows.map(presentConnection) }, eventCursor: cursor.rows[0].cursor as string };
    }, true);
  }
  async listCases(ownerId: string, filters: Partial<CaseFilters> = {}): Promise<Page<CaseSummary>> {
    const values: unknown[] = [ownerId]; const where = ['owner_id=$1'];
    const add = (sql: string, value: unknown) => { values.push(value); where.push(sql.replace('?', `$${values.length}`)); };
    if (filters.verdict) { add("dto->'currentAssessment'->>'verdict'=?", filters.verdict); if (!filters.freshness) where.push("dto->>'freshness'='current'"); }
    if (filters.impact) add("dto->'currentAssessment'->'impacts' @> ?::jsonb", JSON.stringify([filters.impact]));
    if (filters.reviewStatus) add("dto->>'reviewStatus'=?", filters.reviewStatus);
    if (filters.freshness) add("dto->>'freshness'=?", filters.freshness);
    if (filters.q) { values.push(`%${filters.q.replace(/[\\%_]/g, '\\$&')}%`); const parameter = `$${values.length}`; where.push(`(dto->>'title' ILIKE ${parameter} OR dto->'currentAssessment'->'finding'->>'headline' ILIKE ${parameter} OR EXISTS(SELECT 1 FROM case_sources cs JOIN source_events se ON se.id=cs.source_event_id AND se.owner_id=cs.owner_id WHERE cs.owner_id=cases.owner_id AND cs.case_id=cases.id AND (se.dto->>'senderLabel' ILIKE ${parameter} OR se.dto->>'title' ILIKE ${parameter})))`); }
    const cursor = decodeCursor(filters.cursor); if (cursor) { values.push(cursor[0], cursor[1]); where.push(`(updated_at,id)<($${values.length - 1}::timestamptz,$${values.length}::uuid)`); }
    const limit = Math.min(100, Math.max(1, filters.limit ?? 25)); values.push(limit + 1);
    const result = await this.pool.query(`SELECT dto FROM cases WHERE ${where.join(' AND ')} ORDER BY updated_at DESC,id DESC LIMIT $${values.length}`, values);
    const items = result.rows.slice(0, limit).map((row) => CaseSummarySchema.parse(row.dto)); const last = items.at(-1);
    return { items, nextCursor: result.rows.length > limit && last ? encodeCursor(last.updatedAt, last.id) : null };
  }
  async caseDetail(ownerId: string, caseId: string): Promise<CaseDetail> {
    return this.transaction(ownerId, async (client) => {
      const record = await client.query('SELECT dto FROM cases WHERE owner_id=$1 AND id=$2', [ownerId, caseId]); if (!record.rows[0]) throw notFound();
      const item = CaseSummarySchema.parse(record.rows[0].dto);
      const sources = await client.query('SELECT se.dto,se.original_url,se.links FROM source_events se JOIN case_sources cs ON cs.source_event_id=se.id AND cs.owner_id=se.owner_id WHERE cs.owner_id=$1 AND cs.case_id=$2 ORDER BY se.created_at,se.id', [ownerId, caseId]);
      const runs = await client.query('SELECT dto FROM investigation_runs WHERE owner_id=$1 AND case_id=$2 ORDER BY created_at DESC,id DESC', [ownerId, caseId]);
      const parsedRuns = runs.rows.map((row) => InvestigationRunSchema.parse(row.dto)); const activeRun = parsedRuns.find((run) => run.id === item.activeRunId) ?? null;
      const latestRun = activeRun ?? parsedRuns[0] ?? null;
      const runId = activeRun?.id ?? item.currentAssessment?.runId ?? latestRun?.id;
      const steps = runId ? await client.query('SELECT dto FROM investigation_steps WHERE owner_id=$1 AND run_id=$2 ORDER BY step_index', [ownerId, runId]) : { rows: [] };
      const evidence = await client.query('SELECT dto FROM evidence WHERE owner_id=$1 AND case_id=$2 ORDER BY created_at,id', [ownerId, caseId]);
      return { case: item, sources: sources.rows.map((row) => SourceEventSchema.parse(row.dto)), sourceReferences: sources.rows.map(row => ({ sourceEventId: row.dto.id, originalUrl: row.original_url, links: row.links })), currentAssessment: item.currentAssessment, activeRun, latestRun, journey: steps.rows.map((row) => JourneyStepSchema.parse(row.dto)), evidence: evidence.rows.map((row) => EvidenceSchema.parse(row.dto)), historyCursor: null };
    }, true);
  }
  async history(ownerId: string, caseId: string, cursor?: string, limit = 25): Promise<Page<Assessment>> {
    const exists = await this.pool.query('SELECT id FROM cases WHERE owner_id=$1 AND id=$2', [ownerId, caseId]); if (!exists.rows[0]) throw notFound();
    const version = cursor ? Number(cursor) : 2147483647; if (!Number.isSafeInteger(version) || version < 1) throw new RepositoryError('VALIDATION_ERROR', 'Invalid history cursor.');
    const result = await this.pool.query('SELECT dto FROM assessments WHERE owner_id=$1 AND case_id=$2 AND version<$3 ORDER BY version DESC LIMIT $4', [ownerId, caseId, version, Math.min(limit, 100) + 1]);
    const items = result.rows.slice(0, limit).map((row) => AssessmentSchema.parse(row.dto));
    return { items, nextCursor: result.rows.length > limit ? String(items.at(-1)?.version) : null };
  }
  async listMessages(ownerId: string, filters: Partial<MessageFilters> = {}): Promise<Page<MessageSummary>> {
    const values: unknown[] = [ownerId]; const where = ['se.owner_id=$1'];
    for (const [column, value] of [['disposition', filters.disposition], ['kind', filters.source]] as const) if (value) { values.push(value); where.push(`se.${column}=$${values.length}`); }
    if (filters.q) { values.push(`%${filters.q.replace(/[\\%_]/g, '\\$&')}%`); where.push(`(se.dto->>'title' ILIKE $${values.length} OR se.dto->>'previewText' ILIKE $${values.length} OR se.dto->>'senderLabel' ILIKE $${values.length})`); }
    const cursor = decodeCursor(filters.cursor); if (cursor) { values.push(cursor[0], cursor[1]); where.push(`(se.created_at,se.id)<($${values.length - 1}::timestamptz,$${values.length}::uuid)`); }
    const limit = Math.min(100, Math.max(1, filters.limit ?? 25)); values.push(limit + 1);
    const result = await this.pool.query(`SELECT se.dto,se.created_at,COALESCE((SELECT jsonb_agg(cs.case_id) FROM case_sources cs WHERE cs.owner_id=se.owner_id AND cs.source_event_id=se.id),'[]') AS case_ids FROM source_events se WHERE ${where.join(' AND ')} ORDER BY se.created_at DESC,se.id DESC LIMIT $${values.length}`, values);
    const rows = result.rows.slice(0, limit); const items = rows.map((row) => ({ ...SourceEventSchema.parse(row.dto), caseIds: row.case_ids as string[] })); const last = rows.at(-1);
    return { items, nextCursor: result.rows.length > limit && last ? encodeCursor(last.created_at.toISOString(), last.dto.id) : null };
  }
  async messageDetail(ownerId: string, id: string): Promise<MessageDetail> {
    const result = await this.pool.query('SELECT se.*,COALESCE((SELECT jsonb_agg(cs.case_id) FROM case_sources cs WHERE cs.owner_id=se.owner_id AND cs.source_event_id=se.id),\'[]\') AS case_ids FROM source_events se WHERE se.owner_id=$1 AND se.id=$2', [ownerId, id]);
    const row = result.rows[0]; if (!row) throw notFound();
    return { source: SourceEventSchema.parse(row.dto), content: row.content, originalUrl: row.original_url, caseIds: row.case_ids };
  }
  async connections(ownerId: string): Promise<ConnectionSummary[]> { const result = await this.pool.query('SELECT dto,sync_config FROM connections WHERE owner_id=$1 ORDER BY created_at,id', [ownerId]); return result.rows.map(presentConnection); }
  async evidence(ownerId: string, id: string): Promise<Evidence> { const result = await this.pool.query('SELECT dto FROM evidence WHERE owner_id=$1 AND id=$2', [ownerId, id]); if (!result.rows[0]) throw notFound(); return EvidenceSchema.parse(result.rows[0].dto); }
  async run(ownerId: string, id: string) {
    const result = await this.pool.query('SELECT dto FROM investigation_runs WHERE owner_id=$1 AND id=$2', [ownerId, id]); if (!result.rows[0]) throw notFound();
    const steps = await this.pool.query('SELECT dto FROM investigation_steps WHERE owner_id=$1 AND run_id=$2 ORDER BY step_index', [ownerId, id]);
    return { run: InvestigationRunSchema.parse(result.rows[0].dto), steps: steps.rows.map((row) => JourneyStepSchema.parse(row.dto)) };
  }
  async activity(ownerId: string, cursor?: string, limit = 25): Promise<Page<ActivityEvent>> {
    if (cursor && !/^\d+$/.test(cursor)) throw new RepositoryError('VALIDATION_ERROR', 'Invalid event cursor.');
    const result = await this.pool.query('SELECT * FROM activity_events WHERE owner_id=$1 AND id<$2::bigint ORDER BY id DESC LIMIT $3', [ownerId, cursor ?? '9223372036854775807', Math.min(limit, 100) + 1]);
    const items = result.rows.slice(0, limit).map(eventRow); return { items, nextCursor: result.rows.length > limit ? items.at(-1)?.id ?? null : null };
  }
  async eventsSince(ownerId: string, cursor = '0', limit = 100): Promise<ActivityEvent[]> {
    if (!/^\d+$/.test(cursor)) throw new RepositoryError('VALIDATION_ERROR', 'Invalid event cursor.');
    const result = await this.pool.query('SELECT * FROM activity_events WHERE owner_id=$1 AND id>$2::bigint ORDER BY id LIMIT $3', [ownerId, cursor, Math.min(limit, 500)]); return result.rows.map(eventRow);
  }

  async ingestSource(ownerId: string, input: SourceEvent, content: string, links: string[] = [], originalUrl: string | null = null, idempotency?: { route: string; key?: string; requestHash?: string }): Promise<{ source: SourceEvent; reused: boolean }> {
    const source = SourceEventSchema.parse({ ...input, disposition: 'pending', processingStatus: 'queued', lastErrorCode: null });
    if (content.length > 100000 || links.length > 100) throw new RepositoryError('VALIDATION_ERROR', 'Source exceeds the supported size.');
    return this.transaction(ownerId, async (client) => {
      const requestHash = idempotency?.requestHash ?? hash(JSON.stringify({ connectionId: source.connectionId, externalId: source.externalId, content, links, originalUrl }));
      if (idempotency?.key) {
        const previous = await client.query('SELECT request_hash,result FROM idempotency_records WHERE owner_id=$1 AND route=$2 AND key=$3', [ownerId, idempotency.route, idempotency.key]);
        if (previous.rows[0]) {
          if (previous.rows[0].request_hash !== requestHash) throw new RepositoryError('IDEMPOTENCY_CONFLICT', 'This request key was already used with different input.');
          return { source: SourceEventSchema.parse(previous.rows[0].result.source), reused: Boolean(previous.rows[0].result.reused) };
        }
      }
      const remember = async (result: { source: SourceEvent; reused: boolean }) => {
        if (idempotency?.key) await client.query('INSERT INTO idempotency_records(owner_id,route,key,request_hash,result) VALUES($1,$2,$3,$4,$5)', [ownerId, idempotency.route, idempotency.key, requestHash, result]);
        return result;
      };
      const connection = await client.query('SELECT kind,status FROM connections WHERE owner_id=$1 AND id=$2 FOR UPDATE', [ownerId, source.connectionId]);
      if (!connection.rows[0] || connection.rows[0].status !== 'connected' || connection.rows[0].kind !== source.kind) throw new RepositoryError('CONNECTION_REQUIRED', 'Reconnect this source before importing requests.');
      const existing = await client.query('SELECT dto FROM source_events WHERE owner_id=$1 AND connection_id=$2 AND external_id=$3', [ownerId, source.connectionId, source.externalId]);
      if (existing.rows[0]) return remember({ source: SourceEventSchema.parse(existing.rows[0].dto), reused: true });
      await client.query('INSERT INTO source_events(id,owner_id,connection_id,external_id,external_thread_id,kind,disposition,processing_status,dto,content,links,original_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [source.id, ownerId, source.connectionId, source.externalId, source.externalThreadId, source.kind, source.disposition, source.processingStatus, source, content, JSON.stringify(links), originalUrl]);
      await this.outbox(client, ownerId, 'triage', source.id, { ownerId, sourceEventId: source.id });
      await this.emit(client, ownerId, { type: 'source.received', caseId: null, sourceRevision: null, data: { sourceEventId: source.id, kind: source.kind, disposition: source.disposition, processingStatus: source.processingStatus, lastErrorCode: null, caseIds: [] } });
      return remember({ source, reused: false });
    });
  }

  async candidateCases(ownerId: string, sourceId: string): Promise<CaseSummary[]> {
    // Exact browser destinations retain identity-bearing query parameters. A shared domain is insufficient.
    const result = await this.pool.query("SELECT DISTINCT c.dto FROM source_events incoming JOIN source_events prior ON prior.owner_id=incoming.owner_id AND prior.connection_id=incoming.connection_id AND ((incoming.kind='gmail' AND incoming.external_thread_id IS NOT NULL AND prior.external_thread_id=incoming.external_thread_id) OR (incoming.kind='browser' AND incoming.original_url IS NOT NULL AND prior.original_url=incoming.original_url)) JOIN case_sources cs ON cs.owner_id=prior.owner_id AND cs.source_event_id=prior.id JOIN cases c ON c.owner_id=cs.owner_id AND c.id=cs.case_id WHERE incoming.owner_id=$1 AND incoming.id=$2", [ownerId, sourceId]);
    return result.rows.map((row) => CaseSummarySchema.parse(row.dto));
  }
  /** Captures create browser cases by default. Only explicit owner-scoped IDs can reuse/link an existing case. */
  async ingestCapturedPage(ownerId:string,input:PageCaptureInput,config:RunConfiguration,dataOrigin:SourceEvent['dataOrigin']='synthetic'):Promise<AcceptedPageCapture> {
    const parsed=PageCaptureInputSchema.parse(input);
    const requestHash=hash(JSON.stringify(parsed));
    const route='browser-capture';
    return this.transaction(ownerId,async client=>{
      const key=`${parsed.installationId}:${parsed.clientCaptureId}`;
      const previous=await client.query('SELECT request_hash,result FROM idempotency_records WHERE owner_id=$1 AND route=$2 AND key=$3',[ownerId,route,key]);
      if(previous.rows[0]){if(previous.rows[0].request_hash!==requestHash)throw new RepositoryError('IDEMPOTENCY_CONFLICT','This capture ID was already used with different content or a different case.');return {...previous.rows[0].result,reused:true} as AcceptedPageCapture;}
      const installation=await client.query("SELECT c.id,c.dto FROM browser_installations i JOIN connections c ON c.id=i.connection_id AND c.owner_id=i.owner_id WHERE i.owner_id=$1 AND i.id=$2 AND c.status='connected' FOR UPDATE OF c",[ownerId,parsed.installationId]);
      const browserConnection=installation.rows[0];
      if(!browserConnection)throw new RepositoryError('CONNECTION_REQUIRED','Register or reconnect this browser installation.');
      if(!ConnectionSummarySchema.parse(browserConnection.dto).grantedScopes.includes(new URL(parsed.bundle.pageUrl).origin))throw new RepositoryError('CONNECTION_REQUIRED','Grant this site in the extension before capturing its content.');
      const created=parsed.caseId===undefined;
      const item=parsed.caseId?await this.lockedCase(client,ownerId,parsed.caseId):CaseSummarySchema.parse({id:randomUUID(),recordVersion:1,title:`${parsed.bundle.title||'Page check'} · ${parsed.bundle.pageUrl}`.slice(0,1000),sourceKinds:['browser'],sourceRevision:1,currentAssessment:null,activeRunId:null,latestRunStatus:null,freshness:'current',reviewStatus:'unreviewed',updatedAt:now()});
      if(created)await client.query('INSERT INTO cases(id,owner_id,source_revision,record_version,dto) VALUES($1,$2,$3,$4,$5)',[item.id,ownerId,item.sourceRevision,item.recordVersion,item]);
      const email=await client.query("SELECT se.dto FROM source_events se JOIN case_sources cs ON cs.source_event_id=se.id AND cs.owner_id=se.owner_id WHERE cs.owner_id=$1 AND cs.case_id=$2 AND se.kind='gmail' LIMIT 1",[ownerId,item.id]);
      if(!created&&!email.rows[0]){
        const pages=await client.query("SELECT se.original_url FROM source_events se JOIN case_sources cs ON cs.source_event_id=se.id AND cs.owner_id=se.owner_id WHERE cs.owner_id=$1 AND cs.case_id=$2 AND se.kind='browser'",[ownerId,item.id]);
        if(!pages.rows.length||pages.rows.some(page=>page.original_url!==parsed.bundle.pageUrl))throw new RepositoryError('VALIDATION_ERROR','This browser case belongs to a different page. Start a standalone check for this page.');
      }
      const captureId=randomUUID(),sourceId=randomUUID(),receivedAt=now();
      const capture=StoredPageCaptureSchema.parse({id:captureId,caseId:item.id,sourceEventId:sourceId,installationId:parsed.installationId,bundle:parsed.bundle,bundleHash:hash(JSON.stringify(parsed.bundle)),receivedAt,dataOrigin});
      const source=SourceEventSchema.parse({id:sourceId,connectionId:browserConnection.id,kind:'browser',externalId:parsed.clientCaptureId,externalThreadId:null,receivedAt,occurredAt:parsed.bundle.capturedAt,title:parsed.bundle.title||'Captured page',senderLabel:null,previewText:parsed.bundle.visibleText,contentRef:`capture:${captureId}`,disposition:'action_required',processingStatus:'complete',lastErrorCode:null,dataOrigin});
      await client.query('INSERT INTO source_events(id,owner_id,connection_id,external_id,external_thread_id,kind,disposition,processing_status,dto,content,links,original_url) VALUES($1,$2,$3,$4,NULL,$5,$6,$7,$8,$9,$10,$11)',[source.id,ownerId,source.connectionId,source.externalId,'browser',source.disposition,source.processingStatus,source,`Captured visible page content (untrusted, not email):\n${parsed.bundle.visibleText}`,JSON.stringify([parsed.bundle.pageUrl]),parsed.bundle.pageUrl]);
      await client.query('INSERT INTO page_captures(id,owner_id,case_id,source_event_id,installation_id,client_capture_id,bundle_hash,dto) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[captureId,ownerId,item.id,source.id,parsed.installationId,parsed.clientCaptureId,capture.bundleHash,capture]);
      await client.query('INSERT INTO case_sources(owner_id,case_id,source_event_id) VALUES($1,$2,$3)',[ownerId,item.id,source.id]);
      await this.cancelActive(client,ownerId,item);
      if(!created){item.sourceRevision++;item.recordVersion++;}item.updatedAt=receivedAt;if(!item.sourceKinds.includes('browser'))item.sourceKinds.push('browser');
      const run=await this.newRun(client,ownerId,item,created?'new_source':'new_evidence',config,email.rows[0]&&SourceEventSchema.parse(email.rows[0].dto).dataOrigin==='user'?'user':dataOrigin,captureId);
      await this.saveCase(client,ownerId,item);
      for(const type of ['source.received','source.updated'] as const)await this.emit(client,ownerId,{type,caseId:item.id,sourceRevision:item.sourceRevision,data:{sourceEventId:source.id,kind:'browser',disposition:source.disposition,processingStatus:source.processingStatus,lastErrorCode:null,caseIds:[item.id]}});
      await this.emit(client,ownerId,{type:created?'case.created':'case.updated',caseId:item.id,sourceRevision:item.sourceRevision,data:{case:item}});
      await this.emit(client,ownerId,{type:'investigation.queued',caseId:item.id,sourceRevision:item.sourceRevision,data:{runId:run.id,status:'queued'}});
      const accepted:AcceptedPageCapture={captureId,sourceEventId:source.id,caseId:item.id,runId:run.id,reused:false,label:CAPTURE_LABEL};
      await client.query('INSERT INTO idempotency_records(owner_id,route,key,request_hash,result) VALUES($1,$2,$3,$4,$5)',[ownerId,route,key,requestHash,accepted]);
      return accepted;
    });
  }
  async pageCapture(ownerId:string,captureId:string):Promise<StoredPageCapture>{const r=await this.pool.query('SELECT dto FROM page_captures WHERE owner_id=$1 AND id=$2',[ownerId,captureId]);if(!r.rows[0])throw notFound();return StoredPageCaptureSchema.parse(r.rows[0].dto);}
  async acceptTriage(ownerId: string, sourceId: string, proposalInput: TriageProposal, config: RunConfiguration): Promise<{ source: SourceEvent; caseId: string | null; runId: string | null }> {
    const candidates = await this.candidateCases(ownerId, sourceId);
    return this.transaction(ownerId, async (client) => {
      const result = await client.query('SELECT dto,links FROM source_events WHERE owner_id=$1 AND id=$2 FOR UPDATE', [ownerId, sourceId]); if (!result.rows[0]) throw notFound();
      const source = SourceEventSchema.parse(result.rows[0].dto);
      if (source.processingStatus === 'complete') {
        const linked = await client.query('SELECT c.id,c.active_run_id FROM cases c JOIN case_sources cs ON cs.owner_id=c.owner_id AND cs.case_id=c.id WHERE cs.owner_id=$1 AND cs.source_event_id=$2 LIMIT 1', [ownerId, sourceId]);
        return { source, caseId: linked.rows[0]?.id ?? null, runId: linked.rows[0]?.active_run_id ?? null };
      }
      const proposal = assertTriageProposal(proposalInput, { candidateCaseIds: candidates.map((item) => item.id), linkCount: result.rows[0].links.length });
      source.disposition = proposal.outcome === 'no_action' ? 'no_action' : 'action_required'; source.processingStatus = 'complete'; source.lastErrorCode = null;
      let item: CaseSummary | null = null; let run: InvestigationRun | null = null;
      if (proposal.outcome !== 'no_action') {
        if (proposal.candidateCaseId) {
          item = await this.lockedCase(client, ownerId, proposal.candidateCaseId);
          await this.cancelActive(client, ownerId, item);
          item.sourceRevision += 1; item.recordVersion += 1; item.updatedAt = now();
          if (!item.sourceKinds.includes(source.kind)) item.sourceKinds.push(source.kind);
        } else {
          item = CaseSummarySchema.parse({ id: randomUUID(), recordVersion: 1, title: proposal.requestSummary ?? source.title, sourceKinds: [source.kind], sourceRevision: 1, currentAssessment: null, activeRunId: null, latestRunStatus: null, freshness: 'current', reviewStatus: 'unreviewed', updatedAt: now() });
          await client.query('INSERT INTO cases(id,owner_id,source_revision,record_version,dto) VALUES($1,$2,$3,$4,$5)', [item.id, ownerId, item.sourceRevision, item.recordVersion, item]);
        }
        await client.query('INSERT INTO case_sources(owner_id,case_id,source_event_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [ownerId, item.id, source.id]);
        run = await this.newRun(client, ownerId, item, proposal.outcome === 'case_update' ? 'new_evidence' : 'new_source', config, source.dataOrigin);
        await this.saveCase(client, ownerId, item);
        await this.emit(client, ownerId, { type: proposal.outcome === 'case_update' ? 'case.updated' : 'case.created', caseId: item.id, sourceRevision: item.sourceRevision, data: { case: item } });
        await this.emit(client, ownerId, { type: 'investigation.queued', caseId: item.id, sourceRevision: item.sourceRevision, data: { runId: run.id, status: 'queued' } });
      }
      // Completed triage narrows the server-owned run context; unrelated source links cannot be browsed.
      const selectedLinks = [...proposal.relevantLinkIndexes].sort((left, right) => left - right).map((index) => result.rows[0].links[index] as string);
      await client.query('UPDATE source_events SET disposition=$3,processing_status=$4,dto=$5,links=$6 WHERE owner_id=$1 AND id=$2', [ownerId, source.id, source.disposition, source.processingStatus, source, JSON.stringify(selectedLinks)]);
      await this.emit(client, ownerId, { type: 'source.updated', caseId: item?.id ?? null, sourceRevision: item?.sourceRevision ?? null, data: { sourceEventId: source.id, kind: source.kind, disposition: source.disposition, processingStatus: source.processingStatus, lastErrorCode: null, caseIds: item ? [item.id] : [] } });
      return { source, caseId: item?.id ?? null, runId: run?.id ?? null };
    });
  }
  private async cancelActive(client: PoolClient, ownerId: string, item: CaseSummary) {
    if (!item.activeRunId) return;
    const active = await client.query('SELECT dto FROM investigation_runs WHERE owner_id=$1 AND id=$2 FOR UPDATE', [ownerId, item.activeRunId]);
    if (active.rows[0]) {
      const old = InvestigationRunSchema.parse(active.rows[0].dto);
      if (old.status === 'queued' || old.status === 'checking') {
        old.status = 'cancelled'; old.finishedAt = now(); await this.saveRun(client, ownerId, old);
        await client.query('UPDATE investigation_runs SET lease_generation=lease_generation+1,lease_expires_at=NULL WHERE owner_id=$1 AND id=$2', [ownerId, old.id]);
        await this.emit(client, ownerId, { type: 'investigation.cancelled', caseId: item.id, sourceRevision: old.sourceRevision, data: { runId: old.id, status: 'cancelled', limitations: old.limitations, errorCode: null } });
      }
    }
    item.activeRunId = null;
  }

  async viewed(ownerId: string, caseId: string, assessmentId: string): Promise<{ reviewStatus: 'viewed' | 'verification_requested' }> {
    return this.transaction(ownerId, async (client) => {
      const item = await this.lockedCase(client, ownerId, caseId);
      const assessment = await client.query('SELECT id FROM assessments WHERE owner_id=$1 AND case_id=$2 AND id=$3', [ownerId, caseId, assessmentId]); if (!assessment.rows[0]) throw notFound();
      const insert = await client.query("INSERT INTO review_events(id,owner_id,case_id,assessment_id,status) VALUES($1,$2,$3,$4,'viewed') ON CONFLICT(owner_id,assessment_id,status) DO NOTHING RETURNING id", [randomUUID(), ownerId, caseId, assessmentId]);
      const verified = await client.query("SELECT id FROM review_events WHERE owner_id=$1 AND assessment_id=$2 AND status='verification_requested'", [ownerId, assessmentId]);
      const reviewStatus = verified.rows.length ? 'verification_requested' : 'viewed';
      if (insert.rowCount) {
        if (item.currentAssessment?.id === assessmentId) { item.reviewStatus = reviewStatus; item.recordVersion += 1; item.updatedAt = now(); await this.saveCase(client, ownerId, item); }
        await this.emit(client, ownerId, { type: 'review.updated', caseId, sourceRevision: item.sourceRevision, data: { assessmentId, reviewStatus } });
        if (item.currentAssessment?.id === assessmentId) await this.emit(client, ownerId, { type: 'case.updated', caseId, sourceRevision: item.sourceRevision, data: { case: item } });
      }
      return { reviewStatus };
    });
  }

  async recheck(ownerId: string, caseId: string, input: RecheckInput, config: RunConfiguration, idempotency?: { key?: string; requestHash?: string }): Promise<AcceptedRun> {
    return this.transaction(ownerId, async (client) => {
      const route = `/v1/cases/${caseId}/rechecks`;
      const requestHash = idempotency?.requestHash ?? hash(JSON.stringify(input));
      if (idempotency?.key) {
        const existing = await client.query('SELECT request_hash,result FROM idempotency_records WHERE owner_id=$1 AND route=$2 AND key=$3', [ownerId, route, idempotency.key]);
        if (existing.rows[0]) {
          if (existing.rows[0].request_hash !== requestHash) throw new RepositoryError('IDEMPOTENCY_CONFLICT', 'This request key was already used with different input.');
          return existing.rows[0].result as AcceptedRun;
        }
      }
      const item = await this.lockedCase(client, ownerId, caseId);
      const source = await client.query("SELECT se.dto FROM source_events se JOIN case_sources cs ON cs.owner_id=se.owner_id AND cs.source_event_id=se.id JOIN connections c ON c.owner_id=se.owner_id AND c.id=se.connection_id WHERE cs.owner_id=$1 AND cs.case_id=$2 AND c.status='connected' ORDER BY se.created_at DESC LIMIT 1", [ownerId, caseId]);
      if (!source.rows[0]) throw new RepositoryError('CONNECTION_REQUIRED', 'Reconnect the source before checking again.');
      if (input.note) {
        await this.cancelActive(client, ownerId, item); item.sourceRevision += 1;
        const statement: Evidence = { id: randomUUID(), caseId, runId: null, sourceEventId: null, stepId: null, kind: 'user_statement', observedAt: now(), sourceLabel: 'Your statement', displayUrl: null, excerpt: input.note, artifactId: null, contentHash: hash(input.note), provenance: { dataOrigin: config.execution === 'simulated' ? 'synthetic' : 'user', execution: config.execution } };
        await this.insertEvidence(client, ownerId, statement);
      }
      if (input.reason === 'verification_requested' && item.currentAssessment) {
        await client.query("INSERT INTO review_events(id,owner_id,case_id,assessment_id,status) VALUES($1,$2,$3,$4,'verification_requested') ON CONFLICT(owner_id,assessment_id,status) DO NOTHING", [randomUUID(), ownerId, caseId, item.currentAssessment.id]);
        item.reviewStatus = 'verification_requested';
        await this.emit(client, ownerId, { type: 'review.updated', caseId, sourceRevision: item.sourceRevision, data: { assessmentId: item.currentAssessment.id, reviewStatus: 'verification_requested' } });
      }
      let accepted: AcceptedRun | undefined;
      if (item.activeRunId) {
        const active = await client.query('SELECT dto FROM investigation_runs WHERE owner_id=$1 AND id=$2', [ownerId, item.activeRunId]);
        if (active.rows[0]) {
          const run = InvestigationRunSchema.parse(active.rows[0].dto);
          if (run.sourceRevision === item.sourceRevision && (run.status === 'queued' || run.status === 'checking')) accepted = { caseId, runId: run.id, status: run.status, reused: true };
        }
      }
      if (!accepted) {
        await this.cancelActive(client, ownerId, item);
        const latestCapture=await client.query('SELECT id FROM page_captures WHERE owner_id=$1 AND case_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1',[ownerId,caseId]);
        const origins=await client.query("SELECT 1 FROM source_events se JOIN case_sources cs ON cs.source_event_id=se.id AND cs.owner_id=se.owner_id WHERE cs.owner_id=$1 AND cs.case_id=$2 AND se.dto->>'dataOrigin'='user' LIMIT 1",[ownerId,caseId]);
        const run = await this.newRun(client, ownerId, item, 'user_recheck', config, origins.rows.length?'user':SourceEventSchema.parse(source.rows[0].dto).dataOrigin,latestCapture.rows[0]?.id);
        accepted = { caseId, runId: run.id, status: 'queued', reused: false };
        await this.emit(client, ownerId, { type: 'investigation.queued', caseId, sourceRevision: item.sourceRevision, data: { runId: run.id, status: 'queued' } });
      }
      item.recordVersion += 1; item.updatedAt = now(); await this.saveCase(client, ownerId, item);
      await this.emit(client, ownerId, { type: 'case.updated', caseId, sourceRevision: item.sourceRevision, data: { case: item } });
      if (idempotency?.key) await client.query('INSERT INTO idempotency_records(owner_id,route,key,request_hash,result) VALUES($1,$2,$3,$4,$5)', [ownerId, route, idempotency.key, requestHash, accepted]);
      return accepted;
    });
  }

  async claimRun(ownerId: string, runId: string, leaseMs = 120000): Promise<Lease> {
    if (!Number.isInteger(leaseMs) || leaseMs < 1000 || leaseMs > 600000) throw new RepositoryError('VALIDATION_ERROR', 'Lease duration is outside the allowed range.');
    return this.transaction(ownerId, async (client) => {
      const result = await client.query<DbRun>('SELECT * FROM investigation_runs WHERE owner_id=$1 AND id=$2 FOR UPDATE', [ownerId, runId]); if (!result.rows[0]) throw notFound();
      const row = result.rows[0]; const run = InvestigationRunSchema.parse(row.dto); const item = await this.lockedCase(client, ownerId, run.caseId);
      if (run.status !== 'queued' || item.activeRunId !== runId || item.sourceRevision !== run.sourceRevision) throw new RepositoryError('STALE_REVISION', 'This investigation has been superseded or already started.');
      assertRunTransition(run.status, 'checking'); run.status = 'checking'; run.attempt += 1; run.startedAt = now();
      const generation = row.lease_generation + 1; const expiresAt = new Date(Date.now() + leaseMs).toISOString();
      await client.query('UPDATE investigation_runs SET status=$3,dto=$4,lease_generation=$5,lease_expires_at=$6 WHERE owner_id=$1 AND id=$2', [ownerId, runId, run.status, run, generation, expiresAt]);
      item.latestRunStatus = 'checking'; item.recordVersion += 1; item.updatedAt = now(); await this.saveCase(client, ownerId, item);
      await this.emit(client, ownerId, { type: 'investigation.started', caseId: item.id, sourceRevision: item.sourceRevision, data: { runId, status: 'checking' } });
      await this.emit(client, ownerId, { type: 'case.updated', caseId: item.id, sourceRevision: item.sourceRevision, data: { case: item } });
      return { run, generation, expiresAt };
    });
  }
  private async requireLease(client: PoolClient, ownerId: string, runId: string, generation: number): Promise<{ run: InvestigationRun; item: CaseSummary }> {
    const result = await client.query<DbRun>('SELECT * FROM investigation_runs WHERE owner_id=$1 AND id=$2 FOR UPDATE', [ownerId, runId]);
    const row = result.rows[0]; if (!row) throw notFound(); const run = InvestigationRunSchema.parse(row.dto);
    const item = await this.lockedCase(client, ownerId, run.caseId);
    if (run.status !== 'checking' || row.lease_generation !== generation || !row.lease_expires_at || row.lease_expires_at.getTime() <= Date.now() || item.activeRunId !== run.id || item.sourceRevision !== run.sourceRevision) throw new RepositoryError('STALE_REVISION', 'This worker lease is expired or superseded.');
    return { run, item };
  }
  async renewLease(ownerId: string, runId: string, generation: number, leaseMs = 120000): Promise<void> {
    if (leaseMs < 1000 || leaseMs > 600000) throw new RepositoryError('VALIDATION_ERROR', 'Invalid lease duration.');
    await this.transaction(ownerId, async (client) => { await this.requireLease(client, ownerId, runId, generation); await client.query("UPDATE investigation_runs SET lease_expires_at=now()+($4::integer*interval '1 millisecond') WHERE owner_id=$1 AND id=$2 AND lease_generation=$3", [ownerId, runId, generation, leaseMs]); });
  }
  private async insertEvidence(client: PoolClient, ownerId: string, evidence: Evidence) {
    EvidenceSchema.parse(evidence);
    await client.query('INSERT INTO evidence(id,owner_id,case_id,run_id,source_event_id,artifact_id,content_hash,dto) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [evidence.id, ownerId, evidence.caseId, evidence.runId, evidence.sourceEventId, evidence.artifactId, evidence.contentHash, evidence]);
  }
  async saveEvidence(ownerId: string, runId: string, generation: number, input: Evidence): Promise<Evidence> {
    const evidence = EvidenceSchema.parse(input);
    return this.transaction(ownerId, async (client) => {
      const { run } = await this.requireLease(client, ownerId, runId, generation);
      if (evidence.caseId !== run.caseId || evidence.runId !== runId || evidence.provenance.execution !== run.provenance.execution) throw new RepositoryError('VALIDATION_ERROR', 'Evidence does not belong to this investigation.');
      if (evidence.sourceEventId) {
        const source = await client.query('SELECT source_event_id FROM case_sources WHERE owner_id=$1 AND case_id=$2 AND source_event_id=$3', [ownerId, run.caseId, evidence.sourceEventId]); if (!source.rows[0]) throw notFound();
      }
      const existing = await client.query('SELECT dto FROM evidence WHERE owner_id=$1 AND id=$2', [ownerId, evidence.id]);
      if (existing.rows[0]) { if (!isDeepStrictEqual(existing.rows[0].dto, evidence)) throw new RepositoryError('IDEMPOTENCY_CONFLICT', 'Captured evidence is immutable.'); return EvidenceSchema.parse(existing.rows[0].dto); }
      await this.insertEvidence(client, ownerId, evidence); return evidence;
    });
  }
  async addStep(ownerId: string, runId: string, generation: number, input: JourneyStep): Promise<JourneyStep> {
    const step = JourneyStepSchema.parse(input);
    return this.transaction(ownerId, async (client) => {
      const { run } = await this.requireLease(client, ownerId, runId, generation); if (step.runId !== runId) throw new RepositoryError('VALIDATION_ERROR', 'This step belongs to another run.');
      if (step.evidenceIds.length) {
        const count = await client.query('SELECT id FROM evidence WHERE owner_id=$1 AND case_id=$2 AND run_id=$3 AND id=ANY($4::uuid[])', [ownerId, run.caseId, runId, step.evidenceIds]);
        if (count.rows.length !== new Set(step.evidenceIds).size) throw new RepositoryError('VALIDATION_ERROR', 'This step references unavailable evidence.');
      }
      const inserted = await client.query('INSERT INTO investigation_steps(id,owner_id,run_id,step_index,dto) VALUES($1,$2,$3,$4,$5) ON CONFLICT(run_id,step_index) DO NOTHING RETURNING id', [step.id, ownerId, runId, step.index, step]);
      if (!inserted.rowCount) {
        const previous = await client.query('SELECT dto FROM investigation_steps WHERE owner_id=$1 AND run_id=$2 AND step_index=$3', [ownerId, runId, step.index]);
        if (!isDeepStrictEqual(previous.rows[0]?.dto, step)) throw new RepositoryError('IDEMPOTENCY_CONFLICT', 'This step index already contains a different observation.');
      } else await this.emit(client, ownerId, { type: 'investigation.step_completed', caseId: run.caseId, sourceRevision: run.sourceRevision, data: { runId, stepId: step.id, label: step.label, evidenceIds: step.evidenceIds } });
      return step;
    });
  }

  async publishAssessment(ownerId: string, runId: string, generation: number, input: AssessmentProposal, mode: AppMode, finalStatus: 'complete' | 'limited' = 'complete'): Promise<Assessment | null> {
    return this.transaction(ownerId, async (client) => {
      const existing = await client.query('SELECT dto FROM assessments WHERE owner_id=$1 AND run_id=$2', [ownerId, runId]);
      if (existing.rows[0]) return AssessmentSchema.parse(existing.rows[0].dto);
      const { run, item } = await this.requireLease(client, ownerId, runId, generation);
      const evidence = await client.query('SELECT dto FROM evidence WHERE owner_id=$1 AND case_id=$2 AND (run_id=$3 OR run_id IS NULL)', [ownerId, item.id, runId]);
      const sources = await client.query('SELECT source_event_id FROM case_sources WHERE owner_id=$1 AND case_id=$2', [ownerId, item.id]);
      if(run.pageCaptureId&&input.verdict){
        const cited=evidence.rows.map(row=>EvidenceSchema.parse(row.dto)).filter(e=>input.finding?.evidenceIds.includes(e.id));
        if(!cited.some(e=>e.kind==='page_excerpt'&&e.excerpt?.trim()&&e.runId===runId&&e.inspection?.captureId===run.pageCaptureId))throw new RepositoryError('VALIDATION_ERROR','A captured-page finding must cite the saved page-text observation from this run.');
        if(item.sourceKinds.includes('gmail')&&!cited.some(e=>e.kind==='message_excerpt'))throw new RepositoryError('VALIDATION_ERROR','A linked comparison must also cite the email observation.');
      }
      const proposal = assertAssessmentProposal({ proposal: input, run, evidence: evidence.rows.map((row) => EvidenceSchema.parse(row.dto)), sourceEventIds: sources.rows.map((row) => row.source_event_id as string), mode, finalStatus });
      const status = proposal.verdict === null ? 'limited' : finalStatus;
      assertRunTransition(run.status, status); run.status = status; run.finishedAt = now(); run.limitations = proposal.limitations;
      let assessment: Assessment | null = null;
      if (proposal.verdict && proposal.finding && proposal.nextAction) {
        const version = await client.query('SELECT COALESCE(max(version),0)+1 AS version FROM assessments WHERE owner_id=$1 AND case_id=$2', [ownerId, item.id]);
        assessment = AssessmentSchema.parse({ ...proposal, id: randomUUID(), caseId: item.id, runId, version: version.rows[0].version, sourceRevision: run.sourceRevision, supersedesAssessmentId: item.currentAssessment?.id ?? null, createdAt: now(), provenance: run.provenance });
        await client.query('INSERT INTO assessments(id,owner_id,case_id,run_id,version,source_revision,dto) VALUES($1,$2,$3,$4,$5,$6,$7)', [assessment.id, ownerId, item.id, runId, assessment.version, assessment.sourceRevision, assessment]);
        item.currentAssessment = assessment; item.freshness = 'current'; item.reviewStatus = 'unreviewed';
      } else item.freshness = item.currentAssessment ? 'stale' : 'current';
      await this.saveRun(client, ownerId, run);
      item.activeRunId = null; item.latestRunStatus = status; item.recordVersion += 1; item.updatedAt = now(); await this.saveCase(client, ownerId, item);
      if (status === 'limited') await this.emit(client, ownerId, { type: 'investigation.limited', caseId: item.id, sourceRevision: item.sourceRevision, data: { runId, status: 'limited', limitations: run.limitations, errorCode: null } });
      if (assessment) await this.emit(client, ownerId, { type: 'assessment.published', caseId: item.id, sourceRevision: item.sourceRevision, data: { assessment, case: item } });
      else await this.emit(client, ownerId, { type: 'case.updated', caseId: item.id, sourceRevision: item.sourceRevision, data: { case: item } });
      return assessment;
    });
  }

  async failRun(ownerId: string, runId: string, generation: number, error: ApiError['error']): Promise<void> {
    await this.transaction(ownerId, async (client) => {
      const { run, item } = await this.requireLease(client, ownerId, runId, generation);
      assertRunTransition(run.status, 'failed'); run.status = 'failed'; run.error = error; run.finishedAt = now();
      await this.saveRun(client, ownerId, run);
      item.activeRunId = null; item.latestRunStatus = 'failed'; item.freshness = item.currentAssessment ? 'stale' : 'current'; item.recordVersion += 1; item.updatedAt = now();
      await this.saveCase(client, ownerId, item);
      await this.emit(client, ownerId, { type: 'investigation.failed', caseId: item.id, sourceRevision: item.sourceRevision, data: { runId, status: 'failed', limitations: run.limitations, errorCode: error.code } });
      await this.emit(client, ownerId, { type: 'case.updated', caseId: item.id, sourceRevision: item.sourceRevision, data: { case: item } });
    });
  }
  async failTriage(ownerId: string, sourceId: string, error: ApiError['error']): Promise<void> {
    await this.transaction(ownerId, async (client) => {
      const result = await client.query('SELECT dto FROM source_events WHERE owner_id=$1 AND id=$2 FOR UPDATE', [ownerId, sourceId]); if (!result.rows[0]) throw notFound();
      const source = SourceEventSchema.parse(result.rows[0].dto); if (source.processingStatus === 'complete') return;
      source.processingStatus = 'failed'; source.disposition = 'pending'; source.lastErrorCode = error.code;
      await client.query('UPDATE source_events SET disposition=$3,processing_status=$4,dto=$5 WHERE owner_id=$1 AND id=$2', [ownerId, sourceId, source.disposition, source.processingStatus, source]);
      await this.emit(client, ownerId, { type: 'source.updated', caseId: null, sourceRevision: null, data: { sourceEventId: source.id, kind: source.kind, disposition: source.disposition, processingStatus: source.processingStatus, lastErrorCode: source.lastErrorCode, caseIds: [] } });
    });
  }

  /** An expired process never resumes its old lease. Operators can safely create a new run. */
  async recoverExpiredRuns(ownerId: string): Promise<number> {
    return this.transaction(ownerId, async (client) => {
      const result = await client.query("SELECT dto FROM investigation_runs WHERE owner_id=$1 AND status='checking' AND lease_expires_at<now() FOR UPDATE", [ownerId]);
      for (const row of result.rows) {
        const run = InvestigationRunSchema.parse(row.dto); const item = await this.lockedCase(client, ownerId, run.caseId);
        run.status = 'failed'; run.finishedAt = now(); run.error = { code: 'PROVIDER_UNAVAILABLE', message: 'The worker stopped before this check completed. Recheck to start a fresh investigation.', retryable: true, requestId: randomUUID() };
        await this.saveRun(client, ownerId, run);
        await client.query('UPDATE investigation_runs SET lease_generation=lease_generation+1,lease_expires_at=NULL WHERE owner_id=$1 AND id=$2', [ownerId, run.id]);
        if (item.activeRunId === run.id) {
          item.activeRunId = null; item.latestRunStatus = 'failed'; item.freshness = item.currentAssessment ? 'stale' : 'current'; item.recordVersion += 1; item.updatedAt = now(); await this.saveCase(client, ownerId, item);
          await this.emit(client, ownerId, { type: 'investigation.failed', caseId: item.id, sourceRevision: run.sourceRevision, data: { runId: run.id, status: 'failed', limitations: run.limitations, errorCode: run.error.code } });
          await this.emit(client, ownerId, { type: 'case.updated', caseId: item.id, sourceRevision: item.sourceRevision, data: { case: item } });
        }
      }
      return result.rows.length;
    });
  }
}
