# QA brief — M4 gate (Navigation, Threads, Peek, Goal row, RECIPE.md)

Task t-20261121-td97, step 4. You did not build this; judge it independently. Read:
- `.bot-herdr/tmp/design-language-spec.md`: all of it, especially **Navigation**, **Principles**, **Components**, **Features borrowed** (P1 rows), **Accessibility › Ease of use**, **Goal prompt** (CHECKS, QA RUBRIC, NEVER: remove no information, fold it).
- Reports: `.bot-herdr/tasks/t-20261121-td97/reports/dev-m4-engine.md`, `dev-m4a.md`, `dev-m4b.md`, `qa-m3.md`.
- Diff since M3 landed on main: `git diff d9e3860..HEAD -- . ':!.bot-herdr'`.
- Screenshots (gitignored, absolute): `/home/athi/bot-herdr/.bot-herdr/worktrees/redesign-bot-herdr-ui-to-design-language/.bot-herdr/tasks/t-20261121-td97/shots/m4/` (27 pages × graphite/paper/ink/moss), and `…/shots/m3/` for before.

## M4 passes only if
1. `topLevelDestinations = 5` (Home, Threads, Agents, Library, gear Settings); Home opens first, with Needs you on top and the fleet below. Agents = `Fleet | Terminals`, Library = `Knowledge | Learning | Scripts | Issues`, Settings includes Usage (Metrics).
2. Threads: the list, plus the thread view with breadcrumb and Conversation | Plan | Steps | Changes. Peek drawer (Space/Esc) shared by Home, Threads and Agents, with question cards (1–9) and inline reply. Goal row above the composer. One-line composer. Slim status bar.
3. **Nothing lost**: walk the old → new tables in dev-m4a.md and dev-m4b.md. Every old destination and capability (chat with the Orchestrator, tasks, plans incl. new plan / plan comments / start as task or goal, board, changes, files, metrics, issues bundling/triage, knowledge, learning, settings sections, terminals, the old status strip contents) must be reachable. List anything that's gone.
4. `install.mjs` migrates an existing layout non-destructively with a backup. Test it with a copy of the real `~/.config/herdr-app/layouts/bot-herdr.json` in a temp `HERDR_APP_HOME`, never the live one.
5. `mods/bot-herdr/RECIPE.md` follows `~/.config/herdr-app/AGENTS.md`'s recipe spec and documents the mod, layout, themes and tokens.
6. The audit wasn't loosened: `git diff d9e3860..HEAD -- mods/bot-herdr/engine/lib/ui-audit*.mjs mods/bot-herdr/engine/ui-audit-baseline.json`. New pages must compare against the M1 baseline of the pages they replace; P1 features must be detected from the rendered spec, not asserted.
7. A test wrote `data/bot-herdr/logs/ui.jsonl` into the repo tree (a thread read-model skip log, 08:59). Find which test or code path writes logs relative to the cwd instead of the DATA dir / a temp dir, and list the fix.
8. Theme: the shots use herdr's graphite as "default dark", but the user's layout uses `bot-herdr-dark` / `bot-herdr-light` (the warm charcoal Keep trait). Check the warm look holds there too: run the shot stage or `herdr-app check` with that theme if the audit allows, or reason from the `look.js` palette, and say which you did.
9. Checks yourself: `node_modules/.bin/tsc --noEmit -p mods/bot-herdr/jsconfig.json`, `node mods/bot-herdr/engine/bh.mjs check`, `npm test`, `/home/athi/.local/bin/herdr-app check mods/bot-herdr` (delete the generated `mods/bot-herdr/engine/lib/gpui-kit.d.ts`), `node mods/bot-herdr/engine/bh.mjs ui-audit --json`.

## Rubric (spec › Goal prompt › QA RUBRIC)
Score each page (Home; Threads list + the 4 thread sub-tabs; Agents Fleet and Terminals; Library Knowledge, Learning, Scripts and Issues; Settings + Usage; the Peek drawer) 1–5 on Principles 1–6 and "keeps every Keep trait". Principle 7 (keyboard + phone path) and the animations are M5: note them, don't score them. Use screenshots and code, citing `file:line`. PASS needs every scored cell >= 4. Give a reason for any score below 4, and exact fixes for CHANGES_REQUIRED.

Write `.bot-herdr/tasks/t-20261121-td97/reports/qa-m4.md`. Don't use `bh gate`. Record with `bh report t-20261121-td97 --step 4 --file <that> "QA M4 verdict: PASS|CHANGES_REQUIRED — <summary>"`. Don't edit code.
