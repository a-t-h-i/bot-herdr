QA gate round 2: one residual (qa-gate.md, "Residual finding"). Agent names sit on the agent's own hue tint in dark mode and fall under AA: chip alpha(hue, 0.16) / hovered 0.22, card alpha(hue, 0.08) / hovered 0.12 (work.js:1026-1028, 1080-1082; text at 1027 and 1091). Worst 3.57 (atom-one-dark, dev chip hovered).

DO
1. Filter chips, dark mode: label text c.ink (as light mode does); the hue stays on the dot and the tint.
2. Knowledge card name, dark mode: repair the name against the card's hovered surface, mix(ground, hue, 0.12) composited (use the same compositing as alpha over ground), so it passes at rest and on hover. Add a small helper in look.js if needed, e.g. agentInkOn(c, name, bg).
3. Extend test/contrast.test.mjs: for every fixture and our pair, for each agent, assert the card name >= 4.5 on the composited card surface at rest and hovered, and the chip label >= 4.5 on the composited chip surface at rest and hovered.

DONE WHEN
node --test test/contrast.test.mjs passes; bh check passes; herdr-app check mods/bot-herdr passes. Append "Fix round 2" to your report and hc send t2z. Do not commit.
