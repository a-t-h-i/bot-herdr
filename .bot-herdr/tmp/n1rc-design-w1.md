Goal: step 13 (UI polish), the UI half of step 12 (custom agents as planning seats) and one line of step 3, of task t-20261120-n1rc (bh task show t-20261120-n1rc; plan p-20261120-7rw6). Your own findings are in .bot-herdr/reports/design-ui.md.

You work in the shared tree (the user's uncommitted edits in settings.js and other files stay as they are: build on them, never revert them). Dev works at the same time on engine files; never touch a file outside your list.

Files you may change: `mods/bot-herdr/work.js`, `composer.js`, `feed.js`, `chat.js`, `button.js`, `switch.js`, `settings.js`, `signals.js`, `drawer.js`, and new tests `test/ui-polish.test.mjs`. Not: `pages.js` (Metrics comes in a later step), anything under `engine/`, `layouts/`.

What to do
1. Start task on Ready plans: in `work.js` `planTitle` (around 1503-1508), when `p.status === "ready" && !p.task`, add after the Ready pill `actionButton(c, "bh-plan-start-" + p.id, "Start task", <the same handler plandoc.js:323 uses>, { tone: "primary", icon: "play" })`. Reuse that handler; do not copy its logic.
2. Number answers: in `composer.js` 1139-1146, when the typed text matches `/^[1-9]$/` and n ≤ the question's option count, answer with option n: single-select `answerAsk(q, { picks: [options[n-1].label] })`, multi-select `toggleAsk` on that option. Any other text answers as today.
3. Task links: add `linkTasks(markdown)` next to `linkFiles` in `feed.js:268`. It turns each `t-YYYYMMDD-xxxx` (regex `/\bt-\d{8}-[a-z0-9]{4}\b/`) not already inside a link or code span into a link; clicking it does `setShared(OPEN_TASK, { id, at: Date.now() })` then `showPage("tasks")` (import both from `pages.js`; `work.js:725` already reads `OPEN_TASK`).
4. Accessibility: in `button.js` `body()` (18-34) add `.accessibility_label(tooltip ?? label)`; in `segmented` (`switch.js:46-70`) give each item `.set_position(i + 1, items.length)` and `.selected(item.on)`. Check each method exists in `mods/bot-herdr/gpui-kit.d.ts` first.
5. Remove agent: `settings.js:1179-1182` uses the two-step `arm`/`armed` confirm as task Delete does (`work.js:1057-1063`, `CONFIRM_MS`): the first click relabels it "Remove <name>?", the second removes.
6. Feed keys: in the keybinding list at `composer.js:227` (context `BotHerdr > Input`): `pageup`/`pagedown` scroll the feed one feed height via `feed.js` `scrollBy`; `ctrl-end` does what "Jump to latest" does (`chat.js:1056`).
7. Saved cue: after the roster autosave succeeds (`settings.js:296-305`, `r.code === 0`), set `this.saved = Date.now()` and show `TYPE.xs`, `c.muted` "Saved" where the problem line shows (`settings.js:561`) for 2000 ms; no animation.
8. Seats (step 12, UI half): the Plans rail takes its seats from the team instead of the fixed `SEATS` (`work.js:67`, used at 320, 483, 1793): Orchestrator (fixed), Dev, Design, QA, Research, then each custom agent from `roster(shared(ROSTER_KEY), [])` (as `work.js:446` already does), with `id` = `slug(a.name)`, `name` = `a.name`, `short` = its first three letters with a capital first letter. Seat states (`signals.js` `seatStates`) and leaving a seat off must work for custom seats the same way. Make `SEATS` a function `seats()`; keep the built-in order.
9. Step 3, one line: drop `"--refresh"` from `composer.js:533` (`bhJson(["tools", entry.harness, "--refresh"], …)`); Dev is making the engine's cache notice new skills by folder time.
10. `test/ui-polish.test.mjs`: Node tests on the pure parts only: `linkTasks` (links ids, leaves code spans and existing links alone), the number-answer matcher, and `seats()` with a roster that has one custom agent.

Constraints: follow look.js tokens (TYPE, SPACE, CONTROL) and existing components; no new dependency; functions at or under 20 lines; no other refactors.

Done when
- Each of points 1-9 works as written (say for each how you checked it).
- `npm test` passes except the known Linux failure in `test/mockup-browser.test.mjs:42` (fixed elsewhere).
- `herdr-app check mods/bot-herdr` passes, and `npx -y -p typescript@5 tsc -p mods/bot-herdr/jsconfig.json --noEmit` shows no new TS2304/TS2552 outside `engine/`.
- `git diff --stat` shows only files from your list (plus the user's own pending edits, untouched).

If stuck: if a method is missing from gpui-kit.d.ts or a point conflicts with the code, stop that point, finish the rest, report it under Blockers. Propose design knowledge in your report; do not write it.
