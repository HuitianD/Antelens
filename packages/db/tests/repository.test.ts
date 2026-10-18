import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { Pool } from 'pg';
import type { AssessmentProposal, ConnectionSummary, Evidence, SourceEvent } from '@beforeyou/contracts';
import { PostgresRepository, type RunConfiguration } from '../src/repository.js';

const time = '2026-10-17T12:00:00.000Z';
const config: RunConfiguration = { modelId: 'offline-postgres-policy-test', promptVersion: '1', policyVersion: '1', toolVersion: '1', execution: 'simulated' };
const hash = (content: string) => createHash('sha256').update(content).digest('hex');

test('PostgreSQL migrations and repository preserve durable investigation invariants (offline synthetic)', async (t) => {
  const postgres = new PGlite();
  await postgres.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  const migrationConfig = { migrationsFolder: fileURLToPath(new URL('../migrations/', import.meta.url)), migrationsSchema: 'beforeyou_migrations' };
  await migrate(drizzle(postgres), migrationConfig);
  await migrate(drizzle(postgres), migrationConfig); // Reapplying the tracked migration performs no reset.
  // PGlite is real PostgreSQL compiled to WASM, used only as the transport for deterministic offline tests.
  const query = async (sql: string, params: unknown[] = []) => {
    const result = await postgres.query(sql, params.map((value) => value instanceof Date ? value : Array.isArray(value) ? `{${value.join(',')}}` : value && typeof value === 'object' ? JSON.stringify(value) : value));
    return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
  };
  const repository = new PostgresRepository({ query, connect: async () => ({ query, release() {} }), end: async () => postgres.close() } as unknown as Pool);
  const owner = randomUUID(); const other = randomUUID(); const connectionId = randomUUID();
  const connection: ConnectionSummary = { id: connectionId, kind: 'gmail', status: 'connected', accountLabel: 'Synthetic mailbox', grantedScopes: ['gmail.readonly'], lastSyncedAt: null, lastErrorCode: null };
  await repository.transaction(owner, async (client) => {
    await client.query('INSERT INTO connections(id,owner_id,kind,provider_account_id,status,dto) VALUES($1,$2,$3,$4,$5,$6)', [connectionId, owner, 'gmail', 'synthetic', 'connected', connection]);
    await repository.emit(client, owner, { type: 'connection.updated', caseId: null, sourceRevision: null, data: { connection } });
  });
  const input: SourceEvent = { id: randomUUID(), connectionId, kind: 'gmail', externalId: 'synthetic-message-1', externalThreadId: 'rental-thread', receivedAt: time, occurredAt: time, title: 'Rental application', senderLabel: 'Synthetic rental office', previewText: 'The application is $40.', contentRef: randomUUID(), disposition: 'pending', processingStatus: 'queued', lastErrorCode: null, dataOrigin: 'synthetic' };
  let caseId = ''; let runId = ''; let assessmentId = ''; let evidence: Evidence; let proposal: AssessmentProposal;

  await t.test('ingestion and triage queue effects are atomic and duplicate delivery does not duplicate a case', async () => {
    const first = await repository.ingestSource(owner, input, input.previewText, ['https://fixture.example/checkout', 'https://fixture.example/unrelated']);
    const duplicate = await repository.ingestSource(owner, { ...input, id: randomUUID() }, input.previewText, ['https://fixture.example/checkout']);
    assert.equal(first.reused, false); assert.equal(duplicate.reused, true); assert.equal(first.source.id, duplicate.source.id);
    const key = { route: 'test-ingress', key: 'event-key', requestHash: hash('original-input') };
    const repeated = await repository.ingestSource(owner, input, input.previewText, [], null, key);
    assert.deepEqual(await repository.ingestSource(owner, input, input.previewText, [], null, key), repeated);
    await assert.rejects(() => repository.ingestSource(owner, input, 'changed input', [], null, { ...key, requestHash: hash('changed-input') }), /different input/);
    const triage = { outcome: 'new_request' as const, requestSummary: 'Rental application fee', impacts: ['money' as const], candidateCaseId: null, relevantLinkIndexes: [0] };
    const accepted = await repository.acceptTriage(owner, input.id, triage, config); caseId = accepted.caseId!; runId = accepted.runId!;
    const retried = await repository.acceptTriage(owner, input.id, triage, config); assert.equal(retried.caseId, caseId); assert.equal(retried.runId, runId);
    assert.equal((await repository.listCases(owner)).items.length, 1);
    const selected = await query('SELECT links FROM source_events WHERE id=$1', [input.id]);
    assert.deepEqual((selected.rows[0] as { links: string[] }).links, ['https://fixture.example/checkout']);
    const queued = await query("SELECT topic,count(*)::int AS count FROM outbox_events WHERE topic IN ('triage','investigate') GROUP BY topic");
    assert.deepEqual(queued.rows.map((row: any) => [row.topic, row.count]).sort(), [['investigate', 1], ['triage', 1]]);
  });

  await t.test('actual SQL ownership constraints reject cross-account records and reads', async () => {
    await assert.rejects(() => repository.caseDetail(other, caseId), /unavailable/);
    await assert.rejects(() => repository.messageDetail(other, input.id), /unavailable/);
    await assert.rejects(() => repository.ingestSource(other, { ...input, id: randomUUID(), externalId: 'forbidden' }, 'Other owner'), /Reconnect/);
    await assert.rejects(() => query('UPDATE case_sources SET owner_id=$1 WHERE case_id=$2 AND source_event_id=$3', [other, caseId, input.id]), /foreign key/i);
    assert.deepEqual(await repository.eventsSince(other), []);
  });

  await t.test('observations do not bump source revision, publication is evidence-backed and one-per-run', async () => {
    const lease = await repository.claimRun(owner, runId);
    evidence = { id: randomUUID(), caseId, runId, sourceEventId: input.id, stepId: null, kind: 'page_excerpt', observedAt: time, sourceLabel: 'Synthetic checkout', displayUrl: 'https://fixture.example/checkout', excerpt: '$40 application fee plus $29 monthly membership.', artifactId: null, contentHash: hash('checkout-v1'), provenance: { dataOrigin: 'synthetic', execution: 'simulated' } };
    await repository.saveEvidence(owner, runId, lease.generation, evidence);
    await repository.saveEvidence(owner, runId, lease.generation, evidence); // Idempotent even with JSONB key normalization.
    const step = { id: randomUUID(), runId, index: 0, kind: 'inspect_page' as const, status: 'complete' as const, label: 'Read recurring membership terms', fromDisplayUrl: null, toDisplayUrl: evidence.displayUrl, evidenceIds: [evidence.id], occurredAt: time };
    await repository.addStep(owner, runId, lease.generation, step); await repository.addStep(owner, runId, lease.generation, step);
    assert.equal((await repository.caseDetail(owner, caseId)).case.sourceRevision, 1);
    proposal = { verdict: 'confirm_first', impacts: ['money'], finding: { headline: 'The application includes a $29 monthly membership.', consequence: 'Continuing would start recurring charges.', evidenceIds: [evidence.id] }, nextAction: { kind: 'review_evidence', label: 'Review charges', evidenceId: evidence.id }, checkedScope: ['Visible checkout terms before payment'], limitations: [], changeSummary: null };
    await assert.rejects(() => repository.publishAssessment(owner, runId, lease.generation, proposal, 'live'), /simulated/);
    const published = await repository.publishAssessment(owner, runId, lease.generation, proposal, 'demo'); assessmentId = published!.id;
    const repeated = await repository.publishAssessment(owner, runId, lease.generation, proposal, 'demo'); assert.equal(repeated?.id, assessmentId);
    assert.equal((await repository.history(owner, caseId)).items.length, 1);
    await assert.rejects(() => query("UPDATE assessments SET dto=jsonb_set(dto,'{verdict}','\"no_issues_found\"') WHERE id=$1", [assessmentId]), /Immutable/);
    await assert.rejects(() => query('UPDATE evidence SET content_hash=$2 WHERE id=$1', [evidence.id, 'b'.repeat(64)]), /Immutable/);
  });

  await t.test('snapshot cursors recover missed persisted updates and viewing does not verify a finding', async () => {
    const before = await repository.snapshot(owner, 'demo');
    assert.equal(before.data.counts.confirm_first, 1); assert.equal(before.data.counts.no_issues_found, 0);
    await repository.viewed(owner, caseId, assessmentId);
    const after = await repository.caseDetail(owner, caseId);
    assert.equal(after.case.reviewStatus, 'viewed'); assert.equal(after.currentAssessment?.verdict, 'confirm_first');
    const replay = await repository.eventsSince(owner, before.eventCursor);
    assert.deepEqual(replay.map((event) => event.type), ['review.updated', 'case.updated']);
    assert.equal(new Set(replay.map((event) => event.id)).size, replay.length);
    assert.deepEqual(await repository.eventsSince(owner, replay.at(-1)!.id), []);
  });

  await t.test('rechecks are idempotent, superseded leases cannot publish, and failures retain stale concerns', async () => {
    const first = await repository.recheck(owner, caseId, { reason: 'user_recheck' }, config, { key: 'same-request' });
    assert.deepEqual(await repository.recheck(owner, caseId, { reason: 'user_recheck' }, config, { key: 'same-request' }), first);
    await assert.rejects(() => repository.recheck(owner, caseId, { reason: 'verification_requested' }, config, { key: 'same-request' }), /different input/);
    assert.equal((await repository.recheck(owner, caseId, { reason: 'user_recheck' }, config)).reused, true);
    const oldLease = await repository.claimRun(owner, first.runId);
    const newer = await repository.recheck(owner, caseId, { reason: 'verification_requested', note: 'The sender says the membership is optional.' }, config);
    assert.notEqual(newer.runId, first.runId); assert.equal((await repository.caseDetail(owner, caseId)).case.sourceRevision, 2);
    await assert.rejects(() => repository.publishAssessment(owner, first.runId, oldLease.generation, proposal, 'demo'), /expired or superseded/);
    const lease = await repository.claimRun(owner, newer.runId);
    await repository.failRun(owner, newer.runId, lease.generation, { code: 'PROVIDER_UNAVAILABLE', message: 'Synthetic provider outage.', retryable: true, requestId: randomUUID() });
    const state = await repository.caseDetail(owner, caseId);
    assert.equal(state.case.freshness, 'stale'); assert.equal(state.case.latestRunStatus, 'failed'); assert.equal(state.currentAssessment?.id, assessmentId);
    assert.equal((await repository.snapshot(owner, 'demo')).data.counts.confirm_first, 0);
  });

  await t.test('new same-thread evidence revises the same case and resets review only for the new assessment', async () => {
    const reply = { ...input, id: randomUUID(), externalId: 'synthetic-reply-2', title: 'Re: Rental application', previewText: 'Membership is optional.' };
    await repository.ingestSource(owner, reply, reply.previewText, ['https://fixture.example/checkout']);
    const accepted = await repository.acceptTriage(owner, reply.id, { outcome: 'case_update', requestSummary: 'Updated rental terms', impacts: ['money'], candidateCaseId: caseId, relevantLinkIndexes: [0] }, config);
    assert.equal(accepted.caseId, caseId); const lease = await repository.claimRun(owner, accepted.runId!);
    const observed = { ...evidence, id: randomUUID(), runId: lease.run.id, sourceEventId: reply.id, excerpt: 'Membership remains selected at $29 monthly.', contentHash: hash('checkout-v2') };
    await repository.saveEvidence(owner, lease.run.id, lease.generation, observed);
    const next = await repository.publishAssessment(owner, lease.run.id, lease.generation, { ...proposal, finding: { ...proposal.finding!, headline: 'The reply says optional; checkout still enrolls you.', evidenceIds: [observed.id] }, nextAction: { kind: 'review_evidence', label: 'Compare terms', evidenceId: observed.id }, changeSummary: 'The new statement conflicts with the observed recurring terms.' }, 'demo');
    assert.equal(next?.version, 2); assert.equal(next?.supersedesAssessmentId, assessmentId);
    assert.equal((await repository.caseDetail(owner, caseId)).case.reviewStatus, 'unreviewed');
    await repository.viewed(owner, caseId, assessmentId);
    assert.equal((await repository.caseDetail(owner, caseId)).case.reviewStatus, 'unreviewed');
    assert.equal((await repository.history(owner, caseId)).items.length, 2);
  });

  await t.test('expired worker leases are invalidated and recover to an explicit failed outcome', async () => {
    const accepted = await repository.recheck(owner, caseId, { reason: 'user_recheck' }, config); const lease = await repository.claimRun(owner, accepted.runId);
    await query("UPDATE investigation_runs SET lease_expires_at=now()-interval '1 second' WHERE id=$1", [lease.run.id]);
    await assert.rejects(() => repository.saveEvidence(owner, lease.run.id, lease.generation, { ...evidence, id: randomUUID(), runId: lease.run.id }), /expired/);
    assert.equal(await repository.recoverExpiredRuns(owner), 1);
    assert.equal((await repository.run(owner, lease.run.id)).run.status, 'failed');
    assert.equal((await repository.caseDetail(owner, caseId)).case.freshness, 'stale');
  });
  await repository.close();
});
