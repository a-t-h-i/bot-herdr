## Summary
PASS: per-agent skills/MCP limits (steps 3-6) meet all five acceptance criteria; deny flags survive Windows quoting; the full suite passes.
Round 1's minor finding (a stale hc template left after an agent is removed or renamed) is fixed by removeStale() in sync().

## Changes
None (review only). I wrote a throwaway echo script under %TEMP%\qa-wq to check argv quoting.

## Brief Check
1. `bh tools <harness> [--refresh] [--json]`: **met**. `bh tools aider --json` printed `supported:false` with empty lists. `bh tools claude --refresh` printed `supported:true` with 13 skills and 0 MCP servers. With no harness it prints the usage line. The output is always JSON, so `--json` makes no difference.
2. Launch flags: **met**. `limitArgs` (roster.js:205) builds `--settings {"permissions":{"deny":[Skill(skill:x)…, mcp__srv]}}` for Claude and `-c mcp_servers.<id>.enabled=false` for Codex. It feeds `argvOf` and the headless `codexTurn` (runner.mjs:324). The JSON reaches the child process intact through `launch()` with cmd.exe quoting on Windows. I checked this with spaces, `:` and `.` in names; `.` becomes `_` in the MCP rule. OpenCode skills and Codex skills are held to the picks by the brief only.
3. Brief section: **met**. `toolsSection` returns null when nothing is ticked. A test covers both cases.
4. More sheet: **met** from reading the code. It shows loading, unsupported, error and "None installed." states, chips that toggle through `change()`, and a Refresh button. `loadTools` runs when the sheet opens. The harness picker is on the card, not the sheet, so the sheet cannot get stuck on a harness it never loaded.
5. `sync()` stale templates: **met**. It removes only templates that hold MARK and keeps the user's own and `bh-*` ones. A test covers this.

## Findings
- [minor] Claude.ai-synced skills are listed by their bare name (`built-in-browser`), but Claude Code calls them `anthropic-skills:built-in-browser`. The deny rule relies on `Skill(skill:<name>)` matching any of a skill's names, as dev-tools.md cites from the docs. If that match fails, an unticked synced skill stays usable. I did not verify this against a live Claude Code. Location: tools.mjs readClaude.
- [info] MCP servers from claude.ai connectors and from plugins are not listed, so they can never be denied. This is outside contract #8.
- [info] `bh tools` (Settings) and `withInstalled` (engine) both key project entries on `process.cwd()`. If the two run from different folders, they can see different project skills and servers.
- [info] An accepted gap: CLI-mode starts in composer.js get no deny flags.

## Verification
- node --test test/tools.test.mjs test/roster.test.mjs — 21 pass, 0 fail
- bh check — PASS: 257 tests, 256 pass, 1 skipped (full suite)
- node bh.mjs tools aider --json / tools claude --refresh / tools — correct JSON and usage
- launch() + limitArgs echo script (Windows, shell:true) — argv received byte-identical
