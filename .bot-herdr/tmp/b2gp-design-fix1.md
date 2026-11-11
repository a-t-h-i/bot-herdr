QA gate: CHANGES_REQUIRED. Fix round 1 for design. Evidence: .bot-herdr/tasks/t-20261111-b2gp/reports/qa-gate.md, Findings.

1. Contrast on drawn surfaces. palette() repairs muted/faint/accent/agentInk only against fill and ground, but views draw them on:
   - well: segmented off labels (switch.js:29,45): paper 3.73, own light 3.97, graphite 4.25.
   - bubble: the "Show more" fold link in accent (chat.js:740): own dark 3.89.
   - hover: file chips in muted (chat.js:769): about 4.05.
   - fill: Knowledge card title agentInk under paper: 4.35.
   Repair those tokens against every surface they are drawn on (well, bubble, hover too), or lift well/hover toward fill so one repair covers both; keep the theme's character.
   Then extend test/contrast.test.mjs (you may edit it for this) so the loop also asserts muted, faint and accent >= 4.5 on well, bubble and hover, and agentInk >= 4.5 on fill, for every fixture and LIGHT/DARK.
2. Chat task widget (chat.js:403-410): restore a height bound (max_h, as before) and let its list scroll inside it; keep on_scroll_wheel stop_propagation for the widget. Nothing else nests a scroll in the feed.
3. work.js:1026: light-mode selected filter chip tint alpha(hue, 0.04), not 0.1.
4. chat.js:479 calls sendFromChat without importing it: add it to the ./pages.js import.
indicators.js stays exempt from the tokens (out of scope).

DONE WHEN
- node --test test/contrast.test.mjs test/palette.test.mjs test/themes.test.mjs passes with the extended surfaces.
- bh check passes.
- "%LOCALAPPDATA%/Programs/herdr-app/herdr-app.exe" check mods/bot-herdr prints "check passed".
- Append a "Fix round 1" section to .bot-herdr/tasks/t-20261111-b2gp/reports/design.md and hc send t2z.
Do not commit.
