# Progress — Redesign bot-herdr UI to Design Language (t-20261121-td97)

Spec: `.bot-herdr/tmp/design-language-spec.md` ("Herdr Harness Plugin — Design Language").
Plan: p-20261121-siir. Goal ceiling $40.

## Milestone
M1 Audit tooling — PASSED (qa-m1). M2 Tokens and state language — PASSED (qa-m2). M3 Quiet pass — PASSED (qa-m3).
M4 Navigation — PASSED (qa-m45c, round 3). M5 Interaction, motion, accessibility — PASSED (qa-m45c, round 3).
M6 Review panel, view modes, approvals, P2 — built (engine dev-m6e, UI dev-m6u, fix dev-m6fix); qa-m6 CHANGES_REQUIRED (held approvals could stay unanswered) fixed in fdcd582; re-gate qa-m6b not run: the QA harness (Antigravity) hit its quota.

## Checks
| Check | Result |
| --- | --- |
| herdr-app check mods/bot-herdr | pass (M6 fix) |
| tsc --noEmit -p mods/bot-herdr/jsconfig.json | pass, 0 errors |
| bh check | pass |
| npm test | pass, 693/1 skipped (M6 fix) |
| bh ui-audit --json | exit 0, pass: true; all 8 P1 features present, every page under baseline |

## QA
qa-m6: CHANGES_REQUIRED — held ACP permission not answered on cancel/idle/close or a vanished record (fixed); approval answer errors not shown (fixed); queued rows hidden when the composer folds (fixed); Fold ignored in Verbose (fixed). Every rubric cell was >= 4. Carried minors (non-blocking): 10, 11, 12, 13, 15, 16, 18 from qa-m45c.

## Next step
qa-m6b: M6 re-gate and final full audit (brief-qa-m6b.md), once a QA harness has quota. Then merge to main, push, node install.mjs.
