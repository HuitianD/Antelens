import type { Assessment, Impact, Limitation } from '@beforeyou/contracts';

const IMPACTS = new Set<Impact>(['money', 'identity', 'account_access', 'downloads']);

/** Connect the saved judgment to the observed concern. Scope lines stay limited to the impacts on this assessment. */
export function nextStepCopy(assessment: Pick<Assessment, 'verdict' | 'finding' | 'impacts' | 'checkedScope'>): { lead: string; reasons: string[] } {
  const concern = assessment.finding.consequence ?? assessment.finding.headline;
  const lead = assessment.verdict === 'pause_here'
    ? `Pause here before you continue. ${concern}`
    : assessment.verdict === 'confirm_first'
      ? `Confirm this before you continue. ${concern}`
      : assessment.finding.consequence
        ? `No issue was found in the checked scope. ${assessment.finding.consequence}`
        : 'No issue was found in the checked scope.';
  const reasons = assessment.checkedScope.flatMap(line => {
    const split = line.indexOf(':');
    if (split <= 0) return [];
    const impact = line.slice(0, split).trim().toLowerCase();
    if (!IMPACTS.has(impact as Impact) || !assessment.impacts.includes(impact as Impact)) return [];
    const body = line.slice(split + 1).trim();
    if (!body || /^no\b/i.test(body)) return [];
    return [body.charAt(0).toUpperCase() + body.slice(1)];
  });
  return { lead, reasons };
}

/** Saved scope and the longest message for each limitation, so the judgment's basis stays visible. */
export function reasoningLines(input: { checkedScope: readonly string[]; limitations: readonly Pick<Limitation, 'code' | 'message'>[] }): { checked: string[]; limits: string[] } {
  const limits = new Map<string, string>();
  for (const item of input.limitations) {
    const current = limits.get(item.code);
    if (!current || item.message.length > current.length) limits.set(item.code, item.message);
  }
  return { checked: [...input.checkedScope], limits: [...limits.values()] };
}
