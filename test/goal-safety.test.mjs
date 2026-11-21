// Step 2 adversarial tamper tests: oracle integrity, frozen contract digest, script hash
// verification, .npmrc preload injection, test sabotage vs legitimate existing-test updates,
// shell operator injection, path traversal, and missing-worktree refusal.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "bh-goal-safety-"));
process.env.BH_APP_HOME = join(tmp, "app");
process.env.XDG_CONFIG_HOME = join(tmp, "xdg");

const T = await import(new URL("../mods/bot-herdr/engine/lib/tasks.mjs", import.meta.url));
const P = await import(new URL("../mods/bot-herdr/engine/lib/plans.mjs", import.meta.url));
const W = await import(new URL("../mods/bot-herdr/engine/lib/workspace.mjs", import.meta.url));
const G = await import(new URL("../mods/bot-herdr/engine/lib/goal.mjs", import.meta.url));

after(() => {
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {}
});

const git = (cwd, ...args) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8" });
const gitOut = (cwd, ...args) => String(git(cwd, ...args).stdout ?? "").trim();
const put = (dir, rel, text) => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), text);
};

function setupTamperGoal() {
  const dir = mkdtempSync(join(tmp, "tamper-"));
  git(dir, "init", "-q", "-b", "main");
  put(dir, "README.md", "# tamper\n");
  put(dir, "scripts/verify.mjs", 'import { existsSync } from "node:fs"; process.exit(existsSync("ok.txt") ? 0 : 1);\n');
  put(dir, "test/existing.test.mjs", 'import { test } from "node:test";\ntest("existing", () => { if (1 !== 1) throw new Error(); });\n');
  git(dir, "add", "-A");
  assert.equal(git(dir, "commit", "-q", "-m", "init").status, 0);

  const md = `# Tamper Goal\n\n## Status\nREADY\n\n### Done criteria\n- [command] \`node scripts/verify.mjs\` → exit 0\n- [file] \`ok.txt\` exists\n`;
  const plan = P.newPlan(dir, { idea: "Tamper goal", title: "Tamper Goal" });
  P.writeDraft(plan, md, { status: "ready" });
  P.savePlan(dir, plan);

  const task = T.newTask(dir, { request: "Tamper goal", title: "Tamper Goal", plan: plan.id, mode: "goal" });
  task.base = gitOut(dir, "rev-parse", "HEAD");
  task.git = W.createWorkspace({ cwd: dir, root: dir, name: "tamper-goal", mode: "worktree" });
  G.initGoal(dir, task, { criteria: plan.goal.criteria, maxSpendUsd: 15 });
  T.saveTask(dir, task);
  return { dir, plan, task, wt: task.git.path };
}

test("mutating plan.md or task.json criteria cannot bypass frozen DATA/goals contract", () => {
  const { dir, plan, task } = setupTamperGoal();

  // Attacker weakens plan.md and task.json criteria in repo
  P.writeDraft(plan, "# Tamper Goal\n\n## Status\nREADY\n\n### Done criteria\n- [file] `README.md` exists\n", { status: "ready" });
  P.savePlan(dir, plan);
  T.updateTask(dir, task.id, (t) => {
    t.goal.criteria = [{ id: "c1", kind: "file", path: "README.md", text: "README.md exists", required: true, verdict: "PASS" }];
    t.goal.status = "reached";
  });

  // Verifier evaluates frozen contract (scripts/verify.mjs + ok.txt), NOT mutated task.json/plan.md!
  const res = G.verifyGoal(dir, task.id);
  assert.equal(res.verdict, "FAIL");
  assert.equal(res.criteria.length, 2);
  assert.deepEqual(res.failed, ["c1", "c2"]);
});

test("tampering with frozen contract JSON fails SHA-256 digest verification", () => {
  const { dir, task } = setupTamperGoal();
  const cPath = G.contractPath(task.id);
  const raw = JSON.parse(readFileSync(cPath, "utf8"));
  raw.criteria = [{ id: "c1", kind: "file", path: "README.md", text: "README.md exists", required: true }];
  writeFileSync(cPath, JSON.stringify(raw, null, 2));

  assert.throws(() => G.verifyGoal(dir, task.id), /digest mismatch/i);
  assert.equal(G.assertGoalDone(dir, T.loadTask(dir, task.id)).ok, false);
});

test("editing referenced Goal verification script is blocked and reverted by ratchet", () => {
  const { dir, task, wt } = setupTamperGoal();
  const origScript = readFileSync(join(wt, "scripts/verify.mjs"), "utf8");

  // Attacker neuters scripts/verify.mjs to exit 0 unconditionally
  put(wt, "scripts/verify.mjs", "process.exit(0);\n");
  put(wt, "ok.txt", "yes\n");
  const res = G.verifyGoal(dir, task.id);
  assert.equal(res.verdict, "FAIL");
  assert.ok(res.tamperViolations.some((v) => v.rule === "goal_script_tampered"));
  assert.equal(res.reverted, true);
  assert.equal(readFileSync(join(wt, "scripts/verify.mjs"), "utf8"), origScript);
});

test("untracked .npmrc preload and test sabotage are blocked while normal existing-test updates are allowed", () => {
  const { dir, task, wt } = setupTamperGoal();

  // 1. Untracked .npmrc preload blocked
  put(wt, ".npmrc", "node-options=--import=./evil.mjs\n");
  put(wt, "ok.txt", "yes\n");
  const rNpmrc = G.verifyGoal(dir, task.id, { noRevert: true });
  assert.equal(rNpmrc.verdict, "FAIL");
  assert.ok(rNpmrc.tamperViolations.some((v) => v.file === ".npmrc"));
  rmSync(join(wt, ".npmrc"));

  // 2. Test sabotage (test.skip / process.exit) blocked
  put(wt, "test/existing.test.mjs", 'import { test } from "node:test";\ntest.skip("existing", () => {});\n');
  const rSabotage = G.verifyGoal(dir, task.id, { noRevert: true });
  assert.equal(rSabotage.verdict, "FAIL");
  assert.ok(rSabotage.tamperViolations.some((v) => v.rule === "goal_test_sabotage"));

  // 3. Normal legitimate update to existing project test is ALLOWED ("Freeze Goal checks only")
  put(wt, "test/existing.test.mjs", 'import { test } from "node:test";\ntest("existing updated", () => { if (2 !== 2) throw new Error(); });\n');
  const rClean = G.verifyGoal(dir, task.id);
  assert.equal(rClean.tamperViolations.length, 0);
  assert.equal(rClean.verdict, "PASS");
});

test("shell metacharacters in command criteria and path traversal in file criteria are rejected", () => {
  assert.throws(() => G.parseArgv("node a.mjs; rm -rf /"), /Shell operators/);
  assert.throws(() => G.parseArgv("node a.mjs | cat"), /Shell operators/);
  assert.throws(() => G.parseArgv("echo $(whoami)"), /Shell operators/);

  const dir = mkdtempSync(join(tmp, "trav-"));
  git(dir, "init", "-q", "-b", "main");
  put(dir, "README.md", "hi\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "init");
  const task = T.newTask(dir, { request: "trav", title: "Trav", mode: "goal" });
  task.base = gitOut(dir, "rev-parse", "HEAD");
  task.git = W.createWorkspace({ cwd: dir, root: dir, name: "trav", mode: "worktree" });
  G.initGoal(dir, task, { criteria: [{ id: "c1", kind: "file", path: "../../etc/passwd", text: "../../etc/passwd exists" }] });
  T.saveTask(dir, task);

  const r = G.verifyGoal(dir, task.id);
  assert.equal(r.verdict, "FAIL");
  assert.match(r.criteria[0].observed, /escapes repo/i);
});

test("missing worktree refuses verification instead of silently checking main checkout", () => {
  const { dir, task, wt } = setupTamperGoal();
  // Create ok.txt ONLY in main checkout, delete the Goal worktree
  put(dir, "ok.txt", "in-main\n");
  rmSync(wt, { recursive: true, force: true });

  assert.throws(() => G.verifyGoal(dir, task.id), /worktree .* is gone/i);
});
