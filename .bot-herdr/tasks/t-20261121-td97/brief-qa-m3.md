# QA brief — M3 gate (Quiet pass) + M4 engine review

Task t-20261121-td97, step 3. You did not build this; judge it independently. Read:
- `.bot-herdr/tmp/design-language-spec.md`: **Current flavour** (Keep + Fix), **Principles**, **Foundations**, **Components**, **Goal prompt** (QA RUBRIC, NEVER: no runtime behaviour change before M4; remove no information, fold it instead; no loosened checks/tests).
- Reports: `.bot-herdr/tasks/t-20261121-td97/reports/dev-m3.md`, `dev-m4-engine.md`.
- Diffs: M3 UI = `git show HEAD --stat` and `git diff HEAD~1 HEAD -- . ':!.bot-herdr'`; M4 engine = `git show 5168029`.
- Screenshots (gitignored, absolute): M2 `/home/athi/bot-herdr/.bot-herdr/worktrees/redesign-bot-herdr-ui-to-design-language/.bot-herdr/tasks/t-20261121-td97/shots/m2/`, M3 `…/shots/m3/`, 11 pages × graphite/paper/ink/moss. Compare them.

## M3 passes only if
1. Audit counters at target: `accentButtonsPerView <= 1`, `zeroCountChips = 0`, `repeatedDefaultStrings = 0`, `selectionStyles = 1`, `agentColourFills = 0`, `decorativeIcons = 0`, `rawMachineText = 0`, `statsPerCard` at target, `hexOutsideTokens = 0`, `visibleElements < M1 baseline` on every page, with the baseline file unchanged since M1 (`git log --follow mods/bot-herdr/engine/ui-audit-baseline.json`). Run the audit yourself, and check by reading the code that each counter fell because the UI changed, not because the measurement changed (`git diff 0f5bc4c..HEAD -- mods/bot-herdr/engine/lib/ui-audit*.mjs`).
2. **No information removed**: for every detail that disappeared from a page, find where it is now reachable (tooltip, expand, detail view, peek). List any that are simply gone.
3. No runtime behaviour change: same actions, commands and data. dev-m3 says every labelled button lost its icon; check nothing became unclickable or unlabelled.
4. Tests updated, never deleted/skipped/loosened: diff `test/`.
5. The M4 engine (`bh thread`, `bh home`, `bh goal progress`, `migrateLayout`) is additive, never throws on corrupt data, and its tests are meaningful. Run `bh home --json` and `bh thread list --json` against this repo.
6. Checks yourself: `node_modules/.bin/tsc --noEmit -p mods/bot-herdr/jsconfig.json` (run `npm install` if missing), `node mods/bot-herdr/engine/bh.mjs check`, `npm test`, `/home/athi/.local/bin/herdr-app check mods/bot-herdr` (delete the generated `mods/bot-herdr/engine/lib/gpui-kit.d.ts`), `node mods/bot-herdr/engine/bh.mjs ui-audit --json`.

## Rubric (spec › Goal prompt › QA RUBRIC)
Score each of the 11 current pages (chat, tasks, tasks-board, plans, issues, knowledge, learning, metrics, settings, settings-general, switch) 1–5 on Principles 2, 3, 5 and 6 (M3's scope) and on "keeps every Keep trait". Principles 1, 4 and 7, and the animations, belong to M4/M5: note observations, don't score them. Use the screenshots and cite `file:line`. PASS needs every scored cell >= 4. Give a reason for any score below 4, and exact fixes for CHANGES_REQUIRED.

Write `.bot-herdr/tasks/t-20261121-td97/reports/qa-m3.md` (the score table plus findings). Don't use `bh gate`. Record with `bh report t-20261121-td97 --step 3 --file <that> "QA M3 verdict: PASS|CHANGES_REQUIRED — <summary>"`. Don't edit code.
