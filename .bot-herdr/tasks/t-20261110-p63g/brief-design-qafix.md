# Design brief — QA fix round 1, views (t-20261110-p63g, step 16)

## Goal
The QA gate (`.bot-herdr/tasks/t-20261110-p63g/reports/qa-gate.md`, read its Findings) returned CHANGES_REQUIRED. Fix the view findings below. Typings are in `mods/bot-herdr/gpui-kit.d.ts`; `npx tsc -p mods/bot-herdr/jsconfig.json --noImplicitAny false` lists calls the typings do not declare.

## Files
- Change: `mods/bot-herdr/work.js`, `mods/bot-herdr/chat.js`, `mods/bot-herdr/composer.js`, and a test under `test/` only if one covers what you touch.
- Leave alone: `mods/bot-herdr/engine/**` (Dev is changing it now), every other file.

## What to do
1. [major] `work.js:1138-1139` calls `.rotate(tilt)` on a knowledge note. gpui-kit has no rotate or transform, so this most likely throws and breaks the whole Knowledge page. Remove the `.rotate(...)` calls and the tilt value that feeds them (and any "straightens on hover" code that depends on it). Keep whatever else a note does on hover (shadow or border change) as it is.
2. [minor] `work.js:691` passes `delay` to `.loop()`; `LoopPolicy` has no `delay`. On the Tasks page, replace the flow dots on the active step with the same 2 px track the chat's tasks widget now uses (copy it from `chat.js`; search for `loop("left", { from: -12`): a 2 px high track under the active step's title with one 12 px accent segment sliding along it. No dots.
3. [major] The composer must fold to the slim bar when the person scrolls the feed up, and when they click the feed (at any scroll position), and grow back on a click on it or on typing, never losing the draft. Today (`chat.js` feed `on_mouse_down` ~:597-601, `composer.js` `isFolded()` ~:815 and `render()` ~:846-847) it folds only on a feed click while scrolled up.
   - `chat.js` `scroll()`: when the new state is scrolled up (`back > 0 || px > 0`) and the old state was not, set `this.composer.expanded = false` and call `this.handle.focus()` (so typing reaches the chat's key handler, which unfolds it).
   - `chat.js` feed `on_mouse_down`: fold on every click, not only when scrolled up: `this.composer.expanded = false; this.handle.focus();`. A reply's Comment link and comment box must keep working: start the handler with `if (this.commenting) return;`.
   - `composer.js`: `isFolded()` drops the `this.feedScrolled &&` term; `render()` drops the line `if (!feedScrolled) this.expanded = true;`. Keep every other term of `isFolded()` (never folded while a pane or the question card is open, or with attached files).
   - When the feed returns to the newest message by scrolling down, leave the composer as it is (folded stays folded until a click or typing).
   - The composer starts expanded (`this.expanded = true` in its constructor stays).
4. Run `npx tsc -p mods/bot-herdr/jsconfig.json --noImplicitAny false`. In `work.js`, `chat.js` and `composer.js`, fix every remaining error of the kinds "Property '<x>' does not exist on type 'NativeElement'" and "'<x>' does not exist in type 'LoopPolicy'" (or 'TransitionPolicy'), by removing the undeclared call or using the declared one. List the ones you fixed. Errors of those kinds in other files: list them in the report, do not fix them.

## Constraints
No new dependencies. No engine edits. No commits. Nothing restyled beyond these items.

## Done when
- `grep -n "rotate(" mods/bot-herdr/work.js` prints nothing; no `.loop(` call in `work.js` has a `delay`.
- `grep -n "feedScrolled &&" mods/bot-herdr/composer.js` prints nothing.
- `npm test` passes.
- Your report answers items 1-4 as met / not met with `file:line`, and says what you could not confirm without seeing the app.

## If stuck
When the code or the typings contradict an item, stop that item, finish the others and report it with `file:line`. Never use a guessed API.
