## Summary
Every inline comment box (task steps, knowledge entries in work.js, and the plan sheet in plandoc.js) is now the chat's Composer through `pageComposer`, so it grows as you type and takes files by attach, paste or drop.
One test outside my files, test/page-composer.test.mjs, reads work.js for pageComposer's body. It fails now and needs a one-line path change (see Blockers).

## Changes
- mods/bot-herdr/composer.js: `pageComposer` and `resetComposer` moved here from work.js as named exports with the same bodies. Added a JSDoc type for `opts` with `onAnswer` optional, which removed a new TS2345 at both call sites.
- mods/bot-herdr/work.js: these now come from composer.js, and the unused `Composer` and `messageText` imports are gone. `this.inline` is replaced by `this.inlineComposer` (minRows 2, "Comment"). The typing count still works: because a second `on("focus")` replaces the first (gpui-kit.d.ts: "registering twice means the second handler"), the focus and blur handlers count typing and then call the composer's own `setFocused`. `startInline` and `editInline` use resetComposer, `.input.set_value` and `.focus()`. `sendInline(cx, text)` takes its text as an argument. `inlineBox` draws Cancel (quiet, which also runs resetComposer) right-aligned above the composer. The separate Comment button is gone. Added `this.inlineW`, set in `taskPane` and `knowledgeView`.
- mods/bot-herdr/plandoc.js: `this.inline` (TextareaState) is replaced by `this.inlineComposer` (minRows 2, "Your comment"). `focusing` and `focusChanged` are removed because the composer draws its own edge, and the `TextareaState` and `Textarea` imports are dropped. The "Enter adds the comment · Esc cancels" row and the Add comment button are removed; `commentHead` is kept. `scrimClick` keeps a box open when it has text or files. `render(cx)` now stores `this.cx`, and `on_size_change` also records `this.height`.

## Brief Check
- Only the three files in `git diff --stat`: **met** (composer.js +29, plandoc.js, work.js). `herdr-app check` rewrote gpui-kit.d.ts, and I restored it with `git checkout`.
- `herdr-app check mods/bot-herdr` prints "check passed": **met**.
- tsc shows no new TS2304/TS2552 in the three files: **met**. After the JSDoc it shows no errors at all in them.
- No `this.inline.` left in work.js or plandoc.js: **met** (grep finds nothing).
- `bh check` passes: **not met**. See Verification and Blockers.
- Width and height passed to render:
  - **work.js inlineBox**: `render(this.cx, this.inlineW ?? this.width, this.height)`.
    - On a task step, `inlineW` is the detail pane's `inner` width. For a knowledge entry it is one card column, `(width - SPACE[4]*(cols-1))/cols`.
    - I pass the column width with no gutters added back. render takes `SIZE.gutter*2` (48px) off it, and that leaves room for the card's padding and the note's indent.
    - Height is the page height, so attach and file panes can grow up to the page.
  - **plandoc.js commentField**: `render(this.cx, content + SIZE.gutter*2, this.height - SPACE[4]*2)`.
    - `content` = `sheetW() - SPACE[5]*2` (body padding) `- SPACE[3]*2` (the box's padding) `- 2` (its border), so the bubble fills the box exactly, the same way taskComposer adds its gutters back.
    - Height is the sheet's height (window less its top and bottom inset).

## Verification
- `herdr-app check mods/bot-herdr` — check passed
- `npx -y -p typescript@5 tsc -p mods/bot-herdr/jsconfig.json --noEmit` — no errors in composer.js, work.js or plandoc.js
- `bh check` — FAIL, for two reasons:
  - Its typecheck cannot run here: "typescript is not installed: run npm install".
  - Tests: 674 pass, 19 fail. On a clean HEAD worktree, `npm test` gives 675 pass, 18 fail. The one new failure is `test/page-composer.test.mjs`. The other 18 also fail at the base (tasks-contracts lock, windows-scripts check_changed, and others).

## Blockers
- `test/page-composer.test.mjs:10` reads `../mods/bot-herdr/work.js` and matches pageComposer's `const text = messageText(comp.input.value().trim(), comp.files.map((f) => f.path));`. That line now lives in composer.js, as step 1 asked. The fix is to change `work.js` to `composer.js` on line 10. It is outside my three files, so I did not edit it.
- Narrow spot: the Composer bubble is never narrower than 320px (`Math.max(320, …)` in `render`). Knowledge cards in 3 columns (page ≥ 900px) are about 300px wide, so the box under a knowledge entry can be wider than its card there. Fixing it means changing Composer's minimum or the card layout, which is outside this step. I added no workaround.

## Knowledge Proposals
- gpui state `.on(event, …)` keeps only the last handler per event. To add behaviour to a Composer's input focus or blur, call `comp.setFocused(on, cx)` from your own handler, or the composer loses its focused look.
- `herdr-app check` can rewrite mods/bot-herdr/gpui-kit.d.ts with the installed herdr's typings. Restore it before handoff unless the brief names it.
- Composer.render never draws the bubble narrower than 320px. Inline spots narrower than about 368px overflow.
