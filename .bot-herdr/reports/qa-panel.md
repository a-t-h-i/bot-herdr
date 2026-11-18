# QA panel — review loop and verification (p-20261113-bkli)

## Status
OPEN

## Questions

1. When `bh check` finds no targeted lint, typecheck or test for the changed files, what should it do?
   - Fall back to the project's test command — runs `npm test` here (188 tests, 21 s) and reports its real result
   - Fail with NOT VERIFIED — exits non-zero when files that run changed and nothing covered them, so the gate cannot pass on an empty run
   - Warn and pass — prints the counts (`0 checks, 0 tests`) and a plain "nothing ran" line, exit 0

2. How should the engine catch a worker claiming a check it never ran?
   - Check receipts (Recommended) — every `bh check`/test run writes a receipt (command, exit, tree hash); the report cites receipts and QA verifies them, so nothing re-runs
   - Report lint — a `bh report check` command reads the report's `## Verification` commands and flags ones with no matching run
   - QA reproduces — QA re-runs each claimed command itself, at token and time cost, but needs no new engine state

## Notes

### How the loop works today (facts)
- The gate is one agent: `bh spawn qa --review` (`bh.mjs:439-453`). It gets `global.md` + `roles/qa.md` (line 80) **plus** `roles/reviewer.md` (line 82, `team.mjs:82`). The review brief is 15 244 bytes and repeats the same budget/verdict rules twice.
- QA risk is computed only if the Orchestrator already ran `bh classify qa-risk --task`; otherwise `t.qa` is null and no risk section is appended (`bh.mjs:450-453`). The role text still says "it is under QA risk in your context" (`qa.md:7`). `unreadRisk()` (`qa-risk.mjs:513-531`, a MEDIUM full review) is exported and never called — clearly the intended fallback.
- QA gets the request and steps via `bh task show`, the board, and whatever the Orchestrator restated in the brief. Plan acceptance criteria, worker reports and the diff are not attached: `team.mjs:70-124` has no plan/criteria input for `mode: "review"`, `bh.mjs:455-460` names only QA's own report, and `taskText` (`tasks.mjs:209-226`) lists no reports.
- Nothing parses a report. `## Verification` is prose in `team.mjs:60`; `bh task step … done` (`tasks.mjs:91-106`) records no evidence; `task.json` has no gate result field (`tasks.mjs:45-64`), so a re-review's "what the previous round asked for" (`reviewer.md:113-116`) lives only in the Orchestrator's head.

### Where the gate misses (reproduced, not inferred)
1. **Worktree tasks: the gate reads the wrong tree.** `projectRoot()` maps `<root>/.bot-herdr/worktrees/<b>` back to `<root>` (`core.mjs:46-49`), so `bh check` (`bh.mjs:139`) and `bh classify qa-risk` (`bh.mjs:504`) run every git command against the main checkout. Probe: a worktree with `M src/a.mjs` + an untracked `src/wipe.mjs` containing `rmSync(…, {recursive:true})` → `bh classify qa-risk` = `NONE`, `qaRequired:false`, reason "nothing that runs changed"; `bh check` = "No changed files: nothing to check." + `PASS`. Severity for a Settings option that puts whole tasks there: gate skipped silently.
2. **Untracked new files are invisible to `readChange`.** `changes()` lists them (`bh.mjs:129-135`) but `git diff` carries no hunk, so `parseDiff` yields nothing, line counts are 0, area text rules never scan them, and `diffPayload` shows the model only `name (code, +0/-0)`. Probe: 122-line untracked `authkernel.mjs` ending in `rmSync(path, {recursive:true})` → `risk: "none"`, `qaRequired:false`. The same content as a tracked diff is `MEDIUM`/`HIGH`. `parseDiff` already understands a `New files (untracked):` block (`qa-risk.mjs:41-56`) that nothing feeds it, and the `total` stat line it reads (`:65-71`) is never printed by `git diff` — the untracked path was designed and never wired.
3. **A confident classifier "no" can cancel the engine's own area floor.** `areaFloor` returns `hit.strong ? "medium" : "none"` when Jev answers an area below 0.2 (`qa-risk.mjs:447-455`), and only `strong` hits survive (`:280`); combined with `:457` (`jev.confidence >= 0.5 ? jev.risk : …`) a path-only serious area can end at NONE. Same probe: `security` was flagged "by its path" and the verdict was still NONE.
4. **`bh check` passes on an empty run, and says it passed.** `check_changed` exits 0 when no linter/typechecker is set up (`check_changed.mjs:37-40`); `run_changed_tests` exits 0 when no targeted test command exists (`run_changed_tests.mjs:38-41`); `bh check` prints `PASS: lint and typecheck pass, tests pass.` (`bh.mjs:366`). This repo right now: 25 changed files → "No typechecker or linter", "Tests covering them: 0", `PASS`, exit 0. The full suite is 21 s (`node --test test/*.test.mjs`, 188 tests) — cheap enough to fall back to, and `project_commands.mjs` already knows the command.
5. **Test selection misses the mod's own tests.** `testsFor` matches by file stem and a `git grep` import pattern (`common.mjs:98-120`); the engine's tests import through `lib("lib/tasks.mjs")` and `new URL(...)`, so `lib/tasks.mjs`, `lib/team.mjs`, `classifier/qa-risk.mjs` report "no test found" while `test/engine.test.mjs` covers them. (`bh.mjs` matched only by accident through `new URL("../…/bh.mjs")`.) `importGraph`/`changedRanges` exist but only `diff_summary`/`circular_dependency_check` use them.
6. **No test covers the gate itself.** No test in `test/` mentions `qa-risk`, `readChange`, `combineRisk`, `bh check` or test selection; `test/engine.test.mjs` stops at arguments, tasks, plans, questions, knowledge, rules triage and brief composition.

### Where it overspends
- The contradiction inside QA's brief: `qa.md:30` "Do not re-run a check the worker ran; cite it" vs `reviewer.md:12-13` "Do not blindly trust … automated test results". QA is told not to re-run and given no way to see the reports it would cite.
- All budget rules are prose: `TEST_BUDGETS` (`qa-risk.mjs:423-440`) is printed, never counted; nothing counts the tests QA adds.
- `run_changed_tests` calls every non-test file "untested", so `.bot-herdr/*.json`, plans and mock PNGs fill the list (`Changed: 25 … No test found for: .bot-herdr/knowledge/archive/…`), and `testsFor` runs one `git grep` per changed file.
- `untracked package.json` is kind `config`, not `dependency` (`qa-risk.mjs:14-24`), so a new manifest never reaches the dependency floor (`:241-244`).

### How self-checks before reporting could work
Cheapest ordered set, all inside the engine (no new dependency):
1. `bh check` reports what ran (`N lint checks, N tests, 0 targeted`), writes a receipt under `.bot-herdr/tasks/<id>/checks.jsonl` (command, exit, base, tree hash, time), and either falls back to the project command or exits non-zero on an empty run — this is Q1.
2. `readChange` gets untracked content: synthesize hunks for untracked files (the format already exists) and let line/area rules see them; force at least MEDIUM when a new source file cannot be read.
3. Resolve the task's working tree everywhere: `bh check` and `qa-risk` use `W.taskCwd(task, root)`, and `scripts/lib/common.mjs projectRoot()` stops mapping worktrees while `store()` keeps mapping.
4. Cap the classifier's power to lower risk: a confident "none" may go no lower than the engine's area floor (never NONE when an area is hit).
5. At `--review` spawn, attach what QA needs: plan `### Acceptance criteria` (read from `plan.md`), the report paths under the task's `reports/`, and `unreadRisk` when `t.qa` is missing — instead of relying on the Orchestrator's prose.
6. Collapse `roles/qa.md` into `roles/reviewer.md` (one budget/verdict section, QA-specific test-writing guidance kept), removing the re-run contradiction.
7. Record the gate in `task.json` (`gate: {verdict, round, findings}`) so round 2 verifies instead of starting over and completion can name the evidence.
8. Tests worth writing (behaviour, not mechanics): untracked new source file raises the floor; worktree task's `bh check`/`qa-risk` see the worktree; empty `bh check` cannot print PASS; a serious area cannot be lowered to NONE.

### What "done" must mean for QA
Every acceptance criterion has an executed check naming a real command; the risk level reflects the content actually changed (untracked and worktree included); the gate's verdict is stored where the Orchestrator and a re-review can read it; and no PASS rests on a `bh check` that ran nothing.

### Constraints
- Panel seat only: nothing above is implemented; it is a candidate list with anchors, for the plan's Decisions/Steps.
- A `bh check` fallback to the full suite is cheap here (21 s) but not universally — the plan should gate it (Q1) rather than assume it.
