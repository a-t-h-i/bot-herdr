## Summary
Verdict: **CHANGES_REQUIRED** (Round 2, QA risk: HIGH). All three Round 1 major findings and in-scope minors (4–8) are fixed and verified (`npm test` 333 pass / 1 skip, `herdr-app check` PASS, `tsc` clean outside `engine/`), but Finding 1's `tokens: null` change introduced a **major CLI crash regression** in `bh metrics` (`metricLine` in `mods/bot-herdr/engine/bh.mjs:276-281`).

## Changes
None — QA gate review only; no repository implementation or test files were modified.

## Round 1 Findings Check

1. **`[major]` Metrics unreported zeros — Partially addressed (JSON & UI fixed; CLI regression introduced below)**
   - Re-ran Repro 1a (single time-only Gemini record, `window: "today"`): `metrics()` returns `tokens: null, costUsd: null` on both `agents[0]` and `totals`; `cells()` in `metricsview.js` returns `{ value: "—", sub: null, tip: null }` for Tokens and Cost on both.
   - Re-ran Repro 1b (reported tokens on `"unknown-model"`, `cost: false`): `metrics()` returns `tokens: { input: 100, output: 10, ... }`, `costUsd: null` on both agent and totals; `cells()` returns `"110"` for Tokens and `"—"` (no tip) for Cost.
   - Regression: human-readable `bh metrics` (without `--json`) crashes on `tokens: null` (see Finding #1 below).
2. **`[major]` Compaction marker ownership & `bh plan task` handoff — Addressed**
   - Re-ran Repro 2a: after `bh plan task`, `bh agent dev --mode lead -- "hello dev"` leaves `compact-pending.json` intact; a foreign project's Orchestrator also leaves it intact.
   - Re-ran Repro 2b: a Codex Orchestrator in the owning project consumes the marker and receives `## Handoff\nPrevious plan Build feature became task Build feature; it starts now.\n1. Build it — todo\n2. Test it — todo\nKnowledge and boards hold the rest.`.
3. **`[major]` Planned task skills & `allowedFor` with `picked: null` + `--skill` — Addressed**
   - Re-ran Repro 3a: with classifier enabled, `bh plan new` → `bh plan write` (READY) → `bh plan task --json` populates `task.skills` (`design`, `dev`, `qa`, `research` keep `{ picked: ["alpha"], added: [] }`, uncovered `scout` gets `{ picked: null, added: [] }`).
   - Re-ran Repro 3b: `limitArgs` with pinned `skills: ["alpha"]`, `picked: null`, `added: ["beta"]` now emits `--settings {"permissions":{"deny":["Skill(skill:gamma)"]}}` (`Skill(skill:beta)` is allowed).
4. **`[minor]` Classifier question-key collision & unvalidated choice prefix — Addressed**
   - Verified `triageAndSkills` with a custom agent named `"kind"` emits both `"kind"` and `"skills.kind"` without collision, and malformed choice `"dev.0"` for `"skills.qa"` yields `[]`.
5. **`[minor]` Settings Classifier missing `skills` toggle — Addressed**
   - Verified `mods/bot-herdr/settings.js:92` adds `{ key: "skills", label: "Skill picks", ... }` to `FEATURES` and renders/saves through `classifierMore`.
6. **`[minor]` Icon-only buttons accessibility labels — Addressed for `button.js` & `settings.js`**
   - Verified `actionButton` accepts `a11y` (`tooltip ?? label ?? a11y`), `bh-more-close` (`"Close"`), `bh-tools-refresh` (`"Refresh skills and MCP servers"`), and `iconButton` pass `a11y`. Remaining files (`pick.js`, `viewer.js`, `lightbox.js`, `composer.js`) out of scope for this round (minor).
7. **`[minor]` `team.mjs` uses `process.cwd()` instead of `projectRoot()` — Addressed**
   - Verified `team.mjs:37,92` use `projectRoot()`; running `bh team --json` from a nested git subdirectory (`a/b`) discovers `<repo>/.claude/skills/repo-only-skill`.
8. **`[minor]` Planning-phase `pickSkills` read-only seat hint — Addressed**
   - Verified `bh.mjs:506` appends `— a read-only planning seat: no write or deploy skills` and `test/skills-classifier.test.mjs:166-172` asserts it.
9. **`[info]` Stray working-tree files — Deferred to Orchestrator at commit.**

## Findings

### Major (blocking)

1. **`[major]` `bh metrics` CLI crashes with `TypeError` when any agent has `tokens: null` — `mods/bot-herdr/engine/bh.mjs:276-281`**
   - **Expected:** Under contract #24, `bh metrics` (without `--json`) renders `"—"` for unreported tokens just as it does for `a.costUsd === null`.
   - **Observed:** `metricLine(a)` evaluates `a.tokens.input + a.tokens.output + a.tokens.cacheRead + a.tokens.cacheWrite` unconditionally, throwing `TypeError: Cannot read properties of null (reading 'input')` and exiting 1 whenever any agent in the window has only unreported time-only turns (e.g. Gemini/Qwen/Antigravity with no reported-token turns in that window).
   - **Reproduce:** Place a single time-only record (`{ at: new Date().toISOString(), agent: "dev", role: "dev", harness: "gemini", model: "gemini-4-neon-high", ms: 60000, reported: { tokens: false, cost: false } }`) in `DATA/usage/dev.jsonl` and run `node mods/bot-herdr/engine/bh.mjs metrics --window today`. Observed exit code `1`, stderr: `bh: Cannot read properties of null (reading 'input')`.

### Minor (non-blocking)

2. **`[minor]` `allowedFor` leaks picked MCP servers into `allowed.skills`, and under `picked: null` restricts an unpinned category when `--skill` adds a name in it — `mods/bot-herdr/roster.js:216-222`**
   - Line 222 passes `[...picked, ...extra.skills]` instead of `extra.skills` (which already contains non-MCP `picked` + `added`), so `allowedFor(agent, { picked: ["github"], added: [] })` (where `github` is an MCP server) returns `{ skills: ["github"], mcp: ["github"] }` and prints `Use only these skills: github.` in the brief.
   - Line 220 merges `extra.mcp` into empty `agent.mcp` whenever `agent.skills` is non-empty (and vice versa): if an agent pins only skills (`skills: ["alpha"], mcp: []`, so MCP is unrestricted) and `picked: null` with `added: ["github"]`, `allowed.mcp` becomes `["github"]`, denying other installed MCP servers (`mcp__db`).
3. **`[minor]` Stale comment in `mods/bot-herdr/engine/lib/metrics.mjs:273` and single-file global compaction marker — `mods/bot-herdr/engine/bh.mjs:134`**
   - `metrics.mjs:273` still states `totals always have a number for cost` (superseded by contract #24).
   - `compact-pending.json` is still one global file keyed by a `project` field, so a task finishing in Project B overwrites an unconsumed marker for Project A (Project A is never wrongly compacted, only skipped).
4. **`[minor]` Unlabeled icon-only buttons outside `settings.js` (deferred from Round 1 Finding #6)**
   - `pick.js:202`, `viewer.js:245-246`, `lightbox.js:71`, `composer.js:1601,1870`.

## Brief Check
- Re-run Round 1's 3 reproductions exactly: **Met** — all three original reproductions pass; regression found in `bh metrics` CLI output for Finding 1's `tokens: null`.
- Check each fix against its finding (majors 1–3, minors 4–8): **Met** (all addressed except the `metricLine` regression from Finding 1).
- Check regressions in compaction marker, `allowedFor`, `bh plan task`, metrics nulls and their display: **Met** — caught `bh metrics` CLI crash on `tokens: null` (major) and two `allowedFor` edge cases (minor).
- `herdr-app check mods/bot-herdr` and gpui-kit typecheck: **Met** — both verified clean on the current tree.

## Verification
- `timeout 120 npm test` — exit 0: 334 tests, 333 pass, 1 skipped (pre-existing headless browser skip), 0 fail.
- `timeout 60 /home/athi/.local/bin/herdr-app check mods/bot-herdr` — exit 0: `check passed: mods/bot-herdr`.
- `timeout 60 npx -y -p typescript@5 tsc -p mods/bot-herdr/jsconfig.json --noEmit` — zero `TS2304`/`TS2552` errors outside `mods/bot-herdr/engine/`.
- `timeout 60 node /home/athi/.gemini/antigravity-cli/brain/09d643a3-6ae6-4565-9d9a-b596d447a4d4/scratch/verify_r2.mjs` — exit 0: verified Findings 1 (JSON & UI), 2 (dev `--mode lead` & foreign project), 3b (`limitArgs`), 4, 7; reproduced `bh metrics` CLI crash (`exit 1: bh: Cannot read properties of null (reading 'input')`) and `allowedFor` minor edge cases.
- `timeout 60 node /home/athi/.gemini/antigravity-cli/brain/09d643a3-6ae6-4565-9d9a-b596d447a4d4/scratch/verify_r2_part2.mjs` — exit 0: verified Codex Orchestrator `bh plan task` handoff wording (`Previous plan Build feature became task Build feature; it starts now.`) and Repro 3a (`bh plan new` → `bh plan task` copies `plan.skills` and fills uncovered `scout` with `picked: null`).
