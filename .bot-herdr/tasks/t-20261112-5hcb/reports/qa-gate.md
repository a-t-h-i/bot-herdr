# QA gate — t-20261112-5hcb (run by the Orchestrator)

The claude-code QA seat is rate-limited until 19:20; the Orchestrator ran this gate.
The classifier's HIGH came from the user's discarded-plan deletions sitting in the
tree; the real surface is the shared question store, reviewed below.

## Verdict: PASS

## Commands
- `bh check` — PASS (Orchestrator-run).
- `herdr-app check mods/bot-herdr` — passed (child-run, repo and installed copy).
- `npm test` — 176 pass, 1 skipped (child-run).
- Live round-trips (child-run, installed engine): cards shot on chat, Plans and
  Tasks; two asks answered in the app by the user turned `answered` and reached
  the asking terminal; a `bh answer` from the CLI cleared the cards on the next
  poll.

## Review
- **Pin (work.js planColumn)** — the column is `relative()` and sized
  `this.height - PAGE_CHROME`; the box is `absolute().bottom(SIZE.foot)` inside
  it; the page drops its `pb(SPACE[5])` when a plan column is drawn, so nothing
  sits below the box. Pixel-measured against the chat (1031/1032 vs 1045 at
  1.25 scale).
- **Fold** — 1:1 port of the chat's handler (`focus_handle` + `track_focus` on
  the root, `typeFolded` on `key_char`, press on the conversation folds with the
  `commenting` guard). Uses the shared `Composer.isFolded/typeFolded/slim`; no
  fork. Verified by folded shot with the View plan tab on the bar.
- **Questions (questions.js, new)** — `poll()` reads the folder, `drop(q)` takes
  a card off at once, `send()` posts the chat's exact `bh answer` call; on
  failure the record is re-read on the next poll. Only the shown tab's composer
  is fed; Knowledge has none. Two pages answering near-simultaneously: the
  second `bh answer` fails (record gone) and shows the failure toast — edge
  case, acceptable. chat.js changed by extraction only (its private read/answer
  replaced by the shared class, same behaviour and messages).

## Findings
- Critical: none. Major: none.
- Minor 1: the fold is on a press in the conversation, not on wheel scroll —
  exact chat parity (the chat folds on a feed press); noted in case the user
  wants wheel-folding too.
- Minor 2: press/typing themselves not exercised (no input injection in
  herdr-app); verified by code-read, folded render shot, and the chat's
  identical handler.
