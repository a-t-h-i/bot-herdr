Step 18 is accepted and committed (a0fc89a). Next: the feed half of step 12, then step 16, of task t-20261113-n9rt. Same rules: UI files only, not plandoc.js, do not commit. Record your report with `node mods/bot-herdr/engine/bh.mjs report t-20261113-n9rt --step 16 --file .bot-herdr/tasks/t-20261113-n9rt/reports/design-feed.md "<summary>"`, then `hc send` me one line.

## Step 12 (feed half): no reply is lost
The engine half is done (uncommitted, mine, in `mods/bot-herdr/engine/lib/agent.mjs` `logReply`): besides the `replies/<key>.md` file it replaces each turn, a headless agent now appends every turn's reply to `replies/<key>.jsonl` (`<key>` = the address with `/` and `\` as `_`), one JSON line `{ at, name, text }` per turn, `at` an ISO time, capped at 400 lines (the oldest half drops).
1. `chat.js poll`: read every `*.jsonl` in `outboxDir()`, whether or not its agent is still live (today the poll reads only live agents' `.md`, so an agent killed before the poll loses its reply). For each new line (`at` later than the last one seen for that key), add a feed entry exactly as a reply is added today (`kind: "agent"`, `text`, `from: { address, name, tile }`; tile null when the agent is gone; the space: the agent's space when live, else the chat's current one).
2. Keep the last seen `at` per key in the saved `seen` store. The first time a key is seen (no record), mark its last line seen without adding anything, so old history does not flood the feed.
3. An address that has a `.jsonl` is read only from it; its `.md` is used only for agents without a log (a non-headless agent's `bh reply`). Keep `isHandled` filtering and the wait bookkeeping (`delete this.waits[address]`) as they are.
4. Pure parts (new lines after a seen `at`, first-sight rule) in a pure module with tests.

## Step 16: child reports grouped under the team turn
The user's chosen option (Design panel, "Team replies only"): the feed shows the team's replies; each turn's child reports sit behind one row.
5. A child entry is a reply from an agent that is not the lead (the Orchestrator: `entryAt(address).lead`, or the name "Orchestrator" when the agent is gone). Consecutive child entries between two non-child entries (your message, the Orchestrator's reply, a note) fold into one row in place: `N child reports` with the children's hue badges (as the rail draws them) and their names, a chevron; a click opens it in place to show each report compact (name, time, first 3 lines, "Show all" per report). Closed by default; one child report still folds (the row reads `1 child report · Dev`).
6. Folded rows keep the feed's measured layout working (the bottom-anchored feed and its heights cache, chat.js around the feed drawing): treat the group as one entry for scrolling and height.
7. Motion: the group opens with a height transition (`MOTION.row`), the chevron flips by swapping icons (no rotate in gpui-kit).

## Constraints
No new tokens, no new dependency, no new timer (the 2.5 s poll reads the logs), functions at or under 20 lines; keep feed.js and look.js import-free.

## Done when
- With an agent that finished two turns between polls, both replies show; with an agent killed right after its turn, its reply shows on the next poll.
- On first load after the update, no old log lines flood the feed.
- A run of child replies between your message and the Orchestrator's reply shows as one `N child reports` row that opens to the reports; the Orchestrator's reply stays a normal entry.
- Tests for the pure parts; `herdr-app check mods/bot-herdr` passes; tsc shows no new TS2304/TS2552/TS2339 in touched files; `bh check` PASS.
