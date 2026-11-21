# dev: what I know about this project

## Facts
- bh --data is URI-encoded (decodeURIComponent in bodyText), not base64
- bh files <path> [--all] --json lists one folder (no recursion) on this machine; it is the composer's only listing path (engine/lib/files.mjs listFolder).
- bh models <harness> [--command exe] [--refresh] --json asks the installed harness for its models (omp models --json, opencode models, agy models, pi --list-models, ACP session/new for gemini/qwen, codex app-server model/list); Claude Code cannot list models, so it is answered from models.js. Cached 24 h under data/bot-herdr/models.
- Repo-history flips commit through a temp GIT_INDEX_FILE seeded from HEAD (workspace.mjs commitHistory): decide from HEAD, never the real index, and refuse mid-merge, since the temp index bypasses git's unmerged guard.
- On Windows a lock file made with openSync(path, "wx") can throw EPERM (not EEXIST) while another unlink is pending: treat EPERM/EACCES as held and retry.
- Per-launch skill/MCP limits: Claude Code --settings '{"permissions":{"deny":["Skill(skill:x)","mcp__srv"]}}'; Codex -c mcp_servers.<id>.enabled=false (no per-launch skill switch); OpenCode has none confirmed, so brief only.
- Claude Code installed plugin skills are under ~/.claude/plugins/**/skills, but plugins/marketplaces holds catalogues, not installs; claude.ai-synced skills sit at ~/.claude/skills/synced/<id>/<skill>/SKILL.md.
- Verified live 2026-11-18 (Claude Code 2.1.322): a --settings deny rule Skill(skill:docx) blocks the claude.ai-synced skill anthropic-skills:docx, so the bare synced name works in deny rules.
- Headless Claude Code compacts a saved session with: claude -p "/compact" --resume <session-id> --output-format stream-json --verbose (verified on 2.1.328); success prints a system event with subtype compact_boundary, and the session id is unchanged.
- Bundled binaries (rg, fd, ast-grep) cache under appHome/cache/bot-herdr-bin/ and install to engine/bin/ via install.mjs; BH_BIN_DIR overrides it for tests.
- Retrieval tiers in engine/scripts/lib/common.mjs: files fd -> rg --files -> git ls-files -> Node; search rg -> git grep --untracked -> Node; .bot-herdr/ excluded unless includeMeta.
- Reply logs (DATA/replies/<key>.jsonl) are the single append-only chat event log ({id,at,kind,name,space,text}); kind:'asked' clears waits without a bubble; logReply trims atomically only past REPLY_LOG_MAX.
- Claude Code headless can exit 0 with a single-line synthetic quota message (anthropics/claude-code#79500); classify only whole-line anchored matches <=220 chars, never prose.
- runner.turn() must refresh the live Acp instance agent each turn, and resumeState() resets state.harness to the roster harness so fallback reuse checks state.sessions[harness].

## Standards
- team.hc never runs hc through a shell (a brief is one argument); tests stand in for hc with a script named by BH_HC
- Store writes: task read-modify-write goes through updateTask(root, id, change) and board posts compute n inside withLock; never loadTask + saveTask in a command.
- A child's report contract (report path, bh report, hc send to the parent) lives once, in the brief's ## Reporting (team.mjs), not in bh spawn's spawn text: bh brief and agents started straight in a terminal have no spawn text.
- Windows-only path probes use path.win32.join; path.join gives / off Windows and breaks them (engine/lib/media.mjs windowsBrowser).
- A PATH sg is accepted as ast-grep only when sg --version matches /^ast-grep/i, avoiding Linux shadow-utils /usr/bin/sg.
- Node 18.20+/20.12+/22+ refuse .cmd/.bat via execFileSync without a shell (CVE-2024-27980): use resolveLocalBin in common.mjs to run JS bins via process.execPath instead of npx.cmd.

## Decisions
- Agent conversation state files under DATA keep their names; a root field in the state resets the session when the project changes (resumeState), so pre-change sessions survive.

## History
