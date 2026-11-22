// The Thread read model behind the redesign's Threads page: one task is one thread (a plan that
// became a task merges into it), its state comes from what the task already holds, and its four
// parts (conversation, plan, steps, changes) are derived from the stores on disk. Corrupt or
// legacy records are skipped with a logged entry, never thrown. Every folder is a temp one.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const tmp = mkdtempSync(join(tmpdir(), "bh-thread-"));
const APP = join(tmp, "app");
const PROJECT = join(tmp, "project");
const EMPTY = join(tmp, "empty");
mkdirSync(PROJECT, { recursive: true });
mkdirSync(EMPTY, { recursive: true });
process.env.BH_APP_HOME = APP;
process.env.HC_TERMINAL_ID = "";
process.env.BH_AGENT = "";

after(() => {
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {}
});

const BH = fileURLToPath(new URL("../mods/bot-herdr/engine/bh.mjs", import.meta.url));
const lib = (name) => import(new URL(`../mods/bot-herdr/engine/${name}`, import.meta.url));

// herdr stands in as a script (`BH_HC`): one live agent, and one finished one whose reply is kept.
const TERMINALS = [
  { address: "t11", name: "dev-1", agent: "pi", state: "live", status: "working", cwd: PROJECT },
  { address: "t12", name: "dev-old", agent: "pi", state: "exited", status: "idle", cwd: PROJECT },
];
const HC = join(tmp, "hc.mjs");
writeFileSync(HC, `console.log(JSON.stringify({ hidden_finished: 0, terminals: ${JSON.stringify(TERMINALS)} }));\n`);
process.env.BH_HC = HC;

const env = () => ({ ...process.env, BH_APP_HOME: APP, XDG_CONFIG_HOME: join(tmp, "xdg"), BH_HC: HC, HC_TERMINAL_ID: "", BH_AGENT: "" });

const dataFile = (name, value) => {
  const file = join(APP, "data", "bot-herdr", name);
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
};

const later = (mins = 1) => new Date(Date.now() + mins * 60_000).toISOString();
const COMMENT_AT = later(1);
const COMMENT_AT_PLAN = later(2);
const ACTIVITY_AT = later(6);

const T = await lib("lib/tasks.mjs");
const P = await lib("lib/plans.mjs");
const Th = await lib("lib/thread.mjs");

/** One task with two done steps, an open comment and a board post: the normal thread. */
function normalTask() {
  const task = T.newTask(PROJECT, { request: "Build the thread model", title: "Thread model", track: "full", steps: ["Read the stores", "Derive the states", "Write it up"] });
  T.updateTask(PROJECT, task.id, (t) => {
    T.moveStep(t, 1, "done");
    T.moveStep(t, 2, "start", { agent: "dev-1" });
    t.comments = [{ id: "c1", step: null, quote: "", text: "Also show the cost in the peek", at: COMMENT_AT, open: true }];
  });
  T.post(PROJECT, task.id, { kind: "note", from: "dev-1", text: "The stores read cleanly" });
  return T.loadTask(PROJECT, task.id);
}

const work = normalTask();
const merged = P.newPlan(PROJECT, { idea: "A plan that becomes a task", title: "Became a task" });
merged.status = "task";
merged.task = work.id;
P.savePlan(PROJECT, merged);
T.updateTask(PROJECT, work.id, (t) => {
  t.plan = merged.id;
});
const planning = P.newPlan(PROJECT, { idea: "A plan still being planned", title: "Still planning" });
planning.comments = [{ id: "c1", line: null, quote: "", text: "Make it calmer", at: COMMENT_AT_PLAN, open: true }];
P.savePlan(PROJECT, planning);

// A finished child answers in the chat, and the live agent says where it is right now.
T.updateTask(PROJECT, work.id, (t) => {
  t.children = [{ name: "dev-old", agent: "dev", step: 1, state: "merged", mergedAt: later(3) }];
});
mkdirSync(join(APP, "data", "bot-herdr", "replies"), { recursive: true });
writeFileSync(join(APP, "data", "bot-herdr", "replies", "t12.jsonl"), [
  JSON.stringify({ id: "r1", at: later(4), kind: "reply", name: "dev-old", text: "Step one is done" }),
  JSON.stringify({ id: "r2", at: later(5), kind: "reply", name: "someone-else", text: "Not this thread" }),
].join("\n"));
dataFile("activity/t11.json", { line: "Editing thread.mjs", at: ACTIVITY_AT });

test("thread list: one task is one thread, and a plan that became a task merges into it", async () => {
  const { threads } = Th.listThreads(PROJECT);
  const ids = threads.map((t) => t.id);
  assert.ok(ids.includes(work.id), "the task thread is listed");
  assert.ok(ids.includes(planning.id), "a plan still being planned is its own thread");
  assert.ok(!ids.includes(merged.id), "the plan that became the task is that thread, not another");
  assert.equal(ids.length, new Set(ids).size, "every thread id is unique");
});

test("thread list rows are the quiet form: state, agents, steps, age and a summary, no cost", async () => {
  const { threads } = Th.listThreads(PROJECT);
  const row = threads.find((t) => t.id === work.id);
  assert.equal(row.kind, "task");
  assert.equal(row.title, "Thread model");
  assert.equal(row.state, "needsYou", "an open comment from the user needs them");
  assert.equal(row.glyph, "◆");
  assert.deepEqual(row.agents, ["dev-1", "dev-old"]);
  assert.deepEqual(row.steps, { done: 1, total: 3 });
  assert.match(row.age, /^(now|\d+[mhd])$/);
  assert.equal(row.summary.source, "activity");
  assert.equal(row.summary.text, "Editing thread.mjs");
  assert.equal(row.summary.agent, "dev-1");
  assert.ok(!("costUsd" in row) && !("tokens" in row), "cost waits for the peek");
  assert.equal(row.planId, merged.id, "the plan that became the task is named on its row");
});

test("thread list: a plan thread names the planning agents and waits on the user's comment", async () => {
  const { threads } = Th.listThreads(PROJECT);
  const row = threads.find((t) => t.id === planning.id);
  assert.equal(row.kind, "plan");
  assert.equal(row.state, "needsYou");
  assert.deepEqual(row.steps, { done: 0, total: 0 });
  assert.deepEqual(row.agents, Object.keys(planning.skills ?? {}));
  assert.equal(row.needs[0].text, "Make it calmer");
  assert.equal(row.summary.source, "comment");
});

test("thread show: the four sub-tabs — conversation, plan, steps and changes", async () => {
  const show = Th.showThread(PROJECT, work.id);
  assert.equal(show.command, "thread");
  assert.equal(show.sub, "show");
  assert.equal(show.id, work.id);
  assert.deepEqual(show.steps.items.map((s) => s.n), [1, 2, 3]);
  assert.equal(show.steps.items[1].agent, "dev-1");
  assert.ok(show.conversation.entries.some((e) => e.kind === "reply" && e.from === "dev-old"), "the agent's chat reply is conversation");
  assert.ok(!show.conversation.entries.some((e) => e.text === "Not this thread"), "another agent's reply is not");
  assert.ok(show.conversation.entries.some((e) => e.kind === "comment" && e.from === "You"));
  assert.ok(show.conversation.entries.some((e) => e.kind === "board" && e.boardKind === "note"));
  assert.equal(show.conversation.total, show.conversation.entries.length);
  assert.equal(show.plan.id, merged.id, "a task's plan rides on its thread");
  assert.equal(show.changes.available, false, "no base commit yet, so no diff");
  assert.match(show.changes.reason, /base commit/);
  assert.equal(show.cost.turns, 0);
  assert.equal(show.cost.tokens, 0);
  assert.equal(show.planId, merged.id, "a plan that became the task is that thread's plan");
  assert.deepEqual(show.needs[0], { kind: "question", ref: "comment c1", text: "Also show the cost in the peek", from: "You", at: COMMENT_AT });
});

test("thread show: a merged plan's markdown rides on the task's thread", async () => {
  const plan = P.loadPlan(PROJECT, merged.id);
  P.writeDraft(plan, "# Became a task\n\nThe agreed plan.", { status: "task" });
  P.savePlan(PROJECT, plan);
  const show = Th.showThread(PROJECT, work.id);
  assert.equal(show.planId, merged.id);
  assert.equal(show.plan.markdown, "# Became a task\n\nThe agreed plan.\n");
  assert.equal(show.plan.status, "task");
});

test("thread peek: recent output, the open question and who a reply goes to", async () => {
  const peek = Th.peekThread(PROJECT, work.id);
  assert.equal(peek.sub, "peek");
  assert.ok(peek.output.length > 0 && peek.output.length <= 8);
  assert.equal(peek.question.kind, "question");
  assert.equal(peek.question.text, "Also show the cost in the peek");
  assert.deepEqual(peek.replyTarget, { name: "dev-1", address: "t11" });
  assert.equal(peek.summary.text, "Editing thread.mjs");
  assert.equal(typeof peek.cost.costUsd, "number", "cost and tokens live in the peek, not the row");
});

test("thread summary: one line per thread, or one thread's line, from the latest event", () => {
  const all = Th.threadSummary(PROJECT);
  assert.ok(all.summaries.length >= 2);
  assert.ok(all.summaries.every((s) => typeof s.text === "string" && s.text.length > 0));
  const one = Th.threadSummary(PROJECT, work.id);
  assert.equal(one.id, work.id);
  assert.equal(one.latestAt, ACTIVITY_AT);
  assert.equal(one.source, "activity");
});

test("the states are derived in a fixed order from what the task holds", () => {
  const base = { id: "t-1", title: "T", status: "active", steps: [], children: [], gates: [] };
  const state = (patch) => Th.taskState({ ...base, ...patch });
  assert.equal(state({ comments: [{ id: "c1", open: true, text: "?" }] }), "needsYou");
  assert.equal(state({ steps: [{ n: 1, title: "One", status: "blocked" }] }), "needsYou");
  assert.equal(state({ status: "abandoned" }), "failed");
  assert.equal(state({ goal: { status: "stopped", criteria: [] } }), "failed");
  assert.equal(state({ status: "paused" }), "paused");
  assert.equal(state({ goal: { status: "waiting", criteria: [] } }), "paused");
  assert.equal(state({ steps: [{ n: 1, title: "One", status: "active", agent: "qa-m1" }] }), "review");
  assert.equal(state({ goal: { status: "running", criteria: [], awaitingQa: true } }), "review");
  assert.equal(state({ gates: [{ round: 1, verdict: "CHANGES_REQUIRED" }] }), "review");
  assert.equal(state({ status: "done" }), "done");
  assert.equal(state({ steps: [{ n: 1, title: "One", status: "active", agent: "dev-1" }] }), "working");
  assert.equal(state({ status: "backlog" }), "idle");
  assert.equal(Th.planState({ status: "grilling" }), "working");
  assert.equal(Th.planState({ status: "ready" }), "idle");
  assert.equal(Th.planState({ status: "grilling" }, { needs: 1 }), "needsYou");
});

test("changes: a base commit and a dirty file give the diff stat of the task's own tree", async () => {
  const git = (...args) => spawnSync("git", args, { cwd: PROJECT, encoding: "utf8" });
  if (git("--version").status !== 0) return; // a machine without git checks the fallback only
  git("init");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  writeFileSync(join(PROJECT, "readme.md"), "one\n");
  git("add", "readme.md");
  git("commit", "-m", "first");
  const base = git("rev-parse", "HEAD").stdout.trim();
  const task = T.newTask(PROJECT, { request: "Change the readme", title: "Readme change", steps: ["Edit it"] });
  T.updateTask(PROJECT, task.id, (t) => {
    t.base = base;
    t.git = { mode: "branch", branch: "readme-change", base };
  });
  writeFileSync(join(PROJECT, "readme.md"), "one\ntwo\n");
  const changes = Th.changesOf(PROJECT, T.loadTask(PROJECT, task.id));
  assert.equal(changes.available, true);
  assert.equal(changes.base, base);
  assert.equal(changes.filesChanged, 1);
  assert.equal(changes.files[0].path, "readme.md");
  assert.equal(changes.added, 1);
  assert.equal(changes.removed, 0);
  git("checkout", "--", "readme.md");
});

test("a corrupt record is skipped with a logged entry, and a legacy shape answers calmly", async () => {
  const dir = join(PROJECT, ".bot-herdr", "tasks");
  mkdirSync(join(dir, "t-20260101-bad"), { recursive: true });
  writeFileSync(join(dir, "t-20260101-bad", "task.json"), "{ this is not json");
  const legacy = T.newTask(PROJECT, { request: "An old task", title: "Old shape", steps: [] });
  T.updateTask(PROJECT, legacy.id, (t) => {
    delete t.steps;
    delete t.comments;
    delete t.children;
    delete t.gates;
  });
  const { threads, skipped } = Th.listThreads(PROJECT);
  assert.ok(skipped.some((s) => s.id === "t-20260101-bad" && s.source === "task"));
  assert.ok(!threads.some((t) => t.id === "t-20260101-bad"));
  const row = threads.find((t) => t.id === legacy.id);
  assert.ok(Th.THREAD_STATES.includes(row.state), "a legacy task still gets one of the seven states");
  assert.deepEqual(row.steps, { done: 0, total: 0 });
  assert.deepEqual(row.agents, []);
  const show = Th.showThread(PROJECT, legacy.id);
  assert.deepEqual(show.steps.items, []);
  assert.deepEqual(show.comments, []);
  const log = (await import("node:fs")).readFileSync(join(APP, "data", "bot-herdr", "logs", "ui.jsonl"), "utf8");
  assert.match(log, /"source":"task".*t-20260101-bad|t-20260101-bad.*"source":"task"/);
});

test("missing stores answer empty instead of throwing", () => {
  const { threads, skipped } = Th.listThreads(EMPTY, { terminals: [] });
  assert.deepEqual(threads, []);
  assert.deepEqual(skipped, []);
  assert.throws(() => Th.showThread(EMPTY, "t-20260101-nope", { terminals: [] }), /No thread t-20260101-nope/);
  assert.throws(() => Th.showThread(EMPTY, "../etc", { terminals: [] }), /No thread/);
});

test("bh thread list --json and bh thread summary answer through the command line", () => {
  const run = (args) => spawnSync(process.execPath, [BH, ...args], { cwd: PROJECT, encoding: "utf8", env: env() });
  const list = run(["thread", "list", "--json"]);
  assert.equal(list.status, 0, list.stderr);
  const json = JSON.parse(list.stdout);
  assert.equal(json.command, "thread");
  assert.equal(json.sub, "list");
  assert.equal(json.count, json.threads.length);
  assert.ok(json.threads.every((t) => t.id && Th.THREAD_STATES.includes(t.state)));
  const summary = run(["thread", "summary", work.id, "--json"]);
  assert.equal(summary.status, 0, summary.stderr);
  const one = JSON.parse(summary.stdout);
  assert.equal(one.id, work.id);
  assert.equal(one.command, "thread");
  assert.equal(typeof one.text, "string");
  const text = run(["thread", "list"]);
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, new RegExp(`◆ needsYou.*Thread model`));
});
