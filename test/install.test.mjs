// install.mjs after the redesign: the herdr-app binary lookup (env override, PATH, ~/.local/bin)
// and the non-destructive layout migration that keeps a pre-redesign layout beside the new one.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

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

// ── The redesign's layout migration (migrateLayout, backupLayout) ──────────────────────────

const { migrateLayout, backupLayout, layoutBackupPath, installLayout } = await import(new URL("../install.mjs", import.meta.url));
const shippedLayout = join(ROOT, "layouts", "bot-herdr.json");

/** The eleven-destination layout a user has installed today, with their own sizes and theme. */
const oldLayout = {
  id: "root",
  type: "row",
  theme: { light: "bot-herdr-light", dark: "bot-herdr-dark" },
  toast: "bot-herdr",
  terminal_padding: [10, 10],
  children: [
    {
      id: "sidebar", type: "column", size: { px: 300 },
      children: [{ id: "spaces", type: "block", size: { weight: 2 } }, { id: "agents", type: "block", size: { weight: 1 } }],
    },
    {
      id: "work", type: "column",
      children: [
        { id: "topbar", type: "row", size: { px: 44 }, children: [{ id: "switch", type: "block", size: { px: 800 } }, { id: "tabs", type: "block" }] },
        {
          id: "work-body", type: "row",
          children: [
            {
              id: "pages", type: "stack", active: "metrics",
              children: ["chat", "tasks", "plans", "issues", "knowledge", "learning", "metrics", "settings", "my-own-tool"].map((id) => ({ id, type: "block" })),
            },
            { id: "panel", type: "column", size: { px: 420 }, hidden: true, children: [] },
          ],
        },
        { id: "status", type: "block", size: { px: 30 } },
      ],
    },
  ],
};

/** The redesign's layout: Home, Threads, Agents, Library and Settings, with Usage inside Settings. */
const newLayout = {
  id: "root",
  type: "row",
  theme: { light: "graphite-light", dark: "graphite" },
  children: [
    {
      id: "sidebar", type: "column", size: { px: 268 },
      children: [{ id: "spaces", type: "block", size: { weight: 1 } }, { id: "agents", type: "block", size: { weight: 1 } }],
    },
    {
      id: "work", type: "column",
      children: [
        { id: "topbar", type: "row", size: { px: 42 }, children: [{ id: "switch", type: "block", size: { px: 760 } }] },
        {
          id: "work-body", type: "row",
          children: [
            {
              id: "pages", type: "stack", active: "home",
              children: [
                { id: "home", type: "block", content: { mod: "bot-herdr", props: { view: "home" } } },
                { id: "threads", type: "block", content: { mod: "bot-herdr", props: { view: "threads" } } },
                { id: "agents", type: "block", content: { mod: "bot-herdr", props: { view: "agents" } } },
                { id: "library", type: "block", content: { mod: "bot-herdr", props: { view: "library" } } },
                { id: "settings", type: "block", content: { mod: "bot-herdr", props: { view: "settings" } } },
              ],
            },
            { id: "panel", type: "column", size: { px: 368 }, hidden: true, children: [] },
          ],
        },
        { id: "status", type: "block", size: { px: 28 } },
      ],
    },
  ],
};

const findNode = (node, id) => (node?.id === id ? node : (node?.children ?? []).map((child) => findNode(child, id)).find(Boolean) ?? null);
const pageIds = (layout) => findNode(layout, "pages").children.map((child) => child.id);

test("migrateLayout: the eleven destinations become the redesign's five, and a page of the user's own stays", () => {
  const migrated = migrateLayout(oldLayout, newLayout);
  assert.deepEqual(pageIds(migrated), ["home", "threads", "agents", "library", "settings", "my-own-tool"]);
  for (const gone of ["chat", "tasks", "plans", "issues", "knowledge", "learning", "metrics"]) {
    assert.ok(!pageIds(migrated).includes(gone), `${gone} is replaced by the redesign's pages`);
  }
  assert.equal(findNode(migrated, "tabs"), null, "the redesign's own top bar is what ships");
});

test("migrateLayout: the user's window choices are carried, not the redesign's defaults", () => {
  const migrated = migrateLayout(oldLayout, newLayout);
  assert.deepEqual(findNode(migrated, "sidebar").size, { px: 300 });
  assert.deepEqual(findNode(migrated, "spaces").size, { weight: 2 });
  assert.deepEqual(findNode(migrated, "topbar").size, { px: 44 });
  assert.deepEqual(findNode(migrated, "switch").size, { px: 800 });
  assert.deepEqual(findNode(migrated, "panel").size, { px: 420 });
  assert.deepEqual(findNode(migrated, "status").size, { px: 30 });
  assert.deepEqual(migrated.theme, { light: "bot-herdr-light", dark: "bot-herdr-dark" });
  assert.deepEqual(migrated.terminal_padding, [10, 10]);
  assert.equal(migrated.toast, "bot-herdr");
});

test("migrateLayout: the page the user was on is kept when the redesign has it, else Home", () => {
  assert.equal(findNode(migrateLayout(oldLayout, newLayout), "pages").active, "home", "the old page (metrics) is gone, so Home opens");
  const onThreads = JSON.parse(JSON.stringify(oldLayout));
  findNode(onThreads, "pages").active = "threads";
  assert.equal(findNode(migrateLayout(onThreads, newLayout), "pages").active, "threads");
});

test("migrateLayout: idempotent, pure, and calm about a layout it cannot read", () => {
  const before = JSON.stringify(oldLayout);
  const migrated = migrateLayout(oldLayout, JSON.stringify(newLayout));
  assert.equal(JSON.stringify(oldLayout), before, "the old layout is never changed");
  assert.deepEqual(migrateLayout(migrated, newLayout), migrated, "a second migration changes nothing");
  assert.equal(migrateLayout(oldLayout, "{ not json"), null, "an unreadable target is the caller's to keep");
  assert.deepEqual(migrateLayout("{ not json", newLayout), newLayout, "an unreadable old layout just gets the new one");
  assert.deepEqual(pageIds(migrateLayout(null, newLayout)), ["home", "threads", "agents", "library", "settings"]);
});

test("backupLayout keeps the layout beside itself with a timestamp, never twice under one name", () => {
  const file = join(tmp, "layouts", "bot-herdr.json");
  mkdirSync(join(tmp, "layouts"), { recursive: true });
  writeFileSync(file, JSON.stringify(oldLayout));
  const at = new Date("2026-11-22T00:15:30.123Z");
  assert.equal(layoutBackupPath(file, at), `${file}.20261122T001530Z.bak`);
  const first = backupLayout(file, { at });
  assert.equal(first, `${file}.20261122T001530Z.bak`);
  assert.equal(readFileSync(first, "utf8"), readFileSync(file, "utf8"));
  const second = backupLayout(file, { at });
  assert.equal(second, `${file}.20261122T001530Z-2.bak`);
  assert.ok(existsSync(second));
  assert.equal(backupLayout(join(tmp, "layouts", "none.json"), { at }), "");
});

// ── Shipping the layout: installLayout over an installed file ────────────────────────────────

test("installLayout: an installed layout (with metrics) becomes the shipped one, backed up", () => {
  const dir = mkdtempSync(join(tmp, "install-layout-"));
  const file = join(dir, "layouts", "bot-herdr.json");
  mkdirSync(dirname(file), { recursive: true });
  const installed = JSON.stringify(oldLayout, null, 2);
  writeFileSync(file, installed);

  const at = new Date("2026-11-22T00:15:30.123Z");
  const first = installLayout({ file, target: shippedLayout, at });
  assert.equal(first.action, "migrated");
  assert.equal(first.backup, `${file}.20261122T001530Z.bak`, "the layout it replaced is kept beside it");
  assert.equal(readFileSync(first.backup, "utf8"), installed, "the backup is the file as it was");

  const written = JSON.parse(readFileSync(file, "utf8"));
  const shipped = JSON.parse(readFileSync(shippedLayout, "utf8"));
  assert.deepEqual(pageIds(written), ["home", "threads", "agents", "library", "settings", "my-own-tool"], "the five destinations, plus a page of the user's own");
  assert.equal(findNode(written, "pages").active, "home", "the old page (metrics) is gone, so Home opens");
  assert.equal(findNode(written, "tabs"), null, "the top-bar tabs strip does not come back");
  assert.deepEqual(findNode(written, "stage").children.map((c) => c.id), ["pages", "terminals"]);
  assert.equal(findNode(written, "switch").window_drag, shipped.children[1].children[0].children[0].window_drag);
  assert.deepEqual(findNode(written, "sidebar").size, { px: 300 }, "the person's own rail width is kept");
  assert.deepEqual(written.theme, { light: "bot-herdr-light", dark: "bot-herdr-dark" }, "and their theme");

  const again = installLayout({ file, target: shippedLayout, at: new Date("2026-11-22T01:00:00.000Z") });
  assert.equal(again.action, "kept", "a repeat install writes nothing");
  assert.equal(again.backup, "", "and makes no second backup");
  assert.equal(readFileSync(file, "utf8"), JSON.stringify(written, null, 2) + "\n");

  assert.equal(installLayout({ file: join(dir, "fresh", "bot-herdr.json"), target: shippedLayout }).action, "created", "no installed layout: written as it ships");
  assert.equal(installLayout({ file, target: join(dir, "missing.json") }).action, "kept", "an unreadable shipped layout keeps the installed one");
  assert.equal(installLayout({ file, target: shippedLayout, force: true }).action, "replaced", "--force replaces the structure, still backing up");
  rmSync(dir, { recursive: true, force: true });
});
