Goal: finish steps 14, 20 (engine half) and 21 of task t-20261113-n9rt ("Make the team hand off, verify and show its work reliably"). A Dev before you wrote most of this, uncommitted in the working tree, and was cut off by an app restart before it was wired up and tested. Finish it; don't start over.

Files you own (all under mods/bot-herdr/engine/ unless noted): bh.mjs, lib/agent.mjs, lib/runner.mjs, lib/tasks.mjs, lib/knowledge.mjs, lib/core.mjs (only if needed), plus new tests in test/ (test/usage.test.mjs, test/detail.test.mjs, test/knowledge-inbox.test.mjs; or extend test/engine.test.mjs / test/headless.test.mjs where their helpers fit). Leave alone: every UI file (chat.js, steps.js, tracker.js, work.js, railview.js, indicators.js, plandoc.js, test/steps.test.mjs): Design is editing them right now.

Read first: `git diff mods/bot-herdr/engine` (the work so far), board entry 15 (`node mods/bot-herdr/engine/bh.mjs board read t-20261113-n9rt`), and the plan's acceptance criteria (`bh plan show p-20261113-bkli`).

What to do:
1. lib/agent.mjs:323 throws `ReferenceError: appendJsonl is not defined`. Import `appendJsonl` from ./core.mjs (it's exported at core.mjs:93). This breaks most of test/headless.test.mjs right now.
2. bh.mjs `knowledge add` calls `K.recordSource(...)`, which does not exist. Delete that line; `knowledge inbox` matches by text, so nothing needs a source record.
3. Step 20: `bh usage` must show minutes only for harnesses that report no tokens. In `usageLine`, when a group's input, output and cache are all 0 and costUsd is 0, print `<agent> (<model>): <turns> turns, <minutes> min`; otherwise keep the current line.
4. Step 21, second half: `K.forBrief` (lib/knowledge.mjs:108) cuts mid-file at `max` characters. Make it cut by section: split the text on lines starting `## `, keep the part before the first section and then whole sections in file order while the running length stays within `max`, and end with `[… cut: <names of the sections left out, comma-separated>; the whole file is in \`bh knowledge <agent>\`]`. If the first section alone is over `max`, keep that section's lines up to the last whole `- ` entry that fits, and name the section in the cut line. Keep `forBrief(root, agent, max = 8000)` as the signature.
5. Tests, each one failing without its change:
   - `T.taskDetail`: a task with a board post on step 1, a `step.report`, a checks.jsonl receipt for step 1 with `counts: {pass: 3, total: 4}`, and a merged child for step 1 with `stat: {added: 5, removed: 2}` gives step 1 `events` with kinds board, report, check, merge, oldest first, `detail` `3/4 tests` and `+5 −2`; `agentName`, `elapsedMs` (an active step counts its running time), `done`/`total`, and `usage` on the step and on the task.
   - Usage capture: a Claude `result` event with `usage` and `total_cost_usd`, and a Codex `turn.completed` event with `usage`, each give one usage record (DATA/usage/<key>.jsonl and the task's usage.jsonl) with those numbers. Use the fake-harness pattern in test/headless.test.mjs. A harness that sends no usage gives a record with `ms` only.
   - `bh usage --task <id>` prints the token line for a Claude record and the minutes-only line for a pi record; `bh usage` with nothing recorded prints `No usage recorded.`
   - `bh knowledge inbox --task <id>` lists a report's Knowledge Proposals bullets with their file, leaves out one already in a knowledge file, and prints `No new proposals.` when none are left.
   - `forBrief`: a file over the budget keeps whole sections and names the cut ones; a file under budget comes back unchanged.
6. Run `timeout 400 node --test test/*.test.mjs` (all pass except the one skip that was already there), `node mods/bot-herdr/engine/bh.mjs check` (PASS), and `herdr-app check mods/bot-herdr` (check passed).

Contracts (Design's tracker and task page read these; don't change the shapes):
- Board entry 15: `bh task show <id> --json` gives each step `events` (oldest first; each `{ at, kind, text, detail, from }`, kind board|report|check|merge), `agentName` and `elapsedMs`; the task gets `done` and `total`.
- Usage: each step gets `usage` and the task gets `usage`, both `{ tokens, costUsd, minutes }` from `T.usageTotals`. A harness with no token report gives `tokens: 0, costUsd: 0`.

Constraints: no new dependencies, no refactors outside these steps, functions at or under 20 lines. `bh` on your PATH is the installed copy, which lags this repo and has no `bh report`: run the repo engine instead, `node mods/bot-herdr/engine/bh.mjs …`.

Done when: every check in step 6 passes with its output quoted in your report; each test in step 5 exists and fails when you revert its change (say which you tried that on); `git diff --stat` touches only the files you own.

Report: write .bot-herdr/tasks/t-20261113-n9rt/reports/dev-finish.md (Summary, Changes, Brief Check, Verification, Knowledge Proposals), then run `node mods/bot-herdr/engine/bh.mjs report t-20261113-n9rt --step 14 --file .bot-herdr/tasks/t-20261113-n9rt/reports/dev-finish.md "<one-line summary>"`, the same for --step 20 and --step 21, and `hc send` your parent the summary and the path.

If stuck: if the code doesn't match this brief (a function missing or a shape already used differently), stop that part, finish the rest, and report it under Blockers. Don't invent a workaround.
