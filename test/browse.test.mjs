// The attach browser's pure pieces: path maths, the name filter and the multi-select set.

import { test } from "node:test";
import assert from "node:assert/strict";
import { baseName, parentPath, upFrom, filterEntries, togglePick, sizeText } from "../mods/bot-herdr/look.js";

test("parentPath: one folder up, both separators, roots have none", () => {
  assert.equal(parentPath("/home/ada/notes"), "/home/ada");
  assert.equal(parentPath("/home/"), "/");
  assert.equal(parentPath("/home"), "/");
  assert.equal(parentPath("/"), null);
  assert.equal(parentPath("C:\\Users\\ada\\notes"), "C:\\Users\\ada");
  assert.equal(parentPath("C:\\Users"), "C:\\");
  assert.equal(parentPath("C:\\"), null);
  assert.equal(parentPath("C:"), null);
  assert.equal(parentPath(""), null);
});

test("upFrom: up from a drive's foot is the drive list, roots have nothing above", () => {
  assert.equal(upFrom("C:\\"), ""); // "" is the drive list `bh files ""` lists
  assert.equal(upFrom("C:\\Users"), "C:\\");
  assert.equal(upFrom(""), null);
  assert.equal(upFrom("/"), null);
});

test("baseName: the last segment, trailing separators ignored", () => {
  assert.equal(baseName("/home/ada/notes.txt"), "notes.txt");
  assert.equal(baseName("C:\\Users\\ada\\"), "ada");
  assert.equal(baseName("C:\\"), "C:");
  assert.equal(baseName(""), "");
});

test("filterEntries: case-insensitive substring of the name, order kept", () => {
  const entries = [
    { name: "Docs", dir: true, path: "/p/Docs" },
    { name: "report.md", dir: false, path: "/p/report.md" },
    { name: "Notes.txt", dir: false, path: "/p/Notes.txt" },
  ];
  assert.deepEqual(filterEntries(entries, "").map((e) => e.name), ["Docs", "report.md", "Notes.txt"]);
  assert.deepEqual(filterEntries(entries, "  ").map((e) => e.name), ["Docs", "report.md", "Notes.txt"]);
  assert.deepEqual(filterEntries(entries, "NO").map((e) => e.name), ["Notes.txt"]);
  assert.deepEqual(filterEntries(entries, "o").map((e) => e.name), ["Docs", "report.md", "Notes.txt"]);
  assert.deepEqual(filterEntries(entries, "zzz"), []);
});

test("sizeText: bytes, kilobytes and megabytes, and nothing for rubbish", () => {
  assert.equal(sizeText(0), "0 B");
  assert.equal(sizeText(999), "999 B");
  assert.equal(sizeText(1200), "1 KB");
  assert.equal(sizeText(12345), "12 KB");
  assert.equal(sizeText(3456789), "3.5 MB");
  assert.equal(sizeText(null), "");
  assert.equal(sizeText("x"), "");
});

test("togglePick: adds, removes, leaves the input set alone", () => {
  const start = new Set();
  const one = togglePick(start, "/a");
  assert.deepEqual([...one], ["/a"]);
  assert.deepEqual([...start], []);
  const none = togglePick(one, "/a");
  assert.deepEqual([...none], []);
  const two = togglePick(togglePick(none, "/a"), "/b");
  assert.deepEqual([...two].sort(), ["/a", "/b"]);
});
