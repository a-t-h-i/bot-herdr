## Summary
Non-own herdr themes now get quiet edges (~1.4:1 on the fill), controls at 3:1+, and pips() uses alpha().
Settings shows a multi-line "Instructions" field per agent, saved through the same `change()` path as the other fields.

## Changes
- mods/bot-herdr/look.js: added exported `contrastOf(a, b)` (wraps the existing private luminance/contrast), plus private `reach()` and `line()`. In palette() for themes that aren't ours: `edge = line(fill, border, ink)` (keeps the theme border when it's already 1.3–1.6:1; otherwise a mix at about 1.4:1, toward the border when it's stronger and toward the ink when it's fainter). `edgeDark` = the border if it already has 3:1, else the first fill→ink mix with 3:1. `bubbleEdge = line(bubble, border, ink)`. Own themes still return LIGHT/DARK early, so they're unchanged.
- mods/bot-herdr/work.js: pips() uses `alpha(c.accent, 0.5)`. This needed one new import line: `import { alpha } from "./working.js"`.
- mods/bot-herdr/settings.js: FIELDS gains `{ key: "instructions", placeholder: "What this agent should always do, in plain words", rows: 3 }`. Fields with `rows` get a TextareaState. A new `textarea()` frame matches `field()` (same radius, ground, edge). "Instructions" sits under "Extra arguments". The args placeholder is now "Flags only, e.g. --verbose".
- test/palette.test.mjs (new): contrast tests for win98 (light) and graphite (dark).

## Brief Check
- palette edge ≈1.3–1.6:1 for non-own themes — met — tests pass (win98 1.41, graphite 1.48)
- edgeDark ≥3:1 — met — win98 3.09, graphite 3.08
- bubbleEdge muted the same way — met — win98 1.41, graphite 1.46
- hover/well/kbd checked — met, nothing changed — none is strong: win98 hover 1.00, well 1.82 (white input on grey, the win98 look), kbd 1.19; graphite 1.08 / 1.06 / 1.17
- own-theme test unchanged and passing — met — test/themes.test.mjs not touched
- pips() uses alpha() — met
- Instructions field (label, placeholder, `instructions` key, same save path) — met — settings.js FIELDS + render
- Extra arguments placeholder — met
- npm test passes — met — 80 tests, 79 pass, 1 skipped (headless browser), 0 fail

## Theme fixtures (edge / fill contrast, before → after)
| theme | source | edge | edgeDark | bubbleEdge |
|---|---|---|---|---|
| win98 (light) | ~/.config/herdr-app/themes/win98.json | #808080 2.96 → #bdbdbd 1.41 | #696969 4.12 → #7d7d7d 3.09 | #a1a1a1 1.23 → #969696 1.41 |
| graphite (dark) | the existing fixture in test/themes.test.mjs | #3a3c42 1.25 → #45474a 1.48 | #303136 1.06 → #767779 3.08 | #515459 1.55 → #4e5056 1.46 |
The colours of herdr's built-in presets (graphite, ink, moss, paper) aren't on disk, because they're compiled into herdr. So graphite comes from the existing test fixture, and there's no paper fixture. atom-one-dark.json has only ansi colours, no `colors`.

## Verification
- npm test — 80 tests, 79 pass, 0 fail, 1 skipped. The first run had one engine.test.mjs failure while Dev was editing; it passed on the rerun.
- bh check — PASS (lint, typecheck, tests)

## Knowledge Proposals
- herdr's built-in theme colours (graphite/ink/moss/paper) aren't in ~/.config/herdr-app/themes; only user theme files live there.
- herdr's theme `input` colour is documented as "a stronger border", but palette() uses it as the well fill. Worth a look someday.
- edgeDark is defined in look.js but no view uses it right now.
