# Dev fix brief — QA findings on repo history (t-20261113-pwha, engine only)

## Goal
Fix the three major findings from `.bot-herdr/tasks/t-20261113-pwha/reports/qa-gate.md` in `mods/bot-herdr/engine/lib/workspace.mjs` (plus the two one-line minors named below). Read that report first; its repros are exact.

## Files
- `mods/bot-herdr/engine/lib/workspace.mjs` — `setHistoryEntry`, `commitHistory`, `trackHistory`, `untrackHistory`, `applyRepoHistory`.
- `test/repo-history.test.mjs` — add the three tests below.
- Leave alone: everything else (`settings.js`, `bh.mjs`, `core.mjs` need no change).

## What to do
1. **Entry variants** (`setHistoryEntry`): a history rule is any line whose trimmed text is one of `.bot-herdr`, `.bot-herdr/`, `/.bot-herdr`, `/.bot-herdr/`. The presence check and the removal use that set; the added line stays the canonical `.bot-herdr/`. (Fixes the bare-rule major.)
2. **Pathspec-scoped commits** (`commitHistory`): commit only our paths, never the user's staged index: build `paths` from what exists at the top (`.bot-herdr` when present, `.gitignore` when present) and run `git(top, ["commit", "-q", "-m", message, "--only", "--", ...paths])`. When `paths` would be empty, return the "nothing to do" result without running git. (Fixes the whole-index major, and the no-`.gitignore` major, together with 3.)
3. **`trackHistory`**: add with force and without the worktrees root: `git(top, ["add", "-f", "--", ".bot-herdr", ":(exclude).bot-herdr/worktrees"])`, and add `.gitignore` to the same `git add` **only when the file exists**. Keep the staged-diff check before committing (use the same existing-paths list). When `.bot-herdr` is absent entirely, the note is `nothing to track`. (Also removes QA's minor gitlink finding.)
4. **`untrackHistory`**: keep behavior; with 2 in place its commit is scoped too. `git rm -r -q --cached -- .bot-herdr` only when tracked files exist; `git add .gitignore` only when the file exists (it always does after `setHistoryEntry(_, true)` creates it).
5. **Tests** (within QA's budget, deterministic, isolated): no-`.gitignore` repo → `--repo-history on` tracks `.bot-herdr`, no error; `.gitignore` holding bare `.bot-herdr` → on removes the rule and tracks; `wip.txt` staged before an off flip stays staged and out of the flip commit (`git show --name-only HEAD` lists only `.bot-herdr`/`.gitignore` paths).

## Constraints
Same as the original brief: no new dependencies, no other files, plain `-m` commits with no trailers.

## Done when
- The three new tests plus the existing suite pass (`node --test` from the repo root).
- QA's repros from the report, rerun by hand in throwaway tmp repos, all behave: no-`.gitignore` on, bare-rule on, staged `wip.txt` off.
- `node --check mods/bot-herdr/engine/lib/workspace.mjs` clean.

## If stuck
Report which repro still fails rather than widening the change.
