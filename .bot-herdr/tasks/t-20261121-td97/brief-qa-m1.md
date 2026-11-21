# QA brief — M1 gate (audit tooling)

Task t-20261121-td97, step 1. You did not build this; judge it independently. Read:
- `.bot-herdr/tmp/design-language-spec.md`: **Goal prompt** (M1, CHECKS, NEVER), **Current flavour › Fix**, **Building in GPUI**, **Accessibility**.
- Dev reports: `.bot-herdr/tasks/t-20261121-td97/reports/dev-m1.md`, `dev-m1-shots.md`, `a11y-capability.md`.
- The diff: `git diff 37d74fb..HEAD -- . ':!.bot-herdr'`.
- Screenshots (gitignored, absolute path): `/home/athi/bot-herdr/.bot-herdr/worktrees/redesign-bot-herdr-ui-to-design-language/.bot-herdr/tasks/t-20261121-td97/shots/m1/` (44 PNGs, 11 pages × graphite/paper/ink/moss). Look at a sample across all 4 themes.

## M1 passes only if
1. `bh ui-audit` renders every mod page headless, scans hex literals, checks contrast on all 16 presets with alpha compositing and no `ownTheme` exemption, and writes the CHECKS metrics as JSON (`--json`).
2. On today's (pre-redesign) build the audit **FAILS every one of the 8 Fix-table rows**. Check each counter is a genuine measurement of that row, not hard-coded, and that each target matches the spec (e.g. destinations target 5, selection styles target 1). Spot-check counts against the screenshots and source.
3. The M1 visible-element baseline is recorded (`mods/bot-herdr/engine/ui-audit-baseline.json`).
4. The gpui-kit a11y capability is confirmed and the gaps are written up as upstream requests.
5. Screenshots on 4 key themes exist and show real bot-herdr pages with data. The audit never touches the live `~/.config/herdr-app` window.
6. `test/ui-audit.test.mjs` covers spec-tree parsing, 16-theme contrast compositing and Fix-table failure detection. No test deleted, skipped or loosened (check `test/pre-m1-foundation.test.mjs`'s change is legitimate).
7. Checks run yourself: `node mods/bot-herdr/engine/bh.mjs check`, `npm test`, `/home/athi/.local/bin/herdr-app check mods/bot-herdr` (delete the generated `mods/bot-herdr/engine/lib/gpui-kit.d.ts` afterwards), `node mods/bot-herdr/engine/bh.mjs ui-audit --json` (exit 0, `pass:false`). Note the `npx tsc --noEmit -p mods/bot-herdr/jsconfig.json` state; the reports say it was failing before this work, so confirm that against 37d74fb rather than taking it on trust.
8. No UI runtime behaviour changed (M1 must not change behaviour).

Since this milestone ships tooling, not UI, the per-page rubric scoring starts at M2/M3. For M1, score the audit itself 1–5 on: accuracy of the 8 counters, contrast correctness, robustness (timeouts, cleanup, never touching the live app), and tests. PASS needs every score >= 4. Give a reason for any score under 4, and list exact `file:line` fixes for CHANGES_REQUIRED.

Write `.bot-herdr/tasks/t-20261121-td97/reports/qa-m1.md`, then `bh gate t-20261121-td97 --verdict PASS|CHANGES_REQUIRED --file <that> "<summary>"`. Don't edit code.
