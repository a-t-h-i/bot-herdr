// Prints every text pair of the palette for our pair, win98, atom-one-dark and the graphite
// fixture, with the contrast each one reaches (text 4.5, controls 3).
import fs from "node:fs";
import { palette, contrastOf, LIGHT, DARK, agentInk } from "../../mods/bot-herdr/look.js";

const dir = "C:/Users/athenkosi.hlubi/.config/herdr-app/themes";
const flat = (file) => {
  const raw = JSON.parse(fs.readFileSync(`${dir}/${file}`, "utf8"));
  const t = { background: raw.background, foreground: raw.foreground, ...(raw.selection ? { selection: raw.selection } : {}), ...(raw.colors ?? {}) };
  (raw.ansi ?? []).forEach((v, i) => (t[`ansi${i}`] = v));
  return t;
};

const graphite = { foreground: "#e6e6e6", background: "#1e1f22", surface: "#232428", canvas: "#1b1c1f", raised: "#2b2d31", border: "#3a3c42", accent: "#a7b4c6", accent_foreground: "#111214", muted: "#b0b3b8", dim: "#80838a", hover: "#303237", selected: "#35383e", input: "#202125", ansi1: "#e06c75", ansi2: "#98c379", ansi3: "#e5c07b", ansi4: "#61afef" };

const themes = [
  ["LIGHT", LIGHT, false],
  ["DARK", DARK, true],
  ["win98", palette({ dark: false, theme: "win98" }, flat("win98.json")), false],
  ["atom-one-dark", palette({ dark: true, theme: "atom-one-dark" }, flat("atom-one-dark.json")), true],
  ["graphite", palette({ dark: true, theme: "graphite" }, graphite), true],
];

const names = ["orchestrator", "dev", "design", "qa", "research", "scout", "harbor"];
let fails = 0;
const pair = (label, a, b, min) => {
  const r = contrastOf(a, b);
  const ok = r >= min;
  if (!ok) fails++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label.padEnd(28)} ${r.toFixed(2)}  ${a} on ${b}`);
};

for (const [name, c, dark] of themes) {
  console.log(`\n== ${name} (${dark ? "dark" : "light"})`);
  for (const bg of ["fill", "ground"]) {
    for (const token of ["ink", "muted", "faint", "accent", "danger", "stop", "info", "success", "warning"]) {
      pair(`${token} on ${bg}`, c[token], c[bg], 4.5);
    }
  }
  pair("accentInk on accent", c.accentInk, c.accent, 4.5);
  for (const n of names) pair(`agentInk ${n} on ground`, agentInk(c, n), c.ground, 4.5);
  pair("edge on fill", c.edge, c.fill, 1.3);
  if (name !== "LIGHT" && name !== "DARK") pair("edgeDark on fill (control)", c.edgeDark, c.fill, 3);
  console.log(`  info our decorative edgeDark on fill ${contrastOf(c.edgeDark, c.fill).toFixed(2)}`);
  console.log(`  info bubbleEdge on bubble ${contrastOf(c.bubbleEdge, c.bubble).toFixed(2)} (own light ${contrastOf(LIGHT.bubbleEdge, LIGHT.bubble).toFixed(2)}, dark ${contrastOf(DARK.bubbleEdge, DARK.bubble).toFixed(2)}); bubble on ground ${contrastOf(c.bubble, c.ground).toFixed(2)}`);
}

console.log(`\n${fails === 0 ? "ALL PAIRS PASS" : `${fails} FAILING PAIRS`}`);
process.exit(fails ? 1 : 0);
