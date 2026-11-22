// bh ui-audit: the redesign's design-language audit. It renders every page of the mod headless
// through `herdr-app check --print-spec`, counts the spec's Fix table over that tree, scans the
// source for colour literals, checks contrast in every theme preset, and records the baseline
// later runs must come under. Exit 0 whenever the audit ran; the JSON's `pass` says whether the
// design language's checks hold. Non-zero only when the audit itself could not run.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { resolveHerdrAppBin } from "../../../../install.mjs";
import { palette } from "../../look.js";
import { AUDIT_PAGES, WRAPPER_MAIN, fixtureSource } from "./ui-audit-fixtures.mjs";
import { PRESET_NAMES, a11yCapabilities, a11yMarkdown, auditThemes, featurePresence, fixCounters, flattenThemeFile, parseSpec, structuralCounters } from "./ui-audit-spec.mjs";
import { shotsStage } from "./ui-audit-shots.mjs";

const CHECK_TIMEOUT_MS = 180000;
const BASELINE = "mods/bot-herdr/engine/ui-audit-baseline.json";
const DEFAULT_THEME = "graphite";

/** `bh ui-audit [--json] [--page P] [--theme T] [--shots DIR] [--baseline write] [--a11y FILE]`. */
export function runUiAuditCli({ root, flags, out }) {
  let result;
  try {
    result = audit(root, flags);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failed = { command: "ui-audit", ran: false, error: message };
    process.exitCode = 1;
    return out(flags, failed, () => `ui-audit could not run: ${message}`);
  }
  return out(flags, result, () => reportText(result));
}

/** The audit needs the mod, its layouts and its themes: say so plainly when it is run elsewhere. */
function assertProject(root) {
  for (const [relative, what] of [["mods/bot-herdr/main.js", "the bot-herdr mod"], ["layouts/bot-herdr.json", "its layout"], ["themes", "its themes"]]) {
    if (!existsSync(join(root, relative))) throw new Error(`no ${relative} in ${root}: run from the bot-herdr project (${what} missing)`);
  }
}

/** Runs every audit stage and returns the one result object both output modes print. */
function audit(root, flags) {
  assertProject(root);
  const setup = auditSetup(root, flags);
  const pages = flags.norender ? { specs: {}, errors: {} } : renderPages(root, setup.herdrApp, setup.page);
  const measured = measure(root, pages, flags, setup);
  const failures = collectFailures({ ...measured, contrast: setup.contrast, pages, theme: setup.theme, expectedThemes: typeof flags.theme === "string" ? 0 : PRESET_NAMES.length });
  return {
    command: "ui-audit",
    ran: true,
    at: new Date().toISOString(),
    root,
    herdrApp: setup.herdrApp,
    theme: setup.theme,
    treeHash: treeHash(root),
    pages: measured.structural.perPage,
    renderErrors: pages.errors,
    accentButtonsPerView: measured.structural.accentButtonsPerView,
    keyboardPathCoverage: measured.structural.keyboardPathCoverage,
    accessibleLabelCoverage: measured.structural.accessibleLabelCoverage,
    fixes: measured.counts,
    tokens: measured.tokens,
    contrast: { themes: setup.contrast, passed: setup.contrast.every((t) => !t.failures.length) },
    features: measured.features,
    baseline: measured.baseline.info,
    a11y: a11yStage(root, flags),
    shots: shotsStage({ root, herdrApp: setup.herdrApp, flags, presets: setup.presets, contrast: setup.contrast }),
    failures,
    pass: failures.length === 0,
  };
}

/** What the run is against: the page filter, the theme, its presets, and the herdr-app binary. */
function auditSetup(root, flags) {
  const page = typeof flags.page === "string" ? flags.page : null;
  if (page && !AUDIT_PAGES.some((p) => p.id === page)) throw new Error(`unknown page "${page}"; pages: ${AUDIT_PAGES.map((p) => p.id).join(", ")}`);
  const theme = typeof flags.theme === "string" ? flags.theme : DEFAULT_THEME;
  const presets = themePresets(root);
  const chosen = theme === DEFAULT_THEME ? presets : presets.filter((p) => p.name === theme);
  if (!chosen.length) throw new Error(`unknown theme "${theme}"; presets: ${presets.map((p) => p.name).join(", ")}`);
  return { page, theme, presets, contrast: auditThemes(chosen), herdrApp: resolveHerdrAppBin() };
}

/** Counts every artifact from the rendered pages, the source and the theme presets. */
function measure(root, pages, flags, setup) {
  const colors = palette({ dark: isDark(setup.presets, setup.theme), theme: setup.theme }, colorsOf(setup.presets, setup.theme));
  const hexes = scanHex(root);
  const structural = structuralCounters(pages.specs, { errors: pages.errors, accent: colors.accent });
  return {
    counts: fixCounters(pages.specs, { destinations: destinationsOf(root), colors }),
    tokens: { hexOutsideTokens: hexes.length, files: hexes },
    hexes,
    structural,
    features: featurePresence(pages.specs),
    baseline: baselineStage(root, flags, structural),
  };
}

const isDark = (presets, name) => !(presets.find((p) => p.name === name)?.light ?? false);
const colorsOf = (presets, name) => presets.find((p) => p.name === name)?.colors ?? {};

/** One theme preset per name the spec checks: the d.ts snapshot's presets, then the repo's files. */
function themePresets(root) {
  const snapshot = readSnapshot(root);
  const known = new Map(snapshot.map((t) => [t.name, t]));
  for (const file of readdirSync(join(root, "themes")).filter((f) => f.endsWith(".json")).sort()) {
    const name = file.replace(/\.json$/, "");
    if (known.has(name)) continue;
    try {
      const json = JSON.parse(readFileSync(join(root, "themes", file), "utf8"));
      known.set(name, { name, light: Boolean(json.light) || !isDarkHex(json.background), colors: flattenThemeFile(json), source: `themes/${file}` });
    } catch {
      // A theme file the audit cannot read is reported by the contrast count, not thrown here.
    }
  }
  return PRESET_NAMES.filter((name) => known.has(name)).map((name) => known.get(name));
}

function readSnapshot(root) {
  try {
    return JSON.parse(readFileSync(join(root, "test/fixtures/herdr-themes.json"), "utf8"));
  } catch {
    return [];
  }
}

function isDarkHex(hex) {
  const m = /^#?([0-9a-f]{6})/i.exec(String(hex ?? ""));
  if (!m) return true;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.4;
}

/** Hex colour literals in the mod's own JS, outside the token file: the one place colour may live. */
function scanHex(root) {
  const found = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory()) {
        if (entry.name !== "engine" && entry.name !== "node_modules") visit(join(dir, entry.name));
        continue;
      }
      if (!entry.name.endsWith(".js") || entry.name === "look.js") continue;
      const text = readFileSync(join(dir, entry.name), "utf8");
      text.split("\n").forEach((line, i) => {
        for (const match of line.matchAll(/#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\b/g)) found.push({ file: relative(root, join(dir, entry.name)), line: i + 1, hex: match[0] });
      });
    }
  };
  visit(join(root, "mods/bot-herdr"));
  return found;
}

/** Today's top-level destinations: every page of the layout's stack plus its panel. */
function destinationsOf(root) {
  try {
    const layout = JSON.parse(readFileSync(join(root, "layouts/bot-herdr.json"), "utf8"));
    const find = (node, id) => (node?.id === id ? node : (node?.children ?? []).map((c) => find(c, id)).find(Boolean) ?? null);
    const pages = find(layout, "pages");
    const panel = find(layout, "panel");
    const blocks = (node) => (node?.content ? 1 : 0) + (node?.children ?? []).reduce((n, child) => n + blocks(child), 0);
    return blocks(pages) + blocks(panel);
  } catch {
    return 0;
  }
}

/** Copies the mod into a temp app, renders each page's wrapper, and keeps the printed spec trees. */
function renderPages(root, herdrApp, only) {
  const work = mkdtempSync(join(tmpdir(), "bh-ui-audit-"));
  const { app, appHome, home } = prepareApp(root, work);
  const specs = {};
  const errors = {};
  for (const page of AUDIT_PAGES) {
    if (only && page.id !== only) continue;
    writeFileSync(join(app, "audit-fixture.js"), fixtureSource(page.id));
    const out = spawnCheck(herdrApp, app, appHome, home);
    if (out.error) errors[page.id] = out.error;
    else specs[page.id] = parseSpec(out.text);
  }
  cleanup(work);
  return { specs, errors };
}

/** A temp app home and project the wrappers render in, with the real mod copied in. */
function prepareApp(root, work) {
  const app = join(work, "app");
  const appHome = join(work, "apphome");
  const home = join(work, "home");
  mkdirSync(appHome, { recursive: true });
  mkdirSync(home, { recursive: true });
  copyTree(join(root, "mods/bot-herdr"), join(app, "mods/bot-herdr"));
  writeFileSync(join(app, "package.json"), '{"type":"module"}\n');
  writeFileSync(join(app, "mod.json"), '{"place":"none","focusable":true}\n');
  writeFileSync(join(app, "main.js"), WRAPPER_MAIN);
  writeFileSync(join(appHome, "settings.json"), `${JSON.stringify({ zoom: 1 })}\n`);
  return { app, appHome, home };
}

/** Runs one `herdr-app check --print-spec`; a failure is a message recorded against the page. */
function spawnCheck(herdrApp, app, appHome, home) {
  try {
    const stdout = runSync(herdrApp, ["check", app, "--print-spec"], { env: { ...process.env, HERDR_APP_HOME: appHome, HOME: home }, cwd: home });
    const text = String(stdout ?? "").trim();
    return text ? { text } : { error: "herdr-app check printed no element spec" };
  } catch (err) {
    const output = `${err?.stdout ?? ""}${err?.stderr ?? ""}`.trim() || String(err?.message ?? err);
    return { error: firstLine(output) };
  }
}

/** execFileSync with a timeout and room for a large printed tree. */
function runSync(file, args, { env, cwd }) {
  return execFileSync(file, args, { env, cwd, timeout: CHECK_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024, encoding: "utf8" });
}

/** Copy a folder for the temp app, leaving out node_modules and the engine's caches. */
function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true, filter: (src) => !/[\\/]node_modules[\\/]/.test(src) && !/[\\/]\.cache[\\/]/.test(src) });
}

/** The tree the audit ran against: a hash of the mod, layout and theme sources. */
function treeHash(root) {
  const hash = createHash("sha256");
  const files = [];
  const add = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules" && entry.name !== ".cache") add(full);
      } else if (entry.name !== "ui-audit-baseline.json") files.push(full);
    }
  };
  add(join(root, "mods/bot-herdr"));
  add(join(root, "themes"));
  files.push(join(root, "layouts/bot-herdr.json"));
  for (const file of files.sort()) hash.update(`${file.slice(root.length)}\0`).update(readFileSync(file));
  return hash.digest("hex");
}

/**
 * New pages have no M1 baseline of their own. Each is compared against the M1 baseline of the
 * page(s) it replaces — summed when one page takes over several — never a freshly written number,
 * so extending the navigation cannot loosen the "fewer visible elements" check.
 */
export const REPLACES = {
  // Home is the overview Tasks used to be: everything running, with what needs you on top.
  home: ["tasks"],
  // Threads shows the chat view until the thread view lands, so it is that page, moved.
  threads: ["chat"],
  // The Fleet list is the live agents Tasks used to name per task, without the task detail.
  "agents-fleet": ["tasks"],
  // The old Terminals destination had no body spec; the bar (switch) was all the audit saw of it.
  "agents-terminals": ["switch"],
  // One Library destination holds Knowledge, Learning and Issues: each sub-tab is compared
  // against everything the destination took over.
  "library-knowledge": ["knowledge", "learning", "issues"],
  "library-learning": ["knowledge", "learning", "issues"],
  "library-scripts": ["knowledge", "learning", "issues"],
  "library-issues": ["knowledge", "learning", "issues"],
  // Settings keeps its own baseline; Usage is the Metrics page moved inside it.
  "settings-usage": ["metrics"],
};

/** A page's visible-element ceiling from the M1 baseline: its own, or the pages it replaces. */
export function baselineCeiling(page, previous) {
  const replaces = REPLACES[page];
  if (!replaces) return previous?.[page];
  const known = replaces.map((id) => previous?.[id]).filter((n) => typeof n === "number");
  return known.length === replaces.length ? known.reduce((n, x) => n + x, 0) : undefined;
}

/** What each rendered page must come under, and which M1 page(s) set the bar. */
function ceilingsFor(pages, previous) {
  const out = {};
  for (const page of Object.keys(pages)) {
    const ceiling = baselineCeiling(page, previous);
    if (ceiling !== undefined) out[page] = { elements: ceiling, from: REPLACES[page] ?? [page] };
  }
  return out;
}

/** Reads or writes the visible-element baseline; `--baseline write` records today's counts. */
function baselineStage(root, flags, structural) {
  const file = join(root, BASELINE);
  const pages = Object.fromEntries(Object.entries(structural.perPage).map(([id, row]) => [id, row.visibleElements]));
  const previous = readBaseline(file);
  if (flags.baseline === "write" && !flags.norender && !flags.page) {
    writeFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), treeHash: treeHash(root), pages }, null, 2)}\n`);
    return { info: { file: BASELINE, written: true, pages }, page: pages, ceilings: null };
  }
  if (flags.baseline === "write") return { info: { file: BASELINE, written: false, note: "--baseline write needs every page (no --page or --norender)" }, page: pages, ceilings: null };
  return { info: { file: BASELINE, written: false, compared: previous ? previous.pages : null, replaces: REPLACES }, page: pages, ceilings: previous ? ceilingsFor(pages, previous.pages) : null };
}

function readBaseline(file) {
  try {
    const data = JSON.parse(readFileSync(file, "utf8"));
    return data && typeof data.pages === "object" ? data : null;
  } catch {
    return null;
  }
}

/** Whether gpui-kit and herdr expose each accessibility capability, plus the upstream requests. */
function a11yStage(root, flags) {
  const read = (path) => {
    try {
      return readFileSync(path, "utf8");
    } catch {
      return "";
    }
  };
  const caps = a11yCapabilities(read(join(root, "mods/bot-herdr/gpui-kit.d.ts")), read(join(herdrAppHome(), "herdr.d.ts")));
  if (typeof flags.a11y === "string") {
    mkdirSync(dirname(flags.a11y), { recursive: true });
    writeFileSync(flags.a11y, a11yMarkdown(caps));
  }
  return caps;
}

const herdrAppHome = () => process.env.HERDR_APP_HOME || join(homedir(), ".config", "herdr-app");

/** Every target the result misses, as one list a person can act on. */
function collectFailures({ counts, hexes, contrast, structural, pages, features, baseline, theme, expectedThemes = 0 }) {
  return [
    ...hexFailure(hexes),
    ...(expectedThemes && contrast.length < expectedThemes ? [{ check: "themePresets", value: contrast.length, target: expectedThemes, message: `only ${contrast.length} of ${expectedThemes} theme presets could be read` }] : []),
    ...counterFailures(counts),
    ...pageFailures(structural, baseline),
    ...coverageFailures(structural),
    ...featureFailures(features),
    ...themeFailures(contrast),
    ...(Object.keys(pages.specs).length ? [] : [{ check: "renderErrors", value: 1, target: 0, message: `no page rendered (theme ${theme})` }]),
  ];
}

function hexFailure(hexes) {
  if (!hexes.length) return [];
  const first = hexes.slice(0, 3).map((h) => `${h.file}:${h.line}`).join(", ");
  return [{ check: "hexOutsideTokens", value: hexes.length, target: 0, message: `${hexes.length} hex colour literals outside look.js (${first})` }];
}

/** Each Fix-table counter above its target, the destinations one read as a ceiling. */
function counterFailures(counts) {
  const failures = [];
  for (const [name, counter] of Object.entries(counts)) {
    if (counter.value <= (counter.target ?? 0)) continue;
    const message = name === "topLevelDestinations" ? `${counter.value} top-level destinations; the design allows ${counter.target}` : `${name} is ${counter.value}, wants ${counter.target ?? 0}`;
    failures.push({ check: name, value: counter.value, target: counter.target ?? 0, message });
  }
  return failures;
}

/** A page that would not render, drew too many primary actions, or did not come under the baseline. */
function pageFailures(structural, baseline) {
  const failures = [];
  for (const [page, row] of Object.entries(structural.perPage)) {
    if (row.renderError) failures.push({ check: "renderErrors", page, value: 1, target: 0, message: `${page} did not render: ${row.renderError}` });
    if (row.accentButtons > 1) failures.push({ check: "accentButtonsPerView", page, value: row.accentButtons, target: 1, message: `${page} draws ${row.accentButtons} accent buttons` });
    const ceiling = baseline.ceilings?.[page];
    if (!ceiling || baseline.page[page] < ceiling.elements) continue;
    const from = ceiling.from.includes(page) ? "the M1 baseline" : `the M1 baseline of what it replaces (${ceiling.from.join(" + ")})`;
    failures.push({ check: "visibleElements", page, value: baseline.page[page], target: ceiling.elements, message: `${page} draws ${baseline.page[page]} elements, not under ${from} of ${ceiling.elements}` });
  }
  return failures;
}

function coverageFailures(structural) {
  const failures = [];
  if (structural.keyboardPathCoverage < 1) failures.push({ check: "keyboardPathCoverage", value: structural.keyboardPathCoverage, target: 1, message: `${Math.round(structural.keyboardPathCoverage * 100)}% of interactive elements have a keyboard path` });
  if (structural.accessibleLabelCoverage < 1) failures.push({ check: "accessibleLabelCoverage", value: structural.accessibleLabelCoverage, target: 1, message: `${Math.round(structural.accessibleLabelCoverage * 100)}% of interactive elements have an accessible label` });
  return failures;
}

function featureFailures(features) {
  return features.filter((feature) => !feature.present).map((feature) => ({ check: "feature", page: feature.id, value: 0, target: 1, message: `P1 feature missing: ${feature.label}` }));
}

function themeFailures(contrast) {
  return contrast.flatMap((row) => row.failures.map((f) => ({ check: f.check, theme: row.name, value: f.ratio, target: f.min, message: `${row.name}: ${f.check} ${f.ratio} < ${f.min}` })));
}

/** The one-line-per-stage text a person reads when `--json` is off. */
function reportText(result) {
  const failures = result.failures.length;
  const lines = [
    `ui-audit: ${failures ? `FAIL (${failures} findings)` : "PASS"} · tree ${result.treeHash.slice(0, 12)} · ${Object.keys(result.pages).length} pages · ${result.contrast.themes.length} themes`,
    "",
    "Fix table:",
    ...Object.entries(result.fixes).map(([name, c]) => `  ${name.padEnd(22)} ${String(c.value).padStart(3)}  (target ${c.target ?? 0})`),
    "",
    "Pages:",
    ...Object.entries(result.pages).map(([page, row]) => `  ${page.padEnd(16)} ${String(row.visibleElements).padStart(4)} elements · keyboard ${Math.round(row.keyboardPath * 100)}% · labels ${Math.round(row.accessibleLabel * 100)}%${row.renderError ? ` · render error: ${row.renderError}` : ""}`),
    "",
    `Contrast: ${result.contrast.themes.filter((t) => !t.failures.length).length}/${result.contrast.themes.length} themes clean`,
    `Hex outside look.js: ${result.tokens.hexOutsideTokens} · keyboard ${Math.round(result.keyboardPathCoverage * 100)}% · labels ${Math.round(result.accessibleLabelCoverage * 100)}% · primary buttons max ${result.accentButtonsPerView}/view`,
    `Features: ${result.features.filter((f) => f.present).length}/${result.features.length} P1 present`,
    `Baseline: ${result.baseline.written ? "written" : result.baseline.compared ? "compared" : "not recorded"}`,
  ];
  if (result.shots.files?.length) lines.push(`Shots: ${result.shots.files.length} PNGs (${result.shots.themes.length} themes) in ${result.shots.dir}`);
  if (result.shots.skipped) lines.push(`Shots: skipped — ${result.shots.skipped}`);
  if (failures) lines.push("", "Findings:", ...result.failures.slice(0, 40).map((f) => `  - ${f.message}`));
  if (failures > 40) lines.push(`  … and ${failures - 40} more`);
  return lines.join("\n");
}

const firstLine = (text) => String(text ?? "").replace(/\s+/g, " ").trim().slice(0, 300);

function cleanup(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // A temp folder left behind is harmless.
  }
}
