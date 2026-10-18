# Verification and release gates

Status: **Phase A prepared; final merged verification pending.** Evidence-presentation checkpoint: `eac4d8b` on `UIUX`, based on `c327030`. The separate `ui/sidebar-magnifier` worktree has not supplied a completion handoff. These results precede that integration and do not establish final hackathon readiness or completion of every Spec acceptance gate.

## Existing baseline — 2026-10-18

This baseline is reused for release preparation; no suite or paid investigation was rerun in Phase A.

| Check | Recorded scope and result |
| --- | --- |
| `pnpm test` | **122 passed**: contracts 8, fixtures 6, extension 5, web 16, agent 50, database 13, worker 5, API 19 |
| Browser checks | **14 distinct checks passed across the full run and affected reruns**: capture privacy 1, demo workflows 3, evidence UI 5, source presentation 5. The full invocation passed 13 before the final missing-citation test was added; the final five-test source-presentation file then passed. This is not a claim of a single 14-test invocation |
| `pnpm lint`, `pnpm typecheck` | Passed across the workspace |
| `WEB_DIST_DIR=.local/evidence-production pnpm build` | Passed: production web/extension and package/API/worker checks. The affected web build and lint passed again after the final UI change |
| Actual authenticated UI | Existing email-only, standalone browser and linked rental cases inspected at desktop and 390px widths; linked history version 6 retained its own saved text and screenshot; comparison stacked without horizontal overflow |
| Private evidence UI | Actual 1280×900 Daytona image loaded; expired access link recovered through Reload image; enlargement and 150% zoom worked |

The 122 total includes the PostgreSQL test's parent and subtests. SQL behavior runs offline in PGlite. OAuth tests use a mock provider/database; agent tests mock provider responses. Browser tests use an isolated synthetic/simulated demo at 3002/4002 and refuse to reset a live API. Source-presentation fixtures include screenshot-only records, image failure/retry, missing citations, historical fee changes, and saved uninspected-link metadata. None proves a live integration or model accuracy. The latest local Playwright status records passed with no failed tests; it covers the last affected file, not the entire cumulative inventory.

Test sources: `tests/e2e/{capture-privacy,demo,evidence-ui,evidence-sources}.spec.ts`, package test scripts and `apps/web/lib/*.test.ts`. Review artifacts: [historical comparison at narrow width](screenshots/evidence-sources-history-mobile.png), existing [UI screenshots](screenshots/), and private `.local/standalone-checkpoint/evidence-*.jpg`. Private reports and signed evidence URLs remain ignored and are not release assets.

## Code and saved live evidence audit

| Capability | Implemented behavior | Existing evidence and limits |
| --- | --- | --- |
| Gmail ingestion | Authorized `gmail.readonly`, bounded initial import, incremental polling and durable jobs; current demo filters subjects containing `[BY-TEST]` | Connected rental email and other test messages persisted. Email-text Claude assessments saved. No new mail sent or ingestion exercise performed in Phase A |
| URL extraction | `apps/worker/src/gmail.ts` extracts HTTP(S) HTML hrefs and plaintext URLs; rejects malformed, credential-bearing and overlong URLs; triage selects existing link indexes | Extracting/storing a URL is not inspecting its contents. Case detail projects saved metadata for Linked page not checked. No new scanning or fetching was added |
| Chrome capture | Owner clicks Allow this site, then Check this page; collector sends visible text, labels and minimal inert structure | Existing owner-profile linked capture plus isolated production-extension exercise. No cookies, tokens, entered values, hidden sensitive data or original executable scripts are transferred |
| Standalone / optional email | No email selection creates a real owner-scoped browser case; explicit linking preserves Gmail comparison; exact-page rechecks retain identity/history | Real zero-email owner completed $29 and $39 checks. Popup closure/reopen recovered exact terminal run state. Cross-owner case access was denied |
| Offline Daytona | SDK bundle upload, installed Chromium reconstruction, JSON/PNG download, hash checks, zero network requests, cleanup | Tier 1 probe and actual worker runs passed. This is an offline reconstruction, not a visit to the original website |
| Factory / Claude | Restricted Factory Droid tools, explicit Anthropic BYOK model `claude-sonnet-4-6`, validated evidence-backed output | Saved runs contain provider session and sandbox identities; captured findings cite persisted page text and linked findings also cite email text |
| Supabase | Owner-scoped cases/runs/evidence/history, private screenshots, real Auth and dashboard updates | Existing real captures and private evidence downloads verified. This does not imply every cross-owner SSE, revoke or recovery gate has been exercised live |
| Automatic opening of email links | **Deferred for the current demo**; configured `local_controlled` runtime does not open user-origin mailbox links | Generic network browser/policy code exists, but general Daytona website egress remains unavailable and that path is not release-verified |
| Live website state, unseen pages, sender identity | **Not verified** | Neither a disclosed subscription nor an offline screenshot establishes fraud, enrollment, identity or general safety |

`No action needed` is a message disposition/group, not a verified-safe verdict. A completed `No issues found` assessment is a distinct policy outcome restricted to its successfully checked scope. Captured-page investigations remain `limited`; failure cannot fabricate a favorable assessment.

## Saved run receipts and measured timing

- `.local/daytona-offline-probe/report.json`: passed; sandbox deletion recorded; $29/$39 evidence hashes differ; both observations report zero network requests. Uses the configured Tier 1 snapshot with `networkBlockAll: true`.
- `.local/capture-checkpoint/chrome-latest.json`: saved owner-profile Chrome run `d2610f39-2147-42ee-8d36-16ffe790f100`, linked case `f6d3e61d-d270-4a16-9c7e-76194078e643`, version 6, terminal `limited`, provider session and sandbox recorded. Capture 08:49:11.325Z → assessment 08:50:15.464Z: **64.1 seconds**. Version 7 was subsequently rechecked through the authenticated dashboard and inspected in the evidence pass; it reused stored captured content, not a new Chrome capture.
- `.local/standalone-checkpoint/report.json`: passed; real isolated owner with zero Gmail sources, production extension sign-in/grant/capture, real providers and private persistence. Browser case `5d93f825-bcd7-4fc3-9fbd-59c5f6841fbd`; $29 run `4bc7580b-e67f-491d-8ab7-5e1c457af398` and $39 recheck `69497a8c-7ea7-49c0-b99d-628527bea847`, both terminal `limited`. Capture-to-assessment **64.2 and 97.5 seconds**; worker execution **57.7 and 91.0 seconds**. The automated popup used a test-only active-tab selection adapter; capture, native permission, Auth, providers and persistence were real. It is separate from owner-profile manual acceptance.

Times are observations, not a latency promise. Saved cases are fallbacks and must be announced as previously completed. Do not replay a receipt as a fresh investigation. See the [three-minute script](demo-script.md).

## Evidence presentation checkpoint

Email-only cases show Original email, Email evidence and one Email only label, without an empty page card. Standalone cases show Captured page and Offline page inspection, without invented email comparison. Inspected linked cases show Message says / Page shows. Only existing saved link metadata can produce Linked page not checked and its hostname.

Current and historical evidence is selected by the displayed assessment's case/run citations. Screenshots pair with persisted text from the same capture ID/hash, source and URL; older records without capture metadata require the same recorded step. Generated findings or checked-scope prose never fill an excerpt. Paragraph breaks, source links, capture times, enlargement and history are preserved. Missing records, missing screenshot files and screenshot access/load failures have distinct states. Detailed scope and actual limitations are in one disclosure per displayed version; historical images load when opened.

The earlier version 6 problem was rendering, not lost persistence: its finding cited email plus screenshot, while its saved 380-character companion page text was not cited. The UI now resolves only that capture's saved companion record. Immutable assessments were not rewritten.

## Earlier fixes retained

- Message filtering uses the rendered `combobox` named Status. Workspace errors target the Workspace error alert, avoiding Next.js's accessibility announcer.
- Follow-up regression traces ingestion, triage/queue, independent worker execution, persistence and UI update. Stage-specific synchronization replaces the old final-only deadline; no investigation timeout was increased. [Measured trace](follow-up-trace.md) concerns the simulated flow, not provider latency.
- OAuth uses credentialed API requests, configured-origin CORS, a short-lived HttpOnly SameSite=Lax browser nonce and one-time PKCE state; HTTPS uses a host-prefixed Secure cookie. Actual Gmail consent/import was later completed. Disconnect/revoke and all failure cases are not thereby live-verified.
- Case versions protect against delayed snapshots; unchanged filters retain order; captured observations and immutable history survive refresh.

## Final integration gate — not yet performed

Wait for Claude's explicit completed branch and commit SHA. Inspect and merge into `UIUX` after the evidence checkpoint; preserve both implementations, do not push or delete worktrees. Then run the following once on the merged revision, keeping production output separate from the running dashboard:

```sh
pnpm lint
pnpm typecheck
WEB_DIST_DIR=.local/release-production pnpm build
pnpm test
pnpm test:e2e
```

Review desktop/mobile magnifier, all three evidence source layouts and a historical version. These commands are Phase B, not a repetition requested during Phase A.

Rehearse one **owner Chrome** capture → ingestion/queue → independent worker → real offline Daytona → Factory/Claude → Supabase → dashboard update. Record the new capture/run IDs, provider/sandbox identity, current-run citations, capture timestamp/hash and actual terminal status. A backend-injected capture or dashboard stored-bundle recheck cannot stand in for that interaction. Update this document with the merged commit and actual outcomes, not a readiness claim based on this baseline.

Remaining minimum-release gates include all SC-01–SC-09 scenarios through their required real paths, live disconnect/revoke and cross-owner stream denial, adversarial sandbox checks, worker restart/resource cleanup, and fresh-checkout reproduction. Network-enabled automatic mailbox-link investigation is deferred separately; [integration requirements](integrations.md#future-automatic-email-link-investigation) describe its boundaries. Railway deployment is prepared but not performed; no purchase, egress change or new access scope is authorized by these docs.
