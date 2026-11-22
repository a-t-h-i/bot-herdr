# Dev Report — M6 Fix Round (`dev-m6fix`)

## Summary

Cleared `qa-m6`'s blocking finding 1 (held ACP permissions now cancel idempotently on cancel, idle timeout, child close, turn `finally`, or vanished/unreadable record file, with `try/catch`-guarded `send`) and minors 2–4 (approval answer error surfacing, unfolded composer while queued messages exist, and Verbose-mode Fold toggling on machine entries). All checks pass: `tsc` (0 errors), `herdr-app check`, `ui-audit --json` (`pass: true`), `bh check` (102/102 targeted tests pass), and `npm test` (693 pass, 0 fail, 1 skipped).

## Changes

- `mods/bot-herdr/engine/lib/approvals.mjs:6,107-228` — `maybeHoldPermission` returns `{ handled: true, id, file, cancel }` (with optional `onDone` callback); `cancel()` is idempotent (unwatches, marks still-pending record `status: "answered", answer: "deny"` via `markDenied`, delivers reject once via `reject_once` → `reject_always` → `{ outcome: "cancelled" }`); `watchForAnswer` calls `cancel()` when the record file is missing or unreadable/invalid; `deliverAnswer` guards `send(...)` and `on?.(...)` in `try/catch`.
- `mods/bot-herdr/engine/lib/runner.mjs:530-531,559-565,657-672,692-768` — Added `this.held = new Set()`, `this.cancelled`, and `cancelHeld()` on `Acp`; held permissions are added to `this.held` and removed via `onDone` once settled; `cancelHeld()` runs on `child.on("close")`, idle timeout, `turn()`'s `finally`, `turn().cancel()`, and `close()`; `turn().cancel()` resolves `this.idleStop?.()` and marks `this.cancelled = true` so the turn exits `{ cancelled: true }` without wedging.
- `mods/bot-herdr/peek.js:13,22-35,187-199` — Exported `approvalAnswerError(r)` and updated `PeekDrawer.answerApproval` to run `bh([...args, "--json"], { cwd: projectDir() })`, parse stdout even on non-zero exit, ignore `implemented === false`, and unfold + set `this.problem` to `parsed?.error ?? "That approval could not be answered."` on failure.
- `mods/bot-herdr/threads.js:29,54-67,89,257,576,726-738,777-806` — Updated `Threads.answerApproval` to use `bh([...args, "--json"], ...)` + `approvalAnswerError`; added `this.verboseFolded = new Set()` (cleared on `openThread` and `setViewMode`) and exported `entryIsOpen` / `toggleEntryOpen` so Verbose opens machine entries by default and Fold toggles them cleanly.
- `mods/bot-herdr/composer.js:157-160,1599-1607` — Exported `composerIsFolded` and updated `Composer.isFolded()` to return `false` while `this.queuedMessages.length > 0`.
- `test/approvals.test.mjs:7,140-377` — Updated watcher cleanup to `.cancel` and added tests for deleted approval files, `cancel()` idempotency / reject fallbacks / `listHeld` removal, throwing `send` inside watcher & cancel, and `Acp` `this.held` + `turn().cancel()` non-wedging behaviour.
- `test/m6-ui.test.mjs:5-43,251-299` — Added pure-helper tests for `approvalAnswerError`, `composerIsFolded`, and `entryIsOpen`/`toggleEntryOpen`.

## Brief Check

1. **No held permission is ever left unanswered (finding 1):** **Met.** `approvals.mjs:107-228` (`maybeHoldPermission` returns `{ handled: true, id, file, cancel }`, idempotent `cancel()`, missing/unreadable file triggers `cancel()`, `send()` in `try/catch`); `runner.mjs:530-531,559-565,657-672,692-768` (`this.held` tracking, `cancelHeld()` on `cancel()`, idle timeout, `child.on("close")`, `turn()`'s `finally`, and `close()`; `cancel()` resolves `idleStop` without wedging); `test/approvals.test.mjs:212-377` covers (a)–(d) plus `Acp` turn cancel.
2. **Approval answer errors are shown (finding 2):** **Met.** `peek.js:22-35,187-199` and `threads.js:726-738` run `bh([...args, "--json"], { cwd: projectDir() })`, parse stdout regardless of exit code, ignore `implemented === false`, unfold and set `this.problem` to `parsed?.error ?? "That approval could not be answered."`.
3. **Queued rows stay visible when the composer folds (finding 3):** **Met.** `composer.js:158-160,1599-1607` returns `false` from `isFolded()` while `this.queuedMessages.length > 0`.
4. **Fold works in Verbose (finding 4):** **Met.** `threads.js:54-67,89,257,576,777-806` tracks Verbose closes in `this.verboseFolded = new Set()`, cleared on thread or view-mode change.
5. **Pure-helper tests for 2–4 in `test/m6-ui.test.mjs`:** **Met.** `test/m6-ui.test.mjs:251-299`.
6. **File & contract constraints:** **Met.** Only the 7 brief-named files modified (plus this report); `contract-m6.md` JSON shapes unchanged; no new dependencies; not committed; `bh goal verify` not run.

## Verification

- `timeout 600 /home/athi/bot-herdr/node_modules/.bin/tsc --noEmit -p mods/bot-herdr/jsconfig.json` — exit 0 (0 errors)
- `timeout 600 /home/athi/.local/bin/herdr-app check mods/bot-herdr && rm -f mods/bot-herdr/engine/lib/gpui-kit.d.ts` — exit 0 (`check passed: mods/bot-herdr`; regenerated `gpui-kit.d.ts` removed)
- `timeout 600 node mods/bot-herdr/engine/bh.mjs check` — 102/102 targeted tests pass across 11 covering test files (`check_changed` typecheck sub-step reports `typescript is not installed` only because the child worktree has no local `node_modules`; verified clean via main repo `tsc` above)
- `timeout 600 npm test` — exit 0 (694 tests: 693 pass, 0 fail, 1 skipped, 120.8 s)
- `BH_APP_HOME=$(mktemp -d) timeout 600 node mods/bot-herdr/engine/bh.mjs ui-audit --json` — exit 0 (`pass: true`, `failures: []`, 16/16 themes contrast-clean, 8/8 P1 features present)
