## Summary
CHANGES_REQUIRED. Two majors: (1) one of three full-suite runs lost a step update with both writers exiting 0, so the "lose nothing" criterion still fails under load; (2) a `bh check` receipt's diff hash ignores HEAD, so a clean tree at any commit matches a receipt from another commit, and the gate is told to cite it without re-running.
All gate-1 findings are addressed in the code. Steps 8, 9 and 17–19 look right. The full suite passes on the committed code in 2 of 3 runs.

## Changes
None to production code. Temporary probe `test/qa-tmp-hash.test.mjs` and its output file were run through `bh check`, then deleted.

## Round 1 findings
- [major] EPERM under contention — **addressed.** `HELD` = EEXIST/EPERM/EACCES (`core.mjs:103`). The new 8×40-writer test passes: 320/320 entries, unique numbers.
- [minor] Stale takeover deletes the new holder's lock — **addressed** for the holder: a token is checked before unlink, and a test covers it. The waiter-vs-waiter race is still open; see major 1.
- [minor] 5 s wait < 10 s stale age — **addressed** (`LOCK_WAIT_MS` = 15 s).
- [minor] Brief update skips added and removed steps — **addressed.** Steps show as `n. Title: new` and `n: removed`, with a headless test.
- [minor] Non-headless reports never reach `bh inbox` — **addressed.** `--to <parent>` is in `reportSection` and in the spawn's `about` line.
- [info] Rail row open doesn't close properly — **addressed.** `closeRail(cx)` runs before `openTerminal`.

## Findings
- [major] A concurrent step start can still be lost silently — `mods/bot-herdr/engine/lib/core.mjs:142` (`clearStaleLock`), `:120`, `:133`
  - Expected: two writers each running 20 `bh task step … start` leave all 40 steps active.
  - Observed: in 1 of 3 full `bh check` runs, `store.test.mjs:71` failed with step 7 still `todo`. Both writers exited 0, so two commands held the lock at once.
  - In a passing run the same test took 8.99 s (about 1.5 s normally). That fits a leftover lock being taken over as stale.
  - Likely path:
    1. A lock is left behind. On Windows, `unlinkSync` can fail when another process (AV, indexer) has the file open, and the `catch {}` swallows it. Or `writeFileSync(fd, token)` throws after `openSync` succeeded: `fd` is already set, so the loop exits holding an empty lock that `finally` never removes.
    2. Both writers poll every 25 ms and see the lock as stale together.
    3. Waiter A renames the lock away and creates a fresh one. Waiter B's `renameSync(lock, …)` then renames **A's fresh lock**, and B enters too.
  - A deterministic probe (8 waiters on one pre-aged lock, 3 rounds) did not reproduce it, so the cause is inferred, but the lost update is observed.
  - Fix:
    - After the rename, confirm the renamed file is the stale one (same `ino`, or same content as stat'ed). If it isn't, put it back and back off.
    - Retry the `finally` unlink briefly on EPERM/EBUSY.
    - On a `writeFileSync(fd, token)` failure, close and unlink, then retry or rethrow.
  - Reproduce: run `bh check` (full suite) a few times and watch `task steps: two writers starting steps at once lose no update`.
- [major] A receipt can "prove" a check on code it never ran on — `mods/bot-herdr/engine/bh.mjs:165` (`changeHash`)
  - Expected: a receipt matches the review's tree only when the check ran on that code.
  - Observed: the hash is `git diff HEAD` plus untracked files only. Probe in a temp repo: `bh check --json` at commit 756bc9b and again at 76f16e0 (with a changed file committed) both gave `diff da39a3ee5e6b…`, the sha1 of an empty string.
  - Any clean tree matches any earlier clean-tree receipt. `reviewContext` and `reviewer.md` then tell the gate to "cite it, do not re-run". Committed-range reviews like this one are exactly that case.
  - Fix: include HEAD in the hash, or hash `git diff <base>` plus untracked files instead of `diff HEAD`.
- [minor] `bh check` misreports how many tests failed — `bh.mjs:201` (`verdictLine`). With 1 failing test it printed `FAIL: 225 tests fail`. It uses the run count for both pass and fail.
- [minor] When the full suite runs as the fallback, the output still shows the targeted `$ node --test …` command, which never ran. That reads as if both ran.
- [info] `[INFERENCE]` `projectRoot` no longer maps a worktree to its project; only `store()` does. `W.worktreesRoot(root)` and `createWorkspace` still use the raw root, so a `bh task new --worktree` run from inside a task's worktree would nest the new worktree there. Not exercised.
- [info] "224 tests pass" counts 1 skipped test.
- [info] Not this task's round: the uncommitted step-11 `test/worktree.test.mjs` fails 2 tests in the working tree (8.3 short-path compare; the merge-refusal exit code). `test/round5.test.mjs` is untracked and not this range.

## Brief Check
- Concurrent `bh board post` / `bh task step` lose nothing, unique numbers — **not met.** Board posts hold: 8×40 and 2×50 pass. One lost step start was seen in 1 of 3 runs (major 1).
- `bh check` never prints PASS without saying what ran; uncovered change runs the full test command — **met.** It prints `Ran: 0 lint, 0 typecheck, 224 tests (full suite)`; "NO CHECKS" has a test. Receipt identity is flawed (major 2).
- Worktree task and untracked new source rated by real content (tests for each) — **met** (verify.test: worktree task, untracked content, unreadable new source, area floor to LOW).
- Test selection by path tail — **met** (verify.test "testsFor finds the engine's own tests by the path tail").
- Review context, `bh gate`, merged reviewer.md — **met.** This round's first message carried the criteria, reports, receipts and risk, and verify.test covers spawn context and gate recording.
- Every page tab shows label and count, 1px accent border, no fill (step 17) — **met in code.** Labels are never dropped, padding narrows, `mark: "line"` uses `border_1`. Fit at 600 px is `[INFERENCE]`, not seen in the app.
- Board and report links on the task page (step 18), Resume/Pause/seat/keyboard fixes (step 19) — **met in code** and by signals.test (6 helpers). A Pause failure now says why in the chat, and quiet actions sit at 0.5 opacity so they are reachable.
- Resumed agent gets only changed state; "second prompt has no brief" — **met** (headless tests pass).

## Verification
- `bh check --task t-20261113-n9rt` (committed code + others' uncommitted files) — PASS, 224 tests (full-suite fallback), 223 pass, 1 skipped.
- `bh check` with the probe file added — FAIL: `store.test.mjs` "task steps: two writers… lose no update" lost step 7 (both writers exit 0). Probe result unread in that run.
- `bh check` with both probes — store tests pass. Hash probe: two commits, both `diff da39a3ee…` (confirmed). Stale-lock probe: 3×8 waiters, 160/160 each (not reproduced). The 2 failures are in uncommitted step-11 `worktree.test.mjs`.
- `git diff 8c57f1a..6227e3f` — read for core, agent, tasks, team, scripts, bh.mjs, qa-risk, check scripts, common.mjs, chat, switch, questions, railview, viewer.
- Direct `node --test` was refused by access; probes ran through `bh check`.

## Knowledge Proposals
- A lock-file "stale takeover by rename" is not safe on its own: a second waiter can rename the first waiter's fresh lock. Verify the identity of what was renamed.
- A change hash for check receipts must include HEAD (or diff from the base), or every clean tree hashes the same.
