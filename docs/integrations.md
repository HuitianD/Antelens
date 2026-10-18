# Integration setup and current boundaries

The current authenticated capture demo uses real Supabase, Gmail ingestion, Factory/Claude and **offline Daytona inspection of owner-captured content**. Credential-free demo mode is synthetic/simulated and proves none of those integrations. The merged hackathon UI and a fresh owner-profile Chrome capture have passed the scoped final checks; see [verification](verification.md) for exact results and remaining broader acceptance gates. Keep secrets in ignored `.env.local` or deployment secret settings, never chat, Git, screenshots or browser bundles.

## Current capability audit

| Capability | Current status |
| --- | --- |
| Gmail ingestion and email-text assessment | Authorized `[BY-TEST]` messages imported and real Claude assessments persisted. Worker polls independently; Gmail is read-only |
| URL extraction | HTML href/plaintext HTTP(S) extraction is implemented at ingestion; triage selects saved indexes. A URL is not page-content evidence |
| Owner Chrome capture | Explicit site grant and Check this page on the controlled page; visible content/labels/inert structure only |
| Standalone and optional email linking | Real zero-email browser cases, exact-page rechecks and reopen recovery verified; explicit linking retains email comparison |
| Daytona | Real SDK transfer, installed Chromium offline rendering, JSON/PNG evidence and cleanup passed with all sandbox network access blocked |
| Factory/Claude and Supabase | Real restricted Droid execution, explicit Claude model, private evidence and immutable assessments/history verified in saved controlled runs |
| Automatic opening of email links | **Deferred in this demo.** Current `BROWSER_RUNTIME=local_controlled` never opens user-origin mailbox links. Explicit captures use a separate real Daytona adapter |
| Live website state, unseen pages and sender identity | **Not verified.** The screenshot reconstructs selected captured content; it is not a screenshot taken by visiting the original site |

A disclosed subscription alone is not fraud evidence. No action needed means the message required no consequential action; it is not a verified-safe verdict. No issues found is a separate completed assessment limited to its checked scope. Captured-page investigations retain offline limitations and `limited` status.

## Verified dependency baseline

Versions were checked against official docs/npm during implementation on 2026-10-17 and compiled/used in the existing 2026-10-18 checks. Release preparation does not upgrade them.

| Component | Pinned version | Evidence |
| --- | --- | --- |
| Factory SDK | `@factory/droid-sdk@0.9.1` | Installed exported declarations compile; actual restricted-tool sessions recorded |
| Droid CLI | `droid@0.212.1` | Protocol `1.201.1` matches the SDK. CLI `0.244.0` rejected the SDK's MCP OAuth opt-out during diagnosis |
| Daytona SDK | `@daytona/sdk@0.225.0` | Real sandbox creation, filesystem upload/download, execution and deletion |
| Browser tooling | Playwright `1.64.1`; installed snapshot Chromium `156.0.8078.4` | Offline probe returned browser version and real PNG evidence |
| Extension | WXT `0.21.4`, React module `1.2.2` | Production Chrome MV3 build; existing Vite React plugin pin preserved |
| Supabase JS | `2.118.0` | Real web/extension email-password Auth, API authorization and private Storage |

Canonical schemas use Zod 4; Factory's tool API Zod 3 stays isolated in `packages/agent`. The worker inventories tools and fails closed if it cannot restrict the seven investigation tools. Model subprocesses receive no database/Gmail credentials or arbitrary trusted-host shell/filesystem tools. Sandboxes receive no provider credentials or user browser cookies.

References used during implementation: [Factory SDK](https://docs.factory.com/sdk/typescript), [BYOK](https://docs.factory.com/model-independence/byok), [Daytona network limits](https://www.daytona.io/docs/en/network-limits/), [SDK process API](https://www.daytona.io/docs/en/typescript-sdk/process/), [WXT](https://wxt.dev/), [Supabase keys](https://supabase.com/docs/guides/getting-started/api-keys), [Chrome permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions).

## Supabase account and application login

The designated development project, Auth, database migrations and private evidence bucket are already configured. Existing authenticated cases and screenshots were read successfully. No new account action was needed for the scoped final rehearsal. Full live owner-isolation/revoke/recovery acceptance is not implied by those reads.

For a replacement environment only:

1. Open [Supabase projects](https://supabase.com/dashboard/projects) → intended project → **Connect** for Project URL, publishable key and persistent-server PostgreSQL connection string. **Project Settings → API Keys** supplies the backend secret key; legacy service-role JWTs are supported. New paid resources require a separate owner decision.
2. **Authentication → URL Configuration**: Site URL `http://127.0.0.1:3000`. **Authentication → Users**: use the intended existing account. Current web/extension email-password login requires no OAuth callback. Enter passwords only in the intended local sign-in form.
3. Server destination: root `.env.local` fields `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`), `DATABASE_URL`, `SUPABASE_STORAGE_BUCKET`. Browser-public fields: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; extension public counterparts are in its dedicated file below.
4. Agent verification for a newly selected development environment: `APP_MODE=live pnpm check:supabase` is read-only; tracked `pnpm db:migrate` and private-bucket setup are explicit setup steps. **Do not rerun setup, seed or reset the existing demonstration data for release preparation.**

Google application login is separate and disabled in the current extension configuration. If enabled later, Supabase's Google provider uses `https://<project-ref>.supabase.co/auth/v1/callback`; Chrome's identity redirect is `https://oonbnpicjomfiddbiaegfdpdjiofdccn.chromiumapp.org/auth`. These are not required for the configured password flow and do not grant Gmail access.

## Gmail authorization

The existing Gmail connection and test-mail import were completed. `GMAIL_TEST_MODE=true` filters initial and incremental imports to subjects containing `[BY-TEST]`, including replies; other mail is dropped before content storage/triage. Normal mode initially imports at most the newest 50 messages within seven days, excluding Spam/Trash. Imported mailbox sources retain `dataOrigin: user`, even when their test text is synthetic. Email text may support a limited concern; no accessible link is invented and no URL means content was fetched.

For a new or expired connection only:

1. [Google Cloud credentials](https://console.cloud.google.com/apis/credentials): use the designated project; enable Gmail API under APIs & Services → Library.
2. Google Auth Platform → **Branding**: Antelens and owner contact fields; **Audience → Test users**: intended mailbox; **Data Access**: only `https://www.googleapis.com/auth/gmail.readonly`. An already registered consent screen keeps its current Google branding until that field is edited there.
3. Web OAuth client's **Authorized redirect URI**: `http://127.0.0.1:4000/v1/connections/gmail/callback`. This server flow needs no JavaScript origin. Destination fields in root `.env.local`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`; `CREDENTIAL_ENCRYPTION_KEY` stays server-side.
4. Dashboard **Connections → Connect Gmail** (or the displayed reconnect action) → owner completes consent. Do not send another email, change scopes or disconnect the working mailbox during preparation.

Saved consent/import demonstrates the connected path. Dashboard-closed ingestion, token revocation/disconnect and recovery remain distinct acceptance checks; deterministic OAuth mocks are not live proof.

## Factory and Anthropic

Actual BYOK sessions succeeded with `claude-sonnet-4-6` through Factory, not automatic provider routing. Factory resolves the configured BYOK display name to `custom:Before-You-Claude-0`. CLI protocol compatibility above is required for the in-process tool server. Direct Anthropic and Droid probes succeeded without `anthropic-workspace-id`; `ANTHROPIC_WORKSPACE_ID` remains optional, determined from actual provider responses.

Worker-only destinations in root `.env.local`: `FACTORY_API_KEY`, `ANTHROPIC_API_KEY`, `CLAUDE_MODEL_ID`; optional `ANTHROPIC_WORKSPACE_ID` and `DROID_EXEC_PATH`. Do not copy these to the extension. Local launchers use `scripts/load-env-local.ts` because Node env-file loading drops `CLAUDE_*` variables. Do not shell-source `.env.local`; preserve its ignored contents.

Existing probe commands: `pnpm --filter @beforeyou/agent exec tsx scripts/probe-anthropic.ts`, corresponding `scripts/probe-droid-byok.ts`, and `APP_MODE=live pnpm exec tsx scripts/investigation-checkpoint.ts`. These can make paid calls; do not rerun them as routine preflight checks. The final rehearsal used the real owner-profile Chrome toolbar flow.

## Daytona browser access

**Working now:** configured `beforeyou-browser-v1` Tier 1 snapshot; SDK bundle upload, installed-tool offline rendering, JSON/PNG evidence download/hash validation and cleanup. Captured-page adapter `packages/agent/src/daytona-captured.ts` uses `networkBlockAll: true`, allows only its saved bundle URL, records capture/bundle/sandbox identity and zero network requests, and has no silent local fallback. Captured sources keep synthetic/live provenance for the controlled fixture.

**Unavailable for this demo:** general website egress. Earlier live-network probes resolved DNS/connected TCP but TLS reset with `ECONNRESET`; Tier 1 outbound restrictions prevented website browsing. This does **not** block the now-verified offline capture path. No upgrade, purchase or network-policy bypass was made.

The configured normal Gmail runtime stays `local_controlled`: user-origin mailbox runs analyze email text only and state that linked pages were not opened. The local browser may inspect explicitly controlled synthetic fixtures, which must retain its local-browser label. Explicit page-capture runs override only their own adapter to real offline Daytona. Do not switch the global runtime for the hackathon demonstration.

Worker destination fields: existing `DAYTONA_API_KEY`, `DAYTONA_SNAPSHOT`; controlled capture allowlist `CAPTURE_ALLOWED_ORIGIN=http://127.0.0.1:4080`, `CAPTURE_ALLOWED_PATH=/fixtures/SC-01`. `pnpm dev:capture` forces live child processes even though the root file's default `APP_MODE` is demo. See [operation](captured-page-demo.md#operational-checklist).

## Future automatic email-link investigation

Deferred; no new implementation or nonfunctional UI controls are part of this release preparation. It requires an owner-authorized **network-enabled** isolated sandbox capability before enabling mailbox-link navigation. Do not bypass Tier 1 policy or purchase an entitlement implicitly.

The future gate must validate server-selected extracted URLs **and every redirect/subrequest**, enforce supported HTTPS destinations, reject credential/action-bearing URLs, resolve and pin public destinations, and block loopback, private, link-local, metadata and reserved networks (including IPv6/DNS-rebinding paths). Existing policy/browser code is groundwork, not proof this complete gate passed. Bound hosts, navigation count, time/cost and downloads; stop at login/CAPTCHA or protected actions. No automatic form submission, payments, authorization grants, messages, downloads executed, or use of the user's browser credentials/cookies.

Persist actual observed page text/screenshots, requested/final URLs, redirect/step history, timestamps, sandbox/model/run identities and source/execution provenance. A detected link, email assertion, prior capture or generated assessment must never substitute for freshly observed website evidence. Failures remain explicit limited/failed states, never an unsupported No issues found.

## Chrome extension

Build only when needed: `pnpm --filter @beforeyou/extension build`. Load/reload `/Users/dsteven/Desktop/BeforeYou/apps/extension/.output/chrome-mv3` at `chrome://extensions`. Stable public manifest ID: `oonbnpicjomfiddbiaegfdpdjiofdccn`.

`apps/extension/.env.local` is a dedicated public allowlist: `APP_MODE=live`, `VITE_API_ORIGIN=http://127.0.0.1:4000`, `VITE_WEB_ORIGIN=http://127.0.0.1:3000`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPPORTED_ORIGINS=http://127.0.0.1:4080`, `VITE_CAPTURE_ORIGIN=http://127.0.0.1:4080`, `VITE_CAPTURE_PATH=/fixtures/SC-01`, `VITE_GOOGLE_SIGN_IN_ENABLED=false`. Root server secrets must not enter this file or browser bundle. Root production builds preserve these settings unless the deployment/CLI explicitly overrides them.

Current profile flow: sign in with the same Antelens account, open the controlled page, click **Allow this site**, accept the native prompt if requested, then **Check this page**. Default is standalone. Expand **Link to an email · Optional** and select the rental email only for comparison. Site permission and owner-scoped server grant are separate from API transport permission; unsupported sites imply no active protection. Removal revokes subsequent observation.

Auth sessions live under `beforeyou.auth.` in trusted extension local storage and survive popup closure; passwords are not stored. Owner/page-scoped receipt IDs/metadata also persist locally so exact-run terminal state can be restored. Session tab state is separate. Gmail tokens, provider keys, page bundles and generated prose do not belong in these receipts. See [standalone behavior](standalone-page-checks.md) and [demo clicks](demo-script.md).

## Railway deployment

Configuration is prepared in `deployment/Dockerfile` and the three `railway.*.json` files. No deployment or new paid service was created. Deployment authorization, actual domains/callbacks and full live acceptance are separate gates; they do not block preparing the current localhost demonstration. Do not publish an unauthenticated provider-enabled demo.
