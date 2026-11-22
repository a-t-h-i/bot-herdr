# QA brief — M4+M5 re-gate round 3 (after dev-m45fix2, commit 469d970)

Task t-20261121-td97, steps 4 and 5. Judge independently; read the code, not just the report.

Read: your previous gate `.bot-herdr/tasks/t-20261121-td97/reports/qa-m45b.md` (CHANGES_REQUIRED, Major 1 and 2), `brief-dev-m45fix2.md`, `reports/dev-m45fix2.md`. Diff of this round: `git diff 2c6c15c..469d970 -- . ':!.bot-herdr'`.

## Passes only if
1. qa-m45b Major 1 is fixed at `file:line`: typing `e`, `Backspace` or `Delete` in a Knowledge card's inline note input does not open the editor or delete the entry; Edit/Delete stay mounted while Tab moves from the card onto them.
2. qa-m45b Major 2 is fixed: `?` and `Ctrl+1..5` do nothing while any text input has focus, including `composer.modelSearch`, `browseSearch`, `browseTyped` and `chat.commentBoxes`.
3. The two new minors from qa-m45b (`agents.js` keymap under Terminals, `work.js` undo note prefix) are fixed.
4. No regression on anything qa-m45b marked Met; `git diff 2c6c15c..469d970 -- mods/bot-herdr/engine/` is empty.
5. Rubric: re-score every page and the 6 animation cycles as in `qa-m45b.md`. PASS needs every cell >= 4. Carry the unaddressed minors 10–13, 15, 16, 18 over as a list (non-blocking).

## Checks yourself
- `/home/athi/bot-herdr/node_modules/.bin/tsc --noEmit -p mods/bot-herdr/jsconfig.json`
- `node mods/bot-herdr/engine/bh.mjs check`
- `npm test`
- `/home/athi/.local/bin/herdr-app check mods/bot-herdr`, then delete the regenerated `mods/bot-herdr/engine/lib/gpui-kit.d.ts`
- `BH_APP_HOME=$(mktemp -d) node mods/bot-herdr/engine/bh.mjs ui-audit --json --shots .bot-herdr/tasks/t-20261121-td97/shots/m45c`

Run every check in the foreground and wait for it to finish. Do NOT run `bh goal verify`, don't edit code, don't use `bh gate`.

Write `.bot-herdr/tasks/t-20261121-td97/reports/qa-m45c.md` and record it with `bh report t-20261121-td97 --step 5 --file <that> "QA M4+M5 re-gate 3: PASS|CHANGES_REQUIRED — <summary>"`.
