# Dev brief — step 1 (engine): repo-history setting in `bh access`, git convergence in workspace.mjs, tests

## Goal
Step 1 of task t-20261113-pwha. One global setting "repo history": when on (the default), `.bot-herdr/` data is committed and pushed to git as today; when off, it is excluded via `.gitignore` and untracked. The engine owns the setting and the git work; the Settings UI (Design, step 2) only reads and patches `bh access`.

Read the shared contract first: `.bot-herdr/tasks/t-20261113-pwha/briefs/contract.md`. It is authoritative for names, shapes and messages.

## Files
- `mods/bot-herdr/engine/lib/core.mjs` — `accessOf()` (:22-31): add `repoHistory`.
- `mods/bot-herdr/engine/lib/workspace.mjs` — new exported `applyRepoHistory({ root, on, git = runGit })` beside the existing git helpers (it already has `runGit` :17, `createWorkspace` :90).
- `mods/bot-herdr/engine/bh.mjs` — the `case "access"` block (:617-643) and its help/usage strings (find the `bh access` line in the help text too).
- `test/repo-history.test.mjs` — new.
- Leave alone: everything else, including `mods/bot-herdr/settings.js` (Design owns it).

## What to do
1. `accessOf()`: add `repoHistory: saved.repoHistory !== false`.
2. `applyRepoHistory({ root, on, git = runGit })` in workspace.mjs, following the file's existing style (short functions, one readable error line, `git` injectable for tests):
   - Resolve the repo top with `git(cwd, ["rev-parse", "--show-toplevel"])`; failure → `{ repo: false, note: "not a git repository" }` (no throw).
   - off: ensure an exact `.bot-herdr/` line in `<top>/.gitignore` (create the file if missing; append on its own line). If `git(top, ["ls-files", "--", ".bot-herdr"])` is non-empty: `git rm -r -q --cached -- .bot-herdr`, `git add .gitignore`, commit `Keep bot-herdr's repo history out of git` (`--no-verify` not needed; plain `-m`). Only the gitignore changed → still commit it (same message). Nothing changed and nothing tracked → note `already excluded`, no commit.
   - on: remove exact `.bot-herdr/` lines from `<top>/.gitignore` (keep the file even if it becomes empty), `git add .bot-herdr .gitignore`, commit `Track bot-herdr's repo history in git`. No entry and nothing to add → note `already tracked`, no commit.
   - After a commit, if `git(top, ["remote"])` is non-empty, try `git(top, ["push"])`; on failure keep going with a note (do not throw).
   - Return `{ repo: true, on, committed: sha | null, pushed: boolean, note: string, error: null }`, or `{ ..., error: "<one line>" }` when git itself failed (caught, not thrown past).
3. `bh.mjs` access case:
   - Accept `--repo-history on|off` (`if (typeof flags["repo-history"] === "string") patch.repoHistory = flags["repo-history"] === "on"`; anything but on/off → UsageError).
   - In the patch block: `if (typeof patch.repoHistory === "boolean") next.repoHistory = patch.repoHistory;` (a non-boolean in --data → UsageError).
   - After `writeJson`, if the patch set repoHistory: `const applied = applyRepoHistory({ root, on: next.repoHistory });` and merge `repoHistoryNote: applied.note` and `repoHistoryError: applied.error` into the returned object (only then).
   - Extend the UsageError at :624 and the `bh access` help line with `--repo-history on|off`.
   - `applyRepoHistory` may push: it runs only on an explicit person patch, never on a query.
4. Tests `test/repo-history.test.mjs`, modelled on `test/plans-page.test.mjs` (spawnSync `node bh.mjs` with `BH_APP_HOME` in a tmp dir; act as the person with `HC_TERMINAL_ID: "t1"`; keep `PATH` so git runs):
   - fresh app home → `access --json` shows `repoHistory: true`.
   - tmp git repo (set `user.name`/`user.email` locally) with `.bot-herdr/tasks/x.json` committed: `--repo-history off` → config false, `.gitignore` holds `.bot-herdr/`, `git ls-files -- .bot-herdr` empty, one new commit, output `repoHistoryNote` present; `--repo-history off` again → no new commit (idempotent).
   - `--repo-history on` → entry gone from `.gitignore`, `.bot-herdr` tracked again.
   - plain folder (no git) → exit 0, `repoHistoryNote: "not a git repository"`.
   - `BH_AGENT: "1"` (unset HC_TERMINAL_ID) → the patch is refused.
   - No remote configured in the tmp repos → `pushed: false` path exercised implicitly; do not test push itself.

## Constraints
No new dependencies. No changes outside the four files above. Existing command output shapes keep their fields (add, don't rename). Follow the repo's comment style (a doc comment above each export).

## Done when
- `node --test test/repo-history.test.mjs` passes and the whole `node --test test/` suite still passes.
- The manual sequence from the tests verified once by hand in a throwaway tmp git repo (not this repo): off → untracked + gitignore entry + one commit; on → tracked again + entry gone.
- `node --check` clean on the three engine files.

## If stuck
If the contract and the code disagree (e.g. `root` is not what the access case can pass), stop that part, finish the rest, and report the mismatch.
