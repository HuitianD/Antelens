import { verdictLabels, type Verdict } from '@beforeyou/contracts';
import type { PageState } from './config';
import type {CaseDetail,InvestigationRun} from '@beforeyou/contracts';

type RunStatus = 'queued' | 'checking' | 'complete' | 'limited' | 'failed' | 'cancelled' | null;

export function captureStatus(input: { run: RunStatus; current: boolean; inspected: boolean; hasCapture: boolean }): Pick<PageState, 'phase' | 'message'> {
  if (input.run === 'failed') return { phase: 'failed', message: 'The investigation could not complete. No local fallback was used.' };
  if (input.run === 'cancelled') return { phase: 'failed', message: 'This check was cancelled.' };
  if (input.run === 'queued' || input.run === 'checking') return { phase: 'checking', message: input.hasCapture ? 'Captured content is queued for offline inspection.' : 'Checking the accessible next steps…' };
  if (input.run === 'limited') return { phase: 'limited', message: input.inspected ? 'Captured page inspected in Daytona' : 'This check finished. Open the case for the saved result.' };
  if (input.current || input.run === 'complete') return { phase: 'ready', message: input.inspected ? 'Captured page inspected in Daytona' : 'Based on the observed steps' };
  return { phase: 'checking', message: 'Checking the accessible next steps…' };
}

export function captureTitle(phase: PageState['phase'], verdict?: string): string {
  if (phase === 'checking') return 'Checking captured content';
  if (phase === 'failed') return 'Check failed';
  if (phase === 'no_action') return 'No action needed';
  if (verdict && verdict in verdictLabels) return verdictLabels[verdict as Verdict];
  if (phase === 'limited' || phase === 'ready') return 'Check finished';
  return 'Page check';
}

/** Resolve this exact persisted run, even when a newer run/assessment exists on the case. */
export function resolveCapturedState(state:PageState,detail:CaseDetail,run:InvestigationRun):PageState{
 if(run.id!==state.runId||run.caseId!==state.caseId||detail.case.id!==state.caseId||run.pageCaptureId!==state.captureId)throw new Error('The saved run does not match this page check.');
 const assessment=detail.currentAssessment?.runId===run.id&&detail.case.freshness==='current'?detail.currentAssessment:null;
 const inspected=detail.evidence.some(e=>e.runId===run.id&&e.inspection?.captureId===state.captureId);
 const status=captureStatus({run:run.status,current:Boolean(assessment),inspected,hasCapture:true});
 return {...state,...status,caseTitle:detail.case.title,association:detail.case.sourceKinds.includes('gmail')?'linked_email':'standalone',verdict:assessment?.verdict,finding:assessment?.finding.headline,inspectedInDaytona:inspected};
}
