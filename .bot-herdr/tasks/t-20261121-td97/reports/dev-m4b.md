# M4b — Threads, Peek drawer, Goal row, Composer, Status bar, RECIPE.md (dev-m4b)

## Summary

Threads is now a state-grouped thread list (Orchestrator chat pinned, plans-not-tasks included) that opens a thread with a breadcrumb and Conversation | Plan | Steps | Changes; Home, Threads and Agents share a 400 px Space/Esc peek drawer with question cards (1–9) and inline reply; Goal threads get the goal row; the composer is one line at rest; the status bar is the mod's own slim bar; RECIPE.md is written.
tsc, `bh check`, `npm test` (655 pass, 1 skipped, 0 fail), `herdr-app check` and `bh ui-audit` pass; Fix-table counters all at target, 16/16 themes clean, P1 `threads`, `goalRow`, `peek` now detected.

## Changes

| File | What changed |
| --- | --- |
| `mods/bot-herdr/threadview.js` (new) | Pure, never-throwing view models: thread rows, state grouping (needsYou → review → working → paused → done → failed → idle), search/state filter, drawn order, breadcrumb, sub-tabs, conversation entries (type word, author, time, lead line, expands), plan, steps, changes stat, goal row, peek (options, reply target, cost line), status bar, palette hint. |
| `mods/bot-herdr/threads.js` | Rewritten: thread list (filter bar = search + one Filter button, chip only for the active filter; pinned Orchestrator row; one-line summary per row); thread view (breadcrumb `Threads › title › sub-tab`, Files button, segmented sub-tabs); Conversation (board entries + replies + comments, expand in place, goal row + composer at foot); Plan (plan markdown + "Open plan" → plan sheet); Steps (Work's own `taskStepsTab` step cards for the task); Changes (diff stat, branch folded as machine text, "Open diff" → changes mod). Keys: J/K/Home/End, Enter, Space peek, Esc closes peek then goes back. Each page part inside `safeRender`; the chat in its own boundary. Follows `OPEN_THREAD`, `OPEN_TASK` (opens that thread on Steps) and `FOCUS` (opens the Orchestrator thread). |
| `mods/bot-herdr/peek.js` (new) | `PeekDrawer`: in-page right drawer (400 px) owned by the page's focus tree; `bh thread peek`; recent output, Question card (`bh-answer-card-*`, 1–9 pick, ✓ chosen, others fold), reply box (`hc send <address>`), state, summary, harness · model · cost. Esc closes. |
| `mods/bot-herdr/statusbar.js` (new) | Status bar view: machine, branch, agent count, palette key hint. `role("status")`, no buttons. |
| `mods/bot-herdr/home.js`, `agents.js` | Space toggles the peek for the picked row (threads, needs with a thread, goals, agents); Esc closes; the column shrinks beside the drawer. |
| `mods/bot-herdr/composer.js` | `focused` from the input's focus/blur; `atRest()` → the box is one input line (no tools row); the attach, space/branch and model chips and send key appear on focus, text, attachments or a pane. Sending unchanged. |
| `mods/bot-herdr/pages.js` | `OPEN_THREAD` shared key; `openThread(id)` sets it; `showPage("chat")` opens the Orchestrator thread and sets `FOCUS`; `showPage("threads")` (top bar) no longer forces the chat; `sendFromChat` → `showPage("chat")`. |
| `mods/bot-herdr/switch.js` | ctrl+shift+m / `chat` command → `showPage("chat")`. |
| `mods/bot-herdr/main.js` | `status: StatusBar` view registered. |
| `layouts/bot-herdr.json` | `status` block content `workspace-status` → `{ mod: "bot-herdr", props: { view: "status" } }`. Install's migration takes the shipped structure, so no migration code changed. |
| `engine/lib/ui-audit-fixtures.mjs` | 7 pages (`threads`, `thread-chat`, `thread-conversation`, `thread-plan`, `thread-steps`, `thread-changes`, `peek`) with `bh thread list/show/peek` and `bh goal progress` fixtures and seeds. |
| `engine/lib/ui-audit.mjs` | `REPLACES` for the new pages (below). |
| `engine/lib/ui-audit-shots.mjs` | A layout block that isn't an audited page (status bar, Terminals strip) now draws as its own view in shots instead of falling back to the chat. Rendering fix only; no check changed. |
| `mods/bot-herdr/RECIPE.md` (new), `preview.png` (new, the Home/graphite shot) | Per AGENTS.md's recipe spec: what you see, tokens/type/space/radius/state/agent hues, behaviour and keys, layout tree, views, engine read models, herdr calls, install migration, audit, watch-outs, done-when. |

### Old → new: nothing lost

| Before | Now |
| --- | --- |
| Chat page (Orchestrator chat: feed, composer, questions, mockups, kids) | **Threads › Orchestrator** (pinned row) — the same `Chat` view, whole, under its breadcrumb; ctrl+shift+m, `/…` and `sendFromChat` land there |
| Tasks list | **Threads** list (one row per task, grouped by state, search + Filter) |
| Task detail › Steps (cards, actions, comments) | **Thread › Steps** — Work's own step cards |
| Task detail › Board / Comments | **Thread › Conversation** (board entries + comments + agents' replies; type word, author, time, first line, expand in place) |
| Task detail › Full plan / Plans page plan doc | **Thread › Plan** (markdown + Open plan → the plan sheet with comments and Start) |
| Plans list (plans not yet tasks) | **Threads** rows of kind plan (Idle/Working) |
| Goal strip (gate, pause/resume) | **Goal row** above the composer: ◎ gate, elapsed, retries left, judge's last reason; Pause/Resume, Edit, Clear |
| Changes panel | **Thread › Changes** (diff stat per file, totals, branch; Open diff → changes mod) |
| Files panel | **Files** button in every thread header (`mod.open files`) |
| Status bar: machine, branch, agent count, palette hint | same, in the mod's status bar |
| Status bar: "· N needs you" | **Home** header ("3 running · 5 need you") and its Needs you section |
| Status bar: clickable palette hint | the palette key itself (Ctrl+Shift+P) and the hint text; no buttons per spec |
| Row cost / tokens / harness / model | **Peek** |
| Resilience strip (`statusstrip.js`) | was already undrawn since M3 (Settings › Resilience); untouched |

Old `tasks`/`tasks-board`/`plans`/`chat` views stay in the mod and audit.

### Audit mapping (`REPLACES`)

| New page | Compared with | Ceiling | Now |
| --- | --- | --- | --- |
| threads | tasks + plans | 268 | 77 |
| thread-chat | chat | 41 | 28 |
| thread-conversation | chat + tasks-board | 228 | 89 |
| thread-plan | plans | 101 | 40 |
| thread-steps | tasks | 167 | 62 |
| thread-changes | tasks (Changes was herdr's mod, no spec of ours) | 167 | 58 |
| peek | tasks + plans (list + drawer) | 268 | 127 |

`threads` was mapped to `chat` in M4a because it *was* the chat; the chat now lives at `thread-chat`, which keeps the 41 bar.

## Brief Check

1. Threads (list, groups, filter bar, rows, breadcrumb, 4 sub-tabs, Orchestrator pinned, plan threads) — met (`threads.js`; shots threads-*, thread-*-*).
2. Peek drawer (Space/Esc, output, Question card 1–9, reply without leaving, cost/harness/model, one focus tree, rows keyed by id) — met (`peek.js`; peek-*.png).
3. Goal row from `bh goal progress --json`, pause/resume/edit/clear via `bh goal pause|resume|stop` — met (`bh-goal-row`, shot thread-conversation-*). Edit prefills the composer with an amendment request (criteria are frozen; amendments go through `bh goal propose-amend`).
4. Composer one line at rest, chips on focus, same send — met.
5. Status bar machine/branch/agents/palette hint only — met; needs-you count → Home.
6. Audit pages + mapping + feature detection — met; `threads`, `goalRow`, `peek` detected from rendered ids (`bh-thread-tabs-*`, `bh-goal-row`, `bh-peek`, `bh-answer-card-*`); no detection rule changed.
7. RECIPE.md — met.
8. Render-safe, tokens only (hex 0), ≤1 accent (new pages 0), track_focus + role + labels (accessibleLabel 1.0 on every new page), J/K/Space/Enter/Esc — met.
9. render-resilience extended; pinned tests updated; none deleted or skipped — met.

## Verification

- `node_modules/.bin/tsc --noEmit -p mods/bot-herdr/jsconfig.json` (main checkout's tsc) — exit 0
- `node mods/bot-herdr/engine/bh.mjs check` — `PASS: 655 tests pass, 1 skipped, typecheck passes` (run with a temporary `node_modules` symlink to the main checkout, removed afterwards; without it the typecheck cannot run in this worktree)
- `npm test` — 656 tests, 655 pass, 1 skipped, 0 fail
- `/home/athi/.local/bin/herdr-app check mods/bot-herdr` — `check passed`; generated `gpui-kit.d.ts` deleted
- `node mods/bot-herdr/engine/bh.mjs ui-audit --json --shots .bot-herdr/tasks/t-20261121-td97/shots/m4` — exit 0, 27 pages, 104 PNGs (in this worktree's `.bot-herdr/tasks/t-20261121-td97/shots/m4`)

| Counter | Value | Target |
| --- | --- | --- |
| topLevelDestinations | 5 | 5 |
| zeroCountChips | 0 | 0 |
| repeatedDefaultStrings | 0 | 0 |
| statsPerCard | 1 | 1 |
| selectionStyles | 1 | 1 |
| rawMachineText | 0 | 0 |
| decorativeIcons | 0 | 0 |
| agentColourFills | 0 | 0 |
| hexOutsideTokens | 0 | 0 |
| accentButtonsPerView | 1 | ≤ 1 |
| renderErrors | 0 | 0 |
| contrast | 16/16 themes clean | all |
| keyboardPathCoverage | 0.91 (was 0.92) | 1 (M5) |
| accessibleLabelCoverage | 0.88 (was 0.84) | 1 (M5) |
| P1 features | threads, goalRow, homeNeedsYou, liveSummary, peek present | approvalCard, diffReview, viewModes are M6 |

Keyboard path dropped 0.92 → 0.91 because the audit now also renders `thread-chat` (0.33: the composer's controls, the same gap the `chat` page already has at 0). That's M5 work.

Shots checked: threads (graphite), peek (paper), thread-conversation (ink), home (moss). Grouped list with glyph + word, drawer at the right edge with numbered option cards, goal row above a one-line composer, status bar "This computer · 0 agents … Ctrl+Shift+P commands".

## Test changes

| File | Change |
| --- | --- |
| `test/render-resilience.test.mjs` | New: fuzzes all 25 `threadview.js` models with 18 corrupt/legacy/hostile fixtures through `safeRender`; each must answer, never throw. Plus a static test that the new views draw through their boundaries, read data only via `threadview.js`, and carry no hex. |
| `test/threads-view.test.mjs` (new) | Grouping order, drawn order, search/filter, zero counts dropped, breadcrumb/sub-tabs, board entry lead line, goal row parts, peek option keys and reply target, status model and palette hint, audit pages + `REPLACES`. |
| `test/goal-ui.test.mjs` | Static guard list adds `peek.js`, `threadview.js`, `statusbar.js`. |
| `test/learning-view.test.mjs` | The layout's `status` block is `{ view: "status" }` and main.js registers `StatusBar`. |

No test deleted, skipped or loosened; no existing test was pinned to the old chat-as-Threads behaviour.

## Knowledge Proposals

- `gpui-kit` has no `aria_expanded`; say open/fold in the `accessibility_label`.
- `InputState`/`TextareaState` emit `focus`/`blur`; that is the way to know an input holds the keyboard, so a page's J/K/Space can stand down.
- In the shots harness, a bot-herdr layout block that is not an audited page must draw as its own view, or it shows the chat (fixed in `ui-audit-shots.mjs`).
- A task worktree has no `node_modules`; `bh check`'s typecheck needs the main checkout's typescript.

## Pushback / decisions worth a second look

- **Clear on the goal row = `bh goal stop`**, with a 5 s second-click confirm. There is no "clear goal" command; stop is the closest existing one.
- **Edit on the goal row** prefills the composer ("Change goal … propose an amendment (bh goal propose-amend) to ") rather than editing criteria directly, because frozen criteria change only through approved amendments.
- **At rest the composer hides its Stop button** with the rest of the tools row. It returns on focus, and the chat focuses the composer when the page opens. If Stop must always show, keep the tools row while the target is working (a one-line change in `atRest()`).
- **Peek reply goes straight to the agent** (`hc send <address>`, the thread's reply target). It doesn't go through the Orchestrator, and the first message to an unbriefed agent carries no brief, unlike the composer.
