# Steps 7-9

## Summary
`bh check` now says what it ran, keeps a receipt on the task, and when no targeted test covers changed code it runs the project's own test command — or prints `NO CHECKS` instead of a PASS that rested on nothing. It and `bh classify qa-risk` read the task's own worktree; untracked files reach the classifier as content; an area hit can no longer be lowered to NONE; and test selection finds the engine's own tests by the path they name.
Six new tests in `test/verify.test.mjs` cover the worktree probe, untracked content, the floor, the fallback, NO CHECKS and receipts.

## Changes
- `mods/bot-herdr/engine/lib/core.mjs`: `projectRoot()` no longer maps a worktree back to its main checkout (the task's files are there); `store()` does the mapping instead, so tasks, plans and knowledge stay in the project a worktree was made from.
- `mods/bot-herdr/engine/scripts/lib/common.mjs`: `testsFor` matches a test's file stem, an import of the stem, **and the changed file's last two path segments in a string** (`lib/tasks.mjs`, `classifier/qa-risk.mjs`), all through one `git grep -n` for every changed file. Added `countTests` (node/vitest/mocha/pytest output) and `testCommand` (package.json `test`, pytest, Go, Rust; `""` when the project has none).
- `mods/bot-herdr/engine/scripts/check_changed.mjs`: every check carries `kind` (`lint` or `typecheck`); `--json` prints one object `{ files, lint, typecheck, checks: [{name, kind, ok, exit}], report }`; the human output is unchanged.
- `mods/bot-herdr/engine/scripts/run_changed_tests.mjs`: `--json` prints `{ files, ran, tests, command, exit, untested, report }`; the "No test found for" list is now only source files outside `.bot-herdr/` (no docs, images, JSON or store files).
- `mods/bot-herdr/engine/scripts/project_commands.mjs`: lists the test command `bh check` falls back to, from the same helper.
- `mods/bot-herdr/engine/classifier/qa-risk.mjs`: `readChange` appends a `New files (untracked):` block built from `input.untracked` + `input.root` (whole file content; unreadable or oversized source → at least MEDIUM with a factor), so line counts and area text rules see new files; an untracked manifest (`package.json` and the other `MANIFEST` names) is kind `dependency` even without a version line; `parseDiff` strips one leading `+` inside that block, so a content line starting `--- ` cannot be read as a file header; `areaFloor` returns `low` for a path-only hit and `medium` for a text hit, so a confident classifier "none" can never cancel an area the rules hit.
- `mods/bot-herdr/engine/bh.mjs`: `bh check` runs in `W.taskCwd(task, root)`, with `task = --task ?? currentTask`; prints `Ran: <a> lint, <b> typecheck, <c> tests (<targeted|full suite>)` before the verdict; when changed code (qa-risk `fileKind` `code`, outside `.bot-herdr/`) has no targeted test it runs the project's test command and prints `No targeted test covered the change: ran the full suite (<command>)`; when nothing ran it prints `NO CHECKS: nothing could verify these files` and exits 0 (never PASS). It appends a receipt through `T.recordCheck` and `--json` prints it. `bh classify qa-risk` reads `W.taskCwd` and passes `untracked` + `root` to the classifier. Helpers `scriptSummary`, `runSuite` (shell, for `npm run test`), `changeHash` (diff from HEAD + every untracked path and content, sha1), `runChecks`.
- `mods/bot-herdr/engine/lib/tasks.mjs`: `recordCheck(root, id, receipt)` appends under `withLock` to `.bot-herdr/tasks/<id>/checks.jsonl`; `checks(root, id)` reads them back.
- `mods/bot-herdr/engine/lib/scripts.mjs`: `run(root, name, args, { capture })` returns `{ code, out, err }` when captured.
- `mods/bot-herdr/engine/lib/agent.mjs`: sets `BH_STEP` from `--step`, beside `BH_TASK` and `BH_PARENT`.
- `test/verify.test.mjs` (new): the six cases below.

## Brief Check
- A worktree task with a modified file plus an untracked source containing `rmSync(…, {recursive:true})` is at least MEDIUM, and `bh check` sees both files: met — "a worktree task: qa-risk and bh check read its tree…" (risk is `medium`/`high`, `qaRequired` true, `bh check` prints `Changed: 2 file(s)`, one receipt written; before the fix both saw nothing).
- An untracked 120-line source file alone is not NONE; an untracked package.json is `dependency`; a path-only security hit with a confident "none" ends at LOW: met — "qa-risk reads untracked content, manifest kinds and unreadable new source" (`lines >= 120`, destructive strong, `areas.dependency`, unreadable source → `medium`) and "a confident classifier cannot lower an area the rules hit below LOW" (`low` for the path hit, `medium` for the text hit).
- `bh check` with changed code and no targeted test runs the fallback and says so; with no test command it prints NO CHECKS, never PASS; each run in a task appends one receipt: met — "bh check falls back to the project's test command…" (`No targeted test covered the change: ran the full suite (npm run test)`, `Ran: … (full suite)`, PASS, receipt with every field) and "bh check with no test command says NO CHECKS, never PASS" (NO CHECKS, no PASS line, receipt `exit: 0`).
- `testsFor("mods/bot-herdr/engine/lib/tasks.mjs")` finds `test/engine.test.mjs`: met — "testsFor finds the engine's own tests by the path tail they name".
- `node --test test/*.test.mjs` passes; `node mods/bot-herdr/engine/bh.mjs check` prints its Ran line and PASS here: met — see Verification.

## Verification
- `timeout 300 node --test test/verify.test.mjs` — 6/6 pass.
- `timeout 300 node --test test/*.test.mjs` — 221 tests, 220 pass, 1 pre-existing skip, 0 fail; three runs in a row, all pass.
- `timeout 300 node mods/bot-herdr/engine/bh.mjs check` — `Ran: 0 lint, 0 typecheck, 337 tests (full suite)` then `PASS: lint and typecheck pass, tests pass.` (337 = the targeted 116 + the full suite's 221), re-run after the Gate 1 fixes.
- `jq` on `.bot-herdr/tasks/t-20261113-n9rt/checks.jsonl` — a receipt with `at, from, step, command, base, head, diff, ran{lint,typecheck,tests}, fallback, exit`.

## Notes
- The fallback command is the one `project_commands.mjs` lists for npm (`npm run test`), so the message and the receipt name it exactly.
- On this repo the targeted run covers the engine files through the new path rule (e.g. `lib/tasks.mjs` → `test/engine.test.mjs`); the full suite still runs because Design's in-flight UI files (`chat.js`, `work.js`, `signals.js`, `viewer.js`, `plandoc.js`) have no test that names them yet — the gate is behaving as asked, not missing them.
- Receipt `fallback` holds the command string (or `null`), which is more useful than a boolean; `exit` is the code `bh check` returned.
- A new file over 200 kB is treated as unreadable (→ MEDIUM) instead of building a huge synthetic diff.
- NO CHECKS exits 0 (the user's chosen answer was to fall back, and with no command at all there is nothing to run); it never prints PASS.
- One `bh check` run earlier counted as FAIL while I ran `npm run test` in parallel from a second shell; both runs were fine alone. Nothing in the engine depends on that.

## Knowledge Proposals
- `bh check` runs in the task's working tree and keeps one receipt per run in `.bot-herdr/tasks/<id>/checks.jsonl`; QA reads the receipt instead of re-running.
- Test selection matches a changed file's last two path segments in test text, which is how the engine's own tests (`lib("lib/tasks.mjs")`) are found.

## Gate 1 fixes
Fixed as QA asked in `qa-gate1.md` (steps 1-6, before finishing 7-9). The 7-9 work above is kept as it was.

- **EPERM/EACCES on Windows** (`lib/core.mjs`): `withLock` treats `EPERM` and `EACCES` like `EEXIST` — a lock file pending delete makes the exclusive create fail with EPERM, so a waiter now waits and retries instead of failing.
- **Ownership** (`lib/core.mjs`): the lock file is stamped with a random token; `finally` removes it only when it still holds that token, so a holder whose lock was taken over never deletes the new holder's lock. Stale takeover renames the stale lock to a unique name and then removes *that*, so two waiters cannot both take it (the loser's rename finds nothing).
- **Wait time** (`lib/core.mjs`): `LOCK_WAIT_MS` is 15 000, longer than `LOCK_STALE_MS` (10 000), so a waiter outlives a killed command's lock and the next command never fails.
- **Brief update steps** (`lib/agent.mjs`): steps added since the brief print `<n>. <title>: new` and steps no longer there print `<n>: removed`, beside the existing status changes.
- **Reports reach the parent** (`lib/team.mjs`, `bh.mjs`): the `bh report` line in the brief carries `--to <parent>` when the parent is known, and `bh spawn`'s about line tells non-headless children to `bh report <task> … --to <parent> --file <report> "<summary>"` as well as `hc send`.

Tests added by this round:
- `test/store.test.mjs` "eight writers, forty posts each": 8 child processes × 40 `T.post` calls on one board — every writer exits 0 and the board holds 320 entries, `n` 1..320 with no repeats (QA's probe).
- `test/store.test.mjs` "a holder taken over as stale does not delete the new holder's lock": a holding child has its lock renamed away and replaced with another holder's token; when it finishes, the new lock is untouched.
- `test/headless.test.mjs` "the brief update lists steps added and removed since the brief": `2. Two: new` after a step is added, `2: removed` after it goes.

Verification: `node --test test/*.test.mjs` three times in a row — 220 pass, 1 pre-existing skip, 0 fail each time; `node mods/bot-herdr/engine/bh.mjs check` — PASS.
