# Connected captured-page demo

Dashboard: **http://127.0.0.1:3000/?case=f6d3e61d-d270-4a16-9c7e-76194078e643**. Controlled page: **http://127.0.0.1:4080/fixtures/SC-01?monthlyFee=29**.

This is real offline inspection of a controlled, synthetic page capture against an existing authorized Gmail rental email. It is not live website verification, unseen-page exploration, sender verification, or proof of enrollment. Every captured-page observation displays **Captured page inspected in Daytona**. The screenshot is an inert reconstruction of selected content, not a screenshot of the original website. Findings remain `limited` with the offline scope stated.

## Load and review

1. Open `chrome://extensions`, enable **Developer mode**, and click **Load unpacked**. Choose `/Users/dsteven/Desktop/BeforeYou/apps/extension/.output/chrome-mv3`. If already installed, click **Reload** after a new build.
2. Confirm extension ID `oonbnpicjomfiddbiaegfdpdjiofdccn`. The public manifest key keeps this local ID stable; it is not a secret or a signing credential.
3. Open the controlled page above and open Before You from Chrome's toolbar. Sign in with your Before You account. Enter credentials only in the local extension form, never chat. The configured flow uses Supabase email/password; it needs no new OAuth callback or provider authorization. Email linking is now optional; see [standalone checks](standalone-page-checks.md).
4. Click **Allow this site** and accept Chrome's permission if it shows a prompt. This records both a Chrome grant and an owner-scoped server grant for `http://127.0.0.1:4080`. Transport permission for API port 4000 does not itself authorize collection.
5. Click **Check this page** for a standalone browser case. To exercise email comparison instead, expand **Link to an email · Optional**, choose the existing Maple Court rental email case, ID beginning `f6d3e6`, then check. That explicit association retains the existing Gmail case.
6. Open **View case details**. Review **Message says** ($40 one-time application fee), **Page shows** (required $29/month membership), the exact offline-inspection label, the screenshot and its zoom. Open History to inspect earlier immutable versions.
7. Change the page URL to `http://127.0.0.1:4080/fixtures/SC-01?monthlyFee=39`, reopen the extension, choose the same case and check again. The new page quote, screenshot and assessment must show $39; the $29 version stays in history. Return the URL to `monthlyFee=29` for the starting demonstration.

The owner-profile linked Chrome capture reached version 6. Its persisted text-display issue is diagnosed in [standalone checks](standalone-page-checks.md); matching saved text is now rendered without changing historical assessments. Isolated automated browser checks remain distinct from actions in the owner's Chrome profile.

## Prepared configuration

The running local processes already use these settings. On a fresh start, `pnpm dev:capture` starts the authenticated live dashboard/API/worker plus the controlled fixture server. It fails closed without real providers. `pnpm dev:demo` remains the separate credential-free simulation.

Root ignored `.env.local`:

| Field | Destination/value |
| --- | --- |
| `APP_MODE` | `live` |
| `CAPTURE_ALLOWED_ORIGIN` | `http://127.0.0.1:4080` |
| `CAPTURE_ALLOWED_PATH` | `/fixtures/SC-01` |
| `ALLOWED_EXTENSION_ORIGINS` | `chrome-extension://oonbnpicjomfiddbiaegfdpdjiofdccn` |
| `DAYTONA_API_KEY`, `DAYTONA_SNAPSHOT` | Existing configured Tier 1 key and `beforeyou-browser-v1` snapshot; no billing or network changes |
| `FACTORY_API_KEY`, `ANTHROPIC_API_KEY`, `CLAUDE_MODEL_ID` | Existing real Factory/Anthropic credentials and explicit `claude-sonnet-4-6` |
| `DATABASE_URL`, `SUPABASE_URL`, backend key, storage bucket | Existing configured development Supabase project; migration `0002_page_captures` applied without reset |

`apps/extension/.env.local` contains only an explicit public allowlist: `APP_MODE=live`, `VITE_API_ORIGIN=http://127.0.0.1:4000`, `VITE_WEB_ORIGIN=http://127.0.0.1:3000`, the browser-public Supabase URL/publishable key, `VITE_SUPPORTED_ORIGINS=http://127.0.0.1:4080`, `VITE_CAPTURE_ORIGIN=http://127.0.0.1:4080`, `VITE_CAPTURE_PATH=/fixtures/SC-01`, and `VITE_GOOGLE_SIGN_IN_ENABLED=false`. No root server secret is copied to this file or browser bundle. Build with `pnpm --filter @beforeyou/extension build`.

The normal Gmail `BROWSER_RUNTIME` and test-mail polling behavior are retained. A capture run overrides only its own browser adapter and always uses Daytona. A failure never switches to a local browser or prewritten assessment.

## Actual checks and evidence

On 2026-10-18, the initial probe created the existing snapshot with `networkBlockAll: true`, uploaded a self-contained bundle and reviewed renderer through SDK filesystem calls, rendered with installed Chromium 156, and downloaded JSON plus PNG through the SDK. Both $29 and $39 inspections reported **zero browser network requests**. Bundle and screenshot hashes differed. Sandbox deletion completed through the SDK. No original URL was navigated and no egress policy was changed.

Probe artifacts: ignored `.local/daytona-offline-probe/`. Reproduce with `pnpm --filter @beforeyou/agent exec tsx scripts/probe-daytona-offline.ts`.

The backend checkpoint selected the existing real Gmail rental case, attached controlled captured content, and followed the committed investigation outbox into pg-boss, the independent worker, actual Factory/Claude tools, actual offline Daytona inspection, private Supabase artifacts, and saved assessments. Versions 2 and 3 showed $29/month and $39/month respectively. The $39 bundle was collected from the rendered local page using the extension's collector. The final repeat uses the same collector at $29. Both provider session IDs and sandbox IDs are stored. Private screenshot download/hash verification passed.

These checkpoint installations are labeled **Controlled capture checkpoint (backend)** and are distinct from the user's actual Chrome installation. The checkpoint does not assert extension authentication/consent. The existing signed-in dashboard displayed the saved version 4 assessment, exact email/page comparison, and actual private 1280×900 screenshot; screenshot zoom was inspected at desktop and 390px mobile widths without page overflow. The browser viewport was restored. Realtime delivery for a new owner-initiated Chrome capture remains pending that interaction.

Commands for an explicitly selected existing real Gmail case (never creates a synthetic substitute):

```sh
pnpm exec tsx scripts/capture-checkpoint.ts
PLAYWRIGHT_BROWSERS_PATH="$PWD/.local/browsers" pnpm exec tsx scripts/capture-checkpoint.ts --run --case=<eligible-case-id> --fee=29
pnpm exec tsx scripts/inspect-capture-checkpoint.ts --watch --fee=29
pnpm exec tsx scripts/inspect-capture-checkpoint.ts --fee=29 --artifacts
pnpm exec tsx scripts/inspect-capture-checkpoint.ts --latest-chrome --watch --artifacts
```

Private reports/screenshots live in ignored `.local/capture-checkpoint/`. The read-only status command traces queue delivery, worker steps, evidence and current assessment. Its timeout reports unfinished work instead of fabricating success. Successful publication requires both email and captured-page citations; older run leases cannot overwrite later source revisions.

Local Chromium checks also cover capture privacy and fee changes, the actual unpacked extension ID and sign-in controls, exact-origin API CORS, and rejection of unauthenticated capture requests. These local tests are separate from provider verification and from the remaining owner-profile interaction.

Final checks: production workspace build and typechecks passed; 107 deterministic regressions passed; all 8 browser workflows passed across the full run and affected rerun. One outdated empty-state assertion was corrected against the actual accessible heading, **No matching items**. Lint passed. The built extension was checked against configured backend secret values and contained none. The read-only Supabase check verified both tracked migrations, 16 private/RLS tables, reachable Auth, and the existing private storage bucket. Review images are in ignored `.local/capture-checkpoint/dashboard-*.jpg`.

## Owner boundary

**Blocked capability:** Chrome-profile authentication and site permission. **Reason:** owner credentials and consent must be entered in that profile. **Already prepared:** build, exact extension-origin authorization, controlled site, real processing and persistence. **Your action:** steps 1–5 above. **Credential destination:** extension sign-in form only. **Verification:** inspect the new capture receipt, queued run, sandbox/Factory session, private screenshot and new assessment on the same case; confirm dashboard receives the update. **Continuing meanwhile:** regression/build checks and evidence review. General live website browsing remains blocked by the existing Tier 1 egress restriction and is not needed for this offline checkpoint.
