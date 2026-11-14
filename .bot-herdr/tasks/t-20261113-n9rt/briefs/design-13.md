## Goal
Step 13 of task t-20261113-n9rt (plan p-20261113-bkli): an agents rail beside the chat, so the user sees who is working, on what, for how long, and who needs them, without opening Terminals. The user chose this layout (option "Agents rail"). It replaces nothing yet: the working line stays for now.

## Reference
The chosen mockup: `C:\Users\athenkosi.hlubi\.config\herdr-app\data\bot-herdr\questions\q-20261113-2bo5-4-3.png` (its HTML: `…\q-20261113-2bo5-4-3.html`). Match its layout: a 248 px column to the right of the 660 px chat column, 16 px gap, top-aligned, card fill `c.panel`-like raised surface with a 1 px edge and radius 12; header "AGENTS" with "N live" on the right; groups NEEDS YOU, WORKING, IDLE (a group with no rows is not drawn); each row a 28 px round initial badge in the agent's hue (`look.js agentHue`), the name in the agent's ink, a status dot, and under it one muted line: what it is doing now and elapsed ("Editing src/chat.js · 4m"); a NEEDS YOU row is tinted amber with its question's first line and an "Answer" button.

## Files
Change: `mods/bot-herdr/chat.js`, and a new `mods/bot-herdr/rail.js` holding the rail's drawing (imitate how `chat.js` and `work.js` build rows with `v_flex`/`h_flex`, `look.js` tokens and `button.js actionButton`).
Leave alone: `mods/bot-herdr/engine/**` (Dev is changing it now), `composer.js` except reading from it, `work.js`, `feed.js`, all tests other than a new `test/rail.test.mjs`.

## What to do
1. Rows come from data the chat already has: `this.live()` (`chat.js:302-315`, every live agent with `address`, `space`, `status`), names and roles as `workers()` finds them (`chat.js:541-548`), `this.doing[address]` (the current tool line, `chat.js:338-351`), and the open questions in `this.open.list` (`chat.js:505-508`, each with `from`). Show the agents of the current space only, as `workers()` does.
2. Group: NEEDS YOU = status `blocked` or an open question whose `from` is that address; WORKING = status `working`; IDLE = everything else live. Order inside a group: the Orchestrator first, then by name.
3. Elapsed: from when the agent's current status began. Keep a `since` map in the chat (address → time the status last changed, updated in `poll`), not a new file. Show it as `12m`, `1h 5m`, under a minute `now`.
4. Muted line: WORKING → `doing` (cut to one line) + " · " + elapsed; IDLE → "Waiting for a task"; NEEDS YOU → the question's first line, or "Needs you" when blocked without a question.
5. A click on a row opens its terminal with `openTerminal(address)` (`pages.js`, already imported in `chat.js:19`). "Answer" opens the question drawer the composer already has for that question (find how the composer opens a question card today and call the same thing; do not add a second answer path).
6. Width: the rail shows when `this.size.width >= 660 + 16 + 248 + 2 * SIZE.gutter`. Below that it folds to a single 28 px button at the top right of the chat, labelled "Agents · N working", that opens the same rail as a popover over the feed; a click outside or Esc closes it.
7. Motion: rows fade in (opacity transition, `MOTION.row`) when they join and move between groups without jumping the feed: the rail is positioned outside the feed's measured column so the bottom-anchored feed (`chat.js:568-607`) does not reflow. The status dot of a WORKING row pulses with `.loop("opacity", …)` as `chat.js:423` does. No rotate or transform (gpui-kit has none; check `mods/bot-herdr/gpui-kit.d.ts` before using any style method).
8. Accessibility: every row and the Answer button are focusable and reachable by Tab, with a visible focus ring as other buttons have (`look.js focusable`); rows read "<name>, <group>, <muted line>".

## Contracts
None with Dev in this step: read-only use of the chat's existing state. A later step (15) will add each task's done/total to the rail; leave room for one more muted line, do not build it.

## Constraints
No new design tokens; use `look.js` SIZE/SPACE/TYPE/MOTION and the colours in `theme.js`. No new polling loop: reuse the chat's existing 2.5 s poll. No new dependency. Functions at or under 20 lines. Do not commit.

## Done when
- At a window wide enough, the rail is drawn to the right of the chat column with the three groups as in the reference; at a narrow window it folds to the "Agents · N working" button and opens as a popover.
- An agent that starts working moves from IDLE to WORKING within one poll, with its `doing` line and elapsed time; an agent with an open question appears under NEEDS YOU with an Answer button that opens that question.
- `test/rail.test.mjs` covers the pure parts in `rail.js`: grouping (blocked, question, working, idle), ordering (Orchestrator first), elapsed formatting, and the fold width rule.
- `npx -y -p typescript@5 tsc -p mods/bot-herdr/jsconfig.json --noEmit` shows no TS2304/TS2552 in `rail.js` or `chat.js`; `herdr-app check mods/bot-herdr` passes; `node "C:/Users/athenkosi.hlubi/.config/herdr-app/mods/bot-herdr/engine/bh.mjs" check` prints PASS.
- Report with a screenshot or a precise description of the rail at 1200 px and at 800 px window width.

## If stuck
If the question drawer cannot be opened for a given question from outside the composer, or the rail cannot sit beside the feed without changing the feed's measured layout, stop that part, finish the rest and report it under Blockers with path:line.
