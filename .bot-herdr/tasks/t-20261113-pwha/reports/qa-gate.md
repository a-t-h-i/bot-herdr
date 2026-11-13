# QA gate — repo history setting (t-20261113-pwha)

## Summary
The off path, person-only enforcement, non-git safety, query isolation and push tolerance all hold, but the **on** path is broken in two ordinary repository states and the toggle commits whatever else is staged.
Verdict: **CHANGES_REQUIRED** — the "on" acceptance criterion and the "one commit of the removal + .gitignore" rule fail; repros below.

## Changes
No implementation changes by me. New test file `test/repo-history.test.mjs` (3 tests) and the two shape pins in `test/engine.test.mjs` are the task's; engine diff reviewed: `engine/bh.mjs` access case + help, `engine/lib/core.mjs` `accessOf`, `engine/lib/workspace.mjs` `applyRepoHistory`, `settings.js` Repo history row.

**Incident, disclosed:** while reproducing the toggle I ran `bh access --repo-history on` with the shell cwd on this project and only `BH_APP_HOME` redirected, so the engine converged **this repository**: it committed 19 unrelated files (`.bot-herdr` deletions, task.json edits, the whole t-20261113-pwha dir) as `b9f4909 Track bot-herdr's repo history in git` and pushed it to `origin/main`. I restored both to `88adcf4` (`git reset --mixed`, `git push --force-with-lease`, origin now `88adcf4`); working tree is byte-identical to before, index clean. The commit is also the live proof of finding 3 (whole-index commit) and was not caused by any worker.

## Brief Check
- Contract holds exactly — **not met**: findings 1–3.
- Person-only — **met**: `--repo-history` and `--data {"repoHistory":false}` with `BH_AGENT` both refused (exit 1, message from `personOnly`), config file not created, commit count unchanged; `bh config --data` writes only `classifier`, so it cannot reach `agents.repoHistory`.
- Git convergence idempotent, one commit per flip, push tolerated — **partly met**: off is idempotent, on's idempotent path errors when `.gitignore` is absent (finding 1); push with no upstream / with upstream behaves as contracted (notes `committed; push failed: The current branch master has no upstream branch.` and `committed and pushed`, bare repo got the commit).
- Non-git folders safe — **met**: exit 0, `repoHistoryNote: "not a git repository"`, `repoHistoryError: null`.
- Existing access output shapes only gain fields — **met**: `engine.test.mjs` deepEqual pins updated; no other command changed.
- Full suite passes — **met**: `bh check` PASS (34 pass, 1 pre-existing skip).
- A query never touches git — **met**: `bh access --json` with a planted `.git/index.lock` succeeds, commit count and HEAD unchanged; `applyRepoHistory` only runs inside the person patch branch (`bh.mjs:650`).

## Findings

### [major] `on` fails when the project has no `.gitignore` — `engine/lib/workspace.mjs:123`
`trackHistory` always runs `git add .bot-herdr .gitignore` when `.bot-herdr` exists; with no `.gitignore` file git rejects the pathspec.
Repro (existing project, no .gitignore, `.bot-herdr/` untracked — the default first-use state):
`bh access --repo-history on --json` → `{"repoHistory":true,"repoHistoryNote":"","repoHistoryError":"pathspec '.gitignore' did not match any files"}`, `git ls-files -- .bot-herdr` empty, no `.gitignore`, commit count unchanged.
Also fails when `.bot-herdr` is already tracked and `.gitignore` is absent (contract's "already converged → no commit, note says so" instead yields an error).
The component fires on every click (`switch.js:49`), so clicking the already-selected "Pushed" is enough; Settings puts the text in `this.problem`.

### [major] `on` fails when any other ignore rule matches `.bot-herdr` — `engine/lib/workspace.mjs:123`
`.gitignore` = `node_modules` + a bare `.bot-herdr` line (a common hand-written rule): `git add .bot-herdr` refuses an ignored path. Result `repoHistory: true`, `.bot-herdr` still untracked, no commit, and the surfaced error is the CRLF **warning** line, not the cause (`runGit` takes git's first stderr line): `"repoHistoryError": "warning: in the working copy of '.gitignore', LF will be replaced by CRLF the next time Git touches it"`. Fix needs `-f`/`--force` (or an explicit file list) plus a real message.

### [major] The toggle commits and pushes unrelated staged work — `engine/lib/workspace.mjs:100`
`git commit -q -m <message>` commits the whole index, not the repo-history paths, contradicting "one commit of the removal + .gitignore".
Repro: stage `wip.txt`, flip off → HEAD is `Keep bot-herdr's repo history out of git` and `git show --name-only` lists `.bot-herdr/tasks/x.json, .gitignore, wip.txt`; with a remote it is pushed. Observed at scale in this repo (incident above: 19 unrelated files). Dev already flagged it as a knowledge proposal — it is a contract breach, not a note: scope the commit (`git commit -m … -- .bot-herdr .gitignore` / `-o`). `git add .gitignore` also stages every uncommitted `.gitignore` edit, same class but arguably intended.

### [minor] A nested worktree is recorded as a gitlink — `engine/lib/workspace.mjs:123`
With a worktree at `.bot-herdr/worktrees/task-x` and no `/.bot-herdr/worktrees/` line in `.git/info/exclude` (hand-made, or made before `excludeWorktrees`), off→on commits `160000 .bot-herdr/worktrees/task-x` into the project history. Engine-created worktrees write that exclude, so risk is conditional; excluding the worktrees root before the add removes it.

### [minor] Concurrent flips produce a bogus error
Two simultaneous off patches: one note `committed; no remote to push to`, the other `repoHistoryError: "pathspec '.bot-herdr' did not match any files"`; end state correct, no leftover `index.lock`, config last-writer-wins. No lock exists anywhere in the engine (pre-existing), and person-only limits exposure; noting it because the QA focus asked.

### [minor] `on` says "already tracked" when there is nothing to track — `engine/lib/workspace.mjs:126`
Repo with no `.bot-herdr` directory and repoHistory on → note `already tracked`. Wording only.

### [minor] Settings copy promises more than the engine does — `settings.js:902`
Hint "`.bot-herdr/` is gitignored and untracked in every project" while convergence touches only the current project, and `repoHistoryNote` (`not a git repository`, `already excluded`, push failure) is never shown — only errors reach `this.problem`. Contract requires the note in the output only, so this is a product decision, not a breach.

### [info]
- `.gitignore` is rewritten with `\n`, so a CRLF file becomes mixed/LF and shows a whole-file diff on the next flip (Windows projects).
- After on, an emptied `.gitignore` stays tracked as an empty file (cosmetic).
- Without git installed, `applyRepoHistory` reports `not a git repository` (mislabel).
- Off in a repo with no commits creates its first commit (`.gitignore` only).

## Verification
- `bh check` — PASS (34 tests pass, 1 pre-existing skip: "no headless browser here"); covers `test/repo-history.test.mjs` and the `engine.test.mjs` shape pins.
- Repro: existing repo, no `.gitignore`, `.bot-herdr` untracked, `bh access --repo-history on --json` — FAIL: `pathspec '.gitignore' did not match any files`, nothing tracked, no commit.
- Repro: repo with tracked `.bot-herdr` and no `.gitignore`, `--repo-history on` — FAIL: same pathspec error instead of the contracted note.
- Repro: `.gitignore` with bare `.bot-herdr`, `--repo-history on` — FAIL: error is the CRLF warning, `.bot-herdr` untracked.
- Repro: staged `wip.txt`, `--repo-history off` — FAIL: `wip.txt` inside the "Keep bot-herdr's repo history out of git" commit.
- Repro: off → on with a worktree under `.bot-herdr/worktrees` and no info/exclude — `git ls-tree` mode `160000 .bot-herdr/worktrees/task-x`.
- Repro: two parallel off flips — one commit, one bogus pathspec error, no leftover lock, converged.
- Repro: bare remote, no upstream → `committed; push failed: The current branch master has no upstream branch.`; remote with upstream → `committed and pushed`, bare repo at 2 commits.
- Repro: non-git folder → exit 0, `not a git repository`, `repoHistoryError: null`.
- Repro: `bh access --json` with `.git/index.lock` present → exit 0, `repoHistory: true`, commit count unchanged (query never touches git).
- Repro: `BH_AGENT=qa` `--repo-history off` and `--data {"repoHistory":false}` → exit 1, refused, no config, no commit.

## Knowledge Proposals
- `git add` of a path that the project's own `.gitignore` still matches fails; the repo-history toggle must force-add or list files. Same for committing: pathspec-scope the commit so a settings click never sweeps the user's index.

## Blockers
None. No new tests added: the defects need code changes first, and the three tests below the budget would only pin behaviour that must change.

## Pushback
None.
