// The UI follows herdr's theme: ours on the layout's own pair, the picked theme's colours otherwise.

import { test } from "node:test";
import assert from "node:assert/strict";
import { palette, LIGHT, DARK, mix } from "../mods/bot-herdr/look.js";

const graphite = { foreground: "#e6e6e6", background: "#1e1f22", surface: "#232428", canvas: "#1b1c1f", raised: "#2b2d31", border: "#3a3c42", accent: "#a7b4c6", accent_foreground: "#111214", muted: "#b0b3b8", dim: "#80838a", hover: "#303237", selected: "#35383e", input: "#202125", ansi1: "#e06c75", ansi2: "#98c379", ansi3: "#e5c07b", ansi4: "#61afef" };

test("our own theme (or none named) keeps the Claude look", () => {
  assert.equal(palette({ dark: false, theme: "bot-herdr-light" }, graphite), LIGHT);
  assert.equal(palette({ dark: true }, graphite), DARK);
});

test("any other herdr theme gives every token from its colours", () => {
  const c = palette({ dark: true, theme: "graphite" }, graphite);
  assert.equal(c.ground, "#1b1c1f");
  assert.equal(c.fill, "#2b2d31");
  assert.equal(c.ink, "#e6e6e6");
  assert.equal(c.accent, "#a7b4c6");
  assert.equal(c.danger, "#e06c75");
  for (const k of Object.keys(DARK)) assert.ok(typeof c[k] === "string" && c[k].startsWith("#"), k);
  assert.equal(mix("#000000", "#ffffff", 0.5), "#808080");
});
