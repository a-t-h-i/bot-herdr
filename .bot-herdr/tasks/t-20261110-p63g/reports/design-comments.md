# design-comments — steps 14 and 15 (view half)

## Summary
Step 14: an open question card dims the chat behind it and has a minimise button; the bar says who is waiting. Step 15: comments on agent replies, plan lines, task steps and knowledge notes each show Resolve / Edit / Delete (Reopen / Delete once resolved).
All four feed helpers are tested; `npm test` and `bh check` pass. I could not see the app, so nothing visual has been checked on screen.

## Changes
- `mods/bot-herdr/composer.js`: Esc's put-away logic is now the method `minimiseAsk(cx)` (:1663), and `close()` calls it (:377). Added a `bc-ask-min` icon button to the ask header (:1441-1452). Bar text changed to "`<name>` is waiting for your answer", with "`n` left · `m` more sets" after it (:1691).
- `mods/bot-herdr/chat.js`: added the `bh-ask-dim` backdrop (:626). Added comments on replies: `setFeed`, `commentBox`, `startComment`, `sendComment`, `tellAuthor`, `replyCommentActions`, `replyComments`, `commentInput` (:117-240), drawn under each reply (:766).
- `mods/bot-herdr/work.js`: added the exported `commentRow` (:70), shared with the chat, and `openFirst` (:63). `commentNote(c, comment, actions)` (:723) draws the inline box under a comment while it is being edited. Also added `editInline` (:267), `addingAt`, `commentActions` (:281), the edit branch in `sendInline`, `editNote` (:327) and `noteActions` (:1109). The tasks, plans and knowledge views are wired to these.
- `mods/bot-herdr/feed.js`: added `addComment`, `editComment`, `resolveComment`, `deleteComment` (:34-52).
- `test/roster.test.mjs`: one test for the four helpers (:131).

## Brief Check
1. Backdrop — met — `chat.js:624-633`. Uses `.bg(c.ground).opacity(0.6)` rather than `alpha()`, because a theme's `ground` may not be a 6-digit hex (look.js:184 takes it from the theme). `inset_0` and `opacity` are in the typings. It blocks mouse down and wheel.
2. Minimise button — met — `composer.js:1441-1452`. Esc and the button both call `minimiseAsk` (:1663), so the logic is not duplicated.
3. Chip — met — `composer.js:1691`. It now names who is waiting and keeps the `ask` icon. Clicking it still runs `putAway.delete` and reopens the card.
4. `commentNote` look — met — `work.js:70` (`commentRow`) and `:723`. The three links are 11.5px, `c.faint`, hover `c.ink`. A resolved comment is drawn at opacity 0.55 with `line_through()` (in the typings), and shows Reopen and Delete. Link ids are `<key>-resolve|edit|delete|reopen`, built from the comment id. Edit opens the box with `commenting = {kind,id,at,edit}`, and sending runs `--edit` (:299).
5. Tasks — met — `work.js:615` lists all comments, open ones first. The links go through `this.act` (:281-290), which reloads. Reopen is `--edit` with the same text. The step badge counts open comments only.
6. Plans — met — `work.js:983`, `:1021`. Same actions with `plan`. Line comments are filtered in work.js, because `doc.js` `commentsOn` drops resolved ones and doc.js is not one of my files. `commentsOn` is still imported and used nowhere else in work.js.
7. Knowledge — met — `work.js:1109` (Resolve and Delete both unnote) and `:327` (Edit is unnote, then note, then `sendFromChat` with the brief's text). Adding a note still sends the existing, more detailed message, which already tells the Orchestrator. I kept it rather than replace it with the shorter wording.
8. Replies — met — feed helpers `feed.js:34-52` are tested. Under each reply:
   - A `bh-e-c-<id>` Comment link opens one box at a time.
   - Enter saves the comment with `addComment` and sends it to the reply's `e.from.address` through `composer.runStep({do:"send"})`, the same path `send()` uses.
   - If that agent is gone, the comment goes to the Orchestrator through `composer.sendText` with "(`<name>` is no longer running) " in front.
   - An edit is sent again with "Changed comment: " in front.
   - Resolve, Delete and Reopen change the feed and save it.
- Done when: `npm test` passes with the helper tests — met (92 pass, 1 skipped, 0 fail).
- Done when: the `bh-ask-dim` and `bc-ask-min` greps each print a line — met (chat.js:626, composer.js:1441).
- Done when: the `--edit` / `--delete` / `--comment` grep shows task and plan — met in behaviour, not literally. One `commentActions(kind, …)` (:286-299) builds both `["task", …]` and `["plan", …]`, so the grep prints lines with `kind`, not the words "task" and "plan".

## Verification
- `npm test` — 93 tests, 92 pass, 1 skipped, 0 fail.
- `bh check` — PASS (lint and typecheck: none set up for these files; tests pass).
- `node --check` on chat.js, work.js, feed.js and composer.js — ok.
- Not seen in the app: the backdrop's layering (it is drawn before the composer, so it sits under it); typing in a reply's comment box while the composer is folded; how the links align in narrow knowledge cards.

## Notes / deviations
- Comment box placeholder: InputState has no placeholder setter (`gpui-kit.d.ts:21365`, set only in `new`). So I make one box per agent name, lazily, cached in `this.commentBoxes`, instead of a single box made in `init`.
- Possible issue: the chat root's `on_key_down` (`chat.js` ~:600) sends typed keys to the folded composer. If the comment Input does not stop key propagation, typing in a comment while the composer is folded could also type into the composer. I could not confirm this from the typings.
- Edited task and plan comments are not sent to the Orchestrator, because the brief asks that only for knowledge notes. The engine stores the edit.
- Design choices: the bar's second line is `n left · m more sets` (decided by me). The dim is `ground` at 0.6 opacity (decided by the brief).

## Knowledge Proposals
- `InputState` placeholder is fixed at creation (no setter); a per-target placeholder needs one state per target.
- `work.js` exports `commentRow(c, comment, actions)`: the shared comment look with Resolve/Edit/Delete links, also used by chat.js.
