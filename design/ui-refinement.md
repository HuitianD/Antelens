# UI refinement

Uses the official Anthropic frontend-design skill in `.cursor/skills/frontend-design/`. This is a frontend pass over the approved reference, not a change to integration behavior.

## Direction

- Workspace `#e9edf1`, paper `#f9fbfc`, ink `#293643`, secondary text `#607184`, rules `#dce3e9`, blue `#7597c3`.
- URW Gothic for controls and findings; Palladio for page titles and verbatim evidence. Retain bundled font licenses.
- Left aligned workspace with a compact title, a quiet activity rail, and a two-column action grid. Preserve the lens in branding and purposeful empty states.
- The memorable element is the evidence comparison: message and page sit beside one another, with source/time metadata and a captured-image viewer. Distinguish claims from observations and sample images from live captures.

```text
Overview                         Activity
Judgment filters / search        Actual updates
Impact filters                   Source status
[ finding + action ][ finding ]
[ finding + action ][ limited ]
------------------------------------------
Demo tools (collapsed)

Evidence drawer
Verdict / impact / finding
[ Message says     | Page shows           ]
[ exact quote      | exact quote + image  ]
Actual investigation events / limitations
Next step / verification / version history
```

## Review against the brief

Keep the reference's colors, rounded paper surfaces, and distinctive type. Remove redundant eyebrows and non-sequential numbered section headings. Reduce the oversized decorative hero and keep the lens away from individual findings. Use actual persisted events instead of a progress percentage or speculative future stages. Keep stale assessed cards in their existing grid while rechecking. Preserve version guards and stable ordering. Place fixture controls below the workspace in a closed disclosure; do not mix them with daily actions.

Critique desktop at 1440×900 and mobile at 390×844, including comparison, image zoom, failure/retry, empty search, and an assessment update while the drawer remains open.
