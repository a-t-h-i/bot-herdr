Goal: step 1 of task t-20261112-8jkz. The person: "I can't open / expand images that I had sent to the chat once it's already sent." Today a sent message shows each attachment as a chip; clicking it calls openFile (the text viewer), which can't show a picture. Make a click on an image attachment open it large in the lightbox, the same way the composer opens images before they are sent.

Files (repo at C:/Users/athenkosi.hlubi/Desktop/bot-herdr):
- Change only mods/bot-herdr/chat.js, in mine() at chat.js:783-797 (the `chips` map).
- Imitate composer.js:791-795 (openImages) and chat.js:888-899 (picture(): how a reply's mockups open in the lightbox).
- Use, don't change: lightbox.js:20 openLightbox({ items, at }), media.js:72 previews(files) and media.js:78 isImage(path), viewer.js:30 openFile.
- Leave composer.js, lightbox.js, media.js, viewer.js and every other file alone.

What to do:
1. In mine(), keep the chip exactly as it is for a file that is not an image (isImage(path) false): it still opens openFile({ path }).
2. For a chip whose e.paths[i] is an image, on click open the lightbox with every image attached to that message, starting at the one clicked: items = the message's image paths mapped to { image, title: its name from e.files, note: "Sent " + the message's time as the bubble shows it }. Use the shown time helper chat.js already uses for messages (find it; don't add a new one).
3. `image` must be a path herdr's image() can show. A picture pasted from the clipboard already lives under the app home (data/bot-herdr/pasted/...). For any other path, get it from previews([paths]) (it returns [{ file, image } | { file, error }]); fall back to the absolute path, as composer.js:762-763 does. Call previews only on click, inside cx.spawn or the same async pattern chat.js uses elsewhere, never during render.
4. An image chip shows the "image" glyph instead of "file" if mods/bot-herdr/icons/image.svg exists; if it doesn't, keep "file" and say so.
5. A missing file (deleted since it was sent): the lightbox must not open empty and nothing must throw. Show the same notice chat.js shows elsewhere when something can't be opened, or do nothing if there is none, and say which you did.

Constraints: no new dependency, no new file, no change to how messages are stored (e.files and e.paths stay as they are), no thumbnails in the bubble. Functions stay at or under 20 lines; extract a small helper method on the class if mine() would grow past that.

Done when:
- Clicking a sent .png/.jpg chip opens the lightbox at that picture; with two images attached, the lightbox steps between them.
- Clicking a sent non-image chip still opens the file viewer.
- `npx -y -p typescript@5 tsc -p mods/bot-herdr/jsconfig.json --noEmit` shows no new TS2304/TS2552 in chat.js.
- `herdr-app check mods/bot-herdr` passes.
- `node "C:/Users/athenkosi.hlubi/.config/herdr-app/mods/bot-herdr/engine/bh.mjs" check` passes.
Report which criteria you verified and how. Do not run node install.mjs and do not commit.

If stuck: if openLightbox can't show an absolute path outside the app home, or previews() doesn't return what this brief says, stop and report it with what you saw.
