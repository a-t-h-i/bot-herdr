## Summary
Verdict: **PASS** (Phase 1 — Steps 1–2 Chat stability, Round 2).
Both the Round 1 `[major]` `stripUnsafeEscapes()` nesting/C1 bypass and the `[minor]` three secondary `say()` paths are fixed in `mods/bot-herdr/engine/lib/agent.mjs` with regression tests in `test/chat-engine.test.mjs`, and all targeted, full-suite, and `tsc` checks pass with no regressions.

## Round 1 Findings Check
- **[major] `stripUnsafeEscapes()` nested/split OSC/DCS & C1 bypass (`mods/bot-herdr/engine/lib/agent.mjs:202-217`) — Addressed**:
  - `UNSAFE_SEQUENCE` (`/(?:\x1b[\]P]|[\x9d\x90])[\s\S]*?(?:\x07|\x1b\\|\x9c|$)/g`) runs in a fixed-point loop inside `stripUnsafeEscapes()`, followed by bare-introducer cleanup (`/\x1b[\]P]|[\x9d\x90]/g`).
  - Verified against all 4 Round 1 bypass payloads plus 8 additional adversarial payloads (split introducers `\x1b\x1b]0;\x07]7501...`, triple-nested split introducers, mixed 7-bit/8-bit C1, multiline OSC, unterminated introducers): zero OSC/DCS introducers survive; SGR styling and plain text stay intact.
  - Regression coverage verified in `test/chat-engine.test.mjs:66-82`.
- **[minor] Three secondary `say()` error paths bypassing `stripUnsafeEscapes()` (`mods/bot-herdr/engine/lib/agent.mjs:247, 249, 399`) — Addressed**:
  - `askCard()` now strips the full composed error line for both failed mockup draws (`agent.mjs:247`) and caught `err.message` (`agent.mjs:249`); `compactIfPending()` strips `done.error` (`agent.mjs:399`).
- **[minor] Folded child entry IDs retained in `this.justAdded` (`mods/bot-herdr/chat.js:206-209`) — Open (non-blocking minor)**:
  - Intentionally untouched in this targeted Round 2 fix; does not affect correctness or block PASS.

## Changes
No files were modified by QA (review-only gate). Verified unstaged Round 2 delta in `mods/bot-herdr/engine/lib/agent.mjs` and `test/chat-engine.test.mjs` alongside the staged Phase 1 files reviewed in Round 1.

## Brief Check
- **Round 1 `[major]` `stripUnsafeEscapes()` nested OSC/DCS and C1 security bypass fixed**: **Met** — fixed-point removal loop and bare-introducer strip in `mods/bot-herdr/engine/lib/agent.mjs:202-217`; verified by unit tests and 12 adversarial payloads.
- **Round 1 `[minor]` 3 secondary `say()` error paths sanitized**: **Met** — `askCard` (`agent.mjs:247, 249`) and `compactIfPending` (`agent.mjs:399`) wrap harness/error output in `stripUnsafeEscapes()`.
- **Regression-tested in `test/chat-engine.test.mjs` with no regressions**: **Met** — all 4 Round 1 bypasses, SGR preservation with C1, unterminated introducers, and containment regex checks added in `test/chat-engine.test.mjs:66-82`; 25/25 Phase 1 chat tests and 398/399 full suite tests pass.
- **Phase 1 acceptance criteria (all engine + 9 UI chat fixes, `npm test`, `bh check`, gpui-kit `tsc`)**: **Met** — Round 1 verified all other Phase 1 items; Round 2 confirmed no regressions on the current tree (`bh check` PASS, 0 `TS2304`/`TS2552` outside `engine/`).

## Verification
- `timeout 120 node --test test/chat-engine.test.mjs test/chat-ui.test.mjs test/feed-items.test.mjs test/agents-reply.test.mjs` — exit 0: 25 tests, 25 pass, 0 fail
- `timeout 300 node "/home/athi/.config/herdr-app/mods/bot-herdr/engine/bh.mjs" check` — exit 0: PASS (full suite `npm run test`: 399 tests, 398 pass, 1 skipped pre-existing headless browser test, 0 fail)
- `timeout 120 npx -y -p typescript@5 tsc -p mods/bot-herdr/jsconfig.json --noEmit` + `grep -E "error TS(2304|2552):"` — 0 `TS2304`/`TS2552` errors outside `mods/bot-herdr/engine/`
- `node -e` adversarial probe of `stripUnsafeEscapes()` across 12 nested/split/C1/multiline/unterminated payloads — exit 0, `bad: false` on all 12 cases
