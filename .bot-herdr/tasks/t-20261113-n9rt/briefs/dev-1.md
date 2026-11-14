## Goal
Steps 1–3 of task t-20261113-n9rt (plan p-20261113-bkli): make the task store safe for several agents. Board posts and step starts record who made them; task and board writes cannot lose an update or repeat a board number; `hc` calls and harness turns cannot hang forever. Everything later in the plan writes to these files, so this lands first.

## Files
Change only:
- `mods/bot-herdr/engine/lib/core.mjs` (lock helper; `writeJson` 72-77, `appendJsonl` 94-97, `myAddress` 183)
- `mods/bot-herdr/engine/lib/tasks.mjs` (`loadTask` 19, `saveTask` 25, `moveStep` 91-106, `post` 145-150, `board` 152)
- `mods/bot-herdr/engine/bh.mjs` (`task step` 183-189, `board post` 224-228, every other `T.saveTask` read-modify-write in the file)
- `mods/bot-herdr/engine/lib/team.mjs` (`hc` 206-211)
- `mods/bot-herdr/engine/lib/runner.mjs` (`oneShot` 358, `Acp.turn` 528)
- `test/engine.test.mjs` and a new `test/store.test.mjs`
Leave alone: every UI file under `mods/bot-herdr/*.js`, `agent.mjs`, roles, other scripts.

## What to do
1. **Actor default (step 1).**
   - `bh board post`: `from: flags.from ?? process.env.BH_AGENT ?? myAddress() ?? null`.
   - `bh task step`: when `to === "start"` and the step has no `agent` yet, default `agent` the same way. For done/block/skip/todo keep today's behaviour (only `--agent` sets it): `moveStep` overwrites `step.agent`, and the Orchestrator marking a step done must not replace the worker's name.
2. **Lock (step 2).** In `core.mjs` add `export function withLock(path, fn)`: create `${path}.lock` with `openSync(lockPath, "wx")`; on `EEXIST` wait 25 ms (`Atomics.wait` on a `SharedArrayBuffer`, synchronous) and retry for up to 5 s; a lock file older than 10 s is stale and is removed; after 5 s throw `Error("bh: <path> is locked by another command; try again")`. Always remove the lock in `finally`. Return `fn()`'s value.
3. In `tasks.mjs` add `export function updateTask(root, id, change)`: inside `withLock(<task.json path>, …)` load the task fresh, call `change(task)`, save it with `saveTask`, return what `change` returned. Use it for every read-modify-write of a task in `bh.mjs` (`task steps`, `task step`, `task status`, `task comment`, `task resolve` and any other site that loads, changes and calls `T.saveTask`). Keep `saveTask` itself as it is.
4. `post` computes `n` and appends inside `withLock(<board.jsonl path>, …)`, so two posts never share `n`. The board stays append-only JSONL with entries `{n, at, kind, from, to, text}`.
5. **Timeouts (step 3).** `team.hc(args, opts)` passes `timeout: opts.timeout ?? 30000` to `spawnSync` (both the real `hc` and the `BH_HC` stand-in). On a timeout return `{ code: 1, out, err: "hc <first arg> timed out after 30 s" }`.
6. In `runner.mjs` add a no-activity watchdog for a turn: `export const TURN_IDLE_MS = 30 * 60 * 1000`. In `oneShot` and `Acp.turn`, reset a timer on every event from the harness; when it fires, cancel the turn the way Esc does and end it with `error: "no activity for 30 minutes: stopped"`. Allow tests to shorten it through an `idleMs` option (default `TURN_IDLE_MS`); no new environment variable.

## Contracts
- Board entry shape is unchanged; `from` is now usually filled.
- `withLock(path, fn)` and `updateTask(root, id, change)` are the store's write API from now on; later steps (bh report, receipts) will call them.

## Constraints
No new dependency. Never run `hc` through a shell. Keep `test/headless.test.mjs` passing unchanged. Functions at or under 20 lines. No refactor beyond what the steps need. Do not commit.

## Done when
- `test/store.test.mjs` starts two child Node processes that each post 50 board entries to one task at the same time; the board then holds 100 entries with `n` 1..100, no repeats. The same for 2×20 concurrent `bh task step` starts on different steps: no step update lost.
- A test shows `bh board post` with `BH_AGENT=Dev` and no `--from` records `from: "Dev"`, and `bh task step <id> 1 start` records `agent` while `… 1 done` does not change it.
- A test shows a `BH_HC` stand-in that sleeps past a short timeout returns code 1 with the timed-out message (pass a small `timeout` in the test).
- A test shows a fake harness that emits nothing ends its turn with the "no activity" error when `idleMs` is small.
- `node --test test/*.test.mjs` passes; `node "C:/Users/athenkosi.hlubi/.config/herdr-app/mods/bot-herdr/engine/bh.mjs" check` prints PASS.

## If stuck
If a read-modify-write site does not fit `updateTask`, or the watchdog cannot hook a harness's events, stop that part, finish the rest and report it under Blockers with the path:line.
