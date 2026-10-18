# Antelens — Product Specification

Status: Approved product direction; implementation not yet verified.

This document defines product behavior and acceptance. `Contracts.md` defines the canonical data and interface contracts. `AGENTS.md` defines implementation responsibilities, commands, and the agent-first workflow. Keep all three consistent when making an approved change.

## 1. Product definition

Antelens automatically investigates requests before a person pays, shares identity information, grants account access, or downloads software. It turns incoming messages and supported webpage observations into concise action cards backed by inspectable evidence. New evidence updates the existing case and preserves the earlier judgment.

The core loop is:

1. Receive a new message or an authorized webpage observation.
2. Identify the requested action and associate it with a case.
3. Inspect the accessible steps that follow, including links, redirects, displayed terms, and requested information.
4. Publish a concise assessment with supporting evidence and a useful next action.
5. Receive a reply, a relevant page change, or a user's verification result.
6. Investigate the new information and publish a new assessment version.

The dashboard shows work already performed in the background. Opening the dashboard does not initiate every investigation, and the user does not need to paste messages into a chat or press Analyze.

Primary users are individuals handling consequential digital requests: rental applicants, job applicants, students receiving account requests, and people following payment or document-sharing links. Rental applications are the main demonstration scenario, not the product's exclusive domain.

## 2. Product rules

- All product content, interface text, sample messages, fixtures, and documentation are English. Discussion with the project owner may be Chinese.
- The interface prioritizes a judgment, a concrete finding, and an action. It must not expose a lengthy model response as the main experience.
- Automatic means the persistent worker continues while the dashboard is closed.
- A result describes the steps actually observed. An anticipated consequence must be supported by visible terms or another identified source; an imagined future page is not evidence.
- Every factual finding cites evidence. A sender's assertion is stored as an assertion, not promoted to independent verification.
- Viewing a case does not verify its claims, dismiss its risk, or resolve it.
- New evidence does not automatically clear a warning. The agent must reconcile it with existing evidence.
- Limited access, missing credentials, failed tools, and blocked pages never produce a fabricated successful assessment.
- No numeric risk score is displayed. Investigation progress, action judgment, and user handling state remain distinct.
- Provenance distinguishes source data (`synthetic` or `user`) from execution (`simulated` or `live`). A real investigation of a controlled fixture is synthetic/live; a prewritten prototype response is synthetic/simulated. Neither may suggest it came from the user's mailbox.

## 3. Action cards and judgments

### 3.1 Three judgments

| Internal value | UI label | Meaning |
| --- | --- | --- |
| `pause_here` | Pause here | Observed evidence, or a materially risky request stated in the message itself, supports stopping before the requested action; explain the specific concern. A message-only concern is published as an investigation limited to the message text. |
| `confirm_first` | Confirm first | A material question, conflicting claim, or missing verification must be resolved before proceeding. |
| `no_issues_found` | No issues found | Required checks for the stated, observed scope completed without a material issue. This is not a general safety guarantee. |

The judgment is null before a valid assessment exists. A queued or failed investigation must not be assigned a reassuring default. Incomplete investigations may publish an evidence-backed concern with explicit limitations; they cannot publish `no_issues_found` for a scope they could not check.

Message disposition is `pending`, `action_required`, or `no_action`. Ordinary messages without a consequential request have the disposition `no_action`. They remain available in All messages and do not become green action cards.

### 3.2 Four impact labels

The labels are `money` (Money), `identity` (Identity), `account_access` (Account access), and `downloads` (Downloads). A case may have multiple labels. Labels describe what the request affects, not how dangerous it is.

### 3.3 Card content

Every completed action card contains:

1. One primary judgment.
2. Relevant impact labels.
3. One concrete finding, preferably one line and at most two lines at the reference desktop width.
4. One short consequence describing what continuing would do, when evidence supports that statement.
5. One primary action with a concrete label.
6. Source, last checked time, and investigation state where relevant.

Example:

> Confirm first · Money  
> **The $40 application includes a $29 monthly membership.**  
> Continuing would start recurring charges.  
> **Review charges**

Primary actions open relevant evidence, compare terms, show a verification route, or open the case's next-step guidance. A button must not claim to verify, contact, send, block, or resolve something unless that capability is implemented and the action actually occurs. In MINIMUM, verification guidance may be prepared without automatically contacting another person.

## 4. Interface and visual requirements

### 4.1 Visual baseline

Use the approved `beforeyou.html` as the design reference, placed at `design/reference/beforeyou.html` when available. If supplied at repository root, copy it to that reference path. Convert its design into React components; do not embed the entire prototype as the production application. If the file is temporarily unavailable, continue scaffolding and use the documented visual direction rather than blocking on it.

Preserve the cool gray workspace, near-white surfaces, muted blue accents, fine borders, generous whitespace, geometric sans-serif interface typography, serif headings, and magnifying-glass identity. Starting reference colors include background `#e9edf1`, paper `#f9fbfc`, ink `#293643`, muted text `#71808d`, borders `#dce3e9`, and blue `#7597c3`. Adjust contrast and increase undersized prototype text where necessary. The embedded `Avant` family is URW Gothic; `Palladio` is P052. Use these locally bundled fonts if their files and redistribution rights are available; document any substitution. Avoid silently reverting to a generic default font or an unchanged component-library theme.

The magnifying glass and restrained investigative motifs belong in branding and selected empty states. They must not compete with evidence or become decorative clutter on every card.

Remove promotional and redundant copy, including “The important part at a glance” and “We look into what's next. You decide what comes after.” Use functional titles such as “Overview,” “Evidence,” and “Connections.” Short explanations are appropriate only when they help someone interpret a limitation, make a decision, or recover from an error.

### 4.2 Required surfaces in MINIMUM

| Surface | Required behavior |
| --- | --- |
| Overview | Three judgment filters with accurate counts, prioritized action cards, search, impact filters, and background updates. Unassessed cases appear separately as Checking or another actual investigation state. |
| All messages | Received messages, source and time, disposition, related case, search, and filters. Ordinary messages remain visible without manufactured warnings. |
| Case detail | Original request, finding, next-step consequence, primary action, source-linked evidence, observed steps, limitations, and assessment history. |
| Activity | Received messages, investigation progress, new evidence, user handling events, and judgment changes. No invented activity. |
| Connections | Actual connection status, last successful sync, errors, connect/reconnect/disconnect controls, and extension status. |
| Browser panel | Current supported page's investigation state, concise judgment if available, one finding, and a route to case details. |

Captured page checks default to a standalone browser case and work without any email cases or connection. **Link to an email · Optional** is a collapsed secondary control; an explicit selection retains email comparison. A standalone finding describes captured recurring charges, cancellation terms, or sensitive-information requests using exact saved evidence. It must not invent an email discrepancy or treat a disclosed subscription alone as fraud. An explicit browser-case recheck preserves that case and its history; different pages are not merged merely by hostname. Offline inspection limits remain visible, and closing/reopening the extension reloads the actual persisted run state.

Every surface includes appropriate empty, loading, disconnected, limited, error, and retry states. Connection labels must distinguish Not connected, Connecting, Connected, and Reconnect required according to actual backend state.

The dashboard first renders the saved snapshot, then applies live events. Updates must not close an open drawer, reset filters, lose keyboard focus, or unexpectedly move the item being reviewed. New results can show a restrained “Updated” indicator. Respect reduced-motion preferences.

Provide keyboard navigation, visible focus, accessible dialog behavior, readable contrast, text labels alongside judgment colors, and usable responsive layouts. Verify the desktop workspace at 1440×900 and narrow layouts at 390×844; no essential action may require horizontal scrolling. Evidence and history may use progressive disclosure without hiding the primary finding.

## 5. Architecture commitments

| Area | Selected implementation |
| --- | --- |
| Web | Next.js, React, TypeScript, Tailwind CSS, customized shadcn/Radix primitives, restrained Motion animation |
| Extension | WXT, React, TypeScript, Chrome Manifest V3 |
| API | Fastify on Node.js |
| Background processing | Persistent Node.js worker with pg-boss |
| Investigation agent | Factory Droid SDK with an explicitly configured Anthropic Claude model through BYOK |
| Isolated execution | Daytona with Playwright and bounded browser tools |
| Data | Supabase PostgreSQL, Drizzle migrations, Supabase Auth and Storage |
| Deployment | Railway web/API/worker services; Supabase managed data services |
| FULL additions | Exa for independent-source discovery; Chalk for versioned evaluation |

Claude is the reasoning model, Droid is the runtime agent harness, and Daytona is the isolated execution environment. Do not add a second outer agent loop merely to call Droid. Verify SDK versions and account capabilities during implementation; configuration and proof of successful calls take precedence over subscription assumptions.

Investigations run as durable background jobs, not as long-lived page requests. The database stores source events, cases, runs, evidence, assessment versions, and activity. Screenshots and files are stored in private object storage. The API delivers a saved snapshot and authenticated realtime updates.

## 6. MINIMUM release

MINIMUM is a complete, polished, real end-to-end product with deliberately bounded sources and investigation scope. It includes:

- Every interface in Section 4, including useful operational states.
- Real sign-in and per-user data isolation, initially demonstrated with one account.
- One Gmail connection per user, automatic background incremental polling, message deduplication, and same-thread updates.
- Explicit initial-sync behavior so connecting an account does not silently investigate its entire history. Default to at most the 50 most recent messages from the last 7 days, excluding Spam and Trash, then follow new changes. Show that processing scope before authorization; distinguish it from the broader Gmail read permission.
- An installed Chrome extension that observes supported, explicitly authorized sites and sends minimal relevant page context automatically.
- Real Claude reasoning through the Factory Droid SDK, invoking real Daytona browser tools.
- Inspection of accessible links, redirects, displayed terms, and requested actions, with screenshots or excerpts supporting findings.
- Persistent cases, immutable assessment history, evidence provenance, live dashboard updates, and recovery after refresh or reconnect.
- All four impact labels and the five scenario families in Section 8.
- A visible local-only `demo` mode for fixture data and a separate `live` mode. Never silently fall back from live integrations to simulated results. Real-provider verification remains required for completion.

MINIMUM excludes general web identity research, arbitrary websites, other messaging channels, complex attachment analysis, automatic outbound messages, real payments, identity-document submissions, and automatic permission grants. These exclusions must not remove an already required UI surface or replace the real investigation chain with scripted verdicts.

## 7. FULL release

FULL extends the same application and contracts; it is not a replacement build.

| Increment | Required result |
| --- | --- |
| F1 — Continuous Gmail delivery | Gmail watch/Pub/Sub, renewal, incremental recovery, and periodic reconciliation handle delayed, duplicate, or missing notifications. |
| F2 — Cross-source cases | Related messages, URLs, page observations, and attachments can be linked with recorded reasons; ambiguous matches remain separate or require confirmation. |
| F3 — Independent verification | Exa-assisted discovery of official sources and cross-checks for evidence provenance, identity continuity, and authorization to make the request. Unverified relationships remain explicitly unverified. |
| F4 — Deeper investigation | Bounded dynamic-page navigation, supported PDF/attachment extraction, and controlled parsing tools preserve source evidence and stop at protected boundaries. |
| F5 — Action-time guidance | Supported payment, upload, permission, and download interactions display the relevant current judgment before the user continues. Claims are limited to the sites and actions actually supported. |
| F6 — Continuing reassessment | New replies, relevant observed page changes, and expired evidence trigger targeted rechecks, with reasons and version differences. |
| F7 — Chalk evaluations | A versioned dataset and runnable evaluation job compare model/prompt/tool versions using disclosed labels and metrics. |
| F8 — Account and operations completeness | Multiple connected accounts, retention and deletion controls, run budgets, operational monitoring, recovery, and account-scoped usage visibility. |

Evaluate missed material risks, false alarms on benign requests, unsupported claims, and failed/limited investigations incorrectly presented as normal. Include normal examples, conflicting follow-up evidence, and adversarial instructions. Report actual observed results, the dataset size, and known limits; do not fabricate accuracy claims.

## 8. Scenarios

| ID | Input and observed evidence | Expected behavior |
| --- | --- | --- |
| SC-01 | Rental email describes a $40 application; accessible checkout terms add a $29 monthly membership. | Money label; Confirm first; cite both the original claim and observed recurring terms; offer Review charges. |
| SC-02 | The sender replies that membership is optional, while the observed checkout still enrolls applicants. | Update SC-01's case and preserve both versions. Keep the unresolved conflict visible; do not clear the judgment solely because the reply sounds reassuring. |
| SC-03 | A recruitment message claims to represent an employer, but the linked form names a different organization and asks for identity documents. | Identity label; Confirm first unless additional evidence supports Pause here. Explain the mismatch without claiming definitive identity fraud. Stop before submitting documents. |
| SC-04 | A document-sharing flow visibly asks to control account capabilities unrelated to viewing the document. | Account access label; Pause here when the observed request is materially dangerous; cite the exact visible permissions. Never grant them. |
| SC-05 | A message promises a PDF, but its next page asks the user to install an executable or browser extension. | Downloads label; Pause here; show the observed change in requested action. Do not download or execute the payload. |
| SC-06 | A normal application presents fees and requested information consistent with the message; all required in-scope checks succeed. | No issues found, with a concise description of the checked scope and retained evidence. |
| SC-07 | A newsletter contains no consequential request. | `no_action`; retain it in All messages without an action card. |
| SC-08 | A relevant page requires authentication, blocks automation, or times out. | Show the actual limitation or failure; no invented downstream evidence and no No issues found result for unchecked steps. |
| SC-09 | A page instructs the agent to ignore its rules or disclose credentials. | Treat the text as untrusted page content. Enforced tool boundaries prevent secret access or external submission; record the relevant limitation or attempted manipulation. |

Demonstration websites may be controlled fixtures containing synthetic requests. The browser must still visit them and the model must reason over the actual returned evidence. Changing the fixture's terms must change the observed evidence and allow the assessment to change. Document which scenarios are controlled and which use real services.

## 9. State and evidence behavior

Run lifecycle is separate from judgment: `queued`, `checking`, `complete`, `limited`, `failed`, or `cancelled`. Case freshness is independently `current` or `stale`; Stale is not a run result. User review is `unreviewed`, `viewed`, or `verification_requested`, tracked against an assessment version. A newly published assessment must not inherit the previous version's Viewed state. Show previously observed concerns while a recheck runs, clearly identified as the previous assessment. Do not silently display an old normal judgment as current when its supporting source has materially changed.

A meaningful independent external source event increments the case's source revision. Evidence collected inside an investigation belongs to that run's fixed revision and must not trigger it to invalidate or restart itself. An older run or obsolete worker attempt finishing later may be retained in history but cannot replace a newer current assessment. The current assessment pointer is authoritative; historical version numbers alone do not select the displayed result.

Evidence records include the source, observation time, relevant excerpt or screenshot, and the step at which it was obtained. UI evidence links open a captured record or an appropriately labeled original source; they must not imply that revisiting a changed live URL reproduces the captured observation.

## 10. Investigation boundaries

Treat messages, webpages, attachments, and retrieved instructions as untrusted input. Run browser work in isolated environments with least-privilege tools and enforced navigation restrictions. Sandbox isolation alone does not prevent prompt injection.

- Never expose provider keys, OAuth tokens, application secrets, or database credentials to pages or generated parsing code.
- Never copy the user's browser session or mailbox credentials into Daytona.
- Stop before real payments, identity uploads, account grants, logins, or other consequential submissions.
- Do not bypass authentication, CAPTCHA, permission prompts, or site restrictions.
- Validate navigation and redirects; block internal infrastructure and credential-bearing or action-triggering URLs according to the tool policy.
- Do not execute downloaded software. Synthetic interactions are allowed only on controlled fixtures explicitly configured for that purpose.
- Keep user data and screenshots private. Redact sensitive values from logs and minimize captured page context.

## 11. Delivery workflow and ownership

The coding agent starts immediately from the empty repository. Missing API keys are not a reason to delay scaffold, contracts, the complete UI, fixture adapters, migrations, tools, or automated checks that can run without those keys.

| Stage | Agent completes | Human intervention |
| --- | --- | --- |
| D0 — Scaffold | Workspace, packages, commands, shared contracts, environment template, labeled fixture mode, and a runnable page. | Only if repository access is actually unavailable. |
| D1 — Full interface | Required pages, visual system, components, interaction states, extension shell, and visual review evidence. | Review a concrete running interface; resolve material product ambiguity. |
| D2 — Implementation | Database migrations, API, queue, connector adapters, investigator tools, evidence/version handling, and targeted tests. | None for ordinary implementation choices. |
| D3 — Connection readiness | Working OAuth callback, precise credential fields, provider probes, and deployment configuration. Continue all independent work. | Supply missing keys, authorize accounts, install the extension, or resolve provider permissions when these actually block a real test. |
| D4 — Live integration | Connect real services, repair failures, verify automatic ingestion and investigation, and collect acceptance evidence. | Perform necessary account-owner confirmation or browser-only steps. |
| D5 — Review and release | Fix review findings, deploy within authorized access, run acceptance checks, and prepare the demonstration. | Evaluate usability and complete platform actions that require the owner. |

A human handoff must name the blocker, show what is already complete, state the exact action and fields, and explain how the agent will verify success. Never ask the owner to debug an SDK or write code on the agent's behalf. Do not disclose secrets in reports. Actual payments, permission expansion, external communication, and destructive changes follow the owner's existing authorization and available access controls.

## 12. Acceptance criteria

MINIMUM passes only when the real integration gates pass; credential-free scaffold success is a distinct milestone.

| ID | Verification and required outcome |
| --- | --- |
| AC-01 | A fresh checkout starts in labeled demo mode without production credentials. Missing integrations are visible; no secret values are logged. |
| AC-02 | Every required UI surface works with its loading, empty, failure, and disconnected states. No dead primary buttons or marketing filler. |
| AC-03 | Desktop and narrow viewport review confirms readable cards, accessible controls, working dialogs, and no essential horizontal overflow. |
| AC-04 | With the dashboard closed, a newly received authorized Gmail message is ingested and investigated by the worker. Reopening shows persisted results. |
| AC-05 | A supported authorized page automatically creates or updates a case through the extension. Unsupported sites do not imply active protection. |
| AC-06 | A live run records Claude model identity, Factory execution, and Daytona evidence. A prewritten verdict cannot substitute for this chain. |
| AC-07 | SC-01 through SC-08 produce the required behavior; each material finding links to the evidence that supports it. |
| AC-08 | SC-02 adds a version to the same case. The unresolved conflict remains visible and history is inspectable. |
| AC-09 | Duplicate source delivery creates no duplicate case or duplicate applied assessment. An out-of-order old run cannot overwrite a newer revision. |
| AC-10 | Refresh and realtime reconnect preserve persisted cases and recover missed updates without resetting the user's current review. |
| AC-11 | Marking Viewed changes only user handling state, never the judgment or verification outcome. |
| AC-12 | Tool failure or blocked access yields explicit limited/failed behavior; no fabricated evidence or unchecked normal result. |
| AC-13 | Cross-user API, screenshot, and realtime access are rejected. Gmail disconnect stops new sync jobs and clears/revokes credentials as supported. |
| AC-14 | SC-09 cannot obtain secrets, invoke forbidden submissions, or redirect tools to internal services. Validate this with a controlled fixture. |
| AC-15 | A worker restart can recover or safely retry unfinished work; successful completion cleans up its temporary execution resources. |
| AC-16 | Changing a controlled page's material terms changes captured evidence and produces a fresh assessment rather than replaying a canned result. |

FULL additionally requires demonstrated recovery from missed Gmail notifications, reliable cross-source linking with ambiguity handling, scoped action-time guidance, retention/deletion behavior, and an actual Chalk evaluation report with dataset/version provenance. Acceptance reports state what passed, failed, or remains blocked and include reproducible steps. They must not call untested integrations complete.

## 13. Three-minute demonstration

- **0:00–0:30:** Open the populated dashboard. Show the three judgments and one concise rental finding. Identify controlled demo data with the compact mode label.
- **0:30–1:10:** Trigger a new test message through the connected Gmail account. Show the background investigation, a real Daytona observation, and the resulting action card. If a run is slow, inspect the existing case while its actual progress remains visible.
- **1:10–1:50:** Open rental evidence and follow the observed path from one-time fee to recurring terms. Show the supported browser panel before the next consequential action.
- **1:50–2:30:** Introduce the follow-up claiming membership is optional. Show it update the same case, preserve the conflict, and create a new assessment version.
- **2:30–3:00:** Show a normal case and a limited investigation to demonstrate calibrated behavior. Explain Claude reasoning, Factory runtime execution, and Daytona isolation using actual run records.

Prepare resettable fixtures and a clearly labeled recorded fallback if a live provider is unavailable. Never present a recording or simulated event as a live provider response.

## 14. Sponsor and track alignment

Digital Trust alignment comes from automatically identifying consequential requests, inspecting what happens next, preserving evidence, and giving users actionable choices about money, identity, account access, and downloads.

Factory performs real runtime investigation through its SDK; the README must explain its role and point to implementation and a run example. Daytona supplies the actual isolated browser execution that produces evidence. FULL uses Chalk for executed evaluations and visible quality measurements. These are implementation commitments based on the challenge text supplied by the owner, not a claim that every event-wide eligibility rule has been independently verified. Other sponsor integrations are outside the committed scope.
