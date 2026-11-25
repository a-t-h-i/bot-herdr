// The Agents graph's pure geometry (agentsgraphlayout.js): who is on each chain, where nodes and
// edges go side by side and stacked, the travelling dot, and the bench's equal-width cards.

import { test } from "node:test";
import assert from "node:assert/strict";
import { GRAPH, CYCLE_TICKS, roleKey, actionOf, relativeTo, chainOf, graphLayout, pointAt, dotProgress, benchGrid } from "../mods/bot-herdr/agentsgraphlayout.js";

const fleet = [
  { name: "design-graph", role: "design", state: "working", summary: "Edit chat.js", address: "t68" },
  { name: "dev-names", state: "working", summary: "Run npm test", address: "t67" },
];
const task = { id: "t-1", title: "Graph", state: "working", agents: ["design-graph", "dev-names"] };
const detail = { steps: [
  { agent: "design-graph", status: "done", title: "Layout" },
  { agent: "design-x", status: "active", title: "Styling", text: "Styling is done" },
  { agent: "dev-names", status: "active", title: "Names", text: "Names read well" },
] };

test("roleKey takes the role, else the name's first word", () => {
  assert.equal(roleKey({ name: "x", role: "qa" }), "qa");
  assert.equal(roleKey({ name: "Design-Graph" }), "design");
  assert.equal(roleKey("scout_2"), "scout");
  assert.equal(roleKey({ name: "dev", role: "custom" }), "dev");
});

test("actionOf lower-cases, drops state words and shortens", () => {
  assert.equal(actionOf("Edit chat.js"), "edit chat.js");
  assert.equal(actionOf("Working"), "");
  assert.equal(actionOf("Run a very long command that goes on and on").length, 24);
});

test("relativeTo says a folder from the project", () => {
  assert.equal(relativeTo("C:\\p\\mods\\bot", "C:\\p"), "mods\\bot");
  assert.equal(relativeTo("C:\\P\\", "c:\\p"), ".");
  assert.equal(relativeTo("/home/x", "/srv"), "/home/x");
  assert.equal(relativeTo("", "/srv"), "");
});

test("chainOf: the first agent leads, the working one works, the lead's steps are pills", () => {
  const ch = chainOf(task, fleet, detail);
  assert.equal(ch.lead.name, "design-graph");
  assert.equal(ch.worker.name, "dev-names");
  assert.deepEqual(ch.pills, ["Layout", "Styling"]);
  assert.equal(ch.done, "Names read well");
  assert.equal(ch.feeding, 2);
});

test("chainOf: one agent on a task has no lead, and no detail means no pills or step", () => {
  const ch = chainOf({ ...task, agents: ["dev-names"] }, fleet);
  assert.equal(ch.lead, null);
  assert.equal(ch.worker.name, "dev-names");
  assert.deepEqual(ch.pills, []);
  assert.equal(ch.done, "");
});

test("chainOf: a not-running agent is a bare name, and fleet agents on the task join it", () => {
  const ch = chainOf({ id: "t-2", agents: ["qa"] }, [{ name: "scout", task: "t-2", state: "working" }]);
  assert.deepEqual(ch.names, ["qa", "scout"]);
  assert.deepEqual(ch.lead, { name: "qa" });
  assert.equal(ch.worker.name, "scout");
});

test("graphLayout side by side: nodes left to right on one line, edges joining them", () => {
  const ch = chainOf(task, fleet, detail);
  const g = graphLayout([ch, ch], 1200);
  assert.equal(g.mode, "row");
  const row = ["orch", "lead-0", "worker-0", "card-0"].map((id) => g.nodes.find((n) => n.id === id));
  for (let i = 1; i < row.length; i++) assert.ok(row[i].x >= row[i - 1].x + row[i - 1].w + GRAPH.edgeMin - 1);
  assert.ok(row.at(-1).x + row.at(-1).w <= 1200 - GRAPH.pad + 0.5, "fits the card");
  const kinds = g.edges.filter((e) => e.chain === 0).map((e) => e.kind);
  assert.deepEqual(kinds, ["brief", "plan", "action", "reports"]);
  assert.equal(g.pills.filter((p) => p.chain === 0).length, 2);
  const second = g.nodes.find((n) => n.id === "lead-1");
  assert.ok(second.y > g.edges.find((e) => e.id === "reports-0").points[1][1], "the next chain sits under the first's reports-back line");
  assert.ok(g.height > second.y + second.h);
});

test("graphLayout: the reports-back edge runs card → down → left → up into the Orchestrator", () => {
  const g = graphLayout([chainOf(task, fleet)], 1200);
  const orch = g.nodes.find((n) => n.id === "orch");
  const r = g.edges.find((e) => e.kind === "reports").points;
  assert.equal(r.length, 4);
  assert.equal(r[3][0], orch.x + orch.w / 2);
  assert.equal(r[3][1], orch.y + orch.h);
  assert.equal(r[1][1], r[2][1]);
});

test("graphLayout stacks when narrow or asked, and skips the lead's edge with one agent", () => {
  const ch = chainOf({ ...task, agents: ["dev-names"] }, fleet);
  const g = graphLayout([ch], 500);
  assert.equal(g.mode, "stack");
  assert.equal(graphLayout([ch], 1200, { stack: true }).mode, "stack");
  assert.deepEqual(g.edges.map((e) => e.kind), ["brief", "action"]);
  const [w, card] = [g.nodes.find((n) => n.kind === "worker"), g.nodes.find((n) => n.kind === "card")];
  assert.ok(card.y > w.y + w.h);
});

test("graphLayout with no tasks draws the Orchestrator alone", () => {
  const g = graphLayout([], 1200);
  assert.deepEqual(g.nodes.map((n) => n.kind), ["orch"]);
  assert.equal(g.edges.length, 0);
});

test("pointAt walks a polyline by length", () => {
  const pts = [[0, 0], [10, 0], [10, 10]];
  assert.deepEqual(pointAt(pts, 0), [0, 0]);
  assert.deepEqual(pointAt(pts, 0.5), [10, 0]);
  assert.deepEqual(pointAt(pts, 0.75), [10, 5]);
  assert.deepEqual(pointAt(pts, 1), [10, 10]);
});

test("dotProgress loops every cycle, and rests mid-edge with reduced motion", () => {
  assert.equal(dotProgress(0), 0);
  assert.equal(dotProgress(CYCLE_TICKS / 2), 0.5);
  assert.equal(dotProgress(CYCLE_TICKS + 1), 1 / CYCLE_TICKS);
  assert.equal(dotProgress(7, true), 0.5);
});

test("benchGrid shares a row in equal widths, wrapping before a card gets too narrow", () => {
  assert.deepEqual(benchGrid(1000, 5), { cols: 5, w: 190 });
  assert.equal(benchGrid(400, 5).cols, 2);
  assert.deepEqual(benchGrid(400, 0), { cols: 0, w: 0 });
});
