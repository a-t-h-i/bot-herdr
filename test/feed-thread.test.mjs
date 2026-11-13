// The feed's threading: every turn in an agent's reply log reaches the chat, a log's history
// does not, and a run of child replies folds into one row.

import { test } from "node:test";
import assert from "node:assert/strict";
import { fileKey, logEntries, logNew, groupChildren, replyFile } from "../mods/bot-herdr/feed.js";

const line = (at, text, name = "Dev") => JSON.stringify({ at, name, text });
const LOG = [
  line("2026-11-13T10:00:00.000Z", "First turn"),
  line("2026-11-13T10:05:00.000Z", "Second turn"),
  line("2026-11-13T10:09:00.000Z", "Third turn"),
].join("\n");

test("feed log: the key of an address is its reply file's name", () => {
  assert.equal(fileKey("t4w"), "t4w");
  assert.equal(fileKey("host/t4w"), "host_t4w");
  assert.equal(fileKey("host\\t4w"), "host_t4w");
  assert.equal(replyFile("/o/replies", "host/t4w"), "/o/replies/host_t4w.md");
  assert.deepEqual(logEntries(LOG).map((l) => l.text), ["First turn", "Second turn", "Third turn"]);
  assert.deepEqual(logEntries(`${LOG}\n{"at":`).length, 3); // half a line the engine was still writing
  assert.deepEqual(logEntries("not json\n\n").length, 0);
});

test("feed log: a log never read before is history, not the feed", () => {
  const first = logNew(LOG, null);
  assert.deepEqual(first.entries, []);
  assert.equal(first.at, "2026-11-13T10:09:00.000Z");
  const empty = logNew("", null);
  assert.deepEqual(empty, { entries: [], at: null });
});

test("feed log: every turn after the last one seen, in order, and the newest time kept", () => {
  const got = logNew(LOG, "2026-11-13T10:00:00.000Z");
  assert.deepEqual(got.entries.map((l) => l.text), ["Second turn", "Third turn"]);
  assert.equal(got.at, "2026-11-13T10:09:00.000Z");
  // Nothing new: the same time comes back so the caller stores nothing twice.
  assert.deepEqual(logNew(LOG, got.at), { entries: [], at: "2026-11-13T10:09:00.000Z" });
  // An agent that took two turns between polls: both come back at once.
  assert.equal(logNew(LOG, "2026-11-13T09:59:00.000Z").entries.length, 3);
});

const entry = (id, from, kind = "agent", space = "s1") => ({ id, at: Date.now(), space, kind, text: id, from: { address: `a-${from}`, name: from } });
const child = (e) => e.kind === "agent" && e.from.name !== "Orchestrator";

test("feed groups: a run of child replies becomes one row, between your message and the lead's reply", () => {
  const list = [
    entry("me", "You", "me"),
    entry("d1", "Dev"),
    entry("q1", "QA"),
    entry("d2", "Dev"),
    entry("o1", "Orchestrator"),
    entry("note", "", "note"),
    entry("q2", "QA"),
  ];
  const out = groupChildren(list, child);
  assert.deepEqual(out.map((e) => e.kind), ["me", "kids", "agent", "note", "kids"]);
  assert.equal(out[1].id, "kids-d1");
  assert.deepEqual(out[1].children.map((e) => e.id), ["d1", "q1", "d2"]);
  assert.deepEqual(out[4].children.map((e) => e.id), ["q2"]); // one child still folds
  assert.equal(out[2].id, "o1"); // the Orchestrator's reply is a normal entry
  assert.equal(out[1].space, "s1"); // the group carries its space, as an entry does
});

test("feed groups: nothing to fold comes back as it was", () => {
  const list = [entry("me", "You", "me"), entry("o1", "Orchestrator")];
  assert.deepEqual(groupChildren(list, child), list);
  assert.deepEqual(groupChildren([], child), []);
  assert.deepEqual(groupChildren(null, child), []);
});
