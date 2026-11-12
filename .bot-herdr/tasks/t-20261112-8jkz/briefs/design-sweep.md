Goal: step 7 of task t-20261112-8jkz. The person: "All buttons should have the same size throughout. I noticed that the archive button is smaller than the rest on the tasks page. Please check others as well." Add one shared button to look.js and move every button in the mod onto it, except in work.js and plandoc.js (another Design agent, design-pages, owns those two files and will use your helper). Also one small fix on the question card.

Files (repo C:/Users/athenkosi.hlubi/Desktop/bot-herdr/mods/bot-herdr):
- You own: look.js and every other mod UI file except work.js and plandoc.js (settings.js, chat.js, composer.js, noteform.js, viewer.js, lightbox.js, switch.js, indicators.js, roster.js, pick.js, toast.js, toasts.js, drawer.js, mdedit.js, search.js, doc.js, feed.js ...). Icons may be added under icons/ (same 24px stroke style as icons/trash.svg).
- Do not touch work.js, plandoc.js, anything under engine/, or test/ (except adding a test file if you add pure logic).

What to do:
1. FIRST, before anything else, add to look.js and export:
   ```js
   /**
    * The one button every page uses: CONTROL (28px) tall, SIZE.nested radius, TYPE.sm text,
    * SPACE[4] padding each side, SPACE[2] between glyph and label, a GLYPH.md glyph.
    * tone: "primary" (accent fill, text readable on it), "secondary" (surface fill, 1px edge),
    * "danger" (surface fill, 1px edge, c.danger text and glyph), "quiet" (no fill or edge until hover).
    * label null: a square CONTROL x CONTROL icon button. hint: a small key hint after the label ("Esc").
    * disabled: faint, no click, no hover.
    */
   export function actionButton(c, id, label, onClick, { icon = null, tone = "secondary", disabled = false, hint = null, tooltip = null } = {})
   ```
   Build it with the existing clickable/hoverable/pressable/focusable helpers (look.js:119-140) and accentFill (look.js:124) so hover, press and focus match today's. Then post the contract: `node "C:/Users/athenkosi.hlubi/.config/herdr-app/mods/bot-herdr/engine/bh.mjs" board post t-20261112-8jkz contract "look.js actionButton(c, id, label, onClick, { icon, tone: primary|secondary|danger|quiet, disabled, hint, tooltip }) is in: 28px, one style for every button" --from design-sweep`. Also tell design-pages directly: `hc send design-pages "actionButton is in look.js; see the board contract."`
2. Inventory every clickable button and chip in your files: write .bot-herdr/tasks/t-20261112-8jkz/reports/buttons.md with one line per button: path:line, what it is, its height today, and what it becomes. A segmented control's items and filter toggles count as buttons (28px tall; a segmented control may be a 28px track with items inside it). Display-only tags (status pills, seat tags, key hints) are not buttons and stay as they are. Text links inside prose stay links.
3. Convert every button in the inventory to actionButton (or, for segmented controls, the same 28px height, radius and type). Keep every label, icon, behaviour, id and tooltip; only the size and treatment change. Where a file has its own button helper, make it call actionButton or replace its uses.
4. composer.js:2165-2177 (a mockup tile that couldn't be drawn): under "Couldn't draw it here", show the first line of the draw error (d.error) in TYPE.xs, c.muted, at most two lines, then the existing "Open in browser" link.

Constraints: no new dependency; no layout or behaviour change beyond button size and treatment; functions at or under 20 lines; keep every accessibility affordance (focus ring, tooltip) that exists today.

Done when:
- actionButton exists in look.js with that signature, and the board contract is posted (do this within your first few minutes).
- buttons.md lists every button in your files, and every one of them is now 28px tall (show the before/after counts).
- `npx -y -p typescript@5 tsc -p jsconfig.json --noEmit` (run from mods/bot-herdr) shows no TS2304/TS2552 outside engine/ in your files.
- `herdr-app check mods/bot-herdr` (from the repo root) passes, and `node "C:/Users/athenkosi.hlubi/.config/herdr-app/mods/bot-herdr/engine/bh.mjs" check` passes.
Report which criteria you met and how, plus any design choice you made as `- <field>: <value>`. Do not run node install.mjs and do not commit.

If stuck: a button whose size can't change without breaking its layout (for example inside a 22px row): stop on that one, list it in buttons.md with why, and go on.
