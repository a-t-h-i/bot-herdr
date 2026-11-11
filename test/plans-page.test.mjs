// The Plans page's data: questions asked for a plan, and seats the person leaves out.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const tmp = mkdtempSync(join(tmpdir(), "bh-plans-"));
const APP = join(tmp, "app");
const PROJECT = join(tmp, "project");
mkdirSync(PROJECT, { recursive: true });
const BH = fileURLToPath(new URL("../mods/bot-herdr/engine/bh.mjs", import.meta.url));
const run = (args, env = {}) => spawnSync(process.execPath, [BH, ...args], { cwd: PROJECT, encoding: "utf8", env: { ...process.env, BH_APP_HOME: APP, XDG_CONFIG_HOME: join(tmp, "xdg"), HC_TERMINAL_ID: "", BH_AGENT: "", PATH: "", ...env } });
const json = (...args) => JSON.parse(run([...args, "--json"]).stdout);

test("a plan carries its questions and the seats left out", () => {
  const plan = json("plan", "new", "Add login");
  const asked = JSON.parse(run(["ask", "Which layout?", "--option", "Split — picture left", "--option", "Centered", "--plan", plan.id, "--json"], { HC_TERMINAL_ID: "t1" }).stdout);
  assert.equal(asked.plan, plan.id);
  run(["ask", "Unrelated?", "--option", "A", "--json"], { HC_TERMINAL_ID: "t1" });
  assert.equal(run(["plan", "seat", plan.id, "qa", "--off"]).status, 0);
  const shown = json("plan", "show", plan.id);
  assert.deepEqual(shown.off, ["qa"]);
  assert.deepEqual(shown.asked.map((q) => q.questions[0].text), ["Which layout?"]);
  assert.match(run(["plan", "show", plan.id]).stdout, /left these seats off the panel: qa/);
  run(["plan", "seat", plan.id, "qa", "--on"]);
  assert.deepEqual(json("plan", "show", plan.id).off, []);
  // an agent can't change the seats
  assert.notEqual(run(["plan", "seat", plan.id, "dev", "--off"], { BH_AGENT: "1" }).status, 0);
});
