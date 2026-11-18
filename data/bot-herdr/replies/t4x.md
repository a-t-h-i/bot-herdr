Gate 1 verdict: **CHANGES_REQUIRED.** On Windows, the new file lock fails when several commands write at once. In my test, 1 of 8 writers crashed and its 40 board posts were lost. Everything else in steps 1–6 and 13 meets its criteria, and the existing 68 tests pass.

- **The defect (major):** `withLock` in `mods/bot-herdr/engine/lib/core.mjs:425` only retries on EEXIST. When the lock file is still being deleted, Windows returns EPERM instead, and `withLock` throws it straight out. Board posts, `bh task step`, `bh report` and the `bh inbox` cursor all go through this lock. The fix is to treat EPERM (and EACCES on Windows) as "lock held, retry". Board numbers stayed unique even in the failing run.
- **Minor, not blocking:**
  - A command that holds the lock for over 10 s can have it taken over, and when it finishes it deletes the new holder's lock. Today's lock holders take milliseconds, so this needs a stalled process or a crash.
  - A lock left by a killed command blocks for 10 s, but commands only wait 5 s, so a quick retry also fails.
  - The "## Brief update" leaves out steps added or removed after the brief.
  - Children that don't run headless may never get their report into `bh inbox`: the report command has no `--to <parent>`, and on non-Windows their brief never mentions `bh report`.
- **Rail:** I checked it against the code and its unit tests, not in the running app.

I could only run `bh check` here (direct `node` runs were refused). So I ran the 8-writer stress and the takeover check as a temporary test file through `bh check`, then deleted it. Nothing else was changed.

Report: `.bot-herdr/tasks/t-20261113-n9rt/reports/qa-gate1.md`. It's recorded on the task with `bh report` and sent to t4n.

<!-- bh 2026-11-13T13:34:26.274Z -->
