# QA gate — t-20261111-z6ov (browser up + composer scrim)

## Summary
Verdict: **PASS**. Both steps hold on reading plus deterministic checks: up now walks Desktop → user → `C:\Users` → `C:\` → drive list with the button and Backspace disabled there, and every pane stops presses/wheel before the scrim. Two minor defects found (dim with no card on a no-match suggest query; `upFrom` not exportable so its new rule is untested); neither breaks a criterion.

## Changes
None — review only. Files inspected: `mods/bot-herdr/chat.js`, `mods/bot-herdr/composer.js`, `mods/bot-herdr/look.js` (working-tree diff vs `e4788dc`), plus `mods/bot-herdr/route.js`, `layouts/bot-herdr.json`, `test/browse.test.mjs`, `gpui-kit.d.ts`.

## Brief Check
1. **Clicks inside a pane no longer hit the scrim** — met, by handler order: `chat.js:683-689` registers the scrim press/wheel only while `paneNow()` is a pane; `composer.js:1627-1628` stops both on `bc-pane-row`, which contains everything a pane draws (`paneView` returns the row and its body, `composer.js:1614-1644`) — suggest rows, attach menu, browser header/up/close/search/list/hidden/attach, spaces picker, ask options and mockups. The box stops presses itself (`composer.js:1162-1167`). Inner controls keep firing: gpui dispatches front-to-back and the stop runs after the row's own `on_click`, so nothing is swallowed. Evidence that a stop blocks a *sibling behind* (not just ancestors): the pre-existing `bh-tasks-widget` wheel stop (`chat.js:403,427`) and `bc-browse-list` (`composer.js:725`) exist for exactly that, and the reported bug is that very mechanism firing (a press on a row reached the dim behind it and closed the pane before the release).
2. **Scrim with no pane open does not block** — met as far as the API permits: handlers are only attached under `.when(pane && pane !== "bar", …)` (`chat.js:686`), so with no pane the element carries no listener. This kit exposes no occlusion API (no `occlude`/`block_mouse` in `gpui-kit.d.ts`; taking the pointer requires a handler), so an id- and bg-only div runs nothing and the press/wheel continues to the feed, links, reply actions, task widget and Jump to latest. Not executed — see Findings (5); the browser has no pointer-injection command (`herdr-app commands` has none) and I must not drive the person's window.
3. **Going up** — met. `upFrom` (`composer.js:67`) maps a drive foot (`^[a-z]:[\\/]$`) to `""` and otherwise delegates to `parentPath`; `""` and `/` give `null`, so `parent !== null` disables the button (`composer.js:762`) and Backspace returns (`composer.js:745`). Chain verified against the real backend: `bh files "C:\\" --json` → `path: "C:\\"` (trailing separator, so the regex matches), `bh files "C:/Users" --json` → `path: "C:\\Users"`, `parent: "C:\\"` (agrees with `upFrom`), `bh files "" --json` → `path: "C:\\"` with one drive row `path: "C:\\"`, and `loadBrowse` forces `""` for the drive list so the header reads "Drives" (`composer.js:589-591, 763`). Selection is pruned against the new listing as before (`composer.js:594-595`). Foreign spaces unchanged: `openFolder`/`loadBrowse` return early on `b.foreign`, the up control stays disabled, and the header still reads "Another machine". No test added: `upFrom` is module-local and `composer.js` imports `gpui-kit`/`herdr` at load, so no test can reach it (finding 2).
4. **Ask pane** — met. The scrim press returns without closing when `pane === "ask"` (`chat.js:686`), so a stray press neither dismisses the card nor `minimiseAsk`s it; the option rows, Back and mockup expand are inside `bc-pane-row` and keep their presses. The minimised bar does not dim: `paneNow()` returns `"bar"` and the scrim is `opacity 0` with no handlers (`chat.js:679-689`).

## Findings
1. **[minor]** `mods/bot-herdr/composer.js:1499-1501` — `paneView` returns `null` when `rows()` is empty, but `paneNow()` still returns `"suggest"`, so `chat.js:677-689` dims the whole feed and task widget and eats the wheel with no card on top. Failure scenario: type `@zzzq` or `/zzzq` (nothing matches — `route.js:46-51` returns `[]`), and the window goes dark behind the composer while the user keeps typing; only the panes that always draw a body (attach, spaces, ask) were dimmable before this change. Fix: key the scrim on the pane actually drawn (a `paneShown()` beside `paneNow()`, or `pane !== "suggest" || this.composer.rows().length`).
2. **[minor]** `mods/bot-herdr/composer.js:67` — the one new pure rule (a drive foot goes to `""`, not `null`) is unexported in a module that pulls `gpui-kit`/`herdr` at import, so `test/browse.test.mjs` cannot cover it; a regression to `parentPath` (which already returns `null` for `C:\`) would silently make the drive list unreachable again and no test would notice. Cheapest fix: move `upFrom` next to `parentPath` in `look.js` and add one case to the existing `browse.test.mjs` (`upFrom("C:\\") === ""`, `upFrom("") === null`, `upFrom("/") === null`). Not raised as blocking: the brief made the test conditional on exportability.
3. **[info]** `mods/bot-herdr/composer.js:799` with `628-632` — at the drive list the primary button still reads "Attach this folder" and does nothing when pressed, because `attachBrowse` requires a truthy `b.path` and `""` is falsy. Newly reachable place, no feedback, no crash.
4. **[info]** `mods/bot-herdr/chat.js:677-689` — only the box and the pane row stop presses; the toast (`composer.js:1360`) and the attachments row do not, so a press on a toast action closes the pane and the column reflows under the pointer, which can lose that click. It matches the agreed rule ("a press on the scrim puts the pane away"), so behaviour, not defect.
5. **[info]** `mods/bot-herdr/chat.js:677-689` — unverified by execution: the opacity-0 scrim must be pointer-transparent when no pane is up. Reasoning is from the kit's surface (no occlusion API; a handler is the only way to take the pointer, and the shipped widget/list wheel stops rely on that same dispatch order), not from a run. No click simulation exists (`herdr-app commands` has no pointer command), and I did not touch the person's window.
6. **[info]** pre-existing, `mods/bot-herdr/composer.js:570-601` — `loadBrowse` has no request token: two quick ups (or up + a row) can let the older `bh files` answer land last and overwrite `b.path`/`b.entries` with the folder above. Not introduced here, but up is now reachable by pointer so the race is easier to hit; a `b.seq` check would close it.

## Verification
- `bh check` — PASS: lint and typecheck pass, 19 tests pass (browse, contrast, themes).
- `timeout 300 npm test` — 144 tests, 143 pass, 0 fail, 1 skipped.
- `bh files "C:\\" --json` — `path: "C:\\"`, `parent: null`, entries `path: "C:\\…"` (proves the drive-foot regex matches the real value).
- `bh files "" --json` — `path: "C:\\"`, single drive row `{"name":"C:\\","path":"C:\\","dir":true}` (drive list is real; `loadBrowse` overrides `path` to `""`).
- `bh files "C:/Users" --json` — `path: "C:\\Users"`, `parent: "C:\\"` (agrees with `upFrom`).
- `herdr-app check mods/bot-herdr` — `check passed: mods/bot-herdr` (mod loads, no undefined names at load).
- Read: `chat.js:600-760`, `composer.js:339-420, 530-800, 1085-1230, 1479-1660`, `look.js:101-134, 258-262, 354-362`, `route.js:46-58, 96-111`, `layouts/bot-herdr.json:94-178`, `gpui-kit.d.ts:300-340, 470-540, 720-800`, `test/browse.test.mjs`.

## Knowledge Proposals
- `qa`: In this mod, `bh files ""` returns `path: "C:\\"` plus one row per drive — a mod that must remember "the drive list" has to hold `""` itself, because the backend never echoes it.
- `qa`: `herdr-app` has no pointer-injection command; scrim/hit-test behaviour can only be reasoned about from `gpui-kit.d.ts` (no occlusion API ⇒ only a handler takes the pointer) and from shipped stop_propagation precedents.

## Script Proposals
None.

## Blockers
None.
