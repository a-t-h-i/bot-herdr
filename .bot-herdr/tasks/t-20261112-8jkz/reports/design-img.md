## Summary
A sent image chip now opens its picture large in the lightbox, and the message's other pictures step beside it; non-image chips still open the file viewer.
Checks pass; the click path is verified by reading the code, not by running the app.

## Changes
Only `mods/bot-herdr/chat.js`:
- Imports: `appHome` added to the `herdr` import; `previews` and `isImage` added to the `./media.js` import.
- Module helpers after `save`: `underHome(path)` returns the path relative to the app home (or null when it is outside it); `shownImages(paths)` keeps only the paths that exist (`fs.exists`), maps app-home paths to their relative form, and gets the others from `previews()`, falling back to the path itself.
- `mine()`: the chips map is now `this.sentChip(c, e, name, i)`.
- New `sentChip(c, e, name, i)`: the same chip as before; the glyph is `image` for an image path and `file` otherwise; an image opens `openSent`, anything else still calls `openFile({ path })`.
- New `openSent(e, i, cx)`: lists the message's image paths (title from `e.files`), resolves them inside `cx.spawn`, and opens `openLightbox` at the clicked one with note `Sent <clock(e.at)>`. A clicked picture that is gone shows `composer.say(…, "error")` and opens nothing.

Not touched: composer.js, lightbox.js, media.js, viewer.js, storage of `e.files` / `e.paths`, every other file.

## Brief Check
1. Non-image chip still opens the viewer: met. Same `openFile({ path })` call, reached when `isImage(path)` is false.
2. Image chip opens the lightbox at that picture, with steps between the message's images: met by reading. `items` is every existing image of the message; `at` is the clicked one's index. Not run in the app.
3. `image` is a path image() can show, previews only on click: met. Under the app home: the relative form. Others: `previews`, falling back to the path. Called only inside `cx.spawn` on click.
4. Image chip shows the `image` glyph: met. `mods/bot-herdr/icons/image.svg` exists.
5. Missing file: met. Missing images are left out of the lightbox. If the clicked one is missing, nothing opens and an error notice shows: `Couldn't open <name>: it is no longer there.` (the same `composer.say(…, "error")` chat.js uses at its other failure points).

Done when:
- Image chip opens the lightbox and steps between two images: met by reading only (not run in the app).
- Non-image chip opens the viewer: met by reading.
- No new TS2304/TS2552 in chat.js: met (0 before, 0 after).
- `herdr-app check mods/bot-herdr` passes: met.
- `bh check` passes: met.

## Verification
- `herdr-app check mods/bot-herdr` — "check passed: mods/bot-herdr"
- `node …/engine/bh.mjs check` — "PASS: lint and typecheck pass, tests pass" (it reports no typechecker or tests set up for these files)
- `npx -y -p typescript@5 tsc -p mods/bot-herdr/jsconfig.json --noEmit` — chat.js TS2304/TS2552: 0 before and after. chat.js total went from 181 to 199: the 18 new lines are all TS7006 (implicit any on untyped parameters), the same kind the file already has. My first version also raised TS2339 for `fs.access`; that is gone, since the runtime's `fs/promises` has no `access`.
- Not run: launching herdr and clicking a sent chip. The lightbox opening and stepping are unverified in the live app.

## Knowledge Proposals
- The runtime's `fs/promises` (gpui-kit.d.ts:22141) declares readFile, writeFile, readdir, exists, unlink, rmdir and mkdir only: no `access` or `stat`.
- `previews()` / `bh preview` return image paths relative to the app home (engine/lib/media.mjs `appPath`); an absolute path is only the fallback.

## Script Proposals
None.

## Pushback
- Pasted and other app-home pictures are passed to image() in the relative form (`data/bot-herdr/pasted/…`), not the absolute path the brief named. gpui-kit.d.ts:20285 says image() loads from "the application's own directory", and `bh clip` / `bh preview` return this same relative form, which the composer already displays. If image() also takes absolute paths, nothing changes; I could not confirm that here.
- Risk: `previews()` refuses images over the size limit (media.mjs `MAX_BYTES`), so such a picture falls back to its absolute path, the same as the composer does. image() may not show it. Not changed.
- mine() was already about 55 lines before this change. The chip moved out, so it is shorter but still over 20 lines; I did not split it further.
