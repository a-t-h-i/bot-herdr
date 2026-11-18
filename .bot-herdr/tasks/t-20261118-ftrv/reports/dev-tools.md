## Summary
Steps 3, 4 and 6 are done: `bh tools <harness>` follows contract #8, picks are enforced through `argvOf` (Claude Code `--settings` deny list, Codex `-c mcp_servers.<id>.enabled=false`) and the brief names them, and `sync()` removes stale marked templates.
Codex headless turns skip `argvOf`, so Codex MCP limits there need a one-line `runner.mjs` change (see Blockers). Everything else holds the picks through the brief only, as described below.

## Changes
- `mods/bot-herdr/engine/lib/tools.mjs` (new): `listTools(harness, {root, refresh, home, env})`, `installedNames`, `SUPPORTED`, plus parsers `frontmatter`, `skillsIn`, `tomlServers`, `jsonc`. Cache: `DATA/tools/<harness>-<sha1(root)>.json`, 24 h; only a successful read is cached.
  - claude: skills in `~/.claude/skills` (looks up to 2 folders into a folder with no SKILL.md, because synced skills live at `skills/synced/<id>/<skill>`), `<root>/.claude/skills`, and plugin `skills/` folders under `~/.claude/plugins/**`. **I skip `plugins/marketplaces`**: those are catalogues of plugins you could install, not installed ones (here the glob would have listed discord, champion-kit and others). Plugin skills are named `<plugin>:<skill>`, with `<plugin>` from `.claude-plugin/plugin.json` or else the folder name. MCP: `~/.claude.json` `mcpServers` (user), `projects[<root>].mcpServers` and `<root>/.mcp.json` (project).
  - codex: skills in `$CODEX_HOME|~/.codex/skills` (one folder deeper for `.system`), plus `~/.agents/skills` and `<root>/.agents/skills`, which the current Codex docs name as its skill paths. MCP: regex over `[mcp_servers.<id>]` headers and subtables, bare or quoted ids, in `~/.codex/config.toml` and `<root>/.codex/config.toml`.
  - opencode: skills in `~/.config/opencode/skills`, `.opencode/skills`, and the compatibility folders `~/.claude/skills`, `~/.agents/skills`, `<root>/.claude/skills` and `<root>/.agents/skills`, all confirmed in the docs. MCP: `mcp.servers` (current schema) or `mcp` object keys from `opencode.json[c]` in `~/.config/opencode`, `<root>` and `<root>/.opencode`, with comments and trailing commas stripped and strings left intact.
- `mods/bot-herdr/engine/bh.mjs`: `case "tools"` (always prints JSON, root = project root) and a `bh help` line.
- `mods/bot-herdr/roster.js`:
  - `clean()` adds `skills` and `mcp` (trimmed, non-empty, unique strings, default `[]`).
  - **The default entry for an unsaved role also gets `skills: [], mcp: []` (one line in `roster()`, beyond the `clean`/`argvOf` lines the brief named).** Without it, a role nobody has saved yet would lack the arrays the contract promises Design.
  - New exported `limitArgs(agent)`, appended by `argvOf` before the extra arguments.
- `mods/bot-herdr/engine/lib/team.mjs`:
  - `team()` gives each agent with picks on a supported harness `installed` (the cached `bh tools` names), which `argvOf` uses to deny the rest.
  - New `toolsSection()` is pushed into `brief()` right after the role text.
  - `sync()` calls the new `removeStale()`.
- `test/tools.test.mjs` (new), `test/roster.test.mjs` (a test for the `clean` behaviour).

## Where enforcement happens
`argvOf` (roster.js), which every path except Codex headless goes through:
- Claude Code headless (`runner.mjs claudeTurn`)
- `/cli` interactive
- `writeTemplate` for non-headless agents
- `bh spawn` through `hc run` on Windows
- `bh team`

`agentArgv` only starts `bh agent`, which then runs the harness through the runner, so it is not a choke point.

What carries the `installed` lists: the engine adds them in `team()`. The composer, which is outside my files, calls `argvOf` with its own roster, which has no `installed`, so an agent the chat starts as its CLI in a tab gets the brief section but no deny flags.

## Brief Check
- **`bh tools claude` prints the contract JSON with at least `~/.claude/skills`: met.**
  - Ran it through the worktree's bh.mjs: 13 user skills (built-in-browser … xlsx, from `skills/synced/<id>/`), `mcp: []`.
  - `tools gemini` gives `{"harness":"gemini","supported":false,"skills":[],"mcp":[]}`.
  - The main-repo path in the criterion shows this only after the merge.
- **`test/tools.test.mjs` covers the three harnesses with temp-HOME fixtures, the deny argv for claude and codex, and the brief section present and absent: met** (7 tests).
- **A test shows `sync()` removes a marked stale template and keeps an unmarked one: met** (`sync removes our template…`).
- **`bh check` passes and `herdr-app check mods/bot-herdr` passes: met.**

## Docs confirmed (2026-11-18)
- **Claude Code:**
  - `claude --help` lists `--settings <file-or-json>`.
  - code.claude.com/docs/en/permissions: `mcp__<server>` matches every tool of a server. A server name's `.` and spaces become `_`, which I apply.
  - The docs also give `Skill(skill:<name>)`, which "matches the skill under any of its names" (alias and display name). **I used that form instead of the brief's `Skill(<name>)`**; `Skill(name)` is also documented, but only as an exact match.
- **Codex:**
  - learn.chatgpt.com/docs/build-skills (the old URL redirects there): skills live in `.agents/skills` and `$HOME/.agents/skills`. A skill can be disabled only through `[[skills.config]] enabled=false` in config.toml; there is no per-launch flag or `-c` switch documented, so Codex skills are held by the brief only.
  - The `mcp_servers.<id>.enabled` key comes from the config reference, per the research report. `-c key=value` is the same switch roster.js already uses for effort.
  - Ids that are not bare TOML keys (such as `my.server`) are left to the brief, so I never invent quoting.
- **OpenCode:**
  - opencode.ai/docs/skills confirms the skill paths above. Its skill permissions are a `permissions` array (`{action:"skill", resource, effect}`), not `permission.skill`.
  - opencode.ai/docs/config shows `mcp.servers` and JSONC but no `enabled:false`.
  - Neither the config nor the CLI page mentions `OPENCODE_CONFIG_CONTENT`.
  - Since neither switch is confirmed, OpenCode is held by the brief only, as the brief directs.

## Verification
- `node --test test/tools.test.mjs test/roster.test.mjs` — 21 pass
- `node --test test/*.test.mjs` — 256 pass, 0 fail
- `bh check` — PASS (133 targeted tests; no lint or typecheck is set up)
- `herdr-app check mods/bot-herdr` — Check passed
- `node mods/bot-herdr/engine/bh.mjs tools claude --refresh | tools codex | tools opencode | tools gemini` — contract JSON each time (Codex is in fact installed here: 7 skills and `node_repl` MCP)

## Blockers
- **Codex headless:** `runner.mjs codexTurn` (line ~321) builds its own argv and never calls `argvOf`, so headless Codex agents get the brief but not `-c mcp_servers.<id>.enabled=false`. The fix is one line, `...limitArgs(agent)` after `...extra(agent)`, importing `limitArgs` from roster.js. `runner.mjs` is not in my files.
- **Composer CLI starts:** `composer.js` starts CLI-mode agents with `argvOf(entry, this.known)` on entries without `installed`, so they get no deny flags. Fixing that needs the composer to fetch `bh tools` (Design's file) or to start them through `bh spawn` or `bh agent`.

## Notes
- `removeStale` also removes the `bh-<variant>` templates that `bh spawn` writes (marked, and not roster slugs). Each spawn rewrites them, so the only cost is a race if a team save happens between a spawn's write and `hc run` reading the file.
- The `installed` lists come from a cache that lasts 24 h. A skill installed today is not denied until `bh tools <h> --refresh` runs or the cache expires; Settings could refresh when the picker opens.

## Knowledge Proposals
- Claude Code installed plugins: scan `~/.claude/plugins/**/skills` but skip `marketplaces/` (catalogues, not installs). claude.ai-synced skills sit at `~/.claude/skills/synced/<id>/<skill>/SKILL.md`.
- Per-launch limits: Claude `--settings '{"permissions":{"deny":["Skill(skill:x)","mcp__srv"]}}'`; Codex `-c mcp_servers.<id>.enabled=false` (no skill switch); OpenCode has none confirmed.
