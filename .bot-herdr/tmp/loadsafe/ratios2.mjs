import { readFileSync } from "node:fs";
import { palette, contrastOf, agentInk, isLight, LIGHT, DARK } from "../../../mods/bot-herdr/look.js";
const snap = JSON.parse(readFileSync("test/fixtures/herdr-themes.json", "utf8"));
const themes = [...snap, { name: "bot-herdr-light", light: true, colors: LIGHT }, { name: "bot-herdr-dark", light: false, colors: DARK }];
const AGENTS = ["orchestrator","dev","design","qa","research","scout"];
for (const t of themes) {
  const c = palette({ dark: !t.light, theme: t.name }, t.colors);
  const rows = AGENTS.map(n => `${n}:${contrastOf(agentInk(c,n), c.fill).toFixed(2)}`);
  const mutedWell = contrastOf(c.muted, c.well).toFixed(2);
  const faintWell = contrastOf(c.faint, c.well).toFixed(2);
  const mutedHover = contrastOf(c.muted, c.hover).toFixed(2);
  const accentBubble = contrastOf(c.accent, c.bubble).toFixed(2);
  console.log(`${t.name} light=${isLight(c)} fill=${c.fill} ground=${c.ground} well=${c.well} bubble=${c.bubble}`);
  console.log(`   agentInk/fill ${rows.join(" ")}`);
  console.log(`   muted/well ${mutedWell} faint/well ${faintWell} muted/hover ${mutedHover} accent/bubble ${accentBubble}`);
}
