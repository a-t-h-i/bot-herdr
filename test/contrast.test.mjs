// Every theme herdr can hand us must keep the UI readable: text at WCAG AA (4.5:1) on both the
// card fill and the page ground, a label on the accent, controls at 3:1, and the bubble edge as
// soft as our own pair. The presets are a snapshot of theme() from herdr-app.exe; the rest are
// herdr's theme files as theme() flattens them (a `colors` block wins over the top level).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { palette, contrastOf, agentInk, LIGHT, DARK, STATE } from "../mods/bot-herdr/look.js";

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
      // No card and no chip is tinted with the agent's hue any more (Principle 5): the Knowledge
      // card is the card and its filter chip is text. The identity colour is one small dot (3:1 as
      // a glyph) beside a name that still reads at AA on the card, the page and the hover tone.
      const dot = agentInk(c, name);
      for (const bg of ["fill", "ground"]) {
        const r = contrastOf(dot, c[bg]);
        assert.ok(r >= 4.5, fail(theme, `agent dot (${name})`, dot, c[bg], r, "4.5"));
      }
    }
    const onAccent = contrastOf(c.accentInk, c.accent);
    assert.ok(onAccent >= 4.5, fail(theme, "accentInk", c.accentInk, c.accent, onAccent, "4.5"));

    // Every preset, our own pair included, keeps a control border at 3:1 on its card (look.js
    // `controlBorder`): the old `ownTheme` exemption is gone.
    const control = contrastOf(c.controlBorder, c.fill);
    assert.ok(control >= 3, fail(theme, "controlBorder", c.controlBorder, c.fill, control, "3"));

    // Every state glyph reads at glyph contrast (3:1) on the card and the page.
    for (const [key, state] of Object.entries(STATE)) {
      for (const bg of ["fill", "ground"]) {
        const r = contrastOf(c[state.token], c[bg]);
        assert.ok(r >= 3, fail(theme, `state ${key}`, c[state.token], c[bg], r, "3"));
      }
    }

    const bubble = contrastOf(c.bubbleEdge, c.bubble);
    const band = ownBubbleEdge(!theme.light);
    assert.ok(
      Math.abs(bubble - band) <= 0.05,
      fail(theme, "bubbleEdge", c.bubbleEdge, c.bubble, bubble, `within 0.05 of ${band.toFixed(2)}`),
    );
  });
}
