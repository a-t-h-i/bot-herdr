# Design brief — t-20261113-463i: chat file popup loads its text; Settings "more" opens as a modal

## Goal
Two user reports, both in the mod's UI layer:
1. Clicking an inline file ref in a chat reply opens the file popup, but the text contents never load.
2. On the agent Settings cards, "More" should open a modal instead of expanding the card in place, so every card keeps one size and look.

## Files
- `mods/bot-herdr/viewer.js` — item 1.
- `mods/bot-herdr/settings.js` — item 2.
- A throwaway diagnostic note if needed (delete before finishing); no other files.

## Item 1: the file popup's text never loads
Facts already established:
- The ref pipeline is pure and looks right: `feed.js` `linkFiles` → `FILE_LINK` url → `fileTarget` (`feed.js:203`) → `openFile({ path, line, root: projectDir() })` (`chat.js:816-817`) → `viewer.js` `init` reads it with herdr's `readTextFile(path)` inside `cx.spawn` (`viewer.js:67-80`).
- The dialog opens (the user sees it), the text does not arrive — so suspect the read itself, not the routing.
- herdr's `readTextFile` (`herdr.d.ts:26`) is the app's scoped helper; the mod already reads the disk with Node directly where it must (chat.js imports `fs/promises` and uses `fs.exists`, `fs.mkdir`). Node reads work for project paths (verified: reading a repo file with `fs.readFileSync` returns its text).
1. Confirm the path is good: for a real ref from the current feed (pick one from `~/.config/herdr-app/data/bot-herdr/activity`, or reconstruct `linkFiles`/`fileTarget`/`resolvePath` in a throwaway `node -e`), check the resolved absolute path exists on disk.
2. Replace the read in `viewer.js` `init` with `fs/promises` (`readFile(path, "utf8")`, imported as chat.js does): `ENOENT` → the existing "This file isn't there…" sentence; anything else → the existing "Couldn't read this file…" sentence. Keep the null/`\0` checks' wording and the `cx.spawn`/`cx.notify` shape exactly as they are (that part follows the kit's context rules).
3. Keep herdr's `readTextFile` out of viewer.js entirely once done (no dead import).

## Item 2: Settings "More" as a modal
Today `this.more` (a Set of keys: an agent's id, `"access"`, `"harness"`, `"classifier"`) grows the card in place (`settings.js:565-568` the toggle, `:638/:673` the agent card, `:864` harness, `:915/:949/:953` classifier).
1. Turn the same control into opening a modal: `openOverlay({ mod: "bot-herdr", kind: "dialog", frame: "none", width: 0.6, height: 0.7, props: { view: "settings-more", key, … } })` — follow `plandoc.js` `openPlan` (:92-101) for the overlay shape and `viewer.js` for dialog basics (Esc close via the view's own key handling, Close button, `closeOverlay(props()?.overlay ?? this.p.overlay)`). Dark page behind: the built-in dialog dim already does it (plandoc adds its own scrim on top only because it is frame:none full-window — a modal like yours can rely on the built-in dim, or add the same scrim if the frame:none look needs it; pick what matches plandoc's look).
2. The modal shows exactly the content that today expands (agent extra fields, access details, harness table detail, classifier detail) with the card's title as its header, and Close. The card itself never changes height; the control keeps its label logic ("More" …).
3. Implementation shape: a small exported class in `settings.js` (e.g. `MoreSheet`) plus registration in `main.js`'s `VIEWS` (`settings-more`), the way `plandoc`/`viewer` register. It may need pieces of the Settings instance (the inputs/state) — pass what it needs through props or rebuild the rows as pure functions of shared state; do NOT hand a live `cx` across (kit rule: callbacks receive their own cx). If the classifier/harness sections need live state you cannot pass cleanly, scope the modal to the agent cards and the access section, and say so in the report.
4. `this.more` and its in-place expansion go away with this (no dead state).

## Contracts
- No changes outside `viewer.js`, `settings.js`, `main.js` (one view registration) — engine files are being changed by another agent right now; do not touch `engine/`, `test/`, `bh.mjs`.
- Reuse look.js tokens (SIZE, SPACE, TYPE) and existing helpers (`sectionLabel`, `actionButton`); no new dependencies.

## Done when
- A real file ref in a chat reply opens the popup with its text showing (verify in the app if you can drive it; otherwise verify the read path with a `node -e` probe on the same resolved path and say the visual check is the user's).
- Every Settings card keeps its size; each "More" opens a modal with the section's content and closes on Esc/Close.
- `node --check` on both files; `npx -y -p typescript@5 tsc -p mods/bot-herdr/jsconfig.json --noEmit` shows no new TS2304/TS2552 outside `engine/`; `herdr-app check mods/bot-herdr` passes.
- Existing tests still pass (`node --test` from the repo root).

## If stuck
If herdr's dialog cannot host the settings sections (state you cannot reach), stop item 2's blocked part, finish the rest, report exactly what refused.
