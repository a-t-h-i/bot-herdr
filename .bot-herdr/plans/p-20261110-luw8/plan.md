## Status
READY

## Title
Polish bot-herdr's pages and fix agent replies, questions and the classifier

## Plan

### Steps
1. Fix how agents start: per-agent instructions go into the brief, not into command-line args; spawn works on Windows without `sh`
2. Run Antigravity headless over ACP so its replies reach the chat; always leave a chat entry when a turn ends without a reply
3. Make question cards reliable from every harness: the asking agent stops until answered; briefs use literal addresses and `bh ask --file`
4. Mute borders and other strong colours on herdr's built-in themes, matching the bot-herdr themes' look
5. Tasks page: real checkbox controls for steps and tasks, full task description (collapsed with Show more, as Markdown), agent-to-task flow animation
6. Plans page: comment on the plan through the bot-herdr composer at the bottom; seats as coloured agent icons with the name on hover
7. Knowledge page as sticky notes (tinted by agent, varying height in columns, slight tilt that straightens on hover) with search and agent chips; keep edit, delete and notes
8. `/bh-knowledge <question>` in the chat goes to the Scout agent (started if needed), which reads the knowledge and the repo and answers in the chat; follow-ups work
9. Classifier: add Laya (TypeSafe, same System One API as Jev) and Clef (Cloudflare Workers AI) as choices beside Jev and the installed harnesses
10. Toast: a proper exit animation on both toasts
11. Working verbs: better words, a crossfade instead of retyping, calmer timing
12. Chat scrolls smoothly by pixels instead of jumping a whole message per wheel step
13. Composer shrinks to a slim bar when you scroll the feed or it loses focus, and grows back on click or typing
14. Question card: a dimmed backdrop behind it, and a minimise button that folds it into a small chip you can reopen; the agent keeps waiting
15. Inline comments everywhere text is (agent replies, plan lines, task steps, knowledge notes), with resolve, edit and delete; a comment goes to the agent that wrote the text
16. QA gate per task, plus your sign-off on a short visual checklist

### Objective
Make bot-herdr look calm and consistent on every herdr theme, make its pages quicker to read, and fix the paths where agents' replies, questions and mockups get lost.

### Scope and non-goals
- In: the 13 items you listed, plus bugs the panel found on the way (agent args, Windows spawn, empty ACP replies, `$`-commands refused under standard access).
- Not in: embedding a live browser in the chat (gpui-kit has no webview); new dependencies; changing herdr itself.

### Acceptance criteria
- On two built-in herdr themes (one light, one dark), borders sit about 1.3–1.6:1 against their fill and controls stay at 3:1 or more; bot-herdr's own themes look unchanged (existing palette test still passes).
- Antigravity, Gemini, Qwen and opencode replies show in the chat; a turn with no reply shows "(finished without a reply)".
- A `bh ask` from Claude, Codex or an ACP harness shows a card, and the agent waits for the answer.
- `bh spawn research` works on Windows.
- Long task descriptions show in full; steps use checkbox controls.
- Plan comments go through the composer; seats show coloured icons with names on hover.
- Knowledge: search narrows the cards as you type; agent chips filter them.
- `/bh-knowledge <question>` reaches Scout and its answer, citing files, shows in the chat; a follow-up gets an answer too.
- The classifier can run on Jev, Laya and Clef, each picked in Settings with its key (Clef also takes a Cloudflare account id); it falls back to rules on failure, as today.
- Toasts animate out as smoothly as they come in.
- A long reply scrolls line by line with the wheel or trackpad, never jumping past text.
- The composer folds when you scroll or click away, and comes back on click or typing without losing the draft.
- An open question card dims what is behind it; minimised, it shows as a chip that reopens it.
- `npm test` passes, with new tests for palette contrast, knowledge search, harness argv/parse and reply capture.

### Affected areas
- Engine (Dev): `engine/lib/runner.mjs`, `engine/lib/agent.mjs`, `engine/lib/team.mjs`, `engine/bh.mjs`, `engine/classifier/*`, `engine/lib/knowledge.mjs`, `roster.js`.
- Views (Design): `look.js`, `work.js`, `pages.js`, `composer.js`, `chat.js`, `toast.js`, `working.js`, `route.js`, `settings.js`, `viewer.js`/`lightbox.js`.
- Tests: `test/*.test.mjs`.

### Decisions by domain
- [DEV] Antigravity runs headless through its `agy acp` mode with the existing ACP runner (`engine/lib/runner.mjs:250`).
- [DEV] The ACP runner keeps the last non-empty text instead of clearing it at each tool call (`runner.mjs:302`).
- [DEV] Settings gets a per-agent "Instructions" field that goes into the brief; "args" accepts flags only. Your current sentence moves into Instructions.
- [DESIGN] Borders on non-bot-herdr themes are mixed from the theme's fill and border instead of used raw (`look.js` `palette()`); `work.js` `pips()` uses `alpha()` instead of appending `80`.
- [DESIGN] Checkboxes are drawn on gpui-base `Checkbox` (behaviour and accessibility; the look is ours), read-only for status.
- [DESIGN] "Work flowing" is small dots sliding from the agent's icon to the task title (gpui animates position and opacity, not paths).

### Assumptions
- [DESIGN] gpui-kit has no blur or backdrop filter, so the question card gets a dimmed backdrop instead of blur-sm; real blur would need herdr to add it.
- [DESIGN] The chat feed switches from scrolling by whole messages (`chat.js:463`) to a pixel scroll that stays pinned to the newest message until you scroll up.
- [DEV] Laya is reached through the existing System One client with its own model id and a base URL you can point at TypeSafe or a local server; Clef gets a small adapter for Workers AI. Exact endpoints are checked against their docs during the step.
- [ORCHESTRATOR] A comment on a knowledge note goes to the Orchestrator, who keeps the knowledge; a comment on a reply goes to the agent that sent it.
- [DESIGN] Checkboxes are rounded squares (radius 4): accent fill and tick when done, a pulsing inner square while active, amber "!" when blocked.
- [DESIGN] In-chat mockups stay pictures that expand in the lightbox, with "Open in browser" for interaction, since gpui-kit can't embed a webview.
- [QA] Pure logic gets `node:test` tests; the look is checked by you against a short checklist per page, on two bot-herdr themes and two herdr presets.
- [ORCHESTRATOR] The work runs as several tasks in the order above (engine fixes first, then theme, then pages), each with its own QA gate.
- [RESEARCH] gpui-component (Longbridge) has styled Checkbox, Tag, Tooltip and Notification, but mods only get gpui-base and gpui-kit, so we use it as a design reference, not as code.

### Risks and open points
- The palette change touches every page; QA treats it as high risk.
- Question cards and mockups: the pipeline works end to end here (two question sets were answered today, a mockup picture was drawn). Step 3 starts by reproducing what you saw; if you remember which agent or harness it was, say so.
- Codex's `workspace-write` sandbox may block `bh ask` and `bh reply` (not yet verified on Windows).
- The ACP model setting for Antigravity is unverified until it runs.
- `/bh-knowledge` depends on step 2: Scout runs on Antigravity.
