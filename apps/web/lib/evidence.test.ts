import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { AssessmentSchema, CaseDetailSchema, EvidenceSchema, InvestigationRunSchema } from '@beforeyou/contracts';
import { comparisonEvidence, demoScreenshot } from './evidence';

const caseId = randomUUID(), currentRun = randomUUID(), otherRun = randomUUID();
const date = '2026-10-18T12:00:00.000Z';
const provenance = { dataOrigin: 'synthetic', execution: 'simulated' };
const record = (kind: string, runId = currentRun, excerpt = 'Exact captured text.') => EvidenceSchema.parse({ id: randomUUID(), caseId, runId, sourceEventId: null, stepId: null, kind, observedAt: date, sourceLabel: 'Controlled fixture', displayUrl: kind === 'message_excerpt' ? null : 'https://maple.example.test/application', excerpt, artifactId: null, contentHash: 'a'.repeat(64), provenance });
const snapshot = () => CaseDetailSchema.parse({ case: { id: caseId, recordVersion: 1, title: 'Synthetic rental request', sourceKinds: ['gmail'], sourceRevision: 1, currentAssessment: null, activeRunId: null, latestRunStatus: 'limited', freshness: 'current', reviewStatus: 'unreviewed', updatedAt: date }, sources: [], currentAssessment: null, activeRun: null, latestRun: null, journey: [], evidence: [], historyCursor: null });

test('comparison preserves exact cited quotes and excludes a different run and user statements', () => {
  const message = record('message_excerpt', currentRun, 'The fee is $40.\nNothing else is required.');
  const page = record('page_excerpt', currentRun, 'Required membership: $29 / month.');
  const other = record('page_excerpt', otherRun, 'Unrelated new terms.');
  const detail = snapshot();
  detail.currentAssessment = AssessmentSchema.parse({ id: randomUUID(), caseId, runId: currentRun, version: 1, sourceRevision: 1, verdict: 'confirm_first', impacts: ['money'], finding: { headline: 'A monthly membership is required.', consequence: null, evidenceIds: [message.id, page.id] }, nextAction: { kind: 'review_evidence', label: 'Review charges', evidenceId: page.id }, checkedScope: ['Visible terms'], limitations: [], changeSummary: null, supersedesAssessmentId: null, createdAt: date, provenance });
  detail.case.currentAssessment = detail.currentAssessment;
  detail.evidence = [other, record('user_statement'), message, page];
  const result = comparisonEvidence(detail);
  assert.deepEqual(result.messages, [message]);
  assert.equal(result.messages[0]?.excerpt, 'The fee is $40.\nNothing else is required.');
  assert.equal(result.page, page);
  assert.ok(!result.cited.includes(other));
});

test('before publication, only observations owned by the active run can appear in the comparison', () => {
  const detail = snapshot(), saved = record('page_excerpt');
  detail.activeRun = InvestigationRunSchema.parse({ id: currentRun, caseId, sourceRevision: 1, trigger: 'new_source', status: 'checking', attempt: 1, startedAt: date, finishedAt: null, modelId: 'demo-simulated', promptVersion: 'fixture', policyVersion: 'fixture', toolVersion: 'fixture', provenance, limitations: [], error: null });
  detail.evidence = [record('page_excerpt', otherRun), saved];
  assert.equal(comparisonEvidence(detail).page, saved);
  detail.activeRun = null;
  assert.equal(comparisonEvidence(detail).page, undefined);
});

test('a live or user-origin observation can never receive the illustrative demo screenshot', () => {
  const page = record('page_excerpt');
  assert.equal(demoScreenshot(page), '/demo/rental-checkout.png');
  assert.equal(demoScreenshot({ ...page, provenance: { dataOrigin: 'synthetic', execution: 'live' } }), null);
  assert.equal(demoScreenshot({ ...page, provenance: { dataOrigin: 'user', execution: 'simulated' } }), null);
  assert.equal(demoScreenshot({ ...page, displayUrl: 'https://another.example.test/' }), null);
});
