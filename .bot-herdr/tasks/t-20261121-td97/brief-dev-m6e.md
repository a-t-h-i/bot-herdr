# Dev brief — M6 engine (approvals, review comments, fork)

Task t-20261121-td97, step 6 (engine half). Goal: build the engine side of three M6 features so the UI (built in parallel by dev-m6u against the same contract) works live: the three-choice approval card, diff review with inline comments, and Handoff & fork. Spec: `.bot-herdr/tmp/design-language-spec.md` › **Features borrowed from leading harnesses**. Plan: step 7 of `/home/athi/bot-herdr/.bot-herdr/plans/p-20261121-siir/plan.md`. Recon with file:line: `/home/athi/bot-herdr/.bot-herdr/tasks/t-20261121-td97/reports/scout-m6.md`.

**The contract is `.bot-herdr/tasks/t-20261121-td97/contract-m6.md`. Implement it letter for letter: names, commands, JSON shapes, file paths.**

## Files
Change only: `mods/bot-herdr/engine/lib/approvals.mjs`, `mods/bot-herdr/engine/lib/review-comments.mjs`, `mods/bot-herdr/engine/lib/thread.mjs`, `mods/bot-herdr/engine/lib/runner.mjs` (lines 642-668 and the `allow` merge only), `mods/bot-herdr/engine/lib/tasks.mjs` (only to accept and store `forkOf` in `newTask`, tasks.mjs:231), `mods/bot-herdr/engine/lib/ui-audit-fixtures.mjs` (add fixture data only), `mods/bot-herdr/engine/bh.mjs` (help lines for the new subcommands only), new tests `test/approvals.test.mjs`, `test/review-comments.test.mjs`, `test/thread-fork.test.mjs`.
Leave alone: every UI file under `mods/bot-herdr/*.js` (dev-m6u owns them), `core.mjs` (do not change `accessOf`), `install.mjs`, `ui-audit.mjs`, `ui-audit-spec.mjs`, `ui-audit-baseline.json`, the built-in check scripts.

## What to do
1. **Approvals** (`approvals.mjs`): replace the placeholders with the contract's store, `bh approvals list|answer`, `listHeld(root)`, `projectAllow(root)` and `maybeHoldPermission`. Resolve the project root with `projectRoot()` (`core.mjs:59`). Autonomy comes from `resilienceConfig()` (`resilience.mjs:84`); hold only under `ask` or `guarded`. Watch the record with `fs.watchFile` (500 ms) and stop watching once answered or when the runner exits. A record whose `pid` is dead is not listed. Corrupt files are skipped, never thrown.
2. **Runner** (`runner.mjs:642-668`): pass the project root into the hook; merge `projectAllow(root)` into the `allow` given to `acpAllowed`. Keep the existing try/catch fall-through to reject. On answer, send the picked option exactly like the existing `pick` code, and on deny post the same "Refused" tool line.
3. **Review comments** (`review-comments.mjs`): the contract's store and `bh review diff|list|add|remove|send`. Reuse `changesOf`'s base commit logic from `thread.mjs:435-463` (export a small helper there if needed rather than copying). Board posting through the same function `bh board post` uses.
4. **Fork** (`thread.mjs` + `tasks.mjs`): `bh thread fork`, plus `forkOf` and `forks` in `bh thread show`, per the contract.
5. **Fixtures** (`ui-audit-fixtures.mjs`): give the fixture project one pending approval (a live `pid`: use `process.pid`) on the fixture thread, a 2-file diff on the fixture thread's changes with 2 open review comments, one child and one fork, so the audit renders the M6 UI with real `bh` answers.
6. **Help** (`bh.mjs:81-82` area): one help line each for `bh approvals list|answer`, `bh review diff|list|add|remove|send`, `bh thread fork`.
7. **Tests**: store round-trips, dead-pid filtering, corrupt-file tolerance, `answer project` writing the allowlist, hold → answer → the right ACP option sent (use a fake `send`), `autonomous` not holding, diff parsing (add/del/ctx with line numbers, truncation), `send` posting one board note and marking sent, fork creating a linked task and `forks` listing it.

## Constraints
No new dependencies. No loosening or deleting tests or audit checks. No refactors beyond the items. Don't commit. Do NOT run `bh goal verify`.

## Done when
- Every command in the contract answers with the contract's JSON (show one real run of each in your report).
- `node mods/bot-herdr/engine/bh.mjs check` PASS (use `/home/athi/bot-herdr/node_modules/.bin/tsc --noEmit -p mods/bot-herdr/jsconfig.json` for the typecheck if the worktree lacks node_modules); `npm test` exit 0; `/home/athi/.local/bin/herdr-app check mods/bot-herdr` passes (then delete the regenerated `mods/bot-herdr/engine/lib/gpui-kit.d.ts`); `BH_APP_HOME=$(mktemp -d) node mods/bot-herdr/engine/bh.mjs ui-audit --json` exit 0 with no new render errors.
- Run each check in the foreground (Bash timeout 600000) and wait for it; your turn must not end while a check runs.

## If stuck
If the contract cannot be met as written (for example the ACP runner cannot keep a request open while it waits), stop that part, finish the rest, and report it as a blocker with the reason. Never invent a different shape.

Report to `.bot-herdr/tasks/t-20261121-td97/reports/dev-m6e.md`, then `bh report t-20261121-td97 --step 6 --file <that> "<summary>"`.
