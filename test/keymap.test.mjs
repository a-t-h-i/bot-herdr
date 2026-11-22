// Pure tests for the keyboard map (keymap.js): the table the `?` overlay draws and the audit
// reads — the spec's global keys and the keys of every page that takes keys, and the absence of
// collisions. No herdr or gpui imports.

import { test } from "node:test";
import assert from "node:assert/strict";

import { KEYMAP, collisions, contexts, overlayRows } from "../mods/bot-herdr/keymap.js";

test("the map names the spec's global keys and the keys of every page that takes keys", () => {
  const rows = overlayRows();
  const globals = rows.filter((r) => r.context === "global");
  for (const key of ["Ctrl+Shift+P", "Ctrl+1", "Ctrl+2", "Ctrl+3", "Ctrl+4", "Ctrl+5", "Ctrl+.", "?"]) {
    assert.ok(globals.some((r) => r.keys.includes(key)), `the global map names ${key}`);
  }
  const threads = rows.filter((r) => r.context === "threads");
  for (const key of ["J", "K", "Home", "End", "Space", "Enter", "Esc", "1", "9", "Ctrl+Enter"]) {
    assert.ok(threads.some((r) => r.keys.includes(key)), `the threads map names ${key}`);
  }
  assert.ok(overlayRows().length >= 12);
  for (const r of overlayRows()) assert.ok(r.action.length > 0, `a row has an action: ${r.keys}`);
});

test("the map has no collisions: one key, one row per context", () => {
  assert.deepEqual(collisions(), []);
  const dupes = [];
  const seen = new Map();
  for (const r of KEYMAP) for (const k of r.keys) {
    const sig = `${r.context} ${k}`;
    if (seen.has(sig)) dupes.push(sig);
    seen.set(sig, true);
  }
  assert.deepEqual(dupes, []);
  // Within one context, no two rows may share a key.
  for (const context of contexts()) {
    const keys = overlayRows().filter((r) => r.context === context).flatMap((r) => r.keys);
    assert.equal(new Set(keys).size, keys.length, `${context} has no duplicate keys`);
  }
});

test("contexts are the pages the map names, in the destinations order", () => {
  assert.deepEqual(contexts(), ["global", "home", "threads", "agents"]);
});

test("the pure helpers answer on hostile input: junk maps, not throws", () => {
  for (const bad of [null, undefined, {}, [], "junk", 7, true]) {
    assert.doesNotThrow(() => collisions(bad), `collisions(${String(bad)})`);
    assert.doesNotThrow(() => contexts(bad), `contexts(${String(bad)})`);
    assert.doesNotThrow(() => overlayRows(bad), `overlayRows(${String(bad)})`);
    assert.ok(Array.isArray(collisions(bad)));
    assert.ok(Array.isArray(contexts(bad)));
    assert.ok(Array.isArray(overlayRows(bad)));
  }
  assert.deepEqual(collisions(KEYMAP.filter((r) => r.context === "threads")), []);
});
