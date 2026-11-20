Next for you: step 8 of t-20261120-n1rc (the Metrics tab and a More menu in the page switch), plus two small follow-ups from your own report. Same shared tree, same rules (build on the user's pending edits; Dev works on engine files at the same time).

Files you may change: new `mods/bot-herdr/metrics.js`, new pure `mods/bot-herdr/metricsview.js`, new icon `mods/bot-herdr/icons/page-metrics.svg`, `pages.js`, `switch.js`, `main.js` (only if a view must be registered there), `plandoc.js` (follow-up A only), `work.js` (follow-up A only), new test `test/metrics-view.test.mjs`. Not: anything under `engine/`, `layouts/` (the slot stays 600px).

Contract (board entry #4, `bh board read t-20261120-n1rc`): `bh metrics --json --window today|7d|30d|all` prints
{"window","from","to","totals":{timeMs,turns,tokens:{input,output,cacheRead,cacheWrite},costUsd,tasks,steps,estimated:{tokens,cost}},
 "agents":[{id,name,role,harness,models,timeMs,turns,tokens:{input,output,cacheRead,cacheWrite},costUsd|null,tasks,steps,estimated:{tokens,cost},daily:[{day:"YYYY-MM-DD",timeMs,turns}]}]}
agents sorted by timeMs, busiest first. Dev is building the command now; until it exists, build against a fixture in your test and let the page show its error state when the command fails.

Step 8
1. A Metrics page between Knowledge and Settings in `pages.js` `PAGES`, label "Metrics", icon `page-metrics` (a new 16px SVG in the style of the other `icons/page-*.svg`: three vertical bars of different heights).
2. `metrics.js`: reads only `bhJson(["metrics", "--json", "--window", w])` (as other pages call bh), refreshes on open and every 10 s while it is shown, and uses `stateView` (`switch.js:155`) for loading, empty ("No agent has worked yet in this window.") and error states.
3. Top: a `segmented` window picker Today / 7 days / 30 days / All (default 7 days), then one totals row (time, turns, tokens, cost, tasks, steps).
4. Agent cards, busiest first, in a grid of 3 columns (2 below 900px, 1 below 600px), as in your design-panel mockup "Agent cards": header with `agentBadge` (or the existing agent avatar component), name, harness and rank (#1…); six numbers (time worked, turns, tokens, cost, tasks, steps); a daily-activity bar chart of `daily[].timeMs` drawn with plain divs (bar height proportional to the agent's own max day; 0 gets a 2px stub), with a text alternative via `accessibility_label`, e.g. "Daily time worked, oldest first: 0 min, 12 min, …".
5. Numbers: time as "3 h 20 min" / "45 min"; tokens as "1.2M" / "830k", with uncached (input+output) first and cached (cacheRead+cacheWrite) as a muted second line "+ 2.7M cached"; cost as "$1.79". When `estimated.tokens` or `estimated.cost` is true, the number gets a "≈" prefix and a tooltip "Estimated: this harness does not report it". `costUsd: null` shows "—".
6. Put the formatting and grid-column choice in the pure `metricsview.js` (no gpui imports) so Node tests cover them.
7. More menu in the page switch (`switch.js`): the slot stays 600px. Measure tabs as `tabWidth` already does; when they do not fit at `SPACE[2]` padding, the tabs from the end that do not fit go behind a final "More ▾" tab, labels kept, in a dropdown menu (reuse the menu component the mod already uses for pickers). The open page is never hidden: if it would be, it takes the last visible place and the tab it displaces goes into More. More shows the sum of the open-question counts of the tabs it holds. Put the fit logic in a pure function (`fitTabs(widths, room, openIndex) -> { shown: [i…], more: [i…] }`) in `switch.js` or a pure module, and test it.

Follow-up A (your Pushback): move `startPlanTask(p)` to `pages.js` next to `sendFromChat`, use it from both `work.js` and `plandoc.js:323`, so the message text exists once.
Follow-up B: on `segmented` items add `.role("tab")` and on its track `.role("tab_list")` if both exist in `gpui-kit.d.ts`.

Done when
- The Metrics tab shows between Knowledge and Settings; with the fixture the cards, totals, window picker, ≈ marks and "—" render as described (say how you checked).
- `fitTabs` tests: all fit; one overflows into More; the open page is last and would overflow, so it stays shown.
- `test/metrics-view.test.mjs` covers the formatters (time, tokens, cost, ≈, —) and columns by width.
- `npm test` passes, `herdr-app check mods/bot-herdr` passes, and tsc shows no new TS2304/TS2552 outside `engine/`.

If stuck: stop that point, finish the rest, report under Blockers. Record your report with bh report t-20261120-n1rc --step 8.
