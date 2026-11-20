// `bh metrics`: per agent and for the team, over a window — who worked, how long, what it used and
// what it finished. Old records (no role) roll up by spawn name; the answer is board contract #4.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const tmp = mkdtempSync(join(tmpdir(), "bh-metrics-"));
const APP = join(tmp, "app");
const PROJECT = join(tmp, "project");
mkdirSync(PROJECT, { recursive: true });
process.env.BH_APP_HOME = APP;
process.env.XDG_CONFIG_HOME = join(tmp, "xdg");
const M = await import(new URL("../mods/bot-herdr/engine/lib/metrics.mjs", import.meta.url));
const T = await import(new URL("../mods/bot-herdr/engine/lib/tasks.mjs", import.meta.url));

const agents = [
  { role: "orchestrator", name: "Orchestrator", harness: "claude" },
  { role: "dev", name: "Dev", harness: "claude" },
  { role: "design", name: "Design", harness: "claude" },
  { role: "qa", name: "QA", harness: "pi" },
  { role: "custom", name: "Advisor", harness: "claude" },
];
const now = new Date(2026, 10, 20, 12); // 20 Nov 2026, local noon
const at = (day, hour = 10) => new Date(2026, 10, day, hour).toISOString();
const record = (o) => ({ at: at(20), agent: "x", ms: 60000, reported: { tokens: true, cost: true }, ...o });
const byId = (answer, id) => answer.agents.find((a) => a.id === id);

test("old records without a role roll up by spawn name, longest roster id first", () => {
  const answer = M.metrics({
    records: [
      record({ agent: "dev-lean", input: 10, output: 5, costUsd: 0.01 }),
      record({ agent: "qa-gate2", input: 2, output: 1, costUsd: 0.02, ms: 120000 }),
      record({ agent: "advisor-panel", input: 3, output: 1, costUsd: 0.03, ms: 30000 }),
      record({ agent: "mystery-bot", input: 1, output: 1, costUsd: 0.04, ms: 10000 }),
      record({ agent: "design-polish", role: "design", input: 4, output: 4, costUsd: 0.04, ms: 5000 }),
    ],
    agents, window: "7d", now,
  });
  assert.deepEqual(answer.agents.map((a) => [a.id, a.name, a.role]), [
    ["qa", "QA", "qa"],
    ["dev", "Dev", "dev"],
    ["advisor", "Advisor", "advisor"],
    ["mystery-bot", "mystery-bot", "mystery-bot"],
    ["design", "Design", "design"],
  ]);
  assert.equal(byId(answer, "dev").turns, 1);
  assert.equal(byId(answer, "qa").timeMs, 120000);
});

test("the answer has exactly the contract's keys", () => {
  const answer = M.metrics({ records: [record({ agent: "dev-lean", task: "t-1", input: 1, output: 1, costUsd: 0.01 }), record({ agent: "qa-gate2", input: 1, output: 1, costUsd: 0.01 })], agents, window: "7d", now });
  assert.deepEqual(Object.keys(answer), ["window", "from", "to", "totals", "agents"]);
  assert.deepEqual(Object.keys(answer.totals), ["timeMs", "turns", "tokens", "costUsd", "tasks", "steps", "estimated"]);
  assert.deepEqual(Object.keys(answer.agents[0]), ["id", "name", "role", "harness", "models", "timeMs", "turns", "tokens", "costUsd", "tasks", "steps", "estimated", "daily"]);
  assert.deepEqual(Object.keys(answer.agents[0].tokens), ["input", "output", "cacheRead", "cacheWrite"]);
  assert.deepEqual(Object.keys(answer.agents[0].estimated), ["tokens", "cost"]);
  assert.deepEqual(Object.keys(answer.agents[0].daily[0]), ["day", "timeMs", "turns"]);
  assert.equal(answer.totals.tasks, 1);
  assert.equal(answer.totals.turns, 2);
});

test("windows: from local midnight, today 1 day, 7 days, 30 days; all has no start and 30 bars", () => {
  const records = [
    record({ agent: "dev", at: at(20), ms: 60000 }),
    record({ agent: "dev", at: at(14, 23), ms: 30000 }),
    record({ agent: "dev", at: at(1), ms: 30000 }),
    record({ agent: "dev", at: at(21) /* tomorrow: outside every window */ }),
  ];
  const today = M.metrics({ records, agents, window: "today", now });
  assert.equal(today.window, "today");
  assert.equal(today.from, new Date(2026, 10, 20).toISOString());
  assert.equal(today.agents[0].daily.length, 1);
  assert.equal(today.agents[0].turns, 1);
  const week = M.metrics({ records, agents, window: "7d", now });
  assert.equal(week.from, new Date(2026, 10, 14).toISOString());
  assert.deepEqual(week.agents[0].daily.map((d) => d.day), ["2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"]);
  assert.deepEqual(week.agents[0].daily.map((d) => d.turns), [1, 0, 0, 0, 0, 0, 1]);
  assert.equal(week.agents[0].turns, 2);
  const month = M.metrics({ records, agents, window: "30d", now });
  assert.equal(month.from, new Date(2026, 9, 22).toISOString());
  assert.equal(month.agents[0].turns, 3);
  const all = M.metrics({ records, agents, window: "all", now });
  assert.equal(all.from, null);
  assert.equal(all.agents[0].daily.length, 30);
  assert.equal(all.agents[0].turns, 3);
});

test("a step counts for its agent when it is done and finished inside the window", () => {
  const tasks = [{
    id: "t-1",
    steps: [
      { n: 1, agent: "dev-lean", status: "done", finished: at(20) },
      { n: 2, agent: "dev-lean", status: "active", finished: at(19) },
      { n: 3, agent: "qa-gate2", status: "done", finished: at(5) },
    ],
  }];
  const answer = M.metrics({
    records: [record({ agent: "dev-lean", task: "t-1" }), record({ agent: "qa-gate2", task: "t-1", at: at(19) })],
    tasks, agents, window: "7d", now,
  });
  assert.equal(byId(answer, "dev").steps, 1);
  assert.equal(byId(answer, "qa").steps, 0);
  assert.equal(answer.totals.steps, 1);
  assert.equal(answer.totals.tasks, 1); // one task, not one per agent
});

test("bh metrics --json prints it, and a task's copy of a global turn counts once", () => {
  const BH = fileURLToPath(new URL("../mods/bot-herdr/engine/bh.mjs", import.meta.url));
  const task = T.newTask(PROJECT, { request: "Metrics", steps: ["One"] });
  const rec = { at: at(20), agent: "dev-lean", role: "dev", harness: "claude", model: "m1", costUsd: 0.02, input: 10, output: 2, ms: 60000, task: task.id, reported: { tokens: true, cost: true } };
  const usage = join(APP, "data", "bot-herdr", "usage");
  mkdirSync(usage, { recursive: true });
  writeFileSync(join(usage, "dev-lean.jsonl"), JSON.stringify(rec) + "\n");
  writeFileSync(join(PROJECT, ".bot-herdr", "tasks", task.id, "usage.jsonl"), JSON.stringify(rec) + "\n");
  const r = spawnSync(process.execPath, [BH, "metrics", "--json", "--window", "all"], {
    cwd: PROJECT, encoding: "utf8", env: { ...process.env, BH_APP_HOME: APP, XDG_CONFIG_HOME: join(tmp, "xdg"), PATH: "" },
  });
  assert.equal(r.status, 0, r.stderr);
  const answer = JSON.parse(r.stdout);
  assert.deepEqual(Object.keys(answer), ["window", "from", "to", "totals", "agents"]);
  assert.equal(answer.agents.length, 1);
  assert.equal(answer.agents[0].id, "dev");
  assert.equal(answer.agents[0].name, "Dev");
  assert.equal(answer.agents[0].turns, 1);
  assert.equal(answer.totals.turns, 1);
  assert.equal(answer.totals.costUsd, 0.02);
  assert.equal(answer.agents[0].costUsd, 0.02);
});

test("a record named by the agent's display name joins that agent, case-insensitively", () => {
  const answer = M.metrics({
    records: [
      record({ agent: "Design", input: 10, output: 2, costUsd: 0.01, ms: 60000 }),
      record({ agent: "design-polish", role: "design", input: 5, output: 1, costUsd: 0.02, ms: 30000 }),
      record({ agent: "Orchestrator", input: 3, output: 1, costUsd: 0.03, ms: 20000 }),
      record({ agent: "QA", input: 1, output: 1, costUsd: 0.04, ms: 10000 }),
      record({ agent: "qa-gate2", input: 1, output: 1, costUsd: 0.02, ms: 10000 }),
    ],
    agents, window: "7d", now,
  });
  assert.deepEqual(answer.agents.map((a) => [a.id, a.name]), [["design", "Design"], ["orchestrator", "Orchestrator"], ["qa", "QA"]]);
  assert.equal(byId(answer, "design").turns, 2);
  assert.equal(byId(answer, "qa").turns, 2);
  assert.equal(byId(answer, "orchestrator").turns, 1);
});

test("unreported tokens and cost are null, not reported zeros", () => {
  const records = [{ at: at(20), agent: "dev", role: "dev", harness: "gemini", model: "gemini-4-neon-high", ms: 60000, reported: { tokens: false, cost: false } }];
  const answer = M.metrics({ records, agents, window: "today", now });
  assert.equal(answer.agents[0].tokens, null);
  assert.equal(answer.agents[0].costUsd, null);
  assert.deepEqual(answer.agents[0].estimated, { tokens: false, cost: false });
  assert.equal(answer.totals.tokens, null);
  assert.equal(answer.totals.costUsd, null);
});

test("reported tokens on an unpriced model: tokens are shown, cost is null", () => {
  const records = [{ at: at(20), agent: "dev", role: "dev", harness: "gemini", model: "unknown-model", input: 100, output: 10, ms: 60000, reported: { tokens: true, cost: false } }];
  const answer = M.metrics({ records, agents, window: "today", now });
  assert.deepEqual(answer.agents[0].tokens, { input: 100, output: 10, cacheRead: 0, cacheWrite: 0 });
  assert.equal(answer.agents[0].costUsd, null);
  assert.equal(answer.totals.costUsd, null);
  assert.equal(answer.totals.tokens.input, 100);
});

test("bh metrics (plain) prints — for unreported tokens and cost, and exits 0", () => {
  const BH = fileURLToPath(new URL("../mods/bot-herdr/engine/bh.mjs", import.meta.url));
  const app = join(tmp, "app-plain");
  const project = join(tmp, "project-plain");
  mkdirSync(join(app, "data", "bot-herdr", "usage"), { recursive: true });
  mkdirSync(project, { recursive: true });
  const rec = { at: new Date().toISOString(), agent: "time-only", role: "time-only", harness: "gemini", model: "gemini-4-neon-high", ms: 60000, reported: { tokens: false, cost: false } };
  writeFileSync(join(app, "data", "bot-herdr", "usage", "time-only.jsonl"), JSON.stringify(rec) + "\n");
  const r = spawnSync(process.execPath, [BH, "metrics", "--window", "today"], {
    cwd: project, encoding: "utf8", env: { ...process.env, BH_APP_HOME: app, XDG_CONFIG_HOME: join(tmp, "xdg-plain"), PATH: "" },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^time-only \(time-only\): 1 min, 1 turns, — tokens, —, 0 tasks, 0 steps$/m);
});
