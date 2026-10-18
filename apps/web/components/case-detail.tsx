'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Eye, Globe2, RefreshCw, Mail, ChevronDown, History } from 'lucide-react';
import { z } from 'zod';
import { AcceptedRunSchema, AssessmentSchema, CaseDetailSchema, MessageDetailSchema, PageSchema, type Assessment, type CaseDetail, type MessageDetail } from '@beforeyou/contracts';
import { Drawer } from '@beforeyou/ui';
import { isDemo, post, request } from '../lib/api';
import { reconcileAssessmentHistory, reconcileCaseDetail } from '../lib/case-state';
import { Badge, ErrorState, impactLabels, StateBadge, time } from './presentation';
import { EvidenceComparison, EvidenceImage, QuoteRecord } from './evidence-viewer';
import { InvestigationProgress } from './investigation-progress';

export function CaseDrawer({ id, revision, onClose, onRefresh }: { id: string | null; revision: number; onClose: () => void; onRefresh: () => void }) {
  const [detail, setDetail] = useState<CaseDetail | null>(null), [history, setHistory] = useState<Assessment[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false), [browser, setBrowser] = useState(false), [note, setNote] = useState(''), [notice, setNotice] = useState('');
  const viewed = useRef(''), detailSnapshot = useRef<CaseDetail | null>(null);
  useEffect(() => { detailSnapshot.current = null; setDetail(null); setHistory([]); setError(''); setBrowser(false); setNote(''); setNotice(''); }, [id]);
  useEffect(() => {
    if (!id) return;
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
  const limitations = [...new Map([...(a?.limitations ?? []), ...(run?.limitations ?? [])].map(l => [`${l.code}:${l.message}`, l])).values()];
  async function recheck(reason: 'user_recheck' | 'verification_requested') {
    if (!id) return;
    setBusy(true); setError('');
    try { await post(`/cases/${id}/rechecks`, AcceptedRunSchema, { reason, ...(note.trim() ? { note: note.trim() } : {}) }); setNotice('Recheck queued. Your note is saved as a statement to review.'); onRefresh(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <Drawer open={Boolean(id)} onOpenChange={open => { if (!open) onClose(); }} title={browser ? 'Browser panel preview' : 'Case detail'}>
    {error && <ErrorState title="This case could not update" message={error} label="Case error" action={<button className="soft-btn" onClick={onRefresh}>Retry</button>} />}
    {!detail && !error && <div className="detail-loading" role="status"><span className="loading-lens"><Eye size={22} /></span><p>Loading saved investigation…</p><div className="skeleton" /></div>}
    {detail && <>
      <div className="detail-finding">
        <div className="badge-row"><StateBadge item={detail.case} />{a?.impacts.map(i => <span className="tag" key={i}>{impactLabels[i]}</span>)}</div>
        <h2>{a?.finding.headline || detail.case.title}</h2>
        {a?.finding.consequence && <p className="finding-consequence">{a.finding.consequence}</p>}
        <div className="drawer-subtitle"><span>{a ? `Version ${a.version}` : 'No assessment yet'}</span>{a && <time dateTime={a.createdAt}>Checked {time(a.createdAt)}</time>}{isDemo && <span className="fixture-label">Demo data</span>}</div>
      </div>
      {detail.case.freshness === 'stale' && <div className="assessment-update" role="status"><RefreshCw size={16} /><div><strong>Previous assessment</strong><p>{detail.activeRun ? 'New information is being checked. The finding above has not been replaced.' : 'The source has changed. Recheck before relying on this assessment.'}</p></div></div>}
      {notice && <p className="notice" role="status">{notice}</p>}
      {browser ? <><div className="browser-shell"><div className="browser-chrome"><Globe2 size={14} />Controlled example · Simulated panel</div><div className="browser-page"><div className="extension-card"><div className="extension-brand">Before<i>You</i></div><StateBadge item={detail.case} /><h3>{a?.finding.headline || 'Investigation pending'}</h3>{a?.finding.consequence && <p>{a.finding.consequence}</p>}<button className="primary-btn" onClick={() => setBrowser(false)}>View the evidence <ArrowRight size={15} /></button></div></div></div><p className="scope">Demo preview of this case’s saved state.</p></> : <>
        <EvidenceComparison detail={detail} />
        <details className="original-request" id="original"><summary>Original request <span>{detail.sources.length} {detail.sources.length === 1 ? 'message' : 'sources'}</span><ChevronDown size={16} /></summary><div>{detail.sources.map(s => <article className="message-box" key={s.id}><div className="from">{s.kind === 'gmail' ? <Mail size={14} /> : <Globe2 size={14} />}<span>{s.senderLabel || s.kind}</span><time dateTime={s.occurredAt}>{time(s.occurredAt)}</time></div><strong>{s.title}</strong><p>{s.previewText}</p></article>)}</div></details>
        <InvestigationProgress run={run} steps={detail.journey} />
        {(limitations.length > 0 || run?.error) && <section className="detail-section limitations-section"><h3>What could not be checked</h3>{limitations.map((l, i) => <div className="limitation" key={i}><Eye size={17} /><p>{l.message}</p></div>)}{run?.error && <ErrorState title="Investigation stopped" message={run.error.message} label="Investigation error" />}{!detail.activeRun && <p className="scope">Review the original request through a channel you trust. You can recheck when access is available.</p>}</section>}
        {a && <section className="detail-section checked-scope"><h3>Checked scope</h3><ul>{a.checkedScope.map((s, i) => <li key={i}><Eye size={14} /><span>{s}</span></li>)}</ul></section>}
        <section className="detail-action" id="verification"><h3>Your next step</h3><p>{!a ? 'Some steps remain unchecked. Review the request before continuing.' : a.verdict === 'no_issues_found' ? 'Review the checked scope. Later steps are not covered by this assessment.' : 'Confirm the unresolved request through a channel you already trust.'}</p>
          <button className="primary-btn" disabled={busy || Boolean(detail.activeRun)} onClick={() => void recheck('user_recheck')}><RefreshCw size={15} />{detail.activeRun ? 'Investigation in progress' : busy ? 'Queuing…' : 'Recheck request'}</button>
          <details className="verification-note"><summary>Add a verification note <ChevronDown size={15} /></summary><label className="field-label" htmlFor="verification-note">What did you find?</label><textarea id="verification-note" maxLength={4000} placeholder="Record what you confirmed and where…" value={note} onChange={e => setNote(e.target.value)} /><button className="soft-btn" disabled={busy || Boolean(detail.activeRun)} onClick={() => void recheck('verification_requested')}>Save note and request recheck</button></details>
        </section>
        <section className="detail-section assessment-history"><div className="detail-section-heading"><h3><History size={17} />Assessment history</h3><span>{history.length} {history.length === 1 ? 'version' : 'versions'}</span></div>{history.length ? history.map(h => <details className="history-item" key={h.id}><summary><span className="history-version">Version {h.version}</span><time dateTime={h.createdAt}>{time(h.createdAt)}</time><span className={`history-status ${h.id === a?.id ? 'current' : ''}`}>{h.id === a?.id ? 'Current assessment' : 'Earlier assessment'}</span><ChevronDown size={15} /></summary><div className="history-content"><Badge verdict={h.verdict} /><h4>{h.finding.headline}</h4><p>{h.changeSummary || 'Initial assessment'}</p><details className="history-evidence"><summary>Evidence cited in this version</summary>{h.finding.evidenceIds.map(eid => { const e = detail.evidence.find(record => record.id === eid); return e ? <QuoteRecord key={eid} evidence={e} anchor={false} /> : <p className="evidence-missing" key={eid}>This evidence record is not available in the current view.</p>; })}</details></div></details>) : <p className="evidence-missing">No assessment has been published. Investigation events appear above.</p>}</section>
        <details className="all-evidence"><summary>All evidence records <span>{detail.evidence.length}</span><ChevronDown size={16} /></summary>{detail.evidence.map(e => <div key={e.id}><QuoteRecord evidence={e} anchor={false} />{e.kind === 'screenshot' && e.artifactId && <EvidenceImage evidence={e} />}</div>)}</details>
        <div className="drawer-bottom"><span><Eye size={14} />Viewing does not change the assessment.</span>{isDemo && <button className="soft-btn" onClick={() => setBrowser(true)}><Globe2 size={14} />Browser panel preview</button>}</div>
      </>}
    </>}
  </Drawer>;
}

export function MessageDrawer({id,onClose,onCase}:{id:string|null;onClose:()=>void;onCase:(id:string)=>void}){const [message,setMessage]=useState<MessageDetail|null>(null),[error,setError]=useState('');useEffect(()=>{setMessage(null);setError('');if(!id)return;let active=true;void request(`/messages/${id}`,MessageDetailSchema).then(r=>{if(active)setMessage(r.data)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[id]);return <Drawer open={Boolean(id)} onOpenChange={o=>{if(!o)onClose()}} title="Message"><>{error&&<p role="alert">{error}</p>}{!message&&!error&&<p>Loading message…</p>}{message&&<><h2>{message.source.title}</h2><p className="muted">{message.source.senderLabel} · {time(message.source.occurredAt)}</p><p className="message-content">{message.content}</p><p className="badge neutral">{message.source.disposition==='no_action'?'No action needed':message.source.disposition==='pending'?'Awaiting classification':'Action required'}</p>{message.caseIds.map(c=><button key={c} className="primary-btn" onClick={()=>{onClose();onCase(c)}}>Open related case <ArrowRight size={15}/></button>)}{message.originalUrl&&<a className="soft-btn" target="_blank" rel="noopener noreferrer" href={message.originalUrl}>Open original source</a>}</>}</></Drawer>}
