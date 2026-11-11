# dev-comments — step 15 engine half

## Summary
One comment on a task or plan can now be edited, resolved or deleted, through the engine and `bh`; ids stay unique after a delete.
All tests pass; scratch task `t-20261110-dsd1` gave `c3` after deleting `c1` and is done and archived.

## Changes
- `mods/bot-herdr/engine/lib/tasks.mjs` — `comment()` uses `nextCommentId` (`c<max+1>`). New exports: `nextCommentId`, `commentById`, `changeComment` (helpers shared with plans), and `editComment`, `resolveComment`, `deleteComment`, with the errors the brief gives.
- `mods/bot-herdr/engine/lib/plans.mjs` — `comment()` uses `nextCommentId`. New exports `editComment`, `resolveComment`, `deleteComment` (they use the tasks.mjs helpers, so the error reads `Plan <id> has no comment <cid>.`).
- `mods/bot-herdr/engine/bh.mjs` — a small `changeOne()` helper. `task comment` and `plan comment` take `--edit <cid>` and `--delete <cid>`, and `task resolve` and `plan resolve` take `--comment <cid>`. They print `Comment <cid> changed|deleted|resolved.`, or the comment object with `--json`. HELP lines updated.
- `test/round5.test.mjs` — one shared helper and two tests (task and plan): delete then add gives `c3`; resolve then edit reopens and sets `text`/`edited`; resolving one leaves the other; `--json` show keeps the full array; an unknown id exits non-zero with the message; `task show` lists only open ones.

## Brief Check
- `npm test` passes with the new tests — met — 92 pass, 1 skipped (no headless browser), 0 fail; both new tests pass.
- Scratch task: two comments, `--delete c1`, the next one is `c3`; then done and archived — met — `t-20261110-dsd1`: "Comment c1 deleted." then "Comment c3 added.", then "is done." and "archived."
- `bh help` shows the new flags — met — lines `bh task comment … [--edit <cid> "<text>" | --delete <cid>]`, `bh task resolve <id> [--comment <cid>]`, and the same for plan.

## Verification
- `node --test test/round5.test.mjs` — 15 pass, 1 skipped
- `npm test` — 92 pass, 0 fail, 1 skipped
- `bh check` — PASS (lint, typecheck, tests)

## Notes
- The contract says `--data <base64 text>`, but `bodyText` decodes `--data` with `decodeURIComponent`, not base64. As the brief said, I kept it working the way it does for adding, so Design should send `encodeURIComponent(text)`. I posted this on the board (#13).
- `--edit` with no text gives "A comment needs words." from `editComment`, not a usage line.
- The shared helpers live in `tasks.mjs` and `plans.mjs` imports them, so the lookup and edit code isn't written twice.

## Knowledge Proposals
- `bh … --data` is URI-encoded (`decodeURIComponent` in core `bodyText`), not base64.
- Engine lib files (`tasks.mjs`, `plans.mjs`, `bh.mjs`) use CRLF line endings, so edit them with the Edit tool, not scripts that expect `\n`.
