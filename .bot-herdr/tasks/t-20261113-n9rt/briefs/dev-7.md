Steps 4-6 are accepted and committed (8c57f1a). A QA gate is now reviewing steps 1-6; any fix it asks for comes to you later as its own step. Next: steps 7-9 of task t-20261113-n9rt (verification). Same rules: engine and scripts only, no UI files (Design is in chat.js, switch.js, work.js, questions.js, signals.js), withLock for every write, do not commit. Record your report with `bh report t-20261113-n9rt --step 9 --file .bot-herdr/tasks/t-20261113-n9rt/reports/dev-verify.md "<summary>"`, then `hc send` me one line.

The evidence for all three steps is QA's panel report: `.bot-herdr/reports/qa-panel.md`, "Where the gate misses" items 1-5 and "Where it overspends". Read it first; its path:line anchors were taken before this task's commits, so re-find them.

## Step 7: bh check says what ran, keeps a receipt, falls back to the full suite
1. `bh check` (bh.mjs, the `check` case; `scripts/check_changed.mjs`, `scripts/run_changed_tests.mjs`) counts what it ran: lint checks, typechecks, test files and tests. It prints one line before the verdict: `Ran: <a> lint, <b> typecheck, <c> tests (<targeted|full suite>)`.
2. Fallback (the user's choice): when files that run changed (any changed path outside `.bot-herdr/` that is code, as `qa-risk.mjs` classifies kinds) and no targeted test covered them, run the project's test command from `scripts/project_commands.mjs` and say `No targeted test covered the change: ran the full suite (<command>)`. When the project has no test command at all, print `NO CHECKS: nothing could verify these files` and exit 0. Never print the PASS line when nothing ran.
3. `run_changed_tests` stops listing `.bot-herdr/**`, images and docs (`.md`, `.png`, `.jpg`, `.json` under `.bot-herdr`) as "No test found for".
4. Receipt: every `bh check` inside a task appends to `.bot-herdr/tasks/<id>/checks.jsonl` (under `withLock`) `{ at, from, step, command: "bh check", base, head, diff, ran: { lint, typecheck, tests }, fallback, exit }`, where `from` defaults like board posts, `step` comes from `BH_STEP` if set (set `BH_STEP` in `runAgent` from `--step`, beside `BH_TASK`), `head` = `git rev-parse HEAD`, `diff` = sha1 of `git diff HEAD --binary` plus each untracked file's path and content. `bh check --json` prints the receipt.

## Step 8: the gate reads the real change
5. Worktrees: `bh check` and `bh classify qa-risk` run their git commands in the task's working tree, `W.taskCwd(task, root)` (workspace.mjs), not in `projectRoot()`. `scripts/lib/common.mjs projectRoot()` stops mapping a worktree back to the main checkout; `core.mjs store()` keeps mapping (the store stays in the main checkout).
6. Untracked files: `readChange` (classifier/qa-risk.mjs) feeds untracked files' content to `parseDiff` through the `New files (untracked):` block it already understands, so line counts and area rules see them. A new source file that cannot be read sets the risk to at least MEDIUM. An untracked `package.json` (or other manifest) is kind `dependency`, not `config`.
7. Floor: when an area rule hits a path, the classifier may lower the risk no further than LOW (a `strong` hit: no further than MEDIUM). It can never end at NONE with an area hit.

## Step 9: test selection finds the mod's own tests
8. `testsFor` (scripts/lib/common.mjs) also finds a test that names the changed file's path tail in a string, as the engine tests do (`lib("lib/tasks.mjs")`, `new URL("../mods/bot-herdr/engine/lib/tasks.mjs", …)`): search `test/` for the last two path segments (`lib/tasks.mjs`, `classifier/qa-risk.mjs`) besides today's stem and import rules. One `git grep` for all changed files, not one per file.

## Done when
- Tests: a worktree task with a modified file plus an untracked source file containing `rmSync(…, {recursive:true})` is rated at least MEDIUM by `bh classify qa-risk --task`, and its `bh check` sees both files (QA's probe in qa-panel.md item 1).
- Tests: an untracked 120-line source file alone is not NONE; an untracked package.json is `dependency`; a path-only security hit with a confident classifier "none" ends at LOW, not NONE.
- Tests: `bh check` with changed code and no targeted test runs the fallback command and says so; with no test command it prints NO CHECKS, never PASS; each run in a task appends one receipt with the fields above.
- Tests: `testsFor("mods/bot-herdr/engine/lib/tasks.mjs")` finds `test/engine.test.mjs`.
- `node --test test/*.test.mjs` passes; `node mods/bot-herdr/engine/bh.mjs check` prints its Ran line and PASS here (this repo has tests for these files).

## If stuck
If a classifier test needs the network (the classifier model), stub it the way existing classifier tests do, or test the pure function; if none exist, stop that part and report it under Blockers with path:line.
