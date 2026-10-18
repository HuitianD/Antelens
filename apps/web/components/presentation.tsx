import { ArrowRight, Check, CircleAlert, Clock3, Globe2, Mail, Pause, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ActivityEvent, CaseSummary, Impact, RunStatus, Verdict } from '@beforeyou/contracts';

export const verdictLabels: Record<Verdict, string> = { pause_here: 'Pause here', confirm_first: 'Confirm first', no_issues_found: 'No issues found' };
export const impactLabels: Record<Impact, string> = { money: 'Money', identity: 'Identity', account_access: 'Account access', downloads: 'Downloads' };
export const runLabels: Record<RunStatus, string> = { queued: 'Queued', checking: 'Checking', complete: 'Complete', limited: 'Limited', failed: 'Failed', cancelled: 'Cancelled' };
export function time(value: string) { return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
export function Badge({ verdict }: { verdict: Verdict }) {
  const Icon = verdict === 'pause_here' ? Pause : verdict === 'confirm_first' ? CircleAlert : Check;
  return <span className={`badge ${verdict}`}><Icon size={13} />{verdictLabels[verdict]}</span>;
}
export function StateBadge({ item }: { item: CaseSummary }) {
  if (item.currentAssessment) return <Badge verdict={item.currentAssessment.verdict} />;
  return <span className={`badge neutral state-${item.latestRunStatus}`}><Clock3 size={13} />{item.latestRunStatus ? runLabels[item.latestRunStatus] : 'Awaiting investigation'}</span>;
}
export function CaseCard({ item, onOpen }: { item: CaseSummary; onOpen: (id: string) => void }) {
  const a = item.currentAssessment, stale = item.freshness === 'stale';
  const status = item.latestRunStatus;
  const pending = status === 'queued' || status === 'checking';
  return <article className={`case-card ${!a ? 'unassessed' : ''} ${stale ? 'stale' : ''}`} data-case-id={item.id}>
    <div className="card-top"><span className="source"><span className="source-icon">{item.sourceKinds.includes('gmail') ? <Mail size={15} /> : <Globe2 size={15} />}</span>{item.sourceKinds.includes('gmail') ? 'Gmail' : 'Browser'}</span><span className="case-no">{a ? `Version ${a.version}` : 'Investigation'}</span></div>
    <div className="badge-row"><StateBadge item={item} />{a?.impacts.map(i => <span key={i} className="tag">{impactLabels[i]}</span>)}</div>
    <h3>{a?.finding.headline || item.title}</h3>
    <p className="card-note">{a ? <><span>{stale ? 'Previously checked' : 'Checked'} {time(a.createdAt)}</span>{a.version > 1 && <span className="updated-label">Updated</span>}</> : status === 'limited' ? 'The page could not be fully inspected.' : status === 'failed' ? 'The investigation ended without an assessment.' : status === 'cancelled' ? 'This investigation was cancelled.' : status === 'queued' ? 'Waiting for the investigation to start.' : 'The investigation is running.'}</p>
    {stale && <p className="card-run-note"><Clock3 size={13} />Previous assessment{status ? ` · ${runLabels[status].toLowerCase()}` : ''}</p>}
    {a?.finding.consequence && <div className="next-step"><span>If you continue</span><p>{a.finding.consequence}</p></div>}
    {a && !a.finding.consequence && <div className="next-step checked-card-scope"><span>Checked scope</span><p>{a.checkedScope[0]}</p></div>}
    {!a && <div className="unassessed-note">{pending ? <span className="processing-dot" /> : <CircleAlert size={15} />}<span>{pending ? 'No judgment yet' : 'No assessment published'}</span></div>}
    <button className="card-cta" onClick={() => onOpen(item.id)}>{a?.nextAction.label || (status === 'limited' ? 'Review the limitation' : status === 'failed' ? 'Review and retry' : 'View investigation')}<ArrowRight size={17} /></button>
  </article>;
}
export function ErrorState({ title, message, action, label = 'Workspace error', children }: { title: string; message: string; action?: ReactNode; label?: string; children?: ReactNode }) {
  return <div className="error-state" role="alert" aria-label={label}><CircleAlert size={20} /><div><strong>{title}</strong><p>{message}</p>{children}</div>{action && <div className="error-action">{action}</div>}</div>;
}
export function activityLabel(e: ActivityEvent) {
  switch (e.type) {
    case 'assessment.published': return verdictLabels[e.data.assessment.verdict] + ' · ' + e.data.assessment.finding.headline;
    case 'source.received': return 'New ' + (e.data.kind === 'gmail' ? 'message' : 'page observation') + ' received';
    case 'source.updated': return e.data.disposition === 'no_action' ? 'Message reviewed · No action needed' : 'Source processing updated';
    case 'case.created': return 'Case opened · ' + e.data.case.title;
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
export function ActivityList({ events, onOpen, compact = false }: { events: ActivityEvent[]; onOpen: (id: string) => void; compact?: boolean }) {
  return <div className={compact ? 'activity-list' : 'activity-page'}>{events.length ? events.map((e, i) => <div className={`event ${i === 0 ? 'latest' : ''}`} key={e.id}>{e.caseId ? <button onClick={() => onOpen(e.caseId!)}>{activityLabel(e)}</button> : <strong>{activityLabel(e)}</strong>}<time dateTime={e.occurredAt}>{time(e.occurredAt)}</time></div>) : <p className="muted">No activity yet. Received requests and investigation updates will appear here.</p>}</div>;
}
export function SearchBox({ value, onChange, label = 'Search requests' }: { value: string; onChange: (value: string) => void; label?: string }) {
  return <label className="search-wrap"><Search size={16} /><span className="sr-only">{label}</span><input className="search" placeholder="Search…" value={value} onChange={e => onChange(e.target.value)} /><kbd aria-hidden="true">/</kbd></label>;
}
