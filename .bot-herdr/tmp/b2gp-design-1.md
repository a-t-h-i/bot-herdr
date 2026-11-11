Task t-20261111-b2gp, steps 1-3 (you will get later Design steps in this same session, one stage at a time). Plan: bh plan show p-20261111-9dkc. Evidence: .bot-herdr/reports/design-panel.md §1-2 and .bot-herdr/reports/qa-panel.md (measured failing pairs).

GOAL
The app is readable (WCAG AA) under every herdr theme and our own light/dark pair, keeping each theme's character; bubble borders are as soft as in our own theme.

FILES
Change: mods/bot-herdr/look.js, mods/bot-herdr/theme.js, mods/bot-herdr/chat.js (only where a colour is chosen), test/palette.test.mjs (only the bubbleEdge assertions, see 5).
Leave alone: install.mjs, mods/bot-herdr/engine/**, mods/bot-herdr/gpui-kit.d.ts, every other file. Step 4 (the new contrast test and theme snapshot) belongs to QA; do not write it.

WHAT TO DO
1. readable() (look.js:112-127): make it polarity-aware. If the colour already reaches the target ratio on bg, return it unchanged. Otherwise move it toward the end that increases contrast (lighter on a dark bg, darker on a light bg), keeping its hue: first toward the palette's ink, and if ink itself cannot reach the target, toward #ffffff or #000000. Binary search the mix amount (10 iterations), return the smallest mix that passes. Signature: readable(color, bg, target = 4.5, ink).
2. palette() (look.js:170-216) and LIGHT/DARK (look.js:3-55): run muted, faint, accent (as text), danger/stop, info, success and warning through readable() against the darker-contrast of fill and ground, so each passes 4.5:1 on both. Leave ink alone unless it fails.
3. Themes with no `colors` block (atom-one-dark): do not fall back to DARK.fill / our accent. Derive fill, raised, bubble and edge from the theme's own background (mix toward foreground by small amounts, as palette() already does for edges) and accent from the theme's ansi4 (blue) when accent is absent.
4. Send button: when the theme gives `solid` and `solid_foreground`, use them as accent fill and accentInk. Our own LIGHT/DARK: darken the send fill keeping its hue until white accentInk reaches 4.5:1 (light about #a55236). Same rule for any theme without solid: if accentInk on accent < 4.5, adjust the fill.
5. Bubble edge: measure contrastOf(bubbleEdge, bubble) and (bubble vs ground) in our own LIGHT and DARK; under other themes, derive bubbleEdge so its ratio against bubble falls within ±0.05 of our own pair's value (it is too sharp today). Update the bubbleEdge assertion in test/palette.test.mjs to that band; keep the edge assertions as they are.
6. Agent name colours: wherever agentHue() output is drawn as text (chat.js:757, 815, the meta row, the reply header), pass it through readable(hue, c.ground). One helper, e.g. agentInk(c, name), in look.js; use it at every text site.
7. Code chips (step 3): TextView.markdown (gpui-kit.d.ts:20709) owns inline code. First check gpui-kit.d.ts for any styling hook (code background/colour, theme, style options) on TextView or markdown. If one exists, set chip text to ink and chip fill to a theme-derived surface with ink at ≥ 4.5:1. If none exists, STOP this item and report it under Blockers with what you found; do not write a markdown renderer.
8. Remove the unused scrim token and the orphan comment at look.js:92. Keep edgeDark if any test still asserts it.

CONSTRAINTS
No new dependencies, no other files, no refactors beyond the above. Do not commit. Check gpui-kit.d.ts before using any style method (knowledge: gpui-kit has no rotate/transform, .loop() takes no delay).

DONE WHEN
- A quick node script (keep it in .bot-herdr/tmp/, not committed) prints every text pair above for LIGHT, DARK, win98, atom-one-dark (C:/Users/athenkosi.hlubi/.config/herdr-app/themes/*.json) and the graphite fixture in test/palette.test.mjs, all ≥ 4.5 (edges/controls ≥ 3). Paste its output in your report.
- bubbleEdge-vs-bubble under win98 and atom-one-dark is within ±0.05 of our own pair's value.
- `node --test test/palette.test.mjs test/themes.test.mjs` passes; `bh check` passes.
- Item 7 done, or reported as blocked with the gpui-kit evidence.

IF STUCK
When something does not match this brief, stop that part, finish the rest, and report it. Never invent a workaround.
