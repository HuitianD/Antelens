import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import {
  ActivityEventSchema, AssessmentProposalSchema, BrowserEventInputSchema, SourceEventSchema,
  assertAssessmentProposal, assertTriageProposal, canTransitionRun, dashboardCounts, applyCaseSnapshot, createOpenApiDocument,
  type AssessmentProposal, type CaseSummary, type Evidence, type InvestigationRun,
} from '../src/index.js';

const caseId = randomUUID(); const runId = randomUUID(); const sourceId = randomUUID(); const evidenceId = randomUUID();
const now = '2026-10-17T12:00:00.000Z';
const run: InvestigationRun = { id: runId, caseId, sourceRevision: 1, trigger: 'new_source', status: 'checking', attempt: 1, startedAt: now, finishedAt: null, modelId: 'fixture-only', promptVersion: '1', policyVersion: '1', toolVersion: '1', provenance: { dataOrigin: 'synthetic', execution: 'simulated' }, limitations: [], error: null };
const observation: Evidence = { id: evidenceId, caseId, runId, sourceEventId: sourceId, stepId: null, kind: 'page_excerpt', observedAt: now, sourceLabel: 'Synthetic checkout', displayUrl: 'https://fixture.example/checkout', excerpt: '$40 application fee and $29 monthly membership.', artifactId: null, contentHash: 'a'.repeat(64), provenance: run.provenance };
const proposal: AssessmentProposal = { verdict: 'confirm_first', impacts: ['money'], finding: { headline: 'The application includes a monthly membership.', consequence: 'Continuing would start recurring charges.', evidenceIds: [evidenceId] }, nextAction: { kind: 'review_evidence', label: 'Review charges', evidenceId }, checkedScope: ['Displayed checkout terms before submission'], limitations: [], changeSummary: null };
const context = { proposal, run, evidence: [observation], sourceEventIds: [sourceId], mode: 'demo' as const, finalStatus: 'complete' as const };

test('publication accepts an observed concern and rejects fabricated/cross-case evidence', () => {
  assert.equal(assertAssessmentProposal(context).verdict, 'confirm_first');
  assert.throws(() => assertAssessmentProposal({ ...context, evidence: [] }), /unauthorized evidence/);
  assert.throws(() => assertAssessmentProposal({ ...context, evidence: [{ ...observation, caseId: randomUUID() }] }), /unauthorized evidence/);
  assert.throws(() => assertAssessmentProposal({ ...context, evidence: [{ ...observation, runId: randomUUID() }] }), /this run/);
});
test('a blocked or failed investigation cannot publish a favorable result', () => {
  const favorable = { ...proposal, verdict: 'no_issues_found' as const };
  assert.throws(() => assertAssessmentProposal({ ...context, proposal: favorable, finalStatus: 'limited' }), /Incomplete checks/);
  assert.throws(() => assertAssessmentProposal({ ...context, run: { ...run, status: 'failed' }, finalStatus: undefined }), /Only complete or limited/);
  assert.equal(assertAssessmentProposal({ ...context, finalStatus: 'limited' }).verdict, 'confirm_first');
});
test('statements cannot masquerade as independent observations and live runs reject simulation', () => {
  assert.throws(() => assertAssessmentProposal({ ...context, evidence: [{ ...observation, kind: 'user_statement' }] }), /supporting observation/);
  const limitation = { code: 'network_policy' as const, message: 'Linked pages were not opened.', stepId: null, evidenceIds: [] };
  const messageOnly = { ...context, evidence: [{ ...observation, kind: 'message_excerpt' as const, runId: null }], proposal: { ...proposal, limitations: [limitation] } };
  assert.equal(assertAssessmentProposal({ ...messageOnly, finalStatus: 'limited' }).verdict, 'confirm_first');
  assert.equal(assertAssessmentProposal({ ...messageOnly, finalStatus: 'limited', evidence: [{ ...observation, kind: 'message_excerpt' }] }).verdict, 'confirm_first');
  assert.throws(() => assertAssessmentProposal(messageOnly), /supporting observation/);
  assert.throws(() => assertAssessmentProposal({ ...messageOnly, finalStatus: 'limited', proposal }), /supporting observation/);
  assert.throws(() => assertAssessmentProposal({ ...messageOnly, finalStatus: 'limited', evidence: [{ ...observation, kind: 'user_statement', runId: null }], proposal: { ...proposal, limitations: [limitation] } }), /supporting observation/);
  assert.throws(() => assertAssessmentProposal({ ...messageOnly, finalStatus: 'limited', proposal: { ...messageOnly.proposal, verdict: 'no_issues_found' } }), /Incomplete checks/);
  assert.throws(() => assertAssessmentProposal({ ...context, mode: 'live' }), /simulated assessment/);
  assert.throws(() => assertAssessmentProposal({ ...context, mode: 'live', run: { ...run, provenance: { dataOrigin: 'synthetic', execution: 'live' } } }), /Simulated evidence/);
});
test('triage cannot invent URLs or select arbitrary cases and no_action never creates a verdict', () => {
  const triage = { outcome: 'case_update', requestSummary: 'Rental application fee', impacts: ['money'], candidateCaseId: caseId, relevantLinkIndexes: [0] };
  assert.throws(() => assertTriageProposal(triage, { candidateCaseIds: [], linkCount: 1 }), /authorized source/);
  assert.throws(() => assertTriageProposal(triage, { candidateCaseIds: [caseId], linkCount: 0 }), /does not exist/);
  assert.equal(assertTriageProposal({ outcome: 'no_action', requestSummary: null, impacts: [], candidateCaseId: null, relevantLinkIndexes: [] }, { candidateCaseIds: [], linkCount: 0 }).outcome, 'no_action');
  assert.equal(AssessmentProposalSchema.safeParse({ ...proposal, verdict: null }).success, false);
});
test('browser ingress bounds data and rejects client claims of provenance/ownership', () => {
  const input = { clientEventId: randomUUID(), installationId: randomUUID(), observedAt: now, pageUrl: 'https://fixture.example', pageTitle: 'Rental', eventType: 'page_detected', request: { kind: 'payment', visibleText: 'Application fee', destinationUrl: null, fieldLabels: [], requestedPermissions: [] } };
  assert.equal(BrowserEventInputSchema.safeParse(input).success, true);
  assert.equal(BrowserEventInputSchema.safeParse({ ...input, ownerId: randomUUID() }).success, false);
  assert.equal(BrowserEventInputSchema.safeParse({ ...input, provenance: { execution: 'live' } }).success, false);
  assert.equal(BrowserEventInputSchema.safeParse({ ...input, request: { ...input.request, visibleText: 'x'.repeat(8001) } }).success, false);
});
test('event types validate their specific payload and missing nullable fields fail', () => {
  assert.equal(ActivityEventSchema.safeParse({ id: '10', schemaVersion: '1', type: 'investigation.started', occurredAt: now, caseId, sourceRevision: 1, data: { runId, status: 'complete' } }).success, false);
  assert.equal(SourceEventSchema.safeParse({ id: sourceId }).success, false);
});
test('terminal runs are immutable and delayed case snapshots cannot replace newer state', () => {
  assert.equal(canTransitionRun('checking', 'limited'), true);
  assert.equal(canTransitionRun('failed', 'checking'), false);
  const current: CaseSummary = { id: caseId, recordVersion: 2, title: 'Rental', sourceKinds: ['gmail'], sourceRevision: 1, currentAssessment: null, activeRunId: runId, latestRunStatus: 'checking', freshness: 'current', reviewStatus: 'unreviewed', updatedAt: now };
  assert.equal(applyCaseSnapshot(current, { ...current, recordVersion: 1, latestRunStatus: 'complete' }), current);
  assert.deepEqual(dashboardCounts([current, { ...current, id: randomUUID(), freshness: 'stale', latestRunStatus: 'limited' }]), { pause_here: 0, confirm_first: 0, no_issues_found: 0, checking: 1, limited: 1, stale: 1 });
});
test('OpenAPI is generated from public schemas without secret model fields', () => {
  const document = createOpenApiDocument();
  assert.ok(document.paths['/v1/browser/events'].post.requestBody);
  assert.equal(document.openapi, '3.1.0');
  assert.ok(!JSON.stringify(document).includes('encrypted_credentials'));
});
