# Progress — Redesign bot-herdr UI to Design Language (t-20261121-td97)

Spec: `.bot-herdr/tmp/design-language-spec.md` ("Herdr Harness Plugin — Design Language").
Plan: p-20261121-siir. Goal ceiling $40.

## Milestone
M1 Audit tooling — PASSED (qa-m1, 4/5 on all four areas; milestone verdicts are recorded as reports, because `bh gate` takes a PASS only once all Goal criteria pass).
M2 Tokens and state language — in progress (dev-m2).

## Checks
| Check | Result |
| --- | --- |
| herdr-app check mods/bot-herdr | pass (M1) |
| tsc --noEmit -p mods/bot-herdr/jsconfig.json | not runnable: typescript not installed in worktree (M2 fixes) |
| bh check | pass (M1) |
| npm test | pass, 605/1 skipped (M1) |
| bh ui-audit --json | exit 0, pass:false — all 8 Fix rows fail (expected at M1) |

## QA
M1: PASS (reports/qa-m1.md).

## Next step
dev-m2: semantic tokens in look.js, zero hex outside look.js, controlBorder on 16 themes, tsc green.
