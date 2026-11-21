#!/usr/bin/env node
// Installs bot-herdr into the Herdr app's home: the mod, the "bot-herdr" layout (Herdr's main
// layout with a Chat page and a Settings page beside the terminals) and its light and dark
// themes, and the chat's key (ctrl+shift+m). Then checks the mod with `herdr-app check` if it can.
//
//   node install.mjs            install (keeps your layout and your own keys)
//   node install.mjs --force    also replace the layout file
//   node install.mjs --switch   then switch the open window to the layout
//   node install.mjs --skip-tools   don't download the bundled rg, fd and ast-grep
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { ensureTools } from "./mods/bot-herdr/engine/lib/install-tools.mjs";

const here = dirname(fileURLToPath(import.meta.url));

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

  // The mod is ours: replace the whole folder.
  const mod = join(appHome, "mods", "bot-herdr");
  rmSync(mod, { recursive: true, force: true });
  mkdirSync(dirname(mod), { recursive: true });
  cpSync(join(here, "mods", "bot-herdr"), mod, { recursive: true });
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
  // A layout from before the pages (chat, terminals, tasks, plans, knowledge, metrics, settings)
  // can't show them: replace it.
  const old = existsSync(layout) && !readFileSync(layout, "utf8").includes('"id": "metrics"');
  if (old) cpSync(layout, `${layout}.old`);
  if (!existsSync(layout) || old || args.has("--force")) {
    mkdirSync(dirname(layout), { recursive: true });
    cpSync(join(here, "layouts", "bot-herdr.json"), layout);
    console.log(`layout   ${layout}${old ? " (yours from before is kept as bot-herdr.json.old)" : ""}`);
  } else {
    // Notifications rise out of the chat's composer: the root names our mod as its toast.
    try {
      const kept = JSON.parse(readFileSync(layout, "utf8"));
      let changed = false;
      if (!kept.toast) {
        kept.toast = "bot-herdr";
        changed = true;
      }
      // The Files / Changes panel sits beside the pages, not inside the Terminals page, so the
      // tab bar's Files and Changes buttons show it on every page (Chat too).
      changed = panelBesidePages(kept) || changed;
      changed = ensureIssuesPage(kept) || changed;
      changed = ensureLearningPage(kept) || changed;
      if (changed) writeFileSync(layout, `${JSON.stringify(kept, null, 2)}\n`);
    } catch {
      // not JSON we can read: leave it as it is
    }
    console.log(`layout   kept your ${layout} (--force replaces it)`);
  }

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

  const check = spawnSync("herdr-app", ["check", mod], { stdio: "inherit" });
  if (check.error) console.log("check    herdr-app isn't on PATH; run: herdr-app check " + mod);
  else if (check.status !== 0) process.exit(check.status ?? 1);

  if (args.has("--switch")) spawnSync("herdr-app", ["do", "layout.switch", "--name", "bot-herdr"], { stdio: "inherit" });
  else console.log('switch   herdr-app do layout.switch --name bot-herdr   (or ctrl+shift+l)');
}

/**
 * Moves the "panel" node (herdr's Files / Changes) out of the "terminals" page to sit beside the
 * "pages" stack, in a "work-body" row. Returns whether the layout changed.
 */
function panelBesidePages(root) {
  const parentOf = (node, id) => {
    for (const child of node?.children ?? []) {
      if (child.id === id) return node;
      const found = parentOf(child, id);
      if (found) return found;
    }
    return null;
  };
  const from = parentOf(root, "panel");
  const work = parentOf(root, "pages");
  if (from?.id !== "terminals" || !work) return false;
  const panel = from.children.find((c) => c.id === "panel");
  from.children = from.children.filter((c) => c !== panel);
  const pages = work.children.find((c) => c.id === "pages");
  const { children, ...rest } = panel;
  const body = { id: "work-body", type: "row", children: [pages, { ...rest, padding: rest.padding ?? 8, children }] };
  work.children = work.children.map((c) => (c === pages ? body : c));
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  await runInstall();
}
