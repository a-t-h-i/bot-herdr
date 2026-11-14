Steps 1-3 are accepted and committed (b93b176). Next: steps 4-6 of task t-20261113-n9rt. Same rules as before: engine files and tests only, no UI files (Design is editing mods/bot-herdr/chat.js and a new rail.js now), use withLock/updateTask for every write, do not commit.

## Goal
Reports and task state reach agents reliably. A child's report is recorded on the task (not only as an `hc send` message that may arrive late). A resumed agent learns what changed since its brief. `bh task show` stays small as the board grows.

## Files
Change: `mods/bot-herdr/engine/bh.mjs`, `lib/tasks.mjs`, `lib/team.mjs` (`reportSection`, `brief`, `agentArgv`), `lib/agent.mjs` (`runAgent`, `makeBrief`, `runTurn`), `lib/core.mjs` only if a helper is needed, tests in `test/`.
Leave alone: UI files, roles/*.md (step 22 updates them), `runner.mjs` except passing values through.

## What to do
### Step 4: bh report and bh inbox
1. `bh report <task> --step <n> --file <path> "<summary>"` (the summary is one line; `--step` is optional for a child without a step):
   - posts a board entry `{n, at, kind: "done", from, to, text: <summary>, step: <n>, file: <path>}` (`from` defaults as in step 1; `to` = `--to`, else the reporting agent's parent address from `BH_PARENT` if set, else null). Additive fields only.
   - when `--step` is given, inside `updateTask`: sets `step.report = { file, summary, from, at }`; if the step is `active` with `started`, adds the running time to `workedMs` and sets `started` to null, so its clock stops. Its status stays as it is: only the Orchestrator marks it `done`, after checking. Make `moveStep` (tasks.mjs) skip the time add when `started` is null.
   - prints `Reported step <n>: <summary>`.
2. `bh inbox [--task <id>] [--peek]`: lists `done` entries that carry a `file`, addressed to me (`to` equals my address `myAddress()` or my name `BH_AGENT`) or to nobody when I am the lead (`--mode lead`, i.e. `BH_LEAD=1`, set it in `runAgent` for lead mode), that I have not seen. Format per line: `<task> #<n> step <s> <from>: <summary> — <file>`. Unless `--peek`, mark them seen: a cursor file `DATA/inbox/<key>.json` mapping task id to the last seen `n`, where `<key>` is `BH_AGENT` slugged plus the address, as `agent.mjs` builds `key`. With no `--task`, look at every task with status active or paused. Nothing new prints `No new reports.`
3. `bh task show` (text mode, `taskText` in tasks.mjs) lists each step's report under the step: `   report: <file> — <summary> (<from>)`.
4. `team.mjs reportSection`: after writing the report file, the child runs `bh report <task> --step <n> --file <path> "<one-line summary>"`, and then still sends `hc send <parent> "<summary> — <path>"` as today (the message wakes the parent; the board record is the source of truth). Fill `<task>`, `<n>`, `<path>` and `<parent>` with real values when known.

### Step 5: the child's own brief and the brief update
5. `bh spawn` gives the child process its task, step, plan and parent: add `--task`, `--step`, `--plan`, `--parent` to `agentArgv` (team.mjs) and `bh agent`, through to `runAgent`; set `BH_PARENT` and `BH_TASK` in `runAgent`'s environment. The non-headless branch of `bh spawn` builds its brief with the same task, plan, parent, name and step, not `{ mode, root }` alone. `bh brief <agent> --mode panel --plan <id>` then prints the plan line and the real report path.
6. Brief update: `runAgent` keeps `state.seen = { knowledge: <sha1 of the knowledge text in the brief>, boardN: <last board n of its task>, comments: [<open comment ids of its task and plan>], steps: { <n>: <status> } }`, written when the brief is made and after each turn. Before each later turn, recompute; when anything differs, put a `## Brief update` block before the user's message with only: new board entries (`n > boardN`, formatted as `bh board read` prints them), new open comments (text), steps whose status changed (`<n>. <title>: <old> → <new>`), and `Your project knowledge changed: run bh knowledge <agent> to read it.` when the hash differs. Nothing differs → the prompt is exactly the user's message (`test/headless.test.mjs` "second prompt has no brief" must pass unchanged). An agent with no task gets only the knowledge line.

### Step 6: a bounded board
7. `bh task show` text mode prints the board as counts by kind (`board: 3 contract, 1 decision, 5 done`), then the last 5 entries; `--board` prints all of them. `--json` is unchanged (whole board).
8. In `team.mjs brief`, the board lines teach: `bh board read <task> --since <n>` reads what is new since entry n; the brief update gives you n.

## Contracts
- Board `done` entry: `{n, at, kind: "done", from, to, text, step, file}`.
- `step.report = { file, summary, from, at }` on the task's step in task.json. Design's tracker (step 15) and the task page (step 18) will read both. Do not rename them.
- Env in an agent's process: `BH_AGENT`, `BH_PARENT`, `BH_TASK`, `BH_LEAD` (lead only).

## Constraints
No new dependency, no UI changes, functions at or under 20 lines, no refactor beyond this. Keep every existing test passing; `test/headless.test.mjs:231-238` and `:262-267` unchanged.

## Done when
- Tests: `bh report` posts the entry with `step` and `file`, sets `step.report`, stops the step's clock and leaves its status `active`; a later `bh task step <id> <n> done` adds no extra time.
- Tests: `bh inbox` shows an unread report once, `--peek` does not mark it, a second `bh inbox` prints `No new reports.`; a report addressed to another agent is not shown.
- Tests: a resumed headless turn after a new board post and a step change carries a `## Brief update` with exactly those two; a turn after no change carries no update.
- Tests: `bh brief dev --mode panel --plan <id>` contains the plan line and a concrete report path; `bh task show` prints counts and at most 5 entries, `--board` all.
- `node --test test/*.test.mjs` passes; `bh check` prints PASS.
- Update `.bot-herdr/tasks/t-20261113-n9rt/reports/dev-store.md` with a `## Steps 4-6` part (same sections), then run `bh report t-20261113-n9rt --step 6 --file .bot-herdr/tasks/t-20261113-n9rt/reports/dev-store.md "<summary>"` with the command you just built, and `hc send` me one line.

## If stuck
If a harness cannot take the update before the user's message, or the inbox's "to me" rule does not fit how addresses look, stop that part, finish the rest and report it under Blockers with path:line.
