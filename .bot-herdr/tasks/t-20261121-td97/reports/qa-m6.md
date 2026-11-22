# QA M6 Gate & Final Full Audit (`qa-m6`)

## Summary

**CHANGES_REQUIRED.** The M6 contract (all 9 commands), all 7 M6 UI features, `ui-audit --json --shots` (`pass: true`, 0 failures, 104 PNGs), `tsc`, `herdr-app check`, `npm test` (686 pass, 0 fail, 1 skipped), and every rubric cell across all 14 pages and 6 animation cycles (>= 4) pass. One safety blocker fails Criterion 2 (**Approvals are safe**): `runner.mjs` discards `held.stop` (so `cancel()`/`hc interrupt`/Steer disables the idle watchdog while leaving a held ACP permission unanswered and leaking the watcher + pending file) and `approvals.mjs`'s `watchForAnswer` ignores a vanished approval file forever without rejecting. One secondary bug in approval error surfacing (`bhJson` swallows exit-1 `{ ok: false, error }`) should be fixed alongside it.

## Changes

None (review only). Report written to `.bot-herdr/tasks/t-20261121-td97/reports/qa-m6.md`; screenshots captured to `.bot-herdr/tasks/t-20261121-td97/shots/m6/`.

## Findings

### Blocking (Criterion 2 — Approvals are safe)

1. **Major — Held ACP permission can hang unanswered and leak watchers/zombie cards (`mods/bot-herdr/engine/lib/runner.mjs:557-562, 654-662, 695-699, 723-734`, `mods/bot-herdr/engine/lib/approvals.mjs:107-114, 160-185`)**
   - **Discard of `held.stop` on cancel/idle/close:** `maybeHoldPermission` returns `{ handled: true, id, file, stop }` (`approvals.mjs:163`), but `runner.mjs:661` (`if (held?.handled) return;`) drops `held.stop` completely.
     - When `cancel()` runs (`runner.mjs:730-733`, triggered by `hc interrupt`, Stop, or M6's **Steer** `Ctrl+Enter`), it calls `this.idle?.done()` (disabling the 30-minute idle watchdog) and sends `session/cancel` without responding to the held `session/request_permission` or calling `held.stop()`. An ACP harness blocked awaiting the JSON-RPC permission response before handling `session/cancel` can hang indefinitely with no reject path.
     - On `child.on("close")` (`runner.mjs:557-562`), idle timeout (`runner.mjs:695-699`), or `turn()`'s `finally` (`runner.mjs:723-726`), `held.stop()` is never called: `fs.watchFile` stays ref'd until the `bh agent` daemon exits, and `.bot-herdr/approvals/<id>.json` remains `status: "pending"` with `bh agent`'s still-live `pid`, leaving a zombie approval card in Home and Thread Conversation.
   - **Vanished approval file never rejects:** In `watchForAnswer` (`approvals.mjs:175-181`), if the pending approval file is deleted or becomes unreadable while held, `readJson(file, null)` returns `null` and `check()` silently returns. `bh approvals list` no longer shows the card (so the user has no UI/CLI path to deny it), yet the watcher keeps polling and never rejects the ACP request.
   - **Unguarded `send()` in `deliverAnswer`:** `approvals.mjs:110` calls `send(...)` inside the `watchFile` callback without `try/catch`; if the ACP child pipe closed meanwhile, a thrown error inside the watcher callback crashes the agent process.
   - **Exact fix:**
     - In `approvals.mjs`:
       - In `watchForAnswer`, detect missing file (`!existsSync(file)` / `curr.nlink === 0`), call `stop()` and deliver `"deny"` (or `{ outcome: "cancelled" }`); wrap `deliverAnswer`'s `send()` in `try/catch`; return a `cancel()` (or `stop({ reject: true })`) helper that unwatches, marks/removes the pending file if still `pending`, and delivers a reject/cancelled outcome once if not already answered.
     - In `runner.mjs`:
       - Track active held permissions on `Acp` (`this.heldPermissions = new Set()`), removing each once answered.
       - In `cancel()`, `idle` timeout, `child.on("close")`, and `turn()`'s `finally`, abort all remaining entries in `this.heldPermissions` (stop watching, clear pending record, and send `reject_once`/`cancelled` if the child is still alive) and resolve `this.idleStop?.()` on cancel if needed so the turn cannot wedge.
     - In `test/approvals.test.mjs`: add tests verifying (a) deleting a held approval file rejects the ACP request and stops the watcher, and (b) cancelling or closing `Acp` while a permission is held stops the watcher, rejects/cancels the ACP request, and removes it from `listHeld`.

### Non-blocking / Recommended with fix

2. **Minor (fix alongside #1) — UI approval error branch is unreachable dead code (`mods/bot-herdr/threads.js:709-718`, `mods/bot-herdr/peek.js:172-181`, `mods/bot-herdr/bh.js:37-45`)**
   - `contract-m6.md:17` specifies `bh approvals answer` exits `1` with `{ "ok": false, "error": "<plain sentence>" }` on error, and `approvals.mjs:200` sets `process.exitCode = 1`.
   - `bhJson` (`bh.js:39`) returns `null` whenever `r.code !== 0`, so `if (r && r.implemented !== false && r.ok === false)` in `threads.js:711` and `peek.js:174` can never run — a failed approval answer silently stays folded instead of unfolding and displaying `this.problem`.
   - **Fix:** Call `bh([...args, "--json"], { cwd: projectDir() })` directly for `approvals answer`, parse stdout even when `r.code !== 0`, and unfold + set `this.problem` when `r.code !== 0 || parsed?.ok === false` (while still ignoring `implemented === false`).
3. **Minor — Folded composer hides queued rows (`mods/bot-herdr/composer.js:1594-1596, 1625, 1670`)**: `isFolded()` ignores `this.queuedMessages.length`, so blurring the composer hides the `bh-queue-<n>` bar until refocused (queued messages still flush on the 1.5 s timer).
4. **Minor — Verbose mode ignores manual Fold toggle on machine entries (`mods/bot-herdr/threads.js:759, 782-785`)**: in Verbose mode, `open` is unconditionally `true`, so clicking Fold on a machine line toggles `this.expanded` with no visual effect.
5. **Carry-over minors from `qa-m45c` (non-blocking):** Minor 10 (`statusbar.js:40` `role("status")` state announcements), Minor 11 (legacy `roleWord` motions in `indicators.js`), Minor 12 (`activityMark` `VERB_SLOT` whitespace), Minor 13 (legacy `stateView(..., { loading: true })` dots on sub-tabs), Minor 15 (M4fix copy trims on `learning.js:268`, `issues.js:560,831`), Minor 16 (`ui-audit` Reduce-motion live check for `frozenGlyphs > 0`), Minor 18 (`look.js:328-331` `edge: true` 1 px focus ring shift).

## Brief Check

1. **Contract (`contract-m6.md`):** **Met.** Verified all 9 CLI commands live in an isolated temp git project:
   - `bh approvals list --json` → `{ approvals: [<12-key record>] }` (oldest first, dead pids filtered, worktree-shared via `store()`).
   - `bh approvals answer <id> once|project|deny --json` → `{ id, answer, ok: true }`; `project` writes `.bot-herdr/config.json` `{ agents: { allow: ["npm publish"] } }`; duplicate & unknown ids exit `1` with `{ ok: false, error }`.
   - `bh review diff <task> <path> --json` → `{ path, truncated: false, hunks: [{ header, lines: [{ kind, old, new, text }] }] }`.
   - `bh review add|list|remove|send <task> ... --json` → exact contract shapes; `send` posts one board `note` (`from: "user"`, `to: "dev"`, `Review comments:\n- <path>:<line> — <text>`), marks `sent`, and returns `{ sent: 0, entry: null }` when none open.
   - `bh thread fork <id> "<carry>" --title T --json` → `{ id, forkOf }`, persists `forkOf` and `<carry>\n\nForked from <id>: <parent title>.`; `bh thread show <id> --json` includes `forkOf`, `forks: [{ id, title, state }]`, and `children`.
2. **Approvals are safe:** **NOT MET** (see Major #1 above). Verified passing parts:
   - Held only when `access !== "full"` and autonomy is `ask`/`guarded` (`runner.mjs:654`, `approvals.mjs:12,141-143`); under `autonomous`, returns `{ handled: false }` and rejects immediately (`runner.mjs:663-668`).
   - Synchronous broken hook falls through to reject via `try/catch` (`runner.mjs:656-660`).
   - `project` adds the exact trimmed command only (`approvals.mjs:41-54,93`), empty strings ignored, and `acpAllowed` (`runner.mjs:495-502`) is unmodified (still rejects chained shell operators `[;&|\`$<>]\n`).
   - Deny sends `reject_once` (fallback `reject_always`) and emits the exact `Refused (Agent access is standard): ...` tool line (`approvals.mjs:103,107-113`).
   - **Fails:** dead/vanished watcher file and `cancel()`/`close()`/`finally` hold lifecycle (Major #1).
3. **Each M6 feature works as its brief says:** **Met** (code + unit tests + `ui-audit` + screenshots):
   - **Approval card:** `approvalcard.js:16-107`, `threads.js:695-748`, `peek.js:112-183,249-260`, `home.js:145-156` — 3 buttons (`bh-approval-<id>-once|project|deny`), primary only on first card's `Allow once`, keys `1`/`2`/`3` on card focus and in Peek, folded mono command via `machinetext.js`, `MOTION.fold` collapse (instant under Reduce motion).
   - **Diff review:** `diffreview.js:34-189`, `threads.js:853-986`, `threadview.js:387-471` — in-place expand (`bh-diff-<path>`), mono `+`/`−` in `stateDone`/`stateFailed` (no fills), muted line numbers, click/Enter inline comment (`bh-diff-line-<path>-<new>`), Save/Cancel (Enter/Esc), comments with Remove (`bh-review-comment-<id>`), `Send to Dev · N` (`bh-review-send`) hidden at 0, "Open diff" kept.
   - **View modes:** `threads.js:76,333-336,552-561,668-673,729-786`, `threadview.js:474-504`, `keymap.js:28` — `bh-view-mode` (`summary|normal|verbose`), Normal default, per-thread memory, `v` cycles when not typing, Summary shows `bh-thread-summary` + needs-you/decisions/done as 1 line, Verbose unfolds all text & machine text.
   - **Thread map + Forked from:** `threadmap.js:14-134`, `threads.js:618-640,656,674-678`, `threadview.js:507-554`, `chat.js:1148` — `bh-thread-map`, `bh-thread-map-<name|id>`, parent + children (avatar, name, state glyph, step) + forks (title, state), Space peeks, Enter opens, hidden when empty, clickable muted `Forked from <title>` (`bh-thread-fork-of`).
   - **Fork input:** `threads.js:319-323,564-615,654`, `threadview.js:557-566` — `bh-thread-fork` secondary button opens `bh-fork-input` prefilled with summary line, Enter runs `bh thread fork` and opens new thread, Esc cancels.
   - **Queue/Steer:** `composer.js:260,276,1240-1306,1383-1387,1670-1733,2038`, `signals.js:164-189` — Enter queues while working (`bh-queue-<n>` with Remove, flushed via `hc send` on idle), `Ctrl+Enter` / `bh-steer` runs `hc interrupt` then `hc send`, placeholder updated, idle sends normally.
   - **Tile toggle:** `agents.js:117-134,168-180`, `signals.js:219-269`, `layouts/bot-herdr.json:204` — `bh-agents-tile` in Agents › Terminals toggles side-by-side `{ terminal }` layout blocks via `layout.set` (confirmed supported in `~/.config/herdr-app/AGENTS.md:224-225` and `herdr.d.ts:80`).
4. **No regression on `qa-m45c`, fixtures & tests intact:** **Met.**
   - `git show 8c47948 -- mods/bot-herdr/engine/lib/ui-audit-fixtures.mjs` adds fixture seeding only (`page.approvals`, `page.reviewComments`, `page.expandedDiffs`, `page.diffs`) and loosens nothing in `ui-audit.mjs`, `ui-audit-spec.mjs`, or `ui-audit-baseline.json`.
   - `test/pre-m1-foundation.test.mjs` and `test/headless.test.mjs` updated obsolete pre-M6 placeholder/autonomy assumptions without deleting or weakening coverage; 4 new test files added (`674 → 687` tests).
   - `ui-audit` reports `pass: true`, `failures: []`, `renderErrors: {}`, 0 hex outside `look.js`, 16/16 themes contrast-clean, all 8 Fix counters at target, 100% keyboard & label coverage, 8/8 P1 features present, all pages under M1 baselines.
5. **Rubric:** **Met** (every page cell and every animation cycle cell >= 4 — see below).

## Rubric (1–5; PASS needs every cell >= 4)

Backed by `ui-audit` JSON (`pass: true`, 16/16 themes, 26 pages), source inspection, and visual inspection of `shots/m6/` across `graphite`, `paper`, `ink`, and `moss`.

### Pages (7 Principles + 6 Keep traits)

| Page | P1 needs-you | P2 one accent | P3 hide empty | P4 summary→detail | P5 agent colour | P6 machine folded | P7 keys & phone | Keep (warm/coral, avatars, plain copy, choice cards, typed board, cost/autonomy) |
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

All 112 page cells >= 4.

### Working Animation Cycles (6 cycles)

| Cycle (`working.js:141-148`) | Distinct | 120 ms steady | Zero layout shift | Frozen under Reduce motion |
| --- | --- | --- | --- | --- |
| Thinking (`⠁⠂⠄⡀⢀⠠⠐⠈`) | 5 | 5 | 4 | 5 |
| Reading / searching (`▖▘▝▗`) | 5 | 5 | 4 | 5 |
| Editing files (`▁▃▅▇▅▃`) | 5 | 5 | 4 | 5 |
| Running tests or checks (`▱▱▱`…`▰▰▰`) | 4 | 5 | 4 | 5 |
| Waiting on another agent (`· • ● •`) | 4 | 5 | 4 | 5 |
| Orchestrating (`◜◝◞◟`) | 4 | 5 | 4 | 5 |

All 24 animation cells >= 4 (`test/working.test.mjs` 6/6 pass; `ui-audit` `animation: { workingCycles: 2, glyphSlots: 2, ticks120: 2, frozenGlyphs: 0 }`; `.spring(` gated in `look.js:268`).

## Verification

- `timeout 600 /home/athi/bot-herdr/node_modules/.bin/tsc --noEmit -p mods/bot-herdr/jsconfig.json` — exit 0 (0 errors)
- `timeout 600 /home/athi/.local/bin/herdr-app check mods/bot-herdr && rm -f mods/bot-herdr/engine/lib/gpui-kit.d.ts` — exit 0 (`check passed: mods/bot-herdr`; regenerated `gpui-kit.d.ts` removed)
- `timeout 600 node mods/bot-herdr/engine/bh.mjs check` — `NO CHECKS` on clean QA worktree; `node mods/bot-herdr/engine/bh.mjs check --base 741e079` ran full 687 tests (686 pass, 0 fail, 1 skipped; typecheck sub-step skipped only because the QA worktree lacks `node_modules`, verified clean via main repo `tsc` above)
- `timeout 600 npm test` (solo) — exit 0 (687 tests: 686 pass, 0 fail, 1 skipped, 128.9 s)
- `BH_APP_HOME=$(mktemp -d) timeout 600 node mods/bot-herdr/engine/bh.mjs ui-audit --json --shots .bot-herdr/tasks/t-20261121-td97/shots/m6` (solo) — exit 0, `pass: true`, `failures: []`, `renderErrors: {}`, `hexOutsideTokens: 0`, `accentButtonsPerView: 1`, `keyboardPathCoverage: 1`, `accessibleLabelCoverage: 1`, 16/16 themes contrast-clean, 8/8 P1 features present, all pages under M1 baseline (`thread-conversation` 160 < 228, `thread-changes` 149 < 167), 104 PNGs saved
- Temp-project live contract verification (`verify-contract.mjs` against `node mods/bot-herdr/engine/bh.mjs`) — exit 0 (`ALL_CONTRACT_CHECKS_PASSED` across all 9 M6 commands + error exit codes)
- Screenshots visually inspected in `.bot-herdr/tasks/t-20261121-td97/shots/m6/`: `thread-conversation-{graphite,paper,ink,moss}`, `thread-changes-{graphite,paper,ink,moss}`, `home-{graphite,paper,ink,moss}`, `threads-graphite`, `thread-plan-graphite`, `thread-steps-graphite`, `agents-fleet-{graphite,paper}`, `agents-terminals-{graphite,paper}`, `library-{knowledge,learning,scripts,issues}-graphite`, `library-issues-paper`, `settings-{graphite,paper}`, `settings-general-graphite`, `settings-usage-{graphite,paper}`, `peek-{graphite,paper,ink,moss}`
