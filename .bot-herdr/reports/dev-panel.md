## Status
OPEN

## Questions

1. When an agent's model hits its usage limit mid-message, what should the harness do?
   - Same harness, next model — the conversation continues on the next model of the same CLI; nothing is re-explained.
   - Another harness, handoff — a new conversation on a different CLI, started from a short handoff of the task, step and its last reply.
   - Both, in order — the harness's next model first, then another harness; if none is left, hold the message until the limit resets.
   - Hold until reset — no model or harness switches; the message runs when the limit resets, and the chat says when.

2. What must happen before the harness applies a self-improvement tweak to itself?
   - Nothing without you — it collects lessons and proposals; you accept each batch before anything changes.
   - Gate, then apply — `bh check` plus a review must pass; the change applies with a receipt and a one-click revert.
   - Numbers, then revert — it applies by itself and auto-reverts any change that worsens the next window (cost, failures, gate rounds).
   - Never changes itself — it only writes lessons for the team to read; behaviour changes stay ordinary tasks.

## Notes

### 1. Quota / rate limit: nothing detects it today

- `rg -i "rate.?limit|quota|429|usage limit|exhaust|retry"` over `engine/lib/*.mjs` and `bh.mjs` finds nothing (only `limitArgs`, which is skills/MCP deny flags). Every harness failure is free text: Claude `result.is_error/subtype` (`runner.mjs:311-318`), Codex `turn.failed.error.message` (`:396-400`), pi `message.stopReason === "error"` (`:434-437`), ACP `r.error.message` (`:602-606`); `agent.mjs:454-472` turns it into a "**Couldn't finish:**" chat reply.
- It really happens here: `data/bot-herdr/replies/t4z.jsonl` holds a live Claude failure, `You've hit your 5-hour limit · resets 7:10pm (Africa/Johannesburg)` — the same words arrive as assistant text *and* as the result error, so detection must read both.
- Detection belongs in one pure module (e.g. `engine/lib/failures.mjs`) returning `{ kind: "quota"|"auth"|"unavailable"|"timeout"|"crash"|"unknown", resetAt, retryAfterMs }`, keyed by harness. Claude's reset is time-of-day plus a timezone in brackets, no date: resolve it to the next occurrence, and fall back to a fixed conservative window when it can't be parsed. The existing fake harnesses (`test/headless.test.mjs` `FAKES.claude|codex|pi|gemini`, plus `test/acp-reply.test.mjs`) can prove every branch without a real limit.
- The switch point is `agent.mjs runTurn` (`:398-459`): it re-reads the agent from Settings every turn (`current()`, `:355`), owns the queued message, the session state and the reply write. One fallback attempt per message (never a loop), and a persisted per harness+model "limited until" in DATA so a restart honours it.
- Session consequence that shapes the chain: `resumeState` (`agent.mjs:203-209`) drops the session whenever the harness changes, so a cross-harness fallback is always a new conversation and needs a handoff (task, step, open board entries, its own last reply). A same-harness model switch keeps the conversation (`--resume` and `--model` coexist for Claude Code), so that tier loses nothing.
- `DATA/sessions/<key>.json` is `{ harness, session, root }` today and a harness change writes a fresh object (`agent.mjs:441-446`): keep per-harness sessions additive beside `session`, or fallbacks will make agents forget their conversation on every resume.
- If the chain is per agent, it must be added to `roster.clean` (`roster.js:114-126`, which drops unknown fields) and to the `bh team save` validation (`bh.mjs:723-731`); otherwise every Settings save silently erases it.

### 2. Self-improvement and guardrails: the inputs exist, the loop does not

- Outcome data is recorded and never read back: `tasks/<id>/checks.jsonl` (`recordCheck`), `task.gates` rounds (`recordGate`), gate reports, board blockers/questions, and `DATA/usage/*.jsonl`. `metrics.mjs` only totals tokens, cost, minutes, tasks and steps (`metrics.mjs:239`). Nothing measures "did the last tweak help".
- Knowledge is capped and degrades silently: `knowledge.LIMIT = 20000` and `forBrief(..., 8000)` mean a loop that keeps appending entries stops reaching briefs (whole sections are dropped first, then the tail). Any auto-improvement must fold/archive knowledge rather than append, and the plan should say who folds it.
- A tweak half-applies by design: `bh` is a new process per call, so an engine edit is live for the next `bh` command, while every running agent terminal keeps the `agent.mjs`/`runner.mjs` it imported at start. A self-improvement step must state which half it changes, or the team runs two versions of itself mid-task.
- Guardrails that fit the existing shapes: an experiment record (change, before/after window, verdict) written next to the knowledge it touches; a per-task budget ceiling from `usage.jsonl` that pauses a task instead of killing it; a bounded fallback/spawn count so a quota storm cannot fan out; and keeping every automatic change behind `updateTask`'s lock plus a `bh check` receipt.
- The safe baseline already exists: agents propose (`## Knowledge Proposals` / `## Script Proposals`, `team.mjs` reportSection), the Orchestrator records, `bh gate` and `bh check` receipts prove work, `writeJson`/`writeText` are atomic (`core.mjs:80-94`). Build the loop on those, not a new store.

### 3. Chat glitches: five concrete engine-side causes

1. **A `bh reply` is invisible** for any agent that has ever run headless: `chat.js:367` skips `.md` whenever `replies/<key>.jsonl` exists, and `bh reply` writes only `.md` (`bh.mjs:717-721`). An agent switched from headless to its CLI keeps its old log and every later manual reply is shadowed.
2. **A repeated reply is swallowed**: the `.md` path dedupes by exact text (`isNew`, `feed.js:165-167`), so "Done." twice shows once, while the log path (which carries `at`) shows both.
3. **A false "finished without writing a reply" under every question card**: a turn that asked deliberately leaves no reply (`toChat`, `agent.mjs:36-44`), but the chat's `waits` entry is cleared only by a reply (`chat.js:447`) and never by `readQuestions` (`:484-487`), so `outcome` (`feed.js:174-180`) posts the 8 s silent note beside the card.
4. **A first-turn double post**: `finish` writes `.md` before the log line (`agent.mjs:469-472`) and the chat reads logs first, then `.md` only for keys with no log; a poll landing between the two writes adds the same turn twice. Narrow window, but the only duplicate path I found.
5. **Unhardened output and an unguarded handler**: harness text is printed to the terminal raw (`agent.mjs:433-438`), so a model's answer can carry OSC/DCS sequences and spoof herdr's own `\x1b]7501` status (fake "working"/"done", clipboard writes). And `on()` runs inside the child's stdout `data` handler (`runner.mjs:677-684`): any throw there (a failed write, `say` to a closed terminal) kills the agent mid-turn with no reply — exactly the intermittent "no reply" shape. Related dead output: `DATA/activity/*.json` is written per tool call (`agent.mjs:252`) and nothing reads it.

Recommended shape: make the reply log the single source of truth — every path that talks to the chat (turn text, `bh reply`, an asked card, a stopped turn) appends one event line with `at`, a `kind` and an id; the chat consumes only that, and `.md` stays the last turn's file for display, not for dedupe. That also gives the chat the `kind: "asked"` hook it needs to clear a wait. `test/agents-reply.test.mjs` asserts the current source shape (`writeText` then `logReply`) and must be rewritten with it.

### 4. Tasks page: what the engine contracts need

- `bh task list --json` (`listTasks` → `withUsage`, `tasks.mjs:75-97`) ships every task with its steps and per-step usage — no done/total, no step events, no reports, checks, merges, gates or board. `bh task show --json` (`taskDetail`, `tasks.mjs:352-367`) has all of that, for one task. The page polls `task list --all` every 4 s (`work.js:76, 422`) and draws the open task from that same list record, so it cannot show a report, a receipt, a merge or the board without a second call.
- A richer page therefore needs: (a) a cheap list contract for polling (id, title, status, track, done/total, blocked, open-comment count, needs-you flag, updated, who is running) with `--since <updated>` or `--active`, keeping steps/usage out of it; (b) `task show <id> --json` as the detail contract, fetched only for the open task; (c) an explicit allowed-actions list per task and step so the UI never invents a transition; (d) `updated` as a concurrency token on writes (`bh task step|status|comment … --if-updated <iso>`, refused with a clear error) — `updateTask` locks, but a stale screen can still overwrite a newer change; (e) a task-scoped "running / needs you" signal, since the engine has nothing today except `usage.jsonl` turn timestamps (task-level, not step-level).
- Cost is real: `listTasks` stats and reads a usage file per task; on this repo `bh task list --all --json` is already 130 KB / 0.27 s and grows with history, at a 4 s poll.
- Data contracts I should not break: comment ids (`nextCommentId`), `boardLine`/`taskLine` text output, `taskDetail.steps[].events` order, and `task.json`'s step shape (Design's tracker and `bh task show` both read it).

### 5. Verification available for the plan's "done when"

- `bh check` runs lint, typecheck and the suite; `test/headless.test.mjs` already drives `bh agent` end to end against fake harnesses with a `BH_APP_HOME` sandbox and asserts reply files — the natural home for quota-classifier and fallback tests (inject a failure, assert the second harness is called once and the chat says why).
- `test/empty-reply.test.mjs`, `test/agents-reply.test.mjs`, `test/feed-items.test.mjs` and `test/store.test.mjs` cover the reply/watermark and watchdog paths today; a single-log change should move those assertions rather than add parallel ones.
- No draft exists yet (`bh plan show p-20261121-0hfk` → "no draft yet"), so nothing in the plan currently contradicts these findings.
