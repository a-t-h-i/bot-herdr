## Status
OPEN

## Questions
1. [DEV] When the classifier picks skills for an agent from its role and the task, how should that picked set apply?
   - Restrict where possible — on Claude Code the picked skills and MCP servers become an allowlist (the rest denied at launch) and Codex gets the same for MCP servers; every other harness only gets the picks named in its brief.
   - Name them in the brief — the picks are written into the agent's brief; every installed skill stays usable, so a wrong pick costs nothing but narrows nothing.
   - Suggest in Settings — nothing applies automatically: the classifier proposes a set per agent and task, the user ticks it to apply.
2. [DEV] Some harnesses report no token or cost numbers (omp, opencode, Gemini, Qwen). What should the dashboard show for those agents?
   - Show a dash — tokens and cost stay empty (—) where a harness reports none; agents rank by time worked, which every harness records.
   - Estimate from time — tokens and cost estimated from minutes worked for harnesses that report nothing, every agent gets a number, marked as an estimate.
   - Hide them — the table lists only harnesses that report tokens and cost; omp, opencode, Gemini and Qwen agents are left out.

Mockups for question 2 are drawn and ask-ready, one per option, in `.bot-herdr/tmp/plan-questions-dev.md` (parsed clean by `bh ask`'s own parser, 0 warnings) — hand it to the user as-is; question 1 has none.

## Notes
**How skills are discovered and assigned today (engine side)**
- Discovery covers three harnesses only: `SUPPORTED = ["claude","codex","opencode"]` (`mods/bot-herdr/engine/lib/tools.mjs:16`), read from disk in `readClaude` / `readCodex` / `readOpencode` (`tools.mjs:92,104,134-140`) including Claude plugin skills (`pluginSkillDirs`, depth 5, `tools.mjs:61-71`); only `name` + first `description` line of each SKILL.md is kept (`tools.mjs:39-57`). Cached 24 h per harness+project (`tools.mjs:165-175`). pi, omp, gemini, qwen, antigravity get `supported: false` and nothing else (`tools.mjs:166`) — "every selected harness" is a real build item, not a toggle.
- Assignment is manual only: Settings ticks live in `agents.json` (`roster.js:129-130`), reach the agent as one brief line (`team.mjs:84-88`, pushed at `team.mjs:109`), and are enforced only by `limitArgs` (`roster.js:200-213`): Claude Code a session `--settings` deny list for skills+MCP, Codex `-c mcp_servers.x.enabled=false`; every other harness and Codex skills are brief words only.
- There is no skills feature in the classifier: `features: { lobby, triage, effort, qa, scripts }` (`classifier/index.mjs:46`). The reusable shape already exists in `pickScripts` (`index.mjs:288-307`: name+one-line purpose list, capped, top-3 by probability) — a skills pick can be the same call with skill names+descriptions, cached per task+role so it is one call per task, not per spawn (each harness-backed classify starts a CLI process, `classifier/harness.mjs:1-9,108-131`).

**Token findings (measured on this checkout)**
- Brief size: dev child 15,547 B (~4.3k tok), dev panel 15,278, dev review 18,035, orchestrator lead 20,307 (~5.6k), qa child 11,841. Composition of the dev child brief: global 3,106 + dev 3,783 + worker 2,569 + tools 1,363 + child agents 1,684 + reporting 719 + knowledge 2,120.
- Two sections a child cannot use are always there: the whole `## Child agents` block (`team.mjs:126,161-186`, 1.7 kB) that tells a child it may spawn "only when your brief says you may", and the knowledge pointer in `briefUpdate` (`agent.mjs:293-309`) telling it to `bh knowledge …` read text already embedded in the brief.
- 94.7 % of all tokens ever recorded here are cache reads: 13.53 M of 14.28 M tokens over 18 turns; one QA turn re-read 2.76 M cached tokens for $1.79, another 3.65 M. The lever is iterations × context per turn (and a permanent session that only grows), not the brief alone. Sessions reset only when harness or project root changes (`resumeState`, `agent.mjs:196-201`).
- Per turn the engine re-reads task.json, plan.json and board.jsonl 2-3× each: `seenNow`, `newComments`, `briefUpdate` (`agent.mjs:272-309`) plus `state.seen = seenNow()` after the turn — one read can serve all three.

**Latency findings**
- Fixed per-command cost 0.12-0.28 s (measured: `bh board read` 0.12, `bh task show` 0.23, `bh scripts` 0.28, `bh brief` 0.67 incl. `git rev-parse` at `core.mjs:44` + knowledge read). Agents run many of these per step; nothing is batched.
- Every chat message with the classifier on spawns `bh classify route` as a subprocess (`composer.js:515`, timeout 70 s) — node cold start plus, on a harness-backed classifier, a whole CLI start per question set (`classifier/harness.mjs:1-9`). Two cold starts before the user sees a routing decision.
- `withInstalled` refreshes the disk scan on every `team()` call for an agent with picks (`team.mjs:34-37`, `refresh: true`), and `team()` runs per turn via `current()` (`agent.mjs:226`): 0.29 s vs 0.20 s for `bh tools claude` here with 13 skills — small now, grows with installed plugins on WSL/Windows paths.
- `triage`'s `layout` argument is never supplied (`index.mjs:214`; caller `bh.mjs:304`) — either dead code or a missing piece of repository context for triage.

**Metrics data that exists (new tab's source)**
- `DATA/usage/<agent>-<terminal>.jsonl`, one line per turn: `at, agent (spawn name), harness, model, effort, task, step, input, output, cacheRead, cacheWrite, costUsd, ms` (`agent.mjs:311-327`); mirrored in `.bot-herdr/tasks/<id>/usage.jsonl`.
- Per task: `checks.jsonl` receipts (`tasks.mjs:278-289`), `board.jsonl` (reports, gates, decisions), `task.json` steps with status/agent/report. `bh usage` already aggregates turns/tokens/cache/cost/minutes by agent+model (`bh.mjs:240-259,427-430`) and is the natural base for a `bh metrics --json` the tab reads.
- Gaps to close in the plan: usage records carry no role or agent id (grouping "Dev" vs "dev-tools" is a spawn-name string match); steps-completed needs a scan of every `task.json`; and **no token/cost data at all** from pi/omp (`runner.mjs:371-388`), and ACP harnesses (Gemini, Qwen, opencode — `Acp.turn`, `runner.mjs:~600-650`): only `claudeTurn` (`runner.mjs:294-318`) and `codexTurn` (`runner.mjs:356-360`) emit usage. Records from omp/opencode here carry `input: 0, costUsd: 0` — a dashboard that reads them as "free" is wrong, which is why question 2 exists.

**What the plan must respect from my seat**
- Never present unreported tokens or cost as reported numbers; label per harness (question 2 decides how).
- Auto skill picks must not break a turn silently: restricting needs a way for the agent to ask for more (report to the Orchestrator) and the deny list is per launch (`--settings` JSON, Claude only), so it can change without dropping the session.
- Engine acceptance: pick cached per task+role, so cost is one classifier call per task, not per spawn or per turn; brief tokens stay equal or lower with no unused section; every usage record gains `role`; `bh metrics --json` exists with per-agent time, turns, tokens, cost, steps and tasks (and a `reported: true/false` flag per row).
- Any session-reset policy (the big token lever) is a behaviour change for agents: keep it out of this task unless the user asks, or make it explicit in the plan.
