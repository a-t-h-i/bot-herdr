# dev-panel — engine: where handoffs, reports, the board, knowledge, resume, cost and parallel work lose time

## Status

OPEN

## Questions

1. Should a child's report be recorded on the task before the Orchestrator acts on it?
   - Board entry + inbox — the report writes its file and posts a `done` board entry carrying its one-line summary; `bh inbox` lists what is still unread, so nothing depends on a message arriving at the right moment.
   - Report gates the step — a step whose child left no report cannot be marked done, and the task cannot close while a report is unread.
   - Keep messages, add listing — reports stay a file plus `hc send`; add `bh reports <task>` listing the files with their summaries.
2. How should two children on one task be kept off each other's files?
   - Claims on the board — `bh spawn --files` records what a child may touch, and a second overlapping claim is refused.
   - Per-child worktree — each child gets its own checkout and branch; merging back is the Orchestrator's step.
   - Advisory only — keep today's prose rule and spend the work elsewhere.

## Notes

### Facts about the engine as it is now (all read, some run)

- **A resumed agent never gets a fresh brief.** `agent.mjs:262` builds and writes the brief only when there is no session yet (`if (!state.session && !acp.current) makeBrief()`), and the same text is used for every later turn as `""` because `makeBrief` (`agent.mjs:245-249`) is the only setter. Codex sends the brief only in the first prompt (`runner.mjs:303`), ACP only on the first `session/prompt` (`runner.mjs:539`). The only refresh is `/team` (`agent.mjs:342-344`), which re-sends the whole brief *and* appends an ack turn ("Reply with one line once you have read it"), so freshness costs a full knowledge file (up to 8000 chars, `knowledge.mjs:109-113`) plus a round trip.
- **`bh spawn` drops fields between the first message and the child's own brief.** `team.mjs:162` (`agentArgv`) has no `plan`, and `bh.mjs:468` passes none; `runAgent` (`agent.mjs:199`) has no plan parameter either. The non-headless branch builds the persistent brief as `team.brief(agent, { mode, root })` (`bh.mjs:473`) — no task, plan, parent or name. Consequence, verified live: `bh brief dev --mode panel` prints no `The plan is …` line and the report section says "the report file your first message names" (`team.mjs:57`); only the ephemeral spawn text carries the plan and the report path (`bh.mjs:455-461`). The durable artifact is thinner than the throwaway one.
- **Reports have no home in the task.** `reportSection` (`team.mjs:56-63`) gives a path and an `hc send` line; `tasks.mjs:201` exports `reportsDir` and nothing calls it (dead export, grep across `mods/`); `taskText` (`tasks.mjs:224`) prints the board but never lists reports; nothing tracks which reports were read. Ordering exists only through the message queue (`agent.mjs:368`), which is exactly the "report arrives after the check" race; `HANDLED`/`toChat` (`agent.mjs:37,44-48`) only hides the late arrival from the chat, it does not remove it.
- **Board and `bh task show` are unbounded.** `bh.mjs:174` loads the whole board for both output modes, and `taskText` inlines every entry (`tasks.mjs:224`); `bh board read --since N` exists (`tasks.mjs:152`, `bh.mjs:232`) but the brief never mentions it (`team.mjs:78`) and a child is never told its own cursor. Every post therefore raises the token cost of every later `bh task show`.
- **Actor identity is thrown away.** `bh board post` records `from: flags.from ?? null` (`bh.mjs:227`) and `bh task step` records `agent: flags.agent` with no default (`bh.mjs:186`), although the agent terminal exports `BH_AGENT` (`agent.mjs:428`) and `myAddress()` already exists (`core.mjs:183`). A smaller model that forgets `--from` leaves anonymous entries, and `worked()` then has nobody to attribute time to.
- **Nothing measures cost or tokens.** grep over the engine finds no usage/token/cost handling. The Claude `result` event's `usage`/`total_cost_usd` and Codex's `turn.completed` usage are discarded in `runner.mjs` (`claudeTurn`, `codexTurn`), so `bh classify effort` and `--effort auto` (`bh.mjs:441-447`) route blind. Step time is only closed by `bh task step … done` (`tasks.mjs:90-105`); `bh spawn --step` marks a step started (`bh.mjs:482`) and no path closes it when the child reports, so `worked()` (`tasks.mjs:141-143`) counts an abandoned active step as running until the task ends.
- **Parallel children share one write surface and one file with no locking.** All children of a task run in one worktree (`workspace.mjs` `taskCwd`), and the "two children never edit the same files" rule is prose only (`team.mjs:147`, `brief.js:50`). Two concurrent `bh task step` / `bh board post` calls race: `task.json` is read-modify-write whole (`bh.mjs:180-189`, `tasks.mjs:saveTask`) and `post` computes `n: board(…).length + 1` then appends (`tasks.mjs:147`, `core.mjs:94-97`) — two simultaneous posts can take the same `n` and one step update is lost. `writeJson` is atomic per write (`core.mjs:72-77`) but there is no lock across the read.
- **`bh check` for a child is scoped to the whole task.** `bh.mjs:360` uses `flags.base ?? currentTask().base`, the commit taken at task creation, so inside a shared worktree a child's `bh check` includes its siblings' uncommitted edits; a child cannot scope its own verification. [INFERENCE until a two-child run is timed]
- **Every spawn is a cold start.** `bh.mjs:435` appends a random suffix when `--name` is omitted, and the session file is keyed by name+terminal address (`agent.mjs:220-221`), so each child re-explores the repo instead of reusing the seat's earlier context. `resumeState` (`agent.mjs:186-192`) correctly resets on project change; it does not help here.
- **`hc` calls have no timeout.** `team.mjs:206-211` `spawnSync("hc", …)` without `timeout`, and a harness turn has no wall-clock watchdog, so one hung `hc` or a wedged child stalls the Orchestrator's whole turn.
- **Knowledge ingestion is manual and lossy.** `knowledge.mjs:1-6` states agents propose and the Orchestrator records; the report format already reserves `## Knowledge Proposals` (`team.mjs:58`) and nothing consumes it (grep: no reader). `forBrief` cuts at 8000 chars mid-file (`knowledge.mjs:109-113`), so `## Decisions` and `## History` can be invisible to an agent whose `Facts` are long; entries carry no timestamp or source path, and `search` matches `- ` bullets only (`knowledge.mjs:98-108`).
- **Children talk in the chat as loudly as the Orchestrator.** `agent.mjs:304-307` writes every agent's answer to the chat; `toChat` (`agent.mjs:44-48`) suppresses only a turn that is exactly `HANDLED` or a report with no words.

### Improvement candidates, by leverage

| # | Candidate | Where it lands | Buys |
|---|---|---|---|
| A | **Brief delta instead of `/team`**: keep `state.brief = { knowledge: sha1, boardN, comments: openIds, steps }`; each turn recompute cheaply and append `## Brief update` only with what changed (changed knowledge lines, board `n > boardN`, new open comments, changed step states). No change → zero extra tokens. Add `--plan` to `agentArgv`/`runAgent`/`bh agent`, and persist spawn context so `/team` reproduces the whole brief. | `agent.mjs:199,245-249,262,342`; `team.mjs:162`; `bh.mjs:611` | Kills the "brief only on /team" pain without a full re-brief per turn; keeps `headless.test.mjs:231-238` ("second prompt has no brief") true when nothing changed. |
| B | **`bh report` / `bh inbox`**: child writes the report file *and* posts a `done` board entry `{from, summary, file, step}`; parent reads unread ones with `bh inbox` (cursor per agent in DATA), and `bh task show` lists reports with summaries. Auto-close the step the report names. | new `bh` case; `tasks.mjs:145-152,201`; `team.mjs:56-63`; `bh.mjs:454-461,482` | Reports get a stable place and order in the task; the Orchestrator's check reads task state, not an inbox race. |
| C | **Bounded board**: `bh task show` prints counts by kind, the last 5 entries and `--board` for all; brief tells each child its cursor and `bh board read <task> --since <n>`. | `bh.mjs:174`; `tasks.mjs:224`; `team.mjs:78` | Stops the quadratic token growth of every `task show`. |
| D | **Default the actor**: `from`/`agent` default to `BH_AGENT`, then `myAddress()`. | `bh.mjs:186,227`; `core.mjs:183` | Attribution survives forgetful models; enables worked-time and claim checks. |
| E | **Claim + spawn base**: `bh spawn --files "a.ts,b.ts"` posts a `contract` entry with the files and refuses an overlap with an active claim; record spawn HEAD and tell the child `bh check --base <sha>`. | `bh.mjs:433-485`; `tasks.mjs:145`; `team.mjs:147` | Turns the file-ownership prose into an enforced rule and makes a child's verification its own. |
| F | **Concurrency safety**: per-task lock file (or one `task.json.lock` around read-modify-write) and a monotonic board id (a `.seq` file or fs-based max+retry). | `tasks.mjs:145-153`; `bh.mjs:180-189` | Two children posting/stepping stop losing writes and board numbers. |
| G | **Usage capture**: emit `{kind:"usage", tokens, costUsd, ms}` from Claude (`result.usage`), Codex (`turn.completed`), best-effort elsewhere; append `DATA/usage/<key>.jsonl`; `bh usage [--task] [--since]` per agent/model/effort; put tokens+minutes in the report. | `runner.mjs` (`claudeTurn`, `codexTurn`, `oneShot`), `agent.mjs:262-300`; new `bh` case | Effort routing gets a feedback signal; the user sees what a task cost. |
| H | **Seat reuse**: default spawn name to the seat and, when that terminal exists and is idle, `hc send` the new brief instead of `hc run`; `--reuse`/`--fresh` to choose. | `bh.mjs:433-470`; `agent.mjs:220-221` | Removes the cold re-explore per round and makes `hc read <name>`/steering predictable. |
| I | **Timeouts and watchdogs**: `timeout` on `team.hc`; cancel a turn after N minutes with no event, with the error surfaced like any other. | `team.mjs:206-211`; `runner.mjs oneShot`/`Acp.turn`; `agent.mjs:runTurn` | One wedged child stops stalling the Orchestrator silently. |
| J | **Knowledge intake and budget**: `bh knowledge inbox` listing `## Knowledge Proposals` gathered from task reports, `bh knowledge add --from <report>`; section-aware brief budget (Facts/Standards/Decisions, History last) instead of a mid-file byte cut. | `knowledge.mjs:109-113`; `bh.mjs:305-330`; `team.mjs:117` | Proposals stop dying in report files; agents stop losing whole sections to truncation. |
| K | **Children quieter in chat**: a child's report summary goes to the chat; its other turns go to the task board (or a setting: children "summaries only"). | `agent.mjs:304-307,44-48` | Fewer late/duplicate child messages competing with the Orchestrator's reply. |

### What the plan must respect

- `headless.test.mjs:231-238` and `:262-267` pin today's contract: the brief in the first prompt, no brief later, the child's report address in its own brief file. A and B must keep those assertions true (A: empty delta adds nothing; B: report path stays in the brief, now with task and parent filled).
- Adding `--plan` to `agentArgv` changes the managed template `command:` lines; `sync` only rewrites templates carrying `managed: bot-herdr` (`team.mjs:173-183`), so user-written templates stay safe, and `test/headless.test.mjs`, `test/engine.test.mjs:123-144` cover the brief shape.
- Board format is append-only JSONL read by `board()` (`tasks.mjs:152`); new `done` entries must remain plain `{n, at, kind, from, to, text}` (or additive fields), never a new file, so existing boards keep reading.
- Anything that runs `hc` must keep the `BH_HC` test stand-in working (`team.mjs:207-209`) and never go through a shell (a brief is one argument).
- Usage capture must be best-effort: ACP has no stable usage field, and a missing number must never fail a turn.
- Candidate F touches the only shared mutable store; it needs a test with two concurrent writers before anything else lands on top of it (E depends on it).

### What "done" means for my seat

- Each engine candidate merged has a unit test in `test/` that fails without the change and names the behaviour (delta contents, inbox cursor, claim refusal, concurrent step writes, usage totals, actor default).
- One live two-agent run on a throwaway task proves the end-to-end path: child starts, posts `bh report`, parent's `bh inbox` shows it unread, `bh task show` lists the summary, `bh usage` shows tokens, and the second turn of a resumed agent contains only the changed lines.
- No change to what the user sees in the chat or the task page unless the plan says so; `bh check` green.

## Improvement plan (dev seat, phased)

1. **Correctness first (small, unblocks the rest).** D actor default → F store lock + monotonic board id → I timeouts. F before E.
2. **Handoff integrity.** B `bh report`/`bh inbox` + step auto-close; A plan/task/parent carried into the brief and into a per-turn delta; C bounded board with a cursor in the brief. This is the set that fixes both "report arrives after the check" and "brief only on /team".
3. **Parallel and cost.** E file claims + spawn base for `bh check`; G usage capture and `bh usage`; H seat reuse.
4. **Knowledge.** J proposals inbox and section-aware brief budget; K chat quieting for children (a setting, because it changes what the user sees).

Each phase is independently shippable and leaves `bh check` green; 1 and 2 together carry most of the time saved.
