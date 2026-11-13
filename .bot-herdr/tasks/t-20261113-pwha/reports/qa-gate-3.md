# QA gate round 3 — repo history setting (t-20261113-pwha)

## Summary
Round-2's critical (`.gitignore` overwrite) and major (index/HEAD disagreement) are fixed and pinned by tests; every round-1 fix still holds. No critical or major finding left — one new minor (a lost commit race can surface `"git failed"`) and four pre-existing minors.
Verdict: **PASS**.

## Changes
No implementation changes by me. Reviewed this round's diff: `engine/lib/workspace.mjs` (`setHistoryEntry`, new `seedIndex` / `commitIndex` / `pushHistory` / `headTracksHistory` / `mergeInProgress`, `untrackHistory`, `trackHistory`, `applyRepoHistory`) and 4 new tests in `test/repo-history.test.mjs`. `engine/bh.mjs`, `engine/lib/core.mjs` unchanged this round; `settings.js`, `viewer.js`, `main.js` carry another task's work (t-20261113-463i), not judged here.

Round-2 findings status:
- **[critical] `.gitignore` overwritten — FIXED** (repro C: `node_modules`, `.env`, `*.log` survive in worktree and HEAD, `check-ignore node_modules` matches; also verified with a `.gitignore` that has no trailing newline).
- **[major] staging vs. deciding index — FIXED** (repro H staged-only, I user-staged deletion, C2 dirty worktree, C3 staged edit, O rule present while tracked: all leave HEAD without `.bot-herdr/tasks/x.json`, error null).
- **[minor] flip mid-merge — FIXED** (repros J and J2: `finish the merge in progress first`, commit count unchanged, `MERGE_HEAD` kept, unmerged stage kept, no `.gitignore` written — J2 also covers a rebase conflict with no `MERGE_HEAD`).
- **[minor] concurrent flips message — MOSTLY FIXED**: the new text appears, but not for every form of the race (finding 1).
- **[info] `read-tree HEAD` swallowed into `--empty` — FIXED** (`seedIndex` verifies HEAD first, other failures propagate).
- **[minor] Settings copy overpromises — out of scope this round** (goes to the user).

## Brief Check
- `agents.repoHistory` boolean, default true — **met** (fresh app home reports `true`; `config.json` keys after flips: `access, allow, headless, git, repoHistory` — note/error are not persisted).
- `bh access` output gains `repoHistory` — **met**.
- Patch shapes `--data {repoHistory:bool}` and `--repo-history on|off`, person-only — **met** (`maybe` and `"off"` exit 2; agent patch refused, test asserts; setting applied only on a person patch).
- off = `.gitignore` gains exact `.bot-herdr/` (created if missing) — **met** (C, H; no-`.gitignore` case creates it).
- off = `git rm -r --cached` when tracked + one commit `Keep bot-herdr's repo history out of git` — **met** (C, I, O).
- on = rule removed, `.bot-herdr` added, commit `Track bot-herdr's repo history in git` — **met** (A no-`.gitignore`, B already tracked, D bare rule, F nested worktree excluded).
- Both push when a remote exists; push failure tolerated — **met** (K: `committed and pushed`, remote HEAD has no `.bot-herdr`; no-remote note unchanged).
- Not a git repository → note, no error — **met** (exit 0, `not a git repository`).
- Idempotent — **met** (B/N no second commit; repeated off `already excluded`; no-op flip leaves the real `.git/index` byte-identical).
- `repoHistoryNote` / `repoHistoryError` only when an apply ran — **met** (query returns neither; a flip carries both).
- No `Co-authored-by` trailer — **met** (commit body is exactly the message).
- Scope — **met**: only `engine/lib/workspace.mjs`, `engine/bh.mjs`, `engine/lib/core.mjs`, `test/engine.test.mjs`, `test/repo-history.test.mjs` from this task.
- Isolation — **met**: every flip ran in a throwaway repo with `BH_APP_HOME` in temp; this repository's `.gitignore` and HEAD are unchanged by QA (`.gitignore` still `node_modules/`, `.DS_Store`; `.bot-herdr` still tracked at HEAD, as before).

## Findings

### [minor] A lost commit race can surface `repoHistoryError: "git failed"` — `engine/lib/workspace.mjs:114`
`commitIndex` translates only a message containing `cannot lock ref`; `runGit` builds its message from stderr, and in the ref race Windows git sometimes exits non-zero with empty stderr, producing the fallback `git failed`. Observed: two simultaneous flips → one `committed; no remote to push to`, the other `git failed` (4 of 6 same-direction rounds; 1 of 16 human-offset mixed rounds). State still converges (one commit, `.bot-herdr` untracked at HEAD, no `index.lock`, no `bh-history-*` leftovers), and the error is shown in Settings. Cosmetic; not blocking.

### [minor] Overlapping opposite-direction flips can leave the setting and git disagreeing — `engine/bh.mjs:648` / `settings.js:243` (`setAccess` has no re-entrancy guard)
Single flip takes 594–653 ms, so a fast click-then-correct can overlap. At human offsets (0–200 ms) 1 of 16 rounds diverged: setting `true`, `.bot-herdr` untracked — loser reported `another git commit was running; turn the setting off and on again`. At *exactly* simultaneous spawns (not reachable by hand) 6 of 8 diverged, some silently (`already tracked`, error null). No damaging direction found in 24 mixed rounds (`setting off` while tracked never occurred); the next toggle re-converges. Worth a follow-up (serialize the flip), not a gate blocker.

### [minor] `on` reports `already tracked` when `.bot-herdr` holds only `worktrees/` — `workspace.mjs:174`
`.bot-herdr/worktrees/task-x` only: on adds nothing (excluded), diff empty → note `already tracked`, no commit. Harmless but the note is untrue; the `nothing to track` case covers only an absent `.bot-herdr`.

### [minor] `git reset -- .gitignore .bot-herdr` after a flip unstages the user's staged edits to those two paths — `workspace.mjs:153`
Repro C3: staged `.bot-herdr` edit → after an off flip the index no longer holds it (content stays on disk, now ignored). Round-2 info, unchanged; the contract asks the flip's commit to carry the whole `.gitignore`, so this is the accepted design.

### [info]
- `mergeInProgress` is called before `applyRepoHistory`'s try/catch; its `ls-files -u` fallback can throw, which would make `applyRepoHistory` throw and contradict its "never throws" JSDoc. Not reachable with git installed.
- The app-home copy `~/.config/herdr-app/mods/bot-herdr/engine/lib/workspace.mjs` is a Nov 12 15:15 snapshot without these fixes; the running app resolves `bh` there, so the fixes take effect when the mod is redeployed. Deployment, not the diff.
- Temp index lives in `os.tmpdir()` (`bh-history-<pid>-<ms>-<rand>`); `finally` cleaned it in every path tested (success, failed commit, thrown hook).

## Verification
- `node <bh> check` — PASS: `tests 42, pass 41, fail 0, skipped 1` (`no headless browser here`), "PASS: lint and typecheck pass, tests pass."
- `node repro.mjs` (throwaway repos, temp `BH_APP_HOME`) — C, C2, C3, H, I, J, J2, A, B, D, E, F, G, K, L, N, O, P all as expected (details in findings/Brief Check); M/Q produce the masked-message finding.
- `node race2.mjs` (instrumented `runGit` per process) — loser fails at `git commit` on the temp index: `cannot lock ref 'HEAD': … Permission denied` (translated) or empty stderr → `git failed`; winner commits, HEAD/`ls-tree`/status clean, no lock, no leftovers.
- `node mix2.mjs` — single flip 640/594/653 ms; 16 opposite-direction races at 0/60/120/200 ms: 1 inconsistent, error surfaced, 0 silent, 0 damaging; readable lock message confirmed in 4 rounds.
- `node last.mjs` — patch from `src/deep` converges the top-level `.gitignore`; commit body exactly `Keep bot-herdr's repo history out of git`, no trailer.
- This repository after QA: `git status --porcelain -- .gitignore` empty, `HEAD:.gitignore` unchanged, `HEAD` still tracks `.bot-herdr` — the toggle was never run here.

## Knowledge Proposals
- A flip that fails at its temp-index commit leaves the setting already saved; only `commitIndex`'s `cannot lock ref` match converts the race, and Windows git can exit with empty stderr, so `runGit`'s `git failed` fallback still leaks to the user.
- Concurrent opposite-direction flips are not serialized anywhere (engine or `settings.js`): the setting can end up opposite the converged git state, silently when both flips believe they won.

## Script Proposals
None.

## Blockers
None.

## Pushback
None.
