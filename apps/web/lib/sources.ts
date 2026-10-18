import type { MessageSummary } from '@beforeyou/contracts';

/** The earliest received source for each case: the original request a list row names. Later replies do not replace it. */
export function originalSources(messages: readonly MessageSummary[]): Map<string, MessageSummary> {
  const byCase = new Map<string, MessageSummary>();
  for (const message of messages) for (const caseId of message.caseIds) {
    const current = byCase.get(caseId);
    if (!current || Date.parse(message.occurredAt) < Date.parse(current.occurredAt)) byCase.set(caseId, message);
  }
  return byCase;
}

/** Compact list time: clock time for today, otherwise the date. The full timestamp stays available to assistive technology and on hover. */
export function shortTime(value: string, now = new Date()): string {
  const date = new Date(value);
  const sameDay = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  return sameDay
    ? date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }) });
}
