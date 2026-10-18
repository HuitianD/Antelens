'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Eye, ExternalLink, Globe2, RefreshCw, Mail, ChevronDown, History, X } from 'lucide-react';
import { z } from 'zod';
import { AcceptedRunSchema, AssessmentSchema, CaseDetailSchema, MessageDetailSchema, PageSchema, type Assessment, type CaseDetail, type MessageDetail } from '@beforeyou/contracts';
import { isDemo, post, request } from '../lib/api';
import { reconcileAssessmentHistory, reconcileCaseDetail } from '../lib/case-state';
import { nextStepCopy, reasoningLines } from '../lib/next-step';
import { Badge, DispositionTag, ErrorState, impactLabels, StateBadge, time, unassessedNote } from './presentation';
import { EvidenceComparison, EvidenceImage, QuoteRecord, SourceLink } from './evidence-viewer';
import { InvestigationProgress } from './investigation-progress';

/** Shared frame for the right-hand panel. On narrow screens it covers the list and the back control returns to it. */
function DetailFrame({ label, crumb, title, onClose, actions, children }: { label: string; crumb: string; title?: string; onClose: () => void; actions?: ReactNode; children: ReactNode }) {
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (window.matchMedia('(max-width: 760px)').matches) back.current?.focus({ preventScroll: true }); }, []);
  return <section className="detail" aria-label={label}>
    <header className="detail-bar">
      <button ref={back} type="button" className="icon-btn back-btn" aria-label="Back to list" onClick={onClose}><ArrowLeft size={16} /></button>
      <p className="detail-crumb"><span>{crumb}</span>{title && <><span aria-hidden="true">/</span><strong>{title}</strong></>}</p>
      <div className="detail-bar-actions">{actions}<button type="button" className="icon-btn close-btn" aria-label={label === 'Message' ? 'Close message' : 'Close case'} onClick={onClose}><X size={16} /></button></div>
    </header>
    <div className="detail-scroll"><div className="detail-inner">{children}</div></div>
  </section>;
}

function reveal(id: string, open = false) {
  const target = document.getElementById(id);
  if (!target) return;
  if (open && target instanceof HTMLDetailsElement) target.open = true;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  target.focus({ preventScroll: true });
}

export function CaseDetailPanel({ id, crumb, subject, revision, onClose, onRefresh }: { id: string; crumb: string; subject?: string; revision: number; onClose: () => void; onRefresh: () => void }) {
  const [detail, setDetail] = useState<CaseDetail | null>(null), [history, setHistory] = useState<Assessment[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false), [browser, setBrowser] = useState(false), [note, setNote] = useState(''), [notice, setNotice] = useState(''), [openHistoryEvidence, setOpenHistoryEvidence] = useState<Record<string, boolean>>({}), [archiveOpen, setArchiveOpen] = useState(false);
  const viewed = useRef(''), detailSnapshot = useRef<CaseDetail | null>(null);
  useEffect(() => { detailSnapshot.current = null; setDetail(null); setHistory([]); setError(''); setBrowser(false); setNote(''); setNotice(''); setOpenHistoryEvidence({}); setArchiveOpen(false); }, [id]);
  useEffect(() => {
    let valid = true;
    void Promise.all([request(`/cases/${id}`, CaseDetailSchema), request(`/cases/${id}/assessments`, PageSchema(AssessmentSchema))]).then(([d, h]) => {
      if (!valid) return;
      const next = reconcileCaseDetail(detailSnapshot.current, d.data);
      detailSnapshot.current = next; setDetail(next); setHistory(previous => reconcileAssessmentHistory(previous, h.data.items)); setError('');
      const a = next.currentAssessment;
      if (a && viewed.current !== a.id) { viewed.current = a.id; void post(`/cases/${id}/viewed`, z.unknown(), { assessmentId: a.id }).then(onRefresh).catch(() => {}); }
    }).catch(e => { if (valid) setError(e.message); });
    return () => { valid = false; };
  }, [id, revision, onRefresh]);
  const a = detail?.currentAssessment, run = detail?.activeRun || detail?.latestRun || null;
  const original = detail ? [...detail.sources].sort((x, y) => Date.parse(x.occurredAt) - Date.parse(y.occurredAt)) : [];
  const emailSources = original.filter(s => s.kind === 'gmail');
  const hasEmail = emailSources.length > 0 || Boolean(detail?.case.sourceKinds.includes('gmail'));
  const visibleSources = emailSources.length ? emailSources : original;
  async function recheck(reason: 'user_recheck' | 'verification_requested') {
    setBusy(true); setError('');
    try { await post(`/cases/${id}/rechecks`, AcceptedRunSchema, { reason, ...(note.trim() ? { note: note.trim() } : {}) }); setNotice('Recheck queued. Your note is saved as a statement to review.'); onRefresh(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  function nextAction() {
    if (!a) return;
    const action = a.nextAction;
    if (action.kind === 'review_evidence') { if (document.getElementById(`evidence-${action.evidenceId}`)) reveal(`evidence-${action.evidenceId}`); else reveal('comparison'); }
    else if (action.kind === 'review_steps') reveal('journey');
    else if (action.kind === 'open_source') reveal('original');
    else reveal('verification-note', true);
  }
  const running = Boolean(detail?.activeRun);
  const recheckLabel = running ? 'Investigation in progress' : busy ? 'Queuing…' : 'Recheck request';
  const step = a ? nextStepCopy(a) : null;
  const reasoning = a ? reasoningLines(a) : null;
  const title = subject ?? original[0]?.title ?? detail?.case.title;
  return <DetailFrame label="Case detail" crumb={crumb} title={title} onClose={onClose} actions={isDemo && detail ? <button type="button" className="soft-btn compact" aria-label="Browser panel preview" aria-pressed={browser} onClick={() => setBrowser(b => !b)}><Globe2 size={14} /><span className="btn-text">Browser panel preview</span></button> : undefined}>
    {error && <ErrorState title="This case could not update" message={error} label="Case error" action={<button className="soft-btn" onClick={onRefresh}>Retry</button>} />}
    {!detail && !error && <div className="detail-loading" role="status"><p>Loading saved investigation…</p><div className="row-skeleton tall" /><div className="row-skeleton" /></div>}
    {detail && <>
      <div className="detail-finding">
        <div className="verdict-row"><StateBadge item={detail.case} />{a?.impacts.map(i => <span className="tag" key={i}>{impactLabels[i]}</span>)}{isDemo && <span className="fixture-label">Demo data</span>}</div>
        <h2 id="detail-title">{a?.finding.headline || unassessedNote(detail.case.latestRunStatus)}</h2>
        {a?.finding.consequence && <p className="finding-consequence">{a.finding.consequence}</p>}
        <p className="detail-subtitle">{a ? <><span>Version {a.version}</span><span>Checked <time dateTime={a.createdAt}>{time(a.createdAt)}</time></span></> : <span>No assessment yet</span>}</p>
        {reasoning && <div className="reasoning"><h3>Reasoning</h3><p>{a?.finding.consequence ?? a?.finding.headline}</p>{(reasoning.checked.length > 0 || reasoning.limits.length > 0) && <ul>{[...reasoning.checked, ...reasoning.limits].map(line => <li key={line}>{line}</li>)}</ul>}</div>}
        <div className="primary-row">
          {a ? <button type="button" className="primary-btn" onClick={nextAction}>{a.nextAction.label}<ArrowRight size={15} /></button>
            : <button type="button" className="primary-btn" disabled={busy || running} onClick={() => void recheck('user_recheck')}><RefreshCw size={14} />{recheckLabel}</button>}
          <span className="primary-note"><Eye size={13} />Viewing does not change the assessment.</span>
        </div>
      </div>
      {detail.case.freshness === 'stale' && <div className="assessment-update" role="status"><RefreshCw size={15} /><div><strong>Previous assessment</strong><p>{detail.activeRun ? 'New information is being checked. The finding above has not been replaced.' : 'The source has changed. Recheck before relying on this assessment.'}</p></div></div>}
      {notice && <p className="notice" role="status">{notice}</p>}
      {browser ? <><div className="browser-shell"><div className="browser-chrome"><Globe2 size={14} />Controlled example, simulated panel</div><div className="browser-page"><div className="extension-card"><div className="extension-brand">Ante<i>lens</i></div><StateBadge item={detail.case} /><h3>{a?.finding.headline || 'Investigation pending'}</h3>{a?.finding.consequence && <p>{a.finding.consequence}</p>}<button className="primary-btn" onClick={() => setBrowser(false)}>View the evidence <ArrowRight size={15} /></button></div></div></div><p className="scope">Demo preview of this case’s saved state.</p></> : <>
        <section className="detail-section original-request" id="original" tabIndex={-1} aria-labelledby="original-title">
          <div className="detail-section-heading"><h3 id="original-title">{hasEmail ? 'Original email' : 'Captured page'}</h3><span>{visibleSources.length} {visibleSources.length === 1 ? 'source' : 'sources'}</span></div>
          {visibleSources.length ? visibleSources.map(s => <article className="message-box" key={s.id}>
            <div className="message-head"><span className="row-icon" aria-hidden="true">{s.kind === 'gmail' ? <Mail size={14} /> : <Globe2 size={14} />}</span><div><strong>{s.title}</strong><span className="from">{s.senderLabel || (s.kind === 'gmail' ? 'Gmail' : 'Browser page')}</span></div><span className="row-time"><span className="row-time-label">{s.kind === 'gmail' ? 'Received' : 'Captured'}</span> <time dateTime={s.occurredAt}>{time(s.occurredAt)}</time></span></div>
            {s.kind === 'gmail' && <p>{s.previewText}</p>}
            <div className="source-original-link">{detail.sourceReferences?.find(ref => ref.sourceEventId === s.id)?.originalUrl && <SourceLink url={detail.sourceReferences.find(ref => ref.sourceEventId === s.id)?.originalUrl}>Open original {s.kind === 'gmail' ? 'email' : 'page'}</SourceLink>}</div>
          </article>) : <p className="evidence-missing">No original source is available.</p>}
        </section>
        <EvidenceComparison detail={detail} />
        <InvestigationProgress run={run} steps={detail.journey} />
        {run?.error && <ErrorState title="Investigation stopped" message={run.error.message} label="Investigation error" />}
        <section className="detail-section detail-action" id="verification"><h3>Your next step</h3>
          {step && <p>{step.lead}</p>}
          {step && step.reasons.length > 0 && <ul className="next-step-reasons">{step.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
          {a && <button type="button" className="soft-btn" disabled={busy || running} onClick={() => void recheck('user_recheck')}><RefreshCw size={14} />{recheckLabel}</button>}
          <details className="verification-note" id="verification-note" tabIndex={-1}><summary>Add a verification note <ChevronDown size={15} /></summary><label className="field-label" htmlFor="verification-note-text">What did you find?</label><textarea id="verification-note-text" maxLength={4000} placeholder="Record what you confirmed and where…" value={note} onChange={e => setNote(e.target.value)} /><button type="button" className="soft-btn" disabled={busy || running} onClick={() => void recheck('verification_requested')}>Save note and request recheck</button></details>
        </section>
        <section className="detail-section assessment-history"><div className="detail-section-heading"><h3><History size={15} />Assessment history</h3><span>{history.length} {history.length === 1 ? 'version' : 'versions'}</span></div>{history.length ? history.map(h => <details className="history-item" key={h.id}><summary><span className="history-version">Version {h.version}</span><time dateTime={h.createdAt}>{time(h.createdAt)}</time><span className={`history-status ${h.id === a?.id ? 'current' : ''}`}>{h.id === a?.id ? 'Current assessment' : 'Earlier assessment'}</span><ChevronDown size={15} /></summary><div className="history-content"><Badge verdict={h.verdict} /><h4>{h.finding.headline}</h4><p>{h.changeSummary || 'Initial assessment'}</p><details className="history-evidence" onToggle={event => { const open = event.currentTarget.open; setOpenHistoryEvidence(previous => ({ ...previous, [h.id]: open })); }}><summary>Evidence cited in this version</summary>{openHistoryEvidence[h.id] && <EvidenceComparison detail={detail} assessment={h} historical />}</details></div></details>) : <p className="evidence-missing">No assessment has been published. Investigation events appear above.</p>}</section>
        <details className="all-evidence" onToggle={event => setArchiveOpen(event.currentTarget.open)}><summary>All evidence records <span>{detail.evidence.length}</span><ChevronDown size={16} /></summary>{archiveOpen && detail.evidence.map(e => <div key={e.id}><QuoteRecord evidence={e} anchor={false} />{e.kind === 'screenshot' && e.artifactId && <EvidenceImage evidence={e} />}</div>)}</details>
      </>}
    </>}
  </DetailFrame>;
}

export function MessageDetailPanel({ id, crumb, onClose, onCase }: { id: string; crumb: string; onClose: () => void; onCase: (id: string) => void }) {
  const [message, setMessage] = useState<MessageDetail | null>(null), [error, setError] = useState('');
  useEffect(() => { setMessage(null); setError(''); let active = true; void request(`/messages/${id}`, MessageDetailSchema).then(r => { if (active) setMessage(r.data); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [id]);
  return <DetailFrame label="Message" crumb={crumb} title={message?.source.title} onClose={onClose}>
    {error && <ErrorState title="This message could not load" message={error} label="Message error" />}
    {!message && !error && <div className="detail-loading" role="status"><p>Loading message…</p><div className="row-skeleton tall" /></div>}
    {message && <>
      <div className="detail-finding">
        <div className="verdict-row"><DispositionTag message={message.source} />{isDemo && <span className="fixture-label">Demo data</span>}</div>
        <h2 id="detail-title">{message.source.title}</h2>
        <p className="detail-subtitle"><span>{message.source.senderLabel || message.source.kind}</span><span>Received <time dateTime={message.source.occurredAt}>{time(message.source.occurredAt)}</time></span></p>
        {(message.caseIds.length > 0 || message.originalUrl) && <div className="primary-row">
          {message.caseIds.map((c, i) => <button type="button" key={c} className={i === 0 ? 'primary-btn' : 'soft-btn'} onClick={() => onCase(c)}>Open related case<ArrowRight size={15} /></button>)}
          {message.originalUrl && <a className="soft-btn" target="_blank" rel="noopener noreferrer" href={message.originalUrl}><ExternalLink size={14} />Open original source</a>}
        </div>}
      </div>
      <section className="detail-section" aria-labelledby="message-content-title"><h3 id="message-content-title" className="sr-only">Message content</h3><p className="message-content">{message.content}</p></section>
    </>}
  </DetailFrame>;
}
