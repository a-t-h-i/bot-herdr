## Summary
CHANGES_REQUIRED: on Windows, `withLock` fails outright under contention. When the lock file is pending delete, `openSync(lock, "wx")` throws EPERM, not EEXIST. 1 of 8 concurrent writers crashed and its 40 board posts were lost.
Everything else in phase 1 (steps 1-6 and 13) meets its criteria. The existing 68 tests pass.

## Changes
None to production code. A temporary probe (`test/qa-tmp-lock.test.mjs`) was run through `bh check` and then deleted.

## Findings
- [major] Concurrent board posts and task updates can fail on Windows — `mods/bot-herdr/engine/lib/core.mjs:425` (`if (e.code !== "EEXIST") throw e;`).
  - Expected: every writer waits for the lock and nothing is lost.
  - Observed: 8 processes, each running 40 `T.post` calls on one board, ended with exits `0,0,0,0,0,0,1,0` and `EPERM: open ...board.jsonl.lock` (errno -4048). Only 280 of 320 entries were written. The numbers that were written are still unique.
  - Cause: the holder unlinks the lock while another process has a handle on it (for example a waiter in `clearStaleLock`'s `statSync`). The file becomes delete-pending, and on Windows an exclusive create then gives EPERM.
  - Fix: treat EPERM, and EACCES on win32, like EEXIST. Wait and retry until `LOCK_WAIT_MS`.
  - The same path is used by `updateTask` (`bh task step/steps/status/comment`, `bh report`, spawn's step start) and by the `bh inbox` cursor.
  - The existing 2-writer tests pass only because there is less contention.
  - Reproduce: spawn 8 node processes, each doing `T.post(root, id, {kind:"note", ...})` 40 times on one task.
- [minor] Stale takeover can leave two commands holding the lock — `core.mjs:431-437`. `finally` unlinks the lock without checking that it still owns it.
  - Confirmed by the probe: a holder whose lock mtime is >10 s old has it taken over. The first holder's `finally` then deletes the second holder's lock, so a third command can enter while the second is still inside.
  - `clearStaleLock` also has a stat→unlink race when two waiters both see the same stale lock.
  - This needs a holder that runs over 10 s (all current `fn` bodies take milliseconds) or a crash first, so it does not block.
  - Fix: write a token into the lock and compare it before unlinking, or rename-then-unlink.
- [minor] A lock left behind by a killed command blocks for up to 10 s. Commands in that window fail after 5 s with "locked by another command; try again". This recovers by itself, but `LOCK_WAIT_MS` (5 s) < `LOCK_STALE_MS` (10 s) means the first retry also fails. Consider a wait at least as long as the stale age.
- [minor] The brief update skips new steps — `agent.mjs` `briefUpdate`. A step line is only emitted when `seen.steps[n]` existed. Steps added by `bh task steps` after the brief, and removed steps, never appear in the `## Brief update`.
- [minor] Non-headless children's reports may never reach `bh inbox`.
  - The `bh report` line in the brief has no `--to <parent>`, and `BH_PARENT` is set only by `runAgent`. A template- or argv-spawned child records `to: null`, which only a `BH_LEAD` (headless lead) inbox shows.
  - On non-Windows template spawns, the brief is the generic one with no task, so the child is never told to run `bh report`. The spawn's `about` line doesn't mention it either.
  - Suggest adding `--to ${parent}` to `reportSection` and the `bh report` hint to `about` (could be folded into step 22).
- [info] The rail's row `open` sets `railOpen = false` without `cx.notify()` and without returning focus. The popover closes on the next redraw, and focus stays on the now-hidden handle.

## Brief Check
- Concurrent board post / task step lose nothing, unique numbers — **not met on Windows under contention.** Unique numbers hold. A writer can fail with EPERM (see major).
- Posts and step starts record the actor; `done` never replaces the worker — met (`stepAgent` in bh.mjs; store.test "who a post and a step start are from" passes).
- hc hangs end after 30 s; idle turn of 30 min ends with an error, not 'Stopped.' — met. `hc` has `timeout` 30000 and an ETIMEDOUT message. `TURN_IDLE_MS` is 30 min. oneShot sets `turn.error` (not cancelled). ACP races `idleStop`. Tests pass.
- Report on the task before/without hc send; inbox until read; clock stopped, step not done — met for headless children. report.test passes, and inbox `--peek` doesn't advance the cursor. Gap for non-headless spawns noted as minor.
- Resumed turn carries only the changed state; nothing extra when unchanged — met. Both headless tests pass, including "a turn after no change carries no brief update". The new-steps gap is noted as minor.
- `bh task show` prints counts plus the last 5, `--board` prints all — met (report.test).
- Agents rail: NEEDS YOU / WORKING / IDLE groups, 248 px beside 660, fold below 972, Answer opens the drawer, rows keyboard-reachable — met by reading the code.
  - `RAIL_W` = 248. `showsRail` = 660+16+248+2·24 = 972.
  - Answer runs `answerFromRail`: it reorders the questions, clears the put-away state and focuses the composer.
  - Rows go through `clickable` → `focusable` with a role and accessibility label. The popover has Esc with a focus handle.
  - rail.test passes. Not checked in the running app.

## Verification
- `bh check` (committed state; working-tree engine files unchanged) — PASS, 68/68 tests, including store, report, headless and rail.
- `bh check` with the temporary `test/qa-tmp-lock.test.mjs` — 8-writer probe FAIL: one writer exits 1 with `EPERM open board.jsonl.lock`, 280/320 entries. Stale-takeover probe: the second holder entered while the first held it, and the lock file was gone after the first released while the second was still inside.
- `git diff 4c41fb3..8c57f1a` — read in full for the engine, rail, railview and chat.
- Direct `node --test` / `node script` runs were refused by access, so everything went through `bh check`.

## Knowledge Proposals
- On Windows, a lock file made with `openSync(path, "wx")` can throw EPERM (not EEXIST) while another process's unlink is pending. Treat EPERM/EACCES as "held, retry".

## Blockers
- QA cannot run `node --test` or ad-hoc node scripts here (only `bh check`). Probes have to be temporary test files.
