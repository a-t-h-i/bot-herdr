## Summary
QA M3 verdict: PASS. All 8 Fix counters are at target except topLevelDestinations, which belongs to M4. Every page is under the M1 baseline, and the audit lib and baseline are unchanged since M1.
The M4 engine is additive and survives a corrupt task.json. tsc, npm test, herdr-app check and ui-audit all ran green.

## Changes
None (review only).

## Brief Check
1. Counters: met. accentButtonsPerView 1, zeroCountChips 0, repeatedDefaultStrings 0, statsPerCard 1, selectionStyles 1, rawMachineText 0, decorativeIcons 0, agentColourFills 0, hexOutsideTokens 0, renderErrors {}. Pages now vs M1: chat 40/41, tasks 163/167, board 182/187, plans 100/101, issues 92/95, knowledge 139/142, learning 67/71, metrics 116/194, settings 255/292, general 105/110, switch 28/29. The baseline has one commit (6f4ad9b, M1). `git diff 0f5bc4c..HEAD -- engine/lib/ui-audit*` is empty, so the counters fell because the UI changed, not the measurement.
2. No information removed: met. The metrics card numbers moved into the tooltip and Details (shot metrics-paper). The branch and contract JSON are now folded mono lines with expand and Copy (shot tasks-graphite). Hidden chips are zero counts only. I found nothing that is simply gone.
3. No behaviour change: met. accessibleLabelCoverage is still 0.85 and keyboardPathCoverage 0.92, the same as M1, so dropping the icons left no button unlabelled. Both are already M5 targets.
4. Tests: met. contrast and metrics-view were updated to the new contract, and machinetext.test.mjs was added. Nothing was deleted or skipped: the one skip in the suite already existed.
5. M4 engine: met. `bh home --json` and `bh thread list --json` return real data on this repo. With a corrupt task.json in a temp root, `bh home --json` exits 0 with a calm, empty needsYou. home.test.mjs and thread-model.test.mjs cover the corrupt and legacy cases.
6. Checks: see Verification.

## Rubric (P2, P3, P5, P6, Keep), 1–5
| page | P2 | P3 | P5 | P6 | Keep |
|---|---|---|---|---|---|
| chat, tasks, tasks-board, plans, issues, knowledge, learning, metrics, settings, settings-general, switch | 4 | 4 | 4 | 4 | 4 |
No cell is below 4. Observations for later milestones, not scored: 11 destinations against a target of 5 (P1/M4), label coverage at 85% (M5), and the tasks page has a lot of empty space in the left column (P4).

## Findings
- [info] Remaining ui-audit failures are M4/M5 scope: destinations, a11y coverage and the P1 features.
- [minor] The metrics bars render as one grey block when the range is Today (metrics-paper.png). They read fine, but they carry little information.

## Verification
- node_modules/.bin/tsc --noEmit -p mods/bot-herdr/jsconfig.json — exit 0
- npm test — 643 tests, 642 pass, 0 fail, 1 skipped
- herdr-app check mods/bot-herdr — check passed (gpui-kit.d.ts removed afterwards)
- bh ui-audit --json — exit 0; Fix counters as above; failures only in M4/M5 items
- bh home --json, bh thread list --json — valid JSON; also valid on a corrupt-data temp root
- step task receipt — bh check exit 0, head a6f7085
