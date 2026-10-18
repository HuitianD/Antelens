import type { KeyboardEvent, ReactNode } from 'react';
import type { CaseSummary, Impact, MessageSummary, Verdict } from '@beforeyou/contracts';
import { EmptyState } from '@beforeyou/ui';
import { overviewCases, overviewCounts, overviewMessages } from '../lib/overview';
import { CaseRow, QuietMessageRow, impactLabels } from './presentation';

export const groupTabs = [
  ['all', 'All items'],
  ['pause_here', 'Pause here'],
  ['confirm_first', 'Confirm first'],
  ['no_issues_found', 'No action needed'],
] as const;
export type OverviewCounts = ReturnType<typeof overviewCounts>;
export function groupCount(counts: OverviewCounts, value: 'all' | Verdict) {
  return value === 'no_issues_found' ? counts.no_action_needed : counts[value];
}

/** Up/down arrows move between rows, as in a mail list; Enter and Space use the native button. */
export function listKeys(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  const rows = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('.list-row')];
  const at = rows.indexOf(document.activeElement as HTMLButtonElement);
  const next = rows[event.key === 'ArrowDown' ? Math.min(rows.length - 1, at + 1) : Math.max(0, at - 1)];
  if (next) { event.preventDefault(); next.focus(); }
}

export function GroupTabs({ group, counts, onGroup, className }: { group: 'all' | Verdict; counts: OverviewCounts; onGroup: (group: 'all' | Verdict) => void; className: string }) {
  return <div className={className} role="group" aria-label="Overview groups">{groupTabs.map(([value, label]) => <button type="button" key={value} className={`group-tab${group === value ? ' active' : ''}`} aria-pressed={group === value} onClick={() => onGroup(value)}><span>{label}</span><span className="count">{groupCount(counts, value)}</span></button>)}</div>;
}

export function OverviewBoard({ cases, messages, sources, selectedCase, selectedMessage, group, impact, query, listLoading, caseCursor, messageCursor, counts, header, onGroup, onImpact, onOpenCase, onOpenMessage, onMore, onClear, onConnections }: {
  cases: CaseSummary[]; messages: MessageSummary[]; sources: Map<string, MessageSummary>; selectedCase: string | null; selectedMessage: string | null; group: 'all' | Verdict; impact: Impact | 'all'; query: string; listLoading: boolean; caseCursor: string | null; messageCursor: string | null; counts: OverviewCounts; header: ReactNode;
  onGroup: (group: 'all' | Verdict) => void; onImpact: (impact: Impact | 'all') => void; onOpenCase: (id: string) => void; onOpenMessage: (id: string) => void; onMore: () => void; onClear: () => void; onConnections: () => void;
}) {
  const impactFiltered = impact !== 'all';
  const visibleCases = overviewCases(cases, group);
  const visibleMessages = overviewMessages(messages, group, impactFiltered);
  const unassessed = group === 'all' ? cases.filter(item => !item.currentAssessment) : [];
  const filtered = Boolean(query) || impactFiltered || group !== 'all';
  const empty = !visibleCases.length && !visibleMessages.length && !unassessed.length;
  const row = (item: CaseSummary) => <CaseRow key={item.id} item={item} source={sources.get(item.id)} selected={selectedCase === item.id} onOpen={onOpenCase} />;
  return <>
    {header}
    <GroupTabs className="mobile-groups" group={group} counts={counts} onGroup={onGroup} />
    <div className="impact-filters" role="group" aria-label="Impact">{(Object.keys(impactLabels) as Impact[]).map(value => <button type="button" key={value} aria-pressed={impact === value} className={`chip${impact === value ? ' active' : ''}`} onClick={() => onImpact(impact === value ? 'all' : value)}>{impactLabels[value]}</button>)}</div>
    <div className="list-scroll" aria-busy={listLoading} onKeyDown={listKeys}>
      {listLoading && !cases.length && !messages.length ? <div className="list-loading" role="status" aria-label="Loading saved requests">{[1, 2, 3, 4].map(n => <div key={n} className="row-skeleton" />)}</div>
        : empty ? <EmptyState title={filtered ? 'No matching items' : 'No assessed requests yet'} action={<button className="soft-btn" onClick={filtered ? onClear : onConnections}>{filtered ? 'Clear filters' : 'Manage connections'}</button>}>{filtered ? 'Try another search or clear your filters.' : 'Received requests will appear here after they are checked.'}</EmptyState>
        : <>
          {visibleCases.length > 0 && <div className="list-group">{visibleCases.map(row)}</div>}
          {unassessed.length > 0 && <section className="list-group" aria-labelledby="group-investigations"><h2 className="list-subhead" id="group-investigations">Investigations <span>{unassessed.length}</span></h2>{unassessed.map(row)}</section>}
          {visibleMessages.length > 0 && <section className="list-group" aria-labelledby="group-quiet"><h2 className="list-subhead" id="group-quiet">Messages with no action needed <span>{visibleMessages.length}</span></h2>{visibleMessages.map(item => <QuietMessageRow key={item.id} message={item} selected={selectedMessage === item.id} onOpen={onOpenMessage} />)}</section>}
        </>}
      {(caseCursor || messageCursor) && <button className="soft-btn load-more" onClick={onMore}>Load more items</button>}
    </div>
  </>;
}
