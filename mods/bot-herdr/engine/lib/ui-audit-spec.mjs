// The design-language audit's pure half: parse `herdr-app check --print-spec` trees, count the
// spec's Fix table, measure keyboard and label coverage, and check every theme preset's contrast.
// No fs, no spawning, no gpui imports, so `npm test` checks it directly.

import { palette, contrastOf, mix, agentHue } from "../../look.js";

/** The 16 theme presets the audit checks, in a stable order (files fill the gaps in snapshot). */
export const PRESET_NAMES = ["graphite", "ink", "moss", "paper", "bot-herdr-light", "bot-herdr-dark", "dune-light", "dune-dark", "fern-light", "fern-dark", "harbor-light", "harbor-dark", "plum-light", "plum-dark", "atom-one-dark", "win98"];

/** What each Fix-table counter must reach. A higher counter is not always worse (destinations). */
export const TARGETS = {
  topLevelDestinations: { max: 5 },
  zeroCountChips: { max: 0 },
  repeatedDefaultStrings: { max: 0 },
  statsPerCard: { max: 1 },
  selectionStyles: { max: 1 },
  rawMachineText: { max: 0 },
  decorativeIcons: { max: 0 },
  agentColourFills: { max: 0 },
};

const TEXT_TOKENS = ["ink", "muted", "faint", "accent", "danger", "info", "success", "warning"];
const TEXT_SURFACES = ["fill", "ground", "well", "bubble", "hover"];
const GLYPH_TOKENS = ["accent", "success", "warning", "danger", "muted"];

/** One hex colour as channels; a colour name (a theme token) is not one. */
export function decodeColor(value) {
  const m = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(String(value ?? "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: m[2] ? parseInt(m[2], 16) / 255 : 1 };
}

const channel = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");

/** `#rrggbbaa` over an opaque surface → the opaque `#rrggbb` actually drawn. */
export function compositeOver(color, surface) {
  const fg = decodeColor(color);
  const bg = decodeColor(surface);
  if (!fg) return surface;
  if (!bg) return color;
  const blend = (i) => fg[i] * fg.a + bg[i] * (1 - fg.a);
  return `#${channel(blend("r"))}${channel(blend("g"))}${channel(blend("b"))}`;
}

/** WCAG relative luminance of an opaque #rrggbb. */
export function luminance(color) {
  const c = decodeColor(color);
  if (!c) return null;
  const [r, g, b] = [c.r, c.g, c.b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio after compositing both colours where they sit; 1 when either is no colour. */
export function contrastRatio(a, b, { over = null } = {}) {
  const under = over ?? "#000000";
  const x = luminance(compositeOver(a, under));
  const y = luminance(compositeOver(b, under));
  if (x === null || y === null) return 1;
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const unescape = (s) => s.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");

/** A printed attribute value: `Str("…")`, `Number(13.5)`, `Bool(true)`, `fn`, or the bare word. */
export function decodeValue(raw) {
  const text = String(raw ?? "").trim();
  const str = /^Str\("([\s\S]*)"\)$/.exec(text);
  if (str) return unescape(str[1]);
  const num = /^Number\((-?[\d.]+)\)$/.exec(text);
  if (num) return Number(num[1]);
  const bool = /^Bool\((true|false)\)$/.exec(text);
  if (bool) return bool[1] === "true";
  return text;
}

/** Splits one printed element line into tokens, keeping bracketed and quoted text whole. */
function tokenize(line) {
  const tokens = [];
  let i = 0;
  while (i < line.length) {
    while (line[i] === " ") i++;
    if (i >= line.length) break;
    if (line[i] === '"') {
      const [token, next] = readString(line, i);
      tokens.push(token);
      i = next;
      continue;
    }
    const [token, next] = readToken(line, i);
    tokens.push(token);
    i = next;
  }
  return tokens;
}

/** A quoted string token (`"…"`, with its backslash escapes kept) and where it ends. */
function readString(line, at) {
  let i = at + 1;
  let value = "";
  while (i < line.length) {
    if (line[i] === "\\" && i + 1 < line.length) {
      value += line[i] + line[i + 1];
      i += 2;
      continue;
    }
    if (line[i] === '"') {
      i += 1;
      break;
    }
    value += line[i++];
  }
  return [{ kind: "string", value: unescape(value) }, i];
}

/** One bare token, up to the next space outside its brackets and parentheses. */
function readToken(line, at) {
  let i = at;
  let square = 0;
  let round = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === "[") square += 1;
    else if (ch === "]") square = Math.max(0, square - 1);
    else if (ch === "(") round += 1;
    else if (ch === ")") round = Math.max(0, round - 1);
    else if (ch === " " && square === 0 && round === 0) break;
    i += 1;
  }
  return [{ kind: "token", value: line.slice(at, i) }, i];
}

/** An attribute or a style: `:id[Str("x")]` → {kind:"prop", name:"id", value:"x"}; `.bg[Str(…)]`. */
function parseAttr(token) {
  const marker = token[0];
  if (![".", ":", "#"].includes(marker)) return null;
  const body = token.slice(1);
  const cut = body.search(/[[(]/);
  const name = cut === -1 ? body : body.slice(0, cut);
  const raw = cut === -1 ? null : body.slice(cut + 1, body.length - 1);
  const kind = marker === "." ? "style" : marker === ":" ? "prop" : "index";
  return { kind, name, value: raw === null ? true : decodeValue(raw), raw };
}

/** One printed line as a node: its name, attributes, text or source, and children (filled later). */
export function parseElementLine(line) {
  const tokens = tokenize(line);
  if (!tokens.length || tokens[0].kind !== "token") return null;
  const node = { name: tokens[0].value, attrs: [], text: null, src: null, index: null, children: [], parent: null, depth: 0 };
  const strings = [];
  for (const token of tokens.slice(1)) {
    if (token.kind === "string") strings.push(token.value);
    else applyToken(node, token.value);
  }
  applyStrings(node, strings);
  return node;
}

/** One attribute token onto its node: `.style`, `:prop` or `#index`. */
function applyToken(node, token) {
  const attr = parseAttr(token);
  if (!attr) return;
  if (attr.kind === "index") node.index = Number(attr.name);
  else if (attr.name === "src" || attr.name === "path") node.src = attr.value;
  else node.attrs.push(attr);
}

/** The quoted values of a line: a TextView's markdown body follows its id; an svg's is its source. */
function applyStrings(node, strings) {
  if (node.name === "svg") {
    node.src = strings[0] ?? null;
  } else if (strings.length) {
    node.text = strings[strings.length - 1];
    node.src = strings.length > 1 ? strings[0] : null;
  }
}

/** A line is spec when it starts with an element name; engine warnings and MESA noise never do. */
function isSpecLine(trimmed) {
  if (/^(MESA|WARNING|WARN|check |panvk|herdr-app:)/.test(trimmed)) return false;
  const first = trimmed.split(/\s+/, 1)[0];
  return /^[A-Za-z_][\w]*$/.test(first);
}

/** The printed spec tree: its lines nested by two-space indentation under a synthetic root. */
export function parseSpec(text) {
  const root = { name: "root", attrs: [], text: null, src: null, children: [], parent: null, depth: -1 };
  const stack = [root];
  for (const line of String(text ?? "").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || !isSpecLine(trimmed)) continue;
    const node = parseElementLine(trimmed);
    if (!node) continue;
    const depth = Math.floor((line.length - line.trimStart().length) / 2);
    node.depth = depth;
    while (stack.length > 1 && stack[stack.length - 1].depth >= depth) stack.pop();
    node.parent = stack[stack.length - 1];
    node.parent.children.push(node);
    stack.push(node);
  }
  return root;
}

/** Every node under (and including) `node`, in tree order. */
export function walk(node) {
  const out = [];
  const visit = (n) => {
    out.push(n);
    for (const child of n.children ?? []) visit(child);
  };
  visit(node);
  return out;
}

/** The elements and text a page drew: what the "visible elements" baseline counts. */
export const visibleElements = (spec) => walk(spec).length - 1;

/** The prop (colon attribute) named `name`, or null. */
export const prop = (node, name) => node?.attrs?.find((a) => a.kind === "prop" && a.name === name)?.value ?? null;

/** The style (dot attribute) named `name`, or null; `true` when the style takes no value. */
export const style = (node, name) => node?.attrs?.find((a) => a.kind === "style" && a.name === name)?.value ?? null;

/** The node's element id, when it has one. */
export const elementId = (node) => (typeof prop(node, "id") === "string" ? prop(node, "id") : null);

const isTrue = (value) => value === true || value === "true";

const INTERACTIVE_PROPS = ["on_click", "on_mouse_down_left", "on_mouse_down"];
const KEYBOARD_PROPS = ["tab_index", "track_focus", "on_key_down", "on_action"];
const KEYBOARD_ELEMENTS = new Set(["Input", "Textarea", "Button", "Checkbox", "Switch", "Radio", "Tab", "Select"]);

/** Whether an element takes a press: a click handler or the pointer cursor. */
export function isInteractive(node) {
  if (INTERACTIVE_PROPS.some((name) => prop(node, name) !== null)) return true;
  return style(node, "cursor_pointer") !== null;
}

/** Whether the element itself can be reached by the keyboard. */
export function hasKeyboardPath(node) {
  if (KEYBOARD_ELEMENTS.has(node.name)) return true;
  return KEYBOARD_PROPS.some((name) => prop(node, name) !== null);
}

/** Whether an element has an accessible name: its label, its text, or the text a child draws. */
export function hasAccessibleLabel(node) {
  if (typeof prop(node, "accessibility_label") === "string") return true;
  if (typeof node.text === "string" && node.text.trim()) return true;
  return walk(node).some((n) => n !== node && n.name === "text" && String(n.text ?? "").trim());
}

const under = (node, predicate) => {
  for (let n = node; n; n = n.parent) if (predicate(n)) return true;
  return false;
};

/** A `text` leaf's value, or a TextView markdown's body, as one string. */
export function textOf(node) {
  if (node.name === "text") return String(node.text ?? "");
  if (/^Text(Area|View)?$/.test(node.name) && typeof node.text === "string") return node.text;
  return null;
}

const numericText = (node) => /\d/.test(textOf(node) ?? "");

const sameColor = (a, b) => {
  const x = decodeColor(a);
  const y = decodeColor(b);
  return Boolean(x && y && x.r === y.r && x.g === y.g && x.b === y.b);
};

const isAlphaOf = (color, base) => {
  const x = decodeColor(color);
  const y = decodeColor(base);
  return Boolean(x && y && x.a < 1 && sameColor(color, base));
};

/** The tint set an agent's hue produces (an alpha chip, a wash over the page, or the hue itself). */
function agentTints(hues, ground) {
  const out = new Set();
  for (const hue of hues) {
    out.add(String(hue).toLowerCase());
    for (let step = 1; step < 50; step++) {
      out.add(alphaHex(hue, step / 50).toLowerCase());
      out.add(mix(ground, hue, step / 50).toLowerCase());
    }
  }
  return out;
}

/** `#rrggbb` at an alpha as the 8-digit `#rrggbbaa` gpui prints. */
function alphaHex(color, alpha) {
  const c = decodeColor(color);
  if (!c) return String(color);
  return `#${channel(c.r)}${channel(c.g)}${channel(c.b)}${channel(Math.round(alpha * 255))}`;
}

/** The role hues the audit knows: the six named roles, from look.js's agentHue. */
export function agentHues(accent) {
  return ["orchestrator", "dev", "design", "qa", "research", "scout"].map((name) => agentHue(name, accent));
}

/** A theme file as theme() flattens it: its top-level colours, its ansi array, then its colors block. */
export function flattenThemeFile(json) {
  const src = json && typeof json === "object" ? json : {};
  const colors = {};
  for (const key of ["background", "foreground", "selection", "cursor"]) if (typeof src[key] === "string") colors[key] = src[key];
  const ansi = Array.isArray(src.ansi) ? src.ansi : [];
  ansi.forEach((color, i) => { if (typeof color === "string") colors[`ansi${i}`] = color; });
  for (const [key, value] of Object.entries(src.colors ?? {})) if (typeof value === "string") colors[key] = value;
  return colors;
}

/** The 8 Fix-table counters over rendered pages, plus the two selection/colour idiom lists. */
export function fixCounters(pages, { destinations = 0, colors = null } = {}) {
  const c = colors ?? palette({ dark: true, theme: "graphite" }, {});
  const hues = agentHues(c.accent).filter((hue) => hue.toLowerCase() !== String(c.accent).toLowerCase());
  const found = { zero: [], defaults: [], selection: new Set(), raw: [], icons: [], fills: [] };
  let stats = 0;
  for (const [page, spec] of Object.entries(pages)) {
    if (!spec) continue;
    pageFixes(page, spec, { c, tints: agentTints(hues, c.ground), found });
    stats = Math.max(stats, statsPerCard(spec));
  }
  return buildCounters(destinations, found, stats);
}

/** One page's contribution to every Fix counter. */
function pageFixes(page, spec, { c, tints, found }) {
  const counts = new Map();
  for (const node of walk(spec)) {
    collectTextFix(page, node, found, counts);
    collectSelection(node, c, found.selection);
    collectIcon(page, node, found.icons);
    collectFill(page, node, tints, found.fills);
  }
  for (const [text, count] of counts) if (count >= 2 && isDefaultString(text)) found.defaults.push({ page, text, count });
}

/** A leaf's text as a zero-count chip, a repeated line, or unfolded machine output. */
function collectTextFix(page, node, found, counts) {
  const text = textOf(node);
  if (text === null) return;
  const value = text.trim();
  if (/(?:^|\s)·\s*0$/.test(value)) found.zero.push(`${page}: ${value}`);
  if (value.length >= 8) counts.set(value, (counts.get(value) ?? 0) + 1);
  if (looksMachine(value, node)) found.raw.push(`${page}: ${value.slice(0, 60)}`);
}

/** A selected control's visual idiom, kept as a set so two styles cannot pass for one. */
function collectSelection(node, c, selection) {
  if (!isTrue(prop(node, "aria_selected"))) return;
  const sig = selectionSignature(node, c);
  if (sig) selection.add(sig);
}

/** An svg drawn in front of a title (the spec allows icons on navigation and icon-only buttons only). */
function collectIcon(page, node, icons) {
  if (node.name === "svg" && inTitle(node)) icons.push(`${page}: ${elementId(node.parent) ?? node.src ?? "icon"}`);
}

/** An agent-hued card or chip fill; a 28px avatar or dot keeps its identity colour. */
function collectFill(page, node, tints, fills) {
  const bg = style(node, "bg");
  if (typeof bg === "string" && tints.has(bg.toLowerCase()) && !isSmallAvatar(node)) fills.push(`${page}: ${bg}`);
}

/** The most numbers any one metrics card draws (the Fix table's "every number on every card"). */
function statsPerCard(spec) {
  let stats = 0;
  for (const node of walk(spec)) {
    const id = elementId(node);
    if (!id || !/^bh-metrics-(?!row-|scroll|window)/.test(id)) continue;
    stats = Math.max(stats, walk(node).filter((n) => n.name === "text" && numericText(n)).length);
  }
  return stats;
}

/** Every counter as { value, detail, target }, in the spec's Fix-table order. */
function buildCounters(destinations, found, stats) {
  return {
    topLevelDestinations: { value: destinations, target: TARGETS.topLevelDestinations.max },
    zeroCountChips: { value: found.zero.length, detail: found.zero, target: 0 },
    repeatedDefaultStrings: { value: found.defaults.reduce((n, d) => n + d.count, 0), detail: found.defaults, target: 0 },
    statsPerCard: { value: stats, target: TARGETS.statsPerCard.max },
    selectionStyles: { value: found.selection.size, detail: [...found.selection], target: TARGETS.selectionStyles.max },
    rawMachineText: { value: found.raw.length, detail: found.raw, target: 0 },
    decorativeIcons: { value: found.icons.length, detail: found.icons, target: 0 },
    agentColourFills: { value: found.fills.length, detail: found.fills, target: 0 },
  };
}

/** The visual signature of a selected control, so four idioms count as four. */
function selectionSignature(node, c) {
  const signature = [];
  const bg = style(node, "bg");
  const border = style(node, "border_color");
  const ink = style(node, "text_color");
  if (typeof border === "string" && sameColor(border, c.accent)) signature.push("accent-outline");
  if (typeof bg === "string" && (sameColor(bg, c.fill) || sameColor(bg, c.well))) signature.push("grey-fill");
  if (typeof bg === "string" && (sameColor(bg, c.accent) || isAlphaOf(bg, c.accent))) signature.push("accent-fill");
  if (typeof ink === "string" && sameColor(ink, c.accent)) signature.push("accent-text");
  if (style(node, "rounded_full") !== null) signature.push("pill");
  return signature.length ? signature.sort().join("+") : "";
}

/** Whether a drawn text is machine output at body size: JSON, a stack trace, a long path or branch. */
export function looksMachine(text, node) {
  const value = String(text ?? "");
  const size = Number(style(node, "text_size") ?? style(node.parent, "text_size") ?? 13.5);
  if (size < 10) return false;
  if (under(node, (n) => style(n, "truncate") !== null)) return false;
  if (value.length < 48) return false;
  return (
    /^\s*[[{]/.test(value) ||
    /"\w[\w-]*"\s*:/.test(value) ||
    /\n\s+at [\w.$<>]+ \(/.test(value) ||
    /\b(?:TypeError|ReferenceError|SyntaxError|Error):/.test(value) ||
    /^[a-z0-9][a-z0-9._/-]{39,}$/i.test(value) ||
    /^[·\s]*branch\s+\S{24,}$/i.test(value) ||
    /[a-z0-9]+(?:[/._-][a-z0-9]+){4,}/i.test(value)
  );
}

/** Whether a repeated line is non-information: a default, an unsupported setting, or a harness's own. */
function isDefaultString(value) {
  return /default|no effort|not supported|unsupported|harness(?:'s)? (?:own|setting|default)|no .* setting/i.test(value);
}

/** Whether an svg sits in front of a title (a card heading or a section label). */
function inTitle(node) {
  if (under(node, (n) => n !== node && (prop(n, "on_click") !== null || style(n, "cursor_pointer") !== null))) return false;
  let holder = node.parent;
  let icon = node;
  for (let up = 0; up < 2 && holder; up++) {
    if (holder.children.some((child) => !isAncestorOrSelf(icon, child) && isTitle(child))) return true;
    icon = holder;
    holder = holder.parent;
  }
  return false;
}

/** Whether `node` is `ancestor` or sits under it. */
function isAncestorOrSelf(ancestor, node) {
  for (let n = node; n; n = n.parent) if (n === ancestor) return true;
  return false;
}

function isTitle(node) {
  if (style(node, "font_semibold") === null) return false;
  if (Number(style(node, "text_size") ?? 0) < 13) return false;
  return walk(node).some((n) => n.name === "text" && String(n.text ?? "").trim());
}

/** A 28px-or-smaller round mark (an avatar or a presence dot), which identity colour may fill. */
function isSmallAvatar(node) {
  const size = Number(style(node, "size") ?? NaN);
  return Number.isFinite(size) && size <= 28 && style(node, "rounded_full") !== null;
}

/** Round a ratio to two places for the report. */
const round = (n) => Math.round(n * 100) / 100;

/** Contrast over every preset: text 4.5:1, glyphs, control borders and focus rings 3:1. No exemption. */
export function auditThemes(presets) {
  return presets.map((preset) => ({
    name: preset.name,
    light: Boolean(preset.light),
    source: preset.source ?? null,
    failures: themeFailures(palette({ dark: !preset.light, theme: preset.name }, preset.colors ?? {})),
  }));
}

/** Text 4.5:1 on every surface it is drawn on; glyphs, control borders and focus rings 3:1. */
function themeFailures(colors) {
  const failures = [];
  const check = (checkName, a, b, min) => {
    const ratio = contrastOf(a, b);
    if (ratio < min) failures.push({ check: checkName, colors: [a, b], ratio: round(ratio), min });
  };
  for (const token of TEXT_TOKENS) for (const surface of TEXT_SURFACES) check(`text:${token}`, colors[token], colors[surface], 4.5);
  for (const token of GLYPH_TOKENS) for (const surface of ["fill", "ground"]) check(`glyph:${token}`, colors[token], colors[surface], 3);
  check("controlBorder", colors.edgeDark, colors.fill, 3);
  check("focusRing", colors.accent, colors.ground, 3);
  return failures;
}

/** Per page: render errors (passed in), interactive coverage, and the accent-button maximum. */
export function structuralCounters(pages, { errors = {}, accent = null } = {}) {
  const perPage = {};
  const total = { interactive: 0, keyboard: 0, labelled: 0, accent: 0 };
  for (const [page, spec] of Object.entries(pages)) {
    const { row, keys, labels } = pageCoverage(spec, { error: errors[page] ?? null, accent });
    perPage[page] = row;
    total.interactive += row.interactive;
    total.keyboard += keys;
    total.labelled += labels;
    total.accent = Math.max(total.accent, row.accentButtons);
  }
  for (const [page, error] of Object.entries(errors)) {
    if (!(page in perPage)) perPage[page] = { visibleElements: 0, interactive: 0, keyboardPath: 1, accessibleLabel: 1, accentButtons: 0, renderError: error };
  }
  return {
    perPage,
    accentButtonsPerView: total.accent,
    keyboardPathCoverage: total.interactive ? round(total.keyboard / total.interactive) : 1,
    accessibleLabelCoverage: total.interactive ? round(total.labelled / total.interactive) : 1,
  };
}

/** One page's visible elements, press targets, their coverage and its accent buttons. */
function pageCoverage(spec, { error, accent }) {
  const pressable = spec ? walk(spec).filter(isInteractive) : [];
  const keys = pressable.filter(hasKeyboardPath).length;
  const labels = pressable.filter(hasAccessibleLabel).length;
  const accents = pressable.filter((n) => accent && sameColor(style(n, "bg"), accent)).length;
  return {
    keys,
    labels,
    row: {
      visibleElements: spec ? visibleElements(spec) : 0,
      interactive: pressable.length,
      keyboardPath: pressable.length ? round(keys / pressable.length) : 1,
      accessibleLabel: pressable.length ? round(labels / pressable.length) : 1,
      accentButtons: accents,
      renderError: error,
    },
  };
}


/** The P1 features the spec's Features table names, looked up by their stable ids in the spec trees. */
export const FEATURES = [
  { id: "threads", label: "Threads per task", markers: [/^bh-thread-/, /^bh-threads/] },
  { id: "goalRow", label: "Goal row", markers: [/^bh-goal-row/, /^bh-goal-strip/] },
  { id: "homeNeedsYou", label: "Home: needs you + fleet", markers: [/^bh-home-needs/, /^bh-home-row-/] },
  { id: "liveSummary", label: "One-line live summary per row", markers: [/^bh-row-summary/] },
  { id: "peek", label: "Peek, inline reply, number-key answers", markers: [/^bh-peek/, /^bh-answer-card/] },
  { id: "approvalCard", label: "Three-choice approval card", markers: [/^bh-approval/] },
  { id: "diffReview", label: "Diff review with inline comments", markers: [/^bh-diff/, /^bh-review/] },
  { id: "viewModes", label: "Summary / Normal / Verbose views", markers: [/^bh-view-mode/] },
];

/** Which P1 features any audited page draws, as { id, label, present }. */
export function featurePresence(pages) {
  const ids = new Set();
  for (const spec of Object.values(pages)) for (const node of walk(spec ?? { children: [] })) { const id = elementId(node); if (id) ids.add(id); }
  return FEATURES.map((feature) => ({ id: feature.id, label: feature.label, present: [...ids].some((id) => feature.markers.some((re) => re.test(id))) }));
}

/** What gpui-kit and herdr expose for accessibility, and the upstream requests for what they don't. */
export function a11yCapabilities(gpuiText, herdrText = "") {
  const has = (text, re) => re.test(String(text ?? ""));
  const gpui = String(gpuiText ?? "");
  const herdr = String(herdrText ?? "");
  const button = /type MouseButton = ([^;]+);/.exec(gpui)?.[1]?.trim() ?? "";
  return {
    role: has(gpui, /\n\s*role<Self extends Element>\(/),
    accessibility_label: has(gpui, /\n\s*accessibility_label<Self extends Element>\(/),
    aria_selected: has(gpui, /\n\s*aria_selected<Self extends Element>\(/),
    aria_level: has(gpui, /\n\s*aria_level<Self extends Element>\(/),
    aria_active_descendant: has(gpui, /\n\s*aria_active_descendant<Self extends Element>\(/),
    set_position: has(gpui, /\n\s*set_position<Self extends Element>\(/),
    tab_index: has(gpui, /\n\s*tab_index<Self extends Element>\(/),
    track_focus: has(gpui, /\n\s*track_focus<Self extends Element>\(/),
    aria_live: has(gpui, /\n\s*(?:aria_live|announce)<|aria-live/),
    reduced_motion: has(gpui + herdr, /reduced[-_ ]motion|prefers-reduced-motion/i),
    mouse_back_button: /navigate|back/i.test(button) || /navigate/i.test(gpui),
    mouse_buttons: button,
    settings_reduced_motion: has(herdr, /reduced_motion/),
  };
}

/** The a11y report's Markdown: what exists, what the mod must do itself, what to ask upstream. */
/** What each accessibility capability is for, and the mod's own answer when it is missing. */
const A11Y_USES = [
  { name: "role(name)", caps: (c) => c.role, note: "Give every custom list, tab and dialog a role." },
  { name: "accessibility_label(text)", caps: (c) => c.accessibility_label, note: "Label every icon-only control." },
  { name: "aria_selected(bool)", caps: (c) => c.aria_selected, note: "Report the chosen tab, option or chip." },
  { name: "aria_level(n)", caps: (c) => c.aria_level, note: "Headings announce their level." },
  { name: "set_position(i, n)", caps: (c) => c.set_position, note: "Say 'tab 2 of 5' on tab lists." },
  { name: "aria_active_descendant()", caps: (c) => c.aria_active_descendant, note: "Mark the highlighted option of a combobox." },
  { name: "tab_index / track_focus", caps: (c) => c.tab_index && c.track_focus, note: "Every list, panel and dialog owns a focus handle." },
  { name: "Live region (aria_live / announce)", caps: (c) => c.aria_live, note: "Polite 'Dev needs you: plan question' announcements.", plan: "M5 draws state in a `role(\"status\")` region; polite live announcements stay an upstream request." },
  { name: "OS reduced motion", caps: (c) => c.reduced_motion, note: "Honour the system's motion setting.", plan: "M5 adds a persisted **Reduce motion** toggle in Settings › General." },
  { name: "Mouse back button", caps: (c) => c.mouse_back_button, note: "Return with the mouse's back button.", plan: "`Esc` and breadcrumb clicks go back; a hardware back button stays an upstream request." },
];

/** The a11y report's Markdown: what exists, what the mod does itself, and what to ask upstream. */
export function a11yMarkdown(caps) {
  const rows = A11Y_USES.map((use) => ({ ...use, ok: Boolean(use.caps(caps)) }));
  const missing = rows.filter((row) => !row.ok);
  return [
    "# gpui-kit accessibility capability report",
    "",
    "Checked against `mods/bot-herdr/gpui-kit.d.ts` and the app's own `herdr.d.ts`.",
    "",
    "| Capability | Exposed | Used for |",
    "| --- | --- | --- |",
    ...rows.map((row) => `| ${row.name} | ${row.ok ? "yes" : "no"} | ${row.note} |`),
    "",
    `MouseButton is \`${caps.mouse_buttons || "unknown"}\`.`,
    "",
    "## Upstream requests (herdr-app / gpui-kit)",
    "",
    ...(missing.length ? missing.map((row) => `- **${row.name}**: ${row.note}`) : ["- None: the mod can meet the spec's accessibility checks itself."]),
    "",
    "## What the mod does without them",
    "",
    ...missing.map((row) => `- ${row.plan ?? row.note}`),
    "",
  ].join("\n");
}
