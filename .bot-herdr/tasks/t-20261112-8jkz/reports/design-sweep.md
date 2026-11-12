# design-sweep: one button size (step 7)

## Summary
Every button in my files now uses one helper, `actionButton` (button.js), drawn 28px tall; 43 entries converted, 2 blockers left at 22px and 16px. `actionButton` is in button.js, not look.js (see Pushback).

## Changes
- `button.js` (new): `actionButton(c, id, label, onClick, { icon, tone, disabled, hint, tooltip })`. Built on `clickable` (hover, press, focus), 28px, SIZE.nested radius, TYPE.sm, SPACE[4] padding, SPACE[2] gap, GLYPH.md glyph; `label` null is a square icon button; `disabled` is faint with no click, hover or focus.
- `look.js`: `buttonTone(c, tone)`, the pure colour table per tone (primary, secondary, danger, quiet). Added after `clickable`.
- `chat.js`: Comment, Open in Tasks, Pause/Resume, the `link` helper (5 uses), working "n of N", Jump to latest; sent file chip 28px when clickable.
- `composer.js`: effort chips, Show hidden, browser primary, `iconButton` (3 uses), `remove` (attachments), toast action, space and lead-model triggers (height only), question card `link` (4 uses + the mockup tile), minimise, zoom. Mockup tile fix (see Brief Check).
- `settings.js`: `disclosure` (3 uses), feature `chip`, `iconButton` (unused), `button` (Add harness).
- `viewer.js`: `button` helper (4 uses), find prev/next; "Aa" left as it is (already 28).
- `switch.js`: `segmented` items 28px (track 28, horizontal inset only); `stateView` retry action.
- `noteform.js`: choice chips, Cancel, Add note (disabled while empty; its `add` already did nothing when empty).
- `pick.js`: effort chips, refresh icon.
- `lightbox.js`: `round` (close, prev, next), "Open in browser", "Choose this".
- Unused imports my changes left behind are removed (composer, lightbox).
- Inventory: `reports/buttons.md` (43 entries, blockers, kept rows, before/after counts).

## Brief Check
- actionButton exists with that signature, and the board contract is posted: met, with a change of file. It is in button.js, not look.js. Contract #5 posted with the real path; design-pages told by hc.
- buttons.md lists every button in my files; every converted one is 28px: met for 43 of 43 entries. Not met for 2 sites, listed as blockers: settings.js:753 (22px, inside a 28px field) and settings.js:846 (16px slider labels).
- No TS2304/TS2552 outside engine/ in my files: met. The only TS2304/TS2552 hits are in engine/ (excluded).
- `herdr-app check mods/bot-herdr` passes; `bh check` passes: met.
- Question card fix: met. Under "Couldn't draw it here", the first line of `d.error` shows in TYPE.xs, c.muted, centred, at most two lines (`max_h` = 2 × LINE.xs, overflow hidden), then "Open in browser".
- Not met: visual check in the live app. I did not render the screens, so the look is unverified.

## Verification
- `npx -y -p typescript@5 tsc -p jsconfig.json --noEmit` (mods/bot-herdr) — 0 TS2304/TS2552 in mod files; 5 in engine/ (out of scope). Other TS errors are pre-existing implicit-any noise, not undefined names.
- `herdr-app check mods/bot-herdr` (repo root) — check passed: mods/bot-herdr.
- `node .../engine/bh.mjs check` — PASS: lint and typecheck pass, tests pass (91 pass, 1 skipped: no headless browser here).
- A node import of button.js fails with ERR_MODULE_NOT_FOUND for gpui-kit, as expected: button.js is never imported by a test.
- Unused-import scan on touched files — only pre-existing unused names remain.

## Design choices
- button height: 28px (CONTROL) for every button
- radius: SIZE.nested (8px)
- label: TYPE.sm, line height LINE.sm, weight normal
- padding: SPACE[4] each side; icon-only square 28px
- glyph: GLYPH.md, before the label; gap SPACE[2]
- primary: accent fill, accentInk text, no edge, hover accentFill
- secondary: surface fill, 1px c.edge, hover c.hover
- danger: surface fill, 1px c.edge, c.danger text and glyph, hover c.hover
- quiet: no fill or edge until hover; text c.ink, hover c.hover (the brief didn't name a text colour)
- disabled: opacity 0.5, no click, hover, press or focus (not tab reachable)
- key hint: CHIP height, SPACE[2] side padding, c.kbd fill, c.muted text, TYPE.xs (no caller yet)
- segmented track: CONTROL tall, horizontal inset only; items CONTROL tall
- question mockup error: first line of d.error, TYPE.xs, c.muted, centred, two lines at most

## Knowledge Proposals
- The one button is `actionButton` in button.js; its per-tone colours are `buttonTone` in look.js. look.js stays free of gpui-kit imports because the node tests load it.
- switch.js `segmented` items are 28px, the same as every button.

## Script Proposals
None.

## Blockers
- settings.js:753 `modelField` chevron: 22px inside a 28px field with a 1px border. At 28 it sits on the field's edge. Needs a decision on the field's height or layout.
- settings.js:846 slider stop labels: 16px, the slider's own tick labels, not buttons. At 28 they break the slider.

## Pushback
**Request:** actionButton in look.js.
**Reason:** look.js is imported by four node tests (test/contrast, palette, browse, themes). A gpui-kit import in look.js makes `npm test` fail with ERR_MODULE_NOT_FOUND (checked: importing button.js in node gives that error).
**Alternative (done):** the element builder is in button.js; the tone table `buttonTone` is in look.js, so the colours stay testable. Contract and design-pages message use the real path.

## Follow-up: /bh-info recipient name (from dev-engine, via t3p)
- composer.js `askKnowledge`: the sent message still goes to "knowledge-scout" until `bh knowledge ask --data … --json` returns; then its `name` (the project's Scout) replaces that label. On a failed call the label stays "knowledge-scout" and the error toast shows as before. If the reply has no name, it stays "knowledge-scout".
- composer.js `askedName(stdout)`: parses the `name` from the JSON reply (null on bad JSON).
- chat.js `sent()` now returns the message's feed id; new `relabel(id, from, name, cx)` maps that message's recipient, and the composer reaches it through a new `relabel` hook (wired in the Chat constructor).
- Checks after this change: `bh check` PASS (lint, typecheck, tests); `herdr-app check mods/bot-herdr` passed; tsc has no TS2304/TS2552 in composer.js or chat.js.
- Not run in the live app: the relabel after a real `/bh-info` call is unverified on screen.

## Notes
- composer `iconButton` used to draw its icon muted when `on` was false (browser "up" when it has no parent); the quiet tone is c.ink, so that state is gone. Same size.
- Composer send and stop keys are 28px round and drawn in layers; kept.
- work.js `segmented` calls (476, 509) pick up the 28px items with no change; the archive button and other work.js buttons are design-pages' to convert.
