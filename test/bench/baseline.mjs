// Baselines for the speed and token work (task t-20261120-n1rc, step 1; step 14 re-runs it):
// brief sizes per role and mode, `bh` command latency on a seeded project, and the time from
// starting an agent runner to the first prompt reaching its harness.
//
//   node test/bench/baseline.mjs [out.json]
//
// It runs on a temp app home, a temp HOME and a temp git project: nothing real is read or written.

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const BH = join(REPO, "mods/bot-herdr/engine/bh.mjs");
const lib = (name) => import(new URL(`../../mods/bot-herdr/engine/lib/${name}`, import.meta.url).href);

const root = mkdtempSync(join(tmpdir(), "bh-bench-"));
const home = join(root, "home");
const app = join(root, "app");
const project = join(root, "project");
const env = {
  ...process.env,
  HOME: home,
  XDG_CONFIG_HOME: join(home, ".config"),
  USERPROFILE: home,
  APPDATA: join(home, "AppData", "Roaming"),
  BH_APP_HOME: app,
  HC_TERMINAL_ID: "",
};
Object.assign(process.env, env);

const STEPS = ["Read the code", "Make the change", "Run the checks"];
const GENERIC = ["child", "panel"];
const MODES = { orchestrator: ["lead", ...GENERIC], qa: [...GENERIC, "review"] };

/** The fake harness: it notes when the prompt reached it, then ends the turn. */
const FAKE = `import { appendFileSync, readFileSync } from "node:fs";
const prompt = readFileSync(0, "utf8");
appendFileSync(process.env.BENCH_PROMPT_LOG, Date.now() + " " + prompt.length + "\\n");
console.log(JSON.stringify({ type: "result", subtype: "success", result: "ok" }));
`;

const median = (list) => {
  const sorted = [...list].sort((a, b) => a - b);
  return Math.round(sorted[Math.floor(sorted.length / 2)] * 10) / 10;
};

async function setup() {
  for (const dir of [home, app, project]) mkdirSync(dir, { recursive: true });
  const git = spawnSync("git", ["init", "-q"], { cwd: project, env, encoding: "utf8" });
  if (git.status !== 0) throw new Error(`git init failed in ${project}: ${git.stderr}`);
  const fake = join(root, "fake-claude.mjs");
  const noop = join(root, "fake-hc.mjs");
  writeFileSync(fake, FAKE);
  writeFileSync(noop, "process.exit(0);\n");
  const { writeJson } = await lib("core.mjs");
  const known = [{ key: "claude", name: "Claude Code", run: [process.execPath, fake], installed: true }];
  writeJson(join(app, "data", "bot-herdr", "agents.json"), { agents: [], known });
  return noop;
}

/** 50 tasks with 20 usage records each, through the engine's own store functions. */
async function seed() {
  const T = await lib("tasks.mjs");
  const { appendJsonl } = await lib("core.mjs");
  const ids = [];
  const usage = [];
  const at = Date.now();
  for (let i = 0; i < 50; i += 1) {
    const task = T.newTask(project, { request: `Benchmark task ${i + 1}: keep the briefs lean`, steps: STEPS, by: "bench" });
    ids.push(task.id);
    for (let j = 0; j < 20; j += 1) {
      const record = { at: new Date(at - j * 60000).toISOString(), agent: "Dev", harness: "claude", model: "claude-sonnet-5-5", task: task.id, step: (j % 3) + 1, input: 1200 + j, output: 240, cacheRead: 100, costUsd: 0.012, ms: 45000 };
      T.recordUsage(project, task.id, record);
      usage.push(record);
    }
  }
  const file = join(app, "data", "bot-herdr", "usage", "bench.jsonl");
  for (const record of usage) appendJsonl(file, record);
  return ids[Math.floor(ids.length / 2)];
}

function briefOpts(mode, task) {
  const opts = { mode, root: project, headless: true };
  if (mode !== "lead") opts.plan = `p-${task.slice(2)}`;
  if (mode === "child" || mode === "review") opts.task = task;
  if (mode === "child") opts.step = 1;
  return opts;
}

async function briefSizes(task) {
  const team = await lib("team.mjs");
  const { agents } = team.team();
  const bytes = {};
  for (const agent of agents) {
    for (const mode of MODES[agent.role] ?? GENERIC) bytes[`${agent.role}/${mode}`] = Buffer.byteLength(team.brief(agent, briefOpts(mode, task)));
  }
  const tokens = Object.fromEntries(Object.entries(bytes).map(([key, n]) => [key, Math.round(n / 3.6)]));
  return { briefBytes: bytes, briefTokensApprox: tokens };
}

function run(args, runEnv) {
  const started = process.hrtime.bigint();
  const r = spawnSync(process.execPath, [BH, ...args], { cwd: project, env: runEnv, encoding: "utf8", timeout: 120000 });
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  if (r.status !== 0) throw new Error(`bh ${args.join(" ")} failed: ${r.stderr || r.error?.message}`);
  return ms;
}

const commands = (id) => ({
  "bh task list --json": ["task", "list", "--json"],
  "bh task show <id> --json": ["task", "show", id, "--json"],
  "bh board read <id> --json": ["board", "read", id, "--json"],
  "bh team --json": ["team", "--json"],
  "bh tools claude": ["tools", "claude"],
  "bh usage --json": ["usage", "--json"],
});

async function bhTimes(id) {
  const times = {};
  for (const [label, args] of Object.entries(commands(id))) times[label] = median(Array.from({ length: 5 }, () => run(args, env)));
  return times;
}

/** Median of 5: the runner's own start to the fake harness reading its first prompt. */
async function spawnToPrompt(noop) {
  const times = [];
  for (let i = 0; i < 5; i += 1) {
    const log = join(root, `prompt-${i}.log`);
    const start = Date.now();
    const args = ["agent", "dev", "--mode", "child", "--name", "bench", "--", "Say hi."];
    run(args, { ...env, BH_HC: noop, BENCH_PROMPT_LOG: log, HC_TERMINAL_ID: `bench-${i}` });
    const [at, size] = readFileSync(log, "utf8").trim().split(" ").map(Number);
    if (!(at > 0) || !(size > 0)) throw new Error(`the fake harness logged no prompt (${at}, ${size})`);
    times.push(at - start);
  }
  return median(times);
}

const commit = () => spawnSync("git", ["rev-parse", "HEAD"], { cwd: REPO, encoding: "utf8" }).stdout?.trim() || null;

const NOTES = [
  "bh tools claude takes no --json: its output is always JSON (engine/bh.mjs:842).",
  "spawnToPromptMs: median of 5 runs of `bh agent dev --mode child` to the fake harness reading its prompt.",
];

async function gather() {
  const noop = await setup();
  const task = await seed();
  return {
    ...(await briefSizes(task)),
    bhMs: await bhTimes(task),
    spawnToPromptMs: await spawnToPrompt(noop),
    node: process.version,
    platform: process.platform,
    at: new Date().toISOString(),
    commit: commit(),
    notes: NOTES,
  };
}

async function main() {
  const out = process.argv[2] ?? "";
  try {
    const text = `${JSON.stringify(await gather(), null, 2)}\n`;
    if (out) {
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, text);
    }
    console.log(text);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

await main();
