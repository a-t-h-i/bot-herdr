# Progress — Redesign bot-herdr UI to Design Language (t-20261121-td97)

Spec: `.bot-herdr/tmp/design-language-spec.md` ("Herdr Harness Plugin — Design Language").
Plan: p-20261121-siir. Goal ceiling $40.

## Milestone
M1 Audit tooling — PASSED (qa-m1, 4/5 on all four areas; milestone verdicts are recorded as reports, because `bh gate` takes a PASS only once all Goal criteria pass).
M2 Tokens and state language — PASSED (qa-m2: 5/5/5/4/5/5). On main with the UI typecheck fix.
M3 Quiet pass — PASSED (qa-m3: no rubric cell below 4 on Principles 2/3/5/6 + Keep, 11 pages).
M4 Navigation — engine half done (bh thread/home/goal progress, migrateLayout); UI part a in progress (dev-m4a), part b next.

## Checks
| Check | Result |
| --- | --- |
| herdr-app check mods/bot-herdr | pass (M1) |
| tsc --noEmit -p mods/bot-herdr/jsconfig.json | pass, 0 errors (noImplicitAny off by Orchestrator decision; 141 real fixes; runs in bh check) |
| bh check | pass (M1) |
| npm test | pass, 642/1 skipped (M3) |
| bh ui-audit --json | exit 0, pass:false — M3 counters at target; remaining: destinations, features, keyboard/label coverage (M4/M5) |

## QA
M1: PASS (reports/qa-m1.md). M2: PASS (reports/qa-m2.md); nit: the working seat dot at opacity 0.45 is handed to M3. M3: PASS (reports/qa-m3.md).

## Next step
dev-m4a: 5 destinations + Home/Agents/Library/Settings›Usage + layout migration; then dev-m4b: Threads, Peek, Goal row, Composer, Status bar, RECIPE.md.
