// Reports and task state: `bh report` records a child's report on the task (not only as a
// message), `bh inbox` lists the ones addressed to an agent, and `bh task show` stays small as
// the board grows.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const tmp = mkdtempSync(join(tmpdir(), "bh-report-"));
const APP = join(tmp, "app");
const PROJECT = join(tmp, "project");
mkdirSync(PROJECT, { recursive: true });
process.env.BH_APP_HOME = APP;
process.env.XDG_CONFIG_HOME = join(tmp, "xdg");

const BH = fileURLToPath(new URL("../mods/bot-herdr/engine/bh.mjs", import.meta.url));
const lib = (name) => import(new URL(`../mods/bot-herdr/engine/${name}`, import.meta.url));

/** Runs bh in the project as the chat does, with these agent variables. */
const run = (args, env = {}) => {
  const r = spawnSync(process.execPath, [BH, ...args], { cwd: PROJECT, encoding: "utf8", env: { ...process.env, BH_APP_HOME: APP, XDG_CONFIG_HOME: join(tmp, "xdg"), HC_TERMINAL_ID: "", BH_AGENT: "", BH_PARENT: "", BH_LEAD: "", ...env } });
  return { code: r.status, out: r.stdout, err: r.stderr };
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test("bh report: the board entry, the step's report, and the clock stopped", async () => {
  const T = await lib("lib/tasks.mjs");
  const task = T.newTask(PROJECT, { request: "Report it", steps: ["Build it", "Test it"] });
  assert.equal(run(["task", "step", task.id, "1", "start"], { BH_AGENT: "dev" }).code, 0);
  await wait(120);
  const file = `.bot-herdr/tasks/${task.id}/reports/dev.md`;
  const r = run(["report", task.id, "--step", "1", "--file", file, "done: built it"], { BH_AGENT: "dev" });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^Reported step 1: done: built it$/m);
  const entry = T.board(PROJECT, task.id).at(-1);
  assert.deepEqual([entry.kind, entry.step, entry.file, entry.from, entry.to], ["done", 1, file, "dev", null]);
  const step = T.loadTask(PROJECT, task.id).steps[0];
  assert.equal(step.status, "active");
  assert.equal(step.started, null);
  assert.ok(step.workedMs >= 100, `workedMs ${step.workedMs}`);
  assert.deepEqual([step.report.file, step.report.summary, step.report.from], [file, "done: built it", "dev"]);
  assert.match(run(["task", "show", task.id]).out, new RegExp(`report: ${file} — done: built it \\(dev\\)`));
  // The Orchestrator marking it done adds no more time.
  await wait(120);
  run(["task", "step", task.id, "1", "done"], { BH_AGENT: "orchestrator" });
  assert.equal(T.loadTask(PROJECT, task.id).steps[0].workedMs, step.workedMs);
});

test("bh inbox: unread once, --peek keeps it unread, and another agent's report is not mine", async () => {
  const T = await lib("lib/tasks.mjs");
  const t = T.newTask(PROJECT, { request: "Inbox", steps: ["One"] });
  const report = (summary, from, to, n) => T.report(PROJECT, t.id, { step: 1, file: `.bot-herdr/tasks/${t.id}/reports/${from}-${n}.md`, summary, from, to });
  report("for qa", "dev", "qa", 1);
  report("for dev", "qa", "dev", 2);
  report("for nobody", "qa", null, 3);
  const peek = run(["inbox", "--task", t.id, "--peek"], { BH_AGENT: "dev" });
  assert.match(peek.out, /#2 step 1 qa: for dev — \S+qa-2\.md/);
  assert.doesNotMatch(peek.out, /for qa|for nobody/);
  assert.match(run(["inbox", "--task", t.id], { BH_AGENT: "dev" }).out, /#2 step 1 qa: for dev/);
  assert.equal(run(["inbox", "--task", t.id], { BH_AGENT: "dev" }).out.trim(), "No new reports.");
  // The lead gets the ones addressed to nobody; the ones for another agent stay theirs.
  const lead = run(["inbox", "--task", t.id], { BH_AGENT: "boss", BH_LEAD: "1" });
  assert.match(lead.out, /#3 step 1 qa: for nobody/);
  assert.doesNotMatch(lead.out, /#2 /);
});

test("bh task show: counts by kind, the last five entries, --board all of them", async () => {
  const T = await lib("lib/tasks.mjs");
  const t = T.newTask(PROJECT, { request: "Board", steps: ["One"] });
  for (let i = 1; i <= 7; i++) T.post(PROJECT, t.id, { kind: i === 1 ? "contract" : "note", text: `entry ${i}`, from: "dev" });
  const shown = run(["task", "show", t.id]);
  assert.match(shown.out, /board: 1 contract, 6 note/);
  assert.equal([...shown.out.matchAll(/^\d+\. \[(?:contract|note)\]/gm)].length, 5);
  assert.match(shown.out, /7\. \[note\] dev: entry 7/);
  assert.doesNotMatch(shown.out, /entry 2$/m);
  const all = run(["task", "show", t.id, "--board"]);
  assert.equal([...all.out.matchAll(/^\d+\. \[(?:contract|note)\]/gm)].length, 7);
});

test("bh brief: the panel brief names the plan and a concrete report file", async () => {
  const P = await lib("lib/plans.mjs");
  mkdirSync(join(APP, "data", "bot-herdr"), { recursive: true });
  writeFileSync(join(APP, "data", "bot-herdr", "agents.json"), JSON.stringify({ agents: [{ role: "dev", harness: "claude", model: "", effort: "" }], known: [] }));
  const plan = P.newPlan(PROJECT, { idea: "Dark mode" });
  const r = run(["brief", "dev", "--mode", "panel", "--plan", plan.id]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, new RegExp(`The plan is \`${plan.id}\``));
  assert.match(r.out, /\.bot-herdr\/reports\/dev\.md/);
});
