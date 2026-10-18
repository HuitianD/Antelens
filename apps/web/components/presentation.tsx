import { Check, CircleAlert, Clock3, Globe2, Mail, Pause, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ActivityEvent, CaseSummary, Impact, MessageSummary, RunStatus, Verdict } from '@beforeyou/contracts';
import { shortTime } from '../lib/sources';

export const verdictLabels: Record<Verdict, string> = { pause_here: 'Pause here', confirm_first: 'Confirm first', no_issues_found: 'No issues found' };
export const impactLabels: Record<Impact, string> = { money: 'Money', identity: 'Identity', account_access: 'Account access', downloads: 'Downloads' };
export const runLabels: Record<RunStatus, string> = { queued: 'Queued', checking: 'Checking', complete: 'Complete', limited: 'Limited', failed: 'Failed', cancelled: 'Cancelled' };
export function time(value: string) { return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
export function Badge({ verdict }: { verdict: Verdict }) {
  const Icon = verdict === 'pause_here' ? Pause : verdict === 'confirm_first' ? CircleAlert : Check;
  return <span className={`badge ${verdict}`}><Icon size={12} strokeWidth={2.25} />{verdictLabels[verdict]}</span>;
}
export function StateBadge({ item }: { item: CaseSummary }) {
  if (item.currentAssessment) return <Badge verdict={item.currentAssessment.verdict} />;
  return <span className={`badge neutral state-${item.latestRunStatus}`}><Clock3 size={12} strokeWidth={2.25} />{item.latestRunStatus ? runLabels[item.latestRunStatus] : 'Awaiting investigation'}</span>;
}
/** A visible label keeps list times unambiguous; the exact timestamp stays in the time element. */
export function ListTime({ label, value }: { label: string; value: string }) {
  return <span className="row-time"><span className="row-time-label">{label}</span> <time dateTime={value} title={time(value)}>{shortTime(value)}</time></span>;
}
function SourceIcon({ kind }: { kind: string }) {
  return <span className="row-icon" aria-hidden="true">{kind === 'gmail' ? <Mail size={15} /> : <Globe2 size={15} />}</span>;
}
export function unassessedNote(status: CaseSummary['latestRunStatus']) {
  return status === 'limited' ? 'The page could not be fully inspected.' : status === 'failed' ? 'The investigation ended without an assessment.' : status === 'cancelled' ? 'This investigation was cancelled.' : status === 'queued' ? 'Waiting for the investigation to start.' : 'The investigation is running.';
}
/** One scannable row: original subject, sender, one finding, verdict and a labeled time. */
export function CaseRow({ item, source, selected, onOpen }: { item: CaseSummary; source?: MessageSummary; selected: boolean; onOpen: (id: string) => void }) {
  const a = item.currentAssessment, stale = item.freshness === 'stale';
  const kind = source?.kind ?? (item.sourceKinds.includes('gmail') ? 'gmail' : 'browser');
  const sender = source?.senderLabel || (kind === 'gmail' ? 'Gmail' : 'Browser page');
  return <button type="button" className={`list-row case-row${selected ? ' selected' : ''}${a ? '' : ' unassessed'}`} data-case-id={item.id} aria-current={selected ? 'true' : undefined} onClick={() => onOpen(item.id)}>
    <SourceIcon kind={kind} />
    <span className="row-body">
      <span className="row-line"><strong className="row-subject">{source?.title || item.title}</strong>{source ? <ListTime label="Received" value={source.occurredAt} /> : <ListTime label="Updated" value={item.updatedAt} />}</span>
      <span className="row-sender">{sender}</span>
      <span className="row-finding">{a ? a.finding.headline : unassessedNote(item.latestRunStatus)}</span>
      <span className="row-meta"><StateBadge item={item} />{stale && <span className="row-flag"><Clock3 size={12} />{item.activeRunId ? 'Rechecking' : 'Previous assessment'}</span>}{a && item.reviewStatus === 'unreviewed' && <span className="unread-dot" title="Not opened yet"><span className="sr-only">Not opened yet</span></span>}</span>
    </span>
  </button>;
}
export function QuietMessageRow({ message, selected = false, onOpen }: { message: MessageSummary; selected?: boolean; onOpen: (id: string) => void }) {
  return <button type="button" className={`list-row message-row${selected ? ' selected' : ''}`} aria-current={selected ? 'true' : undefined} onClick={() => onOpen(message.id)}>
    <SourceIcon kind={message.kind} />
    <span className="row-body">
      <span className="row-line"><strong className="row-subject">{message.title}</strong><ListTime label="Received" value={message.occurredAt} /></span>
      <span className="row-sender">{message.senderLabel || message.kind}</span>
      <span className="row-preview">{message.previewText}</span>
      <span className="row-meta"><DispositionTag message={message} /></span>
    </span>
  </button>;
}
export function DispositionTag({ message }: { message: Pick<MessageSummary, 'disposition' | 'processingStatus'> }) {
  return <span className={`tag${message.disposition === 'no_action' ? ' clear' : ''}`}>{message.disposition === 'no_action' ? 'No action needed' : message.disposition === 'pending' ? 'Pending' : 'Action required'}{message.processingStatus === 'failed' ? ', processing failed' : ''}</span>;
}
export function ErrorState({ title, message, action, label = 'Workspace error', children }: { title: string; message: string; action?: ReactNode; label?: string; children?: ReactNode }) {
  return <div className="error-state" role="alert" aria-label={label}><CircleAlert size={18} /><div><strong>{title}</strong><p>{message}</p>{children}</div>{action && <div className="error-action">{action}</div>}</div>;
}
export function activityLabel(e: ActivityEvent) {
  switch (e.type) {
    case 'assessment.published': return verdictLabels[e.data.assessment.verdict] + ': ' + e.data.assessment.finding.headline;
    case 'source.received': return 'New ' + (e.data.kind === 'gmail' ? 'message' : 'page observation') + ' received';
    case 'source.updated': return e.data.disposition === 'no_action' ? 'Message reviewed: no action needed' : 'Source processing updated';
    case 'case.created': return 'Case opened: ' + e.data.case.title;
    case 'case.updated': return 'Case updated';
    case 'case.history_updated': return 'Earlier investigation added to history';
    case 'investigation.queued': return 'Investigation queued';
    case 'investigation.started': return 'Investigation started';
    case 'investigation.step_completed': return e.data.label;
    case 'investigation.limited': return 'Investigation reached a limit';
    case 'investigation.failed': return 'Investigation could not complete';
    case 'investigation.cancelled': return 'Investigation cancelled';
    case 'review.updated': return e.data.reviewStatus === 'viewed' ? 'Assessment viewed' : 'Verification requested';
    case 'connection.updated': return 'Connection status updated';
    case 'resync.required': return 'History synchronized';
  }
}
export function ActivityList({ events, onOpen }: { events: ActivityEvent[]; onOpen: (id: string) => void }) {
  return events.length ? <ol className="activity-page">{events.map(e => <li className="event" key={e.id}>{e.caseId ? <button type="button" onClick={() => onOpen(e.caseId!)}>{activityLabel(e)}</button> : <strong>{activityLabel(e)}</strong>}<time dateTime={e.occurredAt}>{time(e.occurredAt)}</time></li>)}</ol> : <p className="muted activity-empty">No activity yet. Received requests and investigation updates will appear here.</p>;
}
export function SearchBox({ value, onChange, label = 'Search requests' }: { value: string; onChange: (value: string) => void; label?: string }) {
  return <label className="search-wrap"><Search size={14} /><span className="sr-only">{label}</span><input className="search" placeholder="Search" value={value} onChange={e => onChange(e.target.value)} /><kbd aria-hidden="true">/</kbd></label>;
}
