import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { AssessmentSchema, CaseDetailSchema, EvidenceSchema, InvestigationRunSchema } from '@beforeyou/contracts';
import { comparisonEvidence, demoScreenshot, sameCapture, sourceEvidence } from './evidence';

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

test('a screenshot-only citation resolves exact persisted text from its capture, never assessment prose or another run',()=>{
 const detail=snapshot(),page=record('page_excerpt',currentRun,'Stored page text: membership $29 per month.');
 const inspection={method:'captured_page_daytona' as const,label:'Captured page inspected in Daytona' as const,captureId:randomUUID(),bundleHash:'b'.repeat(64),sandboxId:'mock-evidence-test',capturedAt:date,inspectedAt:date,networkRequests:0 as const};
 page.inspection=inspection;
 const screenshot={...record('screenshot'),excerpt:null,inspection};
 detail.currentAssessment=AssessmentSchema.parse({id:randomUUID(),caseId,runId:currentRun,version:6,sourceRevision:1,verdict:'confirm_first',impacts:['money'],finding:{headline:'Generated finding that is not evidence.',consequence:null,evidenceIds:[screenshot.id]},nextAction:{kind:'review_evidence',label:'Review screenshot',evidenceId:screenshot.id},checkedScope:['Generated checked-scope prose that must never fill an excerpt.'],limitations:[],changeSummary:null,supersedesAssessmentId:null,createdAt:date,provenance});
 const wrongCapture={...page,id:randomUUID(),inspection:{...inspection,captureId:randomUUID()},excerpt:'Unrelated capture'};
 const wrongRun={...page,id:randomUUID(),runId:otherRun,excerpt:'Old run text'};
 detail.evidence=[wrongCapture,wrongRun,screenshot,page];
 const comparison=comparisonEvidence(detail);
 assert.equal(comparison.page,page);assert.equal(comparison.companionText,true);
 assert.deepEqual(comparison.cited,[screenshot]);
 detail.evidence=[wrongCapture,wrongRun,screenshot];
 assert.equal(comparisonEvidence(detail).page,screenshot);assert.equal(comparisonEvidence(detail).companionText,false);
});

test('historical evidence cannot use a newer run, another case, or generated scope text', () => {
  const detail = snapshot(), oldPage = record('page_excerpt', otherRun, 'Earlier fee: $29.'), newPage = record('page_excerpt', currentRun, 'Current fee: $39.');
  const assessment = (runId: string, version: number, ids: string[]) => AssessmentSchema.parse({ id: randomUUID(), caseId, runId, version, sourceRevision: 1, verdict: 'confirm_first', impacts: ['money'], finding: { headline: 'Review the saved fee.', consequence: null, evidenceIds: ids }, nextAction: { kind: 'review_steps', label: 'Review steps' }, checkedScope: ['Generated scope is not a quotation.'], limitations: [], changeSummary: null, supersedesAssessmentId: null, createdAt: date, provenance });
  detail.currentAssessment = assessment(currentRun, 2, [newPage.id]);
  const history = assessment(otherRun, 1, [oldPage.id]);
  detail.evidence = [newPage, oldPage];
  assert.equal(comparisonEvidence(detail, history).page?.excerpt, 'Earlier fee: $29.');
  history.finding.evidenceIds.push(newPage.id);
  assert.deepEqual(comparisonEvidence(detail, history).cited, [oldPage]);
  assert.equal(comparisonEvidence(detail, history).missingCitations, true);
  detail.evidence = [{ ...oldPage, caseId: randomUUID() }];
  assert.equal(comparisonEvidence(detail, history).page, undefined);
});

test('source presentation only labels saved email links; browser checks have no email comparison', () => {
  const detail = snapshot();
  assert.equal(sourceEvidence(detail).scope, 'Email only');
  assert.equal(sourceEvidence(detail).hasPage, false);
  assert.deepEqual(sourceEvidence(detail).uninspectedLinks, []);
  const sourceId = randomUUID();
  detail.sources = [{ id: sourceId, kind: 'gmail' } as any];
  detail.sourceReferences = [{ sourceEventId: sourceId, originalUrl: 'https://mail.google.com/mail/u/0/#inbox/id', links: ['https://rental.example.test/apply', 'javascript:alert(1)'] }];
  assert.deepEqual(sourceEvidence(detail).uninspectedLinks, ['https://rental.example.test/apply']);
  detail.case.sourceKinds = ['browser']; detail.sources = [];
  assert.equal(sourceEvidence(detail).email, false);
  assert.equal(sourceEvidence(detail).hasPage, true);
});

test('matching screenshots requires capture identity or the same recorded step, not merely a URL', () => {
  const page = record('page_excerpt'), screenshot = { ...record('screenshot'), excerpt: null };
  assert.equal(sameCapture(page, screenshot), false);
  page.stepId = randomUUID(); screenshot.stepId = page.stepId;
  assert.equal(sameCapture(page, screenshot), true);
  screenshot.sourceEventId = randomUUID();
  assert.equal(sameCapture(page, screenshot), false);
});
