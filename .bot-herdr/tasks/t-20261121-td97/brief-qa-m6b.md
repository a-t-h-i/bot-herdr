# QA brief — M6 re-gate and final full audit (after dev-m6fix)

Task t-20261121-td97, step 6. Judge independently; read the code. This is also the goal's final review.

Read: your last gate `reports/qa-m6.md` (CHANGES_REQUIRED, Findings 1–4), `brief-dev-m6fix.md`, `reports/dev-m6fix.md`. Diff of this round: `git diff HEAD~1 -- . ':!.bot-herdr'`.

## Passes only if
1. qa-m6 Finding 1 is fixed at `file:line`: no held ACP permission is left unanswered on cancel (`hc interrupt`/Steer), idle timeout, child close, turn end, or a vanished/unreadable record; `cancel()` is idempotent; a throwing `send` cannot crash the agent; the turn still ends; the tests in `test/approvals.test.mjs` cover all of this and pass.
2. Findings 2–4 are fixed as the fix brief says.
3. No regression on anything qa-m6 passed (contract shapes, the 7 M6 features, every rubric cell >= 4); tests updated, never deleted or loosened.
4. Rubric: re-score every page and the 6 animation cycles exactly as in `qa-m6.md`. PASS needs every cell >= 4. List carried-over minors (non-blocking).

## Checks yourself (each in the foreground, timeout 600; wait for each; your turn must not end while one runs)
- `/home/athi/bot-herdr/node_modules/.bin/tsc --noEmit -p mods/bot-herdr/jsconfig.json`
- `node mods/bot-herdr/engine/bh.mjs check`
- `npm test`
- `/home/athi/.local/bin/herdr-app check mods/bot-herdr`, then delete the regenerated `mods/bot-herdr/engine/lib/gpui-kit.d.ts`
- `BH_APP_HOME=$(mktemp -d) node mods/bot-herdr/engine/bh.mjs ui-audit --json --shots .bot-herdr/tasks/t-20261121-td97/shots/m6b` (must print `pass: true`), and look at the shots

Do NOT run `bh goal verify`, don't edit code, don't use `bh gate`.

Write `.bot-herdr/tasks/t-20261121-td97/reports/qa-m6b.md` and record it with `bh report t-20261121-td97 --step 6 --file <that> "QA M6 re-gate + final audit: PASS|CHANGES_REQUIRED — <summary>"`.
