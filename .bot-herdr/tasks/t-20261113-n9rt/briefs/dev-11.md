Steps 7-10 are committed (6227e3f); a QA gate (round 2) is reviewing them now and any fix comes back to you later. Next: step 11 of task t-20261113-n9rt: each writing child works in its own git worktree. Same rules: engine and tests only, withLock/updateTask for every task write, do not commit. Record the report with `node mods/bot-herdr/engine/bh.mjs report t-20261113-n9rt --step 11 --file .bot-herdr/tasks/t-20261113-n9rt/reports/dev-worktree.md "<summary>"`, then `hc send` me one line.

## Goal
Two writing agents of one task can never collide on files. Each gets its own checkout; its work comes back to the task's tree only through `bh merge`, which I (the Orchestrator) run after checking the work. The user chose this ("Worktree per child").

## Files
`mods/bot-herdr/engine/lib/workspace.mjs` (worktrees: `createWorkspace`, `taskCwd`, `worktreesRoot`, `excludeWorktrees`), `bh.mjs` (`spawn`, `check`, `classify qa-risk`, new `merge`), `lib/tasks.mjs`, `lib/team.mjs` (brief lines), tests in a new `test/worktree.test.mjs`. Not the UI, not roles (step 22).

## What to do
1. Who gets a worktree: `bh spawn <agent> --task <id>` for an agent whose roster entry has `edits: true` (roster.js), unless `--review` or `--panel` is given or `--shared` is passed (a new flag that opts out). Scout, Research, panel seats and QA reviews stay in the task's tree.
2. Create it from the task's tree (`W.taskCwd(task, root)`) at its current `HEAD`: path `.bot-herdr/worktrees/<task-id>-<name>` (short, for Windows path length), branch `<task.git.branch>-<name>` when the task has a branch, else `bh/<task-id>-<name>`. Reuse `excludeWorktrees` so the worktree stays out of `git add -A`. The child's `hc run --cwd` is that path.
3. Record it under `updateTask`: `task.children = [...(task.children ?? []), { name, agent, step, branch, path, base: <HEAD sha>, state: "open", at }]`. `bh spawn` prints `<name> works in its own worktree <path> (branch <branch>); merge it with bh merge <name> --task <id>`. Without git (not a repo, or no commit yet) the child shares the task's tree as today and `bh spawn` says so in one line.
4. Inside a child's worktree, `store()` already maps to the main checkout (step 8), so the board, reports and receipts land in the one task. `bh check` and `bh classify qa-risk` run in the current directory when it is a worktree recorded in `task.children` (the child checking its own work), with `base` = that child's `base`; otherwise in `W.taskCwd(task, root)` as now.
5. `bh merge <name> --task <id> [--drop]`:
   - `--drop`: remove the worktree (`git worktree remove --force`) and delete the branch; state `dropped`.
   - otherwise: in the child's worktree `git add -A` and commit `"<name>: step <step>"` with `-c user.name="bot-herdr" -c user.email="bot-herdr@localhost"` when it has changes (nothing to commit → say so and stop, state stays open). Then, in the task's tree, refuse with the file names and change nothing when (a) a file the child changed has uncommitted changes in the task's tree (`git status --porcelain` ∩ `git diff --name-only <base>..<branch>`), or (b) `git merge-tree --write-tree HEAD <branch>` reports conflicts. Otherwise `git merge --squash <branch>`: the child's changes land in the task's tree staged, uncommitted (I review and commit them as today). Record `stat: { files, added, removed }` from `git diff --shortstat <base>..<branch>` on the child entry, state `merged`, `mergedAt`; post a board `done` entry `Merged <name>: <files> files, +<added> −<removed>` with `step`. Remove the worktree and delete the branch.
   - Prints the stat line or the refusal.
6. The next writing child of a domain starts only after the previous one is merged: `bh spawn` refuses a second open worktree for the same agent on the same task (`<agent> already has an open worktree <name>: merge or drop it first`).
7. `team.mjs`: a child brief in a worktree says: `You work in your own git worktree <path> on branch <branch>. Do not commit; the Orchestrator merges your work with bh merge.`

## Contracts
- `task.children[]` entries `{ name, agent, step, branch, path, base, state: "open"|"merged"|"dropped", at, mergedAt?, stat?: { files, added, removed } }`. Step 14 and the tracker read `stat` for a step's "+added −removed".

## Done when (tests in test/worktree.test.mjs, each on a temporary git repo; use the BH_HC stand-in to capture `hc run --cwd`)
- A Dev spawn on a task gets a worktree at `.bot-herdr/worktrees/<task>-<name>` on its branch, the `--cwd` is that path, `task.children` holds the entry; a Scout spawn and a `--review` spawn get the task's tree.
- A file changed in the worktree reaches the task's tree as a staged change after `bh merge`; the worktree and branch are gone; `stat` is recorded and the board has the Merged entry.
- An uncommitted edit to the same file in the task's tree makes `bh merge` refuse, name the file, and leave both trees unchanged; so does a committed conflicting change (merge-tree).
- `bh merge --drop` removes the worktree and branch; a second open Dev worktree on the same task is refused.
- `bh check` run inside the child's worktree checks that worktree's change against its `base`.
- Full suite passes; `bh check` PASS.

## If stuck
If `git worktree add` fails on a long Windows path, or the stand-in cannot show the cwd, stop that part, finish the rest and report it under Blockers with the exact error.
