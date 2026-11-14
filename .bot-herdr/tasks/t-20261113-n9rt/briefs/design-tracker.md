Goal: finish step 15 (the live task tracker card in the chat) and the UI half of step 20 (usage on the task page and the tracker) of task t-20261113-n9rt. A Design before you wrote most of step 15, uncommitted in the working tree, and was cut off by an app restart. Finish it; don't start over.

Files you own: mods/bot-herdr/steps.js, mods/bot-herdr/tracker.js, test/steps.test.mjs, mods/bot-herdr/chat.js, mods/bot-herdr/work.js, mods/bot-herdr/railview.js, mods/bot-herdr/indicators.js, mods/bot-herdr/plandoc.js. Leave alone: everything under mods/bot-herdr/engine/ and the engine tests: Dev is editing them right now.

Read first: `git diff` and `git status` for the files above (the work so far), the plan's step 15 and acceptance criteria (`bh plan show p-20261113-bkli`), board entries 3 and 15 (`bh board read t-20261113-n9rt`), and the reference mockup .bot-herdr/plans/p-20261113-bkli/work/tracker-reference.jpg.

What to do:
1. Step 15, as the plan states it: a tracker card in the chat that matches the reference's layout. It has the title, the working agents' chip and done/total; a timeline of steps joined by one line, each with its agent's icon, title and time; a step opens to show its events on a branch of the line; the active step carries a live action word ("Writing", "Running tests") and its elapsed time; a step that needs you shows a dashed amber ring and a "Needs you" pill that opens its question. The card updates in place as steps start, gain events and finish, with no reload. Finish what is missing and make it work end to end in chat.js.
2. Step 20 UI: add a pure `usageText(u)` to steps.js. With `u = { tokens, costUsd, minutes }` it returns `12.4k tokens · $1.23 · 38 min`: tokens as `k` with one decimal at 1000 or more; the token and cost parts left out when they are 0, so a harness without tokens shows only `38 min`; an empty string when `u` is missing or everything is 0. Show it in two places. On the tracker header, after done/total. On the task page (work.js), the task's `usage` in its header meta line, and each step's `usage` beside that step's time.
3. Tests in test/steps.test.mjs for `usageText` (token, cost and minutes; minutes only; empty) and for every pure helper you add or change, each failing without its change.
4. Run `timeout 300 node --test test/steps.test.mjs`, `node mods/bot-herdr/engine/bh.mjs check` (PASS), `herdr-app check mods/bot-herdr` (check passed), and `npx -y -p typescript@5 tsc -p mods/bot-herdr/jsconfig.json --noEmit`, reading the TS2304/TS2552 errors outside engine/ (there must be none in your files).

Contracts (Dev is building these in the repo engine; read both shapes, as steps.js already does, because the installed engine the chat calls lags the repo):
- Board entry 15: `bh task show <id> --json` gives each step `events` (oldest first; each `{ at, kind, text, detail, from }`, kind board|report|check|merge), `agentName` and `elapsedMs`; the task gets `done` and `total`. The live "what it is doing now" isn't in the JSON: map a step's agent to its live terminal and read `doing[address]`, as the rail does.
- Usage: each step has `usage` and the task has `usage`, both `{ tokens, costUsd, minutes }`; they may be missing (older engine), and then nothing is shown.

Constraints: gpui-kit has no rotate or transform, and `.loop()` takes no delay. Check mods/bot-herdr/gpui-kit.d.ts before you use a style method. No new dependencies, functions at or under 20 lines, and reuse look.js tokens and the rail's `agentBadge`. `bh` on your PATH is the installed copy and has no `bh report`: run `node mods/bot-herdr/engine/bh.mjs …` for report and check.

Done when: every check in step 4 passes with its output quoted in your report; the card shows each element in step 1 (say for each where it is drawn: file:line); `usageText` returns exactly the strings above; `git diff --stat` touches only the files you own.

Report: write .bot-herdr/tasks/t-20261113-n9rt/reports/design-tracker.md (Summary, Changes, Brief Check, Verification, Knowledge Proposals), then run `node mods/bot-herdr/engine/bh.mjs report t-20261113-n9rt --step 15 --file .bot-herdr/tasks/t-20261113-n9rt/reports/design-tracker.md "<one-line summary>"` and `hc send` your parent the summary and the path.

If stuck: if the code or the data doesn't match this brief, stop that part, finish the rest, and report it under Blockers. Don't invent a workaround.
