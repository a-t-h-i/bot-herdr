// The task tracker's model: the steps of a task, in today's JSON and in step 14's, its events,
// the word an agent's tool line becomes, and when a finished task folds.

import { test } from "node:test";
import assert from "node:assert/strict";
import { stepAgents, actionWord, stepTime, stepEvents, trackerModel, trackerFolds, taskRows, usageText } from "../mods/bot-herdr/steps.js";

const now = Date.parse("2026-11-13T10:20:00.000Z");
const today = {
  id: "t1",
  title: "Make it work",
  status: "active",
  worked: 90 * 60000,
  steps: [
    { n: 1, title: "Read", agent: "dev", status: "done", workedMs: 8000, report: { file: "reports/dev.md", summary: "Did it", from: "dev", at: "2026-11-13T10:05:00.000Z" } },
    { n: 2, title: "Patch", agent: "dev, qa", status: "active", workedMs: 52000, started: null },
    { n: 3, title: "Approve", agent: "qa", status: "blocked" },
    { n: 4, title: "Ship", agent: null, status: "todo" },
  ],
  board: [
    { n: 1, at: "2026-11-13T10:04:00.000Z", kind: "note", from: "dev", text: "Started on it", step: 2 },
    { n: 2, at: "2026-11-13T10:06:00.000Z", kind: "done", from: "dev", text: "It is done", step: 1 },
    { n: 3, at: "2026-11-13T10:07:00.000Z", kind: "note", from: "qa", text: "On the task, not a step" },
  ],
};
const next = {
  id: "t2",
  title: "Next",
  status: "active",
  done: 2,
  total: 3,
  steps: [
    { n: 1, title: "A", status: "done", agentName: "Dev", elapsedMs: 8000, events: [{ at: "2026-11-13T10:01:00.000Z", kind: "check", text: "Checks passed", detail: "205 tests" }] },
    { n: 2, title: "B", status: "active", agentName: "QA", elapsedMs: 65000, events: [] },
    { n: 3, title: "C", status: "todo", agentName: null },
  ],
};

test("tracker: today's JSON gives steps, times, done/total and the agents at work", () => {
  const m = trackerModel(today, { now });
  assert.equal(m.title, "Make it work");
  assert.deepEqual([m.done, m.total], [1, 4]);
  assert.deepEqual(m.working, ["dev"]);
  assert.equal(m.steps[0].time, "8s");
  assert.equal(m.steps[1].time, "52s");
  assert.equal(m.steps[1].agentName, "dev"); // the first of "dev, qa"
  assert.equal(m.steps[2].needs, true); // blocked
  assert.equal(m.steps[3].agentName, null);
  assert.equal(m.time, "1h 30m");
});

test("tracker: a step's time is its recorded time, not a clock from when it started", () => {
  const step = { n: 1, agent: "dev", status: "active", timeMs: 120000, started: "2026-11-13T09:20:00.000Z" };
  const m = trackerModel({ ...today, steps: [step] }, { now });
  assert.equal(m.steps[0].time, "2m"); // its start was an hour ago, and no agent works now
});

test("tracker: a step whose agent works now adds the part of that turn", () => {
  const step = { n: 1, agent: "dev", status: "active", timeMs: 120000, started: "2026-11-13T09:20:00.000Z" };
  const m = trackerModel({ ...today, steps: [step] }, { now, working: { dev: now - 60000 } });
  assert.equal(m.steps[0].time, "3m");
  // The same agent's finished step keeps its record: that turn belongs to the active step.
  const done = { n: 2, agent: "dev", status: "done", timeMs: 60000 };
  const both = trackerModel({ ...today, steps: [step, done] }, { now, working: { dev: now - 60000 } });
  assert.equal(both.steps[1].time, "1m");
});

test("tracker: an older engine's step uses its workedMs and does not grow", () => {
  const step = { n: 1, agent: "dev", status: "active", workedMs: 52000, started: "2026-11-13T09:20:00.000Z" };
  const m = trackerModel({ ...today, steps: [step] }, { now });
  assert.equal(m.steps[0].time, "52s");
});

test("tracker: a step's events are its report and the board posts on it, oldest first", () => {
  const m = trackerModel(today, { now });
  assert.deepEqual(m.steps[0].events.map((e) => [e.kind, e.text, e.detail, e.from]), [
    ["report", "Did it", "reports/dev.md", "dev"],
    ["board", "It is done", "done", "dev"],
  ]);
  assert.deepEqual(m.steps[1].events.map((e) => e.kind), ["board"]);
  assert.deepEqual(m.steps[2].events, []);
  assert.deepEqual(stepEvents({ n: 9 }, today.board), []);
});

test("tracker: step 14's JSON is read as it is, events included", () => {
  const m = trackerModel(next, { now, asking: ["qa"] });
  assert.deepEqual([m.done, m.total], [2, 3]); // the task's own counts
  assert.deepEqual(m.steps[0].events.map((e) => e.kind), ["check"]);
  assert.equal(m.steps[0].time, "8s");
  assert.equal(m.steps[1].time, "1m");
  assert.equal(m.steps[1].needs, true); // its agent has a question open
  assert.equal(m.steps[0].needs, false);
  assert.equal(m.steps[2].needs, false);
});

test("tracker: a task's or step's usage is tokens, cost and minutes, its zero parts left out", () => {
  assert.equal(usageText({ tokens: 12400, costUsd: 1.2345, minutes: 38 }), "12.4k tokens · $1.23 · 38 min");
  assert.equal(usageText({ tokens: 12400, costUsd: 0, minutes: 38 }), "12.4k tokens · 38 min");
  assert.equal(usageText({ tokens: 850, costUsd: 0.5, minutes: 0 }), "850 tokens · $0.50");
  // A harness that reports minutes only: no tokens, no cost.
  assert.equal(usageText({ tokens: 0, costUsd: 0, minutes: 38 }), "38 min");
  // Nothing used, or an older engine that has no usage at all.
  assert.equal(usageText({ tokens: 0, costUsd: 0, minutes: 0 }), "");
  assert.equal(usageText(undefined), "");
  assert.equal(usageText({}), "");
});

test("tracker: the task's usage reaches the card, and is null without one", () => {
  const usage = { tokens: 12400, costUsd: 1.23, minutes: 38 };
  assert.deepEqual(trackerModel({ ...today, usage }, { now }).usage, usage);
  assert.equal(trackerModel(today, { now }).usage, null);
});

test("tracker: a finished task folds to one line; an active one does not", () => {
  assert.equal(trackerFolds({ status: "done" }), true);
  assert.equal(trackerFolds({ status: "abandoned" }), true);
  assert.equal(trackerFolds({ status: "active" }), false);
  assert.equal(trackerFolds({ status: "paused" }), false);
  assert.equal(trackerFolds(null), false);
});

test("tracker: an agent's tool line becomes one word", () => {
  assert.equal(actionWord("Edit src/chat.js"), "Editing");
  assert.equal(actionWord("Write README.md"), "Editing");
  assert.equal(actionWord("Run npm test"), "Running tests");
  assert.equal(actionWord("Bash vitest run"), "Running tests");
  assert.equal(actionWord("Run node server.js"), "Running");
  assert.equal(actionWord("Run node scripts/check.mjs"), "Running tests"); // a check script counts
  assert.equal(actionWord("Read src/chat.js"), "Reading");
  assert.equal(actionWord("Search board"), "Reading");
  assert.equal(actionWord("Find **/*.ts"), "Reading");
  assert.equal(actionWord("Fetch https://example.com"), "Working");
  assert.equal(actionWord(""), "Working");
});

test("tracker: step times, the step's agents, and the rail's task rows", () => {
  assert.equal(stepTime(0), "");
  assert.equal(stepTime(800), "");
  assert.equal(stepTime(8000), "8s");
  assert.equal(stepTime(65 * 60000), "1h 5m");
  assert.deepEqual(stepAgents({ agent: "design-toast & qa" }), ["design-toast", "qa"]);
  assert.deepEqual(stepAgents({ agent: ["dev", "qa"] }), ["dev", "qa"]);
  assert.deepEqual(stepAgents({}), []);
  assert.deepEqual(taskRows([today, next], now).map((r) => [r.id, r.done, r.total]), [["t1", 1, 4], ["t2", 2, 3]]);
  assert.deepEqual(taskRows(null), []);
});
