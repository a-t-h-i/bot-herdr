# QA M6 re-gate + final full audit (`qa-m6b`)

## Summary

**PASS.** qa-m6 Finding 1 is fixed: a held ACP permission is now rejected once on cancel, idle timeout, child close, turn end, `close()`, and a missing or unreadable record, and the turn still ends. Findings 2–4 are fixed as briefed. Nothing regressed, and every rubric cell is still >= 4. The fix landed in commit `fdcd582`; `HEAD~1` has no code diff, so I reviewed that commit.

## Changes

None (review only). Shots are in `.bot-herdr/tasks/t-20261121-td97/shots/m6b/` (104 PNGs). The throwaway probe is in `/tmp/qa-m6b-probe/probe.mjs`, outside the repo.

## Brief Check

1. **Finding 1 fixed: met.**
   - `approvals.mjs:185-228`: `watchForAnswer` returns an idempotent `cancel()` guarded by `done`. It unwatches, runs `markDenied` (so a record still `pending` becomes `answered`/`deny` under `withLock`), then delivers `deny` exactly once. That uses `reject_once`, then `reject_always`, then `{outcome:"cancelled"}` (`pickOption` at `:99-104`).
   - `approvals.mjs:220-222`: a missing file or a non-object record triggers `cancel()`. `writeJson` writes a temp file and renames it (`core.mjs:90-95`), so a normal answer can never be read half-written and mistaken for a vanished file. Nothing in the engine deletes approval files, so an answered record cannot vanish before it is read.
   - `approvals.mjs:110-121`: `send` and `on` sit in `try/catch`. `settle`/`cancel` call `onDone` in `finally`.
   - `runner.mjs`: a held entry is added to `this.held` (`:668-671`) and removed by `onDone` (`:664`). `cancelHeld()` (`:692-699`) runs in all five places:
     - `child.on("close")` (`:562`)
     - idle watchdog (`:718`)
     - `turn()` `finally` (`:748`)
     - `turn().cancel()` (`:758`), which also sets `this.cancelled` and calls `idleStop?.()` so the turn ends as `{cancelled:true}` (`:728, :740`)
     - `close()` (`:766`)
   - Tests in `test/approvals.test.mjs:212-377`, all passing:
     - (a) deleted file
     - (b) cancel sends a reject, marks the record `deny`, and drops it from `listHeld`
     - (c) a throwing `send`, both in the watcher and in cancel
     - (d) a double cancel sends once
     - fallback order
     - `Acp` turn cancel without wedging
   - The idle, `finally` and close paths have no unit test of their own. My probe exercised them directly:
     - idle 150 ms: the turn ended with an `error`, `held` was 0, the record was not listed, and a deny was sent
     - `finally` after `end_turn` with a permission still held: same result
     - `cancelHeld`: same result
     - answered then cancelled: only the user's `once` was sent, no second answer
2. **Findings 2–4 fixed: met.**
   - F2: `peek.js:22-35` `approvalAnswerError` parses stdout on any exit code, ignores `implemented:false`, and falls back to the sentence the brief specifies. `peek.js:187-199` and `threads.js:726-738` use `bh([...args,"--json"])`, unfold the card and set `problem`.
   - F3: `composer.js:158-160, 1599-1607` keeps the composer unfolded while `queuedCount > 0`.
   - F4: `threads.js:54-67, 89, 257, 576, 777-806` adds `verboseFolded`, cleared when the thread or the mode changes. `toggleEntryOpen` toggles it in Verbose.
   - Helper tests: `test/m6-ui.test.mjs` (3 new tests).
3. **No regression: met.**
   - The only lines removed from tests are the `.stop` → `.cancel` rename and an import line. No test was deleted or loosened.
   - The contract JSON shapes are unchanged: the diff does not touch the CLI output in `approvals.mjs`.
   - The 7 M6 features are still present (`ui-audit` features all `present: true`, `approvalCard` included).
   - Test count went from 687 to 694.
4. **Rubric: met.** Rescored below; every cell is >= 4.

## Rubric (1–5; PASS needs every cell >= 4)

Evidence: `ui-audit` JSON (`pass: true`, 16/16 themes contrast-clean, `hexOutsideTokens: 0`, `accentButtonsPerView: 1`, keyboard and label coverage 1, all 8 Fix counters at target, all pages under the M1 baseline). I looked at `thread-conversation-graphite`, `home-graphite`, `peek-paper` and `thread-changes-paper`. This round touched no layout, and the scores match qa-m6.

| Page | P1 | P2 | P3 | P4 | P5 | P6 | P7 | Keep |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Home | 5 | 5 | 4 | 5 | 5 | 5 | 4 | 5 |
| Threads list | 5 | 5 | 5 | 5 | 5 | 5 | 4 | 5 |
| Thread › Conversation | 5 | 5 | 4 | 5 | 5 | 5 | 4 | 5 |
| Thread › Plan | 4 | 4 | 4 | 4 | 5 | 4 | 4 | 4 |
| Thread › Steps | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 |
| Thread › Changes | 4 | 5 | 5 | 5 | 5 | 5 | 4 | 5 |
| Agents › Fleet | 4 | 5 | 4 | 4 | 5 | 5 | 4 | 5 |
| Agents › Terminals | 4 | 5 | 5 | 4 | 5 | 5 | 4 | 4 |
| Library › Knowledge | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 |
| Library › Learning | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 |
| Library › Scripts | 4 | 5 | 4 | 4 | 5 | 4 | 4 | 4 |
| Library › Issues | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 |
| Settings + Usage | 4 | 4 | 5 | 4 | 4 | 4 | 4 | 5 |
| Peek drawer | 5 | 5 | 4 | 5 | 5 | 5 | 4 | 5 |

| Cycle | Distinct | 120 ms | Zero shift | Frozen (Reduce motion) |
| --- | --- | --- | --- | --- |
| Thinking | 5 | 5 | 4 | 5 |
| Reading / searching | 5 | 5 | 4 | 5 |
| Editing files | 5 | 5 | 4 | 5 |
| Running tests | 4 | 5 | 4 | 5 |
| Waiting on agent | 4 | 5 | 4 | 5 |
| Orchestrating | 4 | 5 | 4 | 5 |

`ui-audit` animation values: `{workingCycles:2, glyphSlots:2, ticks120:2, frozenGlyphs:0}`.

## Carried-over minors (non-blocking)

- **New A:** `test/approvals.test.mjs` has no unit test that drives the idle-timeout, `finally` or child-close paths through `Acp`. Only turn cancel is covered. All three were verified by the probe above. One test that calls `turn({idleMs:150})` would pin the idle path.
- **New B:** a held permission cancelled by an interrupt, idle timeout or close posts `Refused (Agent access is standard): …` (`approvals.mjs:116-118`). That wording reads as a user deny. Plainer copy for cancellations would help.
- From qa-m45c: Minors 10, 11, 12, 13, 15, 16, 18 are unchanged.

## Verification

- `timeout 600 /home/athi/bot-herdr/node_modules/.bin/tsc --noEmit -p mods/bot-herdr/jsconfig.json` — exit 0
- `timeout 600 /home/athi/.local/bin/herdr-app check mods/bot-herdr` — `check passed`. I deleted the regenerated `gpui-kit.d.ts`, and the tree is clean.
- `node mods/bot-herdr/engine/bh.mjs check` — `NO CHECKS`, because the QA worktree is clean against its base.
- `node mods/bot-herdr/engine/bh.mjs check --base 6849545` — 102/102 targeted tests pass. Its typecheck sub-step reports `FAIL` only because `typescript is not installed` in this worktree. `tsc` run from the main repo is clean (first line).
- `timeout 600 npm test` — exit 0: 694 tests, 693 pass, 0 fail, 1 skipped.
- `BH_APP_HOME=$(mktemp -d) node mods/bot-herdr/engine/bh.mjs ui-audit --json --shots .bot-herdr/tasks/t-20261121-td97/shots/m6b` — exit 0, `pass: true`, `failures: []`, `renderErrors: {}`, 104 PNGs.
- `node /tmp/qa-m6b-probe/probe.mjs <worktree>` — the idle, `finally` and `cancelHeld` paths each denied the request and cleared `held` and the record. Answered-then-cancel sent one answer. [throwaway probe]

## Knowledge Proposals

- The code for a fix round can sit in `HEAD~2`, with `HEAD~1` holding only the brief. Find it with `git log --stat`, then gate with `bh check --base <commit before the fix>`.
