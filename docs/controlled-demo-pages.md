# Controlled demo pages

Five fictional pages on the existing fixture host (`pnpm exec tsx scripts/fixture-host.ts`, port 4080) for the explicit Chrome → Daytona → Factory/Claude captured-page flow. Scenario index: **http://127.0.0.1:4080/**.

| Page | URL |
| --- | --- |
| Rental application | http://127.0.0.1:4080/fixtures/SC-01?monthlyFee=29 (variation: `monthlyFee=39`) |
| Bookstore order receipt | http://127.0.0.1:4080/fixtures/SC-10 |
| Reservation confirmation | http://127.0.0.1:4080/fixtures/SC-11 |
| Account support | http://127.0.0.1:4080/fixtures/SC-12 |
| Interview next steps | http://127.0.0.1:4080/fixtures/SC-13 |

Pages are self-contained HTML/CSS served with `default-src 'none'`; there are no external fonts, scripts, images or trackers. Every upload, input, submit and download control is disabled, there is no form action, and no executable exists. Each page shows only a small "Controlled demo scenario" notice; expected outcomes appear only in this document.

## Intended evaluation directions

These describe what a careful reviewer would look for. They are not seeded into pages, prompts, fixtures or assessments, and the model's actual assessment is authoritative.

- **Rental (SC-01):** recurring financial commitment — a $40 application fee with a required $29 (or $39) monthly membership that renews automatically. Standalone analysis should describe the commitment; a discrepancy with an email requires an actually linked email.
- **Receipt (SC-10):** benign informational content — a completed $18.50 purchase, $0.00 balance due, no renewal or further action.
- **Identity check (SC-11):** sensitive-data request requiring clarification — front and back driver's license photos before booking, with no processor, retention or necessity explained.
- **Account recovery (SC-12):** sign-in code disclosure risk — the page asks the visitor to give a six-digit sign-in code to a support representative.
- **Interview installer (SC-13):** disabling security protections and privileged execution — download AssessmentLauncher.exe, disable antivirus if warned, run as administrator.

## Pipeline rules

- Capture is accepted only from `CAPTURE_ALLOWED_ORIGIN` at these exact paths (`CONTROLLED_CAPTURE_PATHS` in `fixtures/src/capture-pages.ts`, mirrored in `apps/extension/src/config.ts`), with query strings stripped. Only these captures receive synthetic provenance; other localhost pages and user captures are unchanged.
- A capture without a case starts a separate standalone case per page. A recheck of the same page follows the existing rule that a browser case only accepts captures from the same page URL.
- Offline captured inspection always records the offline limitation, and the runtime rejects **No issues found** while a limitation exists. The receipt therefore cannot show No issues found in this flow; it may publish no verdict with that limitation. No dashboard status is promised for any page.
