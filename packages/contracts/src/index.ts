import { z } from 'zod';

export const API_VERSION = '1' as const;
export const API_PREFIX = '/v1' as const;
export const INVESTIGATION_PROMPT_VERSION = 'investigation-1.0.0' as const;
export const INVESTIGATION_POLICY_VERSION = 'navigation-1.0.0' as const;
export const INVESTIGATION_TOOL_VERSION = 'browser-1.0.0' as const;
export const IdSchema = z.uuid();
export const TimestampSchema = z.iso.datetime();
const Text = z.string().min(1);
const BoundedText = (max: number) => Text.max(max);
const Ids = z.array(IdSchema);
export const AppModeSchema = z.enum(['demo', 'live']);
export const DataOriginSchema = z.enum(['synthetic', 'user']);
export const ExecutionModeSchema = z.enum(['simulated', 'live']);
export const ProvenanceSchema = z.strictObject({ dataOrigin: DataOriginSchema, execution: ExecutionModeSchema });
export const SourceKindSchema = z.enum(['gmail', 'browser']);
export const MessageDispositionSchema = z.enum(['pending', 'action_required', 'no_action']);
export const VerdictSchema = z.enum(['pause_here', 'confirm_first', 'no_issues_found']);
export const ImpactSchema = z.enum(['money', 'identity', 'account_access', 'downloads']);
export const RunStatusSchema = z.enum(['queued', 'checking', 'complete', 'limited', 'failed', 'cancelled']);
export const FreshnessSchema = z.enum(['current', 'stale']);
export const ReviewStatusSchema = z.enum(['unreviewed', 'viewed', 'verification_requested']);
export const ConnectionStatusSchema = z.enum(['not_connected', 'connecting', 'connected', 'needs_attention', 'disconnected']);
export const EvidenceKindSchema = z.enum(['message_excerpt', 'page_excerpt', 'screenshot', 'redirect', 'form_field', 'permission_request', 'download_metadata', 'user_statement', 'external_record']);
export const LimitationCodeSchema = z.enum(['login_required', 'captcha', 'sensitive_action', 'network_policy', 'site_unreachable', 'unsupported_page', 'permission_missing', 'step_limit', 'time_limit', 'cost_limit', 'no_investigable_link']);
export const ErrorCodeSchema = z.enum(['AUTH_REQUIRED', 'FORBIDDEN', 'NOT_FOUND', 'VALIDATION_ERROR', 'CONFIG_MISSING', 'CONNECTION_REQUIRED', 'CONNECTION_EXPIRED', 'PROVIDER_ACCESS_DENIED', 'RATE_LIMITED', 'SANDBOX_NETWORK_BLOCKED', 'TARGET_BLOCKED', 'INVESTIGATION_LIMITED', 'OUTPUT_INVALID', 'STALE_REVISION', 'IDEMPOTENCY_CONFLICT', 'PROVIDER_UNAVAILABLE', 'INTERNAL_ERROR']);
export const ProcessingStatusSchema = z.enum(['queued', 'checking', 'complete', 'failed']);
export const MoneySchema = z.strictObject({ amountMinor: z.number().int().safe(), currency: z.string().regex(/^[A-Z]{3}$/) });
export const ApiErrorDetailSchema = z.strictObject({
  code: ErrorCodeSchema, message: BoundedText(500), retryable: z.boolean(), requestId: Text,
  details: z.strictObject({ fieldErrors: z.record(z.string(), z.array(z.string())).optional(), provider: Text.optional(), missingVariableNames: z.array(Text).optional(), retryAfterSeconds: z.number().int().nonnegative().optional() }).optional(),
});
export const ApiErrorSchema = z.strictObject({ error: ApiErrorDetailSchema });
export const ConnectionSummarySchema = z.strictObject({
  id: IdSchema, kind: SourceKindSchema, status: ConnectionStatusSchema, accountLabel: BoundedText(320),
  grantedScopes: z.array(Text), lastSyncedAt: TimestampSchema.nullable(), lastErrorCode: ErrorCodeSchema.nullable(),
});
export const ConnectionSyncScopeSchema = z.strictObject({ initialCutoff: TimestampSchema.nullable(), initialCap: z.number().int().min(1).max(50), excludedByCap: z.boolean(), coverageGap: z.boolean(), initialComplete: z.boolean() });
export const SourceEventSchema = z.strictObject({
  id: IdSchema, connectionId: IdSchema, kind: SourceKindSchema, externalId: Text, externalThreadId: Text.nullable(),
  receivedAt: TimestampSchema, occurredAt: TimestampSchema, title: z.string().max(1000), senderLabel: z.string().max(1000).nullable(),
  previewText: z.string().max(8000), contentRef: Text, disposition: MessageDispositionSchema,
  processingStatus: ProcessingStatusSchema, lastErrorCode: ErrorCodeSchema.nullable(), dataOrigin: DataOriginSchema,
});
export const LimitationSchema = z.strictObject({ code: LimitationCodeSchema, message: BoundedText(1000), stepId: IdSchema.nullable(), evidenceIds: Ids });
export const EvidenceSchema = z.strictObject({
  id: IdSchema, caseId: IdSchema, runId: IdSchema.nullable(), sourceEventId: IdSchema.nullable(), stepId: IdSchema.nullable(), kind: EvidenceKindSchema,
  observedAt: TimestampSchema, sourceLabel: BoundedText(500), displayUrl: z.string().max(2048).nullable(), excerpt: z.string().max(32000).nullable(),
  artifactId: IdSchema.nullable(), contentHash: z.string().regex(/^[a-f0-9]{64}$/), provenance: ProvenanceSchema,
});
export const FindingSchema = z.strictObject({ headline: BoundedText(120), consequence: BoundedText(180).nullable(), evidenceIds: Ids.min(1) });
export const NextActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('review_evidence'), label: BoundedText(40), evidenceId: IdSchema }),
  z.strictObject({ kind: z.literal('review_steps'), label: BoundedText(40) }),
  z.strictObject({ kind: z.literal('open_source'), label: BoundedText(40), sourceEventId: IdSchema }),
  z.strictObject({ kind: z.literal('verify_request'), label: BoundedText(40) }),
]);
export const AssessmentSchema = z.strictObject({
  id: IdSchema, caseId: IdSchema, runId: IdSchema, version: z.number().int().positive(), sourceRevision: z.number().int().positive(),
  verdict: VerdictSchema, impacts: z.array(ImpactSchema).min(1), finding: FindingSchema, nextAction: NextActionSchema,
  checkedScope: z.array(BoundedText(1000)).min(1), limitations: z.array(LimitationSchema), changeSummary: BoundedText(1000).nullable(),
  supersedesAssessmentId: IdSchema.nullable(), createdAt: TimestampSchema, provenance: ProvenanceSchema,
});
export const CaseSummarySchema = z.strictObject({
  id: IdSchema, recordVersion: z.number().int().positive(), title: BoundedText(1000), sourceKinds: z.array(SourceKindSchema).min(1),
  sourceRevision: z.number().int().positive(), currentAssessment: AssessmentSchema.nullable(), activeRunId: IdSchema.nullable(),
  latestRunStatus: RunStatusSchema.nullable(), freshness: FreshnessSchema, reviewStatus: ReviewStatusSchema, updatedAt: TimestampSchema,
});
export const InvestigationRunSchema = z.strictObject({
  id: IdSchema, caseId: IdSchema, sourceRevision: z.number().int().positive(), trigger: z.enum(['new_source', 'new_evidence', 'user_recheck', 'scheduled_recheck']),
  status: RunStatusSchema, attempt: z.number().int().nonnegative(), startedAt: TimestampSchema.nullable(), finishedAt: TimestampSchema.nullable(),
  modelId: Text, promptVersion: Text, policyVersion: Text, toolVersion: Text, provenance: ProvenanceSchema,
  limitations: z.array(LimitationSchema), error: ApiErrorDetailSchema.nullable(),
});
export const JourneyStepSchema = z.strictObject({
  id: IdSchema, runId: IdSchema, index: z.number().int().nonnegative(), kind: z.enum(['open_page', 'follow_link', 'inspect_page', 'capture_evidence', 'compare_sources']),
  status: z.enum(['complete', 'limited', 'failed']), label: BoundedText(500), fromDisplayUrl: z.string().max(2048).nullable(), toDisplayUrl: z.string().max(2048).nullable(), evidenceIds: Ids, occurredAt: TimestampSchema,
});
export const TriageProposalSchema = z.strictObject({
  outcome: z.enum(['new_request', 'case_update', 'no_action']), requestSummary: BoundedText(1000).nullable(), impacts: z.array(ImpactSchema),
  candidateCaseId: IdSchema.nullable(), relevantLinkIndexes: z.array(z.number().int().nonnegative()).max(100),
}).superRefine((value, ctx) => {
  if (value.outcome === 'case_update' && value.candidateCaseId === null) ctx.addIssue({ code: 'custom', path: ['candidateCaseId'], message: 'Case updates require a server-selected candidate.' });
  if (value.outcome !== 'case_update' && value.candidateCaseId !== null) ctx.addIssue({ code: 'custom', path: ['candidateCaseId'], message: 'Only case updates may select a candidate.' });
  if (value.outcome !== 'no_action' && (!value.requestSummary || value.impacts.length === 0)) ctx.addIssue({ code: 'custom', message: 'An actionable request requires a summary and impact.' });
  if (value.outcome === 'no_action' && (value.impacts.length > 0 || value.relevantLinkIndexes.length > 0)) ctx.addIssue({ code: 'custom', message: 'Reading-only sources cannot select consequential actions.' });
});
export const TriageResultSchema = TriageProposalSchema;
export const AssessmentProposalSchema = z.strictObject({
  verdict: VerdictSchema.nullable(), impacts: z.array(ImpactSchema), finding: FindingSchema.nullable(), nextAction: NextActionSchema.nullable(),
  checkedScope: z.array(BoundedText(1000)), limitations: z.array(LimitationSchema), changeSummary: BoundedText(1000).nullable(),
}).superRefine((value, ctx) => {
  if (value.verdict !== null && (!value.finding || !value.nextAction || !value.impacts.length || !value.checkedScope.length)) ctx.addIssue({ code: 'custom', message: 'A verdict requires a finding, primary action, impact, and checked scope.' });
  if (value.verdict === null && (value.finding !== null || value.nextAction !== null)) ctx.addIssue({ code: 'custom', message: 'An unassessed run cannot publish a finding or primary action.' });
});

export const BrowserEventInputSchema = z.strictObject({
  clientEventId: IdSchema, installationId: IdSchema, observedAt: TimestampSchema, pageUrl: z.url().max(2048), pageTitle: z.string().max(1000),
  eventType: z.enum(['page_detected', 'request_detected', 'page_changed']),
  request: z.strictObject({ kind: z.enum(['payment', 'identity_submission', 'account_permission', 'download']), visibleText: z.string().max(8000), destinationUrl: z.url().max(2048).nullable(), fieldLabels: z.array(BoundedText(200)).max(100), requestedPermissions: z.array(BoundedText(200)).max(100) }),
});
export const BrowserInstallationInputSchema = z.strictObject({ clientInstallationId: IdSchema, displayName: BoundedText(100) });
export const BrowserInstallationSchema = z.strictObject({ installationId: IdSchema, connectionId: IdSchema });
export const AcceptedBrowserEventSchema = z.strictObject({ sourceEventId: IdSchema, caseId: IdSchema.nullable(), runId: IdSchema.nullable() });
export const ViewedInputSchema = z.strictObject({ assessmentId: IdSchema });
export const RecheckInputSchema = z.strictObject({ reason: z.enum(['user_recheck', 'verification_requested']), note: z.string().trim().min(1).max(4000).optional() });
export const AcceptedRunSchema = z.strictObject({ caseId: IdSchema, runId: IdSchema, status: z.enum(['queued', 'checking']), reused: z.boolean() });
export const GoogleStartInputSchema = z.strictObject({ returnTo: z.string().regex(/^\/(?!\/)[a-zA-Z0-9/_-]*$/).max(200) });
export const GoogleStartResponseSchema = z.strictObject({ authorizationUrl: z.url(), expiresAt: TimestampSchema });
export const DisconnectionResultSchema = z.strictObject({ connectionId: IdSchema, cancelledRunCount: z.number().int().nonnegative(), providerRevocation: z.enum(['revoked', 'unavailable', 'not_required']) });
export const PageSchema = <T extends z.ZodType>(item: T) => z.strictObject({ items: z.array(item), nextCursor: z.string().nullable() });
export const ApiResponseSchema = <T extends z.ZodType>(data: T) => z.strictObject({ data, meta: z.strictObject({ requestId: Text, schemaVersion: z.literal(API_VERSION), eventCursor: z.string().optional() }) });
export const PaginationInputSchema = z.object({ cursor: z.string().max(512).optional(), limit: z.coerce.number().int().min(1).max(100).default(25) });
export const CaseFiltersSchema = PaginationInputSchema.extend({ verdict: VerdictSchema.optional(), impact: ImpactSchema.optional(), reviewStatus: ReviewStatusSchema.optional(), freshness: FreshnessSchema.optional(), q: z.string().max(200).optional() });
export const MessageFiltersSchema = PaginationInputSchema.extend({ disposition: MessageDispositionSchema.optional(), source: SourceKindSchema.optional(), q: z.string().max(200).optional() });

const EventBase = { id: Text, schemaVersion: z.literal(API_VERSION), occurredAt: TimestampSchema, caseId: IdSchema.nullable(), sourceRevision: z.number().int().positive().nullable() };
const SourceEventPayload = z.strictObject({ sourceEventId: IdSchema, kind: SourceKindSchema, disposition: MessageDispositionSchema, processingStatus: ProcessingStatusSchema, lastErrorCode: ErrorCodeSchema.nullable(), caseIds: Ids });
const TerminalPayload = z.strictObject({ runId: IdSchema, status: z.enum(['limited', 'failed', 'cancelled']), limitations: z.array(LimitationSchema), errorCode: ErrorCodeSchema.nullable() });
const event = <T extends string, S extends z.ZodType>(type: T, data: S) => z.strictObject({ ...EventBase, type: z.literal(type), data });
export const ActivityEventSchema = z.discriminatedUnion('type', [
  event('source.received', SourceEventPayload), event('source.updated', SourceEventPayload),
  event('case.created', z.strictObject({ case: CaseSummarySchema })), event('case.updated', z.strictObject({ case: CaseSummarySchema })),
  event('case.history_updated', z.strictObject({ assessmentId: IdSchema, runId: IdSchema })),
  event('investigation.queued', z.strictObject({ runId: IdSchema, status: z.literal('queued') })),
  event('investigation.started', z.strictObject({ runId: IdSchema, status: z.literal('checking') })),
  event('investigation.step_completed', z.strictObject({ runId: IdSchema, stepId: IdSchema, label: BoundedText(500), evidenceIds: Ids })),
  event('investigation.limited', TerminalPayload), event('investigation.failed', TerminalPayload), event('investigation.cancelled', TerminalPayload),
  event('assessment.published', z.strictObject({ assessment: AssessmentSchema, case: CaseSummarySchema })),
  event('review.updated', z.strictObject({ assessmentId: IdSchema, reviewStatus: ReviewStatusSchema })),
  event('connection.updated', z.strictObject({ connection: ConnectionSummarySchema })),
  event('resync.required', z.strictObject({ reason: z.enum(['cursor_expired', 'snapshot_gap']) })),
]);
export const EventTypeSchema = z.enum(['source.received', 'source.updated', 'case.created', 'case.updated', 'case.history_updated', 'investigation.queued', 'investigation.started', 'investigation.step_completed', 'investigation.limited', 'investigation.failed', 'investigation.cancelled', 'assessment.published', 'review.updated', 'connection.updated', 'resync.required']);
export const DashboardCountsSchema = z.strictObject({ pause_here: z.number().int().nonnegative(), confirm_first: z.number().int().nonnegative(), no_issues_found: z.number().int().nonnegative(), checking: z.number().int().nonnegative(), limited: z.number().int().nonnegative(), stale: z.number().int().nonnegative() });
export const DashboardSnapshotSchema = z.strictObject({ mode: AppModeSchema, counts: DashboardCountsSchema, cases: PageSchema(CaseSummarySchema), activity: z.array(ActivityEventSchema), connections: z.array(ConnectionSummarySchema) });
export const CaseDetailSchema = z.strictObject({ case: CaseSummarySchema, sources: z.array(SourceEventSchema), currentAssessment: AssessmentSchema.nullable(), activeRun: InvestigationRunSchema.nullable(), latestRun: InvestigationRunSchema.nullable(), journey: z.array(JourneyStepSchema), evidence: z.array(EvidenceSchema), historyCursor: z.string().nullable() });
export const MessageSummarySchema = SourceEventSchema.extend({ caseIds: Ids });
export const MessageDetailSchema = z.strictObject({ source: SourceEventSchema, content: z.string().max(100000), caseIds: Ids, originalUrl: z.url().nullable() });
export const RunDetailSchema = z.strictObject({ run: InvestigationRunSchema, steps: z.array(JourneyStepSchema) });
export const EvidenceDetailSchema = z.strictObject({ evidence: EvidenceSchema, artifactUrl: z.url().nullable(), expiresAt: TimestampSchema.nullable() });
export const CapabilityStatusSchema = z.enum(['ready', 'missing_configuration', 'needs_authorization', 'unavailable']);
export const CapabilitySchema = z.strictObject({ provider: Text, status: CapabilityStatusSchema, reason: z.string(), nextStep: z.string() });
export const SystemCapabilitiesSchema = z.strictObject({ mode: AppModeSchema, capabilities: z.array(CapabilitySchema) });

export const GetCaseContextInputSchema = z.strictObject({});
export const StartBrowserInputSchema = z.strictObject({ sourceEventId: IdSchema, linkIndex: z.number().int().nonnegative() });
export const InspectPageInputSchema = z.strictObject({ browserHandle: Text });
export const FollowStepInputSchema = z.strictObject({ browserHandle: Text, elementId: Text });
export const CaptureEvidenceInputSchema = z.strictObject({ browserHandle: Text, kind: z.enum(['screenshot', 'page_excerpt']), elementId: Text.optional() });
export const CompareClaimsInputSchema = z.strictObject({ sourceEvidenceId: IdSchema, observedEvidenceId: IdSchema });
export const FinishInvestigationInputSchema = z.strictObject({ proposal: AssessmentProposalSchema });
export const ToolResultSchema = <T extends z.ZodType>(data: T) => z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), data, evidenceIds: Ids }),
  z.strictObject({ ok: z.literal(false), error: z.strictObject({ code: ErrorCodeSchema, message: BoundedText(500), retryable: z.boolean() }), limitation: LimitationSchema.optional() }),
]);
export const AnyToolResultSchema = ToolResultSchema(z.unknown());

// JSON Schema isolates the SDK's Zod 3 dependency from the canonical Zod 4 runtime.
export const TRIAGE_JSON_SCHEMA = z.toJSONSchema(TriageProposalSchema, { target: 'draft-7' });
export const ASSESSMENT_JSON_SCHEMA = z.toJSONSchema(AssessmentProposalSchema, { target: 'draft-7' });

export const verdictLabels = { pause_here: 'Pause here', confirm_first: 'Confirm first', no_issues_found: 'No issues found' } as const;
export const impactLabels = { money: 'Money', identity: 'Identity', account_access: 'Account access', downloads: 'Downloads' } as const;
export const VERDICT_LABELS = verdictLabels;
export const IMPACT_LABELS = impactLabels;

export type AppMode = z.infer<typeof AppModeSchema>;
export type DataOrigin = z.infer<typeof DataOriginSchema>;
export type ExecutionMode = z.infer<typeof ExecutionModeSchema>;
export type Provenance = z.infer<typeof ProvenanceSchema>;
export type SourceKind = z.infer<typeof SourceKindSchema>;
export type MessageDisposition = z.infer<typeof MessageDispositionSchema>;
export type Verdict = z.infer<typeof VerdictSchema>;
export type Impact = z.infer<typeof ImpactSchema>;
export type RunStatus = z.infer<typeof RunStatusSchema>;
export type Freshness = z.infer<typeof FreshnessSchema>;
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;
export type ConnectionStatus = z.infer<typeof ConnectionStatusSchema>;
export type EvidenceKind = z.infer<typeof EvidenceKindSchema>;
export type LimitationCode = z.infer<typeof LimitationCodeSchema>;
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;
export type Money = z.infer<typeof MoneySchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
export type ConnectionSummary = z.infer<typeof ConnectionSummarySchema>;
export type ConnectionSyncScope = z.infer<typeof ConnectionSyncScopeSchema>;
export type SourceEvent = z.infer<typeof SourceEventSchema>;
export type Limitation = z.infer<typeof LimitationSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type NextAction = z.infer<typeof NextActionSchema>;
export type Assessment = z.infer<typeof AssessmentSchema>;
export type CaseSummary = z.infer<typeof CaseSummarySchema>;
export type InvestigationRun = z.infer<typeof InvestigationRunSchema>;
export type JourneyStep = z.infer<typeof JourneyStepSchema>;
export type TriageProposal = z.infer<typeof TriageProposalSchema>;
export type AssessmentProposal = z.infer<typeof AssessmentProposalSchema>;
export type BrowserEventInput = z.infer<typeof BrowserEventInputSchema>;
export type AcceptedRun = z.infer<typeof AcceptedRunSchema>;
export type RecheckInput = z.infer<typeof RecheckInputSchema>;
export type Page<T> = { items: T[]; nextCursor: string | null };
export type ApiResponse<T> = { data: T; meta: { requestId: string; schemaVersion: '1'; eventCursor?: string } };
export type ActivityEvent = z.infer<typeof ActivityEventSchema>;
export type EventType = ActivityEvent['type'];
export type DashboardSnapshot = z.infer<typeof DashboardSnapshotSchema>;
export type DashboardCounts = z.infer<typeof DashboardCountsSchema>;
export type CaseDetail = z.infer<typeof CaseDetailSchema>;
export type MessageSummary = z.infer<typeof MessageSummarySchema>;
export type MessageDetail = z.infer<typeof MessageDetailSchema>;
export type RunDetail = z.infer<typeof RunDetailSchema>;
export type Capability = z.infer<typeof CapabilitySchema>;
export type SystemCapabilities = z.infer<typeof SystemCapabilitiesSchema>;
export type CaseFilters = z.infer<typeof CaseFiltersSchema>;
export type MessageFilters = z.infer<typeof MessageFiltersSchema>;

export * from './invariants';
export * from './openapi';
