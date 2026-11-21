# M1 — `bh ui-audit` (dev-m1)

## Summary

Replaced the `ui-audit` placeholder with a real design-language audit: it renders 11 audit pages
headless, parses the printed spec tree, counts all 8 Fix-table rows plus the other CHECKS metrics,
scans the mod for hex literals, checks contrast in all 16 theme presets, records the visible-element
baseline, and reports gpui-kit's a11y capability. On today's build it fails every Fix-table row.

## Changes

- `mods/bot-herdr/engine/lib/ui-audit.mjs` — the command: temp app home + wrapper per page,
  `herdr-app check --print-spec`, spec parsing, static hex scan, contrast, baseline, shots, a11y
  report, JSON/text output and exit policy (0 when the audit ran, 1 when it could not).
- `mods/bot-herdr/engine/lib/ui-audit-spec.mjs` (new) — the pure half: printed-spec parser,
  Fix-table counters, structural coverage, 16-preset contrast with alpha compositing, a11y scan.
- `mods/bot-herdr/engine/lib/ui-audit-fixtures.mjs` (new) — deterministic fixtures for the 11
  audit pages (tasks, tasks-board, plans, issues, knowledge, learning, metrics, settings,
  settings-general, chat, switch) and the generated wrapper module.
- `mods/bot-herdr/engine/ui-audit-baseline.json` (new) — visible-element baseline per page with the
  audited tree hash (`9acae3aa8b7f…` at write time; the baseline file itself is excluded from the hash).
- `mods/bot-herdr/engine/bh.mjs` — the help entry lists the flags and says exit 0 = the audit ran.
- `test/ui-audit.test.mjs` (new) — 7 tests: spec parsing (including a `TextView` markdown body and
  engine-noise rejection), 16-theme enumeration and compositing math, no `ownTheme` exemption, all
  8 Fix counters firing on clutter and zero on a quiet page, selection idioms, coverage counters.
- `test/pre-m1-foundation.test.mjs` — `ui-audit` removed from the placeholder loop (it is real now);
  `home`/`thread`/`approvals`/`review`/`goal progress` still assert placeholder behaviour.
- `.bot-herdr/tasks/t-20261121-td97/reports/a11y-capability.md` (new, `--a11y` output) — gpui-kit
  exposes role/label/aria_selected/aria_level/aria_active_descendant/set_position/tab_index/
  track_focus; it exposes no live region, no OS reduced-motion and no mouse back button.

## Brief Check

Build items from the brief (the brief has no separate "Done when" list):

1. **Pages via `herdr-app check --print-spec`** — met. Confirmed what `--print-spec` prints: a
   two-space-indented element tree (`div :id[Str(…)] .bg[Str(…)] :on_click(fn)`, `text "…"`,
   `TextView markdown "id" "body"`), with MESA/WARN noise around it. A temp app per run with a
   wrapper module per page; 11 pages render; a page that fails is recorded under `renderErrors`
   (none today).
2. **Static hex scan** — met: `tokens.hexOutsideTokens = 14` with `file:line` (`composer.js:64,1881`,
   `indicators.js:24`, `pick.js:47`, `route.js:8…16`), excluding `engine/` and `look.js`.
3. **16-theme contrast, alpha composited, no `ownTheme` exemption** — met: 16 presets enumerated
   (`PRESET_NAMES`), each palette's `#rrggbbaa` tokens composited before measuring; 14/16 clean;
   both `bot-herdr-*` themes fail `controlBorder` (light 1.51, dark 1.28) rather than being exempted.
4. **8 Fix-table counters + other CHECKS metrics** — met, all eight above target on today's build:
   `topLevelDestinations 11` (target 5), `zeroCountChips 9`, `repeatedDefaultStrings 5`,
   `statsPerCard 8`, `selectionStyles 2`, `rawMachineText 4` (contract JSON, issue stack trace,
   branch name), `decorativeIcons 3`, `agentColourFills 13`. `renderErrors {}`,
   `accentButtonsPerView 4`, `keyboardPathCoverage 0.92`, `accessibleLabelCoverage 0.85`,
   `visibleElements` per page, and `features` (1/8 P1 present: the existing goal strip).
5. **Baseline** — met: `--baseline write` writes `mods/bot-herdr/engine/ui-audit-baseline.json`
   with the tree hash; later runs report `visibleElements` findings for pages not under it.
6. **Screenshots** — attempted and recorded as skipped: `herdr-app shot` needs a running window in
   that `HERDR_APP_HOME` (`no Herdr window at …/herdr-app.sock`); opening a GUI window is outside
   this headless run, so `shots: {skipped}` and the report say why. `--shots DIR` still captures
   four key themes when a window exists.
7. **a11y capability report** — met (path above).
8. **Exit code and help** — met: `ui-audit --json` exits 0 with `pass:false` when checks fail;
   it exits 1 with a plain message when the audit cannot run (verified from an empty folder).

## Verification

- `/home/athi/.local/bin/herdr-app check mods/bot-herdr` — `check passed`, exit 0
- `npm test` — 603 pass, 0 fail, 1 skipped (604 tests), exit 0
- `node mods/bot-herdr/engine/bh.mjs check` — PASS: 603 tests pass, 1 skipped, exit 0
- `node --test test/ui-audit.test.mjs` — 7 pass, exit 0
- `node mods/bot-herdr/engine/bh.mjs ui-audit --json` — exit 0, `pass:false`, 35 findings;
  8/8 Fix rows above target; 14 hex literals; 14/16 themes clean; `renderErrors: {}`
- `node mods/bot-herdr/engine/bh.mjs ui-audit --baseline write` — baseline written; a later run
  reports 11 `visibleElements` findings (equal, not under, expected until M3)
- `npx tsc --noEmit -p mods/bot-herdr/jsconfig.json` — exit 2, 6957 findings. This is the
  pre-existing state of the repo's gpui jsconfig: it has no Node types and includes `engine/`, so
  every engine module reports missing `node:*` types and implicit-any callbacks (`bh.mjs` alone has
  570). The new engine modules add the same class of findings; **no UI file was changed**, so no
  gpui type errors were added. The M2 plan's tsc work is still needed.
- `node mods/bot-herdr/engine/bh.mjs ui-audit --json` from an empty folder — exit 1, plain message.

## Notes

- **Seeded first-frame state.** `herdr-app check` prints only the first frame; the views' `bh`
  reads are async, so a real project would render "Loading tasks…" and every data-driven counter
  would be 0. The wrapper therefore seeds each view's own state (after `init`, before the first
  render) with fixtures shaped exactly like the `bh … --json` answers. The temp project and
  `HERDR_APP_HOME` are still isolated; every check runs in its own temp home and no live app home
  or window is touched.
- **Render theme.** `herdr-app check` always renders the default (graphite) preset; writing
  `settings.json`/layout theme does not change it (verified). So page structure and counters come
  from graphite and per-theme checks are the contrast math across all 16 presets; `--theme T`
  restricts the contrast pass, and screenshots carry the four key themes.
- **Key themes for shots.** default dark (`graphite`), default light (`paper`), plus the two
  contrast-edge presets with the lowest text/accent ratios (today `ink` and `moss`); recorded in
  `shots.themes`.
- `herdr-app check mods/bot-herdr` writes a generated `mods/bot-herdr/engine/lib/gpui-kit.d.ts` (the
  same declarations as `mods/bot-herdr/gpui-kit.d.ts`). It is deleted here and must not be committed.
- Audit pages are `chat`, `tasks`, `tasks-board`, `plans`, `issues`, `knowledge`, `learning`,
  `metrics`, `settings`, `settings-general`, `switch`; `terminals` is herdr's native block, not a
  mod view, so it has no spec to audit.

## Knowledge Proposals

- `herdr-app check --print-spec` prints only the first frame: async `exec`/`readTextFile` loads in
  `init` show their loading state, never the loaded data.
- A checked app cannot import a module outside its own directory ("resolves outside the application
  directory"); copy the mod into the temp app root and import it relatively.
- `herdr-app check` renders the default `graphite` preset regardless of `settings.json`/layout theme.
- `herdr-app shot` needs a window already running under that `HERDR_APP_HOME`; it prints
  `no Herdr window at <home>/herdr-app.sock` otherwise.
- `herdr-app check mods/bot-herdr` writes a generated `mods/bot-herdr/engine/lib/gpui-kit.d.ts`
  (identical to the mod's own); delete it rather than committing it.

## Script Proposals

None: `bh ui-audit` is the reusable entry point; the audit's fixtures and counters live in the mod.

## Blockers

None. `--shots` needs a running window in a temp app home, which this headless run does not open;
the JSON and this report record it, and the flag works when such a window exists.
