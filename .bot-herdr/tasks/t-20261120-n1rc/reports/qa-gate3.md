## Summary
Verdict: **PASS** (Round 3, narrow re-review; QA risk: HIGH). Round 2's blocking major (`bh metrics` CLI crash on `tokens: null`) and minors 2–3 (`allowedFor` MCP/skill separation and `metrics.mjs` comment) are fixed with no regressions in `allowedFor`/`limitArgs` or `bh metrics`, and all checks pass (`npm test` 336 pass / 1 skip, `bh check` PASS, `herdr-app check` PASS).

## Changes
None — QA gate review only; no repository implementation or test files were modified.

## Round 2 Findings Check

1. **`[major]` `bh metrics` CLI crashes on `tokens: null` (`mods/bot-herdr/engine/bh.mjs:276-282`) — Addressed**
   - `metricLine(a)` guards `a.tokens` before summing and emits `"—"` when `null`, matching `costUsd === null`.
   - Re-ran the exact Round 2 repro (single time-only Gemini record with `reported: { tokens: false, cost: false }` in `DATA/usage/dev.jsonl`): `bh metrics --window today` exits 0 and prints `Dev (dev): 1 min, 1 turns, — tokens, —, 0 tasks, 0 steps`; `--json` preserves `tokens: null, costUsd: null` on both agent and totals.
   - Verified no regressions in plain `bh metrics` for empty window (`No agent worked in today.`), reported zero tokens/cost (`0 tokens, $0.00`), unpriced model (`110 tokens, —`), and estimated values (`≈… tokens, ≈$…`).
2. **`[minor]` `allowedFor` MCP/skill category leaks (`mods/bot-herdr/roster.js:204-225`) — Addressed**
   - Picked MCP servers stay in `allowed.mcp` only: `allowedFor(dev, { picked: ["github"], added: [] })` returns `{ skills: [], mcp: ["github"] }`; brief prints `Use only these skills: none.` and `Use only these MCP servers: github.`; Claude denies all installed skills and unpicked MCP servers, Codex denies unpicked valid-name MCP servers only.
   - With `picked: null`, `--skill` additions join only their own category and only when that category has pins: `skills: ["alpha"], mcp: []` + `added: ["github"]` returns `{ skills: ["alpha"], mcp: null }` (MCP unrestricted, Claude denies only unpinned skills, Codex emits `[]`); symmetric pinned-MCP + added-skill keeps skills unrestricted.
   - Checked full regression matrix (`picked: null` with/without pins, both pins, `picked: []`, full `picked` array, Claude & Codex `limitArgs`, `toolsSection`).
3. **`[minor]` Stale comment in `mods/bot-herdr/engine/lib/metrics.mjs:273` — Addressed**
   - Updated to state that tokens and cost are `null` when nobody reported them and nothing could be estimated.
   - Non-blocking carryovers unchanged from Round 2 (not blockers): single-file global `compact-pending.json` (`bh.mjs:134`), unlabeled icon-only buttons outside `settings.js`, and stray working-tree files deferred to the Orchestrator at commit.
4. **Determinism fix in `test/tools.test.mjs:82-83` — Verified**
   - `utimesSync` bumps the skills directory mtime so the cache-invalidation test no longer flakes within the same millisecond.

## Brief Check
- Re-run Round 2 repro (`bh metrics` plain output on `tokens: null`): **Met** — exits 0 with `— tokens, —`.
- Re-run the two `allowedFor` cases and check regressions in `allowedFor`/`limitArgs` (`picked` null with/without pins, `picked` arrays, MCP vs skills, claude & codex) and `bh metrics` output: **Met** — full matrix verified clean.
- Check `metrics.mjs` comment and `test/tools.test.mjs` mtime bump: **Met**.
- Run `npm test` and `bh check`: **Met** — both exit 0 (`336 pass, 1 skipped, 0 fail`).
- Record verdict with `bh gate`: **Met**.

## Verification
- `timeout 120 npm test` — exit 0: 337 tests, 336 pass, 1 skipped (pre-existing headless browser skip), 0 fail.
- `timeout 120 node mods/bot-herdr/engine/bh.mjs check` — exit 0: `PASS: 336 tests pass, 1 skipped; no lint or typecheck is set up`.
- `timeout 60 /home/athi/.local/bin/herdr-app check mods/bot-herdr` — exit 0: `check passed: mods/bot-herdr`.
- `timeout 30 node --test test/tools.test.mjs test/metrics.test.mjs test/skills-allowlist.test.mjs` — exit 0: 27 pass, 0 fail.
- `timeout 60 node /home/athi/.gemini/antigravity-cli/brain/5891987c-a9fb-445d-a781-35b940c2b756/scratch/verify_r3.mjs` — exit 0: verified exact Round 2 `bh metrics` repro, plain output edge cases (empty, reported 0, unpriced cost null, estimated), both `allowedFor` cases, full `allowedFor`/`limitArgs`/`toolsSection` matrix for Claude & Codex, and updated `metrics.mjs` comment.
