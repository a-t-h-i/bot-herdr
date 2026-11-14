## Status
READY

## Title
Make the team hand off, verify and show its work reliably

## Plan

### Steps
1. Board posts and step updates record who made them by default (Dev)
2. Task file and board writes are locked, with board numbers that never repeat (Dev)
3. `hc` calls and harness turns get timeouts, so one stuck agent cannot stall the Orchestrator (Dev)
4. `bh report` files a child's report on the task with a `done` board entry and closes its step; `bh inbox` lists unread reports; `bh task show` lists reports (Dev)
5. A child's own brief carries its task, plan, parent and report path, and each resumed turn gets a short "brief update" with only what changed (Dev)
6. `bh task show` prints a bounded board (counts, last five entries), and briefs teach `bh board read --since` (Dev)
7. `bh check` says how many checks and tests it ran, writes a receipt per run, and when nothing targeted covers the change it runs the project's full test command instead (Dev)
8. `bh check` and `bh classify qa-risk` read the task's own worktree and the content of untracked files; the classifier can no longer lower a flagged area to NONE (Dev)
9. Test selection finds the mod's own tests, which load through `lib(...)` and `new URL(...)` (Dev)
10. The QA gate gets the plan's acceptance criteria, the task's report paths and a fallback risk when none was classified; `qa.md` and `reviewer.md` merge into one rule set; the verdict is stored on the task (Dev, QA review)
11. Each writing child (Dev, Design) runs in its own worktree on a branch from the task's current head; `bh merge <child>` commits the child's changes on its branch, merges them into the task's tree, then removes that worktree and branch; read-only seats (Scout, Research, panel, QA review) stay in the task's tree (Dev)
12. Every agent turn's reply is kept (one entry per turn), and the feed reads them all, so no reply is lost when an agent exits (Dev engine, Design feed)
13. An agents rail beside the chat lists every agent grouped needs-you, working and idle, each with what it is doing now and for how long; a click opens its terminal (Design)
14. `bh task show --json` gives each step its events in order: board posts, the report summary, `bh check` receipts (tests passed of run), the merge's diff stat (+added −removed) and the owning agent's current action (Dev)
15. A live task tracker card in the chat, after your mockup: title, the working agents' chip and done/total; a timeline of steps joined by a line, each with its agent's icon, title and time; a step opens to show its events on a branch of the line; the active step carries a live action word ("Writing", "Running tests") and its elapsed time; a step that needs you shows a dashed amber ring and a "Needs you" pill that opens its question (Design)
16. Child reports are grouped under the team turn they answered, behind an "N child reports" row (Design)
17. An open question shows a count on every page tab (Design)
18. The task page shows the board and links each step's reports (Design)
19. Copy and state fixes: "Asked the Orchestrator to resume" until it does, a failed Pause is shown, plan seats show working/waiting/done, reply actions reachable from the keyboard (Design)
20. Per-turn token and time usage is captured where the harness reports it; `bh usage` totals it per agent and task, and the task page and tracker show it (Dev, Design)
21. Knowledge proposals in reports are listed by `bh knowledge inbox`, and the brief's knowledge budget cuts by section, not mid-file (Dev)
22. Role texts updated for all of the above, then a live two-agent run on a throwaway task proves the path end to end (Orchestrator, QA)

### Objective
Fewer lost or late handoffs, no gate that passes on nothing, parallel work that cannot collide, and a chat that shows what the team is doing, so smaller models stay on track and the user can trust and steer the team.

### Scope and non-goals
- In: the engine (`mods/bot-herdr/engine`), role texts, the chat, task and plan pages.
- Not in: new harnesses, new dependencies, replacing `hc`, changing how the user answers questions, a hooks system inside each harness.
- Seat reuse (sending a new brief to an idle child instead of starting a fresh one) is deferred: it changes context hygiene and needs its own test.

### Acceptance criteria
- A child's report is on the task (board entry plus file) before or without its `hc send`; `bh inbox` shows it until read; the step closes.
- A resumed agent's next turn contains only changed task state; with no change, nothing extra is sent (`test/headless.test.mjs` "second prompt has no brief" still passes).
- Two concurrent `bh board post` and `bh task step` calls lose nothing and never share a board number (test with two writers).
- Two writing children of one task each work in their own worktree; `bh merge` brings both changes into the task's tree, and a conflict stops the merge with the files named, leaving the task's tree as it was.
- `bh check` never prints PASS without saying what ran; a change no targeted check covers runs the full test command.
- A worktree task and an untracked new source file are both rated by their real content (tests for each).
- The chat answers "who is working, on what, since when, who needs me" without opening Terminals; every reply reaches the feed once.
- A running task's tracker card in the chat updates in place as steps start, gain events and finish, with no reload, and matches the reference `.bot-herdr/plans/p-20261113-bkli/work/tracker-reference.jpg` in layout.
- `bh usage --task <id>` prints tokens and minutes for Claude and Codex turns; other harnesses show minutes only.
- Every step lands with a unit test that fails without it, `bh check` green, `herdr-app check mods/bot-herdr` passes.

### Affected areas
- Engine: `bh.mjs`, `lib/agent.mjs`, `lib/runner.mjs`, `lib/team.mjs`, `lib/tasks.mjs`, `lib/core.mjs`, `lib/knowledge.mjs`, `lib/workspace.mjs`, `classifier/qa-risk.mjs`, `scripts/check_changed.mjs`, `scripts/run_changed_tests.mjs`, `scripts/lib/common.mjs`.
- Roles: `orchestrator.md`, `global.md`, `qa.md`, `reviewer.md`, `worker.md`, `panel.md`.
- UI: `chat.js`, `feed.js`, `working.js`, `indicators.js`, `work.js`, `switch.js`, `composer.js`, `viewer.js`, and a new `tracker.js` for the task tracker card.
- Tests: `test/engine.test.mjs`, `test/headless.test.mjs`, `test/agents-reply.test.mjs`, new gate tests.

### Decisions by domain
- [DEV] Reports: a board `done` entry `{from, step, summary, file}` plus `bh inbox` with a per-agent cursor; the board stays append-only JSONL with additive fields only.
- [DEV] Brief refresh: a hash of knowledge, the board's last number, open comments and step states is kept per session; a turn appends `## Brief update` only with what changed. `/team` stays as the full re-brief.
- [DEV] Actor default: `--from`/`--agent` fall back to `BH_AGENT`, then the terminal address.
- [QA] Receipts: each `bh check` appends `{command, exit, base, tree, ran, at}` to `.bot-herdr/tasks/<id>/checks.jsonl`; reports cite receipts and QA verifies them instead of re-running.
- [QA] The classifier may lower risk no further than the engine's own area floor.
- [DEV] Worktree per child (your answer): the child's branch is `<task-branch>-<child>`, made from the task's current head (or HEAD when the task has no isolation). Workers still never commit; `bh merge` commits for them as the Orchestrator. The next writing child of the same domain starts only after the previous one is merged.
- [QA] A change no targeted check covers falls back to the project's test command from `project_commands` (your answer); the receipt records that it was a fallback.
- [DESIGN] The agents rail (your answer) is 248 px beside the 660 px chat column, as in Design's mockup; the presence strip and the named working line are dropped.
- [DESIGN] Task tracker (your comment and mockup): the reference is `.bot-herdr/plans/p-20261113-bkli/work/tracker-reference.jpg`. Motion uses what gpui-kit can animate (opacity, width, height, left, top): the joining line grows down as a step finishes, a check fades in, an opened step's events slide open, the action word shimmers as the working line does today (`indicators.js`). gpui-kit cannot rotate, so the active ring pulses with a sweeping arc instead of spinning. Step icons are the owning agent's icon in its hue, not app logos.
- [DESIGN] Child reports are grouped under the team turn they answered (option "Team replies only" from Design's panel), so a late child report never reads like the team's answer.

### Assumptions
- [DEV] Steps 1–3 go first whatever is prioritised: everything else writes to the same task files.
- [DEV] Usage capture is best-effort: a harness that reports nothing records time only, never fails a turn.
- [QA] Report linting (checking a report's commands against receipts) waits until receipts exist; it is not in this plan.
- [DESIGN] No new design tokens; when the window is too narrow for the rail and the 660 px chat column, the rail folds to a button with a working count.
- [DEV] With git isolation unavailable (not a repository, or no commit yet), children share the task's tree as today and `bh spawn` says so in one line.
- [DEV] File claims are not built: worktrees make them unnecessary.
- [DESIGN] The tracker card appears in the feed when a task starts and updates in place; one card per task; a finished task's card folds to one line (done/total, total time) that opens again on click; the agents rail shows each task's done/total and a click scrolls to its card.
- [DESIGN] Live test counts mid-run (like "182/214") are not streamed: the tracker shows each `bh check` receipt's final counts when it lands.
- [RESEARCH] Outside sources (Anthropic multi-agent research system 2025-06-13; context engineering 2025-09-29; Claude Code sub-agents and hooks docs, fetched 2026-11-13) back handoff packets, compact deltas, worktree isolation and token budgets. Codex, OpenHands architecture and MetaGPT could not be verified (search was unavailable) and are not relied on.
- [ORCHESTRATOR] Each phase ships on its own, committed, pushed and installed, with `bh check` green.

### Risks and open points
- Order (your answer, handoffs first): steps 1–6 handoffs, 7–10 verification, 11 worktrees, 12–19 visibility, 20–21 cost and knowledge, then 22.
- The tracker (steps 14–15) depends on steps 4 (reports carry their step), 7 (receipts) and 11 (merge diff stats); it cannot come earlier.
- The store lock (step 2) touches the only shared mutable state; it needs its two-writer test before anything builds on it.
- A child worktree starts from committed state only: the user's uncommitted edits are not in it, and a merge into a tree with overlapping uncommitted edits stops and names the files.
- Worktrees add a merge step, disk use per child and Windows path-length edge cases; step 8 (the gate reading worktrees) must land before step 11.
- A full-suite fallback is cheap here (21 s) but may not be in other projects.
- Keeping every reply per turn grows `data/bot-herdr/replies`; it needs a cap or rotation.
