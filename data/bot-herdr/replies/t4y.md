Gate 2 is **CHANGES_REQUIRED**. All six gate-1 findings are fixed, but I found two new major problems.

1. **Lost update under contention.** The test where two writers start 20 steps each lost one step update in 1 of 3 full-suite runs: step 7 stayed `todo` and both writers exited 0. That breaks the "lose nothing" acceptance criterion.
   - I didn't reproduce it with a direct probe, so the cause is my best guess from the code: when two waiters take over a stale lock at once (`core.mjs:142`), the second can rename the first's fresh lock away, and both then hold it.
   - A lock gets left behind when Windows silently fails to delete it, or when writing the token fails right after the lock file is created.
2. **A check receipt can match code it never ran on.** The receipt's hash (`bh.mjs:165`) leaves out the commit, so every clean working tree hashes the same. In a probe, clean trees at two different commits both hashed to `da39a3…`. The gate is then told to cite that receipt instead of re-running the checks. Adding the commit to the hash fixes it.

There are also two minor issues:
- After one failure, `bh check` prints "225 tests fail".
- When it falls back to the full suite, it still shows the targeted test command as if that ran.

Steps 8, 9 and 17–19 look right in the code. I did not check the tab strip at 600 px in the running app.

The full suite passed 224 tests (1 skipped) on the committed code in 2 of 3 runs. In the other two runs I had a temporary probe test file added: one run was the lost-update failure above, and the other failed only in step 11's uncommitted worktree tests, which are outside this review. I've deleted the probe files.

One small oddity: `bh gate` recorded this as "round 1", because gate 1's verdict was never recorded with `bh gate`.

The report is at `.bot-herdr/tasks/t-20261113-n9rt/reports/qa-gate2.md`; I recorded it on the task and sent it to t4n.

<!-- bh 2026-11-13T13:56:34.320Z -->
