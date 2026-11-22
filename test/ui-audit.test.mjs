// The audit tool's own tests: the printed spec tree is parsed the way herdr-app prints it, the
// Fix table's counters fire on today's clutter and stay at zero on a quiet page, and all 16 theme
// presets are checked with their alpha colours composited, with no exemption for our own pair.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { palette, agentHue } from "../mods/bot-herdr/look.js";
import {
  PRESET_NAMES,
  animationCounters,
  auditThemes,
  compositeOver,
  contrastRatio,
  decodeColor,
  elementId,
  fixCounters,
  flattenThemeFile,
  parseSpec,
  prop,
  structuralCounters,
  style,
  textOf,
  visibleElements,
  a11yCapabilities,
} from "../mods/bot-herdr/engine/lib/ui-audit-spec.mjs";
import { AUDIT_PAGES } from "../mods/bot-herdr/engine/lib/ui-audit-fixtures.mjs";
import { captureShots, shotPlan } from "../mods/bot-herdr/engine/lib/ui-audit-shots.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const spec = (...lines) => parseSpec(lines.join("\n"));
const snapshot = JSON.parse(readFileSync(join(ROOT, "test/fixtures/herdr-themes.json"), "utf8"));
const graphite = palette({ dark: true, theme: "graphite" }, snapshot.find((t) => t.name === "graphite").colors);
const accent = graphite.accent;
const alpha = (color, a) => {
  const c = decodeColor(color);
  const hex = (n) => Math.round(n).toString(16).padStart(2, "0");
  return `#${hex(c.r)}${hex(c.g)}${hex(c.b)}${hex(Math.round(a * 255))}`;
};

/** A quiet page: no zero counts, no repeated defaults, no metrics card, one selection style. */
const QUIET = spec(
  'div :id[Str("bh-quiet")] .bg[Str("#131518")] .text_color[Str("#eeeeef")]',
  '  h_flex .gap[Number(8.0)]',
  '    div :role[Str("tab")] :aria_selected[Bool(true)] .text_color[Str("' + accent + '")] .border_1 .border_color[Str("' + accent + '")]',
  '      text "Tasks"',
  '    div :role[Str("tab")] :aria_selected[Bool(false)] .text_color[Str("#a1a2a3")]',
  '      text "Blocked · 1"',
  '    text "Loading tasks…"',
);

/** Today's clutter, one line per Fix-table row. */
const CLUTTER = spec(
  'div :id[Str("bh-clutter")] .bg[Str("#131518")]',
  '  h_flex .gap[Number(4.0)]',
  '    div :role[Str("tab")] :aria_selected[Bool(true)] .rounded_full .bg[Str("' + accent + '24")] .text_color[Str("' + accent + '")]',
  '      text "Active · 2"',
  '    div .rounded_full .border_1 .border_color[Str("#40424499")] .bg[Str("#343639")]',
  '      text "Blocked · 0"',
  '    div .rounded_full .border_1 .border_color[Str("#40424499")] .bg[Str("#343639")]',
  '      text "question · 0"',
  '  v_flex .gap[Number(2.0)]',
  '    div .text_size[Number(13.5)]',
  '      text "No effort setting for this harness."',
  '    div .text_size[Number(13.5)]',
  '      text "No effort setting for this harness."',
  '  h_flex .gap[Number(8.0)] .items_center',
  '    svg "mods/bot-herdr/icons/shield-check.svg" .size[Number(14.0)]',
  '    div .text_size[Number(16.0)] .font_semibold',
  '      text "Access"',
  '  v_flex :id[Str("bh-metrics-dev")] .p[Number(14.0)]',
  '    text "4.2M"',
  '    text "$0.13"',
  '    text "23m"',
  '  div .text_size[Number(13.5)] :on_click(fn)',
  '    text "{\\n  \\"command\\": \\"ui-audit\\",\\n  \\"exit\\": { \\"pass\\": false },\\n  \\"failures\\": [{ \\"check\\": \\"zeroCountChips\\", \\"value\\": 3 }]\\n}"',
  '  h_flex .w[Number(120.0)] .h[Number(40.0)] .rounded[Number(12.0)] .bg[Str("' + alpha(agentHue("dev", accent), 0.14) + '")]',
  '    text "Knowledge"',
  '  div .size[Number(28.0)] .rounded_full .bg[Str("' + alpha(agentHue("dev", accent), 0.16) + '")]',
  '    text "D"',
);

test("parseSpec reads the printed tree: elements, styles, props, text and a TextView's markdown", () => {
  const tree = parseSpec(
    [
      'div :id[Str("bh-chat")] .relative .bg[Str("#131518")] :on_click(fn)',
      '  h_flex .gap[Number(8.0)]',
      '    text "Talk to Orchestrator"',
      '    TextView markdown "bh-board-text-1" "{\\n  \\"a\\": 1\\n}" :on_link_click(fn)',
    ].join("\n"),
  );
  const root = tree.children[0];
  assert.equal(root.name, "div");
  assert.equal(elementId(root), "bh-chat");
  assert.equal(style(root, "bg"), "#131518");
  assert.equal(prop(root, "on_click"), "fn");
  assert.equal(root.children.length, 1);
  assert.equal(visibleElements(tree), 4);
  const [label, markdown] = root.children[0].children;
  assert.equal(textOf(label), "Talk to Orchestrator");
  assert.equal(textOf(markdown), '{\n  "a": 1\n}');
  assert.equal(markdown.src, "bh-board-text-1");
});

test("parseSpec ignores engine noise and keeps the two-space nesting depth", () => {
  const tree = parseSpec(
    [
      'MESA: info: kbase: CSF driver',
      'WARNING: panvk is not a conformant Vulkan implementation',
      'WARN  herdr_app::mods: check: mod exec\'d node',
      'div :id[Str("root")]',
      '  v_flex',
      '    text "one"',
      'check passed: /tmp/app',
    ].join("\n"),
  );
  assert.equal(tree.children.length, 1);
  const flex = tree.children[0].children[0];
  assert.equal(flex.name, "v_flex");
  assert.equal(flex.depth, 1);
  assert.equal(flex.children[0].depth, 2);
  assert.equal(textOf(flex.children[0]), "one");
});

test("compositing an #rrggbbaa colour over its surface is the pixel actually drawn", () => {
  assert.equal(compositeOver("#ffffff00", "#000000"), "#000000");
  assert.equal(compositeOver("#ffffff", "#123456"), "#ffffff");
  assert.deepEqual(decodeColor("#96b2d780"), { r: 0x96, g: 0xb2, b: 0xd7, a: 0x80 / 255 });
  // 50% white over black is mid grey, and its contrast against white is 3.95:1.
  assert.equal(compositeOver("#ffffff80", "#000000"), "#808080");
  assert.equal(Math.round(contrastRatio("#ffffff80", "#ffffff", { over: "#000000" }) * 100) / 100, 3.95);
  // A theme's own border (9% white) composited onto graphite's surface, not read as if opaque.
  assert.equal(compositeOver("#ffffff18", "#2c2e31"), "#404244");
});

test("all 16 presets are enumerated and contrast-checked with no ownTheme exemption", () => {
  const presets = new Map(snapshot.map((t) => [t.name, t]));
  for (const file of readdirSync(join(ROOT, "themes"))) {
    const name = file.replace(/\.json$/, "");
    if (presets.has(name)) continue;
    const json = JSON.parse(readFileSync(join(ROOT, "themes", file), "utf8"));
    presets.set(name, { name, light: /-light$/.test(name), colors: flattenThemeFile(json), source: `themes/${file}` });
  }
  assert.equal(presets.size, 16);
  const rows = auditThemes(PRESET_NAMES.map((name) => presets.get(name)));
  assert.deepEqual(rows.map((r) => r.name), PRESET_NAMES);
  for (const row of rows) {
    assert.ok(Array.isArray(row.failures), `${row.name} has failures`);
    for (const failure of row.failures) assert.ok(failure.ratio < failure.min, `${row.name}: ${failure.check} is a real miss`);
  }
  // look.js's own pair now carries the same 3:1 control border as every derived preset: no theme
  // may be exempt from the check it draws under.
  for (const row of rows) {
    assert.ok(!row.failures.some((f) => f.check === "controlBorder"), `${row.name} control border at 3:1`);
  }
});

test("the Fix table fires on today's clutter and scores zero on a quiet page", () => {
  const clutter = fixCounters({ clutter: CLUTTER }, { destinations: 11, colors: graphite });
  assert.equal(clutter.topLevelDestinations.value, 11);
  assert.equal(clutter.zeroCountChips.value, 2);
  assert.equal(clutter.repeatedDefaultStrings.value, 2);
  assert.equal(clutter.statsPerCard.value, 3);
  assert.equal(clutter.selectionStyles.value, 1);
  assert.equal(clutter.rawMachineText.value, 1);
  assert.equal(clutter.decorativeIcons.value, 1);
  assert.ok(clutter.agentColourFills.value >= 1, "an agent-hued card counts");
  // A 28px avatar keeps its identity colour: the Fix table counts fills, not avatars.
  assert.equal(clutter.agentColourFills.detail.filter((d) => d.includes("bh-metrics")).length, 0);
  const quiet = fixCounters({ quiet: QUIET }, { destinations: 5, colors: graphite });
  assert.equal(quiet.topLevelDestinations.value, 5);
  assert.equal(quiet.zeroCountChips.value, 0);
  assert.equal(quiet.repeatedDefaultStrings.value, 0);
  assert.equal(quiet.statsPerCard.value, 0);
  assert.equal(quiet.selectionStyles.value, 1);
  assert.equal(quiet.rawMachineText.value, 0);
  assert.equal(quiet.decorativeIcons.value, 0);
  assert.equal(quiet.agentColourFills.value, 0);
});

test("a truncated body-size JSON line is raw machine text; a folded machineLine is not", () => {
  const json = '{ \\"command\\": \\"ui-audit\\", \\"exit\\": { \\"pass\\": false }, \\"failures\\": [] }';
  // M4's Conversation entry: the contract folded to one line, but at body size in the UI face.
  const raw = spec('div .truncate .text_size[Number(13.0)] .text_color[Str("#eeeeef")]', `  text "${json}"`);
  // machinetext.js machineLine: one muted metadata-size (mono when the app has a code face) line.
  const folded = spec('div .truncate .text_size[Number(12.0)] .text_color[Str("#a1a2a3")]', `  text "${json}"`);
  const mono = spec('div .truncate .text_size[Number(13.0)] .font_family[Str("Mono")]', `  text "${json}"`);
  assert.equal(fixCounters({ "thread-conversation": raw }, { colors: graphite }).rawMachineText.value, 1);
  assert.equal(fixCounters({ "thread-conversation": folded }, { colors: graphite }).rawMachineText.value, 0);
  assert.equal(fixCounters({ "thread-conversation": mono }, { colors: graphite }).rawMachineText.value, 0);
});

test("each selection idiom is its own signature, so the counter cannot hide a second style", () => {
  const two = spec(
    'div :aria_selected[Bool(true)] .border_1 .border_color[Str("' + accent + '")]',
    '  text "tab"',
    'div :aria_selected[Bool(true)] .bg[Str("' + accent + '24")] .rounded_full .text_color[Str("' + accent + '")]',
    '  text "chip"',
  );
  const one = spec('div :aria_selected[Bool(true)] .border_1 .border_color[Str("' + accent + '")]', '  text "tab"');
  assert.equal(fixCounters({ two }, { colors: graphite }).selectionStyles.value, 2);
  assert.equal(fixCounters({ one }, { colors: graphite }).selectionStyles.value, 1);
});

test("tabs underline and segmented choices fill grey; one item doing both is two idioms", () => {
  const well = graphite.well;
  const underline = '.border_b[Number(2.0)] .border_color[Str("' + accent + '")] .text_color[Str("' + accent + '")]';
  // M4: every strip drew its picked item underlined on a grey track.
  const both = spec('h_flex .bg[Str("' + well + '")]', '  div :aria_selected[Bool(true)] ' + underline, '    text "Plan"');
  const split = spec(
    'h_flex',
    '  div :aria_selected[Bool(true)] ' + underline,
    '    text "Plan"',
    'h_flex .bg[Str("' + well + '")]',
    '  div :aria_selected[Bool(true)] .bg[Str("' + graphite.fill + '")]',
    '    text "7 days"',
  );
  assert.equal(fixCounters({ both }, { colors: graphite }).selectionStyles.value, 2);
  assert.equal(fixCounters({ split }, { colors: graphite }).selectionStyles.value, 1);
});

test("the animation counters read the activity glyphs from the printed spec: cycles, slots, ticks120, frozen", () => {
  // A running cycle: the glyph has its width and a frames attr at the one 120 ms tick.
  // A frozen cycle (Reduce motion): the glyph is still in its slot, its first frame a text child.
  const glyphs = [
    'div :id[Str("bh-agent-activity-1-glyph")] .w[Number(31.0)] :frames[Number(120.0), Str("⠁"), Str("⠂"), Str("⠄")]',
    'div :id[Str("bh-agent-activity-2-glyph")] .w[Number(31.0)]',
    '  text "⠁"',
    'div :id[Str("bh-agent-activity-3-glyph")] .w[Number(31.0)] :frames[Number(60.0), Str("⠁")]',
  ];
  const anim = animationCounters(spec(glyphs.join("\n")));
  assert.equal(anim.workingCycles, 3);
  assert.equal(anim.glyphSlots, 3);
  assert.equal(anim.ticks120, 1, "only the cycle on the one 120 ms tick counts");
  assert.equal(anim.frozenGlyphs, 1, "the frozen cycle (first frame as a text child, no frames attr)");
  // Anything that is not a -glyph is not a cycle, even with frames on it.
  const none = animationCounters(spec('div :id[Str("plain-glyphless")] :frames[Number(120.0), Str("⠁")]'));
  assert.equal(none.workingCycles, 0);
  // A non-frozen cycle never counts as frozen, even though its idle form has no child text.
  const live = animationCounters(spec('div :id[Str("bh-agent-activity-4-glyph")] .w[Number(31.0)]'));
  assert.equal(live.frozenGlyphs, 0);
});

test("structural counters measure keyboard and label coverage per page", () => {
  const page = spec(
    'div :id[Str("p")] .bg[Str("#131518")]',
    '  div :on_click(fn) .cursor_pointer :tab_index[Number(0.0)] :accessibility_label[Str("Refresh")]',
    '    svg "x.svg" .size[Number(14.0)]',
    '  div :on_click(fn) .cursor_pointer',
    '    text "Open"',
    '  div :on_click(fn) .cursor_pointer .bg[Str("' + accent + '")]',
    '    text "Primary"',
  );
  const rows = structuralCounters({ p: page }, { accent });
  assert.equal(rows.perPage.p.interactive, 3);
  assert.equal(rows.perPage.p.keyboardPath, 0.33);
  assert.equal(rows.perPage.p.accessibleLabel, 1);
  assert.equal(rows.perPage.p.accentButtons, 1);
  assert.equal(rows.accentButtonsPerView, 1);
});

const SHOT_THEMES = [
  { name: "graphite", light: false },
  { name: "paper", light: true },
  { name: "plum-dark", light: false },
  { name: "win98", light: false },
];

/** The spawn seam a shot run needs, with the window and the temp core replaced by records. */
const shotIo = (overrides = {}) => ({
  version: () => "0.1.16",
  run: () => "{}",
  launch: () => ({ ready: true, kill: () => {} }),
  sleep: () => {},
  stopCore: () => {},
  ...overrides,
});

test("the shot plan is one page-theme PNG for every audited page and key theme", () => {
  const plan = shotPlan("/shots", SHOT_THEMES);
  assert.equal(plan.pages.length, AUDIT_PAGES.length);
  assert.deepEqual(plan.themes, ["graphite", "paper", "plum-dark", "win98"]);
  assert.equal(plan.files.length, AUDIT_PAGES.length * SHOT_THEMES.length);
  assert.deepEqual(plan.files.slice(0, 4).map((f) => f.file), SHOT_THEMES.map((t) => join("/shots", `home-${t.name}.png`)), "Home is the first audited page");
  assert.ok(plan.files.some((f) => f.file === join("/shots", "library-issues-win98.png")));
  assert.ok(plan.files.some((f) => f.file === join("/shots", "settings-usage-paper.png")));
  assert.ok(plan.files.some((f) => f.file === join("/shots", "tasks-board-win98.png")), "a page the navigation replaced is still audited");
  assert.equal(new Set(plan.files.map((f) => f.file)).size, plan.files.length);
});

test("a shot run that cannot capture always takes its window down and removes the temp home", () => {
  const base = mkdtempSync(join(tmpdir(), "bh-shots-test-"));
  const tempRoot = join(base, "work");
  const dir = join(base, "shots");
  mkdirSync(tempRoot);
  const run = { root: ROOT, herdrApp: "herdr-app", dir, themes: SHOT_THEMES.slice(0, 1), tempRoot };

  const noWindow = captureShots(run, shotIo({ launch: () => ({ ready: false, reason: "no display", kill: () => {} }) }));
  assert.equal(noWindow.skipped, "no display");
  assert.deepEqual(noWindow.files, []);
  assert.deepEqual(readdirSync(tempRoot), [], "the temp app home is removed when no window opens");

  let killed = false;
  let stopped = false;
  const broken = captureShots(
    { ...run, pages: [AUDIT_PAGES[0]] },
    shotIo({
      run: (_file, args) => {
        if (args[0] === "shot") throw new Error("herdr-app shot: no frame yet");
        return "{}";
      },
      launch: () => ({ ready: true, kill: () => { killed = true; } }),
      stopCore: () => { stopped = true; },
    }),
  );
  assert.match(broken.skipped, /no frame yet/);
  assert.ok(killed, "the window is killed after a failed capture");
  assert.ok(stopped, "the temp core is stopped after a failed capture");
  assert.deepEqual(broken.files, []);
  assert.deepEqual(readdirSync(tempRoot), [], "the temp app home is removed after a failed capture");
});
