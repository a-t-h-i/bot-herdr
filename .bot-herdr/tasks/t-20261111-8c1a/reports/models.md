# Current Harness Model Manifest & ACP Support Reference

Collected for task `t-20261111-8c1a` (step 1) to update `mods/bot-herdr/models.js` and support multi-harness model configuration.

---

## 1. Claude Code

### Models & Efforts
| id | display name | current? | efforts? |
|---|---|---|---|
| `claude-fable-5-2` | Claude Fable 5.2 | Yes | low, medium, high, xhigh, max |
| `claude-opus-5-5` | Claude Opus 5.5 | Yes | low, medium, high, xhigh, max |
| `claude-sonnet-5-5` | Claude Sonnet 5.5 | Yes | low, medium, high, xhigh, max |
| `claude-haiku-5-5` | Claude Haiku 5.5 | Yes | low, medium, high, xhigh, max |
| `claude-fable-5-1` | Claude Fable 5.1 | No (legacy) | low, medium, high, xhigh, max |
| `claude-fable-5` | Claude Fable 5 | No (legacy) | low, medium, high, xhigh, max |
| `claude-opus-5` | Claude Opus 5 | No (legacy) | low, medium, high, xhigh, max |
| `claude-opus-4-8` | Claude Opus 4.8 | No (legacy) | low, medium, high, xhigh, max |
| `claude-opus-4-7` | Claude Opus 4.7 | No (legacy) | low, medium, high, xhigh, max |
| `claude-opus-4-6` | Claude Opus 4.6 | No (legacy) | low, medium, high, max |
| `claude-opus-4-5` | Claude Opus 4.5 | No (legacy) | low, medium, high, max |
| `claude-sonnet-5` | Claude Sonnet 5 | No (legacy) | low, medium, high, xhigh, max |
| `claude-sonnet-4-6` | Claude Sonnet 4.6 | No (legacy) | low, medium, high, max |
| `claude-haiku-4-5` | Claude Haiku 4.5 | No (legacy) | none |

### List Command
- **Command:** none found (CLI does not offer a non-interactive `claude models` list command; models are selected via `--model <id>` on CLI or interactively via `/model` and `/effort` inside sessions).

### Agent Client Protocol (ACP) Support
- **ACP Support:** Claude Code does not natively expose an ACP server (uses custom Anthropic CLI/API session architecture).

### Sources
- `https://www.anthropic.com/news/claude-fable-5-2` (Anthropic, October 2026)
- `https://www.anthropic.com/news/claude-opus-5-5` (Anthropic, September 22, 2026)
- `https://www.anthropic.com/news/claude-sonnet-5-5` (Anthropic, September 28, 2026)
- `https://docs.anthropic.com/en/docs/about-claude/models` (Anthropic Docs, October 2026)
- `https://docs.anthropic.com/en/docs/claude-code/settings` (Anthropic Docs, October 2026)

---

## 2. OpenCode (`opencode.ai`)

### Models & Efforts
| id | display name | current? | efforts? |
|---|---|---|---|
| `zen-default` | OpenCode Zen Default | Yes | none |
| `zen-advanced` | OpenCode Zen Advanced | Yes | none |
| `zen-fast` | OpenCode Zen Fast | Yes | none |
| `opencode/deepseek-v4-flash-free` | DeepSeek V4 Flash Free | Yes | none |
| `opencode/big-pickle` | Big Pickle | Yes | none |
| `opencode/minimax-m3-free` | MiniMax M3 Free | Yes | none |
| `anthropic/claude-sonnet-5-5` | Claude Sonnet 5.5 | Yes | none |
| `anthropic/claude-opus-5-5` | Claude Opus 5.5 | Yes | none |
| `anthropic/claude-fable-5-2` | Claude Fable 5.2 | Yes | none |
| `google/gemini-3.8-flash` | Gemini 3.8 Flash | Yes | none |

### List Command
- **Command:** `opencode models` (lists all models across providers; can also filter by provider using `opencode models [provider]`). Interactive sessions support `/models`.

### Agent Client Protocol (ACP) Support
- **ACP Support:** Native (`opencode acp`).
- **Method:** Supports `session/set_config_option` with `configId: "model"`. The legacy `session/set_model` method is not supported (deprecated and removed in ACP).

### Sources
- `https://opencode.ai/docs/cli/commands` (OpenCode Docs, October 2026)
- `https://opencode.asia/docs/zen` (OpenCode Docs, September 2026)
- `https://opencode.ai/docs/acp` (OpenCode Docs, October 2026)

---

## 3. Gemini CLI

### Models & Efforts
| id | display name | current? | efforts? |
|---|---|---|---|
| `gemini-3.8-flash` | Gemini 3.8 Flash | Yes | low, medium, high (via thinking_level) |
| `gemini-3.7-flash` | Gemini 3.7 Flash | No (legacy) | low, medium, high |
| `gemini-3.6-flash` | Gemini 3.6 Flash | No (legacy) | low, medium, high |
| `gemini-3.1-pro-preview` | Gemini 3.1 Pro Preview | No (legacy) | none |
| `gemini-2.5-flash` | Gemini 2.5 Flash | No (legacy) | none |

### List Command
- **Command:** `gemini models` (lists models available to current account; interactive session also supports `/model`).

### Agent Client Protocol (ACP) Support
- **ACP Support:** Native (`gemini --acp`).
- **Method:** Supports `session/set_config_option` with `configId: "model"`. Does not support `session/set_model`.

### Sources
- `https://blog.google/technology/developers/gemini-3-8-flash/` (Google Announcement, September 2, 2026)
- `https://ai.google.dev/gemini-api/docs/models/gemini` (Google Developer Docs, September 2026)
- `https://geminicli.com/docs/commands` (Gemini CLI Reference, October 2026)
- `https://agentclientprotocol.com/docs/implementations/gemini` (ACP Documentation, 2026)

---

## 4. Qwen Code

### Models & Efforts
| id | display name | current? | efforts? |
|---|---|---|---|
| `qwen3-coder-plus` | Qwen3 Coder Plus | Yes | none |
| `qwen3-coder-next` | Qwen3 Coder Next | Yes | none |
| `qwen3-coder` | Qwen3 Coder | Yes | none |

### List Command
- **Command:** none found (Qwen Code CLI has no direct non-interactive `qwen models` listing command; model is passed via `--model <id>` / `-m <id>`, or interactively using `/model`. External cloud administration utility uses `qwencloud models list`).

### Agent Client Protocol (ACP) Support
- **ACP Support:** Supported via adapter/ACP server mode.
- **Method:** Supports `session/set_config_option` with `configId: "model"`. Does not support `session/set_model`.

### Sources
- `https://qwen.ai/blog/qwen3-coder` (Alibaba Cloud / Qwen Team, February 2026)
- `https://github.com/QwenLM/Qwen3-Coder` (Official Repository, 2026)
- `https://agentclientprotocol.com/docs/implementations/qwen` (ACP Documentation, 2026)

---

## 5. Antigravity (`agy`)

### Models & Efforts
| id | display name | current? | efforts? |
|---|---|---|---|
| `gemini-3.8-flash-high` | Gemini 3.8 Flash (High) | Yes | high (bundled in id) |
| `gemini-3.8-flash-medium` | Gemini 3.8 Flash (Medium) | Yes | medium (bundled in id) |
| `gemini-3.8-flash-low` | Gemini 3.8 Flash (Low) | Yes | low (bundled in id) |
| `gemini-3.7-flash-high` | Gemini 3.7 Flash (High) | No (legacy) | high (bundled in id) |
| `gemini-3.7-flash-medium` | Gemini 3.7 Flash (Medium) | No (legacy) | medium (bundled in id) |
| `gemini-3.7-flash-low` | Gemini 3.7 Flash (Low) | No (legacy) | low (bundled in id) |
| `gemini-3.6-flash-high` | Gemini 3.6 Flash (High) | No (legacy) | high (bundled in id) |
| `gemini-3.6-flash-medium` | Gemini 3.6 Flash (Medium) | No (legacy) | medium (bundled in id) |
| `gemini-3.6-flash-low` | Gemini 3.6 Flash (Low) | No (legacy) | low (bundled in id) |
| `gemini-pro-agent` | Gemini 3.1 Pro (High) | No (legacy) | high (bundled in id) |
| `gemini-3.1-pro-low` | Gemini 3.1 Pro (Low) | No (legacy) | low (bundled in id) |

### List Command
- **Command:** none found (Antigravity CLI selects models via settings config or `/model` interactive prompt; no direct non-interactive CLI listing command).

### Agent Client Protocol (ACP) Support
- **ACP Support:** Native (`agy acp`).
- **Method:** Supports `session/set_config_option` with `configId: "model"`. Does not support `session/set_model`.

### Sources
- `https://antigravity.google/docs/cli/reference` (Antigravity Docs, October 2026)
- `https://antigravity.google/docs/models` (Antigravity Docs, September 2026)
- `https://agentclientprotocol.com/docs/implementations/antigravity` (ACP Documentation, October 2026)

---

## 6. Oh My Pi (`omp` v18.x) & Predecessor `pi`

### Models & Efforts
`omp` v18 supports model selection via `--model=<value>`, accepting both fuzzy substrings (e.g., `"opus"`, `"gpt-5.2"`, `"sonnet"`) and fully qualified `provider/model` selectors.

Key active provider model IDs documented in the `omp v18.18.7` model catalog:

| id / selector | display name | provider | current? | efforts / thinking |
|---|---|---|---|---|
| `anthropic/claude-fable-5-2` | Claude Fable 5.2 | Anthropic | Yes | low, medium, high, xhigh, max |
| `anthropic/claude-opus-5-5` | Claude Opus 5.5 | Anthropic | Yes | low, medium, high, xhigh, max |
| `anthropic/claude-sonnet-5-5` | Claude Sonnet 5.5 | Anthropic | Yes | low, medium, high, xhigh, max |
| `anthropic/claude-haiku-5-5` | Claude Haiku 5.5 | Anthropic | Yes | low, medium, high, xhigh, max |
| `openai/gpt-6.1-sol` | GPT-6.1 Sol | OpenAI | Yes | none |
| `openai/gpt-6.1-terra` | GPT-6.1 Terra | OpenAI | Yes | none |
| `openai/gpt-6-astra` | GPT-6 Astra | OpenAI | Yes | none |
| `openai/gpt-6-luna` | GPT-6 Luna | OpenAI | Yes | none |
| `openai/gpt-5.6-sol` | GPT-5.6 Sol | OpenAI | No (legacy) | none |
| `openai/gpt-5.6-terra` | GPT-5.6 Terra | OpenAI | No (legacy) | none |
| `google/gemini-3.8-flash` | Gemini 3.8 Flash | Google | Yes | low, medium, high |
| `google/gemini-3.7-flash` | Gemini 3.7 Flash | Google | No (legacy) | low, medium, high |
| `deepseek/deepseek-v4-pro` | DeepSeek-V4-Pro | DeepSeek | Yes | low, high, max |
| `deepseek/deepseek-v4-flash` | DeepSeek V4 Flash | DeepSeek | Yes | low, high, max |
| `zai/glm-5.3` | GLM-5.3 | ZhipuAI / Zai | Yes | low, high, max |
| `zai/glm-5.3-flash` | GLM-5.3-Flash | ZhipuAI / Zai | Yes | low, high, max |

### List Command
- **`omp v18.x`:**
  - The legacy flag `--list-models` has been **removed** in v18 (returns unknown flag error on v18.18.7).
  - Current command: **`omp models`**
  - Subcommands and options:
    - `omp models` (lists configured chat models grouped by provider)
    - `omp models <provider>` (lists models for specific provider, e.g., `omp models anthropic`)
    - `omp models find <substring>` (finds models by substring)
    - `omp models --json` (outputs full machine-readable JSON)
    - `omp models --kind all` (lists models of every catalog kind: chat, local, web)
    - `omp models refresh` (forces catalog fetch/refresh)
  - Interactive session: `/model` command.
- **Predecessor `pi`:**
  - `pi --list-models` remains documented and functional in older `pi` binaries.

### Agent Client Protocol (ACP) Support
- **ACP Support:** Exposes RPC mode (`omp --mode rpc` / `rpc-ui`). Config options passed via session RPC config options.

### Sources
- `omp v18.18.7` CLI binary documentation (`omp --help`, `omp models --help`, `omp models --json`) (local environment, 2026-11)
- `~/.omp/agent/models.db` catalog cache (v18.18.7 authoritative database, November 2026)
- `https://github.com/can1357/oh-my-pi` / `https://pi.dev/docs/models` (v18 documentation, 2026)

---

## 7. Summary Comparison: ACP Protocol Support

Across all harnesses implementing the Agent Client Protocol (OpenCode, Gemini CLI, Qwen Code, and Antigravity):
- **`session/set_model`**: Neither supports this method. The dedicated `session/set_model` endpoint was deprecated and removed in early ACP specification drafts.
- **`session/set_config_option`**: All ACP-compliant harnesses support `session/set_config_option` passing `{"configId": "model", "value": "<model-id>"}`.
