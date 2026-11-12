# design-pages: fix pass (item 12, Delete toast, "the user")

## Summary
Older question rounds now collapse to one line each, deleting a task opens its neighbour so the composer can say "Deleted <title>", and work.js/plandoc.js no longer say "the person" anywhere.

## Changes
- `work.js` (Plans): `planConversation` draws every set except the last through `answeredSet`/`answeredRow` — a check, the seat name in its colour, the question with its picked answer in semibold on the same wrapped line, and a muted "You: <text>" line under it when text was typed. The newest set keeps the full `questionSet`; one set shows in full. No round field is needed.
- `work.js` (Tasks): `taskDelete` finds `neighbourOf(t)` (the row below it in the drawn list, else the row above, else none) before deleting; on success it opens that task and says `Deleted <title>` through its composer. With no task left it sets `stayClosed` and shows the empty state with no toast. `neighbourOf` uses the same `taskGroups` order as the list.
- `work.js` + `plandoc.js`: every "the person"/"The person" (sent messages, page text, comments) is now "the user"/"The user"; sentences otherwise unchanged.

## Brief Check
- 1 Older sets collapse, newest in full, one set in full: met.
- 2 Delete opens the next task (below, else above) and toasts through its composer; none left: empty state, no toast: met in code.
- 3 `Select-String -Path mods\bot-herdr\work.js,mods\bot-herdr\plandoc.js -Pattern "person" -CaseSensitive:$false` (the grep asked for, on Windows) prints nothing: met.
- Item 12 is no longer blocked; the earlier blocker on question rounds is withdrawn.

## Verification
- `herdr-app check mods/bot-herdr` — check passed.
- `node .../engine/bh.mjs check` — PASS (lint and typecheck pass; 146 tests, 0 failing).
- `node --test test/*.test.mjs` — 177 tests, 176 pass, 1 skipped, 0 failing.
- Visual check in the running app: NOT DONE.

## Design choices
- Collapsed answer: inline after the question in a wrapping row (as planning-light-000), not right-aligned.
- Older sets keep their data order (oldest first), above the newest full set.
- Delete neighbour: from the tab being shown (`this.archived`), below first, then above; a deleted task with no siblings leaves the prompt with no toast.

## Knowledge Proposals
- Plan `asked` sets are oldest first, so "newest" is the last element; no round field is needed to collapse older rounds.
- A page composer's toast can survive an action that changes the open item if the pane opens its neighbour in the same render (Archive, Delete).
