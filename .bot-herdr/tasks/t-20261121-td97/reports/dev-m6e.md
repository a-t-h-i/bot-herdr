# dev-m6e — M6 engine (approvals, review comments, thread fork)

## Summary
Built the M6 engine half against `contract-m6.md`: three-choice approvals with ACP hold/watch and project allowlist, unified diff parsing and inline review comments routed to Dev, `bh thread fork` with `forkOf`/`forks` on `bh thread show`, M6 audit fixtures, CLI help, and unit/CLI tests. All checks (`bh check`, `tsc`, `npm test`, `herdr-app check`, `bh ui-audit --json`) passed cleanly.

## Changes
- `mods/bot-herdr/engine/lib/approvals.mjs` — replaced placeholders with `.bot-herdr/approvals/<id>.json` store (shared across worktrees via `store()`), `projectAllow(root)` / `addProjectAllow(root, cmd)` backed by `.bot-herdr/config.json` (`agents.allow`), `listHeld(root)` (live pids only, oldest first, corrupt files skipped), `answerApproval(root, id, choice)`, `maybeHoldPermission` (holds under `ask`/`guarded` when `access !== "full"`, watches with `fs.watchFile` at 500 ms, unwatches on answer or exit, maps `once`→`allow_once`, `project`→`allow_always` fallback `allow_once`, `deny`→`reject_once` + `Refused` tool line), and `bh approvals list|answer`.
- `mods/bot-herdr/engine/lib/runner.mjs` (lines 27-28, 648-663) — merged `projectAllow(root)` into `acpAllowed` and passed `root` (`projectRoot(this.cwd)`) and `this.agent` into `maybeHoldPermission`; kept existing try/catch fall-through to reject.
- `mods/bot-herdr/engine/lib/review-comments.mjs` — replaced placeholder with `parseUnifiedDiff` (add/del/ctx with old/new line numbers, 2000-line truncation cap), `diffFile` (reusing `taskBase` from `thread.mjs`), `.bot-herdr/tasks/<task>/review.json` CRUD (`listComments`, `addComment`, `removeComment`), `sendComments` (posts one board `note` from `user` to `dev` via `T.post` and marks comments `sent`), and `bh review diff|list|add|remove|send`.
- `mods/bot-herdr/engine/lib/tasks.mjs` (lines 231-241) — accepted and persisted optional `forkOf` in `newTask`.
- `mods/bot-herdr/engine/lib/thread.mjs` — exported `taskBase(root, task)` (reused by `changesOf` and `review-comments.mjs`), added `forkThread` and `bh thread fork <id> "<what to carry>" [--title T] [--json]`, and added `forkOf` and `forks` to `bh thread show`.
- `mods/bot-herdr/engine/lib/ui-audit-fixtures.mjs` — added one pending approval (`APPROVAL_ONE`, live `process.pid`, matching `HOME.needsYou` ref), a 2-file diff (`REVIEW_DIFFS`) with 2 open review comments (`REVIEW_COMMENTS`), one child (`dev-m1`), and one fork (`t-20261121-9010`) on `THREAD_SHOW`.
- `mods/bot-herdr/engine/bh.mjs` (lines 77-84) — added help lines for `bh thread fork`, `bh approvals list|answer`, and `bh review diff|list|add|remove|send`.
- `test/approvals.test.mjs`, `test/review-comments.test.mjs`, `test/thread-fork.test.mjs` — new unit and CLI tests covering every item in the brief.
- `test/pre-m1-foundation.test.mjs` — updated obsolete pre-M1 placeholder assertions (following M1 and M4 precedent): `bh approvals` and `bh review` no longer output `not implemented yet`, and `maybeHoldPermission` now holds under default `guarded` autonomy rather than returning `{ handled: false }` unconditionally; replaced with assertions verifying `bh approvals list --json` returns `{ approvals: [] }` and `maybeHoldPermission` returns `{ handled: false }` under `autonomous` and `full` access.
- `test/headless.test.mjs` (lines 256-269) — the pre-M6 test `bh agent: an ACP agent is refused a command outside standard access` ran without a `config.json` (defaulting to `guarded` autonomy) and expected an immediate reject; because M6 holds refused ACP calls under `guarded`, that test now sets `resilience.autonomy = "autonomous"` (restored in `finally`) to exercise the immediate-reject path.

## Contract Runs
Verified live in an isolated temp git project via `node mods/bot-herdr/engine/bh.mjs`:

```json
// bh approvals list --json (exit 0)
{ "approvals": [{ "id": "ap-1234abcd", "task": "t-20261122-1ebj", "agent": "dev", "from": "dev-m6e", "title": "Run a command", "command": "npm publish", "kind": "execute", "at": 1795360870215, "pid": 28404, "status": "pending", "answer": null, "answeredAt": null }] }

// bh approvals answer ap-1234abcd project --json (exit 0)
{ "id": "ap-1234abcd", "answer": "project", "ok": true }

// bh approvals answer ap-1234abcd once --json (exit 1 — already answered)
{ "ok": false, "error": "Approval ap-1234abcd was already answered." }

// bh review diff t-20261122-1ebj sample.js --json (exit 0)
{ "path": "sample.js", "truncated": false, "hunks": [{ "header": "@@ -1,2 +1,3 @@", "lines": [{ "kind": "ctx", "old": 1, "new": 1, "text": "const x = 1;" }, { "kind": "del", "old": 2, "new": null, "text": "const y = 2;" }, { "kind": "add", "old": null, "new": 2, "text": "const y = 20;" }, { "kind": "add", "old": null, "new": 3, "text": "const z = 30;" }] }] }

// bh review add t-20261122-1ebj sample.js 2 "Use a named constant here" --json (exit 0)
{ "id": "rc-537850d7", "at": 1795360871817, "path": "sample.js", "line": 2, "text": "Use a named constant here", "state": "open" }

// bh review list t-20261122-1ebj --json (exit 0)
{ "comments": [{ "id": "rc-537850d7", "at": 1795360871817, "path": "sample.js", "line": 2, "text": "Use a named constant here", "state": "open" }, { "id": "rc-631d93cd", "at": 1795360872364, "path": "sample.js", "line": 3, "text": "Temporary comment", "state": "open" }] }

// bh review remove t-20261122-1ebj rc-631d93cd --json (exit 0)
{ "ok": true }

// bh review send t-20261122-1ebj --json (exit 0)
{ "sent": 1, "entry": 1 }

// bh thread fork t-20261122-1ebj "Carry the diff parser design" --title "Forked demo" --json (exit 0)
{ "id": "t-20261122-na9r", "forkOf": "t-20261122-1ebj" }

// bh thread show t-20261122-1ebj --json (forkOf & forks)
{ "id": "t-20261122-1ebj", "forkOf": null, "forks": [{ "id": "t-20261122-na9r", "title": "Forked demo", "state": "working" }] }

// bh thread show t-20261122-na9r --json (forkOf & forks)
{ "id": "t-20261122-na9r", "forkOf": "t-20261122-1ebj", "forks": [] }
```

## Brief Check
- Every command in the contract answers with the contract's JSON — **met** (all 9 commands verified live above and in unit/CLI tests).
- `node mods/bot-herdr/engine/bh.mjs check` PASS — **met** (exit 0, 384/384 targeted tests pass).
- `/home/athi/bot-herdr/node_modules/.bin/tsc --noEmit -p mods/bot-herdr/jsconfig.json` — **met** (exit 0, 0 errors).
- `npm test` exit 0 — **met** (681 tests: 680 pass, 0 fail, 1 pre-existing skip).
- `/home/athi/.local/bin/herdr-app check mods/bot-herdr` passes (regenerated `mods/bot-herdr/engine/lib/gpui-kit.d.ts` deleted) — **met** (exit 0).
- `BH_APP_HOME=<temp> node mods/bot-herdr/engine/bh.mjs ui-audit --json` exit 0 with no new render errors — **met** (exit 0, `renderErrors: {}`, all 16 themes contrast-clean, all Fix counters at target; only the 3 UI features built by `dev-m6u` remain absent on this branch).
- No commits made, `bh goal verify` not run, no UI `.js` or protected files touched — **met**.

## Verification
- `node mods/bot-herdr/engine/bh.mjs check` — PASS (exit 0, 384/384 targeted tests)
- `/home/athi/bot-herdr/node_modules/.bin/tsc --noEmit -p mods/bot-herdr/jsconfig.json` — PASS (exit 0)
- `npm test` — PASS (exit 0, 680 pass, 0 fail, 1 skip)
- `/home/athi/.local/bin/herdr-app check mods/bot-herdr` — PASS (exit 0; deleted regenerated `mods/bot-herdr/engine/lib/gpui-kit.d.ts`)
- `env BH_APP_HOME=/tmp/bh-audit-m6e node mods/bot-herdr/engine/bh.mjs ui-audit --json` — PASS (exit 0, `renderErrors: {}`, 0 contrast/fix regressions)

## Knowledge Proposals
- Because `RESILIENCE_DEFAULTS.autonomy` is `"guarded"` and M6 holds refused ACP permissions in `ask`/`guarded` modes, any headless test asserting immediate ACP refusal without answering an approval card must explicitly configure `resilience.autonomy = "autonomous"`.
- Unified diff parsing should not run `git diff` through `workspace.mjs`'s `runGit()`, because `runGit()` trims stdout and strips trailing blank context lines (`" "`) and uses Node's default 1 MB `maxBuffer`.
