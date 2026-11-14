Step 11, the gate-2 fixes and the engine half of step 12 are committed (2cd89b1); QA gate round 3 is reviewing them. Next: steps 14, 20 and 21 of task t-20261113-n9rt, in that order. Same rules: engine and tests only (Design is building the tracker in tracker.js/steps.js/indicators.js), withLock/updateTask for every task write, do not commit. Record one report with `node mods/bot-herdr/engine/bh.mjs report t-20261113-n9rt --step 21 --file .bot-herdr/tasks/t-20261113-n9rt/reports/dev-data.md "<summary>"`, then `hc send` me one line.

## Step 14: each step's events (the contract is board entry #15; read it with `bh board read t-20261113-n9rt --since 14`)
1. `bh task show <id> --json` adds to each step `events` (oldest first, `{ at, kind, text, detail, from }`): kind `board` for board posts with `step === n` (detail = the board kind); `report` from `step.report` (text = summary, detail = file); `check` for each `checks.jsonl` receipt with `step === n` (text `Checks passed` / `Checks failed` by exit, detail `<pass>/<total> tests` from the receipt's counts, plus `, full suite` when `fallback`); `merge` for a `task.children` entry with this step and state `merged` (text `Merged <name>`, detail `+<added> −<removed>`, at = `mergedAt`). Also each step's `agentName` (step.agent, else the open child's name for the step) and `elapsedMs` (workedMs plus the running time when active), and the task's `done` and `total`.
2. Receipts must carry test counts for that: add `counts: { total, pass, fail, skipped }` to the receipt in `bh check` (you built `testCounts` in the gate-2 fixes).
3. Keep it out of text mode: `bh task show` without `--json` is unchanged.

## Step 20: usage
4. `runner.mjs`: emit `{ kind: "usage", input, output, cacheRead, cacheWrite, costUsd, ms }` from Claude's `result` event (`usage.input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`, `total_cost_usd`, `duration_ms`) and Codex's `turn.completed` (`usage.input_tokens`, `cached_input_tokens`, `output_tokens`); for pi and ACP only `ms` (the turn's wall time). Missing numbers are left out, never zero-filled and never an error.
5. `agent.mjs`: on each turn's usage, append `{ at, agent: who, harness, model, effort, task: BH_TASK, step: BH_STEP, ...usage }` to `DATA/usage/<key>.jsonl`, and when the turn ran for a task also to `.bot-herdr/tasks/<id>/usage.jsonl` under `withLock`.
6. `bh usage [--task <id>] [--since <ISO date>] [--json]`: totals per agent and model (turns, input, output, cache, cost, minutes); with `--task` from the task's file, else from every file in `DATA/usage`. `bh task show --json` gets `usage: { tokens, costUsd, minutes }` per step and for the task.

## Step 21: knowledge intake and budget
7. `bh knowledge inbox [--task <id>]`: lists the `## Knowledge Proposals` bullets from every report file on the task (step reports, `done` entries' files, gate files), each with its source file, skipping any bullet already recorded in the agent's knowledge file (same text). `bh knowledge add <agent> --from <report> "<fact>"` records the source path with the entry.
8. `knowledge.mjs forBrief`: cut by section instead of mid-file. Keep `Standards` and `Decisions` whole first, then `Facts`, then `History` last, each entry whole, within the same 8000-character budget; when a section does not fit, say `(<n> more in <section>: bh knowledge <agent>)` instead of cutting an entry.

## Done when
- Tests: a task with a board post, a report, a receipt and a merge for step 1 gives step 1 four events in time order with the contract's fields; `done`/`total`, `agentName`, `elapsedMs` present; text mode unchanged.
- Tests: a fake Claude result event and a fake Codex turn.completed record usage lines with the right fields; a pi turn records only `ms`; `bh usage --task` totals them per agent and model.
- Tests: `bh knowledge inbox` lists a proposal once and hides it after `knowledge add`; `forBrief` with a long Facts section keeps Standards and Decisions whole and says how many Facts it left out.
- Full suite passes (run it twice); `bh check` PASS.
