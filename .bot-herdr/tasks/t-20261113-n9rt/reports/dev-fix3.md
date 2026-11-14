## Summary
Fixed gate 3's two majors and four engine findings. A step's report and merge each show once on its timeline, and `bh task list --json` now carries `usage` per task and per step, which is what the task page reads.

## Changes
- `mods/bot-herdr/engine/lib/tasks.mjs`
  - `stepEvents` (line 292-297): new `echo(e)` helper skips a board entry that is a report's record (`kind === "done"` and it carries a `file`) or a merge's record (`done` text starting `Merged `). Both already have their own `report` / `merge` event.
  - `listTasks` (line 44-58): new private `withUsage(root, task)` adds `usage` to the task and to each step, `{ tokens, costUsd, minutes }` from `usageTotals` over the task's `usage.jsonl`, exactly the shape `taskDetail` gives. Nothing else in the list changed (`taskLine` output is unchanged).
- `mods/bot-herdr/engine/lib/agent.mjs:311-328`: `recordUsage` wrapped in try/catch (errors ignored, so a lock timeout never fails the turn), and `T.recordUsage` is skipped when the task's `task.json` is gone (`exists(join(store(root, "tasks", task), "task.json"))`). Imports `exists` and `store` from core.
- `mods/bot-herdr/engine/lib/runner.mjs:346-352`: Codex's `input` is now `input_tokens - cached_input_tokens`, floored at 0, when both are numbers; `cacheRead` stays, so the total is not counted twice.
- `mods/bot-herdr/engine/lib/core.mjs:192-202`: the stale-lock give-back uses `linkSync(stale, lock)` then unlinks `stale` instead of `renameSync`, so it can never replace a lock another waiter just took; a failed link unlinks `stale` and backs off as a lost takeover. `linkSync` added to the `node:fs` import.
- `mods/bot-herdr/engine/lib/knowledge.mjs:132-147`: `forBrief` counts the newline between the head and the first section (`size = head.length + 1`), gives `entriesThatFit` the remaining budget (`max - size`), and prints the cut line only when it names a section.
- `test/detail.test.mjs`: rewritten to build the timeline through the real paths (`T.post`, `T.report`, `T.recordCheck`, the merged child + the exact `done "Merged fix-x: 2 files, +5 −2"` post `bh merge` writes at bh.mjs:739-741, `T.recordUsage`) and to assert one `report` and one `merge` event. New test "task list: usage on the task and on each step…" with two usage records on step 1 and a step without any.
- `test/headless.test.mjs:376`: Codex fixture expectation `[40, 8, 2]` → `[38, 8, 2]`.
- `test/knowledge-inbox.test.mjs:78-81`: the `md.length === max + 1` case; asserts no `cut: ;` and that `Decisions` is named.

## Brief Check
- [major] Reports and merges show twice — met. Filter in `stepEvents`; test through `T.report` and the merge post; `bh task show` on this task now gives steps 6, 9, 10 and 11 exactly one `report` event and no `board`/`done` twin (quoted under Verification).
- [major] `bh task list` carries usage — met. Each task and each step has `usage`; test "task list: usage on the task and on each step, none on a step without a turn"; live list quoted under Verification.
- [minor] `recordUsage` never fails a turn — met. Body in try/catch, task-file existence checked before `T.recordUsage`.
- [minor] Codex input not over-counted — met. `input - cacheRead`, floored at 0; fixture updated to `[38, 8, 2]`.
- [minor] Stale-lock give-back — met. `linkSync` + unlink, lost takeover on a failed link. All store tests pass (full suite below).
- [info] `forBrief` off-by-one — met. Newline counted, no unnamed cut line; new `md.length === max + 1` assertion.
- `node --test test/*.test.mjs` passes with one pre-existing skip — met (254 tests, 253 pass, 1 skipped).
- `bh check` prints PASS — met.
- Reverting tests 1, 2 and 6 makes them fail — met, tried.

## Verification
- `timeout 500 node --test test/*.test.mjs` — 254 tests, 253 pass, 1 skipped, 0 fail (30.9 s).
- `timeout 300 node --test test/detail.test.mjs test/knowledge-inbox.test.mjs` — 4 pass, 0 fail; the two new detail tests pass.
- Reverted `tasks.mjs` (`!echo(e)` → `true`, dropped `.map(withUsage)`) and `knowledge.mjs` (old sizing) in one go, then ran the two test files — all three tests failed:
  - timeline: `actual: ['board:contract', 'board:done', 'board:done', 'check:3/4 tests', 'merge:+5 −2', 'report:reports/dev.md']`
  - list: `actual: undefined` for the task's `usage`
  - forBrief: text still ended `[… cut: ; the whole file is in `bh knowledge dev`]`
  Then restored all three edits and re-ran green.
- `node mods/bot-herdr/engine/bh.mjs task show t-20261113-n9rt --json` — one `report` event per step, no board twin:
  - `{"n":6,"events":["report:.bot-herdr/tasks/t-20261113-n9rt/reports/dev-store.md"]}`
  - `{"n":9,"events":["report:.bot-herdr/tasks/t-20261113-n9rt/reports/dev-verify.md"]}`
  - `{"n":10,"events":["report:.bot-herdr/tasks/t-20261113-n9rt/reports/dev-gate.md"]}`
  - `{"n":11,"events":["report:.bot-herdr/tasks/t-20261113-n9rt/reports/dev-worktree.md"]}`
- `node mods/bot-herdr/engine/bh.mjs task list --all --json` — `{"id":"t-20261113-n9rt","usage":{"tokens":2881844,"costUsd":1.7914,"minutes":7.41},"step1":{"tokens":0,"costUsd":0,"minutes":0},"steps":22}`; every task in the list has `usage`.
- `node mods/bot-herdr/engine/bh.mjs check` — `PASS: 253 tests pass, 1 skipped; no lint or typecheck is set up` (254 tests, 0 fail, 71 s).

## Knowledge Proposals
- `bh task list --json` now adds `usage` per task and per step (`listTasks` → `withUsage`); `task show` readers and the task page share one usage shape from `usageTotals`.
- `stepEvents` shows a report or a merge once: their `done` board entries (`file` set, or text starting `Merged `) are the record, not a second event.

## Script Proposals
None.

## Blockers
None.
