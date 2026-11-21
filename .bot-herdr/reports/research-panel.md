# Research report — engine design

## Summary
Per-harness signal contracts for how each headless coding CLI signals quota/rate-limit/usage exhaustion versus transient 429 and auth failures, and proven safety patterns for self-improving coding harnesses. Sources cited; questions for the plan follow.

## Findings

### 1. Claude Code — code.claude.com/docs/en/errors (Error reference, opened; usage-limit sections extracted)
Three distinct quota classes, surfaced as messages (the CLI blocks until reset; interactive sessions can auto-continue since v2.1.234):
- Subscription/plan quotas — `You've hit your session limit · resets 3:45pm`, `You've hit your weekly limit · resets Mon 12:00am`, `You've hit your Opus limit · resets 3:45pm`, `You've hit your Sonnet limit · resets 3:45pm`; plus monthly/individual/team/channel spend limits and `Credit balance is too low` (recovery: wait until reset or raise the limit).
- Server-side throttle — `API Error: Server is temporarily limiting requests (not your usage limit)`. The reference states this is "a short-lived throttle that is unrelated to your plan quota", and that since v2.1.199 "Claude Code ... retries [it] automatically with backoff before being shown" (whichever way you authenticate). Before v2.1.199, subscription sign-ins failed the turn on the first occurrence.
- Rate-limit on credentials/projects — `API Error: Request rejected (429) · this may be a temporary capacity issue. If it persists, check https://status.claude.com.` ("You have hit the rate limit configured for your API key, Amazon Bedrock project, or Google Cloud project.")
- Auth failures are separate: `Not logged in · Please run /login`, `API Error: 401 ...`, etc.
- Headless quirk (anthropics/claude-code issue #79500): `claude -p` with rate-limit errors returns `subtype:"success"` and **exit code 0**, with the error text only in `result`/stdout — Claude Code detection must parse the JSON result, not the exit code. Synthetic assistant messages like `API Error: Rate limit reached` (issue #33840; "You've hit your weekly limit · resets 7pm", issue #47878).

### 2. OpenAI Codex CLI — raw.githubusercontent.com/openai/codex/31588d061137b8e7499b14846b69cbb3b622e08a/docs/exec.md + openai/codex issues
- `codex exec` non-interactive; default streams activity to **stderr**, final message to stdout.
- `codex exec --json` streams JSONL events: `thread.started`, `turn.started`, `turn.completed` (usage), `turn.failed` — "when a turn fails; includes error details" — and per-item `exit_code`.
- 429 signals (openai/codex issues): issue #9135 — API error `{"error":{"code":"rate_limit_exceeded","message":"You've exceeded the rate limit, please slow down and try again after 60.616292 seconds.","type":"invalid_request_error"}}`; issue #26058 — "exceeded retry limit, last status: 429 Too Many Requests, request id: ..."; issue #55964 — persistent 429 / `turn_rate_limit_exceeded` ("Codex is at capacity, ..."); issue #157 — abort/raw-mode crash on 429.
- Auth: `CODEX_API_KEY` env var or default CLI auth; failures via stderr messages. exec.md does not document a dedicated rate-limit exit code.

### 3. OpenCode — opencode.ai/docs/cli/acp (ACP docs, opened) + anomalyco/opencode issues
- ACP mode (`opencode acp`): rate limit arrives via `session_info_update` with `_meta["opencode/retry"]` = `{attempt: 1, nextRetryAt: "2026-10-02T12:00:05.000Z", error: {type: "provider.rate-limit", message: "Rate limit exceeded", status: 429}}` ("When the retry starts, OpenCode sends `"opencode/retry": null`").
- Auth: ACP `auth_required` error when the provider needs authentication; agent auth method `opencode-login` (+ terminal variant).
- Non-ACP: `opencode run` on 429 → non-zero exit with `Error: API rate limited. Check subscription status.` (anomalyco/opencode issue #8203, with the `process.exit(1)` fix); `opencode run --format json` on provider 429 "sleeps silently through a provider's retry-after (429 retry-after: 47331 → 13 h hang)" (issue #57049).

### 4. Gemini CLI — geminicli.com/docs/resources/faq (Last updated Apr 10, 2026, opened) + google-gemini/gemini-cli issues
- Error: `API Error: 429 - Resource exhausted` — "This error indicates that you have exceeded your API request limit." Google error body shape (issue #3430): `{"error": {"code": 429, "message": "You exceeded your current quota, please check your plan and billing details...", "status": "RESOURCE_EXHAUSTED"}}`, with `details` distinguishing "StreamGenerateContent Requests", consumer-tier limits, etc.
- Display inconsistencies: issue #5119 ("Poor 429 error handling").
- Product context: "Unpaid tier and Google One users: Gemini CLI was replaced by Antigravity CLI on June 18th, 2026."

### 5. Qwen Code — QwenLM/qwen-code commit 58fa6cf85b994e214722ba1b116308455eff5995 (fix #7842) + issues
- Permanent quota-exhaustion: "A 429 whose body signals a permanently exhausted quota — one that carries a reset time, e.g. 'quota has been exhausted ... will reset at ...' — is a non-retryable condition." Example (Bailian token-plan): `Your token-plan 1-week quota has been exhausted. The quota will reset at 07-27 09:25:00 UTC.`
- Fast-fail: "Detect such errors and fast-fail on the first attempt, surfacing a friendly message that preserves the provider's reset time and points at switching API key / auth. Transient 429s without a reset time still retry as before."
- Detection predicate (packages/core/src/utils/quotaErrorDetection.ts): message contains `quota` AND (`exhausted` or `exceeded`) AND (`will reset` or `reset at`); `formatQuotaExhaustedMessage` unwraps JSON error bodies ("so openai-compatible providers that emit 429s as JSON surface the human-readable message instead of raw JSON").
- Implementation nuance: the thrown quota-exhaustion error has no `.status` — "it made isRateLimitError() return true, re-triggering the stream-side retry loop in geminiChat.ts"; uses `cause` to preserve the original error.
- Issues: #7841 — "Quota-exhausted 429s retry silently and surface no error to the user"; #13895 — modelFallbacks chain skipped when the provider's 429 body carries an error.code not in RATE_LIMIT_ERROR_CODES.

### 6. Antigravity — can1357/oh-my-pi issue #11883 (opened Sep 12, 2026; fixed in v18.2.1) + issue #12029
- Signals: `Error: Cloud Code Assist API error (429): { "error": { "code": 429, "message": "Resource has been exhausted (e.g. check quota).", "status": "RESOURCE_EXHAUSTED" } }` and `Error: Retry failed after 1 attempts: Provider requested 1800000ms wait, exceeds retry.maxDelayMs (300000ms)` — Antigravity can return long retry waits (30 min).
- Real quota vs false 429: the account had ample quota (70%+ free in 5h window, 80%+ free weekly) yet the client reported exhaustion; the same account/model works in the official Antigravity client and standard Pi harness.
- Root cause (issue #11883): the Antigravity request envelope carries `requestType: "agent"`; Google Cloud Code Assist's gateway enforces the instruction-hierarchy/prompt-security filter on the system prompt and returns a false 429 when it sees the literal `<system-conventions>`. Fixed in v18.2.1 (commit 10fb0ac325, 2026-09-14) by renaming the tag to `<conventions>` and omitting `requestType: "agent"`. Issue #12029: "Antigravity: bundled `<system-conventions>` block makes every request 429 RESOURCE_EXHAUSTED (quota fine)".
- Auth: accounts served to the Pi coding agent by fzn0x/pi-gemini-auth ("All accounts are rate limited (HTTP 429) | Wait for the reset shown, or add an account. | pi-gemini-auth accounts --check shows quota").
- Notes: uses Google's Cloud Code Assist API (provider `google-antigravity` in oh-my-pi; Google AI Pro accounts); Gemini CLI's replacement for the unpaid tier (Gemini FAQ).

### 7. Pi — pi.dev (opened) + GitHub
- pi.dev: "Pi is a minimal agent harness"; "Four modes: interactive, print/JSON, RPC, and SDK"; `pi -p "query"` (print/JSON); npm `@earendil-works/pi-coding-agent`; Pi 1.0 with Pi Durable.
- Quota signals: provider-level; e.g., pi-gemini-auth (above) shows 429 + reset display for Google Antigravity accounts. No dedicated exit-code/JSON quota signal found (see Unverified).

### Compact signal table
| Harness | Permanent quota/usage exhaustion | Transient 429 | Auth |
|---|---|---|---|
| Claude Code | "You've hit your session/weekly/Opus/Sonnet limit"; spend/credit limits; headless exits 0 with text in `result` (issue #79500) | "API Error: Server is temporarily limiting requests" — auto-retried with backoff since v2.1.199 | `Not logged in · Please run /login`; 401s |
| Codex CLI | — (OpenAI 429 error bodies; no dedicated exit code) | `codex exec --json` `turn.failed`; "exceeded retry limit, last status: 429 Too Many Requests" (issue #26058); 429 bodies (issue #9135) | 401 / `CODEX_API_KEY` errors |
| OpenCode | ACP: retry events `{type: provider.rate-limit, status: 429}`; non-ACP: exit 1 + "API rate limited..." (issue #8203) | same retry machinery; issue #57049 hang-through on retry-after | ACP `auth_required` |
| Gemini CLI | 429 RESOURCE_EXHAUSTED ("You exceeded your current quota...") (issues #3430, #5119) | 429 display inconsistencies (#5119) | — |
| Qwen Code | 429 + "…quota … will reset at …" — fast-fail (commit 58fa6cf; issues #7841, #13895) | transient 429 without reset — retry | — |
| Antigravity | Google Cloud Code Assist 429 RESOURCE_EXHAUSTED + provider backoff (issue #11883) | same gateway (false 429s fixed in v18.2.1) | Google accounts via pi-gemini-auth |
| Pi | provider 429s via pi providers | provider-level retries | provider auth |

## Safety patterns for self-improving coding harnesses
1. **arxiv.org/html/2610.01073v1 — "Safety Must Survive Self-Improvement: Why Failures Persist and How Agents Recover"** (arXiv:2610.01073v1 [cs.SE] 01 Oct 2026).
   - Validation gate → eligible set `A_g = {w ∈ {w_{g-1}, proposals}: Pass_g(w) = 1}`.
   - Keep rule: `w_g = select(A_g) if A_g ≠ ∅ else w_{g-1}`; "If no program passes, w_g = w_{g-1} despite Pass_g(w_{g-1}) = 0. A detected authorization failure can therefore remain active." — keep-after-rejection is a circuit-breaker failure mode to avoid or gate.
   - Recovery: "Alternative fallback rules restore the founder, select a historical program passing current checks (validated rollback), or pause execution until one passes."
   - Score refresh: "A separate refresh intervention updates stored scores, feedback, and selection metadata before search resumes" — "Historical readout retains the same 22 unsafe programs through iteration 100, although every affected archive contains a correct alternative."
   - Editing source: "Editing the initial implementation ... improves recovery from shared failures ... varies across editors."
   - Utility: "Full validation and validated rollback end with fully correct programs ... while retaining over 43% deployment savings."
2. **github.com/arturkorb3/eva-evolutional-agent** — "EVA - a minimal self-evolving agent that safely rewrites, tests, and promotes better versions of itself inside a hardened Docker sandbox."
3. **github.com/studiomeyer-io/darwin-agents** — "safety gate prevents regressions. If a new variant scores >20% lower, Darwin automatically rolls back to the last known-good version."
4. **agentspulse.github.io/tutorials/self-evolving-agents-review-en/** — "A working loop needs feedback, evaluation, safety gates, and rollback."
5. **arize.com/blog/closing-the-loop-coding-agents-telemetry-and-the-path-to-self-improving-software** — eval-driven loops to verify changes.
6. **arxiv.org/html/2610.38392v1** — "How Acceptance Gates Lose Redundant Safeguards in Self-Improving Agents".
7. **arxiv.org/html/2609.02246v1** — "LLM-as-a-Judge Is Not an Oracle: Why Self-Improving Agents Need Deterministic Guardrails".

## Questions for the plan
1. **Detection contract.** Per harness, map each signal class to engine behavior: (a) permanent quota/usage exhaustion with reset time → trigger fallback (rotate credential/account or move to alternate provider/model), do not retry; (b) transient 429 → retry natively or with bounded backoff; (c) auth error → stop, request login. The table above is the draft contract; which signals are parsed as machine-readable (ACP/JSON) vs text-matched (stderr/result)? Claude Code headless exits 0 on rate limit with text in `result` (issue #79500), so text parsing is required there. Codex signals via `turn.failed` events; OpenCode via ACP retry events or exit 1; Antigravity via Google Cloud Code Assist 429 + 30-min provider backoff.
2. **Engine evolution loop.** From arxiv 2610.01073v1, choose and rank: eval-gated prompt/script evolution (validation gate + locked eval rubrics, e.g. the skills-evolve pattern), validated rollback + pause-until-pass (circuit breaker), founder fallback on rejection, score refresh after new contracts, editing-source choice (founder vs inherited). Rank against the goals "continual self-improvement" + "stronger guardrails" and say what to implement first.
3. **Usage-exhaustion fallbacks.** When permanent exhaustion is detected (Qwen's "will reset at ...", Antigravity's 30-min backoff, Claude Code usage limits), should the engine wait out the reset, rotate keys/accounts per provider, or switch provider/model — and at what authority level should such fallbacks act?

## Notes
- Antigravity is Google's successor of Gemini CLI (Gemini CLI replaced by Antigravity CLI for the unpaid tier/Google One users on June 18, 2026 — Gemini FAQ).
- Claude Code distinguishes three quota classes by message; usage limits block until reset; interactive auto-continue since v2.1.234.
- Qwen's thrown quota error deliberately has no `.status` (would re-trigger retry) — the engine should treat "permanent quota + reset time" as non-retryable even when the error object looks like a 429.
- Antigravity false-429 root cause: request envelope `requestType: "agent"` + `<system-conventions>` prompt triggers Google's gateway; fixed upstream in v18.2.1 (renamed to `<conventions>`).

## Changes
No repository files changed — read-only research. This report is written to `.bot-herdr/reports/research-panel.md`.

## Brief Check
- Per-harness signal research (Claude Code, OpenAI Codex CLI, OpenCode, Gemini CLI, Qwen Code, Antigravity, Pi) — MET — evidence: findings + table above.
- Proven safety patterns for self-improving coding harnesses (eval-gated evolution, rollback, circuit breakers) — MET — evidence: arxiv 2610.01073v1 + EVA, darwin-agents, agentspulse survey, arize blog.
- Sharp questions raised for the plan — MET — see "Questions for the plan".
- Report delivered — in progress (being written now; sent to t7t once written).

## Verification
- code.claude.com/docs/en/errors — opened; usage-limit/server-throttle/429 sections extracted (Lines 929–1038).
- raw.githubusercontent.com/openai/codex/31588d061137b8e7499b14846b69cbb3b622e08a/docs/exec.md — opened; `codex exec --json` event docs.
- opencode.ai/docs/cli/acp — opened; retry/auth sections.
- geminicli.com/docs/resources/faq/ — opened; 429 error + version date.
- github.com/QwenLM/qwen-code/commit/58fa6cf85b994e214722ba1b116308455eff5995 — opened; fast-fail + detection + `.status` nuance.
- github.com/can1357/oh-my-pi/issues/11883 — opened; Google 429 shape + root cause.
- pi.dev/ — opened; Pi harness info.
- arxiv.org/html/2610.01073v1 — opened; safety-across-generations patterns.

## Knowledge Proposals
- Knowledge doc: "Headless CLI coding-harness rate-limit/quota signal table" — proposes the per-harness detection contract (Findings table); Orchestrator to create it.
- No script proposals; engine changes are design-level, for the Orchestrator to plan.

## Unverified
- Pi exit codes / machine-readable quota signals beyond pi.dev + pi-gemini-auth (no dedicated page found).
- Codex exit code on rate limit (exec.md documents `turn.failed` but not a process exit code).
- Gemini CLI non-headless signals; OpenCode non-ACP retry-after semantics (issue snippets only).
- Antigravity headless mode/CLI — signals verified via the google-antigravity provider path (oh-my-pi) and pi-gemini-auth; the official Antigravity client is IDE-based, no dedicated headless CLI documented.
