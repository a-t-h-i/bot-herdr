1. [ORCHESTRATOR] Which harnesses should get skills and MCP picking first?
- Claude Code first — fully documented (skills folders, `claude mcp list`, `--mcp-config --strict-mcp-config`); others show "not supported yet" (Recommended)
- Claude Code, Codex and OpenCode — the three with documented MCP config; Codex/OpenCode skills support is unclear
- Every harness — best effort, some may only get MCP or nothing

2. [DEV] What should ticking skills and MCP servers on an agent mean?
- Only these — the agent launches with just the ticked MCP servers and is told to use the ticked skills; nothing ticked means everything installed, as today (Recommended)
- Add emphasis — every installed skill and server stays available; the ticked ones are named in its brief as the ones to reach for
- Strict block — anything not ticked is blocked for that agent, skills included

3. [DESIGN] Should roles start with suggested picks?
- No presets — every agent starts with everything installed; you tick what you want (Recommended)
- Suggest by name — e.g. skills with "frontend", "design" or "ui" in their name pre-ticked for Design, "plan" for the Orchestrator; you can change them

4. [DESIGN] Where should the picker live on an agent's card?
- In More — two lists of toggle chips (Skills, MCP servers) under Instructions, with a Refresh like the model list (Recommended)
- On the card face — a "Skills · MCP" summary line that opens a picker dialog
