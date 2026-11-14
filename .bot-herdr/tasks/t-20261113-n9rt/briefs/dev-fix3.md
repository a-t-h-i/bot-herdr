Goal: fix QA gate 3's two blocking findings, plus four small engine findings, on task t-20261113-n9rt (steps 14 and 20). The whole review is at .bot-herdr/tasks/t-20261113-n9rt/reports/qa-gate3.md; read its Findings section first.

Files you own: mods/bot-herdr/engine/lib/tasks.mjs, mods/bot-herdr/engine/lib/agent.mjs, mods/bot-herdr/engine/lib/runner.mjs, mods/bot-herdr/engine/lib/core.mjs, mods/bot-herdr/engine/lib/knowledge.mjs, mods/bot-herdr/engine/bh.mjs, test/detail.test.mjs, test/headless.test.mjs, test/knowledge-inbox.test.mjs, test/store.test.mjs. Leave alone: every UI file (chat.js, work.js, steps.js, tracker.js, railview.js, indicators.js, plandoc.js). Another session is editing chat.js right now.

What to do:
1. [major] Reports and merges show twice on a step's timeline. In `stepEvents` (tasks.mjs, about line 287), leave out board entries whose kind is `done` and that carry a `file` (a report's record), and leave out `done` entries whose text starts with `Merged ` (a merge's record). Both already have their own `report` / `merge` event. Rebuild the test in test/detail.test.mjs through the real paths: `T.report(...)` for the report, and the same task.children merged entry plus `done "Merged …"` board post that `bh merge` writes (bh.mjs:739-741; call the shared function if one exists, otherwise post exactly what it posts). Assert one event of each kind.
2. [major] The task page reads `bh task list --all --json`, which has no usage. Make `bh task list` (`listTasks` / the `task list` JSON) give each task `usage` and each of its steps `usage`, both `{ tokens, costUsd, minutes }` from `T.usageTotals` over that task's usage.jsonl. That's the same shape `taskDetail` gives. Change nothing else in the list output. Add a test: a task with two usage records on step 1 lists `usage` on the task and on step 1, and `{ tokens: 0, costUsd: 0, minutes: 0 }` on a step without any.
3. [minor] agent.mjs `recordUsage` must never fail a turn. Wrap its body in try/catch (ignore the error), and skip `T.recordUsage` when the task's task.json no longer exists.
4. [minor] Codex input is over-counted: runner.mjs codexTurn records `input: input_tokens - cached_input_tokens` (not below 0) when both are numbers. Update the Codex fixture's expected numbers in test/headless.test.mjs.
5. [minor] core.mjs stale-lock give-back (about lines 191-199): instead of `renameSync(stale, lock)`, use `linkSync(stale, lock)` followed by unlinking `stale`. If the link fails because `lock` exists, unlink `stale` and back off as a lost takeover. Keep every existing store test passing.
6. [info] knowledge.mjs `forBrief`: count the newline between the head and the first section, and never print a cut line that names no section. Add the `md.length === max + 1` case to test/knowledge-inbox.test.mjs.

Done when:
- `timeout 500 node --test test/*.test.mjs` passes (one pre-existing skip only).
- `node mods/bot-herdr/engine/bh.mjs check` prints PASS.
- `node mods/bot-herdr/engine/bh.mjs task show t-20261113-n9rt --json` gives steps 6, 9, 10 and 11 one `report` event each and no `board`/`done` twin. Quote it.
- `node mods/bot-herdr/engine/bh.mjs task list --all --json` has `usage` on each task. Quote one.
- Tests 1, 2 and 6 fail when you revert their change. Say that you tried it.

Constraints: no new dependencies, functions at or under 20 lines, no other refactors. Use `node mods/bot-herdr/engine/bh.mjs …` for every bh command; the installed `bh` lags this repo.

Report: write .bot-herdr/tasks/t-20261113-n9rt/reports/dev-fix3.md (Summary, Changes, Brief Check, Verification, Knowledge Proposals), run `node mods/bot-herdr/engine/bh.mjs report t-20261113-n9rt --step 14 --file .bot-herdr/tasks/t-20261113-n9rt/reports/dev-fix3.md "<one-line summary>"`, then `hc send` your parent the summary and the path.

If stuck: if the code doesn't match this brief, stop that part, finish the rest, and report it under Blockers.
