# Design — t-20261113-463i steps 1–2

## Summary
The chat file popup now reads with node's `fs/promises` instead of herdr's `readTextFile`; the ref path probe reads real text. Settings cards keep a fixed height and each More/Add/Advanced opens the same content in a `frame: "none"` dialog (`settings-more` → `MoreSheet`), closed by Esc, its X, or a click beside it.

## Changes
- `mods/bot-herdr/viewer.js` — `FileView.init`: `readTextFile(path)` → `readFile(path, "utf8")` (`fs/promises`); `ENOENT` → the existing "This file isn't there…" sentence, every other failure → the existing "Couldn't read this file…" sentence; the `\0` check and the `cx.spawn`/`cx.notify` shape are unchanged; `readTextFile` import removed.
- `mods/bot-herdr/settings.js` —
  - removed `this.more` and every in-place expansion;
  - `disclosure(c, kind, key, label)` now opens `openMore({ kind, key, page })` → `openOverlay({ mod: "bot-herdr", kind: "dialog", frame: "none", width: 0.6, height: 0.7, props: { view: "settings-more", … } })`;
  - new exported `MoreSheet`: header is the agent's avatar + name (or the section icon + "Add a harness" / "Classifier"), body is the page's own rows, X button, Esc via `track_focus`/`handle.focus()`, close via `closeOverlay(props()?.overlay ?? this.p.overlay)`;
  - the three in-place bodies became `Settings.agentMore(c, id)` (Arguments, Instructions, command line), `harnessMore(c)` (Key/Name/Command + Add, plus `this.problem` so a failed add is visible), `classifierMore(c)` (Use it for chips, thresholds).
- `mods/bot-herdr/main.js` — `MoreSheet` imported and registered as `"settings-more"` in `VIEWS`; view comment added.

## Brief Check
- **A real file ref opens the popup with its text** — read path proven with a real ref through `linkFiles` → `fileTarget` → resolved absolute path: `bh-file:mods%2Fbot-herdr%2Fviewer.js%3A70` → `mods/bot-herdr/viewer.js:70` → `C:\…\bot-herdr/mods/bot-herdr/viewer.js`, file exists, `readFile` returned 11,862 bytes, line 70 is the new `readFile` call. Clicking the popup in the app is not drivable headlessly: **visual check is the user's**.
- **Every Settings card keeps its size; each More opens a modal and closes on Esc/Close** — in-place branches and `this.more` are gone, so cards only ever draw essentials; the modal has X and Esc. Not visually verified (no GUI driving here); logic and check pass.
- **`node --check` on both files** — pass (`SYNTAX-OK`).
- **`tsc --noEmit`, no new TS2304/TS2552 outside `engine/`** — no TS2304/TS2552 anywhere except the pre-existing `engine/` ones; touched files show only pre-existing implicit-`any` style errors.
- **`herdr-app check mods/bot-herdr`** — `check passed: mods/bot-herdr`.
- **`node --test`** — 183 tests, 182 pass, 0 fail, 1 skipped (no headless browser).

## Verification
- `node -e` probe (feed.js `linkFiles` + `fileTarget` + `resolvePath` rules on a repo relative ref) — resolved path exists, `readFile` returned the file, correct line.
- `node --check mods/bot-herdr/{viewer,settings,main}.js` — pass.
- `npx -y -p typescript@5 tsc -p mods/bot-herdr/jsconfig.json --noEmit` — only pre-existing errors; no TS2304/TS2552 outside `engine/`.
- `herdr-app check mods/bot-herdr` — `check passed`.
- `node --test` — 182 pass / 1 skipped / 0 fail.
- `bh check` — `PASS: lint and typecheck pass, tests pass.`

## Decisions
- No access modal: the brief listed "access details", but `this.more` never held `"access"` in the shipped code (the stale comment mentioned it); the Access card has no More control and is unchanged. Nothing was invented for it.
- Modal shape follows `plandoc`/viewer: `frame: "none"`, the sheet draws its own card (fill, 1px edge, radius, `shadow_lg`), built-in dialog dim behind; no extra scrim needed at 0.6 × 0.7.
- The harness sheet is titled "Add a harness" because that panel has no card title (control label was "Add"); agent sheet uses the card's avatar + name; classifier uses "Classifier".
- The live `Settings` instance is passed through the overlay props (`page`) so the sheet reuses the page's InputStates and save paths instead of duplicating them; herdr mod copies share module code and one realm. `MoreSheet.body` falls back to "The settings page is no longer open." if the page cannot draw, so a props-plumbing surprise degrades to a message instead of a crash.
- Harness add failures now surface inside the sheet (`page.problem`); the page behind also keeps its problem line.

## Knowledge Proposals
- Overlay props can carry the caller's live Settings instance for a same-mod dialog (agent inputs, harness form, classifier thresholds); the overlay copy shares the JS realm, so the sheet reuses the page's InputStates/save methods instead of a second source of truth.
- A Settings card's More/Add/Advanced is now a `frame: "none"` dialog (`settings-more` → `MoreSheet`) sized 0.6 × 0.7; card heights are essentials-only at `CARD_H`.

## Blockers
None. Remaining evidence gap: the two visual checks (popup text in the running app, modal opens/closes) are the user's.
