# Dev Report — M4+M5 fix round 2 (dev-m45fix2)

## Summary

Fixed both `qa-m45b` majors (Knowledge card key guard + Tab focus persistence for Edit/Delete; `appKeyAction` typing guard for both `?` and `Ctrl+1..5` plus focus tracking on `composer.modelSearch`/`browseSearch`/`browseTyped` and `chat.commentBoxes`) and both minors (`agents.js` keymap ignored under Terminals; `work.js` Undo note prefix). All checks (`tsc`, `herdr-app check`, `ui-audit`, and the full 674-test suite via `bh check`) pass with zero unrelated changes.

## Changes

- `mods/bot-herdr/rowkeys.js:52-66` — Return `null` at the top of `appKeyAction` when `typing` is true (suppressing both `?` and `Ctrl+1..5`), and export `cardKeysActive({ typingCount, editing, commenting })`.
- `mods/bot-herdr/work.js:37,348,623-625,938,967,976-987,2811-2816,2846,2873,2885` — Guard Knowledge card `on_key_down` at the top via `cardKeysActive({ typingCount: this.typingCount, editing: this.editing, commenting: this.commenting })`; track per-card `{ card, edit, del }` FocusHandles in `knowHandles` (`cardHandles`) and wire `.track_focus(editHandle)` / `.track_focus(delHandle)` so `showActions` stays true while Tab moves onto Edit/Delete; preserve note match prefix via `n.entry ?? u.entryKey` in `undoKnowledgeDelete` (and `n.entry ?? e.key` in `deleteKnowledgeNote`).
- `mods/bot-herdr/composer.js:191-208` — Track `focus`/`blur` on `modelSearch`, `browseSearch`, and `browseTyped` via `this.typingCount`.
- `mods/bot-herdr/chat.js:222,286-287` — Track `focus`/`blur` on every `commentBoxes` `InputState` via `this.typingCount`.
- `mods/bot-herdr/threads.js:240-250` — Include `this.chat.composer.typingCount > 0`, `this.chat.typingCount > 0`, and `this.work.taskComposer` focus/typing in `typing`.
- `mods/bot-herdr/agents.js:84-89` — Ignore `app?.kind === "keymap"` when `this.sub === "terminals"`.
- `test/rowkeys.test.mjs:7,46-56` — Update `Ctrl+2` with `typing: true` to expect `null` (and keep `typing: false` expecting `"threads"`), and add a test pinning `cardKeysActive`.

## Brief Check

1. **Item 1 — Knowledge card key guard + keep Edit/Delete mounted on Tab + test:** **Met.** Guarded at `mods/bot-herdr/work.js:2846` using `cardKeysActive` (`mods/bot-herdr/rowkeys.js:60-66`), Edit/Delete focus handles tracked at `mods/bot-herdr/work.js:623-625,976-987,2811-2816,2873,2885`, tested at `test/rowkeys.test.mjs:50-56`.
2. **Item 2 — Typing suppresses `?` and `Ctrl+1..5` + track 4 secondary inputs:** **Met.** `appKeyAction` guards both at `mods/bot-herdr/rowkeys.js:52-58`, test updated at `test/rowkeys.test.mjs:46-47`, `focus`/`blur` tracked on `modelSearch`/`browseSearch`/`browseTyped` (`mods/bot-herdr/composer.js:191-208`) and `commentBoxes` (`mods/bot-herdr/chat.js:222,286-287`) and included in `mods/bot-herdr/threads.js:240-250`.
3. **Item 3 — Minor: keymap ignored under Terminals:** **Met.** `mods/bot-herdr/agents.js:84-89` returns early on `keymap` when `this.sub === "terminals"`.
4. **Item 4 — Minor: Undo note prefix:** **Met.** `mods/bot-herdr/work.js:967` re-attaches notes with `n.entry ?? u.entryKey` (and `mods/bot-herdr/work.js:938` records `n.entry ?? e.key`).
5. **Checks (`tsc`, `bh check`, `npm test`, `herdr-app check`, `ui-audit`):** **Met.** All verified below; `mods/bot-herdr/engine/lib/gpui-kit.d.ts` deleted after `herdr-app check`; only the 7 allowed files modified; `data/` untracked status clean.

## Verification

- `timeout 300 /home/athi/bot-herdr/node_modules/.bin/tsc --noEmit -p mods/bot-herdr/jsconfig.json` — exit 0 (clean)
- `timeout 300 /home/athi/.local/bin/herdr-app check mods/bot-herdr && rm -f mods/bot-herdr/engine/lib/gpui-kit.d.ts` — `check passed: mods/bot-herdr` (exit 0); regenerated `mods/bot-herdr/engine/lib/gpui-kit.d.ts` removed
- `timeout 300 node --test test/rowkeys.test.mjs` — 4/4 pass (exit 0)
- `timeout 300 node mods/bot-herdr/engine/bh.mjs check` — ran full `npm run test`: 674 tests, 673 pass, 0 fail, 1 skipped; typecheck sub-step reported missing `typescript` only because the child worktree has no `node_modules` (verified clean above with `/home/athi/bot-herdr/node_modules/.bin/tsc`)
- `timeout 300 env BH_APP_HOME=$(mktemp -d) node mods/bot-herdr/engine/bh.mjs ui-audit --json` — exit 0; `renderErrors: {}`, every page under baseline (`settings-general` 104 < 110, `library-knowledge` 119 < 142, `home` 166 < 167, `threads` 77 < 268, `peek` 127 < 268), `keyboardPathCoverage: 1`, `accessibleLabelCoverage: 1`, `hexOutsideTokens: 0`, 16/16 themes contrast-clean; only failures are the 3 M6 features (`approvalCard`, `diffReview`, `viewModes`)
- `git status -s && git status --ignored -s data/` — only the 7 allowed files modified (`agents.js`, `chat.js`, `composer.js`, `rowkeys.js`, `threads.js`, `work.js`, `test/rowkeys.test.mjs`); `data/` clean
