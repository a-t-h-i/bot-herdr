// bh ui-audit --shots: real window screenshots of every audited page in the four key themes.
//
// A throwaway HERDR_APP_HOME gets the mod with the audit's fixtures folded in: each layout block
// is the audited page's props plus the seeded state the headless audit renders, and bh answers
// nothing there, so a later load cannot replace the fixtures with this empty temp project. The
// window runs on its own herdr-core (HOME and HC_SOCKET under the same temp folder), which keeps
// the person's spaces, agents and window out of the pictures and the run. The window is killed,
// the temp core stopped and the temp folder removed whatever happens, a timeout included.

import { execFileSync, spawn } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { hc } from "./team.mjs";
import { AUDIT_PAGES, shotFixtureSource } from "./ui-audit-fixtures.mjs";

const LAUNCH_TIMEOUT_MS = 30000;
const FIRST_FRAME_MS = 1200;
const SETTLE_MS = 700;
const SHOT_TIMEOUT_MS = 30000;
const KEY_THEME_NAMES = ["graphite", "paper"];

/** `--shots DIR`: one PNG per audited page and key theme, or the reason there is none. */
export function shotsStage({ root, herdrApp, flags, presets, contrast }) {
  if (typeof flags.shots !== "string") return { skipped: "pass --shots DIR to capture PNGs" };
  return captureShots({ root, herdrApp, dir: resolve(flags.shots), themes: keyThemes(presets, contrast) });
}

/** The default dark and light presets plus the two with the weakest text/accent contrast. */
export function keyThemes(presets, contrast) {
  const ratioOf = (theme) => {
    const worst = theme.failures.filter((f) => f.check.startsWith("text:") || f.check === "focusRing");
    return worst.length ? Math.min(...worst.map((f) => f.ratio)) : 99;
  };
  const edge = [...contrast].filter((t) => !KEY_THEME_NAMES.includes(t.name)).sort((a, b) => ratioOf(a) - ratioOf(b)).slice(0, 2);
  const named = (name) => presets.find((p) => p.name === name) ?? presets.find((p) => p.light === (name === "paper")) ?? presets[0];
  const chosen = [named("graphite"), named("paper"), ...edge.map((t) => presets.find((p) => p.name === t.name))].filter(Boolean);
  return chosen.filter((theme, i) => chosen.findIndex((t) => t.name === theme.name) === i);
}

/** The pages and themes one run captures, in order: `<page>-<theme>.png` under `dir`. */
export function shotPlan(dir, themes, pages = AUDIT_PAGES) {
  const names = themes.map((t) => t.name);
  const files = pages.flatMap((page) => names.map((theme) => ({ page: page.id, theme, file: join(dir, `${page.id}-${theme}.png`) })));
  return { dir, themes: names, pages: pages.map((p) => p.id), files };
}

/**
 * Captures the plan into `dir` and returns `{dir, themes, files}`; a window that cannot open, or
 * a command that fails, comes back as `skipped` with whatever was captured already. `io` is the
 * spawn seam the tests stand in for.
 */
export function captureShots({ root, herdrApp, dir, themes, tempRoot = tmpdir(), pages = AUDIT_PAGES }, io = defaultIo()) {
  const plan = shotPlan(dir, themes, pages);
  const work = mkdtempSync(join(tempRoot, "bh-ui-shots-"));
  const appHome = join(work, "apphome");
  const env = shotEnv(appHome, work);
  const where = { herdrApp, env, work, appHome };
  const files = [];
  let window = null;
  try {
    mkdirSync(dir, { recursive: true });
    stageApp({ root, appHome, version: io.version(herdrApp, work) });
    window = io.launch(herdrApp, env, work);
    if (!window.ready) return { dir, themes: plan.themes, files, skipped: window.reason };
    const problem = openPages(io, { ...where, project: join(work, "project") });
    if (problem) return { dir, themes: plan.themes, files, skipped: problem };
    capturePages(io, where, themes, plan.files, files);
    return { dir, themes: plan.themes, files: inPlanOrder(plan, files) };
  } catch (err) {
    return { dir, themes: plan.themes, files: inPlanOrder(plan, files), skipped: firstLine(err?.message ?? err) };
  } finally {
    try {
      window?.kill();
    } catch {
      // The window is going anyway; a failed kill must not hide the audit's own result.
    }
    try {
      io.stopCore(env);
    } catch {
      // A temp core left running holds no project data; never fail the audit over it.
    }
    cleanup(work);
  }
}

/** Captured files in plan order, so each page's themes sit together in the JSON. */
function inPlanOrder(plan, files) {
  const captured = new Set(files);
  return plan.files.filter((entry) => captured.has(entry.file)).map((entry) => entry.file);
}

/** Finds the window up: a space for the pages, then the bot-herdr layout with no mod errors. */
function openPages(io, { herdrApp, env, work, project }) {
  mkdirSync(project, { recursive: true });
  io.sleep(FIRST_FRAME_MS);
  openSpace(io, herdrApp, env, work, project);
  io.run(herdrApp, ["do", "layout.switch", "--name", "bot-herdr"], { env, cwd: work });
  io.sleep(FIRST_FRAME_MS);
  return windowProblem(io.run(herdrApp, ["status"], { env, cwd: work }));
}

/** One PNG per planned page in each theme, the switch page last in each theme's row. */
function capturePages(io, where, themes, planned, files) {
  for (const theme of themes) {
    applyTheme(io, where, theme);
    for (const entry of planned.filter((f) => f.theme === theme.name)) capturePage(io, where, entry, files);
  }
}

/** Navigates to one page and saves its frame; the switch is drawn once, as the page not the top bar. */
function capturePage(io, { herdrApp, env, work }, entry, files) {
  const onSwitch = entry.page === "switch";
  if (onSwitch) showSwitchTopbar(io, herdrApp, env, work, false);
  io.run(herdrApp, ["do", "layout.select", "--stack", "pages", "--child", bodyPage(entry.page)], { env, cwd: work });
  io.sleep(SETTLE_MS);
  io.run(herdrApp, ["shot", entry.file], { env, cwd: work });
  files.push(entry.file);
  if (onSwitch) showSwitchTopbar(io, herdrApp, env, work, true);
}

/** Switches one theme: the picker's name and the appearance that half of the layout shows. */
function applyTheme(io, { herdrApp, env, work, appHome }, theme) {
  io.run(herdrApp, ["do", "app.theme", "--name", theme.name], { env, cwd: work });
  writeFileSync(join(appHome, "settings.json"), `${JSON.stringify({ appearance: theme.light ? "light" : "dark", theme: theme.name, zoom: 1 })}\n`);
  io.sleep(SETTLE_MS);
}

/** The switch page's shot hides the top bar's copy so the switch is drawn once, as its page. */
function showSwitchTopbar(io, herdrApp, env, work, shown) {
  io.run(herdrApp, ["do", shown ? "layout.show" : "layout.hide", "--id", "switch"], { env, cwd: work });
  io.sleep(SETTLE_MS);
}

/** The switch is a page of its own in the stack, away from the top bar's block with that id. */
const bodyPage = (page) => (page === "switch" ? "switch-page" : page);

/** The temp app home and its own herdr-core, kept away from the person's window and spaces. */
function shotEnv(appHome, work) {
  const env = {
    ...process.env,
    HERDR_APP_HOME: appHome,
    HOME: join(work, "home"),
    XDG_CONFIG_HOME: join(work, "home", ".config"),
    HC_SOCKET: join(work, "core", "core.sock"),
  };
  for (const key of ["HC_SESSION", "HC_RUNTIME", "HC_SCOPE", "HC_TERMINAL_ID", "HC_TERMINAL_SOCKET"]) delete env[key];
  mkdirSync(env.HOME, { recursive: true });
  mkdirSync(dirname(env.HC_SOCKET), { recursive: true });
  return env;
}

/** The mod, themes, layout and settings a shot needs, with the fixtures and the welcome gone. */
function stageApp({ root, appHome, version }) {
  const mod = join(appHome, "mods", "bot-herdr");
  copyTree(join(root, "mods", "bot-herdr"), mod);
  foldFixtures(mod);
  copyTree(join(root, "themes"), join(appHome, "themes"));
  mkdirSync(join(appHome, "layouts"), { recursive: true });
  writeFileSync(join(appHome, "layouts", "bot-herdr.json"), `${JSON.stringify(shotLayout(root), null, 2)}\n`);
  writeFileSync(join(appHome, "settings.json"), `${JSON.stringify({ appearance: "dark", zoom: 1 })}\n`);
  writeFileSync(join(appHome, "shared.json"), `${JSON.stringify({ "frame.welcomed": "finished" })}\n`);
  if (version) writeFileSync(join(appHome, "update-notes.json"), `${JSON.stringify({ last_run: version, presented: [] })}\n`);
}

/** The temp copy only: the fixture page over the real mod, and bh holding every load open. */
function foldFixtures(mod) {
  renameSync(join(mod, "main.js"), join(mod, "bot-main.js"));
  renameSync(join(mod, "bh.js"), join(mod, "bh-real.js"));
  writeFileSync(join(mod, "bh.js"), FIXTURE_BH);
  writeFileSync(join(mod, "audit-pages.js"), shotFixtureSource());
  writeFileSync(join(mod, "main.js"), SHOT_MAIN);
}

/** The repo layout with one block per audited page, each carrying its audit page id. */
function shotLayout(root) {
  const layout = JSON.parse(readFileSync(join(root, "layouts", "bot-herdr.json"), "utf8"));
  const pages = findNode(layout, "pages");
  if (!pages || !Array.isArray(pages.children)) throw new Error("layouts/bot-herdr.json has no pages stack");
  for (const page of AUDIT_PAGES) {
    const block = pages.children.find((child) => child?.id === page.id && child.content);
    const props = { ...page.props, audit: page.id };
    if (block) block.content.props = props;
    else pages.children.push({ id: page.id === "switch" ? "switch-page" : page.id, type: "block", content: { mod: "bot-herdr", props } });
  }
  const topbar = findNode(layout, "switch");
  if (topbar?.content) topbar.content.props = { ...(topbar.content.props ?? {}), audit: "switch" };
  return layout;
}

function findNode(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

/** One space pointing at the temp project: the pages get a project dir, and the sidebar looks real. */
function openSpace(io, herdrApp, env, work, project) {
  const made = parseJson(io.run(herdrApp, ["do", "space.new", "--name", "bot-herdr", "--folder", project], { env, cwd: work }));
  io.sleep(SETTLE_MS);
  if (made?.tab) io.run(herdrApp, ["do", "tab.rename", "--id", String(made.tab), "--name", "bot-herdr"], { env, cwd: work });
  io.sleep(SETTLE_MS);
}

/** The reason the loaded pages did not come up clean, from `herdr-app status`; null when they did. */
function windowProblem(text) {
  const status = parseJson(text);
  const errors = Array.isArray(status?.errors) ? status.errors : [];
  return errors.length ? `a page mod did not load: ${firstLine(errors[0])}` : null;
}

const parseJson = (text) => {
  try {
    return JSON.parse(String(text ?? "").trim());
  } catch {
    return null;
  }
};

/** The default seams: real processes, a blocking wait and a temp core stopped through hc. */
function defaultIo() {
  return {
    version: (herdrApp, cwd) => appVersion(herdrApp, cwd),
    run: (file, args, opts) => runSync(file, args, opts),
    launch: (herdrApp, env, cwd) => launchWindow(herdrApp, env, cwd),
    sleep: pause,
    stopCore: (env) => hc(["server", "stop"], { env, timeout: 15000 }),
  };
}

function appVersion(herdrApp, cwd) {
  try {
    return /\d+\.\d+\.\d+/.exec(String(runSync(herdrApp, ["--version"], { cwd }) ?? ""))?.[0] ?? null;
  } catch {
    return null;
  }
}

/** Launches the window detached and waits for it to answer `status`, so its first frame is up. */
function launchWindow(herdrApp, env, cwd) {
  const child = spawn(herdrApp, [], { env, cwd, detached: process.platform !== "win32", stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    stderr = (stderr + String(chunk)).slice(-4000);
  });
  const kill = () => killWindow(child);
  const deadline = Date.now() + LAUNCH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (gone(child)) return { ready: false, reason: `herdr-app exited (${child.exitCode ?? child.signalCode ?? "?"}): ${firstLine(stderr) || "no output"}`, kill };
    try {
      runSync(herdrApp, ["status"], { env, cwd, timeout: 5000 });
      return { ready: true, kill };
    } catch (err) {
      if (err?.code === "ENOENT") return { ready: false, reason: `herdr-app not found: ${herdrApp}`, kill };
      pause(200);
    }
  }
  return { ready: false, reason: `no window after ${LAUNCH_TIMEOUT_MS / 1000}s${stderr ? `: ${firstLine(stderr)}` : ""}`, kill };
}

/** Ends the window's process group, then the process itself if it is still there. */
function killWindow(child) {
  if (!child || gone(child)) return;
  signal(child, "SIGTERM");
  const deadline = Date.now() + 3000;
  while (!gone(child) && Date.now() < deadline) pause(50);
  if (!gone(child)) signal(child, "SIGKILL");
}

const gone = (child) => child.exitCode !== null || child.signalCode !== null;

function signal(child, name) {
  try {
    if (process.platform === "win32") child.kill(name);
    else process.kill(-child.pid, name);
  } catch {
    try {
      child.kill(name);
    } catch {
      // Already gone.
    }
  }
}

function runSync(file, args, { env = process.env, cwd, timeout = SHOT_TIMEOUT_MS } = {}) {
  return execFileSync(file, args, { env, cwd, timeout, maxBuffer: 8 * 1024 * 1024, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/** A blocking wait: the audit command is synchronous, so a spin loop would burn a core. */
function pause(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Copy a folder for the temp app, leaving out node_modules and the engine's caches. */
function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true, filter: (src) => !/[\\/]node_modules[\\/]/.test(src) && !/[\\/]\.cache[\\/]/.test(src) });
}

const firstLine = (text) => String(text ?? "").replace(/\s+/g, " ").trim().slice(0, 300);

function cleanup(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // A temp folder left behind is harmless.
  }
}

/** The temp copy's entry: one layout block drawn as the audited page its props name. */
const SHOT_MAIN = `import { View } from "gpui-kit";
import { props } from "herdr";
import BotHerdr from "./bot-main.js";
import { PAGES, prepare, seedPage } from "./audit-pages.js";

export default class ShotPage extends View {
  init(given, cx) {
    const id = auditId(given);
    prepare();
    this.inner = new BotHerdr();
    this.inner.init(PAGES[id] ?? PAGES.chat, cx);
    if (this.inner.page) seedPage(this.inner.page, PAGES[id] ? id : "chat");
  }

  render(cx) {
    // Prepared again so no other page's published sub-tab can change this one's seeded state.
    prepare();
    return this.inner.render(cx);
  }
}

function auditId(given) {
  const p = given && typeof given === "object" && given.audit ? given : props() ?? {};
  return typeof p.audit === "string" && PAGES[p.audit] ? p.audit : "chat";
}
`;

/** The temp copy's bh: every call stays pending, so no load can replace the seeded fixture page. */
const FIXTURE_BH = `const pending = () => new Promise(() => {});

export const bh = () => pending();
export const bhJson = () => pending();
export { ROUTING_KEY, bhPath, enc, currentSpace, projectDir } from "./bh-real.js";
`;
