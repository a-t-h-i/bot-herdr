## Summary
Built the Metrics page (window picker, totals row, agent cards with daily bars, plus the loading, empty and error states) and the page switch's More menu. Also done: follow-up A (`startPlanTask` now lives in `pages.js`) and B (tab roles).
The tab cannot appear yet, because `layouts/bot-herdr.json` (not my file) has no `metrics` child in its page stack. This is posted on the board as blocker #6.

## Changes
- `pages.js`: Metrics entry between Knowledge and Settings (`page-metrics` icon). Added `startPlanTask(p)` next to `sendFromChat`.
- `icons/page-metrics.svg`: new icon, three vertical bars of different heights, drawn like the other page icons (24 viewBox, stroke 2, round caps).
- `metricsview.js` (new, pure):
  - `WINDOWS`, `DEFAULT_WINDOW` ("7d") and `ESTIMATED_TIP`.
  - `formatTime`, `formatTokens`, `formatCost` (null gives "—"), `formatCount` and `estimated` (adds "≈").
  - `tokenLines`: uncached first, then "+ 2.7M cached".
  - `cells`: the six numbers with their tooltips.
  - `columnsFor` (3 / 2 below 900 / 1 below 600), `barHeights` (in proportion to the busiest day, 2px stub for a zero day), `dailyLabel` and `rankOf`.
- `metrics.js` (new): the `Metrics` view.
  - Reads `bhJson(["metrics", "--window", w], { cwd: projectDir() })`. `bhJson` adds `--json` itself, so the brief's explicit `--json` would have been passed twice.
  - Reads again when the page opens and every 10 s while it is shown; an answer for a window that is no longer picked is dropped.
  - Uses `stateView` for loading, error ("Couldn't read the metrics", with Try again) and empty ("No agent has worked yet in this window.").
  - Cards follow the Settings card look: `c.fill`, `c.edge`, `SIZE.radius`, 14px gap and padding. Each has `avatar` with `mentionTone`, name, harness, rank, six numbers in two rows of three, and daily bars in the agent's colour.
  - The bars use `role("image")` and an `accessibility_label` text alternative.
- `main.js`: registers view `metrics`.
- `tabfit.js` (new, pure): `fitTabs(widths, room, openIndex, { gap, more })`. I made a new module because `switch.js` imports gpui and can't be tested under Node.
- `switch.js`:
  - `pageTabs()` uses the full padding when everything fits. Otherwise it uses `SPACE[2]` padding, and the tabs that still don't fit go behind a final "More ▾" tab whose count is the sum of the counts of the pages it holds.
  - More opens the existing `openPick` list under the tab and shows each page with "n open" when it has questions. `followPick` shows the page picked there.
  - `segmented` gained an optional `item.onDown`, used to learn where More was pressed.
  - Follow-up B: `.role("tab_list")` on the track and `.role("tab")` on the items; both exist in gpui-kit.d.ts (Role, line 197).
- `work.js` and `plandoc.js`: both import `startPlanTask` from `pages.js`, so the message text now exists only there.
- `test/metrics-view.test.mjs`: tests the formatters, ≈ and —, columns by width, bar heights and the label, and the three `fitTabs` cases asked for.

## Brief Check
- Metrics tab between Knowledge and Settings: partly met. It is in `PAGES` and the view is registered, but it can't show until the layout gets the stack child (Blockers).
- Cards, totals, picker, ≈ and — with the fixture: the numbers and marks are covered by unit tests against a fixture. Not drawn: the live window has no `metrics` slot, and `bh metrics` doesn't exist yet ("Unknown command metrics"), so the page would show its error state.
- `fitTabs` tests: met (all fit; one overflows into More; the open last tab stays shown).
- `test/metrics-view.test.mjs` covers time, tokens, cost, ≈, — and columns: met.
- `npm test`: 280 pass, 1 fail. The failure is `headless.test.mjs` "standard access", the same root-environment and engine one as last report, not in my files.
- `herdr-app check`: passed, after replacing `Intl.NumberFormat` (the mod runtime has no `Intl`) with `toLocaleString`.
- tsc: no TS2304 or TS2552 outside `engine/`.

## Verification
- `node --test test/metrics-view.test.mjs`: 5 pass
- `npm test`: pass 280, fail 1 (headless "standard access", not mine)
- `~/.local/bin/herdr-app check mods/bot-herdr`: check passed
- `tsc … | grep -E "TS2304|TS2552" | grep -v engine/`: empty
- Fit at 600px: all seven tabs measure 544px at `SPACE[2]` against 576px of room, so they all fit and More appears only with question counts, zoom or a narrower slot. At 400px, `fitTabs` gives shown [Chat, Terminals, Tasks, Settings(open)] and More [Plans, Knowledge, Metrics].

## Design choices
- card: c.fill, 1px c.edge, SIZE.radius, 14px padding and gap (as on Settings)
- totals: one card, values TYPE.lg semibold, labels TYPE.xs muted; on a 1-column page, two rows of three
- agent numbers: TYPE.md semibold, three per row; cached tokens as a TYPE.xs muted second line
- daily bars: 44px tallest, SPACE[2] between, SPACE[1] radius, agent tone, over a hairline
- More tab: label "More ▾", no icon; its list is `openPick` (min width 180)

## Blockers
- `layouts/bot-herdr.json` needs, after the `knowledge` child of the `pages` stack: `{"id":"metrics","type":"block","content":{"mod":"bot-herdr","props":{"view":"metrics"}}}`. `install.mjs:49` decides a layout is old by looking for `"id": "knowledge"`, so it may need to look for `"id": "metrics"` too, or existing installs won't get the new page.

## Knowledge Proposals
- The mod runtime has no `Intl`: `new Intl.NumberFormat` fails `herdr-app check`. Use `Number#toLocaleString()`.
- `bhJson(args)` appends `--json` itself; don't pass it.
- A new page needs three things: an entry in `pages.js` `PAGES`, a stack child in `layouts/bot-herdr.json`, and a view in `main.js` `VIEWS`.

## Check against the real bh metrics (2026-11-20)
- `BH_APP_HOME=… bh metrics --window 7d|30d --json`: both exit 0. Ran the 30-day output through `metricsview.js`: 10 agents, each with 30 `daily` entries; `harness: null` on some (the line is hidden); every estimated flag combination occurs.
- Totals read "22 h 2 min | 406 | ≈5.4M + 443.8M cached | ≈$807.60 | 33 | 60". The lead reads "10 h 24 min | 257 | ≈843k + 142.9M cached | ≈$732.29".
- Nothing broke. Two fixes in my files: tokens of 1e9 and up read "1.4B" (they would have read "1449.0M"), and charts with more than 14 days use a `SPACE[1]` bar gap so 30 bars stay readable in a 3-column card. `costUsd: null` → "—" is covered by a new test that mirrors the real record's shape.
- `npm test`: 302 pass, 0 fail. `herdr-app check`: passed.
- Not drawn in the live window: I did not switch your open window to the Metrics page.
