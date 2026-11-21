# Progress — Redesign bot-herdr UI to Design Language (t-20261121-td97)

Spec: `.bot-herdr/tmp/design-language-spec.md` ("Herdr Harness Plugin — Design Language").
Plan: p-20261121-siir. Goal ceiling $40.

## Milestone
M1 Audit tooling — in progress (dev-m1).

## Checks
| Check | Result |
| --- | --- |
| herdr-app check mods/bot-herdr | not run |
| tsc --noEmit -p mods/bot-herdr/jsconfig.json | not run |
| bh check | not run |
| npm test | not run |
| bh ui-audit --json | not run |

## QA
No verdict yet.

## Next step
dev-m1 builds `bh ui-audit` and its tests.
