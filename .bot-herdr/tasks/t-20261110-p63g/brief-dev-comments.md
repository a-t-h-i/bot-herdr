# Dev brief — step 15 (engine half): one comment can be resolved, edited or deleted (t-20261110-p63g)

## Goal
Step 15 gives the person inline comments with resolve, edit and delete. Comments on a task (or one of its steps) and on a plan (or one of its lines) already exist in the engine, but they can only be added, and resolved all at once. Add the per-comment actions. Design builds the views against the contract below at the same time, so keep it letter for letter.

## Files
- Change: `mods/bot-herdr/engine/lib/tasks.mjs` (`comment()` at :132, `openComments` at :142), `mods/bot-herdr/engine/lib/plans.mjs` (`comment()` at :64, `openComments` at :70), `mods/bot-herdr/engine/bh.mjs` (task `comment`/`resolve` at :165-174, plan `comment`/`resolve` at :223-231, the HELP text at :31 and :38), `test/round5.test.mjs` or `test/engine.test.mjs` (add tests beside the existing comment tests).
- Leave alone: every file directly under `mods/bot-herdr/` (the views are Design's), everything else.

## What to do
1. Comment ids must stay unique after a delete. Today the id is `c${comments.length + 1}`. In both `tasks.mjs` `comment()` and `plans.mjs` `comment()`, make it `c${max + 1}` where `max` is the highest number among existing ids of the form `c<number>` (0 when none).
2. In `tasks.mjs` add and export:
   - `editComment(task, id, text)`: finds the comment by id (throw `new Error(\`Task ${task.id} has no comment ${id}.\`)` when missing; throw `new Error("A comment needs words.")` when the trimmed text is empty), sets `text` to the trimmed text, sets `edited` to `now()`, sets `open` to `true`, returns the comment.
   - `resolveComment(task, id)`: same lookup and error, sets `open` to `false`, returns the comment.
   - `deleteComment(task, id)`: same lookup and error, removes it from `task.comments`, returns the removed comment.
3. The same three functions in `plans.mjs` for a plan, with the error `Plan ${plan.id} has no comment ${id}.`
4. In `bh.mjs`, extend the existing subcommands with flags (no new subcommands):
   - `bh task comment <id> --edit <cid> "<text>"` → `editComment`, save, print `Comment <cid> changed.`
   - `bh task comment <id> --delete <cid>` → `deleteComment`, save, print `Comment <cid> deleted.`
   - `bh task resolve <id> --comment <cid>` → `resolveComment`, save, print `Comment <cid> resolved.` Without `--comment` it resolves all, exactly as today.
   - The same three for `bh plan comment <id> --edit|--delete` and `bh plan resolve <id> --comment <cid>`.
   - With `--json` each prints the comment object (the removed one for delete). `--data <base64>` for the text must keep working as it does for adding (see `bodyText(flags, [])`).
5. Update the two HELP lines to show the new flags.
6. Tests: for a task and for a plan: add two comments, delete the first, add a third and assert its id is `c3` (not `c2`); edit sets `text`, `edited` and reopens a resolved comment; resolve one leaves the other open and `bh task show` lists only the open one; an unknown id exits non-zero with the message above.

## Contracts (shared with Design)
- A comment object: `{ id: "c<number>", step: number | null (tasks) or line: number | null (plans), quote: string, text: string, at: <time as today>, open: boolean, edited?: <time> }`.
- Commands, run from the project folder, all accept `--json`:
  - `bh task comment <task> --edit <cid> --data <base64 text>`
  - `bh task comment <task> --delete <cid>`
  - `bh task resolve <task> --comment <cid>`
  - `bh plan comment <plan> --edit <cid> --data <base64 text>`
  - `bh plan comment <plan> --delete <cid>`
  - `bh plan resolve <plan> --comment <cid>`
- `bh task show <id> --json` and `bh plan show <id> --json` keep returning `comments` as the full array (open and resolved).

## Constraints
- No new dependencies. No view files. No commits. No refactors beyond these items. Functions stay small.

## Done when
- `npm test` passes with the new tests.
- From the project folder, on a scratch task made with `bh task new "scratch" --title "Scratch comments"`: adding two comments, `--delete c1`, adding another gives `c3`; then set that scratch task's status to `done` and archive it (`bh task archive <id>`), and say its id in your report.
- `bh help` shows the new flags.

## If stuck
When the code does not match this brief (a line moved, a helper named differently), use what is there and say so; when something contradicts the contract, stop that part and report it. Never change the contract yourself.
