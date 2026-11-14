// Time worked comes from the agents' turns, not from a step's running clock: a step's `timeMs`
// adds its own turns up, the task's `timeMs` merges their intervals so parallel turns count
// once, and neither grows while an agent is idle or dead.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const tmp = mkdtempSync(join(tmpdir(), "bh-worked-"));
const APP = join(tmp, "app");
const PROJECT = join(tmp, "project");
mkdirSync(PROJECT, { recursive: true });
process.env.BH_APP_HOME = APP;
process.env.XDG_CONFIG_HOME = join(tmp, "xdg");

const BH = fileURLToPath(new URL("../mods/bot-herdr/engine/bh.mjs", import.meta.url));
const lib = (name) => import(new URL(`../mods/bot-herdr/engine/${name}`, import.meta.url));
const run = (...args) => {
  const r = spawnSync(process.execPath, [BH, ...args], { cwd: PROJECT, encoding: "utf8", env: { ...process.env, BH_APP_HOME: APP, XDG_CONFIG_HOME: join(tmp, "xdg"), HC_TERMINAL_ID: "", BH_AGENT: "", PATH: "" } });
  return { code: r.status, out: r.stdout, err: r.stderr };
};
const json = (...args) => {
  const r = run(...args, "--json");
  assert.equal(r.code, 0, r.err);
  return JSON.parse(r.out);
};
const MIN = 60000;
const turn = (endsAt, ms, step) => ({ agent: "dev", step, ms, at: endsAt });
const ago = (ms) => new Date(Date.now() - ms).toISOString();

test("step time adds a step's turns; task time merges them, so parallel turns count once", async () => {
  const T = await lib("lib/tasks.mjs");
  const root = mkdtempSync(join(tmp, "worked-"));
  const task = T.newTask(root, { request: "Two agents at once", steps: ["Build it", "Review it"] });
  // step 1: 10:00–10:10 and 10:05–10:15 (5 min overlapped); step 2: 10:20–10:30.
  T.recordUsage(root, task.id, turn("2026-11-14T10:10:00.000Z", 10 * MIN, 1));
  T.recordUsage(root, task.id, turn("2026-11-14T10:15:00.000Z", 10 * MIN, 1));
  T.recordUsage(root, task.id, turn("2026-11-14T10:30:00.000Z", 10 * MIN, 2));
  // A step that has been active for an hour counts nothing beyond its turns.
  T.updateTask(root, task.id, (t) => Object.assign(t.steps[0], { status: "active", started: ago(60 * MIN) }));

  const detail = T.taskDetail(root, T.loadTask(root, task.id), []);
  assert.equal(detail.steps[0].timeMs, 20 * MIN);
  assert.equal(detail.steps[1].timeMs, 10 * MIN);
  assert.equal(detail.timeMs, 25 * MIN);
  assert.equal(detail.steps[0].elapsedMs, 20 * MIN); // the step's timeMs, no running part
  assert.equal(T.worked(root, task), 25 * MIN);

  const [listed] = T.listTasks(root);
  assert.deepEqual(listed.steps.map((s) => s.timeMs), [20 * MIN, 10 * MIN]);
  assert.equal(listed.timeMs, 25 * MIN);
});

test("an active step with no turn reports 0, in task show --json and task list --json", async () => {
  const T = await lib("lib/tasks.mjs");
  const task = T.newTask(PROJECT, { request: "Idle agent", steps: ["Build it"] });
  T.updateTask(PROJECT, task.id, (t) => {
    T.moveStep(t, 1, "start", { agent: "dev" });
    t.steps[0].started = ago(60 * MIN);
  });

  const shown = json("task", "show", task.id);
  assert.equal(shown.steps[0].timeMs, 0);
  assert.equal(shown.steps[0].elapsedMs, 0);
  assert.equal(shown.timeMs, 0);
  const listed = json("task", "list").find((t) => t.id === task.id);
  assert.equal(listed.steps[0].timeMs, 0);
  assert.equal(listed.timeMs, 0);
});

test("a task with no usage records reports its stored workedMs and does not grow", async () => {
  const T = await lib("lib/tasks.mjs");
  const root = mkdtempSync(join(tmp, "stored-"));
  const task = T.newTask(root, { request: "Old task", steps: ["Build it"] });
  T.updateTask(root, task.id, (t) => Object.assign(t.steps[0], { workedMs: 7 * MIN, status: "active", started: ago(60 * MIN) }));

  assert.equal(T.worked(root, T.loadTask(root, task.id)), 7 * MIN); // the stored 7, not 7 + an hour
  const detail = T.taskDetail(root, T.loadTask(root, task.id), []);
  assert.equal(detail.steps[0].timeMs, 7 * MIN);
  assert.equal(detail.timeMs, 7 * MIN);
});

test("the task text's minutes match the task timeMs", async () => {
  const T = await lib("lib/tasks.mjs");
  const task = T.newTask(PROJECT, { request: "Readout", steps: ["Build it"] });
  T.recordUsage(PROJECT, task.id, turn("2026-11-14T10:10:00.000Z", 10 * MIN, 1));
  T.recordUsage(PROJECT, task.id, turn("2026-11-14T10:15:00.000Z", 10 * MIN, 1));

  const shown = json("task", "show", task.id);
  assert.equal(shown.timeMs, 15 * MIN); // 10:00–10:10 and 10:05–10:15 merged
  assert.match(run("task", "show", task.id).out, /agents worked 15 min/);
});
