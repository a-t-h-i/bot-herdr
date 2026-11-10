// Each harness's own models, newest first (current ones before older ones). For Claude Code,
// the effort levels each model takes. Any other id can still be typed in Settings.
//
// From research dated 2026-11-11 (sources with URLs in
// .bot-herdr/tasks/t-20261111-8c1a/reports/models.md): Anthropic, OpenCode, Google, Qwen and
// Antigravity docs and announcements, October 2026.

export const MODELS = {
  claude: [
    {"id": "claude-fable-5-2", "name": "Claude Fable 5.2", "current": true, "efforts": ["low", "medium", "high", "xhigh", "max"]},
    {"id": "claude-opus-5-5", "name": "Claude Opus 5.5", "current": true, "efforts": ["low", "medium", "high", "xhigh", "max"]},
    {"id": "claude-sonnet-5-5", "name": "Claude Sonnet 5.5", "current": true, "efforts": ["low", "medium", "high", "xhigh", "max"]},
    {"id": "claude-haiku-5-5", "name": "Claude Haiku 5.5", "current": true, "efforts": ["low", "medium", "high", "xhigh", "max"]},
    {"id": "claude-fable-5-1", "name": "Claude Fable 5.1", "current": false, "efforts": ["low", "medium", "high", "xhigh", "max"]},
    {"id": "claude-fable-5", "name": "Claude Fable 5", "current": false, "efforts": ["low", "medium", "high", "xhigh", "max"]},
    {"id": "claude-opus-5", "name": "Claude Opus 5", "current": false, "efforts": ["low", "medium", "high", "xhigh", "max"]},
    {"id": "claude-opus-4-8", "name": "Claude Opus 4.8", "current": false, "efforts": ["low", "medium", "high", "xhigh", "max"]},
    {"id": "claude-opus-4-7", "name": "Claude Opus 4.7", "current": false, "efforts": ["low", "medium", "high", "xhigh", "max"]},
    {"id": "claude-opus-4-6", "name": "Claude Opus 4.6", "current": false, "efforts": ["low", "medium", "high", "max"]},
    {"id": "claude-opus-4-5", "name": "Claude Opus 4.5", "current": false, "efforts": ["low", "medium", "high", "max"]},
    {"id": "claude-sonnet-5", "name": "Claude Sonnet 5", "current": false, "efforts": ["low", "medium", "high", "xhigh", "max"]},
    {"id": "claude-sonnet-4-6", "name": "Claude Sonnet 4.6", "current": false, "efforts": ["low", "medium", "high", "max"]},
    {"id": "claude-haiku-4-5", "name": "Claude Haiku 4.5", "current": false, "efforts": []},
  ],
  codex: [
    {"id": "gpt-6.1-sol", "name": "GPT-6.1 Sol", "current": true},
    {"id": "gpt-6-astra", "name": "GPT-6 Astra", "current": true},
    {"id": "gpt-6-luna", "name": "GPT-6 Luna", "current": true},
    {"id": "gpt-6-sol", "name": "GPT-6 Sol", "current": false},
    {"id": "gpt-5.6-sol", "name": "GPT-5.6 Sol", "current": false},
    {"id": "gpt-5.6-terra", "name": "GPT-5.6 Terra", "current": false},
    {"id": "gpt-5.6-luna", "name": "GPT-5.6 Luna", "current": false},
    {"id": "gpt-5.5", "name": "GPT-5.5", "current": false},
    {"id": "gpt-5.4-mini", "name": "GPT-5.4 Mini", "current": false},
    {"id": "gpt-5.3-codex-spark", "name": "GPT-5.3 Codex Spark", "current": false},
  ],
  opencode: [
    {"id": "zen-default", "name": "OpenCode Zen Default", "current": true},
    {"id": "zen-advanced", "name": "OpenCode Zen Advanced", "current": true},
    {"id": "zen-fast", "name": "OpenCode Zen Fast", "current": true},
    {"id": "opencode/deepseek-v4-flash-free", "name": "DeepSeek V4 Flash Free", "current": true},
    {"id": "opencode/big-pickle", "name": "Big Pickle", "current": true},
    {"id": "opencode/minimax-m3-free", "name": "MiniMax M3 Free", "current": true},
    {"id": "anthropic/claude-sonnet-5-5", "name": "Claude Sonnet 5.5", "current": true},
    {"id": "anthropic/claude-opus-5-5", "name": "Claude Opus 5.5", "current": true},
    {"id": "anthropic/claude-fable-5-2", "name": "Claude Fable 5.2", "current": true},
    {"id": "google/gemini-3.8-flash", "name": "Gemini 3.8 Flash", "current": true},
  ],
  gemini: [
    {"id": "gemini-3.8-flash", "name": "Gemini 3.8 Flash", "current": true},
    {"id": "gemini-3.7-flash", "name": "Gemini 3.7 Flash", "current": false},
    {"id": "gemini-3.6-flash", "name": "Gemini 3.6 Flash", "current": false},
    {"id": "gemini-3.1-pro-preview", "name": "Gemini 3.1 Pro Preview", "current": false},
    {"id": "gemini-2.5-flash", "name": "Gemini 2.5 Flash", "current": false},
  ],
  qwen: [
    {"id": "qwen3-coder-plus", "name": "Qwen3 Coder Plus", "current": true},
    {"id": "qwen3-coder-next", "name": "Qwen3 Coder Next", "current": true},
    {"id": "qwen3-coder", "name": "Qwen3 Coder", "current": true},
  ],
  antigravity: [
    {"id": "gemini-3.8-flash-high", "name": "Gemini 3.8 Flash (High)", "current": true},
    {"id": "gemini-3.8-flash-medium", "name": "Gemini 3.8 Flash (Medium)", "current": true},
    {"id": "gemini-3.8-flash-low", "name": "Gemini 3.8 Flash (Low)", "current": true},
    {"id": "gemini-3.7-flash-high", "name": "Gemini 3.7 Flash (High)", "current": false},
    {"id": "gemini-3.7-flash-medium", "name": "Gemini 3.7 Flash (Medium)", "current": false},
    {"id": "gemini-3.7-flash-low", "name": "Gemini 3.7 Flash (Low)", "current": false},
    {"id": "gemini-3.6-flash-high", "name": "Gemini 3.6 Flash (High)", "current": false},
    {"id": "gemini-3.6-flash-medium", "name": "Gemini 3.6 Flash (Medium)", "current": false},
    {"id": "gemini-3.6-flash-low", "name": "Gemini 3.6 Flash (Low)", "current": false},
    {"id": "gemini-pro-agent", "name": "Gemini 3.1 Pro (High)", "current": false},
    {"id": "gemini-3.1-pro-low", "name": "Gemini 3.1 Pro (Low)", "current": false},
  ],
};
