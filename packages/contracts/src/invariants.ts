import { AssessmentProposalSchema, TriageProposalSchema, type AppMode, type AssessmentProposal, type CaseSummary, type DashboardCounts, type Evidence, type InvestigationRun, type RunStatus, type TriageProposal } from './index';

export class ContractViolation extends Error {
  readonly code = 'OUTPUT_INVALID';
  constructor(message: string) { super(message); this.name = 'ContractViolation'; }
}

const transitions: Record<RunStatus, readonly RunStatus[]> = {
  queued: ['checking', 'cancelled'], checking: ['complete', 'limited', 'failed', 'cancelled'],
  complete: [], limited: [], failed: [], cancelled: [],
};
export function canTransitionRun(from: RunStatus, to: RunStatus): boolean { return transitions[from].includes(to); }
export function assertRunTransition(from: RunStatus, to: RunStatus): void {
  if (!canTransitionRun(from, to)) throw new ContractViolation(`A ${from} run cannot transition to ${to}. Create a new run for a recheck.`);
}

export function assertTriageProposal(input: unknown, context: { candidateCaseIds: readonly string[]; linkCount: number }): TriageProposal {
  const proposal = TriageProposalSchema.parse(input);
  if (proposal.candidateCaseId && !context.candidateCaseIds.includes(proposal.candidateCaseId)) throw new ContractViolation('The candidate case is outside the authorized source context.');
  if (proposal.relevantLinkIndexes.some((index) => index >= context.linkCount)) throw new ContractViolation('The selected link does not exist in the source.');
  if (new Set(proposal.relevantLinkIndexes).size !== proposal.relevantLinkIndexes.length) throw new ContractViolation('The selected source links contain duplicates.');
  return proposal;
}

/** Evidence must be loaded by an owner-scoped repository. Never pass model-created records. */
export function assertAssessmentProposal(context: {
  proposal: unknown; run: InvestigationRun; evidence: readonly Evidence[];
  sourceEventIds: readonly string[]; mode: AppMode;
  finalStatus?: 'complete' | 'limited';
}): AssessmentProposal {
  const { run, mode } = context;
  const proposal = AssessmentProposalSchema.parse(context.proposal);
  const status = context.finalStatus ?? run.status;
  if (status !== 'complete' && status !== 'limited') throw new ContractViolation('Only complete or limited investigations can publish an assessment.');
  if (mode === 'live' && run.provenance.execution !== 'live') throw new ContractViolation('Live cases cannot publish a simulated assessment.');
  if (proposal.verdict === null) return proposal;
  if (proposal.verdict === 'no_issues_found' && status !== 'complete') throw new ContractViolation('Incomplete checks cannot produce No issues found.');
  const evidence = new Map(context.evidence.filter((item) => item.caseId === run.caseId).map((item) => [item.id, item]));
  const ids = [
    ...(proposal.finding?.evidenceIds ?? []),
    ...proposal.limitations.flatMap((item) => item.evidenceIds),
    ...(proposal.nextAction?.kind === 'review_evidence' ? [proposal.nextAction.evidenceId] : []),
  ];
  for (const id of ids) {
    const item = evidence.get(id);
    if (!item) throw new ContractViolation('A finding references missing or unauthorized evidence.');
    if (item.runId !== null && item.runId !== run.id) throw new ContractViolation('A finding must be grounded in observations from this run.');
    if (item.sourceEventId && !context.sourceEventIds.includes(item.sourceEventId)) throw new ContractViolation('Evidence belongs to an unrelated source.');
    if (mode === 'live' && item.provenance.execution === 'simulated') throw new ContractViolation('Simulated evidence cannot support a live assessment.');
  }
  if (proposal.nextAction?.kind === 'open_source' && !context.sourceEventIds.includes(proposal.nextAction.sourceEventId)) throw new ContractViolation('The primary action points outside the authorized source context.');
  const observedKinds = new Set(['page_excerpt', 'screenshot', 'redirect', 'form_field', 'permission_request', 'download_metadata', 'external_record']);
  const findingEvidence = (proposal.finding?.evidenceIds ?? []).map((id) => evidence.get(id)!);
  if (findingEvidence.some((item) => observedKinds.has(item.kind))) return proposal;
  // A request stated in the message itself may support a concern only when the run is explicitly limited.
  const messageOnlyConcern = status === 'limited' && proposal.limitations.length > 0 && findingEvidence.some((item) => item.kind === 'message_excerpt');
  if (!messageOnlyConcern) throw new ContractViolation('A published judgment requires a supporting observation, not only a message or user statement.');
  return proposal;
}

export function dashboardCounts(cases: readonly CaseSummary[]): DashboardCounts {
  const counts: DashboardCounts = { pause_here: 0, confirm_first: 0, no_issues_found: 0, checking: 0, limited: 0, stale: 0 };
  for (const item of cases) {
    if (item.freshness === 'current' && item.currentAssessment) counts[item.currentAssessment.verdict] += 1;
    if (item.latestRunStatus === 'queued' || item.latestRunStatus === 'checking') counts.checking += 1;
    if (item.latestRunStatus === 'limited') counts.limited += 1;
    if (item.freshness === 'stale') counts.stale += 1;
  }
  return counts;
}

/** A history-only event must never move the current assessment pointer. */
export function applyCaseSnapshot(current: CaseSummary | undefined, incoming: CaseSummary): CaseSummary {
  if (current && current.id !== incoming.id) throw new ContractViolation('Cannot apply another case to this record.');
  return current && incoming.recordVersion <= current.recordVersion ? current : incoming;
}

export function serializeSse(event: import('./index').ActivityEvent): string {
  // JSON strings escape line breaks; cursors/types are constrained before transport.
  if (/[\r\n]/.test(event.id)) throw new ContractViolation('Invalid event cursor.');
  return `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}
