// The gate reads the real change: `bh check` says what ran and keeps a receipt, a task's worktree
// is the tree it checks, untracked files are read, and a classifier "none" cannot cancel an area
// the rules hit.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const tmp = mkdtempSync(join(tmpdir(), "bh-verify-"));
const APP = join(tmp, "app");
mkdirSync(APP, { recursive: true });
process.env.BH_APP_HOME = APP;
process.env.XDG_CONFIG_HOME = join(tmp, "xdg");

const BH = fileURLToPath(new URL("../mods/bot-herdr/engine/bh.mjs", import.meta.url));
const REPO = fileURLToPath(new URL("..", import.meta.url));
const lib = (name) => import(new URL(`../mods/bot-herdr/engine/${name}`, import.meta.url));

/** Runs bh as the chat does, with these agent variables. */
const run = (args, cwd, env = {}) => {
  const r = spawnSync(process.execPath, [BH, ...args], { cwd, encoding: "utf8", env: { ...process.env, BH_APP_HOME: APP, XDG_CONFIG_HOME: join(tmp, "xdg"), HC_TERMINAL_ID: "", BH_AGENT: "", BH_PARENT: "", BH_LEAD: "", BH_STEP: "", ...env } });
  return { code: r.status, out: r.stdout, err: r.stderr };
};

const git = (cwd, ...args) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8" });

/** A git project with one commit holding these files. */
function project(files) {
  const dir = mkdtempSync(join(tmp, "proj-"));
  git(dir, "init", "-q");
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "init");
  return dir;
}

test("testsFor finds the engine's own tests by the path tail they name", async () => {
  const { testsFor } = await lib("scripts/lib/common.mjs");
  const hits = testsFor(REPO, ["mods/bot-herdr/engine/lib/tasks.mjs"]);
  assert.ok(hits.get("mods/bot-herdr/engine/lib/tasks.mjs").includes("test/engine.test.mjs"));
});

test("qa-risk reads untracked content, manifest kinds and unreadable new source", async () => {
  const { readChange } = await lib("classifier/qa-risk.mjs");
  const dir = mkdtempSync(join(tmp, "untracked-"));
  const body = [...Array.from({ length: 119 }, (_, i) => `export const v${i} = ${i};`), "rmSync(path, { recursive: true });"].join("\n");
  writeFileSync(join(dir, "authkernel.mjs"), `${body}\n`);
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "p", version: "1.0.0" }));
  const reading = readChange({ files: ["authkernel.mjs"], diff: "", untracked: ["authkernel.mjs"], root: dir });
  assert.notEqual(reading.risk, "none");
  assert.ok(reading.lines >= 120, `lines ${reading.lines}`);
  assert.equal(reading.areas.destructive.strong, true);
  const manifest = readChange({ files: ["package.json"], diff: "", untracked: ["package.json"], root: dir });
  assert.ok(manifest.areas.dependency, "an untracked package.json is a dependency");
  const missing = readChange({ files: ["gone.mjs"], diff: "", untracked: ["gone.mjs"], root: dir });
  assert.equal(missing.risk, "medium");
});

test("a confident classifier cannot lower an area the rules hit below LOW", async () => {
  const { readChange, combineRisk } = await lib("classifier/qa-risk.mjs");
  const jev = { risk: "none", confidence: 0.9, areas: { security: 0.05 }, behaviour: 0.1, testsCover: 0 };
  const pathOnly = combineRisk(readChange({ files: ["src/auth/token.mjs"], diff: "" }), jev);
  assert.equal(pathOnly.risk, "low");
  const diff = "diff --git a/src/x.mjs b/src/x.mjs\n@@ -1,1 +1,1 @@\n-old\n+const password = readSecret();\n";
  const strong = combineRisk(readChange({ files: ["src/x.mjs"], diff }), jev);
  assert.equal(strong.risk, "medium");
});

test("a worktree task: qa-risk and bh check read its tree, untracked files included", async () => {
  const T = await lib("lib/tasks.mjs");
  const dir = project({ "src/a.mjs": "export const a = 1;\n" });
  const wt = join(dir, ".bot-herdr", "worktrees", "gate-check");
  mkdirSync(dirname(wt), { recursive: true });
  assert.equal(git(dir, "worktree", "add", "-q", "-b", "gate-check", wt, "HEAD").status, 0);
  writeFileSync(join(wt, "src", "a.mjs"), "export const a = 2;\n");
  writeFileSync(join(wt, "src", "wipe.mjs"), "rmSync(path, { recursive: true });\n");
  const task = T.newTask(dir, { request: "Gate", steps: ["Ship"] });
  T.updateTask(dir, task.id, (t) => {
    t.git = { mode: "worktree", branch: "gate-check", path: wt };
    t.base = git(dir, "rev-parse", "HEAD").stdout.trim();
  });
  const risk = JSON.parse(run(["classify", "qa-risk", "--task", task.id, "--json"], dir).out);
  assert.ok(["medium", "high"].includes(risk.risk), risk.risk);
  assert.equal(risk.qaRequired, true);
  const check = run(["check", "--task", task.id], dir);
  assert.equal(check.code, 0, check.err);
  assert.match(check.out, /Changed: 2 file\(s\)/);
  const receipts = T.checks(dir, task.id);
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].head, git(dir, "rev-parse", "HEAD").stdout.trim());
});

test("bh check falls back to the project's test command, and keeps a receipt", async () => {
  const T = await lib("lib/tasks.mjs");
  const dir = project({ "package.json": JSON.stringify({ name: "p", private: true, scripts: { test: "node -e \"console.log('suite ran')\"" } }), "lib/thing.mjs": "export const x = 1;\n" });
  writeFileSync(join(dir, "lib", "thing.mjs"), "export const x = 2;\n");
  const task = T.newTask(dir, { request: "Fallback", steps: ["One"] });
  const r = run(["check", "--task", task.id], dir, { BH_AGENT: "dev", BH_STEP: "1" });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /No targeted test covered the change: ran the full suite \(npm run test\)/);
  assert.match(r.out, /Ran: 0 lint, 0 typecheck, 0 tests \(full suite\)/);
  assert.match(r.out, /PASS/);
  const [receipt] = T.checks(dir, task.id);
  assert.deepEqual(receipt.ran, { lint: 0, typecheck: 0, tests: 0 });
  assert.equal(receipt.fallback, "npm run test");
  assert.equal(receipt.step, 1);
  assert.equal(receipt.from, "dev");
  assert.equal(receipt.command, "bh check");
  assert.match(receipt.diff, /^[0-9a-f]{40}$/);
  assert.equal(receipt.exit, 0);
});

test("bh check with no test command says NO CHECKS, never PASS", async () => {
  const T = await lib("lib/tasks.mjs");
  const dir = project({ "lib/thing.mjs": "export const x = 1;\n" });
  writeFileSync(join(dir, "lib", "thing.mjs"), "export const x = 2;\n");
  const task = T.newTask(dir, { request: "Nothing", steps: ["One"] });
  const r = run(["check", "--task", task.id], dir);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /NO CHECKS: nothing could verify these files/);
  assert.doesNotMatch(r.out, /^PASS/m);
  const receipts = T.checks(dir, task.id);
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].exit, 0);
});

/** The team Settings wrote: one QA, on Claude Code. */
function setQa() {
  mkdirSync(join(APP, "data", "bot-herdr"), { recursive: true });
  writeFileSync(join(APP, "data", "bot-herdr", "agents.json"), JSON.stringify({ agents: [{ role: "qa", harness: "claude", model: "", effort: "" }], known: [] }));
}

test("a review spawn's first message carries criteria, reports, receipts and the risk", async () => {
  const T = await lib("lib/tasks.mjs");
  const P = await lib("lib/plans.mjs");
  setQa();
  const dir = project({ "src/a.mjs": "export const a = 1;\n" });
  const plan = P.newPlan(dir, { idea: "Gate it" });
  P.writeDraft(plan, "### Steps\n1. Ship\n\n### Acceptance criteria\n- the gate reads the worktree\n- receipts are cited");
  P.savePlan(dir, plan);
  const task = T.newTask(dir, { request: "Gate", plan: plan.id, steps: ["Ship"] });
  T.report(dir, task.id, { step: 1, file: `.bot-herdr/tasks/${task.id}/reports/dev.md`, summary: "shipped it", from: "dev" });
  T.recordCheck(dir, task.id, { at: new Date().toISOString(), from: "dev", step: 1, command: "bh check", base: null, head: git(dir, "rev-parse", "HEAD").stdout.trim(), diff: "0123456789abcdef", ran: { lint: 0, typecheck: 0, tests: 4 }, fallback: null, exit: 0 });
  const log = join(tmp, "hc.log");
  const stand = join(tmp, "fake-hc.mjs");
  writeFileSync(stand, "import { appendFileSync } from \"node:fs\";\nappendFileSync(process.env.BH_HC_LOG, JSON.stringify(process.argv.slice(2)) + \"\\n\");\n");
  const r = run(["spawn", "qa", "--review", "--task", task.id, "--name", "qa-gate", "review it"], dir, { BH_HC: stand, BH_HC_LOG: log });
  assert.equal(r.code, 0, r.err);
  const message = JSON.parse(readFileSync(log, "utf8").split("\n").filter(Boolean).at(-1)).at(-1);
  assert.match(message, /### Acceptance criteria\n- the gate reads the worktree\n- receipts are cited/);
  assert.match(message, new RegExp(`- step 1: \\.bot-herdr/tasks/${task.id}/reports/dev\\.md — shipped it`));
  assert.match(message, /### Check receipts/);
  assert.match(message, /ran 0 lint, 0 typecheck, 4 tests, exit 0/);
  assert.match(message, /QA risk: MEDIUM/);
  assert.match(message, /not classified/i);
});

test("bh gate records the verdict and round, and bh task show prints it", async () => {
  const T = await lib("lib/tasks.mjs");
  const dir = project({ "src/a.mjs": "export const a = 1;\n" });
  const task = T.newTask(dir, { request: "Gate", steps: ["One"] });
  assert.equal(run(["gate", task.id, "--verdict", "CHANGES_REQUIRED", "--file", ".bot-herdr/x.md", "fix the lock"], dir, { BH_AGENT: "qa" }).code, 0);
  assert.equal(run(["gate", task.id, "--verdict", "PASS", "--file", ".bot-herdr/y.md", "all good"], dir, { BH_AGENT: "qa" }).code, 0);
  const gates = T.loadTask(dir, task.id).gates;
  assert.deepEqual(gates.map((g) => [g.round, g.verdict]), [[1, "CHANGES_REQUIRED"], [2, "PASS"]]);
  assert.equal(gates[0].from, "qa");
  assert.match(gates[1].head, /^[0-9a-f]{40}$/);
  assert.deepEqual(T.board(dir, task.id).filter((e) => e.kind === "done").map((e) => e.file), [".bot-herdr/x.md", ".bot-herdr/y.md"]);
  assert.match(run(["task", "show", task.id], dir).out, /gate: round 2 PASS — all good/);
});

test("the review brief says each rule once and trusts a matching receipt", async () => {
  setQa();
  const r = run(["brief", "qa", "--mode", "review"], REPO);
  assert.equal(r.code, 0, r.err);
  assert.equal((r.out.match(/^## Budget/gm) ?? []).length, 1);
  assert.equal((r.out.match(/^## Verdict/gm) ?? []).length, 1);
  assert.equal((r.out.match(/cite it, do not re-run/g) ?? []).length, 1);
  assert.match(r.out, /Re-run anything else you rely on/);
  assert.doesNotMatch(r.out, /Do not re-run a check the worker ran/);
  assert.doesNotMatch(r.out, /Do not blindly trust/);
});
