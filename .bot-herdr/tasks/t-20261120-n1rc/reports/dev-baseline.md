## Summary
Step 1 baselines are recorded in `.bot-herdr/tasks/t-20261120-n1rc/baseline-before.json` and the Linux `findBrowser` failure is fixed. `npm test` now passes on Linux (257 pass, 1 skip, 0 fail).

## Changes
- `mods/bot-herdr/engine/lib/media.mjs`: `windowsBrowser` builds its Windows paths with `path.win32.join` (imported as `win32`) instead of `path.join`, which used `/` on Linux. Test untouched.
- `test/bench/baseline.mjs` (new): `node test/bench/baseline.mjs [out.json]` prints and writes:
  - `briefBytes` / `briefTokensApprox` (bytes / 3.6, rounded) for all six roles: `child` and `panel` each, `lead` for the orchestrator, `review` for QA. Built in-process with `team.brief` (same function `bh spawn` uses) against a fixed task/plan id, `headless: true`.
  - `bhMs`: median of 5 runs for `bh task list --json`, `bh task show <id> --json`, `bh board read <id> --json`, `bh team --json`, `bh tools claude`, `bh usage --json`, run as `node mods/bot-herdr/engine/bh.mjs …` from the repo. `bh tools claude` takes no `--json` (its output is always JSON); said so in the output's `notes`.
  - `spawnToPromptMs`: median of 5 runs from starting `bh agent dev --mode child` to the fake harness reading its first prompt. `test/headless.test.mjs` builds its fake harnesses inline and `test/fixtures/` has no harness file, so the script writes a minimal Claude-format fake into its own temp folder (plus a no-op `BH_HC`); no existing file was edited, so this key is a number, not `null`.
  - `node`, `platform`, `at`, `commit` (`git rev-parse HEAD` of the repo).
  - Fixture: a temp git project seeded with 50 tasks × 20 `recordUsage` records through `engine/lib/tasks.mjs` (`newTask`/`recordUsage`), plus the same records under the temp app home's `usage/`. Temp `HOME`, `XDG_CONFIG_HOME`, `USERPROFILE`, `APPDATA` and `BH_APP_HOME` are set before the engine modules load, so no real config or data is read or written; the temp root is removed in `finally`.
- `.bot-herdr/tasks/t-20261120-n1rc/baseline-before.json` (new): recorded output. Key numbers for step 14:
  - brief bytes: orchestrator 19 197 (lead) / 19 999 (child) / 21 935 (panel); dev 14 193 / 13 649; design 13 644 / 13 099; qa 12 113 / 11 587 / 14 608 (review); research 9 694 / 11 701; scout 9 392 / 11 419.
  - `bhMs`: task list 350.0, task show 306.6, board read 293.0, team 301.5, tools claude 286.1, usage 313.4.
  - `spawnToPromptMs`: 670.

## Brief Check
- `node --test test/mockup-browser.test.mjs` passes — met (8 tests, 8 pass, 0 fail, 0 skip).
- `npm test` shows no failures — met (258 tests, 257 pass, 1 skip, 0 fail).
- `node test/bench/baseline.mjs /tmp/b.json` exits 0 and writes JSON with every key — met (`briefBytes`, `briefTokensApprox`, `bhMs`, `spawnToPromptMs`, `node`, `platform`, `at`, `commit`; run also saved to the task path).
- `.bot-herdr/tasks/t-20261120-n1rc/baseline-before.json` exists — met.
- `git status` shows only the three named files as mine — met (`M mods/bot-herdr/engine/lib/media.mjs`, `?? test/bench/baseline.mjs`, `?? .bot-herdr/tasks/t-20261120-n1rc/baseline-before.json`).
- No new dependency, no refactor, functions ≤ 20 lines, real config untouched — met.

## Verification
- `node --test test/mockup-browser.test.mjs` — 8 pass, 0 fail.
- `npm test` — 258 tests, 257 pass, 1 skipped, 0 fail.
- `bh check` — PASS: 35 pass, 1 skipped (36 targeted tests); no lint or typecheck set up.
- `node test/bench/baseline.mjs /tmp/b.json` — exit 0, all keys written.
- `node test/bench/baseline.mjs .bot-herdr/tasks/t-20261120-n1rc/baseline-before.json` — exit 0, file written.
- Temp folders: none left under `/tmp/bh-bench-*` after the runs.

## Notes
- Timing on this box is noisy between runs (spawn-to-prompt ranged ~600–990 ms across three full runs; the saved file is the final median of 5). Step 14 should compare like for like and treat small deltas as noise.
- `spawnToPromptMs` measures `bh agent` (the headless runner), not `bh spawn`/`hc run`, so it isolates runner startup, brief generation and harness start without needing herdr-core.

## Knowledge Proposals
- Windows-only path probes must use `path.win32.join`; `path.join` yields `/` off Windows and breaks Windows browser detection (`engine/lib/media.mjs` `windowsBrowser`).
- `test/bench/baseline.mjs` is the step 1/14 baseline harness: it seeds its own temp project and app home (`BH_APP_HOME`, `HOME`) and is not picked up by `npm test` (`test/*.test.mjs` only).

## Script Proposals
None.

## Blockers
None.
