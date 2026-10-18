# Verification and remaining release gates

Local verification completed on 2026-10-17 (America/New_York). The minimum release is **incomplete** because connected-account acceptance checks and the Daytona sandbox gate have not passed. Local fixtures are `synthetic/simulated`; none of those results measures Claude accuracy or proves Google/Supabase/Factory/Daytona access.

## Controlled live investigation (2026-10-18)

`APP_MODE=live pnpm exec tsx scripts/investigation-checkpoint.ts` with `BROWSER_RUNTIME=local_controlled` passed every stage except Daytona, which it reports as BLOCKED: Supabase session, SC-01 ingress and queueing, real Claude/Droid triage and investigation (provenance `synthetic/live`), a page excerpt captured from the controlled fixture over HTTPS by the local controlled-fixture browser, run status `limited` with the explicit local-browser limitation, a `pause_here` assessment headlined on the undisclosed $29/month membership, and the case detail rendered in the dashboard at desktop and mobile widths ([desktop](screenshots/sc01-local-desktop.png), [limitations](screenshots/sc01-local-desktop-limitations.png), [mobile](screenshots/sc01-local-mobile.png)). The Daytona sandbox browser remains unverified because Tier 1 egress resets TLS; see the [integration guide](integrations.md#daytona-browser-access).

## Checks actually performed

| Check | Observed result |
| --- | --- |
| Pinned pnpm frozen-lockfile install, offline cache | Passed; lockfile up to date |
| Deterministic tests | 88 passed: contracts 8, fixtures 6, database 11, agent 37, API 17, worker 4, web state 5 |
| Chromium demo workflows | 3 passed: evidence/viewed/message filtering/connections; durable follow-up/history/refresh; mobile/keyboard/empty/error recovery |
| Workspace lint and TypeScript | Passed |
| Production build | Next.js and Chrome MV3 extension built; API/worker/package checks passed |
| Built production UI, actual Chromium | Sign-in required; no demo controls; no page errors |
| Extension, actual isolated Chromium | Production panel loads; API transport permission only; no content-script registration before explicit site consent |
| Local evaluation | 8 policy/contract checks passed; 1 unsupported model-accuracy check; no model calls |
| Project diagnostics | `pnpm run doctor` exits 2 and identifies missing live configuration; running web/API return 200 |
| Supabase checkpoint | Exits 2 for missing configuration before network/database calls |

Node's database test count includes the parent SQL integration test plus its subtests. PostgreSQL behavior is exercised locally through PGlite; it is not a Supabase connection check. OAuth tests explicitly use a mock provider/database. The last worker context regression was rerun after the full suite, bringing the final test total to 88.

Screenshots: [desktop](screenshots/overview-desktop.png), [evidence](screenshots/evidence-desktop.png), [mobile](screenshots/overview-mobile.png), [empty state](screenshots/empty-mobile.png), [production sign-in](screenshots/production-auth.png), and [extension panel](../apps/extension/review/panel.png).

## Requested local fixes

- Message filter: targets the rendered `combobox` with accessible name `Status`.
- Follow-up timeout: traced source receipt, durable triage/queue, worker heartbeat/execution, persistence, SSE, and visible assessment. The old final-only poll missed normal publication near its deadline. The regression now checks each stage with its own bounded poll; simulator delays were not reduced or hidden behind a larger total timeout. See [timing evidence](follow-up-trace.md).
- Error state: targets the `Workspace error` alert, avoiding Next.js's unrelated accessibility announcer.
- OAuth cookie: API fetches include browser credentials; configured-origin CORS allows them. A short-lived HttpOnly, SameSite=Lax nonce binds one-time state and PKCE to the initiating browser. HTTPS uses a host-prefixed Secure cookie. Matching local hosts or same-site HTTPS subdomains are required. Missing/wrong/duplicate/expired/replayed state and provider failure are covered offline; actual Google authorization remains unverified.
- UI refresh: case record versions prevent delayed snapshots from replacing newer state; unchanged filters retain card order, changed filters replace membership, and equal-version detail updates preserve captured observations.

Chromium completed the checks. A separate attempt to start the production server inside the sandbox failed with `listen EPERM: operation not permitted 127.0.0.1:3001`. The same command succeeded with the required execution permission; its temporary server was stopped after inspection. The demo remains on port 3000.

## Spec acceptance gates

| Gate | Local evidence | Remaining release verification |
| --- | --- | --- |
| AC-01–03 | No-key demo startup, complete surfaces, desktop/mobile/keyboard and error-state checks | Owner visual review; fresh-machine environment reproduction |
| AC-04 | Independent persistent demo worker and mocked Gmail checkpoint/recovery tests | Real Gmail ingestion/investigation while dashboard is closed |
| AC-05 | Built extension, explicit-grant policy, real Chromium pre-consent smoke | Owner-profile login, native site grant, authorized automatic capture |
| AC-06 | SDK/tool contracts, restricted tool inventory, bounded runtime and cleanup tests | Actual Claude/Factory/Daytona execution with persisted run identity and evidence |
| AC-07–08 | Synthetic scenario contracts and same-case follow-up/history verified | SC-01–08 through real providers and changed controlled pages |
| AC-09–11 | Duplicate/old-run rejection, durable cursor replay, refresh and viewed-state isolation | Connected-account persistence and reconnect behavior |
| AC-12 | Failure/limited publication invariants and provider-failure regressions | Actual provider restrictions/failures with honest limitations |
| AC-13 | SQL ownership constraints, API guards, encrypted credentials and OAuth state tests | Two real authenticated owners; private screenshots/streams; Google disconnect/revoke |
| AC-14 | Prompt/tool boundary, unsafe destinations, credential stripping and fabricated-evidence rejection tests | Controlled adversarial page in the live sandbox |
| AC-15 | Serialized demo restarts, expired SQL leases, sandbox cleanup/cancellation tests | Persistent live worker restart and verified provider resource cleanup |
| AC-16 | Revision/history invariants and fresh source context | Change controlled page terms and observe a genuinely new live assessment |

## First real checkpoint

The exact owner account pages and environment fields are in [Supabase setup](integrations.md#supabase-account-and-application-login). The ignored root `.env.local` is already prepared. Keep secrets out of chat. The agent will apply migrations and provision the private bucket; the owner does not need to write SQL or install dependencies.

Subsequent capability-specific handoffs cover Gmail, Factory/Anthropic, Daytona, the Chrome profile, and deployment. No deployment, paid resource, real mailbox access, or live model/browser run has been performed.
