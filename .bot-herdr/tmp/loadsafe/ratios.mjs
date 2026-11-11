import { readFileSync } from "node:fs";
import { palette, contrastOf, agentInk, LIGHT, DARK } from "../../../mods/bot-herdr/look.js";
const snap = JSON.parse(readFileSync("test/fixtures/herdr-themes.json", "utf8"));
const themes = [...snap, { name: "bot-light", light: true, colors: LIGHT }, { name: "bot-dark", light: false, colors: DARK }];
const AGENTS = ["orchestrator","dev","design","qa","research","scout"];
const TEXT = ["ink","muted","faint","accent","danger","stop","info","success","warning"];
console.log("theme | worst agentInk on fill | worst text on bubble | worst text on hover | muted on well");
for (const t of themes) {
  const c = palette({ dark: !t.light, theme: t.name }, t.colors);
  const agents = AGENTS.map(n => [n, contrastOf(agentInk(c, n), c.fill)]);
  const bubble = TEXT.map(k => [k, contrastOf(c[k], c.bubble)]);
  const hover = TEXT.map(k => [k, contrastOf(c[k], c.hover)]);
  const well = contrastOf(c.muted, c.well);
  const worst = (arr) => arr.sort((a,b)=>a[1]-b[1])[0];
  const wA = worst(agents), wB = worst(bubble), wH = worst(hover);
  console.log(`${t.name} | ${wA[0]} ${wA[1].toFixed(2)} | ${wB[0]} ${wB[1].toFixed(2)} | ${wH[0]} ${wH[1].toFixed(2)} | ${well.toFixed(2)}`);
}
