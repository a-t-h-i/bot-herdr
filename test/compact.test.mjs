// Compacting the Orchestrator's conversation between tasks: `bh task status … done` and
// `bh plan task` leave a marker, its agent terminal consumes it before the next message (Claude
// Code compacts its own saved session headless; a failed compaction, or no Claude session, starts
// over with a handoff of the finished task), and a child never touches it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const tmp = mkdtempSync(join(tmpdir(), "bh-compact-"));
const APP = join(tmp, "app");
const PROJECT = join(tmp, "project");
mkdirSync(PROJECT, { recursive: true });
process.env.BH_APP_HOME = APP;
process.env.XDG_CONFIG_HOME = join(tmp, "xdg");

const BH = fileURLToPath(new URL("../mods/bot-herdr/engine/bh.mjs", import.meta.url));
const lib = (name) => import(new URL(`../mods/bot-herdr/engine/${name}`, import.meta.url));
const T = await lib("lib/tasks.mjs");

const MARKER = join(APP, "data", "bot-herdr", "sessions", "compact-pending.json");
const LOG = join(tmp, "calls.jsonl");
const FAIL = join(tmp, "compact-fails");
const FAKE = join(tmp, "claude.mjs");

writeFileSync(FAKE, `import { appendFileSync, existsSync, readFileSync } from "node:fs";
const out = (o) => console.log(JSON.stringify(o));
const argv = process.argv.slice(2);
const prompt = readFileSync(0, "utf8");
appendFileSync(${JSON.stringify(LOG)}, JSON.stringify({ argv, prompt }) + "\\n");
const resume = argv.includes("--resume") ? argv[argv.indexOf("--resume") + 1] : null;
if (prompt === "/compact") {
  if (existsSync(${JSON.stringify(FAIL)})) out({ type: "result", subtype: "error_during_execution", is_error: true, result: "cannot compact" });
  else { out({ type: "system", subtype: "compact_boundary", session_id: resume }); out({ type: "result", subtype: "success", result: "" }); }
} else {
  out({ type: "result", subtype: "success", result: "ok: " + prompt.trim().split("\\n").pop() });
}
`);

function setTeam() {
  mkdirSync(join(APP, "data", "bot-herdr"), { recursive: true });
  writeFileSync(join(APP, "data", "bot-herdr", "agents.json"), JSON.stringify({
    agents: [{ role: "orchestrator", harness: "claude" }, { role: "dev", harness: "claude" }],
    known: [{ key: "claude", name: "claude", run: [process.execPath, FAKE], installed: true }],
  }));
}

const run = (args, input = "") => spawnSync(process.execPath, [BH, ...args], {
  cwd: PROJECT, input, encoding: "utf8", timeout: 20000,
  env: { ...process.env, BH_APP_HOME: APP, XDG_CONFIG_HOME: join(tmp, "xdg"), HC_TERMINAL_ID: "", BH_AGENT: "" },
});
const marker = () => (existsSync(MARKER) ? JSON.parse(readFileSync(MARKER, "utf8")) : null);
const calls = () => (existsSync(LOG) ? readFileSync(LOG, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const lead = (input, ...args) => run(["agent", "orchestrator", "--mode", "lead", ...args], input);

test("bh task status … done leaves the marker", () => {
  const task = T.newTask(PROJECT, { request: "Finished", steps: ["One"] });
  rmSync(MARKER, { force: true });
  const r = run(["task", "status", task.id, "done"]);
  assert.equal(r.status, 0, r.stderr);
  const m = marker();
  assert.equal(m.task, task.id);
  assert.equal(m.reason, `task ${task.id} done`);
  assert.equal(m.kind, "done");
  assert.equal(m.project, PROJECT);
  assert.ok(Number.isFinite(Date.parse(m.at)));
});

test("bh plan task leaves the marker for the task it made", async () => {
  const P = await lib("lib/plans.mjs");
  const plan = P.newPlan(PROJECT, { idea: "A plan with steps" });
  P.writeDraft(plan, "## Status\nREADY\n\n## Plan\n\n### Steps\n1. First step\n2. Second step\n");
  P.savePlan(PROJECT, plan);
  rmSync(MARKER, { force: true });
  const r = run(["plan", "task", plan.id]);
  assert.equal(r.status, 0, r.stderr);
  const made = P.loadPlan(PROJECT, plan.id).task;
  const m = marker();
  assert.equal(m.task, made);
  assert.equal(m.reason, `plan ${plan.id} became task ${made}`);
  assert.equal(m.kind, "planned");
  assert.equal(m.plan, plan.id);
  assert.equal(m.project, PROJECT);
});

test("the lead compacts its session once, before the next message", () => {
  setTeam();
  rmSync(LOG, { force: true });
  rmSync(MARKER, { force: true });
  assert.equal(lead("", "--", "hello").status, 0);
  assert.equal(calls().filter((c) => c.prompt === "/compact").length, 0); // nothing pending
  writeFileSync(MARKER, JSON.stringify({ at: new Date().toISOString(), kind: "done", project: PROJECT, reason: "task t-1 done", task: "t-1" }));
  assert.equal(lead("", "--", "after").status, 0);
  const compacts = calls().filter((c) => c.prompt === "/compact");
  assert.equal(compacts.length, 1);
  assert.ok(compacts[0].argv.includes("--resume"));
  assert.equal(existsSync(MARKER), false);
  assert.equal(lead("", "--", "later").status, 0);
  assert.equal(calls().filter((c) => c.prompt === "/compact").length, 1); // consumed once
});

test("a child never consumes the marker", () => {
  setTeam();
  rmSync(LOG, { force: true });
  writeFileSync(MARKER, JSON.stringify({ at: new Date().toISOString(), kind: "done", project: PROJECT, reason: "task t-1 done", task: "t-1" }));
  const r = run(["agent", "dev", "--mode", "child", "--name", "fix-x", "--parent", "t1", "--", "work", "more\n"]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(calls().some((c) => c.prompt === "/compact"), false);
  assert.equal(marker()?.reason, "task t-1 done");
  rmSync(MARKER, { force: true });
});

test("a failed compaction starts a new session from a handoff that lists the steps", () => {
  setTeam();
  const task = T.newTask(PROJECT, { request: "Handoff", title: "Handoff work", steps: ["First", "Second"] });
  rmSync(MARKER, { force: true });
  assert.equal(lead("", "--task", task.id, "--", "one").status, 0); // a conversation to compact
  writeFileSync(FAIL, "1");
  assert.equal(run(["task", "status", task.id, "done"]).status, 0);
  rmSync(LOG, { force: true });
  assert.equal(lead("", "--task", task.id, "--", "two").status, 0);
  const [compact, fresh] = calls();
  assert.equal(compact.prompt, "/compact");
  assert.equal(fresh.prompt, "## Handoff\nHandoff work: done.\n1. First — todo\n2. Second — todo\nKnowledge and boards hold the rest.\n\ntwo");
  rmSync(FAIL, { force: true });
});

test("a non-Orchestrator lead agent leaves the marker for the Orchestrator", () => {
  setTeam();
  rmSync(LOG, { force: true });
  writeFileSync(MARKER, JSON.stringify({ at: new Date().toISOString(), kind: "done", project: PROJECT, reason: "task t-1 done", task: "t-1" }));
  // Dev opens its own direct chat: --mode lead, as composer.js does, but it does not lead the team.
  const r = run(["agent", "dev", "--mode", "lead", "--", "hello dev"]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(calls().some((c) => c.prompt === "/compact"), false);
  assert.equal(marker()?.reason, "task t-1 done"); // still the Orchestrator's
  rmSync(MARKER, { force: true });
});

test("another project's marker is left alone", () => {
  setTeam();
  rmSync(LOG, { force: true });
  writeFileSync(MARKER, JSON.stringify({ at: new Date().toISOString(), kind: "done", project: "/somewhere/else", reason: "task t-9 done", task: "t-9" }));
  assert.equal(lead("", "--", "hello").status, 0);
  assert.equal(calls().some((c) => c.prompt === "/compact"), false);
  assert.equal(marker()?.task, "t-9");
  rmSync(MARKER, { force: true });
});

test("a plan that became a task hands off as starting now, not as done", async () => {
  setTeam();
  rmSync(LOG, { force: true });
  rmSync(MARKER, { force: true });
  // a conversation to compact, then the plan becomes a task
  const P2 = await import(new URL("../mods/bot-herdr/engine/lib/plans.mjs", import.meta.url));
  const plan = P2.newPlan(PROJECT, { idea: "Build feature" });
  P2.writeDraft(plan, "## Status\nREADY\n\n## Title\nBuild feature\n\n## Plan\n\n### Steps\n1. Build it\n2. Test it\n");
  P2.savePlan(PROJECT, plan);
  assert.equal(lead("", "--", "one").status, 0);
  writeFileSync(FAIL, "1");
  assert.equal(run(["plan", "task", plan.id]).status, 0);
  rmSync(LOG, { force: true });
  assert.equal(lead("", "--", "two").status, 0);
  const [, fresh] = calls();
  assert.equal(fresh.prompt, "## Handoff\nPrevious plan Build feature became task Build feature; it starts now.\n1. Build it — todo\n2. Test it — todo\nKnowledge and boards hold the rest.\n\ntwo");
  rmSync(FAIL, { force: true });
});
