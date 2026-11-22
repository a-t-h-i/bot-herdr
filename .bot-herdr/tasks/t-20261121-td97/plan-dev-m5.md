# M5 — Interaction, motion, accessibility, keyboard map

## Files

| File | Change |
| --- | --- |
| `mods/bot-herdr/working.js` | ACTIVITIES verbs → spec table (thinking Thinking/Weighing/Mulling; reading Reading/Scanning; editing Writing/Shaping; testing Testing/Checking; waiting Waiting(on X); orchestrating Coordinating); frames already match spec. |
| `mods/bot-herdr/keymap.js` (new) | Pure: KEYMAP table (global + per-page), `collisions()`, `pagesWith(keymap)`? — keep minimal: table + collisions + formatKey. |
| `mods/bot-herdr/switch.js` | `Switch.init`: nextCommand loop accepts global keys (ctrl+1..5 → showPage, ctrl-shift-p palette, ctrl-. goal pause/resume via bh home, `?` opens keymap overlay). Draw the keymap overlay when open (Threads page? or switch view). |
| `mods/bot-herdr/threads.js` or `switch.js` | `?` overlay draw (keymap.js KeymapOverlay). |
| `mods/bot-herdr/engine/lib/ui-audit-spec.mjs` | Add animation counters: workingCycles (`-glyph` nodes), glyphSlots (width-style), ticks (frames ms 120), reducedGlyphs (frozen first frame). |
| `mods/bot-herdr/engine/lib/ui-audit.mjs` | Emit animation counters in result JSON. |
| `test/working.test.mjs` (new) | Frames per spec, verb rotation (≤4s), reduced freeze, GLYPH_SLOT. |
| `test/keymap.test.mjs` (new) | KEYMAP table, no collisions, global keys distinct; focus/label coverage of each page's spec rows (static: every KEYMAP page has a focusable row in the page model? keep simple: table validity + no collisions). |
| `test/ui-audit.test.mjs` | Animation counters on parsed spec trees (new pure tests over parseSpec + activityMark output? — the spec-parsed counters tested via parseSpec of printed frames? keep light: ui-audit.test additions where existing structural tests live). |
| `test/render-resilience.test.mjs` | Extend with new components (keymap overlay model fuzz, if drawn through safeRender). |

## Order

1. `working.js` verbs (spec table).
2. `keymap.js` + switch wiring (commands + `?` overlay).
3. Audit animation detection + counters.
4. Tests (working, keymap, ui-audit additions, render-resilience).
5. Checks: tsc, bh check, npm test, herdr-app check, ui-audit --json --shots (coverage 100%).
6. Report dev-m5.md + bh report --step 5 + hc send t9r.

## Micro-interactions (verify vs spec table)

- Hover/press: clickable/pressable (exists). Finish highlight: MOTION.highlight (exists, user = ?). Needs-you pulse on Home tab badge: exists? Toast when unfocused: ? Optimistic send: ?

## Notes

- Coverage before: keyboardPathCoverage 0.91, accessibleLabelCoverage 0.88 (M4b, M5 target 1.0).
- Audit counters to 100%: fix any interactive elements missing track_focus/on_key_down/role/accessibility_label in rendered specs.
