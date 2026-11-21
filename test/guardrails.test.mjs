// The engine's own guardrails: the built-in check scripts cannot be shadowed, and the circuit
// breakers (spend, turns, thrash, concurrency, depth, autonomous isolation) refuse work in the
// engine, not in prose. A merge always leaves a rollback ref behind.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const tmp = mkdtempSync(join(tmpdir(), "bh-guard-"));
const APP = join(tmp, "app");
const DATA = join(APP, "data", "bot-herdr");
mkdirSync(DATA, { recursive: true });
process.env.BH_APP_HOME = APP;
process.env.XDG_CONFIG_HOME = join(tmp, "xdg");

const BH = fileURLToPath(new URL("../mods/bot-herdr/engine/bh.mjs", import.meta.url));
const lib = (name) => import(new URL(`../mods/bot-herdr/engine/${name}`, import.meta.url));

// hc runs as a stand-in that only records what it was asked to start.
const LOG = join(tmp, "hc.jsonl");
const STAND = join(tmp, "fake-hc.mjs");
writeFileSync(STAND, "import { appendFileSync } from \"node:fs\";\nappendFileSync(process.env.BH_HC_LOG, JSON.stringify({ argv: process.argv.slice(2), depth: process.env.BH_SPAWN_DEPTH ?? null }) + \"\\n\");\n");
const hcCalls = () => (existsSync(LOG) ? readFileSync(LOG, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);

const ENV = (extra = {}) => ({ ...process.env, BH_APP_HOME: APP, XDG_CONFIG_HOME: join(tmp, "xdg"), HC_TERMINAL_ID: "", BH_AGENT: "", BH_PARENT: "", BH_STEP: "", BH_HC: STAND, BH_HC_LOG: LOG, ...extra });
const run = (args, cwd, extra = {}) => {
  const r = spawnSync(process.execPath, [BH, ...args], { cwd, encoding: "utf8", timeout: 30000, env: ENV(extra) });
  return { code: r.status, out: r.stdout, err: r.stderr };
};

const git = (cwd, ...args) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8" });
const gitOut = (cwd, ...args) => String(git(cwd, ...args).stdout ?? "").trim();

/** A git project with one commit holding src/a.mjs. */
function repo() {
  const dir = mkdtempSync(join(tmp, "proj-"));
  assert.equal(git(dir, "init", "-q", "-b", "main").status, 0);
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "a.mjs"), "export const a = 1;\n");
  git(dir, "add", "-A");
  assert.equal(git(dir, "commit", "-q", "-m", "init").status, 0);
  return dir;
}

/** The resilience config and access level one test starts from (defaults fill what is not given). */
function config({ autonomy = "guarded", guardrails = {}, agents = { access: "standard" } } = {}) {
  writeFileSync(join(DATA, "config.json"), JSON.stringify({ agents, resilience: { autonomy, fallbacks: [], guardrails: { ...guardrails } } }));
}

/** The same tree hash `bh check` records, so a check can be made to look like it ran on this tree. */
function hashOf(dir) {
  const raw = (...args) => String(spawnSync("git", args, { cwd: dir, encoding: "utf8" }).stdout ?? "");
  const parts = [raw("rev-parse", "HEAD").trim(), raw("diff", "HEAD", "--binary")];
  for (const f of raw("ls-files", "--others", "--exclude-standard").split("\n").filter(Boolean)) parts.push(f, readFileSync(join(dir, f), "utf8"));
  return createHash("sha1").update(parts.join("\n")).digest("hex");
}

const at = () => new Date().toISOString();

// ── The built-in check scripts cannot be shadowed ────────────────────────────────────────

test("a project script cannot take the place of the built-in check scripts", async () => {
  const S = await lib("lib/scripts.mjs");
  const dir = repo();
  mkdirSync(join(dir, ".bot-herdr", "scripts"), { recursive: true });
  writeFileSync(join(dir, ".bot-herdr", "scripts", "check_changed.mjs"), "// purpose: pretend to check\nconsole.log('SHADOWED');\n");
  writeFileSync(join(dir, ".bot-herdr", "scripts", "run_changed_tests.mjs"), "// purpose: pretend to test\nconsole.log('SHADOWED');\n");
  // the same name in another case is the same shadow: listing and saving both refuse it
  writeFileSync(join(dir, ".bot-herdr", "scripts", "CHECK_CHANGED.mjs"), "// purpose: pretend loudly\nconsole.log('SHADOWED');\n");
  writeFileSync(join(dir, ".bot-herdr", "scripts", "diff_summary.mjs"), "// purpose: my own summary\nconsole.log('mine');\n");

  const list = S.scripts(dir);
  assert.equal(list.filter((s) => s.name.toLowerCase() === "check_changed").length, 1, "one check_changed, and it is the engine's");
  for (const name of ["check_changed", "run_changed_tests"]) {
    const found = list.find((s) => s.name === name);
    assert.equal(found.source, "built-in", `${name} stays the engine's`);
    assert.match(found.file, /mods[\\/]bot-herdr[\\/]engine[\\/]scripts/);
    assert.doesNotMatch(readFileSync(S.find(dir, name).file, "utf8"), /SHADOWED/);
  }
  // any other script may still be the project's own
  assert.equal(list.find((s) => s.name === "diff_summary").source, "project");

  // and saving one under a protected name is refused, whatever the caller
  const mine = join(tmp, "mine.mjs");
  writeFileSync(mine, "// purpose: a pretender\nconsole.log('SHADOWED');\n");
  for (const name of ["check_changed", "run_changed_tests"]) {
    const r = run(["scripts", "save", mine, "--name", name], dir);
    assert.equal(r.code, 1, r.out);
    assert.match(r.err, /built-in check script/);
  }
  const byFile = run(["scripts", "save", join(dir, ".bot-herdr", "scripts", "check_changed.mjs")], dir);
  assert.equal(byFile.code, 1);
  assert.match(byFile.err, /built-in check script/);
  const byCase = run(["scripts", "save", mine, "--name", "CHECK_CHANGED"], dir);
  assert.equal(byCase.code, 1);
  assert.match(byCase.err, /built-in check script/);
});

// ── Circuit breakers ────────────────────────────────────────────────────────────────────

test("a task over its spend ceiling is paused and refuses to spawn", async () => {
  const T = await lib("lib/tasks.mjs");
  const dir = repo();
  config({ guardrails: { maxTaskSpendUsd: 5 } });
  const task = T.newTask(dir, { request: "Spend ceiling", steps: ["One"] });
  T.recordUsage(dir, task.id, { at: at(), agent: "Dev", costUsd: 6 });
  const before = hcCalls().length;
  const r = run(["spawn", "dev", "--task", task.id, "--name", "dev-1", "go"], dir);
  assert.equal(r.code, 1);
  assert.match(r.err, /over its \$5 ceiling/);
  assert.equal(T.loadTask(dir, task.id).status, "paused");
  assert.equal(hcCalls().length, before, "no child was started");
  const status = JSON.parse(run(["resilience", "status", "--task", task.id, "--json"], dir).out);
  assert.equal(status.task.spendUsd, 6);
  assert.equal(status.task.maxTaskSpendUsd, 5);
  assert.match(status.task.breaker, /ceiling/);
});

test("the thrash breaker catches identical failed checks and a pass clears it", async () => {
  const T = await lib("lib/tasks.mjs");
  const RZ = await lib("lib/resilience.mjs");
  const dir = repo();
  config();
  const task = T.newTask(dir, { request: "Thrash", steps: ["One"] });
  const { maxStepRetries } = RZ.RESILIENCE_DEFAULTS.guardrails;
  for (let i = 0; i < maxStepRetries; i++) T.recordCheck(dir, task.id, { at: at(), exit: 1, diff: "same-tree" });
  const tripped = RZ.checkTaskBudget(dir, task.id);
  assert.equal(tripped.ok, false);
  assert.equal(tripped.tripped, "thrash");
  assert.match(tripped.reason, /thrashing/);
  // the spawn that would re-run the same failing work is refused
  const r = run(["spawn", "dev", "--task", task.id, "--name", "dev-1", "go"], dir);
  assert.equal(r.code, 1);
  assert.match(r.err, /thrashing/);
  // a green check ends the run: it was not thrashing any more
  T.recordCheck(dir, task.id, { at: at(), exit: 0, diff: "same-tree" });
  assert.equal(RZ.checkTaskBudget(dir, task.id).ok, true);
  // a different tree each time is progress, not thrash
  T.recordCheck(dir, task.id, { at: at(), exit: 1, diff: "tree-a" });
  T.recordCheck(dir, task.id, { at: at(), exit: 1, diff: "tree-b" });
  T.recordCheck(dir, task.id, { at: at(), exit: 1, diff: "tree-c" });
  assert.equal(RZ.checkTaskBudget(dir, task.id).tripped, null);
});

test("the spawn concurrency limit refuses one child too many", async () => {
  const T = await lib("lib/tasks.mjs");
  const dir = repo();
  config({ guardrails: { maxConcurrentSpawns: 2 } });
  const task = T.newTask(dir, { request: "Concurrency", steps: ["One"] });
  T.updateTask(dir, task.id, (t) => {
    t.children = [{ name: "c1", agent: "Design", state: "open" }, { name: "c2", agent: "QA", state: "open" }];
    return t;
  });
  const before = hcCalls().length;
  const r = run(["spawn", "dev", "--task", task.id, "--name", "dev-1", "go"], dir);
  assert.equal(r.code, 1);
  assert.match(r.err, /2 child agents are already working \(the limit is 2\)/);
  assert.equal(hcCalls().length, before);
  // one is merged: there is room again
  T.updateTask(dir, task.id, (t) => {
    t.children[0].state = "merged";
    return t;
  });
  assert.equal(run(["spawn", "dev", "--task", task.id, "--name", "dev-1", "go"], dir).code, 0);
});

test("spawn depth is capped and carried into the child as BH_SPAWN_DEPTH and --depth", async () => {
  const T = await lib("lib/tasks.mjs");
  const TA = await lib("lib/team.mjs");
  const dir = repo();
  config({ guardrails: { maxSpawnDepth: 2 } });
  const task = T.newTask(dir, { request: "Depth", steps: ["One"] });
  const before = hcCalls().length;
  const tooDeep = run(["spawn", "dev", "--task", task.id, "--name", "dev-1", "go"], dir, { BH_SPAWN_DEPTH: "2" });
  assert.equal(tooDeep.code, 1);
  assert.match(tooDeep.err, /past the limit of 2/);
  assert.equal(hcCalls().length, before, "a refused spawn starts nothing");
  const ok = run(["spawn", "dev", "--task", task.id, "--name", "dev-2", "go"], dir, { BH_SPAWN_DEPTH: "1" });
  assert.equal(ok.code, 0, ok.err);
  assert.equal(hcCalls().at(-1).depth, "2"); // the child's own spawns are one level deeper
  const argv = hcCalls().at(-1).argv;
  assert.equal(argv[argv.indexOf("--depth") + 1], "2", "real hc run gets it as a flag, not only as env");
  // the flag the agent terminal is started with carries the same depth
  const agentArgv = TA.agentArgv({ name: "Dev" }, { mode: "child", depth: 2 });
  assert.deepEqual([agentArgv[agentArgv.indexOf("--depth")], agentArgv[agentArgv.indexOf("--depth") + 1]], ["--depth", "2"]);
});

test("a non-numeric or negative BH_SPAWN_DEPTH is no depth, not NaN past the limit", async () => {
  const T = await lib("lib/tasks.mjs");
  const dir = repo();
  config({ guardrails: { maxSpawnDepth: 1 } });
  const task = T.newTask(dir, { request: "Depth hygiene", steps: ["One"] });
  const spawned = (name, depth) => run(["spawn", "dev", "--task", task.id, "--shared", "--name", name, "go"], dir, { BH_SPAWN_DEPTH: depth });
  for (const junk of ["abc", "-4", ""]) {
    const r = spawned("dev-junk", junk);
    assert.equal(r.code, 0, `${JSON.stringify(junk)}: ${r.err}`);
    const argv = hcCalls().at(-1).argv;
    assert.equal(argv[argv.indexOf("--depth") + 1], "1", `${JSON.stringify(junk)} counts as no depth`);
  }
  // a real carried depth still enforces the limit
  const tooDeep = spawned("dev-2", "1");
  assert.equal(tooDeep.code, 1);
  assert.match(tooDeep.err, /past the limit of 1/);
});

test("`bh agent --depth 2` exports BH_SPAWN_DEPTH for the harness it starts", async () => {
  const dir = repo();
  config();
  const seen = join(tmp, "depth.jsonl");
  const harness = join(tmp, "fake-claude.mjs");
  const body = "import { appendFileSync, readFileSync } from \"node:fs\";\nreadFileSync(0, \"utf8\");\nappendFileSync(" + JSON.stringify(seen) + ", JSON.stringify({ depth: process.env.BH_SPAWN_DEPTH ?? null }) + \"\\n\");\nconsole.log(JSON.stringify({ type: \"system\", subtype: \"init\" }));\nconsole.log(JSON.stringify({ type: \"result\", subtype: \"success\", result: \"ok\" }));\n";
  writeFileSync(harness, body);
  writeFileSync(join(DATA, "agents.json"), JSON.stringify({ agents: [{ role: "dev", name: "Dev", harness: "claude" }], known: [{ key: "claude", name: "Claude Code", run: [process.execPath, harness], installed: true }] }));
  try {
    const r = run(["agent", "dev", "--depth", "2", "--", "hello"], dir);
    assert.equal(r.code, 0, r.err);
  } finally {
    rmSync(join(DATA, "agents.json"), { force: true });
  }
  const lines = readFileSync(seen, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].depth, "2"); // its own `bh spawn` is checked at depth 3
});

test("a paused task refuses spawns until it is resumed", async () => {
  const T = await lib("lib/tasks.mjs");
  const dir = repo();
  config();
  const task = T.newTask(dir, { request: "Paused", steps: ["One"] });
  const paused = run(["resilience", "pause", "--task", task.id], dir);
  assert.equal(paused.code, 0, paused.err);
  assert.equal(T.loadTask(dir, task.id).status, "paused");
  const before = hcCalls().length;
  const refused = run(["spawn", "dev", "--task", task.id, "--name", "dev-1", "go"], dir);
  assert.equal(refused.code, 1);
  assert.match(refused.err, /is paused: resume it with bh task status/);
  assert.equal(hcCalls().length, before, "a paused task starts nothing");
  assert.equal(run(["task", "status", task.id, "active"], dir).code, 0);
  assert.equal(run(["spawn", "dev", "--task", task.id, "--name", "dev-2", "go"], dir).code, 0);
});

test("autonomous mode without git isolation refuses to spawn", async () => {
  const T = await lib("lib/tasks.mjs");
  const dir = repo();
  config({ autonomy: "autonomous", guardrails: { requireGitIsolationInAutonomous: true } });
  const task = T.newTask(dir, { request: "Autonomy", steps: ["One"] });
  const before = hcCalls().length;
  const r = run(["spawn", "dev", "--task", task.id, "--name", "dev-1", "go"], dir);
  assert.equal(r.code, 1);
  assert.match(r.err, /autonomous mode needs git isolation/);
  assert.equal(hcCalls().length, before, "a refused spawn starts nothing");
  // the task has its own branch: it is isolated
  T.updateTask(dir, task.id, (t) => {
    t.git = { mode: "branch", branch: "bh/autonomous" };
    return t;
  });
  assert.equal(run(["spawn", "dev", "--task", task.id, "--name", "dev-1", "go"], dir).code, 0);
  // guarded mode needs no isolation
  config({ autonomy: "guarded" });
  const plain = T.newTask(dir, { request: "Guarded", steps: ["One"] });
  assert.equal(run(["spawn", "dev", "--task", plain.id, "--name", "dev-2", "go"], dir).code, 0);
});

test("a step is not done while the latest check failed", async () => {
  const T = await lib("lib/tasks.mjs");
  const dir = repo();
  config({ guardrails: { requireCheckBeforeDone: true } });
  const task = T.newTask(dir, { request: "Check before done", steps: ["One", "Two", "Three"] });
  // no check ever ran here: nothing to refuse (a small task may not need one)
  assert.equal(run(["task", "step", task.id, "1", "done"], dir).code, 0);
  // a failed check: the step is refused
  T.recordCheck(dir, task.id, { at: at(), exit: 1, diff: hashOf(dir) });
  const refused = run(["task", "step", task.id, "2", "done"], dir);
  assert.equal(refused.code, 1);
  assert.match(refused.err, /latest bh check failed \(exit 1\)/);
  assert.equal(T.loadTask(dir, task.id).steps[1].status, "todo");
  // --force is for a change that cannot be checked here
  assert.equal(run(["task", "step", task.id, "2", "done", "--force"], dir).code, 0);
  // a later green check is what the guard reads: the step can be done
  T.recordCheck(dir, task.id, { at: at(), exit: 0, diff: hashOf(dir) });
  assert.equal(run(["task", "step", task.id, "3", "done"], dir).code, 0);
  // with the guardrail off, a failing check does not block either
  config({ guardrails: { requireCheckBeforeDone: false } });
  const fresh = T.newTask(dir, { request: "Guard off", steps: ["One"] });
  T.recordCheck(dir, fresh.id, { at: at(), exit: 1, diff: hashOf(dir) });
  assert.equal(run(["task", "step", fresh.id, "1", "done"], dir).code, 0);
});

test("past the QA round limit, a gate verdict escalates to the user", async () => {
  const T = await lib("lib/tasks.mjs");
  const dir = repo();
  config({ guardrails: { maxQaRounds: 2 } });
  const task = T.newTask(dir, { request: "QA rounds", steps: ["One"] });
  const file = join(tmp, "gate.md");
  writeFileSync(file, "# gate\n");
  for (const round of [1, 2]) {
    const r = JSON.parse(run(["gate", task.id, "--verdict", "CHANGES_REQUIRED", "--round", String(round), "--file", file, "--json", "fix it"], dir).out);
    assert.equal(r.escalated, null);
  }
  const third = JSON.parse(run(["gate", task.id, "--verdict", "CHANGES_REQUIRED", "--round", "3", "--file", file, "--json", "still broken"], dir).out);
  assert.match(third.escalated, /past the 2 rounds the guardrails allow/);
  const note = T.board(dir, task.id).at(-1);
  assert.equal(note.kind, "note");
  assert.match(note.text, /needs the user's decision/);
});

// ── A merge is always recoverable ───────────────────────────────────────────────────────

test("bh merge keeps the child's tip as a rollback ref before removing its branch", async () => {
  const T = await lib("lib/tasks.mjs");
  const dir = repo();
  config();
  const task = T.newTask(dir, { request: "Rollback", steps: ["One"] });
  assert.equal(run(["spawn", "dev", "--task", task.id, "--step", "1", "--name", "dev-1", "build"], dir).code, 0);
  const child = T.loadTask(dir, task.id).children[0];
  writeFileSync(join(child.path, "src", "a.mjs"), "export const a = 2;\n");
  const m = run(["merge", "dev-1", "--task", task.id], dir);
  assert.equal(m.code, 0, m.err);
  assert.match(m.out, /Its tip is kept at refs\/bot-herdr\/rollback/);
  const ref = `refs/bot-herdr/rollback/${task.id}-dev-1`;
  assert.match(gitOut(dir, "rev-parse", ref), /^[0-9a-f]{40}$/);
  assert.equal(gitOut(dir, "branch", "--list", child.branch), "", "the branch is gone");
  assert.equal(T.loadTask(dir, task.id).children[0].rollback, ref);
  // dropping work keeps the same safety net
  assert.equal(run(["spawn", "dev", "--task", task.id, "--name", "dev-2", "more"], dir).code, 0);
  writeFileSync(join(dir, ".bot-herdr", "keep"), "");
  const dropped = run(["merge", "dev-2", "--task", task.id, "--drop"], dir);
  assert.equal(dropped.code, 0, dropped.err);
  assert.match(gitOut(dir, "rev-parse", `refs/bot-herdr/rollback/${task.id}-dev-2`), /^[0-9a-f]{40}$/);
});
