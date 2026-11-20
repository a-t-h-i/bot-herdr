## Summary
QA findings 1 (view half), 5 and 6 fixed: null tokens/cost show "—", the classifier "skills" toggle is in Settings, and icon-only buttons take an `a11y` name.
`herdr-app check` could not run: no `herdr-app` binary on PATH or under /root/.local/bin.

## Changes
- mods/bot-herdr/metricsview.js — `tokenLines(null)` returns `{ main: "—", cached: null }`; the Tokens tip shows only when tokens is not null. A null costUsd already read "—" with no tip.
- test/metrics-view.test.mjs — new test with QA's shapes: an agent with tokens null and costUsd null, totals with costUsd null, and null values flagged estimated (still "—", no ≈, no tip).
- mods/bot-herdr/settings.js — FEATURES gains `{ key: "skills", label: "Skill picks", about: "Picks skills for each agent when a task or plan starts." }`. The others use the `about` key, so the brief's "hint" goes there. `about` is not drawn; the label is the chip text. bh-more-close gets a11y "Close"; bh-tools-refresh gets "Refresh skills and MCP servers". `iconButton` (line 983) takes an optional `a11y` and passes it on, but nothing in the mod calls it, so no call site needed changing. Line 1184 is bh-more-close and line 1190 is bh-tools-refresh (now 1185 and 1191).
- mods/bot-herdr/button.js — `actionButton` and `body()` take an optional `a11y` option; the accessible name is `tooltip ?? label ?? a11y`.
- mods/bot-herdr/metrics.js — no change needed (it draws through `cells()`).

## Brief Check
- Finding 1, view half: met. Null tokens and null cost show "—" on cards and totals, never 0 or $0.00 (new test).
- Finding 5: met (settings.js:92).
- Finding 6: met for settings.js (bh-more-close, bh-tools-refresh, and `iconButton` accepts a11y). The unlabeled buttons left in files I was told not to touch are listed under Blockers.
- npm test passes: met (334 tests, 333 pass, 1 skipped, the existing headless-browser skip).
- tsc shows no new TS2304/TS2552 outside engine/: met (zero TS2304/TS2552 in the mod; only the existing implicit-any noise).
- herdr-app check mods/bot-herdr: not run, the binary is missing.

## Verification
- npm test — 334 tests, 333 pass, 0 fail, 1 skipped
- bh check — PASS (333 pass, 1 skipped)
- npx -p typescript tsc -p mods/bot-herdr/jsconfig.json --noEmit | grep TS2304/TS2552 (outside engine/) — none
- herdr-app check mods/bot-herdr — not run (command not found)

## Blockers
- `herdr-app` is not installed where this shell can find it; the Orchestrator or user should run `herdr-app check mods/bot-herdr`.
- Unlabeled icon-only buttons in files outside my scope, each to be given an `a11y` or a tooltip: pick.js:202, viewer.js:245-246, lightbox.js:71, composer.js:1601 and composer.js:1870 (`Composer.iconButton`, which is used by bc-browse-up, bc-browse-close and bc-attach at composer.js:1078, 1080 and 1735).

## Knowledge Proposals
- actionButton takes `a11y` for an icon-only button's accessible name when it has no tooltip (button.js).
