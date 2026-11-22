# Dev — M4 engine: Thread and Home read models, goal progress, layout migration

## Summary

`bh thread` (list/show/peek/summary), `bh home`, `bh goal progress [--sync]` and install's
`migrateLayout`/`backupLayout` are real, derived from the existing stores, and never throw on
corrupt or legacy data. `bh check` and `npm test` pass (636 pass, 1 skipped); the four new commands
answer the real `.bot-herdr` data in 200–370 ms.

## Changes

| File | What changed |
| --- | --- |
| `mods/bot-herdr/engine/lib/thread.mjs` | The derived Thread read model: rows, show (conversation/plan/steps/changes), peek, summary, state derivation, skip-and-log on unreadable records. |
| `mods/bot-herdr/engine/lib/home.mjs` | `bh home`: ranked needs-you (questions, blockers, reviews, held approvals, untriaged issues), the review bucket, the live fleet + running Goals, today's spend, header text. |
| `mods/bot-herdr/engine/lib/goal-progress.mjs` | `bh goal progress`: milestone, gate, elapsed, retries left, judge's last reason, paused; `--sync` writes the progress.md checks table. |
| `mods/bot-herdr/engine/bh.mjs` | Help text for the three commands; `goal progress` gets the task id; `--sync` is a boolean; placeholder comment updated. |
| `install.mjs` | `migrateLayout(old, target)` (pure, idempotent), `layoutBackupPath`, `backupLayout`. Not wired into `runInstall` and `layouts/bot-herdr.json` untouched: M4 UI ships the layout and calls these. |
| `test/thread-model.test.mjs` (new) | Thread model: merge rule, rows, show parts, peek, summary, state table, real git diff, corrupt/legacy/missing stores, CLI. |
| `test/home.test.mjs` (new) | Home: ranking, review, fleet filtering, Goals, today's spend, corrupt data, empty project, CLI; goal progress + progress.md sync (idempotent, CRLF kept) + table escaping. |
| `test/pre-m1-foundation.test.mjs` | The home/thread/goal-progress placeholder assertions replaced with their real shape; approvals/review keep their placeholder tests; `maybeHoldPermission` kept. |
| `test/install.test.mjs` | `migrateLayout` fixtures (11→5 destinations, carried sizes/theme/own page/active page), idempotency, unreadable input, timestamped backups. |

`layouts/bot-herdr.json`, the UI `.js` files and `RECIPE.md` were not touched.

## API shapes

### `bh thread list|show|peek|summary [<id>] [--json]`

One task = one thread; a plan with `plan.task` set to an existing task is that thread; a plan that
is not a task (`grilling`/`ready`, or `task` with its task gone) is its own thread. Archived plans
and archived tasks are not threads. Ids are the stored `t-…`/`p-…` ids (stable).

```json
// bh thread list --json
{ "command": "thread", "sub": "list", "at": "2026-11-22T…", "count": 5,
  "threads": [{
    "id": "t-20261121-td97", "kind": "task", "title": "Redesign bot-herdr UI to Design Language",
    "state": "working", "glyph": "●", "status": "active", "planId": "p-20261121-siir",
    "agents": ["qa", "dev-m3", "dev-m4e", "dev-m1"],
    "steps": { "done": 2, "total": 6 }, "blocked": 0, "openComments": 0,
    "needs": [{ "kind": "question", "ref": "comment c1", "text": "…", "from": "You", "at": "…" }],
    "activeAgents": ["dev-m3", "dev-m4e"],
    "goal": { "status": "running", "passed": 0, "total": 9, "iteration": 0, "maxSpendUsd": 40, "awaitingQa": false },
    "ageMs": 51900000, "age": "2h", "created": "…", "updated": "…",
    "branch": "redesign-bot-herdr-ui-to-design-language", "path": "/home/…/worktrees/redesign-…",
    "summary": { "text": "Merged dev-tsc: 16 files, +239 −37", "at": "…", "source": "board", "agent": "Orchestrator" }
  }],
  "skipped": [{ "id": "t-20260101-bad", "source": "task", "reason": "task record is missing or unreadable" }] }
```

A row carries no cost/tokens (they are the peek's). `agents` are names for the avatars
(step agents then child names, once each); `summary.source` is one of `activity` (latest tool line
from `DATA/activity/<address>.json`), `board`, `step` (last step report), `comment` (a plan's last
comment) or `state`.

```json
// bh thread show <id> --json  (list fields, plus:)
{ "command": "thread", "sub": "show", "plan": null,
  "steps": { "done": 2, "total": 6, "items": [{ "n": 3, "title": "M3 Quiet pass", "status": "active", "agent": "dev-m3", "report": null }] },
  "conversation": { "total": 15, "entries": [
    { "at": "…", "kind": "reply", "from": "dev-m1", "text": "…" },
    { "at": "…", "kind": "comment", "from": "You", "text": "…", "ref": "c1" },
    { "at": "…", "kind": "board", "boardKind": "done", "from": "Orchestrator", "to": null, "text": "Merged dev-tsc…", "ref": "#15" }
  ] },
  "changes": { "available": true, "base": "37d74fb…", "branch": "…", "from": "main",
    "files": [{ "path": "mods/bot-herdr/engine/lib/thread.mjs", "added": 602, "removed": 4 }],
    "filesChanged": 50, "truncated": true, "added": 4481, "removed": 135 },
  "cost": { "tokens": 58265717, "costUsd": 1.8236, "minutes": 118.5, "turns": 5 },
  "comments": [], "children": [{ "name": "dev-m1", "agent": "Dev", "step": 1, "state": "merged", "stat": {…} }],
  "questions": [{ "id": "q-…", "title": "…", "from": "dev-1", "at": "…" }] }
```

`plan` is the plan document (`{id,title,status,round,task,markdown}`) or null; `conversation`
merges chat replies from the thread's agents (`DATA/replies/*.jsonl`, matched by entry `name`,
since the thread began), the user's comments and the board, oldest first, capped at 120 entries;
`changes` is `git diff --numstat <base>` in the task's own tree (worktree when it has one).

```json
// bh thread peek <id> --json
{ "command": "thread", "sub": "peek", "id": "t-…", "kind": "task", "title": "…", "state": "working", "glyph": "●",
  "summary": {…}, "cost": {…},
  "output": [{ "at": "…", "from": "dev-m3", "text": "…" }],
  "question": { "kind": "question", "ref": "comment c1", "text": "…", "from": "You", "at": "…" },
  "needs": [{…}],
  "replyTarget": { "name": "dev-m3", "address": "t10z" } }
```

```json
// bh thread summary            -> { "command": "thread", "sub": "summary", "at": "…",
//                                   "summaries": [{ "id", "title", "state", "text", "source", "agent", "latestAt" }] }
// bh thread summary <id> --json -> { "command": "thread", "sub": "summary", "at": "…", "id", "title", "state",
//                                   "text": "Merged dev-tsc: 16 files, +239 −37", "source": "board",
//                                   "agent": "Orchestrator", "latestAt": "2026-11-22T00:15:40.473Z" }
```

### `bh home [--json]`

```json
{ "command": "home", "at": "…",
  "header": { "running": 3, "needsYou": 5, "text": "3 running · 5 need you" },   // 1 needs you / 2 need you / All quiet
  "needsYou": [{ "kind": "question|blocker|review|approval|issue", "thread": "t-…|p-…|null",
                 "ref": "comment c3|step 4|q-…|round 2|#7", "title": "…", "text": "…", "from": "You|qa-1|null", "at": "…" }],
  "review": [ /* thread rows */ ],
  "fleet": {
    "agents": [{ "name": "dev-m4e", "address": "t110", "harness": "pi", "state": "working|needsYou|idle",
                 "status": "working", "summary": "Editing thread.mjs", "at": "…", "task": "t-…", "cwd": "/home/…" }],
    "goals": [{ "task": "t-…", "title": "…", "status": "running|waiting", "state": "working",
                "passed": 0, "total": 9, "iteration": 0, "maxSpendUsd": 40, "spendUsd": 1.82, "summary": "…" }]
  },
  "spendToday": { "window": "today", "turns": 5, "costUsd": 1.8236, "tokens": 58265717, "minutes": 118.5 },
  "skipped": [] }
```

Order: `question` → `blocker` → `review` → `approval` → `issue`, newest first inside a kind.
`review` items come from threads in the review state (QA on them); the same threads are rows in
`review`. Fleet agents are live `hc ls --all --json` terminals that are agents (bot-herdr named
them, or they run a harness program from roster `HEADLESS`); a plain `sudo`/`shell` terminal is not
one. `spendToday` unions `DATA/usage/*.jsonl` with each task's `usage.jsonl` and dedupes a turn
(`at|agent`). Issues come from `.bot-herdr/issues/cache.json` + `triage.json` only — no network,
no `gh` call.

Held approvals are wired to the approvals module: Home calls `AP.listHeld(root)` when
`engine/lib/approvals.mjs` exports it (M6), and reports nothing until then.

### `bh goal progress [<task>] [--sync] [--json]`

```json
{ "command": "goal progress", "at": "…", "task": "t-20261121-td97", "title": "Redesign bot-herdr UI to Design Language",
  "taskStatus": "active", "mode": "goal", "isGoal": true,
  "status": "running", "paused": false,
  "milestone": { "n": 4, "total": 6, "title": "M4 Navigation, threads, peek, goal row, RECIPE.md", "status": "active" },
  "gate": { "passed": 0, "total": 9, "reached": false, "best": 0 },
  "iteration": 0, "awaitingQa": false, "pendingAmendment": null,
  "elapsedMs": 7360000, "elapsed": "2h", "workedMs": 6830000,
  "retries": { "used": 0, "cap": 3, "left": 3 },
  "lastReason": "No round has been verified yet.",
  "lastRound": null,
  "budget": { "spendUsd": 1.83, "maxSpendUsd": 40, "maxIterations": 0 },
  "contract": { "ok": false, "error": "no frozen contract on this machine" },
  "waiting": null,
  "criteria": [{ "id": "c1", "kind": "file", "text": "…", "verdict": null, "evidence": null, "at": null }] }
```

`--sync` adds `progress: { "file": "/…/progress.md", "synced": true, "rows": 9, "reason": null }`.
A task that is not a Goal answers `isGoal:false` with a `reason` (exit 0); an unknown id is the
usual `No task …` error. A Goal has no stored start: `elapsedMs` is now minus the earliest of the
task's `created`, its first iteration row and its first usage turn; `workedMs` is `T.worked`
(turns merged). `--sync` replaces only the `## Checks` table in the task's progress.md, leaving
every other section and the file's line endings as they were; it is idempotent and skipped with a
reason when there is no progress.md.

### install: `migrateLayout(old, target)` / `backupLayout(file, { at })`

`migrateLayout` takes the installed layout and the shipped one (objects or JSON text) and returns
the layout to write: the target's structure (Home, Threads, Agents, Library, Settings + Usage) with
the person's own choices carried over — appearance keys (`theme`, `titlebar`, `toast`,
`traffic_lights`, `background`, `terminal_padding`, `divider`), the `size`/`min`/`max` of shared
node ids (rail, spaces, agents, topbar, switch, panel, status), the active page when the redesign
has it, and any page of their own that is not one of the old destinations. Old bot-herdr
destinations (`chat`, `tasks`, `plans`, `issues`, `knowledge`, `learning`, `metrics`, `settings`,
`terminals`, …) are replaced, not duplicated. Idempotent; pure; returns `null` when the target
cannot be read (the caller keeps the installed file). `backupLayout` copies the installed file to
`<file>.<UTC stamp>.bak` (never reusing a name) and returns that path, `""` when there is no file.

## State derivation rules

One of the seven spec states, first match wins:

| State | A task thread | A plan thread |
| --- | --- | --- |
| `needsYou` ◆ | an open user comment; a blocked step; latest gate `BLOCKED`; a Goal pending amendment | an open user comment, or an open `bh ask` set for it |
| `failed` ✕ | task `abandoned`, or Goal `stopped` | — |
| `paused` ‖ | task `paused`, Goal `paused` or `waiting` | — |
| `review` ◇ | a QA step active, Goal `awaitingQa`, or latest gate `CHANGES_REQUIRED` | — |
| `done` ✓ | task `done`, Goal `reached` | — |
| `working` ● | task `active`, Goal `running`, a step active, or an open child | plan `grilling` |
| `idle` ○ | everything else | plan `ready` |

Rows are ranked needsYou → review → working → paused → done → failed → idle, newest first inside a
state.

## Brief Check

1. **`bh thread list|show|peek|summary`** — met. Additive derived model over tasks/plans/board/
   reports/replies/activity/git; one task = one thread, a plan that became a task merges in (test:
   "one task is one thread…"); every row carries id, title, one of the 7 states, agent names,
   steps done/total, age, branch/worktree, plus `summary`; `show` has Conversation, Plan, Steps and
   Changes; `peek` has recent output, the open question, needs and the reply target with address.
   Corrupt/legacy/missing records are skipped, logged to `DATA/logs/ui.jsonl`, never thrown
   (tests: "a corrupt record is skipped…", "missing stores answer empty").
2. **`bh home [--json]`** — met. `needsYou` ranked (questions, blockers, reviews, approvals seam,
   untriaged cached issues), `review`, `fleet` (agents with state + one-line activity, Goals with
   progress), `spendToday`, header with correct plurals. Tests: ranking, review, fleet filtering,
   goals, spend dedupe, corrupt data, empty project, CLI.
3. **`bh goal progress`** — met. Milestone, gate passed/total/reached, elapsed, retries left, the
   judge's last reason, paused, budget and criteria, from `G.goalStatus` + the same task;
   `--sync` rewrites only the progress.md checks table (idempotent, hand-written sections and CRLF
   preserved; tests in home.test.mjs).
4. **`install.mjs` migration** — met. Pure idempotent `migrateLayout(old, target)` mapping an
   existing layout (including one with `"metrics"`) onto the 5-destination structure, own pages
   kept, plus `backupLayout` with a timestamped name; 8 fixture tests. `layouts/bot-herdr.json`
   unchanged and `runInstall` still uses the old copy path, so nothing ships before the M4 UI
   layout lands.
5. **Tests** — met. `test/pre-m1-foundation.test.mjs` placeholders replaced for the three real
   commands; `test/thread-model.test.mjs` and `test/home.test.mjs` added with normal, corrupt,
   legacy and missing stores.
6. **Checks** — met: `bh check` PASS, `npm test` 636 pass/1 skipped/0 fail, and the four commands
   answer the real data in 203–363 ms with exit 0 (below).

## Verification

- `npm test` — 637 tests, 636 pass, 1 skipped, 0 fail (155 s)
- `node mods/bot-herdr/engine/bh.mjs check` — `PASS: 636 tests pass, 1 skipped, typecheck passes` (Ran: 0 lint, 1 typecheck, 637 tests; the mod's jsconfig typecheck is clean)
- `bh home --json` — exit 0, 290 ms, header `3 running · 5 need you`, 5 needs-you items (4 questions from p-20261120-7rw6 + its open `bh ask`, 1 untriaged issue #1), 3 fleet agents, 1 running Goal, `spendToday` $1.82 / 58.3M tokens
- `bh thread list --json` — exit 0, 235 ms, 5 threads (`p-20261120-7rw6` needsYou, `t-20261121-td97` working 2/6, `t-20261121-axaz` done, two idle plans), `skipped: []`
- `bh thread peek t-20261121-td97 --json` — exit 0, 363 ms, summary, cost $1.82, 8 output lines, no open question, reply target `dev-m3 (t10z)`
- `bh goal progress t-20261121-td97 --json` — exit 0, 203 ms, milestone 4/6, gate 0/9, retries 3/3, elapsed 2h, budget $1.83 of $40, `contract.ok:false` (no frozen contract in this checkout)
- `node --test test/thread-model.test.mjs test/home.test.mjs test/install.test.mjs test/pre-m1-foundation.test.mjs` — 37 pass, 0 fail

## Notes for the M4 UI step

- `bh thread show` is the thread page's one call; `peek` is the drawer's; `list` polls cheaply (no
  git, no usage files).
- The goal row calls `bh goal progress <task> --json`; `--sync` is only for a deliberate write.
- To ship the new layout: write it to `layouts/bot-herdr.json`, then in `runInstall` back the
  installed file up with `backupLayout(file)` and write `migrateLayout(installed, repoLayout)` when
  it returns a layout (M4 currently uses the copy path).
- `elapsed`/`age` are human strings; the raw numbers (`elapsedMs`, `ageMs`) are there for the UI.

## Knowledge Proposals

- `hc ls --all --json` lists every terminal with `{address, name, agent, state, status, cwd}`; a
  fleet row must filter to bot-herdr's agents (a `name`, or a roster `HEADLESS` app), because plain
  `sudo`/`shell` terminals are listed too.
- `team.hc` blocks for its timeout, so engine code that polls herdr should pass a short timeout
  (≤2 s) and fall back to no live data: a dead herdr core must not hold a `bh` call open.
- Running `bh` from `mods/bot-herdr/engine` in a worktree makes `DATA` that worktree's committed
  `data/bot-herdr` (old samples), while project stores still come from the main checkout via
  `store()`; today's spend therefore also unions the tasks' own `usage.jsonl`.
- A Goal stores no start time: derive elapsed from the earliest of `task.created`, the first
  iteration row and the first usage turn.
- `progress.md` has no schema; the goal row owns exactly its `## Checks` table and must preserve the
  other sections (and the file's CRLF endings) when syncing.

## Script Proposals

None.

## Pushback

None. Two decisions worth a second look: QA reviews appear both as a needs-you item and as rows of
Home's `review` section (the brief lists them under needsYou, the design gives them their own
section), and held approvals are read from `approvals.mjs`'s future `listHeld(root)` export rather
than a new store I would have invented before M6.
