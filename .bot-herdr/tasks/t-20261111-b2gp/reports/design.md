# design — step 9: the visual refresh (t-20261111-b2gp)

## Summary
Every page now draws from one set of tokens: five type sizes, four space steps plus the page step, three radii (plus pips and full), four heights, one motion table and one set of hover/press/focus helpers applied to all 57 click targets. The three segmented controls became one shared component, all five pages share one empty/loading/error panel, replies and plan lines are capped near 75 characters, the nested reply/tasks scrolls are gone, and new messages and opened lists animate.

## Changes
- `mods/bot-herdr/look.js`
  - New tokens: `TYPE { xs 10.5, sm 12, md 13.5, lg 16, xl 18 }`, `LINE { 14, 16, 20, 22, 24 }`, `SPACE { 1:2, 2:4, 3:8, 4:12, 5:16 }`, `ROW 28`, `CONTROL 28`, `CHIP 22`, `TARGET 28`, `PIP 3`, `DOT 6`, `MARK 14`, `HAIR 1`, `GLYPH { xs 10, sm 12, md 14, lg 16 }`.
  - `MOTION` gains `hover 120`, `press 90`, `pane 190`, `arrive 240`, `stagger 22`, `turn 260`, `verb 420`; `menuHeight` merged into `pane`, `rowStagger` merged into `stagger`. `SIZE.line` is now `LINE.md`; `SIZE.row/chip/iconButton` replaced by `ROW/CHIP/TARGET`.
  - Interaction helpers: `hoverable(el, c)` (pointer cursor + hover background), `pressable(el)` (relative, `transition("top", MOTION.press)`, 1px sink on `.active`), `focusable(el, id, c)` (`id`, `tab_index(0)`, 2px accent border on `.focus`), and `clickable(el, c, id)` composing all three.
  - Alpha compositing (QA finding): `opaque(color, under)` blends an 8-digit `#rrggbbaa` token onto the surface under it. `palette()` now composites before use — ground over `background`, fill/border/kbd/hover over ground/fill, `selected` (our bubble) over ground, text tokens over fill, and `solid_foreground`/`accent_foreground` over the accent — so every returned token is an opaque `#rrggbb` and the contrast read is the contrast drawn. Graphite's `edge`/`edgeDark` now measure 1.35/3.04 rather than being computed from an opaque white border (previously 12:1 on paper).
- `mods/bot-herdr/switch.js`: carries the shared `segmented(c, { id, items, onPick, grow })` (supports `count` and `grow`) and `stateView(c, { id, title, line, action, loading })` (TYPE.lg title, TYPE.md muted line, max 460, optional action, quiet pulse while loading). The page switch is now that component; the top bar's strip keeps herdr's `t.chrome`/`t.border` so it still blends with herdr's own tab bar, while the control itself is `palette()`.
- `mods/bot-herdr/work.js`: every page loads/empties/errors through `stateView` (Knowledge shows a loading panel while `knowAll == null`); the Tasks tabs and task filter use the shared `segmented`; the private `segmented` copy is deleted; the plan rail's seat hues now come from `agentHue`/`agentInk`; plan lines are capped at 600px; task rows, steps, plan list rows, plan lines, rail seats/controls, knowledge chips/cards and their edit/delete buttons are `clickable`/`focusable`; rows and cards fade in staggered when the page or tab opens (`rowsIn`, 22ms per row, capped at 8); the second seat-colour table is gone; the tinted cards lost `shadow_sm` (cards are border-only now).
- `mods/bot-herdr/chat.js`: replies and the page's empty state go through `stateView`; the reply body's `max_h(460)`/`overflow_y_scroll` is removed and it is capped at 600px; the tasks widget's own scroll (`overflow_y_scroll` plus its wheel trap) is removed; the bubble is capped at `min(600, 82%)`; new entries arrive with `MOTION.arrive` (opacity 0→1 and a 6px rise, one frame later; the first draw of a page does not animate); every click target (comment link, fold link, file chips, picture, task rows/links, working counter, jump pill) goes through the helpers; tokens throughout.
- `mods/bot-herdr/composer.js`: all text, space, height, radius, icon and duration literals replaced by tokens; the kbd caps, tools row, space chip, panes, question head, option rows, mockup tiles, suggest rows and menu items are tokenised; all 18 click sites use `clickable`, or `focusable(pressable(...))` where the hover is bespoke (send, stop, multi-select answer); pane motion uses `MOTION.pane`.
- `mods/bot-herdr/settings.js`: tokens throughout; shared `stateView` for the two loading cards; `select`, `modelField`'s arrow, the classifier model field, the effort slider, toggles, chips, icon buttons and the primary button gained tab focus and press states; the 26px icon button is now `CONTROL` (28); `field()`'s unused `bold` option removed.
- `mods/bot-herdr/toast.js`, `pick.js`, `lightbox.js`, `viewer.js`: tokens; click targets through the helpers; the lightbox's `${tone}24`/`${tone}61` hex-suffix alpha replaced with `alpha(tone, 0.14/0.38)`; bar heights `ROW * 2`.
- `mods/bot-herdr/working.js`: unchanged (data and motions only, no drawing).

## Brief Check
- No numeric literal in `text_size(`, `rounded(`, transition durations, and every `gap/px/py/h` a token — met — greps over the ten view files return nothing. Exceptions (deliberate): content width caps `max_w(120/140/180/220/320/360/600)`, the plan rail's dynamic `w(w)`, measured heights (`h(paneH)`, `h(shownH − …)`, `h(slot)`), the slider knob's `border(2)` and dynamic `size(KNOB)`, and `0` in `min_w(0)/min_h(0)/top(0)`.
- Distinct text sizes 5 — met — `TYPE.xs/sm/md/lg/xl` only.
- Distinct radii 3 plus PIP and full — met — `SIZE.radius`, `SIZE.control`, `SIZE.nested`, `PIP`, `rounded_full()` (`.rounded_t(SIZE.radius)` reuses the 12).
- Every `on_click` element has hover, press and focus — met — 57 `on_click` sites remain (58 before; the two segment copies in switch.js and work.js collapsed into one shared component). 47 are built by `clickable(...)`, the remaining 14 by `focusable(pressable(...))` where the hover is bespoke; before: 0 `.active()`, 0 `.focus()`, 0 `tab_index`.
- `node --test test/palette.test.mjs test/themes.test.mjs` — met — 4/4 pass.
- `npx tsc -p mods/bot-herdr/jsconfig.json` — not met — no TypeScript is installed in this repo or app (`npx` offers to download it; no new dependencies allowed). `node --check` on every changed file and `bh check` (which reports "lint and typecheck pass") are the available checks.
- `bh check` — met — PASS (64 tests: 63 pass, 1 skipped for no headless browser).
- Report per file, counts and gaps — met — this section; counts: text sizes 14 → 5; radii 10 → 3 + PIP + full; gaps 13 → 4 values (2/4/8/12); px 12 → 4 values (4/8/12/16); py 10 → 3 values (2/8/16); h 26 → named tokens; transition durations 10 → `MOTION` (hover/press/pane/arrive/row/turn/verb/menuWidth/menuClose/tool); pressed states 0 → every target; focus states 0 → every target.

## Verification
- `node --check` on look, theme, chat, composer, switch, work, settings, toast, lightbox, pick, viewer — OK.
- `node --test test/contrast.test.mjs test/palette.test.mjs test/themes.test.mjs` — 14 tests, 14 pass.
- Every preset in `test/fixtures/herdr-themes.json` plus our pair returns only opaque `#rrggbb` tokens; graphite edge 1.35 / edgeDark 3.04, ink 1.34 / 3.08, moss 1.34 / 3.01, paper 1.44 / 3.07, atom-one-dark 1.43 / 3.11, win98 1.41 / 3.09, our own pair unchanged (1.49/1.28 and 1.32/1.51, decorative).
- `node .bot-herdr/tmp/palette-audit.mjs` — exit 0, `ALL PAIRS PASS` (no colour pair changed by this step).
- `bh check` — PASS (all tests including the contrast suite), exit 0.

## Notes / non-goals
- **Not seen running.** No herdr build here, so the refresh is verified by source and `bh check`, not on screen. The one thing I could not confirm is whether `.focus()` fires for keyboard focus; `focusable` sets `tab_index(0)` and the ring style, so if herdr does not focus plain elements the ring simply never shows rather than breaking.
- **No colour transitions.** `MotionProperty` is `"opacity" | "width" | "height" | "left" | "top"` (`gpui-kit.d.ts:22009`), so `MOTION.hover` (120ms colour) cannot be applied by `transition()`; hover colours change instantly, while the press sink does animate `top` over 90ms.
- **Reduced motion is not exposed.** `settings()` is an untyped `Record<string, unknown>` (`gpui-kit.d.ts:22539`) and nothing in gpui-kit mentions motion or `prefers-reduced-motion`; no reduced-motion branch exists to honour, so this is reported rather than invented.
- **Readings widths** are capped at 600px for reply bodies/bubbles and plan lines (about 75 characters at TYPE.md); the chat column stays 660 and the plan main pane still sizes to the window.
- **Elevation**: `shadow_md` remains only on the composer, toast and popovers/dialogs; cards, tabs and the segmented control lost `shadow_sm` and are border-only.
- **Settings' save error** stays the inline `problem` line (it reports a failed write, not a failed load; there is no reload to retry).
- The `CHIP` height replaced the composer's 28px space chip (now 22), and the plan rail's 36px seat squares are now 28, per the compact sizes.

---

# Stage A — alpha fix, steps 8, 10, 13, 6, 17 and the Knowledge editor

## Summary
The alpha compositing landed already (it is in `palette()` via `opaque()`, see the Verification above); this stage adds the hover-revealed message actions, the light-mode Knowledge rule, the toast's continuous close, the in-app file browser for attachments, the plan document in its own window, and the live MarkdownEditor in Knowledge.

## Changes
- **Alpha (already in place, verified here):** `opaque(color, under)` composites 8-digit tokens; every `palette()` token is opaque `#rrggbb`. `node --test test/contrast.test.mjs test/palette.test.mjs test/themes.test.mjs` → 14/14.
- **Step 8 — chat.js:** the reply reveals "Open terminal" and "Comment" on hover (`on_hover` on the reply sets `this.hovered`, one re-render) via `opacity` + `MOTION.hover` (no layout shift); `focusable()` now also sets `opacity(1)` in its focus style, so a keyboard-focused action appears even when hidden. Note entries (agent stopped without replying) keep the link always visible. The user meta row no longer prints "to". The page switch was already drawn from `palette()` in step 9.
- **Step 10 — work.js:** in light mode a Knowledge card is `c.fill` + 1px `c.edge`, no tint, no shadow; the hue appears only as the dot, the (ink-repaired) name and a 2px left bar; hover moves the border to `alpha(hue, 0.35)`. Dark mode keeps `alpha(hue, 0.08)` and tints on hover. Filter chips: light = `c.fill` + `c.edge` + hue dot, selected `alpha(hue, 0.10)` bg with `alpha(hue, 0.35)` border and `c.ink` text; dark keeps the low tint. `look.js` gained `isLight(c)` for the branch.
- **Step 13 — composer.js / look.js:** `MOTION.toastOut = { duration: 260 }`. In the "out" phase the shell goes to 24×12 at `top = GAP + H` with `opacity 0` and `MOTION.toastOut` on top/width/height/left/opacity (no spring), the body text fades over the first 120ms (`MOTION.hover` with ease-in), and `dropToast` removes it after `MOTION.toastOut.duration + 16` — one duration controls both. The open motion is unchanged.
- **Step 6 — composer.js:** the PowerShell/osascript/zenity code is deleted. "Attach document…" opens a browser in the attach pane (420 wide, ≤360 high): path row (up, truncated current path, close), search field (instant case-insensitive name filter), list (ROW rows, checkbox, folder/file icon, name, file size), multi-select by click, Enter/Space/arrows/Backspace/Esc on a focusable list, "Show hidden" toggle, `N selected` footer and an Attach button that `addFiles(paths)` and closes the pane. It starts at `projectDir()`, lists through `bh files <path> [--all] --json`, shows `stateView` while loading, the error sentence with Retry on failure, and "Showing the first 2000" when truncated. A space on another machine shows the one-line note and takes a typed path (Enter attaches it). `look.js` gained `baseName`, `parentPath`, `filterEntries`, `togglePick`, `sizeText`; `test/browse.test.mjs` covers them.
- **Step 17 — plandoc.js + work.js + main.js:** the plan document moved out of the Plans page into `plandoc.js`: `openPlan(plan, { big })` opens a dialog (`view: "plan"`) at 0.8×0.86; `PlanDoc` draws the title, Start task, Archive, the "click a line" hint, the lines with their comments, the inline comment box and the unlined comments, reloading through `bh plan show` after any action. The dialog has an expand control (reopens at 0.98×0.96) and a close button, and Esc/outside-click close it. `commentRow` and `openFirst` moved to `plandoc.js` (chat and work import them from there, so there is no cycle). The Plans page now shows only the conversation and the composer, with a "View plan" tab (document icon, label, chevron chip, top-rounded, 1px edge, `c.fill`) centred on the composer's top edge, shown only when the draft has markdown. `main.js` registers the new `plan` view (the one file outside my list; a dialog cannot open without it).
- **Step 11 — work.js:** the Knowledge file editor is `new MarkdownEditor({ value, placeholder })` from `mdedit.js`; its `render(c, cx, id)` draws the blocks in the bordered, scrollable box; `change` notifies; Save still writes exactly `this.editor.value()` (the same `knownText`/`value()` comparison drives Save's visibility), so the file on disk is what the blocks round-trip to.

## Brief Check
- Step 8 in place — met — hover/focus reveal without layout shift, "to" removed, switch on `palette()`.
- Step 10 in place — met — light cards/chips per the rule, dark tint kept.
- Step 13 in place — met — one `MOTION.toastOut` for the shrink/fade and the removal timer.
- Step 6 in place — met — contract used, OS pickers gone, keyboard/multi-select/search/error/truncated/foreign cases covered.
- Step 17 in place — met — document only in the dialog, tab on the composer, expand/close/Esc/outside click, comments and Start task.
- Step 11 wired — met — MarkdownEditor in Knowledge; Save writes `value()`.
- `node --test test/contrast.test.mjs test/palette.test.mjs test/themes.test.mjs` — met — 14 pass (26 with the browse and mdedit suites).
- A unit test for pure helpers — met — `test/browse.test.mjs` (parentPath, baseName, filterEntries, togglePick, sizeText), 5 tests.
- `npx tsc -p mods/bot-herdr/jsconfig.json` — not met — TypeScript is not installed here (no local/app `tsc`; `npx` would download it, and no new dependencies are allowed). `node --check` on every changed file and `bh check` are the available checks.
- `bh check` — met — PASS.

## Verification
- `node --check` on look, theme, chat, composer, switch, work, toast, lightbox, pick, viewer, plandoc, main, mdedit, mdblocks — OK.
- `node --test test/browse.test.mjs test/mdedit.test.mjs test/contrast.test.mjs test/palette.test.mjs test/themes.test.mjs` — 26 tests, 26 pass.
- No `text_size`/`rounded`/`gap`/`px`/`py`/`h`/duration literal in plandoc.js or the stage's edits (zeros and measured heights only).
- `bh check` — PASS.

## Notes
- **Expand cannot resize in place.** `OverlaySpec` has no resize call, so the expand control closes the dialog and reopens it at 0.98×0.96 with the same plan (`openPlan(plan, { big: true })`); an in-progress comment draft is lost when expanding.
- **Path truncation** is the normal end ellipsis: gpui's `truncate()` clips at the end, so a long path shows its start rather than its tail.
- **`main.js`** was edited (import + `VIEWS.plan`) although it was not in the file list; without the registration the dialog cannot open.
- **Knowledge editor height** is the existing `bodyH` box with `overflow_y_scroll`; the editor's blocks auto-grow inside it.
- The manifest is not run here (no herdr build), so the browser, dialog and editor were verified by source, `node --check`, the helper tests and `bh check`, not on screen.

---

# Fix round 1 (QA gate)

## Summary
Text tokens are now repaired against every surface they are drawn on (fill, ground, hover, well, bubble), the chat task widget has its bound and inner scroll back, the light selected filter chip tint is 0.04, and chat imports `sendFromChat`.

## Changes
- **Contrast on drawn surfaces — look.js:** `palette()` computes `hover` and `well` before repairing anything and repairs `muted`, `faint`, `accent`, `danger`/`stop`, `info`, `success`, `warning` with `onAll()` against the hardest of `[fill, ground, hover, well, bubble]` (up to six passes). `agentInk()` now repairs the hue against the harder of `ground` and `fill`, for a Knowledge card title.
- **Our own pair** was repaired the same way, because `palette()` returns it unchanged: LIGHT `muted #6a6964`, `faint #6a6966`, `accent #a25338` (`accentLip #82422d`), `warning #aa4f0a`; DARK `faint #abaaa4`, `accent #e1987e` (`accentLip #b47a65`), `danger #f88a89`, `stop #d89a96`, `info #6eadfa`. Surface tokens (fill, ground, well, hover, bubble) are unchanged; only the text tokens moved, as the gate asked.
- **test/contrast.test.mjs:** the loop now checks every text token on `fill`, `ground`, `well`, `bubble` and `hover`, and `agentInk` on both `ground` and `fill`, for all fixtures and our pair.
- **Task widget — chat.js:** restored `max_h(max(160, height − 220))`; the list scrolls inside it and both the widget and the list stop the wheel so the feed never scrolls under them.
- **Knowledge chip — work.js:** the light-mode selected tint is `alpha(hue, 0.04)`.
- **chat.js:** `sendFromChat` added to the `./pages.js` import (it was used at the widget's Pause/Resume).

## Brief Check
- `node --test test/contrast.test.mjs test/palette.test.mjs test/themes.test.mjs` — met — 14 pass with the extended surfaces.
- `bh check` — met — PASS.
- `herdr-app check mods/bot-herdr` — met — prints `check passed: mods/bot-herdr`.
- Fixes 1–4 in place — met — see above.

## Verification
- `node --test test/contrast.test.mjs test/palette.test.mjs test/themes.test.mjs` — 14 pass (26 with browse + mdedit).
- `node .bot-herdr/tmp/palette-audit.mjs` — `ALL PAIRS PASS`.
- `node --check` chat.js, work.js, look.js — OK.
- `bh check` — PASS.
- `herdr-app.exe check mods/bot-herdr` — `check passed: mods/bot-herdr`.

## Notes
- The task widget is the one deliberate nested scroll again, as the gate requested; replies and the feed keep their single scroll.
- The repaired own-pair values are the smallest step from the old ones that reaches 4.5 on the hardest surface (bubble for DARK accent, well for LIGHT muted/accent), so hue and polarity are kept.

---

# Fix round 2 (QA gate, residual)

## Summary
Agent names no longer sit under AA on their own hue tints: dark filter chips use `c.ink`, and a dark Knowledge card's name is repaired against the composited hovered tint.

## Changes
- **work.js, filter chips:** the selected chip's label is `c.ink` in both themes (the hue stays on the dot and the tint; dark tint unchanged at 0.04 / 0.16 / 0.22 as before).
- **work.js, Knowledge card:** in dark mode the card's surfaces are now opaque blends — `mix(c.ground, hue, 0.08)` at rest and `mix(c.ground, hue, 0.12)` on hover — so what is drawn equals what is measured; the name uses the new `agentInkOn(c, name, bg)` from look.js against the hovered tint, which also covers the rest tint.
- **look.js:** `agentInkOn(c, name, bg)` = `readable(agentHue(name, c.accent), bg, 4.5, c.ink)`.
- **test/contrast.test.mjs:** for every fixture and our pair, for each agent, it now asserts the card name ≥ 4.5 on the composited card surface at rest and on hover, and the chip label (`c.ink`) ≥ 4.5 on the composited chip surface at rest and on hover (light: fill/hover and the 0.04 tint; dark: the 0.08/0.12 card tints and the 0.16/0.22 chip tints over ground).

## Brief Check
- Dark chips use ink; hue stays on dot and tint — met.
- Dark card name repaired against hovered composited tint, passing at rest and hover — met — `agentInkOn` + opaque card surfaces.
- Contrast test extended for card name and chip label at rest and hover for every fixture and our pair — met.
- `node --test test/contrast.test.mjs` — met — passes (all 10 fixture cases).
- `bh check` — met — PASS.
- `herdr-app check mods/bot-herdr` — met — `check passed: mods/bot-herdr`.

## Verification
- `node --check` work.js, look.js — OK.
- `node --test test/contrast.test.mjs test/palette.test.mjs test/themes.test.mjs test/browse.test.mjs test/mdedit.test.mjs` — 26 pass.
- `bh check` — PASS.
- `herdr-app.exe check mods/bot-herdr` — `check passed: mods/bot-herdr`.
