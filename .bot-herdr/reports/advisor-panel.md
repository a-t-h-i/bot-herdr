## Status
OPEN

## Summary
Reviewed plan `p-20261120-7rw6` against the repository and all five panel reports; found six concrete gaps across task splitting, real usage capture, headless skill-allowlist plumbing, compaction races, missing `pi`/cache fixes, and an Advisor/brief-trim mismatch.
Read-only review; no repository code was modified.

## Changes
- `.bot-herdr/reports/advisor-panel.md` — advisor review of plan `p-20261120-7rw6`.

## Review (6 points, most important first)
1. **Split and reorder the 14-step monolith (sequencing/turnaround):** One 14-step task holds four unrelated tracks behind a single QA gate (`mods/bot-herdr/engine/roles/orchestrator.md:190`) and one open worktree per agent (`mods/bot-herdr/engine/bh.mjs:678-679`), while putting speed/token cuts last; split into four focused tasks — (A) Speed, briefs & compaction (steps 1, 11–14 + `test/mockup-browser.test.mjs:42`), (B) Usage & Metrics (steps 2–5), (C) Skill discovery & allowlist (steps 6–7, 9), (D) Custom panel seats & UI polish (steps 8, 10) — and run A first so B–D already benefit from faster `bh` and leaner briefs.
2. **Capture real ACP/`pi` usage before time-estimating (metrics/accuracy):** `Acp.message` (`mods/bot-herdr/engine/lib/runner.mjs:533-578`) drops OpenCode's `usage_update` and `piTurn` (`mods/bot-herdr/engine/lib/runner.mjs:367-387`, Dev's active harness) emits no usage, so Step 3's "all reported turns" fallback would apply Claude's 94.7%-cached token rate to non-Claude agents; parse ACP `usage_update` (and `pi` `message_end` usage if emitted) in Step 2, and base Step 3's time-only fallback rate on uncached tokens/min rather than total cached+uncached tokens.
3. **Fix headless skill-allowlist plumbing and the Step 7 vs Step 12 conflict (skill discovery/turnaround):** `bh spawn` has no channel to pass per-task skill picks into headless `agentArgv`/`runAgent` (`mods/bot-herdr/engine/bh.mjs:699-703`, `mods/bot-herdr/engine/lib/team.mjs:193-200`, `mods/bot-herdr/engine/lib/agent.mjs:226-234`), `unticked` (`mods/bot-herdr/roster.js:195`) treats `[]` as "allow all", and enforcing an allowlist at spawn cannot stay off the spawn critical path unless precomputed; precompute per-role skill picks in `bh task new`/`bh plan new` (or batch `effort` + `skills` in one `c.ask` call in `mods/bot-herdr/engine/classifier/index.mjs:256-307`), persist them on the task/plan so `agent.mjs` unions pins + picks + respawn additions before `limitArgs`, and distinguish `null` (off/fallback) from `[]` (none needed).
4. **Fix the Step 13 compaction race and add a universal handoff fallback (token efficiency):** `bh task status done` and `bh plan task` (`mods/bot-herdr/engine/bh.mjs:342-346,478-488`) run in short-lived CLI processes while `runAgent` overwrites `stateFile` at turn end (`mods/bot-herdr/engine/lib/agent.mjs:380-382`) and headless `-p` compaction (`mods/bot-herdr/engine/lib/runner.mjs:277-286`) is unverified; have Step 13 write a `compactPending` marker consumed by `agent.mjs` between turns, running native compaction where verified and otherwise resetting the session (`/new`, `mods/bot-herdr/engine/lib/agent.mjs:431-438`) seeded with a compact task-handoff summary so every harness gets the token savings.
5. **Close skill-discovery and perf gaps for the real team (performance/skill discovery):** `bh team` runs Dev on `pi`, yet Step 6 adds only Gemini/Qwen/Antigravity to `SUPPORTED` (`mods/bot-herdr/engine/lib/tools.mjs:16`) while omitting `pi`/`omp` (`mods/bot-herdr/roster.js:45-46`), and misses the second `--refresh` cache bypass at `mods/bot-herdr/composer.js:533`; add `pi`/`omp` skill readers (or explicitly note their absence) in Step 6, drop `--refresh` in `mods/bot-herdr/composer.js:533` alongside `mods/bot-herdr/engine/lib/team.mjs:36`, and replace `projectRoot()`'s `git rev-parse` subprocess (`mods/bot-herdr/engine/lib/core.mjs:40-46`) with an upward `.git` walk in Step 12 for a cheaper speedup across every `bh` command.
6. **Fix the Step 8 Advisor exclusion and Step 11 brief-trim target (UX/agent experience):** The draft's Assumptions exclude Advisor ("Scout and Advisor keep their current roles"), yet `Advisor` is a `role: "custom"` agent (`mods/bot-herdr/roster.js:11-18` has no `advisor` role) and `mods/bot-herdr/engine/roles/panel.md:4` hard-codes the four built-in seats, while Step 11's "knowledge pointer" (`mods/bot-herdr/engine/lib/agent.mjs:296`) only fires after mid-session edits whereas `mods/bot-herdr/engine/lib/team.mjs:119-120` injects 650+ bytes of `bh ask`/mockup HTML rules into every child and `mods/bot-herdr/engine/bh.mjs:691-697` duplicates `team.mjs:140`; remove Advisor from the Step 8 exclusion (update `panel.md:4` and `mods/bot-herdr/work.js:67,320,483,1793`), and target `team.mjs:119-120,124-127` + `bh.mjs:691-697` in Step 11.

## Questions
1. [ADVISOR] How should we ship the 14 steps of this plan?
   - Four small tasks, speed first (Recommended) — ship (1) Speed/briefs/compaction, (2) Usage & Metrics, (3) Skills & classifier allowlist, (4) Custom panel seats & UI polish as separate tasks with independent QA gates so each lands sooner and later tasks benefit from the speedups
   - Two tasks — ship engine speedups, compaction and Metrics first, then skills, custom seats and UI polish
   - One 14-step task — keep everything in a single task and single final QA gate as drafted

## Notes
- Settled user decisions (allowlist + pins, price-table estimation, Metrics as agent cards, Orchestrator compaction between tasks) are all preserved; points 2–4 only fix implementation mechanics where the current code would miscompute, race, or bypass them.
- In Step 12, replacing `execFileSync("git", ["rev-parse", "--show-toplevel"])` in `mods/bot-herdr/engine/lib/core.mjs:40-46` with a pure filesystem `.git` walk (handling `.git` files in worktrees) removes a subprocess spawn from every `bh` call made by both agents and the UI's 2.5–4 s poll loops.

## Brief Check
- Reviewed draft plan and all five panel reports: met (`bh plan show p-20261120-7rw6`, `.bot-herdr/reports/{dev,design,qa,research}-panel.md`, `design-ui.md`).
- At most 6 points, most important first, each one line with `path:line` evidence and concrete draft change: met (6 points above).
- Covered sequencing/splitting, all user goals (performance, token efficiency, skill discovery, UX, agent experience, turnaround, metrics), and cheaper alternatives: met.
- Did not reopen settled user decisions: met.
- At most one user question, only for a genuinely user-owned choice: met (1 question on splitting/shipping).
- Report written to `.bot-herdr/reports/advisor-panel.md`: met.

## Verification
- `bh plan show p-20261120-7rw6` — read round 4 draft (14 steps, assumptions, open comments).
- `bh team` — verified live roster (Orchestrator/Design on `claude`, Dev on `pi`, QA/Advisor on `agy`, Research/Scout on `opencode`).
- `bh config` — verified classifier enabled via OpenRouter.
- `bh scripts run find_symbol SEATS` / `seatsNow` / `piTurn` and direct reads of `runner.mjs`, `agent.mjs`, `team.mjs`, `tools.mjs`, `bh.mjs`, `core.mjs`, `roster.js`, `composer.js`, `work.js`, `panel.md`, `orchestrator.md` — verified every cited `path:line`.
