// bot-herdr's composer look in GPUI terms: a Claude-style palette as hex, light and dark.
//
// Colour lives here and nowhere else. Three layers sit on top of the raw pair below:
//   - the palette keys the mod has always drawn with (`ground`, `fill`, `ink`, `accent` …),
//     kept as aliases so nothing visible changes;
//   - the design language's semantic tokens (`surface0/1/2`, `textPrimary/Secondary/Muted`,
//     `accent`, `controlBorder`, `state*` and `agentHues`), which new code draws with;
//   - the fixed scales (`TYPE_SCALE`, `WEIGHT`, `SPACE_SCALE`, `RADIUS`).

/** Transparent: a layer that takes the pointer but paints nothing. */
export const CLEAR = "#00000000";

/** A harness mark on its own brand tile (programs.json tiles are colours we do not own). */
export const TILE_INK = "#ffffff";

/**
 * The one glyph, colour and word per state, the same on every page and surface. `token` names
 * the palette key the state draws in (`stateTone(c, key)` resolves it for the live theme).
 */
export const STATE = {
  needsYou: { glyph: "◆", token: "stateNeedsYou", word: "Needs you" },
  review: { glyph: "◇", token: "stateReview", word: "Review" },
  working: { glyph: "●", token: "stateWorking", word: "Working" },
  done: { glyph: "✓", token: "stateDone", word: "Done" },
  failed: { glyph: "✕", token: "stateFailed", word: "Failed" },
  paused: { glyph: "‖", token: "statePaused", word: "Paused" },
  idle: { glyph: "○", token: "stateIdle", word: "Idle" },
};

/**
 * A state's colour in the palette now drawn (`stateTone(c, "working")`); muted when unknown.
 * @param {any} c
 * @param {"needsYou" | "review" | "working" | "done" | "failed" | "paused" | "idle"} key
 */
export function stateTone(c, key) {
  return c?.[STATE[key]?.token] ?? c?.muted ?? null;
}

/** The seven agents' identity hues: an avatar and one presence dot, never chips, fills or bars. */
export const AGENT_NAMES = ["orchestrator", "dev", "design", "qa", "research", "scout", "advisor"];
const AGENT_HUES = { dev: "#5b8def", design: "#d6825a", qa: "#3fa877", research: "#a47bd6", scout: "#3ea3b5", advisor: "#c4973b" };

/** The composer's command hues (route.js): named here so no other file carries a colour. */
export const COMMAND_HUES = {
  task: "#5b8def",
  plan: "#a47bd6",
  new: "#3fa877",
  settings: "#8b9099",
  all: "#d29a3c",
  stop: "#cc6460",
  peek: "#3ea3b5",
  team: "#d6825a",
  "bh-info": "#3fa796",
};

/** The working word's hues for the roles `agentHue` does not name (indicators.js). */
export const ROLE_HUES = { planner: "#c4973b", agent: "#8b93a7" };

/** The four type sizes: metadata, body, titles and the hero number. */
export const TYPE_SCALE = { metadata: 12, body: 13, title: 15, hero: 20 };
/** The two weights: regular for content, semibold for titles and labels. */
export const WEIGHT = { regular: 400, semibold: 600 };

/** The 4 px space grid. */
export const SPACE_SCALE = [4, 8, 12, 16, 24, 32];

/** Controls curve at 8, cards at 12; borders, never shadows. */
export const RADIUS = { control: 8, card: 12 };

/**
 * A palette with the design language's names on top: the raw keys stay as aliases, and every
 * semantic token is derived from them, so any theme preset gets the whole map.
 * @param {Record<string, any>} base
 * @returns {Record<string, any>}
 */
function withTokens(base) {
  // A control's border must read at 3:1 on its card; `edge` is the quiet divider (1.3–1.6:1).
  const controlBorder = contrastOf(base.edgeDark, base.fill) >= 3 ? base.edgeDark : reach(base.fill, base.ink, 3);
  // The stop mark is a glyph on the stop fill: white where it reads, black where the fill is pale.
  const stopInk = contrastOf(base.ink, base.stop) >= 3 ? base.ink : luminance(base.stop) < 0.179 ? "#ffffff" : "#000000";
  return {
    ...base,
    edgeDark: controlBorder, // the old name, kept: nothing draws the bevel lip it once meant
    controlBorder,
    stopInk,
    surface0: base.ground,
    surface1: base.fill,
    surface2: base.hover,
    // A press: the surface a second level up from hover.
    pressed: mix(base.hover, base.ink, 0.07),
    textPrimary: base.ink,
    textSecondary: base.muted,
    textMuted: base.faint,
    stateNeedsYou: base.warning,
    stateReview: base.accent,
    stateWorking: base.accent,
    stateDone: base.success,
    stateFailed: base.danger,
    statePaused: base.muted,
    stateIdle: base.muted,
    agentHues: Object.fromEntries(AGENT_NAMES.map((name) => [name, agentHue(name, base.accent)])),
  };
}

const LIGHT_BASE = {
  ground: "#faf9f5",
  fill: "#ffffff",
  edge: "#e3e0d7",
  rim: "#ffffff", // the lit top edge
  ink: "#141413",
  muted: "#6a6964",
  faint: "#6a6966",
  hover: "#f4f3ef",
  well: "#ebe9e2",
  kbd: "#efeeea",
  accent: "#a25338",
  accentInk: "#ffffff",
  accentLip: "#82422d",
  stop: "#9e3d3a",
  stopHover: "#a8302c",
  danger: "#b91c1c",
  bubble: "#efede5", // your messages in the chat: a step off the ground, with an edge
  bubbleEdge: "#dcd8cc",
  info: "#1d4ed8",
  success: "#047857",
  warning: "#aa4f0a",
};

const DARK_BASE = {
  ground: "#262624",
  fill: "#30302e",
  edge: "#4a4a47",
  rim: "#3c3c3a",
  ink: "#faf9f5",
  muted: "#bbb9b2",
  faint: "#abaaa4",
  hover: "#3f3f3d",
  well: "#222220",
  kbd: "#3a3a38",
  accent: "#e1987e",
  accentInk: "#141413",
  accentLip: "#b47a65",
  stop: "#d89a96",
  stopHover: "#cf4f4a",
  danger: "#f88a89",
  bubble: "#3a3a37",
  bubbleEdge: "#51514d",
  info: "#6eadfa",
  success: "#34d399",
  warning: "#fbbf24",
};

/**
 * What an open composer pane puts between it and the page: black at 32% on the light ground and
 * 55% on the dark one, since dark needs more to read as a step back. gpui has no blur, so this
 * scrim stands in for one. Pick it with `isLight(c)`.
 * @type {{ light: import("gpui-kit").Color, dark: import("gpui-kit").Color }}
 */
export const SCRIM = { light: "#00000052", dark: "#0000008c" };

/** Sizes in px at zoom 1 (herdr scales them). After the user's radii: outer 12, controls 10, nested 8. */
export const SIZE = {
  maxWidth: 660, // the chat column width
  gutter: 24, // room either side of the composer in its block
  foot: 10, // from the composer's foot to the block's
  radius: 12,
  control: 10,
  nested: 8,
  textTop: 14,
  textX: 16,
  minRows: 2,
  maxRows: 10,
  line: 20, // the text's line height
  filesRow: 40,
  imagesRow: 80, // attachments with image previews
  tools: 38, // the button row: 28px buttons with 5px above and below
  rowsShown: 8,
  menuPad: 4,
  fillet: 12,
};

/** The five text sizes the UI draws at today, each with its line height (the M3 migration). */
export const TYPE = { xs: 10.5, sm: 12, md: 13.5, lg: 16, xl: 18 };
export const LINE = { xs: 14, sm: 16, md: 20, lg: 22, xl: 24 };

/** Every space in the app: 16 is for page padding only. */
export const SPACE = { 1: 2, 2: 4, 3: 8, 4: 12, 5: 16 };

/** Heights: a list row, an input or button, a chip and tag, and the smallest hit target. */
export const ROW = 28;
export const CONTROL = 28;
export const CHIP = 22;
export const TARGET = 28;

/** A pip's radius, a status dot, a checkbox/task mark, a hairline, and the icon sizes. */
export const PIP = 3;
export const DOT = 6;
export const MARK = 14;
export const HAIR = 1;
export const GLYPH = { xs: 10, sm: 12, md: 14, lg: 16 };

/**
 * Each motion is a gpui transition policy, typed so its `easing` stays one of the keywords the
 * shell takes rather than widening to any string; `stagger` is a gap in milliseconds, not a
 * motion at all.
 * @typedef {import("gpui-shell").TransitionPolicy} Motion
 */

/** The design language's three timings: hover, appear and fold, panels sliding in. */
export const TIMING = { hover: 100, appear: 150, panel: 250 };

/** The one tick every working animation's text frames run on. */
export const TICK_MS = 120;

/**
 * Reduce motion: the Settings › General toggle, or herdr's own setting once it has one. main.js
 * hands in where to read it (`setMotionSource`); everything that moves asks `reducedMotion()`.
 */
let motionSource = () => false;

/** The shared (persisted, every view re-renders on change) key of the Reduce motion toggle. */
export const REDUCE_MOTION_KEY = "bot-herdr.reduce-motion";

/** Whether motion is reduced, from the toggle's shared value and herdr's settings (`reduced_motion`, once herdr has it). */
export const motionReduced = (toggle, hostSettings) => toggle === true || hostSettings?.reduced_motion === true;

/** Where `reducedMotion()` reads from: a function answering true while motion is reduced. */
export function setMotionSource(read) {
  motionSource = typeof read === "function" ? read : () => false;
}

/** Whether motion is reduced now: frames freeze on their first glyph and fades are instant. */
export function reducedMotion() {
  try {
    return Boolean(motionSource());
  } catch {
    return false;
  }
}

/** A transition policy as drawn now: instant, with no delay, while motion is reduced. */
export function timed(policy) {
  return reducedMotion() ? { ...policy, duration: 0, delay: 0 } : policy;
}

/**
 * A looping property (a breathe, a pulse) that rests, unmoving, while motion is reduced: an
 * opacity loop rests fully shown at its `to`, anything else where the element already sits.
 */
export function looping(el, property, options) {
  if (!reducedMotion()) return el.loop(property, options);
  return property === "opacity" && Number.isFinite(options?.to) ? el.opacity(options.to) : el;
}

/** Text frames on the one tick: frozen on the first frame while motion is reduced. */
export function framed(el, list, ms = TICK_MS) {
  const frames = Array.isArray(list) && list.length ? list : [""];
  return reducedMotion() ? el.child(frames[0]) : el.frames(frames, ms);
}

/** A spinning glyph that stands still while motion is reduced. */
export function spinning(el, ms) {
  return reducedMotion() ? el : el.spin(ms);
}

/** A spring on a property that snaps with no motion while motion is reduced. */
export function springing(el, property, policy) {
  return reducedMotion() ? el : el.spring(property, policy);
}

/** How long a newly finished thread or step holds its soft highlight before fading. */
export const HIGHLIGHT_MS = 2000;

/** Every motion's resting policy, on the three timings; MOTION hands them out through `timed`. */
const POLICIES = {
  hover: { duration: TIMING.hover, easing: "ease-out" },
  press: { duration: TIMING.hover, easing: "ease-out" },
  pane: { duration: TIMING.panel, easing: "ease-out" },
  arrive: { duration: TIMING.appear, easing: "ease-out" },
  fold: { duration: TIMING.appear, easing: "ease-in-out" },
  menuWidth: { duration: TIMING.panel, easing: "ease-out" },
  menuClose: { duration: TIMING.appear, easing: "ease-in" },
  row: { duration: TIMING.appear, easing: "ease-out" },
  tool: { duration: TIMING.appear, easing: "ease-out" },
  // A toast leaving: as long as a panel, eased at both ends so it melts away, not snaps.
  toastOut: { duration: TIMING.panel, easing: "ease-in-out" },
  toastTextOut: { duration: TIMING.appear, easing: "ease-in-out" },
  turn: { duration: TIMING.panel, easing: "ease-out" },
  verb: { duration: TIMING.panel, easing: "ease-out" },
  highlight: { duration: TIMING.panel, easing: "ease-out" },
};

/** @type {Record<keyof typeof POLICIES, Motion> & { stagger: number }} */
export const MOTION = /** @type {any} */ ({
  get stagger() {
    return reducedMotion() ? 0 : 22;
  },
});
for (const name of Object.keys(POLICIES)) {
  Object.defineProperty(MOTION, name, { enumerable: true, get: () => timed(POLICIES[name]) });
}

/** A pointer over a control: its background takes the hover tone. gpui animates no colours. */
export function hoverable(el, c, fill = null) {
  return el.cursor_pointer().hover((s) => s.bg(fill ?? c.hover));
}

/** A filled accent button's hover: the accent a shade deeper, never the page's pale hover tone. */
export const accentFill = (c) => mix(c.accent, c.accentLip ?? "#000000", 0.28);

/**
 * A press sinks the control a pixel (`top` is one of the properties gpui animates) and, given a
 * `press` tone, steps its surface up. gpui keeps one active style, so both are set here at once.
 */
export function pressable(el, press = null) {
  return el.relative().transition("top", MOTION.press).active((s) => (press ? s.top(1).bg(press) : s.top(1)));
}

/** The press tone over a hover tone: one more step up the surfaces (no bounce, no colour fade). */
export const pressTone = (c, fill = null) => (fill && fill !== c.hover ? mix(fill, c.ink, 0.07) : c.pressed ?? c.hover);

/**
 * Keyboard reach and a 2px accent ring on focus; `id` keeps its identity across re-renders. The
 * ring's 2px are reserved (a clear border) so focus moves nothing; an element that draws its own
 * edge (`edge: true`) keeps it and the ring takes its place. gpui's `focus` style follows focus,
 * not the input device, so a click that focuses a control shows its ring too.
 */
export function focusable(el, id, c, { edge = false } = {}) {
  const reserved = edge ? el : el.border_2().border_color(CLEAR);
  return reserved.id(id).tab_index(0).focus((s) => s.border_2().border_color(c.accent).opacity(1));
}

/** Whether a key press activates the focused control, as a click would: Enter or Space. */
export const activatesOn = (e) => ["enter", "return", "space", " "].includes(String(e?.key ?? "").toLowerCase()) && !e?.modifiers?.control && !e?.modifiers?.alt && !e?.modifiers?.platform;

/**
 * A control that opens on a press (a list under it, say) also opens on Enter or Space while it
 * holds the keyboard; `run(cx)` is what the press does, without a pointer position.
 */
export function activates(el, run) {
  return el.on_key_down((e, cx) => {
    if (!activatesOn(e)) return;
    cx.stop_propagation();
    run(cx);
  });
}

/**
 * A scrolling conversation a press folds the composer under: it is a tab stop too, named for a
 * screen reader, and Esc while it holds the keyboard folds the box as the press does.
 */
export function foldRegion(el, label, fold) {
  return el.tab_index(0).role("log").accessibility_label(label).on_key_down((e, cx) => {
    if (String(e?.key ?? "").toLowerCase() !== "escape") return;
    fold(cx);
  });
}

/** A control's whole answer to the pointer and the keyboard: hover, press and focus. */
export function clickable(el, c, id, { fill = null, edge = false } = {}) {
  // Hover steps the surface up one level; a press steps it up a second.
  return focusable(pressable(hoverable(el, c, fill), pressTone(c, fill)), id, c, { edge });
}

/**
 * An action button's colours per tone: `fill` at rest (null for none), `hover` under the pointer,
 * `ink` for its label and glyph, and `edge` as a 1px line (null for none).
 */
export function buttonTone(c, tone) {
  if (tone === "primary") return { fill: c.accent, hover: accentFill(c), ink: c.accentInk, edge: null };
  if (tone === "danger") return { fill: c.fill, hover: c.hover, ink: c.danger, edge: c.edge };
  if (tone === "quiet") return { fill: null, hover: c.hover, ink: c.ink, edge: null };
  return { fill: c.fill, hover: c.hover, ink: c.ink, edge: c.edge };
}

export const ICON = (name) => `mods/bot-herdr/icons/${name}.svg`;

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
 * A colour that reads as text on `bg`: the colour itself when it already reaches `target`
 * contrast there, else the same hue moved toward `ink` (the palette's text colour) and, when
 * even `ink` cannot reach the target, toward white on a dark background or black on a light one.
 * The mix is found by binary search, so a colour moves only as far as it must and keeps its hue.
 */
export function readable(color, bg, target = 4.5, ink) {
  const lit = luminance(color);
  const back = luminance(bg);
  const pole = (back ?? 0) < 0.179 ? "#ffffff" : "#000000";
  if (lit === null || back === null) return ink ?? pole;
  if (contrast(lit, back) >= target) return color;
  const toward = (to) => {
    if (contrastOf(to, bg) < target) return null;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 10; i++) {
      const t = (lo + hi) / 2;
      if (contrastOf(mix(color, to, t), bg) >= target) hi = t;
      else lo = t;
    }
    return mix(color, to, hi);
  };
  return toward(ink ?? pole) ?? toward(pole) ?? pole;
}

export function tint(c, row) {
  if (row?.color) return readable(row.color, c.fill, 4.5, c.ink);
  if (row?.tag === "start") return c.muted;
  return c.accent;
}

const rgb = (h) => {
  const m = /^#?([0-9a-f]{6})/i.exec(String(h ?? ""));
  return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : null;
};

/**
 * A theme token as it is drawn: an 8-digit `#rrggbbaa` is blended onto the surface under it, so
 * every token the palette returns is an opaque `#rrggbb` and its contrast is the one on screen.
 * Six-digit colours, and anything that is not a colour, come back unchanged.
 */
function opaque(color, under) {
  const m = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(String(color ?? ""));
  if (!m || !m[2]) return color;
  const back = rgb(under);
  if (!back) return `#${m[1]}`;
  const fg = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  const a = parseInt(m[2], 16) / 255;
  return `#${fg.map((v, i) => hex(v * a + back[i] * (1 - a))).join("")}`;
}
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

/** The mix of `from` toward `to` at exactly `target` contrast against `from`, by binary search. */
function atRatio(from, to, target) {
  const pole = luminance(from) < 0.179 ? "#ffffff" : "#000000";
  const end = contrastOf(to, from) >= target ? to : pole;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 10; i++) {
    const t = (lo + hi) / 2;
    if (contrastOf(mix(from, end, t), from) >= target) hi = t;
    else lo = t;
  }
  return mix(from, end, hi);
}

/** Our own pair, with the design language's tokens on it (every other preset gets them from `palette`). */
export const LIGHT = withTokens(LIGHT_BASE);
export const DARK = withTokens(DARK_BASE);

/** How soft our own bubble edge is against its bubble, per polarity. */
const ownBubbleEdge = (dark) =>
  contrastOf((dark ? DARK : LIGHT).bubbleEdge, (dark ? DARK : LIGHT).bubble);

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

/** Whether a palette is the light one (its page ground is light). */
export function isLight(c) {
  return (luminance(c?.ground) ?? 1) > 0.4;
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
  // herdr's presets give some tokens with alpha (a border at 9% white, a selection at 9%): blend
  // each one onto the surface it is drawn on first, so every token here is opaque and the ratio
  // the contrast test reads is the ratio on screen.
  const backdrop = opaque(t.background ?? t.surface ?? "#000000", "#000000");
  const ground = opaque(t.canvas ?? t.surface ?? t.background ?? "#000000", backdrop);
  const dark = s.dark ?? (luminance(ground) ?? 0) < 0.4;
  const base = dark ? DARK : LIGHT;
  const ink = opaque(t.foreground, ground);
  // A theme file may name only its background, foreground and ansi colours: build the panels
  // from its own background instead of borrowing our pair's.
  const fill = opaque(t.raised ?? t.popover ?? t.surface ?? mix(ground, ink, dark ? 0.05 : 0.03), ground);
  const border = opaque(t.border ?? mix(fill, ink, 0.18), fill);
  const bubble = opaque(t.selected ?? mix(ground, ink, 0.07), ground);
  const hover = opaque(t.hover ?? mix(fill, ink, 0.06), fill);
  const well = opaque(t.input ?? mix(ground, ink, 0.06), ground);
  // Text is drawn on the card, the page, a row under the pointer, a well and your bubble (a plan's
  // "Show more", a segmented label, a file chip): repair against the hardest of all of them.
  const surfaces = [fill, ground, hover, well, bubble];
  const onAll = (color) => {
    let out = color;
    for (let i = 0; i < 6; i++) {
      let worst = fill;
      let low = Infinity;
      for (const bg of surfaces) {
        const r = contrastOf(out, bg);
        if (r < low) {
          low = r;
          worst = bg;
        }
      }
      if (low >= 4.5) return out;
      out = readable(out, worst, 4.5, ink);
    }
    return out;
  };
  const solid = opaque(t.solid, fill);
  const accent = solid ?? onAll(opaque(t.accent ?? t.ansi4 ?? base.accent, fill));
  const wantedInk = opaque(solid ? t.solid_foreground : t.accent_foreground, accent);
  const accentInk = [wantedInk, "#000000", "#ffffff"].find((x) => x && contrastOf(x, accent) >= 4.5) ?? "#ffffff";
  const red = onAll(opaque(t.ansi1 ?? t.blocked ?? base.danger, fill));
  return withTokens({
    ground,
    fill,
    edge: line(fill, border, ink),
    rim: fill,
    ink,
    muted: onAll(opaque(t.muted ?? mix(ink, fill, 0.35), fill)),
    faint: onAll(opaque(t.dim ?? mix(ink, fill, 0.5), fill)),
    hover,
    well,
    kbd: opaque(t.selected ?? mix(fill, ink, 0.08), fill),
    accent,
    accentInk,
    accentLip: mix(accent, "#000000", 0.2),
    edgeDark: contrastOf(border, fill) >= 3 ? border : reach(fill, ink, 3),
    stop: red,
    stopHover: mix(red, "#000000", 0.1),
    danger: red,
    bubble,
    bubbleEdge: atRatio(bubble, ink, ownBubbleEdge(dark)),
    info: onAll(opaque(t.ansi4 ?? base.info, fill)),
    success: onAll(opaque(t.ansi2 ?? base.success, fill)),
    warning: onAll(opaque(t.ansi3 ?? base.warning, fill)),
  });
}

/** A file size in one short word: 900 B, 12 KB, 3.4 MB. */
export function sizeText(bytes) {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return "";
  const n = bytes;
  if (n < 1000) return `${Math.round(n)} B`;
  if (n < 1000 * 1000) return `${Math.round(n / 1000)} KB`;
  return `${(n / (1000 * 1000)).toFixed(1)} MB`;
}

/** The last segment of a path (`/a/b` → `b`, `C:\` → `C:`). */
export function baseName(path) {
  const s = String(path ?? "").replace(/[\\/]+$/, "");
  return s.split(/[\\/]/).filter(Boolean).pop() ?? s;
}

/** The folder above a path, or null at a drive/filesystem root. Both separators accepted. */
export function parentPath(path) {
  const s = String(path ?? "").replace(/[\\/]+$/, "");
  if (!s || /^[A-Za-z]:$/.test(s)) return null;
  const cut = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\"));
  if (cut <= 0) return cut === 0 ? "/" : null;
  const head = s.slice(0, cut);
  if (/^[A-Za-z]:$/.test(head)) return `${head}${s[cut]}`;
  return head;
}

/**
 * The folder above `path` in the file browser: up from a drive's own foot is the drive list, which
 * is "" (`bh files ""` lists the drives), since Windows has no single root. Up from there, and from
 * "/", is nothing.
 */
export function upFrom(path) {
  return /^[a-z]:[\\/]$/i.test(String(path ?? "")) ? "" : parentPath(path);
}

/** Entries whose name contains `query` (case-insensitive), in their given order (folders first). */
export function filterEntries(entries, query) {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return entries ?? [];
  return (entries ?? []).filter((e) => String(e.name ?? "").toLowerCase().includes(q));
}

/** A new selection with `path` toggled. */
export function togglePick(picks, path) {
  const next = new Set(picks ?? []);
  if (next.has(path)) next.delete(path);
  else next.add(path);
  return next;
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

/** An agent's name as text where it is drawn: the page and a card, moved toward the ink if pale. */
export function agentInk(c, name) {
  const hue = agentHue(name, c.accent);
  const harder = contrastOf(hue, c.ground) <= contrastOf(hue, c.fill) ? c.ground : c.fill;
  return readable(hue, harder, 4.5, c.ink);
}

/** An agent's name on a surface tinted with its hue (an `alpha` blend of the hue over ground). */
export function agentInkOn(c, name, bg) {
  return readable(agentHue(name, c.accent), bg, 4.5, c.ink);
}

/** A steady colour for an agent's name: its role's hue, or one hashed from the name. */
export function agentHue(name, accent) {
  const key = String(name ?? "").toLowerCase();
  if (key === "orchestrator") return accent;
  if (AGENT_HUES[key]) return AGENT_HUES[/** @type {keyof typeof AGENT_HUES} */ (key)];
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) % 360;
  // gpui-kit text colours must be theme tokens or #hex literals, not hsl().
  const s = 0.42;
  const l = 0.58;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const hex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}
