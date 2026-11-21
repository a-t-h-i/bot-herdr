// The Tasks engine contracts the workbench builds on: `bh task list --summary` (light rows for a
// fast poll), `bh task show --json` (the live detail its tabs read) and `--if-updated` (a write
// made on a stale copy is a conflict, not a lost update). Every folder is a temp one.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const tmp = mkdtempSync(join(tmpdir(), "bh-contracts-"));
const APP = join(tmp, "app");
const PROJECT = join(tmp, "project");
mkdirSync(PROJECT, { recursive: true });
process.env.BH_APP_HOME = APP;

const BH = fileURLToPath(new URL("../mods/bot-herdr/engine/bh.mjs", import.meta.url));
const lib = (name) => import(new URL(`../mods/bot-herdr/engine/${name}`, import.meta.url));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/** The environment the workbench's own bh calls run in: no agent, no terminal. */
const childEnv = () => ({ ...process.env, BH_APP_HOME: APP, HC_TERMINAL_ID: "", BH_AGENT: "", BH_PARENT: "", BH_LEAD: "" });

/** Runs bh in the project the way the workbench does, with no agent or terminal attached. */
const run = (args) => {
  const r = spawnSync(process.execPath, [BH, ...args], { cwd: PROJECT, encoding: "utf8", env: childEnv() });
  return { code: r.status, out: r.stdout, err: r.stderr };
};

const json = (args) => {
  const r = run([...args, "--json"]);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  return JSON.parse(r.out);
};

const taskFile = (id) => join(PROJECT, ".bot-herdr", "tasks", id, "task.json");
const taskDir = (id) => join(PROJECT, ".bot-herdr", "tasks", id);

/** One bh run that does not block the test: the concurrency test needs two of them at once. */
const runAsync = (args) => new Promise((resolve) => {
  const child = spawn(process.execPath, [BH, ...args], { cwd: PROJECT, env: childEnv() });
  let out = "";
  let err = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (err += d));
  child.on("close", (code) => resolve({ code, out, err }));
});

/** The holder script: takes a task's lock, waits for `<go>`, deletes the task folder, then lets go. */
const holderScript = join(tmp, "hold-task-lock.mjs");
const CORE = fileURLToPath(new URL("../mods/bot-herdr/engine/lib/core.mjs", import.meta.url));
writeFileSync(holderScript, [
  `import { existsSync, rmSync } from "node:fs";`,
  `import { withLock } from ${JSON.stringify(CORE)};`,
  `const [lock, folder, go] = process.argv.slice(2);`,
  `const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);`,
  `withLock(lock, () => {`,
  `  console.log("locked");`,
  `  for (const until = Date.now() + 10000; !existsSync(go) && Date.now() < until;) sleep(20);`,
  `  rmSync(folder, { recursive: true, force: true });`,
  `});`,
].join("\n"));

/** One summary row's fields, exactly: nothing heavy may ride along on the 4 s poll. */
const SUMMARY_KEYS = ["activeAgents", "archived", "blocked", "created", "done", "id", "latestGate", "needsYou", "openComments", "plan", "running", "spendUsd", "status", "title", "total", "track", "updated", "workedMs"];

test("bh task list --summary: light rows with progress, agents, cost, time and the last gate", async () => {
  const T = await lib("lib/tasks.mjs");
  const request = "Build the workbench contracts for the task list. ".repeat(150);
  const busy = T.newTask(PROJECT, { request, title: "Workbench contracts", plan: "p-20260101-abc", track: "full", steps: ["One", "Two", "Three", "Four"] });
  const busyAt = new Date().toISOString();
  T.updateTask(PROJECT, busy.id, (t) => {
    T.moveStep(t, 1, "done");
    T.moveStep(t, 2, "skip");
    T.moveStep(t, 3, "start", { agent: "dev" });
    T.moveStep(t, 4, "block", { note: "waiting on access" });
    t.children = [
      { name: "di-1", agent: "di", step: 3, state: "open" },
      { name: "dev-2", agent: "dev", step: 3, state: "open" },
      { name: "old", agent: "qa", step: 3, state: "merged" },
    ];
    t.comments = [
      { id: "c1", step: null, quote: "", text: "Why this way?", at: busyAt, open: true },
      { id: "c2", step: null, quote: "", text: "settled", at: busyAt, open: false },
    ];
    t.triage = { by: "rules", size: "large" };
    t.skills = { dev: { picked: null, added: ["docx"] } };
  });
  T.recordGate(PROJECT, busy.id, { verdict: "PASS", round: 1, file: "reports/pass.md", summary: "round one", from: "qa" });
  T.recordGate(PROJECT, busy.id, { verdict: "CHANGES_REQUIRED", round: 2, file: "reports/changes.md", summary: "round two", from: "qa" });
  T.recordUsage(PROJECT, busy.id, { agent: "dev", step: 3, input: 100, output: 50, costUsd: 0.64, ms: 90000, at: busyAt });

  const quiet = T.newTask(PROJECT, { request: "Quiet finished work", title: "Quiet finished work", steps: ["Only"] });
  T.recordUsage(PROJECT, quiet.id, { agent: "dev", step: 1, input: 10, output: 5, costUsd: 0.25, ms: 60000, at: busyAt });
  T.updateTask(PROJECT, quiet.id, (t) => {
    T.moveStep(t, 1, "done");
    T.setStatus(t, "done");
  });

  const paused = T.newTask(PROJECT, { request: "Paused work", title: "Paused work", steps: ["Later"] });
  T.updateTask(PROJECT, paused.id, (t) => T.setStatus(t, "paused"));

  const archived = T.newTask(PROJECT, { request: "Archived work", title: "Archived work", steps: ["Gone"] });
  T.updateTask(PROJECT, archived.id, (t) => {
    T.setStatus(t, "done");
    t.archived = true;
  });

  const rows = json(["task", "list", "--summary", "--all"]);
  const row = rows.find((r) => r.id === busy.id);
  assert.deepEqual(Object.keys(row).sort(), SUMMARY_KEYS);
  assert.equal(typeof row.spendUsd, "number");
  assert.equal(row.title, "Workbench contracts");
  assert.equal(row.status, "active");
  assert.equal(row.archived, false);
  assert.equal(row.track, "full");
  assert.equal(row.plan, "p-20260101-abc");
  assert.equal(row.created, busy.created);
  assert.equal(row.updated, T.loadTask(PROJECT, busy.id).updated);
  assert.equal(row.done, 2, "a skipped step counts as done");
  assert.equal(row.total, 4);
  assert.equal(row.blocked, 1);
  assert.equal(row.openComments, 1);
  assert.equal(row.needsYou, true);
  assert.equal(row.running, true);
  assert.deepEqual(row.activeAgents, ["dev", "di"], "each agent once, and only while it works");
  assert.equal(row.spendUsd, 0.64);
  assert.equal(row.workedMs, 90000);
  assert.deepEqual(row.latestGate, { verdict: "CHANGES_REQUIRED", round: 2 });
  // No blobs, no steps, no comments, no children: the poll stays small.
  const heavyRow = json(["task", "list", "--all"]).find((r) => r.id === busy.id);
  assert.ok(JSON.stringify(row).length * 4 < JSON.stringify(heavyRow).length, `${JSON.stringify(row).length} vs ${JSON.stringify(heavyRow).length}`);
  assert.equal(JSON.stringify(rows).includes("Build the workbench contracts"), false);

  const settled = rows.find((r) => r.id === quiet.id);
  assert.deepEqual([settled.done, settled.total, settled.needsYou, settled.running, settled.latestGate], [1, 1, false, false, null]);
  assert.deepEqual([settled.spendUsd, settled.workedMs, settled.activeAgents], [0.25, 60000, []]);
  // A finished task's totals are kept beside it, so its usage log is not read again.
  assert.equal(JSON.parse(readFileSync(join(PROJECT, ".bot-herdr", "tasks", quiet.id, "usage-totals.json"), "utf8")).usage.costUsd, 0.25);
  assert.equal(rows.find((r) => r.id === paused.id).needsYou, true, "a paused task waits on the user");
  assert.equal(rows.some((r) => r.id === archived.id), true, "--all brings the archived ones");
  assert.equal(json(["task", "list", "--summary"]).some((r) => r.id === archived.id), false, "without --all they stay out");
  assert.match(run(["task", "list", "--summary"]).out, new RegExp(`${busy.id} .*2/4 steps.*Workbench contracts.*running.*needs you`));
});

test("bh task show --json: board, step events, checks, gates and the actions each state allows", async () => {
  const T = await lib("lib/tasks.mjs");
  const make = (title, status, archived = false) => {
    const t = T.newTask(PROJECT, { request: title, title, steps: ["Build it"] });
    return T.updateTask(PROJECT, t.id, (task) => {
      T.moveStep(task, 1, "start", { agent: "dev" });
      if (status !== "active") T.setStatus(task, status);
      task.archived = archived;
      return task;
    });
  };
  const active = make("Show an active task", "active");
  T.post(PROJECT, active.id, { kind: "contract", text: "Steps carry their events", from: "dev", step: 1 });
  T.recordCheck(PROJECT, active.id, { at: new Date().toISOString(), from: "dev", step: 1, command: "bh check", exit: 0, counts: { pass: 2, total: 2 }, ran: { tests: 2 } });
  T.recordGate(PROJECT, active.id, { verdict: "PASS", round: 1, file: "reports/pass.md", summary: "fine", from: "qa" });

  const shown = json(["task", "show", active.id]);
  assert.deepEqual(shown.allowedActions, { pause: true, resume: false, done: true, archive: false, unarchive: false, delete: false });
  assert.deepEqual(shown.board.map((e) => `${e.kind}:${e.text}`), ["contract:Steps carry their events", "done:fine"]);
  assert.equal(shown.checks.length, 1);
  assert.deepEqual([shown.checks[0].command, shown.checks[0].exit, shown.checks[0].counts.pass], ["bh check", 0, 2]);
  assert.deepEqual(shown.gates.map((g) => `${g.round}:${g.verdict}`), ["1:PASS"]);
  assert.deepEqual(shown.steps[0].events.map((e) => e.kind), ["board", "check"], "the gate's own done entry is not shown twice");
  assert.ok(shown.steps[0].events.every((e) => e.at && e.from === "dev"));
  assert.equal(shown.worked, shown.timeMs);
  assert.deepEqual([shown.done, shown.total], [0, 1]);
  assert.equal(shown.steps[0].agentName, "dev");

  const paused = json(["task", "show", make("Show a paused task", "paused").id]);
  assert.deepEqual(paused.allowedActions, { pause: false, resume: true, done: true, archive: true, unarchive: false, delete: true });
  const done = json(["task", "show", make("Show a done task", "done").id]);
  assert.deepEqual(done.allowedActions, { pause: false, resume: false, done: false, archive: true, unarchive: false, delete: true });
  const archived = json(["task", "show", make("Show an archived task", "done", true).id]);
  assert.deepEqual(archived.allowedActions, { pause: false, resume: false, done: false, archive: false, unarchive: true, delete: true });
  assert.deepEqual(archived.checks, [], "a task with no check run still carries the field");
});

test("--if-updated: a matching stamp writes and moves updated on, a stale one is a conflict and changes nothing", async () => {
  const T = await lib("lib/tasks.mjs");
  const make = (title, status = "active") => {
    const t = T.newTask(PROJECT, { request: title, title, steps: ["Build it"] });
    if (status === "active") return t;
    return T.updateTask(PROJECT, t.id, (task) => T.setStatus(task, status));
  };

  /** A stale write: exit 1, the conflict under --json, and task.json byte for byte as it was. */
  const refused = (args, id, expected, actual) => {
    const before = readFileSync(taskFile(id), "utf8");
    const r = run([...args, "--json"]);
    assert.equal(r.code, 1, r.stdout + r.stderr);
    const conflict = JSON.parse(r.out);
    const error = `Conflict: task ${id} was updated at ${actual} (expected ${expected}). Refresh and retry.`;
    assert.deepEqual(conflict, { error, conflict: true, expected, actual });
    assert.equal(readFileSync(taskFile(id), "utf8"), before, "the refused write left the task alone");
  };

  // status: the fresh stamp writes, and the stamp the caller read before no longer does.
  const status = make("Guard status");
  await wait(20);
  const statusAt = status.updated;
  assert.equal(run(["task", "status", status.id, "paused", "--if-updated", statusAt]).code, 0);
  const statusNow = T.loadTask(PROJECT, status.id).updated;
  assert.ok(statusNow > statusAt, `${statusNow} > ${statusAt}`);
  refused(["task", "status", status.id, "done", "--if-updated", statusAt], status.id, statusAt, statusNow);
  const plain = run(["task", "status", status.id, "done", "--if-updated", statusAt]);
  assert.equal(plain.code, 1);
  assert.match(plain.err, new RegExp(`bh: Conflict: task ${status.id} was updated at`));

  // step
  const step = make("Guard step");
  await wait(20);
  const stepAt = step.updated;
  assert.equal(run(["task", "step", step.id, "1", "start", "--if-updated", stepAt]).code, 0);
  const stepNow = T.loadTask(PROJECT, step.id).updated;
  refused(["task", "step", step.id, "1", "block", "--if-updated", stepAt], step.id, stepAt, stepNow);
  assert.equal(T.loadTask(PROJECT, step.id).steps[0].status, "active");

  // comment
  const comment = make("Guard comment");
  await wait(20);
  const commentAt = comment.updated;
  assert.equal(run(["task", "comment", comment.id, "please look", "--if-updated", commentAt]).code, 0);
  const commentNow = T.loadTask(PROJECT, comment.id).updated;
  refused(["task", "comment", comment.id, "second words", "--if-updated", commentAt], comment.id, commentAt, commentNow);
  assert.equal(T.loadTask(PROJECT, comment.id).comments.length, 1);

  // archive
  const archive = make("Guard archive", "paused");
  await wait(20);
  const archiveAt = archive.updated;
  assert.equal(run(["task", "archive", archive.id, "--if-updated", archiveAt]).code, 0);
  const archiveNow = T.loadTask(PROJECT, archive.id).updated;
  refused(["task", "unarchive", archive.id, "--if-updated", archiveAt], archive.id, archiveAt, archiveNow);
  assert.equal(T.loadTask(PROJECT, archive.id).archived, true);

  // delete: the folder and its task.json stay
  const gone = make("Guard delete", "paused");
  await wait(20);
  const goneAt = gone.updated;
  assert.equal(run(["task", "archive", gone.id, "--if-updated", goneAt]).code, 0);
  const goneNow = T.loadTask(PROJECT, gone.id).updated;
  refused(["task", "delete", gone.id, "--if-updated", goneAt], gone.id, goneAt, goneNow);
  assert.ok(existsSync(taskFile(gone.id)), "the refused delete kept the task");
});

test("bh task step: start, done, block, skip and todo each move the step", async () => {
  const T = await lib("lib/tasks.mjs");
  const task = T.newTask(PROJECT, { request: "Five transitions", title: "Five transitions", steps: ["Build it"] });
  const moves = [["start", "active"], ["done", "done"], ["todo", "todo"], ["block", "blocked"], ["todo", "todo"], ["skip", "skipped"], ["todo", "todo"], ["start", "active"]];
  for (const [to, status] of moves) {
    const r = run(["task", "step", task.id, "1", to]);
    assert.equal(r.code, 0, `${to}: ${r.stdout}${r.stderr}`);
    assert.equal(r.out.trim(), `Step 1 is ${status}: Build it`, to);
    assert.equal(T.loadTask(PROJECT, task.id).steps[0].status, status, to);
  }
  assert.equal(T.loadTask(PROJECT, task.id).status, "active");
});

test("a missing task id fails without leaving a ghost folder, and deleting twice never resurrects one", async () => {
  const T = await lib("lib/tasks.mjs");
  // Nothing exists for this id: neither a delete nor a status write may create `.bot-herdr/tasks/<id>/`.
  for (const args of [["task", "delete", "t-20261121-nope"], ["task", "status", "t-20261121-nope", "done"]]) {
    const r = run(args);
    assert.equal(r.code, 1, `${args.join(" ")}: ${r.stdout}${r.stderr}`);
    assert.match(r.err, /No task t-20261121-nope/, args.join(" "));
    assert.equal(existsSync(taskDir("t-20261121-nope")), false, `${args.join(" ")} left a ghost folder`);
  }

  const task = T.newTask(PROJECT, { request: "Delete it twice", title: "Delete it twice" });
  T.updateTask(PROJECT, task.id, (t) => T.setStatus(t, "paused"));
  assert.equal(run(["task", "delete", task.id]).code, 0);
  assert.equal(existsSync(taskDir(task.id)), false, "the first delete removed the folder");
  const again = run(["task", "delete", task.id]);
  assert.equal(again.code, 1, again.stdout + again.stderr);
  assert.match(again.err, new RegExp(`No task ${task.id}`));
  assert.equal(existsSync(taskDir(task.id)), false, "the second delete resurrected an empty folder");
});

test("concurrent delete and status wait on the task's sibling lock and then say No task, never a raw ENOENT", async () => {
  const T = await lib("lib/tasks.mjs");
  const task = T.newTask(PROJECT, { request: "Race the delete", title: "Race the delete" });
  T.updateTask(PROJECT, task.id, (t) => T.setStatus(t, "paused"));
  const tasksDir = join(PROJECT, ".bot-herdr", "tasks");
  const go = join(tmp, "race-go");
  // The lock lives beside the task folder: `<tasks>/<id>.lock`, never `<id>/task.json.lock`.
  const lock = join(tasksDir, task.id);
  const holder = spawn(process.execPath, [holderScript, lock, taskDir(task.id), go], { env: childEnv() });
  await new Promise((resolve, reject) => {
    let out = "";
    holder.stdout.on("data", (d) => {
      out += d;
      if (out.includes("locked")) resolve();
    });
    holder.on("error", reject);
    holder.on("close", (code) => reject(new Error(`lock holder exited ${code}`)));
  });

  const deleting = runAsync(["task", "delete", task.id]);
  const updating = runAsync(["task", "status", task.id, "done"]);
  const early = await Promise.race([Promise.all([deleting, updating]).then(() => "finished"), wait(500).then(() => "waiting")]);
  assert.equal(early, "waiting", "both waited for the lock held beside the task folder");

  writeFileSync(go, "go"); // the holder now deletes the folder, as deleteTask does, and releases
  assert.equal(await new Promise((resolve) => holder.on("close", resolve)), 0);
  for (const r of await Promise.all([deleting, updating])) {
    assert.equal(r.code, 1, r.out + r.err);
    assert.match(r.err, new RegExp(`No task ${task.id}`), r.err);
    assert.doesNotMatch(r.err, /ENOENT|EBUSY|EPERM|is locked/, r.err);
  }
  assert.equal(existsSync(taskDir(task.id)), false);
});

test("bh task step done --if-updated: a stale stamp is a conflict even when the latest check failed", async () => {
  const T = await lib("lib/tasks.mjs");
  const task = T.newTask(PROJECT, { request: "Guard the done step", title: "Guard the done step", steps: ["Build it"] });
  T.updateTask(PROJECT, task.id, (t) => T.moveStep(t, 1, "start", { agent: "dev" }));
  T.recordCheck(PROJECT, task.id, { at: new Date().toISOString(), from: "dev", step: null, command: "bh check", exit: 1, counts: { pass: 0, total: 1 }, ran: { tests: 1 } });
  await wait(20);
  const staleAt = task.updated;

  const stale = run(["task", "step", task.id, "1", "done", "--if-updated", staleAt, "--json"]);
  assert.equal(stale.code, 1, stale.stdout + stale.stderr);
  const conflict = JSON.parse(stale.out);
  assert.deepEqual([conflict.conflict, conflict.expected], [true, staleAt], stale.out);
  assert.equal(T.loadTask(PROJECT, task.id).steps[0].status, "active", "the refused step write changed nothing");

  const fresh = T.loadTask(PROJECT, task.id).updated;
  const refused = run(["task", "step", task.id, "1", "done", "--if-updated", fresh]);
  assert.equal(refused.code, 1, refused.stdout + refused.stderr);
  assert.match(refused.err, /latest bh check failed/, "a matching stamp still refuses on the failed check");
  assert.equal(T.loadTask(PROJECT, task.id).steps[0].status, "active");
});
