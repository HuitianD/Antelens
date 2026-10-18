'use client';
import { useEffect, useRef, useState } from 'react';
import { Expand, Globe2, Mail, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { EvidenceDetailSchema, type CaseDetail, type Evidence } from '@beforeyou/contracts';
import { Modal } from '@beforeyou/ui';
import { isDemo, request } from '../lib/api';
import { comparisonEvidence, demoScreenshot, displayHost } from '../lib/evidence';
import { ErrorState, time } from './presentation';

export function EvidenceComparison({ detail }: { detail: CaseDetail }) {
  const { messages, page } = comparisonEvidence(detail);
  const screenshots = page ? detail.evidence.filter(e => e.kind === 'screenshot' && e.artifactId && e.runId === page.runId && e.displayUrl === page.displayUrl) : [];
  const image = screenshots.find(e => e.stepId === page?.stepId) ?? screenshots[0] ?? page;
  return <section className="detail-section comparison-section" id="comparison" aria-labelledby="comparison-title">
    <div className="detail-section-heading"><h3 id="comparison-title">Evidence</h3><span>{detail.currentAssessment?.provenance.execution === 'simulated' ? 'Simulated observations' : 'Source records'}</span></div>
    <div className="evidence-comparison">
      <div className="comparison-column message-column"><h4><Mail size={16} />Message says</h4>
        {messages.length ? messages.map(e => <QuoteRecord evidence={e} key={e.id} />) : <p className="evidence-missing">{detail.currentAssessment ? 'No message excerpt is cited in this assessment.' : 'No message evidence has been saved for this run.'}</p>}
      </div>
      <div className="comparison-column page-column"><h4><Globe2 size={16} />Page shows</h4>
        {page ? <QuoteRecord evidence={page} /> : <p className="evidence-missing">{detail.currentAssessment ? 'No page observation is cited in this assessment.' : 'No page observation has been saved yet.'}</p>}
        {image && (image.artifactId || (isDemo && demoScreenshot(image))) && <EvidenceImage evidence={image} />}
      </div>
    </div>
  </section>;
}

export function QuoteRecord({ evidence, anchor = true }: { evidence: Evidence; anchor?: boolean }) {
  return <article className="quote-record" id={anchor ? `evidence-${evidence.id}` : undefined}>
    <div className="quote-source">{displayHost(evidence.displayUrl) || evidence.sourceLabel}</div>
    {evidence.excerpt ? <blockquote>{evidence.excerpt.split(/(https?:\/\/[^\s]+)/g).map((text, i) => /^https?:\/\//.test(text) ? <span className="quote-url" key={i}>{text}</span> : text)}</blockquote> : <p className="evidence-missing">No text excerpt was saved.</p>}
    <div className="quote-meta"><time dateTime={evidence.observedAt}>{time(evidence.observedAt)}</time><span>{evidence.provenance.execution === 'simulated' ? 'Demo evidence' : 'Captured excerpt'}</span></div>
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
    setUrl(sample); setError(''); setLoading(Boolean(evidence.artifactId));
    if (evidence.artifactId) void request(`/evidence/${evidence.id}`, EvidenceDetailSchema).then(r => {
      if (!active) return;
      if (!r.data.artifactUrl) { setError('This record has no saved image.'); setLoading(false); return; }
      setUrl(r.data.artifactUrl);
    }).catch(() => { if (active) { setError('The saved screenshot could not be loaded. Refresh its access link and try again.'); setLoading(false); } });
    return () => { active = false; };
  }, [evidence.id, evidence.artifactId, sample, reload]);
  const title = sample ? 'Demo screenshot' : 'Captured screenshot';
  const caption = sample ? 'Illustrative fixture page. Not a live browser capture.' : `${evidence.sourceLabel} · ${time(evidence.observedAt)}`;
  const retry = () => { setLoading(true); setReload(n => n + 1); };
  const imageError = () => { setLoading(false); setError('The image is unavailable or its access link expired. Refresh the image to try again.'); };
  return <figure className="screenshot-record">
    {error ? <ErrorState title="Screenshot unavailable" message={error} label="Screenshot error" action={<button className="soft-btn" onClick={retry}>Reload image</button>} /> : <>
      {loading && <div className="image-loading" role="status">Loading screenshot…</div>}
      {url && <button ref={trigger} className="screenshot-preview" aria-label="Enlarge screenshot" onClick={() => { setZoom(1); setOpen(true); }}><img src={url} alt={sample ? 'Demo rental checkout showing a $40 fee and required $29 monthly membership' : `Saved screenshot from ${evidence.sourceLabel}`} onLoad={event => {setLoading(false);setDimensions({width:event.currentTarget.naturalWidth,height:event.currentTarget.naturalHeight})}} onError={imageError} /><span><Expand size={14} />Enlarge screenshot</span></button>}
    </>}
    <figcaption><strong>{title}</strong><span>{caption}</span></figcaption>
    <Modal open={open} onOpenChange={setOpen} onCloseFocus={() => trigger.current?.focus({preventScroll:true})} title={title}>
      <div className="image-toolbar" role="toolbar" aria-label="Screenshot zoom"><span>{Math.round(zoom * 100)}%</span><button className="soft-btn" aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom(z => Math.max(1, z - 0.5))}><ZoomOut size={17} /></button><button className="soft-btn" aria-label="Zoom in" disabled={zoom >= 3} onClick={() => setZoom(z => Math.min(3, z + 0.5))}><ZoomIn size={17} /></button><button className="soft-btn" onClick={() => setZoom(1)}><RotateCcw size={14} />Fit image</button></div>
      <div className="image-viewport" ref={setViewport}>{error ? <ErrorState title="Screenshot unavailable" message={error} label="Expanded screenshot error" action={<button className="soft-btn" onClick={retry}>Reload image</button>} /> : url && <img style={{ width: `${imageWidth}px` }} src={url} alt={sample ? 'Demo rental checkout with recurring membership terms' : `Saved screenshot from ${evidence.sourceLabel}`} onError={imageError} />}</div>
      <p className="image-caption">{caption}</p>
    </Modal>
  </figure>;
}
