# QA brief — M6 gate and final full audit

Task t-20261121-td97, step 6. You did not build this; judge it independently and read the code, not just the reports. This gate is also the goal's final review: QA PASS on a full audit run of the final build.

Read: spec `.bot-herdr/tmp/design-language-spec.md` (whole doc; **Features borrowed from leading harnesses**, **Principles**, **Goal prompt** › QA RUBRIC and NEVER), `contract-m6.md`, `brief-dev-m6e.md`, `brief-dev-m6u.md`, `reports/dev-m6e.md`, `reports/dev-m6u.md`, your last gate `reports/qa-m45c.md`. Diff: `git diff 741e079..HEAD -- . ':!.bot-herdr'`. The Orchestrator also seeded a pending approval and an expanded diff into `ui-audit-fixtures.mjs` (in 8c47948); check that this adds fixture state only and loosens nothing.

## Passes only if
1. **Contract**: every command in `contract-m6.md` answers with exactly its JSON shape (run each against a temp project).
2. **Approvals are safe**: a refused call is held only when access is not `full` and autonomy is `ask`/`guarded`; under `autonomous` it is rejected as before; a broken hook or a dead watcher never leaves an ACP request unanswered forever without a path to reject; `project` adds the exact command only and `acpAllowed` matching is not widened; Deny sends a reject option and posts the Refused line. Cite `runner.mjs` / `approvals.mjs` lines.
3. **Each M6 feature works as its brief says**, at `file:line`: approval card (3 buttons, one primary, keys 1/2/3, fold on answer), diff review (expand, inline comment add/remove, Send to Dev hidden at 0), view modes (Normal default, `v` cycles, Summary/Verbose filtering), thread map + Forked from, Fork input, Queue/Steer (Ctrl+Enter steers via `hc interrupt` then `hc send`), Tile toggle in Agents › Terminals.
4. **No regression** on anything qa-m45c passed; tests were updated, never deleted or loosened (look at `test/pre-m1-foundation.test.mjs` in particular).
5. **Rubric**: score every page (`Home`, `Threads` + 4 sub-tabs, `Agents` `Fleet | Terminals`, `Library` `Knowledge | Learning | Scripts | Issues`, `Settings` + `Usage`, `Peek`) 1–5 on all 7 Principles and all 6 Keep traits, plus the 6 working animation cycles (distinct, 120 ms steady, zero layout shift, frozen under Reduce motion), backed by audit JSON, `file:line` and the screenshots on the 4 key themes. PASS needs every cell >= 4; give a reason and exact fix for every cell below 4. List carried-over minors (non-blocking).

## Checks yourself (each in the foreground, timeout 600, and wait for it)
- `/home/athi/bot-herdr/node_modules/.bin/tsc --noEmit -p mods/bot-herdr/jsconfig.json`
- `node mods/bot-herdr/engine/bh.mjs check`
- `npm test`
- `/home/athi/.local/bin/herdr-app check mods/bot-herdr`, then delete the regenerated `mods/bot-herdr/engine/lib/gpui-kit.d.ts`
- `BH_APP_HOME=$(mktemp -d) node mods/bot-herdr/engine/bh.mjs ui-audit --json --shots .bot-herdr/tasks/t-20261121-td97/shots/m6` (must print `pass: true`), and look at the shots

Do NOT run `bh goal verify`, don't edit code, don't use `bh gate`. Your turn must not end while a check runs.

Write `.bot-herdr/tasks/t-20261121-td97/reports/qa-m6.md` and record it with `bh report t-20261121-td97 --step 6 --file <that> "QA M6 + final audit: PASS|CHANGES_REQUIRED — <summary>"`.
