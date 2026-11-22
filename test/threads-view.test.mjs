// The thread list, the thread view's parts, the goal row, the peek and the status bar, as the
// views read them (threadview.js), and the audit's pages for them (ui-audit REPLACES).

import { test } from "node:test";
import assert from "node:assert/strict";

import * as TV from "../mods/bot-herdr/threadview.js";
import { REPLACES } from "../mods/bot-herdr/engine/lib/ui-audit.mjs";
import { AUDIT_PAGES } from "../mods/bot-herdr/engine/lib/ui-audit-fixtures.mjs";

const LIST = {
  threads: [
    { id: "t-done", title: "Shipped", state: "done", agents: ["dev"], steps: { done: 3, total: 3 }, age: "2d" },
    { id: "t-work", title: "Quiet pass", state: "working", agents: ["dev", "qa"], steps: { done: 1, total: 4 }, age: "1h", summary: { text: "Editing look.js" } },
    { id: "t-need", title: "Pick a harness", state: "needsYou", agents: ["qa"], steps: { done: 0, total: 2 }, age: "5m" },
    { id: "p-plan", kind: "plan", title: "Fold machine text", state: "idle", agents: [], steps: { done: 0, total: 0 } },
  ],
};

test("the thread list groups by state with Needs you first, and J/K walk it in drawn order", () => {
  const groups = TV.groupThreads(TV.threadRows(LIST));
  assert.deepEqual(groups.map((g) => g.label), ["Needs you", "Working", "Done", "Idle"]);
  assert.deepEqual(TV.drawnOrder(groups).map((r) => r.id), ["t-need", "t-work", "t-done", "p-plan"]);
  const plan = TV.threadRows(LIST).find((r) => r.id === "p-plan");
  assert.equal(plan.kind, "plan", "a plan that is not a task is a thread too");
  assert.equal(plan.steps, "", "no 0/0 count is drawn");
  assert.equal(TV.threadRows(LIST).find((r) => r.id === "t-work").summary, "Editing look.js");
});

test("search and the one state filter narrow the list; counts leave zeros out", () => {
  const rows = TV.threadRows(LIST);
  assert.deepEqual(TV.drawnOrder(TV.groupThreads(rows, { query: "qa" })).map((r) => r.id), ["t-need", "t-work"]);
  assert.deepEqual(TV.drawnOrder(TV.groupThreads(rows, { state: "done" })).map((r) => r.id), ["t-done"]);
  assert.deepEqual(TV.stateCounts(rows), { done: 1, working: 1, needsYou: 1, idle: 1 });
});

test("a thread's breadcrumb and sub-tabs: Conversation | Plan | Steps | Changes", () => {
  assert.deepEqual(TV.SUB_TABS.map((t) => t.label), ["Conversation", "Plan", "Steps", "Changes"]);
  assert.deepEqual(TV.breadcrumb("Quiet pass", "plan"), ["Threads", "Quiet pass", "Plan"]);
  assert.deepEqual(TV.breadcrumb("Orchestrator", null), ["Threads", "Orchestrator"]);
  assert.equal(TV.subOrDefault("board"), "conversation");
});

test("a board entry shows its type word, author and first line, and knows when it expands", () => {
  const [e] = TV.conversation({ conversation: { entries: [{ kind: "board", boardKind: "contract", from: "Orchestrator", text: "{\n  \"a\": 1\n}", at: "2026-11-21T00:00:00Z", ref: "#1" }] } });
  assert.equal(e.word, "contract");
  assert.equal(e.from, "Orchestrator");
  assert.equal(e.first, '{ "a": 1 }', "a JSON contract reads as its folded text, not a lone brace");
  assert.equal(e.more, true);
  const [one] = TV.conversation({ conversation: { entries: [{ kind: "reply", from: "dev", text: "Done." }] } });
  assert.equal(one.more, false);
});

test("the goal row: gate, elapsed, retries left and the judge's reason; nothing for a plain task", () => {
  const g = TV.goalRowModel({ isGoal: true, task: "t-1", gate: { passed: 6, total: 6, reached: true }, elapsed: "2h", retries: { cap: 3, left: 1 }, lastReason: "All checks pass.\nDetails follow." });
  assert.deepEqual(TV.goalRowParts(g), ["Gate reached 6/6", "2h", "1 retry left"]);
  assert.equal(g.reason, "All checks pass.");
  assert.equal(TV.goalRowModel({ isGoal: false }), null);
  assert.equal(TV.goalRowModel({ isGoal: true, status: "paused" }).paused, true);
});

test("the peek: 1–9 pick an option, the reply goes to the agent named, cost lives here", () => {
  const m = TV.peekModel({ title: "T", state: "needsYou", question: { text: "Which?", options: ["A", { label: "B" }] }, replyTarget: { name: "qa-1", address: "t9r" }, cost: { costUsd: 1.5 } });
  assert.deepEqual(m.question.options, ["A", "B"]);
  assert.equal(TV.optionForKey("2", m.question.options.length), 1);
  assert.equal(TV.optionForKey("3", m.question.options.length), -1);
  assert.equal(TV.optionForKey("0", 9), -1);
  assert.deepEqual(m.reply, { address: "t9r", name: "qa-1" });
  const agent = TV.peekModel(null, { name: "dev-m1", address: "t7a", harness: "pi", state: "working", summary: "Editing" });
  assert.equal(agent.harness, "pi");
  assert.deepEqual(agent.reply, { address: "t7a", name: "dev-m1" });
  assert.equal(TV.costLine({ costUsd: 1.5, tokens: 2000, minutes: 3 }, { price: (n) => `$${n}`, compact: (n) => `${n / 1000}K`, duration: (ms) => `${ms / 60000}m` }), "$1.5 · 2K tokens · 3m");
});

test("the status bar: machine, branch, agent count and the palette key, nothing else", () => {
  assert.deepEqual(TV.statusModel({ machine: "vps", branch: "main" }, [{}, {}]), { machine: "vps", branch: "main", agents: "2 agents" });
  assert.deepEqual(TV.statusModel(null, [{}]), { machine: "This computer", branch: "", agents: "1 agent" });
  assert.equal(TV.paletteHint({ keys: "ctrl-shift-p" }), "Ctrl+Shift+P  commands");
  assert.equal(TV.paletteHint(null), "commands");
});

test("the audit renders every thread page and the peek, each against the M1 pages it replaces", () => {
  const ids = AUDIT_PAGES.map((p) => p.id);
  for (const id of ["threads", "thread-chat", "thread-conversation", "thread-plan", "thread-steps", "thread-changes", "peek"]) {
    assert.ok(ids.includes(id), `${id} is audited`);
    assert.ok(Array.isArray(REPLACES[id]) && REPLACES[id].length > 0, `${id} has an M1 baseline to come under`);
  }
  assert.deepEqual(REPLACES.threads, ["tasks", "plans"]);
  assert.deepEqual(REPLACES["thread-conversation"], ["chat", "tasks-board"]);
});
