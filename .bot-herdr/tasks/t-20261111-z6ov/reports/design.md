# Design — t-20261111-z6ov: browser back, popup scrim

## Summary
Back in the file browser works again: presses and wheels inside a composer pane no longer reach the scrim, and the drive root now goes up to the drive list instead of dead-ending. The scrim is darker for every composer pane, fades with MOTION.pane, and a press on it closes the pane (questions still only swallow the press).

## Changes
- `mods/bot-herdr/look.js` — one token: `SCRIM = { light: "#00000052", dark: "#0000008c" }` (black at 32% / 55%), picked with `isLight(c)`.
- `mods/bot-herdr/chat.js` — the dim (`#bh-ask-dim`) is now drawn for any composer pane (not only ask and the browser), uses `SCRIM[isLight(c) …]` with element opacity 1, and fades with `transition("opacity", MOTION.pane)`.
  - It stays mounted (so it can fade both ways) and carries its two pointer handlers only while a pane is up; with none it has no handlers, so it takes no pointer and presses/wheels pass through.
  - A press on it stops propagation, then: `ask` swallows only (unchanged); `attach` runs `closeBrowse` then `close`; every other pane runs `close`. The wheel over it never scrolls the feed.
  - The minimised question bar (`paneNow() === "bar"`) does not dim: minimising is how the person keeps working.
- `mods/bot-herdr/composer.js`
  - `paneView`'s container `#bc-pane-row` stops `on_mouse_down` and `on_scroll_wheel`, so nothing inside a pane (up button, rows, search, mockups) reaches the scrim behind it. The composer box `#bc-box` does the same (its mouse-down now also stops propagation before expanding/focusing).
  - Up a folder: new module helper `upFrom(path)` = `parentPath(path)`, except a drive root (`C:\`) goes to `""`, the drive list (`bh files ""`), since Windows has no single root. `loadBrowse` keeps the asked path (`b.path = ""` for the drive list) and computes `b.parent = upFrom(b.path)` instead of trusting the backend's `parent`, which made `C:\` a dead end.
  - Up button and Backspace now test `b.parent !== null` rather than truthiness, so `""` (the drive list) is a real destination and the button is disabled only at the drive list and `/`. Header shows `Drives` when the path is `""`.
  - `openFolder` focuses the list (`browseHandle`), so Backspace keeps going up after a click on the up button.

## Design choices
- scrim strength: `#00000052` light / `#0000008c` dark, as the brief specified (no blur exists in gpui/herdr).
- motion: `MOTION.pane` (190ms, ease-out) on opacity, both ways.
- no new visual style beyond the token; no cursor change on the scrim, no label.

## Brief Check
- Clicks inside an open composer pane work and do not close it — met: `#bc-pane-row` and `#bc-box` call `cx.stop_propagation()` on mouse-down and wheel; the scrim only sees presses on itself.
- Up button and Backspace go up a folder — met: `openFolder(b.parent)`; chain verified against `bh files` (`Desktop` → `…\Users\athenkosi.hlubi` → `C:\Users` → `C:\` → `""` drive list, `parent null` there, so the up button is off).
- A click on the dim closes the pane (not ask) — met: `composer.close(cx)` (browser also `closeBrowse` first); ask swallows only.
- Typecheck shows no TS2304/TS2552 outside `engine/` — met (no output).
- `bh check` passes, `herdr-app.exe check mods/bot-herdr` passes, `node --test test/browse.test.mjs` passes — met.
- Report to `.bot-herdr/tasks/t-20261111-z6ov/reports/design.md` and `hc send t2z` — this file, sent.

## Verification
- `node mods/bot-herdr/engine/bh.mjs files "C:/Users/athenkosi.hlubi/Desktop" --json` — parent `C:\Users\athenkosi.hlubi`.
- `… files "C:/Users" --json` — parent `C:\`.
- `… files "C:/" --json` — lists `C:\` contents with `parent: null`, i.e. the backend cannot express "up to the drives"; hence `upFrom`.
- `… files "" --json` — drive roots, `parent: null` → the drive list the new `upFrom` reaches.
- `node --test test/browse.test.mjs` — 5 pass, 0 fail.
- `node --test test/*.mjs` — 143 pass, 0 fail.
- `npx -y -p typescript@5 tsc -p mods/bot-herdr/jsconfig.json --noEmit | grep -E "TS2304|TS2552" | grep -v engine/` — empty.
- `node …/bh.mjs check` — PASS (lint, typecheck, tests).
- `%LOCALAPPDATA%/Programs/herdr-app/herdr-app.exe check mods/bot-herdr` — `check passed`.
- Visual limit: no headless GUI harness here, so the click/fade behaviour was not observed on screen; it is argued from the element tree (handlers present only on the pane box, the pane row and the open-pane scrim). Worth one manual pass: open attach → click up twice → Backspace back down to the drive list; click the empty scrim to close.

## Knowledge Proposals
- `bh files "C:\"` lists `C:\` and reports `parent: null`; only `bh files ""` returns the drive list. A drive root's "up" must be asked for as `""`, so the browser tracks the asked path rather than the backend's `parent`.
- In this gpui, a press on a control also reaches a sibling overlay under the pointer (why the pane must call `cx.stop_propagation()`), so a full-page overlay is only safe while it has no pointer handlers.

## Script Proposals
- none.

## Blockers
- none.

## Pushback
- none.

## Follow-ups
From `.bot-herdr/tmp/z6ov-fix.md` (QA gate Findings 1, 2, 3, 6):

1. **Scrim only under a drawn pane.** `Composer.paneShown()` (next to `paneNow()`) is true only when `paneView` really draws: a `suggest` pane whose `rows()` is empty draws nothing, so it no longer counts. `chat.js` keys the scrim, its handlers and its click target on `paneShown() ? paneNow() : null`, so a mention query matching nothing no longer darkens the feed with no card.
2. **`upFrom` moved to `look.js`** beside `parentPath`, exported with the same doc comment; `composer.js` imports it (local const removed) and `test/browse.test.mjs` covers it: `upFrom("C:\\") === ""`, `upFrom("C:\\Users") === "C:\\"`, `upFrom("") === null`, `upFrom("/") === null`.
3. **Drive list footer.** At `b.path === ""` the folder-mode primary ("Attach this folder") is not drawn at all, and the footer's left text reads "Pick a drive" instead of "0 selected". The Attach button comes back as soon as a drive or folder is open.
4. **`loadBrowse` race.** Each request takes `b.seq = (b.seq ?? 0) + 1`; an answer whose seq is not the current one (alongside the existing `this.browse !== b` check) is dropped, so a slower earlier listing can't overwrite a folder opened after it.

Verification after the follow-ups:
- `node --test test/browse.test.mjs` — 6 pass, 0 fail (new `upFrom` test).
- `npx -y -p typescript@5 tsc -p mods/bot-herdr/jsconfig.json --noEmit | grep -E "TS2304|TS2552" | grep -v engine/` — empty.
- `node …/bh.mjs check` — PASS (lint, typecheck, tests).
- `%LOCALAPPDATA%/Programs/herdr-app/herdr-app.exe check mods/bot-herdr` — `check passed`.
- Visual limit unchanged: no headless GUI harness, so the scrim/footer were verified from the element tree, not on screen.
