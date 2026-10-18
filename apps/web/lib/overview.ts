import type { CaseSummary, MessageSummary, Verdict } from '@beforeyou/contracts';

export type OverviewGroup = 'all' | Verdict;

/** The active assessment is the stored judgment, including one kept visible while a recheck is in progress. Missing assessments stay out of the verdict groups. */
export function hasActiveVerdict(item: CaseSummary, verdict: Verdict): boolean {
  return item.currentAssessment?.verdict === verdict;
}

/**
 * Reading-only messages that triage completed as no_action and that are not already shown through a case.
 * Pending, failed, and action-required messages are excluded. No assessment is created here.
 */
export function ordinaryNoActionMessages(messages: readonly MessageSummary[]): MessageSummary[] {
  return messages.filter(message => message.disposition === 'no_action' && message.processingStatus === 'complete' && message.caseIds.length === 0);
}

export function overviewCases(cases: readonly CaseSummary[], group: OverviewGroup): CaseSummary[] {
  if (group === 'all') return cases.filter(item => item.currentAssessment);
  if (group === 'no_issues_found') return cases.filter(item => hasActiveVerdict(item, 'no_issues_found'));
  return cases.filter(item => hasActiveVerdict(item, group));
}

export function overviewMessages(messages: readonly MessageSummary[], group: OverviewGroup, impactFiltered: boolean): MessageSummary[] {
  if (impactFiltered || (group !== 'all' && group !== 'no_issues_found')) return [];
  return ordinaryNoActionMessages(messages);
}

export function overviewCounts(cases: readonly CaseSummary[], messages: readonly MessageSummary[], impactFiltered = false) {
  const ordinary = overviewMessages(messages, 'no_issues_found', impactFiltered);
  const pause = cases.filter(item => hasActiveVerdict(item, 'pause_here')).length;
  const confirm = cases.filter(item => hasActiveVerdict(item, 'confirm_first')).length;
  const clear = cases.filter(item => hasActiveVerdict(item, 'no_issues_found')).length;
  const assessed = cases.filter(item => item.currentAssessment).length;
  const unassessed = cases.filter(item => !item.currentAssessment).length;
  return {
    all: assessed + ordinary.length + unassessed,
    pause_here: pause,
    confirm_first: confirm,
    no_action_needed: clear + ordinary.length,
  };
}
