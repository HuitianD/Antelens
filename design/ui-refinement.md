# UI refinement

Uses the official Anthropic frontend-design skill in `.cursor/skills/frontend-design/`. This is a frontend pass over the approved reference, not a change to integration behavior.

## Direction

Structure follows a light-mode inbox: Linear's list/detail layout, Attio's restrained surfaces and selected states, and Resend's email-list density.

- Navigation `#f6f7f9`, white working surface `#ffffff`, ink `#1d2733`, secondary text `#667282`, borders `#e6e8ec`/`#d6dae0`, one blue accent `#3a63b8` for selection and the single primary action. Verdict colors stay muted red, amber, and green.
- Interface text uses the platform UI sans (`ui-sans-serif`, SF Pro on macOS, Segoe UI on Windows) at 12.5–14.5px for legibility at list density. This replaces URW Gothic (Avant) for body text at the owner's request; the bundled Avant files and licenses remain in `apps/web/public/fonts`. Palladio (P052) is kept for the wordmark, empty-state titles, and verbatim evidence quotes.
- The lens stays in the brand mark and the empty detail state only.

```text
| Nav (228px)        | List (400px)                         | Detail                               |
| Antelens           | Overview  3 need attention  [Search] | Overview / Original subject     [x]  |
| Overview         3 | [Money][Identity][Account][Downloads]| [Confirm first] [Money]              |
|   All items      6 | Subject                 Received 9:12| Finding headline                     |
|   Pause here     1 | Sender                               | Consequence                          |
|   Confirm first  2 | One finding (max two lines)          | Version, checked time                |
|   No action      2 | [Verdict]                            | [Primary action]                     |
| All messages       | Investigations                       | Original message                     |
| Activity           | Messages with no action needed       | Evidence: message says | page shows  |
| Connections        |                                      | Investigation, limits, scope, history|
```

- Rows show the original subject and sender (joined client-side from `/messages` `caseIds`, earliest source first), the assessment's finding, the verdict or actual run state, and a labeled time (`Received`, or `Updated` when no source message is loaded).
- The detail panel leads with verdict, finding, and exactly one primary-styled button: the assessment's `nextAction` (scrolls to the cited evidence, steps, original message, or verification note), or Recheck request when no assessment exists. Recheck is secondary once an assessment exists.
- Connection status and the update stream moved from the Overview rail to Activity. Demo tools live in a closed disclosure at the bottom of Activity.
- Under 940px the navigation becomes an icon rail and the verdict groups move into the list header. Under 760px the list is full width and the detail covers it with a Back control; Escape and Back return focus to the originating row.

## Review against the brief

Overview has three primary groups: Pause here, Confirm first, and No action needed, plus All items. No action needed shows compact rows for messages triaged `no_action` and keeps the No issues found label and checked scope on cases with that current assessment. Pending, failed, and unassessed requests stay in Investigations. A message already linked to a case is not shown again as a row.

Keep the reference's colors, rounded paper surfaces, and distinctive type. Remove redundant eyebrows and non-sequential numbered section headings. The Overview hero and two-column card grid are removed; keep the lens away from individual findings. Use actual persisted events instead of a progress percentage or speculative future stages. Keep stale assessed cards in their existing grid while rechecking. Preserve version guards and stable ordering. Place fixture controls in a closed disclosure on Activity; do not mix them with daily actions.

Critique desktop at 1440×900 and mobile at 390×844, including comparison, image zoom, failure/retry, empty search, and an assessment update while the drawer remains open.

## Visual polish and sidebar magnifier

- Three related surfaces: silver navigation `#e6e9ee`, soft list `#f5f6f8`, white detail. Graphite text (`#1b1f26`, secondary `#555d69`); faint labels were raised to readable contrast.
- One blue `#0b63d6` for selection, primary actions and focus. The selected row uses a tinted background, a 3px indicator and a blue source icon. Semantic verdict colors are unchanged.
- Buttons, search, chips, navigation and rows have explicit hover, pressed, selected and focus states (`apps/web/app/polish.css`, loaded after `globals.css`). Only overlays are translucent. Next-step guidance is no longer boxed; message and evidence keep solid frames.
- The sidebar holds one decorative 3D magnifying glass (`SidebarMagnifier`, lazy-loading `MagnifyingGlass3D`): procedural geometry, a locally generated studio environment, transparent canvas, ±25° sway with slight pointer tilt. It takes 156px or 116px from the free space between navigation and footer, hides below that and on the icon rail and phone layouts, pauses when hidden or offscreen, holds a still pose under reduced motion, and falls back to a static SVG without WebGL or after an error. Empty states use a neutral lens so the magnifier stays the only decorative element.
