# Dev report — t-20261111-b2gp steps 5 and 7

## Summary

`bh files <path> [--all] --json` now lists a folder with the contract Design builds against (posted to the board), and the engine sends far less text: design/qa/dev child briefs fell 51% / 45% / 33%, the QA risk prompt 74% on the same 60 KB diff, and `pickScripts` asks one question instead of up to 24.

## Changes

**Step 5 — file listing**

- `mods/bot-herdr/engine/lib/files.mjs` (new): `resolveFolder()` (home / cwd resolution) and `listFolder(path, { all, limit })` — folders first then files, each `localeCompare` case-insensitive with a stable tie-break; dot-names hidden unless `all`; entries whose `stat` fails skipped; cap at 2000 with `truncated`; one plain sentence (`No such folder: …`, `Not a folder: …`, `Can't read …`) when it can't list; Windows `""` / `/` lists the drives.
- `mods/bot-herdr/engine/bh.mjs`: `files` case prints the JSON (or a plain `d`/`-` listing), and turns a failure into `{error}` on stdout + exit 1; `bh files` added to `HELP`.
- `test/files.list.test.mjs` (new): order, `--all`, truncation, missing path and file path (library and CLI).

**Step 7 — spend**

- `mods/bot-herdr/engine/classifier/qa-risk.mjs`: new `diffPayload()` sending a per-file summary (`path (kind, +added/-removed)`) plus at most `HUNK_CHARS = 12 000` of changed lines, ordered source → other → tests → docs/generated, with a "… N changed lines left out" tail; state is now `diff_summary` (≤4 000) + `diff` (the bounded hunks) instead of `clip(diff, 60_000)`.
- `mods/bot-herdr/engine/classifier/index.mjs`: `pickScripts` asks one `choice` question (`fit`) whose criteria are `scripts.<i>` plus `none`, then returns the chosen script and any other at ≥0.6 probability, at most 3 — same return shape (script objects).
- `test/knowledge-classifier.test.mjs`: test for `pickScripts` (one question, chosen scripts, `none` → `[]`).
- `mods/bot-herdr/engine/scripts/lib/common.mjs`: `sh`, `projectRoot`, `parseArgs` now come from `../lib/core.mjs` (~120 lines removed); `parseArgs` keeps its `--help` header behaviour and delegates with no booleans, so script flags parse as before.
- `mods/bot-herdr/engine/roles/global.md`, `worker.md`, `design.md`, `qa.md`, `dev.md`: rules merged so each lives in one file — search/read discipline, dependency-and-architecture approval, brief "Done when" check and knowledge proposals now exist only in `global.md`; `worker.md` owns testing/lint/handoff/board/pushback/scripts; the design mockup recipe stays in `panel.md` (its only consumer) with a pointer from `global.md`; `dev.md`'s `## Verification` (duplicate of worker handoff) removed.
- `mods/bot-herdr/engine/lib/team.mjs`: tighter tool bullets, child-agent steps and report section; the dynamic `## Rules` line removed (its rule moved into global hard rules). Part order unchanged: stable text → tools → child agents → reporting → knowledge → the person's instructions last.

### Brief sizes (bytes, `bh brief <role> --mode <mode> | wc -c`)

| role | child | panel | review | lead |
|---|---|---|---|---|
| design | 26 375 → **12 974** | 22 418 → 12 739 | 24 034 → 14 355 | 25 934 → 12 678 |
| qa | 23 688 → **12 950** | 19 742 → 12 724 | 21 358 → 14 340 | 23 247 → 12 652 |
| dev | 19 181 → **12 912** | 15 219 → 12 670 | 16 835 → 14 286 | 18 740 → 12 614 |
| orchestrator | 21 074 → 18 301 | 22 906 → 20 574 | 24 522 → 22 190 | 20 621 → 17 924 |
| research | 11 221 → 8 381 | 13 116 → 10 717 | 14 732 → 12 333 | 10 780 → 8 083 |
| scout | 10 695 → 7 855 | 12 604 → 10 205 | 14 220 → 11 821 | 10 254 → 7 557 |

Role files: global 4 701 → 2 657, worker 5 866 → 2 587, design 10 665 → 3 217, qa 8 719 → 3 821, dev 4 003 → 3 853. Mean child brief 23 081 → 12 945.

### qa-risk prompt, same diff (78 036-char diff, state diff clipped at 60 000 as before)

| | before | after |
|---|---|---|
| prompt chars (`promptFor`) | 66 592 | **17 306** |
| `state.diff` chars | 60 000 | 11 995 |
| `state.diff_summary` chars | — | 490 |
| questions | 10 | 10 |

Source hunks come before test hunks: a diff whose test file is listed first yields `--- a/src/x.js` before `--- a/test/a.test.mjs`.

## Brief Check

- `test/files.list.test.mjs` covers folders first + case-insensitive order, dot-files vs `--all`, truncation at a small limit, missing path → exit 1 `{error}`, a file path → error; it passes — **met** (4/4 pass).
- Brief size table before/after; design/qa/dev child ≤ 13 KB — **met** (12 974 / 12 950 / 12 912).
- qa-risk prompt before/after on a 60 KB diff, after ≤ 25 000 chars — **met** (17 306).
- `pickScripts` asks one question; its tests pass — **met** (6/6 in `test/knowledge-classifier.test.mjs`).
- `bh check` and `npm test` pass — **met** (both PASS / 114 pass, 1 skipped).

## Verification

- `node --test test/files.list.test.mjs` — 4 pass
- `node --test test/knowledge-classifier.test.mjs` — 6 pass
- `npm test` — 114 pass, 0 fail, 1 skipped
- `node mods/bot-herdr/engine/bh.mjs check` — PASS (lint and typecheck pass, tests pass)
- `node mods/bot-herdr/engine/bh.mjs files "" --json` — lists `C:\` with `parent: null`; `files "~"`, `files mods/bot-herdr/engine` — resolve and sort as specified
- `bh scripts run`-equivalents after the helper merge: `repo_map`, `diff_summary --help`, `find_symbol listFolder`, `recent_changes` — all run

## Knowledge Proposals

- `bh brief <role> --mode child` embeds `.bot-herdr/knowledge/<role>.md`, which is edited by the Orchestrator: a brief's size can change under you, so leave headroom when chasing a budget.
- `engine/scripts/lib/common.mjs` now imports `sh`, `projectRoot` and `parseArgs` from `engine/lib/core.mjs`; `projectRoot` maps a task worktree back to the project, and `parseArgs` keeps the scripts' `--help` header.
- `bh files` is the only listing path the composer uses; it returns one folder at a time (no recursion) and is always this machine.

## Blockers / Notes

- The 13 KB result has only 3–50 bytes of headroom because the per-agent knowledge file is part of the brief and grew during the task (design's knowledge: 782 → 964 bytes at 12:44, which pushed design back over the line until the role file was trimmed again). Any new knowledge for design, qa or dev will exceed 13 KB again; keeping that guarantee means budgeting knowledge separately from role text.
- `review`-mode briefs (design 14 355, qa 14 340, dev 14 286) stay above 13 KB: they add `reviewer.md` (5 659 B) instead of `worker.md`, which this step's brief did not ask to trim.

---

# Follow-up: restored global rules, then step 15 (`bh models`)

## Restored in global.md

- `## Core principles` (seven one-line points: code first/smallest correct change; existing conventions; reuse before creating, YAGNI; avoid unrelated changes; security/reliability/performance/maintainability/UX/accessibility where relevant; validate assumptions against the repository and fix root causes; do not invent requirements, ask when genuinely ambiguous).
- "Be concise and operational; do not narrate every action or expose private reasoning." back in `## Talking to the person`.
- `global.md`: 2 657 → **3 158** bytes.

Brief sizes after the restore (bytes):

| role | child | panel | review | lead |
|---|---|---|---|---|
| design | 13 475 | 13 238 | 14 854 | 13 177 |
| qa | 13 451 | 13 225 | 14 841 | 13 153 |
| dev | 13 569 | 13 327 | 14 943 | 13 271 |
| orchestrator | 18 802 | 21 075 | 22 691 | 18 425 |
| research | 8 882 | 11 218 | 12 834 | 8 584 |
| scout | 8 356 | 10 706 | 12 322 | 8 058 |

`bh check` and `npm test` re-passed after the restore (125 pass, 1 skipped).

## Step 15 — `bh models <harness>`

### Changes

- `mods/bot-herdr/engine/lib/models.mjs` (new): `HARNESSES` (key → command, method, args), the pure parsers `parseOmp`, `parsePi`, `parseOpencode`, `parseAgy`, `parseAcpSession`, `parseCodexModelList` and `builtin()`; `runCli` (20 s, kills the process tree on timeout), `askRpc` (newline JSON-RPC over stdio, 30 s, kills the child as soon as the last reply arrives); `modelsFor(harness, { command, refresh })` with the 24 h cache.
- `bh.mjs`: `models` command (parsing and printing only) and its `HELP` line; `--refresh` added to the parser's boolean set so it never eats the next word.
- `test/models.test.mjs` (new): 11 tests — each parser against a fixture and against garbage, Claude never starting a process, unknown harness rejecting, cache hit / `--refresh`, a failing harness falling back with one sentence, a command that cannot start.
- `test/fixtures/models/`: `opencode.txt`, `agy.txt`, `claude.txt` copied from Research's samples; `omp.json` trimmed from a live `omp models --json` (Research's `omp.txt` is the table form, not the `--json` form); `pi.txt`, `acp-config-options.json`, `acp-available-models.json`, `codex-model-list.json` built from the response shapes Research documented, since pi, codex, gemini and qwen are not installed here.
- Cache: `<app home>/data/bot-herdr/models/<harness>-<command>.json`, using `DATA` from `engine/lib/core.mjs` (`ensureDir` + `writeJson`/`readJson`). Only a successful harness answer is cached; a failure is asked again next call. Claude is answered from `MODELS.claude` without starting anything, as the contract says.
- `MODELS` is imported from `mods/bot-herdr/models.js`; node loads it fine, so it is not copied.

### Verified on this machine

| command | source | method | models | first two |
|---|---|---|---|---|
| `bh models omp --json` | harness | cli | 22 | `deepseek/deepseek-flash` (DeepSeek-V4.1-Flash, efforts low/high/max), `deepseek/deepseek-v4-flash` (DeepSeek V4 Flash, low/high/max) |
| `bh models opencode --json` | harness | cli | 46 | `deepseek/deepseek-flash`, `deepseek/deepseek-v4-pro` |
| `bh models antigravity --json` | harness | cli | 6 | `gemini-3.8-flash-high` (Gemini 3.8 Flash (High)), `gemini-3.8-flash-medium` (Gemini 3.8 Flash (Medium)) |
| `bh models claude --json` | builtin | none | 14 | `claude-fable-5-2`, `claude-opus-5-5` (no error) |
| `bh models qwen --json` | builtin | acp | 3 (models.js) | exit 0 with `error` ("it closed the connection before answering" — qwen is not usable here) |
| `bh models omp --json` again | harness | cli | 22 | `cached: true`, same `at` |
| `bh models omp --refresh --json` | harness | cli | 22 | `cached: false` |
| `bh models nope --json` | — | — | — | exit 1, message on stderr |

No harness process is left: the only process matching the model-listing command lines is the PowerShell probe itself; the running `omp`/`opencode` processes are herdr agent sessions (`-p --mode json --session-dir …\.config\herdr`), not children of these runs.

### Tests

- `node --test test/models.test.mjs` — 11 pass
- `npm test` — 125 pass, 0 fail, 1 skipped
- `node mods/bot-herdr/engine/bh.mjs check` — PASS

### Notes

- `antigravity` prints a "Fetching available models..." progress line on stdout; the parser skips any line that is not `<id>\t<name>`, covered by a test.
- `pi` uses a copy of `roster.js`'s `parseModelList` rule inside `models.mjs` (the engine does not import mod files), as the brief asked.
- A harness that cannot start is not cached, so installing it and asking again works without `--refresh` on the first try; after that a cache hit reports `cached: true`.
