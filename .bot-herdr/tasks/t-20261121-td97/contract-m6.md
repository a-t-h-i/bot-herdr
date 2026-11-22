# M6 contract (engine ↔ UI)

Shared by dev-m6e (engine) and dev-m6u (UI). Both code against exactly this. Every command takes `--json` and then prints exactly the JSON shown.

## Approvals (`mods/bot-herdr/engine/lib/approvals.mjs`)
Store: one file per held call, `.bot-herdr/approvals/<id>.json` under the **project root** (the same root `bh task`/`bh board` use, so a hold written by an agent in a task worktree is listed from the main checkout).

Record:
```json
{ "id": "ap-<8 chars>", "task": "t-…|null", "agent": "dev", "from": "dev-m6e", "title": "Run a command",
  "command": "npm publish", "kind": "execute", "at": 1795357337611, "pid": 12345,
  "status": "pending|answered", "answer": null, "answeredAt": null }
```
`answer` is one of `"once" | "project" | "deny"`.

- `bh approvals list --json` → `{ "approvals": [<record>…] }`: pending records whose `pid` is still alive, oldest first.
- `bh approvals answer <id> once|project|deny --json` → `{ "id", "answer", "ok": true }`. `project` also appends `command` to the project allowlist. Unknown or already answered id: exit 1, `{ "ok": false, "error": "<plain sentence>" }`.
- Project allowlist: `.bot-herdr/config.json` → `{ "agents": { "allow": ["<exact command>", …] } }`. Exported `projectAllow(root)` returns that array (empty when missing or corrupt).
- Exported `listHeld(root)` returns the same array as `list` (home.mjs:64-81 already calls it; the Home row kind is `approval`, `ref` = record id).

Hold behaviour (runner.mjs:642-668): when a call is refused, access is not `full`, and the Resilience autonomy is `ask` or `guarded`, `maybeHoldPermission` writes the record, does not answer, and watches the file; on `once` it answers `allow_once`, on `project` `allow_always` (falls back to `allow_once`), on `deny` `reject_once`. Under `autonomous` it returns `{ handled: false }` (today's reject). The runner's `allow` list becomes `[...this.allow, ...projectAllow(root)]`.

## Review comments (`mods/bot-herdr/engine/lib/review-comments.mjs`)
Store: `.bot-herdr/tasks/<task>/review.json` → `{ "comments": [<comment>…] }`.

Comment: `{ "id": "rc-<8 chars>", "at": <ms>, "path": "mods/x.js", "line": 42, "text": "…", "state": "open|sent" }` (`line` = new-side line number).

- `bh review diff <task> <path> --json` → `{ "path", "truncated": false, "hunks": [{ "header": "@@ -1,4 +1,5 @@", "lines": [{ "kind": "add|del|ctx", "old": 3|null, "new": 4|null, "text": "…" }] }] }`. Same base commit as `changesOf` (thread.mjs:435-463); at most 2000 lines, then `truncated: true`.
- `bh review list <task> --json` → `{ "comments": [...] }`, oldest first.
- `bh review add <task> <path> <line> "<text>" --json` → the new comment.
- `bh review remove <task> <id> --json` → `{ "ok": true }`.
- `bh review send <task> --json` → posts one board entry kind `note`, from `user`, to `dev`, text `Review comments:\n- <path>:<line> — <text>` (one line per open comment), marks them `sent`, returns `{ "sent": <n>, "entry": <board entry number> }`. No open comments: `{ "sent": 0, "entry": null }`.

## Fork and thread map (`mods/bot-herdr/engine/lib/thread.mjs`)
- `bh thread fork <id> "<what to carry>" [--title T] --json` → creates a task (the same create path as `bh task new`) whose request is `<what to carry>` + a blank line + `Forked from <id>: <parent title>.`; the new task stores `forkOf: <id>`. Returns `{ "id": "<new id>", "forkOf": "<id>" }`.
- `bh thread show <id> --json` additionally returns `forkOf: "<id>"|null` and `forks: [{ "id", "title", "state" }]` (tasks whose `forkOf` is this id). `children` stays as today (thread.mjs:474-489).

## Queue and steer (no engine change)
The agent already queues prompts while busy (agent.mjs:801-831). The UI's **Steer** is `hc interrupt <agent>` then `hc send <agent> "<text>"`; **Queue** is a plain `hc send`.
