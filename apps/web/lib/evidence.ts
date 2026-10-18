import type { CaseDetail, Evidence } from '@beforeyou/contracts';

/** Published comparisons use cited records; pending runs can show only their own saved observations. */
export function comparisonEvidence(detail: CaseDetail) {
  const citedIds = new Set(detail.currentAssessment?.finding.evidenceIds ?? []);
  const pendingRunId = detail.activeRun?.id ?? detail.latestRun?.id;
  const cited = detail.evidence.filter(e => detail.currentAssessment ? citedIds.has(e.id) : pendingRunId && e.runId === pendingRunId);
  const messages = cited.filter(e => e.kind === 'message_excerpt');
  const pages = cited.filter(e => ['page_excerpt', 'permission_request', 'download_metadata', 'form_field'].includes(e.kind));
  const action = detail.currentAssessment?.nextAction;
  const selected = pages.find(e => e.excerpt?.trim()&&action?.kind === 'review_evidence' && e.id === action.evidenceId) ?? pages.find(e=>e.excerpt?.trim()) ?? cited.find(e => e.kind === 'screenshot');
  // A screenshot has no text field. Resolve only the immutable text observation from that exact capture.
  const companion=selected?.kind==='screenshot'&&selected.inspection?detail.evidence.find(e=>e.kind==='page_excerpt'&&e.excerpt?.trim()&&e.caseId===selected.caseId&&e.runId===selected.runId&&e.sourceEventId===selected.sourceEventId&&e.displayUrl===selected.displayUrl&&e.inspection?.captureId===selected.inspection!.captureId&&e.inspection.bundleHash===selected.inspection!.bundleHash):undefined;
  const page=companion??selected;
  return { messages, page, cited, companionText:Boolean(companion) };
}

export function demoScreenshot(evidence: Evidence): string | null {
  return evidence.provenance.execution === 'simulated' && evidence.provenance.dataOrigin === 'synthetic'
    && evidence.displayUrl?.startsWith('https://maple.example.test/')
    && evidence.kind !== 'message_excerpt' ? '/demo/rental-checkout.png' : null;
}

export function displayHost(value: string | null): string {
  if (!value) return '';
  try { return new URL(value).hostname; } catch { return value; }
}
