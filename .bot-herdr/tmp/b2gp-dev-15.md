Task t-20261111-b2gp, step 15 (next stage, same session). Research's findings, with exact commands and verified samples: .bot-herdr/tasks/t-20261111-b2gp/reports/research-models.md and .bot-herdr/tasks/t-20261111-b2gp/samples/*.txt. Read both first.

GOAL
`bh models <harness>` returns the models the installed harness really offers, so the Settings model picker stops relying on mods/bot-herdr/models.js.

FILES
Create: mods/bot-herdr/engine/lib/models.mjs, test/models.test.mjs, test/fixtures/models/*.txt|json (copies of Research's samples, secrets-free). Change: mods/bot-herdr/engine/bh.mjs (argument parsing and printing only). Read-only: mods/bot-herdr/models.js (you may import MODELS from it for the Claude fallback if node can load it; otherwise report and do not copy it). Leave every other file alone.

CONTRACT (post it on the board as a contract; Design builds the picker against exactly this)
Command: `bh models <harness> [--command <exe>] [--refresh] --json`
- <harness> is the Settings key: claude, codex, pi, omp, opencode, gemini, qwen, antigravity. --command overrides the executable (the person's own harness command); default: claude, codex, pi, omp, opencode, gemini, qwen, agy.
- stdout, exit 0: {"harness":"omp","source":"harness"|"builtin","method":"cli"|"acp"|"app-server"|"none","models":[{"id":"deepseek/deepseek-flash","name":"DeepSeek-V4.1-Flash","efforts":["low","high","max"]}],"at":<epoch ms>,"cached":true|false}
  efforts is present only when the harness reports them.
- When the harness cannot be asked (not installed, auth, timeout, bad output): exit 0 with "source":"builtin" and the models.js list if one exists for that harness, else "models":[], plus "error":"<one plain sentence>". Exit 1 only for a bad argument.
- Claude: always source "builtin", method "none", no error (Claude Code cannot list models).
Methods, from Research:
- omp: `omp models --json` → .models[] (id: selector, name, efforts: thinking).
- pi: `pi --list-models` → existing parseModelList (mods/bot-herdr/roster.js:192); copy that parser into models.mjs rather than importing the mod file, and say so.
- opencode: `opencode models` → one `<provider>/<model>` per line (name = id).
- antigravity: `agy models` → `<id>\t<name>` lines.
- gemini, qwen: ACP over stdio (`gemini --acp`, `qwen --acp`): initialize, then session/new {cwd, mcpServers: []}; list from result.configOptions entry with category "model" (.options[] value/name), else result.models.availableModels (modelId/name). Kill the child as soon as the response arrives.
- codex: `codex app-server` over stdio, JSON-RPC model/list → result.data[] (id, name, capabilities.reasoningEffort as efforts). Kill the child afterwards.
Timeouts: CLI 20 s, ACP/app-server 30 s; on timeout kill the process tree and fall back as above.
Cache: one JSON file per harness and command under bh's data folder (use the helper bh already uses for its data; report which), reused for 24 h; --refresh bypasses and rewrites it. "cached" says which happened.

WHAT ELSE
- Pure parsers per method (parseOmp, parsePi, parseOpencode, parseAgy, parseAcpSession, parseCodexModelList), each tested against the fixture samples, plus the fallback shape when a parser gets garbage.
- No new dependencies. Do not commit.

DONE WHEN
- On this machine: `bh models omp --json`, `bh models opencode --json`, `bh models antigravity --json` return source "harness" with non-empty models (paste the counts and first two entries of each); `bh models claude --json` returns builtin; a harness not installed here (e.g. qwen) returns builtin/empty with an error and exit 0; a second call reports cached true; --refresh reports cached false.
- `node --test test/models.test.mjs` passes; `bh check` and `npm test` pass.
- No harness process is left running (check the process list after your runs).

IF STUCK
Stop that part, finish the rest, and report it. Never invent a command Research did not give.
