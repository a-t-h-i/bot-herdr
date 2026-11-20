Goal: steps 2, 3, 4 and the engine half of step 12 of task t-20261120-n1rc (bh task show t-20261120-n1rc; plan p-20261120-7rw6): leaner briefs, faster `bh` calls, the Orchestrator's session compacted between tasks, and custom agents named as planning seats. Do them in that order.

You work in the shared tree (the user's uncommitted edits in agent.mjs, runner.mjs, settings.js, README.md and test/headless.test.mjs stay as they are: build on them, never revert them). Design works at the same time on the UI files; never touch a file outside your list.

Files you may change: `mods/bot-herdr/engine/lib/team.mjs`, `engine/lib/agent.mjs`, `engine/bh.mjs`, `engine/lib/core.mjs`, `engine/lib/tasks.mjs`, `engine/lib/tools.mjs`, `engine/lib/plans.mjs`, `engine/roles/panel.md`, `engine/roles/orchestrator.md`, and new test files `test/brief-trim.test.mjs`, `test/root-walk.test.mjs`, `test/compact.test.mjs`, `test/tools-cache.test.mjs`. Not: any UI file (`mods/bot-herdr/*.js`), `runner.mjs` except as step 4 point 4 says.

Step 2: trim briefs (`team.mjs` `brief`, lines 95-145)
1. Push `childAgents(...)` (team.mjs:124-127) only when `mode === "lead"`. Children, panel and review get no `## Child agents` section.
2. Push the two `bh ask` / mockup lines (team.mjs:119-120) only when `mode === "lead"` or `mode === "panel"`.
3. `bh.mjs:691-697` builds an `about` paragraph that repeats the report instructions that `reportSection` (team.mjs) already puts in the brief. Keep one source: keep the `about` text (it has the exact report path and parent address) and remove whatever `reportSection` says that `about` already says, so no instruction appears twice. Nothing the child needs may be lost: report path, `bh report` command, `hc send` to the parent.
4. In `agent.mjs:272-309`, `seenNow`, `newComments` and `briefUpdate` each load the task and plan again. Load task and plan once per turn and pass them in (`briefUpdate(seen, now)`), so one turn reads task.json, plan.json and board.jsonl once each. Same output as today.
5. `test/brief-trim.test.mjs`: brief for dev in child mode has no "## Child agents" and no "bh ask --file"; orchestrator lead brief still has both; panel brief has the ask lines; the spawn text plus brief contains the report path exactly once.

Step 3: faster `bh`
1. `core.mjs:40-46` `projectRoot`: replace the `git rev-parse` subprocess with a walk up from `cwd` looking for `.git` (a directory, or a file — a worktree's `.git` file — which still marks that folder as the root, as rev-parse does). No `.git` found: return `cwd`. Same results as today for: a normal repo, a subfolder, a worktree under `.bot-herdr/worktrees/…`, no repo. Cover these in `test/root-walk.test.mjs` with temp folders.
2. `tasks.mjs:51-58` `listTasks` reads every task's usage.jsonl each call. Cache each task's totals keyed by the usage file's `mtimeMs` and `size` (in-process `Map`), so an unchanged file is not reread within one process. Plus: if a task is `done` or `abandoned`, write its totals to `.bot-herdr/tasks/<id>/usage-totals.json` with the usage file's mtime and size, and use that file when they still match.
3. Skill rescans: `team.mjs:34-37` `withInstalled` forces `refresh: true` so a newly installed skill is denied too. Keep that guarantee but make it cheap: in `tools.mjs`, make the cached result for a harness carry the `mtimeMs` of each skills/plugins folder it read, and treat the cache as stale when any of those folders' mtimes changed (one `statSync` each), in addition to the 24 h age. Then drop `refresh: true` from `withInstalled`. (Design will drop `--refresh` from `composer.js:533` in the same task; `bh tools <harness> --refresh` must keep working for the Settings refresh button.) Test in `test/tools-cache.test.mjs` with a temp HOME: add a skill folder, the next read sees it without `--refresh`.

Step 4: compact the Orchestrator's session between tasks
1. `bh task status <id> done` and `bh plan task <plan>` write `DATA/sessions/compact-pending.json` = `{ "at": <ISO>, "reason": "task t-… done" | "plan p-… became task t-…", "task": "<id>" }` (DATA as `agent.mjs` uses it).
2. In `agent.mjs` `runAgent`, only for `mode === "lead"`: before sending the next user message (never during a turn, and after the turn-end save at agent.mjs:380-382), if that file exists, consume it (delete it), then compact.
3. Compacting: first verify how a headless Claude Code session compacts (try `claude -p "/compact" --resume <session> --output-format stream-json` in a throwaway session, or check `claude --help`; record what works in your report with the exact command and version from `claude --version`). If it works, run it for the claude harness. For every other harness, or if it fails, start a new session (the same thing `/new` does at agent.mjs:431-438) and prepend to the next message: `## Handoff\n<task title>: done. <one line per step: n. title — status>\nKnowledge and boards hold the rest.` built from the task's task.json.
4. If compaction needs a runner function, add it to `runner.mjs` as a new exported function only; do not change existing ones (the user's uncommitted edits are there).
5. `test/compact.test.mjs`: the marker is written by both commands; the lead consumes it once; a child ignores it; the handoff text lists the steps.

Step 12 (engine half): custom agents as planning seats
1. `engine/roles/panel.md:4`: say the panel is the orchestrator plus one member per domain (DEV, DESIGN, QA, RESEARCH) and every custom agent the user added, tagged with its own name in capitals (e.g. `[ADVISOR]`).
2. `engine/roles/orchestrator.md` "Planning with the panel" step 2: the panel is Dev, Design, QA, Research and every custom agent in `bh team` (spawn each as `bh spawn <slug> --panel <plan> --name <slug>-panel`), leaving out every seat `bh plan show` says the user left off.
3. `plans.mjs`: if seats left off are validated against a fixed list, accept any seat id that is a built-in seat or a custom agent's slug (`team.mjs` `knowledgeName`).

Constraints: no new dependency; functions at or under 20 lines; no refactor beyond what is listed; keep every existing test passing; never touch the user's real HOME in tests.

Done when
- `npm test` passes (report pass/skip/fail counts; the known Linux failure in mockup-browser.test.mjs is fixed in another worktree, ignore only that one).
- `node mods/bot-herdr/engine/bh.mjs check` passes.
- The brief for `dev` in child mode (print it with the same function `bh spawn` uses) is smaller than before; report bytes before and after for dev child, qa review, research panel, orchestrator lead.
- `bh task list --json` on this repo: report median ms of 5 runs before and after.
- Your report states the exact compaction command you verified (or why none works) and the claude version.
- `git diff --stat` shows only files from your list (plus the user's own pending edits, untouched).

If stuck: if a point conflicts with the code (e.g. removing a reportSection line would lose an instruction), stop that point, finish the rest, report it under Blockers. Propose knowledge in your report; do not write it.
