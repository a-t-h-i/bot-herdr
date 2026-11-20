# Research panel — outside facts (bot-herdr mod improvements)

## Summary

- Skill storage/discovery is readable per harness: Claude Code `~/.claude/skills` + `.claude/skills` + plugins, Codex `.agents/skills` (CWD→root, `$HOME/.agents/skills`, `$CODEX_HOME/skills`), OpenCode `~/.config/opencode/skills` + `~/.claude/skills` + `~/.agents/skills` + project `.opencode/.claude/.agents/skills`, Gemini CLI `~/.gemini/skills` + `.gemini/skills` + `~/.agents/skills` aliases, Qwen Code `~/.qwen/skills` + `.qwen/skills` + `~/.agents/skills`, Antigravity `~/.gemini/config/skills/` + `<workspace>/.agents/skills/` (all SKILL.md, name/description frontmatter, progressive disclosure).
- Token usage: Claude Code parses the stream-json result event (`usage.input_tokens/output_tokens/cache_creation_input_tokens/cache_read_input_tokens`, `total_cost_usd`, `duration_ms`) and Codex parses `turn.completed` (`usage.input_tokens/output_tokens/cached_input_tokens`) — both already wired in bot-herdr. OpenCode reports usage over ACP (`usage_update`, ACP RDF, used/size/cost) but bot-herdr's Acp.message ignores it; OpenCode itself shows it via the prompt footer, sidebar, `/usage`, `opencode stats` (v2.3.2). Gemini CLI, Qwen Code and Antigravity: **not verified** (see Unverified).
- Token-efficiency best practice is well documented: prompt caching (Anthropic "Optimizing for cost and intelligence", 2026-10-21; Codex/OpenCode both report cached input), context trimming/compaction (Anthropic "Effective context engineering for AI agents", 2025-09-29; IAMaestro, Google ADK blog, Microsoft Learn), model routing ladders (PiotrCzerwinski, 2026-09-03; Anthropic), subagents for isolation, and per-harness findings: OpenCode re-sends the whole session every request (LeanOps, 2026-11-18).

## Changes

None — research is read-only. Files read locally: `mods/bot-herdr/engine/lib/tools.mjs`, `mods/bot-herdr/roster.js`, `mods/bot-herdr/models.js`, `mods/bot-herdr/engine/lib/team.mjs`, `mods/bot-herdr/engine/lib/runner.mjs`, `mods/bot-herdr/engine/lib/agent.mjs`, `mods/bot-herdr/engine/lib/models.mjs`, `mods/bot-herdr/engine/lib/plans.mjs`, `mods/bot-herdr/engine/classifier/{index,harness,client}.mjs`, `mods/bot-herdr/engine/bh.mjs`.

Web sources (URL + date verified): code.claude.com/docs/en/skills (2026), code.claude.com/docs/en/headless (2026), learn.chatgpt.com/docs/build-skills (Codex skills), geminicli.com/docs/cli/skills (2026-04-30), qwenlm.github.io/qwen-code-docs/en/users/features/skills, opencode.ai/docs/skills (2026-11-02), medium.com/google-cloud/confused-about-where-to-put-your-agent-skills-ea778f3c64f3 (Mar 2026), agentskills.io (2026) + qai.io/docs/agent-skills (checked 26 Oct 2026), developers.openai.com/codex/noninteractive + openai/codex exec_events.rs (Codex usage), agentclientprotocol.com/rfds/session-usage (2026-06), leanopstech.com/blog/opencode-token-usage (Nov 18 2026), platform.claude.com/docs/en/build-with-claude/prompt-caching (2026-10-21), platform.claude.com/docs/en/about-claude/models/optimizing-for-cost-and-intelligence (2026-10-21), anthropic.com/engineering/effective-context-engineering-for-ai-agents (2025-09-29), developers.googleblog.com/architecting-efficient-context-aware-multi-agent-framework-for-production (2025-12-04), getcollate.io/blog/token-efficiency-in-production-multi-agent-platform (2026-10-16), iamaestro.academy/.../multi-agent-orchestration/3-3 (2026), piotrczerwinski.dev/writing/model-routing-multi-agent-work (2026-09-03), arXiv:2607.06906 (2026-07-08, harness-effect paper), arXiv:2601.06007 (2026-01-06, cache control paper), learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns (2026-02-12).

## Brief Check (user's "Done when")

1. **Performance** — Met as input: OpenCode re-sends the whole session each request (98% of input is loop re-read, LeanOps 2026-11-18); Anthropic says caching is the first lever (SWE-bench Pro: 3.1–3.3× cost with caching, platform.claude.com 2026-10-21). Subagents on cheap models, one new session per task, few MCP servers = the documented OpenCode waste list.
2. **Token efficiency** — Met as input: Anthropic's caching/trimming/batching levers (prompt-caching page + optimizing-for-cost-and-intelligence, 2026-10-21); Codex reports `cached_input_tokens` on every turn (developers.openai.com/codex/noninteractive; 99.4% hit rate in the OpenAI gist gist.github.com/alexfazio/359c17d84cb6a5af12bac88fa1db9770).
3. **Skill discovery** — Met for Claude/Codex/OpenCode (`SUPPORTED` in engine/lib/tools.mjs, verified: `node engine/bh.mjs tools claude` returns the user's skills from `~/.claude/skills`); paths/formats for Gemini CLI, Qwen Code, Antigravity added from docs (see table above). **Not met: tools.mjs has no readers for gemini/qwen/antigravity** — they are supported harnesses (engine/roster.js HEADLESS, engine/models.mjs) but `SUPPORTED = ["claude", "codex", "opencode"]` and the repo's own comment points there.
4. **User experience / 5. Agent experience / 6. Turnaround time** — No research findings; see Notes for questions.
5. **7. Metrics dashboard** — Data sources exist: `bh usage` (per agent+model: turns, input/output/cache, cost, minutes — engine/lib/bh.mjs usageByModel), per-step usage (engine/lib/tasks.mjs usageTotals), agents.json. What does not exist: a tab that aggregates them, and OpenCode/Gemini/Qwen/Antigravity per-turn usage records (bot-herdr records none — engine/lib/agent.mjs recordUsage is called only with parsed usage).

## Verification

- `node mods/bot-herdr/engine/bh.mjs tools claude` — supported: true, returns the user's skills from `~/.claude/skills` (built-in-browser, chrome-browser, computer-use, deep-research, docs, docx, …).
- `node mods/bot-herdr/engine/bh.mjs tools codex` / `tools opencode` — supported: true, 0 skills on this machine.
- `bh team` — Orchestrator (opencode), Design (opencode-go/deepseek-v4.1-flash), Dev, QA, Research, Scout.
- Fetches: OpenCode ACP docs (opencode.ai/docs/acp), harness notes page (harnessnotes.com/acp?harness=opencode).

## Notes / Pushback (design unknowns I could not settle)

- The OpenCode issue anomalyco/opencode#60434 (2026-10-30): OpenCode v2 no longer exposes skills in ACP `available_commands_update` — auto-discovery through ACP is gone; per OpenCode's own maintainer, "you load a skill yourself by mentioning it as @skill-id in the prompt."
- **OpenCode v2 context caching**: `opencode.ai/docs/skills` loads the body via the `skill` tool each time; the LeanOps blog says OpenCode "places cache markers for you on providers such as Anthropic" and recommends a stable model per session — model switching re-reads everything (Anthropic's own 5-minute cache TTL applies).
- **Gemini CLI & Qwen Code ACP usage**: unverified against their implementations; bot-herdr's Acp.message reads only message chunks/tool calls and would ignore any `usage_update`.
- **Antigravity** (agy) — the medium article's "Antigravity global skills" path `~/.gemini/config/skills/` is second-hand; Antigravity replaced Gemini CLI for unpaid tiers on 18 June 2026 (qai.io, checked 26 Oct 2026).
- Frontmatter: the open standard (agentskills.io) has `name` and `description` as the minimum; each tool adds its own (Claude: allowed-tools/context/user-invocable/etc.; Codex: `allow_implicit_invocation`; OpenCode: `metadata.opencode/autoinvoke`; Qwen: auto-discovery of project/personal dirs; Gemini: name+description, activation via tool call with permission prompt).
- Bot-herdr's own parse of Claude Code usage: engine/lib/runner.mjs:317-318 (`result` event: `usage.input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`, `total_cost_usd`, `duration_ms`); Codex: runner.mjs:355-361 (`turn.completed`: `usage.input_tokens`, `output_tokens`, `cached_input_tokens`; "Codex counts cached input inside input_tokens").

## Knowledge Proposals (Orchestrator: to `bh knowledge` on the agents that read them)

1. Research agent: "Skill storage paths per harness (Claude Code ~/.claude/skills, .claude/skills, plugins, ~/.claude/skills/synced; Codex .agents/skills, $HOME/.agents/skills, /etc/codex/skills, $CODEX_HOME/skills, symlinked folders; OpenCode ~/.config/opencode/skills, .claude/.agents compat dirs; Gemini CLI ~/.gemini/skills, .gemini/skills; Qwen Code ~/.qwen/skills, .qwen/skills, skills.directories; Antigravity ~/.gemini/config/skills). All SKILL.md, name/description frontmatter, progressive disclosure. Auto-invoke differences: Claude/Gemini/Qwen/Codex implicit+explicit; OpenCode v2 explicit @skill-id or the `skill` tool; Antigravity consent prompt."
2. Research agent: "Token usage reporting: Claude Code stream-json result.usage (input/output/cache_read/cache_creation) + total_cost_usd; Codex turn.completed.usage (input_tokens, output_tokens, cached_input_tokens, cache_write_input_tokens, reasoning_output_tokens) — cached input is part of input_tokens; OpenCode ACP usage_update (used/size/cost), surfaced via `opencode stats` and footer; Gemini CLI, Qwen Code, Antigravity: no usage verified."

## Script Proposals

None (no new shared scripts proposed yet).

## Blockers / Pushback

- None blocking; questions for the user on scope decisions (below).
