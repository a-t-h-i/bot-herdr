# Dev fix — QA findings on repo history (t-20261113-pwha)

## Summary
All three major findings fixed in `workspace.mjs`: history rules match any of the four variants, the flip commits only `.bot-herdr`/`.gitignore` and never the user's index, and it works with no `.gitignore` or a bare `.bot-herdr` rule. Three regression tests added; full suite passes.

## Changes
- `mods/bot-herdr/engine/lib/workspace.mjs`
  - `HISTORY_LINES` set (`.bot-herdr`, `.bot-herdr/`, `/.bot-herdr`, `/.bot-herdr/`) used for the presence check and for removal; the line added stays `.bot-herdr/`.
  - `runGit(cwd, args, env?)` — optional environment overlay (used only for `GIT_INDEX_FILE`).
  - `commitHistory` — commits through a temporary index seeded from `HEAD` (`read-tree HEAD`, or `read-tree --empty` for a repo with no commit), applies the same add/rm to it, checks `diff --cached` on the scoped index for the nothing-to-do notes, then `commit`. The real index is untouched during the commit; after it, `git reset -q -- .bot-herdr .gitignore` syncs only those two paths to the new `HEAD`. Temp index and `.lock` removed in `finally`. Push logic unchanged.
  - `trackHistory` — `git add -f -- .bot-herdr :(exclude).bot-herdr/worktrees`, plus `.gitignore` only when it exists; `nothing to track` when `.bot-herdr` is absent and no rule was removed.
  - `untrackHistory` — `git rm -r --cached` only when tracked files exist, `git add .gitignore` only when it exists; its commit is scoped by `commitHistory`.
- `test/repo-history.test.mjs` — `fresh()` helper (`.bot-herdr` untracked, no `.gitignore`) and three tests: no-`.gitignore` on tracks; bare-`.bot-herdr`-rule on removes the rule and tracks; staged `wip.txt` before off stays staged and out of the flip commit.

## Brief Check
- Three new tests plus existing suite pass — met: `bh check` PASS, 37 pass, 1 pre-existing skip (38 total, +3 tests).
- QA's repros rerun by hand in throwaway tmp repos — met: no-`.gitignore` on (tracks `.bot-herdr`, `repoHistoryError: null`, 1 commit); bare-rule on (rule removed from `.gitignore`, `.bot-herdr` tracked, no error); staged `wip.txt` off (HEAD holds only `.bot-herdr/tasks/x.json` + `.gitignore`, `wip.txt` still staged, `.bot-herdr` untracked).
- `node --check mods/bot-herdr/engine/lib/workspace.mjs` — met: clean.

## Verification
- `node --check mods/bot-herdr/engine/lib/workspace.mjs` — clean.
- `node --test test/repo-history.test.mjs` — 6/6 pass.
- `bh check` — PASS (37 pass, 1 skip, lint/typecheck pass).
- Manual repo: no `.gitignore`, `.bot-herdr` untracked, on — `repoHistoryError: null`, `.bot-herdr/tasks/x.json` tracked, commits 1→2.
- Manual repo: `.gitignore` = `node_modules` + bare `.bot-herdr`, on — rule removed, `.bot-herdr` tracked, error null.
- Manual repo: `wip.txt` staged, off — commit files only `.bot-herdr/tasks/x.json` and `.gitignore`; `git diff --cached --name-only` = `wip.txt`; `.bot-herdr` untracked.
- Manual repo: tracked `.bot-herdr`, no `.gitignore`, on — `already tracked`, no commit (idempotent path).
- Manual repo: `.bot-herdr/worktrees/task-x` present, on — only `.bot-herdr/tasks/x.json` tracked, no `160000` gitlink.
- Manual repo: bare remote with upstream, off — `committed and pushed`, remote at 2 commits; no upstream — `committed; push failed: The current branch master has no upstream branch.`
- Manual repo: no commits yet, off — first commit holds `.gitignore`, status clean.
- Non-git folder and query isolation unchanged (covered by the suite; `applyRepoHistory` is still only in the person patch branch).

## Pushback
**Request:** the brief's step 2 command, `git commit -q -m <msg> --only -- .bot-herdr .gitignore`, cannot implement the off direction.
**Reason:** `--only` (and a bare pathspec after `--`) commits the *working-tree* content of the named paths. `.bot-herdr` was removed from the index by `git rm --cached` but still exists on disk, so the partial commit re-adds and re-commits it. Verbatim repro in a tmp repo:
`git rm -r -q --cached -- .bot-herdr && git add .gitignore && git commit -q -m off --only -- .bot-herdr .gitignore` → `git ls-tree HEAD` still lists `.bot-herdr/tasks/x.json` and `git ls-files -- .bot-herdr` shows it tracked. The same happens with `-- .gitignore` alone, and with pathspec `.bot-herdr` excluded. So off would stop untracking anything, breaking QA's contract and the existing test.
**Alternative (implemented):** same "only our paths" guarantee with a temporary index — `GIT_INDEX_FILE=<tmp> git read-tree HEAD`, apply the same `add`/`rm`, `git commit -m <msg>`, then `git reset -q -- .bot-herdr .gitignore` on the real index. Deletions are recorded, the user's staged entries are neither committed nor modified. Additions still use `-f` and `:(exclude).bot-herdr/worktrees` as briefed.

## Knowledge Proposals
- `git commit --only -- <path>` (same as a pathspec after `--`) re-adds the working-tree content of paths that still exist on disk, so it cannot record an index deletion; scope a commit with a `GIT_INDEX_FILE` seeded by `read-tree HEAD` instead.

## Script Proposals
None.

## Blockers
None.
