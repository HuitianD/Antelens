import { Check, CircleAlert, Clock3, X } from 'lucide-react';
import type { InvestigationRun, JourneyStep } from '@beforeyou/contracts';
import { reasoningLines } from '../lib/next-step';
import { runLabels, time } from './presentation';

export function InvestigationProgress({ run, steps }: { run: InvestigationRun | null; steps: JourneyStep[] }) {
  const observed = run ? steps.filter(s => s.runId === run.id).sort((a, b) => a.index - b.index) : [];
  const limits = run ? reasoningLines({ checkedScope: [], limitations: run.limitations }).limits : [];
  return <section className="detail-section investigation-section" id="journey" aria-labelledby="investigation-title">
    <div className="detail-section-heading"><h3 id="investigation-title">Investigation</h3>{run && <span className={`run-status ${run.status}`}><span className="dot" />{runLabels[run.status]}</span>}</div>
    {run?.provenance.execution === 'simulated' && <p className="simulation-note">Demo run · Simulated observations</p>}
    {observed.length > 0 && <ol className="investigation-timeline">{observed.map(step => <li key={step.id}><span className={`step-marker ${step.status}`}>{step.status === 'complete' ? <Check size={13} /> : step.status === 'failed' ? <X size={13} /> : <CircleAlert size={13} />}</span><div><strong>{step.label}</strong><p>{step.status === 'complete' ? 'Observed' : step.status === 'limited' ? 'Limited' : 'Failed'}<span> · </span><time dateTime={step.occurredAt}>{time(step.occurredAt)}</time></p></div></li>)}</ol>}
    {(run?.status === 'queued' || run?.status === 'checking') && <div className="current-stage" role="status"><Clock3 size={16} /><div><strong>{run.status === 'queued' ? 'Waiting for the worker' : 'Investigation in progress'}</strong><p>{observed.length ? 'The observations above are saved. Further results will appear here.' : 'No browser observations have been saved yet.'}</p></div></div>}
    {!run && <p className="evidence-missing">No investigation has been recorded.</p>}
    {run && !observed.length && run.status !== 'queued' && run.status !== 'checking' && (limits.length > 0 ? <ul className="reasoning-limits">{limits.map(line => <li key={line}>{line}</li>)}</ul> : <p className="evidence-missing">No browser observations were saved for this run.</p>)}
  </section>;
}
