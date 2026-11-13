// The agents rail: who is grouped where, in what order, for how long, and when it folds.

import { test } from "node:test";
import assert from "node:assert/strict";
import { groupOf, groups, order, elapsed, note, questionLine, workingCount, showsRail, GROUPS, RAIL_W, RAIL_GAP } from "../mods/bot-herdr/rail.js";
import { SIZE } from "../mods/bot-herdr/look.js";

const at = Date.UTC(2026, 10, 13, 12, 0, 0);
const agent = (name, extra = {}) => ({ address: name.toLowerCase(), name, lead: false, status: "idle", question: null, doing: null, since: null, ...extra });
const question = { id: "q-1", from: "dev", questions: [{ text: "Should child reports stay in the feed?\nSecond line" }] };
const ids = (list) => list.map((g) => [g.id, g.rows.map((r) => r.name)]);

test("rail: blocked and asked agents need you, working ones work, the rest wait", () => {
  assert.equal(groupOf("working", false), "working");
  assert.equal(groupOf("blocked", false), "needs");
  assert.equal(groupOf("idle", true), "needs"); // a question matters more than the reported status
  assert.equal(groupOf("working", true), "needs");
  assert.equal(groupOf("idle", false), "idle");
  assert.equal(groupOf(null, false), "idle"); // an agent that never reports a status
});

test("rail: the Orchestrator leads each group, then names in order, and empty groups are left out", () => {
  const list = [
    agent("Scout"),
    agent("Dev", { status: "working", doing: "Editing src/chat.js", since: at }),
    agent("Orchestrator", { lead: true, status: "working", doing: "Waiting on 3 children", since: at }),
    agent("QA", { status: "blocked" }),
    agent("Design", { status: "working", question }),
  ];
  const got = groups(list, at + 4 * 60000);
  assert.deepEqual(ids(got), [
    ["needs", ["Design", "QA"]],
    ["working", ["Orchestrator", "Dev"]],
    ["idle", ["Scout"]],
  ]);
  // A group with no rows is not drawn at all.
  const idleOnly = groups([agent("Scout")], at);
  assert.deepEqual(ids(idleOnly), [["idle", ["Scout"]]]);
  assert.deepEqual(GROUPS.map((g) => g.id), ["needs", "working", "idle"]);
  assert.deepEqual([agent("b", { name: "b" }), agent("B", { name: "B" })].sort(order).map((r) => r.name), ["b", "B"]);
});

test("rail: elapsed reads now, minutes, then hours and minutes", () => {
  assert.equal(elapsed(at, at + 59_000), "now");
  assert.equal(elapsed(at, at + 60_000), "1m");
  assert.equal(elapsed(at, at + 12 * 60000 + 30_000), "12m");
  assert.equal(elapsed(at, at + 65 * 60000), "1h 5m");
  assert.equal(elapsed(null, at), "now");
});

test("rail: the muted line is what it does and for how long, its question, or that it waits", () => {
  const [needs] = groups([agent("Design", { status: "working", question })], at);
  assert.equal(needs.rows[0].note, "Should child reports stay in the feed?");
  const [blocked] = groups([agent("QA", { status: "blocked" })], at);
  assert.equal(blocked.rows[0].note, "Needs you");
  const [working] = groups([agent("Dev", { status: "working", doing: "Editing src/chat.js", since: at })], at + 4 * 60000);
  assert.equal(working.rows[0].note, "Editing src/chat.js · 4m");
  const [idle] = groups([agent("Scout")], at);
  assert.equal(idle.rows[0].note, "Waiting for a task");
  assert.equal(note({ group: "working", doing: null, since: null }), "Working");
  assert.equal(questionLine({ title: "Questions" }), "Questions");
  assert.equal(workingCount([agent("Dev", { status: "working" }), agent("QA", { status: "blocked" }), agent("Scout")]), 1);
});

test("rail: it folds to its button when the chat column and the rail no longer fit", () => {
  const least = SIZE.maxWidth + SIZE.gutter * 2 + RAIL_GAP + RAIL_W;
  assert.equal(showsRail(least), true);
  assert.equal(showsRail(least - 1), false);
  assert.equal(showsRail(1200), true);
  assert.equal(showsRail(800), false);
});
