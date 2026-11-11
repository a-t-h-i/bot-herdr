# Dev brief — steps 2 and 3 of t-20261110-p63g (engine replies + question cards)

## Goal
Make every harness's replies and question cards reach the bot-herdr chat reliably. You own steps 2 (Antigravity headless over ACP, never-silent turns) and 3 (question cards that work from every harness).

## Files
- Change: `mods/bot-herdr/engine/lib/runner.mjs` (ACP runner :250, text handling :302, `acpAllowed` :245, claude flags :129, ask tool_use :147), `mods/bot-herdr/engine/lib/agent.mjs` (ask card from tool_use :230), `mods/bot-herdr/engine/lib/team.mjs` (brief template :124), `mods/bot-herdr/engine/bh.mjs`, `mods/bot-herdr/engine/lib/ask.mjs` (:66-80 writes question cards), `test/*.test.mjs`.
- Read for context: `.bot-herdr/reports/dev-panel.md` (findings #8 and #13), `mods/bot-herdr/roster.js` (step 1 landed: `looksLikeInstructions`, `instructions` field).
- Leave alone: everything under `mods/bot-herdr/` that is a view (`look.js`, `work.js`, `pages.js`, `composer.js`, `chat.js`, `toast.js`, `working.js`, `route.js`, `settings.js`, `viewer.js`, `lightbox.js`) — Design owns those this week.

## What to do
### Step 2 — Antigravity over ACP + reply capture
1. Run Antigravity headless through its `agy acp` mode on the existing ACP runner (`runner.mjs:250`) instead of its CLI mode.
2. The ACP runner keeps the last non-empty text instead of clearing it at each tool call (`runner.mjs:302`).
3. Any turn (any harness) that ends without producing a reply leaves a chat entry reading exactly `(finished without a reply)`.

### Step 3 — question cards from every harness
4. When an ask (`bh ask` or AskUserQuestion tool_use) is seen, the asking agent's turn stops until the person answers; on answer the turn resumes with the answers. Choose the simplest mechanism that works per harness (e.g. for Claude headless, either end the turn on the ask or pass `--disallowedTools AskUserQuestion` so `bh ask` is the only path).
5. Fix the brief template (`team.mjs:124`) so told-to-ask agents get literal addresses (no `$HC_TERMINAL_ID` in a command line — standard access refuses `$`-commands, `acpAllowed` rejects `; & | < >`) and are told to use `bh ask --file <path>`, never heredocs.
6. Write `node:test` tests for: harness argv/parse changes you make, and reply capture (text kept across tool calls; empty-turn fallback entry).

## Contracts
- Question cards are files in `data/bot-herdr/questions/q-*.json` written by `engine/lib/ask.mjs:66-80`; the chat polls that folder. Keep that shape.
- Roster entries may carry `instructions: string` (step 1); don't change `roster.js` exports.
- Step 8 (later, not yours) will start Scout on Antigravity via your ACP path — keep `bh spawn <role>` working for the `antigravity` harness.

## Constraints
- No new dependencies. Don't touch view files. Don't commit (the Orchestrator commits).
- Don't weaken `acpAllowed`'s blocklist; route around it with `--file` forms.
- Windows: no `sh` assumptions; spawn must work with plain `node` argv (step 1 pattern).

## Done when
- `bh spawn research` on the `antigravity` harness starts through ACP and its reply text appears in the chat.
- A turn that produces no reply leaves `(finished without a reply)` in the chat.
- An ask issued from Claude headless (and one ACP harness) shows a card and the agent's turn waits for the answer.
- `npm test` passes, including your new tests.

## If stuck
If Antigravity's ACP mode needs settings you can't verify, or an ask path can't stop a turn cleanly on some harness, stop that item, do the rest, and report it as a blocker with what you tried. Never fake a reply or an answer.
