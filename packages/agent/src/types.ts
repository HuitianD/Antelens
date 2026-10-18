import type { Assessment, AssessmentProposal, Evidence, JourneyStep, Limitation, TriageProposal, StoredPageCapture, CapturedInspection } from '@beforeyou/contracts';
export interface AgentConfig {
  factoryApiKey: string;
  anthropicApiKey: string;
  /** Required by Anthropic for user-scoped keys (sk-ant-usr-…); sent as the anthropic-workspace-id header. */
  anthropicWorkspaceId?: string;
  claudeModelId: string;
  daytonaApiKey: string;
  daytonaSnapshot: string;
  allowedDomains: string[];
  /** `daytona` (default) runs the isolated sandbox browser. `local_controlled` runs the same browser program on the worker host for controlled fixture pages only. */
  browserRuntime?: 'daytona' | 'local_controlled';
  /** Required by `local_controlled`; the only origin the local browser may open. */
  controlledFixtureOrigin?: string;
  maxSteps?: number;
  timeoutMs?: number;
  maxOutputTokens?: number;
  droidExecPath?: string;
  runtimeDirectory?: string;
}
export interface AgentSource { id: string; title: string; content: string; links: string[]; kind?:'gmail'|'browser' }
export interface TriageInput { source: AgentSource; candidateCases: Array<{id: string; title: string; sourceEventIds?: string[]}>; signal?: AbortSignal }
export interface EvidenceCapture {
  kind: Evidence['kind']; sourceEventId: string | null; stepId: string; sourceLabel: string;
  displayUrl: string | null; excerpt: string | null; contentHash: string;
  artifactBytes?: Uint8Array; artifactMime?: string; provenance: { dataOrigin: 'synthetic' | 'user'; execution: 'live' };
  inspection?: CapturedInspection;
}
export interface InvestigationInput {
  ownerId: string; caseId: string; runId: string; sourceRevision: number; dataOrigin: 'synthetic' | 'user';
  sources: AgentSource[]; existingEvidence: Evidence[]; priorAssessment?: Assessment | null;
  capturedPage?: StoredPageCapture;
  onSandboxCreated?: (sandboxId:string)=>Promise<void>;
  saveEvidence: (capture: EvidenceCapture) => Promise<Evidence>;
  onStep?: (step: JourneyStep) => Promise<void>;
  signal?: AbortSignal;
}
export interface InvestigationResult { proposal: AssessmentProposal; modelId: string; sessionId: string; limitations: Limitation[] }
export interface InvestigationAgent { triage(input: TriageInput): Promise<TriageProposal>; investigate(input: InvestigationInput): Promise<InvestigationResult> }
