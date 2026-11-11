## Summary
Confirmed how all 8 harnesses report available models dynamically without a human, with exact invocations, output schemas, and auth/network requirements.
Installed harnesses (omp, opencode, agy, claude) were verified directly on this machine with trimmed 30-line samples saved, and non-installed harnesses are fully documented with sources.

## Changes
- `.bot-herdr/tasks/t-20261111-b2gp/reports/research-models.md`: Comprehensive model discovery specification per harness, exact JSON-RPC / CLI commands, extraction keys, and Dev implementation strategy.
- `.bot-herdr/tasks/t-20261111-b2gp/samples/omp.txt`: 30-line sample from `omp models`.
- `.bot-herdr/tasks/t-20261111-b2gp/samples/opencode.txt`: 30-line sample from `opencode models`.
- `.bot-herdr/tasks/t-20261111-b2gp/samples/antigravity.txt`: Real sample from `agy models`.
- `.bot-herdr/tasks/t-20261111-b2gp/samples/agy.txt`: Alias copy for `antigravity.txt`.
- `.bot-herdr/tasks/t-20261111-b2gp/samples/claude.txt`: Sample verifying Claude Code version and CLI model parameters.

## Brief Check
- Every harness has a section: MET. All 8 harnesses (Claude Code, Codex CLI, pi, Oh My Pi, OpenCode, Gemini CLI, Qwen Code, Antigravity) are documented in `.bot-herdr/tasks/t-20261111-b2gp/reports/research-models.md`.
- Each method is verified on this machine or marked not installed here or documented only: MET. omp, opencode, agy, and claude are verified on this machine; codex, pi, gemini, and qwen are marked not installed here with documented JSON-RPC / CLI methods and source citations.
- Samples exist for every harness that ran: MET. Samples are generated and saved in `.bot-herdr/tasks/t-20261111-b2gp/samples/`.

## Verification
- `where.exe claude codex pi omp opencode gemini qwen agy antigravity` — Identified installed harnesses (claude, omp, opencode, agy).
- `omp models` & `omp models --json` — Verified output format and extracted JSON models array; output saved to `omp.txt`.
- `opencode models` & `opencode acp` — Verified newline CLI listing and ACP stdio JSON-RPC `session/new` `configOptions`; output saved to `opencode.txt`.
- `agy models` & `agy acp` — Verified tab-separated CLI listing and ACP stdio JSON-RPC `session/new` `availableModels` & `configOptions`; output saved to `antigravity.txt`.
- `claude --help` & test run — Confirmed Claude Code treats unflagged args as prompt and has no non-interactive model enumeration command; output saved to `claude.txt`.

## Knowledge Proposals
- Document model discovery mechanisms in `.bot-herdr/knowledge/harnesses-model-discovery.md`:
  - `omp`: `omp models --json` (extract `.models[]`)
  - `opencode`: `opencode models` (newline plain text) or ACP `session/new` (`configOptions`)
  - `agy` / `antigravity`: `agy models` (tab-separated `<id>\t<name>`) or ACP `session/new` (`models.availableModels`)
  - `pi`: `pi --list-models` (whitespace columns)
  - `codex`: `codex app-server` stdio JSON-RPC `model/list` (extract `result.data[]`)
  - `gemini`: `gemini --acp` stdio JSON-RPC `session/new` (`configOptions`)
  - `qwen`: `qwen --acp` stdio JSON-RPC `session/new` (`configOptions`)
  - `claude`: static curated list in `MODELS.claude` with custom entry support.
