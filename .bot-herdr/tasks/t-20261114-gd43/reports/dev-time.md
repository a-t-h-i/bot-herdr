## Summary
Time worked now comes only from the turns recorded in `usage.jsonl`: a step's `timeMs` sums its turns, the task's `timeMs` merges their intervals so parallel turns count once. The running step clock no longer adds anything; t-20261113-n9rt now reads 700457 ms (12 min) instead of the old 4492 min.

## Changes
- `mods/bot-herdr/engine/lib/tasks.mjs`
  - Added `stepTime(records, step)` (sum of `ms` of records whose `step` equals the step's `n`) and `taskTime(records)` (union of the `[at − ms, at]` intervals), sharing a `turnSpan(r)` helper that returns null for a record with no finite `ms` or unparseable `at`; both skip those.
  - `worked(task, at)` → `worked(root, task)`: `usageOf` records when present → `taskTime(records)`; otherwise the sum of the steps' stored `workedMs`, no running part. `moveStep`/`stopClock` bookkeeping untouched.
  - `withUsage` (so `bh task list --json`): each step `timeMs` (its turns, or its stored `workedMs` when the task has no records) and the task `timeMs` from `worked`.
  - `taskDetail` (so `bh task show --json`): same `timeMs` per step and on the task; `elapsedMs` is now the step's `timeMs`, running part dropped (the unused `Date.now()` read went with it).
  - `taskText`: takes the number through its options (`{ workedMs }`) rather than `root` — the smaller change, since `bh task show` already has the value in `detail.timeMs` and this avoids a second `usage.jsonl` read.
- `mods/bot-herdr/engine/bh.mjs:325-327`: `worked: T.worked(root, task)` replaced by `worked: detail.timeMs` (same number, one read), and the text call passes `workedMs: worked`. The `worked` field stays on `task show --json` so `steps.js`'s fallback keeps working; nothing UI changed.
- `test/detail.test.mjs`: usage record given an `at`; assertions now `one.timeMs/elapsedMs = 60000`, `two.elapsedMs = 0`, `detail.timeMs = 60000`.
- `test/engine.test.mjs`: `T.worked(root, task)`.
- `test/worked.test.mjs` (new): overlapping turns (step 20 min, task union 25 min, running step adds nothing), active step started an hour ago reporting 0 via `task show --json` and `task list --json`, no-record fallback to stored `workedMs` (7 min, not 67), and the text's "agents worked 15 min" matching `timeMs`.

## Brief Check
- `timeout 500 node --test test/*.test.mjs` passes with one pre-existing skip — met: 258 tests, 257 pass, 0 fail, 1 skipped.
- `node mods/bot-herdr/engine/bh.mjs check` prints PASS — met: `PASS`, 110 tests pass, no lint/typecheck set up.
- Quote `task show t-20261113-n9rt --json` task `timeMs` in minutes vs old 4492 — met: `timeMs: 700457` → 11.67 min, text line `agents worked 12 min` (was 4492 min). Its two records: `qa-gate3` 444317 ms with `step: null` (counts in the task union only) and `dev-fix3` 256140 ms on step 14 (step 14 `timeMs` = 256140); the intervals do not overlap (51 s gap), so the union is their sum.

## Verification
- `timeout 300 node --test test/worked.test.mjs test/detail.test.mjs test/engine.test.mjs` — 18 tests, 18 pass
- `timeout 500 node --test test/*.test.mjs` — 257 pass, 1 skip, 0 fail
- `timeout 500 node mods/bot-herdr/engine/bh.mjs check` — `PASS`, 110 tests pass
- `node mods/bot-herdr/engine/bh.mjs task show t-20261113-n9rt --json` — `timeMs: 700457` (11.67 min)
- `node mods/bot-herdr/engine/bh.mjs task show t-20261113-n9rt` — `agents worked 12 min`

## Knowledge Proposals
- Per-task `usage.jsonl` records may have `step: null`; they count in the task's `timeMs` union but in no step's `timeMs`.

## Notes
- The `worked` field on `task show --json` is now always `timeMs` (turns, no running clock); `steps.js:97` reads it as its fallback, so Design gets the same number whether it reads `timeMs` or `worked`.
