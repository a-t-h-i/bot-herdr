Good work; all three pushbacks accepted, steps 2, 3, 4 and 12 are done. Next: steps 5, 7 and the engine part of 6 of t-20261120-n1rc, in that order (6's prices come from Research, still running: build the code and tests now with a fixture table, and ship `engine/prices.json` with `"models": {}` until I hand you the data). Same shared tree and rules. Design's Metrics page already calls this command (`mods/bot-herdr/metrics.js`), so the contract must be exact.

Files: `engine/lib/agent.mjs` (recordUsage at :355-370), `engine/lib/runner.mjs` (new code only in `Acp` message handling ~:533-578 and `piTurn` ~:367-387; leave `claudeAccess`/`claudeEnv` alone), `engine/lib/tasks.mjs`, `engine/bh.mjs`, new `engine/lib/metrics.mjs` (pure aggregation), new `engine/prices.json`, new tests `test/usage-record.test.mjs`, `test/metrics.test.mjs`, `test/estimate.test.mjs`.

Step 5
1. Every usage record also gets `role` (the agent's role; for a custom agent `slug(name)`; for the lead `orchestrator`), `project` (the project root path), `plan` (the plan id or null), and `reported`: `{ tokens: bool, cost: bool }` (true only when the harness gave that number this turn). Keep `input`, `output`, `cacheRead`, `cacheWrite` separate (no summed field), as today.
2. ACP: when a `session/update` has `sessionUpdate === "usage_update"` (OpenCode; see agentclientprotocol.com/rfds/session-usage), keep the latest numbers for the turn and record them (map its fields to input/output/cacheRead/cacheWrite/costUsd as available; log the raw shape once in your report). Gemini/Qwen send nothing: nothing changes for them.
3. pi: if pi's JSON stream has a usage object on its message-end/turn-end event, record it the same way; if not, say so in your report with a sample of the events it does send.
4. Old records without `role`: `metrics.mjs` maps them by spawn name: the longest roster slug or role that is a prefix of the name (`dev-lean` → dev, `qa-gate2` → qa, `advisor-panel` → advisor); no match → the name itself.

Step 6 (engine part)
1. `engine/prices.json` shape (Research fills it): `{ "updated": "YYYY-MM-DD", "models": { "<model id>": { "input": n, "output": n, "cacheRead": n, "cacheWrite": n, "source": "url", "checked": "date" } }, "aliases": { "<recorded id>": "<model id>" } }`, USD per million tokens. A user copy at `DATA/prices.json`, if present, overrides entries by model id.
2. Estimates, in `metrics.mjs`, never written back into usage files:
   - cost missing but tokens reported (Codex): cost from the tokens and the model's prices → `estimated.cost = true`.
   - tokens missing (time only): uncached tokens per minute (input + output) from reported turns on the same model, else from all reported turns; tokens = rate × minutes as input/output split in the same ratio; cacheRead/cacheWrite stay 0; then cost from prices → `estimated.tokens = estimated.cost = true`.
   - no price for the model → `costUsd` from reported cost only; if none, `null`.
   - The lead's `claude` model `null` means Claude Code's default: alias it via `aliases["claude/default"]`.

Step 7: `bh metrics [--window today|7d|30d|all] [--json]` (default 7d), over every usage record (global `DATA/usage/*.jsonl`, de-duplicated against task copies by `at`+`agent`), output exactly board contract #4 (`bh board read t-20261120-n1rc` entry 4): totals, and agents sorted by timeMs desc with id, name (roster display name; custom agents by their name), role, harness, models, timeMs, turns, tokens, costUsd, tasks (distinct task ids), steps (task steps whose `agent` rolls up to this agent and whose status is done, finished inside the window), estimated, daily (oldest first; today 1 day, 7d 7, 30d and all 30). The plain (non-JSON) output is one line per agent. Keep `bh usage` working unchanged. Note `bhJson` in the UI appends `--json` itself.

Tests (temp HOME/BH_APP_HOME, never real data): record fields and reported flags (ACP usage_update fixture); old-record roll-up; each estimate path; window filtering and daily buckets; exact contract keys.

Done when: `npm test` and `bh check` pass; `node mods/bot-herdr/engine/bh.mjs metrics --json --window all` on this repo prints the contract shape (paste the first agent in your report); Design's page renders it (I will check). Then report with bh report t-20261120-n1rc --step 5 and stop; steps 9-10 follow in a separate brief.
