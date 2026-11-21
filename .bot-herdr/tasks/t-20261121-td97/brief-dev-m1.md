# Dev brief — M1 Audit tooling (`bh ui-audit`)

Task t-20261121-td97, step 1. Work only in this worktree. Read first:
- `.bot-herdr/tmp/design-language-spec.md` — the whole doc. This milestone follows **Goal prompt › MILESTONES M1** and **CHECKS**, **Building in GPUI**, **Current flavour › Fix**, **Foundations › Colour roles**, **Accessibility**.
- `/home/athi/bot-herdr/.bot-herdr/plans/p-20261121-siir/plan.md` — step 2 is this milestone.
- `mods/bot-herdr/engine/lib/ui-audit.mjs` (placeholder from pre-M1), `mods/bot-herdr/engine/bh.mjs` dispatcher, `mods/bot-herdr/look.js`, `theme.js`, `pages.js`, `main.js`, `render-safe.js`, `test/contrast.test.mjs`, `install.mjs` (herdr-app binary lookup).

## Build
Replace the placeholder with a real `bh ui-audit [--json] [--page P] [--theme T] [--shots DIR] [--baseline write]`:

1. **Pages**: render every page of the mod headless via `herdr-app check <wrapper> --print-spec` (reuse install.mjs's HERDR_APP_BIN / `~/.local/bin/herdr-app` lookup). `herdr-app check` renders only the first view, so generate a tiny temp wrapper mod per page (in os.tmpdir) that opens that page, over deterministic fixture data (temp project dir / DATA dir with fixture plans, tasks, board, replies, knowledge). Parse the printed spec tree. First confirm what `--print-spec` really prints (run it). If it's unavailable or a page fails, record that page under `renderErrors` with the message rather than crashing.
2. **Static scan** of `mods/bot-herdr/**/*.js` (excluding `engine/` and `look.js`): hex colour literals outside `look.js` (`hexOutsideTokens`, with file:line list).
3. **Contrast**: for all 16 theme presets (find them all in theme.js / themes/*.json), composite alpha `#rrggbbaa` colours over their surface, then check text >= 4.5:1, and glyphs, input borders and focus ring >= 3:1. No `ownTheme` exemption.
4. **The 8 Fix-table counters** (spec › Current flavour › Fix), each a number that is > 0 on today's build: `topLevelDestinations` (11 today, target 5), `zeroCountChips`, `repeatedDefaultStrings` ("No effort setting for this harness.", "The harness's default" …), `statsPerCard` (every number on every card), `selectionStyles` (distinct styles, target 1), `rawMachineText` (JSON / stack trace / long branch names at body size, unfolded), `decorativeIcons`, `agentColourFills`. Also the other CHECKS metrics: `renderErrors`, `accentButtonsPerView` (max over views), `keyboardPathCoverage`, `accessibleLabelCoverage`, `visibleElements` per page, and P1 feature presence (spec › Features table, one boolean each).
5. **Baseline**: `--baseline write` saves visible-element counts per page to `mods/bot-herdr/engine/ui-audit-baseline.json` with the audited tree hash. Later runs check `visibleElements < baseline`.
6. **Screenshots**: `--shots DIR` uses a temp `HERDR_APP_HOME` and `herdr-app shot` to capture PNGs on 4 key themes (default dark, default light, 2 contrast-edge presets: pick the two with the lowest text/accent contrast and say which). Never touch the live `~/.config/herdr-app` window. If `shot` can't run here, record why in the JSON (`shots: {skipped: reason}`) and the report.
7. **a11y capability report**: inspect `mods/bot-herdr/gpui-kit.d.ts` (and `herdr-app --help`) for `role`, `accessibility_label`, `aria_*`, `announce` / `aria_live`, reduced motion, `MouseButton` back, focusable built-in Tab. Write `.bot-herdr/tasks/t-20261121-td97/reports/a11y-capability.md`: what exists, and the upstream requests for what doesn't.
8. **Exit code**: `--json` prints the full result object (`pass`, `failures: [...]`, audited tree hash). Exit 0 whenever the audit ran (with `pass:false` allowed); non-zero only when the audit itself could not run. Say so in the command's help text. Never make targets looser.

## Tests
`test/ui-audit.test.mjs` (a DONE criterion): spec-tree parsing (fixture spec text), 16-theme contrast compositing (alpha-over-surface math, all 16 presets enumerated), and Fix-table failure detection (fixtures that trigger each of the 8 counters, and clean fixtures that score 0). Fast; no herdr-app binary needed (feed fixture spec text / mock the spawn). Keep `test/render-resilience.test.mjs` passing.

## Rules
- No UI behaviour changes in M1. Don't edit, skip or loosen existing tests.
- Run and paste results: `node mods/bot-herdr/engine/bh.mjs check`, `npm test`, `/home/athi/.local/bin/herdr-app check mods/bot-herdr`, `npx tsc --noEmit -p mods/bot-herdr/jsconfig.json`, `node mods/bot-herdr/engine/bh.mjs ui-audit --json` (the 8 Fix counters and `pass:false`).
- Don't commit; I commit after QA.
- Report to `.bot-herdr/tasks/t-20261121-td97/reports/dev-m1.md` (what you built, files, check results, audit summary, baseline, what couldn't be done and why), then `bh report t-20261121-td97 --step 1 --file <that> "<summary>"`.
