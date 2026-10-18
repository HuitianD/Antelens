import { Clock3, Download, Fingerprint, KeyRound, Wallet } from 'lucide-react';
import type { CaseSummary, Impact, MessageSummary, Verdict } from '@beforeyou/contracts';
import { EmptyState } from '@beforeyou/ui';
import { overviewCases, overviewCounts, overviewMessages } from '../lib/overview';
import { CaseCard, QuietMessageRow, SearchBox, impactLabels } from './presentation';

const impactIcons = { money: Wallet, identity: Fingerprint, account_access: KeyRound, downloads: Download };
const tabs = [
  ['all', 'All items'],
  ['pause_here', 'Pause here'],
  ['confirm_first', 'Confirm first'],
  ['no_issues_found', 'No action needed'],
] as const;

export function OverviewBoard({ cases, messages, group, impact, query, listLoading, connection, simulated, caseCursor, messageCursor, onGroup, onImpact, onQuery, onOpenCase, onOpenMessage, onMore, onClear, onConnections }: {
  cases: CaseSummary[]; messages: MessageSummary[]; group: 'all' | Verdict; impact: Impact | 'all'; query: string; listLoading: boolean; connection: string; simulated: boolean; caseCursor: string | null; messageCursor: string | null;
  onGroup: (group: 'all' | Verdict) => void; onImpact: (impact: Impact | 'all') => void; onQuery: (query: string) => void; onOpenCase: (id: string) => void; onOpenMessage: (id: string) => void; onMore: () => void; onClear: () => void; onConnections: () => void;
}) {
  const impactFiltered = impact !== 'all';
  const visibleCases = overviewCases(cases, group);
  const visibleMessages = overviewMessages(messages, group, impactFiltered);
  const unassessed = group === 'all' ? cases.filter(item => !item.currentAssessment) : [];
  const counts = overviewCounts(cases, messages, impactFiltered);
  const filtered = Boolean(query) || impactFiltered || group !== 'all';
  const empty = !visibleCases.length && !visibleMessages.length && !unassessed.length;
  return <>
    <div className="panel-heading"><h2>Action requests</h2><SearchBox value={query} onChange={onQuery} /></div>
    <div className="tabs" aria-label="Overview groups"><button className={`tab ${group === 'all' ? 'active' : ''}`} aria-pressed={group === 'all'} onClick={() => onGroup('all')}>All items <span>{counts.all}</span></button>{tabs.slice(1).map(([value, label]) => <button className={`tab ${group === value ? 'active' : ''}`} aria-pressed={group === value} key={value} onClick={() => onGroup(value)}>{label}<span>{value === 'no_issues_found' ? counts.no_action_needed : counts[value]}</span></button>)}</div>
    <div className="filters"><button className={`filter ${impact === 'all' ? 'active' : ''}`} aria-pressed={impact === 'all'} onClick={() => onImpact('all')}>All impacts</button>{(Object.keys(impactLabels) as Impact[]).map(value => { const Icon = impactIcons[value]; return <button key={value} aria-pressed={impact === value} className={`filter ${impact === value ? 'active' : ''}`} onClick={() => onImpact(value)}><Icon size={13} />{impactLabels[value]}</button>; })}</div>
    <div className="cards" aria-busy={listLoading}>{listLoading && !cases.length && !messages.length ? <div className="list-loading" role="status"><div className="skeleton" /><span>Loading saved requests…</span></div> : empty ? <EmptyState title={filtered ? 'No matching items' : 'No assessed requests yet'} action={<button className="soft-btn" onClick={filtered ? onClear : onConnections}>{filtered ? 'Clear filters' : 'Manage connections'}</button>}>{filtered ? 'Try another search or clear your filters.' : 'Received requests will appear here after they are checked.'}</EmptyState> : visibleCases.map(item => <CaseCard key={item.id} item={item} onOpen={onOpenCase} />)}</div>
    {visibleMessages.length > 0 && <div className="message-list overview-messages">{visibleMessages.map(item => <QuietMessageRow key={item.id} message={item} onOpen={onOpenMessage} />)}</div>}
    {unassessed.length > 0 && <section className="updates-section"><h2>Investigations <span>{unassessed.length}</span></h2><div className="cards">{unassessed.map(item => <CaseCard key={item.id} item={item} onOpen={onOpenCase} />)}</div></section>}
    <div className="queue-foot"><span><Clock3 size={13} />{connection}</span><span>{simulated ? 'Simulated investigations' : 'Background investigations'}</span></div>
    {(caseCursor || messageCursor) && <button className="soft-btn load-more" onClick={onMore}>Load more items</button>}
  </>;
}
