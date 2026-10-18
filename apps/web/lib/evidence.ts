import type { Assessment, CaseDetail, Evidence } from '@beforeyou/contracts';

/** A shared URL is insufficient: observations must belong to the same immutable capture. */
export function sameCapture(left: Evidence, right: Evidence): boolean {
  if (left.caseId !== right.caseId || left.runId !== right.runId || left.sourceEventId !== right.sourceEventId || left.displayUrl !== right.displayUrl) return false;
  if (left.inspection || right.inspection) return Boolean(left.inspection && right.inspection && left.inspection.captureId === right.inspection.captureId && left.inspection.bundleHash === right.inspection.bundleHash);
  return Boolean(left.stepId && left.stepId === right.stepId);
}

/** Published comparisons use cited records; pending runs can show only their own saved observations. */
export function comparisonEvidence(detail: CaseDetail, assessment: Assessment | null = detail.currentAssessment) {
  const citedIds = new Set(assessment?.finding.evidenceIds ?? []);
  const pendingRunId = detail.activeRun?.id ?? detail.latestRun?.id;
  const cited = detail.evidence.filter(e => e.caseId === detail.case.id && (assessment ? assessment.caseId === detail.case.id && e.runId === assessment.runId && citedIds.has(e.id) : pendingRunId && e.runId === pendingRunId));
  const messages = cited.filter(e => e.kind === 'message_excerpt');
  const pages = cited.filter(e => ['page_excerpt', 'permission_request', 'download_metadata', 'form_field'].includes(e.kind));
  const action = assessment?.nextAction;
  const selected = cited.find(e => action?.kind === 'review_evidence' && e.id === action.evidenceId && (pages.includes(e) || e.kind === 'screenshot')) ?? pages.find(e => e.excerpt?.trim()) ?? cited.find(e => e.kind === 'screenshot');
  // A screenshot has no text field. Resolve only the immutable text observation from that exact capture.
  const companion = selected?.kind === 'screenshot' ? detail.evidence.find(e => e.kind === 'page_excerpt' && e.excerpt?.trim() && sameCapture(e, selected)) : undefined;
  const page = companion ?? selected;
  const image = page && (page.kind === 'screenshot' ? page : detail.evidence.find(e => e.kind === 'screenshot' && e.artifactId && sameCapture(e, page)));
  return { messages, page, image, cited, companionText: Boolean(companion), missingCitations: [...citedIds].some(id => !cited.some(e => e.id === id)) };
}

export function sourceEvidence(detail: CaseDetail, assessment: Assessment | null = detail.currentAssessment) {
  const comparison = comparisonEvidence(detail, assessment);
  const email = detail.sources.some(s => s.kind === 'gmail') || detail.case.sourceKinds.includes('gmail');
  const browser = detail.sources.some(s => s.kind === 'browser') || detail.case.sourceKinds.includes('browser');
  const displayedRunId = assessment?.runId ?? detail.activeRun?.id ?? detail.latestRun?.id;
  const captured = Boolean(comparison.page?.inspection || [detail.activeRun, detail.latestRun].some(run => run?.id === displayedRunId && run?.pageCaptureId));
  const hasPage = Boolean(comparison.page) || captured || (!email && browser);
  const emailIds = new Set(assessment ? comparison.messages.map(e => e.sourceEventId) : detail.sources.filter(s => s.kind === 'gmail').map(s => s.id));
  const uninspectedLinks = !hasPage && !comparison.missingCitations ? [...new Set((detail.sourceReferences ?? []).filter(ref => emailIds.has(ref.sourceEventId)).flatMap(ref => ref.links).filter(url => sourceUrl(url)))]: [];
  return { ...comparison, email, hasPage, uninspectedLinks, scope: captured ? 'Offline page inspection' : !hasPage && email && !comparison.missingCitations ? 'Email only' : null };
}

export function sourceUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; }
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
