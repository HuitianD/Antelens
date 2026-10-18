# Connected capture demo operations

Authenticated dashboard: **http://127.0.0.1:3000**. Existing linked rental case: **http://127.0.0.1:3000/?case=f6d3e61d-d270-4a16-9c7e-76194078e643**. Controlled page: **http://127.0.0.1:4080/fixtures/SC-01?monthlyFee=29**.

Use the [three-minute script](demo-script.md) for presentation and [verification](verification.md) for the dated evidence. Final merged verification and a new owner-profile Chrome capture are recorded there. A saved run is not a fresh demonstration.

This path uses owner-initiated Chrome capture, real offline Daytona rendering, real Factory/Claude assessment and Supabase evidence/history. The screenshot reconstructs selected captured content; no original website visit, unseen-page exploration, sender verification or enrollment is claimed. Each offline observation is labeled **Captured page inspected in Daytona** and retains `limited` scope.

## Operational checklist

Do not restart working services, reset/seed the database, send mail, rotate credentials or launch another worker. Release closeout preserved the current processes and data. Commands below are recovery/startup instructions, not a request to run them against the working stack.

1. **Select the existing toolchain in the original checkout**, not the magnifier worktree:

   ```sh
   cd /Users/dsteven/Desktop/BeforeYou
   export PATH="$PWD/.local/toolchain/node_modules/node/bin:$PWD/.local/toolchain/node_modules/.bin:$PATH"
   ```

   Node 24.22.0 and pnpm 10.34.7 are already installed locally. Do not reinstall/update dependencies or the lockfile for this preparation.

2. **Check existing services before any startup.** `lsof -nP -iTCP:3000 -iTCP:4000 -iTCP:4080 -sTCP:LISTEN` lists listeners. Required processes are:

   | Process | Purpose / review signal |
   | --- | --- |
   | Next.js web, port 3000 | Authenticated dashboard, source-specific evidence and persisted updates |
   | Fastify API, port 4000 | `/health/live` should report `mode: live`; authenticated case/evidence/stream APIs |
   | One live worker process | pg-boss/outbox processing and Gmail polling; it stays alive when the popup/dashboard closes. It has no HTTP listener; preserve the existing launcher/worker and inspect its terminal if uncertain |
   | Controlled fixture host, port 4080 | GET `/fixtures/SC-01?monthlyFee=29` shows $40 application fee plus required $29/month membership |
   | Supabase and configured providers | Existing Auth, PostgreSQL, private bucket, Factory/Anthropic and Daytona snapshot settings; no local database reset or new account setup |

   A healthy web/API alone does not prove a worker is executing jobs. Do not launch a worker merely because a run is queued; use its existing terminal and exact persisted run state. Phase B will verify queue-to-terminal behavior.

3. **Only for a fully stopped stack**, `pnpm dev:capture` starts web, API, persistent worker and fixture host together. It validates existing real configuration and forces live child processes even though `.env.local` defaults to demo. Never run it alongside the existing live stack. If only the fixture host is absent while the application/worker are healthy, `pnpm exec tsx scripts/fixture-host.ts` starts that one service. Investigate any other partial failure before adding processes.

4. **Use the correct mode and URL.** Open `http://127.0.0.1:3000` for the real capture demonstration and sign in with the existing Before You account. The extension must use the same account for the Gmail case to appear. Gmail consent is separate; preserve the connected `[BY-TEST]` mailbox. Do not run bare `pnpm dev`, which selects simulation on the default ports.

   The optional no-key UI preview belongs on **3002/4002** and displays **Demo data**. Only if it is not already running:

   ```sh
   WEB_ORIGIN=http://127.0.0.1:3002 API_ORIGIN=http://127.0.0.1:4002 API_PORT=4002 PORT=3002 WEB_DIST_DIR=.next-ui pnpm dev:demo
   ```

   It uses synthetic/simulated evidence, not the real provider pipeline. Browser regressions may reset only this isolated disposable demo state.

5. **Build/reload the extension only when its build changes.** Existing load directory:

   `/Users/dsteven/Desktop/BeforeYou/apps/extension/.output/chrome-mv3`

   Build command: `pnpm --filter @beforeyou/extension build`. At `chrome://extensions`, enable **Developer mode**, use **Load unpacked** for the first installation, or click **Reload** on the existing **Before You** card. Confirm ID `oonbnpicjomfiddbiaegfdpdjiofdccn`; do not remove/reinstall or clear extension storage to refresh a build. Pin Before You through Chrome's Extensions menu if necessary. The final production build and Reload were completed in the existing owner Chrome profile. Reload is required after future extension builds.

6. **Sign in and grant only the controlled site.** Open `http://127.0.0.1:4080/fixtures/SC-01?monthlyFee=29`; open the toolbar popup; enter the existing account's Email/Password in its local form and click **Sign in** if requested. Click **Allow this site**, then accept the native prompt only for `http://127.0.0.1:4080` if shown. Existing grants need no repeat consent. Google application login is disabled; no new OAuth callback is required. API transport permission does not grant page observation.

7. **Choose the intended association before capture.** Default **Check this page** creates a standalone browser case. For rental comparison, expand **Link to an email · Optional**, choose the **Maple Court Leasing** summary ending **(f6d3e6)**, and click **Check this page**. Closing the optional control clears its selection. **Recheck this page** keeps an explicitly selected/restored browser case; dashboard **Recheck request** reinspects stored captured content and is not a new Chrome capture.

8. **Inspect the actual result.** **View case details** opens the case. Queued/checking states are real persisted stages; a terminal `limited` run can have a valid assessment without claiming complete site verification. Wait for current-run evidence and assessment, not just a previous card. Confirm exact page fee, capture timestamp, screenshot, **Offline page inspection**, and **Captured page inspected in Daytona**. Close/reopen the popup or use **Refresh status** to read the saved run. No favorable default appears on failure.

9. **Private evidence access requires authentication.** Open the screenshot with **Enlarge screenshot**; Zoom in/out and Fit image operate on the saved image. If its short-lived URL expires, click **Reload image**. Missing files and loading failures remain explicit; never replace them with fixture art. Keep Supabase sessions, signed URLs, `.env.local`, private reports and credentials out of slides/Git/chat.

10. **Preserve the starting page and saved fallback.** The optional fee-change URL is `http://127.0.0.1:4080/fixtures/SC-01?monthlyFee=39`; a fresh extension capture must be made to observe the change. Existing saved $29/$39 runs prove the earlier sensitivity check; they are not fresh observations. Return the open page to `monthlyFee=29` for the script. Do not submit the protected form or enter real data.

## Configuration ownership

The root ignored `.env.local` already holds server-only configuration. Keep `BROWSER_RUNTIME=local_controlled` and `GMAIL_TEST_MODE=true` for the current bounded Gmail behavior. Explicit captures override only their own browser adapter to real Daytona. Keep `CAPTURE_ALLOWED_ORIGIN=http://127.0.0.1:4080`, `CAPTURE_ALLOWED_PATH=/fixtures/SC-01`, and the configured extension-origin allowlist. No billing/network setting or permission expansion is needed for offline inspection.

The extension's ignored `apps/extension/.env.local` contains only public settings: live mode, API 4000/web 3000 origins, Supabase public URL/publishable key, controlled supported/capture origin and path, Google sign-in disabled. Do not copy root secrets into it. Exact field names and replacement-account pages are in [integrations](integrations.md).

## Diagnostics without a substitute capture

Use the authenticated dashboard and extension's exact saved run state first. Existing `scripts/inspect-capture-checkpoint.ts --latest-chrome --watch --artifacts` is read-only with respect to ingestion and can check an existing Chrome receipt, but it opens a separate database connection and has previously reached the session-pool cap. Prefer application APIs; do not increase the pool or change billing as a workaround.

`scripts/capture-checkpoint.ts --run` creates a backend capture and `scripts/check-standalone-extension.ts --run --headed` uses an isolated test account/profile. Their saved results are useful evidence, but neither substitutes for the owner-profile Chrome toolbar rehearsal. Do not run them as routine demo preflight checks. The [verification record](verification.md) distinguishes these paths and their timestamps.
