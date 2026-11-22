# QA M4 — Navigation, Threads, Peek, Goal row, RECIPE.md (qa-m4)

## Summary

**CHANGES_REQUIRED.** Navigation, Threads, Peek, Goal row, composer, status bar, install migration and RECIPE.md all work, and every check passes. Two major findings block: thread Conversation draws contract JSON as body text (Fix row "raw machine text" is back, on the page that replaced Board), and the Library sub-tabs are each over their own M1 baseline, hidden because the audit compares each one against the sum of three pages.

## Changes

None (review only). Report file only.

## Findings

1. **[major] Thread › Conversation draws contract JSON at body size — `mods/bot-herdr/threads.js:456-457`, `mods/bot-herdr/threadview.js:180-181`.**
   - Expected (spec Principle 6, Fix row "Contract JSON on Board"): machine text is one muted mono line that expands (`machineLine`/`toggleMachine` in `machinetext.js`, which the old Board used).
   - Observed: `leadLine()` folds the JSON to one line, and `entry()` draws it in `TYPE_SCALE.body` / `textPrimary` / UI font. Expanding it draws the full JSON wrapped at body size. Shot `shots/m4/thread-conversation-paper.png`: `{ "command": "ui-audit", "exit": { "pass": false }, "failures": [...] }` as the entry's body line.
   - Why the audit says `rawMachineText 0`: `looksMachine()` skips any text under a `truncate` ancestor (`engine/lib/ui-audit-spec.mjs:415`), and the entry line is `truncate()`. That rule was there before M4, but this is how the regression slipped through.
   - Fix: in `threadview.js` mark an entry `machine: true` when its body is JSON, a stack trace or a path (reuse the same test as `looksMachine`, or a shared helper in `machinetext.js`). In `threads.js` `entry()`, draw `machineLine(c, { id, text: e.text, expanded: open, onToggle })` for those entries instead of the body div. Then tighten `looksMachine` so a truncated *body-size, non-mono* line still counts (the exemption should apply only to mono/muted text), and add a fixture assertion that `thread-conversation` reports 0.
2. **[major] Each Library sub-tab draws more than the M1 page it replaces; the audit hides this — `mods/bot-herdr/engine/lib/ui-audit.mjs:276-279`.**
   - Expected (brief item 6; criterion `visibleElements < M1 baseline`): a new page is compared with the M1 baseline of the page it replaces.
   - Observed: `REPLACES` maps every `library-*` page to `knowledge + learning + issues`, a 308 ceiling. Only one sub-tab shows at a time, and each is above its own predecessor: library-knowledge **151 vs knowledge 142**, library-learning **79 vs learning 71**, library-issues **104 vs issues 95**. (`/tmp` audit run, below.) Every other new page is under its own predecessor (home 152<167, threads 77<268, thread-conversation 89<187 board, peek 127<167, settings-usage 137<194).
   - Fix: map 1:1 (`library-knowledge: ["knowledge"]`, `library-learning: ["learning"]`, `library-issues: ["issues"]`, `library-scripts: ["knowledge"]` or the smallest of the three), then trim about 10 elements per sub-tab. The sub-tab strip adds roughly that much. Candidates: Knowledge's lone refresh icon row above the search bar, and the per-card edit/delete icon pair (shown on hover/focus or in the peek).

Minor / info (do not block):

3. **[minor] Home goal rows show a glyph with no state word** (● "Redesign the task board", ‖ "Answer the plan question", `home-graphite.png`). Agent rows say "Working"/"Idle". Spec: glyph + colour + word.
4. **[minor] Sub-tab and segmented selection draw a filled pill *and* an underline** (thread sub-tabs, Library strip, Settings sections, `thread-steps-graphite.png`). The audit counts one signature (`accent-outline+accent-text`), but to the eye it reads as two idioms. Worth a look in M5.
5. **[minor] The Library strip is left-aligned at the page edge while its content sits in the centred column** (`library-knowledge-paper.png`). Threads and Settings centre theirs.
6. **[info] Stray `data/bot-herdr/logs/ui.jsonl` (brief item 7).** No test in today's suite writes it: a full `npm test` run left no `data/bot-herdr` in the tree. All four suites that reach thread code (`thread-model`, `home`, `pre-m1-foundation`, `render-resilience`) set `BH_APP_HOME` to a temp dir. The 08:59 write matches `qa-m3.md` (written 08:59, line 13/31). That QA ran `bh home --json` / `bh thread list --json` against a corrupt temp project through the repo's own engine (`node mods/bot-herdr/engine/bh.mjs`) without `BH_APP_HOME`. The mod is not the cause: it calls the installed engine (`mods/bot-herdr/bh.js:10`).
   - Root cause: `engine/lib/core.mjs:16`. `APP_HOME` defaults to `resolve(ENGINE, "../../..")`, which is the checkout root when the engine runs from a repo. So `logSkipped` (`engine/lib/thread.mjs:38`) writes `<repo>/data/bot-herdr/logs/ui.jsonl`.
   - Fixes: (a) in `core.mjs`, use the engine-relative home only when it looks like a herdr app home (e.g. has `settings.json` / `layouts/`, no `package.json`), else `HERDR_APP_HOME` or `~/.config/herdr-app`; (b) add `data/bot-herdr/logs/` to `.gitignore`; (c) the QA/dev brief note: run the repo engine with `BH_APP_HOME=$(mktemp -d)`.
7. **[info] Unattributed:** the working tree shows the tracked `data/bot-herdr/**` samples deleted (`git status`: activity, briefs, sessions, replies, models…). This task's workers did not record the deletion. It does not break any check (suite green); the Orchestrator should ask the user.
8. **[info] Pushbacks from dev-m4b accepted as reasonable:** Clear = `bh goal stop` with a confirm; Edit prefills an amendment; at rest the composer hides Stop. Peek reply goes straight to the agent with no brief. Worth a user decision, not a defect.

## Brief Check

1. **5 destinations, Home first, sub-tabs** — met. Audit `topLevelDestinations 5`. Layout pages are home/threads/agents/library/settings with `active: home` (install output, ids listed below). Agents is `Fleet | Terminals`, Library is `Knowledge | Learning | Scripts | Issues`, and Settings has Usage (shot `settings-usage-paper.png`). Home puts Needs you on top and the fleet below (`home-graphite.png`).
2. **Threads, peek, goal row, composer, status bar** — met. Threads has the list, the breadcrumb, Conversation | Plan | Steps | Changes, and the pinned Orchestrator (`peek-graphite.png`, `thread-steps-graphite.png`). The peek drawer has numbered option cards 1–2 and an inline Reply/Send. The goal row sits above the one-line composer (`thread-conversation-paper.png`). The status bar shows machine, agent count and palette key. Audit features `threads`, `goalRow`, `peek`, `homeNeedsYou` and `liveSummary` are present.
3. **Nothing lost** — met, apart from the regression in finding 1. I walked the dev-m4a/m4b tables:
   - Orchestrator chat → Threads pinned.
   - Tasks, steps and board → Thread list, Steps and Conversation.
   - Plans: plan doc → Thread › Plan → Open plan (`plandoc.js` sheet with comments and "Start ▾": task or Goal, `plandoc.js:42,90,97`). New plan → `/plan` in the composer (`route.js:11`). The old rail "New plan" button (`work.js:2267`) is only reachable through the old `plans` view, which no destination shows any more. That is acceptable via `/plan`, but the empty Threads state could offer it.
   - Issues bundling/triage → Library › Issues (same view, `issues.js:337`).
   - Knowledge, Learning → Library. Metrics → Settings › Usage. Settings sections are unchanged.
   - Terminals → Agents › Terminals. Files → thread Files button. Changes → Thread › Changes plus Open diff.
   - Status strip: needs-you count → Home header; palette hint → status bar.
4. **install migrates non-destructively with backup** — met. A copy of the real `~/.config/herdr-app/layouts/bot-herdr.json` in temp `HERDR_APP_HOME=/tmp/qa-m4-inst.ny5X`:
   - Install wrote the 5-destination layout. The theme `{light: bot-herdr-light, dark: bot-herdr-dark}` was carried. Old ids (`tabs, chat, tasks, plans, …, metrics, panel, files, changes`) were replaced by `stage, pages, home, threads, agents, library, settings, terminals, agents-tabs, panes`.
   - The `.bak` is byte-identical to the original (`cmp`).
   - A second install printed "is current" and wrote nothing. The live layout was never touched.
5. **RECIPE.md follows the AGENTS.md recipe spec** — met. Order is `# Name`, paragraph, `![…](preview.png)`, What you see (with a Tokens table matching `look.js` light/dark values, type/space/radius, states, agent hues), How it behaves, Built from, Watch out, Done when. `preview.png` is present. Themes are documented (`RECIPE.md:69-70`).
6. **Audit not loosened** — **not met**, see finding 2. `baselineCeiling` is otherwise sound: there is no fresh baseline, `ui-audit-baseline.json` is unchanged, and `ui-audit-spec.mjs` is unchanged. P1 features are detected from rendered ids (`bh-thread-tabs-*`, `bh-goal-row`, `bh-peek`, `bh-answer-card-*`), not asserted. The `ui-audit-shots.mjs` change is a rendering fix only.
7. **ui.jsonl in the repo** — found and fixes listed (finding 6). It was a QA probe through the repo engine, not a suite test.
8. **Warm theme** — met, by reasoning (the shot stage has no theme flag: `KEY_THEME_NAMES` is fixed, `ui-audit-shots.mjs:21,37`). `palette()` returns the hand-set `DARK`/`LIGHT` pair for `bot-herdr-*` themes (`look.js:408`, `ownTheme`). Those are the warm charcoal values (`#262624` ground, `#30302e` fill, `#e1987e` coral, `look.js:128-147`), identical to `themes/bot-herdr-dark.json` canvas/surface. The audit's 16-theme contrast includes `bot-herdr-dark`/`-light` with 0 failures. New views draw only `c.*` tokens (`hexOutsideTokens 0`), so the warm pair applies unchanged.
9. **Checks** — all ran myself, all pass (Verification).

## Rubric (1–5; P7 and animations are M5, noted, not scored)

| Page | P1 needs-you first | P2 one accent | P3 hide empty | P4 summary→detail | P5 agent colour | P6 machine folded | Keep traits |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Home | 5 | 5 | 4 | 5 | 5 | 5 | 4 (goal rows lack state word) |
| Threads list | 5 | 5 | 5 | 5 | 5 | 5 | 5 |
| Thread › Conversation | 4 | 5 | 4 | 4 | 5 | **2** (contract JSON at body size) | 4 (typed entries kept) |
| Thread › Plan | 4 | 4 | 4 | 4 | 5 | 4 | 4 |
| Thread › Steps | 4 | 4 | 4 | 4 | 4 | 4 | 4 |
| Thread › Changes | 4 | 5 | 4 | 4 | 5 | 4 (branch folded) | 4 |
| Agents › Fleet | 4 | 5 | 4 | 4 | 5 | 5 | 5 |
| Agents › Terminals | 4 | 5 | 5 | 4 | 5 | 5 | 4 |
| Library › Knowledge | 4 | 4 | **3** (151 > 142 M1 elements; per-card icon pairs, stray refresh row) | 4 | 4 | 4 | 4 |
| Library › Learning | 4 | 4 | **3** (79 > 71) | 4 | 4 | 4 | 4 |
| Library › Scripts | 4 | 5 | 4 | 4 | 5 | 4 | 4 |
| Library › Issues | 4 | 4 | **3** (104 > 95) | 4 | 4 | 4 | 4 |
| Settings + Usage | 4 | 4 | 4 | 4 | 4 | 4 | 4 |
| Peek drawer | 5 | 5 | 4 | 5 | 5 | 4 | 5 (choice cards, cost in reach) |

Cells below 4 come from findings 1 and 2; fixing those two lifts them. Noted for M5: `keyboardPathCoverage 0.91`, `accessibleLabelCoverage 0.88` (thread-chat composer controls, Knowledge icon buttons). Phone path and animations were not reviewed.

## Verification

- `node_modules/.bin/tsc --noEmit -p mods/bot-herdr/jsconfig.json` — exit 0, no findings
- `npm test` — 656 tests, 655 pass, 1 skipped, 0 fail (exit 0)
- `node mods/bot-herdr/engine/bh.mjs check` — `PASS: 655 tests pass, 1 skipped, typecheck passes` (Ran: 0 lint, 1 typecheck, 656 tests), exit 0
- `/home/athi/.local/bin/herdr-app check mods/bot-herdr` — `check passed`, exit 0; generated `gpui-kit.d.ts` deleted (confirmed absent)
- `node mods/bot-herdr/engine/bh.mjs ui-audit --json` — exit 0, `pass:false` only on M5/M6-scheduled items (keyboardPathCoverage 0.91, accessibleLabelCoverage 0.88, features approvalCard/diffReview/viewModes). Fix counters all at target, hex 0, renderErrors 0, 16/16 themes contrast-clean, destinations 5, P1 threads/goalRow/homeNeedsYou/liveSummary/peek present. Per-page elements as quoted in finding 2.
- `HERDR_APP_HOME=/tmp/qa-m4-inst.ny5X node install.mjs --skip-tools` (copy of the real layout) — exit 0, migrated, backup identical (`cmp`), repeat install "is current"
- Shots inspected: `shots/m4/` home-graphite, thread-conversation-paper, peek-graphite, library-knowledge-paper, thread-steps-graphite, settings-usage-paper
- No new tests written: finding 1 needs a fix first, and its regression guard belongs in the audit fixture (proposed in the fix).

## Knowledge Proposals

- Running the repo's own engine (`node mods/bot-herdr/engine/bh.mjs …`) without `BH_APP_HOME` writes DATA (logs, replies) into `<repo>/data/bot-herdr`. The mod itself uses the installed engine (`bh.js:10`), so only direct repo-engine runs leak.
- `bh ui-audit`'s `looksMachine` exempts any text under `truncate`, so a truncated body-size JSON line is not counted as raw machine text.

## Pushback

**Request:** compare Library sub-tabs against the sum of Knowledge + Learning + Issues.
**Reason:** only one sub-tab is visible at a time. The sum lets each grow up to 2–4× its predecessor and hides real growth (finding 2).
**Alternative:** map each sub-tab 1:1, with Scripts against the smallest predecessor.
