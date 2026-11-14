## Summary
PASS. All six round-3 findings are fixed, and 3 of 3 `bh check` runs pass on the full suite (254 tests: 253 pass, 1 skipped, 0 fail). The 30×2 step-writer and 8×40 board stress tests pass in every run.
One new minor: `forBrief` throws on an oversized knowledge file that has no `## ` section. It does not block.

## Changes
None to production code. No tests added: the existing tests cover every fix. I wrote one throwaway probe script outside the repo (`%TEMP%/qa4-probe`). Access refused running it, so that finding is from reading the code.

## Round 3 findings
- [major] Reports and merges duplicated in `stepEvents`: **addressed.**
  - `echo()` (`tasks.mjs:293`) drops `done` board entries that carry a `file` or whose text starts with `Merged `. Both already have their own event.
  - `bh task show t-20261113-n9rt --json` now gives each reported step exactly one `report` event and no `board`/`done` twin (steps 6, 9, 10, 11, 14, 15, 16, 18, 20, 21).
  - `test/detail.test.mjs` now builds the timeline through `T.report` and the merge post.
- [major] No usage in `bh task list --json`: **addressed.**
  - `listTasks` maps `withUsage` over every task (`tasks.mjs:45-57`). The shape `{tokens, costUsd, minutes}` is the same `taskDetail` gives, on the task and on each step.
  - `work.js:425` reads that list and `work.js:1074` / `:1172` read `t.usage` / `s.usage`, so the data path now matches.
  - Other `listTasks` callers (`currentTask`, `bh inbox` at `bh.mjs:413`) only read the result and never save it, so usage never leaks into `task.json`.
- [minor] `recordUsage` can fail a turn: **addressed.** The body is wrapped in try/catch, and the task-store write is skipped when `task.json` is gone (`agent.mjs`, `recordUsage`). It runs after `save()` and before the reply is printed, so it can no longer reject the turn.
- [minor] Codex input over-counted: **addressed.** `input = max(0, input_tokens − cached_input_tokens)` when both are numbers (`runner.mjs:346-352`). The headless fixture expects `[38, 8, 2]`.
- [minor] Stale-lock give-back: **addressed, and no new race found.** `core.mjs:192-201` now uses `linkSync(stale, lock)` then unlinks `stale`. Edge cases checked:
  - A failed link can no longer overwrite a third writer's lock.
  - The guard is always unlinked in `finally`, and `removeIfOld` clears a dead guard after 10 s.
  - The leftover `.stale` names are unique and harmless.
  - **Remaining edge, already there with `renameSync`:** a holder that releases while its lock is renamed away gets ENOENT and leaves the restored lock behind. It goes stale after ≤10 s, inside the 15 s wait, so nothing is lost and nothing stays locked.
  - On a filesystem without hard links (FAT, some network shares), the mistaken-rename branch drops the fresh lock instead of hanging. That needs a holder that held the lock for 10 s or more, so it is `info`.
- [info] `forBrief` off-by-one: **addressed.** The newline between head and first section is counted, and the cut line appears only when it names a section. A test covers the `md.length === max + 1` case.

## Deferred items (point 2)
- Tracker polling and placement in `chat.js`, and the dropped "N of M" button: dev-fix3 did not touch `chat.js`. They are unchanged, not worse.

## Findings
- [minor] `forBrief` throws when a knowledge file over 8000 characters has no `## ` heading — `mods/bot-herdr/engine/lib/knowledge.mjs:144`
  - Expected: the file is cut at the budget with a pointer, as the old `slice` did.
  - Observed (from reading the code; running the probe was refused):
    - `sectionsOf` returns `[md, []]`, so `at = sections.length = 0`.
    - `at === 0 && sections[0].length` then reads `.length` of `undefined` and throws a TypeError.
    - The brief build fails in `agent.mjs:275` and `team.mjs:125`, so every turn of that agent fails.
  - How it happens: `add` always writes the sections skeleton, so only `bh knowledge write` with a long headingless file triggers it. That is why it is minor.
  - Repro: write a 9000-character `.bot-herdr/knowledge/dev.md` with no `## ` line, then call `forBrief(root, "dev")`.
  - Fix: guard `sections.length` (for example `if (!sections.length) return md.slice(0, max) + cut-pointer`) and add that case to `knowledge-inbox.test.mjs`.
- [minor] `echo()` hides any step `done` board entry that carries `--file`, even one posted by hand with no `bh report` (`tasks.mjs:293`). A second `bh report` on the same step also replaces `step.report`, so the first report's entry disappears from the timeline. Both are still on the board. Fix, if wanted: match the entry to `step.report.file` instead of hiding every `done`+file entry.
- [info] `herdr-app check mods/bot-herdr` was not run by QA (refused in round 3). The design reports say it passed.

## Brief Check
- Concurrent `bh board post` / `bh task step` lose nothing, with unique numbers: **met.** 3 of 3 runs pass the 8×40 board test, the 30-round two-writer test, the 8-waiter pre-aged lock test and the stale-holder test.
- `bh check` never prints PASS without saying what ran; an uncovered change runs the full suite: **met.** Each run prints "No targeted test covered the change: ran the full suite (npm run test)" and "Ran: 0 lint, 0 typecheck, 254 tests (full suite)".
- `bh usage --task <id>`: tokens and minutes for Claude and Codex, minutes only elsewhere: **met** (headless usage tests). The Codex count is now correct.
- Task page and tracker show usage: **met.** The list carries usage, and the page reads it from the list.
- Tracker timeline with one event per thing that happened: **met** (live `task show` output, detail test).
- Every step has a unit test that fails without it: **met** for the round-3 fixes (dev-fix3 reports reverting them and seeing the tests fail). I did not repeat that.
- `herdr-app check mods/bot-herdr` passes: **not verified by QA** (see info finding).

## Verification
- `node mods/bot-herdr/engine/bh.mjs check` run 1 — PASS: 254 tests, 253 pass, 1 skipped, 0 fail, full-suite fallback; 30×2 step test 7.5 s.
- `node mods/bot-herdr/engine/bh.mjs check` run 2 — PASS: 254/253/1 skipped, 0 fail; 30×2 step test 10.0 s.
- `node mods/bot-herdr/engine/bh.mjs check` run 3 — PASS: 254/253/1 skipped, 0 fail; 30×2 step test 17.4 s; 8×40 board test 5.9 s.
- `node --test test/store.test.mjs test/detail.test.mjs test/knowledge-inbox.test.mjs` — refused by access. All three files run inside each `bh check` suite run above, and all pass.
- `node mods/bot-herdr/engine/bh.mjs task show t-20261113-n9rt --json` — one `report` event per reported step, no `board`/`done` duplicates; every step carries `usage`.
- Code read: the `core.mjs:98-220` lock path, `tasks.mjs:30-58` and `:178-323`, and the `agent.mjs` `recordUsage`, `runner.mjs` Codex usage, `knowledge.mjs` `forBrief` and `work.js:425/1074/1172` diffs.
- Probe `%TEMP%/qa4-probe/forbrief.mjs` — not run (refused by access); the finding stands from reading the code.

## Knowledge Proposals
- `bh task list --json` carries usage per task and per step, from `withUsage` in `listTasks`. The Work page reads usage there, not from `task show`.
