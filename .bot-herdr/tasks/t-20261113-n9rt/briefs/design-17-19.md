Step 13 is accepted and committed (06c8923). Good work, and the rail.js/railview.js split is right. Next: steps 17 and 19 of task t-20261113-n9rt. Same rules: UI files only (Dev is editing mods/bot-herdr/engine/** now), do not touch mods/bot-herdr/plandoc.js (someone else's uncommitted change is in it), do not commit.

## Goal
Step 17: you never miss an open question, whatever page you are on. Step 19: no control claims something it did not do, and every reply action can be reached by keyboard.

## Step 17: open-question counts on the page tabs
1. Today each page polls `OpenQuestions` on its own (chat.js `readQuestions`, work.js around the `OpenQuestions` use); `switch.js` can draw a `count` on a tab (around line 59), but the `PAGES` items pass none (around line 230).
2. Keep one count for the whole layout: whichever page's poll reads the question files writes `{ chat: <open questions with no plan>, plans: <open questions with a plan> }` to a herdr `shared` key `bh.openQuestions` (use `shared` as chat.js does for `FOCUS`/`OUTGOING`). The tab bar reads it and passes `count` to the Chat and Plans tabs. A count of 0 draws nothing.
3. The tab bar shows on every page (Terminals too), so the count is visible there. No new timer: the existing polls write it.

## Step 19: copy and state fixes
4. Resume (work.js, the Resume action that toasts `Resumed <title>` after `sendFromChat`): the toast says `Asked the Orchestrator to resume <title>`, and the task shows a muted "resume asked" mark until its status becomes `active` (keep the mark in memory on the Work view, keyed by task id; drop it when the status changes or after 10 minutes).
5. Pause in the chat's tasks widget (chat.js, `actTask` with a `catch {}` that swallows failures): on failure call `this.composer.say("Couldn't pause <title>: <first line of the error>", cx, "error")`.
6. Plans page: the seat pills (work.js, the static seat pills) show each panel seat's state from the live terminals named `<seat>-panel` (use `liveAgents()`/`terminals()` as chat.js `live()` does): working (pulsing dot, as chat.js:423), done (check), not started (muted). Replace the local "Reading the code…" timer with that real state. "Waiting for your answer in the chat" becomes "Answer below".
7. Reply actions in the chat (Comment, Open terminal and the others, today hover-only through `opacity(show ? 1 : 0)`): they also show while one of them has keyboard focus. If gpui-kit has no way to know that focus is inside the row, draw them always at 0.5 opacity and at 1 on hover or focus. Check `mods/bot-herdr/gpui-kit.d.ts` before using any method.

## Constraints
No new tokens, no new dependency, no new polling loop, functions at or under 20 lines. Keep `look.js` and `feed.js` import-free.

## Done when
- With a plan question open and the Terminals page showing, the Plans tab shows 1; answering it clears the count within one poll. A chat question shows on the Chat tab.
- Resume toasts the new words and shows the mark until the task is active; a failed Pause says why.
- During a panel round, each seat pill shows working/done from its terminal; no "Reading the code…" timer remains.
- Tab reaches every reply action with it visible.
- Pure parts tested in `test/` (the count split by plan/no plan, the seat state from a terminal list, the resume mark's expiry). `herdr-app check mods/bot-herdr` passes; tsc shows no new TS2304/TS2552/TS2339 in files you touched; `bh check` prints PASS.
- Update `.bot-herdr/tasks/t-20261113-n9rt/reports/design-rail.md` with a `## Steps 17 and 19` part (same sections), then `hc send` me one line.

## If stuck
If the tab bar is drawn somewhere that cannot read `shared`, or a seat's terminal cannot be found by name, stop that part, finish the rest, and report it under Blockers with path:line.
