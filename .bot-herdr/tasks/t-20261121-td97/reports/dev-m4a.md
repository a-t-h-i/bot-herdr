# M4a — Navigation shell: 5 destinations, Home, Agents, Library, Settings › Usage (dev-m4a)

## Summary

The top bar is the design's five destinations (Home, Threads, Agents, Library, gear for Settings),
Home opens by default with what-needs-you first and the fleet below it, Agents has Fleet | Terminals
over herdr's own panes, Library holds Knowledge | Learning | Scripts | Issues, and Settings has a
Usage section holding the Metrics view. The layout migrates non-destructively on install, every new
page draws inside the render-safe boundary, and the audit now covers all 20 pages (10 new) with
`topLevelDestinations = 5` and every Fix-table counter at target.

## Changes

| File | What changed |
| --- | --- |
| `mods/bot-herdr/pages.js` | The five destinations (`PAGES`), the outer `stage` stack (`STAGE`: destinations or herdr's terminals), the sub-tab memory (`SUB`, `subOf`, `setSub`), `viewShown(id)` for a view that lives in a sub-tab, `showPage` mapping every old view name to where it lives now, `showAgentsTab`, `showSettings(section)`, `openThread(id)` (the M4b seam). |
| `mods/bot-herdr/switch.js` | The top bar: 4 labelled destinations + an icon-only gear (role tab, accent underline, `accessibility_label("Settings")`, tooltip) and the window buttons where the system draws none. The tabs strip, its More/overflow path and the tab-fit code are gone; a tab press stops the window drag. |
| `mods/bot-herdr/home.js` (new) | Home: header count, "Needs you" (questions, blockers, approvals, untriaged issues), "Review first", "Running" (agents with their one-line summary, Goals with gate + spend), today's spend; skeleton rows while reading; teaching empty state; J/K/Home/End + Enter (`rowkeys.js`), rows keyed by thread/agent/task id. |
| `mods/bot-herdr/agents.js` (new) | Agents: `Fleet | Terminals` strip; Fleet is the calm list (avatar, name, the line it is on, state glyph + word, age; harness/model stay in the peek), Enter/click opens that agent's terminal; in the Terminals stage the same view draws only the strip above herdr's panes. |
| `mods/bot-herdr/library.js` (new) | Library: `Knowledge | Learning | Scripts | Issues` strip, composing the existing `Work` (knowledge fixed), `Learning`, `Issues` views unchanged plus the new `Scripts`; a sub-view that throws draws its own fallback line, not the page. Follows a sub-tab another view points it at (`showPage("issues")`). |
| `mods/bot-herdr/scripts.js` (new) | Library › Scripts: `bh scripts list` as rows (name in the code face, purpose, `project` only for the project's own, Copy of `bh scripts run <name>` with a 1.5 s "Copied"), skeletons, empty state. |
| `mods/bot-herdr/threads.js` (new) | Threads: the Orchestrator's chat, unchanged, inside the page's own render-safe boundary, until M4b's thread view replaces its body. |
| `mods/bot-herdr/rowkeys.js` (new) | Pure list keyboard rules: `keyName`, `nextPick` (J/K and arrows, wrapping; Home/End), `opensRow` (Enter), `isChord`. |
| `mods/bot-herdr/settings.js` | `Usage` section holding the Metrics view (window picker, hero numbers, details on demand) drawn as its own page under the tabs; the section is remembered and published (`setSub`) so `viewShown("metrics")` works; `/settings` lands on Agents. |
| `mods/bot-herdr/main.js` | Views registered: `home`, `threads`, `agents`, `library`, `scripts`. |
| `mods/bot-herdr/chat.js`, `toast.js` | The page is `threads` now (composer focus on return, toasts handed to the chat). |
| `mods/bot-herdr/issues.js`, `learning.js`, `metrics.js`, `work.js` | Their "am I on screen" checks use `viewShown(...)`, which resolves the destination and, for a view in a sub-tab, that sub-tab. |
| `mods/bot-herdr/composer.js` | `/settings` opens Settings › Agents (`showSettings`). |
| `layouts/bot-herdr.json` | The new structure: top bar = the switch block only (no herdr `tabs` strip); `work-body` = `stage` stack of `pages` (5 destinations) and `terminals` (`agents-tabs` strip + herdr's pane block); the Files/Changes panel is gone. |
| `install.mjs` | `installLayout({ file, target, force })` (exported, tested) + `runInstall` uses it: no file → written; installed → `migrateLayout` + timestamped `backupLayout`; `--force` → replaced, still backed up; already current → writes nothing. `panelBesidePages` removed. |
| `mods/bot-herdr/engine/lib/ui-audit-fixtures.mjs` | 10 new audit pages with fixtures and seeds (`bh home`, `bh scripts list`, the thread row); `prepare()` clears the sub-tab state so a page cannot be changed by the page rendered before it. |
| `mods/bot-herdr/engine/lib/ui-audit.mjs` | `REPLACES` + `baselineCeiling`: a new page is compared with the M1 baseline of the page(s) it replaces (summed when it takes over several), never a fresh number. |
| `mods/bot-herdr/engine/lib/ui-audit-shots.mjs` | The shot wrapper re-prepares per render (same determinism reason). |
| `mods/bot-herdr/icons/` | `page-home.svg`, `page-library.svg` (nav), `window-minimize.svg`, `window-maximize.svg` (window buttons; close reuses `x.svg`). |

### Where every old destination lives now (nothing removed)

| Before | Now |
| --- | --- |
| Top bar: 9 page tabs + herdr's `tabs` strip | Top bar: Home, Threads, Agents, Library + a gear for Settings (5 destinations, accent text + 2 px underline) |
| Chat / the Orchestrator chat | **Threads** — the same chat view, unchanged, until M4b's thread view |
| Terminals page | **Agents › Terminals** — the same native `{ "tab": "active" }` pane stage, with the Fleet \| Terminals strip above it |
| Tasks (list, steps, board, comments, plan tab) | **Threads** (`showPage("tasks")` → Threads; the views stay in the mod and are still audited until the thread view lands) |
| Plans (rail, questions, draft, start as task/Goal) | **Threads** (same) |
| Issues (browser + bundler) | **Library › Issues** — the same view |
| Knowledge | **Library › Knowledge** — the same view |
| Learning | **Library › Learning** — the same view |
| — | **Library › Scripts** (new: `bh scripts list`, Copy of `bh scripts run <name>`) |
| Metrics | **Settings › Usage** — the same Metrics view, quiet |
| Settings › Agents | **Settings (gear) › Agents** — the same cards |
| Settings › General / Resilience / Harnesses | **Settings › General / Resilience / Harnesses** (unchanged) |
| Files panel (herdr `files` block) | No longer a layout panel or destination: the Files mod still opens as a window from the palette (`mod.open files`); M4b adds the thread button |
| Changes panel (herdr `changes` block) | Inside each thread's Changes sub-tab (M4b); the `changes` mod is untouched |
| Notification toasts (root `toast`) | unchanged |
| Status bar (herdr's `workspace-status`) | unchanged (the slim status bar is M4b) |
| ctrl+shift+m → `bot-herdr.focus` | unchanged: opens Threads and puts the keyboard in the composer |
| `/settings` | Settings › Agents (its documented job: harness, model, effort) |
| `/task`, `/plan`, a task or issue link → Chat/Tasks/Plans | all open Threads; the shared `OPEN_TASK` id is still set for M4b's thread view |

Notes: "Plan, Steps, board" and "Changes" are the M4b thread view's content; the views and read
models behind them are untouched here, and the old audit pages keep covering them.

### M1 baseline mapping for the new pages

`REPLACES` in `mods/bot-herdr/engine/lib/ui-audit.mjs`; a new page's ceiling is the sum of the M1
baseline(s) of the page(s) it replaces. No baseline was written.

| New page | Compared with | Ceiling | Today |
| --- | --- | --- | --- |
| home | tasks (the "everything running + what needs you" overview it replaces) | 167 | **152** |
| threads | chat (it *is* the chat view until M4b) | 41 | **40** |
| agents-fleet | tasks (the only audited page that listed live agents, per task) | 167 | **60** |
| agents-terminals | switch (the old Terminals destination had no body spec — the bar was all that was audited; herdr's panes have no spec tree) | 29 | **6** |
| library-knowledge | knowledge + learning + issues (one Library destination holds all three) | 308 | **151** |
| library-learning | " | 308 | **79** |
| library-scripts | " (Scripts is new inside the Library) | 308 | **50** |
| library-issues | " | 308 | **104** |
| settings | settings (its own baseline; the section adds the Usage tab) | 292 | **258** |
| settings-usage | metrics (moved inside Settings) | 194 | **137** |
| the retained pages | their own M1 baseline | chat 41, tasks 167, tasks-board 187, plans 101, issues 95, knowledge 142, learning 71, metrics 194, settings-general 110, switch 29 | chat 40, tasks 163, tasks-board 182, plans 100, issues 92, knowledge 139, learning 67, metrics 116, settings-general 108, switch 17 |

`agents-terminals` records the mod chrome only (the Fleet | Terminals strip); the pane area is
herdr's native terminal block, as the brief allows.

## Brief Check

1. **Top bar: exactly 5 destinations, Home first, tabs strip and Files/Changes/Orchestrator gone** —
   met. `switch.js` draws Home, Threads, Agents, Library + an icon-only gear (`aria_selected`,
   accent underline, `accessibility_label("Settings")`, 29 px tall); `layouts/bot-herdr.json` has no
   `tabs` block, no `panel`, and the pages stack is exactly those five blocks with `"active": "home"`.
   Audit: `topLevelDestinations 5`. Nothing is lost — see the table above.
2. **New `layouts/bot-herdr.json`, `migrateLayout` + `backupLayout` wired into `runInstall`, tested
   over a fixture old layout (including `"metrics"`)** — met. `installLayout` is tested over the old
   eleven-destination layout: five destinations + a page of the user's own, Home active, their rail
   width / switch width / top bar height / theme carried, a timestamped backup holding the old file,
   and a repeat install writing nothing (test "installLayout: an installed layout (with metrics)
   becomes the shipped one, backed up"). Verified end to end too: `HERDR_APP_HOME=/tmp/… node
   install.mjs --skip-tools` over an old layout printed `layout … (your old one is kept as
   bot-herdr.json.20261122T074709Z.bak)` and wrote the five destinations.
3. **Home (`home.js`) reads `bh home --json`** — met. "Needs you" then "Review first" (questions,
   blockers, QA reviews, approvals, untriaged GitHub issues) then the fleet (agents with a one-line
   summary, Goals with gate and spend) and today's spend (`$1.82 · 58.3M tokens · 5 turns · 1h 58m`);
   header "3 running · 5 need you"; thread rows per Components › Thread row and agent rows per Agent
   row (harness/model stay in the peek); skeleton rows in the final layout while reading, never a
   spinner; the empty state teaches and offers Threads. Audit `home` 152 elements (< 167).
4. **Agents with `Fleet | Terminals`** — met. Fleet is a full-width list (avatar, name, state glyph +
   word, one-line summary, age), Enter or a click opens that agent's terminal; Terminals is herdr's
   native pane stage with the same strip above it (its block is `agents-tabs` in the layout).
   Harness/model are not in the row (peek is M4b).
5. **Library with `Knowledge | Learning | Scripts | Issues`** — met. The Issues browser/bundler and
   the Knowledge and Learning views are reused in full; Scripts is new. Each sub-tab mounts once, keeps
   its own state, and draws only while it is the one showing (`viewShown`).
6. **Settings behind the gear with a Usage section holding the Metrics view** — met. Five sections
   (Agents, General, Usage, Resilience, Harnesses); Usage draws the Metrics view with its window
   picker and hero numbers, details on demand; `bh metrics` is read once per Settings mount.
7. **Render-safe boundary, tokens only, one accent action, keyboard-focusable rows keyed by stable
   ids, role/label on interactive elements** — met. Home, Agents, Library and Threads wrap their body
   in `safeRender` with a fallback line; all colours come from `c.*` tokens (audit
   `hexOutsideTokens 0`); accent buttons per view ≤ 1 (audit max 1, Home/Agents/Scripts 0); rows are
   keyed `bh-home-need-<thread|ref>`, `bh-home-thread-<id>`, `bh-home-agent-<address>`,
   `bh-home-goal-<task>`, `bh-agent-row-<address>`, `bh-script-<name>`, with `role("list_item")`,
   `accessibility_label` and `aria_selected`, and the lists take J/K/Home/End/Enter on a
   `track_focus` handle; sub-tab strips are `role("tab_list")` / `role("tab")` with
   `set_position(i, n)` and `aria_selected`.
8. **The audit extended to the new pages, compared with the pages they replace** — met. `AUDIT_PAGES`
   now has 20 pages (home, threads, agents-fleet, agents-terminals, library-knowledge,
   library-learning, library-scripts, library-issues, settings, settings-usage + the 10 views those
   replace, still audited); `REPLACES` maps each new page to its M1 baseline(s), stated above; no
   baseline file was written.
9. **Tests that pin the old order updated, never deleted or skipped** — met (see Test changes).

## Verification

- `node_modules/.bin/tsc --noEmit -p mods/bot-herdr/jsconfig.json` — exit 0, no findings
- `node mods/bot-herdr/engine/bh.mjs check` — `PASS: 645 tests pass, 1 skipped, typecheck passes`
  (`Ran: 0 lint, 1 typecheck, 646 tests`)
- `npm test` — 646 tests, **645 pass**, 1 skipped, **0 fail**
- `/home/athi/.local/bin/herdr-app check mods/bot-herdr` — `check passed: mods/bot-herdr` (the
  generated `mods/bot-herdr/engine/lib/gpui-kit.d.ts` deleted afterwards)
- `node mods/bot-herdr/engine/bh.mjs ui-audit --json --shots .bot-herdr/tasks/t-20261121-td97/shots/m4a`
  — exit 0, 20 pages, 80 PNGs (graphite, paper, ink, moss × every page), `renderErrors {}`

### Audit counters

| Counter | Value | Target |
| --- | --- | --- |
| topLevelDestinations | **5** | 5 |
| zeroCountChips | **0** | 0 |
| repeatedDefaultStrings | **0** | 0 |
| statsPerCard | **1** | 1 |
| selectionStyles | **1** | 1 |
| rawMachineText | **0** | 0 |
| decorativeIcons | **0** | 0 |
| agentColourFills | **0** | 0 |
| hexOutsideTokens | **0** | 0 |
| accentButtonsPerView | **1** | ≤ 1 |
| renderErrors | **0** | 0 |
| contrast | **16 / 16 themes clean** | all |
| keyboardPathCoverage | **0.92** | 1 (M5) |
| accessibleLabelCoverage | **0.84** | 1 (M5) |
| P1 features | goalRow, homeNeedsYou, liveSummary present | all (M4b/M6 add threads, peek, approval card, diff review, view modes) |

Remaining audit findings (all scheduled, none from this step's pages): `keyboardPathCoverage 0.92`
and `accessibleLabelCoverage 0.84` (M5 — the gaps are the chat feed/box controls, the Knowledge
view's icon buttons and the segmented-control containers, all pre-existing), and the five P1 features
that M4b (`threads`, `peek`) and M6 (`approvalCard`, `diffReview`, `viewModes`) add.

### Shots

`.bot-herdr/tasks/t-20261121-td97/shots/m4a` — 80 PNGs. Looked at home (graphite/paper/moss),
agents-fleet (paper), agents-terminals (graphite), library-knowledge (ink), library-learning
(graphite), library-scripts (moss), library-issues (paper), settings-usage (paper/ink/graphite) and
threads (graphite) in the four themes: warm surfaces, one coral selection (accent text + underline),
state glyph + word on every row, no filled chips or decorative icons, the sub-tab strips calm and the
gear icon-only at the right.

## Test changes

| File | Change |
| --- | --- |
| `test/learning-view.test.mjs` | The 9-page order asserts the five destinations in top-bar order in `pages.js`; Learning's "right after Knowledge" moves to `library.js`; the layout asserts no `tabs` block, the switch filling the bar, the five pages with Home active, and the `stage → pages | terminals` structure. |
| `test/issues-view.test.mjs` | The real-layout guard asserts the five destinations and that Issues lives in `library.js` (was "right after plans"). |
| `test/chat-ui.test.mjs` | work.js's poll guard now matches `viewShown(...)` (its import too) instead of `activePage() ===`. |
| `test/ui-audit.test.mjs` | The shot plan's first page is Home; checks `library-issues` and `settings-usage` shots; keeps a replaced page (`tasks-board`) in the plan. |
| `test/goal-ui.test.mjs` | The GPUI static guard list gains `home.js`, `agents.js`, `library.js`, `scripts.js`, `threads.js`, `rowkeys.js`. |
| `test/install.test.mjs` | New: `installLayout` over the old layout with `"metrics"` → five destinations + the user's own page, Home active, no tabs strip, stage intact, their sizes/theme kept, a timestamped backup of the old file, a repeat install writing nothing; plus created / unreadable-target / `--force` paths. |
| `test/rowkeys.test.mjs` (new) | `nextPick` (J/K/arrows wrap, Home/End, empty list, pick past the end), `opensRow`, `isChord`, `keyName`. |

No test was deleted, skipped or loosened. `test/store.test.mjs`'s "thirty rounds of two writers"
lock-timing test timed out once under full-suite load (pre-existing, untouched by this step); it and
the final full runs pass.

## Seams left for M4b (Threads, Peek, Goal row, Composer, Status bar)

- **`threads.js`** owns a `Chat` instance today; its `render` is the place the thread list/detail
  (Conversation | Plan | Steps | Changes), the peek drawer, the goal row and the single-line composer
  go. `pages.js`'s `openThread(id)` is the one entry point rows use (Home, Agents, the chat's task
  links): it takes the id already, and currently opens Threads; the shared `OPEN_TASK` value is still
  set by the chat's task widget and issue links.
- **`pages.js`**: `WHERE` maps every old view name to its destination+sub-tab, so `/task`, `/plan`, an
  issue → task link and `wakeGoal` keep working; `SUB`/`subOf`/`setSub` is the sub-tab memory (a view
  publishes what it shows, another view's `showPage` sets it, and a page with a `publishedSub`/`published`
  guard adopts only changes made elsewhere); `viewShown(id)` is how a view in a sub-tab knows it is the
  one on screen (use it for new polling the same way).
- **Agents**: the terminals stage is `stage → terminals` in the layout (`agents-tabs` strip block,
  40 px, over `panes`); Fleet rows already navigate with `rowkeys.js` (`nextPick`/`opensRow`) and
  `openTerminal(address)`; Space-to-peek and `Esc` are free to bind on the same focus handle.
- **Home/Agents rows**: `rows()` returns `{ id, open }` in draw order (Home) and the agent list is
  `fleet.agents` — the peek drawer can hang off the same pick index.
- **Library**: `library.js` mounts `Work({tab:"knowledge"})`, `Learning`, `Scripts`, `Issues` once
  each; anything the thread view needs to reach from Library can be added as a sub-tab there.
- **Audit**: `REPLACES` maps each new page to the M1 page(s) it replaces; `AUDIT_PAGES` +
  `ui-audit-fixtures.mjs` seeds are where the thread page, peek and goal row get their pages; the
  fixtures' `prepare()` resets the sub-tab state per page so seeds stay deterministic.
- **Install**: `installLayout` migrates any installed layout (theme, sizes, own pages, open page) with
  a timestamped backup; a new destination in `layouts/bot-herdr.json` needs no migration code.
- Files: the Files mod opens as a window from the palette (`mod.open files`) now that the layout has
  no panel; a thread button can open it with `openOverlay` or show a panel again.
- The status bar, composer and goal row are untouched (M4b).

## Knowledge Proposals

- herdr's `mods/tabs` strip is the only place the shipped layouts draw Linux/Windows window buttons;
  a layout with `"titlebar": "none"` that drops the strip must draw its own, gated on
  `window().buttons` (`false` on macOS, where the traffic lights stay).
- `herdr-app check` (headless) reports `window().buttons === false`, so a platform-gated control is
  invisible to `bh ui-audit`; gate on the capability, not the platform name.
- A `herdr-app check` render draws only the active child of every stack: a layout's destination page
  must be selected with `layout.select {stack, child}` before it draws (the audit's shot harness
  appends one page block per audited page).
- The shots window initialises every layout block's mod at window start, and `setShared` writes to
  the temp app's `shared.json` that later per-page `check` runs read: a state a page writes in `init`
  (a remembered sub-tab) bleeds into the pages after it. `bh ui-audit`'s wrapper re-runs `prepare()`
  each render to keep every audited page on its own seed.
- `herdr-app check` only prints the first frame, so a `bh` read started in `init` never lands in the
  spec: pages that must be audited with data take their state from the fixture seed, not the read.

## Script Proposals

None.

## Pushback / decisions worth a second look

- **Request:** the window buttons in the top bar (Minimize, Maximize, Close), drawn only when
  `window().buttons` says the system draws none. **Reason:** the removed herdr `tabs` strip was the
  only place this layout carried them on Linux/Windows; without them the redesign would lose
  minimize/maximize/close there (the palette keeps "Close window", but nothing else). They are not
  destinations (outside the tab list), quiet, icon-only, labelled, and not drawn on this machine
  (`window().buttons` is false here, so they are absent from the shots). **Alternative:** drop the
  three buttons and rely on the palette + window-manager shortcuts; a two-line removal.
- Reviews are drawn once: the engine lists QA reviews both as a needs-you item and in `review`, so
  Home's "Needs you" section skips `kind: "review"` and they appear in "Review first" with the Review
  glyph (◇), which is the design's own glyph for that state.
- `accessibleLabelCoverage` moved 0.85 → 0.84 and `keyboardPathCoverage` stays 0.92: the Library
  shows the Knowledge view (whose icon buttons had no labels) a second time, and each new sub-tab
  strip adds one interactive container. Both are M5's 100% target, and no other coverage was removed.
