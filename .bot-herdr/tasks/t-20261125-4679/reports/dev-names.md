## Summary
Fleet agents now carry readable names (spawn name → non-numeric herdr tab title → address) and a `role` (roster role or null).
`bh home --json` shows t63 as "Orchestrator"; thread name lookups and the reply target use the same naming.

## Changes
- `mods/bot-herdr/engine/lib/home.mjs` — new exported `terminalName(t)` and `roleOfName(name, agents)` (roster `findAgent` on the name, then on the name minus a trailing `-<suffix>`; returns `agent.role` or null). `fleetAgents` uses `terminalName` and adds `role`; the team is read once per call.
- `mods/bot-herdr/engine/lib/thread.mjs` — imports `terminalName`; `terminalIndex` indexes terminals by their readable name (so the "Orchestrator" tab is found by name), and `replyTargetOf` returns `terminalName(terminal)`. No other `?? address` name fallbacks exist in lib/.
- `test/home.test.mjs` — one new test: the name field wins, the tab title "Orchestrator" is used, the numeric tab "1" falls back to the address, and the role is "design" for "design-comments" and null for the address.

## Brief Check
- `bh home --json` shows `"name": "Orchestrator"` for t63: **met** (live output: `t63 Orchestrator orchestrator`, `t67 dev-names dev`, `t68 design-graph design`, `t64 Design design`).
- `node --test test/home.test.mjs` passes: **met** (14 pass, 0 fail).
- Committed on your branch: **not done**, see Pushback.
- Contract: every existing field is kept and `role` (string | null) is added: **met**.

## Verification
- `node --test test/home.test.mjs` — 14 pass, 0 fail
- `node mods/bot-herdr/engine/bh.mjs home --json` — t63 is named "Orchestrator", role "orchestrator"
- `bh check` / `node --test test/*.test.mjs` — 691 pass, 18 fail. All 18 fail the same way on a clean HEAD worktree (goal-loop, improve, install-tools, install, learning-view, resilience, retrieval, skills-classifier, tasks-contracts lock, windows-scripts), so they predate this change. The typecheck can't run here because typescript isn't installed.

## Pushback
**Request:** Commit on my branch.
**Reason:** No task worktree or branch exists. I am in the shared main checkout, which also holds the Design agent's uncommitted `agents.js` work and many unrelated store deletions. My role rules say committing is left to the Orchestrator, and switching branches here would move the Design agent too.
**Alternative:** The Orchestrator commits these three files: `mods/bot-herdr/engine/lib/home.mjs`, `mods/bot-herdr/engine/lib/thread.mjs` and `test/home.test.mjs`.

## Knowledge Proposals
- herdr `hc ls` terminals usually have no `name`; `where` is "<workspace> / <tab title>", and `home.mjs terminalName` is the single naming rule for a terminal.
- Several engine lib files use CRLF line endings, so scripted string replacements that contain "\n" fail silently. Use the Edit tool or normalize first.
