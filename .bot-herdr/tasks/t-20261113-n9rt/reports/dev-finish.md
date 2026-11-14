## Summary
Finished the cut-off work for steps 14 (engine half), 20 and 21: fixed the missing `appendJsonl` import and the dead `K.recordSource` call, made `bh usage` print minutes alone when a harness reports no tokens, and made `forBrief` cut knowledge files by whole sections. Four new/changed tests cover each, and each fails when its change is reverted.

## Changes
- `mods/bot-herdr/engine/lib/agent.mjs`: added `appendJsonl` to the `core.mjs` import, so the per-turn `recordUsage` added by the previous Dev can write `DATA/usage/<key>.jsonl` (it threw `ReferenceError: appendJsonl is not defined` before).
- `mods/bot-herdr/engine/bh.mjs`: removed the call to the nonexistent `K.recordSource` in `knowledge add` (nothing needs a source record; `knowledge inbox` matches by text); `usageLine` now prints `<agent> (<model>): <turns> turns, <minutes> min` when a group's input, output, cache and cost are all 0, and the token line otherwise.
- `mods/bot-herdr/engine/lib/knowledge.mjs`: `forBrief(root, agent, max = 8000)` splits on lines starting `## `, keeps the part before the first section plus whole sections while the running length stays within `max`, and ends with `[… cut: <names>; the whole file is in \`bh knowledge <agent>\`]`. When the first section alone is over budget it keeps that section's lines up to the last whole `- ` entry that fits (heading always kept) and names the section.
- `mods/bot-herdr/engine/lib/runner.mjs`, `lib/tasks.mjs`: unchanged by me; they already had the prior Dev's Claude/Codex usage events, `taskDetail`, `recordUsage` and `usageTotals`, verified against board entry 15 and kept as they are.
- `test/detail.test.mjs` (new): `T.taskDetail` — step 1 with a board post, a `step.report`, a checks receipt (`counts {pass 3, total 4}`) and a merged child (`stat {added 5, removed 2}`) gives events `board, report, check, merge` oldest first with `detail` `3/4 tests` and `+5 −2`, `agentName`, `elapsedMs` (worked 120000; active step 2 counts its running time), `done`/`total`, and `usage` per step and task.
- `test/headless.test.mjs`: the fake Claude `result` now reports `usage` + `total_cost_usd`, the fake Codex `turn.completed` reports `usage`; two new tests: a turn's usage lands in `DATA/usage/<key>.jsonl` and the task's `usage.jsonl` (Claude numbers, Codex numbers, pi `ms` only), and `bh usage --task` prints the token line for Claude and the minutes-only line for pi, with `No usage recorded.` before anything is recorded.
- `test/knowledge-inbox.test.mjs` (new): `bh knowledge inbox --task` lists a report's `## Knowledge Proposals` bullets with their file, drops one already in a knowledge file, and prints `No new proposals.` when none are left; `forBrief` keeps whole sections and names the cut ones, returns an under-budget file unchanged, and truncates an over-budget first section at the last whole `- ` entry.

## Brief Check
- (1) `appendJsonl` imported from `./core.mjs` in `lib/agent.mjs` — `test/headless.test.mjs` now 18/18 pass.
- (2) `K.recordSource(...)` line deleted; `bh knowledge add` no longer references it.
- (3) `bh usage` minutes-only line: met, printed for the pi group in the CLI test.
- (4) `forBrief` cuts by section, signature `(root, agent, max = 8000)` unchanged: met.
- (5) Tests: `T.taskDetail` (`test/detail.test.mjs`), usage capture and `bh usage` lines (`test/headless.test.mjs`), `bh knowledge inbox` and `forBrief` (`test/knowledge-inbox.test.mjs`) — all present and green.
- (6) Full suite, `bh check`, `herdr-app check` — output quoted under Verification.
- Revert evidence: run for `taskDetail`, Claude usage capture, `usageLine`, `forBrief` and the `knowledge inbox` branch; each test failed (see Verification). `git diff --stat` shows my edits only in `engine/bh.mjs`, `engine/lib/{agent,knowledge,runner,tasks}.mjs`, `test/headless.test.mjs` and the two new test files; the other modified paths are other agents' uncommitted work.

## Verification
- `timeout 500 node --test test/*.test.mjs` — `ℹ tests 253 / ℹ pass 252 / ℹ fail 0 / ℹ skipped 1` (the skip was already there).
- `node mods/bot-herdr/engine/bh.mjs check` — `Ran: 0 lint, 0 typecheck, 253 tests (full suite)` / `PASS: 252 tests pass, 1 skipped; no lint or typecheck is set up`.
- `herdr-app check mods/bot-herdr` — `check passed: mods/bot-herdr`.
- `node mods/bot-herdr/engine/bh.mjs task show t-20261113-n9rt --json` — `done 17`, `total 22`, `usage` present; step 1 `agentName "dev-store"`, `elapsedMs 484053`, `events []` (that step has no board post, report or receipt); step 11 `events` are `board, report, board` in `at` order.
- Revert: `taskDetail` returning plain steps — `test/detail.test.mjs`: `pass 0, fail 1`. Claude usage event disabled in `runner.mjs` — same test `actual: [ undefined, undefined, undefined, undefined ], expected: [ 120, 30, 5, 0.012 ]`. `usageLine` always the token form — `actual: 'Dev: 1 turns, 0 input, 0 output, 0 cache, $0, 0 min'`. `forBrief` back to `md.slice(0, max)` — `test/knowledge-inbox.test.mjs` forBrief test fails on the cut line. `knowledge inbox` branch disabled — that test `actual: [ 'Nothing recorded for inbox yet.' ]`.

## Knowledge Proposals
- `bh check` in this repo reports "no lint or typecheck is set up", so engine changes are only exercised by the test suite; a function-length or import mistake surfaces as a failing test, never a lint finding.
- `bh usage` groups by agent and model: a harness config with no model string produces one `Dev: <turns> turns, <min> min` line, distinct from the same agent's model lines.
