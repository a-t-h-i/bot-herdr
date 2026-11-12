## Summary
The Plans page's box is the chat composer's construct pinned to the page's foot, folds to the chat's slim bar on a press in the conversation, and every page composer now shows the agents' open questionnaires and sends answers back through `bh answer`.
Verified live: the box foot is 10px above the page foot in both pages (12–13 physical px at 1.25 zoom), the folded bar keeps that foot, and a card open in the outbox shows on the chat, Plans and Tasks composers alike.

## Changes
- `mods/bot-herdr/work.js`
  - `PAGE_CHROME` (`SPACE[5] + CONTROL + GAP`), `QUESTIONS_MS` (`2500`, the chat's cadence).
  - `this.handle = cx.focus_handle()` — holds the keyboard while the box is folded.
  - `this.open = new OpenQuestions()` — the agents' open questions, read here as the chat reads them.
  - `shownPlan()`, `planBoxFolded()`, `foldPlanBox(cx)` — the Plans-column predicate and the fold on a conversation press (the chat's feed handler, with the `commenting` guard).
  - `readQuestions(cx)`, `answerQuestion(composer, q, answers, cx)`, `hasComposer()` — poll and answer for the page's boxes; `readQuestions` also runs on `show(tab)`.
  - `pageComposer()` takes `onAnswer` and wires `comp.hooks.answered`.
  - `init` — both page composers answer through `answerQuestion`; questions poll at `QUESTIONS_MS` and once at start.
  - `render()` — root `track_focus(this.handle)` plus the chat's `on_key_down` (`typeFolded` while folded); the shown tab's composer gets `this.open.list` (Tasks → `taskComposer`, Plans → `planComposer`, Knowledge none); page content is `pt(SPACE[5])` and keeps its `pb` only when no plan column is drawn.
  - `planColumn()` — `this.height - PAGE_CHROME` instead of `- 110`; `relative()`; the conversation folds the box on a press and pads `SIZE.foot + composer height + View plan tab + SPACE[4]` at its foot; the box (tab + composer) is an `absolute().left(0).right(0).bottom(SIZE.foot).items_center()` child drawn after the scroll area.
- `mods/bot-herdr/questions.js` (new) — `OpenQuestions`: `poll()` reads the outbox questions folder and lists the open records oldest first, `drop(q)` takes a card off the list at once, `send(q, answers, file)` posts `bh answer <id> --json --data <enc(answers)>` and reports `{ sent, ok, why }`, restoring the record on the next poll when it cannot go.
- `mods/bot-herdr/chat.js` — extraction only: the local `questionsDir`, `this.qfiles` and `this.questions` give way to an `OpenQuestions` (`this.open`); `readQuestions` is `if (await this.open.poll()) cx.notify()`; `submit` drops the card, adds the feed entry and sends through `this.open.send` with the same "Couldn't send your answers" toast and "Saved, but … didn't get them" note; render feeds `this.open.list`.
- `composer.js`, `plandoc.js`, `chat.js` beyond the extraction: unchanged.

## Brief Check
- Box pinned at the page bottom, `SIZE.foot` above it, no padding below — met. Shots: box bottom border y=1031 physical, block foot y=1045 (14 px ≈ 10 logical at 1.25); the chat shot measures 1032/1045 for the same pair.
- Press on the conversation folds to the slim bar, typing brings it back with the draft intact — ported 1:1 from chat.js:667-671 and its key handler; `Composer.typeFolded` → `input.replace` → `changed()` sets `expanded` back. Folded render shot: bar 982→1031 (40 logical), View plan tab flush above it, 10 logical above the block foot. The press/typing themselves were not exercised by me (`herdr-app` has no input injection, the desktop is the user's).
- View plan tab works in both states — drawn on the box's top edge in the full and folded shots; `viewPlanTab`/`tuckThenPlan`/`openPlan` unchanged.
- Comments send and toasts — unchanged paths (`planComposer.send` → `sendPlanText`; toasts are `Composer`'s own absolute overlay on the same positioned wrapper as the chat's).
- Narrow Plans page — met by construction, not exercised: `narrowPlan` uses the same `planColumn`; narrow changes only the rail and the column width. No window resize through `herdr-app`.
- Conversation scroll end clears the box — met by construction: the scroll area pads `SIZE.foot + box + tab + SPACE[4]`, folded or full (`Composer.height(w)` follows the fold).
- Every page with a composer shows the cards, Knowledge none — met. Shots: the same record open on the Plans composer and on the Tasks composer (task pane, "1 of 3"), and on the chat; the Knowledge tab is skipped by `hasComposer()` and has no composer to feed.
- Same folder, same cadence, answered ones go from the others — met: `OpenQuestions.poll()` every 2500ms; a record answered outside the pages (`bh answer`) left no open `.json` and the cards were gone on the next poll; the card the user answered in the app (`q-20261112-cardcheck`) disappeared from the Tasks shot taken after it.
- Answers go back exactly as the chat's — met by construction: `OpenQuestions.send` is the chat's former `bh answer` call verbatim, fed the composer drawer's payload (`Drawer.payload`), so picks and typed text both travel identically; the page's failure toast reads "Couldn't send your answers: …" as the chat's does.
- Round-trip in the app — the user answered two live asks (`q-20261112-6q2x`, `q-20261112-7t2d`) and a hand-fed one in the app; each record turned `answered` with the picked payload, and the answers reached the asking terminal. The page each was answered from cannot be attributed from here.
- `herdr-app check mods/bot-herdr` — passed (repo and installed copy). `bh check` — passed. `npm test` — 176 pass, 1 skipped. `git diff` touches `chat.js` and `work.js` only, plus the new `questions.js` (the `.bot-herdr/plans/*` deletions predate my work).

## Verification
- `herdr-app check mods/bot-herdr` — passed (repo folder and the installed copy via `install.mjs`).
- `bh check` — passed; `npm test` — 176 pass, 0 fail, 1 skipped.
- `node install.mjs` — installed the mod, `check passed`; repo and installed `work.js`/`chat.js`/`questions.js` compare identical afterwards.
- Temporary plan with a draft + `herdr-app do layout.select --stack pages --child plans` + `herdr-app shot` — full box pinned at the page foot under the View plan tab; plan deleted afterwards.
- Folded render: the installed copy temporarily started with `planComposer.expanded = false`, shot showed the slim bar (982→1031, 40 logical) with the tab on its top edge and the same 10px foot; reinstalled from the repo straight after.
- Live ask via the installed engine (`bh ask … --json`) then `herdr-app shot` on Plans and Chat — card on both composers; a hand-fed open record (`q-20261112-cardthree`, written into the app's questions dir) gave the Tasks shot ("1 of 3"), then `bh answer` from the CLI turned it answered and the cards went; the record and my other test records were deleted from `answered/`.
- `bh answer` round-trip: `q-20261112-cardthree` answered with the same payload shape `bh answer` takes → `{ "ok": true }`, questions folder left with no open `.json`; answered records kept in `answered/` only as long as needed, then removed.

## Design choices
- fold trigger: a press on the conversation column (`on_mouse_down` on the scroll area), the chat's feed handler, with its `commenting` guard.
- folded bar: the shared `Composer.slim` (40px), draft or placeholder text; no re-style.
- box bottom: `SIZE.foot` above the page's foot (the chat's value).
- conversation foot padding: `SIZE.foot + composer height + View plan tab + SPACE[4]`, as scroll padding.
- box width: unchanged — `planComposer.render(cx, w, this.height)` → `min(SIZE.maxWidth, w − 2×SIZE.gutter)`.
- column height: `this.height − (SPACE[5] + CONTROL + GAP)`, keeping the old `max(300, …)` floor for very short windows.
- question cadence: 2500ms, the chat's `POLL_MS`.

## Notes
- Wheel scrolling does not fold the box: the conversation is a native `overflow_y_scroll` area and the brief's step names the press. If "shrink on scroll" should include the wheel, it needs an `on_scroll_wheel` on the conversation and a check that native scrolling still runs.
- Folded with an empty draft, the slim bar shows the shared `Composer`'s generic placeholder, not the plan's — the shared class's slim bar, not forked.
- The box's attachments row is not counted in the padding, so a plan with attachments loses ~40px of clear space at scroll end; the chat's `foot` has the same gap.
- On Tasks the card is drawn in the composer's flow: the task pane's scroll area shrinks rather than the card floating over it — that composer is not pinned (out of scope), and the chat's ask pane grows the same way.
- The page composers' "Saved, but …" case is a toast ("Saved, but the agent didn't get them: …"), where the chat writes a feed note; the send failure is the chat's exact toast text and level.
- Live test data was cleaned: the two test asks' answered records and the hand-fed record were deleted; a temporary plan was deleted. `data/bot-herdr/questions/q-20261112-0zy3.json` in the repo is not mine and was left alone.

## Knowledge Proposals
- work.js page chrome: the page content's `pt(SPACE[5])`, the tab/refresh row (`CONTROL`) and its `GAP` make up the height above a page body — `PAGE_CHROME` in work.js; a column that must reach the page's foot sizes itself `this.height - PAGE_CHROME` and the page drops its `pb(SPACE[5])`.
- `Composer.height(width)` is the box height a page pads its own scroll area by; the chat's feed foot is `SIZE.foot + composer.height(width) + SPACE[4]`.
- A page composer folds like the chat's only if the page has a `cx.focus_handle()` on its root with `track_focus` and forwards `e.key_char` to `composer.typeFolded` while `composer.isFolded()` — `Composer.changed` (input change) is what sets `expanded` back to true.
- Agents' open questions live in `<app home>/data/bot-herdr/questions/q-*.json` (an answer moves the file to `answered/`); the engine resolves the app home from its own path, so the repo engine writes to `data/` in the repo while the installed engine writes to the app's home — a live question must be asked with the installed engine.
- `OpenQuestions` (questions.js) is the one read/answer path for every page composer: `poll()` → `drop(q)` → `send(q, answers, file)`; `hooks.answered` on a page composer must be wired or its cards cannot go.

## Script Proposals
None.
