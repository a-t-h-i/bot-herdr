## Summary
`bh access` now carries `repoHistory` (default true) and converges the current project's git when a person patches it; off untracks `.bot-herdr/` with a `.gitignore` line, on tracks it again, one commit each, push tolerated.
Engine side of t-20261113-pwha is complete and green; Settings UI (step 2) can read/patch the flag.

## Changes
- `mods/bot-herdr/engine/lib/core.mjs` — `accessOf()` returns `repoHistory: saved.repoHistory !== false`.
- `mods/bot-herdr/engine/lib/workspace.mjs` — new exported `applyRepoHistory({ root, on, git = runGit })` beside the existing git helpers, plus private `setHistoryEntry`, `commitHistory`, `untrackHistory`, `trackHistory`. Returns `{ repo, on, committed, pushed, note, error }`; never throws. Notes: `not a git repository`, `already excluded`, `already tracked`, `committed; no remote to push to`, `committed and pushed`, `committed; push failed: <line>`.
- `mods/bot-herdr/engine/bh.mjs` — access case accepts `--repo-history on|off` (anything else, including the bare flag, is a UsageError) and `--data {"repoHistory":bool}` (non-boolean is a UsageError); after `writeJson` a person patch that set it runs `applyRepoHistory({ root, on })` and adds `repoHistoryNote`/`repoHistoryError` to the returned object. UsageError and the `bh access` help line extended.
- `test/repo-history.test.mjs` — new: fresh app home shows true; tmp git repo off → config false, `.gitignore` holds `.bot-herdr/`, `ls-files` empty, one commit with the exact message, note present; second off → `already excluded`, no commit; on → entry gone, tracked again, commit message exact; agent patch refused and changes nothing; plain folder → exit 0, `repoHistoryNote: "not a git repository"`; `--data` shape works and a non-boolean/bad value exits 2.
- `test/engine.test.mjs` — two `deepEqual` pins of the `bh access` JSON extended with `repoHistory: true` (the shape pin the new field broke; outside the four files, required to keep the suite green).

## Brief Check
- `node --test test/repo-history.test.mjs` passes — met (`pass 3, fail 0`).
- Whole `node --test test/` suite passes — met via `npm test` (`tests 180, pass 179, fail 0, skipped 1` — the skip is the pre-existing "no headless browser here").
- Manual sequence once by hand in a throwaway tmp git repo — met: off gave `.gitignore` = `.bot-herdr/`, `git ls-files -- .bot-herdr` empty, commit `Keep bot-herdr's repo history out of git` (count 1→2, note `committed; no remote to push to`); second off → `already excluded`, count stayed 2; on gave empty `.gitignore`, `.bot-herdr/tasks/x.json` tracked, commit `Track bot-herdr's repo history in git` (count →3), clean status.
- `node --check` clean on the three engine files — met.
- No new dependencies — met.
- No changes outside the four listed files — one exception: `test/engine.test.mjs` (see Changes); `settings.js` untouched by me (Design owns it, its diff on disk is theirs).

## Verification
- `node --check mods/bot-herdr/engine/lib/core.mjs && node --check mods/bot-herdr/engine/lib/workspace.mjs && node --check mods/bot-herdr/engine/bh.mjs` — CHECK-OK
- `node --test test/repo-history.test.mjs` — pass 3, fail 0
- `npm test` — tests 180, pass 179, fail 0, skipped 1
- `bh check` — PASS (lint and typecheck pass, tests pass)
- Manual off/on sequence in a throwaway tmp git repo (above) — as contracted

## Knowledge Proposals
- `applyRepoHistory` commits whatever is staged (`git add` of its own paths then plain `git commit`), so a project with unrelated staged changes will fold them into the repo-history commit. If that matters, later scope the commit with a pathspec.

## Notes
- Chose `flags["repo-history"] !== undefined` with an on/off check instead of only `typeof === "string"`, so a bare `--repo-history` is refused rather than silently ignored (same rule as "anything but on/off").
- Push is only attempted when `git remote` is non-empty; a failing push becomes a note, `pushed: false`, never `repoHistoryError`.
