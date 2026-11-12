# dev: what I know about this project

## Facts
- bh --data is URI-encoded (decodeURIComponent in bodyText), not base64
- bh files <path> [--all] --json lists one folder (no recursion) on this machine; it is the composer's only listing path (engine/lib/files.mjs listFolder).
- bh models <harness> [--command exe] [--refresh] --json asks the installed harness for its models (omp models --json, opencode models, agy models, pi --list-models, ACP session/new for gemini/qwen, codex app-server model/list); Claude Code cannot list models, so it is answered from models.js. Cached 24 h under data/bot-herdr/models.

## Standards
- team.hc never runs hc through a shell (a brief is one argument); tests stand in for hc with a script named by BH_HC

## Decisions

## History
