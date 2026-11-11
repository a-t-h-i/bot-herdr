// On herdr's own themes our lines stay quiet: herdr's `border` is the pane split, too strong here.

import { test } from "node:test";
import assert from "node:assert/strict";
import { palette, contrastOf, LIGHT, DARK } from "../mods/bot-herdr/look.js";

// ~/.config/herdr-app/themes/win98.json (light), and Graphite (dark) as in themes.test.mjs.
const win98 = { background: "#000000", foreground: "#000000", surface: "#c0c0c0", popover: "#c0c0c0", raised: "#dfdfdf", hover: "#dfdfdf", border: "#808080", input: "#ffffff", muted: "#404040", dim: "#808080", accent: "#000080", accent_foreground: "#ffffff" };
const graphite = { foreground: "#e6e6e6", background: "#1e1f22", surface: "#232428", canvas: "#1b1c1f", raised: "#2b2d31", border: "#3a3c42", accent: "#a7b4c6", accent_foreground: "#111214", muted: "#b0b3b8", dim: "#80838a", hover: "#303237", selected: "#35383e", input: "#202125" };

// The bubble edge keeps the softness our own pair uses, per polarity: quiet, not the pane split.
const ownBubbleEdge = (t) => contrastOf(t.bubbleEdge, t.bubble);

for (const [name, t, dark] of [["win98", win98, false], ["graphite", graphite, true]]) {
  test(`${name}: edges sit at 1.3–1.6:1, controls at 3:1 or more`, () => {
    const c = palette({ dark, theme: name }, t);
    const edge = contrastOf(c.edge, c.fill);
    const bubble = contrastOf(c.bubbleEdge, c.bubble);
    const band = ownBubbleEdge(dark ? DARK : LIGHT);
    assert.ok(edge >= 1.3 && edge <= 1.6, `edge ${c.edge} on ${c.fill}: ${edge.toFixed(2)}`);
    assert.ok(Math.abs(bubble - band) <= 0.05, `bubbleEdge ${c.bubbleEdge} on ${c.bubble}: ${bubble.toFixed(2)}, our own ${band.toFixed(2)}`);
    assert.ok(contrastOf(c.edgeDark, c.fill) >= 3, `edgeDark ${c.edgeDark}`);
  });
}
