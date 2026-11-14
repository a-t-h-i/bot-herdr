# Step 7 fixes and step 10

## Summary
`bh check` now decides the full-suite fallback before running anything (never both targeted tests and the suite), and its verdict line names only what ran. The QA gate now gets the plan's acceptance criteria, the task's reports, the `bh check` receipts with the tree hash, and a risk — classified or a stated MEDIUM; its verdict is recorded with `bh gate` and shown by `bh task show`. `roles/reviewer.md` is the single review rule set and `roles/qa.md` keeps only QA's non-review work.
Full suite 223 pass / 1 pre-existing skip; `bh check` here prints `Ran: 0 lint, 0 typecheck, 224 tests (full suite)` then `PASS: 224 tests pass; no lint or typecheck is set up`.

## Changes
- `mods/bot-herdr/engine/bh.mjs`:
  - `runChecks` asks `run_changed_tests --dry-run --json` first (it runs nothing), and only when a changed code file has no targeted test does it run the full suite — the targeted tests are then never run. `ranLine`/`verdictLine` compose `Ran: …` and the verdict from what actually ran (`PASS: <c> tests pass, lint passes`, `…, typecheck passes`, `lint and typecheck pass`; `; no lint or typecheck is set up` when neither exists; same wording for FAIL).
  - `reviewContext(root, task, cwd)` builds the review's first-message block: `### Acceptance criteria` from `task.plan`'s `plan.md`, `### Reports on the task` (each step's `report.file` + summary, plus every `done` board entry's file), `### Check receipts` (last receipt per step: command, ran, fallback, exit, head, diff hash) beside the current tree hash with the rule "cite it, do not re-run — re-run anything else you rely on", the risk (`qaRiskBrief(task.qa)`, else `unreadRisk(...)` + "This task was not classified"), and `### The previous round` from `task.gates`.
  - `bh spawn` resolves the task once, uses its worktree as `cwd`, and appends `reviewContext` to the first message for `--review`; helpers `mdSection` and `lastReceipts`.
  - New `bh gate <task> --verdict PASS|CHANGES_REQUIRED [--round N] --file <report> "<summary>"`, recorded on the task in its working tree's HEAD, help updated.
- `mods/bot-herdr/engine/lib/tasks.mjs`: `recordGate` appends `{ round, verdict, file, summary, from, at, head }` under `updateTask` (round = previous + 1) and posts a `done` board entry with the file; `taskText` prints the last gate as `gate: round <n> <verdict> — <summary>`.
- `mods/bot-herdr/engine/roles/reviewer.md`: rewritten as the single review rule set — source of truth, what the engine gives it (with the receipt rule), `## Budget: the QA risk` (the one budget section), inspect, deterministic checks, test behaviour, provenance, findings, `## Verdict`, recording with `bh gate`, stop, pushback. QA's budget units, depth levels and test-writing guidance moved here; the old "do not re-run / do not blindly trust" contradiction is gone.
- `mods/bot-herdr/engine/roles/qa.md`: only what QA does outside a review (writing tests on a step, `## Verification` in reports) plus a pointer to `reviewer.md`; no budget or verdict section.
- `test/verify.test.mjs`: three new tests — the review spawn's first message via a `BH_HC` stand-in, `bh gate` rounds/board/`bh task show`, and the review brief stating each rule once.

## Brief Check
- `bh check` on this repo runs only the full suite when it falls back, and its PASS line names what ran: met — `Ran: 0 lint, 0 typecheck, 224 tests (full suite)` then `PASS: 224 tests pass; no lint or typecheck is set up` (224 is the suite's own count; the 116 targeted tests are not run).
- A review spawn's first message contains the acceptance criteria, the report list, the receipts and the risk; with no classification it says MEDIUM, not classified: met — "a review spawn's first message carries criteria, reports, receipts and the risk" (captured through a `BH_HC` stand-in; asserts the criteria lines, `- step 1: <file> — shipped it`, `### Check receipts` with `ran 0 lint, 0 typecheck, 4 tests, exit 0`, `QA risk: MEDIUM`, "not classified").
- `bh gate` stores the verdict and round, a second call makes round 2, `bh task show` prints the last gate: met — "bh gate records the verdict and round…" (`[[1, CHANGES_REQUIRED], [2, PASS]]`, `from: "qa"`, a 40-hex `head`, both `done` entries carrying their files, and `gate: round 2 PASS — all good` in `bh task show`).
- `bh brief qa --mode review` contains each rule once and the receipt rule: met — "the review brief says each rule once and trusts a matching receipt" (one `## Budget`, one `## Verdict`, one "cite it, do not re-run", "Re-run anything else you rely on", and neither old contradiction phrase).
- Full suite passes; `bh check` PASS: met — 224 tests, 223 pass, 1 pre-existing skip, 0 fail; `bh check` PASS.

## Verification
- `timeout 300 node --test test/verify.test.mjs` — 9/9 pass.
- `timeout 300 node --test test/*.test.mjs` — 224 tests, 223 pass, 1 pre-existing skip, 0 fail.
- `timeout 300 node mods/bot-herdr/engine/bh.mjs check` — `Ran: 0 lint, 0 typecheck, 224 tests (full suite)` then `PASS: 224 tests pass; no lint or typecheck is set up`. The run took 30 s, i.e. the suite once: the targeted tests were not run before it.

## Notes
- The fallback is decided from `run_changed_tests --dry-run`, so the decision costs one git scan and no tests; the same receipt is still written (one per run, exit included).
- `bh gate` accepts `BLOCKED` as well as the two verdicts the brief names, because `reviewer.md` gives QA that verdict; round always defaults to previous + 1 and `--round` overrides it.
- A receipt's line shows a 12-character diff hash and a 7-character head; the review is told to compare the receipt's full hash with the tree hash printed beside it (the engine prints the full current hash).
- The review block is appended to the spawned agent's first message, not the generic brief, so `bh brief qa --mode review` stays a plain rule set (which is what the duplication test reads).
- `roles/qa.md` and `roles/reviewer.md` are both still loaded for a review (in that order), so the pointer at the end of `qa.md` lands before the rules it points to.

## Knowledge Proposals
- A QA gate verdict lives in `task.gates[]` and on the board (`done`, with the findings file); `bh gate` writes both, and a re-review gets the previous round's file in its first message.
- `bh check` either runs targeted tests or falls back to the project's full test command — never both — and its PASS line names only what ran.
