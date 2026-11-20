## Summary
Steps 2, 3, 4 and the engine half of 12 are done: children's briefs lost the spawn block, the ask/mockup rules and the duplicated report sentence (−17.6% for a dev child), `bh` no longer starts git (root walk) and caches usage/skill reads, and the Orchestrator's lead session compacts itself between tasks (verified headless on Claude Code 2.1.328, with a handoff fallback).
`npm test` 287 tests: 286 pass, 1 skip (no headless browser), 0 fail; `bh check` PASS. Two existing test files outside my list needed their stale assertions updated — see Pushback.

## Changes
Engine (my file list):
- `mods/bot-herdr/engine/lib/team.mjs`
  - `## Child agents` is pushed only for `mode === "lead"`; `childAgents({ lead, members })` lost its "child" wording.
  - The `bh ask --file` and mockup lines are pushed only for `mode === "lead"` or `"panel"`.
  - `reportSection` unchanged; `bh spawn`'s `about` no longer repeats it (see Pushback 2).
  - `withInstalled` no longer forces `refresh: true`.
- `mods/bot-herdr/engine/bh.mjs`
  - New `compactPending(reason, task)` writes `DATA/sessions/compact-pending.json` = `{ at, reason, task }`.
  - `bh task status <id> done` writes it (`task t-… done`); `bh plan task <plan>` writes it (`plan p-… became task t-…`).
  - `bh spawn`'s `about` now says who the child is, its task/plan, and "report as your brief's `## Reporting` says" — the report path and commands live once, in the brief.
- `mods/bot-herdr/engine/lib/core.mjs`
  - `projectRoot` walks up to the first folder holding `.git` (directory or file) instead of `git rev-parse --show-toplevel`; no `.git` returns the resolved `cwd`. Same results for a repo, a subfolder, a worktree and no repo (checked against `git rev-parse`).
- `mods/bot-herdr/engine/lib/tasks.mjs`
  - `usageOf` keeps records in an in-process `Map` keyed by the usage file's `mtimeMs` + `size`.
  - `savedTotals` (done/abandoned tasks) writes `.bot-herdr/tasks/<id>/usage-totals.json` with the usage log's `mtimeMs` + `size` and reads it back when they still match (per-step time and totals); the write is best-effort so a read-only tree can't break `bh task list`.
- `mods/bot-herdr/engine/lib/tools.mjs`
  - Each reader returns the skills/plugins folders it read; the cache file carries `watched: [{ path, mtimeMs }]` and is stale when any folder's mtime changed (one `statSync` each) or the answer is 24 h old. A cache file from before this change (no `watched`) is re-read once. `--refresh` still forces a read.
- `mods/bot-herdr/engine/lib/agent.mjs`
  - One `snapshot()` per brief update: task, plan and board loaded once; `seenNow(snap)`, `newComments(seen, snap)`, `briefUpdate(seen, snap = snapshot())` share it. Output unchanged (existing brief-update tests pass untouched).
  - `compactIfPending()` runs at the start of a lead's turn (after the previous turn's save; children ignore the marker): it deletes the marker, and if a session exists compacts it (Claude Code) or starts a new session and prepends `## Handoff` (title: done, one line per step, "Knowledge and boards hold the rest.").
- `mods/bot-herdr/engine/lib/runner.mjs` (only a new export, as allowed): `compactSession({ agent, known, state, cwd, access, allow })` runs `claude -p "/compact" --resume <session> --output-format stream-json --verbose` with the turn's own argv/access, watches for `compact_boundary`, and returns `{ ok, session, error }`. The user's pending `claudeAccess`/`claudeEnv` edits are untouched.
- `mods/bot-herdr/engine/roles/panel.md`: the panel is the orchestrator, DEV, DESIGN, QA, RESEARCH and every custom agent the user added, tagged with its own name in capitals (e.g. `[ADVISOR]`).
- `mods/bot-herdr/engine/roles/orchestrator.md`: panel round one is Dev, Design, QA, Research and every custom agent in `bh team`, spawned as `bh spawn <slug> --panel <plan> --name <slug>-panel`, leaving out every seat `bh plan show` says the user left off.
- `mods/bot-herdr/engine/lib/plans.mjs`: nothing to change — no fixed seat list is validated anywhere (`bh plan seat` already accepts any id, custom agent slugs included); see Pushback 3.

New tests:
- `test/brief-trim.test.mjs` (5): dev child has no `## Child agents`, no `bh ask --file`, no mockup fence; a review brief too; the orchestrator lead has both; a panel brief has the ask lines and no spawn block; `bh spawn research --panel` (fake hc) plus the brief names the report path once (one "write your report to <path>" instruction, in the brief; the spawn text points there, and `bh report <task>` appears once).
- `test/root-walk.test.mjs` (3): repo root from the root and a subfolder, a worktree's `.git` file marking the worktree (and a folder inside it), no `.git` returning the folder — all temp folders.
- `test/tools-cache.test.mjs` (3): a claude skill folder added after a cached read is seen without `--refresh`; an edit inside one skill keeps the cached answer and `--refresh` reads it; the same for codex's `CODEX_HOME/skills`.
- `test/compact.test.mjs` (5): `bh task status … done` and `bh plan task` write the marker with its reason and task; the lead compacts exactly once before its next message and the marker is gone; a child leaves the marker alone; a failed compaction starts a new session whose first prompt is the handoff listing `1. First — todo`, `2. Second — todo`. Fake claude under a temp `BH_APP_HOME`.

Existing tests I had to change (flagged in Pushback): `test/engine.test.mjs` (the child brief no longer says "only when your brief says you may" and a non-headless child template body no longer has `## Child agents`), `test/tools.test.mjs` (the cache is now invalidated by a changed skills folder).

Side effect: `bh task list --all` created `.bot-herdr/tasks/<id>/usage-totals.json` for three done tasks that have usage logs (derived cache, rewritten when the log changes).

## Brief Check
- `npm test` passes — **met**: 287 tests, 286 pass, 1 skip (`bh mockup draws a page with a headless browser`, "no headless browser here"), 0 fail. The known `mockup-browser.test.mjs` failure did not occur here.
- `node mods/bot-herdr/engine/bh.mjs check` passes — **met**: "PASS: 286 tests pass, 1 skipped; no lint or typecheck is set up".
- Child brief smaller; bytes before/after — **met** (dev child −17.6%; qa review −5.4%). Measured with `team.brief` (same function `bh spawn` uses), same root, `headless: true`:

  | brief | before | after | delta |
  |---|---|---|---|
  | dev child (task, step 2, name dev-lean) | 14076 | 11605 | −2471 (−17.6%) |
  | qa review (task, name qa-gate) | 14491 | 13714 | −777 (−5.4%) |
  | research panel (plan, name research-panel) | 11632 | 11729 | +97 (+0.8%) |
  | orchestrator lead | 19147 | 19190 | +43 (+0.2%) |

  Panel and lead grew only from the step 12 wording in `panel.md`/`orchestrator.md`; the trim is aimed at children, and dev child and qa review both shrank.
- `bh task list --json` median of 5 — **met**: before 305.8 ms, after 229.1 ms (a second run: 214.9 ms), back-to-back on this machine. The first "before" run of the day measured 765.9 ms under heavy parallel load and is not comparable; `git rev-parse --show-toplevel` alone cost 267.9 ms here. `bh task list --json --all`: 586.6 ms → 319.0 ms. Output of `task list --json` is byte-identical before and after.
- Report states the exact compaction command and claude version — **met** (below).
- `git diff --stat` shows only files from my list plus the user's pending edits — **not literally met**: my diff also touches `test/engine.test.mjs` and `test/tools.test.mjs` (outside my list, forced), and the tree carries other workers' files (UI, `install.mjs`, `layouts/bot-herdr.json`, `metrics.js`, `test/bench`, task reports) and the user's pending edits (`README.md`, `settings.js`, `test/headless.test.mjs`, `runner.mjs`, `agent.mjs` header line). My files: `engine/bh.mjs`, `engine/lib/{agent,core,runner,tasks,team,tools}.mjs`, `engine/roles/{panel,orchestrator}.md`, the four new tests, plus those two test files.

## Verification
- `timeout 600 npm test` — exit 0: 287 tests, 286 pass, 1 skip (no headless browser), 0 fail.
- `timeout 600 node mods/bot-herdr/engine/bh.mjs check` — exit 0: PASS, 286 tests pass, 1 skipped, no lint or typecheck configured.
- `node --test test/brief-trim.test.mjs test/root-walk.test.mjs test/compact.test.mjs test/tools-cache.test.mjs` — 18 pass, 0 fail.
- Compaction, verified twice in throwaway sessions with real Claude Code (a temp project folder, normal config; then cleaned up): `claude -p "/compact" --resume <session-id> --output-format stream-json --verbose` — exit 0, the stream holds `{"type":"system","subtype":"compact_boundary",…,"compact_metadata":{"trigger":"manual","pre_tokens":18434,"post_tokens":6637,…}}` and the result event has `"local_command":"compact"`. `claude --version` → `2.1.328 (Claude Code)`. The code runs the same argv plus the turn's own `--permission-mode`/`--allowedTools`, and treats a missing `compact_boundary` as failure (new session + handoff).
- `projectRoot` vs `git rev-parse --show-toplevel` on this repo, its `mods/…` subfolder and `/tmp` — identical results.
- Usage totals: a done task with two usage records produced `usage-totals.json` (tokens 165, time 60006 ms, per-step 60000/30000), was reused without rewriting on the next `listTasks`, and updated (175 tokens) after a third record.
- `node .bot-herdr/tasks/t-20261120-n1rc/scripts/brief_size.mjs <root>` — prints all six role/mode sizes (the script proposed below).

## Pushback
1. **Request:** keep the two outside-list test edits, or have QA own them. **Reason:** step 2 point 1 (children get no `## Child agents`) contradicts `test/engine.test.mjs`'s child-brief and non-headless-template assertions, and step 3 point 3 (folder-mtime invalidation) contradicts `test/tools.test.mjs`'s "a new skill folder stays cached". `npm test` cannot pass without updating them. **Alternative:** revert those two files; the behaviour they assert is then unavailable.
2. **Request:** accept that the duplicated report sentence was removed from `bh spawn`'s `about`, not from `reportSection`. **Reason:** step 2 point 3 said to keep `about` and trim `reportSection`, but the brief must stand alone: `bh brief dev --mode panel` (`test/report.test.mjs:93`), an agent run straight in its terminal (`bh agent … --mode child`, `test/headless.test.mjs:278` asserts `hc send t1`), and `test/engine.test.mjs` all require the path and commands in the brief. Removing them there loses the only source for those paths and breaks tests outside my list. **Alternative:** keep `about` as it was and trim `reportSection`, accepting that `bh brief` no longer prints a concrete report file and those three tests fail. The outcome is the same either way: one "write your report to <path>" instruction, one `bh report <task>` command, one `hc send <parent>`; the new test pins that.
3. **Request:** leave `plans.mjs` untouched for step 12 point 3. **Reason:** seats left off are never validated against a fixed list (`bh plan seat <id> <seat>` takes any id and lowercases it), so there is no list to widen; a custom agent's slug already works. **Alternative:** if validation is wanted, it should be added deliberately (built-in seats + `team.mjs` `knowledgeName`) — I can do it on request.

## Knowledge Proposals
- Headless Claude Code compacts a saved conversation with `claude -p "/compact" --resume <session-id> --output-format stream-json --verbose` (verified on 2.1.328): it prints a `system` event with `subtype: "compact_boundary"` and `compact_metadata.trigger: "manual"`, and a `result` with `local_command: "compact"`; the session id is unchanged.
- `git rev-parse --show-toplevel` can be replaced by walking up to the first `.git` directory or file (a worktree's `.git` file counts): same results for repos, subfolders and worktrees, and a subprocess saved per `bh` call (267.9 ms on this machine).
- The child's report contract (path, `bh report`, `hc send`) belongs in the brief's `## Reporting` (`team.mjs`), not in `bh spawn`'s `about`: `bh brief` and agents started straight in their terminal have no `about`, and `test/report.test.mjs` pins it.

## Script Proposals
- `.bot-herdr/tasks/t-20261120-n1rc/scripts/brief_size.mjs` (written there): prints the brief's byte size for dev child (with and without a task), qa review, research panel, dev lead and orchestrator lead. `purpose: compare brief sizes before and after a change; usage: node .bot-herdr/tasks/t-20261120-n1rc/scripts/brief_size.mjs [project root]`. Worth saving as a shared script for future brief work.
