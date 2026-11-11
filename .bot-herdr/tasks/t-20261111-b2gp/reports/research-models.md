# Harness Dynamic Model Discovery Specification

Research report for task `t-20261111-b2gp` (step 14) to enable dynamic model discovery in `bh models <harness>` and agent card model pickers.

---

## Executive Summary & Comparison Table

| Harness | Primary Discovery Method | Exact Invocation | Output Shape / Extraction Path | Auth / Network Needs | Local Status |
|---|---|---|---|---|---|
| **Claude Code** (`claude`) | None (CLI flag / interactive `/model` only) | `claude --model <id>` (execution only) | N/A (no listing endpoint) | Needs Anthropic auth & network for execution | **Installed** (`2.1.322`) |
| **Codex CLI** (`codex`) | App Server JSON-RPC | `codex app-server` (stdio) → `model/list` | JSON-RPC `result.data[]` (`id`, `name`, `capabilities`) | Needs OpenAI auth token & network | **Not installed** |
| **pi** (`pi`) | CLI command | `pi --list-models` | Plain text / whitespace columns (`provider`, `model`) | Local catalog (no network needed for built-ins) | **Not installed** |
| **Oh My Pi** (`omp`) | CLI command (`--json` or table) | `omp models --json` (or `omp models`) | JSON `models[]` (`id`, `selector`, `name`, `thinking`) | Local cache `~/.omp/models.db` (no network/auth required) | **Installed** (`omp/18.18.7`) |
| **OpenCode** (`opencode`) | CLI command OR ACP server | `opencode models` OR `opencode acp` | Plain text newline (`<provider>/<model>`) OR ACP `result.configOptions` | Free models work offline/no auth; provider models use local config | **Installed** (`v2.2.7`) |
| **Gemini CLI** (`gemini`) | ACP server (or `/model` interactive) | `gemini --acp` (stdio) → `session/new` | ACP `result.configOptions` (`category: "model"`) | Google account auth / ADC / API key & network | **Not installed** |
| **Qwen Code** (`qwen`) | ACP server (or `/model` interactive) | `qwen --acp` (stdio) → `session/new` | ACP `result.configOptions` (`category: "model"`) | DashScope / Alibaba Cloud auth & network | **Not installed** |
| **Antigravity** (`agy`) | CLI command OR ACP server | `agy models` OR `agy acp` | Tab-separated `<id>\t<name>` OR ACP `result.models.availableModels` | Antigravity / Google auth & network | **Installed** (`1.5.5`) |

---

## Detailed Harness Specifications

### 1. Claude Code (`claude`)

* **Discovery Method:** None. Claude Code does not expose a non-interactive CLI command, flag, or JSON-RPC protocol to enumerate available models without a human. Unflagged arguments passed to `claude` (such as `claude models`) are interpreted as an initial prompt in a new interactive session.
* **Exact Invocation:**
  - Dynamic discovery: Not available.
  - Model assignment on CLI: `claude --model <model-id>`
  - Fallback model assignment: `claude --fallback-model <model-id-list>`
  - Interactive selection: `/model` command within an active session.
* **Output Shape:** N/A.
* **Sample File:** `.bot-herdr/tasks/t-20261111-b2gp/samples/claude.txt` (shows `claude --version` and `--help` model parameters).
* **Auth & Network Needs:** Execution requires Anthropic authentication (OAuth or `ANTHROPIC_API_KEY`) and active network connectivity.
* **Source:**
  - Local binary inspection: `claude --version` (2.1.322), `claude --help` (verified November 11, 2026).
  - Anthropic Documentation: `https://docs.anthropic.com/en/docs/claude-code/settings` (October 2026).
  - Anthropic Model Overview: `https://docs.anthropic.com/en/docs/about-claude/models` (October 2026).
* **Confidence:** High. Verified on this machine.
* **Dev Recommendation for `bh models claude`:** Because Claude Code lacks dynamic model enumeration, maintain a curated fallback catalog (e.g. Claude Fable 5.2, Claude Opus 5.5, Claude Sonnet 5.5, Claude Haiku 5.5) and allow free-form custom ID entry.

---

### 2. OpenAI Codex CLI (`codex`)

* **Discovery Method:** App Server JSON-RPC stdio protocol. The standalone CLI binary does not feature a non-interactive `codex models` command (`codex help models` is unrecognized). However, Codex provides an embedded background application server (`codex app-server`) that communicates via JSON-RPC 2.0 over standard input/output.
* **Exact Invocation:**
  - Launch server: `codex app-server`
  - Send request:
    ```json
    {
      "jsonrpc": "2.0",
      "id": 1,
      "method": "model/list",
      "params": {}
    }
    ```
* **Output Shape:**
  - Returns a JSON-RPC response with a `result.data` array containing model objects:
    ```json
    {
      "jsonrpc": "2.0",
      "id": 1,
      "result": {
        "data": [
          {
            "id": "gpt-6.1-sol",
            "name": "GPT-6.1 Sol",
            "capabilities": {
              "reasoningEffort": ["low", "medium", "high", "xhigh"]
            }
          },
          {
            "id": "gpt-6-astra",
            "name": "GPT-6 Astra",
            "capabilities": {
              "reasoningEffort": ["low", "medium", "high"]
            }
          }
        ]
      }
    }
    ```
  - Field holding list: `result.data` (extract `.id`, `.name`, and `.capabilities.reasoningEffort`).
* **Sample File:** None (marked *Not installed on this machine*).
* **Auth & Network Needs:** Requires valid OpenAI authentication credentials (in `~/.codex/config.toml` or `OPENAI_API_KEY`) and network access to query OpenAI's account entitlement endpoints.
* **Source:**
  - OpenAI Codex CLI & App Server Protocol Reference (`https://github.com/openai/codex`, October 2026).
  - Codex Configuration Documentation (`https://codex-docs.com`, 2026).
* **Confidence:** High (Documented only; not installed on this host).

---

### 3. pi (`pi`)

* **Discovery Method:** CLI command. `pi` is the predecessor to Oh My Pi and supports non-interactive model listing directly via a dedicated command-line flag.
* **Exact Invocation:**
  ```bash
  pi --list-models
  ```
  *(Optional substring filtering: `pi --list-models <filter>`)*
* **Output Shape:**
  - Whitespace-separated columns or formatted text containing provider and model identifier, for example:
    ```text
    anthropic    claude-sonnet-5-5
    anthropic    claude-opus-5-5
    openai       gpt-6.1-sol
    ```
  - Parsed by `parseModelList(text)` in `mods/bot-herdr/roster.js:193-203`.
* **Sample File:** None (marked *Not installed on this machine*).
* **Auth & Network Needs:** Reads from local configuration and built-in model definitions; no network connection required for built-in catalog listings.
* **Source:**
  - Pi Coding Agent Repository & Documentation (`https://github.com/earendil-works/pi-coding-agent`, 2026).
  - Pi Model Catalog (`https://pi.dev/docs/models`, 2026).
* **Confidence:** High (Documented only; not installed on this host).

---

### 4. Oh My Pi (`omp`)

* **Discovery Method:** CLI command (`omp models`). In v18 (`omp/18.18.7`), the legacy `--list-models` flag was replaced by the `omp models` subcommand. It supports rich tabular display as well as machine-readable JSON output via `--json`.
* **Exact Invocation:**
  - Programmatic / JSON (Recommended for `bh models`):
    ```bash
    omp models --json
    ```
  - Standard table:
    ```bash
    omp models
    ```
  - Refresh catalog:
    ```bash
    omp models refresh
    ```
* **Output Shape:**
  - With `--json`, produces a single JSON root object with a `models` array:
    ```json
    {
      "models": [
        {
          "provider": "deepseek",
          "kind": "chat",
          "id": "deepseek-flash",
          "selector": "deepseek/deepseek-flash",
          "name": "DeepSeek-V4.1-Flash",
          "contextWindow": 1000000,
          "maxTokens": 384000,
          "reasoning": true,
          "thinking": ["low", "high", "max"],
          "input": ["text", "image"]
        }
      ]
    }
    ```
  - Field holding list: `result.models` (extract `.selector` or `.id`, `.name`, and `.thinking` for reasoning efforts).
* **Sample File:** `.bot-herdr/tasks/t-20261111-b2gp/samples/omp.txt` (trimmed 30 lines from local `omp models` execution).
* **Auth & Network Needs:** No authentication or network required to read the local database (`~/.omp/models.db`). Network is only accessed when running `omp models refresh`.
* **Source:**
  - Local binary verification: `omp --version` (`omp/18.18.7`), `omp models --help`, `omp models --json` (November 11, 2026).
  - Oh My Pi Documentation (`https://github.com/can1357/oh-my-pi`, November 2026).
* **Confidence:** High. Verified on this machine.

---

### 5. OpenCode (`opencode`)

* **Discovery Method:** Two automated methods verified on this machine:
  1. **CLI Subcommand (Simplest):** `opencode models` prints all available model selectors line by line.
  2. **Agent Client Protocol (ACP) stdio Server:** `opencode acp` exposes ACP JSON-RPC 2.0. The `session/new` response includes all configured models within `configOptions`.
* **Exact Invocation:**
  - **Method A (CLI):**
    ```bash
    opencode models
    ```
  - **Method B (ACP stdio JSON-RPC):**
    Spawn `opencode acp`, send newline-delimited JSON-RPC messages:
    1. Initialize:
       ```json
       {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": 1, "clientCapabilities": {}, "clientInfo": {"name": "bot-herdr", "version": "1.0"}}}
       ```
    2. New Session:
       ```json
       {"jsonrpc": "2.0", "id": 2, "method": "session/new", "params": {"cwd": ".", "mcpServers": []}}
       ```
* **Output Shape:**
  - **Method A (CLI):** Plain text lines formatted as `<provider>/<model>` (e.g. `deepseek/deepseek-flash`, `opencode/big-pickle`, `opencode-go/gpt-6-luna`).
  - **Method B (ACP):**
    `result.configOptions` contains an entry with `id: "model"`, `category: "model"`, `type: "select"`, and an `options` array:
    ```json
    {
      "id": "model",
      "name": "Model",
      "category": "model",
      "type": "select",
      "currentValue": "opencode/iceman-free",
      "options": [
        {"value": "deepseek/deepseek-v4-pro", "name": "deepseek/DeepSeek V4 Pro"},
        {"value": "opencode/big-pickle", "name": "opencode/Big Pickle"}
      ]
    }
    ```
  - Field holding list: `result.configOptions.find(o => o.id === "model").options` (array of `{ value, name }`).
* **Sample File:** `.bot-herdr/tasks/t-20261111-b2gp/samples/opencode.txt` (30 lines from local `opencode models`).
* **Auth & Network Needs:** Built-in and free models (`opencode/*-free`, `big-pickle`, etc.) require neither authentication nor network. Provider-specific commercial models require authentication credentials configured via `opencode auth`.
* **Source:**
  - Local binary verification: `opencode --version` (`opencode v2.2.7`), `opencode models`, `opencode acp` (November 11, 2026).
  - OpenCode Documentation (`https://opencode.ai/docs/cli/commands`, `https://opencode.ai/docs/acp`, October 2026).
* **Confidence:** High. Verified on this machine.

---

### 6. Gemini CLI (`gemini`)

* **Discovery Method:** Agent Client Protocol (ACP) mode via `gemini --acp` (or `--experimental-acp`). In interactive sessions, `/model` is used. Standalone API wrappers also offer `gemini-api models`.
* **Exact Invocation:**
  - Spawn `gemini --acp`, send JSON-RPC over stdio:
    1. Initialize:
       ```json
       {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": 1, "clientCapabilities": {}, "clientInfo": {"name": "bot-herdr", "version": "1.0"}}}
       ```
    2. New Session:
       ```json
       {"jsonrpc": "2.0", "id": 2, "method": "session/new", "params": {"cwd": ".", "mcpServers": []}}
       ```
* **Output Shape:**
  - Returns JSON-RPC response with `result.configOptions` containing `{ id: "model", category: "model", type: "select", options: [...] }` or `result.models.availableModels` containing `[{ modelId, name }]`.
* **Sample File:** None (marked *Not installed on this machine*).
* **Auth & Network Needs:** Requires Google authentication (logged-in Google account, `GEMINI_API_KEY`, or Vertex/ADC credentials) and active network connection to verify account model quotas.
* **Source:**
  - Gemini CLI Official Documentation (`https://geminicli.com/docs/commands`, October 2026).
  - Agent Client Protocol Reference (`https://agentclientprotocol.com/docs/implementations/gemini`, 2026).
  - Google Gemini API Reference (`https://ai.google.dev/gemini-api/docs/models/gemini`, September 2026).
* **Confidence:** High (Documented only; not installed on this host).

---

### 7. Qwen Code (`qwen`)

* **Discovery Method:** Agent Client Protocol (ACP) mode via `qwen --acp` (or `--experimental-acp`). Qwen Code does not provide a non-interactive CLI listing command. In interactive sessions, `/model` is used.
* **Exact Invocation:**
  - Spawn `qwen --acp`, send JSON-RPC over stdio:
    1. Initialize:
       ```json
       {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": 1, "clientCapabilities": {}, "clientInfo": {"name": "bot-herdr", "version": "1.0"}}}
       ```
    2. New Session:
       ```json
       {"jsonrpc": "2.0", "id": 2, "method": "session/new", "params": {"cwd": ".", "mcpServers": []}}
       ```
* **Output Shape:**
  - Returns JSON-RPC response with `result.configOptions` array where the option with `category: "model"` exposes available models in `options: [{"value": "<id>", "name": "<display>"}]`.
* **Sample File:** None (marked *Not installed on this machine*).
* **Auth & Network Needs:** Requires DashScope API key or Alibaba Cloud configuration (`~/.qwen/settings.json`) and network connectivity.
* **Source:**
  - Qwen Code Repository (`https://github.com/QwenLM/Qwen3-Coder`, 2026).
  - Agent Client Protocol Qwen Specification (`https://agentclientprotocol.com/docs/implementations/qwen`, October 2026).
* **Confidence:** High (Documented only; not installed on this host).

---

### 8. Antigravity (`agy` / `antigravity`)

* **Discovery Method:** Two automated methods verified on this machine:
  1. **CLI Subcommand (Direct & Fast):** `agy models` fetches and prints active models in tab-separated format.
  2. **Agent Client Protocol (ACP) Server:** `agy acp` responds to standard ACP `initialize` and `session/new` with both `result.models` and `result.configOptions`.
* **Exact Invocation:**
  - **Method A (CLI):**
    ```bash
    agy models
    ```
  - **Method B (ACP stdio JSON-RPC):**
    Spawn `agy acp`, send:
    1. Initialize:
       ```json
       {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": 1, "clientCapabilities": {}, "clientInfo": {"name": "bot-herdr", "version": "1.0"}}}
       ```
    2. New Session:
       ```json
       {"jsonrpc": "2.0", "id": 2, "method": "session/new", "params": {"cwd": ".", "mcpServers": []}}
       ```
* **Output Shape:**
  - **Method A (CLI):**
    Tab-separated text lines (`<id>\t<displayName>`):
    ```text
    gemini-3.8-flash-high	Gemini 3.8 Flash (High)
    gemini-3.8-flash-medium	Gemini 3.8 Flash (Medium)
    gemini-3.8-flash-low	Gemini 3.8 Flash (Low)
    claude-sonnet-4-6	Claude Sonnet 4.6 (Thinking)
    claude-opus-4-6-thinking	Claude Opus 4.6 (Thinking)
    gpt-oss-120b-medium	GPT-OSS 120B (Medium)
    ```
  - **Method B (ACP):**
    `session/new` result contains both:
    - `result.models.availableModels`: `[{"modelId": "gemini-3.8-flash-high", "name": "Gemini 3.8 Flash (High)"}, ...]`
    - `result.configOptions`: contains entry with `id: "model"`, `category: "model"`, and `options: [{"value": "...", "name": "..."}]`.
* **Sample File:** `.bot-herdr/tasks/t-20261111-b2gp/samples/antigravity.txt` and `.bot-herdr/tasks/t-20261111-b2gp/samples/agy.txt`.
* **Auth & Network Needs:** CLI `agy models` and ACP `session/new` communicate with the Google AI / Antigravity tier service using cached local credentials (`~/.gemini/antigravity-cli`). Requires active internet connection.
* **Source:**
  - Local binary verification: `agy --version` (`1.5.5`), `agy models`, `agy acp` (November 11, 2026).
  - Antigravity Documentation (`https://antigravity.google/docs/cli/reference`, October 2026).
  - ACP Antigravity Server Reference (`https://agentclientprotocol.com/docs/implementations/antigravity`, October 2026).
* **Confidence:** High. Verified on this machine.

---

## Technical Recommendations for Dev (`bh models <harness>`)

1. **Protocol Dispatch Strategy:**
   - **Direct CLI List Harnesses:**
     - `omp`: Run `omp models --json`, parse `.models[]`.
     - `opencode`: Run `opencode models`, parse lines into IDs.
     - `antigravity` / `agy`: Run `agy models`, split lines on `\t`.
     - `pi`: Run `pi --list-models`, parse using existing `parseModelList()`.
   - **ACP Stdio Harnesses (`gemini`, `qwen`, fallback for `opencode` & `antigravity`):**
     - Launch child process with ACP flag (`gemini --acp`, `qwen --acp`, `opencode acp`, `agy acp`).
     - Exchange JSON-RPC `initialize` and `session/new` (with `cwd` and `mcpServers: []`).
     - Extract models from `result.configOptions.find(c => c.category === "model").options` or `result.models.availableModels`.
     - Immediately terminate child process.
   - **Codex App-Server:**
     - Launch `codex app-server` over stdio.
     - Send `{"jsonrpc": "2.0", "id": 1, "method": "model/list", "params": {}}`.
     - Extract `result.data[]`.
   - **Claude Code:**
     - Return static fallback list from `MODELS.claude` with a note that dynamic listing is unsupported by Claude Code CLI.
2. **Caching Strategy:**
   - Cache results in `.bot-herdr/cache/models/<harness>.json` with a timestamp and space/machine key.
   - Allow `--refresh` flag in `bh models` and a UI refresh button on agent cards to re-query on demand.
