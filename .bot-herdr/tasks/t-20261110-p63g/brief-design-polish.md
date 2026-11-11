# Design brief — steps 10–13 of t-20261110-p63g (toasts, verbs, chat scroll, composer)

## Goal
Own steps 10 (toast exit animation), 11 (working verbs), 12 (pixel chat scroll + independent tasks-widget scroll), 13 (folding composer + attachment thumbnails). Steps 5–7 landed in `work.js`/`chat.js` — build on them.

## Files
- Change: `mods/bot-herdr/toast.js`, `mods/bot-herdr/working.js`, `mods/bot-herdr/chat.js` (feed scroll `on_scroll_wheel` ~:435; tasks widget `bh-tasks-widget-list` ~:256), `mods/bot-herdr/composer.js` (fold behaviour; attachments `:955-972`; `previews()` `:494-500`), `mods/bot-herdr/look.js` only to reuse helpers.
- Leave alone: `mods/bot-herdr/engine/**`, `work.js` (unless a toast/verb helper must move there), `settings.js` (yours again next wave, not now).

## What to do
### Step 10 — toasts
1. Both toasts get a proper exit animation mirroring the show animation (fade/slide out, same duration/easing family), then removal.

### Step 11 — working verbs
2. Better verb list for the working animation (calmer, varied, still truthful — no claims of work that isn't happening).
3. Crossfade between verbs instead of the retype effect; slower, calmer timing.

### Step 12 — chat scroll
4. The feed scrolls by pixels (wheel/trackpad), staying pinned to the newest message until the person scrolls up; scrolling back down to the end re-pins. No more jumping a whole message per wheel step.
5. From the person (board decision #1): the tasks widget beside the chat (`bh-tasks-widget-list`, chat.js ~:256) scrolls on its own; a wheel over it must scroll the widget, not the feed (the feed's `on_scroll_wheel` at chat.js ~:435 catches it today — stop that).

### Step 13 — composer
6. The composer shrinks to a slim bar when the feed is scrolled or it loses focus; it grows back on click or typing, never losing the draft.
7. From the person (board decision #4): attached images show as thumbnails on top of the composer box (today they render inside it, composer.js:955-972, and only when `previews()` succeeds, :494-500; otherwise a name chip). Find why a preview can fail (e.g. a pasted ScreenClip path under AppData) and make the fallback show the image file itself when readable.

## Constraints
- No new dependencies; gpui-base/gpui-kit only; muted palette via `look.js` mixing (herdr built-in themes stay calm, bot-herdr themes unchanged).
- Don't touch engine files. Don't commit.

## Done when
- Toasts animate out as smoothly as in (both kinds).
- Verbs crossfade with calmer timing; no retype flicker.
- A long reply scrolls line-by-line; feed stays pinned to newest until you scroll up; wheel over the tasks widget scrolls only the widget.
- Composer folds to a slim bar on scroll-away/blur and returns on click/typing with the draft intact; image attachments show as thumbnails above the box, including AppData ScreenClip-style paths that today fail `previews()`.
- `npm test` passes (add/adjust pure-logic tests only where they exist today, e.g. scroll math if extracted).

## If stuck
If gpui can't do a pixel scroll over the message list as described, implement the closest true pixel behaviour you can, say exactly what gpui gave you, and finish the rest. Report, don't guess.
