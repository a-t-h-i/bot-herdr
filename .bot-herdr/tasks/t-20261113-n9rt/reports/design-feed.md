# Step 12 (feed half) and step 16 — every reply reaches the feed, child reports fold

## Summary
The chat now reads each agent's reply log, so every turn reaches the feed whether or not its agent
is still running, and a log's first sight adds nothing. Runs of child replies between other entries
fold into one `N child reports` row that opens in place to their reports; the Orchestrator's reply
stays a normal entry.

## Changes
- `mods/bot-herdr/feed.js` (pure, still import-free):
  - `fileKey(address)` — the replies folder's key, the same rule as `engine/lib/agent.mjs`.
  - `entryName(entry)` — a `readdir` entry's name, name or Dirent.
  - `logEntries(text)` — a reply log parsed, unreadable/unfinished lines dropped.
  - `logNew(text, sinceAt)` — `{ entries, at }`: the turns later than `sinceAt`, and the newest time
    the log holds; a log never read before returns no entries and only its newest time.
  - `groupChildren(list, isChild)` — consecutive child entries between other entries folded into
    `{ id: "kids-<first entry id>", kind: "kids", at, space, children }`.
- `mods/bot-herdr/chat.js`:
  - `poll` reads every `replies/*.jsonl` first (`readLogs`), live agent or not; a key that has a log
    is not read from its `.md` any more. `logText(key)` reads one log; `addLogged(key, line, live,
    cx)` adds a turn as a reply is added today (its agent's space while live, the chat's space once
    it is gone, tile null when gone, `replyBody`, `isHandled` filtering, `delete this.waits[...]`).
    The last seen time per key is kept in its own saved store, `logSeen` (the `seen` store holds
    reply texts keyed by address, and a log key *is* an address).
  - `items(space)` filters the space and folds child runs; `render` and `feedHeights` use it, so the
    bottom-anchored scroll and its heights cache treat a group as one measured entry.
  - `childEntry(e)` — an agent entry whose roster entry is not the lead, or, for an agent that is
    gone, whose name is not "Orchestrator".
  - `kids` / `kidsHead` / `kidsBody` / `kidReport` / `openKids` / `showKidFull` / `measureKids`: the
    folded row (hue badges from the rail's `agentBadge`, `N child report(s)`, `· names`, chevron),
    its body clipped to `0` (with a height transition to the measured height) or to what the reports
    measured, each report compact (name, time, first 3 lines, Show all).
- `mods/bot-herdr/railview.js`: `badge` is now `agentBadge(c, name, size)` and exported (the rail
  and the child row draw the same badge).
- `mods/bot-herdr/questions.js`: uses `entryName` too (the same `readdir` branch, now shared).
- `test/feed-thread.test.mjs` (new): 5 tests — the key, log parsing (including half a line),
  first-sight add-nothing, new turns after a seen time (two turns between polls), and the folding
  (a run, the lead's reply staying normal, one child still folding, nothing to fold).

## Brief Check
- **Two turns between polls both show; an agent killed right after its turn shows on the next
  poll** — met in code: the log read happens for every `*.jsonl` before the `.md` pass, and
  `logNew` returns every line later than the stored time (covered by the test with two turns).
- **The first load adds no old log lines** — met: `logNew(text, undefined)` returns no entries and
  only the newest time (test), which is what `poll` stores on first sight.
- **A run of child replies folds into one `N child reports` row that opens to the reports; the
  Orchestrator's reply stays a normal entry** — met: `groupChildren` + `childEntry` (test), the row
  opens in place with each report's first 3 lines and "Show all".
- **Folded rows keep the measured layout** — met: `items()` feeds both `shown` and `feedHeights`, so
  a group is one item with one id in the heights cache; the group body measures itself so opening
  animates to its real height.
- **Motion** — met: the body's `height` and `opacity` transition over `MOTION.row`; the chevron
  swaps `chevron-right`/`chevron-down` (no transform, gpui has none).
- **Tests for the pure parts; `herdr-app check`; tsc; `bh check`** — met (see Verification).

## Verification
- `node --test test/feed-thread.test.mjs` — 5 pass.
- `npx -y -p typescript@5 tsc -p mods/bot-herdr/jsconfig.json --noEmit` — no TS2304/TS2552 in the
  touched files; the TS2339s left in `chat.js` (106, 224, 734-736) are the pre-existing
  `shared(...)?.at` ones on lines this step did not change. One would-be new error was mine
  (`readdir`'s Dirent branch narrowing to `never` in `chat.js`); it is fixed with `entryName`, and
  `questions.js`'s instance of it is gone too.
- `herdr-app check mods/bot-herdr` — `check passed`.
- `node …/engine/bh.mjs check` — PASS (one test skipped: the mockup browser one).
- Not run in the window: the installed mod is not this tree, so the two polling behaviours and the
  group's animation are checked by their pure parts and code path, not observed live.

## Notes
- **`logSeen` is its own saved store**, not `seen`: `seen` maps an address to the last `.md` text it
  showed, and a log's key is an address, so mixing them would make the `.md` path think a time was a
  reply. The brief said "the saved `seen` store"; this is the same store *mechanism* under a second
  key, because the two hold different things.
- **The group's height comes from measurement, not a guess.** Its body is drawn even while folded
  (clipped to 0, opacity 0) so it reports its height; opening animates `height` from 0 to that
  number. Before the first measurement a `children × 120` guess stands in, and a measured 0 falls
  back to it — so the reports are never invisible if layout reports nothing.
- **Migration cost.** A log's history is skipped on first sight, so a turn logged but never shown
  as `.md` just before the update is not backfilled; that is the price of "no old log lines flood
  the feed", which the brief prefers.
- **A group is closed by default**; its open state lives in `this.kidsOpen` (in memory), and a
  child's "Show all" shares `this.unfolded` with your long messages.

## Knowledge Proposals
- A headless turn now arrives twice on disk: `replies/<key>.md` (replaced each turn) and
  `replies/<key>.jsonl` (`{ at, name, text }` per turn, capped at 400). The chat reads the `.jsonl`
  when it exists and the `.md` only for agents without one.
- `chat.items(space)` is the feed as drawn (child runs folded); use it, not `this.entries`, for
  anything positional (paging, heights, scrolling).
- `agentBadge(c, name, size)` in railview.js is the one agent badge (rail row, child group).
