## Summary
Built the shared cross-platform retrieval layer (bundled-tool/PATH/git/Node tiers) and the new `search_code`, `read_slice`, `find_files`, `ast_search` and `locate` scripts.
Upgraded the existing reading scripts, fixed the sibling Windows breakages in `engine/scripts/` and `lib/scripts.mjs`, and added 16 injectable tests.

## Changes
- `engine/scripts/lib/common.mjs`: added `toPosix`, `stripBomAndCr`, `stripFileUrl`, `isMetaNoise`, `resolveSafePath`, `resolveCmd`, `resolveTool`/`resetToolCache`, `listProjectFiles`, `searchProject`; normalized `changedFiles`, `tracked`, `testsFor`, `namingTests`, `importsOf`, `changedRanges`, `declarations`; Windows-safe Python in `testCommand`.
- `find_symbol.mjs`: now uses `searchProject` (untracked/non-git/bundled rg, meta opt-in), fails with exit 2 on backend errors, supports `--body`/`--max-lines`, and keeps `-e` guards for names and `--config`.
- `repo_map.mjs`, `find_test_fixtures.mjs`: use `listProjectFiles`; `repo_map` takes `--include-meta`.
- `outline_file.mjs`, `find_tests_for.mjs`: normalize Windows/backslash paths; outline strips BOM/CRLF and keeps the old "cannot read" behaviour.
- `check_changed.mjs`: reads `pyproject.toml` with `readFileSync`, resolves `npx`/`python3` for Windows, normalizes file args.
- `run_changed_tests.mjs`: resolves `npx`/`python3`, normalizes file args.
- `failure_digest.mjs`: `cmd.exe` on Windows for `--run`, strips BOM/CRLF, parses `file:///C:/...`, drive letters and backslash paths.
- `affected_packages.mjs`, `check_contract_breakage.mjs`: `/`-normalized dirs/importers, git `-c core.quotepath=false`, `searchProject` for grep callers, CRLF-stripped exports.
- `lib/scripts.mjs`: copies the runner before replacing `python3`; exports `RUNNERS` for the immutability test.
- New `search_code.mjs`, `read_slice.mjs`, `find_files.mjs`, `ast_search.mjs`, `locate.mjs` with purpose/usage headers and read-only contracts.
- New `test/retrieval.test.mjs` and `test/windows-scripts.test.mjs`.

## Brief Check
- `npm test` passes with 0 failures and both new test files pass: met. Full run: 353 tests, 352 pass, 0 fail, 1 skipped (no headless browser), exit 0. New files alone: 16/16 pass.
- `bh check` passes: met. `PASS: lint and typecheck pass, tests pass.`
- `node --check` passes on every edited/created `.mjs`: met. All 19 changed/created script/lib files checked.
- Every script is listed cleanly by `bh scripts`: met against this worktree's engine (`node mods/bot-herdr/engine/bh.mjs scripts list`); the installed `bh` still lists the installed copy until this branch is merged/installed.
- Report via `bh report` and `hc send`: met by this report.

## Verification
- `npm test` — 353 tests, 352 pass, 0 fail, 1 skipped, exit 0.
- `node --test test/retrieval.test.mjs test/windows-scripts.test.mjs` — 16/16 pass.
- `bh check` — PASS.
- `node --check <every edited/created .mjs>` — all pass.
- `node mods/bot-herdr/engine/bh.mjs scripts list` — includes `ast_search`, `find_files`, `locate`, `read_slice`, `search_code` with purpose/usage.
- Manual smoke: `bh scripts run search_code`, `find_symbol --body`, `read_slice`, `find_files`, `locate`, `ast_search` missing-binary path.

## Notes / Deviations
- Patterns that start with `--` must follow the shared `--` argument separator (e.g. `search_code --literal -- --pre=echo`); single-dash patterns such as `-e` work directly. This is the existing `parseArgs` contract, and `searchProject` itself always passes `-e`.
- `read_slice --max` counts source lines, not section headers.
- `find_files` gained an optional `--regex` flag so its query can be either a substring or a regex.
- `listProjectFiles` filters `.git`, `node_modules` and (unless `includeMeta`) `.bot-herdr` consistently in every backend, and applies `glob`/`ext`/`maxDepth` in JS after the backend so tiers agree.
- `failure_digest --run` Windows shell selection is implemented but not executable on this Linux host; drive-letter/file-URL parsing is covered by `stripFileUrl` tests and a file-URL end-to-end test.

## Knowledge Proposals
- Retrieval tiers live in `engine/scripts/lib/common.mjs`: files are `fd` → `rg --files` → `git ls-files` → Node walk; searches are `rg` → `git grep --untracked` → Node. `.bot-herdr/` is excluded unless `includeMeta`, and bundled tools are `engine/bin/<name>` overridable by `BH_BIN_DIR`.
- A PATH `sg` is accepted as ast-grep only when `sg --version` matches `/^ast-grep\b/i`, so Linux shadow-utils `/usr/bin/sg` is never used by `ast_search`.
