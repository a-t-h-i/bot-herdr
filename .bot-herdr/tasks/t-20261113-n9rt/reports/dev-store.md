## Summary
The task store is safe for several agents: a `withLock` file lock now guards every task and board read-modify-write (`updateTask`), board numbers never repeat, posts and step starts name their actor by default, `hc` calls have a 30 s timeout and harness turns end after 30 min without an event.
Tests spawn real second processes: 2×50 board posts give n 1..100 once each, 2×20 step starts lose no update; `node --test test/*.test.mjs` and `bh check` pass.

## Changes
- `mods/bot-herdr/engine/lib/core.mjs`: `withLock(path, fn)` — `openSync(lock, "wx")`, 25 ms `Atomics.wait` retries, 5 s wait then `bh: <path> is locked by another command; try again`, stale locks (mtime older than 10 s) removed, lock released in `finally`, returns `fn()`'s value. `clearStaleLock` beside it.
- `mods/bot-herdr/engine/lib/tasks.mjs`: `updateTask(root, id, change)` loads the task fresh inside `withLock(<task.json>)`, calls `change`, saves via the unchanged `saveTask`, returns `change`'s result. `post` computes `n` and appends inside `withLock(<board.jsonl>)`; entry shape unchanged. `saveTask` itself unchanged.
- `mods/bot-herdr/engine/bh.mjs`: added `actor()` (`BH_AGENT || myAddress() || null`) and `stepAgent()`; `board post` uses `from: flags.from ?? actor()`; `task step` defaults `agent` on `start` only when the step has none, done/block/skip/todo still take only `--agent`. Every task read-modify-write now goes through `T.updateTask`: `task steps`, `task step`, `task status`, `task comment`, `task resolve` (both), `task archive|unarchive`, `spawn --step` and `classify qa-risk`. `task show` still loads directly.
- `mods/bot-herdr/engine/lib/team.mjs`: `hc(args, opts)` passes `timeout: opts.timeout ?? 30000` to `spawnSync` for both `hc` and the `BH_HC` stand-in; a call whose `spawnSync` error is `ETIMEDOUT` returns `{ code: 1, out, err: "hc <sub> timed out after <n> s" }`. Only that code counts as a timeout (see Fixes).
- `mods/bot-herdr/engine/lib/runner.mjs`: `TURN_IDLE_MS = 30 * 60 * 1000`, a `watchdog` timer, `idleStopped(ms)` giving `no activity for 30 minutes: stopped`. `oneShot` pets it on every harness line; when it fires it sets `turn.error` only (not `cancelled`, so `agent.mjs` finish() reports the reason instead of a bare "Stopped.") and stops the child the way Esc does; the close handler resolves with the error. `idleMs` flows through `claudeTurn`/`codexTurn`/`piTurn` into `oneShot`. `Acp.turn` builds its own watchdog, `message()` pets it, on fire it sends `session/cancel` and resolves the pending prompt race; the timer is cleared in `finally` and in `cancel`.
- `test/store.test.mjs` (new): the five concurrency/timeout/actor/watchdog tests below.

## Brief Check
- 2×50 concurrent board posts → 100 entries, n 1..100, no repeats: met — `test/store.test.mjs` "board: two writers…", two child node processes posting via `T.post`.
- 2×20 concurrent `bh task step` starts on different steps → no update lost: met — same file, two child processes each running 20 `bh task step … start`; all 40 steps end `active` with agent `dev`.
- `BH_AGENT=Dev`, no `--from` → `from: "Dev"`; `task step 1 start` records `agent`; `… 1 done` does not change it: met — same file, "who a post and a step start are from…", also `--from QA` wins and the no-env case uses `HC_TERMINAL_ID`.
- `BH_HC` stand-in sleeping past a short timeout → code 1 with the timed-out message: met — same file, `hc(["wait", …], { timeout: 300 })` → `hc wait timed out after 0.3 s`.
- Fake harness emitting nothing ends its turn with the "no activity" error at a small `idleMs`: met — same file, pi harness with `idleMs: 300` → `error: "no activity for 300 ms: stopped"`, `cancelled: false`.
- `node --test test/*.test.mjs` passes: met — 195 tests, 194 pass, 1 pre-existing skip (browser/git), 0 fail.
- `bh check` prints PASS: met — lint/typecheck (none configured) and the 41 targeted tests pass.

## Verification
- `timeout 300 node --test test/store.test.mjs` — 5/5 pass.
- `timeout 300 node --test test/*.test.mjs` — 194 pass, 1 skip, 0 fail; `test/headless.test.mjs` unchanged.
- `timeout 300 node "…/bh.mjs" check` — PASS.
- `find . -name "*.lock"` after the runs — none left behind.

## Fixes (review round)
- `runner.mjs` `oneShot` idle handler no longer sets `turn.cancelled`; it sets `turn.error` only and stops the child, so `agent.mjs` finish() shows `no activity for …: stopped` instead of "Stopped.". The close handler resolves with that error. `store.test.mjs` watchdog test now asserts the exact error and `cancelled === false`.
- `team.mjs` `hc()` treats only `r.error?.code === "ETIMEDOUT"` as a timeout; `|| r.signal` is gone. Verified on this Windows 10.0.26200 box: `spawnSync(node, ['-e','setInterval(()=>{},1000)'], { timeout: 300 })` returns `{ status: null, signal: 'SIGTERM', error: { code: 'ETIMEDOUT', message: 'spawnSync … ETIMEDOUT' } }`, so the error code is always set on timeout and the signal test was redundant.
- Rerun after the fixes: `node --test test/*.test.mjs` 194 pass / 1 pre-existing skip / 0 fail; `bh check` PASS (41 targeted tests).

## Notes
- `bh task new` and `bh plan task` still create a task with `newTask` (which saves) and then save it once more after triage/base/isolation. They are not read-modify-write of an existing task and race with nobody, so they were left alone rather than bent into `updateTask`.
- `actor()` uses `||`, not `??`, so an empty `BH_AGENT` (how the tests and the chat clear it) means unset instead of posting `from: ""`.
- `Acp.turn`'s watchdog cannot interrupt a `session/new`/`set_config_option` request that never answers (those `request()`s have no timeout); the idle error covers a silent prompt turn, which is the plan's case. Say if you want those requests raced too.

## Knowledge Proposals
- Store writes: task read-modify-write goes through `updateTask(root, id, change)` and board posts compute `n` inside `withLock`; never `loadTask` + `saveTask` in a command.
- A turn whose harness says nothing ends after `TURN_IDLE_MS` (30 min), overridable per turn with `idleMs`; `hc` calls time out after 30 s.

# Steps 4-6

## Summary
A child's report is now recorded on the task (`bh report`: a `done` board entry plus `step.report`, so it survives a late or lost `hc send`), `bh inbox` lists the reports addressed to an agent that it has not seen, and a resumed agent gets a `## Brief update` carrying only what changed since its brief. `bh task show` prints the board's counts and five entries instead of the whole board.
Board writes still all go through `withLock`/`updateTask`; a fresh child brief points at `bh report` and `bh board read --since`.

## Changes
- `mods/bot-herdr/engine/lib/tasks.mjs`: `report(root, id, { step, summary, file, from, to })` — inside `updateTask` sets `step.report = { file, summary, from, at }`, stops the step's clock (`stopClock`: adds the running time to `workedMs`, sets `started = null`) and keeps its status; then posts the `done` entry. `post` takes `step`/`file` additively (a done report always carries both, `step: null` without a step; other kinds keep their old shape). `boardLine` is the one board formatter. `taskText` prints `   report: <file> — <summary> (<from>)` under a step and the board as `board: 3 contract, 1 decision, 5 done` + the last 5 entries, or all with `{ all: true }`.
- `mods/bot-herdr/engine/bh.mjs`: new `bh report` (prints `Reported step <n>: <summary>`; `from` from `--from`/`BH_AGENT`/terminal, `to` from `--to`/`BH_PARENT`). New `bh inbox [--task] [--peek]`: `done` entries with a `file` addressed to my address or `BH_AGENT`, or to nobody when `BH_LEAD=1`, above the cursor in `DATA/inbox/<slug(BH_AGENT)>[-<address>].json` (written under `withLock`); `--peek` lists without moving it; nothing new prints `No new reports.`. `bh task show` passes `--board` through; `bh board read` uses `T.boardLine`; `bh brief` and `bh agent` take `--step` and `--plan`; `bh spawn` hands the child `--task --step --plan --parent` and builds the non-headless brief with task, plan, parent, name and step; `--peek`/`--board` are bare flags.
- `mods/bot-herdr/engine/lib/team.mjs`: `reportSection` gives a concrete report file even without a task (`.bot-herdr/reports/<name>.md`), tells the child to `bh report <task> [--step <n>] --file <path> "<summary>"` and then still `hc send <parent> "<summary> — <path>"`; `brief` takes `step`; the board line teaches `bh board read <task> --since <n>`; `agentArgv` passes `--step` and `--plan`.
- `mods/bot-herdr/engine/lib/agent.mjs`: `runAgent` takes `step`/`plan` and sets `BH_PARENT`, `BH_TASK`, `BH_LEAD` (lead only) in the environment. `state.seen = { knowledge: <sha1>, boardN, comments: [ids], steps: {n: status} }` is written when the brief is made and after every turn; before each later turn `briefUpdate` diffs it and prepends `## Brief update` with new board entries, new open comments, changed step statuses and the knowledge line — only those. No change → the prompt is the user's message exactly.
- `test/report.test.mjs` (new): `bh report` entry + `step.report` + stopped clock + no extra time on `done`; `bh inbox` unread once, `--peek`, second run empty, another agent's report hidden, the lead sees "to nobody"; `bh task show` counts + 5 entries + `--board`; panel brief plan line and report path.
- `test/headless.test.mjs`: two new tests — a resumed pi turn with one board post and one step change carries exactly `## Brief update` with those two, and a turn after no change carries none (existing brief tests untouched).

## Brief Check
- `bh report` posts the entry with `step` and `file`, sets `step.report`, stops the clock, leaves the status `active`; a later `done` adds no time: met — `test/report.test.mjs` "bh report: the board entry…" (waits 120 ms, asserts `workedMs >= 100`, `started === null`, status `active`, equal `workedMs` after `done`).
- `bh inbox` shows an unread report once, `--peek` does not mark it, the second run prints `No new reports.`, another agent's report is not shown: met — "bh inbox: unread once…".
- A resumed headless turn after a new board post and a step change carries a `## Brief update` with exactly those two; a turn after no change carries none: met — `test/headless.test.mjs` "a resumed turn carries only what changed since its brief" (regex matches the exact block, and `"one"` / `"two"` alone for the no-change test).
- `bh brief dev --mode panel --plan <id>` contains the plan line and a concrete report path: met — "bh brief: the panel brief names the plan and a concrete report file" (`The plan is \`p-…\`` and `.bot-herdr/reports/dev.md`).
- `bh task show` prints counts and at most 5 entries, `--board` all: met — "bh task show: counts by kind…" (5 and 7 entries).
- `node --test test/*.test.mjs` passes: met — 206 tests, 205 pass, 1 pre-existing skip, 0 fail.
- `bh check` prints PASS: met — 65 targeted tests, PASS.

## Verification
- `timeout 300 node --test test/report.test.mjs` — 4/4 pass.
- `timeout 300 node --test test/headless.test.mjs` — 15/15 pass, including the existing brief tests.
- `timeout 300 node --test test/*.test.mjs` — 205 pass, 1 pre-existing skip, 0 fail.
- `timeout 300 node "…/bh.mjs" check` — PASS.
- `bh report t-20261113-n9rt --step 6 --file … --from dev-store` — recorded `done` entry #4 `{step: 6, file, from: "dev-store", to: null}`; `bh task show t-20261113-n9rt` prints it under step 6. Run through the repo engine (`node mods/bot-herdr/engine/bh.mjs …`), since the copy under the herdr app home lags the repo until it is deployed.

## Notes
- `moveStep` already skipped the time add when `started` is null (it has `&& step.started`), so nothing changed there; the report path stops the clock instead, and `moveStep(done)` then adds nothing.
- The inbox cursor is one file per agent (`DATA/inbox/<key>.json`), keyed exactly as `agent.mjs` keys its session: `slug(BH_AGENT)` plus `-<terminal>` when there is one. The chat (no `BH_AGENT`, no terminal) gets `agent.json`; that run can see only reports addressed to nobody while `BH_LEAD` is set, which the chat never sets.
- `bh report` reads the summary from its positional words only, since `--file` is the report path, not text to post.
- `state.seen` is additive in `state.json`: an older saved session without it gets no update on its first turn, then one from the next.

## Knowledge Proposals
- A child's report is recorded on its task with `bh report` (a `done` board entry carrying `step` and `file`, plus `step.report`); the `hc send` message only wakes the parent, and `bh inbox` reads the records.
- `bh agent`'s state keeps `seen` (knowledge hash, board n, open comment ids, step statuses); the next turn's `## Brief update` is that diff and nothing else.
