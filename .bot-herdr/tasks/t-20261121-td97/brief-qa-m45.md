# QA brief — M4 re-check + M5 gate

Task t-20261121-td97, steps 4 and 5. You did not build this; judge it independently. Both were built by a fallback model (opencode) after a quota failover, so read the code, not just the reports.

Read:
- `.bot-herdr/tmp/design-language-spec.md`: **Principles**, **Navigation**, **Interaction and motion** (micro-interactions, Working animations, Timing, Reduced motion), **Accessibility and ease of use** (incl. Keyboard map), **Building in GPUI**, **Goal prompt** (CHECKS, QA RUBRIC).
- Previous gate: `.bot-herdr/tasks/t-20261121-td97/reports/qa-m4.md` (CHANGES_REQUIRED, findings 1, 2, 6).
- Briefs and reports: `brief-dev-m4fix.md` + `reports/dev-m4fix.md`; `brief-dev-m5.md` + `reports/dev-m5.md` + `plan-dev-m5.md`.
- Diff: M4 fix `git diff 5fc282c..de2d9c1 -- . ':!.bot-herdr'`; M5 `git diff d859271..redesign-bot-herdr-ui-to-design-language-dev-m5 -- . ':!.bot-herdr'`; all since M3 on main `git diff d9e3860..HEAD -- . ':!.bot-herdr'`.

## M4 re-check passes only if
1. qa-m4 finding 1 fixed: thread Conversation draws contract JSON / stack traces / paths via `machineLine` (one muted mono line that expands), and `looksMachine` no longer exempts truncated body-size non-mono text; a fixture asserts `thread-conversation` rawMachineText 0.
2. Finding 2 fixed: `REPLACES` in `engine/lib/ui-audit.mjs` maps each library sub-tab 1:1 to its predecessor, and each is under its own M1 baseline.
3. Finding 6 fixed: `APP_HOME` in `engine/lib/core.mjs` no longer resolves to the checkout root; `data/bot-herdr/logs/` gitignored. Also look at minor findings 3–5 and say which were addressed.
4. The audit was not loosened to get there (`git diff 5fc282c..HEAD -- mods/bot-herdr/engine/lib/ui-audit*.mjs mods/bot-herdr/engine/ui-audit-baseline.json`).

## M5 passes only if
1. The six working cycles match the spec table exactly, on one 120 ms tick, glyph + verb in a fixed-width slot (zero layout shift), verbs turn at most every 4 s, avatar breathes only while working.
2. Reduce motion: persisted toggle in Settings › General (and `settings().reduced_motion` honoured); frames freeze on first glyph, fades instant, through one helper every animation uses. Grep for `.frames(` / `.loop(` / `transition(` call sites that bypass it.
3. Micro-interactions from the spec table: list each row as present / missing with `file:line` (hover/press steps, optimistic send, answered-card fold, finish ✓ + overlay, needs-you pulse + unfocused-only toast, skeletons not spinners, Copied/Saved 1.5 s, Undo 5 s).
4. Accessibility + keyboard: audit `keyboardPath` and label coverage 100% on every page, measured from real `track_focus`/`on_key_down`/`role`/`accessibility_label` in the spec (check the counters were not loosened); `Ctrl+Shift+P`, `Ctrl+1..5`, `Ctrl+.`, `?` overlay, and view-local J/K, Space, Enter, Esc, 1–9, Ctrl+Enter actually wired; no collisions with herdr's own keys.json; focus ring 2 px, no jitter; status region announces state changes.
5. No test writes into the repo tree.

## Checks yourself
`node_modules/.bin/tsc --noEmit -p mods/bot-herdr/jsconfig.json`, `node mods/bot-herdr/engine/bh.mjs check`, `npm test`, `/home/athi/.local/bin/herdr-app check mods/bot-herdr` (then delete the generated `mods/bot-herdr/engine/lib/gpui-kit.d.ts` if it was not there before — note it is now tracked from M5; say whether it should be), `BH_APP_HOME=$(mktemp -d) node mods/bot-herdr/engine/bh.mjs ui-audit --json --shots .bot-herdr/tasks/t-20261121-td97/shots/m5`. Do NOT run `bh goal verify`.

## Rubric
Score each page (Home; Threads list + 4 sub-tabs; Agents Fleet, Terminals; Library Knowledge, Learning, Scripts, Issues; Settings + Usage; Peek) 1–5 on all 7 Principles and "keeps every Keep trait", plus the 6 animation cycles (distinct, 120 ms steady, zero layout shift, frozen under Reduce motion). PASS needs every cell >= 4; give reasons and exact fixes (file:line) for anything below.

Write `.bot-herdr/tasks/t-20261121-td97/reports/qa-m45.md`. Don't use `bh gate`, don't edit code. Record with `bh report t-20261121-td97 --step 5 --file <that> "QA M4+M5 verdict: PASS|CHANGES_REQUIRED — <summary>"`.
