// `bh task delete` and `bh plan delete` (addendum to t-20261112-8jkz). An active task stays; a paused
// or done one goes with its folder and worktree, its branch kept. A plan goes with its open questions
// only. Every folder is a temp one, and BH_APP_HOME is a temp folder too.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP = mkdtempSync(join(tmpdir(), "bh-del-app-"));
process.env.BH_APP_HOME = APP;
const BH = fileURLToPath(new URL("../mods/bot-herdr/engine/bh.mjs", import.meta.url));
const lib = (name) => import(new URL(`../mods/bot-herdr/engine/${name}`, import.meta.url));
const hasGit = spawnSync("git", ["--version"]).status === 0;
const questionsIn = join(APP, "data", "bot-herdr", "questions");

function git(cwd, args) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}

/** A git project with one commit, so a worktree can be made from it. */
function repo() {
  const dir = mkdtempSync(join(tmpdir(), "bh-del-repo-"));
  git(dir, ["init", "-q"]);
  writeFileSync(join(dir, "README.md"), "hi\n");
  git(dir, ["add", "README.md"]);
  git(dir, ["-c", "user.name=t", "-c", "user.email=t@example.test", "commit", "-q", "-m", "init"]);
  return dir;
}

function bh(args, cwd) {
  return spawnSync(process.execPath, [BH, ...args], {
    cwd, encoding: "utf8", env: { ...process.env, BH_APP_HOME: APP, HC_TERMINAL_ID: "", BH_AGENT: "", BH_BROWSER: "" },
  });
}

test("an active task is refused, and its folder stays", async () => {
  const T = await lib("lib/tasks.mjs");
  const root = repo();
  const task = T.newTask(root, { request: "Add a login page" });
  assert.throws(() => T.deleteTask(root, task.id), new RegExp(`${task.id} is active: pause or finish it first\\.`));
  assert.ok(existsSync(join(root, ".bot-herdr", "tasks", task.id, "task.json")));
});

test("a paused or done task is deleted with its folder, and reports no branch", async () => {
  const T = await lib("lib/tasks.mjs");
  const root = repo();
  for (const status of ["paused", "done"]) {
    const task = T.newTask(root, { request: `Task ${status}` });
    T.setStatus(task, status);
    T.saveTask(root, task);
    assert.deepEqual(T.deleteTask(root, task.id), { deleted: task.id, branch: null });
    assert.equal(existsSync(join(root, ".bot-herdr", "tasks", task.id)), false, status);
  }
});

test("bh task delete: the reply and --json, and an active task exits 1 with the reason", async () => {
  const T = await lib("lib/tasks.mjs");
  const root = repo();
  const active = T.newTask(root, { request: "Still going" });
  const r0 = bh(["task", "delete", active.id], root);
  assert.equal(r0.status, 1, r0.stdout + r0.stderr);
  assert.match(r0.stderr, new RegExp(`${active.id} is active: pause or finish it first\\.`));
  const done = T.newTask(root, { request: "Finished" });
  T.setStatus(done, "done");
  T.saveTask(root, done);
  const r1 = bh(["task", "delete", done.id, "--json"], root);
  assert.equal(r1.status, 0, r1.stdout + r1.stderr);
  assert.deepEqual(JSON.parse(r1.stdout), { deleted: done.id, branch: null });
  const again = T.newTask(root, { request: "Finished too" });
  T.setStatus(again, "paused");
  T.saveTask(root, again);
  assert.equal(bh(["task", "delete", again.id], root).stdout.trim(), `Deleted ${again.id}.`);
});

test("a task's worktree goes first: git refuses while it holds changes, then nothing is deleted; the branch stays", { skip: !hasGit && "no git here" }, async () => {
  const T = await lib("lib/tasks.mjs");
  const root = repo();
  const branch = "bh-keep";
  const path = join(root, ".bot-herdr", "worktrees", branch);
  mkdirSync(dirname(path), { recursive: true });
  git(root, ["worktree", "add", "-b", branch, path, "HEAD"]);
  const task = T.newTask(root, { request: "Worktree task" });
  task.git = { mode: "worktree", branch, path };
  T.setStatus(task, "paused");
  T.saveTask(root, task);
  writeFileSync(join(path, "scratch.txt"), "not committed\n");
  assert.throws(() => T.deleteTask(root, task.id), (e) => /contains modified or untracked files/.test(e.message) && e.message.endsWith("Commit or discard its changes, then delete it again."));
  assert.ok(existsSync(path), "the worktree is kept");
  assert.ok(existsSync(join(root, ".bot-herdr", "tasks", task.id, "task.json")), "the task folder is kept");
  rmSync(join(path, "scratch.txt"));
  const r = bh(["task", "delete", task.id], root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout.trim(), `Deleted ${task.id}. Its branch ${branch} is kept.`);
  assert.equal(existsSync(path), false, "the worktree is gone");
  assert.equal(existsSync(join(root, ".bot-herdr", "tasks", task.id)), false, "the task folder is gone");
  assert.match(git(root, ["branch", "--list", branch]).stdout, new RegExp(branch), "the branch is kept");
});

test("bh plan delete: the plan's folder and its open questions go; answered ones and other plans stay", { skip: !hasGit && "no git here" }, async () => {
  const P = await lib("lib/plans.mjs");
  const Q = await lib("lib/ask.mjs");
  const root = repo();
  const ask = (plan) => Q.ask({ from: "t0", plan: plan.id, questions: [{ seat: null, text: "Look?", multi: false, options: [{ label: "A", meaning: "", recommended: false, mockup: "<p>a</p>" }] }] });
  const mine = P.newPlan(root, { idea: "Plan A" });
  const other = P.newPlan(root, { idea: "Plan B" });
  const openMine = ask(mine);
  const openOther = ask(other);
  const answeredMine = ask(mine);
  Q.answer(answeredMine.id, [{ picks: ["A"], text: "" }]);
  assert.deepEqual(P.deletePlan(root, mine.id), { deleted: mine.id, questions: 1 });
  assert.equal(existsSync(join(root, ".bot-herdr", "plans", mine.id)), false, "the plan's folder is gone");
  const left = readdirSync(questionsIn);
  assert.equal(left.some((f) => f === `${openMine.id}.json` || f.startsWith(`${openMine.id}-`)), false, "the open questions of the plan go, mockups too");
  assert.ok(left.some((f) => f === `${openOther.id}.json`), "another plan's open questions stay");
  assert.ok(existsSync(join(questionsIn, "answered", `${answeredMine.id}.json`)), "answered questions stay");
  assert.ok(existsSync(join(root, ".bot-herdr", "plans", other.id, "plan.json")), "another plan stays");
});

test("a plan that became a task can be deleted; its task stays", async () => {
  const P = await lib("lib/plans.mjs");
  const T = await lib("lib/tasks.mjs");
  const root = repo();
  const plan = P.newPlan(root, { idea: "Plan C" });
  const task = T.newTask(root, { request: "from plan C", plan: plan.id });
  plan.status = "task";
  plan.task = task.id;
  P.savePlan(root, plan);
  P.deletePlan(root, plan.id);
  assert.equal(T.loadTask(root, task.id).id, task.id);
});

test("bh plan delete: prints Discarded, and --json gives { deleted, questions }", async () => {
  const P = await lib("lib/plans.mjs");
  const root = repo();
  const one = P.newPlan(root, { idea: "Plan D" });
  const r1 = bh(["plan", "delete", one.id, "--json"], root);
  assert.equal(r1.status, 0, r1.stdout + r1.stderr);
  assert.deepEqual(JSON.parse(r1.stdout), { deleted: one.id, questions: 0 });
  const two = P.newPlan(root, { idea: "Plan E" });
  assert.equal(bh(["plan", "delete", two.id], root).stdout.trim(), `Discarded ${two.id}.`);
  assert.notEqual(bh(["plan", "delete", two.id], root).status, 0, "a plan already gone is an error");
});

test("delete refuses ids that are not plain names, so no folder outside the store can go", async () => {
  const P = await lib("lib/plans.mjs");
  const T = await lib("lib/tasks.mjs");
  const root = repo();
  assert.throws(() => P.deletePlan(root, "../tasks"), /No plan/);
  assert.throws(() => T.deleteTask(root, "../plans"), /No task/);
});
