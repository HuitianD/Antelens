# Frontend refinement review

Preview: **http://127.0.0.1:3002**. This is explicit demo mode with synthetic data and simulated investigations. Its API is on port 4002. The existing live services on 3000/4000 are preserved. No backend integration code was changed in this pass.

## Review checklist

1. On Overview, use All items, Pause here, Confirm first, and No action needed. No action needed shows completed `no_action` messages as compact rows and current No issues found cases with their checked scope. Pending, failed, and unassessed requests stay under Investigations. Each case card has one finding and one primary action. Opening a message row uses the existing message detail. A limited case has no favorable judgment.
2. Open **Review charges**. Compare the exact **Message says** and **Page shows** excerpts, source metadata, and labeled screenshot. Enlarge it, zoom, fit the image, and press Escape; focus returns to the image trigger and the case stays open.
3. Expand **Demo tools** below the workspace and add a demo reply. Reopen the rental case if necessary. Its card retains its position during the recheck; version 2 preserves the conflict and version 1 remains inspectable. Expanded history survives updates.
4. Open **Review the limitation** to inspect recorded events and the unavailable step. Use Demo tools to preview empty/error states, then clear filters or retry. On mobile, compare the stacked evidence and use image zoom without page overflow.

## Design and provenance

Applied [Anthropic's official frontend-design skill](../.cursor/skills/frontend-design/SKILL.md). The complete upstream skill directory and Apache license are preserved in `.cursor/skills/frontend-design/`; its source is recorded there. The skill is installed for future project turns.

The approved cool gray, muted blue, URW Gothic, Palladio, and lens motif remain. Evidence is the drawer's primary content. Numbered non-sequential headings, redundant labels, and the everyday workspace's fixture controls were removed or relocated. Progress displays only saved run statuses and recorded steps, with no estimated percentage or fabricated stages.

The static rental screenshot is an explicitly labeled illustrative UI fixture. Its source and provenance are in [design/fixtures](../design/fixtures/README.md). Live records use the existing authenticated evidence API and never fall back to this fixture. This UI work does not establish provider connectivity or live model accuracy.

## Verification

- **8 frontend tests passed:** stable versions/order/history, exact evidence selection, pending-run observation ownership, and rejection of demo images for live/user evidence.
- **7 Chromium workflows passed:** existing message/evidence/history flows, mobile/keyboard/error recovery, screenshot fit/zoom/focus, failed-image retry, actual pending events, and limited outcomes.
- **Passed:** production frontend build, frontend/shared-UI typechecks, affected ESLint checks, and whitespace validation. Desktop (1440×900) and mobile (390×844) screenshots were inspected and corrected.

Screenshots: [Overview](screenshots/ui-overview-desktop.png), [desktop evidence](screenshots/ui-evidence-desktop.png), [mobile evidence](screenshots/ui-evidence-mobile.png), [page evidence on mobile](screenshots/ui-page-evidence-mobile.png), [fit image](screenshots/ui-screenshot-fit.png), [zoom on mobile](screenshots/ui-screenshot-zoom-mobile.png), [history](screenshots/ui-history-desktop.png), [progress](screenshots/ui-progress-desktop.png), and [limited state](screenshots/ui-limited-desktop.png).

The first sandboxed production build failed because Turbopack's CSS worker could not bind a local port (`Operation not permitted`). The failed production cache was archived under ignored `.local/`; a fresh permitted build succeeded. Chromium checks were available throughout.

## Start this separate preview again

With the pinned Node/pnpm toolchain selected:

```sh
WEB_ORIGIN=http://127.0.0.1:3002 API_ORIGIN=http://127.0.0.1:4002 API_PORT=4002 PORT=3002 WEB_DIST_DIR=.next-ui pnpm dev:demo
```

`pnpm test:e2e` starts this isolated preview when needed. It validates demo mode before fixture resets. Local demo state persists in the existing ignored `.local/demo-state.json`.
