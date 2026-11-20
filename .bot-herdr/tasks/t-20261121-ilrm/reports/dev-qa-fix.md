## Summary
All 7 major and 6 minor findings of QA round 1 are fixed, each reproduced as a passing regression test.
`npm test` 382 tests / 381 pass / 0 fail / 1 pre-existing skip, `bh check` PASS, `node --check` clean on all 18 edited `.mjs` files.

## Changes
- `mods/bot-herdr/engine/scripts/lib/common.mjs`
  - `rgArgs`: always `--with-filename` and `--null` (single-file searches and context rows keep their path).
  - `gitArgs`/`searchWithGit`: always `--null`; `parseHits` now splits the path on NUL, so `tasks/t-20261121-ilrm/foo.js` never splits. `git grep -z` writes NUL where `:`/`-` go, so with `--context` a second matches-only pass marks which rows matched.
  - `parseHits(text)` → NUL-delimited `path\0line:text` / `path\0line-text`; `finishSearch` takes parsed events.
  - `searchWithNode`: `word` uses `(?<!\w)(?:…)(?!\w)` (matches `-e` like `rg -w`/`git grep -w`); a trailing newline no longer adds a phantom context row.
  - `parseArgs(argv, booleans)` forwards the script's booleans plus a shared base (`help,h,json,include-meta,all,dry-run,complex,tests,regex`).
  - `listProjectFiles`: `rg --files --no-config`; exit 1 with empty stderr is "no file" → `[]`; `fd` gets only existing directories (existing single-file paths are returned directly) and still walks `.` when no paths were asked.
  - New `resolveLocalBin(root, tool, { args, platform, env, probe })`: `node_modules/<pkg>/package.json` `bin` → node shebang/`.js` runs on `process.execPath`, anything else runs as its native binary; then npx's `npx-cli.js` beside `process.execPath`; only as a last resort on win32 a `.cmd` through `ComSpec /d /s /c` with every argument quoted (never a bare `.cmd` to `execFileSync`).
- `mods/bot-herdr/engine/scripts/search_code.mjs`: short-flag rewriting stops at `--`; booleans `literal,F,ignore-case,i,word,w,include-meta`.
- `mods/bot-herdr/engine/scripts/find_symbol.mjs`: booleans `defs,body,include-meta` (`--config` still takes a value).
- `mods/bot-herdr/engine/scripts/find_files.mjs`: booleans `regex,include-meta`.
- `mods/bot-herdr/engine/scripts/repo_map.mjs`: boolean `include-meta`.
- `mods/bot-herdr/engine/scripts/locate.mjs`: booleans `json,include-meta`.
- `mods/bot-herdr/engine/scripts/ast_search.mjs`: boolean `include-meta`; `--pattern=${pattern}` so a leading-`-` pattern is data.
- `mods/bot-herdr/engine/scripts/check_changed.mjs`, `run_changed_tests.mjs`: tsc/eslint/biome/vitest/jest/mocha/playwright come from `resolveLocalBin` instead of `resolveCmd("npx")`; the printed command keeps the `npx <tool>` label.
- `mods/bot-herdr/engine/lib/install-tools.mjs`: `safeEntry` validates `binaryInArchive` (NUL, `..`, leading `/`/`\`, drive letter) and the lexical `inside` check runs **before** `unpack`; after it, `lstat` rejects symlinks/non-files and `realpathSync(from)` must be inside `realpathSync(dir)`; the binary and `.sha256` marker are written to a sibling `${dest}.tmp.<pid>.<ms>` and renamed into place.
- `mods/bot-herdr/engine/scripts/failure_digest.mjs`: TS/`-->` (Rust) file paths go through `toPosix`; `## Where it broke` snippets are read through `stripBomAndCr`.
- `mods/bot-herdr/engine/scripts/find_test_fixtures.mjs`: `## Test setup` reuses the `listProjectFiles` list (so untracked, non-git config files count) instead of `git ls-files`.
- `mods/bot-herdr/engine/classifier/index.mjs`: `scriptsFrom` returns `null` for a non-`choice` answer and for an answer with no valid `scripts.<n>`; `[]` only for an explicit `none`; secondaries `>= 0.6` sorted by probability descending, valid primary first, deduped, capped at 3.
- `mods/bot-herdr/engine/bh.mjs`: `bh spawn` writes each suggested script's `usage` line (`node …`/`node {script}` rewritten to `bh scripts run <name>`) beside its purpose.
- Tests: `test/retrieval.test.mjs` (+5 tests), `test/windows-scripts.test.mjs` (+3, 2 extended), `test/install-tools.test.mjs` (+3), `test/scripts-classifier.test.mjs` (+5 incl. two `bh` end-to-end tests).

## Brief Check
- **[Major #1] `parseHits` drops `-<digits>-` paths** — met: `parseHits` splits the path on NUL; `a path holding -<digits>- parses the same on rg, git and Node, with and without context` passes; live probe returns `["src/app.js:1","tasks/t-20261121-ilrm/foo.js:2"]` on rg, git and node.
- **[Major #2] `rg` single-file search has no path** — met: `rgArgs` always passes `-H`/`--null`; `a single-file path is searched the same on rg, git and Node, and by search_code` passes (`src/bom.js:1` on all three, `search_code needle src/bom.js` prints `src/bom.js:1: const needle = "bom";`).
- **[Major #3] Boolean flags swallow positionals; `--` rewritten** — met: `scripts: boolean flags never eat the positional, and -- makes a dash pattern data` covers `search_code -F needle`, `--literal needle`, `-i NEEDLE`, `-- -e` (searches the literal `-e`), `find_symbol --defs needle`, `find_symbol --body decide`, `find_files --regex app`, `locate --json needle`, `repo_map --include-meta src` (`## src (N files)`).
- **[Major #4] `fd`/`rg` list parity on empty dirs and single files** — met: `listProjectFiles: an empty folder and a single-file path agree on every backend` passes for fd, rg, git and node (`[]` / `['src/app.js']`), `rg --files` now passes `--no-config`.
- **[Major #5] `npx.cmd` → `EINVAL` on Windows** — met: `resolveLocalBin runs a local package's JS bin on this Node, its native bin directly, and never a .cmd bare` and `check_changed and run_changed_tests run the project's own JS tools on this Node` pass (tsc/vitest ran as `process.execPath` + JS entry; win32 fallback resolves to `cmd.exe /d /s /c "vitest.cmd run \"a b\""`, no `.cmd` as `cmd`).
- **[Major #6] `extractBinary` symlink escape / pre-unpack check** — met: `a symlink in the archive cannot copy a file from outside it` (throws `/escapes/`, `destPath` absent) and `an unsafe archive entry is refused before anything is unpacked` (5 hostile entries, injected spawn never called) pass; `a binary entry that escapes the temp dir is refused` still passes.
- **[Major #7] missing usage lines + `scriptsFrom` order/fallback** — met: `multi-picks rank highest probability first, after the best pick, and cap at three` gives `[s0,s2,s3]`; `no usable answer is null …` gives `null` for `{type:"score"}` and `scripts.99`, `[]` for `none`; `bh spawn lists each suggested script's usage, from the classifier and from keywordPick` shows `` - `bh scripts run find_symbol` — find where a name is defined … · usage: `bh scripts run find_symbol <name> [--defs] …` `` with the classifier on (prompt recorded once) and with it off (keywordPick, no prompt).
- **[Minor #8] `word: true` on `-e`** — met: `word: true matches a token like -e the way rg -w and git grep -w do` gives `src/literal.js:3` on rg, git and node.
- **[Minor #9] atomic cache writes** — met: `the cache binary and its marker land atomically, with no temp files left` (cache dir holds exactly `.sha256` + `rg`, `engine/bin` exactly `rg`).
- **[Minor #10] `failure_digest` path/snippet normalization** — met: `failure_digest parses backslashes and file:// URLs and strips CRLF` asserts `src/lib/a.ts`, `src/lib/b.rs` (no `src\lib`) and no `\r` in the CRLF snippet.
- **[Minor #11] `ast_search --pattern <value>`** — met: the extended ast_search test asserts the tool received `--pattern=-e`.
- **[Minor #12] `find_test_fixtures` tracked-only test setup** — met: `find_test_fixtures names test setup files that git does not track` prints `## Test setup: vitest.config.js`.
- **[Minor #13] end-to-end `bh task new` layout + `bh spawn` brief** — met: `bh task new hands the classifier the repository layout` (recorded prompt has `"repository_layout"` and `src (2)`) and the `bh spawn` test above.
- **`npm test` 0 failures / `bh check` PASS / `node --check` on every edited file** — met (see Verification).

## Verification
- `timeout 600 npm test` — 382 tests, 381 pass, 0 fail, 1 pre-existing skip.
- `timeout 600 node /home/athi/.config/herdr-app/mods/bot-herdr/engine/bh.mjs check` — exit 0, `PASS: 381 tests pass, 1 skipped; no lint or typecheck is set up`.
- `timeout 300 node --test test/retrieval.test.mjs` — 14 pass / 0 fail.
- `timeout 300 node --test test/windows-scripts.test.mjs` — 10 pass / 0 fail.
- `timeout 300 node --test test/install-tools.test.mjs` — 9 pass / 0 fail.
- `timeout 300 node --test test/scripts-classifier.test.mjs` — 12 pass / 0 fail.
- `node --check` on the 14 edited engine files + 4 test files — all clean.
- Live backend probe (temp git project, `needle` in `tasks/t-20261121-ilrm/foo.js` and `src/app.js`) — rg/git/node agree on `["src/app.js:1","tasks/t-20261121-ilrm/foo.js:2"]`, identical context rows, `["src/app.js:1"]` for the single-file search, `["src/app.js:2"]` for `word: true` on `-e`; fd/rg/git/node return `[]` for `empty/` and `["src/app.js"]` for `src/app.js`.
- Live classifier probe — `pickScripts` ordering `["s0","s2","s3"]`, `null` for `{type:"score"}` and `scripts.99`, `[]` for `none`.

## Knowledge Proposals
- `git grep -z` (and `--null`) writes NUL where the `:`/`-` line separator goes, so context rows cannot be told from matches in one pass: run a second matches-only `git grep -z` and mark by `file\0line` (this is how `searchWithGit` in `scripts/lib/common.mjs` stays exact).
- `fd [pattern] [paths…]`: after `--` the first positional is the *pattern*, so the cross-platform lister passes `-- . <dirs…>`; a file path must be filtered out first (`Search path '…' is not a directory`).
- Node 18.20+/20.12+/22+ refuse `.cmd`/`.bat` via `execFileSync`/`spawnSync` without a shell (CVE-2024-27980): resolve the package's `bin` JS entry and run it on `process.execPath`, or `npx-cli.js` beside `node.exe`, and only quote-and-launch a shim through `ComSpec /d /s /c`.

## Script Proposals
- `bot_herdr_scripts_smoke.py` — purpose: run each built-in `mods/bot-herdr/engine/scripts/*.mjs` with a harmless argument against a temp git fixture and report the exit code; usage: `python3 .bot-herdr/scripts/bot_herdr_scripts_smoke.py [script…]`. This round's backend/CLI breakages (flags, single-file paths, NUL parsing) were only visible by invoking the scripts, which the job would make routine.
