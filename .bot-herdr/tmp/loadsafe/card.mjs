import { readFileSync } from "node:fs";
import { palette, contrastOf, agentInk, agentHue, mix, isLight, LIGHT, DARK } from "../../../mods/bot-herdr/look.js";
const snap = JSON.parse(readFileSync("test/fixtures/herdr-themes.json", "utf8"));
const themes = [...snap, { name: "bot-light", light: true, colors: LIGHT }, { name: "bot-dark", light: false, colors: DARK }];
const AGENTS = ["orchestrator","dev","design","qa","research","scout"];
for (const t of themes) {
  const c = palette({ dark: !t.light, theme: t.name }, t.colors);
  const light = isLight(c);
  const rows = AGENTS.map((a) => {
    const hue = agentHue(a, c.accent);
    // work.js:1080: card bg = light ? c.fill : alpha(hue, 0.08) over ground; chip bg light: alpha(hue,0.04)
    const bg = light ? mix(c.fill, hue, 0.0) : mix(c.ground, hue, 0.08);
    const chip = light ? mix(c.fill, hue, 0.04) : mix(c.ground, hue, 0.16);
    return `${a}: card ${contrastOf(agentInk(c, a), bg).toFixed(2)} chip ${contrastOf(light ? c.ink : agentInk(c, a), chip).toFixed(2)}`;
  });
  console.log(`${t.name} ${rows.join(" | ")}`);
}
