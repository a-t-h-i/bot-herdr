# dev-fix-qa2 — repo-history git convergence, QA round 2 fixes

## Summary
Fixed all six round-2 findings in `engine/lib/workspace.mjs`: `.gitignore` is appended to instead of overwritten, tracking is decided from HEAD while acting on the temp index, `read-tree --empty` is only a no-HEAD fallback, mid-merge flips are refused, and ref-lock races get a readable message. Four regression tests added; repros C, H, I, J now give the expected results.

## Changes

### mods/bot-herdr/engine/lib/workspace.mjs
- `setHistoryEntry` — on: `current + (needs newline ? "\n" : "") + HISTORY_LINE + "\n"`, so existing rules survive. Off: keeps the remaining text and writes `""` when what is left is whitespace-only (no `"\n"` churn).
- `seedIndex(git, top, scoped)` — new: `read-tree HEAD` when `rev-parse -q --verify HEAD` succeeds, `read-tree --empty` only when HEAD does not exist. Any other `read-tree HEAD` failure now propagates (was swallowed into an empty tree).
- `commitIndex(scoped, message)` — new: wraps the temp-index commit; a `cannot lock ref` failure is reported as `another git commit was running; turn the setting off and on again`.
- `pushHistory(git, top, committed)` — new: push tail extracted from `commitHistory` so it stays under 20 lines; notes/messages unchanged.
- `headTracksHistory(git, top)` — new: `ls-tree -r --name-only HEAD -- .bot-herdr`, false when there is no HEAD.
- `untrackHistory` — decides from HEAD instead of the real index; the stage callback runs `ls-files -- .bot-herdr` on the temp index and only then `rm -r -q --cached -- .bot-herdr`. Staged-only `.bot-herdr` no longer errors; a user-staged deletion is still removed from HEAD.
- `mergeInProgress(git, top)` — new: true when `rev-parse -q --verify MERGE_HEAD` succeeds or `ls-files -u` is non-empty.
- `applyRepoHistory` — after resolving `top` and before any file write: mid-merge returns `{repo:true, on, committed:null, pushed:false, note:"", error:"finish the merge in progress first"}`. The setting change is still reported by the existing error path; no `.gitignore`, no commit.

### test/repo-history.test.mjs
Four new tests after the existing six:
1. `off keeps the other .gitignore rules` — `node_modules`, `.env`, `*.log` survive in worktree and HEAD.
2. `off leaves HEAD clean when .bot-herdr was only staged` — repro H.
3. `off removes .bot-herdr from HEAD when the user staged its deletion` — repro I.
4. `a flip is refused mid-merge` — repro J: error text, same commit count, `MERGE_HEAD` kept, unmerged stage kept, no `.gitignore` written.

## Brief Check
- **[critical] setHistoryEntry preserves existing content** — met; repro C standalone: `.gitignore` worktree `node_modules\ndist\n.bot-herdr/\n`, HEAD `node_modules\ndist\n.bot-herdr/`, `check-ignore node_modules` matches. Off-when-whitespace-only writes `""` (existing off/on test still passes).
- **[major] untrackHistory from HEAD / temp index** — met; tests 2 and 3: test 2 has staged-only `.bot-herdr` → `error:null`, HEAD `ls-tree -- .bot-herdr` empty; test 3 has staged deletion → `error:null`, HEAD no longer tracks `.bot-herdr`, flip commit is `Keep bot-herdr's repo history out of git`.
- **[info] read-tree --empty only without HEAD** — met; `seedIndex` verifies HEAD first and other `read-tree HEAD` failures throw.
- **[minor] refuse flip mid-merge** — met; test 4: `repoHistoryError === "finish the merge in progress first"`, `repoHistory === false`, commit count unchanged, `MERGE_HEAD` still 40 chars, `f.txt` still unmerged, no `.gitignore`.
- **[minor] cannot lock ref message** — met by `commitIndex` (no test; requires racing two git commits).
- **4 new tests** — met, 10/10 in `test/repo-history.test.mjs`.
- **`bh check` passes** — met: 42 tests, 41 pass, 1 skip (`no headless browser here`), PASS lint and typecheck.
- **Contracts unchanged** — `applyRepoHistory` shape, commit messages, `runGit` signature all preserved. Only the two named files touched; `git status --porcelain` shows ` M mods/bot-herdr/engine/lib/workspace.mjs` and `?? test/repo-history.test.mjs` (already untracked before this round).
- **No new dependencies; functions ≤ 20 lines** — met (`commitHistory` split into `pushHistory`; new helpers are 6–9 lines).
- **Toggles never run against this repository** — met; only temp dirs.

## Verification
- `node --test test/repo-history.test.mjs` — PASS 10/10 (0 fail, 0 skip), 11.9 s.
- `node C:/Users/athenkosi.hlubi/.config/herdr-app/mods/bot-herdr/engine/bh.mjs check` — PASS: `tests 42, pass 41, fail 0, skipped 1`; "PASS: lint and typecheck pass, tests pass."
- Repro C standalone (`applyRepoHistory({root, on:false})`, `.gitignore` staged as `node_modules\ndist`): `{"repo":true,"on":false,"committed":"b2c25d8…","pushed":false,"note":"committed; no remote to push to","error":null}`, worktree `"node_modules\ndist\n.bot-herdr/\n"`, HEAD `"node_modules\ndist\n.bot-herdr/"`, HEAD tracks no `.bot-herdr`, `check-ignore node_modules` = `node_modules`. Throwaway repo deleted.
- Repro H/I/J via the new tests above (throwaway repos under `mktemp -d`).
- Diff: `workspace.mjs` +134/−4 (previous round's block plus these changes); `test/repo-history.test.mjs` 188 lines, 4 new tests.

## Knowledge Proposals
- `engine/lib/workspace.mjs` — appending a rule to `.gitignore` must start from the file's current text (`current + sep + line`); omitting `current` destroyed the file on every off flip.
- A commit through `GIT_INDEX_FILE` seeded from `read-tree HEAD` bypasses git's unmerged-index guard; a settings flip during a merge creates a merge commit and consumes `MERGE_HEAD` unless refused up front.
- Deciding tracked-ness from the real index while staging on the HEAD-seeded temp index disagrees whenever the user staged `.bot-herdr` work; both the decision and the staging must use the same index.

## Script Proposals
None.

## Blockers
None.

## Pushback
None.
