## Summary
Points 1-10 are in. The Plans rail now takes its seats from the team, and the polish items are added: Start task, number answers, task links, accessibility, the two-step Remove, feed keys and the "Saved" cue. Dropped `--refresh`.
Tests, `herdr-app check` and tsc pass. The two npm test failures are outside my files. I did not check any of it in a live window.

## Changes
- `work.js`: the `SEATS` constant is now `seats()` = `seatsOf(roster(shared(ROSTER_KEY), []))`, used by `seatName`, `seatsNow` and `planRail`. `planTitle` shows a primary "Start task" (`play`) button after the Ready pill when `status === "ready" && !p.task`. Its handler is `startPlanTask(p)`, which sends the same `sendFromChat` message as `plandoc.js:323` (see Pushback).
- `signals.js`: `seatsOf(list)` gives the built-in seats in their order, then each custom agent. A custom seat gets `id` = `slug(name)` and `short` = its first three letters with a capital first letter. A custom agent whose slug matches a seat already listed is skipped. Imports `slug` from `roster.js`, which is pure.
- `feed.js`: `TASK_LINK = "bh-task:"`, `linkTasks(markdown)` (skips code fences, code spans and existing links, the same way `linkFiles` does) and `taskTarget(url)`.
- `chat.js`: the feed's markdown is now `linkTasks(linkFiles(...))` in both places. `openFeedLink(url)`: for a task link it calls `setShared(OPEN_TASK, { id, at })` then `showPage("tasks")`; any other link goes to `openLink` as before. Actions `bot_herdr_page_up`/`page_down`/`latest` on the chat root. `page(sign, total, cx)` scrolls one feed height (`this.room`) through `scrollBy`. `latest(cx)` is now shared with "Jump to latest".
- `composer.js`: bound `pageup`, `pagedown` and `ctrl-end` in `BotHerdr > Input`. In `send()`, a lone digit that matches an option answers with it (`answerAsk` for single-select, `toggleAsk` for multi-select). Dropped `--refresh` from `launchArgv`.
- `drawer.js`: `numberPick(typed, question)`, the pure matcher.
- `button.js`: `body()` adds `.accessibility_label(tooltip ?? label)` when there is one. Icon-only buttons with no tooltip have no text to give it.
- `switch.js`: each `segmented` item gets `.set_position(i + 1, items.length)` and `.aria_selected(item.on)`.
- `settings.js` (built on the user's pending edits): `MoreSheet.removeButton` is a two-step Remove using `arm`/`armed` from plandoc.js. The button first reads "Remove agent", then "Remove <name>?" for 5 s. `Settings.markSaved` runs after a successful roster save and shows a `TYPE.xs` muted "Saved" where the problem line goes, for `SAVED_MS` = 2000. No animation.
- `test/ui-polish.test.mjs`: tests `linkTasks`/`taskTarget`, `numberPick`, and `seatsOf` with one custom agent (including `seatStates` for its panel).

## Brief Check
1. Start task: met. The button appears only on Ready plans with no task. Checked by reading the code and `herdr-app check`; not drawn live.
2. Number answers: met. Unit-tested the matcher. In `send()`, any other text still answers as typed text.
3. Task links: met. Unit-tested the linking. The click path is in `openFeedLink`, and `work.js:725` already reads `OPEN_TASK`.
4. Accessibility: met, with one deviation. `accessibility_label` and `set_position` exist in gpui-kit.d.ts (lines 1003 and 980). `selected()` there "Reports the selected state of a `Button`", and for plain elements the typings say to use `aria_selected` (line 1021), so I used that.
5. Remove agent: met. It is the same `arm`/`armed` pattern and the same `CONFIRM_MS` as the task Delete.
6. Feed keys: met. Bindings are in the composer's list, handlers on the chat root, and the action bubbles up from the focused input. Not pressed live.
7. Saved cue: met. It shows only when `r.code === 0` and there is no problem line, and a timer redraws it away after 2000 ms.
8. Seats: met. Unit-tested `seatsOf` and `seatStates` for a custom seat. The off toggle passes the custom id to `bh plan seat <id> --off`; the engine accepting that id is Dev's half.
9. `--refresh` dropped: met (composer.js `launchArgv`).
10. Tests: met. 3 tests, all pass.
- npm test: met. The only failures are `test/headless.test.mjs` "standard access", where `claudeEnv` keeps `IS_SANDBOX` because we run as root (engine code, plus the user's pending edit to that test file), and `findBrowser on Windows` (the known mockup-browser failure).
- `herdr-app check mods/bot-herdr`: passed.
- tsc: no TS2304 or TS2552 outside `engine/`.
- git diff --stat: only files on my list are mine. The other changed files are the user's pending edits, plus Dev's `engine/lib/team.mjs`.

## Verification
- `node --test test/ui-polish.test.mjs test/signals.test.mjs test/files.test.mjs test/round5.test.mjs`: 25 pass, 1 skipped
- `npm test`: 2 failures, both outside my files (above)
- `~/.local/bin/herdr-app check mods/bot-herdr`: check passed (`herdr-app` is not on PATH)
- `npx -y -p typescript@5 tsc -p mods/bot-herdr/jsconfig.json --noEmit | grep -E "TS2304|TS2552" | grep -v engine/`: empty

## Design choices
- Start task: tone primary, icon play, placed after the Ready pill in `planTitle`'s row (SPACE[3] gap)
- Saved cue: TYPE.xs, c.muted, 2000 ms, no motion

## Pushback
**Request:** "Reuse the handler plandoc.js:323 uses; do not copy its logic."
**Reason:** that handler is an inline arrow in `plandoc.js`, which is not on my file list, so I could not extract it from there.
**Alternative:** I put it in `work.js` as `startPlanTask(p)`. Whoever owns `plandoc.js` should replace the inline arrow at :323 with it, ideally after moving `startPlanTask` to `pages.js` next to `sendFromChat`, which avoids a work↔plandoc import cycle. Until then the message text exists in two places.

## Notes
- `aria_selected` on a plain div may announce nothing without a `role` (the typings say this for `aria_active_descendant`). Adding `.role("tab")` on the items and `"tab_list"` on the track would complete it; I did not add it because the brief did not ask.
- The brief asked to test `seats()`, but `work.js` cannot load under Node, so the pure part is `signals.js` `seatsOf` and the test covers that. `seats()` in work.js is a one-line wrapper.

## Knowledge Proposals
- In-app links with custom schemes follow `bh-file:`: feed.js builds the link (pure), and the click handler routes the scheme (chat.js `openFeedLink` for `bh-task:`, viewer.js `openLink` for files).
- gpui `selected()` is for Button only; a plain-div option takes `aria_selected` (and likely needs a `role`).
- Planning seats come from `signals.js` `seatsOf(roster)`: the built-in five, then custom agents by slug.
