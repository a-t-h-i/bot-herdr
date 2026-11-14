## Summary
Step 15 finished end to end: the chat feed carries one live tracker card per active task, drawn from the task's own JSON every 5 s, with the reference's header (title, working chip, done/total, usage), the joined step timeline, branch events, the live action word with elapsed time and the dashed amber "Needs you" ring and pill that opens the question. Step 20 UI: pure `usageText(u)` in steps.js, shown on the tracker header after done/total, on the task page's header meta row, and beside each step's time.

## Changes
- `mods/bot-herdr/steps.js` — added `usageText(u)` (`12.4k tokens · $1.23 · 38 min`; zero parts left out; `""` without usage); `trackerModel` now carries the task's `usage` through to the card. Reading both engine shapes was already there (`stepEvents`, `stepRow` fall back to today's `board` when `steps[].events` is absent).
- `mods/bot-herdr/tracker.js` — header shows the usage line after done/total, on the open header (line 50) and on a finished task's folded line (line 56); new `quiet()` for a muted fact (line 63).
- `mods/bot-herdr/chat.js` — `loadTrackers` (453) no longer refetches a card that has folded, and notifies while any tracked step is active so the live elapsed time keeps counting; the rest of the step-15 wiring (`trackTask` 447, `trackerCard` 609, `trackerView` 617, `trackerActions` 649, `askingNames` 659, `openStepQuestion` 664, `showTaskCard` 675) was already in the working tree and was kept.
- `mods/bot-herdr/work.js` — task page header meta row shows the task's usage after its status and track (line 1077); each step's row shows the step's usage beside its time (line 1179).
- `test/steps.test.mjs` — `usageText` cases (tokens+cost+minutes, minutes only, all zero, missing) and `trackerModel`'s usage passthrough/null.
- Design choices: usage sits in the task page's header facts row (`taskFacts`), the line under the title with the status pill and track, not in the `worked …` progress line, so the two durations never read as the same number; a live step's elapsed time refreshes on the existing `TASKS_MS` (5 s) poll rather than a new timer.

## Brief Check
Step 15, element by element:
- Title, working agents' chip, done/total: `tracker.js:42` (title), `tracker.js:48` with `chip()` at `68`, `tracker.js:43` (count). Model: `steps.js:94-109`.
- Timeline of steps joined by one line: `tracker.js:74` (`steps()`); the line is `connector()` at `tracker.js:90` — grey under a step, accent-filled as the step finishes, a travelling accent dot under the active one.
- Each step with its agent's icon, title and time: `tracker.js:118` (`agentBadge` from `railview.js:14`, the rail's own badge), `tracker.js:119` (title), `tracker.js:124` (time).
- A step opens to its events on a branch of the line: `tracker.js:158` (`events()`, branch line at `BRANCH`, dots per event) and `tracker.js:176` (`eventRow`), opened by `chat.js:631` (`acts.needs`/`acts.step` → `toggleStep` at `chat.js:641`).
- Active step's live action word and elapsed time: `tracker.js:142` (`live()`), word from `shimmerWord` at `tracker.js:145` (`indicators.js:321`), time at `tracker.js:146`; the word comes from the agent's live terminal line via `chat.js:649` (`trackerActions` → `actionWord`).
- Needs-you: dashed amber ring at `tracker.js:132` (`border_dashed().border_color(c.warning)`), pill at `tracker.js:150`; the click opens the agent's question in the composer drawer (`chat.js:664-669`, falling back to its terminal when the question is gone).
- Updates in place, no reload: `chat.js:438-439` (each 5 s poll of the chat), `chat.js:447` (`trackTask` adds one card per task), `chat.js:453-465` (`loadTrackers` re-reads `bh task show <id> --json` and `cx.notify()`s only on change, or every tick while a step is active), `chat.js:1052` (the card is drawn from that state each frame).
Step 20 UI:
- `usageText` returns exactly `12.4k tokens · $1.23 · 38 min` for `{tokens:12400,costUsd:1.2345,minutes:38}`; `38 min` for minutes only; `""` for missing/all-zero — `test/steps.test.mjs:77-93`.
- Tracker header after done/total: `tracker.js:50` (open) and `:56` (folded).
- Task page: header meta row `work.js:1077`; each step beside its time `work.js:1179`.
- `git diff --stat` for my session's edits touches only `chat.js`, `work.js`, and the new `steps.js`, `tracker.js`, `test/steps.test.mjs`; the tree also holds Dev's in-progress `engine/` edits and earlier Design edits to `indicators.js`, `plandoc.js`, `railview.js` from the run that was cut off, which I did not modify this session.

## Verification
- `timeout 300 node --test test/steps.test.mjs` — 8 tests, `ℹ tests 8 / ℹ pass 8 / ℹ fail 0`.
- `node mods/bot-herdr/engine/bh.mjs check` — `Ran: 0 lint, 0 typecheck, 253 tests (full suite)` / `PASS: 252 tests pass, 1 skipped; no lint or typecheck is set up`.
- `herdr-app check mods/bot-herdr` — `check passed: mods/bot-herdr`.
- `npx -y -p typescript@5 tsc -p mods/bot-herdr/jsconfig.json --noEmit` — exit 1 from pre-existing TS7006/TS2345 noise; `TS2304`/`TS2552` outside `engine/`: 0.
- Without the change: with `usageText` stubbed to `""` and `usage` removed from `trackerModel`, the two new tests fail (`ℹ pass 6 / ℹ fail 2`), and pass again restored (`ℹ pass 8 / ℹ fail 0`).
- Engine shapes: the repo engine's `task show --json` gives `done`, `total`, `usage`, `steps[].events/agentName/elapsedMs/usage`; the installed engine's gives only `worked`, `board` and the old step fields, so the fallback in `steps.js:60` and the hidden empty usage is what the app shows until install.
- Not verified by running the surface: gpui cannot launch headless here, so the card was checked by `herdr-app check` + `tsc`, not by a rendered frame.

## Knowledge Proposals
- The installed engine's `bh task show --json` still has no `events`/`usage`/`done`/`total`; the tracker must keep reading both shapes until the repo engine is installed (steps.js `stepEvents`/`stepRow`/`trackerModel` are that shim).
- gpui has no dashed-at-an-angle or rotate: a "ring" that needs attention is a `border_2().border_dashed()` circle plus an opacity loop; a travelling `loop("top")` dot is the moving part.

## Script Proposals
- None.
