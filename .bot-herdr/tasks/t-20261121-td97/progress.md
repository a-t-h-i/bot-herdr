# Progress — Redesign bot-herdr UI to Design Language (t-20261121-td97)

Spec: `.bot-herdr/tmp/design-language-spec.md` ("Herdr Harness Plugin — Design Language").
Plan: p-20261121-siir. Goal ceiling $40.

## Milestone
M1 Audit tooling — PASSED (qa-m1, 4/5 on all four areas; milestone verdicts are recorded as reports, because `bh gate` takes a PASS only once all Goal criteria pass).
M2 Tokens and state language — PASSED (qa-m2: 5/5/5/4/5/5). On main with the UI typecheck fix.
M3 Quiet pass — in progress (dev-m3).

## Checks
| Check | Result |
| --- | --- |
| herdr-app check mods/bot-herdr | pass (M1) |
| tsc --noEmit -p mods/bot-herdr/jsconfig.json | pass, 0 errors (noImplicitAny off by Orchestrator decision; 141 real fixes; runs in bh check) |
| bh check | pass (M1) |
| npm test | pass, 606/1 skipped (M2) |
| bh ui-audit --json | exit 0, pass:false — all 8 Fix rows fail (expected at M1) |

## QA
M1: PASS (reports/qa-m1.md). M2: PASS (reports/qa-m2.md); nit: the working seat dot at opacity 0.45 is handed to M3.

## Next step
dev-m3: quiet pass (accent<=1, zero-count chips, defaults, one selection style, no agent fills, no decorative icons, folded machine text, hero stats, visibleElements < baseline).
