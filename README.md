# Antelens

Antelens assesses consequential email requests and pages you choose to capture before you pay, share sensitive information, grant account access, or download something. It shows a concrete finding, the supporting source evidence, and a next action, so you can decide what to do with the request.

![Antelens dashboard showing a rental-fee comparison with labeled simulated evidence](docs/screenshots/release-dashboard.jpg)

- **Understand the request.** Review consequential emails in one workspace, filter by impact, and distinguish requests needing attention from messages requiring no action.
- **Inspect the evidence.** Read exact saved excerpts, enlarge screenshots, and compare an email with an explicitly linked page capture. Standalone page checks need no email.
- **Follow changes.** See actual processing stages, retain assessment history, and revisit the evidence belonging to each version without losing your place in the list.

## Quick start — simulated demo

Install **Node.js 24.22.0**, including npm, from the [official Node.js distribution](https://nodejs.org/dist/v24.22.0/): use the macOS `.pkg` or Windows `.msi` installer for your processor. Install [Git](https://git-scm.com/downloads) if needed, then open a new Terminal on macOS or PowerShell on Windows. No version manager or Corepack is required. Internet access is needed to download the repository and dependencies.

The following commands work in both shells. They install the repository's pinned **pnpm 10.34.7** and select the delivery branch:

```sh
node --version
npm install --global pnpm@10.34.7
pnpm --version
git clone --branch UIUX https://github.com/HuitianD/FruadForge.git BeforeYou
cd BeforeYou
pnpm install --frozen-lockfile
pnpm dev:demo
```

Open **http://127.0.0.1:3000**. The launcher starts the dashboard, local API, and a separate background worker. This mode requires **no API keys, Supabase project, Gmail consent, browser extension, or Playwright browser installation**. Do not copy a real-provider environment file into this checkout. If either default port is occupied, use the separate-port instructions in [local setup](docs/setup.md).

Look for **Demo data**: all messages, findings, screenshots, and investigation results in this mode are explicitly synthetic and simulated. Open the rental request to compare a one-time $40 application fee with a $29/month membership. In **Activity → Demo tools**, choose **Add demo reply** to watch the background worker publish another version and retain its history. In **All messages**, choose **No action needed** to see a reading-only message without an assessed verdict.

Leave the terminal running during review. Stop it with **Ctrl+C**; disposable demo state persists in `.local/demo-state.json` for your next session. The worker processes queued changes independently of an open dashboard. See setup troubleshooting for installation, ports, and optional test commands.

## Use your own accounts

The demo above does not call Supabase, Gmail, Factory, Anthropic, or Daytona. To run Antelens against a real sign-in and real investigations, copy the template and fill the copy on this machine:

```sh
cp .env.example .env.local
```

That file is the repository-root `.env.local`. It is gitignored. Do not commit it, and do not paste its values into chat. Leave `APP_MODE=demo` in the file. Real mode is selected by the command, so filling in keys does not turn `pnpm dev:demo` into a live run:

```sh
pnpm dev:live
```

Open **http://127.0.0.1:3000** and sign in. The terminal must say **Live mode**. Startup stops until the Supabase fields below are present.

| Connect this | Put the value in | Fields |
| --- | --- | --- |
| [Supabase](https://supabase.com/dashboard/projects) project: Project URL, publishable key, secret key, and the Postgres connection string. Set Authentication site URL to `http://127.0.0.1:3000`, then create the user who will sign in. | Root `.env.local` | `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`), `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| [Factory](https://docs.factory.com/model-independence/byok) account using Anthropic bring-your-own-key. The custom model display name must be exactly `Before You Claude`, and the model id `claude-sonnet-4-6`. | Root `.env.local` only. These stay on the worker. | `FACTORY_API_KEY`, `ANTHROPIC_API_KEY`, `CLAUDE_MODEL_ID=claude-sonnet-4-6`. Set `ANTHROPIC_WORKSPACE_ID` only when the Anthropic key is user-scoped. |
| [Google Cloud OAuth client](https://console.cloud.google.com/apis/credentials) with the Gmail API enabled and scope `https://www.googleapis.com/auth/gmail.readonly`. Authorized redirect URI: `http://127.0.0.1:4000/v1/connections/gmail/callback`. | Root `.env.local`, then **Connections → Connect Gmail** in the dashboard. Generate the encryption key locally with `openssl rand -base64 32`. | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `CREDENTIAL_ENCRYPTION_KEY` |
| [Daytona](https://www.daytona.io/) account, used when a Chrome capture is inspected offline. | Root `.env.local` | `DAYTONA_API_KEY`, `DAYTONA_SNAPSHOT` |

Gmail supplies message text. A link inside a message is not opened. A page is inspected only after an explicit Chrome capture, and that inspection uses Daytona. Account clicks, consent-screen fields, and the private storage bucket are in [real-provider setup](docs/integrations.md).

The Chrome extension has a second, public file: `apps/extension/.env.local`. Copy only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` into `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, and set `APP_MODE=live`. Do not put `FACTORY_API_KEY`, `ANTHROPIC_API_KEY`, `SUPABASE_SECRET_KEY`, `DATABASE_URL`, or the Gmail client secret in the extension file.

## Factory Droid — the investigation agent inside Antelens

**Factory's Droid SDK runs each live investigation in the background worker**, using an explicitly configured Claude model through Anthropic BYOK. Restricted tools let the agent read case context, request observations, save evidence and compare exact source excerpts. It proposes a finding and next action; the server validates evidence references and verdict rules before publication. Factory supplies the agent execution and tool-calling workflow behind the assessment. [See the runtime implementation](packages/agent/src/runtime.ts).

## Daytona — isolated browser inspection and evidence

**Daytona produces the captured-page evidence the agent uses.** The backend uploads a self-contained capture bundle through the Daytona SDK into a network-blocked sandbox. Installed Playwright/Chromium renders the reconstruction offline and returns page text and a screenshot. The backend verifies artifact hashes and capture identity, then stores the evidence in Supabase for the dashboard's comparison and zoomable screenshot. [See the Daytona adapter](packages/agent/src/daytona-captured.ts) and [browser inspection script](deployment/daytona/offline-browser.mjs).

Both integrations ran in the [verified rental investigation](docs/verification.md#final-rehearsal-and-remaining-gates): a $40 email request compared with captured $29/month terms. The credential-free quick start simulates this workflow; it does not call either provider.

## Current limits

Automatic email-link browsing and sender identity verification are **not implemented**. Extracting a URL does not inspect its contents. Daytona currently inspects offline captured content; this does not verify live website state or unseen pages. A disclosed subscription alone is not evidence of fraud. **No action needed** describes a message's disposition; **No issues found** is a distinct assessment restricted to its checked scope. The verification record identifies outstanding live acceptance gates rather than implying complete coverage.

## Review and engineering guides

| Guide | Contents |
| --- | --- |
| [Setup](docs/setup.md) / [real integrations](docs/integrations.md) | Fresh-machine demo, troubleshooting, accounts and configuration |
| [Demo script](docs/demo-script.md) | Three-minute controlled live walkthrough and labeled saved fallback |
| [Architecture](Contracts.md) / [product specification](Spec.md) | Components, schemas, trust boundaries and release criteria |
| [Verification](docs/verification.md) | Actual checks, live receipts, operating systems tested and remaining gates |
| [Documentation index](docs/README.md) | Operations, design review and compatibility details |
