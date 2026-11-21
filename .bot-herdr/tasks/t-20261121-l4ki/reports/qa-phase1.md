## Summary
Verdict: **CHANGES_REQUIRED** (Phase 1 — Steps 1–2 Chat stability).
All 9 UI chat fixes, the append-only `.jsonl` event log contract, `safeOn`, `npm test` (398/399 pass), `bh check` (PASS), and `tsc` (0 TS2304/TS2552 outside `engine/`) pass, but `stripUnsafeEscapes()` has a reproducible nesting/C1 security bypass that lets untrusted harness text emit live OSC 7501 / OSC 52 sequences to stdout.

## Findings

- **[major] `stripUnsafeEscapes()` is bypassable via nested/split OSC/DCS sequences and misses C1 controls — `mods/bot-herdr/engine/lib/agent.mjs:204-208`**
  - **Expected**: Untrusted harness text passed through `stripUnsafeEscapes()` can never emit a live OSC (including OSC 7501 status or OSC 52 clipboard) or DCS sequence to stdout.
  - **Observed**: Single-pass regex replacement removes an inner sequence and joins the outer fragments into a valid, live OSC sequence. C1 8-bit OSC/DCS/ST (`\x9d`, `\x90`, `\x9c`) and unterminated introducers (`\x1b]`, `\x1bP`) also pass through intact:
    - `stripUnsafeEscapes("\x1b]7501;state=\x1b]0;\x07done\x07")` → `"\x1b]7501;state=done\x07"`
    - `stripUnsafeEscapes("\x1b]7501;state=\x1bP\x1b\\done\x07")` → `"\x1b]7501;state=done\x07"`
    - `stripUnsafeEscapes("\x1b]7501;state=done\x9c")` → `"\x1b]7501;state=done\x9c"`
    - `stripUnsafeEscapes("\x9d7501;state=done\x9c")` → `"\x9d7501;state=done\x9c"`
  - **Reproduce**: `node -e "import('./mods/bot-herdr/engine/lib/agent.mjs').then(({ stripUnsafeEscapes }) => console.log(JSON.stringify(stripUnsafeEscapes('\x1b]7501;state=\x1b]0;\x07done\x07'))))"` prints `"\u001b]7501;state=done\u0007"`.
  - **Fix**: Loop OSC (`\x1b]` / `\x9d`) and DCS (`\x1bP` / `\x90`) removal (matching terminators `\x07`, `\x1b\\`, `\x9c`, or end-of-string) until fixed point, and strip any leftover bare introducers (`\x1b]`, `\x1bP`, `\x9d`, `\x90`); add regression assertions in `test/chat-engine.test.mjs`.

- **[minor] Three secondary harness-error print paths bypass `stripUnsafeEscapes()` — `mods/bot-herdr/engine/lib/agent.mjs:238, 240, 390`**
  - `f.option`/`f.error` (from `AskUserQuestion` mockup failures), `err.message`, and `done.error` (from Claude `/compact` stderr) are printed via `say()` without `stripUnsafeEscapes()`.

- **[minor] Folded child entry IDs are never pruned from `this.justAdded` — `mods/bot-herdr/chat.js:206-209`**
  - When a child reply folds into a `kids-...` group, both `added.id` and `afterLast` (`kids-...`) are added to `this.justAdded`, while `view.list` only ever contains `kids-...`, leaving `added.id` in the Set for the session.

## Changes
No implementation or test files were modified by QA (review-only gate). Reviewed staged Phase 1 diff across 14 files (`mods/bot-herdr/engine/{bh.mjs,lib/agent.mjs,lib/runner.mjs}`, `mods/bot-herdr/{chat,composer,feed,live,questions,work}.js`, `test/{agents-reply,chat-engine,chat-ui,feed-items}.test.mjs`).

## Brief Check
- **Engine `.jsonl` single append-only source of truth (`{id,at,kind,name,space,text}`, `.jsonl` before `.md`, atomic trim > 400, `kind: "asked"`, `bh reply` → `.jsonl`)**: **Met** — verified in `agent.mjs:64-89, 502-509`, `bh.mjs:717-722`, and `test/chat-engine.test.mjs`.
- **OSC/DCS stripping on printed harness text**: **Not met** — see `[major]` nesting/C1 bypass in `agent.mjs:204-208`.
- **`safeOn` guarding runner listeners**: **Met** — verified in `runner.mjs:234-240, 290, 373, 414, 663` (all four harness paths guarded, zero raw `on(` calls left) and `test/chat-engine.test.mjs`.
- **All 9 UI chat glitches fixed**: **Met** — verified `this.lastPage` (no `this.page` shadowing), monotonic `push()` IDs past 300, monotonic `logNew` cursor with same-ms distinct IDs and `isDuplicateMd`, `scrollOnAdd` anchor preservation, `workerSignature` idle notifications without render-time timers, `resolveSpace` space attribution, `shouldSuppressSilent` + `readQuestions` ordering, `justAdded`/hover/composer-collapse/`heightKey` fixes, queued `outboxQueue` `sendText` bypassing open question cards and preserving user draft, `adopt()` in `poll()` with `matchAdopted`, shared `OpenQuestions` dismissals via `DISMISSED_QUESTIONS`, `activePage()` guard in `work.js`, and `fileKey` wait cleanup in `live.js`/`chat.js`. No GPUI forbidden APIs used.
- **Zero TS2304/TS2552 outside `engine/`, `npm test` 398/399 pass, `bh check` PASS**: **Met** — all three executed directly on the current tree (check receipts had stale diff hashes).

## Verification
- `timeout 300 npm test` — exit 0: 399 tests, 398 pass, 1 skipped (pre-existing no headless browser), 0 fail
- `timeout 240 node "/home/athi/.config/herdr-app/mods/bot-herdr/engine/bh.mjs" check` — exit 0: PASS (398 pass, 1 skipped, full suite)
- `timeout 120 npx -y -p typescript@5 tsc -p mods/bot-herdr/jsconfig.json --noEmit` — 0 TS2304/TS2552 errors outside `engine/`
- `node -e "import('./mods/bot-herdr/engine/lib/agent.mjs')..."` — reproduced nested-OSC, DCS-in-OSC, and C1 bypasses in `stripUnsafeEscapes()`
