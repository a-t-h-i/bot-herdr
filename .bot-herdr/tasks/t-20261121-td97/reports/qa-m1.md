## Summary
PASS — M1 audit tooling is sound: `bh ui-audit --json` exits 0 with `pass:false`, and all 8 Fix-table counters fail against their spec targets on today's build.
Scores: counters 4/5, contrast 4/5, robustness 4/5, tests 4/5.

## Changes
None (review only).

## Brief Check
1. Met. 11 pages render headless with `renderErrors` empty. The hex scan finds 14 literals outside look.js (e.g. composer.js:64). Contrast covers 16 themes and composites alpha, and has no ownTheme exemption (ui-audit-spec.mjs:467). The bot-herdr-light pair fails controlBorder.
2. Met. The 8 counters are dest 11/5, zeroChips 9/0, repeats 5/0, stats 8/1, selection 2/1, raw 4/0, icons 3/0 and agentFills 13/0. Each comes with detail lists from the real render (e.g. "tasks-board: decision · 0"), so none are hard-coded. Spot-checked against tasks-board-paper.png (zero chips, raw JSON contract, branch string) and knowledge-moss.png (agent-tinted cards). The screenshots match.
3. Met. `mods/bot-herdr/engine/ui-audit-baseline.json` is present, and the audit compares against it.
4. Met. `a11y` is in the JSON (aria_live:false and reduced_motion gaps), and the gaps are written up in reports/a11y-capability.md.
5. Met. There are 44 PNGs (11 pages × graphite/paper/ink/moss) showing real pages with fixture data. Shots run on a private HERDR_APP_HOME, stop the core in `finally`, and set timeouts on every call (ui-audit-shots.mjs:72,142,230,288).
6. Met. test/ui-audit.test.mjs is added. The change to pre-m1-foundation.test.mjs is legitimate: it only drops `ui-audit` from the placeholder list, because that command is now real.
7. Met. See Verification.
8. Met. Only the bh.mjs dispatch and the new ui-audit libs changed under mods/; no UI file is touched.

## Verification
- node mods/bot-herdr/engine/bh.mjs check — PASS, 283 tests
- npm test — 605 pass, 0 fail, 1 skipped
- herdr-app check mods/bot-herdr — check passed (generated gpui-kit.d.ts deleted)
- bh ui-audit --json — exit 0, pass:false, 8/8 Fix counters above target
- npx tsc --noEmit -p mods/bot-herdr/jsconfig.json — 0 "error TS" lines at both HEAD and 37d74fb (in a throwaway worktree). [info] This does not match the reports' claim that tsc was failing before this work. Either tsc is clean or the output format differs, so it needs an Orchestrator look; the result is the same before and after, so this change caused nothing.

## Findings
- [info] The tsc state differs from what the dev reports describe (see above).
- [minor] The selection-styles count (2) depends on the fixture states shown. Coverage of other selection widgets in later milestones should be watched.

## Blockers
- `bh gate --verdict PASS` refused: the Goal needs fresh PASS receipts for all frozen DONE criteria (c1-c14), and c1, c2 and c10 (RECIPE.md, token map, render-resilience test) are later-milestone work. At M1 a per-milestone QA PASS cannot be recorded through `bh gate`. The Orchestrator needs to decide how M1 gate verdicts get recorded. I did not run `bh goal verify`: it moves the ratchet, which is the Orchestrator's call.
