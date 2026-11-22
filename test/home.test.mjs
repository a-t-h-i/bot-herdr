// Home and the goal row: what needs the user first (questions, blockers, approvals, untriaged
// issues), then the threads in review, the running fleet, running Goals and today's spend — plus
// `bh goal progress` and the progress.md checks table it writes. Every folder is a temp one.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const tmp = mkdtempSync(join(tmpdir(), "bh-home-"));
const APP = join(tmp, "app");
const PROJECT = join(tmp, "project");
const EMPTY = join(tmp, "empty");
const WORKTREE = join(PROJECT, ".bot-herdr", "worktrees", "a-task");
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

// herdr stands in as a script (`BH_HC`): two bot-herdr agents and two terminals that are no agents.
const TERMINALS = [
  { address: "t11", name: "dev-1", agent: "pi", state: "live", status: "working", cwd: WORKTREE },
  { address: "t12", name: "qa-1", agent: "pi", state: "live", status: "working", cwd: PROJECT },
  { address: "t13", name: "dev-idle", agent: "pi", state: "live", status: "idle", cwd: PROJECT },
  { address: "t14", agent: "sudo", state: "live", status: "idle", cwd: PROJECT },
  { address: "t15", agent: "shell", state: "live", status: "idle", cwd: PROJECT },
  { address: "t16", name: "dev-gone", agent: "pi", state: "exited", status: "idle", cwd: PROJECT },
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

const nowIso = () => new Date().toISOString();
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString();

const T = await lib("lib/tasks.mjs");
const P = await lib("lib/plans.mjs");
const Q = await lib("lib/ask.mjs");
const H = await lib("lib/home.mjs");
const G = await lib("lib/goal-progress.mjs");

/** A task with one active step, an open comment from the user and a running Goal. */
function workingTask() {
  const task = T.newTask(PROJECT, { request: "Build Home", title: "Home page", steps: ["Read stores", "Draw the list"] });
  T.updateTask(PROJECT, task.id, (t) => {
    T.moveStep(t, 1, "done");
    T.moveStep(t, 2, "start", { agent: "dev-1" });
    t.git = { mode: "worktree", branch: "a-task", path: WORKTREE };
    t.mode = "goal";
    t.goal = {
      status: "running",
      iteration: 2,
      maxSpendUsd: 12,
      criteria: [
        { id: "c1", kind: "file", text: "Home exists", verdict: "PASS" },
        { id: "c2", kind: "check", text: "bh check passes", verdict: "FAIL", evidence: "exit 1" },
        { id: "c3", kind: "qa", text: "QA passes it", verdict: null },
      ],
      sameErrorStreak: 1,
      awaitingQa: false,
      pendingAmendment: null,
    };
    t.comments = [{ id: "c1", step: null, quote: "", text: "Show the fleet first", at: nowIso(), open: true }];
  });
  return T.loadTask(PROJECT, task.id);
}

/** A task whose QA step is running: the Review bucket. */
function reviewTask() {
  const task = T.newTask(PROJECT, { request: "Audit the pages", title: "Page audit", steps: ["Review the diff"] });
  T.updateTask(PROJECT, task.id, (t) => T.moveStep(t, 1, "start", { agent: "qa-1" }));
  return T.loadTask(PROJECT, task.id);
}

const working = workingTask();
const review = reviewTask();
const doneTask = T.newTask(PROJECT, { request: "Ship the tokens", title: "Tokens", steps: ["Done"] });
T.updateTask(PROJECT, doneTask.id, (t) => {
  T.moveStep(t, 1, "done");
  T.setStatus(t, "done");
});

Q.ask({ title: "Where should the cards live?", questions: [{ text: "Cards in Home or Threads?", options: [{ label: "Home", meaning: "" }, { label: "Threads", meaning: "" }] }], from: "t11", fromName: "dev-1", cwd: PROJECT });

// One open issue in the cache, one already triaged: only the open one reaches Home.
const issuesDir = join(PROJECT, ".bot-herdr", "issues");
mkdirSync(issuesDir, { recursive: true });
writeFileSync(join(issuesDir, "cache.json"), JSON.stringify({ repo: "a/b", fetchedAt: nowIso(), issues: [
  { number: 7, title: "Home shows nothing", state: "open", author: "someone", updatedAt: nowIso() },
  { number: 8, title: "A declined wish", state: "open", author: "someone", updatedAt: nowIso() },
] }));
writeFileSync(join(issuesDir, "triage.json"), JSON.stringify({ 8: { decision: "decline", reason: "not ours", closed: true } }));

// Today's turns: one from the agent terminal, the same turn on the task, and one only on the task.
const today = { at: nowIso(), agent: "Dev", input: 1000, output: 500, cacheRead: 0, cacheWrite: 0, costUsd: 0.5, ms: 60_000 };
mkdirSync(join(APP, "data", "bot-herdr", "usage"), { recursive: true });
writeFileSync(join(APP, "data", "bot-herdr", "usage", "t11.jsonl"), [
  JSON.stringify(today),
  JSON.stringify({ at: daysAgo(3), agent: "Dev", input: 100, output: 50, costUsd: 9, ms: 1000 }),
].join("\n"));
mkdirSync(join(PROJECT, ".bot-herdr", "tasks", working.id), { recursive: true });
writeFileSync(join(PROJECT, ".bot-herdr", "tasks", working.id, "usage.jsonl"), [
  JSON.stringify(today),
  JSON.stringify({ at: nowIso(), agent: "QA", input: 200, output: 100, costUsd: 0.25, ms: 30_000 }),
].join("\n"));

// One corrupt task record: Home must draw without it and log the skip.
mkdirSync(join(PROJECT, ".bot-herdr", "tasks", "t-20260101-bad"), { recursive: true });
writeFileSync(join(PROJECT, ".bot-herdr", "tasks", "t-20260101-bad", "task.json"), "{ not json");

const home = H.homeData(PROJECT);

test("home: the header counts what is running and what needs the user", () => {
  assert.equal(home.command, "home");
  const workingAgents = home.fleet.agents.filter((a) => a.state === "working").length;
  assert.equal(home.header.running, workingAgents);
  assert.equal(home.header.needsYou, home.needsYou.length);
  assert.equal(home.header.text, H.headerText(home.header.running, home.needsYou.length));
  assert.match(home.header.text, /^\d+ running · \d+ needs? you$/);
  assert.equal(H.headerText(3, 1), "3 running · 1 needs you");
  assert.equal(H.headerText(1, 2), "1 running · 2 need you");
  assert.equal(H.headerText(0, 0), "All quiet");
});

test("home: needs-you items are ranked, from questions and reviews before untriaged issues", () => {
  const kinds = [...new Set(home.needsYou.map((n) => n.kind))];
  assert.deepEqual(kinds, ["question", "review", "issue"]);
  const rank = (kind) => home.needsYou.findIndex((n) => n.kind === kind);
  assert.ok(rank("question") < rank("review"));
  assert.ok(rank("review") < rank("issue"));
  const reviewItem = home.needsYou.find((n) => n.kind === "review");
  assert.equal(reviewItem.thread, review.id, "a QA review names the thread it is on");
  assert.equal(reviewItem.ref, "qa-1");
  assert.equal(reviewItem.text, "QA is reviewing (qa-1)");
  const question = home.needsYou.find((n) => n.kind === "question" && n.ref === "comment c1");
  assert.equal(question.thread, working.id);
  assert.equal(question.text, "Show the fleet first");
  const asked = home.needsYou.find((n) => n.kind === "question" && n.ref.startsWith("q-"));
  assert.equal(asked.title, "Where should the cards live?");
  assert.equal(asked.from, "dev-1");
  assert.ok(home.needsYou.some((n) => n.kind === "issue" && n.ref === "#7"));
  assert.ok(!home.needsYou.some((n) => n.ref === "#8"), "a triaged issue is not Home's business");
  assert.ok(!home.needsYou.some((n) => n.kind === "approval"), "no held approvals until M6 has a store");
});

test("home: review holds the threads QA is on, and the rest are kept out of it", () => {
  const ids = home.review.map((t) => t.id);
  assert.deepEqual(ids, [review.id]);
  assert.equal(home.review[0].glyph, "◇");
  assert.ok(!ids.includes(working.id));
});

test("home: the fleet is the live agents only, working first, with what each is doing", () => {
  const names = home.fleet.agents.map((a) => a.name);
  assert.ok(names.includes("dev-1") && names.includes("qa-1") && names.includes("dev-idle"));
  assert.ok(!names.includes("sudo") && !names.includes("shell"), "a plain terminal is no agent row");
  assert.ok(!names.includes("dev-gone"), "a finished terminal is not running");
  assert.equal(home.fleet.agents[0].state, "working");
  const dev = home.fleet.agents.find((a) => a.name === "dev-1");
  assert.equal(dev.task, working.id, "the worktree names the thread");
  assert.equal(dev.harness, "pi");
  assert.equal(dev.state, "needsYou", "its open question reaches the fleet row");
  assert.equal(dev.summary, "Needs you", "no activity line yet");
  assert.equal(home.fleet.agents.find((a) => a.name === "dev-idle").state, "idle");
});

test("home: running Goals carry their progress and their spend", () => {
  assert.equal(home.fleet.goals.length, 1);
  const goal = home.fleet.goals[0];
  assert.equal(goal.task, working.id);
  assert.equal(goal.status, "running");
  assert.equal(goal.passed, 1);
  assert.equal(goal.total, 3);
  assert.equal(goal.iteration, 2);
  assert.equal(goal.spendUsd, 0.75, "the duplicated turn counts once");
  assert.equal(goal.maxSpendUsd, 12);
});

test("home: today's spend is today only, each turn once", () => {
  assert.equal(home.spendToday.window, "today");
  assert.equal(home.spendToday.costUsd, 0.75);
  assert.equal(home.spendToday.tokens, 1800);
  assert.equal(home.spendToday.turns, 2);
});

test("home: a corrupt task record is skipped and logged, and Home still draws", () => {
  assert.ok(home.skipped.some((s) => s.id === "t-20260101-bad"));
  assert.ok(home.review.length >= 0 && home.fleet.agents.length > 0);
  const log = readFileSync(join(APP, "data", "bot-herdr", "logs", "ui.jsonl"), "utf8");
  assert.match(log, /t-20260101-bad/);
});

test("home: an empty project answers a quiet page", () => {
  const empty = H.homeData(EMPTY, { terminals: [] });
  assert.deepEqual(empty.needsYou, []);
  assert.deepEqual(empty.review, []);
  assert.deepEqual(empty.fleet.agents, []);
  assert.deepEqual(empty.fleet.goals, []);
  assert.equal(empty.header.text, "All quiet");
  assert.deepEqual(empty.skipped, []);
});

test("bh home --json answers through the command line", () => {
  const run = spawnSync(process.execPath, [BH, "home", "--json"], { cwd: PROJECT, encoding: "utf8", env: env() });
  assert.equal(run.status, 0, run.stderr);
  const json = JSON.parse(run.stdout);
  assert.equal(json.command, "home");
  assert.ok(Array.isArray(json.needsYou) && Array.isArray(json.review));
  assert.ok(json.header && json.fleet && json.spendToday);
});

test("goal progress: the goal row reads gate, milestone, elapsed, retries and the judge's reason", async () => {
  mkdirSync(join(PROJECT, ".bot-herdr", "tasks", working.id), { recursive: true });
  writeFileSync(join(PROJECT, ".bot-herdr", "tasks", working.id, "iterations.jsonl"), `${JSON.stringify({
    n: 2, at: nowIso(), verdict: "FAIL", passed: ["c1"], failed: ["c2"], pendingQa: [], spendUsd: 0.75, lesson: "The button still overlaps the list",
  })}\n`);
  const progress = G.goalProgress(PROJECT, working.id);
  assert.equal(progress.command, "goal progress");
  assert.equal(progress.isGoal, true);
  assert.equal(progress.title, "Home page");
  assert.equal(progress.status, "running");
  assert.equal(progress.paused, false);
  assert.deepEqual(progress.milestone, { n: 2, total: 2, title: "Draw the list", status: "active" });
  assert.deepEqual(progress.gate, { passed: 1, total: 3, reached: false, best: 0 });
  assert.equal(progress.iteration, 2);
  assert.equal(progress.retries.used, 1);
  assert.equal(progress.retries.left, progress.retries.cap - 1);
  assert.equal(progress.lastReason, "The button still overlaps the list");
  assert.equal(progress.lastRound.verdict, "FAIL");
  assert.equal(progress.budget.spendUsd, 0.75);
  assert.equal(progress.budget.maxSpendUsd, 12);
  assert.equal(progress.criteria.length, 3);
  assert.ok(progress.workedMs >= 59_000 && progress.workedMs <= 61_000, "the overlapping turns count once");
  assert.match(progress.elapsed, /^(now|\d+[mhd])$/);
});

test("goal progress: a task that is not a Goal answers calmly instead of throwing", () => {
  const progress = G.goalProgress(PROJECT, doneTask.id);
  assert.equal(progress.isGoal, false);
  assert.equal(progress.task, doneTask.id);
  assert.match(progress.reason, /not a Goal/);
  const none = G.goalProgress(EMPTY);
  assert.equal(none.isGoal, false);
  assert.equal(none.task, null);
});

test("goal progress --sync writes the checks table from the Goal and keeps every hand-written section", async () => {
  const dir = join(PROJECT, ".bot-herdr", "tasks", working.id);
  const file = join(dir, "progress.md");
  const handWritten = "# Progress\n\n## Milestone\nM2 tokens — in progress.\n\n## Checks\n\n| Check | Result |\n| --- | --- |\n| herdr-app check | pass (M1) |\n\n## QA\nM1: PASS.\n";
  writeFileSync(file, handWritten);
  const progress = G.goalProgress(PROJECT, working.id);
  const first = G.syncProgress(PROJECT, working.id, progress);
  assert.equal(first.synced, true);
  assert.equal(first.rows, 3);
  const after = readFileSync(file, "utf8");
  assert.match(after, /## Milestone\nM2 tokens — in progress\./);
  assert.match(after, /## QA\nM1: PASS\./);
  assert.match(after, /\| c1 · Home exists \| PASS \|/);
  assert.match(after, /\| c3 · QA passes it \| not run yet \|/);
  assert.match(after, /\| c2 · bh check passes \| FAIL — exit 1 \|/);
  assert.ok(!after.includes("herdr-app check"), "the old rows are replaced, not appended");
  const second = G.syncProgress(PROJECT, working.id, progress);
  assert.equal(second.synced, false, "a second sync changes nothing");
  assert.equal(readFileSync(file, "utf8"), after);
});

test("the checks table sync: a document without a Checks section gains one, and a cell escapes a pipe", () => {
  const progress = { criteria: [{ id: "c1", text: "a | b", verdict: "PASS", evidence: null }] };
  const table = G.checksTable(progress);
  assert.match(table, /\| c1 · a \\\| b \| PASS \|/);
  const added = G.replaceChecksTable("# Progress\n\n## QA\nPASS.\n", table);
  assert.match(added, /## QA\nPASS\.\n\n## Checks\n\n\| Check \| Result \|/);
  const kept = G.replaceChecksTable("# P\n\n## Checks\n\nSome words first.\n\n| Check | Result |\n| --- | --- |\n| old | row |\n\nAfter.\n", table);
  assert.match(kept, /Some words first\./);
  assert.match(kept, /After\./);
  assert.ok(!kept.includes("| old | row |"));
  assert.match(kept, /\| c1 · a \\\| b \| PASS \|/);
  const crlf = G.replaceChecksTable("## Checks\r\n\r\n| Check | Result |\r\n| --- | --- |\r\n| old | row |\r\n\r\n## QA\r\nPASS.\r\n", table);
  assert.match(crlf, /^## Checks\r\n/);
  assert.match(crlf, /\r\n## QA\r\nPASS\./);
  assert.ok(!/[^\r]\n/.test(crlf), "a Windows file keeps its line endings");
});
