// Every theme herdr can hand us must keep the UI readable: text at WCAG AA (4.5:1) on both the
// card fill and the page ground, a label on the accent, controls at 3:1, and the bubble edge as
// soft as our own pair. The presets are a snapshot of theme() from herdr-app.exe; the rest are
// herdr's theme files as theme() flattens them (a `colors` block wins over the top level).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { palette, contrastOf, agentInk, agentInkOn, agentHue, mix, ownTheme, LIGHT, DARK } from "../mods/bot-herdr/look.js";

const snapshot = JSON.parse(readFileSync(new URL("./fixtures/herdr-themes.json", import.meta.url), "utf8"));

const themes = [
  ...snapshot,
  // Our own pair, straight from look.js (palette() returns it unchanged).
  { name: "bot-herdr-light", light: true, source: "look.js LIGHT", colors: LIGHT },
  { name: "bot-herdr-dark", light: false, source: "look.js DARK", colors: DARK },
];

const AGENTS = ["orchestrator", "dev", "design", "qa", "research", "scout"];
const TEXT = ["ink", "muted", "faint", "accent", "danger", "stop", "info", "success", "warning"];
// Every surface these tokens are actually drawn on: cards, the page, a hovered row, a well
// (segmented labels) and your bubble (a plan's "Show more").
const surfaces = (c) => ["fill", "ground", "well", "bubble", "hover"];

// The softness our own pair uses, per polarity, measured from look.js.
const ownBubbleEdge = (dark) =>
  contrastOf((dark ? DARK : LIGHT).bubbleEdge, (dark ? DARK : LIGHT).bubble);

const ratio = (c, token, bg) => contrastOf(c[token], bg);
const fail = (theme, pair, a, b, r, min) =>
  `${theme.name} (${theme.source}): ${pair} ${a} on ${b} is ${r.toFixed(2)}, wants ${min}`;

for (const theme of themes) {
  test(`${theme.name}: text reads at AA, controls and bubble edges hold`, () => {
    const c = palette({ dark: !theme.light, theme: theme.name }, theme.colors);

    for (const token of TEXT) {
      for (const bg of surfaces(c)) {
        const r = ratio(c, token, c[bg]);
        assert.ok(r >= 4.5, fail(theme, token, c[token], c[bg], r, "4.5"));
      }
    }
    for (const name of AGENTS) {
      const ink = agentInk(c, name);
      for (const bg of ["ground", "fill"]) {
        const r = contrastOf(ink, c[bg]);
        assert.ok(r >= 4.5, fail(theme, `agentInk(${name})`, ink, c[bg], r, "4.5"));
      }
      // The Knowledge card and filter chip are tinted with the agent's hue: a card keeps fill in
      // light mode and an alpha(hue) tint in dark; a chip is alpha(hue) over the page.
      const hue = agentHue(name, c.accent);
      const cardRest = theme.light ? c.fill : mix(c.ground, hue, 0.08);
      const cardHover = theme.light ? c.fill : mix(c.ground, hue, 0.12);
      const cardInk = theme.light ? ink : agentInkOn(c, name, cardHover);
      for (const bg of [cardRest, cardHover]) {
        const r = contrastOf(cardInk, bg);
        assert.ok(r >= 4.5, fail(theme, `card name (${name})`, cardInk, bg, r, "4.5"));
      }
      const chipRest = mix(c.ground, hue, theme.light ? 0.04 : 0.16);
      const chipHover = theme.light ? c.hover : mix(c.ground, hue, 0.22);
      for (const bg of [chipRest, chipHover]) {
        const r = contrastOf(c.ink, bg);
        assert.ok(r >= 4.5, fail(theme, `chip label (${name})`, c.ink, bg, r, "4.5"));
      }
    }
    const onAccent = contrastOf(c.accentInk, c.accent);
    assert.ok(onAccent >= 4.5, fail(theme, "accentInk", c.accentInk, c.accent, onAccent, "4.5"));

    // Our own pair's edgeDark is the decorative bottom lip of the bevel (look.js:7), not a
    // control border; only a derived palette turns edgeDark into one (look.js:275).
    if (!ownTheme(theme.name)) {
      const control = contrastOf(c.edgeDark, c.fill);
      assert.ok(control >= 3, fail(theme, "edgeDark", c.edgeDark, c.fill, control, "3"));
    }

    const bubble = contrastOf(c.bubbleEdge, c.bubble);
    const band = ownBubbleEdge(!theme.light);
    assert.ok(
      Math.abs(bubble - band) <= 0.05,
      fail(theme, "bubbleEdge", c.bubbleEdge, c.bubble, bubble, `within 0.05 of ${band.toFixed(2)}`),
    );
  });
}
