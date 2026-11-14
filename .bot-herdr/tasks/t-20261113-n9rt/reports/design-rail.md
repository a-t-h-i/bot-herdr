# Step 13 — the agents rail

## Summary
An agents rail now sits beside the chat: groups NEEDS YOU / WORKING / IDLE, a row per agent of this
space with its hue, status dot and one muted line (what it does · for how long), Answer on a
question, and a click to its terminal. Below 972 px it folds to "Agents · N working", which opens the
same rail as a popover (outside press or Esc closes it).

## Changes
- `mods/bot-herdr/rail.js` (new): pure model — `groupOf`, `groups` (grouping + Orchestrator-first,
  name order, each row's muted line), `elapsed` ("now" / "12m" / "1h 5m"), `questionLine`, `note`,
  `workingCount`, `showsRail` (fold width), `RAIL_W` 248, `RAIL_GAP` 16.
- `mods/bot-herdr/railview.js` (new): the drawing — card, head ("AGENTS" · "N live"), group labels,
  rows (28 px hue badge, name in `agentInk`, status dot, one truncated muted line), the tinted
  NEEDS YOU row with Answer, `railBeside`, `railPopover`, `railButton`.
- `mods/bot-herdr/chat.js`:
  - `this.since` (address → `{status, at}`) updated by `trackSince()` at the top of `poll()`; the
    poll also notifies when the minute the elapsed times show turns (no new timer).
  - `railRows()` (this space's live agents, names as `composer.nameOf`, `entryAt().lead`, oldest open
    question by `from`, `doing[address]`), `railModel()` (groups + rows that just joined), `railActs()`.
  - `openRail` / `closeRail` / `answerFromRail` / `asked()`: Answer reorders `composer.questions`
    so the composer's existing drawer opens on that question (no second answer path).
  - `render()`: the rail beside the chat, or the folded button + popover; the chat column shifts left
    by 132 px when the rail shows so the pair is centred; `empty()` and the composer wrapper move
    with it; the tasks widget's room test accounts for the shift.
- `test/rail.test.mjs` (new): 5 tests — grouping (blocked, question, working, idle), ordering
  (Orchestrator first, then by name, empty groups dropped), elapsed formatting, the muted line,
  the fold width.

## Brief Check
- **Rail beside the chat at a wide window, three groups as in the reference** — met: 248 px card,
  16 px gap, top 16, `c.fill` + 1 px `c.edge`, radius 12; groups in the mockup's order, a group with
  no rows is not drawn (`groups()` filters; test covers it).
- **Narrow window folds to "Agents · N working", which opens the popover** — met: `showsRail` from
  972 px; the button sits at the chat column's top right; the popover hangs 44 px below it, right
  aligned, rows scroll, a press beside it or Esc closes it (the popover takes the keyboard through
  its own `cx.focus_handle()`; the keyboard returns to the composer, or to the chat root when the
  composer was folded).
- **An agent that starts working moves IDLE → WORKING within one poll with its `doing` line and
  elapsed; an open question appears under NEEDS YOU with a working Answer** — met: status/doing and
  `open.list` are already read by the 2.5 s `poll`, which now also notifies on a status change
  (`trackSince`) and when a question list changes (`readQuestions`). Verified by unit test for the
  grouping/line. Answer sets `askFor`, clears the composer's put-away set, nulls an open pane and
  focuses the composer: the same drawer, on that question. (The app itself was not run — see
  Verification.)
- **`test/rail.test.mjs` covers grouping, ordering, elapsed, fold width** — met (5 tests, all pass).
- **No TS2304/TS2552 in `rail.js` or `chat.js`** — met (grep of the tsc output: none in
  `rail.js`, `railview.js` or `chat.js`).
- **`herdr-app check mods/bot-herdr`** — met: "check passed".
- **`bh check` prints PASS** — met.
- **Screenshot or precise description at 1200 and 800** — done below (no screenshot: see Notes).

## Verification
- `node --test test/rail.test.mjs` — 5 pass.
- `npx -y -p typescript@5 tsc -p mods/bot-herdr/jsconfig.json --noEmit` — no TS2304/TS2552 in
  `rail.js`, `railview.js`, `chat.js` (the mod's project-wide TS7006/TS7053 noise is pre-existing;
  those files carry the same class of implicit-`any` report as every other mod file).
- `herdr-app check mods/bot-herdr` — `check passed: mods/bot-herdr`.
- `node …/engine/bh.mjs check` — PASS (46 tests, lint and typecheck).
- Layout proof: a throwaway script built the rail from the real modules' tokens and arithmetic
  (`DARK`, `SIZE`, `SPACE`, `TYPE`, `LINE`, `agentHue`/`agentInk`, `groups()`) and drew it with the
  project's headless browser (`engine/lib/media.mjs drawMockup`) at 1200 and 800 px; both pictures
  were inspected and match the reference's composition (deleted afterwards).

### At 1200 × 825 (page 781 high)
Chat column 660 px at x 138–798; rail at x 814–1062, top 16, max height 749, right margin 138 (the
pair centred, exactly the reference). Card: "AGENTS" 10.5 px `faint` left, "6 live" 10.5 px `muted`
right; group labels 10.5 px semibold `muted` uppercase; rows 8 px padding, 28 px hue badge
(alpha 0.16 fill, 0.45 edge), name 12 px semibold in `agentInk` + 6 px dot (`success` breathing on
WORKING, `warning` on NEEDS YOU, `faint` idle), note 10.5 px/14 px `muted`, truncated to one line.
NEEDS YOU row: `warning` at 10 % fill, 1 px at 34 % edge, question line in `warning`, 28 px accent
"Answer" button under it. Working notes read e.g. "Editing src/chat.js · 4m", idle "Waiting for a
task", the blocked-without-question row "Needs you".

### At 800 × 825
Column 660 px at x 70–730 (no shift). Nothing beside the chat: a secondary 28 px button at the
column's top right (top 12, right edge 730) reading "Agents · 3 working". Pressing it opens the same
card at x 482–730, top 44, max height 721, over the feed; the composer is untouched.

## Design choices
- Shadow: none — a 1 px `c.edge` line on `c.fill`, as the chat's task widget and the mockup.
- Badge: exactly work.js's seat avatar recipe (alpha 0.16 fill, 0.45 edge, `agentInk` glyph).
- Row rhythm: px 8 / py 4, gap 8, radius 8; group label pt 8 / pb 2 / px 4; card px 8 / pb 8.
- Dots: `success` (working, opacity loop 0.25–0.9 over 1600 ms as chat.js:423), `warning` (needs
  you), `faint` (idle).
- Needs-you tint: `alpha(c.warning, 0.10)` fill, 1 px `alpha(c.warning, 0.34)` edge, hover fill
  `alpha(c.warning, 0.18)`; note text `c.warning`, other notes `c.muted`.
- Answer: `actionButton` primary (accent fill, 28 px, radius 8) — the one primary action per row.
- Motion: rows fade 0 → 1 over `MOTION.row` (240 ms) on joining; empty groups/rail change without
  moving the feed (the rail is outside the measured column).
- Fold breakpoint: 972 px = 660 + 16 + 248 + 2 × 24, exactly as specified.
- Focus: rows and Answer are `clickable`/`actionButton`, so they have hover, press, a 2 px accent
  focus ring and Tab reach; a row's accessibility label reads "Name, Group, muted line".

## Notes
- **Two files, not one.** `rail.js` holds only the pure part and `railview.js` the drawing. A node
  test cannot import a module that imports `gpui-kit` (the repo's rule, and the reason `look.js`,
  `working.js`, `feed.js` are import-free); with the drawing in `rail.js` the required
  `test/rail.test.mjs` could not load it. The file names are the only deviation from the brief's
  "Files" line.
- **The chat column shifts, the feed does not reflow.** To centre the pair (as the reference does)
  the column moves left by half the rail and gap when the rail shows; the feed's inner column, the
  empty state and the composer wrapper take the same offset, so nothing is re-measured. The tasks
  widget's room test subtracts it, so it hides before it could overlap the column.
- **Answer writes three fields of the composer from chat.js** (`pane`, `putAway`, `questions`) — the
  same fields chat.js already assigns (`questions` every render). `composer.js` itself is untouched;
  there is no public "open this question" call, and the alternative was a second answer path.
- **Elapsed starts at the first poll that saw the status.** herdr reports a status, not when it
  began; `since` is recorded by the chat when a change is seen, as the brief specifies, so a status
  that predates the page's first poll reads from that poll. The times tick by the minute through the
  existing 2.5 s poll (one extra redraw per minute).
- **No app screenshot.** The running window loads the installed copy of the mod under
  `~/.config/herdr-app/mods`, not this working tree, and installing now would also ship Dev's
  in-flight `engine/**` into the user's live window — not mine to do mid-step. The layout claim
  above comes from the token-exact headless render of the same arithmetic, plus the checks.

## Knowledge Proposals
- The rail's rows are built by chat.js (`railRows`) and grouped by pure `rail.js`; step 15's tracker
  should reuse `groups()` and `railview.js`'s `card`, not re-derive the order.
- Answering a question from outside the composer is done by ordering `composer.questions` so the
  wanted set is first and deleting it from `composer.putAway`; there is no per-question open call.

# Steps 17 and 19 — question counts on the tabs, and copy/state fixes

## Summary
Every page tab now shows how many questions are waiting for you (Chat: without a plan, Plans: for a
plan), and the tab bar marks the active tab with a thin edge instead of a filled tab. Resume says
what it did, a failed Pause says why, the panel's seat pills follow their real terminals, and no
reply action is hidden from the keyboard.

## Changes
- `mods/bot-herdr/signals.js` (new, pure): `openCounts` (plan vs chat), `seatStates` (a seat from
  the live terminal named `<seat>-panel`), `awaited` (the resume mark), `RESUME_MS`, and the
  `OPEN_COUNTS` shared key — kept here, not in questions.js, so the tab bar reads it without
  pulling in the composer through questions.js's import (switch → questions → composer → switch
  would be a cycle).
- `mods/bot-herdr/questions.js`: `publishCounts(list)` writes `{ chat, plans }` to shared, only
  when it changed.
- `mods/bot-herdr/switch.js`: `segmented` takes `mark: "fill" | "line"` (every item keeps a 1px
  border, so no tab changes size) and draws an item's `count` in accent semibold; the page switch
  passes `mark: "line"` and the counts read from `shared(OPEN_COUNTS)`; the width estimate counts
  the number too. A count of 0 passes `null`, so nothing is drawn.
- `mods/bot-herdr/chat.js`: `readQuestions` publishes the counts after every poll; `actTask` now
  reads the exit code (`bhJson` never throws, so the old `catch {}` could not fire) and says
  `Couldn't pause <title>: <first line>`; reply actions rest at 0.5 opacity instead of 0 (Comment
  and `link()`), so Tab reaches them visible — they still go to 1 on the row's hover and on
  keyboard focus (look.js `focusable` sets `opacity(1)` on focus).
- `mods/bot-herdr/work.js`: `readQuestions` publishes the counts and redraws when a seat's state
  changes (no new timer); `seatsNow`/`trackSeats`; Resume toasts `Asked the Orchestrator to resume
  <title>`, records `{ at, status }` in `resumeAsks` and draws a muted "resume asked" mark beside
  the actions, pruned in `loadTasks` by `awaited`; seat pills show working (breathing dot), done
  (check) or not started (quiet ring) plus the state in the tooltip; the fake "Reading the code…"
  line is gone; "Waiting for your answer in the chat" is now "Answer below".
- `test/signals.test.mjs` (new): 3 tests — the plan/chat split, seat states from a terminal list
  (live/working, live/blocked = done, dead or missing = none, case-insensitive name), and the
  resume mark (kept while unchanged, dropped when active, when the status changed, after 10
  minutes, or when the task went).

## Brief Check
- **A plan question puts 1 on the Plans tab; a chat question on the Chat tab; answering clears it
  within one poll** — met in code: `openCounts` splits on the record's `plan` field (ask.mjs writes
  it only for plan questions), both pages' existing 2.5 s polls call `publishCounts`, the tab bar
  reads the shared key. Not observed in the running window (see Verification): the installed mod
  is not this tree.
- **Resume toast and mark; a failed Pause says why** — met: new copy, `resumeAsks` mark keyed by
  task id and pruned on load; `actTask` checks `r.code` and toasts the first line of stderr with
  `"error"`.
- **Each seat pill shows working/done from its terminal; no "Reading the code…" timer** — met:
  `seatStates(terminals(), SEATS)` each draw, `trackSeats` redraws on change; the fake line is
  deleted. Checked against the live `hc ls`: spawned terminals do carry their `--name` (this
  session's own is `design-rail`), so `<seat>-panel` is found when a seat runs.
- **Tab reaches every reply action with it visible** — met: 0.5 at rest, 1 on hover and on focus;
  gpui-kit has no focus-within, so this is the fallback the brief names.
- **Pure parts tested in `test/`** — met: `test/signals.test.mjs` (3 tests, all pass).
- **`herdr-app check`, tsc, `bh check`** — met (see Verification).

## Verification
- `node --test test/signals.test.mjs` — 3 pass.
- `npx -y -p typescript@5 tsc -p mods/bot-herdr/jsconfig.json --noEmit` — no TS2304/TS2552 in the
  touched files, and no new TS2339: the ones left in chat.js (101, 219, 679-681), questions.js (45)
  and work.js (135-137, 368, 723-730) are all on lines this step did not change (the project-wide
  `shared(...)?.at` / pageComposer pattern). One was mine and is fixed: `was?.chat` on the unknown
  `shared()` value, now a JSON comparison.
- `herdr-app check mods/bot-herdr` — `check passed` (it caught a real bug first: work.js imported
  `awaiting` while signals.js exports `awaited`; fixed).
- `node …/engine/bh.mjs check` — PASS, 68 tests. One earlier run failed in `test/store.test.mjs`
  (Dev's concurrency test, 3.8 s, timing out under the 10-file parallel run); it passes alone and
  the re-run of `bh check` passed.
- Tab bar layout: rendered the bar from the same tokens/numbers (track `c.well` radius 10, 29 px
  items, count `TYPE.xs` semibold accent) in both themes at 1200 and 800 px and checked the
  spacing: labels keep their place, the count reads as a small accent number, the active tab is an
  accent outline with no fill (see the step 17 amendment below for the final values).
- Live data check: `hc ls --json` shows terminal `name` set for spawned agents (`dev-store`,
  `design-rail`) — the `<seat>-panel` lookup has something real to match.

## Notes
- **Tab appearance.** The plan's step text ("the active tab is marked by a thin border instead of a
  filled, expanded tab") is implemented in `segmented` behind a `mark` option, so the task tab
  strip and the plan list keep their filled, raised selected item; only the page switch changed.
  `border_1` is applied to every tab (transparent when not picked), so adding it cannot resize the
  picked one.
- **"Every page tab keeps its label"** — first read as "the label stays beside the count"; the
  user's amendment then made it literal: the icon-only compaction is gone (see the step 17
  amendment below).
- **The resume mark's second rule.** The brief says "drop it when the status changes or after 10
  minutes" and also "until its status becomes active"; the mark stores the status at ask time, so
  any change (active or not) drops it, and it also expires at 10 minutes.
- **No app screenshot**: the window runs `~/.config/herdr-app/mods`, not this tree, and installing
  now would also ship Dev's in-flight `engine/**`.

## Knowledge Proposals
- The tab bar's counts live in `shared("bot-herdr.open-questions")`; any page's poll may write them
  with `publishCounts(list)` (guarded, so it does not re-render unless the numbers move).
- `switch.js` cannot import `questions.js` (cycle through composer.js): shared keys that the tab
  bar needs belong in a pure module — `signals.js` holds `OPEN_COUNTS`.
- `bhJson` never throws (it returns null); a failure message needs `bh(...)` and `r.code`.
- Panel seats run as terminals named `<seat>-panel`; `terminals()` records that name, and a seat's
  state is `working` / `done` (idle or blocked) / `none` (no live terminal).

# Step 17 amendment — every label, and an accent outline on the active tab

## Summary
The page switch no longer collapses to icons: every tab always draws its icon, label and count, and
a strip short of room narrows each tab's padding instead. The active tab is now a 1 px `c.accent`
outline with no fill, matching the user's reference (Settings outlined in accent).

## Changes
- `mods/bot-herdr/switch.js`: `segmented` takes `padX` (default `SPACE[4]`) and no longer knows
  `compact` — the label is always drawn; the "line" mark's border is `c.accent` when picked and
  `alpha(c.accent, 0)` (transparent, same 1 px) otherwise. `Switch.render` drops the
  full/some/icons modes for `tabPad(room, countOf)`: the whole strip's width is summed at
  `SPACE[4]` and, if it does not fit, every tab takes `SPACE[2]`; a label is never dropped (past
  that the strip clips, `.overflow_hidden()` on the bar). Two small helpers, `tabWidth` and
  `tabPad`, carry the arithmetic.

## Brief Check
- **Every tab keeps its label** — met: the `compact` item flag and its icon-only branches are
  removed; `segmented` always draws `item.label`. The task tab strip and the plan list use the same
  component, so they also always show their labels (they never collapsed before).
- **Padding narrows before anything else** — met: `tabPad` tries `SPACE[4]`, else `SPACE[2]`.
- **Active tab: no fill, 1 px `c.accent`, same height and radius, text `c.ink`; inactive keep a
  transparent 1 px border** — met: `.border_1().border_color(c.accent).text_color(c.ink)` against
  `.border_1().border_color(alpha(c.accent, 0)).text_color(c.muted)`; the 29 px height and
  `SIZE.nested` radius are unchanged and the border is on every tab, so nothing shifts.
- **All labels show at 800 px** — met: with counts of 2 and 1 the strip measures 580 px at `SPACE[4]`
  and 484 px at `SPACE[2]`, against 776 px of room at 800 (and 636 at 660), so the full padding is
  kept and every label is drawn.

## Verification
- `herdr-app check mods/bot-herdr` — `check passed`.
- `npx -y -p typescript@5 tsc -p mods/bot-herdr/jsconfig.json --noEmit` — no TS2304/TS2552 and no
  new TS2339 in `switch.js` (the same pre-existing set elsewhere).
- `node …/engine/bh.mjs check` — PASS, 68 tests. (One run in between failed a `deepStrictEqual` in
  the engine suite while Dev was editing `engine/**`; the rerun passed with no code change here.)
- Widths: computed with `look.js`'s own `textWidth` — 580/484/440 px for `SPACE[4]`/`SPACE[3]`/
  `SPACE[2]` with two counts.
- Drawn from the same tokens and numbers in both themes at 1200 and 800: six tabs, all labels and
  counts visible, Chat outlined in accent with no fill and ink text; the light theme's accent
  (#a25338) reads clearly at 1 px. Throwaway script, deleted afterwards.

## Notes
- The narrow-padding rule is all-or-nothing for the strip: one tab narrower than another would read
  as a different state. Past `SPACE[2]` the strip clips rather than dropping a label, as asked.
- The count keeps its accent while the active tab's label goes ink; on the outlined tab the number
  still reads as the count, not as part of the label.

# Gate 1 fix — the rail popover's row action

A row's `open` in the rail used to clear `railOpen` and call `openTerminal` without a redraw or a
return of the keyboard, so the popover waited for the next frame and focus stayed on the hidden
handle (qa-gate1.md, [info]). It now runs through `closeRail(cx)` first — the same path Esc takes:
`railOpen = false`, the keyboard back to the composer (or the chat root when the composer is
folded), `cx.notify()` — and then opens the terminal. `railview.js` passes the context to the
action (`on_click((_e, cx) => model.acts.open(r, cx))`).

Verified: `herdr-app check mods/bot-herdr` — `check passed`; tsc — no TS2304/TS2552 and no new
TS2339 in `chat.js`/`railview.js`; `node …/engine/bh.mjs check` — PASS, 68 tests.

# Step 18 — the task page's board, and each step's report

## Summary
A step with a report now shows a quiet Report link that opens its file in the viewer, with the
report's summary as one muted line under the title; a Board section lists the task's entries newest
first, toned by kind, ten at a time until "Show all N".

## Changes
- `mods/bot-herdr/work.js`:
  - `stepLine` draws `reportLink` before the time when the step has `report.file`; `stepRow` draws
    `report.summary` as one truncated muted line indented to the title (`STEP_TEXT`).
  - `reportLink(c, file, id)`: file icon, `TYPE.sm`, `c.muted`, hover `c.ink`, focus ring and Tab
    reach (`focusable(pressable(...))`), a click stopped from the step's own (which starts a
    comment) and opening `openFile({ path: file, root: projectDir() })`.
  - `taskBoard` (after Steps, before Comments): `sectionLabel(c, "Board · N")`, the newest ten (or
    all, once asked), an empty line when there are none, and `boardMore` — "Show all N" or "Show the
    newest 10", the choice kept per task in `this.boardAll`.
  - `boardRow`: a kind `pill` (tone from `boardTone`), `from` in `agentInk`, `→ to` when set,
    `boardAge` in `c.faint`, its Report link when the entry has a file, then the text as
    `TextView.markdown(linkFiles(text))` whose links open through `openLink`; joins with the steps'
    opacity stagger (`MOTION.row` + `MOTION.stagger`).
- `mods/bot-herdr/signals.js` (pure): `boardTone`, `boardAge`, `BOARD_SHOWN` (10), `boardRows`.
- `mods/bot-herdr/viewer.js`: `openLink(url, root)` — a file link opens in the viewer, any other in
  the browser — now lives beside `openFile` and is what both pages use.
- `mods/bot-herdr/chat.js`: its reply links call the imported `openLink(url, projectDir())`; the
  page's own copy (and its `fileTarget`/`FILE_LINK` imports) are gone.
- `test/signals.test.mjs`: 3 more tests — tone per kind, age text (now/m/h, then the entry's own
  day), and the newest-first slice with `rest`.

## Brief Check
- **Step 6 shows a Report link to `.bot-herdr/…/reports/dev-store.md` and its summary line** — met
  in code; checked against the live task JSON: `steps[5].report = { file:
  ".bot-herdr/tasks/t-20261113-n9rt/reports/dev-store.md", summary: "Steps 4-6: …", … }`, so that
  step draws both. (Not observed in the running window — the installed mod is older than this tree.)
- **Board newest first, tones by kind, at most 10 until "Show all"** — met; against the live task:
  7 entries, drawn 7…1, tones done→success, decision→accent, contract→accent, note→muted, ages
  5m–20m, two with report files.
- **Pure helpers tested** — met: `test/signals.test.mjs`, 6 tests (3 new) pass.
- **`herdr-app check`, tsc, `bh check`** — met (see Verification).

## Verification
- `node --test test/signals.test.mjs` — 6 pass.
- `npx -y -p typescript@5 tsc -p mods/bot-herdr/jsconfig.json --noEmit` — no TS2304/TS2552 in the
  touched files; the TS2339s left in `chat.js`, `questions.js` and `work.js` are the same
  pre-existing `shared(...)?.at` / pageComposer ones on lines this step did not change.
- `herdr-app check mods/bot-herdr` — `check passed`.
- `node …/engine/bh.mjs check` — PASS, 77 tests.
- Live data through the helpers: `bh task show t-20261113-n9rt --json` piped into
  `boardRows`/`boardTone`/`boardAge` printed the seven entries newest first with their tones,
  `from → to`, ages and report files, and step 6's report object; `linkFiles` on a board text finds
  its `test/store.test.mjs` path.

## Notes
- **Board text is drawn as markdown, not escaped.** Escaping first (as the chat does for notes)
  escapes the dots and hyphens of every path, which stops `linkFiles` from linking them; the brief
  asks for both, so the text goes through `linkFiles` alone and renders like a reply does. Agent
  posts are prose; a stray `*` styles instead of showing literally — the trade-off for working
  links.
- **The count rides in the section label** ("Board · 7") because `sectionLabel(c, text)` draws its
  own full-width rule with no slot for a count, and the brief names that helper.
- **The Report link is keyboard reachable** (`focusable(pressable(...))`, Tab + 2 px accent ring),
  which the brief did not ask for but the step's neighbours (step 19) established.
- **`openLink` moved to viewer.js.** Its second use (the board) is in another page; one path for
  "a link a page draws" beats two copies, and chat.js's method is gone rather than kept as a wrapper.
- **No app screenshot**: the window runs `~/.config/herdr-app/mods`, not this tree.

## Knowledge Proposals
- A file link on any page opens with `viewer.js`'s `openLink(url, root)`; `openFile` alone is for a
  known path. `FILE_LINK`/`fileTarget` live in feed.js and are only needed by that helper now.
- The task page's board comes from `bh task show --json`'s `board` array; helpers (`boardRows`,
  `boardTone`, `boardAge`) are pure in `signals.js` so the slice and the age text are testable.
- A step's report is `steps[n].report = { file, summary, from, at }`; a board entry with a report is
  `{ …, file }`.
