QA gate for task t-20261114-gd43, "Fix the time worked timer". Risk: HIGH, as classified; this change is small, so review it at standard depth.

The request: the user says a task's time worked runs from when the task was first planned, never stops even when the agents stop, and is far too large.

What changed (staged in the working tree, uncommitted): time worked now comes only from the agents' recorded turns, the task's usage.jsonl records with `at` and `ms`.
- `stepTime` sums one step's turns.
- `taskTime` merges overlapping turn intervals so parallel agents count once.
- `worked(root, task)` falls back to stored `workedMs`, with no running part, for tasks that have no records.
- `taskDetail` and `listTasks` give `timeMs` per step and per task; `elapsedMs` equals it.
- The UI (work.js `workedOf` and `stepTime`, steps.js `stepWorked` and `taskWorked`) shows `timeMs` and has no clock on `started`.
- The tracker adds a live part only while the step's agent is working now (chat.js `workingSince` reads the rail's `since`).
The contract is on the board, entry 1. Reports: .bot-herdr/tasks/t-20261114-gd43/reports/dev-time.md and design-time.md.

Acceptance:
- An active step whose agent stopped no longer grows.
- Parallel turns are not double-counted in the task total.
- Nothing ticks between turns.
- The live part shows only for an agent working now.
- Old tasks without records keep a fixed figure.
- Each change has a test that fails without it, and `bh check` is green.

Look adversarially at:
- the interval-merge maths (overlap, containment, touching spans, unsorted input, missing `ms` or `at`);
- `step: null` records, which count in the task but in no step;
- a stale `since` entry for an agent that has died (does the live part keep growing?);
- every remaining place that still reads `started` for a duration (grep the mod).

Use `node mods/bot-herdr/engine/bh.mjs …` for bh commands. Verdict: PASS or CHANGES_REQUIRED. Tag each finding critical, major, minor or info, with its file:line, expected vs observed, and a fix. Write .bot-herdr/tasks/t-20261114-gd43/reports/qa-gate.md, record it with `node mods/bot-herdr/engine/bh.mjs gate t-20261114-gd43 --verdict <V> --file .bot-herdr/tasks/t-20261114-gd43/reports/qa-gate.md "<summary>"`, then `hc send` your parent the summary and the path. Do not edit production code.
