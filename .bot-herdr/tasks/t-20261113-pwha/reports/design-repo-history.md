# Design — step 2: Repo history row in the Access card

## Summary
Added the Repo history choice row to the existing Access card in `mods/bot-herdr/settings.js` (Pushed / Local only, after Git per task) and surface the engine's `repoHistoryError` through the page's existing `this.problem`. No engine edits, no new dependencies; `herdr-app check` passes.

## Changes
- `mods/bot-herdr/settings.js`
  - `accessCard` (:901-902): one `settingRow` after "Git per task" — `choice(c, "bh-repo-history", [["on","Pushed"],["off","Local only"]], k.repoHistory === false ? "off" : "on", (v, cx) => this.setAccess({ repoHistory: v === "on" }, cx))`, hint when off: `.bot-herdr/ is gitignored and untracked in every project`, `null` when on.
  - `showAccess` (:231): `if (got.repoHistoryError) this.problem = got.repoHistoryError;` — shown by the page's existing problem line (:539, `TYPE.sm` / `c.danger`).
  - Header comment (:12-13): one line — on pushes `.bot-herdr/` to git with the project, off keeps it out via `.gitignore`.

## Brief Check
- `node --check mods/bot-herdr/settings.js` — **met**: exits 0.
- `tsc --noEmit` no new TS2304/TS2552 outside `engine/` — **met**: every TS2304/TS2552 in output is under `mods/bot-herdr/engine/` (pre-existing `setTimeout`/`AbortController` lib gaps); none in `settings.js`, whose findings are the file's pre-existing implicit-any family (TS7006/TS7031/TS2339).
- `herdr-app check mods/bot-herdr` — **met**: `check passed: mods/bot-herdr`, exit 0.
- Row appears in Settings → general → Access, fourth position, reading Pushed by default — **partly met**. Placement, id, options and default verified in the diff: the row sits directly after "Git per task", renders `Pushed` when `k.repoHistory` is missing (`=== false ? "off" : "on"`), matching the brief's missing-field rule. Not visually confirmed — see Visual limit below; and the "fourth" count holds only when the Access card's collapsed "Also allow" row is absent (full permissions). With standard permissions the card is Run agents, Permissions, Also allow, Git per task, Repo history — fifth, as "one row after the Git per task row" requires.

## Verification
- `node --check mods/bot-herdr/settings.js` — passes (SYNTAX_OK).
- `npx -y -p typescript@5 tsc -p mods/bot-herdr/jsconfig.json --noEmit` — no TS2304/TS2552 outside `engine/`; `settings.js` lines are the pre-existing implicit-any/union families, not from this change.
- `"…/herdr-app.exe" check mods/bot-herdr` — `check passed: mods/bot-herdr`.
- `git diff -- mods/bot-herdr/settings.js` — 5 insertions, 1 deletion, only the three changes above.

## Design choices
- Hint text: `.bot-herdr/ is gitignored and untracked in every project`, no backticks — `settingRow` hints render as plain text (siblings: "Commands, comma separated", "Agents run any command without asking"), so literal backticks would show as characters.
- Hint slot: third argument like "Permissions", `null` when on, so the row's height and look match its neighbours.
- Error channel: reused `this.problem` as instructed (the page's single danger line); no new error UI.

## Blockers
- Engine step 1 has not landed in this worktree: `rg repoHistory mods/bot-herdr/engine` returns nothing, so `bh access --json` carries no `repoHistory` yet. Per the brief the row still lands and renders `Pushed`; the toggle is a no-op visually (`this.access` keeps the optimistically patched value; `showAccess` overwrites it from the engine's reply, so it will snap back to `Pushed` until the engine emits the field). I did not change `setAccess`.

## Visual limit
The row was not confirmed in the running window: bot-herdr's Settings page is a mod page reached from its own chat route (`/settings` → `{ do: "settings" }`), and `herdr-app do app.settings` opens herdr's own Look/Alerts/Updates settings instead; no CLI command opens the mod page, so a screenshot would need pointer/key automation on the person's display, which `herdr-app --skill` forbids. `herdr-app check` (the project's render gate) passes. Needs QA's eye or the user's.

## Knowledge Proposals
- bot-herdr's own Settings page has no CLI entry point (`herdr-app do app.settings` is herdr's Look/Alerts/Updates); it opens only from the mod's chat route `/settings`, so a visual check of a Settings card needs a human or pointer automation — plan it into QA rather than claiming it from `check`.
