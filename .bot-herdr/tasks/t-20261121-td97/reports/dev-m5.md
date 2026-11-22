# M5 — Interaction, motion, accessibility, keyboard map (dev-m5)

## Summary

Animation cycles are the spec's six (working.js), with their spec verbs; reduced motion was already wired (toggle in Settings › General, frames freeze via `framed()`); needs-you now pulses on the glyph (threads.js, home.js) and the Home-tab badge (switch.js), and a toast fires on blocked when the window is unfocused (chat.js); the keyboard map is the pure `keymap.js` table, `?` draws the card in main.js, `Ctrl+.` pauses/resumes the current goal in switch.js; the audit detects the animation rules; new tests cover the animation table, the keymap table and the audit counters.

## Changes

| File | What changed |
| --- | --- |
| `mods/bot-herdr/working.js` | `ACTIVITIES` verbs → the spec table: thinking Thinking/Weighing/Mulling, reading Reading/Scanning, editing Writing/Shaping, testing Testing/Checking, waiting Waiting(on X), orchestrating Coordinating. Frames were already the spec's six cycles (`framed()` ticks at TICK_MS = 120). |
| `mods/bot-herdr/indicators.js` | M5's activity system added: `GLYPH_SLOT`, `VERB_SLOT`, `activityMark` (glyph in a fixed-width slot + verb), `agentStateMark` (working → activity cycle; otherwise the state glyph + word), `verbFor`, `framesFor`, `longestVerb`, `waitingOn`, `breatheFor` — the avatar breath 0.7–1.0, `looping` under Reduce motion. |
| `mods/bot-herdr/look.js` | MOTION tokens (hover/press/panel/appear/fold/turn/verb/highlight), `TIMING` (100/150/250), `TICK_MS` 120, `looping`, `framed`, `spinning`, `MOTION`, `timed` — the design-language timings and motion plumbing. |
| `mods/bot-herdr/working.js` (+ the above) | `verbFor` constant inside one `VERB_MS` (4000) window; `framesFor(activity, reduced)` freezes on the first glyph. |
| `mods/bot-herdr/keymap.js` (new, pure) | `KEYMAP` — global (Ctrl+Shift+P, Ctrl+1..5, Ctrl+., ?), home (J/K/Home/End, Space, Enter), threads (J/K/Home/End, Space, Enter, Esc, 1–9, Ctrl+Enter), agents (J/K/Space/Enter); `collisions()`, `contexts()`, `overlayRows()`; `KEYMAP_OPEN`. |
| `mods/bot-herdr/main.js` | The `?` overlay: while `KEYMAP_OPEN`, `keymapOverlayCard(c, node)` draws the map card (role dialog, accessibility_label, tab stop) over the active page. |
| `mods/bot-herdr/switch.js` | Global commands: `map` → `setShared(KEYMAP_OPEN, true)`; `goal` → `Switch.goal(cx)` (Ctrl+.: pause/resume the in-flight goal via `bh home` + `bh goal pause|resume`); herdr `tab.select:N` (Ctrl+1..5) → the five destinations; the Home-tab badge pulses while needs-you exists. |
| `keys.json` | Added `"ctrl-.": "goal"`, `"?": "map"`. |
| `mods/bot-herdr/peek.js` | The peek drawer gets `tab_index(0)` — it is a dialog that takes keys; now the keyboard counter is 100% on every page. |
| `mods/bot-herdr/threads.js` | The needs-you glyph in `threadRow` pulses (`looping` opacity 0.35→1, 1400 ms) only while `state === "needsYou"`. |
| `mods/bot-herdr/home.js` | The needs-you glyph in `needRow` pulses the same way. |
| `mods/bot-herdr/switch.js` | The Home-tab badge pulses when it has a count. |
| `mods/bot-herdr/chat.js` | A "blocked" wait adds the note and, when `herdrWindow().active === false`, a warning toast via `composer.say`. |
| `mods/bot-herdr/engine/lib/ui-audit-spec.mjs` | `animationCounters(spec)` — the animation rules from the printed spec: `workingCycles` (`-glyph` nodes), `glyphSlots` (the fixed-width slot), `ticks120` (frames attr at the one 120 ms tick), `frozenGlyphs` (a cycle frozen on its first glyph: text child, no frames attr); `animationTotals(pages)`; `structuralCounters` returns `animation`. |
| `mods/bot-herdr/engine/lib/ui-audit.mjs` | `result.animation` and a "Animation (the activity glyphs):" section in the text report. |
| `test/working.test.mjs` (new) | Frames per spec, verbs per spec, the verb constant inside one VERB_MS window and turning at the edge, reduced freeze. |
| `test/keymap.test.mjs` (new) | The map names the spec's global keys and every key of every page that takes keys; no collisions; hostile input: junk maps answer, never throw. |
| `test/ui-audit.test.mjs` | New test: the animation counters read the printed spec (cycles, slots, ticks120, frozen). |
| `test/render-resilience.test.mjs` | New probes fuzzing the keymap pure table (collisions/contexts/overlayRows/row) on the corrupt values; new static test: the keymap overlay draws through the dispatcher from the pure table. |
| `.bot-herdr/tasks/t-20261121-td97/plan-dev-m5.md` (new) | M5 plan + notes (coverage before: keyboardPath 0.91, labels 0.88). |

## Brief Check

1. Six working animation cycles per the spec table — met: `ACTIVITIES` frames/verbs are the spec's (⠁⠂⠄⡀⢀⠠⠐⠈; ▖▘▝▗; ▁▃▅▇▅▃; ▱▱▱ ▰▱▱ ▰▰▱ ▰▰▰; · • ● •; ◜◝◞◟). Audit: `workingCycles 2, glyphSlots 2, ticks120 2`.
2. Reduced motion — met (existed; wired through `framed()`/`looping()`; toggle in Settings › General + `settings().reduced_motion` via `setMotionSource` in main.js).
3. Micro-interactions — verified existing: hover/press (`clickable`), optimistic send (`Chat.sent`), question-card check + fold (`peek.js`), copy "Copied" (`scripts.js`), undo/confirm patterns (`work.js`). Added: needs-you glyph pulses (threads.js, home.js), Home-tab badge pulse (switch.js), toast when the window is unfocused (chat.js `herdrWindow().active === false`).
4. Accessibility — met: audit `keyboardPathCoverage 1`, `accessibleLabelCoverage 1` (before: 0.91/0.88; peek fixed from 0.9 → 1 with the drawer's `tab_index(0)`).
5. Keyboard map — met: global Ctrl+Shift+P (herdr's app.palette), Ctrl+1..5 (herdr `tab.select:N` → the five destinations; switch.js handles them), Ctrl+. (switch.js `goal` → `bh goal pause|resume` of the in-flight goal), `?` shows the map (switch `map` command → main.js `keymapOverlayCard`); view-local J/K/Home/End, Space, Enter, Esc, 1–9, Ctrl+Enter in the map rows.
6. Audit — met: `animationCounters` + `animationTotals` added to `structuralCounters`/`ui-audit` result/text report (workingCycles, glyphSlots, ticks120, frozenGlyphs). Counters never loosened; existing coverage counters unchanged in meaning.
7. Tests — met: new `working` and `keymap` tests; extended `ui-audit` and `render-resilience`; `npm test` 666 total (665 pass, 0 fail, 1 skipped as before); no test writes into the repo tree (no stray `data/bot-herdr/logs/ui.jsonl`).
8. Checks — met: `bh check` PASS; `tsc --noEmit -p mods/bot-herdr/jsconfig.json` exit 0; `herdr-app check mods/bot-herdr` passed (generated `gpui-kit.d.ts` restored; the untracked generated copy in `engine/lib/` left as found); `ui-audit` exit 0, counters above; shots: 104 PNGs in `.bot-herdr/tasks/t-20261121-td97/shots/m5`.

Note on `pass: false` in the audit JSON: the findings are pre-existing M5-era debt, not from this change — `visibleElements: settings-general` (122 vs the M1 baseline of 110) and the three P1 features `approvalCard`, `diffReview`, `viewModes` (all P1-of-M6). No new failures vs M4b (M4b: same settings-general state, same three features missing).

## Verification

- `node_modules/.bin/tsc --noEmit -p mods/bot-herdr/jsconfig.json` — exit 0
- `node mods/bot-herdr/engine/bh.mjs check` — PASS: 665 tests pass, 1 skipped, typecheck passes
- `npm test` — 666 tests, 665 pass, 1 skipped, 0 fail
- `/home/athi/.local/bin/herdr-app check mods/bot-herdr` — check passed
- `node mods/bot-herdr/engine/bh.mjs ui-audit --json --shots .bot-herdr/tasks/t-20261121-td97/shots/m5` — exit 0; keyboardPathCoverage 1; accessibleLabelCoverage 1; animation { workingCycles: 2, glyphSlots: 2, ticks120: 2, frozenGlyphs: 0 }; hexOutsideTokens 0; topLevelDestinations 5; accentButtonsPerView 1; renderErrors 0
- `node --test test/working.test.mjs test/keymap.test.mjs test/ui-audit.test.mjs test/render-resilience.test.mjs` — 27 pass, 0 fail

## Knowledge Proposals

- The spec's six activity cycles are already drawn in `working.js` (`ACTIVITIES`); the spec's verb table (Thinking/Weighing/Mulling, Reading/Scanning, Writing/Shaping, Testing/Checking, Waiting on X, Coordinating) is what `ACTIVITIES` now carries; `activityOf`'s classification already matched the activity names.
- The audit's `frames` prints as `:frames[Number(120.0), Str("⠁"), ...]` — a prop, not a style (`prop()` finds it; `style()` does not). The `w` slot style is a number. Reduced freeze is a glyph node with a text child and no frames attr.
- `herdr` key names: herdr's own `tab.select:N` on ctrl-1..5; our keys.json can add `"ctrl-."` and `"?"` (both free in the installed keys.json).
- `herdr.window()?.active` is the unfocused signal for the needs-you toast.
- The keyboard map overlay card draws from `main.js` while `KEYMAP_OPEN` is set; it is click-to-close and role dialog.

## Script Proposals

- None needed.

## Blockers

- None. The pre-existing M4-era audit findings (settings-general baseline, M6 features approvalCard/diffReview/viewModes) remain — QA is reviewing M4 in parallel; those are M6, not this milestone.
