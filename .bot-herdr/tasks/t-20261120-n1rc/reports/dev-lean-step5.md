## Summary
Steps 5, 7 and the engine part of 6 are in the tree: usage records carry `role`, `project`, `plan` and `reported`; OpenCode's ACP usage and pi's message usage are captured; `bh metrics [--window …] [--json]` prints board contract #4 with estimates marked, priced from the checked table Research handed over (`engine/prices.json`).
`npm test` 302 tests (301 pass, 1 skip, 0 fail), `bh check` PASS; the repo's `bh metrics --json --window all` answer is below, first agent pasted.

## Changes
- `mods/bot-herdr/engine/lib/agent.mjs` — `recordUsage`: `role` (`team.knowledgeName`: the role, a custom agent's slug, the lead as `orchestrator`), `project` (the project root), `plan` (id or null), and `reported: { tokens, cost }` (true only when that harness gave that number this turn). `input`/`output`/`cacheRead`/`cacheWrite` stay separate, no summed field.
- `mods/bot-herdr/engine/lib/runner.mjs` (new code only, in `Acp` and `piTurn`; `claudeAccess`/`claudeEnv` untouched):
  - `Acp` keeps the turn's `usage_update`: `used` → `input` (no split available), `cost.amount` → `costUsd` as the **rise** since the turn began (the session cost is cumulative), and the session cost is reset with a new session. The `session/prompt` response's own `usage` (`inputTokens`/`outputTokens`/`cachedReadTokens`/`cachedWriteTokens`) replaces that with the turn's split. One usage event per turn.
  - `piTurn` sums every assistant `message_end`'s `message.usage` (`input`, `output`, `cacheRead`, `cacheWrite`, `cost.total`) and emits the running total, so the record holds the whole turn.
  - Gemini/Qwen/Antigravity send no `usage_update`: nothing changes for them (their turns stay time-only and metrics estimates them, marked).
- `mods/bot-herdr/engine/lib/metrics.mjs` (new, pure aggregation; only `readPrices` reads files):
  - `windowOf`/`dayKey`: local days; today 1 day, 7d 7, 30d 30, all = no start and the last 30 bars; `from`/`to` ISO.
  - `dedupe`: one record per turn (`at` + `agent`), global file first, task copies second.
  - `readPrices`: `engine/prices.json` with `DATA/prices.json` overriding models and aliases by id.
  - `metrics({ records, tasks, agents, prices, window, now })`: ids (role, custom slug; old names rolled up to the longest roster id that prefixes them, else the name), names from the roster, harness, models, timeMs, turns, separate tokens, cost, distinct tasks, done steps finished in the window, `estimated`, `daily`; totals; agents sorted by timeMs desc. No file is ever written.
  - Estimates: cost from tokens × the model's prices when cost was not reported (`estimated.cost`); tokens from the uncached tokens per minute of reported turns on the same model, else of all reported turns, split in their ratio, then priced (`estimated.tokens` and `estimated.cost`); no price → reported cost only, `null` when there is none; a `cacheWrite: null` rate costs cache-write tokens at the model's input price; model `null` is looked up as `<harness>/default`, so `aliases["claude/default"]` works.
- `mods/bot-herdr/engine/prices.json` (new): Research's checked table, USD per million tokens, each model entry `{ input, output, cacheRead, cacheWrite, source, checked }` (10 models, every price with its source URL and date). `DATA/prices.json` overrides by id. Aliases map a recorded `<harness>/default` to a model (`claude/default`, `pi/default` → `claude-opus-5-5`, `codex/default` → `gpt-6.2-sol`). A `cacheWrite: null` (gpt-6.2-sol: no separate write rate) costs its tokens at the model's input price.
- `mods/bot-herdr/engine/bh.mjs` — `case "metrics"`: loads every global usage record and each task's copy (deduped), the tasks (all, for steps), the roster and the prices; prints the contract with `--json`, else one line per agent. `bh usage` is untouched. HELP gained the line.
- Tests: `test/usage-record.test.mjs` (2: ACP `usage_update` over two turns — the split from the prompt response, and 0.25 then 0.15 cost for the two rises; pi's two assistant messages summed to 1000/100/300/15 and $0.176), `test/metrics.test.mjs` (5: old-record roll-up with a custom agent and an unknown name, exact contract keys, windows/daily buckets, step counting, end to end `bh metrics --json` with a task copy counted once), `test/estimate.test.mjs` (8: priced tokens, per-model rate, fallback rate, no price → null, `claude/default` alias, user prices override, `cacheWrite: null` at the input price, the shipped table's models and aliases).

## Brief Check
- Every new record has `role`, `project`, `plan`, `reported`, separate tokens — **met** (`test/usage-record.test.mjs` asserts all of them).
- ACP `usage_update` captured, raw shape logged — **met**, see Shapes; Gemini/Qwen unchanged.
- pi usage captured where it emits one — **met**: pi 1.6.0's assistant messages always carry usage (sample below), so pi turns are now token- and cost-accurate; the default flow (a `message_end` with no usage) records `reported.tokens: false` as before.
- Old records without `role` roll up by spawn name — **met**: `dev-lean → dev`, `qa-gate2 → qa`, `advisor-panel → advisor`, unmatched keeps the name (tested; the repo run shows the same).
- `engine/prices.json` shape and the `DATA/prices.json` override — **met**: Research's checked table is in, `cacheWrite: null` costs at the input price (tested), the `DATA/prices.json` override is tested.
- Estimates, never written back — **met**: each path has a test; `metrics()` returns numbers only and touches no file.
- `bh metrics` per contract #4 — **met**; plain output is one line per agent; `bh usage` still works (suite green).
- temp HOME/app in tests, never real data — **met** (all three test files use `mkdtempSync` and set `BH_APP_HOME`/`XDG_CONFIG_HOME` before importing).

## Shapes
ACP (OpenCode v2.1.4, read from its own ACP code and matched by the test fixture):
```json
{"sessionUpdate":"usage_update","used":1475,"size":200000,"cost":{"amount":0.25,"currency":"USD"}}
```
`used` is the last step's total tokens (no input/output split), `size` the model's context window, `cost.amount` the **session's cumulative** USD. The turn's split comes in the `session/prompt` response:
```json
{"stopReason":"end_turn","usage":{"inputTokens":1000,"outputTokens":50,"totalTokens":1075,"cachedReadTokens":400,"cachedWriteTokens":25}}
```
So: tokens from the response's split (over `used`), cost from `amount` minus the session cost when the turn began. If a harness sends only `usage_update`, `used` is recorded as `input` — the one number there is.

pi (1.6.0, `--mode json`; `docs/message-types.md`: assistant messages always contain usage):
```json
{"type":"session","id":"…"}
{"type":"message_end","message":{"role":"assistant","stopReason":"stop","content":[{"type":"text","text":"…"}],"usage":{"input":700,"output":80,"cacheRead":200,"cacheWrite":10,"totalTokens":990,"cost":{"input":0.1,"output":0.02,"cacheRead":0.005,"cacheWrite":0.001,"total":0.126}}}}
```
Each assistant message's numbers are summed for the turn (`cost.total` included); `report` keeps the last running total.

## Verification
- `timeout 600 npm test` — exit 0: 302 tests, 301 pass, 1 skip (`bh mockup draws a page with a headless browser`: no headless browser here), 0 fail.
- `timeout 600 node mods/bot-herdr/engine/bh.mjs check` — exit 0: PASS (301 pass, 1 skipped, no lint or typecheck set up).
- `node mods/bot-herdr/engine/bh.mjs metrics --json --window all` on this repo, with the prices in — exit 0. Totals: `{"timeMs":8874373,"turns":25,"tokens":{"input":1621,"output":537886,"cacheRead":19267815,"cacheWrite":627091},"costUsd":20.4558,"tasks":5,"steps":60,"estimated":{"tokens":true,"cost":true}}`; 7 agents. First agent (daily's 30 entries elided to ends):
```json
{"id":"dev","name":"Dev","role":"dev","harness":"claude",
 "models":["default","deepseek/deepseek-flash","claude-opus-5-5"],
 "timeMs":3650336,"turns":8,
 "tokens":{"input":656,"output":230859,"cacheRead":3653907,"cacheWrite":109043},
 "costUsd":5.734,"tasks":4,"steps":25,
 "estimated":{"tokens":true,"cost":true},
 "daily":"30 entries, oldest {\"day\":\"2026-10-22\",\"timeMs\":0,\"turns\":0} … newest {\"day\":\"2026-11-20\",\"timeMs\":2686307,\"turns\":5}"}
```
  (`estimated.tokens` is true because some old records are time-only; `estimated.cost` is true because old pi/OpenCode turns reported tokens but no cost and are now priced. Agents: dev 5.734≈, design 9.9735≈, research 0≈, qa 4.2682, scout 0≈, live-dev 0.2608, live-design 0.2193 — `≈` = estimated cost.)
- Plain output, same window: `Dev (dev): 61 min, 8 turns, ≈3994465 tokens, ≈$5.73, 4 tasks, 25 steps` (then Design, Research, QA, Scout, …).
- `bh metrics --json` with an empty `BH_APP_HOME` still answers from the tasks' usage copies (22 turns), so nothing depends on the global files alone.

## Pushback
1. **Note:** with the table in, no agent on this repo shows `—` any more: the formerly unpriced free model is `$0` (estimated), and a turn on a model outside the table would still get `costUsd: null` unless a cost was reported, per contract #4. Add the model to `prices.json` (or a `DATA/prices.json` entry) if one appears.
2. **Note rather than pushback:** `totals.steps` is the sum of the agents' steps (a done step counts for the agent its `agent` rolls up to, and only for agents that have a record in the window). Say so if you want every done step in the window counted in the total regardless.
3. **Note:** an agent's `harness` in the answer is the roster's current harness for it (the card shows what it runs), while `models` are the ids its records carried (`"default"` for the lead's model-less Claude records).

## Knowledge Proposals
- OpenCode's ACP usage: `session/update` with `sessionUpdate: "usage_update"` carries `used` (last step's total tokens), `size` (context window) and `cost: { amount, currency }` where `amount` is the session's cumulative cost; the `session/prompt` response carries the turn's split `usage: { inputTokens, outputTokens, totalTokens, cachedReadTokens?, cachedWriteTokens? }`. Take tokens from the response and cost from the rise in `amount`.
- pi 1.6.0 `--mode json`: every assistant `message_end` carries `message.usage` = `{ input, output, cacheRead, cacheWrite, totalTokens, cost: { …, total } }` (assistant messages always have it), so a pi turn's numbers are the sum over its assistant messages.
- `bh metrics` (board contract #4) is the only source the Metrics page reads; usage tokens and cost stay separate, and every number that had to be estimated is marked rather than written back.

## Script Proposals
None.
