// The skills an agent may use, in words: the search over skills and MCP servers, what the
// classifier picked for the running task, a step's skills line, and the supported harnesses.

import { test } from "node:test";
import assert from "node:assert/strict";
import { filterTools, newestActive, pickedFor, skillsLine, supportedNames } from "../mods/bot-herdr/skillsview.js";

test("filterTools: name or description, any case; empty query keeps all", () => {
  const items = [{ name: "pdf", description: "Read PDF files" }, { name: "xlsx", description: "Spreadsheets" }, { name: "Docs" }];
  assert.deepEqual(filterTools(items, "SHEET").map((t) => t.name), ["xlsx"]);
  assert.deepEqual(filterTools(items, "doc").map((t) => t.name), ["Docs"]);
  assert.equal(filterTools(items, "  ").length, 3);
  assert.deepEqual(filterTools(items, "zzz"), []);
});

test("pickedFor: no task, classifier off, and picked with added", () => {
  assert.deepEqual(pickedFor(null, "dev"), { kind: "none" });
  assert.deepEqual(pickedFor({ skills: { dev: { picked: null, added: [] } } }, "dev"), { kind: "off" });
  assert.deepEqual(pickedFor({ skills: {} }, "dev"), { kind: "off" });
  const got = pickedFor({ skills: { "sec-lead": { picked: ["pdf"], added: ["xlsx", "pdf"] } } }, "sec-lead");
  assert.deepEqual(got, { kind: "list", names: [{ name: "pdf", added: false }, { name: "xlsx", added: true }] });
});

test("newestActive: the latest updated active task", () => {
  const list = [
    { id: "a", status: "active", updated: "2026-11-19T10:00:00Z" },
    { id: "b", status: "done", updated: "2026-11-20T10:00:00Z" },
    { id: "c", status: "active", updated: "2026-11-20T09:00:00Z" },
  ];
  assert.equal(newestActive(list).id, "c");
  assert.equal(newestActive([]), null);
  assert.equal(newestActive(null), null);
});

test("skillsLine: pinned, picked and added, de-duplicated; none; fallback; absent", () => {
  assert.equal(skillsLine(undefined), null);
  assert.equal(skillsLine({ pinned: ["a"], picked: ["a", "b"], added: ["c"], fallback: false }), "Skills: a, b, c (added)");
  assert.equal(skillsLine({ pinned: [], picked: [], added: [], fallback: false }), "Skills: none");
  assert.equal(skillsLine({ pinned: ["a"], picked: [], added: [], fallback: true }), "Skills: a (fallback)");
});

test("supportedNames: a sentence of the supported ones, or null", () => {
  const list = [{ key: "claude", name: "Claude Code", supported: true }, { key: "codex", name: "Codex", supported: true }, { key: "pi", name: "pi", supported: false }, { key: "opencode", name: "OpenCode", supported: true }];
  assert.equal(supportedNames(list), "Claude Code, Codex and OpenCode");
  assert.equal(supportedNames([list[0]]), "Claude Code");
  assert.equal(supportedNames({ harness: "--list", supported: false }), null);
});
