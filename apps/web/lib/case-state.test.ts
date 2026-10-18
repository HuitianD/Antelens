import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import type { Assessment, CaseDetail, CaseSummary, Evidence, JourneyStep, Verdict } from '@beforeyou/contracts';
import { initialCaseListState, reconcileAssessmentHistory, reconcileCaseDetail, reconcileCaseList } from './case-state';

const timestamp = '2026-10-17T12:00:00.000Z';
function summary(verdict: Verdict, recordVersion = 1): CaseSummary {
  const id = randomUUID(); const runId = randomUUID(); const evidenceId = randomUUID();
  const assessment: Assessment = {
    id: randomUUID(), caseId: id, runId, version: 1, sourceRevision: 1, verdict, impacts: ['money'],
    finding: { headline: 'The observed checkout terms.', consequence: null, evidenceIds: [evidenceId] },
    nextAction: { kind: 'review_evidence', label: 'Review terms', evidenceId }, checkedScope: ['Checkout before submission'],
    limitations: [], changeSummary: null, supersedesAssessmentId: null, createdAt: timestamp, provenance: { dataOrigin: 'synthetic', execution: 'simulated' },
  };
  return { id, recordVersion, title: 'Synthetic request', sourceKinds: ['gmail'], sourceRevision: 1, currentAssessment: assessment, activeRunId: null, latestRunStatus: 'complete', freshness: 'current', reviewStatus: 'unreviewed', updatedAt: timestamp };
}
const detail = (item: CaseSummary): CaseDetail => ({ case: item, currentAssessment: item.currentAssessment, sources: [], activeRun: null, latestRun: null, journey: [], evidence: [], historyCursor: null });
const ids = (items: readonly CaseSummary[]) => items.map(item => item.id);

test('initial results prioritize judgments, while same-filter updates preserve card positions and newer state', () => {
  const normal = summary('no_issues_found'), pause = summary('pause_here'), confirm = summary('confirm_first');
  const initial = reconcileCaseList(initialCaseListState(), 'all', [normal, confirm, pause]);
  assert.deepEqual(ids(initial.items), [pause.id, confirm.id, normal.id]);
  const viewed = { ...normal, recordVersion: 3, reviewStatus: 'viewed' as const, updatedAt: '2026-10-17T12:05:00.000Z' };
  const refreshed = reconcileCaseList(initial, 'all', [viewed, confirm, pause]);
  assert.deepEqual(ids(refreshed.items), ids(initial.items));
  assert.equal(refreshed.items[2]!.reviewStatus, 'viewed');
  const delayed = reconcileCaseList(refreshed, 'all', [normal, pause, confirm]);
  assert.deepEqual(ids(delayed.items), ids(initial.items));
  assert.equal(delayed.items[2]!.recordVersion, 3);
  assert.equal(delayed.items[2]!.reviewStatus, 'viewed');
});

test('changed filters replace membership while previously known versions remain authoritative', () => {
  const pause = summary('pause_here', 4), normal = summary('no_issues_found');
  const all = reconcileCaseList(initialCaseListState(), 'all', [normal, pause]);
  const filtered = reconcileCaseList(all, 'normal', [normal]);
  assert.deepEqual(ids(filtered.items), [normal.id]);
  const back = reconcileCaseList(filtered, 'all', [{ ...pause, recordVersion: 2 }, normal]);
  assert.deepEqual(ids(back.items), [pause.id, normal.id]);
  assert.equal(back.items[0]!.recordVersion, 4);
  assert.deepEqual(reconcileCaseList(back, 'no-matches', []).items, []);
  assert.deepEqual(reconcileCaseList(back, 'all', []).items, []);
});

test('pagination merges overlapping results without duplicate cards or version regression', () => {
  const pause = summary('pause_here', 5), normal = summary('no_issues_found');
  const first = reconcileCaseList(initialCaseListState(), 'all', [pause]);
  const next = reconcileCaseList(first, 'all', [{ ...pause, recordVersion: 2 }, normal, normal], true);
  assert.deepEqual(ids(next.items), [pause.id, normal.id]);
  assert.equal(next.items[0]!.recordVersion, 5);
  const changed = reconcileCaseList(next, 'normal', [normal], true);
  assert.deepEqual(ids(changed.items), [normal.id]);
});

test('old case details cannot replace current assessments; equal-version progress still accumulates', () => {
  const item = summary('confirm_first', 5), current = detail(item), runId = item.currentAssessment!.runId;
  const evidence: Evidence = { id: randomUUID(), caseId: item.id, runId, sourceEventId: null, stepId: null, kind: 'page_excerpt', observedAt: timestamp, sourceLabel: 'Synthetic checkout', displayUrl: null, excerpt: 'Monthly renewal remains selected.', artifactId: null, contentHash: 'a'.repeat(64), provenance: { dataOrigin: 'synthetic', execution: 'simulated' } };
  const step: JourneyStep = { id: randomUUID(), runId, index: 0, kind: 'inspect_page', status: 'complete', label: 'Observed renewal terms', fromDisplayUrl: null, toDisplayUrl: null, evidenceIds: [evidence.id], occurredAt: timestamp };
  const progress = reconcileCaseDetail(current, { ...current, journey: [step], evidence: [evidence] });
  assert.equal(progress.journey.length, 1); assert.equal(progress.evidence.length, 1);
  const delayedProgress = reconcileCaseDetail(progress, current);
  assert.equal(delayedProgress.journey.length, 1); assert.equal(delayedProgress.evidence.length, 1);
  const old = detail({ ...item, recordVersion: 4, currentAssessment: null });
  assert.equal(reconcileCaseDetail(progress, old), progress);
  const inconsistentEqual = { ...current, case: { ...item, currentAssessment: null }, currentAssessment: null };
  assert.equal(reconcileCaseDetail(progress, inconsistentEqual).currentAssessment?.id, item.currentAssessment?.id);
  const newer = detail({ ...item, recordVersion: 6, currentAssessment: { ...item.currentAssessment!, id: randomUUID(), runId: randomUUID(), version: 2 } });
  assert.equal(reconcileCaseDetail(progress, newer), newer);
});

test('delayed history pages preserve already received immutable assessment versions', () => {
  const first = summary('confirm_first').currentAssessment!;
  const second = { ...first, id: randomUUID(), version: 2, supersedesAssessmentId: first.id };
  assert.deepEqual(reconcileAssessmentHistory([second, first], [first]).map(item => item.version), [2, 1]);
});
