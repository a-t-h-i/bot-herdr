# Step 11: one worktree per writing child

## Summary
A child that writes (Dev, Design, QA on a step) now gets its own checkout at `.bot-herdr/worktrees/<task>-<name>` on its own branch, and its work reaches the task's tree only through `bh merge`, which stages it uncommitted after checking that the task's tree is clean for those files and that the merge is conflict-free. Readers, panel seats and reviews still work in the task's tree; a second open worktree for the same agent is refused, and `--drop` throws one away.
Six tests in `test/worktree.test.mjs` cover the spawn, the merge, both refusals, the drop/refusal rule and `bh check` inside a child's worktree; full suite 229 pass / 1 pre-existing skip; `bh check` PASS.

## Changes
- `mods/bot-herdr/engine/lib/workspace.mjs`:
  - `worktreesRoot(root)` maps a task worktree back to the project it came from, so a child's worktree always lands under the main checkout's `.bot-herdr/worktrees/`.
  - `createChildWorktree({ task, name, cwd, root })`: new worktree at `worktreesRoot(root)/<task-id>-<name>` on branch `<task.git.branch>-<name>` (else `bh/<task-id>-<name>`) from the task tree's HEAD; reuses `excludeWorktrees`; returns `{ path, branch, base }`, or one line when there is no repo/commit or the branch is taken.
  - `childWorktree(task, cwd)`: the recorded child whose path is `cwd` (case-insensitive), or null.
  - `mergeChild({ child, cwd })`: commits the child's work (`git add -A`, `-c user.name=bot-herdr -c user.email=bot-herdr@localhost`, message `<name>: step <n>`) when it has any; refuses with `{ refused }` when the task's tree already holds changes to a file the child changed (`git diff --name-only HEAD` + untracked, intersected with `git diff --name-only <base>..<branch>`) or when `git merge-tree --write-tree HEAD <branch>` conflicts; otherwise `git merge --squash <branch>` and `stat` from `git diff --shortstat <base>..<branch>`.
  - `removeChildWorktree({ child, cwd })`: `git worktree remove --force` then `git branch -D`, a failure as one line.
- `mods/bot-herdr/engine/bh.mjs`:
  - `spawn`: an editing child (`mode === "child"`, `roleOf(role).edits`, no `--shared`) on a task gets the worktree, which becomes its `hc run --cwd`; the entry is recorded under `updateTask` as `{ name, agent, step, branch, path, base, state: "open", at }`; a second open worktree for the same agent throws `<agent> already has an open worktree <name>: merge or drop it first`; the result prints `<name> works in its own worktree <path> (branch <branch>); merge it with bh merge <name> --task <id>`, or the one line saying why it shares the task's tree. `team.brief` gets the worktree for the non-headless path.
  - New `bh merge <name> --task <id> [--drop]`: `--drop` removes the worktree and branch and records `state: "dropped"`; otherwise it merges, records `state: "merged"`, `mergedAt`, `stat`, posts the board `done` entry `Merged <name>: <files> files, +<added> −<removed>` with the step, then removes the worktree and branch. Refusals exit 1 and leave the task's tree untouched.
  - `check` and `classify qa-risk` use the current directory when it is one of the task's child worktrees (base = that child's `base`), else `W.taskCwd` as before.
- `mods/bot-herdr/engine/lib/team.mjs`: `brief` takes `worktree` and adds `## Your worktree` with the "do not commit; the Orchestrator merges your work with `bh merge …`" line.
- `mods/bot-herdr/engine/lib/agent.mjs`: `makeBrief` finds the task's open child entry by name, so a headless child's own brief names its worktree and branch.
- `test/worktree.test.mjs` (new): the six cases below.

## Brief Check
- A Dev spawn gets `.bot-herdr/worktrees/<task>-<name>` on its branch, `--cwd` is that path, `task.children` holds the entry; a Scout spawn and a `--review` spawn get the task's tree: met — "a writing child gets its own worktree; a scout and a review stay in the task's tree" (path, `bh/<task>-dev-1`, `base` = HEAD, `agent: "Dev"`, `state: "open"`, captured `--cwd` = the worktree; Scout and QA `--review` captured at the project root, `children.length` stays 1).
- A file changed in the worktree reaches the task's tree as a staged change after `bh merge`; the worktree and branch are gone; `stat` recorded and the board has the Merged entry: met — "bh merge stages the child's change…" (`git diff --cached --name-only` = `src/a.mjs`, `src/b.mjs`; worktree gone; `git branch --list` empty; `stat { files: 2, added: 2, removed: 1 }`; board `done` entry with step 1 and the stat wording).
- An uncommitted edit to the same file in the task's tree makes `bh merge` refuse, name the file and leave both trees unchanged; so does a committed conflicting change (merge-tree): met — both refusal tests (`Not merged: the task's tree has uncommitted changes to src/a.mjs`, task file still `a = 3`, worktree still there, state `open`; and `/conflicts/` with the task's committed `a = 9` untouched).
- `bh merge --drop` removes the worktree and branch; a second open Dev worktree on the same task is refused: met — "a second open worktree for the same agent is refused; --drop discards one" (`Dev already has an open worktree dev-1: merge or drop it first`, then `Dropped dev-1`, path and branch gone, `state: "dropped"`).
- `bh check` run inside the child's worktree checks that worktree's change against its `base`: met — "bh check inside a child's worktree…" (after a later commit in the task's tree, the check sees `Changed: 1 file(s)` and its receipt `base` equals the child's base).
- Full suite passes; `bh check` PASS: met — 230 tests, 229 pass, 1 pre-existing skip, 0 fail; `bh check` PASS.

## Verification
- `timeout 300 node --test test/worktree.test.mjs` — 6/6 pass.
- `timeout 300 node --test test/*.test.mjs` — 230 tests, 229 pass, 1 pre-existing skip, 0 fail.
- `timeout 300 node mods/bot-herdr/engine/bh.mjs check` — `Ran: 0 lint, 0 typecheck, 230 tests (full suite)` then `PASS: 230 tests pass; no lint or typecheck is set up`.

## Notes
- The "task's tree holds changes to those files" test uses `git diff --name-only HEAD` plus untracked files, not `git status --porcelain`: `runGit` trims the whole output, which eats porcelain's leading space and shifts every path by two characters (caught by the first run of the refusal test, where `src/a.mjs` came out as `rc/a.mjs`).
- `git merge-tree --write-tree` needs git 2.38 or newer; on an older git the call fails and the merge is refused rather than attempted, so nothing merges unchecked.
- A plain QA child (writing tests on a step) gets a worktree because QA's role has `edits: true`; a QA review or panel seat does not, because those modes are excluded.
- The child commits inside its worktree with the bot-herdr identity, then the task's tree gets a squash merge (staged, uncommitted) — the Orchestrator still reviews and commits, as before.
- `--shared` opts a writing child out of a worktree; `bh spawn` says nothing about isolation then.

## Gate 2 fixes
Five fixes from `qa-gate2.md`, all on top of step 11 (nothing else changed).

1. **`withLock` cannot lose an update under load any more** (`lib/core.mjs`). The stale-lock takeover is now guarded by a second exclusive file, `<lock>.takeover`: only the waiter holding it may inspect, rename and remove a stale lock, so two waiters can never rename each other's fresh lock (the lost step start QA saw). Inside the guard the lock's token is read, the lock renamed to a unique name, the renamed file's token compared with what was read — and a fresh lock renamed by mistake is renamed back and left alone — before it is removed. The guard's own file is removed on the way out, and a guard left by a killed cleaner is removed once it is older than the stale age, so it can never block forever. This is provably safe for the case QA found because the guard serialises the only mutation of the lock path: renames of a lock cannot interleave, and the token comparison is a second check behind it. Also: a failed token write after `openSync` now closes the descriptor and removes the half-made lock instead of leaving an empty lock behind; the holder's release reads the token (never removes another holder's lock) and retries the delete for up to 1 s on `EPERM`/`EBUSY`/`EACCES`, which is what Windows reports while a file is still open.
   - Stress tests: the 2×20 step-start flow looped 30 times (two child processes, 40 locked updates per round, all 40 steps active every round; 13 s), and 8 waiters on a pre-aged lock for 3 rounds doing a read-modify-write counter inside the lock (8/8 every round, no lock left behind), each writer exiting 0.
2. **The change hash names the commit** (`bh.mjs changeHash`): it now hashes HEAD's sha, `git diff HEAD --binary`, and each untracked file's path and content, so a clean tree at another commit never matches a receipt. Test: two commits in one repo, `bh check --json` at each, different `diff` and `head`.
3. **The verdict counts tests, not runs** (`bh.mjs verdictLine`, `scripts/lib/common.mjs testCounts`): `PASS: 223 tests pass, 1 skipped; no lint or typecheck is set up`; failures are named separately (`1 tests pass, 1 failed, 1 skipped`), never as "N tests fail". `run_changed_tests --json` now reports `counts: { total, pass, fail, skipped }`.
4. **No command is shown that did not run**: when the fallback runs, the targeted run's `$ node --test …` line is dropped from the report, so the output shows only the full suite it actually ran.
5. **Worktrees go through the store** (`lib/workspace.mjs`): `worktreesRoot(root)` is `store(root, "worktrees")`, so `createWorkspace` and `createChildWorktree` place a worktree under the main checkout even when the command runs inside a task's worktree — a worktree can never nest.

Also: the full-suite fallback now runs with `NODE_TEST_CONTEXT` cleared, so `bh check` itself run from inside a test runner starts the project's tests as their own run instead of node refusing to run them recursively.

Tests added by this round: the 30-round load test and the 3×8 stale-lock waiters in `test/store.test.mjs`; the two-commit hash test and the verdict-count verdict test (with the fallback's `$` line absent) in `test/verify.test.mjs`.

## Gate 2 verification
- `node --test test/store.test.mjs` — 9/9 pass, including both stress tests.
- `node --test test/verify.test.mjs` — 11/11 pass.
- `node --test test/*.test.mjs` five times in a row — all five pass: 0 fail, 1 pre-existing skip each (234 pass in the first run, 239 in the next four as Design's tests landed alongside).
- `node mods/bot-herdr/engine/bh.mjs check` — `Ran: 0 lint, 0 typecheck, 240 tests (full suite)` then `PASS: 239 tests pass, 1 skipped; no lint or typecheck is set up`.

## Knowledge Proposals
- A writing child of a task works in `.bot-herdr/worktrees/<task>-<name>` on its own branch; `bh merge` stages its work into the task's tree (squash, uncommitted) after a clash and conflict check, and only one worktree per agent may be open per task.
- A stale-lock takeover by rename alone is unsafe (two waiters can rename each other's fresh lock): guard it with its own O_EXCL mutex, or verify the identity of what was renamed; a receipt's change hash must include HEAD.
