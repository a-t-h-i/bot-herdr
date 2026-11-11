# Design brief — step 14 (question card backdrop and minimise) and step 15 (inline comments), t-20261110-p63g

## Goal
Step 14: an open question card dims what is behind it and has a visible minimise button; minimised it is a small chip that reopens it, and the asking agent keeps waiting. Step 15: the person can comment inline wherever text is (agent replies in the chat, plan lines, task steps, knowledge notes) and resolve, edit or delete each comment. Typings for every gpui call are in `mods/bot-herdr/gpui-kit.d.ts`: read an API's doc comment there before using it; never call an API through `?.` to hide that it may not exist.

## Files
- Change: `mods/bot-herdr/composer.js` (step 14 only), `mods/bot-herdr/chat.js`, `mods/bot-herdr/work.js`, `mods/bot-herdr/feed.js` (pure helpers), `test/*.test.mjs`.
- Leave alone: `mods/bot-herdr/engine/**` (Dev is changing it now), `settings.js`, `look.js`, `route.js`, `toast.js`, `indicators.js`, `working.js`.

## What to do

### Step 14 — question card
The card is the composer's "ask" pane (`composer.js` `paneNow()` :771 returns `"ask"`, or `"bar"` once put away; `this.putAway` :88; Esc puts it away at :378; the bar reopens it at ~:1670). So minimise and reopen already exist behind Esc.
1. Backdrop: while `paneNow() === "ask"`, `chat.js` draws a dim layer over the feed and the tasks widget, under the composer: in `render()` add, just before the composer's wrapper child (~:491), `.when(this.composer.paneNow() === "ask", (el) => el.child(div().id("bh-ask-dim").absolute().inset_0().bg(alpha(c.ground, 0.6)).on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_scroll_wheel((_e, cx) => cx.stop_propagation())))`. Check `inset_0` in the typings (use `top(0).left(0).right(0).bottom(0)` if it is missing). `alpha` comes from `indicators.js`. If `c.ground` is not a 6-digit hex in some theme `alpha` returns it unchanged (opaque): in that case use `.bg(c.ground).opacity(0.6)` instead; pick one and say which.
2. Minimise button: in the ask pane's header (`askBody`, find it from `paneView` ~:1236), add an icon button at the top right, id `bc-ask-min`, 22×22, rounded 6, `svg(ICON("chevron-down"))` size 12 in `c.muted`, hover `bg(c.hover)`, `.tooltip("Minimise: the agent keeps waiting")`, whose click does what Esc does at :378 (`this.putAway.add(this.asking().id)`, then `cx.notify()`). Reuse that code path; do not duplicate its logic if it is a method.
3. The minimised chip: the existing bar (`barBody`, ~:1660-1680). Make sure it reads "`<agent name>` is waiting for your answer" with the `ask` icon and that clicking it reopens the card (it calls `this.putAway.delete(q.id)` today). Change the wording only if it does not already say who is waiting.

### Step 15 — inline comments
Shared look (use the existing `commentNote` and `inlineBox` in `work.js` :645 and :658 as the base):
4. `commentNote(c, comment, actions)` in `work.js`: the note shows the text, and on its right three small text links, each 11.5 px in `c.faint` with hover `c.ink`: `Resolve`, `Edit`, `Delete`. A resolved comment (`open === false`) is drawn at opacity 0.55 with the text struck through if the typings have `line_through()` (else just dimmed) and shows only `Reopen` and `Delete`. `Edit` puts the comment's text into the inline box (`this.inline.set_value(text)`) with `this.commenting = { kind, id, at, edit: <cid> }`; sending then calls the edit command instead of adding. Give every link a stable `.id(...)` built from the comment id.
5. Tasks page (`work.js` ~:541-640): today only open comments are listed (`filter((x) => x.open !== false)` at :541). List all of them, open first. Wire the links to the engine (contract below) through the existing `this.act([...], cx, (r) => …)` helper, then reload as the other actions do. `Reopen` is the edit command with the same text.
6. Plans page: the same for a plan's line comments (`sendInline` ~:233-262 and wherever plan comments are drawn; `commentsOn` from `doc.js`).
7. Knowledge page: a note on a knowledge entry already exists (`bh knowledge note <agent> "<entry words>" "<note>"`, taken back with `bh knowledge unnote <agent> --at <at>`, drawn ~:1073). Give those notes the same three links: `Delete` and `Resolve` both take the note back (unnote); `Edit` is unnote then note with the new text. When a note is added or edited also tell the Orchestrator with `sendFromChat(\`The person commented on ${agent}'s knowledge entry "${entry words}": ${text}\n\nTake it into account or say why it needs no change.\`)`, as the plan and task comments do at :134 and :258.
8. Agent replies in the chat (`chat.js` `reply(c, e, width)`): 
   - In `feed.js` add pure helpers with tests (the feed tests are in `test/roster.test.mjs`): `addComment(entries, entryId, text, at)` → new entries array where that entry has `comments: [...old, { id: "c<max+1>", text, at, open: true }]`; `editComment(entries, entryId, cid, text, at)` (sets `text`, `edited: at`, `open: true`); `resolveComment(entries, entryId, cid)` (`open: false`); `deleteComment(entries, entryId, cid)`. Unknown ids return the entries unchanged.
   - Under each agent reply, a quiet `Comment` link (id `bh-e-c-<entry id>`, 11.5 px, `c.faint`, hover `c.ink`, icon `comment` size 12) opens one inline text box under that reply (one open at a time: `this.commenting = { entry: e.id, edit: cid | null }`, an `InputState` made once in `init`, placeholder "Your comment. Enter sends it to `<agent name>`"). Enter adds the comment with the helper, saves the feed the way `add()` does (`save("feed", this.entries)`), and sends it to the agent that wrote the reply through the composer's existing send path to a named address (see how `sent()` ~:112 and `this.composer.sendText` are used; the entry carries the agent's address) with the text: `About your reply ("<first 80 characters of the reply, one line>…"): <comment>`. If that agent is gone, send it to the Orchestrator (the default target) with the same text prefixed by `(<agent name> is no longer running) `.
   - The reply's comments are listed under it with the same look and the three links (resolve, edit, delete act on the feed with the helpers and save; an edit is sent to the agent again, prefixed `Changed comment: `).
   - Entry heights change when a comment box opens: nothing to do, `on_size_change` in `entry()` already re-measures.

## Contracts (Dev is building these now; do not change them)
- A comment object: `{ id: "c<number>", step | line, quote, text, at, open: boolean, edited? }`.
- Commands, run from the project folder (`this.act`), all accept `--json`; `enc(text)` is the existing base64 helper used with `--data`:
  - `["task", "comment", <task>, "--edit", <cid>, "--data", enc(text)]`
  - `["task", "comment", <task>, "--delete", <cid>]`
  - `["task", "resolve", <task>, "--comment", <cid>]`
  - `["plan", "comment", <plan>, "--edit", <cid>, "--data", enc(text)]`
  - `["plan", "comment", <plan>, "--delete", <cid>]`
  - `["plan", "resolve", <plan>, "--comment", <cid>]`
- `task show --json` / `plan show --json` return `comments` with open and resolved ones.

## Constraints
- No new dependencies. No engine edits. No commits. No restyling of anything not named here.
- Colours only through `colors()`.
- You cannot see the app. For anything you could not confirm from `gpui-kit.d.ts`, say so in the report rather than claiming it works.

## Done when
- `npm test` passes, with tests for the four `feed.js` helpers.
- `grep -n "bh-ask-dim" mods/bot-herdr/chat.js` and `grep -n "bc-ask-min" mods/bot-herdr/composer.js` each print a line.
- `grep -n '"--edit"\|"--delete"\|"--comment"' mods/bot-herdr/work.js` prints lines for both task and plan.
- Your report answers items 1–8 as met / not met with the `file:line` that does each.

## If stuck
When the code or the typings contradict an item, stop that item, finish the others, and report what you found with the `file:line`. Never work around it with a guessed API. If Dev's commands are not there yet when you test, the views still call them as the contract says.
