import { readFileSync } from "node:fs";
import { palette, contrastOf, agentInk, agentInkOn, agentHue, mix, isLight, LIGHT, DARK } from "../../../mods/bot-herdr/look.js";
const snap = JSON.parse(readFileSync("test/fixtures/herdr-themes.json", "utf8"));
const themes = [...snap, { name: "bot-herdr-light", light: true, colors: LIGHT }, { name: "bot-herdr-dark", light: false, colors: DARK }];
const AGENTS = ["orchestrator","dev","design","qa","research","scout"];
let worstChip = { r: 99 }, worstCard = { r: 99 };
for (const t of themes) {
  const c = palette({ dark: !t.light, theme: t.name }, t.colors);
  const light = isLight(c);
  for (const a of AGENTS) {
    const hue = agentHue(a, c.accent);
    const cardInk = light ? agentInk(c, a) : agentInkOn(c, a, mix(c.ground, hue, 0.12));
    for (const [label, bg] of [["rest", light ? c.fill : mix(c.ground, hue, 0.08)], ["hover", light ? c.fill : mix(c.ground, hue, 0.12)]]) {
      const r = contrastOf(cardInk, bg);
      if (r < worstCard.r) worstCard = { theme: t.name, agent: a, label, r };
    }
    for (const [label, bg] of [["rest", mix(c.ground, hue, light ? 0.04 : 0.16)], ["hover", light ? c.hover : mix(c.ground, hue, 0.22)]]) {
      const r = contrastOf(c.ink, bg);
      if (r < worstChip.r) worstChip = { theme: t.name, agent: a, label, r };
    }
  }
}
console.log("worst card name:", worstCard.theme, worstCard.agent, worstCard.label, worstCard.r.toFixed(2));
console.log("worst chip label:", worstChip.theme, worstChip.agent, worstChip.label, worstChip.r.toFixed(2));
