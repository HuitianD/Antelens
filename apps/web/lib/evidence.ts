import type { CaseDetail, Evidence } from '@beforeyou/contracts';

/** Published comparisons use cited records; pending runs can show only their own saved observations. */
export function comparisonEvidence(detail: CaseDetail) {
  const citedIds = new Set(detail.currentAssessment?.finding.evidenceIds ?? []);
  const pendingRunId = detail.activeRun?.id ?? detail.latestRun?.id;
  const cited = detail.evidence.filter(e => detail.currentAssessment ? citedIds.has(e.id) : pendingRunId && e.runId === pendingRunId);
  const messages = cited.filter(e => e.kind === 'message_excerpt');
  const pages = cited.filter(e => ['page_excerpt', 'permission_request', 'download_metadata', 'form_field'].includes(e.kind));
  const action = detail.currentAssessment?.nextAction;
  const page = pages.find(e => action?.kind === 'review_evidence' && e.id === action.evidenceId) ?? pages[0] ?? cited.find(e => e.kind === 'screenshot');
  return { messages, page, cited };
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
