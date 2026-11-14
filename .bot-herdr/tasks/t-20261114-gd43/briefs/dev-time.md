Goal: step 1 of task t-20261114-gd43 ("Fix the time worked timer"). The user reports that a task's time worked starts when the task is planned, never stops even after the agents stop, and is far too large. The cause: a step's clock runs from the moment it goes `active` until someone marks it done or files a report (tasks.mjs `worked`, `taskDetail` elapsedMs). So a dead or idle agent's step ticks for ever, and the task total adds up parallel steps (the last task showed 4492 min). From now on, time worked comes only from the agents' turns, which every turn already records in the task's usage.jsonl (`at` = when the turn ended, `ms` = how long it ran, `step`, `agent`; see agent.mjs `recordUsage`).

Files you own: mods/bot-herdr/engine/lib/tasks.mjs, mods/bot-herdr/engine/bh.mjs, plus tests (a new test/worked.test.mjs; update test/detail.test.mjs and any existing test that asserts the old running-clock numbers). Leave alone: every UI file (work.js, steps.js, tracker.js, chat.js). Design is changing those against the contract below.

What to do:
1. In tasks.mjs, add `stepTime(records, step)`: the sum of `ms` of the records whose `step` equals the step's `n`. Add `taskTime(records)`: the total length of the union of the intervals `[Date.parse(at) - ms, Date.parse(at)]` over all records, so overlapping turns (parallel agents) count once. Ignore a record with no finite `ms` or no parseable `at`.
2. Replace `worked(task, at)` with `worked(root, task)`. It reads `usageOf(root, task.id)`. When there are records it returns `taskTime(records)`; when there are none (a task from before usage was recorded) it returns the sum of the steps' stored `workedMs`, with no running part. Update every caller: bh.mjs:325, `taskText` at tasks.mjs:356 (give `taskText` the number through its options, or pass `root`; pick the smaller change and say which), and anything else `grep -n "worked(" mods/bot-herdr/engine` finds.
3. `taskDetail` and `listTasks`' `withUsage` give each step `timeMs` (from `stepTime`, or the step's stored `workedMs` when the task has no records) and the task `timeMs` (from `worked`). In `taskDetail`, set `elapsedMs` to the step's `timeMs`, which drops the running part. The `bh task show` text line "agents worked N min" uses the same number.
4. Leave the stored `workedMs`/`started` bookkeeping in `moveStep`/`stopClock` as it is. Only what is reported changes.
5. Tests, each failing without its change:
   - Two records on step 1 that overlap in time (for example 10 min each, 5 min apart) and one on step 2: step 1 `timeMs` is 20 min, the task `timeMs` is the union.
   - An `active` step with `started` an hour ago and no records reports 0 (not an hour), in both `task show --json` and `task list --json`.
   - A task with no usage records and a stored `workedMs` reports that figure, and it does not grow over time.
   - The text "agents worked N min" matches the task `timeMs`.

Contract (Design reads this; don't change it):
`bh task list --json` and `bh task show --json` give each step `timeMs` and the task `timeMs`, as defined above. Nothing in `timeMs` grows between turns, and a running turn is not in it. `elapsedMs` on `task show` equals the step's `timeMs`.

Constraints: no new dependencies, functions at or under 20 lines, no other refactors. Use `node mods/bot-herdr/engine/bh.mjs …` for bh commands.

Done when: `timeout 500 node --test test/*.test.mjs` passes (one pre-existing skip only), and `node mods/bot-herdr/engine/bh.mjs check` prints PASS. In your report, quote `node mods/bot-herdr/engine/bh.mjs task show t-20261113-n9rt --json` (the last big task) giving the task `timeMs` in minutes, against the old 4492 min.

Report: write the report file this brief's footer names, record it with `bh report` (with `--step 1`), and `hc send` your parent the summary and the path.

If stuck: if the code doesn't match this brief, stop that part, finish the rest, and report it under Blockers.
