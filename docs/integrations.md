# Live integration setup and verification

The local demo uses synthetic/simulated adapters. Provider authentication, browser installation, deployed sandbox reachability, and end-to-end live acceptance are not verified by demo tests. Account-owned secrets go into the ignored root `.env.local` for local work or the corresponding Railway service variables; never send them in chat.

## Verified dependency baseline

Checked against official documentation and npm metadata on 2026-10-17:

| Component | Pinned version | Compatibility evidence |
| --- | --- | --- |
| Factory SDK | `@factory/droid-sdk@0.9.1` | Node 18+; `@factory/droid-sdk/node`; installed exported TypeScript declarations compile |
| Droid CLI | `droid@0.212.1` | Node 20+; speaks Factory protocol `1.201.1`, matching `@factory/droid-sdk@0.9.1`. CLI `0.244.0` rejects the SDK's MCP OAuth opt-out and cannot start investigation tools |
| Daytona SDK | `@daytona/sdk@0.225.0` | Installed SDK declarations compile with sandbox creation, IPv4 firewall, process execution, cleanup |
| Browser image | Playwright `1.64.1` | Preinstalled Chromium image recipe in `deployment/daytona`; image build and provider snapshot pending account access |
| Extension | WXT `0.21.4`, React module `1.2.2` | Node 22+; Vite React plugin pinned to `5.2.0` for Vite 7 compatibility |
| Supabase JS | `2.118.0` | Node 22+; extension uses PKCE and session-only token storage |

Canonical contracts use Zod 4. Factory's in-process tool API requires Zod 3, isolated in `packages/agent`; every tool request and proposal is also parsed with the canonical shared schemas. SDK schemas are generated from canonical JSON Schema. Tool approval is limited to the named Before You MCP tools; native tool availability is inventoried, all tools outside the seven investigation tools are disabled, and the adapter fails closed if this cannot be confirmed. SDK subprocesses get a fresh Factory settings directory, blank inherited secret variables, explicit Anthropic BYOK credentials, and no database/Gmail credentials. The model receives no arbitrary host execution or file tools. The browser gets no provider credentials, user cookies, or mailbox credentials.

Supabase key locations and recommended secret-key format follow the [current API key documentation](https://supabase.com/docs/guides/getting-started/api-keys).

Official references: [Factory TypeScript SDK](https://docs.factory.com/sdk/typescript), [Factory BYOK](https://docs.factory.com/model-independence/byok), [CLI pinning](https://docs.factory.com/droid-cli/cli-reference), [Daytona firewall](https://www.daytona.io/docs/en/network-limits/), [Daytona process API](https://www.daytona.io/docs/en/typescript-sdk/process/), [WXT](https://wxt.dev/), [Supabase PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [Chrome site permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions).

## Supabase account and application login

Blocked capability: Real sign-in, owner-isolated PostgreSQL persistence, and private evidence storage.

Reason: No authorized Supabase project credentials have been provided to this checkout.

Already prepared: Shared schemas, tracked database migrations, API authentication, and private evidence contracts. Railway service configuration is in `deployment/`.

Your action:

1. Open [Supabase projects](https://supabase.com/dashboard/projects) and select the intended development project. If a new paid project is needed, decide that purchase before creation.
2. Open the project Connect dialog and provide its Project URL and publishable key. In Project Settings → API Keys, create or select the backend secret key (`sb_secret_...`); legacy service-role keys remain supported as a compatibility option. In Connect, select a direct connection or session pooler suitable for a persistent Node process and provide its PostgreSQL connection string.
3. In Authentication → URL Configuration, set Site URL to `http://127.0.0.1:3000`. The dashboard currently uses email/password login; create the intended test user under Authentication → Users if one does not exist. Add the exact Chrome redirect shown after extension installation: `https://<extension-id>.chromiumapp.org/auth`. Add deployed origins/callbacks when Railway URLs exist.
4. Later, for extension Google application login, enable Google under Authentication → Sign In / Providers. The Google OAuth client's authorized redirect URI is `https://<project-ref>.supabase.co/auth/v1/callback`. This is separate from Gmail authorization below. The agent can prepare the provider configuration once access is available; consent/login may require you.

Credential destination: `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (or legacy `SUPABASE_SERVICE_ROLE_KEY`), `DATABASE_URL`, `SUPABASE_STORAGE_BUCKET`; public settings `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The extension gets only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.

Verification: The agent selects `APP_MODE=live` for the designated development project and runs `pnpm check:supabase` (read-only), `pnpm db:migrate`, then `pnpm check:supabase --setup-private-bucket`. The last command creates a missing private image bucket only after database, migration, ownership-schema, and Auth prerequisites pass; it never changes an existing public bucket. Missing configuration exits 2. The probe verifies connection and configuration only. Actual email/password sign-in, authenticated two-owner API/evidence/stream isolation, and signed evidence retrieval are separate follow-on checks; no SQL, bucket creation, or dependency setup is required from you. Gmail authorization is the next checkpoint after these pass. The current email/password web flow does not need an OAuth callback.

Continuing meanwhile: Local demo, source deduplication, immutable history, UI, contract/policy tests, and extension build.

## Gmail authorization

Blocked capability: A real Gmail mailbox feeding the persistent worker while the dashboard is closed.

Reason: Google OAuth client credentials and mailbox consent are unavailable.

Already prepared: API PKCE callback `http://127.0.0.1:4000/v1/connections/gmail/callback`, background polling, bounded initial import, and explicit connection states. `GMAIL_TEST_MODE=true` limits both the initial search and later history imports to subjects containing `[BY-TEST]`, including replies such as `Re: [BY-TEST] …`. Nonmatching mail is dropped before its content is stored or triage is queued. Leave `GMAIL_TEST_MODE` empty for the normal 50-message window. Imported mailbox messages stay `dataOrigin: user`. With `BROWSER_RUNTIME=local_controlled`, those user-origin links are not opened by the local fixture browser.

Your action:

1. Open [Google Cloud Console](https://console.cloud.google.com/apis/credentials) in the designated project; enable the Gmail API in APIs & Services → Library.
2. In Google Auth Platform → Branding, set application name `Before You`, user-support email, and developer-contact email. In Audience, use the appropriate organization type; for an external test project, add the intended Gmail account under Test users.
3. In Data Access, add only `https://www.googleapis.com/auth/gmail.readonly` for the Gmail connection. It can read mailbox data; the application independently limits the initial import to at most 50 most recent messages within 7 days, excluding Spam and Trash. It does not send or modify mail.
4. Create an OAuth client of type Web application. Set Authorized redirect URI exactly to `http://127.0.0.1:4000/v1/connections/gmail/callback`. The server-side authorization flow does not require JavaScript origins; if using the same project for app sign-in, add the separate Supabase callback to that app-login client. For deployed Gmail add `https://<api-service-domain>/v1/connections/gmail/callback` after its actual URL exists.
5. In the running dashboard, open Connections → Connect Gmail and complete Google consent with the test mailbox.

Credential destination: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`. `CREDENTIAL_ENCRYPTION_KEY` is generated locally by the agent; do not create or transmit it in chat.

Verification: The agent checks connection scope/checkpoint, imports within the displayed limit, delivers a controlled test message, closes the dashboard, confirms a durable worker run and evidence, reopens the dashboard, then verifies same-thread updates and duplicate-delivery suppression. Revoke consent once to verify Reconnect required.

Continuing meanwhile: Demo workflows, browser observation, controlled websites, and policy checks.

## Factory and Anthropic

Status (2026-10-18): Direct `POST /v1/messages` and Droid plain-text and structured BYOK probes succeed without `anthropic-workspace-id`. The key prefix is `sk-ant-usr`; the header requirement was decided from those responses, not from the prefix. Leave `ANTHROPIC_WORKSPACE_ID` empty for this key. Investigation sessions also start an in-process MCP server. SDK 0.9.1 sets `oauth: false` and accepts that only when the CLI reports protocol `1.201.1`, which `droid@0.212.1` does. `droid@0.244.0` returns `ProtocolError` before any investigation tool runs.

Factory `listModels` identifies the BYOK entry as `custom:Before-You-Claude-0` (derived from `displayName`, not the Anthropic model ID); the runtime resolves it by display name and provider and never selects `auto`. The workspace header is added only when `ANTHROPIC_WORKSPACE_ID` is set, as an environment reference rather than a literal value.

Credential destination: Worker-only `FACTORY_API_KEY`, `ANTHROPIC_API_KEY`, optional `ANTHROPIC_WORKSPACE_ID`. `CLAUDE_MODEL_ID` is the exact Claude API model ID (currently `claude-sonnet-4-6`), provider `anthropic`, endpoint `https://api.anthropic.com`. Optional `DROID_EXEC_PATH` overrides the pinned packaged CLI. Node's `--env-file`/`process.loadEnvFile` silently drop `CLAUDE_*` variables; local scripts use `scripts/load-env-local.ts`, which also preserves CLI overrides such as `APP_MODE=live`. Do not `source .env.local` in a shell: percent-encoded passwords are mangled and the inherited value then overrides the file.

Verification: `pnpm --filter @beforeyou/agent exec tsx scripts/probe-anthropic.ts` (expects HTTP 200), then `scripts/probe-droid-byok.ts` (plain-text and structured `result.success: true`), then `APP_MODE=live pnpm exec tsx scripts/investigation-checkpoint.ts`. Provider errors remain failures, with no simulated fallback.

Continuing meanwhile: Deterministic policy/contract evaluations, UI, extension, deployment, and browser policy.

## Daytona browser access

Status 2026-10-18: The Daytona API key and the `beforeyou-browser-v1` snapshot are configured and sandboxes are created and deleted correctly. Sandbox DNS resolves and TCP 443 connects, but every TLS handshake is reset, with or without a firewall allowlist. The dashboard confirms the organization is Tier 1, which blocks outbound egress and cannot be overridden by a sandbox setting. Daytona troubleshooting is paused until sponsor support is available; the snapshot and adapter are preserved unchanged.

Interim path: `BROWSER_RUNTIME=local_controlled` runs the same reviewed `deployment/daytona/browser.mjs` program with the repository's Playwright on the worker host. It opens only `CONTROLLED_FIXTURE_ORIGIN` pages matching `/fixtures/<ID>` and never opens links from `dataOrigin: user` messages. Real mailbox cases still run Claude against the message text, publish as `limited`, and add a `network_policy` limitation that linked pages were not opened. `No issues found` is not allowed on those runs. Synthetic fixture pages keep the local-browser label and also cannot produce `No issues found`. The SC-01 checkpoint passed through this path on 2026-10-18 with real Claude/Droid inference, a real captured page excerpt in Supabase, and a `pause_here` assessment in the dashboard. This is not Daytona verification. Switch back by setting `BROWSER_RUNTIME=daytona` (or removing the variable) and restarting the worker; no code change is needed.

Blocked capability: Actual browser observations and private screenshot/excerpt evidence from isolated Daytona sandboxes.

Reason: Daytona Tier 1 egress resets TLS to every destination (observed `ECONNRESET` during the handshake from inside the sandbox).

Already prepared: `deployment/daytona/Dockerfile` and static `browser.mjs`, SDK creation/deletion, exact-domain navigation restriction, public-IP firewall allowlist, request-method enforcement, download cancellation, sensitive-value masking, and configurable step/time limits. Website JavaScript is disabled; pages depending on scripts produce an explicit limitation. The current controlled fixture scope is static pages and ordinary navigation links.

Your action (when sponsor support is available):

1. Ask Daytona support to raise the organization above Tier 1 or to enable outbound egress for the sponsored organization. Tier 1/2 restrictions cannot be overridden by a sandbox setting; Tier 3/4 support custom firewall policies. No upgrade or purchase is performed automatically.
2. Once egress is enabled, set `BROWSER_RUNTIME=daytona` in `.env.local` and restart the worker. The existing key, snapshot, and fixture configuration are reused.

Credential destination: Worker-only `DAYTONA_API_KEY`; `DAYTONA_SNAPSHOT` is the created versioned snapshot name. `INVESTIGATION_ALLOWED_DOMAINS` is a comma-separated list of exact hostnames; no wildcard or localhost live browsing is allowed.

Verification: The agent creates a sandbox, opens a controlled page, persists the real excerpt/screenshot, changes its fee/permission text, confirms new observations and assessment revision, checks blocked private/action-bearing destinations, and confirms sandbox deletion after success and failure. `pnpm eval --live` saves actual run/session IDs and evidence; local `pnpm eval` measures policy/contracts only.

Continuing meanwhile: All local surfaces and deterministic behavior, including explicit limited/failed runs.

## Chrome extension

Build: `pnpm --filter @beforeyou/extension build`. The loadable folder is `apps/extension/.output/chrome-mv3`. For a local synthetic browser exercise, set `APP_MODE=demo` for the extension build and keep both API and web origins on loopback. Production extension builds default to live; the production root build must not use a demo-auth bypass.

Public extension configuration is a dedicated allowlist: `VITE_API_ORIGIN`, `VITE_WEB_ORIGIN`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPPORTED_ORIGINS`. Never expose root secrets through a Vite prefix or copy all environment fields.

Blocked capability: Installed extension OAuth and permission behavior in your chosen Chrome profile.

Reason: Browser installation and consent are account/profile actions; the extension can be built without them.

Already prepared: Manifest V3 extension, persistent explicit site-grant registration, debounced minimal visible-context capture, authenticated installation registration and ingress, PKCE sign-in, checking/limited/failed states, and case links.

Your action:

1. Open `chrome://extensions`, enable Developer mode, select Load unpacked, and choose `apps/extension/.output/chrome-mv3`.
2. Copy the displayed extension ID (it is public). The agent adds `chrome-extension://<extension-id>` to `ALLOWED_EXTENSION_ORIGINS` and the exact callback `https://<extension-id>.chromiumapp.org/auth` to Supabase URL configuration. The panel derives this callback through Chrome's identity API.
3. Open the extension panel, select Sign in, and complete consent. Open the configured controlled site and select Allow this site. Only explicitly granted supported origins receive a content script. Remove site access revokes subsequent observation; the extension never promises a universal transaction blocker.

Credential destination: The extension stores the Supabase session in `chrome.storage.local` under `beforeyou.auth.` so it survives popup closure and service-worker restart. Sign-out removes those keys. The password is never stored. Page-check progress stays in `chrome.storage.session`. Never store Gmail refresh tokens or provider keys. PKCE verification stays in the extension and is not copied from website cookies.

Verification: The agent checks no content capture before granting, automatic observation after granting, event deduplication, pending-to-case transition, blocked cross-owner registration, and revocation. Installed-browser behavior remains unverified until this profile step occurs.

Continuing meanwhile: Build/typecheck, local browser panel preview, and API ownership tests.

## Railway deployment

Prepared files: `deployment/Dockerfile`, `railway.web.json`, `railway.api.json`, `railway.worker.json`. Use three persistent services from the same repository. Set `SERVICE=web|api|worker` as the corresponding build argument; the web image needs its public `NEXT_PUBLIC_*` build arguments. Use the matching Railway config path per service, `APP_MODE=live`, exact web/API origins, and API listen host `0.0.0.0` in deployment. Never deploy the local demo bypass.

The agent can create/configure the services after the designated Railway account/project is connected and authorized. New paid resources require a concrete account decision. The worker gets provider/database credentials; web gets only browser-public configuration. The API gets its authentication, OAuth, database, and storage credentials. Supabase stays managed outside Railway. Run migrations as an explicit release step against the selected database; never reset it.

Deployment and live release remain incomplete until the Spec.md acceptance gates pass with actual integrations, including the worker running with the dashboard closed.
