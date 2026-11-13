# QA gate round 2 — repo history setting (t-20261113-pwha)

## Summary
The three round-1 majors are fixed and verified (no `.gitignore`, bare ignore rule, whole-index commit), but the fix introduces a **critical data loss**: turning repo history off overwrites the user's `.gitignore` with only `.bot-herdr/` and commits it.
Verdict: **CHANGES_REQUIRED** — one critical, one major, three minors; repros below.

## Changes
No implementation changes by me. Reviewed fix diff: `engine/lib/workspace.mjs` only (`runGit` env arg; `setHistoryEntry`, `commitHistory`, `untrackHistory`, `trackHistory`, `applyRepoHistory`) plus 4 new tests in `test/repo-history.test.mjs`. `engine/bh.mjs`, `engine/lib/core.mjs`, `settings.js` unchanged since round 1.

Round-1 findings status:
- **[major] on fails without `.gitignore` — FIXED** (README-only commit, `.bot-herdr` untracked → `committed; no remote to push to`, 1 file tracked; already-tracked case → `already tracked`, no commit, no error).
- **[major] on fails with a bare `.bot-herdr` rule — FIXED** (`add -f`; error null, rule removed, `node_modules` kept).
- **[major] flip commits unrelated staged work — FIXED + tested**: staged `wip.txt` stays staged and out of the flip commit for both directions; `git show --name-only HEAD` lists only `.bot-herdr/*` and `.gitignore`.
- **[minor] nested worktree gitlink — FIXED**: `:(exclude).bot-herdr/worktrees` keeps a nested repo out; `ls-tree`/`ls-files` show no `160000` entry.
- **[minor] "on says already tracked when nothing to track" — FIXED** (`nothing to track`).
- **[minor] concurrent flips — still errors**, new message (`cannot lock ref 'HEAD'`); end state correct, no leftover `index.lock` or temp index.
- **[minor] Settings copy / note not surfaced — still open** (`settings.js:902`, untouched by the fix).
- Temp-index cleanup verified in the success and the failed-commit paths (0 leftovers).

## Brief Check
- `bh access` gains `repoHistory` (default true), `--repo-history on|off` / `--data {repoHistory:bool}`, person-only — **met** (`core.mjs:31`, `bh.mjs:629-653`; agent patch refused, test asserts it).
- off = `.gitignore` entry + `git rm -r --cached` + commit — **not met**: the `.gitignore` entry is written by destroying the rest of the file (critical finding 1), and the `rm` is skipped when the user staged the deletion themselves (major finding 2b).
- on = remove entry + `git add .bot-herdr` + commit — **met** (force-add, worktree exclusion, no `.gitignore` case all verified).
- One commit of only the removal/entry + `.gitignore` — **met** (temp index; unrelated staged work untouched and still staged).
- Push when a remote exists, failure tolerated — **met** (bare remote got the scoped commit; no-upstream path notes `push failed`).
- Non-git folder = note — **met** (`not a git repository`, exit 0, no error).
- Output adds `repoHistoryNote`/`repoHistoryError` only when an apply ran — **met** (a query has neither; a flip carries both).
- Full suite — **met**: `bh check` PASS, `repo-history.test.mjs` 6/6.

## Findings

### [critical] Turning repo history off overwrites `.gitignore`, discarding every other rule — `engine/lib/workspace.mjs:96`
`setHistoryEntry(file, true)` builds `next` as `${current && !current.endsWith("\n") ? "\n" : ""}${HISTORY_LINE}\n` — `current` is never included, so the file is replaced by only `.bot-herdr/`. It is committed and pushed like any flip.
Repro (throwaway repo, `.gitignore` = `node_modules\n.env\n*.log\n`, `.bot-herdr` tracked, `BH_APP_HOME` redirected): `bh access --repo-history off --json` → exit 0, `repoHistoryError: null`, note `committed; no remote to push to`; `.gitignore` worktree and HEAD are now `.bot-herdr/`; `git check-ignore node_modules` matches nothing; the commit `Keep bot-herdr's repo history out of git` deletes the three rules.
This is the first-use path: default is on, projects have ignore rules, the user clicks "Local only". Expected: the line is added after the existing content.
Fix direction: `next = want ? current + (current && !current.endsWith("\n") ? "\n" : "") + HISTORY_LINE + "\n" : …`.

### [major] A flip decides from the real index but acts on the HEAD-seeded index — `engine/lib/workspace.mjs:136-139`
`untrackHistory` reads `git ls-files -- .bot-herdr` from the user's index, then runs `git rm --cached` on the temp index (HEAD content). The two disagree whenever the user has staged `.bot-herdr` work.
- (a) User ran `git add -A` / `git add .bot-herdr` while HEAD did not track `.bot-herdr`, then flips off: `repoHistoryError: "pathspec '.bot-herdr' did not match any files"`, no commit, `.gitignore` already rewritten in the worktree (uncommitted), the staged `.bot-herdr` still staged, and the setting saved as off — the user's next commit still records `.bot-herdr` against the setting.
- (b) User deleted `.bot-herdr` and staged the deletion (`git rm -r .bot-herdr`), then flips off: note `committed; no remote to push to`, error null, but `HEAD` still tracks `.bot-herdr/tasks/x.json` and `git reset -- .bot-herdr` drops the staged deletion (status: `D .bot-herdr/tasks/x.json` unstaged). Off did not remove it from git.
Expected in both: off leaves `.bot-herdr` untracked at HEAD. Fix direction: run `ls-files` on the temp index (or always `rm -r --cached` and tolerate "did not match").

### [minor] A flip during a merge conflict commits a merge and drops the incoming side — `engine/lib/workspace.mjs:111-117`
`git commit` with `GIT_INDEX_FILE` seeded from `read-tree HEAD` does not see the unmerged real index, so git's "cannot commit because you have unmerged files" guard is bypassed.
Repro: branch conflict on `f.txt`, `bh` off flip → `repoHistoryError: null`, new HEAD `Keep bot-herdr's repo history out of git` **with two parents**, `MERGE_HEAD` gone, the real index still holds the three unmerged stages, and `f.txt` in the commit is HEAD's version (the side branch's change is dropped from the merge result). Before the fix the real-index `git commit` refused. Low likelihood (person action mid-merge), but silent.

### [minor] Concurrent flips still surface a raw git ref error — `engine/lib/workspace.mjs:117`
Two parallel `--repo-history off` (or `on`) flips: one `committed; no remote to push to`, the other `repoHistoryError: "cannot lock ref 'HEAD': is at <sha> but expected <sha>"`. End state converged, one commit, no stray `index.lock`, config last-writer-wins. No lock exists in the engine (pre-existing), person-only limits exposure; the message is unreadable to a user.

### [minor] Settings copy overpromises and the note never reaches the user — `settings.js:902` (round-1, still open)
Hint says `.bot-herdr/` is ignored and untracked "in every project" while convergence touches only the current project; `repoHistoryNote` is not shown, only `repoHistoryError`. Product decision, not a contract breach.

### [info]
- `read-tree HEAD` failures are all swallowed into `read-tree --empty` (`workspace.mjs:110-114`); a real read failure would commit a tree holding only `.bot-herdr`/`.gitignore`, deleting the rest of the repository from that commit.
- A `.gitignore` that held only the history rule is committed as `"\n"` after an on flip (cosmetic churn).
- The flip stages the whole worktree `.gitignore` (intended per contract), and `git reset -- .gitignore .bot-herdr` unstages anything the user had staged for those two paths; other staged files are preserved (verified).
- off in a repository with no commits creates its first commit (`.gitignore` only); on does the same (`.bot-herdr` only) — verified both.
- Without git installed the note says `not a git repository` (unchanged).

## Verification
- `node …/engine/bh.mjs check` — PASS (38 tests, 37 pass, 1 pre-existing skip "no headless browser here"; lint + typecheck pass).
- `node --test test/repo-history.test.mjs` — PASS 6/6.
- Repro A: README-only commit, `.bot-herdr` untracked, no `.gitignore`, `applyRepoHistory on` — one commit, `.bot-herdr/tasks/x.json` tracked, error null.
- Repro B: `.bot-herdr` tracked at HEAD, no history rule, no `.gitignore`, on — `already tracked`, 0 commits, no `.gitignore` created.
- Repro C: `.gitignore` = `node_modules`, staged `node_modules\ndist`, off — FAIL: worktree and HEAD `.gitignore` become `.bot-herdr/` (critical). Same through the CLI: exit 0, `repoHistoryError: null`, `check-ignore node_modules` empty.
- Repro D: bare `.bot-herdr` rule + `node_modules`, on — FIXED: forced add, `.gitignore` keeps `node_modules`, one commit.
- Repro E: staged `wip.txt`, off and on — FIXED: commit holds only `.bot-herdr/*` + `.gitignore`, `wip.txt` still staged.
- Repro F: nested git repo at `.bot-herdr/worktrees/task-x`, no info/exclude, on — FIXED: no worktree file, no gitlink in HEAD.
- Repro G: `git init` with no commits, `.bot-herdr` present — on makes a root commit with `.bot-herdr/tasks/x.json`; off makes one with `.gitignore` only; second on is a no-op.
- Repro H: staged-only `.bot-herdr`, off — FAIL: `pathspec '.bot-herdr' did not match any files`, no commit, `.gitignore` written uncommitted.
- Repro I: staged deletion of `.bot-herdr`, off — FAIL: commit made, HEAD still tracks `.bot-herdr`, staged deletion dropped from the index.
- Repro J: conflicted merge, off — FAIL: two-parent bot-herdr commit, `MERGE_HEAD` consumed, real index still unmerged.
- Repro K: bare remote with upstream, on — `committed and pushed`, remote HEAD carries the scoped commit only.
- Repro L: pre-commit hook exit 1, on — error `git failed` (git's stderr empty), no commit, no leftover temp index, index unchanged.
- Repro M: two parallel CLI flips off and on (throwaway repos, `BH_APP_HOME` temp) — one commit each, one `cannot lock ref 'HEAD'` error, no `index.lock`, no `bh-history-*` leftovers in tmp.
- Repro N: no-op flip (already converged) — real `.git/index` byte-identical, staged `wip.txt` untouched.
- Incident discipline: every repro used throwaway repos; the toggle was never run against this repository.

## Knowledge Proposals
- `engine/lib/workspace.mjs` — appending a rule to `.gitignore` must start from the file's current text (`current + sep + line`); the first attempt dropped `current` and destroyed the file on every off flip.
- A commit through `GIT_INDEX_FILE` seeded from `read-tree HEAD` bypasses git's unmerged-index guard, so a settings flip during a merge creates a merge commit and consumes `MERGE_HEAD`.

## Script Proposals
None.

## Blockers
None.

## Pushback
None.
