import { test } from "node:test";
import assert from "node:assert/strict";
import {
  triggerAt, caretAfterEdit, slashRows, mentionRows, tokenFor, plan, orchestratorOf, withoutEnter, messageText,
} from "../mods/bot-herdr/route.js";

const claude = { address: "t1", space: "s1", space_name: "app", tab: "a", tab_name: "1", status: "idle", seq: 2, program: { key: "claude", name: "Claude Code", tile: "#d97757" } };
const codex = { address: "t2", space: "s1", space_name: "app", tab: "b", tab_name: "2", status: "working", seq: 5, program: { key: "codex", name: "Codex" } };
const far = { address: "vps/t7", space: "s2", space_name: "api", tab: "c", tab_name: "1", status: "blocked", seq: 9, program: { key: "pi", name: "pi" } };
const known = [
  { key: "claude", name: "Claude Code", run: ["claude"], installed: true },
  { key: "gemini", name: "Gemini", run: ["gemini"], installed: true },
  { key: "aider", name: "Aider", run: ["aider"], installed: false },
];

test("slash only at the start, mention anywhere after a space", () => {
  assert.deepEqual(triggerAt("/st", 3), { kind: "slash", query: "st", start: 0, end: 3 });
  assert.equal(triggerAt("hi /st", 6), null);
  assert.deepEqual(triggerAt("ask @cla", 8), { kind: "mention", query: "cla", start: 4, end: 8 });
  assert.equal(triggerAt("mail@x", 6), null);
  assert.equal(triggerAt("@cla more", 2), null);
  assert.deepEqual(triggerAt("@cla more", 4), { kind: "mention", query: "cla", start: 0, end: 4 });
});

test("caret is the end of the last edit", () => {
  assert.equal(caretAfterEdit("ab", "abc"), 3);
  assert.equal(caretAfterEdit("ac", "abc"), 2);
  assert.equal(caretAfterEdit("abc", "ac"), 1);
});

test("rows: commands rank by prefix; agents here first, then installed ones to start", () => {
  assert.equal(slashRows("st")[0].name, "stop");
  const rows = mentionRows("", { agents: [far, claude, codex], known, space: "s1" });
  assert.deepEqual(rows.map((r) => r.id), ["agent:t1", "agent:t2", "agent:vps/t7", "all", "start:claude", "start:gemini"]);
  assert.deepEqual(mentionRows("", { agents: [claude], known, space: "s1", mode: "start" }).map((r) => r.id), ["start:claude", "start:gemini"]);
  assert.equal(mentionRows("cod", { agents: [claude, codex], known, space: "s1" })[0].id, "agent:t2");
});

test("plain message goes to the default agent", () => {
  const r = plan({ text: "fix the bug", tokens: [] }, { agents: [claude, codex], target: "t1", space: "s1" });
  assert.deepEqual(r.steps, [{ do: "send", address: "t1", text: "fix the bug", files: [] }]);
});

test("mentions pick recipients and leave the words", () => {
  const text = "@codex look at this @claude too";
  const tokens = [
    { range: { start: 0, end: 6 }, token: tokenFor({ kind: "agent", id: "agent:t2", name: "codex", label: "Codex" }) },
    { range: { start: 20, end: 27 }, token: tokenFor({ kind: "agent", id: "agent:t1", name: "claude", label: "Claude Code" }) },
  ];
  const r = plan({ text, tokens }, { agents: [claude, codex], target: "t1", space: "s1" });
  assert.deepEqual(r.steps.map((s) => s.address), ["t2", "t1"]);
  assert.equal(r.steps[0].text, "look at this too");
});

test("@all and /all reach every agent in the space", () => {
  const r = plan({ text: "/all ship it", tokens: [] }, { agents: [claude, codex, far], target: "t1", space: "s1" });
  assert.deepEqual(r.steps.map((s) => s.address), ["t1", "t2"]);
  assert.equal(r.steps[0].text, "ship it");
  const typed = plan({ text: "ship it @all", tokens: [] }, { agents: [claude, codex], target: "t1", space: "s1" });
  assert.deepEqual(typed.steps.map((s) => s.address), ["t1", "t2"]);
});

test("start tokens open a new agent with the message", () => {
  const text = "@new-gemini write tests";
  const tokens = [{ range: { start: 0, end: 11 }, token: tokenFor({ kind: "start", id: "start:gemini", name: "new-gemini", label: "Gemini" }) }];
  const r = plan({ text, tokens }, { agents: [claude], known, target: "t1", space: "s1", files: ["/a.png"] });
  assert.deepEqual(r.steps, [{ do: "start", run: ["gemini"], name: "Gemini", text: "write tests", files: ["/a.png"] }]);
});

test("/stop and /peek act on the agent; other commands pass through", () => {
  assert.deepEqual(plan({ text: "/stop", tokens: [] }, { agents: [claude], target: "t1", space: "s1" }).steps, [{ do: "interrupt", address: "t1" }]);
  assert.deepEqual(plan({ text: "/peek", tokens: [] }, { agents: [claude], target: "t1", space: "s1" }).steps, [{ do: "peek", address: "t1" }]);
  assert.equal(plan({ text: "/compact", tokens: [] }, { agents: [claude], target: "t1", space: "s1" }).steps[0].text, "/compact");
});

test("no agent: a hint, not a silent drop", () => {
  assert.match(plan({ text: "hi", tokens: [] }, { agents: [], target: null, space: "s1" }).error, /No agent is installed/);
  assert.deepEqual(plan({ text: "  ", tokens: [] }, { agents: [claude], target: "t1", space: "s1" }).steps, []);
});

test("a plain message goes to the Orchestrator, starting one if there is none", () => {
  const lead = { ...codex, tab_name: "Orchestrator" };
  assert.equal(orchestratorOf([claude, lead, far], "s1").address, "t2");
  assert.equal(orchestratorOf([claude, codex], "s1"), null);
  assert.equal(orchestratorOf([{ ...far, tab_name: "orchestrator" }], "s1"), null);
  assert.equal(orchestratorOf([claude, { ...codex, tab_name: "Boss" }], "s1", "boss").address, "t2");
  const started = plan({ text: "build it", tokens: [] }, { agents: [claude], target: null, lead: known[0], space: "s1" });
  assert.deepEqual(started.steps, [{ do: "start", role: "orchestrator", run: ["claude"], name: "Claude Code", text: "build it", files: [] }]);
  const rows = mentionRows("", { agents: [claude, lead], known: [], space: "s1" });
  assert.deepEqual(rows.slice(0, 2).map((r) => `${r.id} ${r.name} ${r.tag}`), ["agent:t2 orchestrator lead", "agent:t1 claude agent"]);
  const named = mentionRows("", { agents: [claude, { ...codex, tab_name: "Boss" }], known: [], space: "s1", leadName: "Boss", names: { t1: "Reviewer" } });
  assert.deepEqual(named.slice(0, 2).map((r) => `${r.id} ${r.name} ${r.tag}`), ["agent:t2 boss lead", "agent:t1 reviewer agent"]);
});

test("Enter's newline comes out", () => {
  assert.equal(withoutEnter("ab\ncd", "abcd"), "abcd");
  assert.equal(withoutEnter("abcd\n", "abcd"), "abcd");
  assert.equal(messageText("look", ["/x.png", "/y"]), "look\n/x.png\n/y");
});

test("children sit under their parent in the @ list, and /team briefs", () => {
  const kids = [
    { address: "t5", parent: "t1", parentName: "Claude Code", name: "review", status: "working", program: { key: "pi", name: "pi" } },
    { address: "t6", parent: "t5", parentName: "review", name: "lint", status: "idle", program: { key: "pi", name: "pi" } },
  ];
  const rows = mentionRows("", { agents: [claude, codex], children: kids, known: [], space: "s1" });
  assert.deepEqual(rows.map((r) => r.id), ["agent:t1", "agent:t5", "agent:t6", "agent:t2", "all"]);
  assert.equal(rows[1].tag, "child");
  assert.match(rows[1].hint, /child of Claude Code · working/);
  assert.equal(mentionRows("rev", { agents: [claude], children: kids, space: "s1" })[0].id, "agent:t5");
  assert.deepEqual(plan({ text: "/team", tokens: [] }, { agents: [claude], target: "t1", space: "s1" }).steps, [{ do: "brief", address: "t1" }]);
});

test("no second Orchestrator while one starts; a bare /command needs someone to go to", () => {
  assert.match(plan({ text: "and this", tokens: [] }, { agents: [], target: null, lead: known[0], starting: true, space: "s1" }).error, /starting/);
  assert.match(plan({ text: "/compact", tokens: [] }, { agents: [], target: null, lead: known[0], space: "s1" }).error, /No Orchestrator here yet/);
});

test("a picked /command is a chip: it still acts, and the words after it go as typed", () => {
  const ctx = { agents: [], known: [], space: "s1", target: "t9", lead: null, files: [] };
  const content = { text: "/task add a health check", tokens: [{ range: { start: 0, end: 5 }, token: { id: "cmd:task", text: "/task" } }] };
  assert.deepEqual(plan(content, ctx).steps, [{ do: "send", address: "t9", text: "[task] add a health check", files: [] }]);
  assert.equal(slashRows("pl")[0].color, "#a47bd6");
  assert.deepEqual(tokenFor({ kind: "command", name: "plan" }), { id: "cmd:plan", text: "/plan", label: "/plan" });
});

test("/bh-knowledge asks Scout the words after it; bare, it gives the hint", () => {
  const ctx = { agents: [claude], space: "s1", target: "t1" };
  assert.deepEqual(plan({ text: "/bh-knowledge what is X", tokens: [] }, ctx), { steps: [{ do: "knowledge", question: "what is X" }] });
  const chip = { text: "/bh-knowledge what is X", tokens: [{ range: { start: 0, end: 13 }, token: { id: "cmd:bh-knowledge", text: "/bh-knowledge" } }] };
  assert.deepEqual(plan(chip, ctx), { steps: [{ do: "knowledge", question: "what is X" }] });
  assert.deepEqual(plan({ text: "/bh-knowledge", tokens: [] }, ctx), { error: "Type a question after /bh-knowledge" });
  assert.equal(slashRows("bh-k")[0].name, "bh-knowledge");
});
