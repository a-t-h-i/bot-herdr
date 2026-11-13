# Design brief — step 2 (Settings): a Repo history row in the Access card

## Goal
Step 2 of task t-20261113-pwha. The engine (Dev, step 1) adds a global repo-history setting to `bh access`. Your job is the Settings row that shows and flips it, in the existing Access card.

Read the shared contract: `.bot-herdr/tasks/t-20261113-pwha/briefs/contract.md`.

## Files
- `mods/bot-herdr/settings.js` — the only file you touch.

## What to do
1. In `accessCard(c)` (:882-898+), add one row after the "Git per task" row, using the file's own `settingRow` + `choice` helpers exactly as the neighbouring rows do:
   - Label `Repo history`; choice id `bh-repo-history`; options `[["on", "Pushed"], ["off", "Local only"]]`; current `k.repoHistory === false ? "off" : "on"`; change → `(v, cx) => this.setAccess({ repoHistory: v === "on" }, cx)`.
   - SettingRow hint (third-argument style used by "Permissions") when off: `` `.bot-herdr/` is gitignored and untracked in every project ``; no hint when on.
2. `setAccess` already sends the patch via `bh access --data`; nothing changes there. In `showAccess(got)` (:225-230), add: `if (got.repoHistoryError) this.problem = got.repoHistoryError;` (the field arrives only when the engine's git apply ran and failed — see contract).
3. Extend the file's header comment (the block at :9-12 that describes the page) with one line about repo history: on = `.bot-herdr/` pushed to git, off = excluded via `.gitignore`.

## Contracts
- `this.access` (from `bh access --json`) now also has `repoHistory: boolean`; the patch `{ repoHistory: boolean }` is accepted. Nothing else about the shape changes.
- The engine converges the project's git when the patch lands; you only show state and errors.

## Constraints
No new dependencies, no other files, no engine edits. Reuse `settingRow`/`choice`/`this.problem` as-is. Keep the row's look identical to its neighbours.

## Done when
- `node --check mods/bot-herdr/settings.js` passes.
- `npx -y -p typescript@5 tsc -p mods/bot-herdr/jsconfig.json --noEmit` reports no new TS2304/TS2552 outside `engine/`.
- `herdr-app check mods/bot-herdr` passes (run it from the repo root: `"C:/Users/athenkosi.hlubi/AppData/Local/Programs/herdr-app/herdr-app.exe" check mods/bot-herdr`).
- The row appears in Settings → general → Access, fourth position, reading Pushed by default.

## If stuck
If `k.repoHistory` never arrives (engine step not merged yet), still land the row — it must render `Pushed` when the field is missing — and say so in your report.
