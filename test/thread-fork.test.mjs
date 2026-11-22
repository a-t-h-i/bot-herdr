// Thread fork: `bh thread fork` creates a linked task carrying the given context and storing
// `forkOf`, and `bh thread show` surfaces both `forkOf` and `forks`.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const tmp = mkdtempSync(join(tmpdir(), "bh-thread-fork-"));
const APP = join(tmp, "app");
const PROJECT = join(tmp, "project");
mkdirSync(PROJECT, { recursive: true });
process.env.BH_APP_HOME = APP;
process.env.HC_TERMINAL_ID = "";
process.env.BH_AGENT = "";

after(() => {
  try { rmSync(tmp, { recursive: true, force: true }); } catch {}
});

const BH = fileURLToPath(new URL("../mods/bot-herdr/engine/bh.mjs", import.meta.url));
const T = await import(new URL("../mods/bot-herdr/engine/lib/tasks.mjs", import.meta.url));
const P = await import(new URL("../mods/bot-herdr/engine/lib/plans.mjs", import.meta.url));

const runBh = (args) => spawnSync(process.execPath, [BH, ...args], {
  cwd: PROJECT,
  encoding: "utf8",
  env: { ...process.env, BH_APP_HOME: APP, HC_TERMINAL_ID: "", BH_AGENT: "" },
  timeout: 60_000,
});

test("bh thread fork creates a linked task and bh thread show lists forkOf and forks", () => {
  const parent = T.newTask(PROJECT, { request: "Original request", title: "Parent thread" });

  const forked = runBh(["thread", "fork", parent.id, "Try the simpler layout instead", "--title", "Simpler layout", "--json"]);
  assert.equal(forked.status, 0, forked.stderr);
  const res = JSON.parse(forked.stdout);
  assert.match(res.id, /^t-\d{8}-/);
  assert.equal(res.forkOf, parent.id);

  const saved = T.loadTask(PROJECT, res.id);
  assert.equal(saved.title, "Simpler layout");
  assert.equal(saved.forkOf, parent.id);
  assert.equal(saved.request, `Try the simpler layout instead\n\nForked from ${parent.id}: Parent thread.`);

  const parentShow = JSON.parse(runBh(["thread", "show", parent.id, "--json"]).stdout);
  assert.equal(parentShow.forkOf, null);
  assert.deepEqual(parentShow.forks, [{ id: res.id, title: "Simpler layout", state: "working" }]);

  const childShow = JSON.parse(runBh(["thread", "show", res.id, "--json"]).stdout);
  assert.equal(childShow.forkOf, parent.id);
  assert.deepEqual(childShow.forks, []);
});

test("bh thread fork also works from a plan thread", () => {
  const plan = P.newPlan(PROJECT, { idea: "Draft idea", title: "Plan thread" });
  const forked = runBh(["thread", "fork", plan.id, "Prototype the core loop", "--json"]);
  assert.equal(forked.status, 0, forked.stderr);
  const res = JSON.parse(forked.stdout);
  assert.equal(res.forkOf, plan.id);

  const planShow = JSON.parse(runBh(["thread", "show", plan.id, "--json"]).stdout);
  assert.equal(planShow.forkOf, null);
  assert.equal(planShow.forks.length, 1);
  assert.equal(planShow.forks[0].id, res.id);
});
