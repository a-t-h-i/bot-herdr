// install.mjs after the redesign: the herdr-app binary lookup (env override, PATH, ~/.local/bin)
// and the non-destructive layout migration that keeps a pre-redesign layout beside the new one.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "bh-install-foundation-"));
after(() => {
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {}
});

const { shouldMigrateRedesignLayout, resolveHerdrAppBin } = await import(new URL("../install.mjs", import.meta.url));
const redesignedLayout = JSON.stringify({ id: "root", type: "stack", children: [{ id: "pages", type: "stack", children: [{ id: "home" }, { id: "chat" }] }] }, null, 2);
const preRedesignLayout = JSON.stringify({ id: "root", type: "stack", children: [{ id: "pages", type: "stack", children: [] }] }, null, 2);

test("shouldMigrateRedesignLayout migrates only a layout from before the home page", () => {
  assert.equal(shouldMigrateRedesignLayout(redesignedLayout, preRedesignLayout), true);
  assert.equal(shouldMigrateRedesignLayout(preRedesignLayout, preRedesignLayout), false);
  assert.equal(shouldMigrateRedesignLayout(redesignedLayout, redesignedLayout), false);
  assert.equal(shouldMigrateRedesignLayout("", redesignedLayout), false);
});

test("resolveHerdrAppBin prefers HERDR_APP_BIN", () => {
  const before = process.env.HERDR_APP_BIN;
  const fake = join(tmp, "herdr-app-from-env");
  writeFileSync(fake, "");
  try {
    process.env.HERDR_APP_BIN = fake;
    assert.equal(resolveHerdrAppBin(), fake);
    process.env.HERDR_APP_BIN = "";
    // No override: a real binary on PATH or in ~/.local/bin, else the bare name for the hint.
    assert.ok(resolveHerdrAppBin().includes("herdr-app"));
  } finally {
    if (before === undefined) delete process.env.HERDR_APP_BIN;
    else process.env.HERDR_APP_BIN = before;
  }
});

test("resolveHerdrAppBin finds herdr-app in ~/.local/bin when PATH has it nowhere", () => {
  const before = { PATH: process.env.PATH, HOME: process.env.HOME, HERDR_APP_BIN: process.env.HERDR_APP_BIN };
  const home = join(tmp, "home");
  mkdirSync(join(home, ".local", "bin"), { recursive: true });
  writeFileSync(join(home, ".local", "bin", "herdr-app"), "");
  try {
    delete process.env.HERDR_APP_BIN;
    process.env.PATH = join(tmp, "empty-path");
    process.env.HOME = home;
    assert.equal(resolveHerdrAppBin(), join(home, ".local", "bin", "herdr-app"));
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
