# design-fix report — t-20261110-p63g

## Summary
All of A–G are done. The chat now scrolls by the pixel, the active step has a flow track, a new verb crossfades in, the composer folds with a draft and typing unfolds it, `/bh-knowledge` asks Scout from the chat, and Settings offers Jev, Laya, Clef and Rules only.
`npm test` and `bh check` pass. I can't see the app, so none of the visuals has been checked by eye (see Notes).

## Changes
- `mods/bot-herdr/feed.js:30`: new pure `scrollBy(state, delta, heights, total, fallback = 120)`, written as the brief specifies.
- `mods/bot-herdr/chat.js`:
  - `WHEEL_STEP` and `this.wheel` are gone. Added `this.px`, `this.heights` (Map) and `this.handle` (a focus handle).
  - `scroll()` (:503) calls `scrollBy` with the current space's measured heights, newest first. The sign of `+e.delta.y` is unchanged.
  - `entry()` (:528) adds `.on_size_change` to the entry's own outer `bh-e-<id>` element (no wrapper), height + 14.
  - The feed column is `.absolute().bottom(-this.px).left(...)` (:474–477).
  - `newer()` is drawn as a child of `#bh-feed` at `.absolute().bottom(8)` (:486). With `back === 0` and `px > 0` it says "Jump to latest" instead of "0 newer".
  - `up = back > 0 || px > 0` is passed to the composer and decides whether the working line shows.
  - `this.px = 0` is reset in `add()` and by the pill.
  - Tasks widget: `cx.stop_propagation()` on the list, and `on_scroll_wheel` on the outer `#bh-tasks-widget` (:248).
  - The active step has the 2 px flow track under its title. The old dots are removed (:305).
  - Verb crossfade in `working()` (:722–749).
  - Typing while folded: `track_focus` + `on_key_down` on `#bh-chat` (:446).
- `mods/bot-herdr/indicators.js`:
  - Removed the no-op `opacity(0)…opacity(1)` chains from `shimmer()` and `roleWord()`.
  - Removed the `typed` re-import/re-export. Nothing imported it from here. `working.js` still defines `typed()`, and nothing uses it now.
- `mods/bot-herdr/working.js`: verbs renamed as listed. Every `fx` is unchanged.
- `mods/bot-herdr/composer.js`:
  - `isFolded()` (:819) no longer refuses to fold when there is a draft.
  - New `typeFolded(char, cx)` (:824) unfolds the composer, puts the caret at the end and inserts the character.
  - New `askKnowledge(question, cx)` (:660) puts the question in the feed as the person's message. It then runs `bh(["knowledge","ask","--data",enc(q),"--json"])` (the existing `bh.js` helper) and shows an error toast with stderr's first line on failure.
  - `send()` sends the `knowledge` step there.
- `mods/bot-herdr/route.js`:
  - Added the `bh-knowledge` command (:16).
  - A typed slash command may now contain `-` (:171). Before, `/bh-knowledge` matched as `/bh`.
  - `plan()` returns `{ steps: [{ do: "knowledge", question }] }`, or for a bare command `{ error: "Type a question after /bh-knowledge" }` (:178–182).
- `mods/bot-herdr/settings.js`:
  - New `KINDS` list (:53).
  - The picker's "Without a harness" section has the four kinds (:316).
  - Picking a kind saves `{ kind, harness: "" }` (:330). Picking a harness now also saves `kind: ""`, so an old kind doesn't keep the label or override it.
  - New Account id and Base URL inputs (:100), saved on Enter or blur and filled from `showConfig`. They show only for `clef` and `laya` (:804–805).
  - The picked label is the kind's label.
  - Host chips are hidden when a kind is chosen, and the key/model fields are hidden for Rules only.
  - Status: Rules only reads "On: the built-in rules decide."
- `mods/bot-herdr/work.js:885`: `.tooltip(name)` on the seat.
- Tests:
  - `test/roster.test.mjs`: new `scrollBy` test. The existing feed test lives here, not in `agents-reply.test.mjs` as the brief said.
  - `test/route.test.mjs:127`: `/bh-knowledge` routes, typed and as a chip, and the bare-command hint.

## Brief Check
- A. Chat scroll — met. `feed.js:30`, `chat.js:503-512` (scroll), `:528-532` (measure), `:474-477` (offset, negative `bottom` is allowed: `Length = number`), `:486` (pill), `:498` (composer), `:248`/`:270` (widget wheel).
- B. Flow track on the active step — met. `chat.js:303-307`. The loop has no `delay`, and the dots are removed. `LoopPolicy.period` is "there and back", so the segment slides back and forth rather than wrapping around.
- C. Verbs — met. `indicators.js` has no `opacity(0)`. Crossfade at `chat.js:722-749` uses `this.cx.timer.after(16, …)`. Verbs are at `working.js:11,31,35,38,40,44,58-61`. No test lists verbs.
- D. Composer fold — met. `composer.js:819` (folds with a draft, so the slim bar shows the draft). Typing while folded: `on_key_down` exists, but keys only arrive on a `track_focus`ed element. So `#bh-chat` tracks a `cx.focus_handle()`, which is focused when the feed click folds the composer (`chat.js:467`). Printable keys without ctrl, alt or platform unfold the composer and are typed in (`chat.js:446-452`, `composer.js:824`). This is the same pattern `lightbox.js:84` uses.
- E. `/bh-knowledge` — met. `route.js:16,171,178-182`, `composer.js:660`, `test/route.test.mjs:127`.
- F. Classifier choices — met. `settings.js:53-60,100-110,316,330,804-805`. I checked the keys with `bh config --json`: `kind`, `model`, `key` (boolean), `accountId`, `baseUrl`.
- G. Seat tooltip — met, `work.js:885`. Step checkbox marks are unchanged.
- `npm test` passes — met (90 tests, 89 pass, 1 skipped, 0 fail).
- The `WHEEL_STEP|this.wheel|stop_propagation?` grep over `chat.js` is empty — met.
- The `opacity(0)` grep over `indicators.js` is empty — met.
- The `bh-knowledge` grep over `route.js` and the `kind|clef` grep over `settings.js` each print a line — met (`route.js:16`, `settings.js:56`).

## Verification
- `npm test` — pass (90 tests, 0 fail, 1 skipped).
- `bh check` — PASS (lint, typecheck, tests).
- `bh config --json` — read it for the classifier keys.

## Notes (not seen in the app)
- I didn't render any of this. These depend on runtime behaviour the typings don't promise:
  - That negative `bottom` clips smoothly inside `overflow_hidden`.
  - That `on_size_change` fires on each entry.
  - That `set_selected_range` offsets match JS string length (true for ASCII, unverified for other characters).
  - That focus moves to `#bh-chat` when the feed is clicked.
- Heights are measured after layout. Until an entry has been drawn once, scrolling past it uses the 120 px fallback.
- Typing while folded only works once a feed click has folded the composer, because that click moves focus. A fold caused only by scrolling, with the text box still holding focus, doesn't apply: the composer folds only on a feed click.
- The `type` motion in `indicators.js` still returns a `transition` that changes nothing. It was outside the items listed, so I left it.

## Design Choices
- newer pill label when only pixels are scrolled: "Jump to latest" (Design)
- clef/laya extra fields: same `field()` look as Key/API model, full width under them (Design)

## Knowledge Proposals
- gpui `on_key_down` only receives keys on an element with `track_focus(cx.focus_handle())`: when the text box is not drawn, focus a handle of your own (`lightbox.js`, `chat.js`).
- `LoopPolicy` has no `delay`; `period` is there-and-back.
