# QA brief — M4+M5 re-gate (after dev-m45fix)

Task t-20261121-td97, steps 4 and 5. You did not build this; judge it independently. Read the code, not just the report.

Read:
- Your previous gate: `.bot-herdr/tasks/t-20261121-td97/reports/qa-m45.md` (CHANGES_REQUIRED, findings 1–18).
- `brief-dev-m45fix.md` (the decisions given to Dev; they are final, so don't re-open them) and `reports/dev-m45fix.md`.
- Spec: `.bot-herdr/tmp/design-language-spec.md` › **Interaction and motion**, **Accessibility and ease of use**, **Building in GPUI**, **Goal prompt** (QA RUBRIC).
- Diff of the fix round: `git diff 9813c7b..HEAD -- . ':!.bot-herdr'`.

## Passes only if
1. Each of qa-m45 majors 1–9 is fixed as `brief-dev-m45fix.md` says. Check every one in code at `file:line`. In particular:
   - `?` and Ctrl+1..5 do nothing while a text input has focus.
   - The overlay draws in exactly one block and closes on Esc.
   - `settings-general` < 110 with no information dropped.
   - Knowledge Edit/Delete reachable by Tab plus keys.
   - Every `.spring(` goes through `springing`.
   - Needs-you pulses once on arrival and never under Reduce motion.
   - Undo restores the exact entry.
   - The optimistic send really returns to `textPrimary` on ack and shows failure on error.
2. No regression on what qa-m45 already passed: the M4 items, the 6 cycles, Reduce motion persistence, audit counters not loosened (`git diff 9813c7b..HEAD -- mods/bot-herdr/engine/` must be empty apart from the gpui-kit.d.ts deletion).
3. Minors 10–18: say which are now addressed. Unaddressed minors don't block, but list them with exact fixes.
4. Rubric: re-score every page and the animation cycles as in `brief-qa-m45.md`. PASS needs every cell >= 4.

## Checks yourself
- `node_modules/.bin/tsc --noEmit -p mods/bot-herdr/jsconfig.json`
- `node mods/bot-herdr/engine/bh.mjs check`
- `npm test`
- `/home/athi/.local/bin/herdr-app check mods/bot-herdr`, then delete the regenerated `mods/bot-herdr/engine/lib/gpui-kit.d.ts`; it is gitignored now
- `BH_APP_HOME=$(mktemp -d) node mods/bot-herdr/engine/bh.mjs ui-audit --json --shots .bot-herdr/tasks/t-20261121-td97/shots/m45b`, and look at the shots

The worktree may lack `node_modules`; if so use `/home/athi/bot-herdr/node_modules/.bin/tsc`. Do NOT run `bh goal verify`.

Write `.bot-herdr/tasks/t-20261121-td97/reports/qa-m45b.md`. Don't use `bh gate`, and don't edit code. Record it with `bh report t-20261121-td97 --step 5 --file <that> "QA M4+M5 re-gate: PASS|CHANGES_REQUIRED — <summary>"`.
