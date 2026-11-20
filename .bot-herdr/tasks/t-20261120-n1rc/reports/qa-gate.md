## Summary
Verdict: **CHANGES_REQUIRED** (QA risk: HIGH). Core checks pass (`npm test` 324 pass / 1 pre-existing skip / 0 fail, `bh check` PASS, `herdr-app check` passed, `IS_SANDBOX` and `projectRoot` worktree behavior verified), but three major functional defects were reproduced in metrics unreported-zero handling, compaction marker ownership/handoff, and allowlist coverage for planned tasks and pinned+`--skill` fallback.

## Changes
None — QA gate review only; no repository implementation or test files were modified.

## Findings

### Major (blocking)

1. **`[major]` Metrics renders unreported numbers as reported zeros — `mods/bot-herdr/engine/lib/metrics.mjs:109-128,207-224,273`, `mods/bot-herdr/metricsview.js:48-69`**
   - **Expected:** Unreported tokens or costs never appear as reported zeros (`0` / `$0.00` without `≈` or `—`), on either agent cards or the totals row (Focus #4, AC #3).
   - **Observed:**
     - `answerOf` (`metrics.mjs:273`) sets `totals.costUsd: sums.costUsd ?? 0`. When all turns in a window are unpriced (unknown model or time-only without a rate), `sums.costUsd` is `null` and `sums.estimated.cost` is `false`, so `totals.costUsd` becomes `0` with `estimated.cost: false`; `metricsview.js:66` displays **`$0.00`** with no `≈` and no tooltip.
     - When a window contains only time-only turns (`reported: { tokens: false, cost: false }`, e.g. Gemini/Qwen/Antigravity with no reported-token turns in that window so `ratesFor(r)` is `null`), `turnNumbers` (`metrics.mjs:109-123`) leaves `tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }` and `estimated.tokens: false`. `metricsview.js:52` displays **`0`** (no `≈`, no `—`, no tooltip) on both the agent card and the totals row.
   - **Reproduce:** Call `metrics()` with a single time-only record (`{ at, agent: "dev", role: "dev", harness: "gemini", model: "gemini-4-neon-high", ms: 60000, reported: { tokens: false, cost: false } }`, `window: "today"`) and pass `agents[0]` and `totals` to `cells()` from `metricsview.js`. Agent Tokens cell is `{ value: "0", tip: null }`; Totals Tokens is `{ value: "0", tip: null }` and Totals Cost is `{ value: "$0.00", tip: null }`. Same `$0.00` totals output when a single turn reports tokens on an unpriced model (`model: "unknown-model"`, `reported: { tokens: true, cost: false }`).

2. **`[major]` Compaction marker is stolen by non-Orchestrator `--mode lead` agents (and across projects), and `bh plan task` hands off the new active task as `done.` — `mods/bot-herdr/engine/lib/agent.mjs:321-360`, `mods/bot-herdr/engine/bh.mjs:132-134,551`**
   - **Expected:** Compaction runs only for the Orchestrator of the project whose task finished (or plan became a task), never resetting another agent or project, and a handoff accurately describes the task state.
   - **Observed:**
     - `compactIfPending()` (`agent.mjs:339`) checks only `if (mode !== "lead") return ""` and consumes a single global file `DATA/sessions/compact-pending.json` with no `agent.lead` or project `root` check. Both direct chat with any non-Orchestrator agent (`composer.js:1274`) and `bh knowledge ask` (`bh.mjs:579`, Scout) launch with `--mode lead`. A direct message to Dev or Scout deletes `compact-pending.json`, compacts/resets that agent instead, and leaves the Orchestrator uncompacted; similarly, finishing a task in Project A compacts Project B's Orchestrator.
     - `bh plan task` (`bh.mjs:551`) writes `{ reason: "plan p-... became task t-...", task: task.id }` referencing the newly created `active` task. On non-Claude harnesses (or when Claude compaction fails), `handoff(marker.task)` (`agent.mjs:328`) hardcodes `${t?.title ?? id}: done.`, telling the freshly started Orchestrator session that the new task it is about to run is already done.
   - **Reproduce:** After `bh plan task <plan>` writes `compact-pending.json`, run `bh agent dev --mode lead -- "hello dev"`: `compact-pending.json` is gone. On a Codex Orchestrator with a saved session, consume the `bh plan task` marker: the prompt starts with `## Handoff\nBuild feature: done.\n1. Build it — todo`.

3. **`[major]` Planned tasks (`bh plan task`) never populate `task.skills`, and `allowedFor` ignores `--skill` additions when `picked` is `null` — `mods/bot-herdr/engine/bh.mjs:542-553`, `mods/bot-herdr/roster.js:204-219`**
   - **Expected:** Tasks created from plans carry skill picks just like `bh task new` so spawned agents have their allowlist enforced; and when `picked` is `null` (classifier off/failed) on an agent with pinned skills, re-spawning with `bh spawn --task T --skill <name>` allows `<name>` alongside the pins.
   - **Observed:**
     - `bh plan task` (`bh.mjs:542-553`) creates the task via `T.newTask(...)` without setting `task.skills`. Every spawn on a planned task therefore sees `entry = null` (`bh.mjs:751`, `agent.mjs:42`) and `fallback: true`, bypassing classifier allowlist enforcement on all planned tasks.
     - `allowedFor` (`roster.js:207-211`) returns early when `picked === null` without merging `entry.added`. If an agent has pinned `skills: ["alpha"]`, classifier is off (`picked: null`), and the Orchestrator re-spawns with `--skill beta`, `limitArgs` still emits `--settings '{"permissions":{"deny":["Skill(skill:beta)",...]}}'`.
   - **Reproduce:** (a) With classifier enabled, run `bh plan new "Build feature"` (`plan.skills.dev.picked` is `["alpha"]`), write a READY draft, and run `bh plan task <id> --json`: `task.skills` is `undefined`. (b) Call `limitArgs({ role: "dev", harness: "claude", skills: ["alpha"], mcp: [], installed: { skills: ["alpha", "beta", "gamma"], mcp: [] }, allowed: { picked: null, added: ["beta"] } })`: output denies `Skill(skill:beta)`.

### Minor (non-blocking)

4. **`[minor]` Classifier `triageAndSkills` question-key collision and unvalidated choice prefix — `mods/bot-herdr/engine/classifier/index.mjs:59-61,74-84,102-108`**
   - `skillQuestions(roles)` keys questions by bare `r.id` and spreads them over `triageQuestions()`. A custom agent named `"Kind"`, `"Size"`, or `"Solo"` overwrites that triage question.
   - `skillsFrom` (`index.mjs:103-107`) slices `a.choice` at `ask.id.length + 1` without checking `a.choice.startsWith(\`${ask.id}.\`)`; a malformed choice `"dev.0"` for role `qa` slices to `".0"` (`Number(".0") === 0`) and picks `qa`'s candidate `0`.

5. **`[minor]` Settings Classifier dialog has no toggle for the new `skills` feature — `mods/bot-herdr/settings.js:86-92`**
   - `classifier/index.mjs:46` enables `features.skills`, but `FEATURES` in `settings.js:86-92` omits `skills`, so users cannot toggle it from Settings → Classifier → Advanced.

6. **`[minor]` Tooltip-less icon-only buttons remain without accessibility labels — `mods/bot-herdr/button.js:35`, `mods/bot-herdr/settings.js:983,1184,1190`, `mods/bot-herdr/pick.js:202`, `mods/bot-herdr/viewer.js:245-246`, `mods/bot-herdr/lightbox.js:71`, `mods/bot-herdr/composer.js:1601,1870`**
   - `button.js:35` sets `.accessibility_label(tooltip ?? label)`, which leaves icon-only buttons with `label: null` and no `tooltip` (including `bh-more-close` and `bh-tools-refresh` in `settings.js`) unlabeled.

7. **`[minor]` `team.mjs` uses `process.cwd()` instead of `projectRoot()` when loading installed skills — `mods/bot-herdr/engine/lib/team.mjs:414,431`**
   - `bh.mjs:80` passes `projectRoot()` to `listTools`, while `withInstalled` / `withAllowlist` pass `process.cwd()`, missing `<repo>/.claude/skills` when invoked from a subdirectory.

8. **`[minor]` Planning-phase `pickSkills` does not state that panel seats are read-only — `mods/bot-herdr/engine/bh.mjs:495-500`, `mods/bot-herdr/engine/classifier/index.mjs:79`**
   - Plan assumption: panel seats during planning are read-only and should not receive write/deploy skills, but `bh plan new` sends the same role prompt as `bh task new`.

### Info

9. **`[info]` Working tree contains extra state/cache files outside the code diff**
   - Unstaged changes to earlier tasks (`.bot-herdr/tasks/t-20261113-n9rt/task.json`, `t-20261114-gd43/task.json`, `t-20261118-ftrv/{task.json,checks.jsonl}`), untracked `usage-totals.json`, `data/bot-herdr/tools/*.json`, `questions.md`, and `.bot-herdr/tmp/*` are present in `git status`. Clean or exclude before committing.

## Brief Check

### Focus areas
1. **Allowlist (`picked: null` vs array on claude/codex):** Partially met — `picked: null` with no pins denies nothing and `picked` array denies everything outside `pins ∪ picked ∪ added` on Claude (`--settings`) and Codex (`-c`); **not met** for `picked: null` + pins + `--skill` and `bh plan task` missing `task.skills` (Finding #3).
2. **Compaction (never mid-turn, never child, no silent session loss):** Partially met — serialized between turns, ignores `mode: child|panel|review`, announces failure and falls back to handoff; **not met** for non-Orchestrator `--mode lead` agents / cross-project marker and `bh plan task` handoff wording (Finding #2).
3. **`IS_SANDBOX` (only full access as root; standard never bypasses):** **Met** — `runner.mjs:263-274,287,310` strips `IS_SANDBOX` from `process.env` and sets `IS_SANDBOX=1` only when `access === "full" && root`; standard access always uses `acceptEdits` + `--allowedTools`; `agent.mjs:258`, `README.md:70`, `test/headless.test.mjs:36-41` consistent.
4. **Metrics (never unreported as reported zero):** **Not met** — `totals.costUsd` becomes `0` when all turns are unpriced, and time-only turns without a rate render `0` tokens unmarked (Finding #1).
5. **`projectRoot` matches `git rev-parse` for worktrees:** **Met** — verified against a real `git worktree add` (repo root, subdir, worktree root, worktree subdir all match `git rev-parse --show-toplevel`).

### Acceptance criteria
- `npm test` passes on Linux with no skips added; new tests present: **Met** (325 tests, 324 pass, 1 pre-existing headless-browser skip, 0 fail).
- Usage records have `role`, `project`, `plan`, `reported`; OpenCode ACP & pi usage captured; old records roll up: **Met** (`agent.mjs:363-380`, `runner.mjs:402-417,486-496,588-597,672-673`, `metrics.mjs:141-145`).
- Metrics tab cards/windows/estimates, no unreported number shown as reported zero: **Not met** (Finding #1).
- Custom agents appear as panel seats, can be left off, spawned round one: **Met** (`signals.js:264-272`, `work.js:68,316,479,1793`, `bh.mjs:505-515`, `orchestrator.md:61-66`, `panel.md:4-7`).
- Skills discovered for Claude, Codex, OpenCode, Gemini, Qwen, Antigravity (and pi): **Met** (`tools.mjs:149,240-258`, `test/skills-discovery.test.mjs`).
- Skill picks made once per task/plan, no classifier call in `bh spawn`: **Partially met** (`bh task new` & `bh plan new` call once, `bh spawn` makes none; `bh plan task` missing picks — Finding #3).
- Claude Code allowlist enforcement and pins-only fallback: **Partially met** (Finding #3).
- Compaction after task completes (Claude compact / handoff elsewhere): **Partially met** (Finding #2).
- Child briefs smaller than baseline for every role, no unusable sections: **Met** (`baseline-before.json` vs `baseline-after.json`: dev/child 14193→11766, design/child 13644→11222, qa/child 12113→9702, qa/review 14608→13781, research/child 9694→7164, scout/child 9392→6876, orchestrator/child 19999→17525).
- Step 14 before/after baselines recorded: **Met** (`.bot-herdr/tasks/t-20261120-n1rc/baseline-before.json` and `baseline-after.json`).
- UI polish, icon-only accessibility labels, 600px tab switch with More: **Mostly met** (`tabfit.js`, `switch.js`, `composer.js`, `feed.js`, `chat.js`, `work.js`, `settings.js`, `plandoc.js`, `pages.js`; minor gap on tooltip-less icon buttons — Finding #6).
- `herdr-app check mods/bot-herdr` and gpui-kit typecheck pass: **Met** (`herdr-app check` passed; `tsc` has zero `TS2304`/`TS2552` outside `engine/`).

## Verification
- `timeout 120 npm test` — exit 0: 325 tests, 324 pass, 1 skipped (pre-existing headless browser skip), 0 fail.
- `timeout 120 node "/home/athi/.config/herdr-app/mods/bot-herdr/engine/bh.mjs" check` — exit 0: PASS (324 pass, 1 skipped, full suite).
- `timeout 60 /home/athi/.local/bin/herdr-app check mods/bot-herdr` — exit 0: `check passed: mods/bot-herdr`.
- `timeout 60 npx -y -p typescript@5 tsc -p mods/bot-herdr/jsconfig.json --noEmit` + `grep -E "TS2304|TS2552"` — zero unresolved symbol errors outside `mods/bot-herdr/engine/` (only Node globals in `engine/`).
- `timeout 30 node /home/athi/.gemini/antigravity-cli/brain/a80d79fa-0c7c-464b-a4c0-51ca361f9d11/scratch/verify_qa.mjs` — exit 0: verified `projectRoot` matches `git rev-parse --show-toplevel` on real `git worktree add` (4/4 paths), and reproduced Findings #1, #2, #3, and #4.

## Knowledge Proposals
- `composer.js:1274` and `bh knowledge ask` (`bh.mjs:579`) both launch non-Orchestrator agents with `--mode lead`, so Orchestrator-only behavior in `agent.mjs` must check `agent.lead` (not `mode === "lead"` alone).
