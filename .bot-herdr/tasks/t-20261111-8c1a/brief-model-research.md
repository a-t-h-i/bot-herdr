# Research brief — current harness model lists (t-20261111-8c1a, step 1)

## Goal
bot-herdr's Settings shows each agent harness's models from a static manifest dated 2026-10-21 (mods/bot-herdr/models.js). It is stale (Claude Code shipped new models since) and missing whole harnesses (opencode, gemini, qwen). Collect the current model ids so Dev can refresh the manifest.

## What to find (each answer needs a URL and the date/version it came from)
1. **Claude Code** (`--model` values): every model id the current CLI accepts today, newest first, with display names. Mark which are current and which legacy. Also each model's effort levels if documented (low/medium/high/xhigh/max style).
2. **OpenCode** (opencode.ai CLI): the model ids its CLI offers today (its free/zen models plus the main provider models it routes to), with display names. Does `opencode` have a command that lists models (like `opencode models`)? If yes, its exact command line.
3. **Gemini CLI**: the model ids `gemini -m` accepts today (current gemini models, newest first). A list command if one exists.
4. **Qwen Code**: the model ids its CLI offers today. A list command if one exists.
5. **Antigravity (agy)**: the model ids it offers today (we currently list gemini-3.8-flash high/medium/low and older); confirm or correct.
6. **Agent Client Protocol**: for opencode, gemini-cli, qwen-code and Antigravity — does each support `session/set_model`, or `session/set_config_option` with a model option, or neither? Cite the docs or changelog.

## Output
Write your findings to `.bot-herdr/tasks/t-20261111-8c1a/reports/models.md` as one section per harness: a table of `id | display name | current? | efforts?`, the list command (or "none found"), the set_model support, and under each its sources (URL + date). Only ids you can source; say "not found" rather than guessing a plausible id.

## Constraints
No code changes. Nothing installed or run beyond reading docs. Every model id needs a source.
