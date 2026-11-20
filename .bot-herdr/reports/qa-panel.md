## Status
OPEN

## Questions
1. [QA] When an external search binary (such as `rg`) is missing — or the project is not a git repository — what should code reading and retrieval do?
   - Auto-detect with Node fallback — use `rg` when available, fall back cleanly to `git` and pure Node.js so Windows and Unix work with zero setup and one consistent output format.
   - Bundle ripgrep per OS — ship or fetch platform `rg` binaries with the mod and fail fast if unavailable.
   - Require tool on PATH — expect `rg` (or `git`) to be installed and return an actionable error when missing.
2. [QA] If the classifier triages relevant scripts and files for a task or step, how should those picks apply — and what happens when it is off or unsure?
   - Advisory hints with rules — add picked scripts and files to the brief as starting pointers (never restrict reading), falling back to deterministic keyword/path rules when the classifier is off or fails.
   - Advisory when classifier runs — add picked scripts and files only when the classifier is enabled and confident; omit them otherwise.
   - Auto-pick scripts only — wire script picking into tasks/steps and leave file selection to Scout and the search scripts.

## Notes
**Current classifier state (files & scripts)**
- File triage does not exist today: `classifier/index.mjs:46` defines `features: { lobby, triage, effort, qa, scripts, skills }`. `triageState` (`index.mjs:228`) accepts a `layout` list, but `bh task new` (`bh.mjs:362`) never passes it (`C.triageAndSkills(c, request, { roles })`).
- Script triage exists (`pickScripts`, `index.mjs:374-393`, fallback `S.keywordPick` in `lib/scripts.mjs:69-77`), but is only called by the manual CLI `bh scripts pick "<step>"` (`bh.mjs:642`) — never automatically during `bh task new`, `bh plan new`, or `bh spawn`.
- `bh knowledge ask` (`bh.mjs:583`) dumps the first 500 `git ls-files` lines straight into Scout's prompt without filtering noise; in this repo `.bot-herdr/` is 602 of 902 tracked files (67%).

**Existing Windows & cross-platform bugs in `mods/bot-herdr/engine/scripts/`**
- Unix-only binaries and `.cmd` shim failures:
  - `check_changed.mjs:29` invokes `sh("cat", ["pyproject.toml"])` (missing on native Windows).
  - `failure_digest.mjs:13` hardcodes `sh("bash", ["-lc", flags.run])` for `--run`.
  - `check_changed.mjs:28-29`, `run_changed_tests.mjs:34`, `scripts/lib/common.mjs:153` hardcode `python3` (Windows commonly provides `python` or `py`).
  - `check_changed.mjs:20,23-24` and `run_changed_tests.mjs:39-42` run `sh("npx", ...)` via `execFileSync` (`lib/core.mjs:314`, no `shell: true`), which fails with `ENOENT` on Windows because `npx` is `npx.cmd`.
  - `lib/scripts.mjs:42-43` mutates the module-level `RUNNERS[".py"]` array in place on `win32`.
- Path separator & Windows drive-letter breakage:
  - `check_contract_breakage.mjs:78` compares `normalize(join(dirname(hit), spec))` (backslashes on Windows) against git's forward-slash `target`, silently missing relative importers on Windows.
  - `affected_packages.mjs:40,45-46,80` builds package dirs with `join()` (backslashes on Windows) and checks `file.startsWith(p.dir + "/")` against git's forward-slash paths.
  - `find_symbol.mjs:29,66` and `scripts/lib/common.mjs:115` parse grep lines with `hit.split(":")` / `/^(.+?):\d+:/` — absolute Windows paths (`C:\foo:12:bar`) break `:` splitting.
  - `failure_digest.mjs:29-31,51,58-59,66-68` strips `file://` (leaving `/C:/...` on Windows) and uses `[^():\s]+` / Unix-only path regexes that fail on drive-letter colons and backslashes.
  - `repo_map.mjs:10`, `common.mjs:100,134`, `find_tests_for.mjs` assume `/` when a caller passes Windows `\` paths.
- CRLF, encoding & git-only assumptions:
  - `outline_file.mjs:23,38,60`, `common.mjs:258`, `code_duplication_check.mjs:25`, `find_generated_files.mjs:19,39` split on `\n` without stripping `\r`, breaking `$`-anchored regexes on CRLF files.
  - `git ls-files` / `git diff` without `-c core.quotepath=false` octal-escape non-ASCII filenames, causing `existsSync` / `readFileSync` misses.
  - `find_symbol.mjs:13,55` searches only git-tracked files (misses untracked files, fails outside git repos) and does not exclude `.bot-herdr/` (running `find_symbol pickScripts` here returned 17 `.bot-herdr/` noise hits vs 2 code/test hits).
  - Avoid Windows `findstr` as a fallback: it has a 254-char search limit, 8 KB line limit, non-standard regexes, no `.gitignore` awareness, and codepage/UTF-8 issues. Pure Node.js fallback is far more reliable.

**Security & argument injection risks**
- Live argument injection bug: `find_symbol.mjs:8,13,55` allows leading `-` in `name` (`/^[\w$.-]+$/`) and passes `escaped` to `git grep -n -I -w -E <escaped>` without `-e` (same missing `-e` in `common.mjs:114` and `check_contract_breakage.mjs:67`). Any retrieval wrapper calling `rg` or `git grep` must pass `-e <pattern>` and `-- <path>` (or `--regexp`), and never pass untrusted queries through `shell: true` / `cmd.exe` (note `runner.mjs:35-37` `winQuote` leaves `%VAR%` unescaped for `cmd.exe`).
- Standard-access compatibility: `runner.mjs:252-255` (`standardCommands()`) only allows `node "<bh>"`, `hc`, and `git status/diff/log/show` in `standard` access. Exposing retrieval through `bh` / `bh scripts` works for all harnesses without widening shell permissions.

**Classifier failure modes & limits**
- Budget cliff: `classifier/limits.mjs:1-5` caps `choiceOptions: 250` and `requestChars: 110_000`. Raw file lists on medium/large repos exceed both — file triage needs a bounded, noise-filtered candidate set (e.g. directories/modules or pre-ranked files, excluding `.bot-herdr/`, lockfiles, build dirs).
- Harness/Clef multi-pick collapse: `pickScripts` (`index.mjs:386-391`) and `skillsFrom` (`index.mjs:305-311`) pick secondary items using `probabilities >= 0.6`, but `classifier/harness.mjs:75` defaults missing probability maps to `{ [choice]: 0.8 }` — so harness and Clef classifiers effectively return at most 1 item unless probabilities or a multi-select contract are handled.
- Hallucinated or out-of-root paths: any file/script picked by the classifier must be validated against the real candidate list (never trusting raw model strings), and callers must distinguish classifier-off/error (`null` → fallback) from confident `none` (`[]`).
- Latency/cost: batch new triage questions into the existing `triageAndSkills` call (`bh.mjs:362`) rather than adding another 8–60 s classifier round-trip per spawn.

**Testability & what "done" means for QA**
- Current coverage gap: 0 tests in `test/` cover `find_symbol.mjs`, `repo_map.mjs`, `outline_file.mjs`, or `lib/scripts.mjs` (only 1 test for `testsFor` in `test/verify.test.mjs:44-48`), and there is no CI workflow (`.github/` absent) running Windows tests.
- Design for Linux + Windows testability: isolate platform detection, path normalization, binary probing (`rg` / `git` / Node fallback), and command resolution behind injectable helpers (`platform`, `env`, `probe`/fake binaries in `PATH`) so `node --test` on Linux exercises Windows paths, missing-binary fallbacks, and injection guards deterministically.
- QA acceptance matrix for implementation:
  1. Retrieval backend parity: `rg` vs `git grep` vs Node fallback produce identical normalized `/` paths, line numbers, exit codes, and truncation caps on tracked, untracked, non-git, `.gitignore`'d, binary, CRLF, UTF-8 BOM, spaces-in-path, and non-ASCII filenames.
  2. Security: patterns starting with `-` (e.g. `-e`, `--help`, `--pre=...`), shell metacharacters (`&|;$\`%PATH%`), regex metacharacters, and `../` paths cannot inject flags, execute commands, or escape the repo root.
  3. Existing Windows script fixes: no `cat`/`bash` hardcodes without Windows equivalents, no `npx` ENOENT on Windows, no `\` vs `/` comparison mismatches, no `RUNNERS` mutation.
  4. Classifier triage tests: bounded candidate list under `LIMITS`, noise exclusion (`.bot-herdr/`), hallucinated/out-of-scope picks dropped, multi-pick behavior verified on both System One and harness/Clef shapes, and clean fallback when classifier is off, errors, times out, or returns `none`.
  5. Note explicitly in the plan if real Windows host verification is required before closing, since local `node --test` runs on Linux only.
