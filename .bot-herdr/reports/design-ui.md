# design-ui — UI improvements for p-20261120-7rw6 (outside Metrics and skills)

## Summary
Eight changes, ranked by impact, all checked against the current code (the 2026-11-11 design-visual.md drift tables are stale: sizes, gaps and buttons now use look.js tokens almost everywhere). One question for the user: how the top bar fits a 7th tab.

## Changes
None (panel seat: read only).

## Ranked improvements
1. **Plan review: a Ready plan's "Start task" is hidden.** It exists only inside the plan sheet (`plandoc.js:323`); the Plans page shows just a "Ready" pill (`work.js:1503-1508`). Add the same `actionButton(c, "bh-plan-start", "Start task", …, { tone: "primary", icon: "play" })` after the pill in `planTitle` when `p.status === "ready" && !p.task`.
2. **Answering questions: the numbered options don't take their number.** Each option draws its index glyph (`composer.js:2187`), but typing `2` + Enter answers with the text "2" (`composer.js:1139-1146`). In that branch, when `typed` matches `/^[1-9]$/` and is at most `options.length`, call `answerAsk(q, { picks: [options[n-1].label] })` (for a multi-select, use `toggleAsk` instead).
3. **Following a task: there is no way to go from the chat to a task.** `work.js:725` reads `OPEN_TASK`, but nothing writes it (the only other mention is its definition at `pages.js:23`). Add `linkTasks(markdown)` next to `linkFiles` (`feed.js:268`): it turns `t-YYYYMMDD-xxxx` in replies into links. Clicking one does `setShared(OPEN_TASK, { id, at: Date.now() })` + `showPage("tasks")`.
4. **Screen readers: icon-only buttons announce nothing.** There are 0 `accessibility_label` calls in the mod, and refresh, new plan, other plans, cancel and minimise are icon-only (`work.js:800,1849-1860`, `composer.js:2071`, `plandoc.js:486`). In `button.js:18-34` `body()`, add `.accessibility_label(tooltip ?? label)`. In `segmented` (`switch.js:46-70`), give each item `.set_position(i + 1, items.length)` and `.selected(item.on)`.
5. **Destructive action with no confirm: "Remove agent" deletes a custom agent in one click** (`settings.js:1179-1182`). Use the existing two-step `arm`/`armed` (`plandoc.js:28`, `CONFIRM_MS` 5000), as task Delete does (`work.js:1057-1063`): the first click relabels it "Remove <name>?" and the second removes the agent.
6. **Keyboard: the chat feed scrolls by wheel only** (`chat.js:577`). The composer keeps focus, so add keybindings to the list at `composer.js:227` (context `BotHerdr > Input`). `pageup`/`pagedown` scroll one feed height through `feed.js:116 scrollBy`, and `ctrl-end` does what "Jump to latest" does (`chat.js:1056`: `back = 0, px = 0`).
7. **Narrow top bar with a 7th tab.** The switch block is a fixed 600px (`layouts/bot-herdr.json:106`), leaving 576px of room (`switch.js:210`). With "Metrics" added, the seven labels at `SPACE[4]` padding need about 654px (estimated with look.js `textWidth`). `tabPad` (`switch.js:28-32`) then always drops to `SPACE[2]` (about 542px), and two open-question counts take about 22px more. Past that, Settings is clipped off the end with no sign (`overflow_hidden`, `switch.js:216`). The fix depends on the question below.
8. **Settings saves silently.** The roster autosaves 600ms after the last change (`settings.js:296-305`), but only a failure is ever shown (`settings.js:561`). On `r.code === 0`, set `this.saved = Date.now()` and show a `TYPE.xs`, `c.muted` "Saved" in the same place as the problem line for 2000ms. Drop it under `prefers-reduced-motion`: no fade, just the text.

## Questions
1. With a Metrics tab, the page switch no longer fits its 600px slot at full padding. What should happen when it runs out of room?
   - Widen the slot — the switch block goes from 600 to 680px, every label always shows, and herdr's own tabs get 80px less
     ```mockup
     <style>body{margin:0;font:13px system-ui;background:#faf9f5;color:#141413}.bar{display:flex;height:42px;border-bottom:1px solid #e3e0d7;background:#f5f4ee;align-items:center}.sw{width:680px;padding-left:12px;display:flex}.seg{display:flex;gap:2px;padding:2px;background:#ebe9e2;border-radius:10px}.t{height:29px;padding:0 12px;display:flex;align-items:center;gap:4px;border-radius:8px;border:1px solid transparent;color:#6a6964;font-weight:500;font-size:12px}.on{border-color:#a25338;color:#141413}.n{color:#a25338;font-size:10.5px;font-weight:600}.ht{flex:1;display:flex;gap:4px;padding:0 8px;overflow:hidden}.h{height:29px;padding:0 12px;display:flex;align-items:center;background:#fff;border:1px solid #e3e0d7;border-radius:8px;font-size:12px;white-space:nowrap}.cap{padding:16px;color:#6a6964}</style>
     <div class="bar"><div class="sw"><div class="seg"><div class="t on">▣ Chat</div><div class="t">▤ Terminals</div><div class="t">☰ Tasks <span class="n">2</span></div><div class="t">◇ Plans <span class="n">1</span></div><div class="t">✎ Knowledge</div><div class="t">▥ Metrics</div><div class="t">⚙ Settings</div></div></div><div class="ht"><div class="h">orchestrator</div><div class="h">dev</div><div class="h">design</div></div></div>
     <div class="cap">Every tab keeps its icon and label; herdr's tabs on the right start 80px later.</div>
     ```
   - Icons when tight — the slot stays 600px; when labels don't fit, the tabs that aren't open show only their icon (name on hover and to screen readers), and the open one keeps its label
     ```mockup
     <style>body{margin:0;font:13px system-ui;background:#faf9f5;color:#141413}.bar{display:flex;height:42px;border-bottom:1px solid #e3e0d7;background:#f5f4ee;align-items:center}.sw{width:600px;padding-left:12px;display:flex}.seg{display:flex;gap:2px;padding:2px;background:#ebe9e2;border-radius:10px}.t{height:29px;padding:0 10px;display:flex;align-items:center;gap:4px;border-radius:8px;border:1px solid transparent;color:#6a6964;font-weight:500;font-size:12px}.on{border-color:#a25338;color:#141413;padding:0 12px}.n{color:#a25338;font-size:10.5px;font-weight:600}.ht{flex:1;display:flex;gap:4px;padding:0 8px;overflow:hidden}.h{height:29px;padding:0 12px;display:flex;align-items:center;background:#fff;border:1px solid #e3e0d7;border-radius:8px;font-size:12px;white-space:nowrap}.tip{position:absolute;top:46px;left:118px;background:#30302e;color:#faf9f5;font-size:12px;padding:4px 8px;border-radius:6px}.cap{padding:40px 16px 16px;color:#6a6964}</style>
     <div class="bar" style="position:relative"><div class="sw"><div class="seg"><div class="t on">▣ Chat</div><div class="t">▤</div><div class="t">☰ <span class="n">2</span></div><div class="t">◇ <span class="n">1</span></div><div class="t">✎</div><div class="t">▥</div><div class="t">⚙</div></div></div><div class="ht"><div class="h">orchestrator</div><div class="h">dev</div><div class="h">design</div><div class="h">qa</div></div><div class="tip">Tasks</div></div>
     <div class="cap">Only when space runs out: the open tab keeps its name, the others show their icon and count, and hovering shows the name.</div>
     ```
   - A More menu — the slot stays 600px; tabs that don't fit go behind a "More ▾" tab at the end, with every label kept
     ```mockup
     <style>body{margin:0;font:13px system-ui;background:#faf9f5;color:#141413}.bar{display:flex;height:42px;border-bottom:1px solid #e3e0d7;background:#f5f4ee;align-items:center;position:relative}.sw{width:600px;padding-left:12px;display:flex}.seg{display:flex;gap:2px;padding:2px;background:#ebe9e2;border-radius:10px}.t{height:29px;padding:0 12px;display:flex;align-items:center;gap:4px;border-radius:8px;border:1px solid transparent;color:#6a6964;font-weight:500;font-size:12px}.on{border-color:#a25338;color:#141413}.n{color:#a25338;font-size:10.5px;font-weight:600}.ht{flex:1;display:flex;gap:4px;padding:0 8px;overflow:hidden}.h{height:29px;padding:0 12px;display:flex;align-items:center;background:#fff;border:1px solid #e3e0d7;border-radius:8px;font-size:12px;white-space:nowrap}.menu{position:absolute;top:40px;left:440px;width:170px;background:#fff;border:1px solid #e3e0d7;border-radius:10px;box-shadow:0 4px 12px #0000001a;padding:4px}.m{height:28px;display:flex;align-items:center;gap:6px;padding:0 8px;border-radius:8px;font-size:12px}.m:first-child{background:#f4f3ef}</style>
     <div class="bar"><div class="sw"><div class="seg"><div class="t on">▣ Chat</div><div class="t">▤ Terminals</div><div class="t">☰ Tasks <span class="n">2</span></div><div class="t">◇ Plans <span class="n">1</span></div><div class="t">More ▾</div></div></div><div class="ht"><div class="h">orchestrator</div><div class="h">dev</div></div>
     <div class="menu"><div class="m">✎ Knowledge</div><div class="m">▥ Metrics</div><div class="m">⚙ Settings</div></div></div>
     ```

## Notes
- The tokens in look.js (`TYPE`, `SPACE`, `CONTROL`, `GLYPH`) are now used almost everywhere. The leftovers are small: `.size(24)`/`.size(48)` in the heroes (`work.js:961,1547,1562`) and `.size(36)` in `switch.js:133`. They are not worth a step unless someone is already in those files. The hero tile is also duplicated (`work.js:1547-1548` and `1562-1563`); if it is touched, use one helper.
- Already fine and needs nothing: a failed send puts the message and files back (`composer.js:1209-1216`); loading, empty and error states all go through `stateView` (`switch.js:155`) on every page; task Delete and plan Discard use the two-step confirm.
- Hit targets stay at the project's 28px (`look.js` `CONTROL`/`TARGET`). That is a desktop-pointer convention I am following, not changing.
- Item 7: the Metrics tab (step 5) changes `pages.js` `PAGES`. Whichever option is chosen belongs in the same step, or Settings can be clipped the day Metrics ships.
- Items 1–6 and 8 each touch one or two files (`work.js`, `composer.js`, `feed.js`, `chat.js`, `button.js`, `switch.js`, `settings.js`). Items 2, 3 and 6 need Node tests on the pure parts (`drawer.js`, `feed.js`).

## Style
(none: every item follows existing components and tokens)

## Brief Check
- At most 8, ranked, one line each with path:line and a concrete change: met (8 items above).
- Metrics tab and skill display left out: met.
- Checked against current code, not design-visual.md: met (the drift tables there no longer hold, see Notes).
- Covers sending, following a task, answering questions, plan review, states, keyboard and focus, tokens, and a narrow window with a 7th tab: met (items 1–8, Notes).
- At most one question, with mockups: met (question 1, three options).

## Verification
- grep of the mod for `OPEN_TASK`, `accessibility_label`, `tooltip(`, `on_key_down`, raw sizes and hex — results cited above.
- Tab width estimated with look.js `textWidth` at `TYPE.sm`, ×1.15 as `tabWidth` does (`switch.js:22`).
