#!/usr/bin/env node
// Installs bot-herdr into the Herdr app's home: the mod, the "bot-herdr" layout (Herdr's main
// layout with a Chat page and a Settings page beside the terminals) and its light and dark
// themes, and the chat's key (ctrl+shift+m). Then checks the mod with `herdr-app check` if it can.
//
//   node install.mjs            install (keeps your layout and your own keys)
//   node install.mjs --force    also replace the layout file
//   node install.mjs --switch   then switch the open window to the layout
//   node install.mjs --skip-tools   don't download the bundled rg, fd and ast-grep
//   node install.mjs --allow-older  install even when this copy is older than the installed one
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { ensureTools } from "./mods/bot-herdr/engine/lib/install-tools.mjs";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * The `herdr-app` to run: HERDR_APP_BIN when set, then the first herdr-app on PATH, then the usual
 * per-user install folder (a GUI app's installer does not always put it on the PATH of a shell).
 */
export function resolveHerdrAppBin() {
  const override = String(process.env.HERDR_APP_BIN ?? "").trim();
  if (override) return override;
  const suffixes = process.platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
  const dirs = String(process.env.PATH ?? process.env.Path ?? "").split(delimiter).filter(Boolean);
  for (const dir of dirs) {
    for (const suffix of suffixes) {
      const file = join(dir, `herdr-app${suffix}`);
      if (existsSync(file)) return file;
    }
  }
  const local = join(homedir(), ".local", "bin", "herdr-app");
  return existsSync(local) ? local : "herdr-app";
}

const hasHomePage = (text) => String(text ?? "").includes('"id": "home"');

// Layouts written before the redesign (a "home" page is what marks one): these helpers merged the
// pages the redesign added into an installed layout, and a layout from that era may still be on a
// machine. `runInstall` now ships the whole structure through `installLayout`/`migrateLayout`, so
// they stay exported for those older layouts (and the tests that pin their behaviour).

/**
 * Whether an installed layout predates the redesign: the repo layout has a "home" page and the
 * installed one does not. Its own layout is kept before the repo's replaces it.
 */
export function shouldMigrateRedesignLayout(repoLayoutText, installedLayoutText) {
  return hasHomePage(repoLayoutText) && !hasHomePage(installedLayoutText);
}

/** Finds a layout node by id anywhere in the layout tree. */
function findNode(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

/**
 * Non-destructively ensures the "issues" block sits right after "plans" in pages.children and
 * bumps the top-bar "switch" block width from 600 to 680 if still at the old default.
 * Returns whether the layout changed.
 */
export function ensureIssuesPage(root) {
  const pages = findNode(root, "pages");
  if (!pages || !Array.isArray(pages.children)) return false;
  let changed = false;
  if (!pages.children.some((c) => c?.id === "issues")) {
    const block = { id: "issues", type: "block", content: { mod: "bot-herdr", props: { view: "issues" } } };
    const plansIdx = pages.children.findIndex((c) => c?.id === "plans");
    if (plansIdx >= 0) pages.children.splice(plansIdx + 1, 0, block);
    else pages.children.push(block);
    changed = true;
  }
  const sw = findNode(root, "switch");
  if (sw?.size?.px === 600) {
    sw.size.px = 680;
    changed = true;
  }
  return changed;
}

/**
 * Non-destructively ensures the "learning" block sits right after "knowledge" in pages.children
 * and widens the top-bar "switch" to 760 from a 600 or 680 default. A width the user chose
 * already (800, say) is kept. Returns whether the layout changed.
 */
export function ensureLearningPage(root) {
  const pages = findNode(root, "pages");
  if (!pages || !Array.isArray(pages.children)) return false;
  let changed = false;
  if (!pages.children.some((c) => c?.id === "learning")) {
    const block = { id: "learning", type: "block", content: { mod: "bot-herdr", props: { view: "learning" } } };
    const knowledgeIdx = pages.children.findIndex((c) => c?.id === "knowledge");
    if (knowledgeIdx >= 0) pages.children.splice(knowledgeIdx + 1, 0, block);
    else pages.children.push(block);
    changed = true;
  }
  const sw = findNode(root, "switch");
  if (sw?.size?.px === 600 || sw?.size?.px === 680) {
    sw.size.px = 760;
    changed = true;
  }
  return changed;
}

/** The file in the installed mod that says which commit it came from. */
export const STAMP = ".installed.json";

/** This checkout's commit and its time ({ commit, time } in seconds), or null outside git. */
export function sourceStamp(dir, git = (args) => spawnSync("git", args, { cwd: dir, encoding: "utf8", windowsHide: true })) {
  try {
    const r = git(["log", "-1", "--format=%H %ct"]);
    const [commit, time] = String(r?.stdout ?? "").trim().split(/\s+/);
    return (r?.status ?? 1) === 0 && commit && Number(time) > 0 ? { commit, time: Number(time) } : null;
  } catch {
    return null;
  }
}

/** The stamp of the installed mod, or null when it has none. */
export function readStamp(mod) {
  try {
    const got = JSON.parse(readFileSync(join(mod, STAMP), "utf8"));
    return got && Number(got.time) > 0 ? { commit: String(got.commit ?? ""), time: Number(got.time) } : null;
  } catch {
    return null;
  }
}

/** Why installing `source` over `installed` would go back in time, or "" when it would not. */
export function olderThanInstalled(source, installed) {
  if (!source || !installed || source.commit === installed.commit || source.time >= installed.time) return "";
  const when = (t) => new Date(t * 1000).toISOString().slice(0, 16).replace("T", " ");
  return `This copy (${source.commit.slice(0, 7)}, ${when(source.time)}) is older than the installed bot-herdr (${installed.commit.slice(0, 7)}, ${when(installed.time)}).`;
}

async function runInstall() {
  const args = new Set(process.argv.slice(2));
  const candidateHomes = [
    join(homedir(), ".config", "herdr-app"),
    process.env.XDG_CONFIG_HOME ? join(process.env.XDG_CONFIG_HOME, "herdr-app") : null,
    process.platform === "win32" && process.env.APPDATA ? join(process.env.APPDATA, "herdr-app") : null,
  ].filter(Boolean);

  const appHome = process.env.HERDR_APP_HOME
    || candidateHomes.find(p => existsSync(p))
    || (process.platform === "win32" && process.env.APPDATA ? join(process.env.APPDATA, "herdr-app") : null)
    || join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "herdr-app");

  if (!existsSync(appHome)) {
    console.error(`No Herdr app home at ${appHome}. Open Herdr once, or set HERDR_APP_HOME.`);
    process.exit(1);
  }

  // The mod is ours: replace the whole folder. But never with an older copy (an agent's worktree
  // cut before a merge, a checkout that missed a pull): that quietly brings old pages back.
  const mod = join(appHome, "mods", "bot-herdr");
  const source = sourceStamp(here);
  const older = olderThanInstalled(source, readStamp(mod));
  if (older && !args.has("--allow-older")) {
    console.error(older);
    console.error("Nothing was installed. Run `git pull` here first, or pass --allow-older to install this copy anyway.");
    process.exit(1);
  }
  rmSync(mod, { recursive: true, force: true });
  mkdirSync(dirname(mod), { recursive: true });
  cpSync(join(here, "mods", "bot-herdr"), mod, { recursive: true });
  if (source) writeFileSync(join(mod, STAMP), `${JSON.stringify(source, null, 2)}\n`);
  console.log(`mod      ${mod}`);

  // The retrieval binaries live in the mod, but are cached under the app home: reinstalling wipes
  // the mod, and the cache makes a repeat install instant and safe offline.
  if (!args.has("--skip-tools")) {
    const tools = await ensureTools({ modDir: mod, cacheDir: join(appHome, "cache", "bot-herdr-bin") });
    console.log(`tools    ${tools.map((t) => `${t.tool} ${t.status}`).join(", ")}`);
  }

  const themeDir = join(appHome, "themes");
  mkdirSync(themeDir, { recursive: true });
  const themes = readdirSync(join(here, "themes")).filter((name) => name.endsWith(".json")).sort();
  for (const name of themes) cpSync(join(here, "themes", name), join(themeDir, name));
  console.log(`themes   ${themeDir} ${themes.join(", ")}`);

  const layout = join(appHome, "layouts", "bot-herdr.json");
  const repoLayout = join(here, "layouts", "bot-herdr.json");
  // The redesign's five destinations ship as the layout; an installed one is migrated onto them
  // (theme, sizes, own pages and the open page carried) and kept beside the new file with a
  // timestamp. A repeat install writes nothing; --force replaces the structure too, still backed up.
  const shipped = installLayout({ file: layout, target: repoLayout, force: args.has("--force") });
  if (shipped.action === "kept" && shipped.reason) console.log(`layout   kept your ${layout} (${shipped.reason})`);
  else if (shipped.action === "kept") console.log(`layout   ${layout} is current`);
  else console.log(`layout   ${layout}${shipped.backup ? ` (your old one is kept as ${basename(shipped.backup)})` : ""}`);

  // Keys: add ours, never replace one you already bound.
  const keysFile = join(appHome, "keys.json");
  const ours = JSON.parse(readFileSync(join(here, "keys.json"), "utf8"));
  let keys = {};
  if (existsSync(keysFile)) {
    try {
      keys = JSON.parse(readFileSync(keysFile, "utf8"));
    } catch {
      console.error(`keys     ${keysFile} isn't valid JSON; left alone. Add: ${JSON.stringify(ours)}`);
      keys = null;
    }
  }
  if (keys) {
    let added = 0;
    for (const [section, bindings] of Object.entries(ours)) {
      keys[section] ??= {};
      for (const [key, action] of Object.entries(bindings)) {
        if (keys[section][key] === undefined) {
          keys[section][key] = action;
          added++;
        } else if (keys[section][key] !== action) {
          console.log(`keys     ${key} is already ${JSON.stringify(keys[section][key])}; bind ${action} yourself`);
        }
      }
    }
    if (added) {
      writeFileSync(keysFile, JSON.stringify(keys, null, 2) + "\n");
      console.log(`keys     added ${added} to ${keysFile}`);
    }
  }

  // Harnesses herdr's own table doesn't list, so they show in Settings: add each one you don't
  // have, and give an entry you have a way to start it if it has none. Nothing of yours is replaced.
  const programsFile = join(appHome, "programs.json");
  const extra = JSON.parse(readFileSync(join(here, "programs.json"), "utf8")).programs;
  let programs = { programs: {} };
  let programsOk = true;
  if (existsSync(programsFile)) {
    try {
      programs = JSON.parse(readFileSync(programsFile, "utf8"));
      programs.programs ??= {};
    } catch {
      programsOk = false;
      console.error(`programs ${programsFile} isn't valid JSON; left alone`);
    }
  }
  if (programsOk) {
    const added = [];
    for (const [key, entry] of Object.entries(extra)) {
      const mine = programs.programs[key];
      if (!mine) {
        programs.programs[key] = entry;
        added.push(key);
      } else if (!mine.run) {
        mine.run = entry.run;
        added.push(key);
      }
    }
    if (added.length) {
      writeFileSync(programsFile, JSON.stringify(programs, null, 2) + "\n");
      console.log(`programs added ${added.join(", ")} to ${programsFile}`);
    }
  }

  const herdrApp = resolveHerdrAppBin();
  const check = spawnSync(herdrApp, ["check", mod], { stdio: "inherit" });
  if (check.error) console.log(`check    ${herdrApp} isn't runnable; run: herdr-app check ` + mod);
  else if (check.status !== 0) process.exit(check.status ?? 1);

  if (args.has("--switch")) spawnSync(herdrApp, ["do", "layout.switch", "--name", "bot-herdr"], { stdio: "inherit" });
  else console.log('switch   herdr-app do layout.switch --name bot-herdr   (or ctrl+shift+l)');
}

// ── The redesign's layout migration ───────────────────────────────────────────────────────
//
// The redesign's layout holds five destinations — Home, Threads, Agents (Fleet | Terminals),
// Library (Knowledge | Learning | Scripts | Issues) and Settings behind the gear, with Usage
// inside it — where the old one held eleven (the page tabs, Orchestrator, Files, Changes and
// Metrics). `migrateLayout(old, target)` maps an installed layout onto the shipped one without
// losing anything the person chose: their theme and window keys, the sizes of the nodes both
// layouts share, the active page when the redesign kept it, and any page of their own that the
// redesign does not replace. The installed file is backed up first (timestamped) by `backupLayout`.

/** Window choices a person makes, carried over as they are: a migration is not a restyle. */
const APPEARANCE_KEYS = ["theme", "titlebar", "toast", "traffic_lights", "background", "terminal_padding", "divider"];

/** Nodes whose geometry is the person's (the rail, the panel, the bars), not the redesign's. */
// ("agents" is left out: it named a sidebar block once and names a page now.)
const SHARED_SIZES = ["sidebar", "brand", "sidebar-lists", "spaces", "sidebar-footer", "topbar", "switch", "panel", "status"];

/** The old destinations the redesign replaces: its new pages hold what these held. */
const LEGACY_PAGES = new Set(["home", "chat", "tasks", "plans", "issues", "knowledge", "learning", "scripts", "metrics", "usage", "settings", "approvals", "review", "files", "changes", "agents", "library", "terminals"]);

/** A deep copy of layout JSON, so neither layout keeps a reference the other can change. */
const cloneLayout = (value) => JSON.parse(JSON.stringify(value));

/** A layout as an object (an object is copied, text is parsed); null when it cannot be read. */
function parseLayout(value) {
  if (value && typeof value === "object") return cloneLayout(value);
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/** Carries the person's window keys from the old layout onto the new one. Returns whether it changed. */
function carryAppearance(target, old) {
  let changed = false;
  for (const key of APPEARANCE_KEYS) {
    if (old[key] === undefined || JSON.stringify(old[key]) === JSON.stringify(target[key])) continue;
    target[key] = cloneLayout(old[key]);
    changed = true;
  }
  return changed;
}

/** Carries the geometry of every node both layouts share (its size, min and max). */
function carrySize(target, old) {
  let changed = false;
  for (const id of SHARED_SIZES) {
    const from = findNode(old, id);
    const to = findNode(target, id);
    if (!from || !to) continue;
    for (const key of ["size", "min", "max"]) {
      if (from[key] === undefined || JSON.stringify(from[key]) === JSON.stringify(to[key])) continue;
      to[key] = cloneLayout(from[key]);
      changed = true;
    }
  }
  return changed;
}

/** Keeps a page the person added that the redesign does not replace, after the new pages. */
function carryOwnPages(target, old) {
  const next = findNode(target, "pages");
  const previous = findNode(old, "pages");
  if (!Array.isArray(next?.children) || !Array.isArray(previous?.children)) return false;
  const known = new Set(next.children.map((child) => child?.id));
  const kept = previous.children.filter((child) => child?.id && !known.has(child.id) && !LEGACY_PAGES.has(child.id));
  if (!kept.length) return false;
  next.children = [...next.children, ...kept.map(cloneLayout)];
  return true;
}

/** Keeps the page the person was on, when the redesign still has it; else the redesign's own. */
function carryActivePage(target, old) {
  const next = findNode(target, "pages");
  const previous = findNode(old, "pages");
  if (!next || !previous?.active || next.active === previous.active) return false;
  if (!next.children?.some((child) => child?.id === previous.active)) return false;
  next.active = previous.active;
  return true;
}

/**
 * An existing layout mapped onto the redesign's layout: the target's structure, carrying the
 * person's own choices (see the section comment). Idempotent — migrating the result again changes
 * nothing — and never destructive: it only returns the layout to write, and null when the target
 * itself cannot be read, so a caller keeps the installed file rather than replacing it with junk.
 */
export function migrateLayout(old, target) {
  const next = parseLayout(target);
  if (!next) return null;
  const previous = parseLayout(old);
  if (!previous) return next;
  carryAppearance(next, previous);
  carrySize(next, previous);
  carryOwnPages(next, previous);
  carryActivePage(next, previous);
  return next;
}

/** A backup's name: `<layout>.<UTC stamp>.bak`, never the same one twice. */
export function layoutBackupPath(file, at = new Date()) {
  const stamp = at.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  let path = `${file}.${stamp}.bak`;
  for (let n = 2; existsSync(path); n++) path = `${file}.${stamp}-${n}.bak`;
  return path;
}

/** Copies an installed layout beside itself with a timestamp; "" when there is no file yet. */
export function backupLayout(file, { at = new Date(), copy = cpSync } = {}) {
  if (!existsSync(file)) return "";
  const path = layoutBackupPath(file, at);
  copy(file, path);
  return path;
}

/** A file's text, or null when it cannot be read. */
function readTextOrNull(file) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/** Whether two layout texts hold the same layout, whatever their spacing. */
function sameLayoutText(a, b) {
  try {
    return JSON.stringify(JSON.parse(a)) === JSON.stringify(JSON.parse(b));
  } catch {
    return false;
  }
}

/**
 * Puts the shipped layout where Herdr reads it, without losing the one that was there:
 *  - nothing installed: writes it ("created");
 *  - an installed layout: migrates it onto the shipped structure (migrateLayout) and keeps the old
 *    file beside it with a timestamp ("migrated") — an unreadable one is replaced, still backed up;
 *  - --force: replaces the structure too, backed up ("replaced");
 *  - already current: writes nothing and makes no backup ("kept").
 * Returns { action, backup, reason }, where backup is "" when there was nothing to back up.
 */
export function installLayout({ file, target, force = false, at = new Date() }) {
  const shipped = readTextOrNull(target);
  if (!shipped) return { action: "kept", backup: "", reason: "the shipped layout could not be read" };
  const installed = readTextOrNull(file);
  const next = installed === null || force ? shipped : JSON.stringify(migrateLayout(installed, shipped) ?? JSON.parse(shipped), null, 2) + "\n";
  if (installed !== null && sameLayoutText(next, installed)) return { action: "kept", backup: "" };
  mkdirSync(dirname(file), { recursive: true });
  const backup = installed === null ? "" : backupLayout(file, { at });
  writeFileSync(file, next);
  return { action: installed === null ? "created" : force ? "replaced" : "migrated", backup };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  await runInstall();
}
