## Summary
The Agents page now has a remembered List | Graph toggle (Graph by default), the new header and summary line, and the graph view from the design: chains, step pills, reports-back line, bench, detail panel and travelling dots.
Screenshot: `.bot-herdr/tasks/t-20261125-4679/reports/agents-graph.png` (the live app, side-by-side layout at 125% display scale).

## Changes
- `mods/bot-herdr/agents.js`:
  - Header is now `<project> / Team` with a `segmented` List | Graph control and Edit team.
  - New summary line: `N agents at work · N tasks · N on the bench`.
  - `view()`/`setView()` persist the toggle in shared `bot-herdr.agents-view`.
  - `graph()`, `bench()`, `pickAgent()`, `panelModel()`, `liveLines()` and `pause()` (runs `bh task status <id> paused`).
  - `tickWhileMoving()` runs one 50ms `cx.timer.every` and cancels it when the graph is hidden, nothing is working, or motion is reduced.
  - `loadDetails()` reads `bh task show` for up to 4 tasks in progress, for the step pills and the "Done when" line.
  - Esc closes the panel. J/K pick and reopen it.
  - The graph column may grow to 1600px (`GRAPH_MAX`). List view is unchanged.
- `mods/bot-herdr/agentsgraph.js` (new): render functions `graphCard` (dot grid, nodes, task cards, pills, dotted edges, dots, bench) and `detailPanel`, plus `toneOf` and `PANEL_W`.
- `mods/bot-herdr/agentsgraphlayout.js` (new, pure): `chainOf`, `graphLayout` (row or stack), `pointAt`, `dotProgress`, `benchGrid`, `roleKey`, `actionOf`, `relativeTo`.
- `test/agents-graph.test.mjs` (new): 13 tests for the pure helpers.

## Brief Check
- `herdr-app check mods/bot-herdr` passes: met.
- `node --test test/agents-graph.test.mjs` passes: met (13 pass, 0 fail).
- `node install.mjs` ran, and the Agents page shows the Graph view with the chain, the bench, the panel and the moving dots: met. See the screenshot; the reports-back dot is off-centre there because it is mid-travel.
- Report recorded with **Design choices**: met (below).

## Design choices
- Dotted lines are rows of 2px dots on a 6px pitch. `border_dashed` on a 0-wide box drew nothing in gpui. I did not try `PathBuilder`, because `paint_path` hangs off the window and nothing in the mod uses it yet.
- Edge tone is the source agent's colour at 70%. The Orchestrator's edges and reports back are muted.
- Each node's border is the role colour at 50%. The picked node gets the full colour and an 8% fill.
- Grid: 2px dots on a 32px pitch, textMuted at 16%.
- Icons: Orchestrator uses `users`; the worker and the idle bench card use `page-terminals`. There is no share/graph or pencil icon in `icons/`.
- Lead node has no icon (the design's pencil has no icon file).
- The state word is uppercase but not letter-spaced: gpui-kit has no letter-spacing.
- `Open session` uses the primary (accent) tone, not the role colour. `actionButton` has no colour option, and `button.js` is off-limits.
- Bench order: idle terminals first, then Ready roster agents, in cards at least 160px wide that wrap.
- Panel: the Parent row is hidden when the picked agent is the Orchestrator itself. With no task, the header shows the agent's name and state.
- Fit: node widths scale down to 0.7× with edges at least 80px. Below that, or when the page is under 900px, the chains stack and the panel drops below. Stacked chains show no step pills or reports-back line.
- Edge labels are clipped to their stretch of line, with an ellipsis.
- Default pick is `team()[0]`: the first working agent, which is the Orchestrator terminal while it works.

## Verification
- `herdr-app check mods/bot-herdr` — check passed.
- `node --test test/agents-graph.test.mjs` — 13 pass.
- `node install.mjs` — installed; check passed on the installed copy.
- `herdr-app shot` — screenshot saved. To take it I switched the window to Agents for 2 seconds, then back to Chat.
- `bh check` — fails, but none of the failures come from these files:
  - The typecheck cannot run because typescript is not installed (`npm install` is needed).
  - 18 tests fail in engine, install, skills and learning-view (`Home opens by default`), none of which touch the Agents files.

## Knowledge Proposals
- look.js `clickable()` makes its element `relative` through `pressable`. An absolutely placed clickable must sit inside an absolute wrapper, or it falls back into the flow.
- gpui `border_dashed()` on a zero-width or zero-height box draws nothing. Draw dotted lines as rows of 2px dots.
- `herdr-app shot` is in physical pixels: at 125% display scale, a 1112px-wide shot is an 890px layout.

## Pushback
- **Request:** "Create `agentsgraph.js`, holding the graph and the detail panel as pure layout helpers plus render functions," with the tests importing it.
- **Reason:** Node tests cannot import a file that imports gpui-kit, gpui-base or herdr (project standard), and the render functions need gpui.
- **Alternative (done):** The pure helpers are in a new `agentsgraphlayout.js` that the test imports. `agentsgraph.js` holds only the render functions.
- The brief also said to use the thread row's current step, but `bh thread list` has no step list. I read `bh task show` (up to 4 tasks, Graph view only) for the step pills and the "Done when" line.
