# Dev brief — M3 Quiet pass

Task t-20261121-td97, step 3. Work only in your worktree. Read first:
- `.bot-herdr/tmp/design-language-spec.md`: **Current flavour** (Keep and Fix tables), **Principles** 2, 3, 5, 6, **Foundations** (Type, Space and shape, Icons, Numbers), **Components** (Tabs and selection, Filter bar, Board entry, Machine text, Stat, Settings row), **Building in GPUI**, **Goal prompt › NEVER**.
- `/home/athi/bot-herdr/.bot-herdr/plans/p-20261121-siir/plan.md` step 4.
- Reports: `reports/dev-m1.md` (how the audit counts each Fix row), `dev-m2.md` (tokens), `qa-m2.md`, `dev-tsc.md` if present.
- `mods/bot-herdr/engine/lib/ui-audit-spec.mjs` — the counters you must drive to their targets. Read how each is measured, but never change the audit to pass.

## Goal of M3: zero runtime behaviour change, the UI goes quiet
Drive these audit counters to target on every page, keeping all information reachable (fold it, never delete it):
1. **`accentButtonsPerView <= 1`** (Principle 2): at most one coral primary action per view; the others become secondary/quiet buttons.
2. **`zeroCountChips = 0`** (Principle 3, Filter bar): chips and filters with count 0 are not drawn; counts only when > 0.
3. **`repeatedDefaultStrings = 0`** (Principle 3, Settings row): hide settings a harness can't use (e.g. "No effort setting for this harness." rows vanish); show defaults as an input placeholder, not text ("The harness's default").
4. **`selectionStyles = 1`**: one selection style app-wide. Tabs get accent text + 2 px underline; segmented controls get a grey fill (spec › Components › Tabs and selection). Remove coral outlines, coral-tinted chips and dark pills as selection.
5. **`agentColourFills = 0`** (Principle 5): agent colour only on the avatar and one presence dot. No tinted chips (Knowledge, Plans rail), fills or card washes.
6. **`decorativeIcons = 0`** (Foundations › Icons): no icon in front of card titles or field labels (e.g. the three shield icons on Settings cards). Icons stay only on navigation and icon-only buttons.
7. **`rawMachineText = 0`** (Principle 6, Machine text): JSON contracts on the Board, stack traces in Issues and long branch names/paths render as ONE muted mono line, truncated in the middle, with Expand and Copy. Build one shared `machinetext.js` component and use it everywhere.
8. **`statsPerCard`** to target (Stat component): one hero number + label per card; secondary numbers move to a tooltip or the detail view (Metrics cards: 6 stats + unlabelled bar chart → hero + tooltip/expand).
9. **Numbers** (Foundations › Numbers): compact helpers (`7.2M`, `$0.13`, `23m`), "≈" once in a column header, correct plurals ("1 agent"). One shared helper module.
10. **Type/space/radius call-site migration** to `TYPE_SCALE` / `WEIGHT` / `SPACE_SCALE` / `RADIUS` from M2 wherever you touch a file. Sentence case.
12. **QA M2 nit**: the working seat dot in `work.js seatMark` draws at `opacity(0.45)`, so its glyph contrast falls below 3:1. Fix it in the glyph pass.
11. **`visibleElements < M1 baseline`** on every page (the audit compares against `mods/bot-herdr/engine/ui-audit-baseline.json`; do NOT rewrite the baseline).

`topLevelDestinations` (11 → 5) is M4's, not M3's. Leave navigation alone.

## Rules
- No runtime behaviour change: the same actions, the same data, the same commands. Only presentation changes and information moves behind expand, tooltip or peek.
- Existing tests that pin today's clutter (e.g. `test/contrast.test.mjs` agent-coloured Knowledge chips, layout guards) must be **updated** to the new design, never deleted or skipped. List every test change and why.
- Renders never throw (keep the `render-safe.js` boundary in new components).
- All colour via tokens (no hex outside `look.js`).

## Checks (paste results)
`node_modules/.bin/tsc --noEmit -p mods/bot-herdr/jsconfig.json` (run `npm install` first), `node mods/bot-herdr/engine/bh.mjs check`, `npm test`, `/home/athi/.local/bin/herdr-app check mods/bot-herdr` (delete the generated `mods/bot-herdr/engine/lib/gpui-kit.d.ts`), `node mods/bot-herdr/engine/bh.mjs ui-audit --json --shots .bot-herdr/tasks/t-20261121-td97/shots/m3`: list every counter before and after. All M3 counters at target; the remaining failures are M4+ only (destinations, features, keyboard/label coverage). Look at the M3 shots in all 4 themes against `/home/athi/bot-herdr/.bot-herdr/worktrees/redesign-bot-herdr-ui-to-design-language/.bot-herdr/tasks/t-20261121-td97/shots/m2/`: calmer, same warm character.

Don't commit. Report to `.bot-herdr/tasks/t-20261121-td97/reports/dev-m3.md` (per-counter before/after, per-page what moved where, test changes, check results), then `bh report t-20261121-td97 --step 3 --file <that> "<summary>"`.
