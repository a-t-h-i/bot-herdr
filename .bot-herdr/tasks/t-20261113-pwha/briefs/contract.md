# Contract: repo history setting (t-20261113-pwha, shared by Dev and Design)

The user chose: **one global toggle, applies to every project.**

- Config: `<app home>/data/bot-herdr/config.json` → `agents.repoHistory` (boolean, default **true**: `saved.repoHistory !== false`).
- `bh access --json` output gains `repoHistory: boolean` (via `accessOf()` in `engine/lib/core.mjs`).
- Patch shapes: `bh access --data '{"repoHistory":false}'` or `bh access --repo-history on|off`. Person-only (`personOnly`, like the other access patches); agents must be refused.
- When a patch sets repoHistory, the engine converges the **current project's git** (root = `projectRoot(cwd)`, same as other commands use):
  - **off**: `.gitignore` gains an exact `.bot-herdr/` line (file created if missing); if any `.bot-herdr` files are tracked, `git rm -r -q --cached -- .bot-herdr`; one commit of the removal + .gitignore: `Keep bot-herdr's repo history out of git`.
  - **on**: the exact `.bot-herdr/` line(s) are removed from `.gitignore`; `git add .bot-herdr .gitignore`; commit: `Track bot-herdr's repo history in git`.
  - Both push when the repo has a remote; push failure is tolerated (kept as a note, not an error).
  - Not a git repository → no error, note `not a git repository`.
  - Idempotent: already converged → no commit, note says so.
- When an apply ran, the `bh access` output also carries `repoHistoryNote: string` and `repoHistoryError: string | null` (absent otherwise) so the UI can show what happened.
- No `Co-authored-by` trailer on any commit the engine makes.
