#!/usr/bin/env node
// Installs bot-herdr into the Herdr app's home: the mod, the "bot-herdr" layout (Herdr's main
// layout with a Chat page and a Settings page beside the terminals) and its light and dark
// themes, and the chat's key (ctrl+shift+m). Then checks the mod with `herdr-app check` if it can.
//
//   node install.mjs            install (keeps your layout and your own keys)
//   node install.mjs --force    also replace the layout file
//   node install.mjs --switch   then switch the open window to the layout
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
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

for (const name of ["bot-herdr-light.json", "bot-herdr-dark.json"]) {
  mkdirSync(join(appHome, "themes"), { recursive: true });
  cpSync(join(here, "themes", name), join(appHome, "themes", name));
}
console.log(`themes   ${join(appHome, "themes")}/bot-herdr-{light,dark}.json`);

const layout = join(appHome, "layouts", "bot-herdr.json");
// A layout from before the pages (chat, terminals, tasks, plans, knowledge, settings) can't show
// them: replace it.
const old = existsSync(layout) && !readFileSync(layout, "utf8").includes('"id": "knowledge"');
if (old) cpSync(layout, `${layout}.old`);
if (!existsSync(layout) || old || args.has("--force")) {
  mkdirSync(dirname(layout), { recursive: true });
  cpSync(join(here, "layouts", "bot-herdr.json"), layout);
  console.log(`layout   ${layout}${old ? " (yours from before is kept as bot-herdr.json.old)" : ""}`);
} else {
  // Notifications rise out of the chat's composer: the root names our mod as its toast.
  try {
    const kept = JSON.parse(readFileSync(layout, "utf8"));
    if (!kept.toast) {
      kept.toast = "bot-herdr";
      writeFileSync(layout, `${JSON.stringify(kept, null, 2)}\n`);
    }
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
