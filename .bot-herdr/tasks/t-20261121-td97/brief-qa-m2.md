# QA brief — M2 gate (tokens and state language)

Task t-20261121-td97, step 2. You did not build this; judge it independently. Read:
- `.bot-herdr/tmp/design-language-spec.md`: **Foundations** (all), **Current flavour › Keep**, **Building in GPUI**, **Goal prompt** (CHECKS, NEVER: no runtime behaviour change before M4, no loosened checks/tests).
- `.bot-herdr/tasks/t-20261121-td97/reports/dev-m2.md`.
- Diff: `git diff 0f5bc4c..HEAD -- . ':!.bot-herdr'` (0f5bc4c = M1 on main).
- Screenshots, gitignored, absolute paths: M1 `/home/athi/bot-herdr/.bot-herdr/worktrees/redesign-bot-herdr-ui-to-design-language/.bot-herdr/tasks/t-20261121-td97/shots/m1/`, M2 `…/shots/m2/` (11 pages × graphite/paper/ink/moss). Compare before and after across all 4 themes.

## M2 passes only if
1. `look.js` exports the full semantic map: `surface0/1/2`, `textPrimary/Secondary/Muted`, `accent` (AA-repaired coral `#e1987e` dark / `#a25338` light), `controlBorder`, the 7 `state*` (glyph + colour + word, per spec › State language), `agentHues` (7 agents), the 4-size `12/13/15/20` and 2-weight `400/600` type scale, the 4 px grid, and 8/12 radii. Every one of the 16 presets gets them.
2. Zero hex literals outside `look.js` (audit `hexOutsideTokens = 0`, and grep it yourself).
3. Contrast: text >= 4.5:1; glyphs, input borders and focus ring >= 3:1, alpha-composited, across all 16 themes; `test/contrast.test.mjs` has no `ownTheme` exemption. Check the test changes (`contrast`, `ui-audit`, `themes`, `goal-ui`) tighten or legitimately track the change and loosen nothing.
4. The warm look and Keep traits carry over (warm charcoal, one coral accent, agent colour + letter). Visual changes are only the ones dev-m2 lists (stop-square ink, paused muted, working dot accent, ✗→✕); judge whether each matches the spec.
5. No runtime behaviour changed.
6. Run the checks yourself: `node mods/bot-herdr/engine/bh.mjs check`, `npm test`, `/home/athi/.local/bin/herdr-app check mods/bot-herdr` (delete the generated `mods/bot-herdr/engine/lib/gpui-kit.d.ts` afterwards), `node mods/bot-herdr/engine/bh.mjs ui-audit --json` (exit 0; the remaining failures should be M3+ items). tsc is a separate cleanup running in parallel; note its count but don't gate M2 on it.

Score M2 1–5 on: token map completeness, contrast correctness, Keep traits preserved, state language consistency, no-behaviour-change and tests. PASS needs every score >= 4. Give a reason for every score under 4, and exact `file:line` fixes for CHANGES_REQUIRED.

Write `.bot-herdr/tasks/t-20261121-td97/reports/qa-m2.md`. Don't use `bh gate` (it takes a PASS only at the end of the Goal). Record with `bh report t-20261121-td97 --step 2 --file <that> "QA M2 verdict: PASS|CHANGES_REQUIRED — <summary>"`. Don't edit code.
