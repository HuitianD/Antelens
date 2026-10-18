# Standalone captured-page checks

Reload **Antelens** at `chrome://extensions`. The build directory remains `/Users/dsteven/Desktop/BeforeYou/apps/extension/.output/chrome-mv3`, extension ID `oonbnpicjomfiddbiaegfdpdjiofdccn`. Existing Gmail authorization and sign-in configuration are unchanged.

Open `http://127.0.0.1:4080/fixtures/SC-01?monthlyFee=29`, allow the site if needed, and click **Check this page**. No email connection or email case is required. The dashboard creates an owner-scoped browser case using the page title and URL. **Link to an email · Optional** is collapsed; selecting an existing email case explicitly retains the comparison flow. Closing that control clears the selection.

After a standalone check, **Recheck this page** captures the same page again and retains its browser case. Changing `monthlyFee=39` exercises a changed capture and a new assessment version. A different path does not reuse a case merely because the hostname matches. Dashboard **Recheck request** reinspects the latest stored bundle through the existing case API.

Standalone findings describe observed terms: recurring charges, renewal/cancellation terms, or requests for sensitive information. They do not claim an email discrepancy or treat a disclosed subscription alone as fraud. Captured-page runs retain the existing `limited` policy, prohibit unsupported favorable judgments, and display **Captured page inspected in Daytona** with offline-scope limitations. No live URL, unseen pages, sender identity, payment, or enrollment is verified.

## Version 6 diagnosis

Persistence was intact: the run saved one email excerpt, a 380-character page excerpt, and a screenshot. The finding cited the email and screenshot, but not the page-excerpt ID. The UI selected the cited screenshot for **Page shows** and read its intentionally empty `excerpt` field.

The renderer now resolves companion text using the exact saved case, run, source, display URL, capture ID and bundle hash. It displays the persisted text with its source and capture time. It never copies checked-scope or assessment prose into evidence, and it never substitutes a different capture. Existing immutable assessments remain unchanged. New captured-page findings must cite a nonempty `page_excerpt`; explicitly linked comparisons must also cite the email. Standalone cases omit the empty email column.

## Status recovery

The extension saves only owner/page-scoped receipt identifiers and page metadata in trusted extension storage. It reloads the exact run through authenticated APIs, rather than assuming the case's latest run belongs to the popup's capture. Complete, limited, failed and cancelled runs reach explicit terminal UI states even after closing/reopening the popup. Passwords, page contents and assessment prose are not stored in these receipts. Supabase sign-in storage remains separate.

## Checks

Final merged verification and the owner-profile Chrome rehearsal are recorded in [verification](verification.md). The commands below describe the earlier isolated live checkpoint, not an instruction to rerun it during release preparation. Present the current scoped flow using the [demo script](demo-script.md).

`pnpm test` covers zero-email SQL ingestion, idempotency, exact-page case reuse, history, cross-owner denial, standalone/linked prompt paths, required text citations, historical screenshot companion matching and status restoration. Providers in these deterministic tests are explicitly mocked and are not live proof.

The opt-in real extension checkpoint is:

```sh
PLAYWRIGHT_BROWSERS_PATH="$PWD/.local/browsers" pnpm exec tsx scripts/check-standalone-extension.ts --run --headed
```

It uses a labeled development account with zero Gmail sources, real Supabase Auth, the built extension and actual capture APIs, real Daytona rendering, real Factory/Claude inference, private Storage, and the authenticated dashboard. The popup is presented as a test tab with a test-only active-tab selection adapter; permissions, content capture and provider responses are not mocked. The visible profile permits the actual controlled-site grant prompt; a headless run can stop at that prompt. Private account configuration, reports and screenshots remain under ignored `.local/standalone-checkpoint/`; credentials never belong in chat. The account is created with the documented [Supabase admin create-user operation](https://supabase.com/docs/reference/javascript/auth-admin-createuser), which does not send a confirmation email.

No schema migration, case-model rewrite, new billing capability or sandbox network-policy change was required.

## Verified on 2026-10-18

- A real isolated owner with zero Gmail sources signed in through the production extension, granted the controlled site, and checked the page with no email selected.
- The independent worker produced real Daytona page text and a private screenshot, a real Factory/Claude assessment, and an owner-scoped browser-only case. Closing the popup during processing and reopening after completion displayed the saved terminal state.
- Changing the captured membership from $29 to $39 created assessment versions 1 and 2 on the same browser case, with different captured terms/screenshots. Both runs recorded zero network requests. Findings described the recurring membership without email-discrepancy or fraud claims.
- The authenticated dashboard loaded the actual private screenshot and standalone page evidence at desktop and 390px mobile widths. Cross-owner access to the existing rental email case was denied to the isolated test account.
- The original explicitly linked rental case was rechecked through the signed-in dashboard and retained both email and current page-text citations. Its previous version 6 now displays the immutable 380-character companion excerpt paired with its cited screenshot.
- The earlier standalone implementation passed its then-current 117 deterministic regressions and eight browser workflows; the superseding 122-test/14-browser-check baseline and final merge gate are recorded in [verification](verification.md). The mobile outage test now holds successful background responses until Retry is clicked; it no longer races automatic recovery. No product/test timeout was increased to conceal an investigation failure.

The root build now leaves extension public settings to `apps/extension/.env.local` unless explicitly supplied by the deployment/CLI environment. This prevents older root-file site defaults from overwriting the working controlled-site configuration. The production web build used `WEB_DIST_DIR=.local/production-web` to keep its output separate from the running dashboard.

The headless live test stopped at Chrome's native site grant. The visible-profile run exercised the grant and real pipeline. An additional direct diagnostic connection briefly reached the existing Supabase session-pool cap; the checkpoint now uses the authenticated application APIs for owner queries rather than opening an unnecessary database session. No pool entitlement or billing setting was changed.
