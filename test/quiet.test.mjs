// Harnesses that never report a status to herdr (Antigravity's agy): they still count as agents,
// start with the message as their first prompt, and their templates don't wait for a report.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { withQuiet, isQuiet, quietStatus, QUIET_WORK_MS } from "../mods/bot-herdr/live.js";
import { withPrompt, promptFlag, runningAs } from "../mods/bot-herdr/roster.js";
import { orchestratorOf } from "../mods/bot-herdr/route.js";

const agy = { key: "antigravity", name: "Antigravity", shell: false, agent: false };
const claude = { key: "claude", name: "Claude Code", shell: false, agent: true };
const spaces = [{ id: "sp1", name: "web", tabs: [{ id: "tb1", index: 0, name: "Orchestrator" }, { id: "tb2", index: 1, name: "Design" }, { id: "tb3", index: 2, name: "" }] }];
const reported = [{ address: "t1", pane: "p1", space: "sp1", tab: "tb2", tab_name: "Design", status: "working", program: claude, seq: 2 }];
const panes = [
  { pane: "p1", terminal: "t1", tab: "tb2", title: "claude", status: "working", program: claude },
  { pane: "p2", terminal: "t2", tab: "tb1", title: "agy", status: null, program: agy, focused: true },
  { pane: "p3", terminal: "t3", tab: "tb3", title: "zsh", status: null, program: { key: "shell", name: "zsh", shell: true } },
  { pane: "p4", terminal: null, mod: "files", tab: "tb3", title: "files", status: null, program: agy },
];

test("quiet agents: agy's pane is an agent, idle, in its tab and space; others are left as they are", () => {
  const all = withQuiet({ agents: reported, panes, spaces });
  assert.equal(all.length, 2);
  assert.equal(all[0], reported[0]);
  const a = all[1];
  assert.equal(a.address, "t2");
  assert.equal(a.space, "sp1");
  assert.equal(a.tab_name, "Orchestrator");
  assert.equal(a.status, "idle");
  assert.equal(a.quiet, true);
  assert.equal(a.focused, true);
  // Nothing to add: the same list back.
  assert.equal(withQuiet({ agents: reported, panes: panes.slice(0, 1), spaces }), reported);
  // Listed by herdr already (agy reporting one day): not twice.
  assert.equal(withQuiet({ agents: [{ ...reported[0], address: "t2" }], panes, spaces }).length, 1);
});

test("quiet agents: the Orchestrator and roster agents are found in them", () => {
  const all = withQuiet({ agents: reported, panes, spaces });
  assert.equal(orchestratorOf(all, "sp1", "Orchestrator")?.address, "t2");
  assert.equal(runningAs({ name: "Orchestrator" }, all, "sp1")?.address, "t2");
});

test("quiet agents: working from our message until the reply, for a while at most", () => {
  const now = 1_000_000;
  assert.equal(quietStatus(null, now), "idle");
  assert.equal(quietStatus({ at: now - 1000 }, now), "working");
  assert.equal(quietStatus({ at: now - QUIET_WORK_MS - 1 }, now), "idle");
  assert.equal(isQuiet({ program: agy }), true);
  assert.equal(isQuiet({ program: claude }), false);
  assert.equal(isQuiet({ program: { ...agy, shell: true } }), false);
});

test("first prompt: agy, Gemini and Qwen Code get it after -i; others as a bare argument", () => {
  assert.deepEqual(withPrompt(["agy", "--model", "gemini-3.8-flash-high"], "hi"), ["agy", "--model", "gemini-3.8-flash-high", "-i"]);
  assert.deepEqual(withPrompt(["C:\\Tools\\agy.exe"], "hi"), ["C:\\Tools\\agy.exe", "-i"]);
  assert.deepEqual(withPrompt(["gemini", "-m", "x"], "hi"), ["gemini", "-m", "x", "-i"]);
  assert.deepEqual(withPrompt(["claude"], "hi"), ["claude"]);
  assert.deepEqual(withPrompt(["agy"], "  "), ["agy"]); // no message, no flag waiting for one
  assert.deepEqual(withPrompt(["agy", "-i"], "hi"), ["agy", "-i"]); // already there
  assert.equal(promptFlag(["/usr/local/bin/qwen"]), "-i");
  assert.equal(promptFlag(["codex", "--no-daemon"]), null);
});

test("templates: an agy agent's says ready: quiet, so its brief is typed in once it settles", () => {
  const tmp = mkdtempSync(join(tmpdir(), "bh-quiet-"));
  const APP = join(tmp, "app");
  const XDG = join(tmp, "xdg");
  const PROJECT = join(tmp, "project");
  mkdirSync(PROJECT, { recursive: true });
  const BH = fileURLToPath(new URL("../mods/bot-herdr/engine/bh.mjs", import.meta.url));
  const enc = (v) => encodeURIComponent(JSON.stringify(v));
  const known = [{ key: "antigravity", name: "Antigravity", run: ["agy"], installed: true }, { key: "codex", name: "Codex", run: ["codex"], installed: true }];
  const r = spawnSync(process.execPath, [BH, "team", "save", "--data", enc({ agents: [{ role: "design", harness: "antigravity", model: "gemini-3.8-flash-high" }, { role: "dev", harness: "codex" }], known })], {
    cwd: PROJECT, encoding: "utf8", env: { ...process.env, BH_APP_HOME: APP, XDG_CONFIG_HOME: XDG, HC_TERMINAL_ID: "", BH_AGENT: "", PATH: "" },
  });
  assert.equal(r.status, 0, r.stderr);
  const design = readFileSync(join(XDG, "herdr-core", "templates", "design.md"), "utf8");
  assert.match(design, /command: agy --model gemini-3\.8-flash-high\n/);
  assert.match(design, /\nready: quiet\n/);
  const dev = readFileSync(join(XDG, "herdr-core", "templates", "dev.md"), "utf8");
  assert.doesNotMatch(dev, /ready:/);
});
