# QA gate — t-20261110-p63g

## Summary
CHANGES_REQUIRED. `npm test` and `bh check` pass, but three defects block the gate. An ACP agent's `bh ask` is cancelled, so no card shows and nothing reaches the chat. The classifier's Off switch is ignored for Jev, Laya and Clef. The Knowledge page calls `.rotate()`, which gpui-kit does not declare.

## Changes
None by QA. No production code or tests were edited. The throwaway probe scripts live in `%TEMP%/qa-p63g/`.

## Findings

[critical] An ACP harness's `bh ask` is refused, so no card appears and the turn leaves nothing in the chat (`mods/bot-herdr/engine/lib/runner.mjs:362-366`, also `:348-351`)
Expected: `bh ask` from an ACP harness (Gemini, Qwen, opencode, Antigravity) shows a card, and the agent then waits (acceptance criterion 3).
Observed: in standard access, the permission request for the brief's own command (`node "<repo>/engine/bh.mjs" ask --file q.md`) gets the answer `{"outcome":"cancelled"}`, followed by `session/cancel`. The command never runs, so no question file and no card are created. The turn then returns `asked: true`, and `agent.mjs:273` skips the reply because `r.asked` is set. The person sees nothing at all. The `tool_call` branch (`:348`) also sends `session/cancel` as soon as the call is announced, which can abort the command before it runs when no permission is requested (full access).
Reproduce: build an `Acp` with access "standard", stub `send`, and feed it `session/request_permission` with `toolCall.rawInput.command = node "<BH>" ask --file q.md`. The output is `[{"id":7,"result":{"outcome":{"outcome":"cancelled"}}},{"method":"session/cancel",…}]`.
Fix direction: allow the `bh ask` call. End the turn only after the tool's result or completion update (`tool_call_update` with status completed), and only then send `session/cancel`.

[major] One-shot harnesses are killed on the `bh ask` tool call's *start*, before the command has run (`runner.mjs:155-157`, `:189`, `:212`, `:239-241`)
Expected: the card appears, then the turn ends.
Observed (by reading; a real harness can't be run here): `asksPerson` sets `turn.asked`, and `oneShot` calls `stop(child)` straight away. That is `taskkill /t /f` of the whole process tree. For Claude that happens on the assistant `tool_use` event, which comes before Claude Code checks permission and runs the tool. For Codex it is `item.started`, and for pi it is `tool_execution_start`. `bh ask` (a fresh node process) is very likely killed or never started, so there is no card and no chat entry (same `r.asked` path as above). AskUserQuestion is unaffected, because the card is made from the event itself.
Fix direction: stop after the tool's result: Claude's `user`/`tool_result`, Codex's `item.completed`, pi's `tool_execution_end`.

[major] The classifier's Off switch is ignored for Jev, Laya and Clef (`mods/bot-herdr/engine/classifier/index.mjs:124`)
Expected: Off means plain rules decide, and no chat text goes to an outside API ("falls back to rules … as today"; Settings says "Off: plain rules make these calls").
Observed: `enabled` is `config.enabled || kind === "jev" || "laya" || "clef" || canClassify(kind)`. With `enabled:false, kind:"jev", key:"…"`, `makeClassifier(...).enabled("lobby")` returns **true** (Clef too). Settings shows Off while messages are still sent to TypeSafe or Cloudflare.
Fix direction: gate on `config.enabled` alone, as before.

[major] The Knowledge page calls `.rotate()`, which gpui-kit does not declare (`mods/bot-herdr/work.js:1138-1139`)
`tsc -p mods/bot-herdr/jsconfig.json` reports `work.js(1138,8): Property 'rotate' does not exist on type 'NativeElement'`, and the typings have no rotate or transform at all. All elements share one prototype (d.ts:27), so `.rotate(tilt)` is most likely a TypeError that breaks the whole Knowledge page render. The slight tilt (step 7) can't be drawn with gpui-kit. Drop it, or ask herdr for it.

[major] The composer does not fold when you scroll, or when you click away at the bottom of the feed (acceptance criterion 12; `chat.js:597-601`, `composer.js:815-817`, `:846-847`)
`isFolded()` needs `feedScrolled && !expanded`. `expanded` is only set to false by a click on the feed while it is scrolled up. Scrolling alone leaves it expanded, and clicking away at the bottom does nothing (there is no blur handling). Folding back out on click or typing, with the draft kept, works as written: `typeFolded` calls `focus()`, which sets `expanded`, then types at the end. If Design deliberately chose "fold on click while scrolled", the person needs to agree to it; otherwise this criterion is unmet.

[minor] `work.js:691` passes `delay` to `.loop()`. `LoopPolicy` has no `delay` (tsc TS2353), so both flow dots probably move in step instead of staggered.

[minor] `runner.mjs` and `test/headless.test.mjs` were saved with a UTF-8 BOM, and three comment lines in runner.mjs (`:10`, `:117`, `:262`) and one in headless.test.mjs are mojibake (`Settings â†’ Agent access`, `â”€â”€`). Only comments are affected and node runs fine, but the files should be re-saved as UTF-8 without a BOM.

[minor] `looksLikeInstructions` (`roster.js:102`) moves any flag-less "Extra arguments" into Instructions, including a lone positional value such as `exec`. This matches the plan ("args accepts flags only"), but the person should know a non-flag argument will move. The migration itself is safe: an atomic `writeJson` (tmp + rename), other keys kept, a corrupt file (readJson → {}) is never rewritten, and `clean()` migrates in memory too, so a failed write loses nothing.

[minor] `bh knowledge ask` (`bh.mjs:286`) re-sends the whole knowledge dump plus up to 500 file names as one `hc send` on every follow-up. That is a large paste into the Scout terminal each time. It works, but it is heavy.

[info] `install.mjs` and `engine/lib/workspace.mjs` hold the person's own earlier changes. Not reviewed, as instructed.

[info] `bh` resolves to the installed copy (`~/.config/herdr-app/mods/bot-herdr/engine/bh.mjs`), not the repo. `bh check` still ran the repo's tests.

Checked and fine:
- **Windows spawn:** `team.hc` uses `spawnSync("hc", args)` with no shell (hc is `hc.exe` here). `bh spawn` on win32 skips the `sh -c` template and passes the brief as one argv item.
- **Keys:** never printed (`bh classify config` masks it to a boolean, `status` shows "found/missing"). The Clef error text has no key (probe: `clef 401: bad`), and the key goes only in the Authorization header. A failure or a missing account id returns `undefined`, so rules decide.
- **Comment ids:** task, plan and feed ids are `c<max+1>`, so they stay unique after a delete (covered by the tests).
- **`scrollBy`:** no entries (the chat resets `px` to 0 when the total is 0), one entry (clamped to `h-1`), unmeasured heights (120 px fallback), and zero heights all terminate.
- **Agent replies:** a silent turn writes "(finished without a reply)", and an answer is kept across tool calls (`said()`).

### Only the person can check by eye
- Border and control contrast on one light and one dark herdr preset. bot-herdr's own themes should look unchanged.
- Tasks page: step checkboxes (rounded square, pulse on the active step), long descriptions with Show more, and the flow dots on the active step.
- Plans page: the composer at the bottom for comments, and seat icons with names on hover.
- Knowledge: the sticky-note look (once `.rotate` is resolved), search narrowing as you type, and the agent chips.
- Toast exit animation, the verb crossfade and its timing.
- Wheel and trackpad smoothness on a long reply; the "newer" pill staying put.
- The question card's dim backdrop, the minimise chip and reopening it.
- Attachment thumbnails above the composer, including a pasted ScreenClip.
- Settings: the Instructions textarea; the Jev, Laya, Clef and Rules choices showing Key, Account id and Base URL as right.

## Brief Check
- Agents start with per-agent instructions and without sh on Windows: **met**. See `team.mjs:463-466`, `:485-486`, `:199-203` and `bh.mjs:448-453`; the roster tests pass.
- Antigravity over ACP, and a silent turn leaves a chat entry: **met** in code (`roster.js:50`, `agent.mjs:273`). A live `agy acp` was not run.
- Question cards stop the asking agent: **not met**. The ACP path cancels `bh ask` (critical), and the one-shot path kills it on start (major).
- Muted palette: palette tests pass. The contrast needs the person's eye.
- Tasks, Plans and Knowledge redrawn: **partly**. Knowledge uses an undeclared `.rotate`.
- `bh knowledge ask` and `/bh-knowledge`: **met** in code; the route tests pass.
- Classifier kinds and rules fallback: **partly**. The kinds work and failures fall back, but Off is ignored.
- Toast, working verbs: code read; eye check needed.
- Pixel chat scroll: **met** (`feed.js:65-80` and the probe edge cases).
- Folding composer: **partly**. It unfolds without losing the draft, but scrolling or clicking away at the bottom doesn't fold it.
- Question card backdrop and minimise: **met** in code (`chat.js` `bh-ask-dim`).
- Inline comments with edit, resolve and delete: **met**. Tests pass and ids stay unique.
- `npm test` passes: **met** (92 pass, 1 skipped).

## Verification
- `bh check` — PASS (lint, typecheck, 82 pass / 1 skipped)
- `npm test` — 93 tests: 92 pass, 0 fail, 1 skipped (no headless browser)
- ACP permission probe for `node "<BH>" ask --file q.md`, standard access — answered `cancelled` plus `session/cancel` (the defect)
- Classifier probe, `makeClassifier({enabled:false, kind:"jev"|"clef", key})` — `enabled("lobby")` returns true (the defect). `kind:"rules"` returns false.
- `askClef` with a 401 — the error has no key. Clef with no account id: `ask` returns undefined (falls back)
- `npx tsc -p mods/bot-herdr/jsconfig.json --noImplicitAny false`, view files — `rotate` is undeclared (work.js:1138) and `delay` is not in LoopPolicy (work.js:691). The other errors are pre-existing typing noise.
- `where hc` — `hc.exe`, so spawning without a shell works on Windows
- Scanned the diff for BOMs and mojibake — runner.mjs and headless.test.mjs (comments only)

## Knowledge Proposals
- Headless "ask" handling must end the turn only after the `bh ask` tool has *finished*, never when it starts or at its permission request.
- gpui-kit has no rotate or transform, and `.loop()` takes no `delay`: check `mods/bot-herdr/gpui-kit.d.ts` before using a style method (`npx tsc -p mods/bot-herdr/jsconfig.json` finds them).
- `bh` in agent shells resolves to the installed mod, not the repo copy.

## Script Proposals
- A `view-types` script that runs tsc on the view files and keeps only the TS2339/TS2353 errors on gpui element types, to catch undeclared gpui calls.
