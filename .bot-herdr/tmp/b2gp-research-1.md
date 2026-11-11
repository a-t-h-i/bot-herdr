Task t-20261111-b2gp, step 14. Plan: bh plan show p-20261111-9dkc.

GOAL
The person wants each agent card's model picker to list the models a harness really offers, never a hard-coded list (today mods/bot-herdr/models.js). Dev will build `bh models <harness>` from your findings, so they must be exact.

FOR EACH HARNESS: Claude Code (claude), Codex CLI (codex), pi, Oh My Pi (omp), OpenCode (opencode), Gemini CLI (gemini), Qwen Code (qwen), Antigravity (agy / antigravity)
1. How it reports available models without a human: a CLI command (e.g. `pi --list-models`, `opencode models`), an Agent Client Protocol response (session/new returning models or config options with a "model" option; see agentclientprotocol.com), an app-server/JSON-RPC call (e.g. Codex app-server model/list), or nothing.
2. The exact command or the exact JSON-RPC exchange (method names, params, the field that holds the list), and whether it needs auth or network.
3. Run it on this machine where the harness is installed (check with `where <cmd>`), with a timeout, and save a trimmed real output sample (first 30 lines, no secrets) to .bot-herdr/tasks/t-20261111-b2gp/samples/<harness>.txt. Never leave a harness running; kill what you start.
4. Source: URL plus date or version for every claim; the installed version (`<cmd> --version`).

DO NOT change any code. Write .bot-herdr/tasks/t-20261111-b2gp/reports/research-models.md with one section per harness (method, exact invocation, output shape, sample file, auth/network needs, source, confidence) and a summary table, then report.

DONE WHEN
Every harness has a section; each method is verified on this machine or marked "not installed here" or "documented only"; samples exist for every harness that ran.

IF STUCK
Say what you could not confirm and why; never guess a command.
