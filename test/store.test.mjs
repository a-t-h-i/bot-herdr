// The store under several writers: the file lock, who a post is from, the hc timeout and the
// turn watchdog. Each writer here is a real second process, so the races are the engine's own.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const tmp = mkdtempSync(join(tmpdir(), "bh-store-"));
const APP = join(tmp, "app");
const PROJECT = join(tmp, "project");
mkdirSync(PROJECT, { recursive: true });
process.env.BH_APP_HOME = APP;
process.env.XDG_CONFIG_HOME = join(tmp, "xdg");

const BH = fileURLToPath(new URL("../mods/bot-herdr/engine/bh.mjs", import.meta.url));
const TASKS = new URL("../mods/bot-herdr/engine/lib/tasks.mjs", import.meta.url).href;
const lib = (name) => import(new URL(`../mods/bot-herdr/engine/${name}`, import.meta.url));

/** Runs bh as the chat does (no terminal, no agent name), unless `env` says otherwise. */
const run = (args, env = {}) => {
  const r = spawnSync(process.execPath, [BH, ...args], { cwd: PROJECT, encoding: "utf8", env: { ...process.env, HC_TERMINAL_ID: "", BH_AGENT: "", ...env } });
  return { code: r.status, out: r.stdout, err: r.stderr };
};

/** Runs a node script a test wrote, alongside others, and rejects when it fails. */
const child = (script, args) =>
  new Promise((resolve, reject) => {
    const c = spawn(process.execPath, [script, ...args], { cwd: tmp, stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    c.stderr.on("data", (d) => (err += d));
    c.on("error", reject);
    c.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`child exited ${code}: ${err.slice(-2000)}`))));
  });

test("board: two writers posting at once keep every number, once", async () => {
  const T = await lib("lib/tasks.mjs");
  const task = T.newTask(PROJECT, { request: "Two writers", steps: [] });
  const script = join(tmp, "post.mjs");
  writeFileSync(script, `
    const T = await import(${JSON.stringify(TASKS)});
    const [root, id, who] = process.argv.slice(2);
    for (let i = 0; i < 50; i++) T.post(root, id, { kind: "note", text: \`\${who} \${i}\`, from: who });
  `);
  await Promise.all([child(script, [PROJECT, task.id, "one"]), child(script, [PROJECT, task.id, "two"])]);
  const entries = T.board(PROJECT, task.id);
  assert.equal(entries.length, 100);
  assert.deepEqual(entries.map((e) => e.n).sort((a, b) => a - b), Array.from({ length: 100 }, (_, i) => i + 1));
  assert.deepEqual([...new Set(entries.map((e) => e.from))].sort(), ["one", "two"]);
});

test("task steps: two writers starting steps at once lose no update", async () => {
  const T = await lib("lib/tasks.mjs");
  const steps = Array.from({ length: 40 }, (_, i) => `Step ${i + 1}`);
  const task = T.newTask(PROJECT, { request: "Forty steps", steps });
  const script = join(tmp, "steps.mjs");
  writeFileSync(script, `
    import { spawnSync } from "node:child_process";
    const [bh, root, id, from, to] = process.argv.slice(2);
    for (let n = Number(from); n <= Number(to); n++) {
      const r = spawnSync(process.execPath, [bh, "task", "step", id, String(n), "start"], { cwd: root, encoding: "utf8", env: { ...process.env, HC_TERMINAL_ID: "", BH_AGENT: "dev" } });
      if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
    }
  `);
  await Promise.all([child(script, [BH, PROJECT, task.id, "1", "20"]), child(script, [BH, PROJECT, task.id, "21", "40"])]);
  const saved = T.loadTask(PROJECT, task.id);
  assert.deepEqual(saved.steps.map((s) => s.status), Array(40).fill("active"));
  assert.deepEqual(saved.steps.map((s) => s.agent), Array(40).fill("dev"));
});

test("who a post and a step start are from: BH_AGENT, and --from/--agent wins", async () => {
  const T = await lib("lib/tasks.mjs");
  const task = T.newTask(PROJECT, { request: "Actor", steps: ["First", "Second"] });
  assert.equal(run(["board", "post", task.id, "note", "by the agent"], { BH_AGENT: "Dev" }).code, 0);
  assert.equal(run(["board", "post", task.id, "note", "named", "--from", "QA"], { BH_AGENT: "Dev" }).code, 0);
  assert.deepEqual(T.board(PROJECT, task.id).map((e) => e.from), ["Dev", "QA"]);
  assert.equal(run(["task", "step", task.id, "1", "start"], { BH_AGENT: "Dev" }).code, 0);
  // The Orchestrator marking it done must not take the worker's name over.
  assert.equal(run(["task", "step", task.id, "1", "done"], { BH_AGENT: "QA" }).code, 0);
  const step = T.loadTask(PROJECT, task.id).steps[0];
  assert.deepEqual([step.status, step.agent], ["done", "Dev"]);
  assert.equal(run(["task", "step", task.id, "2", "start"], { HC_TERMINAL_ID: "t9" }).code, 0);
  assert.equal(T.loadTask(PROJECT, task.id).steps[1].agent, "t9");
});

test("hc: a call that hangs is ended after its timeout, and says so", async () => {
  const { hc } = await lib("lib/team.mjs");
  const stand = join(tmp, "slow-hc.mjs");
  writeFileSync(stand, "setInterval(() => {}, 1000);\n");
  const was = process.env.BH_HC;
  process.env.BH_HC = stand;
  try {
    const r = hc(["wait", "--children", "any"], { timeout: 300 });
    assert.equal(r.code, 1);
    assert.match(r.err, /^hc wait timed out after 0\.3 s$/);
  } finally {
    if (was === undefined) delete process.env.BH_HC;
    else process.env.BH_HC = was;
  }
});

test("a turn whose harness goes silent ends with the idle error", async () => {
  const { turn, TURN_IDLE_MS } = await lib("lib/runner.mjs");
  assert.equal(TURN_IDLE_MS, 30 * 60 * 1000);
  const fake = join(tmp, "silent.mjs");
  writeFileSync(fake, "process.stdin.resume();\nsetInterval(() => {}, 1000);\n");
  const t = turn({
    agent: { harness: "pi", name: "Dev" },
    known: [{ key: "pi", run: [process.execPath, fake] }],
    state: {},
    key: "idle",
    brief: "brief",
    briefFile: join(tmp, "brief.md"),
    prompt: "hello",
    cwd: PROJECT,
    on: () => {},
    access: "standard",
    allow: [],
    acp: {},
    idleMs: 300,
  });
  const r = await t.done;
  assert.equal(r.cancelled, false);
  assert.equal(r.error, "no activity for 300 ms: stopped");
});
