import { test } from "node:test";
import assert from "node:assert/strict";
import { roster, argvOf, runnable, runningAs, effortsOf, blank, slug } from "../mods/bot-herdr/roster.js";
import { replyFile, push, shown, isNew, outcome, KEEP, SHOWN } from "../mods/bot-herdr/feed.js";
import { teamBrief, orchestratorBrief } from "../mods/bot-herdr/brief.js";

const known = [
  { key: "claude", name: "Claude Code", run: ["claude"], installed: true },
  { key: "codex", name: "Codex", run: ["codex"], installed: true },
  { key: "pi", name: "pi", run: ["pi"], installed: false },
];

test("with nothing set up there is one Orchestrator on the first installed harness", () => {
  assert.deepEqual(roster(undefined, known), [{ id: "orchestrator", name: "Orchestrator", harness: "claude", model: "", effort: "", args: "", lead: true }]);
  assert.equal(roster(null, [])[0].harness, "claude");
});

test("exactly one agent leads", () => {
  const two = roster([{ id: "a", name: "A", harness: "codex" }, { id: "b", name: "B", harness: "claude" }], known);
  assert.deepEqual(two.map((a) => a.lead), [true, false]);
  const both = roster([{ id: "a", name: "A", lead: true }, { id: "b", name: "B", lead: true }], known);
  assert.deepEqual(both.map((a) => a.lead), [true, false]);
  assert.deepEqual(roster([{ id: "a", name: "A" }, { id: "b", name: "B", lead: true }], known).map((a) => a.lead), [false, true]);
});

test("the command carries the model, the effort and the extra arguments in each harness's own flags", () => {
  assert.deepEqual(argvOf({ harness: "claude", model: "opus", effort: "high", args: "" }, known), ["claude", "--model", "opus", "--effort", "high"]);
  assert.deepEqual(argvOf({ harness: "codex", model: "gpt-5", effort: "low", args: "--search" }, known), ["codex", "-m", "gpt-5", "-c", "model_reasoning_effort=low", "--search"]);
  assert.deepEqual(argvOf({ harness: "pi", model: "", effort: "off", args: "" }, known), ["pi", "--thinking", "off"]);
  // A level the harness doesn't have, or a harness with no effort flag, adds nothing.
  assert.deepEqual(argvOf({ harness: "codex", model: "", effort: "max", args: "" }, known), ["codex"]);
  assert.deepEqual(argvOf({ harness: "aider", model: "x", effort: "high", args: "" }, known), ["aider", "--model", "x"]);
  assert.deepEqual(effortsOf("gemini"), []);
});

test("installed, running, new and named", () => {
  assert.equal(runnable({ harness: "codex" }, known), true);
  assert.equal(runnable({ harness: "pi" }, known), false);
  const agents = [{ address: "t1", space: "s1", tab_name: "Reviewer", seq: 3 }, { address: "t2", space: "s2", tab_name: "reviewer", seq: 1 }];
  assert.equal(runningAs({ name: "reviewer" }, agents, "s1").address, "t1");
  assert.equal(runningAs({ name: "Coder" }, agents, "s1"), null);
  const next = blank([{ name: "Agent 2" }], known);
  assert.equal(next.name, "Agent 3");
  assert.equal(next.harness, "claude");
  assert.equal(slug(" Code Reviewer! "), "code-reviewer");
});

test("the brief names the person's agents and where to write the reply", () => {
  const b = teamBrief({ known, roster: [{ name: "Reviewer", command: "codex -m gpt-5" }], outbox: "/h/replies" });
  assert.match(b, /Reviewer = `codex -m gpt-5`/);
  assert.match(b, /`\/h\/replies\/<your terminal address>\.md`/);
  assert.match(b, /HC_TERMINAL_ID/);
  assert.doesNotMatch(teamBrief({ known }), /Replying to the person/);
  assert.match(orchestratorBrief({ known, outbox: "/h/replies" }), /Replying to the person/);
});

test("the feed: reply files, what is kept and what is shown", () => {
  assert.equal(replyFile("/h/replies", "vps/t7"), "/h/replies/vps_t7.md");
  assert.equal(isNew("done", undefined), true);
  assert.equal(isNew("done", "done"), false);
  assert.equal(isNew("  \n", undefined), false);
  assert.equal(isNew(null, undefined), false);
  let entries = [];
  for (let i = 0; i < KEEP + 5; i++) entries = push(entries, { at: i, space: i % 2 ? "s1" : "s2", text: String(i) });
  assert.equal(entries.length, KEEP);
  const view = shown(entries, "s1", 0);
  assert.equal(view.list.length, SHOWN);
  assert.equal(view.list.at(-1).text, String(KEEP + 3));
  assert.equal(shown(entries, "s1", 2).list.at(-1).text, String(KEEP - 1));
  assert.equal(shown(entries, "s1", 9999).list.length, 1);
  assert.deepEqual(shown([], "s1", 3), { list: [], total: 0, back: 0 });
});

test("an agent we wrote to: waiting, blocked once, silent after it worked and stopped", () => {
  assert.equal(outcome({ worked: false }, "idle", 1000), "wait");
  assert.equal(outcome({ worked: true, stopped: 1000 }, "working", 2000), "wait");
  assert.equal(outcome({ worked: true, stopped: 1000 }, "idle", 5000), "wait");
  assert.equal(outcome({ worked: true, stopped: 1000 }, "done", 9500), "silent");
  assert.equal(outcome({ blocked: false }, "blocked", 0), "blocked");
  assert.equal(outcome({ blocked: true }, "blocked", 0), "wait");
  assert.equal(outcome({}, null, 0), "gone");
});
