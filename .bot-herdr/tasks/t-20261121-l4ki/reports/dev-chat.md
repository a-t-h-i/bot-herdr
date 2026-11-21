## Summary
Chat engine now appends one atomic `{ id, at, kind, name, space, text }` event per turn to `replies/<key>.jsonl` before the display `.md`, logs `kind: "asked"` when a turn ends on a question, and `bh reply` no longer gets shadowed by an existing log. Untrusted harness text is stripped of OSC/DCS before stdout, and a throwing turn listener can no longer end a turn.

## Changes
- `mods/bot-herdr/engine/lib/agent.mjs`: added `stripUnsafeEscapes()` (OSC + DCS removed, SGR kept) and applied it to the four printed harness/stderr paths in `runTurn`/`finish`; `logReply()` now appends a complete `{ id, at, kind, name, space, text }` line via `appendJsonl` (unique id from `Date.now()` base36 + 4 random bytes) and only trims past `REPLY_LOG_MAX`, rewriting the newest half whole via the existing atomic `writeText` (temp file + `renameSync`); `finish()` writes `.jsonl` first with kind `stopped`/`error`/`reply` and then the `.md`, and logs `kind: "asked", text: ""` when the turn ended on a question card (so the wait clears and no silent note appears).
- `mods/bot-herdr/engine/bh.mjs`: `case "reply"` appends `kind: "reply"` (name from `--from`, else `--name`) to the log first, then writes the `.md`.
- `mods/bot-herdr/engine/lib/runner.mjs`: added `safeOn(on)` wrapper; `claudeTurn`, `codexTurn`, `piTurn` use it as `emit` and `Acp.turn` sets `this.on = safeOn(on)` (all `this.on` calls in `pickModel`/`message` are covered too).
- `test/agents-reply.test.mjs`: replaced the source assertion that pinned the old `.md`-before-`.jsonl` order with one that checks the log is written first.
- `test/chat-engine.test.mjs` (new): log shape/unique ids/atomic trim with no `.tmp` leftovers; OSC 7501, OSC 52, DCS stripping with SGR kept; `bh reply` appending when a log exists; `bh agent` turn ending on `bh ask` logging `asked` with `text: ""` and leaving `.md` unchanged; a throwing `on()` neither ending a turn nor dropping its reply (fake Claude harness).

## Brief Check
- `npm test` passes with 0 failures — 386 pass, 1 pre-existing browser skip, 0 fail (387 tests).
- `bh check` passes — PASS, 196 targeted tests, no lint/typecheck configured.
- `node --check` passes on every edited `.mjs` file — all six checked ok.
- Report via `bh report` and `hc send` — done after this file.

## Verification
- `node --test test/chat-engine.test.mjs test/agents-reply.test.mjs test/empty-reply.test.mjs` — 11 tests, 11 pass
- `npm test` (timeout 300) — 387 tests, 386 pass, 1 skip (no headless browser), 0 fail
- `bh check` — PASS, 196 tests, 0 fail
- `bh scripts run run_changed_tests --timeout 240` — PASS, 196 tests, 0 fail
- `node --check` on agent.mjs, runner.mjs, bh.mjs and the three test files — ok

## Knowledge Proposals
- A reply log event is `{ id, at, kind, name, space, text }`; `kind: "asked"` always has `text: ""` and exists so a reader clears its wait without posting a bubble. `logReply` is append-only and rewrites (atomically, newest half) only past `REPLY_LOG_MAX`.
