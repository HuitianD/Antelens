'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Expand, ExternalLink, Globe2, Mail, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { EvidenceDetailSchema, type Assessment, type CaseDetail, type Evidence } from '@beforeyou/contracts';
import { Modal } from '@beforeyou/ui';
import { isDemo, request } from '../lib/api';
import { demoScreenshot, displayHost, sourceEvidence, sourceUrl } from '../lib/evidence';
import { ErrorState, time } from './presentation';

export function EvidenceComparison({ detail, assessment = detail.currentAssessment, historical = false }: { detail: CaseDetail; assessment?: Assessment | null; historical?: boolean }) {
  const { messages, page, image, email, hasPage, scope, uninspectedLinks, missingCitations } = sourceEvidence(detail, assessment);
  const illustration = page && isDemo && demoScreenshot(page) ? page : undefined;
  const screenshot = image ?? illustration;
  const run = !historical ? detail.activeRun ?? detail.latestRun : null;
  const limitations = [...new Set([...(assessment?.limitations ?? []), ...(!assessment || run?.id === assessment.runId ? run?.limitations ?? [] : [])].map(l => l.message))];
  const sectionId = historical ? `comparison-${assessment?.id}` : 'comparison';
  return <section className="detail-section comparison-section" id={sectionId} aria-labelledby={`${sectionId}-title`}>
    <div className="detail-section-heading"><h3 id={`${sectionId}-title`}>{email && !hasPage ? 'Email evidence' : 'Evidence'}</h3>{scope && <span className="evidence-scope">{scope}</span>}</div>
    {uninspectedLinks.map(url => <p className="linked-page-status" key={url}><Globe2 size={14} /><span>Linked page not checked</span><SourceLink url={url}>{displayHost(url)}</SourceLink></p>)}
    {missingCitations && <p className="evidence-missing" role="status">Some evidence cited in this version is unavailable.</p>}
    <div className={`evidence-comparison${email && hasPage ? '' : ' single-source'}`}>
      {email && <div className="comparison-column message-column">{hasPage && <h4><Mail size={16} />Message says</h4>}
        {messages.length ? messages.map(e => <QuoteRecord evidence={e} key={e.id} anchor={!historical} />) : <p className="evidence-missing">{assessment ? 'No email excerpt is available for this assessment.' : 'No email evidence has been saved for this run.'}</p>}
      </div>}
      {hasPage && <div className="comparison-column page-column"><h4><Globe2 size={16} />{email ? 'Page shows' : 'Captured page'}</h4>
        {page?.excerpt?.trim() ? <QuoteRecord evidence={page} anchor={!historical} /> : !screenshot && <p className="evidence-missing">{assessment ? 'No saved page evidence is available for this assessment.' : 'No page evidence has been saved for this run.'}</p>}
        {screenshot && <EvidenceImage evidence={screenshot} />}
      </div>}
    </div>
    {(limitations.length > 0 || assessment || page?.inspection) && <details className="inspection-details"><summary>Inspection scope and limitations<ChevronDown size={15} /></summary>
      {page?.inspection && <p>The captured page was rendered offline in Daytona. Live website content, unseen pages, and sender identity were not verified.</p>}
      {limitations.length > 0 && <><h4>What could not be checked</h4><ul>{limitations.map(message => <li key={message}>{message}</li>)}</ul></>}
      {assessment && <><h4>Checked scope</h4><ul>{assessment.checkedScope.map((s, i) => <li key={i}>{s}</li>)}</ul></>}
    </details>}
  </section>;
}

export function SourceLink({ url, children }: { url: string | null | undefined; children: ReactNode }) {
  const href = sourceUrl(url);
  return href ? <a href={href} target="_blank" rel="noopener noreferrer">{children}<ExternalLink size={11} aria-hidden="true" /></a> : <>{children}</>;
}

export function QuoteRecord({ evidence, anchor = true }: { evidence: Evidence; anchor?: boolean }) {
  return <article className="quote-record" id={anchor ? `evidence-${evidence.id}` : undefined}>
    <div className="quote-source"><SourceLink url={evidence.displayUrl}>{displayHost(evidence.displayUrl) || evidence.sourceLabel}</SourceLink></div>
    {evidence.excerpt ? <blockquote>{evidence.excerpt.split(/(https?:\/\/[^\s]+)/g).map((text, i) => /^https?:\/\//.test(text) ? <span className="quote-url" key={i}>{text}</span> : text)}</blockquote> : evidence.kind !== 'screenshot' && <p className="evidence-missing">No text excerpt was saved.</p>}
    <div className="quote-meta"><time dateTime={evidence.inspection?.capturedAt ?? evidence.observedAt}>{time(evidence.inspection?.capturedAt ?? evidence.observedAt)}</time><span>{evidence.provenance.execution === 'simulated' ? 'Demo evidence' : evidence.inspection ? 'Captured text' : 'Saved excerpt'}</span></div>
  </article>;
}

export function EvidenceImage({ evidence }: { evidence: Evidence }) {
  const sample = isDemo && !evidence.artifactId ? demoScreenshot(evidence) : null;
  const [url, setUrl] = useState<string | null>(sample), [error, setError] = useState(''), [loading, setLoading] = useState(Boolean(evidence.artifactId)), [open, setOpen] = useState(false), [zoom, setZoom] = useState(1), [reload, setReload] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null), [space, setSpace] = useState({width:1,height:1}), [dimensions, setDimensions] = useState({width:1000,height:760});
  useEffect(() => {
    if (!viewport) return;
    const observer = new ResizeObserver(entries => { const rect=entries[0]?.contentRect; if(rect)setSpace({width:rect.width,height:rect.height}); });
    observer.observe(viewport); return () => observer.disconnect();
  }, [viewport]);
  const imageWidth = Math.min(space.width, space.height * dimensions.width / dimensions.height) * zoom;
  useEffect(() => {
    let active = true;
    setUrl(sample); setError(!sample && !evidence.artifactId ? 'No screenshot file was saved with this evidence record.' : ''); setLoading(Boolean(evidence.artifactId));
    if (evidence.artifactId) void request(`/evidence/${evidence.id}`, EvidenceDetailSchema).then(r => {
      if (!active) return;
      if (!r.data.artifactUrl) { setError('This record has no saved image.'); setLoading(false); return; }
      setUrl(r.data.artifactUrl);
    }).catch(() => { if (active) { setError('The saved screenshot could not be loaded. Refresh its access link and try again.'); setLoading(false); } });
    return () => { active = false; };
  }, [evidence.id, evidence.artifactId, sample, reload]);
  const title = sample ? 'Demo screenshot' : evidence.inspection?.label??'Captured screenshot';
  const caption = sample ? 'Illustrative fixture page.' : `Captured ${time(evidence.inspection?.capturedAt ?? evidence.observedAt)}`;
  const retry = () => { setLoading(true); setReload(n => n + 1); };
  const imageError = () => { setLoading(false); setError('The image is unavailable or its access link expired. Refresh the image to try again.'); };
  return <figure className="screenshot-record">
    {error ? <ErrorState title="Screenshot unavailable" message={error} label="Screenshot error" action={evidence.artifactId || sample ? <button className="soft-btn" onClick={retry}>Reload image</button> : undefined} /> : <>
      {loading && <div className="image-loading" role="status">Loading screenshot…</div>}
      {url && <button ref={trigger} className="screenshot-preview" aria-label="Enlarge screenshot" onClick={() => { setZoom(1); setOpen(true); }}><img src={url} alt={sample ? 'Demo rental checkout showing a $40 fee and required $29 monthly membership' : `Saved screenshot from ${evidence.sourceLabel}`} onLoad={event => {setLoading(false);setDimensions({width:event.currentTarget.naturalWidth,height:event.currentTarget.naturalHeight})}} onError={imageError} /><span><Expand size={14} />Enlarge screenshot</span></button>}
    </>}
    <figcaption><strong>{title}</strong><span>{caption} <SourceLink url={evidence.displayUrl}>{displayHost(evidence.displayUrl)}</SourceLink></span></figcaption>
    <Modal open={open} onOpenChange={setOpen} onCloseFocus={() => trigger.current?.focus({preventScroll:true})} title={title}>
      <div className="image-toolbar" role="toolbar" aria-label="Screenshot zoom"><span>{Math.round(zoom * 100)}%</span><button className="soft-btn" aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom(z => Math.max(1, z - 0.5))}><ZoomOut size={17} /></button><button className="soft-btn" aria-label="Zoom in" disabled={zoom >= 3} onClick={() => setZoom(z => Math.min(3, z + 0.5))}><ZoomIn size={17} /></button><button className="soft-btn" onClick={() => setZoom(1)}><RotateCcw size={14} />Fit image</button></div>
      <div className="image-viewport" ref={setViewport}>{error ? <ErrorState title="Screenshot unavailable" message={error} label="Expanded screenshot error" action={<button className="soft-btn" onClick={retry}>Reload image</button>} /> : url && <img style={{ width: `${imageWidth}px` }} src={url} alt={sample ? 'Demo rental checkout with recurring membership terms' : `Saved screenshot from ${evidence.sourceLabel}`} onError={imageError} />}</div>
      <p className="image-caption">{caption}</p>
    </Modal>
  </figure>;
}
