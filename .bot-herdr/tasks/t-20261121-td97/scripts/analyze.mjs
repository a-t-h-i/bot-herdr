// purpose: explain every ui-audit Fix-counter hit with its element's id chain (debugging aid)
// usage: node .bot-herdr/tasks/t-20261121-td97/scripts/analyze.mjs /tmp/spec.txt
// why: bh ui-audit reports only a short label per finding; the id chain shows where to fix it.
import { readFileSync } from "node:fs";
import { elementId, looksMachine, parseSpec, prop, style, textOf, walk } from "../../../../mods/bot-herdr/engine/lib/ui-audit-spec.mjs";
import { palette, agentHue, mix } from "../../../../mods/bot-herdr/look.js";

const file = process.argv[2] ?? "/tmp/m3-spec-before.txt";
const text = readFileSync(file, "utf8");
const pages = {};
for (const chunk of text.split(/\n===== /).slice(1)) {
  const [id, ...rest] = chunk.split("\n");
  pages[id.trim()] = parseSpec(rest.join("\n"));
}

const snapshot = JSON.parse(readFileSync(new URL("../../../../test/fixtures/herdr-themes.json", import.meta.url), "utf8"));
const c = palette({ dark: false, theme: "graphite" }, snapshot.find((t) => t.name === "graphite").colors);
const chain = (node) => {
  const out = [];
  for (let n = node; n && n.name !== "root"; n = n.parent) out.unshift(elementId(n) ?? n.name);
  return out.join(" > ");
};
const alpha = (hex, a) => {
  const n = parseInt(hex.slice(1, 7), 16);
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v.toString(16).padStart(2, "0")).join("")}${Math.round(a * 255).toString(16).padStart(2, "0")}`;
};
const hues = ["orchestrator", "dev", "design", "qa", "research", "scout", "advisor"].map((n) => agentHue(n, c.accent));
const tints = new Set();
for (const hue of hues) {
  tints.add(hue.toLowerCase());
  for (let s = 1; s < 50; s++) {
    tints.add(alpha(hue, s / 50).toLowerCase());
    tints.add(mix(c.ground, hue, s / 50).toLowerCase());
  }
}
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

for (const [page, spec] of Object.entries(pages)) {
  const lines = [];
  for (const node of walk(spec)) {
    if (node.name === "root") continue;
    const pressable = prop(node, "on_click") !== null || prop(node, "on_mouse_down_left") !== null || style(node, "cursor_pointer") !== null;
    if (pressable && same(style(node, "bg") ?? "", c.accent)) lines.push(`ACcent button: ${chain(node)}  text=${JSON.stringify(textOf(node))}`);
    const t = textOf(node);
    if (t !== null && /(?:^|\s)·\s*0$/.test(t.trim())) lines.push(`ZERO chip: ${chain(node)}  ${JSON.stringify(t)}`);
    if (t !== null && looksMachine(t.trim(), node)) lines.push(`RAW: ${chain(node)}  ${JSON.stringify(t.slice(0, 80))}`);
    if (node.name === "svg") lines.push(`ICON: ${chain(node)}  ${node.src}`);
    const bg = style(node, "bg");
    if (typeof bg === "string" && tints.has(bg.toLowerCase())) lines.push(`FILL: ${chain(node)}  ${bg}`);
    if (prop(node, "aria_selected") === true) {
      lines.push(`SELECTED: ${chain(node)}  bg=${style(node, "bg")} border=${style(node, "border_color")} ink=${style(node, "text_color")} full=${style(node, "rounded_full")}`);
    }
  }
  if (lines.length) process.stdout.write(`\n===== ${page} =====\n${lines.join("\n")}\n`);
}
