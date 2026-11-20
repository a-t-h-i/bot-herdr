## Status
READY

## Title
Faster, leaner agents with skill picks and a Metrics tab

## Plan

### Steps
1. Record baselines: brief size per role and mode, `bh` command latency on a seeded fixture, spawn-to-first-prompt time, and fix the Linux failure in `test/mockup-browser.test.mjs:42`.
2. Trim briefs: drop the `## Child agents` block from children that cannot spawn, the `bh ask` and mockup rules from children that never ask (`team.mjs:119-127`), and the duplicate text in `bh.mjs:691-697` (already in `team.mjs:140`); read task, plan and board once per turn instead of two or three times (`agent.mjs:272-309`).
3. Cut turnaround: find the project root with a `.git` walk instead of a `git rev-parse` subprocess on every `bh` call (`core.mjs:40-46`, handling worktree `.git` files), cache `listTasks` usage totals, and stop forcing skill rescans (`team.mjs:36`, `composer.js:533`).
4. Compact the Orchestrator's session between tasks: `bh task status done` and `bh plan task` write a `compactPending` marker that `agent.mjs` consumes between turns (never racing the turn-end save at `agent.mjs:380-382`); it compacts natively where verified headless (Claude Code first), and elsewhere starts a new session seeded with a short handoff summary of the finished task.
5. Add `role`, `project` and `plan` to every usage record, keep cached and uncached tokens apart, mark per row whether tokens and cost were reported, and capture the usage harnesses already send: OpenCode's ACP `usage_update` (dropped today in `runner.mjs:533-578`) and pi's turn usage where it emits one (`runner.mjs:367-387`).
6. Estimate what is still missing: a user-editable price table `engine/prices.json` (USD per million input, output, cache-read and cache-write tokens per model, each price with its source URL and date, gathered by Research); Codex cost comes from its tokens and that table; for time-only turns, uncached tokens come from the uncached tokens per minute of reported turns on the same model (else all reported turns), then cost from the table. Every estimated number carries `estimated: true`.
7. Add `bh metrics --json`: per agent and role, time worked, turns, tokens (cached and uncached), cost, tasks and steps, over Today, 7 days, 30 days and All.
8. Add the Metrics tab between Knowledge and Settings as agent cards, busiest first: one card per agent with time, turns, tokens, cost, tasks and steps and a small daily-activity bar chart, estimated numbers marked as such, reading only `bh metrics --json`, and make the page switch fit seven tabs: the slot stays 600px (`layouts/bot-herdr.json:106`); tabs that do not fit go behind a "More ▾" tab at the end, labels kept, the open page always visible, and its open-question counts carried onto More.
9. Discover skills for every harness the team uses: add readers for Gemini CLI, Qwen Code, Antigravity, and pi and omp where they have a skills folder (otherwise mark them unsupported) to `engine/lib/tools.mjs:16`, keeping the 24 h cache.
10. Add a `skills` classifier feature as an allowlist: picks per role are made once when the task or plan is created (in the same classifier call as triage), saved on the task or plan, and reused at spawn so they add no time there; panel seats get picks too. At spawn, `agent.mjs` unions your pins, the picks and any skills added after a blocker, then enforces them where the harness can (Claude Code skills and MCP, Codex MCP; `roster.js:195-213`), and names them in the brief elsewhere. `null` (classifier off or failed) means only your pins apply as today; `[]` means no extra skills. An agent that needs a skill outside its list reports a `blocker` naming it, and the Orchestrator re-spawns it with that skill added. Record which skills each spawn got (pinned, picked, added, fallback).
11. Show skills: in the agent's Settings dialog, a "Pinned by you" section (ticked chips, always allowed) and a read-only "Picked for the current task" list, a searchable skill list, and the skills each step used on the task page; take the harness list from the engine instead of the hard-coded text at `settings.js:1151`.
12. Seat every custom agent on the planning panel, Advisor included: the Plans page takes its seats from the team (Dev, Design, QA, Research and each custom agent) instead of the fixed list (`work.js:67,320,483,1793`), the user can leave any seat off, and the panel and Orchestrator instructions (`engine/roles/panel.md:4`, `orchestrator.md`) name them like the built-in seats.
13. Polish the UI: a Start task button on Ready plans on the Plans page (`work.js:1503`); typing an option's number answers a question (`composer.js:1139`); task ids in chat replies link to the task (`feed.js:268`, writing the unused `OPEN_TASK`); accessibility labels on icon-only buttons (`button.js:18`) and position and selected state on segmented items (`switch.js:46`); a two-step confirm on Remove agent (`settings.js:1179`); Page Up, Page Down and Ctrl+End in the chat feed (`composer.js:227`); a brief "Saved" after Settings autosaves (`settings.js:296`).
14. Re-run the step 1 baselines and record the before and after numbers.

### Objective
Make bot-herdr cheaper and quicker per task, hand each agent the right skills without the user having to tick them, and give the user a Metrics tab that shows who works the most and by how much.

### Scope and non-goals
In scope: UI polish across chat, Plans, Tasks and Settings, custom agents on the planning panel, usage capture and metrics, the Metrics tab, skill discovery and classifier picks, brief trimming, engine and UI latency, the Orchestrator session policy.
Not in scope: changing which models or harnesses each agent uses, model routing, export of metrics, editing skills from the mod, a new dependency.

### Acceptance criteria
- `npm test` passes on Linux with no skips added; new tests cover metrics aggregation, skill discovery per new harness, classifier skill picks with fallback and manual pins, and planning-phase picks.
- Every new usage record has `role`, `project`, `plan` and a reported flag; OpenCode turns carry reported tokens; old records roll up by spawn name.
- The Metrics tab shows one card per agent with time, turns, tokens, cost, tasks and steps over four time windows; estimated numbers are marked, and none shows as a reported zero.
- Every custom agent in the team appears as a panel seat on the Plans page, can be left off, and is spawned in round one when not left off.
- Skills are discovered for Claude Code, Codex, OpenCode, Gemini CLI, Qwen Code and Antigravity.
- Skill picks are made once per task or plan, in the triage call; `bh spawn` makes no classifier call for skills.
- On Claude Code a spawned agent cannot use a skill outside its allowlist; with the classifier off or failing, only your pins apply as today.
- After a task completes, the Orchestrator's next turn runs on a compacted session (Claude Code) or a fresh session seeded with a handoff summary (other harnesses).
- A child's brief is smaller than the step 1 baseline for every role, and no section remains that the child cannot act on.
- Step 14 records before and after numbers for brief size, `bh` latency and spawn time.
- Each UI polish item in step 10 works as described, icon-only buttons have accessibility labels, and at a 600px slot the page switch shows every tab or a More tab holding the rest, and no tab is clipped.
- `herdr-app check mods/bot-herdr` and the gpui-kit typecheck pass.

### Affected areas
Engine: `engine/lib/agent.mjs`, `engine/lib/runner.mjs`, `engine/lib/tools.mjs`, `engine/lib/team.mjs`, `engine/lib/tasks.mjs`, `engine/classifier/index.mjs`, `engine/bh.mjs`, `roster.js`. UI: `pages.js`, `switch.js`, a new `metrics.js`, `icons/`, `settings.js`, `work.js` (seats, Ready plans), `composer.js`, `feed.js`, `chat.js`, `button.js`, `layouts/bot-herdr.json`, `signals.js`, `engine/roles/orchestrator.md`, `engine/lib/plans.mjs`, `engine/lib/core.mjs`, `engine/roles/panel.md`, `engine/prices.json`. Tests: `test/`.

### Decisions by domain
- DEV: metrics come from one `bh metrics --json`; the UI never parses usage files. Usage records keep their current fields and gain new ones.
- DEV: skill picks reuse the `pickScripts` shape (`classifier/index.mjs:288-307`): names and one-line descriptions, capped list.
- DESIGN: Metrics is read-only; aggregation lives in a pure module so Node tests can cover it. The daily-activity chart carries a text alternative.
- ORCHESTRATOR: ships as one task with all 14 steps, one QA gate at the end and one commit (your choice).
- QA: tests use temp `HOME` and project fixtures, never the user's own config.
- RESEARCH: skill paths per harness as in `.bot-herdr/reports/research-panel.md`.

### Assumptions
- [ORCHESTRATOR] Speed and brief work comes first so later steps benefit; Dev and Design work in parallel where steps do not share files.
- [DESIGN] Time windows are Today, 7 days, 30 days and All; Metrics sits between Knowledge and Settings with a new icon.
- [DEV] "Tokens" in the dashboard shows uncached and cached separately; the single total in `steps.js:18` stays as it is.
- [ORCHESTRATOR] "Custom agents" means every agent with no built-in role, Advisor included; Scout stays a helper, not a seat.
- [DESIGN] The More tab shows the sum of the open-question counts of the tabs it holds, and the open page is never moved behind it.
- [DESIGN] Settings shows pins and picks as two sections, not three-state chips, since pins are always allowed under the allowlist.
- [DEV] Prices are kept in a file you can edit, not fetched online.
- [DEV] Panel seats during planning are read-only, so planning-phase picks never include skills that write or deploy.

### Risks and open points
- Gemini CLI, Qwen Code and Antigravity usage reporting is unverified; Antigravity's skill path is second-hand.
- OpenCode v2 no longer lists skills over ACP (anomalyco/opencode#60434); its skills are read from disk only.
- The allowlist can withhold a skill an agent needs; the blocker-and-respawn path and the always-allowed pins limit the damage.
- Estimates for time-only harnesses can be far off when their models differ from the reported ones; the cards mark them.
- Headless compaction is unverified on every harness; step 13 starts by checking it.
