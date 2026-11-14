Steps 7-9 and the gate-1 fixes are accepted pending two small fixes and a re-gate. Do these, then step 10. Same rules: engine, roles and tests only, no UI files, do not commit. Record the report with `node mods/bot-herdr/engine/bh.mjs report t-20261113-n9rt --step 10 --file .bot-herdr/tasks/t-20261113-n9rt/reports/dev-gate.md "<summary>"`, then `hc send` me one line.

## Fixes to step 7
1. When the fallback will run (changed code with no targeted test), decide it before running anything and run only the full suite, not the targeted tests too. Today `bh check` here runs 116 targeted tests and then all 221 (337 in total).
2. The verdict line names only what ran: `PASS: <c> tests pass` plus `, lint passes` / `, typecheck passes` only when some ran, and `; no lint or typecheck is set up` when none exist. The same goes for FAIL lines. Update any test that pins the old wording.

## Step 10: the QA gate gets what it needs, and its verdict is kept
3. `bh spawn qa --review --task <id>` (bh.mjs, the review branch) appends to QA's first message, built by the engine:
   - the plan's `### Acceptance criteria` section, read from the task's plan (`task.plan` → `.bot-herdr/plans/<plan>/plan.md`), when the task has one;
   - the list of reports on the task: each step's `report.file` and summary, plus every `done` board entry's `file`;
   - the receipts: the last `bh check` receipt per step from `checks.jsonl` (command, ran, fallback, exit, head, diff hash), with the rule "a receipt whose diff hash equals the current `changeHash` is proof the check ran on this code: cite it, do not re-run";
   - the risk: `t.qa` when classified, else `unreadRisk()` from qa-risk.mjs (MEDIUM, full review), saying it was not classified.
4. Merge `roles/qa.md` and `roles/reviewer.md` into one rule set. Keep `roles/reviewer.md` as the file a review loads; QA's test-writing guidance moves into it; one budget and verdict section; remove the contradiction QA's panel found ("Do not re-run a check the worker ran" vs "Do not blindly trust automated test results"): the rule becomes "trust a receipt whose diff hash matches the current change; re-run anything else you rely on". `roles/qa.md` keeps only what QA does outside a review (writing tests on a step), with a pointer to reviewer.md. `team.mjs` keeps loading both for a review, so nothing is said twice. Read `.bot-herdr/reports/qa-panel.md` "Where it overspends" first.
5. `bh gate <task> --verdict PASS|CHANGES_REQUIRED [--round <n>] --file <report> "<one-line summary>"` records the verdict on the task under `updateTask`: `task.gates = [...(task.gates ?? []), { round, verdict, file, summary, from, at, head }]` (round defaults to the previous round + 1), and posts a `done` board entry with the file. `bh task show` prints the last gate as `gate: round <n> <verdict> — <summary>`. The review brief tells QA to finish with `bh gate`, and a re-review gets the previous round's findings file in its first message.

## Contracts
- `task.gates[]` entries `{ round, verdict, file, summary, from, at, head }`: Design's tracker and the task page may read them later.
- `checks.jsonl` receipts as you built them in step 7.

## Done when
- `bh check` on this repo runs only the full suite when it falls back and its PASS line names what ran (show the line in the report).
- Tests: a review spawn's first message (use the `BH_HC` stand-in to capture it) contains the acceptance criteria, the report list, the receipts and the risk; with no classification it says MEDIUM, not classified.
- Tests: `bh gate` stores the verdict and round, and a second `bh gate` makes round 2; `bh task show` prints the last gate.
- `bh brief qa --mode review` contains each rule once (no duplicated budget or verdict section) and the receipt rule.
- Full suite passes; `bh check` PASS.
