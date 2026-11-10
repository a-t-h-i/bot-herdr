// bot-herdr's composer look in GPUI terms: a Claude-style palette as hex, light and dark.

export const LIGHT = {
  ground: "#faf9f5",
  fill: "#ffffff",
  edge: "#e3e0d7",
  edgeDark: "#d6d2c6", // the slightly darker bottom lip of the bevel
  rim: "#ffffff", // the lit top edge
  ink: "#141413",
  muted: "#73726c",
  faint: "#918f8a",
  hover: "#f4f3ef",
  well: "#ebe9e2",
  kbd: "#efeeea",
  accent: "#c96442",
  accentInk: "#ffffff",
  accentLip: "#a9512f",
  stop: "#9e3d3a",
  stopHover: "#a8302c",
  danger: "#b91c1c",
  bubble: "#efede5", // your messages in the chat: a step off the ground, with an edge
  bubbleEdge: "#dcd8cc",
  info: "#1d4ed8",
  success: "#047857",
  warning: "#b45309",
  scrim: "#14141380", // behind a picture opened large
};

export const DARK = {
  ground: "#262624",
  fill: "#30302e",
  edge: "#4a4a47",
  edgeDark: "#1d1d1b",
  rim: "#3c3c3a",
  ink: "#faf9f5",
  muted: "#bbb9b2",
  faint: "#8c8a84",
  hover: "#3f3f3d",
  well: "#222220",
  kbd: "#3a3a38",
  accent: "#d97757",
  accentInk: "#ffffff",
  accentLip: "#b85a3c",
  stop: "#c45e5a",
  stopHover: "#cf4f4a",
  danger: "#f87171",
  bubble: "#3a3a37",
  bubbleEdge: "#51514d",
  info: "#60a5fa",
  success: "#34d399",
  warning: "#fbbf24",
  scrim: "#000000a6",
};

/** Sizes in px at zoom 1 (herdr scales them). After the user's radii: outer 12, controls 10, nested 8. */
export const SIZE = {
  maxWidth: 660, // the chat column width
  gutter: 24, // room either side of the composer in its block
  foot: 14, // from the composer's foot to the block's
  radius: 12,
  control: 10,
  nested: 8,
  textTop: 14,
  textX: 16,
  minRows: 2,
  maxRows: 10,
  line: 21, // the text's line height
  filesRow: 40,
  imagesRow: 80, // attachments with image previews
  tools: 46,
  iconButton: 32,
  chip: 28,
  row: 30,
  rowsShown: 8,
  menuPad: 4,
  fillet: 12,
};

export const MOTION = {
  menuHeight: { duration: 190, easing: "ease-out" },
  menuWidth: { duration: 170, easing: "ease-out" },
  menuClose: { duration: 110, easing: "ease-in" },
  rowStagger: 22,
  row: { duration: 240, easing: "ease-out" },
  tool: { duration: 160, easing: "ease-out" },
};

export const ICON = (name) => `mods/bot-herdr/icons/${name}.svg`;

/** A row's or chip's colour: our commands the accent, agents their program's tile. */
/** Relative luminance of a #rrggbb colour (WCAG). */
function luminance(hex) {
  const m = /^#?([0-9a-f]{6})/i.exec(String(hex ?? ""));
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

const hex = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/**
 * A colour that reads as text on `bg` (our card by default): the colour itself when it has
 * 4.5:1 contrast there, else the same hue moved toward the ink until it does. herdr gives many
 * agents a near-black tile, which would vanish on the dark theme, so a name keeps its hue but
 * never the background's darkness.
 */
export function readable(c, color, bg = c.fill) {
  const m = /^#?([0-9a-f]{6})/i.exec(String(color ?? ""));
  const back = luminance(bg);
  const ink = /^#?([0-9a-f]{6})/i.exec(String(c.ink ?? ""));
  if (!m || back === null || !ink) return c.ink;
  if (contrast(luminance(m[1]), back) >= 4.5) return `#${m[1]}`;
  const from = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  const to = [0, 2, 4].map((i) => parseInt(ink[1].slice(i, i + 2), 16));
  for (let t = 0.1; t < 1; t += 0.1) {
    const mixed = from.map((v, i) => hex(v + (to[i] - v) * t)).join("");
    if (contrast(luminance(mixed), back) >= 4.5) return `#${mixed}`;
  }
  return c.ink;
}

export function tint(c, row) {
  if (row?.color) return readable(c, row.color);
  if (row?.tag === "start") return c.muted;
  return c.accent;
}

const rgb = (h) => {
  const m = /^#?([0-9a-f]{6})/i.exec(String(h ?? ""));
  return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : null;
};
/** a mixed toward b by t (0..1), as #rrggbb; a when either isn't a colour. */
export function mix(a, b, t) {
  const x = rgb(a);
  const y = rgb(b);
  if (!x || !y) return a;
  return `#${x.map((v, i) => hex(v + (y[i] - v) * t)).join("")}`;
}

/** The WCAG contrast ratio of two #rrggbb colours; 1 when either isn't one. */
export function contrastOf(a, b) {
  const x = luminance(a);
  const y = luminance(b);
  return x === null || y === null ? 1 : contrast(x, y);
}

/** The first mix of `from` toward `to` with at least `min` contrast against `from`; `to` when none is. */
function reach(from, to, min) {
  for (let t = 0.02; t < 1; t += 0.02) {
    const m = mix(from, to, t);
    if (contrastOf(m, from) >= min) return m;
  }
  return to;
}

/**
 * A quiet line on `fill`: the theme's own `border` when it sits at 1.3–1.6:1 there, else a mix
 * at about 1.4:1, toward the border when it is stronger (herdr's border is the pane split) and
 * toward the ink when it is fainter.
 */
function line(fill, border, ink) {
  const r = contrastOf(border, fill);
  if (r >= 1.3 && r <= 1.6) return border;
  return reach(fill, r > 1.6 ? border : ink, 1.4);
}

/** Whether a theme is ours (the Claude look above): the layout's own pair, or none named. */
export const ownTheme = (name) => !name || /^bot-herdr/.test(String(name));

/**
 * Our tokens for any herdr theme: ours when the theme is ours; otherwise every token from the
 * theme's own colours (herdr names the same ones in every theme), so Graphite, Ink, Moss, Paper,
 * Atom One Dark, Herdr 98 and any theme file all look like themselves here.
 */
export function palette(s = {}, t = {}) {
  if (ownTheme(s.theme) || !t?.foreground) return s.dark ? DARK : LIGHT;
  const dark = s.dark ?? (luminance(String(t.background ?? t.surface ?? "#000").replace("#", "")) ?? 0) < 0.4;
  const base = dark ? DARK : LIGHT;
  const ground = t.canvas ?? t.surface ?? t.background ?? base.ground;
  const fill = t.raised ?? t.popover ?? t.surface ?? base.fill;
  const ink = t.foreground;
  const border = t.border ?? mix(fill, ink, 0.18);
  const bubble = t.selected ?? mix(ground, ink, 0.07);
  const accent = t.accent ?? base.accent;
  const red = t.ansi1 ?? t.blocked ?? base.danger;
  return {
    ground,
    fill,
    edge: line(fill, border, ink),
    edgeDark: contrastOf(border, fill) >= 3 ? border : reach(fill, ink, 3), // controls: 3:1
    rim: fill,
    ink,
    muted: t.muted ?? mix(ink, fill, 0.35),
    faint: t.dim ?? mix(ink, fill, 0.5),
    hover: t.hover ?? mix(fill, ink, 0.06),
    well: t.input ?? mix(ground, ink, 0.06),
    kbd: t.selected ?? mix(fill, ink, 0.08),
    accent,
    accentInk: t.accent_foreground ?? base.accentInk,
    accentLip: mix(accent, "#000000", 0.2),
    stop: red,
    stopHover: mix(red, "#000000", 0.1),
    danger: red,
    bubble,
    bubbleEdge: line(bubble, border, ink),
    info: t.ansi4 ?? base.info,
    success: t.ansi2 ?? base.success,
    warning: t.ansi3 ?? base.warning,
    scrim: dark ? "#000000a6" : "#14141380",
  };
}

/** Rough text width at a size, for sizing the suggestion bubble. */
export function textWidth(s, size) {
  let w = 0;
  for (const ch of s) w += /[mwMW@]/.test(ch) ? 0.82 : /[il.,:;'|!]/.test(ch) ? 0.3 : /[A-Z]/.test(ch) ? 0.66 : 0.55;
  return w * size;
}

/** How many rows the text needs at this inner width: its lines, each wrapped, within min and max. */
export function rowsFor(text, innerWidth, size = 14) {
  let rows = 0;
  for (const line of text.split("\n")) rows += Math.max(1, Math.ceil(textWidth(line, size) / Math.max(40, innerWidth)));
  return Math.max(SIZE.minRows, Math.min(SIZE.maxRows, rows));
}
