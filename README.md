# Before You

A workspace for investigating consequential requests before payment, identity sharing, account authorization, or downloads. The original repository was initialized as **FruadForge**.

## Current delivery status

Release preparation is complete on `UIUX`; the final magnifier merge, merged checks and owner-Chrome rehearsal are pending Claude's completion handoff. Do not describe this as final readiness. Follow the [three-minute demo script](docs/demo-script.md), [operational checklist](docs/captured-page-demo.md#operational-checklist) and [verification baseline](docs/verification.md).

The prepared **authenticated capture demo** uses dashboard **http://127.0.0.1:3000**, API **http://127.0.0.1:4000**, and controlled page **http://127.0.0.1:4080/fixtures/SC-01?monthlyFee=29**. Preserve the running services and data; do not run another worker or the startup commands below while they are active. For a fully stopped configured stack, `pnpm dev:capture` starts web/API/worker/fixture together with real providers. It inspects an offline reconstruction of the owner-captured page, not the original live website.

## Credential-free local mode

Use **Node 24.22.0** (pinned in `.nvmrc`) and **pnpm 10.34.7**. The agent has installed an ignored local toolchain in this checkout; other checkouts use their Node version manager.

```sh
pnpm install
pnpm dev
```

On a fresh, fully stopped checkout, open **http://127.0.0.1:3000**. `pnpm dev` explicitly starts demo mode: Next.js, Fastify at port 4000, and a separate persistent worker. No external account or API key is required. Keep the dashboard open or close it; the worker processes the same saved jobs independently.

Demo data persists in `.local/demo-state.json`. It contains only synthetic messages and simulated findings. The reset API `POST /v1/demo/reset` replaces only this disposable demo state. `pnpm db:seed` is idempotent and retains existing demo history. Demo services bind only to loopback and reject production startup.

In this prepared checkout, the installed toolchain can also be selected without changing system settings:

```sh
export PATH="$PWD/.local/toolchain/node_modules/node/bin:$PWD/.local/toolchain/node_modules/.bin:$PATH"
pnpm dev
```

## Review the simulated UI

1. Open **Review charges**. Compare the $40 application message with the $29 monthly membership terms in the captured sample evidence.
2. Expand **Demo tools** below the workspace and choose **Add demo reply**. The separate worker revises the existing rental case, retains the unresolved conflict, and preserves version 1 in assessment history.
3. In **All messages**, choose **No action needed**. The newsletter stays a message and never becomes a favorable action card.

The UI refinement preview runs at **http://127.0.0.1:3002**, with its isolated demo API at port 4002; existing live services retain ports 3000/4000. See the [UI review checklist](docs/ui-review.md). Browser tests use the isolated demo ports and refuse to reset a live API. Standard `pnpm dev` still defaults to port 3000.

All visible demo findings are `synthetic/simulated`. The browser-panel preview does not imply an installed extension. Screenshots are in [docs/screenshots](docs/screenshots). Local UI and API verification do not prove the live integrations.

Evidence presentation now follows the saved sources: email-only excerpts, standalone captured pages, or email/page comparison. Historical comparisons use their own run and capture, screenshots retain enlargement, and detailed scope is grouped in one disclosure. See [evidence presentation checks](docs/verification.md#evidence-presentation-checkpoint).

## Implementation status

| Capability | Status |
| --- | --- |
| Overview, messages, evidence/history drawer, Activity, Connections, browser preview | Implemented; desktop/mobile browser workflows verified |
| Saved demo state, background jobs, fetch SSE, viewing/rechecks, same-case revisions | Implemented and tested with explicit simulation |
| Shared Zod contracts, Drizzle migrations, owner checks, leases, outbox, immutable history | Implemented; actual PostgreSQL SQL tested offline with PGlite |
| Gmail ingestion and email-text assessment | Authorized `[BY-TEST]` import and real message-text Claude assessments persisted; worker polls independently. Current user-mail runs remain message-only unless the owner explicitly links a capture |
| URL extraction | HTML href/plaintext HTTP(S) extraction and selection of saved link indexes implemented. Detecting a URL does not inspect its contents |
| Owner-initiated Chrome page capture | Explicit controlled-site grant and Check this page capture visible text, field labels and inert structure, excluding browser credentials, entered values, hidden sensitive data and original executable scripts |
| Standalone checks / optional email linking | Real zero-email owner checks, same-browser-case $29/$39 rechecks and popup recovery verified. Explicit email selection preserves the Gmail comparison |
| Offline Daytona inspection | Real SDK bundle transfer, installed Chromium reconstruction, JSON/PNG evidence, hashes, zero network requests and cleanup verified on Tier 1. Not a visit to the original website |
| Factory / Claude | Actual restricted Droid execution with Anthropic BYOK `claude-sonnet-4-6`; persisted run/session identity and evidence-backed assessments |
| Supabase Auth / evidence / history | Real authenticated owner-scoped cases, private screenshots, immutable assessment history and saved dashboard results verified; not every live security/recovery gate is complete |
| Automatic opening of email links | **Deferred** in this demo; general network egress is unavailable. [Future requirements](docs/integrations.md#future-automatic-email-link-investigation) are documented, not enabled |
| Live website state, unseen pages, sender identity | **Not verified** by a captured-page reconstruction or an email-text assessment |
| Railway deployment | Configuration prepared; no deployment or paid resource created |

**The minimum release remains incomplete** until the live acceptance gates in `Spec.md` pass. The [integration guide](docs/integrations.md) contains exact owner actions and secret destinations. Secrets belong in ignored `.env.local` or service secret settings, never chat, source, or browser bundles.

The [verification record](docs/verification.md) distinguishes the existing 122-test/14-browser-check baseline, saved real provider receipts and pending final integration gates. Fixture tests do not prove live integrations. **No action needed** is a message disposition/group, not a verified-safe verdict; a completed **No issues found** assessment is a separate outcome restricted to its checked scope.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` / `pnpm dev:demo` | Complete local demo with persistent API and worker |
| `pnpm dev:capture` | Authenticated live stack plus the controlled capture site; only start when the existing stack is stopped |
| `pnpm dev:live` | Authenticated live processes; missing required database/auth configuration fails closed |
| `pnpm build` | Typecheck all packages, build production Next.js and Chrome extension; rejects explicit demo bypass |
| `pnpm lint` / `pnpm typecheck` | Static checks across workspace boundaries |
| `pnpm test` | Contract, policy, SQL repository, API, demo worker, and connector regressions |
| `pnpm test:e2e` | Real Chromium workflows using labeled demo adapters; screenshots and traces saved locally |
| `pnpm db:migrate` | Tracked, checksum-checked Drizzle migration against the explicitly selected live development database; no reset |
| `pnpm db:seed` | Idempotent synthetic demo seed through the running API |
| `pnpm run doctor` | Redacted local service/configuration report; exits 2 when live gates are blocked |
| `pnpm check:supabase` | Read-only live database, Auth, and private Storage checkpoint; missing prerequisites exit 2 |
| `pnpm eval` | Versioned local policy/contract evaluation with provenance; no model accuracy claim |
| `pnpm eval --live` | Real provider evaluation when authorized configuration is available; no simulated fallback |

Playwright requires its browser installation on a fresh machine: `pnpm exec playwright install chromium`. This checkout already has Chromium in ignored `.local/browsers`, which the test configuration discovers. Browser tests start the demo when needed. The follow-up test checks each durable processing stage instead of assuming the entire simulated pipeline finishes inside a five-second assertion; see [the measured trace](docs/follow-up-trace.md).

`pnpm doctor` is pnpm's own built-in command and does not invoke this repository's diagnostic script. Use `pnpm run doctor` explicitly.

## Chrome extension

Run `pnpm --filter @beforeyou/extension build`, then load `apps/extension/.output/chrome-mv3` using Chrome's **Load unpacked** control. Default production builds require real sign-in. See the [extension setup](docs/integrations.md#chrome-extension) for exact callback, public build fields, site permissions, and the distinction between a real extension and the dashboard preview.

Site capture requires both Chrome host permission and an explicit consent record for a supported origin. The API's transport permission does not authorize page observation. No cookies, entered passwords, OTPs, payment credentials, or identity documents are captured.

## Integration and security boundaries

Supabase application sign-in and Gmail mailbox consent are separate flows. Gmail requests only `gmail.readonly`; the application processes at most the 50 newest messages within seven days at first connection, excluding Spam/Trash, then follows changes. Credentials are encrypted server-side.

Factory is the actual runtime harness, configured for a specific Anthropic Claude BYOK model. The worker inventories and restricts tools before source content is sent. Daytona hosts the isolated browser; the trusted backend stores run state and evidence. The adapters stop before login, payments, form submissions, authorization grants, or executing downloads. Offline captures make no website requests. Existing network adapter policy code is groundwork for the deferred URL/redirect/public-IP enforcement gate, not proof of live website verification.

Controlled live capture verification is recorded in the [standalone check report](docs/standalone-page-checks.md). [Compatibility notes](docs/compatibility.md), [integration handoff](docs/integrations.md), and [deployment configuration](deployment) record the selected versions and remaining release gates. Font licenses accompany the unchanged reference font files in `apps/web/public/fonts`; the original HTML remains at the root and in `design/reference`.
