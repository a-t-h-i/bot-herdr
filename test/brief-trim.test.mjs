// A child's brief carries only what the child can act on: the `## Child agents` block belongs to
// the lead, the `bh ask` and mockup rules to whoever talks to the user (the lead and the panel),
// while the report's path and commands live once, in the brief (the message `bh spawn` starts the
// child with only points there).

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const tmp = mkdtempSync(join(tmpdir(), "bh-brief-trim-"));
const APP = join(tmp, "app");
const XDG = join(tmp, "xdg");
const PROJECT = join(tmp, "project");
mkdirSync(PROJECT, { recursive: true });
process.env.BH_APP_HOME = APP;
process.env.XDG_CONFIG_HOME = XDG;

const BH = fileURLToPath(new URL("../mods/bot-herdr/engine/bh.mjs", import.meta.url));
const lib = (name) => import(new URL(`../mods/bot-herdr/engine/${name}`, import.meta.url));
const team = await lib("lib/team.mjs");
const T = await lib("lib/tasks.mjs");

const { agents } = team.team();
const by = (role) => agents.find((a) => a.role === role);
const options = { root: PROJECT, task: "t-20261120-n1rc", plan: "p-20261120-7rw6", step: 2, headless: true };

test("a child's brief has no child agents block and no bh ask or mockup rules", () => {
  const text = team.brief(by("dev"), { ...options, mode: "child", name: "dev-lean", parent: "t7t" });
  assert.doesNotMatch(text, /## Child agents/);
  assert.doesNotMatch(text, /bh ask --file/);
  assert.doesNotMatch(text, /```mockup/);
});

test("a review brief is as lean as a child's", () => {
  const text = team.brief(by("qa"), { ...options, mode: "review", name: "qa-gate", parent: "t7t" });
  assert.doesNotMatch(text, /## Child agents/);
  assert.doesNotMatch(text, /bh ask --file/);
});

test("the orchestrator's lead brief keeps the child agents block and the ask rules", () => {
  const text = team.brief(by("orchestrator"), { mode: "lead", root: PROJECT, headless: true });
  assert.match(text, /## Child agents/);
  assert.match(text, /bh spawn dev/);
  assert.match(text, /bh ask --file/);
});

test("a panel brief keeps the ask and mockup rules, without the child agents block", () => {
  const text = team.brief(by("research"), { ...options, mode: "panel", name: "research-panel", parent: "t7t" });
  assert.match(text, /bh ask --file/);
  assert.match(text, /```mockup/);
  assert.doesNotMatch(text, /## Child agents/);
});

test("the report path is named once: in the brief, not again in the spawn text", async () => {
  const task = T.newTask(PROJECT, { request: "Brief trim", steps: ["One"] });
  const log = join(tmp, "hc.jsonl");
  const fake = join(tmp, "fake-hc.mjs");
  writeFileSync(fake, `import { appendFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)) + "\\n");\n`);
  const r = spawnSync(process.execPath, [BH, "spawn", "research", "--name", "research-panel", "--task", task.id, "--panel", "p-1", "Read the plan."], {
    cwd: PROJECT, encoding: "utf8", env: { ...process.env, BH_APP_HOME: APP, XDG_CONFIG_HOME: XDG, BH_HC: fake, HC_TERMINAL_ID: "", BH_AGENT: "" },
  });
  assert.equal(r.status, 0, r.stderr);
  const started = JSON.parse(readFileSync(log, "utf8").split("\n").filter(Boolean)[0]).at(-1);
  const brief = team.brief(by("research"), { mode: "panel", root: PROJECT, task: task.id, plan: "p-1", name: "research-panel", headless: true });
  const report = `.bot-herdr/tasks/${task.id}/reports/research-panel.md`;
  // One instruction names where the report goes, and it is in the brief; the spawn message points
  // at the brief rather than saying it again (the brief's `bh report` and `hc send` lines carry the
  // same path as a flag and a message, not as a second instruction).
  assert.equal(brief.split(`write your report to ${report}`).length - 1, 1);
  assert.equal(started.split(report).length - 1, 0);
  assert.equal(`${started}\n\n${brief}`.split(`bh report ${task.id}`).length - 1, 1);
});
