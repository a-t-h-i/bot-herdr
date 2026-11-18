## Goal
Steps 3, 4 and 6 of task t-20261118-ftrv: each agent can be limited to the skills and MCP servers the user ticks, picked from what its harness has installed. You build the engine side: list what is installed (step 3), enforce the picks at launch and tell the agent about them (step 4), and clean stale templates (step 6). Design builds the Settings picker in parallel against the contract below. Do the steps in order; report after each with `bh report`, then carry on.

## Files
Change: `mods/bot-herdr/engine/lib/tools.mjs` (new), `mods/bot-herdr/engine/bh.mjs` (a `tools` case next to `case "models":` at bh.mjs:830), `mods/bot-herdr/engine/lib/team.mjs` (`brief` at :76, `agentArgv` at :173, `sync` at :211), `mods/bot-herdr/roster.js` (`clean` near :115 and `argvOf` near :288 only), new `test/tools.test.mjs`, `test/roster.test.mjs`.
Leave alone: `mods/bot-herdr/settings.js` (Design's), `composer.js`, `toast.js`, `gpui-kit.d.ts`.
Imitate: `mods/bot-herdr/engine/lib/models.mjs` (per-harness table, caching under DATA at :269/:300) for step 3.

## Contract (shared with Design — do not change it)
- Roster entry gains `skills: string[]` and `mcp: string[]`: names. `clean()` keeps them as trimmed, non-empty, de-duplicated strings, default `[]`.
- Empty list = no restriction (everything installed, as today). Non-empty = only those may be used.
- `bh tools <harness> [--refresh]` prints JSON `{harness, supported, skills: [{name, description, source}], mcp: [{name, source}], error?}`. `supported` is true for `claude`, `codex`, `opencode`; every other harness gets `supported: false` and empty lists. `source` is "user", "project" or "plugin". Cached under the engine DATA dir like `bh models`; `--refresh` re-reads. A failure gives empty lists plus `error`, exit 0.

## What to do
### Step 3: `bh tools`
1. In `tools.mjs` export `listTools(harness, { root, refresh })`.
2. Claude Code skills: folders containing `SKILL.md` under `~/.claude/skills/*/` (user), `<root>/.claude/skills/*/` (project), and `~/.claude/plugins/**/skills/*/SKILL.md` (plugin). Name = frontmatter `name:` or the folder name; description = frontmatter `description:` (first line). Note `~/.claude/skills/synced/` exists here: recurse one level only if the folder itself has no SKILL.md.
3. Claude Code MCP: `mcpServers` keys in `~/.claude.json` (top level = user, and `projects[<root>].mcpServers` = project) and `<root>/.mcp.json` (project). Do not shell out to `claude mcp list` (it health-checks every server and is slow).
4. Codex: skills `$CODEX_HOME` or `~/.codex` + `/skills/*/SKILL.md`; MCP = `[mcp_servers.<id>]` table names in `~/.codex/config.toml` and `<root>/.codex/config.toml`. Parse the table headers with a regex; no TOML dependency. Codex is not installed on this machine: test with fixtures.
5. OpenCode: MCP = keys of `mcp` (or `mcp.servers`) in `~/.config/opencode/opencode.json[c]` and `<root>/opencode.json[c]` (strip `//` and `/* */` comments before JSON.parse). Skills = `~/.config/opencode/skills/*/SKILL.md` and `<root>/.opencode/skills/*/SKILL.md`; verify against https://opencode.ai/docs and say in your report what you confirmed.
6. Wire `case "tools":` in bh.mjs; add it to `bh help`.

### Step 4: enforce and tell
1. `clean()` in roster.js: add `skills` and `mcp` per the contract.
2. At launch (the place that builds argv for a non-empty pick, `argvOf` in roster.js and/or `agentArgv` in team.mjs — use whichever both the headless and template paths go through, and say which):
   - claude: append `--settings '<json>'` with `{"permissions":{"deny":[...]}}` holding `Skill(<name>)` for every installed skill not ticked and `mcp__<server>` for every installed server not ticked (installed = `listTools` cached result). Verify the rule syntax against `claude --help` and https://code.claude.com/docs/en/settings; report what you confirmed.
   - codex: append `-c mcp_servers.<id>.enabled=false` for each unticked server. For skills, use a documented per-launch switch if one exists; otherwise enforce through the brief only and say so.
   - opencode: use `OPENCODE_CONFIG_CONTENT` (or the documented equivalent) with `mcp.<id>.enabled=false` and `permission.skill.<name>="deny"`, if the docs confirm both; otherwise brief only, and say so.
3. In `brief()` add a section after the role text when either list is non-empty: `## Your skills and MCP servers` then "Use only these skills: a, b." and/or "Use only these MCP servers: x, y." Leave it out when both are empty.

### Step 6: stale templates
In `sync()` (team.mjs:211), after writing templates, delete files in the templates dir that contain `MARK` and whose name is not a current roster slug. Never touch a file without `MARK`.

## Constraints
No new dependencies. No changes outside the files listed. Never edit the user's harness config files; reading them only. Keep functions at 20 lines or less.

## Done when
- `node "C:/Users/athenkosi.hlubi/Desktop/bot-herdr/mods/bot-herdr/engine/bh.mjs" tools claude` prints the contract JSON listing at least the skills in `~/.claude/skills`; `... tools gemini` prints `supported:false`.
- `test/tools.test.mjs` covers each of the three harnesses with fixture folders (a temp HOME), the deny-list argv for claude and codex, and the brief section present/absent.
- A test shows `sync()` removes a marked stale template and keeps an unmarked one.
- `bh check` passes; `herdr-app check mods/bot-herdr` passes.

## If stuck
If a harness's per-launch switch can't be confirmed from its docs or `--help`, don't invent one: fall back to the brief for it and list it under Blockers.
