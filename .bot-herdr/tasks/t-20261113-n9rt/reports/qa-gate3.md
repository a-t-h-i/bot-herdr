## Summary
CHANGES_REQUIRED. Both gate-2 majors are closed: 5 of 5 full-suite runs pass, including the 30×2 step-writer and 8×40 board tests, and the receipt hash now includes HEAD.
Two new majors in steps 14 and 20. Every `bh report` and every `bh merge` shows twice on a step's timeline. The task page never shows usage, because it reads `bh task list`, which has none.

## Changes
None to production code. No probes were added.

## Round 2 findings
- [major] Lost step update under contention — **addressed.**
  - The stale takeover is serialised by a `<lock>.takeover` mutex. It renames the lock, then compares the token and gives back a lock it renamed by mistake. Release removes the lock only while it still holds this command's token, and retries EPERM/EBUSY for 1 s. `take()` closes and unlinks the lock if its write fails (`core.mjs:111-212`).
  - In 5 of 5 runs, "thirty rounds of two writers starting steps: no update ever lost" (20–37 s), "eight waiters on a pre-aged lock" and "a holder taken over as stale…" all pass.
  - One residual edge is listed below as a minor.
- [major] Receipt hash ignores HEAD — **addressed.** `changeHash` hashes `rev-parse HEAD` plus `diff HEAD` plus untracked content (`bh.mjs:169-173`). The test "a receipt's tree hash names the commit: two commits never share one" passes.
- [minor] `verdictLine` failure count — **addressed.** It now prints "252 tests pass, 1 skipped", and "the verdict counts failures and skips…" passes.
- [minor] Phantom targeted command on fallback — **addressed.** The `$ ` lines are stripped when the suite runs (`bh.mjs:193`), and the same test covers it.
- [info] Worktree paths from inside a worktree — the report says they are now store-based. Not re-probed.

## Findings
- [major] A step's report and merge appear twice on the tracker timeline — `mods/bot-herdr/engine/lib/tasks.mjs:287-290` (`stepEvents`)
  - Expected (contract on board entry 15, and the tracker reference): one event per thing that happened.
  - Observed: `T.report` writes `step.report` and also posts a `done` board entry with `step: n` (`tasks.mjs:183-185`). `bh merge` records the child as merged and also posts `done "Merged …"` with the step (`bh.mjs:739-741`). `stepEvents` emits both of each pair.
  - On this task, `bh task show t-20261113-n9rt --json` gives steps 6, 9, 10 and 11 a `report` event and a `board`/`done` event with identical text.
  - `test/detail.test.mjs` misses this because it writes the report and the board line by hand instead of through `T.report`.
  - Fix: in `stepEvents`, skip board entries of kind `done` (reports and merges have their own events), or skip any board entry with a `file`. Build the test through `T.report` and the merge path.
- [major] The task page never shows usage (plan step 20: "the task page and tracker show it") — `mods/bot-herdr/work.js:1074` and `:1172` read `t.usage` / `s.usage`, but the page loads tasks with `bh task list --all` (`work.js:425`).
  - `listTasks` returns the raw `task.json` (`tasks.mjs:44-50`). Usage lives only in `usage.jsonl` and is added only by `taskDetail` on `task show`.
  - Observed: `usageText(undefined)` is `""`, so both rows are always hidden. The design-tracker report cites `work.js:1077/1179` as done.
  - Fix: either add `usage` per task and per step to the `task list` JSON, or have the open task's page read `bh task show <id> --json`. Then add a test on whichever data path the page uses.
- [minor] Recording usage can fail a turn — `mods/bot-herdr/engine/lib/agent.mjs:380`. The plan's DEV note says "usage capture is best-effort… never fails a turn".
  - `recordUsage` takes a lock and writes unguarded. A lock timeout (15 s) or a write error rejects the turn after `save()`: the reply text is never printed and `finish` never runs.
  - For a deleted task it also recreates `.bot-herdr/tasks/<id>/usage.jsonl`.
  - Fix: wrap it in `try {} catch {}` and skip `T.recordUsage` when the task no longer exists.
- [minor] Codex tokens are over-counted — `runner.mjs:348` together with `tasks.mjs` `usageTotals`. Codex's `input_tokens` already includes `cached_input_tokens`, so adding `cacheRead` counts cached input twice. Claude's `input_tokens` excludes cache, so only Codex is affected. Fix: record `input: input_tokens - cached_input_tokens` for Codex.
- [minor] Tracker polling and placement — `mods/bot-herdr/chat.js:448-462`.
  - A card whose task is deleted or never finishes is fetched with one `bh task show` spawn every 5 s, forever. When `bhJson` returns null the old value is kept, so the card never folds.
  - A long-running task's card that ages out of the feed's `KEEP` cap is re-added at the bottom by `trackTask`, so "one card that stays" holds only while it is in the cap.
  - The card lands in the space that was current when the task was first seen.
  - Fix: drop or fold a card whose task no longer loads, and keep tracker entries outside the cap.
- [minor] The stale-lock give-back can overwrite another waiter's lock — `core.mjs:191-199`. `renameSync(stale, lock)` replaces an existing `lock` on both Windows and POSIX.
  - This needs a live holder that held the lock for 10 s or more, then released it between the stat and the rename, with a third writer taking it in the gap. It was not seen in 5 runs and is not blocking.
  - Fix: give the lock back with `linkSync(stale, lock)` then unlink, which fails if `lock` exists, and back off.
- [info] `forBrief` off-by-one — `knowledge.mjs:128-146`. Section sizes skip the newline between the head and the first section. When `md.length === max + 1`, every section "fits", yet the text still ends `[… cut: ; the whole file is in …]` with nothing named.
- [info] `chat.js` also drops the working line's "N of M" button (diff around old line 1297). It is not in steps 14, 15, 20 or 21 and its source isn't recorded. The rotation timer still runs. Orchestrator: confirm who asked for it.

## Brief Check
- Concurrent `bh board post` / `bh task step` lose nothing, unique numbers — **met.** 5 of 5 runs pass the 8×40 board test, the 30-round two-writer step test and the 8-waiter stale test.
- A receipt matches only the code it ran on — **met** (HEAD is in the hash, with a test).
- Step 14: `events` / `agentName` / `elapsedMs` / `done` / `total` — **shape met.** `agentName` falls back to the open child, and `elapsedMs` includes the running time. **Events not met:** reports and merges are duplicated (major 1).
- Step 20: `bh usage [--task]` prints tokens and minutes for Claude and Codex, minutes only elsewhere — **met** (headless tests "a turn's reported usage is kept…" and "bh usage: tokens where the harness reports them…"). Tracker header usage: met. **Task page usage: not met** (major 2).
- Step 21: `bh knowledge inbox [--task]` and `forBrief` by section — **met** (knowledge-inbox.test, 2 tests). One info edge.
- Step 15: tracker card, reviewed by its logic only (not rendered):
  - One card per task: met, while it is within `KEEP`.
  - Refreshed in place on the 5 s `TASKS_MS` poll while the chat page is shown: met. A live step's tick forces a notify.
  - Folded when done or abandoned: met. A folded card stops refetching.
  - "Needs you" opens the agent's question via `answerFromRail`, else its terminal: met.
  - Layout against the reference jpg: `[INFERENCE]`, not seen.
- `herdr-app check mods/bot-herdr` passes — **not verified.** The command was refused by Agent access, from both Bash and PowerShell.
- `bh check` green — **met** (5 runs below).

## Verification
- `bh check --task t-20261113-n9rt` run 1 — PASS, 253 tests (full suite), 252 pass, 1 skipped, 0 fail; 30×2 step test 16.2 s.
- `bh check --task t-20261113-n9rt` run 2 — PASS, 252/253, 1 skipped; 30×2 step test 37.1 s.
- `bh check --task t-20261113-n9rt` run 3 — PASS, 252/253, 1 skipped; 30×2 step test 27.2 s.
- `bh check --task t-20261113-n9rt` run 4 — PASS, 252/253, 1 skipped; 30×2 step test 20.5 s.
- `bh check --task t-20261113-n9rt` run 5 — PASS, 252/253, 1 skipped; 30×2 step test 20.0 s.
  - Each run includes `test/store.test.mjs` (`npm run test` = `node --test test/*.test.mjs`).
  - Direct `node --test test/store.test.mjs` was refused by access, so the 5 required runs are these suite runs.
- `bh task show t-20261113-n9rt --json` — steps 6, 9, 10 and 11 each carry a duplicate `report` + `board/done` event pair (major 1).
- `herdr-app check mods/bot-herdr` — refused by Agent access (Bash and PowerShell); not run.
- `git diff` read for chat.js, bh.mjs, agent.mjs, knowledge.mjs, runner.mjs, tasks.mjs, railview.js, work.js, plandoc.js and indicators.js; steps.js, tracker.js, detail/knowledge-inbox tests and `core.mjs:98-220` read in full.

## Knowledge Proposals
- A unit test that writes store files by hand can hide duplicates the real commands create. Build event and timeline fixtures through `T.report`, `bh merge` and `bh board post`.
- The Work page's task data comes from `bh task list --all` (raw task.json). Anything `taskDetail` adds is visible only to `bh task show` readers such as the chat tracker.
