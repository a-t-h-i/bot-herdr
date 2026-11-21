## Summary
Fixed the Phase 1 OSC/DCS bypass: `stripUnsafeEscapes` now removes nested/split 7-bit and 8-bit C1 sequences to a fixed point and strips leftover bare introducers.
Applied it to the three secondary `say()` error paths and added regression assertions for all four bypass payloads plus unterminated introducers.

## Changes
- `mods/bot-herdr/engine/lib/agent.mjs`
  - New module-level `UNSAFE_SEQUENCE = /(?:\x1b[\]P]|[\x9d\x90])[\s\S]*?(?:\x07|\x1b\\|\x9c|$)/g`: OSC (`\x1b]`, `\x9d`) and DCS (`\x1bP`, `\x90`) with a lazy body up to BEL, ST, C1 ST or end-of-string, so a sequence nested in another is consumed with it.
  - `stripUnsafeEscapes` loops that replacement until a fixed point, then removes any surviving bare introducer (`/(?:\x1b[\]P]|[\x9d\x90])/g`); SGR (`\x1b[...m`) and ordinary text are untouched.
  - `askCard`: the "Couldn't draw question … option …: <error>" line and the "Couldn't ask: <message>" line are stripped over the whole composed message, so a sequence split across question/option/error fields cannot reassemble.
  - `compactIfPending`: the "Couldn't compact (<error>)" line is stripped around the harness error.
- `test/chat-engine.test.mjs`
  - Extended the OSC/DCS test with exact expectations for all four bypass payloads (`\x1b]…\x1b]0;\x07`, `\x1b]…\x1bP\x1b\\`, `\x1b]…\x9c`, `\x9d…\x9c`), SGR preserved around a C1 OSC, the four unterminated introducers (OSC/DCS 7-bit and 8-bit) and a trailing bare `\x1b]`, plus a `doesNotMatch` containment check that no introducer survives any payload.

## Brief Check
1. Fixed-point OSC/DCS loop with `\x07`/`\x1b\\`/`\x9c`/end-of-string terminators and leftover bare introducers — met: `stripUnsafeEscapes` loops `UNSAFE_SEQUENCE` to a fixed point and then strips `\x1b]`, `\x1bP`, `\x9d`, `\x90`.
2. All four bypass payloads can no longer emit live OSC/DCS — met: outputs are `"done\x07"`, `"done\x07"`, `""`, `""`; normal text and SGR stay (`\x1b[1mbold\x1b[0m\x1b[32mgreen\x1b[0m` test), asserted directly in `test/chat-engine.test.mjs`.
3. `stripUnsafeEscapes()` on the three secondary `say()` error paths (previously lines 238, 240, 390) — met, in `askCard` (two) and `compactIfPending` (one).
4. Regression assertions for 4 payloads + unterminated introducers — met.
5. `node --test test/chat-engine.test.mjs` and `bh check` pass — met.

## Verification
- `timeout 300 node --test test/chat-engine.test.mjs` — 5 tests, 5 pass, 0 fail.
- `timeout 300 bh check` — PASS: 398 pass, 1 skipped, full suite (399 tests); no lint/typecheck configured.
- `timeout 300 bh scripts run run_changed_tests` — PASS: 245 pass, 1 skipped.
- `git diff -- mods/bot-herdr/engine/lib/agent.mjs test/chat-engine.test.mjs` — inspected; only the changes above.

## Notes
- Per the brief, an unterminated introducer consumes the rest of that text; a BEL terminator can leave a bare `\x07` behind, which is not an OSC/DCS sequence.
- Nothing staged, committed or stashed; left for the Orchestrator.

## Knowledge Proposals
- None.
