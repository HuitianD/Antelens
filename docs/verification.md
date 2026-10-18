# Verification and release gates

Status: **READY for the scoped hackathon demo. Merged verification and a fresh owner-profile Chrome rehearsal passed.** Destination `UIUX`. Recovery point before integration: `b3f7fc66d477a83e3d24ccda204fe106fbf3a015`. Source `ui/sidebar-magnifier` at `953346d545dfa9bd34701bfde16b7cb2037764e2` merged without conflicts in `254f29b66ffad446f2e540207bd99635f5b961d4`. Evidence rendering/source matching and release documentation were retained unchanged by the merge. This scoped hackathon delivery does not imply every minimum-release acceptance gate has passed.

## Final merged checks — 2026-10-18

| Check | Actual result |
| --- | --- |
| Pinned dependencies | `pnpm install --frozen-lockfile` passed with Node 24.22.0 / pnpm 10.34.7; merged lockfile unchanged |
| Lint / typecheck | Workspace lint and typecheck passed; subsequently changed test/config files passed targeted lint |
| Production build | `WEB_DIST_DIR=.local/release-production pnpm build` passed, including authenticated web, extension and all package checks; running web output untouched |
| Regression tests | **123 passed**: previous 122 tests plus one cross-platform package-manager invocation check. Provider tests remain mocked/offline |
| Browser workflows | **16 distinct checks passed across the full run and one affected rerun**. Full run: 15 passed, one pending-state selector race; corrected test passed on targeted rerun. Includes actual rendered reduced-motion pixel stability, SVG fallback and mobile hiding |
| Actual Chrome UI | Original-repository dashboard on port 3000 showed the merged 3D canvas and colors. Email-only, standalone, linked comparison and version 6 history reviewed at desktop and 390px. Real private image loaded; enlargement/150% zoom worked. Narrow comparison stacked with no horizontal overflow |
| Fresh-machine simulation | Clean exported merged source plus the closeout launcher changes, no environment files, node_modules or dependency caches; isolated package store/cache downloaded 730 packages (0 reused). Startup and worker checks passed on macOS 14.5; see below |

Browser commands used `CI=1`, `E2E_WEB_ORIGIN=http://127.0.0.1:3012`, `E2E_API_ORIGIN=http://127.0.0.1:4012`, `E2E_WEB_DIST_DIR=.local/release-e2e`, and `E2E_DATA_PATH=.local/release-e2e-state.json`. They started fresh merged-code simulated servers, never reused the old preview or live API. The full `pnpm test:e2e` ran once; only `tests/e2e/evidence-ui.spec.ts --grep 'pending investigation'` was rerun after its correction. Existing source/evidence checks cover loading errors/retry, missing records, screenshot-only evidence, matching historical capture text, filters, keyboard navigation and No action needed versus assessed No issues found.

The failing pending-state test used `.case-row.unassessed`. Its trace showed the independent worker completed while Chromium scrolled/clicked, so the temporary selector stopped matching. The correction selects the stable case ID and holds the actual saved in-flight detail as a labeled presentation fixture; it does not delay the worker, fabricate a processing stage or increase timeouts. The separate lifecycle test still verifies ingestion → queue → worker → persistence → UI and immutable history.

The launcher now invokes pnpm through Node and `npm_execpath`, avoiding Windows `.cmd` spawning, derives ports from origins, honors an isolated demo-state path, and stops only its own child process trees. Playwright graceful SIGTERM teardown was added because its default hard kill skipped launcher cleanup; the initially orphaned test-only groups were identified and stopped. The affected rerun shut down normally and left 3012/4012 closed. No live processes were stopped. Three.js Clock and Fastify deprecation warnings are non-failing dependency warnings.

Sandbox attempts were blocked by registry DNS resolution and tsx IPC `listen EPERM`, then succeeded with approved network/process execution. These were not Chromium permission failures. No Chromium permission blocker was observed.

### Fresh-checkout reproduction

The clean source export had no `.env.local`, node_modules, existing demo state or copied caches. Dependencies were fetched using `pnpm install --frozen-lockfile --store-dir .fresh-store --cache-dir .fresh-cache --fetch-retries 0`; the initial empty store was verified and download output recorded. A preinstalled matching Node/pnpm executable was used as the documented prerequisite; OS installers were not exercised. Ignored live credentials were not copied. No Playwright browser installation was needed to run this demo.

`WEB_ORIGIN=http://127.0.0.1:3010 API_ORIGIN=http://127.0.0.1:4010 pnpm dev:demo` started web, API and a separate simulated worker. Chrome showed Demo data and the seeded rental comparison. Activity → Demo tools → Add demo reply ingested source `3e9f7935-e7f0-49c1-b63a-ebd388fd4614` at 10:25:28.720Z. After the dashboard tab was closed, the worker published version 2 in run `befe61bb-5640-417d-b47c-76ad5bd97dc1` at 10:25:33.679Z (4.959 seconds), with no remaining jobs. Reopening the dashboard restored version 2 and version 1 history. Sending SIGINT to that launcher's process shut down its tree and freed 3010/4010; the original live services remained available.

**Tested OS: macOS 14.5 only. Windows instructions reviewed; not executed on Windows.** Paths with spaces and Windows pnpm paths are covered by the argument-boundary regression; that is not a Windows runtime test.

### Repository and judge documentation

README is approximately 670 words excluding command blocks, with one [merged UI screenshot](screenshots/release-dashboard.jpg) containing only labeled synthetic data and reserved example addresses. Fresh setup, accounts, operations, architecture and verification are linked from the [documentation index](README.md). The remote clone URL is the actual configured origin; unpushed closeout commits require an owner-supplied final checkout/archive until published.

`.cursor/` and the identical root `beforeyou.html` were removed only from the index and ignored; local copies remain. The canonical HTML, font licenses, specifications, contracts, migrations, source, lockfile and environment examples remain tracked. node_modules, caches, build output, logs, private receipts, environment files and browser reports are ignored. Generated baseline screenshot changes and Next declarations from this run were restored; only the new judge screenshot is added. No reset, stash, broad cleanup or push was performed.


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
- `.local/release-pre-capture.json` (preserved from the earlier chrome-latest receipt): saved owner-profile Chrome run `d2610f39-2147-42ee-8d36-16ffe790f100`, linked case `f6d3e61d-d270-4a16-9c7e-76194078e643`, version 6, terminal `limited`, provider session and sandbox recorded. Capture 08:49:11.325Z → assessment 08:50:15.464Z: **64.1 seconds**. Version 7 was subsequently rechecked through the authenticated dashboard and inspected in the evidence pass; it reused stored captured content, not a new Chrome capture.
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

## Final rehearsal and remaining gates

The real Chrome toolbar popup in the owner's existing signed-in profile was used to capture the controlled `$29/month` page and explicitly select the Maple Court email case. This was agent-operated through the normal Chrome UI, not a backend-injected capture or test-only active-tab adapter. The extension was rebuilt and reloaded: its previously loaded bundle rejected the additive `sourceReferences` contract; reload restored sign-in and the existing site grant without that error. No credentials or backend permissions changed.

- Case: `f6d3e61d-d270-4a16-9c7e-76194078e643`; version **7 → 8**.
- Capture: `8ba55da6-a7c4-453c-8682-ae6e0fe12d1c`; source `b8ba6531-5b7e-4a54-a0a9-2241967bb3fa`.
- Run: `2c0cf29f-f4b7-4458-ad4c-8badb3820a50`; outbox delivered; terminal **limited**, verdict **confirm_first**. Captured at `2026-10-18T10:32:27.990Z`, published at `10:33:39.772Z`: **71.782 seconds**.
- Actual Daytona sandbox `acb205ed-49fa-4a31-b020-507e2ba1c43e`; Factory session `5c8ef98e-4ada-44f8-a0db-faceceb3ca66`. Recorded steps: visible terms, screenshot capture, offline Daytona inspection, source comparison.
- Current assessment cites email `762189bb-bdb3-494a-8990-ff8a7eccf347`, page text `e0ec0791-d441-437c-baf1-a3cb4dcb17c8`, and screenshot `a3037c95-dd67-40c9-a785-d0a6e456b395`. All were queried within this owner/run. Both page records carry capture ID above and bundle SHA-256 `4671c72bce24c4a0fdd9830fb0962a08944acf23b759830af9b77553fde8f480`, with **0 network requests**.
- Private artifact `9ed90a4d-f284-4d04-b2fa-830afed6aedb` downloaded successfully; its SHA-256 matched persisted evidence (`a5961e5f569f661e17e84e3b255ba094b48ea37fa7c7912f9d66539a5038d0d0`). The merged dashboard displayed version 8, those current evidence IDs, exact `$29/month` text, and the real 1280×900 screenshot.
- The popup was closed during execution and reopened after publication. It restored **Confirm first**, the new finding, **Captured page inspected in Daytona**, and the correct email-case link. The next capture still defaults to standalone when optional email linking is collapsed.

The controlled page is synthetic; the linked Gmail source is account-ingested, and this mixed-source assessment records `user/live`. Do not relabel the persisted provenance. The run is limited to captured content and does not verify a live website or sender identity. Private receipts/screenshots remain ignored in `.local/release-capture.json`, `.local/release-capture.log` and `.local/release-extension-terminal.png`. The existing read-only inspection script verified persistence and the artifact hash; it did not create this capture.

### Final operating state and cleanup

Dashboard: **http://127.0.0.1:3000**, served from the original repository with merged modules confirmed in actual Chrome. API 4000, worker, Gmail authorization, fixture host 4080, tunnel and stored data were preserved. Hot reload loaded the merged frontend; no frontend restart was necessary. Temporary simulated verification servers on 3010/4010 and 3012/4012 were stopped after checks.

`953346d545dfa9bd34701bfde16b7cb2037764e2` was confirmed an ancestor of `UIUX`. The temporary worktree had no uncommitted/untracked source or configuration; ignored content consisted only of dependency links/cache, Next output and TypeScript build metadata. Only its verified UI preview process group on 3003 was stopped, then `git worktree remove /Users/dsteven/Desktop/BeforeYou-magnifier` succeeded without force. The `ui/sidebar-magnifier` backup branch is retained. No other worktree was removed and nothing was pushed.

The public name is Antelens. Reload the rebuilt extension once at `chrome://extensions` on the existing card, which shows **Antelens** after reload. Keep existing storage and sign-in. Build directory: `apps/extension/.output/chrome-mv3`. The final closeout commit is the commit containing this verification update; retrieve its exact SHA with `git rev-parse UIUX`. The merged dashboard is available for a final visual look.


Remaining broader minimum-release gates include all SC-01–SC-09 scenarios through their required real paths, live disconnect/revoke and cross-owner stream denial, adversarial sandbox checks, and worker restart/resource cleanup. Network-enabled automatic mailbox-link investigation remains deferred; [integration requirements](integrations.md#future-automatic-email-link-investigation) describe its boundaries. Railway deployment is prepared but not performed. No purchase, egress change or new access scope was made.
