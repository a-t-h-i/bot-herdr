## Status
READY

## Title
Cross-platform code retrieval and classifier triage

## Plan

### Steps
1. Record before baselines with `node test/bench/baseline.mjs` and add a pinned binary manifest (`mods/bot-herdr/engine/tools-manifest.json`) plus install-time fetcher in `install.mjs` that downloads and SHA256-verifies `rg` (`BurntSushi/ripgrep` 15.2.0), `fd` (`sharkdp/fd` v10.5.2), and `ast-grep` (`ast-grep/ast-grep` 0.51.3) for the current OS/arch (Windows x64/arm64, Linux x64/arm64, macOS x64/arm64) into a cached `appHome` bin folder copied to `mods/bot-herdr/engine/bin/`, degrading cleanly when offline without failing `install.mjs`.
2. Build a shared cross-platform retrieval layer in `mods/bot-herdr/engine/scripts/lib/common.mjs`: resolve bundled `engine/bin/<tool>` first, then PATH, then `git grep --untracked` / `git ls-files`, then pure Node.js; normalize Windows/Unix paths to `/`-relative repo paths, strip CRLF, exclude `.bot-herdr/` noise by default, enforce `-e` and `--` argument guards with no `shell: true`, pass `-c core.quotepath=false` to git, and fail loudly on backend errors instead of printing "not found".
3. Upgrade existing reading scripts (`find_symbol.mjs`, `repo_map.mjs`, `outline_file.mjs`, `find_tests_for.mjs`, `find_test_fixtures.mjs`, and `bh knowledge ask` in `bh.mjs`) to use the shared retrieval layer so they find untracked files, work in non-git folders, exclude `.bot-herdr/` noise by default, and handle Windows paths and CRLF cleanly.
4. Add the new retrieval scripts: token-budgeted `search_code.mjs` (literal/regex search with globs, context lines, and hard output caps), `find_symbol.mjs --body` (returning full declarations via `declarations()`), multi-range `read_slice.mjs`, `find_files.mjs` (`fd` → `rg --files` → `git ls-files` → Node), `ast_search.mjs` (wrapping `ast-grep` with normalized `/`-relative output, caps, and clean unavailable guidance), and deterministic `locate.mjs` (combining symbol/keyword matches + `importGraph` + `testsFor` into a ranked file shortlist).
5. Wire classifier script triage and layout context: pass `repo_map` layout into `triageAndSkills` on `bh task new` (`bh.mjs:362`), batch `pickScripts` with `scoreEffort` in one classifier call on `bh spawn` (zero extra round-trips), fix harness/Clef multi-pick collapse (`classifier/harness.mjs:75`), validate every pick against real candidates, inject matched script names and usage lines into child briefs, and fall back to `keywordPick` when the classifier is off or fails.
6. Fix all sibling Windows breakages across engine scripts: replace Unix-only `cat` in `check_changed.mjs` with `readFileSync`, add cross-platform shell execution for `failure_digest.mjs --run` and Windows drive-letter/`file://`/backslash parsing, resolve `.cmd` shims for `npx` and `python`/`py` fallback in `check_changed.mjs`, `run_changed_tests.mjs`, and `common.mjs`, fix `\` vs `/` path comparisons in `check_contract_breakage.mjs` and `affected_packages.mjs`, stop mutating `RUNNERS[".py"]` in `lib/scripts.mjs`, and add `-e` guards to all remaining `git grep` callers.
7. Update role prompts (`mods/bot-herdr/engine/roles/{global,scout,worker,orchestrator}.md`) to teach the cross-platform `bh` retrieval commands (`repo_map`, `locate`, `search_code`, `find_symbol --body`, `outline_file`, `read_slice`, `find_files`, `ast_search`) and remove Unix-only `grep`/`find` wording.
8. Add injectable cross-platform unit and integration tests covering install-time binary provisioning/checksums/offline fallback, resolution order (`engine/bin` → PATH → `git` → Node), backend parity on Windows/Unix paths, drive letters, CRLF, UTF-8 BOM, spaces, and non-ASCII filenames, `-e`/argument-injection/path-traversal guards, sibling Windows script fixes, and batched `pickScripts` + fallbacks; re-run `node test/bench/baseline.mjs` to record before/after metrics.

### Objective
Bundle fast native retrieval tools (`rg`, `fd`, `ast-grep`) at install time behind unified cross-platform `bh scripts` with pure Node fallbacks, fix all Windows script breakages, and wire automated classifier script picking plus deterministic file location so every agent finds and reads code faster across Windows, Linux, and macOS.

### Scope and non-goals
In scope: install-time binary fetching and checksum verification for `rg` 15.2.0, `fd` v10.5.2, and `ast-grep` 0.51.3 in `install.mjs`, unified cross-platform retrieval layer and pure Node fallbacks, upgrading all existing reading scripts, adding `search_code`, `find_symbol --body`, `read_slice`, `find_files`, `ast_search`, and deterministic `locate`, wiring `pickScripts` into `bh spawn` and `repo_map` layout into task triage, fixing all sibling Windows breakages in `engine/scripts/` and `lib/scripts.mjs`, updating role prompts, and injectable cross-platform tests.
Not in scope: UI search dialogs or Settings UI changes, npm runtime dependencies in `package.json`, vendoring binary blobs in git, classifier file-level picking (handled deterministically by `locate` + Scout), semantic/embedding indexes, Universal Ctags (GPL-2.0, no official Windows binaries), `ugrep` (PCRE2 build burden), or Windows `findstr`.

### Acceptance criteria
- `node install.mjs` fetches, SHA256-verifies, caches, and installs platform binaries for `rg` 15.2.0, `fd` v10.5.2, and `ast-grep` 0.51.3 into the installed mod's `engine/bin/`, skips re-downloading when cached, and falls back cleanly without failing when offline.
- Every retrieval script (`find_symbol`, `repo_map`, `outline_file`, `search_code`, `read_slice`, `find_files`, `ast_search`, `locate`, `find_tests_for`, `find_test_fixtures`, `bh knowledge ask`) resolves bundled `engine/bin` → PATH → `git` → pure Node.js, works under default `standard` access across all harnesses, finds untracked files, works in non-git folders, excludes `.bot-herdr/` noise by default, and fails loudly on backend errors.
- All backends emit identical `/`-normalized repo-relative paths, line numbers, exit codes, and truncation caps across Windows and Unix paths, CRLF files, UTF-8 BOM, spaces, and non-ASCII filenames (`-c core.quotepath=false`).
- Leading-`-` queries, shell metacharacters, and `../` paths cannot inject flags, run commands, or escape the repo root (`-e` and `--` everywhere, no `shell: true`).
- Sibling scripts (`check_changed`, `run_changed_tests`, `failure_digest`, `affected_packages`, `check_contract_breakage`, `lib/scripts.mjs`) have no Unix-only `cat`/`bash`/`python3`/`npx` or `\` vs `/` breakages and do not mutate `RUNNERS`.
- `bh task new` passes `repo_map` layout to triage; `bh spawn` batches `pickScripts` with `scoreEffort` in one classifier call (zero extra round-trips), handles harness/Clef multi-pick, validates picks against real candidates, injects matched script names and usage lines into child briefs, and falls back to `keywordPick` when off or failing.
- `npm test`, `bh check`, `herdr-app check mods/bot-herdr`, and gpui-kit typecheck pass with new injectable cross-platform tests, and `test/bench/baseline.mjs` shows no latency/brief-size regression.

### Affected areas
Install & manifest: `install.mjs`, `mods/bot-herdr/engine/tools-manifest.json`.
Engine scripts: `mods/bot-herdr/engine/scripts/lib/common.mjs`, `find_symbol.mjs`, `repo_map.mjs`, `outline_file.mjs`, `find_tests_for.mjs`, `find_test_fixtures.mjs`, `check_changed.mjs`, `run_changed_tests.mjs`, `failure_digest.mjs`, `affected_packages.mjs`, `check_contract_breakage.mjs`, plus new `search_code.mjs`, `read_slice.mjs`, `find_files.mjs`, `ast_search.mjs`, `locate.mjs`.
Engine core & classifier: `mods/bot-herdr/engine/lib/scripts.mjs`, `mods/bot-herdr/engine/lib/agent.mjs`, `mods/bot-herdr/engine/bh.mjs`, `mods/bot-herdr/engine/classifier/index.mjs`, `mods/bot-herdr/engine/classifier/harness.mjs`.
Roles & tests: `mods/bot-herdr/engine/roles/{global,scout,worker,orchestrator}.md`, `test/`.

### Decisions by domain
- USER (rounds 1–2): Bundle `rg`, `fd`, and `ast-grep` fetched at install time via `install.mjs` (zero npm dependencies, no binaries in git); add core retrieval scripts (`search_code`, `find_symbol --body`, `read_slice`, `find_files`, `ast_search`, `locate`) and surface `outline_file`; wire classifier auto-pick scripts (`pickScripts`) with deterministic file location (`locate` + `repo_map` layout + Scout); fix all sibling Windows engine-script breakages in the same task.
- RESEARCH: Pinned official releases with verified Windows/Linux/macOS assets — `BurntSushi/ripgrep` 15.2.0 (Unlicense, 2026-07-15), `sharkdp/fd` v10.5.2 (Apache-2.0, 2026-11-07), `ast-grep/ast-grep` 0.51.3 (MIT, 2026-11-16). Universal Ctags and `ugrep` excluded.
- DEV: Wrap every retrieval tool behind `bh scripts` so all harnesses work identically under default `standard` access without widening shell permissions; cache fetched binaries in `appHome` so reinstalls stay fast and preserve binaries across `rmSync(mod)`.
- QA: Pure Node.js fallback instead of Windows `findstr`; test Windows paths, `.cmd` shims, archive extraction, missing binaries, injection guards, and classifier fallbacks on Linux via injectable helpers.
- ADVISOR: Batch `pickScripts` into the existing spawn classifier call so no extra latency is added; keep file location deterministic (`locate` + Scout).

### Assumptions
- [DEV] All `bh` retrieval scripts stay read-only and single-spawn so `bh check`'s capture path keeps working; archive extraction in `install.mjs` uses native OS tools (`tar` on Unix and Windows 10/11 `tar.exe`, with PowerShell `Expand-Archive` fallback for `.zip` on Windows) so zero npm dependencies are needed.
- [QA] `.bot-herdr/` is excluded from default code searches (opt-in flag available if needed) to eliminate the 67% noise ratio in this repo.
- [ORCHESTRATOR] No UI changes are in scope; Design is not needed.

### Risks and open points
- Risk: Local `npm test` runs on Linux only; Windows behaviour is verified via injectable tests unless a real Windows host pass is also run before closing.
- Risk: GitHub release archive names or SHA256 hashes must be fetched and verified from the real release endpoints during Step 1 when writing `tools-manifest.json` (never guessed).
- Risk: Bundled `.exe` binaries on Windows may trigger antivirus scans on first run; caching them in `appHome` avoids repeated fresh downloads.
