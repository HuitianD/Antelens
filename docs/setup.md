# Local setup

## Credential-free review on macOS and Windows

Install Node.js **24.22.0** with npm using the matching macOS PKG or Windows MSI from https://nodejs.org/dist/v24.22.0/. Install Git from https://git-scm.com/downloads. Reopen Terminal or PowerShell so PATH changes take effect. Do not assume a Node version manager, Corepack, pnpm, or a local repository toolchain is installed.

```sh
node --version
npm --version
npm install --global pnpm@10.34.7
pnpm --version
git clone --branch UIUX https://github.com/HuitianD/FruadForge.git BeforeYou
cd BeforeYou
pnpm install --frozen-lockfile
pnpm dev:demo
```

Expected versions: Node `v24.22.0`, pnpm `10.34.7`. The source URL is the configured Git remote; unpushed local closeout commits are not available there until the owner publishes them. A supplied checkout/archive of the final revision can instead be extracted, entered with `cd`, and installed using the same commands.

Open http://127.0.0.1:3000. API: http://127.0.0.1:4000/health/live (must report `demo`). The terminal must identify synthetic sources and simulated investigations and show a separate demo worker. No `.env.local`, provider keys, database, extension or Chromium download is needed. Do not run the launcher on top of an existing stack.

In Activity, expand Demo tools and add a demo reply. The worker should publish a new assessment for the rental case with history preserved. Closing the browser does not stop the worker. Ctrl+C stops the launcher and its child process trees; `.local/demo-state.json` persists. This disposable file is separate from real Supabase data.

## Separate ports

Use these only in a separate checkout, to preserve an existing demo. The launcher derives listening ports from these origins and prints the actual dashboard URL.

macOS Terminal:

```sh
WEB_ORIGIN=http://127.0.0.1:3010 API_ORIGIN=http://127.0.0.1:4010 pnpm dev:demo
```

Windows PowerShell:

```powershell
$env:WEB_ORIGIN = "http://127.0.0.1:3010"
$env:API_ORIGIN = "http://127.0.0.1:4010"
pnpm dev:demo
```

Open http://127.0.0.1:3010. In PowerShell, close this terminal afterward to clear the overrides. No production CORS allowlist change is needed for a separate simulated stack.

## Troubleshooting and optional checks

If `node`, `npm` or `git` is not found, reopen the terminal after installation and verify the installer added its executable to PATH. If PowerShell blocks `npm.ps1` or `pnpm.ps1`, use `npm.cmd` / `pnpm.cmd` for the same commands; do not relax machine-wide execution policy. If global npm installation is denied, use an installer configured for your user or your machine administrator's permitted installation location. Do not change repository credentials or lockfile to bypass an install error.

An unsupported-engine error requires the pinned Node/pnpm versions. An address-in-use error means another process owns that port: choose the separate ports above rather than stopping an unrelated service. Keep the dependency download error if installation fails; do not interpret it as a missing API key.

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Only browser regression checks require Playwright's bundled Chromium:

```sh
pnpm exec playwright install chromium
pnpm test:e2e
```

Tests run explicitly simulated API/worker/browser workflows. Production build rejects demo-auth bypasses and builds authenticated web/extension artifacts. Real-provider startup, accounts, callbacks and secret destinations are covered by [integrations](integrations.md); the prepared live-demo process checklist is in [captured-page operations](captured-page-demo.md).

See [verification](verification.md) for the actual clean-checkout result and platform limits. Windows instructions reviewed; not executed on Windows.
