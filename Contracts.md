# Before You — Implementation Contracts

Version: 1.0  
Status: implementation baseline; this document describes contracts to build, not existing services.  
Companion files: `Spec.md` and `AGENTS.md`.

## 1. Ownership and conventions

`Spec.md` owns product behavior and acceptance. This file owns wire formats, domain invariants, and integration boundaries. `AGENTS.md` owns the implementation workflow. Implement these contracts in `packages/contracts`; import them from web, API, worker, extension, fixtures, and evaluations. Do not maintain separately handwritten copies.

- Use TypeScript, runtime Zod validation, JSON Schema for model output, and generated OpenAPI for HTTP contracts. Select a Zod version compatible with the pinned Droid SDK, or isolate a documented adapter at that boundary.
- API prefix: `/v1`. JSON keys: camelCase. Enum values: snake_case. PostgreSQL names: snake_case.
- IDs: opaque server-generated UUID strings. Timestamps: ISO 8601 UTC strings. Clients format local time.
- Monetary amounts: integer minor units with an ISO currency code; never floating-point totals.
- Distinguish absent, null, and empty values. Nullable fields below must be explicit in responses.
- Validate all external input, provider responses, and agent output. Render extracted content as text or sanitized markup, never executable HTML.
- All product-visible strings are English. Display copy is concise; internal diagnostic detail belongs in logs.
- Pagination uses opaque cursors, a stable tie-breaker ID, a default limit of 25, and a maximum of 100.
- Every owner-scoped lookup and mutation checks the authenticated owner on the server. An unguessable ID is not authorization.

## 2. Modes and provenance

```ts
type AppMode = "demo" | "live";
type DataOrigin = "synthetic" | "user";
type ExecutionMode = "simulated" | "live";

interface Provenance {
  dataOrigin: DataOrigin;
  execution: ExecutionMode;
}
```

`APP_MODE=demo` must run without cloud credentials using contract-compatible local adapters. Use a local fixture identity, fixture repository, deterministic provider responses, and simulated investigation events. Keep this mode bound to loopback; it must not grant unauthenticated access to live services or real user data. Reject a production deployment that enables demo authentication bypass. A separately published static synthetic preview may be built without any live API or secrets.

`APP_MODE=live` uses real authentication, database, and enabled provider adapters. A missing or failing provider is reported explicitly. Never fall back silently to demo data. Unavailable integrations must not prevent unrelated configured capabilities from working.

Provenance is assigned by trusted adapters and persisted, not invented by the model or accepted as a client's claim. Prewritten sample results are `synthetic/simulated`. A real Claude and Daytona investigation of a controlled fixture is `synthetic/live`. Real authorized user content with real execution is `user/live`. Data origin can differ between evidence items; retain per-item provenance as well as a run summary. Use a test account or trusted fixture registry to identify synthetic input.

Demo events exercise the same schemas, reducers, views, and failure handling. They are not evidence that a real integration passed. In live mode, simulated assessments cannot become a case's current assessment.

## 3. Canonical domain types

```ts
type SourceKind = "gmail" | "browser"; // FULL may add attachment sources.
type MessageDisposition = "pending" | "action_required" | "no_action";
type Verdict = "pause_here" | "confirm_first" | "no_issues_found";
type Impact = "money" | "identity" | "account_access" | "downloads";
type RunStatus = "queued" | "checking" | "complete" | "limited"
  | "failed" | "cancelled";
type Freshness = "current" | "stale";
type ReviewStatus = "unreviewed" | "viewed" | "verification_requested";
type ConnectionStatus = "not_connected" | "connecting" | "connected"
  | "needs_attention" | "disconnected";
type EvidenceKind = "message_excerpt" | "page_excerpt" | "screenshot"
  | "redirect" | "form_field" | "permission_request" | "download_metadata"
  | "user_statement" | "external_record";
type LimitationCode = "login_required" | "captcha" | "sensitive_action"
  | "network_policy" | "site_unreachable" | "unsupported_page"
  | "permission_missing" | "step_limit" | "time_limit"
  | "cost_limit" | "no_investigable_link";

interface Money {
  amountMinor: number;
  currency: string;
}

interface ConnectionSummary {
  id: string;
  kind: SourceKind;
  status: ConnectionStatus;
  accountLabel: string;
  grantedScopes: string[];
  lastSyncedAt: string | null;
  lastErrorCode: ErrorCode | null;
}

interface SourceEvent {
  id: string;
  connectionId: string;
  kind: SourceKind;
  externalId: string;
  externalThreadId: string | null;
  receivedAt: string;
  occurredAt: string;
  title: string;
  senderLabel: string | null;
  previewText: string;
  contentRef: string; // Server-owned private content reference, not a public URL.
  disposition: MessageDisposition;
  processingStatus: "queued" | "checking" | "complete" | "failed";
  lastErrorCode: ErrorCode | null;
  dataOrigin: DataOrigin;
}

interface Limitation {
  code: LimitationCode;
  message: string;
  stepId: string | null;
  evidenceIds: string[];
}

interface Evidence {
  id: string;
  caseId: string;
  runId: string | null;
  sourceEventId: string | null;
  stepId: string | null;
  kind: EvidenceKind;
  observedAt: string;
  sourceLabel: string;
  displayUrl: string | null; // Redacted; not automatically a navigation target.
  excerpt: string | null;
  artifactId: string | null;
  contentHash: string;
  provenance: Provenance;
}

interface Finding {
  headline: string;
  consequence: string | null;
  evidenceIds: string[];
}

type NextAction =
  | { kind: "review_evidence"; label: string; evidenceId: string }
  | { kind: "review_steps"; label: string }
  | { kind: "open_source"; label: string; sourceEventId: string }
  | { kind: "verify_request"; label: string };

interface Assessment {
  id: string;
  caseId: string;
  runId: string;
  version: number;
  sourceRevision: number;
  verdict: Verdict;
  impacts: Impact[];
  finding: Finding;
  nextAction: NextAction;
  checkedScope: string[];
  limitations: Limitation[];
  changeSummary: string | null;
  supersedesAssessmentId: string | null;
  createdAt: string;
  provenance: Provenance;
}

interface CaseSummary {
  id: string;
  recordVersion: number; // Increment on every material case update.
  title: string;
  sourceKinds: SourceKind[];
  sourceRevision: number;
  currentAssessment: Assessment | null;
  activeRunId: string | null;
  latestRunStatus: RunStatus | null;
  freshness: Freshness;
  reviewStatus: ReviewStatus;
  updatedAt: string;
}

interface InvestigationRun {
  id: string;
  caseId: string;
  sourceRevision: number;
  trigger: "new_source" | "new_evidence" | "user_recheck" | "scheduled_recheck";
  status: RunStatus;
  attempt: number;
  startedAt: string | null;
  finishedAt: string | null;
  modelId: string;
  promptVersion: string;
  policyVersion: string;
  toolVersion: string;
  provenance: Provenance;
  limitations: Limitation[];
  error: ApiError["error"] | null;
}

interface JourneyStep {
  id: string;
  runId: string;
  index: number;
  kind: "open_page" | "follow_link" | "inspect_page" | "capture_evidence"
    | "compare_sources";
  status: "complete" | "limited" | "failed";
  label: string;
  fromDisplayUrl: string | null;
  toDisplayUrl: string | null;
  evidenceIds: string[];
  occurredAt: string;
}
```

An internal record adds `ownerId` and private provider/storage identifiers where required. Do not expose credentials, raw session files, or internal storage paths through these public DTOs. Aggregate token counts and cost estimates are internal run metrics; mark an estimate as an estimate and do not invent an exact provider charge.

### Judgment rules

- Display mapping: `pause_here` → `Pause here`; `confirm_first` → `Confirm first`; `no_issues_found` → `No issues found`.
- No assessment means no verdict. Show `Checking`, `Investigation limited`, or `Could not complete`, as appropriate; never default to green.
- `no_action` is a message disposition. Such messages remain visible in All messages and do not inflate the No issues found count.
- `pause_here` needs concrete evidence of a materially risky requested action. `confirm_first` identifies a specific unresolved question or mismatch. Uncertainty alone does not prove fraud.
- A published finding normally cites at least one observation (`page_excerpt`, `screenshot`, `redirect`, `form_field`, `permission_request`, `download_metadata`, or `external_record`). Exception: a `limited` run with at least one explicit limitation may publish `pause_here` or `confirm_first` from a `message_excerpt` alone when the message itself states the risky request (for example, asking for a full SSN by reply). Its `checkedScope` and limitations must say that linked pages were not checked. A `user_statement` alone never supports a judgment, and this exception never permits `no_issues_found`.
- `no_issues_found` requires a completed investigation of its declared relevant scope and supporting observations. It is not a guarantee about the person, website, payment, or all future steps.
- An observation-only scope can finish at a documented pre-submission boundary without performing the transaction. If a relevant check itself cannot be performed, the run is `limited`; do not publish a new `no_issues_found` assessment.
- All displayed factual claims and consequences must reference evidence. Distinguish observed page content from an inference about that content. Do not claim an unseen subsequent page was visited.
- Model-proposed copy targets: headline ≤120 characters; consequence ≤180; primary action label ≤40. Keep longer scope detail in the drawer. Do not silently truncate evidence quotations.
- A null consequence is hidden. Never fill that line with an unsupported prediction or a generic slogan.
- Each assessed actionable case has at least one impact tag. Classification can use multiple tags. Unassessed/no-action items may have none.
- Exactly one primary action per card. A handler must exist for every action kind.

### Next-action semantics

`review_evidence` opens the referenced evidence in the case drawer. `review_steps` opens the observed journey. `open_source` resolves an owner-authorized original message/page reference on explicit user action; it is not an automatic browser navigation. `verify_request` opens the verification section with the unresolved question, supporting evidence, and a `Recheck` operation. It does not send an email, claim the sender was contacted, or mark the case safe. When independent contact information has not been established, say so.

## 4. State transitions and publication

### Source triage before case creation

Persist each incoming source as `pending` with `processingStatus=queued` and enqueue a durable triage job before a case exists. Use the same Claude-through-Droid runtime with tools disabled for this structured classification step. Supply only relevant source content and server-selected candidate cases from the same owner/thread. Browser observations also pass through validated triage; a client-provided request kind is a hint, not a trusted judgment.

```ts
interface TriageProposal {
  outcome: "new_request" | "case_update" | "no_action";
  requestSummary: string | null;
  impacts: Impact[];
  candidateCaseId: string | null;
  relevantLinkIndexes: number[];
}
```

The adapter extracts a stable ordered link list from the sanitized source. The model selects indexes from that list, never invents target URLs. Validate candidate IDs against the server-supplied owner-scoped set. A follow-up can be `case_update` without asking the user to perform a new action. In MINIMUM, group related actions for the same purpose (for example, one rental application's fee and identity request) into one case with multiple impacts. Independent purposes become separate cases through a later explicit extension of the triage schema, not an accidental domain-only merge.

For `new_request` or `case_update`, set disposition to `action_required`, link/create the case, and enqueue investigation transactionally. For `no_action`, finish triage with no case creation. A triage failure leaves disposition `pending`, sets processingStatus to `failed`, and reports the error rather than pretending the message was harmless. Every completed or failed classification emits `source.updated` so All messages and browser lookup can refresh without a page reload.

### Investigations

Allowed transitions:

| From | To | Condition |
| --- | --- | --- |
| `queued` | `checking` | Worker owns the leased job and obtains the case lock |
| `queued` | `cancelled` | Disconnect, explicit cancellation, or superseded job |
| `checking` | `complete` | Declared scope finished; output validated and evidence saved |
| `checking` | `limited` | A documented boundary prevents relevant checks |
| `checking` | `failed` | Provider/runtime/validation failure with no publishable result |
| `checking` | `cancelled` | Cancellation or connection revocation |
| terminal | new run | Retry/recheck creates a new run record; preserve prior outcome |

Infrastructure retries of a job that never started work may reuse its queued run. Once external investigation has begun, record attempts and their effects. A recovered worker must not silently replay potentially consequential actions. Enforce bounded attempts and a dead-letter outcome for repeated failure.

### Source revisions and freshness

1. After validated triage, associate an accepted independent external input with a case, increment its `sourceRevision`, mark an existing assessment stale, and enqueue the corresponding job or durable outbox entry in one transaction. External inputs include relevant new messages, material page-change events, or user-submitted statements. Evidence captured by the active investigation belongs to its fixed revision: it must not increment `sourceRevision` or trigger a recursive investigation.
2. A run reads a fixed source revision. Only server-owned tool results can create evidence for that run.
3. Validate an assessment proposal against its evidence and run scope.
4. Publish in one transaction: verify the source revision, activeRunId, current worker lease generation, unexpired lease, and nonterminal run status; then insert an immutable assessment, update the current pointer, finalize the run, increment case recordVersion, and append activity/outbox events. A recovered or superseded attempt cannot publish even when its source revision matches. Only one assessment may be committed per run; an idempotent repeated finish call returns that existing result.
5. A late result for an old revision remains historical and never replaces the current result. Schedule the missing latest revision when necessary.
6. Complete or limited investigations may publish supported `pause_here` / `confirm_first` results. Only complete investigations can publish `no_issues_found`.
7. A failed recheck retains the old assessment as stale and visibly displays the failed check. Do not repaint it as current.

Emit `assessment.published` only when the current pointer actually changes. A validated late result retained solely as history emits `case.history_updated`; it does not trigger a new current judgment. The current pointer is authoritative, not the highest historical assessment version. Clients apply case snapshots only when recordVersion is newer; the event cursor orders delivery across all case/source changes.

New evidence does not imply lower risk. A statement such as "the subscription is optional" is stored as a statement; if the observed checkout still requires it, preserve the conflict.

### Review state

Viewing is recorded against a specific assessment ID, not just a case ID. An unseen replacement assessment is unreviewed. `verification_requested` records the user's request and triggers/links a recheck; it does not certify the issue was resolved. Preserve review history even after a new assessment resets the displayed review state.

### Connections

`not_connected → connecting → connected`; failures go to `needs_attention`. Revoked/expired credentials produce `needs_attention`, stop affected new work, and expose `Reconnect`. Explicit disconnection cancels queued work, attempts provider revocation where supported, and removes usable stored credentials. It does not silently erase case history. Historical results show the disconnected source and freshness.

## 5. Storage contract

Use Supabase PostgreSQL and Drizzle migrations. Minimum entities:

| Entity | Required relationships and constraints |
| --- | --- |
| `connections` | Owner; provider account ID; encrypted refresh credential reference; status; sync cursor; unique owner/provider/account |
| `source_events` | Owner; connection; external ID; source kind; content reference; thread ID; disposition; unique connection/external ID |
| `cases` | Owner; source revision; nullable current assessment pointer; timestamps |
| `case_sources` | Case/source association; unique pair; all linked records must share owner |
| `investigation_runs` | Case; captured source revision; status; provider/session references; pinned model/prompt/policy/tool versions |
| `investigation_steps` | Run; ordered index; tool kind; sanitized factual label; evidence references; outcome |
| `evidence` | Case; optional run and source; kind; immutable content hash; artifact reference; provenance |
| `assessments` | Case/run; unique case/version and unique run ID; source revision; JSON fields validated by shared schema; immutable history |
| `review_events` | Owner; case; assessment; viewed/verification_requested; timestamp |
| `activity_events` | Owner; monotonically ordered event ID; event type; referenced entities; no secrets |
| `outbox_events` | Committed events awaiting delivery; transactionally written with state changes |

Queue tables are managed by pg-boss in a separate schema. Source ingestion and enqueueing must be atomic through a supported shared transaction or a transactional outbox. Do not claim idempotent job creation alone makes every remote action exactly-once.

Store screenshots and larger content in a private Storage bucket. Issue short-lived URLs only after ownership checks. Save MIME type, byte length, hash, and retention metadata. User statements and external claims are never overwritten into observations. Use RLS for exposed Supabase data paths and explicit owner filters in backend queries; a privileged service key does not make authorization automatic.

Use a persistent-backend compatible database connection, generally direct or session pooling; verify the selected network and pg-boss behavior. Do not use the browser's Supabase publishable key as a worker database credential.

Case association in MINIMUM is conservative: a trusted same-account Gmail thread plus compatible requested action, or a validated browser destination linked to an existing case. The same domain alone is insufficient. Ambiguous sources become separate cases; FULL may add reviewed correlation. Never merge across owners or discard identity-bearing URL parameters merely to force a match.

## 6. HTTP API

### Authentication and response envelopes

Live requests use `Authorization: Bearer <Supabase access token>`. Verify signature, issuer, audience, expiration, and owner. The OAuth callback instead validates its single-use server-owned state. Demo authentication is a local adapter, never a production query flag.

```ts
interface ApiResponse<T> {
  data: T;
  meta: { requestId: string; schemaVersion: "1"; eventCursor?: string };
}

interface Page<T> { items: T[]; nextCursor: string | null; }

interface AcceptedRun {
  caseId: string;
  runId: string;
  status: "queued" | "checking";
  reused: boolean;
}
```

Validate tokens on the API regardless of frontend guards. Permit only configured web and extension origins. Reject mismatched Origin/Host on local mutation routes as well; loopback is not a substitute for CSRF protection. No bearer tokens in query strings or logged URLs.

### MINIMUM routes

| Method and route | Input | Response / behavior |
| --- | --- | --- |
| `GET /health/live` | None | Process liveness only; no secrets |
| `GET /v1/system/capabilities` | Auth | App mode and provider capability states: ready/missing_configuration/needs_authorization/unavailable; sanitized reason |
| `GET /v1/dashboard` | Auth | Verdict counts for current assessments, checking/limited/stale counts, first case page, recent activity, connection summaries; consistent snapshot event cursor |
| `GET /v1/cases` | `verdict?`, `impact?`, `reviewStatus?`, `freshness?`, `q?`, `cursor?`, `limit?` | `Page<CaseSummary>`; filters combine with AND; search owner-scoped title/finding/source metadata |
| `GET /v1/cases/:id` | Auth | Case summary, ordered sources, current assessment, active/latest run, observed journey, evidence, and history cursor |
| `GET /v1/cases/:id/assessments` | Cursor/limit | Assessment history, newest first |
| `GET /v1/messages` | `disposition?`, `source?`, `q?`, cursor/limit | Source summaries and associated case IDs; includes no_action messages |
| `GET /v1/messages/:id` | Auth | SourceEvent, sanitized original content, associated case IDs, and owner-authorized original-source link; also supports browser-source lookup after asynchronous triage |
| `GET /v1/evidence/:id` | Auth | Evidence DTO; short-lived artifact access when applicable |
| `POST /v1/cases/:id/viewed` | `{assessmentId}` | Review state; idempotent for owner/assessment; cannot acknowledge a different case |
| `POST /v1/cases/:id/rechecks` | `{reason: "user_recheck" | "verification_requested", note?: string}` | HTTP 202 `AcceptedRun`; note is a user statement, not observed proof |
| `GET /v1/runs/:id` | Auth | Run summary and sanitized operational steps |
| `GET /v1/activity` | Cursor/limit | `Page<ActivityEvent>` |
| `GET /v1/connections` | Auth | `ConnectionSummary[]` |
| `POST /v1/connections/gmail/start` | `{returnTo: allowedRelativePath}` | `{authorizationUrl, expiresAt}`; state bound to owner and current session |
| `GET /v1/connections/gmail/callback` | Google `code`, `state` | Validate state, exchange code server-side, store encrypted credentials, redirect to allowlisted Connections route; no secrets in redirect |
| `DELETE /v1/connections/:id` | Auth | Disconnection result, cancelled-run count, provider-revocation status |
| `POST /v1/browser/installations` | `{clientInstallationId, displayName}` | Idempotently register this authenticated owner's extension installation; return server-owned `{installationId, connectionId}` |
| `POST /v1/browser/events` | `BrowserEventInput` | HTTP 202 `{sourceEventId, caseId: string | null, runId: string | null}`; triage may still be pending |
| `GET /v1/events` | Auth; optional `Last-Event-ID` header | Authenticated SSE stream |

Snapshot/DTO implementation may use explicit named interfaces for each route, generated from these shapes. Do not return different error formats for browser events and Gmail-derived cases.

The three judgment counts include only cases with a current, non-stale assessment. Their default filters use the same scope so counts and results agree. Show stale and unassessed cases in a separate update/checking area; preserve prior concerns in the detail view labeled as previous. When explicitly filtering stale cases, never style a previous `no_issues_found` result as a current favorable judgment. Checking, limited, and stale counts may overlap and must not be presented as a disjoint total.

Use `Idempotency-Key` on POST ingestion/recheck operations. Scope it to owner+route and retain a request hash with the result. Same key/same input returns the same result; same key/different input returns 409. Database uniqueness handles provider duplicates even without that header.

AcceptedRun may reuse only queued/checking work for the current revision. A terminal run is history, not accepted active work. A new recheck creates a new run even if no external source revision changed; acquire a new lease generation, update the activeRunId, and mark any retained assessment stale before execution. A case with no assessment uses freshness=current as a neutral initial value; the null assessment determines the unassessed UI.

### Browser event input

```ts
interface BrowserEventInput {
  clientEventId: string;
  installationId: string;
  observedAt: string;
  pageUrl: string;
  pageTitle: string;
  eventType: "page_detected" | "request_detected" | "page_changed";
  request: {
    kind: "payment" | "identity_submission" | "account_permission" | "download";
    visibleText: string;
    destinationUrl: string | null;
    fieldLabels: string[];
    requestedPermissions: string[];
  };
}
```

The registration route creates a browser connection bound to the verified owner. Subsequent events resolve connectionId from that installation on the server and reject an installation owned by anyone else. Store registration in connections or a dedicated installation table with a unique owner/clientInstallationId mapping. Registering again is idempotent; changing the signed-in owner requires a separate registration.

The extension observes only allowed sites with user-granted permissions. It sends selected visible request context, not whole browsing history, cookies, entered form values, passwords, OTPs, payment credentials, or identity documents. Server-side validation, URL checks, and deduplication still apply. Limit event bodies to 64 KiB, visibleText to 8,000 characters, and each label/permission list to 100 bounded strings. Debounce mutations and compare relevant content hashes before emitting changes. Follow a pending accepted event through GET /v1/messages/:id and source.updated rather than assuming caseId exists immediately.

Authenticate the extension through an implementation of Supabase's supported PKCE/browser-extension flow. Do not copy website cookies or expose Google refresh tokens to the extension. The extension may show checking/limited states and view the matching case; MINIMUM does not promise a universal transaction blocker.

### FULL additions

- `POST /v1/integrations/google/pubsub`: authenticated Pub/Sub push envelope; validate expected identity/audience and topic/subscription configuration, then durably enqueue account sync before acknowledging. A notification contains change information, not trusted email content.
- Attachment and user-evidence ingestion: owner-scoped private upload, MIME/size validation, immutable source item, and re-investigation. Define the exact route/schema before implementation; never accept executable arbitrary attachment content into the API process.
- Case correlation, retention/deletion, evaluation results, and supported action-guard APIs are explicit versioned extensions. They are FULL scope, not hidden mandatory MINIMUM work.

## 7. Real-time event contract

Use authenticated fetch-based SSE so the client can supply a bearer header and refresh authentication. Do not put an access token in an EventSource URL.

```ts
type EventType = "source.received" | "source.updated" | "case.created" | "case.updated"
  | "case.history_updated"
  | "investigation.queued" | "investigation.started"
  | "investigation.step_completed" | "investigation.limited"
  | "investigation.failed" | "investigation.cancelled"
  | "assessment.published" | "review.updated" | "connection.updated"
  | "resync.required";

interface ActivityEvent {
  id: string; // Opaque durable ordering cursor, serialized as string.
  schemaVersion: "1";
  type: EventType;
  occurredAt: string;
  caseId: string | null;
  sourceRevision: number | null;
  data: Record<string, unknown>; // Implement as an EventType-discriminated union.
}
```

Concrete event payloads:

| Event(s) | `data` fields |
| --- | --- |
| `source.received`, `source.updated` | `sourceEventId`, `kind`, `disposition`, `processingStatus`, `lastErrorCode`, `caseIds` |
| `case.created`, `case.updated` | `case: CaseSummary` |
| `case.history_updated` | `assessmentId`, `runId`; invalidate history only, never replace the current pointer |
| investigation queued/started | `runId`, `status` |
| `investigation.step_completed` | `runId`, `stepId`, `label`, `evidenceIds`; factual progress only |
| investigation limited/failed/cancelled | `runId`, `status`, `limitations`, `errorCode: ErrorCode | null` |
| `assessment.published` | `assessment: Assessment`, `case: CaseSummary` |
| `review.updated` | `assessmentId`, `reviewStatus` |
| `connection.updated` | `connection: ConnectionSummary` |
| `resync.required` | `reason: "cursor_expired" | "snapshot_gap"` |

Event `id` appears in the SSE `id:` field; type appears in `event:`; the serialized envelope appears in `data:`. Send heartbeat comments without treating them as business events. Do not stream private chain-of-thought, raw prompts, or provider tokens.

The dashboard snapshot includes the committed cursor from the same consistent database snapshot as its data. Subscribe from that cursor and replay later owner-scoped events. On reconnect, send the last handled event ID; deduplicate by ID. Expired cursors require a fresh snapshot. Clients ignore older case recordVersions and honor the server's current assessment pointer; historical-only updates never replace it. Reconcile on reconnect/tab visibility; SSE delivery is not the source of truth.

Use a durable database outbox/event log so an API or worker restart cannot lose a published assessment notification. A simple API-side event-log poll is acceptable in MINIMUM; preserve the same client contract when scaling delivery.

## 8. Runtime agent and tool boundary

### Runtime wiring

The worker invokes the Factory Droid SDK with an explicitly configured Claude BYOK model. Model credentials stay in the trusted runtime. Install the compatible Droid CLI in the worker image; the SDK package alone is not the whole runtime. Pin model ID and SDK/CLI versions after checking current official documentation and account availability.

Expose purpose-built investigation tools through the SDK. Disable unrelated native execution/file/network tools, inventory available tools at startup, and fail closed if the effective tool set cannot be restricted. SDK disabled-tool configuration is not a complete security sandbox: use process/container isolation, narrow credentials, and tool-server authorization. The investigation browser runs in Daytona without Gmail credentials, database credentials, user cookies, or the Anthropic key.

One case has one active investigation at a time in MINIMUM. Repeated source events coalesce into the latest required revision. Each tool call carries a server-attached owner, case, run, policy, and step context; the model cannot set these privileges.

### Tools

| Tool | Model input | Server result and policy |
| --- | --- | --- |
| `get_case_context` | `{}` | Relevant sanitized sources, known evidence references, current revision, prior assessment; no tokens or unrelated mailbox content |
| `start_browser` | `{sourceEventId, linkIndex}` | Server-resolved validated target, browser handle, initial observation; target must belong to authorized source context |
| `inspect_page` | `{browserHandle}` | Visible text, actionable element IDs, form labels, destination/permission/download metadata, evidence IDs; exclude entered sensitive values |
| `follow_step` | `{browserHandle, elementId}` | New observation and evidence IDs, or typed boundary; only policy-approved non-consequential navigation |
| `capture_evidence` | `{browserHandle, kind: "screenshot" | "page_excerpt", elementId?: string}` | Server captures actual bytes/text, persists immutable evidence, returns IDs; model-supplied quotations are not evidence |
| `compare_claims` | `{sourceEvidenceId, observedEvidenceId}` | Side-by-side actual excerpts and metadata; model interprets them, server never labels one true solely because of its source |
| `finish_investigation` | `{proposal: AssessmentProposal}` | Validates proposal, returns accepted/rejected result to worker; transactionally publishes only through server state rules |
| `search_independent_sources` | `{query, preferredDomains?: string[]}` | FULL: Exa results with source URLs/excerpts; no private mailbox content in queries; fetched pages become evidence through normal policy |

Tool outputs use `{ok: true, data, evidenceIds}` or `{ok: false, error: {code, message, retryable}, limitation?: Limitation}`. Expected boundaries are typed outcomes, not generic exceptions. Browser/session handles are run-scoped and rejected outside their originating run.

`finish_investigation` does not trust a model to mark tools successful, mutate a bank account, or publish to another owner. Final output and tool results are validated independently.

```ts
interface AssessmentProposal {
  verdict: Verdict | null;
  impacts: Impact[];
  finding: Finding | null;
  nextAction: NextAction | null;
  checkedScope: string[];
  limitations: Limitation[];
  changeSummary: string | null;
}
```

The server attaches IDs, run, version, timestamp, provenance, and source revision. A non-null verdict requires a finding, a supported next action, and valid owner/case evidence IDs. A null verdict means insufficient publishable evidence: save a limited/failed run without fabricating an assessment. Unknown or cross-case evidence references are rejected. One bounded correction request is permitted for invalid structured output; repeated invalid output becomes `OUTPUT_INVALID`.

### Browsing policy

- Treat email/webpage/attachment content as untrusted data, including text that instructs the agent to reveal secrets or change its rules.
- Validate destinations before access and after redirects; block private/loopback/link-local/cloud-metadata addresses, unsafe schemes, embedded credentials, and unapproved network destinations. Enforce in a network/tool layer, not just a model prompt.
- Do not automatically open magic-login, password-reset, unsubscribe, invitation-acceptance, or other action-bearing links. A GET request is not necessarily harmless. Record a boundary instead.
- No real payment, authorization grant, identity upload, message send, installation, or form submission. No CAPTCHA bypass or replication of a user's authenticated session.
- Fixture navigation exceptions must be assigned by server configuration for owned synthetic sites, never by webpage text or an extension flag. Keep their provenance visible.
- Preinstall Chromium and dependencies in a versioned Daytona image/snapshot. Create isolated browser contexts and clean up sessions in success, failure, cancellation, and worker-recovery paths.
- Define configurable step/time/token/concurrency budgets and log which limit ended a run. Operational limits are required even when delivery time is unconstrained. Do not make recursive unbounded browsing the default.
- FULL may add generated parsing scripts against saved page snapshots inside a separate restricted execution environment. This does not grant arbitrary shell/network access to the trusted worker or replace the navigation policy.

## 9. Gmail connector

Use separate application login and Gmail connection authorization. Request only the Gmail capabilities needed for reading; MINIMUM has no send/modify scope. Store refresh credentials server-side with encryption whose key is outside the database. Keep scope choices and configured redirect URI explicit in the connection guide.

MINIMUM uses a persistent background incremental poller; a configurable development default of 15 seconds is acceptable for the small test mailbox. Do not run sync only when a dashboard is open. Initial sync defaults to at most the 50 most recent messages received in the last 7 days, excluding Spam and Trash. Show this processing scope in Connections before the OAuth handoff, and record the starting cutoff/cap on the connection. This application limit does not narrow the breadth of the Google OAuth scope; communicate that distinction accurately in connection details. Record when older messages were excluded by the cap.

Capture a provider history checkpoint before the initial listing and replay subsequent changes after the bounded initial import, deduplicating overlaps, so arrivals during setup are not lost. Thereafter sync new relevant changes incrementally with per-account backoff. An expired incremental cursor triggers a bounded resync with a visible coverage limitation if a gap cannot be recovered. Advance the sync checkpoint only after source events and jobs are durable. Provider history IDs and SSE event cursors are distinct values and must not be interchanged.

Distinguish a successful sync with no relevant requests from a disconnected source. Rate limits delay work with a visible connection state; expired/revoked authorization requests reconnection and does not loop indefinitely.

FULL uses Gmail watch/Pub/Sub, renews subscriptions, and retains periodic reconciliation. Notifications trigger authenticated history retrieval; they are not themselves message bodies. Account mapping derives from a stored authorized connection, not an arbitrary email address supplied by a webhook caller.

## 10. Errors and capability reporting

```ts
type ErrorCode = "AUTH_REQUIRED" | "FORBIDDEN" | "NOT_FOUND"
  | "VALIDATION_ERROR" | "CONFIG_MISSING" | "CONNECTION_REQUIRED"
  | "CONNECTION_EXPIRED" | "PROVIDER_ACCESS_DENIED" | "RATE_LIMITED"
  | "SANDBOX_NETWORK_BLOCKED" | "TARGET_BLOCKED" | "INVESTIGATION_LIMITED"
  | "OUTPUT_INVALID" | "STALE_REVISION" | "IDEMPOTENCY_CONFLICT"
  | "PROVIDER_UNAVAILABLE" | "INTERNAL_ERROR";

interface ApiError {
  error: {
    code: ErrorCode;
    message: string;
    retryable: boolean;
    requestId: string;
    details?: {
      fieldErrors?: Record<string, string[]>;
      provider?: string;
      missingVariableNames?: string[];
      retryAfterSeconds?: number;
    };
  };
}
```

Use 400 for invalid input, 401 for missing/expired app authentication, 403 for denied access, 404 for missing/inaccessible owner resources, 409 for revision/idempotency conflicts, 429 for rate limits, 503 for unavailable configuration/providers, and 500 for unexpected internal errors. Missing Gmail connection is a typed `CONNECTION_REQUIRED` response, not an empty successful inbox.

Request IDs correlate sanitized API, worker, and tool logs. Do not expose stack traces, provider secrets, raw OAuth responses, private source content, or signed artifact URLs in general logs. Retry only transient failures; never retry credential/permission failures as if they were temporary outages.

The project `doctor` script must report each integration separately, with `ready`, `missing_configuration`, `needs_authorization`, or `unavailable`, and a specific next step. Invoke it as `pnpm run doctor`: the pinned pnpm 10 version reserves `pnpm doctor` for its own built-in diagnostic. The project script can verify shape/presence without revealing values. Live connectivity checks are explicit and bounded. Missing keys do not block no-key scaffolding, UI development, contract tests, or demo startup.

## 11. Configuration ownership

Create an `.env.example` with empty/placeheld values and comments, never real credentials. Validate environment variables separately for each process and mode.

| Variable / configuration | Consumer | Exposure |
| --- | --- | --- |
| `APP_MODE` | Web/API/worker/extension build | Non-secret; must agree across processes |
| `WEB_ORIGIN`, `API_ORIGIN`, `ALLOWED_EXTENSION_ORIGINS` | API/web/extension | Non-secret origins; validate allowlist |
| `NEXT_PUBLIC_API_ORIGIN`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Web | Public configuration only |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` | Authorized backend components | Backend-only; minimize credential grants |
| `SUPABASE_STORAGE_BUCKET` | API/worker | Private bucket identifier |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | API/connector | Secret remains backend-only; exact redirect must be documented |
| `CREDENTIAL_ENCRYPTION_KEY` | Credential store | Agent generates locally when permitted; never checked into Git |
| `ANTHROPIC_API_KEY`, `CLAUDE_MODEL_ID` | Trusted agent runtime | API key secret; explicit pinned model configuration |
| `FACTORY_API_KEY` | Droid runtime | Secret; SDK authentication and entitlement verified separately |
| `DAYTONA_API_KEY`, `DAYTONA_SNAPSHOT` | Sandbox adapter | Key secret; snapshot pinned after validation |
| `GMAIL_POLL_INTERVAL_SECONDS`, `MAX_INVESTIGATION_STEPS`, `INVESTIGATION_TIMEOUT_MS`, `MODEL_MAX_OUTPUT_TOKENS` | Worker | Validated positive limits with documented defaults |
| `EXA_API_KEY` | FULL search adapter | Secret; optional until FULL implementation |
| Chalk environment credentials | FULL eval runner | Use current documented environment/auth configuration; do not invent an SDK variable name |

Extension public config is generated from a dedicated allowlist; never inject an entire root environment into a client bundle. The agent generates routine local secrets/configuration and asks the human only for account-owned credentials, authorization, or provider access it cannot obtain through authorized tools.

## 12. Contract verification

Implement meaningful checks for the following:

1. Demo DTOs, actual provider adapters, agent output, and SSE payloads all validate against the same schemas.
2. Duplicate Gmail/browser events produce one source record and no duplicate case/run for the same revision.
3. A late run or obsolete lease generation cannot overwrite a newer assessment; run-owned evidence does not invalidate its own source revision; historical-only results never emit a current-publication event.
4. Viewing one assessment does not mark a later assessment reviewed or remove its risk.
5. Failure, login boundaries, and missing configuration do not produce `no_issues_found`.
6. Evidence references cannot cross users/cases; the model cannot fabricate observation records.
7. A disconnected dashboard can reconnect from a durable cursor without losing or duplicating a published assessment.
8. Live mode rejects simulated assessment publication and production rejects demo-auth bypass.
9. Prompt-injection text cannot grant tools, read credentials, or authorize sensitive browsing actions.
10. Authorized synthetic fixtures with changed fees/permissions produce changed observed evidence in a real Claude/Droid/Daytona run.

Run normal, adversarial, and unavailable-provider cases. Report exactly which tests used simulated adapters versus live providers. Do not declare the MINIMUM product complete until its Spec acceptance conditions pass with real integrations.

## 13. Official references to verify at implementation

These are integration references, not evidence that this repository already implements them. Recheck current schemas, packages, and account capabilities before installation; pin compatible versions and retain the lockfile.

- Factory TypeScript SDK: https://docs.factory.com/sdk/typescript
- Factory custom models / BYOK: https://docs.factory.com/model-independence/byok
- Daytona documentation and network policy: https://www.daytona.io/docs/en/ and https://www.daytona.io/docs/en/network-limits/
- Playwright library: https://playwright.dev/docs/library
- Gmail scopes: https://developers.google.com/workspace/gmail/api/auth/scopes
- Gmail push: https://developers.google.com/workspace/gmail/api/guides/push
- Chrome content scripts: https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- WXT: https://wxt.dev/
- Supabase connections: https://supabase.com/docs/guides/database/connecting-to-postgres
- pg-boss: https://github.com/timgit/pg-boss
- Chalk evaluations: https://docs.chalk.ai/docs/compute/evaluations
- Exa search: https://exa.ai/docs/reference/search

