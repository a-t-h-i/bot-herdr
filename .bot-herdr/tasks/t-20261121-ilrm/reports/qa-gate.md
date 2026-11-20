# QA Gate Review — t-20261121-ilrm (Round 1)

## Summary
Verdict: **CHANGES_REQUIRED** — 7 major defects found across retrieval backend parity, CLI argument parsing, Windows `.cmd` execution, archive symlink escape, and classifier script triage/brief injection.
Existing suite passes (`npm test`: 366/367 pass, 1 skipped; `bh check`: PASS), and `tools-manifest.json` matches the verified release facts, but adversarial probes reproduced all 7 blocking defects against the live tree.

## Changes
None (review only; no implementation or test files modified).

## Brief Check
- **Install-time SHA256-verified bundling of `rg` 15.2.0, `fd` v10.5.2, `ast-grep` 0.51.3 with cache and offline fallback**: PARTIAL — manifest is byte-identical to verified facts (`11035` bytes, 18 targets), cache and offline fallback work, but `extractBinary` allows symlink escapes out of the temp extraction dir (Finding #6).
- **Unified cross-platform retrieval layer (`engine/bin` -> PATH -> `git` -> Node), untracked, non-git, excludes `.bot-herdr/`, fails loudly**: PARTIAL — tier fallback and `.bot-herdr/` exclusion work, but boolean flags before positional arguments break CLI invocations (Finding #3) and `fd`/`rg` fail on single-file paths and empty directories (Finding #4).
- **Identical `/`-normalized paths, line numbers, exit codes, and truncation across all backends**: NOT MET — `parseHits` silently drops matches in any path containing `-<digits>-` on `rg`/`git` (Finding #1), and `rg` omits `--with-filename` on single-file searches (Finding #2).
- **Leading-`-`, shell metacharacters, and `../` guards (`-e`, `--`, no `shell: true`)**: PARTIAL — `resolveSafePath` and `-e`/`--` in `rgArgs`/`git` work, but `search_code` rewrites `-F`/`-i`/`-w`/`-C` even after `--` (Finding #3).
- **Sibling Windows fixes with no Unix-only `cat`/`bash`/`python3`/`npx` or `\` vs `/` breakages and immutable `RUNNERS`**: NOT MET — `resolveCmd("npx")` returns `npx.cmd`, which fails with `EINVAL` on Windows when passed to `sh()`/`execFileSync` without a shell on Node 18.20+/20.12+/22+/26 (Finding #5).
- **`bh task new` layout + `bh spawn` batched `scoreEffortAndScripts`, harness multi-pick, pick validation, names+usage in child briefs, `keywordPick` fallback**: NOT MET — `bh.mjs` omits script `usage` lines from child briefs, and `scriptsFrom` misorders multi-picks and returns `[]` instead of `null` on malformed or all-hallucinated answers, suppressing `keywordPick` fallback (Finding #7).
- **`npm test`, `bh check`, `herdr-app check mods/bot-herdr`, gpui-kit typecheck, and baseline**: PARTIAL — `npm test` and `bh check` pass and baseline brief-size delta is modest (+156 to +328 bytes); `herdr-app` is not on PATH in this environment and no gpui-kit package exists in this repo.

## Findings

1. **[major] `parseHits` silently drops all matches in files whose path contains `-<digits>-` — `mods/bot-herdr/engine/scripts/lib/common.mjs:246`**
   - **Expected**: `rg`, `git`, and `node` return identical matches for every project file regardless of hyphens/digits in the path (including `.bot-herdr/tasks/t-20261121-ilrm/...` with `--include-meta`).
   - **Observed**: `/^(.*?)([:-])(\d+)\2(.*)$/` matches `-20261121-` lazily inside `tasks/t-20261121-ilrm/foo.js:1:export const needle = 2;`, recording it as a context line (`match: false`) for file `"tasks/t"` line `20261121`, so `rg` and `git` return `[]` for that file while `node` returns `tasks/t-20261121-ilrm/foo.js:1`. (Use `--null`/`-z` so the filename is NUL-delimited from line number and separator.)
   - **Reproduce**: Create `tasks/t-20261121-ilrm/foo.js` containing `needle`, commit, and call `searchProject(root, { pattern: "needle", backend })` for `"rg"`, `"git"`, and `"node"`.

2. **[major] `rgArgs` omits `--with-filename`, returning 0 matches when searching a single file path — `mods/bot-herdr/engine/scripts/lib/common.mjs:284`**
   - **Expected**: `search_code needle src/app.js` and `searchProject(root, { pattern: "needle", paths: ["src/app.js"], backend: "rg" })` return `src/app.js:1:...`, matching `git` and `node`.
   - **Observed**: Without `--with-filename` (`-H`), `rg` prints `1:export const needle = 1;` with no path prefix when given one file; `parseHits` skips every line and returns `[]` (`## 0 match(es) for "needle" (rg)`), while `git` and `node` return `['src/app.js:1']`.
   - **Reproduce**: Run `node mods/bot-herdr/engine/scripts/search_code.mjs needle src/app.js` in a repo containing `src/app.js` with `needle`.

3. **[major] Boolean flags before positional arguments swallow the positional argument across retrieval scripts, and `search_code` rewrites short flags after `--` — `mods/bot-herdr/engine/scripts/lib/common.mjs:394` & `mods/bot-herdr/engine/scripts/search_code.mjs:7-11`**
   - **Expected**: Boolean flags (`--literal`/`-F`, `--ignore-case`/`-i`, `--word`/`-w`, `--include-meta`, `--defs`, `--body`, `--regex`, `--json`) never consume following positional arguments; short-flag rewriting in `search_code` stops at `--` so `search_code -- -i` searches for `"-i"`.
   - **Observed**: `common.mjs:394` calls `parseOptions(argv, [], [])` with an empty `booleans` list, so `search_code -F needle`, `search_code --literal needle`, `search_code -i NEEDLE`, `find_symbol --defs needle`, `find_symbol --body needle`, and `locate --json needle` all fail with exit 2 usage errors; `find_files --regex app` ignores `app` and returns all files; `repo_map --include-meta src` ignores `src` and maps the whole repo. In addition, `search_code -- -i` rewrites `-i` after `--` to `--ignore-case` and prints `## 0 match(es) for "--ignore-case" (rg)`.
   - **Reproduce**: Run `node mods/bot-herdr/engine/scripts/search_code.mjs -F needle` or `node mods/bot-herdr/engine/scripts/search_code.mjs -- -i` or `node mods/bot-herdr/engine/scripts/find_symbol.mjs --body needle`.

4. **[major] `listProjectFiles` breaks backend parity on empty directories (`rg` exits 1) and single-file paths (`fd` exits 1) — `mods/bot-herdr/engine/scripts/lib/common.mjs:214-218`**
   - **Expected**: `fd`, `rg`, `git`, and `node` all return `[]` for an empty directory and `['src/app.js']` for a single file path (and `rg --files` passes `--no-config` like `rgArgs`).
   - **Observed**: `listProjectFiles(root, { paths: ["empty"], backend: "rg" })` throws `rg failed (exit 1)` (rg exits 1 when no files are found); `listProjectFiles(root, { paths: ["src/app.js"], backend: "fd" })` throws `fd failed (exit 1): [fd error]: Search path 'src/app.js' is not a directory.` while `rg`, `git`, and `node` return `['src/app.js']`.
   - **Reproduce**: Call `listProjectFiles(root, { paths: ["empty"], backend: "rg" })` and `listProjectFiles(root, { paths: ["src/app.js"], backend: "fd" })`.

5. **[major] Executing `npx.cmd` via `sh()` (`execFileSync`) fails with `EINVAL` on Windows (Node CVE-2024-27980) — `mods/bot-herdr/engine/scripts/check_changed.mjs:12,22,25,26,58`, `mods/bot-herdr/engine/scripts/run_changed_tests.mjs:10,41-44,60`, `mods/bot-herdr/engine/scripts/lib/common.mjs:75-82`**
   - **Expected**: `check_changed` and `run_changed_tests` run local JS tooling (`tsc`, `eslint`, `biome`, `vitest`, `jest`, `mocha`, `playwright`) cleanly on Windows without `EINVAL` or shell injection.
   - **Observed**: `resolveCmd("npx")` returns `"npx.cmd"` on `win32`, which is passed to `sh()` (`execFileSync` in `lib/core.mjs:314`, no shell). On Node 18.20+/20.12+/22+/26, `execFileSync`/`spawnSync` unconditionally rejects `.cmd`/`.bat` files with `EINVAL` unless run through `cmd.exe` (or invoked directly via `node` against `node_modules/.bin/<tool>` / resolved JS bin, avoiding `.cmd` shims altogether).
   - **Reproduce**: On Windows (Node 20.12+/22+/26), run `check_changed.mjs` on a `.ts`/`.js` file in a repo with `tsconfig.json`/ESLint/Biome, or `run_changed_tests.mjs` in a Vitest/Jest/Mocha project.

6. **[major] `extractBinary` allows symlink escape outside the temp extraction directory and unpacks before checking `binaryInArchive` — `mods/bot-herdr/engine/lib/install-tools.mjs:84-94`**
   - **Expected**: `extractBinary` rejects an escaping `entry.binaryInArchive` before running the extractor, and after extraction rejects symlinks or resolved paths whose `realpathSync` escapes `realpathSync(dir)`.
   - **Observed**: `inside(dir, from)` is checked only lexically and only after `unpack(...)`. A `.tar.gz` containing a symlink `pkg/rg -> /path/to/secret.txt` passes `inside(dir, from)` and `existsSync(from)`, and `copyFileSync` copies `"TOP_SECRET_DATA\n"` to `destPath`.
   - **Reproduce**: Create a `.tar.gz` with symlink `pkg/rg -> <outside file>` and call `extractBinary(archive, { archive: "tar.gz", binaryInArchive: "pkg/rg" }, { destPath })`.

7. **[major] `bh spawn` omits script `usage` lines from child briefs, and `scriptsFrom` misorders multi-picks and suppresses `keywordPick` fallback on malformed/all-hallucinated answers — `mods/bot-herdr/engine/bh.mjs:800-802` & `mods/bot-herdr/engine/classifier/index.mjs:405-417`**
   - **Expected**: Child briefs include matched script names AND their usage lines; `scriptsFrom` ranks secondary probabilities highest-first before capping at 3, returns `[]` only for an explicit valid `choice === "none"`, and returns `null` on non-choice or all-hallucinated answers so `bh.mjs:770` falls back to `S.keywordPick`.
   - **Observed**:
     - `bh.mjs:801` renders `- \`bh scripts run ${s.name}\` — ${s.purpose || "no purpose line"}` with no `usage` line.
     - `classifier/index.mjs:411` iterates `Object.keys(probabilities)` unsorted: for `{ choice: "scripts.0", probabilities: { "scripts.1": 0.65, "scripts.2": 0.95, "scripts.3": 0.9, "scripts.4": 0.85 } }`, `pickScripts` returned `[s0, s1, s2]` instead of `[s0, s2, s3]`.
     - `classifier/index.mjs:407,410-416` returned `[]` (not `null`) for `{ type: "score", score: 1 }` and for `{ type: "choice", choice: "scripts.99", probabilities: { "scripts.99": 0.9 } }`, suppressing `keywordPick`.
   - **Reproduce**: Call `C.pickScripts` with the three payloads above and inspect `bh.mjs:800-803`.

8. **[minor] `searchWithNode` `word: true` disagrees with `rg -w` / `git grep -w` on non-word characters — `mods/bot-herdr/engine/scripts/lib/common.mjs:319`**
   - `rg` and `git` match `const dash = "-e";` with `word: true`, while `node`'s `\b(?:-e)\b` returns 0 matches (use `(?<!\w)(?:...)(?!\w)` instead of `\b`).

9. **[minor] Non-atomic cache writes in `install-tools.mjs` — `mods/bot-herdr/engine/lib/install-tools.mjs:73-77,128-130`**
   - `copyFileSync(from, dest)` writes `cacheBin` in place instead of writing a sibling temp file and renaming atomically, leaving a race window if two `install.mjs` runs execute concurrently.

10. **[minor] `failure_digest.mjs` misses `toPosix` on TS/Rust file paths and `stripBomAndCr` on code snippets — `mods/bot-herdr/engine/scripts/failure_digest.mjs:55-57,108`**
    - Backslashes in TS/Rust compiler errors are not normalized via `toPosix`, and CRLF source lines in `## Where it broke` retain `\r`.

11. **[minor] `ast_search.mjs` passes `--pattern` and `<pattern>` as separate args — `mods/bot-herdr/engine/scripts/ast_search.mjs:26`**
    - Passing `--pattern=${pattern}` prevents clap-based `ast-grep` from treating a leading-`-` pattern as a CLI flag.

12. **[minor] `find_test_fixtures.mjs:72` uses `git ls-files` (tracked-only) for `## Test setup` — `mods/bot-herdr/engine/scripts/find_test_fixtures.mjs:72`**
    - Misses untracked or non-git test config files (`vitest.config.*`, `jest.config.*`, etc.) that `listProjectFiles(root)` already returned on line 11.

13. **[minor] Missing end-to-end test for `bh task new` layout and `bh spawn` `## Suggested scripts` + `keywordPick` fallback — `test/scripts-classifier.test.mjs`**
    - `bh.mjs` integration is untested, which allowed the missing `usage` line in `bh.mjs:801` to pass unnoticed.

14. **[info] Unattributed working-tree modifications outside this task's reports**
    - `.bot-herdr/reports/advisor-panel.md`, `.bot-herdr/reports/qa-panel.md`, `.bot-herdr/reports/research-panel.md`, and `.bot-herdr/tasks/t-20261120-n1rc/task.json` are modified in `git status` with no attribution in this task's worker reports. They do not break this task; left untouched for the Orchestrator.

15. **[info] Unavailable host checks**
    - `herdr-app` is not on PATH in this environment (`herdr-app check mods/bot-herdr` exited 127), and no `gpui-kit` package exists in this repository.

## Verification
- `timeout 180 npm test` — exit 0 (367 tests: 366 pass, 0 fail, 1 pre-existing skip).
- `timeout 180 node /home/athi/.config/herdr-app/mods/bot-herdr/engine/bh.mjs check` — exit 0 (`PASS: 366 tests pass, 1 skipped; no lint or typecheck is set up`).
- `timeout 120 herdr-app check mods/bot-herdr` — exit 127 (`herdr-app` not installed on PATH).
- `node -e` manifest comparison (`tools-manifest.json` vs `.bot-herdr/tmp/ilrm-manifest-facts.json`) — byte-identical (11035 bytes).
- `node -e` adversarial retrieval & CLI probe — reproduced Findings #1, #2, #3, #4 (exact outputs confirmed against `/usr/bin/rg`, `/usr/bin/fd`, `git`, and Node).
- `node -e` adversarial security & classifier probe — reproduced Findings #6 (symlink escape copied outside file), #7 (`scriptsFrom` ordering `[s0,s1,s2]` and `[]` on malformed/hallucinated), and #8 (`word: true` on `-e`: rg=1, git=1, node=0).
