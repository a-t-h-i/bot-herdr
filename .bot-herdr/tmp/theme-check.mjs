// purpose: check the four new theme pairs (light + dark): shape, contrast, and the palette they give.
// usage: node .bot-herdr/tmp/theme-check.mjs
import { readFileSync } from "node:fs";
import { palette, contrastOf } from "../../mods/bot-herdr/look.js";

const KEYS = ["background", "foreground", "selection", "cursor", "ansi"];
const COLOR_KEYS = ["canvas", "chrome", "surface", "popover", "raised", "hover", "selected", "border", "input", "muted", "dim", "accent", "accent_foreground"];
const HEX = /^#[0-9a-f]{6}$/i;
const names = ["harbor-light", "harbor-dark", "fern-light", "fern-dark", "plum-light", "plum-dark", "dune-light", "dune-dark"];

// herdr flattens a theme file: the `colors` block wins, ansi[] becomes ansi0..ansi15.
const flatten = (t) => ({
  background: t.background, foreground: t.foreground, selection: t.selection, cursor: t.cursor,
  ...Object.fromEntries(t.ansi.map((c, i) => [`ansi${i}`, c])),
  ...t.colors,
});

let failed = 0;
for (const name of names) {
  const t = JSON.parse(readFileSync(new URL(`../../themes/${name}.json`, import.meta.url), "utf8"));
  const bad = [];
  for (const k of KEYS) if (!(k in t)) bad.push(`missing ${k}`);
  if (!Array.isArray(t.ansi) || t.ansi.length !== 16) bad.push("ansi must hold 16 entries");
  for (const k of COLOR_KEYS) if (!(k in (t.colors ?? {}))) bad.push(`missing colors.${k}`);
  for (const [k, v] of Object.entries({ ...t.colors, background: t.background, foreground: t.foreground, selection: t.selection, cursor: t.cursor })) {
    if (!HEX.test(String(v))) bad.push(`${k} is not an opaque 6-digit hex: ${v}`);
  }
  for (const [i, v] of (t.ansi ?? []).entries()) if (!HEX.test(String(v))) bad.push(`ansi${i} is not an opaque 6-digit hex: ${v}`);

  const c = t.colors ?? {};
  const ratios = [
    ["foreground on surface", t.foreground, c.surface, 7],
    ["muted on surface", c.muted, c.surface, 4.5],
    ["accent_foreground on accent", c.accent_foreground, c.accent, 4.5],
    ["accent on surface", c.accent, c.surface, 3],
  ];
  for (const [label, a, b, min] of ratios) {
    const r = contrastOf(a, b);
    if (!(r >= min)) bad.push(`${label} ${a} on ${b} is ${r.toFixed(2)}, wants ${min}`);
  }

  const flat = flatten(t);
  const dark = name.endsWith("-dark");
  const p = palette({ dark, theme: name }, flat);
  if (p.accent !== c.accent) bad.push(`palette accent ${p.accent} is not the file's ${c.accent}`);

  const report = [`fg ${contrastOf(t.foreground, c.surface).toFixed(2)}`, `muted ${contrastOf(c.muted, c.surface).toFixed(2)}`,
    `accInk ${contrastOf(c.accent_foreground, c.accent).toFixed(2)}`, `acc ${contrastOf(c.accent, c.surface).toFixed(2)}`, `paletteAccent ${p.accent}`];
  if (bad.length) failed++;
  console.log(`${bad.length ? "FAIL" : "PASS"} ${name.padEnd(13)} ${report.join("  ")}`);
  for (const b of bad) console.log(`     - ${b}`);
}
process.exit(failed ? 1 : 0);
