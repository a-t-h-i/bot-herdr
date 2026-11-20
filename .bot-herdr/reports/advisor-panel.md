## Status
OPEN

## Summary
Reviewed `engine/scripts/`, `engine/classifier/`, `engine/roles/`, and headless permission/install plumbing for plan `p-20261121-0b9c`.
Ripgrep (`rg`) already supports Windows and Unix natively; the real gaps are `git grep`-only scripts + `standard` access blocking direct search CLIs, an unwired `pickScripts()` classifier feature, and no file triage or token-budgeted code-reading scripts.

## Changes
- `.bot-herdr/reports/advisor-panel.md` — planning panel advice and strategic questions for `p-20261121-0b9c` (read-only; no repository code changed).

## Questions
1. [ADVISOR] How should bot-herdr provide fast cross-platform code search on Windows and Unix?
   - Auto-detect in bh scripts — use `rg` when on PATH, fall back to `git grep` (including untracked files) and pure Node.js in non-git folders; keeps zero dependencies and works under standard access across all harnesses
   - Auto-detect plus install helper — same 3-tier `bh scripts` backend, plus a guided check or command to install `rg` when missing
   - Bundle ripgrep with mod — ship or manage platform `rg` binaries with bot-herdr for guaranteed speed out of the box, accepting larger installs and cross-OS binary maintenance
   - Add CLIs to standard access — keep `bh scripts` thin and also allow agents to call `rg` or `git grep` directly under standard access

2. [ADVISOR] How much of script and file triage should the classifier own versus deterministic scripts and Scout?
   - Auto-pick scripts, deterministic files — wire existing `pickScripts` into `bh spawn` (batched with effort) and pass folder layout into task triage, while locating exact files via fast deterministic `bh` scripts and Scout
   - Scripts plus folder triage — auto-pick scripts at spawn and have task triage narrow to 1–3 relevant directories from `repo_map`, leaving file-level selection to Scout and workers
   - Scripts plus file shortlist — auto-pick scripts and add two-stage file triage (deterministic search/import pre-filter → classifier reranks top ~25 files) to seed briefs and skip Scout on small tasks
   - Scripts and prompts only — keep the classifier out of script/file retrieval and rely on upgraded `bh` scripts plus tighter role prompts

## Notes

### 1. Cross-platform tooling & `bh scripts` vs direct CLIs (facts & trade-offs)
- **Ripgrep is already cross-platform:** `rg` ships native single binaries for Windows, macOS, and Linux — no separate Windows alternative is needed.
- **Zero-dependency architecture:** `package.json` has zero runtime dependencies and `install.mjs:33-38` copies `mods/bot-herdr/` verbatim. Bundling native `rg` binaries across OS/arch breaks that model (repo bloat, Windows Defender/signing friction, upgrade burden).
- **Why wrapping in `bh scripts` beats direct CLIs (especially for this team):**
  - Under default `standard` access (`mods/bot-herdr/engine/lib/runner.mjs:252-268,477-484`), `standardCommands()` permits `node "<bh>"`, `hc`, and `git status|diff|log|show` — **not** `rg`, `fd`, `git grep`, or `findstr`.
  - `bh team` runs Orchestrator/Design/QA/Advisor on `agy`, Dev on `pi`, and Research/Scout on `opencode`, so agents do not share uniform built-in search tools. Wrapping search behind `bh scripts run` gives every harness and OS identical output and zero permission prompts.
- **Concrete Windows & non-git bugs/gaps in current scripts:**
  - `mods/bot-herdr/engine/scripts/find_symbol.mjs:13,55`, `check_contract_breakage.mjs:67,71`, and `scripts/lib/common.mjs:114` hardcode `git grep`, which silently misses untracked files created mid-task and fails outside git repos.
  - `mods/bot-herdr/engine/scripts/repo_map.mjs:12` and `common.mjs:123,192` hardcode `git ls-files` (fails in non-git folders).
  - `mods/bot-herdr/engine/scripts/check_changed.mjs:29` calls Unix-only `sh("cat", ["pyproject.toml"])` instead of `readFileSync` — broken on Windows.
  - `mods/bot-herdr/engine/scripts/find_symbol.mjs:29,66` parses matches with `hit.split(":")`, which breaks if a backend emits Windows drive-letter paths (`C:\...`); any new backend must emit repo-relative `/`-normalized paths.
  - `mods/bot-herdr/engine/roles/scout.md:39` tells agents `"Prefer grep and find to locate code"` — on Windows `find` is `FIND.EXE`, and shell `grep`/`find` are blocked under standard access.

### 2. Classifier triage reality (what works, what is unwired, and cost/latency traps)
- **Script triage already exists — but is dead in automation:**
  - `pickScripts()` (`mods/bot-herdr/engine/classifier/index.mjs:374-393`), `DEFAULTS.features.scripts: true` (`index.mjs:46`), and `bh scripts pick` (`mods/bot-herdr/engine/bh.mjs:639-644`) are implemented, **yet nothing in `bh task new`, `bh plan new`, or `bh spawn` calls `pickScripts()`**. Only `roles/worker.md:18` mentions it passively, so workers either skip it or pay an extra tool turn.
  - **Low-cost fix:** Batch `pickScripts` with `scoreEffort` in a single `c.ask` call during `bh spawn` (mirroring `triageAndSkills` at `index.mjs:255-261`), injecting only the 1–3 matched script names + `usage` lines into the child's brief — zero extra round-trips and minimal brief bytes.
- **File triage does not exist — and naive file triage is a trap:**
  - `bh task new` (`bh.mjs:362`) calls `triageAndSkills(c, request, { roles })` without passing `layout`, leaving `triageState`'s `repository_layout` (`index.mjs:228`) unused.
  - `LIMITS.choiceOptions` is `250` (`mods/bot-herdr/engine/classifier/limits.mjs:4`), whereas real repos have hundreds to tens of thousands of files (`bot-herdr` alone has 902).
  - When a user runs the classifier on a local harness (`mods/bot-herdr/engine/classifier/harness.mjs:135`), every extra call spawns a CLI with up to 60 s timeout (though this machine currently uses OpenRouter Jev via `bh config`).
  - A classifier reading only file paths cannot verify `path:line` contracts or hidden callers — blind path-picking risks steering workers to the wrong files. If classifier file triage is wanted, it should either (a) narrow to 1–3 folders from `repo_map` inside the existing `triageAndSkills` call, or (b) rerank a small deterministic shortlist (≤25 files) rather than raw repo paths, keeping Scout authoritative on full/complex tasks.

### 3. Out-of-the-box, high-leverage retrieval upgrades (small code, large token savings)
- **One shared 3-tier search/list helper in `mods/bot-herdr/engine/scripts/lib/common.mjs`:** Add `searchFiles` / `listProjectFiles` (`rg` on PATH → `git grep --untracked` / `git ls-files` → pure Node `fs` fallback respecting `.gitignore`/noise). Every existing script and any new script inherits fast cross-platform + non-git support with zero dependencies.
- **Collapse 3-turn read loops into 1 call:** Today agents burn multiple turns (`find_symbol` → `outline_file` → `read` line range), bloating long resumed sessions (where `bh metrics` shows cached context dominates spend). Three tiny, composable wins:
  1. Surface `outline_file` (`scripts/outline_file.mjs`) in `roles/global.md:26` and `roles/scout.md:35-36` (it already exists in pure Node and isn't even mentioned there).
  2. Add a token-budgeted `search_code` script (literal/regex search with glob filters, noise exclusion, optional context lines, and hard output caps) to fill the gap between whole-word `find_symbol` and raw shell grep.
  3. Add `--body` to `find_symbol` (reusing `declarations()` in `common.mjs:257`) or a multi-range `read_slice` script so an agent fetches exact symbol bodies or batched `file:start-end` slices in one tool call.
- **Deterministic `locate` / `context_pack` script (0 classifier tokens):** Combine symbol/keyword matches + `importGraph` (`common.mjs:232`) + `testsFor` (`common.mjs:123`) into a compact ranked shortlist of files + key declarations. Useful standalone for Scout/workers AND doubles as Stage-1 pre-filter if classifier file reranking is chosen.
- **Scope boundary:** Keep UI untouched (`mods/bot-herdr/settings.js`, Design domain) unless Question 2 adds a new classifier feature toggle (e.g. `files`) or Question 1 adds a Settings tool-status/install indicator.

### 4. Advisor "Done when" criteria for the plan
- One unified cross-platform search/list primitive tested across all 3 tiers (`rg` mocked/present, `git grep` with untracked files, pure Node non-git fallback) and Windows path edge cases (`C:\...`, backslashes, no Unix-only `cat`/`grep`/`find`).
- Zero unapproved dependencies added to `package.json` (unless bundling is explicitly chosen).
- Any new classifier triage adds zero extra round-trips on the `bh task new` / `bh spawn` critical path and degrades cleanly when the classifier is off or on a slow local harness.
- Role prompts (`global.md`, `scout.md`, `worker.md`, `orchestrator.md`) teach the exact new retrieval path and drop Unix-only `grep`/`find` phrasing.
- Before/after brief size and `bh` latency checked via `node test/bench/baseline.mjs`.

## Brief Check
- Reviewed `mods/bot-herdr/engine/scripts/`, `mods/bot-herdr/engine/classifier/`, and `mods/bot-herdr/engine/roles/`: met.
- Weighed architecture, YAGNI, token/latency trade-offs (wrapping in `bh scripts` vs agent-direct CLIs, bundling vs auto-detecting tools, classifier file/script triage cost vs payoff vs Scout): met.
- Brought at most two sharp strategic questions in Planning Panel format: met (2 questions, 4 neutral options each).
- Read-only (no project code modified) and written to `.bot-herdr/reports/advisor-panel.md`: met.

## Verification
- `node "/home/athi/.config/herdr-app/mods/bot-herdr/engine/bh.mjs" plan show p-20261121-0b9c` — verified round 0, no draft yet.
- `node "/home/athi/.config/herdr-app/mods/bot-herdr/engine/bh.mjs" scripts run repo_map` — verified 902 files, 154 under `mods/bot-herdr/`.
- `node "/home/athi/.config/herdr-app/mods/bot-herdr/engine/bh.mjs" team` — verified live harnesses (`agy`, `pi`, `opencode`).
- `node "/home/athi/.config/herdr-app/mods/bot-herdr/engine/bh.mjs" config` — verified classifier enabled on OpenRouter.
- `git grep` + direct reads of `engine/classifier/{index,client,harness,limits}.mjs`, `engine/scripts/{find_symbol,repo_map,outline_file,check_contract_breakage,affected_packages,find_tests_for,find_test_fixtures}.mjs`, `engine/scripts/lib/common.mjs`, `engine/bh.mjs`, `engine/lib/{scripts,core,team,agent,runner}.mjs`, `engine/roles/{global,scout,worker,orchestrator,panel,dev,qa}.md`, `package.json`, `install.mjs`, `settings.js` — verified every cited `path:line`.
