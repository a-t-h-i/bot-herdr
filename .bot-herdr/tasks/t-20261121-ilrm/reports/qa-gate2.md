# QA Gate Review — t-20261121-ilrm (Round 2)

## Summary
Verdict: **PASS** — all 7 major and 6 minor findings from Round 1 are verified fixed in the live tree with regression tests and zero regressions.
Full test suite and checks pass on the current tree (`npm test`: 381/382 pass, 1 pre-existing skip; `bh check`: PASS; `baseline.mjs`: clean), with 3 non-blocking minor follow-ups noted.

## Changes
None (review only; no implementation or test files modified).

## Brief Check

### Round 1 Findings Verification
- **[Major #1] `parseHits` drops `-<digits>-` paths** — **MET**: `rgArgs` and `gitArgs` pass `--null`, `parseHits` splits paths on NUL (`common.mjs:326-336`), and `searchWithGit` uses a second matches-only pass when `context > 0` (`common.mjs:402-411`). Adversarial probe confirmed byte-identical match arrays across `rg`, `git`, and `node` for `context: 0, 1, 2` on `tasks/t-20261121-ilrm/foo.js`, `tasks/t-20261121-ilrm/dir-99-sub/bar.js` (BOM+CRLF), and `src/colon:123:name.js`.
- **[Major #2] `rgArgs` omits `--with-filename` on single-file searches** — **MET**: `rgArgs` always passes `--with-filename --null` (`common.mjs:369`). Single-file `searchProject` (`context: 0, 1`) and `search_code` (`-C 1`, `-C1`) match across `rg`, `git`, and `node`.
- **[Major #3] Boolean flags swallow positionals; `search_code` rewrites after `--`** — **MET**: `parseArgs` forwards `BASE_BOOLEANS` plus per-script booleans (`common.mjs:488-499`); `search_code.mjs:9-16` stops short-flag rewriting at `--`. Verified `-F`, `--literal`, `-i`, `-w`, `--include-meta`, `--defs`, `--body`, `--regex`, `--json`, and `search_code -- -i/-e/-F/-C2`. (One non-blocking minor edge case for `-- -h`/`-- --help` noted below.)
- **[Major #4] `listProjectFiles` parity on empty dirs and single files** — **MET**: `rg --files --no-config` treats exit 1 with empty stderr as `[]` (`common.mjs:277-282,298`); `fd` separates existing file paths from directories (`common.mjs:292-297`). Probe confirmed identical output across `fd`, `rg`, `git`, and `node` for `["empty"]`, `["src/app.js"]`, `["src/app.js", "empty"]`, and `["src/app.js", "tasks"]`.
- **[Major #5] Windows `npx.cmd` `EINVAL` via `execFileSync`** — **MET**: `resolveLocalBin` (`common.mjs:131-143`) resolves `node_modules/<pkg>/package.json` `bin` (running node-shebang/JS bins on `process.execPath` and native bins directly), falls back to `npx-cli.js` beside `process.execPath`, and never hands a bare `.cmd` to `execFileSync` (last-resort `cmd.exe /d /s /c`). `check_changed.mjs` and `run_changed_tests.mjs` both use `resolveLocalBin`.
- **[Major #6] `extractBinary` pre-unpack validation and symlink escape** — **MET**: `safeEntry` and lexical `inside` run before `unpack` (`install-tools.mjs:48-53,114-119`); post-unpack `lstatSync` rejects symlinks/non-files and `inside(realpathSync(dir), realpathSync(from))` blocks symlinked parent directories (`install-tools.mjs:121-124`). Probe confirmed both direct file symlinks and parent-dir symlinks (`pkg -> /outside`) throw `escapes` without writing `destPath`.
- **[Major #7] Missing script `usage` lines in `bh spawn` and `scriptsFrom` ordering/null-vs-none** — **MET**: `bh.mjs:801-807` formats all 21 built-in scripts cleanly as `bh scripts run <name> …` with usage lines; `scriptsFrom` (`classifier/index.mjs:409-420`) ranks secondary probabilities `>= 0.6` descending before capping at 3, returns `[]` only for explicit `choice === "none"`, and returns `null` for non-choice or all-hallucinated answers so `keywordPick` runs.
- **[Minor #8] `word: true` on `-e`** — **MET**: `searchWithNode` uses `(?<!\w)(?:...)(?!\w)` (`common.mjs:419`), matching `rg -w` and `git grep -w`.
- **[Minor #9] Atomic cache writes** — **MET**: `install` and `writeAtomic` write to `${file}.tmp.<pid>.<ms>` and rename atomically with `finally` cleanup (`install-tools.mjs:56-64,95-106`).
- **[Minor #10] `failure_digest` Windows TS/Rust paths and CRLF snippets** — **MET**: `toPosix` applied on TS/Rust errors and `stripBomAndCr` on code snippets (`failure_digest.mjs:55-57,108`).
- **[Minor #11] `ast_search` `--pattern=<value>`** — **MET**: `ast_search.mjs:26` passes `` `--pattern=${pattern}` ``; regression test verifies `--pattern=-e`.
- **[Minor #12] `find_test_fixtures` untracked/non-git test setup** — **MET**: `find_test_fixtures.mjs:72` reuses `listProjectFiles(root)` output.
- **[Minor #13] End-to-end `bh task new` layout and `bh spawn` tests** — **MET**: `test/scripts-classifier.test.mjs:197-231` verifies `bh task new` layout prompt and `bh spawn` classifier + `keywordPick` usage lines.

### Acceptance Criteria
- Install-time SHA256-verified bundling of `rg` 15.2.0, `fd` v10.5.2, `ast-grep` 0.51.3 with cache and offline fallback — **MET**.
- Unified cross-platform retrieval layer (`engine/bin` → PATH → `git` → Node), untracked, non-git, excludes `.bot-herdr/`, fails loudly — **MET**.
- Identical `/`-normalized paths, line numbers, exit codes, and truncation across backends — **MET**.
- Leading-`-`, shell metacharacters, and `../` guards (`-e`, `--`, no `shell: true`) — **MET**.
- Sibling Windows fixes without Unix-only `cat`/`bash`/`python3`/`npx` or `\` vs `/` breakages and immutable `RUNNERS` — **MET**.
- `bh task new` layout + `bh spawn` batched `scoreEffortAndScripts`, multi-pick, validation, names+usage in briefs, `keywordPick` fallback — **MET**.
- `npm test`, `bh check`, and `baseline.mjs` pass — **MET** (`herdr-app` and `gpui-kit` unavailable in this environment; see Info #5).

## Findings
1. **[minor] `parseArgs` matches `-h`/`--help` even after `--` — `mods/bot-herdr/engine/scripts/lib/common.mjs:492`**
   - `argv.includes("--help") || argv.includes("-h")` scans past `--`, so `search_code -- -h` and `search_code -- --help` print the script's help header instead of searching for `"-h"` or `"--help"`. Checking only `argv.slice(0, sep)` before `--` would close this edge case.
2. **[minor] Last-resort Windows `cmdLaunch` quoting — `mods/bot-herdr/engine/scripts/lib/common.mjs:121-124`**
   - Reachable only on Windows when neither `node_modules/<pkg>` nor `npx-cli.js` beside `node.exe` exists; `cmdQuote` leaves `%` unquoted and doubles `"` (`""`), and `sh()` runs `cmd.exe` without `windowsVerbatimArguments: true`, which can misquote filenames containing spaces, quotes, or `%` in that fallback.
3. **[minor] Same-process same-millisecond temp filename collision window — `mods/bot-herdr/engine/lib/install-tools.mjs:57,97`**
   - `${file}.tmp.${process.pid}.${Date.now()}` is safe across concurrent processes, and `install.mjs` runs sequentially; adding a random suffix would also guard hypothetical same-process concurrent calls.
4. **[info] Unattributed working-tree modifications outside this task**
   - `.bot-herdr/reports/advisor-panel.md`, `.bot-herdr/reports/qa-panel.md`, `.bot-herdr/reports/research-panel.md`, and `.bot-herdr/tasks/t-20261120-n1rc/task.json` remain modified from outside this task; they do not affect this task's checks.
5. **[info] Unavailable host checks**
   - `herdr-app` is not on PATH in this environment and no `gpui-kit` package exists in this repository.

## Verification
- `timeout 180 npm test` — exit 0 (382 tests: 381 pass, 0 fail, 1 pre-existing skip).
- `timeout 180 node "/home/athi/.config/herdr-app/mods/bot-herdr/engine/bh.mjs" check` — exit 0 (`PASS: 381 tests pass, 1 skipped; no lint or typecheck is set up`).
- `timeout 120 node test/bench/baseline.mjs` — exit 0 (brief sizes and latencies within baseline; `spawnToPromptMs: 444`, `bhMs` 208–334 ms).
- `timeout 60 node /home/athi/.gemini/antigravity-cli/brain/9a267e1a-e41a-42c8-8044-4a6868449453/scratch/probe.mjs` — exit 0; verified `parseHits` parity (`rg`/`git`/`node`, `ctx=0,1,2`) on `-<digits>-`, BOM+CRLF, and `:` paths; single-file `rg` parity; CLI flags & `--`; `listProjectFiles` parity on empty/single-file/mixed paths; `extractBinary` parent-dir symlink & non-file rejection; `resolveLocalBin` win32 paths; all 21 built-in `bh spawn` script usage lines; and `scriptsFrom` edge cases.
