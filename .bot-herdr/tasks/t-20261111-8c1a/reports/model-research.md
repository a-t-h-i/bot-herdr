## Summary
Gathered verified model IDs, list commands, and ACP configuration methods for Claude Code, OpenCode, Gemini CLI, Qwen Code, and Antigravity.
All findings with sources and dates were compiled to `.bot-herdr/tasks/t-20261111-8c1a/reports/models.md` for Dev to refresh `mods/bot-herdr/models.js`.

## Changes
- Created `.bot-herdr/tasks/t-20261111-8c1a/reports/models.md` containing model tables, list commands, ACP support breakdown, and primary sources.

## Brief Check
- Claude Code `--model` values, display names, current/legacy status, and effort levels: Met (`claude-fable-5-2`, `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`, plus legacy models and effort levels documented).
- OpenCode model IDs (Zen models, free tiers, and provider routes), display names, and list command: Met (`zen-default`, `zen-advanced`, `zen-fast`, `opencode/deepseek-v4-flash-free`, etc., with list command `opencode models`).
- Gemini CLI model IDs (`gemini -m` values) and list command: Met (`gemini-3.8-flash`, legacy models, list command `gemini models`).
- Qwen Code model IDs and list command: Met (`qwen3-coder-plus`, `qwen3-coder-next`, `qwen3-coder`; list command: none found in CLI).
- Antigravity model IDs confirmed or corrected: Met (confirmed `gemini-3.8-flash-{high,medium,low}` and older legacy IDs; list command: none found in CLI).
- Agent Client Protocol (`session/set_model` vs `session/set_config_option`): Met (all ACP harnesses support `session/set_config_option` with `configId: "model"`; none support the deprecated `session/set_model`).

## Verification
- `cat .bot-herdr/tasks/t-20261111-8c1a/reports/models.md` — Verified comprehensive report with all 6 brief requirements, tables, commands, and sources.

## Knowledge Proposals
- In ACP, `session/set_model` is obsolete; IDEs and orchestrators must use `session/set_config_option` with `{"configId": "model", "value": "<id>"}` across OpenCode, Gemini CLI, Qwen Code, and Antigravity.
