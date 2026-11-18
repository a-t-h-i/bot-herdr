# Skills/MCP per-harness (roster.js) — research report

Sources fetched 2026-11-18 (web search failed repeatedly: `Web search cancelled`, so some harnesses unverified).

| Harness | Skills / equivalent | MCP config & list | Per-launch subset (no global edit) |
|---|---|---|---|
| claude (Claude Code) | Yes: Agent Skills + `.claude/commands/` (merged). Paths: `~/.claude/skills/<n>/SKILL.md`, `.claude/skills/<n>/SKILL.md`, nested `<subdir>/.claude/skills/<n>/SKILL.md`, enterprise managed dir, plugin `<plugin>/skills/<n>/SKILL.md`, `--add-dir` loads extra `.claude/skills/`. In-session `/skills`. ([skills](https://code.claude.com/docs/en/skills), fetched) | `.mcp.json` (project), `~/.claude.json` (local/user); scopes local/project/user. CLI: `claude mcp list/get/add/remove`, in-session `/mcp`. ([mcp](https://code.claude.com/docs/en/mcp), fetched) | MCP: `--mcp-config <file>` + `--strict-mcp-config` to load only those servers (skips `.mcp.json` etc.). `--setting-sources` can exclude project settings. Session-only settings via `--settings '{...}'` (settings doc). ([mcp](https://code.claude.com/docs/en/mcp), [settings](https://code.claude.com/docs/en/settings), fetched) |
| codex (OpenAI Codex CLI) | Partial: config ref shows `skills.bundled.enabled`; AGENTS.md/subagents in docs nav. Skill install paths/format/list CLI not verified from fetched pages. ([config ref](https://developers.openai.com/codex/config-file/config-reference), fetched) | `~/.codex/config.toml`, project `.codex/config.toml` (trusted). `[mcp_servers.<id>]` tables (stdio/http, oauth, enabled/tools/timeouts). MCP mgmt documented; `codex mcp list` not seen in fetched pages. ([mcp](https://developers.openai.com/codex/extend/mcp), [config ref](https://developers.openai.com/codex/config-file/config-reference), fetched) | Per-launch override flags not verified in fetched pages (docs mention `-c`-style/CLI elsewhere, but not confirmed here). No per-launch subset documented in fetched MCP/config-ref excerpts. |
| opencode | Not documented as “skills” in fetched MCP page. (Agents/skills not verified.) ([mcp](https://opencode.ai/docs/mcp-servers/), fetched) | `opencode.jsonc` → `mcp.servers` (v2). `opencode mcp add/list/auth/logout`, TUI `/mcps`. Local (`command`) or remote (`url`). ([mcp](https://opencode.ai/docs/mcp-servers/), fetched) | No per-launch CLI subset without editing config documented in fetched page; `mcp add --global` edits global config. |
| gemini (Gemini CLI) | Unverified. | Unverified. | Unverified. |
| qwen (Qwen Code) | Unverified. | Unverified. | Unverified. |
| pi | Unverified. | Unverified. | Unverified. |
| omp (oh-my-pi) | Unverified. | Unverified. | Unverified. |
| antigravity | Unverified (ACP `acp` in roster; no docs fetched). | Unverified. | Unverified. |

## Notes
- Claude Code: `claude mcp add --transport http|sse|stdio`, JSON in `.mcp.json`/`~/.claude.json`; `--mcp-config` entries reported in `stream-json` init errors when skipped. Skills are `SKILL.md` dirs; legacy `.claude/commands/*.md` still works.
- Codex: MCP supports stdio/streamable HTTP, OAuth, per-server tool allow/deny/approval/timeouts; plugin-provided MCP configurable via `[plugins.<p>.mcp_servers...]`.
- OpenCode: OAuth by default for remote; timeouts/protocol/pool/codemode options per server; tool names normalized `<server>_<tool>`.

## Unverified
- Web search unavailable: all attempts failed with `Web search cancelled` (retried with different queries; same error). Could not fetch authoritative docs for Gemini CLI (redirect from `https://geminicli.com/docs/get-started/configuration/` to `/docs/reference/configuration` not retrieved), Qwen Code, pi, oh-my-pi, antigravity. No source URL/date available for these; cannot state per-launch support from sources.
- Codex: no fetched evidence of `codex mcp list`, skills install paths/format/list command, or confirmed per-launch `-c mcp_servers...`/skill subset flags.
- OpenCode: skills/equivalent and per-launch CLI subset not found in fetched MCP page.
- Claude Code: no fetched evidence for `--allowedTools/--disallowedTools` or a dedicated CLI “list skills” command beyond in-session `/skills`. Per-launch skill subset not fully specified beyond `--add-dir`/`--settings`/`--setting-sources` mechanisms noted. Version/date not stated on fetched pages.