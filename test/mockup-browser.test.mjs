// Finding a browser to draw mockups with (step 3 for t-20261112-8jkz). Every probe is injected, so
// no test touches the disk, the PATH or the registry.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.BH_APP_HOME = mkdtempSync(join(tmpdir(), "bh-mb-"));
const media = () => import(new URL("../mods/bot-herdr/engine/lib/media.mjs", import.meta.url));
const none = () => null;

test("findBrowser: BH_BROWSER is taken first, and nothing is searched when no browser is there", async () => {
  const { findBrowser } = await media();
  assert.equal(findBrowser({ env: { BH_BROWSER: "/b/chrome" }, exists: (p) => p === "/b/chrome" }), "/b/chrome");
  assert.equal(findBrowser({ env: {}, platform: "linux", exists: () => false, which: none }), null);
});

test("findBrowser on Windows: a Scoop install of Chrome is found", async () => {
  const { findBrowser } = await media();
  const got = findBrowser({
    env: { USERPROFILE: "C:\\Users\\me" }, platform: "win32", which: none, reg: () => "",
    exists: (p) => /scoop[\\/]apps[\\/]googlechrome[\\/]current[\\/]chrome\.exe$/.test(p),
  });
  assert.match(got, /scoop[\\/]apps[\\/]googlechrome[\\/]current[\\/]chrome\.exe$/);
});

test("findBrowser on Windows: a registered App Path is found, current user first", async () => {
  const { findBrowser } = await media();
  const keys = [];
  const reg = (key) => {
    keys.push(key);
    return key.startsWith("HKLM") && key.endsWith("msedge.exe") ? '\r\nHKEY_LOCAL_MACHINE\\SOFTWARE\\...\\msedge.exe\r\n    (Default)    REG_SZ    "C:\\Edge\\msedge.exe"\r\n' : "";
  };
  const got = findBrowser({ env: {}, platform: "win32", which: none, reg, exists: (p) => p === "C:\\Edge\\msedge.exe" });
  assert.equal(got, "C:\\Edge\\msedge.exe");
  assert.match(keys[0], /^HKCU\\.*\\msedge\.exe$/);
  assert.match(keys[1], /^HKLM\\.*\\msedge\.exe$/);
});

test("findBrowser on Windows: today's installs come before Beta and Dev, and PATH comes last", async () => {
  const { findBrowser } = await media();
  const env = { PROGRAMFILES: "C:\\PF", LOCALAPPDATA: "C:\\L" };
  const both = findBrowser({ env, platform: "win32", which: () => "C:\\path\\msedge.exe", reg: () => "", exists: (p) => /Chrome Beta|Microsoft\\Edge\\Application/.test(p) });
  assert.equal(both, "C:\\PF\\Microsoft\\Edge\\Application\\msedge.exe");
  const beta = findBrowser({ env, platform: "win32", which: none, reg: () => "", exists: (p) => p.includes("Chrome Beta") });
  assert.match(beta, /Google\\Chrome Beta\\Application\\chrome\.exe$/);
  const path = findBrowser({ env, platform: "win32", which: (n) => (n === "msedge" ? "C:\\bin\\msedge.exe" : null), reg: () => "", exists: () => false });
  assert.equal(path, "C:\\bin\\msedge.exe");
});

test("appPathOf reads the default value from reg query output", async () => {
  const { appPathOf } = await media();
  assert.equal(appPathOf("\r\nHKEY_CURRENT_USER\\Software\\...\r\n    (Default)    REG_SZ    C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe\r\n"), "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe");
  assert.equal(appPathOf(""), "");
});

test("findBrowser on Linux: /opt/google/chrome/chrome when nothing is on PATH", async () => {
  const { findBrowser } = await media();
  assert.equal(findBrowser({ env: {}, platform: "linux", which: none, exists: (p) => p === "/opt/google/chrome/chrome" }), "/opt/google/chrome/chrome");
});

test("findBrowser on Linux: chrome-headless-shell on PATH", async () => {
  const { findBrowser } = await media();
  const which = (n) => (n === "chrome-headless-shell" ? "/usr/bin/chrome-headless-shell" : null);
  assert.equal(findBrowser({ env: {}, platform: "linux", which, exists: () => false }), "/usr/bin/chrome-headless-shell");
});

test("findBrowser on macOS: Chrome Canary is found", async () => {
  const { findBrowser } = await media();
  const got = findBrowser({ env: { HOME: "/Users/me" }, platform: "darwin", which: none, exists: (p) => p.includes("Google Chrome Canary.app") });
  assert.match(got, /Applications[\\/]Google Chrome Canary\.app[\\/]Contents[\\/]MacOS[\\/]Google Chrome Canary$/);
});
