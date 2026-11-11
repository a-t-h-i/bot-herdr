# Dev brief — QA fix round 1, engine (t-20261110-p63g, step 16)

## Goal
The QA gate (`.bot-herdr/tasks/t-20261110-p63g/reports/qa-gate.md`, read its Findings) returned CHANGES_REQUIRED. Fix the engine findings below so that an agent's `bh ask` always produces its question card before the turn ends, and the classifier's Off switch is honoured.

## Files
- Change: `mods/bot-herdr/engine/lib/runner.mjs`, `mods/bot-herdr/engine/classifier/index.mjs`, `test/headless.test.mjs`, `test/acp-reply.test.mjs`, `test/knowledge-classifier.test.mjs` (or the test file that already covers the code you touch).
- Leave alone: every file directly under `mods/bot-herdr/` (views are Design's, being changed now), `install.mjs`, `engine/lib/workspace.mjs`.

## What to do
1. [critical] ACP harnesses, `runner.mjs` ~:348-351 and ~:362-366. Today a `session/request_permission` for a command that is `bh ask` is answered `{"outcome":"cancelled"}` and `session/cancel` is sent, so the command never runs and no card is made; the `tool_call` branch also sends `session/cancel` as soon as the call is announced. Change it:
   - A permission request whose command is a `bh ask` call (the same test the code uses today to recognise an ask) is ALLOWED, in every access level, with the same allow outcome shape the code already uses for an allowed command.
   - Do not send `session/cancel` when the ask is announced or permitted. Remember the tool call's id (`this.askCall = <toolCallId>`), and send `session/cancel` (and mark the turn `asked`) only when a `tool_call_update` for that id arrives with status `completed`. If it arrives with status `failed`, do not mark `asked` and do not cancel: let the turn go on so the agent's own words reach the chat.
2. [major] One-shot harnesses, `runner.mjs` ~:155-157, :189, :212, :239-241. Today `oneShot` stops the process as soon as the `bh ask` tool call STARTS (Claude's assistant `tool_use`, Codex's `item.started`, pi's `tool_execution_start`), which kills `bh ask` before it writes the card. Change each to stop only when that tool call has FINISHED: Claude's `user` message carrying the `tool_result` for that `tool_use` id, Codex's `item.completed` for that item, pi's `tool_execution_end`. Claude's own AskUserQuestion tool keeps its current behaviour (the card is made from the event itself; stop at once).
3. [major] `engine/classifier/index.mjs:124`: `enabled` is true for kind jev/laya/clef even when `config.enabled` is false. Gate on `config.enabled` alone, as it was before this task: with `enabled: false` nothing is sent to any outside API or harness, whatever the kind.
4. [minor] `runner.mjs` and `test/headless.test.mjs` were saved with a UTF-8 BOM and have mojibake in comments (`Settings â†’ Agent access`, `â”€â”€`, at runner.mjs :10, :117, :262 and one place in headless.test.mjs). Remove the BOM and restore the characters (`→`, `──`); compare with `git show HEAD:<file>` for the original text.
5. Tests:
   - ACP: feeding `session/request_permission` for `node "<BH>" ask --file q.md` in standard access answers with an allow outcome and sends no `session/cancel`; a following `tool_call_update` with status completed for that id sends `session/cancel` and the turn reports `asked`.
   - One-shot Claude stream: the `tool_use` of a Bash `bh ask` does not stop the child; its `tool_result` does.
   - `makeClassifier({ enabled: false, kind, key: "k" }).enabled("lobby")` is false for kind `jev`, `laya` and `clef`, and true with `enabled: true`.

## Constraints
No new dependencies. No view files. No commits. No refactors beyond these items. Do not widen what `acpAllowed` permits beyond the `bh ask` call.

## Done when
- `npm test` passes with the new tests.
- The first three bytes of `mods/bot-herdr/engine/lib/runner.mjs` and `test/headless.test.mjs` are not `EF BB BF`; `grep -n "â" mods/bot-herdr/engine/lib/runner.mjs test/headless.test.mjs` prints nothing.
- Your report answers items 1-5 as met / not met with `file:line`.

## If stuck
When the code does not match this brief, stop that item, finish the others and report what you found with `file:line`. Never guess at a harness's event names: read the existing parser in `runner.mjs` and the fixtures in `test/headless.test.mjs`.
