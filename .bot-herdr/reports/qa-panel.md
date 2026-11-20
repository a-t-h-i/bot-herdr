## Status
OPEN

## Questions
1. When a user manually assigns skills to an agent in Settings and the classifier also auto-assigns skills for a task or plan, how should they combine?
   - Pin manual, classifier adds — user-ticked skills are always included; classifier adds task-relevant discovered skills on top (falling back to manual-only if classifier is off or fails)
   - Manual is a hard allowlist — if the user ticked skills for an agent, classifier only picks within that set; if none are ticked, classifier picks from all discovered skills
   - Brief guidance only, no hard deny — classifier recommends relevant skills in the brief to focus the agent, without hard-denying other installed skills when the classifier misses one
2. Only Claude Code currently reports both tokens and USD cost (Codex reports tokens without cost; Gemini/OpenCode/Qwen ACP and pi/omp report only elapsed time). How should the Metrics dashboard handle unreported token and cost fields?
   - Show "n/a" where unreported (Recommended) — display exact reported numbers only, mark partial totals clearly, and never invent figures
   - Estimate USD from a price table — compute approximate cost wherever token counts are reported (e.g. Codex) and show "n/a" where tokens are absent
   - Extract usage across all harnesses — extend `runner.mjs` to parse token/cost data from ACP and pi/omp sessions first, falling back to "n/a" only when a harness truly omits them

## Notes

### Test suite layout & current baseline (`test/`, `package.json`)
- `npm test` (`node --test test/*.test.mjs`) runs 40 test files, 258 tests in ~54.6s.
- **Pre-existing failure on Linux**: `test/mockup-browser.test.mjs:42` (`findBrowser on Windows`) fails because `path.join` emits POSIX `/` on Linux (`C:\PF/Microsoft\Edge\Application\msedge.exe` vs `C:\PF\Microsoft\Edge\Application\msedge.exe`). 1 test is skipped.
- **Suite runtime bottlenecks**: `test/store.test.mjs` (~32s, lock-contention stress tests), `test/verify.test.mjs` (~28s, git worktree + `bh check`), `test/engine.test.mjs` (~19s, repeated `bh.mjs` subprocesses). New tests for skill matching, metrics aggregation, and brief sizing should test pure functions in-process so the suite stays under ~60s.

### Fragile areas to protect
- **Cross-platform paths & quoting**: `test/mockup-browser.test.mjs:42`, Windows `.cmd` quoting in `mods/bot-herdr/engine/lib/runner.mjs:35-37,125-138`, path normalization in `mods/bot-herdr/engine/lib/tools.mjs:74-77`.
- **Multi-writer JSON/JSONL stores**: `mods/bot-herdr/engine/lib/tasks.mjs` (`updateTask`, `post`, `recordUsage`) relies on file locks; `mods/bot-herdr/engine/lib/agent.mjs:324-327` silently swallows `recordUsage` write errors.
- **Harness asymmetry in skill discovery & enforcement**: `tools.mjs:16` only supports `claude`, `codex`, and `opencode` (not `gemini`, `qwen`, `pi`, `omp`, `antigravity`). `mods/bot-herdr/roster.js:204-214` can hard-deny skills only on `claude` (`--settings permissions.deny`) and MCP only on `claude`/`codex`; other harnesses rely on prompt wording in `team.mjs:84-89`.
- **Hidden perf hotspots already in code**:
  - `mods/bot-herdr/engine/lib/team.mjs:27,34-37` calls `installedNames(a.harness, { refresh: true })` (bypassing the 24h cache) for every agent with skills/MCP on every `team()` call.
  - `mods/bot-herdr/bh.js:28-34` spawns a fresh `node engine/bh.mjs` process per UI query; `tasks.mjs:51-58` (`listTasks`) reads every task's `usage.jsonl` on every list call.

### How we must measure improvements (baselines)
- **Usage schema gaps** (verified in `runner.mjs:317-361`, `agent.mjs:311-328`, and real `.bot-herdr/tasks/t-20261118-ftrv/usage.jsonl`):
  - `recordUsage` stores `agent: who` (spawned worker name like `dev-tools`, `qa-gate2`, not canonical `role`), has no `project` or `plan` field, and logs planning/chat turns only to global `DATA/usage/<key>.jsonl` (not per-project). Aggregating "which agents work the most" requires storing `role`, `project`, and `plan` on new records and defining a deterministic roll-up for historical records.
  - `tasks.mjs:304-307` (`usageTotals`) sums `input + output + cacheRead + cacheWrite` into one `tokens` number, which conflates cached prompt reads (millions) with uncached input/output (thousands). The dashboard and baselines should separate or break down uncached vs cached tokens.
  - `classifier/index.mjs` records no latency, token, or fallback metrics; adding lightweight instrumentation is needed to verify classifier overhead doesn't hurt turnaround.
- **Concrete before/after baselines to capture before coding**:
  1. *Brief token/byte size*: `team.brief()` size per role & mode (today `engine/roles/*.md` totals 40.6 KB; `orchestrator.md` is 12.0 KB, `reviewer.md` 6.8 KB, `panel.md` 4.0 KB).
  2. *CLI & UI data latency*: wall-clock ms of `bh task list --json`, `bh team --json`, `bh tools <harness>`, `bh usage --json` on a seeded fixture (e.g., 50 tasks × 20 turns).
  3. *Spawn turnaround*: time from `bh spawn` to first prompt sent (fake harness), including classifier calls.
  4. *End-to-end task usage*: compare turns, uncached/cached tokens, `costUsd`, and merged `taskTime` on a fixed reference task with harness/model held constant.

### Risks of auto-assigning skills
- **False negatives with hard deny**: if the classifier omits a needed skill and Claude Code denies it via `--settings`, the agent fails or degrades silently.
- **False positives & token bloat**: injecting too many skills or large skill descriptions increases prompt tokens, working against goal (2).
- **Turnaround regression on spawn**: `bh spawn` already calls `scoreEffort`; adding a second serial classifier call for skills slows every spawn unless batched into one request or tightly timed out with rule fallback.
- **Planning-phase safety**: panel agents are read-only (`panel.md`); auto-assignment during planning must not grant or encourage write/deploy skills.
- **Auditability**: each spawn/brief/task record should show which skills were assigned (manual vs auto, classifier vs fallback) so misclassifications can be diagnosed.

### What "done" means for QA
- `npm test` passes cleanly on Linux (including fixing/scoping `test/mockup-browser.test.mjs:42`).
- Behaviour tests (using temp `HOME`/project fixtures, never live user configs, and real `bh` commands for store fixtures) cover: skill discovery for each newly supported harness, classifier skill assignment + manual override + timeout/fallback + planning-phase behaviour, metrics aggregation (role roll-up, partial/missing harness data, time/tokens/cost/tasks/steps, parallel `taskTime` vs per-agent time), and metrics tab UI state/contrast.
- Before/after benchmark numbers recorded for brief size, seeded `bh` CLI latency, and spawn turnaround.
