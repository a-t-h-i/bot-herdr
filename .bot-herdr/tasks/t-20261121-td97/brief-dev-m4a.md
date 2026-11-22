# Dev brief — M4a Navigation shell: 5 destinations, Home, Agents, Library, Settings › Usage

Task t-20261121-td97, step 4 (UI, part a of 2). M3 (quiet pass) and the M4 engine half are merged into this tree. M4b (Threads, Peek drawer, Goal row, Composer, Status bar) follows you, so leave clean seams for it.

Read first:
- `.bot-herdr/tmp/design-language-spec.md`: **Navigation**, **Principles** (all 7), **Components** (Tabs and selection, Filter bar, Thread row, Agent row, Peek panel, Stat, Settings row, Status bar), **Accessibility › Ease of use** (empty states teach, primary action top right, filters top left), **Decisions and defaults**, **Building in GPUI**, **Goal prompt › NEVER**.
- `/home/athi/bot-herdr/.bot-herdr/plans/p-20261121-siir/plan.md`: step 5, **Decisions › ORCHESTRATOR / DESIGN** (Agents = `Fleet | Terminals` sub-tabs, top-bar `tabs` strip removed; Library = `Knowledge | Learning | Scripts | Issues`; Metrics → `Settings › Usage`; Changes panel moves into each thread; Files opens from the palette or a thread button), **Assumptions**.
- Reports: `dev-m3.md`, `qa-m3.md` (if present), `dev-m4-engine.md` (the `bh home` / `bh thread` / `bh goal progress` JSON shapes and `migrateLayout` in install.mjs).
- Code: `layouts/bot-herdr.json`, `mods/bot-herdr/{pages,switch,main,route,work,learning,issues,metrics,metricsview,settings,roster}.js`, `install.mjs`.

## Build
1. **Top bar: exactly 5 destinations**, Home, Threads, Agents, Library and a gear for Settings (audit `topLevelDestinations = 5`), styled as accent text + 2 px underline. Home opens by default. Remove the top-bar `tabs` strip and the separate Files / Changes / Orchestrator destinations from the bar. Nothing is lost: Files opens from the command palette and a thread button, Changes lives in the thread, and the Orchestrator chat is reachable from Home/Threads (leave a clear seam for M4b's thread view; until then route it to the existing chat view).
2. **`layouts/bot-herdr.json`**: the new structure. Wire install.mjs's `migrateLayout` + `backupLayout` into `runInstall` so existing users' layouts migrate non-destructively with a timestamped backup. Test: install over a fixture old layout (including one with `"metrics"`) → new layout + backup.
3. **Home** (new `home.js`): reads `bh home --json`. "Needs you" and Review first (questions, blockers, QA reviews, approvals, untriaged GitHub issues), then the fleet (running agents + goals with one-line summaries) and today's spend. Header count "3 running · 1 needs you". Thread rows per spec › Components › Thread row; agent rows per Agent row. Skeleton rows while loading, never a spinner; teaching empty state.
4. **Agents** (new `agents.js`) with `Fleet | Terminals` sub-tabs: Fleet = full-width calm agent list (avatar, name, state glyph + word, one-line summary; harness/model only in the peek). Terminals = herdr's native terminals block (full screen; tiling comes in M6). `Enter` on an agent opens its terminal.
5. **Library** (new `library.js`) with `Knowledge | Learning | Scripts | Issues` sub-tabs, reusing the existing views (Issues browser/bundler moves here in full).
6. **Settings** behind the gear, with a **Usage** section that holds the Metrics view (quiet: hero numbers, details on demand).
7. Every new view: render-safe boundary, tokens only, one accent action max, keyboard-focusable rows keyed by stable ids (`track_focus`), `role`/`accessibility_label` on interactive elements (gpui-kit supports them per `reports/a11y-capability.md`).
8. **The audit**: extend the audit's page list and fixtures (`ui-audit-fixtures.mjs`) to the new pages: home, threads (placeholder until M4b), agents-fleet, agents-terminals (record as native if there's no spec), library-knowledge, library-learning, library-scripts, library-issues, settings, settings-usage. That is extending coverage, not loosening it: new pages without an M1 baseline must compare against the M1 baseline of the page(s) they replace (state the mapping in the report), never a freshly written baseline.
9. Update tests that pin the 9-page order (`test/learning-view.test.mjs`, `test/goal-ui.test.mjs` layout guards) to the new navigation. Update, never delete or skip.

## Checks (paste results)
`node_modules/.bin/tsc --noEmit -p mods/bot-herdr/jsconfig.json`, `node mods/bot-herdr/engine/bh.mjs check`, `npm test`, `/home/athi/.local/bin/herdr-app check mods/bot-herdr` (delete the generated `mods/bot-herdr/engine/lib/gpui-kit.d.ts`), `node mods/bot-herdr/engine/bh.mjs ui-audit --json --shots .bot-herdr/tasks/t-20261121-td97/shots/m4a`, with every counter listed and `topLevelDestinations = 5`. Look at the shots in all 4 themes.

Don't commit. Report to `.bot-herdr/tasks/t-20261121-td97/reports/dev-m4a.md` (what lives where now: an old-destination → new-place table proving nothing was removed; test changes; check results; the seams left for M4b), then `bh report t-20261121-td97 --step 4 --file <that> "<summary>"`.
