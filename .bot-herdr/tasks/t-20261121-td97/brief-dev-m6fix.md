# Dev brief — M6 fix round (from QA qa-m6, CHANGES_REQUIRED)

Task t-20261121-td97, step 6. Goal: clear qa-m6's blocking finding 1 (approvals safety) and minors 2–4, so the M6 gate and the final audit pass. Read `.bot-herdr/tasks/t-20261121-td97/reports/qa-m6.md` › Findings 1–4 in full first: they give `file:line`, cause and the exact fix. Contract: `contract-m6.md` (unchanged; do not alter any JSON shape).

## Files
Change only: `mods/bot-herdr/engine/lib/approvals.mjs`, `mods/bot-herdr/engine/lib/runner.mjs`, `test/approvals.test.mjs`, `mods/bot-herdr/threads.js`, `mods/bot-herdr/peek.js`, `mods/bot-herdr/composer.js`, `test/m6-ui.test.mjs`. Leave everything else alone (`install.mjs`, `core.mjs`, the audit, fixtures, baseline).

## What to do (the decisions are made)
1. **No held permission is ever left unanswered (finding 1).**
   - `approvals.mjs`: `maybeHoldPermission` returns `{ handled: true, id, file, cancel }`. `cancel()` is idempotent: unwatch, mark the record `status: "answered", answer: "deny"` if it is still pending, and send the reject option once (`reject_once`, else `reject_always`, else `{ outcome: "cancelled" }`) unless an answer was already delivered.
   - `watchForAnswer`: when the record file is missing or unreadable, call `cancel()`.
   - Every `send(...)` inside the watcher sits in `try/catch`; a throw is swallowed after unwatching.
   - `runner.mjs`: keep each held result in `this.held = new Set()` on the ACP session; remove it once answered. In `cancel()` (runner.mjs:730-733), the idle timeout (695-699), `child.on("close")` (557-562) and `turn()`'s `finally` (723-726), call `cancel()` on every remaining held entry and clear the set. `cancel()` must still let the turn end (no wedge).
   - Tests in `test/approvals.test.mjs`: (a) deleting a held record's file rejects the request and stops the watcher; (b) `cancel()` on a held entry sends a reject once, marks the record answered `deny`, and `listHeld` no longer lists it; (c) a throwing `send` does not throw out of the watcher; (d) calling `cancel()` twice sends once.
2. **Approval answer errors are shown (finding 2).** In `threads.js:709-718` and `peek.js:172-181`, run `bh approvals answer` through `bh([...args, "--json"], { cwd: projectDir() })` (the same `bh` helper `bh.js` exports), parse stdout even when the exit code is not 0, and when `code !== 0 || parsed?.ok === false` unfold the card and set `this.problem` to `parsed?.error ?? "That approval could not be answered."`. Ignore `implemented === false` as today.
3. **Queued rows stay visible when the composer folds (finding 3).** `isFolded()` in `composer.js:1594-1596` returns false while `this.queuedMessages.length > 0`.
4. **Fold works in Verbose (finding 4).** In `threads.js:759, 782-785`, Verbose opens machine entries by default, and a Fold click on one closes it: track Verbose closes in a `this.verboseFolded = new Set()` keyed like `this.expanded`, cleared when the mode or thread changes.
5. Pure-helper tests for 2–4 in `test/m6-ui.test.mjs` where the logic is extractable.

## Constraints
No new dependencies, no refactors beyond these items, no loosening or deleting tests. Don't commit. Do NOT run `bh goal verify`.

## Done when
- Items 1–5 fixed, with `file:line` in the report.
- `/home/athi/bot-herdr/node_modules/.bin/tsc --noEmit -p mods/bot-herdr/jsconfig.json` clean; `node mods/bot-herdr/engine/bh.mjs check` PASS; `npm test` exit 0; `/home/athi/.local/bin/herdr-app check mods/bot-herdr` passes (then delete the regenerated `mods/bot-herdr/engine/lib/gpui-kit.d.ts`); `BH_APP_HOME=$(mktemp -d) node mods/bot-herdr/engine/bh.mjs ui-audit --json` prints `pass: true`.
- **Run every check in the foreground (timeout 600) and wait for it. Your turn must not end while any command is still running; nothing will wake you for a background command.**

## If stuck
If the ACP session cannot answer a held request on cancel, stop that part, do the rest, and report it as a blocker. Never invent a different shape.

Report to `.bot-herdr/tasks/t-20261121-td97/reports/dev-m6fix.md`, then `bh report t-20261121-td97 --step 6 --file <that> "<summary>"`.
