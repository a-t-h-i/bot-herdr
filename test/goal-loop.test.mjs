// Step 2 tests: multi-iteration convergence, strict monotonic ratchet & revert, spend-ceiling
// pause vs stall/oscillation escalation, quota wait without burning iterations, crash/stale-PID
// recovery, and PID-claim mutual exclusion with bh improve apply.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "bh-goal-loop-"));
process.env.BH_APP_HOME = join(tmp, "app");
process.env.XDG_CONFIG_HOME = join(tmp, "xdg");

const T = await import(new URL("../mods/bot-herdr/engine/lib/tasks.mjs", import.meta.url));
const P = await import(new URL("../mods/bot-herdr/engine/lib/plans.mjs", import.meta.url));
const W = await import(new URL("../mods/bot-herdr/engine/lib/workspace.mjs", import.meta.url));
const G = await import(new URL("../mods/bot-herdr/engine/lib/goal.mjs", import.meta.url));
const IM = await import(new URL("../mods/bot-herdr/engine/lib/improve.mjs", import.meta.url));
const { writeJson } = await import(new URL("../mods/bot-herdr/engine/lib/core.mjs", import.meta.url));

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

function setupGoal({ criteriaMd, maxSpendUsd = 15 } = {}) {
  const dir = mkdtempSync(join(tmp, "repo-"));
  git(dir, "init", "-q", "-b", "main");
  put(dir, "README.md", "# goal repo\n");
  put(dir, "check-a.mjs", 'import { existsSync } from "node:fs"; process.exit(existsSync("a.txt") ? 0 : 1);\n');
  put(dir, "check-b.mjs", 'import { existsSync } from "node:fs"; process.exit(existsSync("b.txt") ? 0 : 1);\n');
  git(dir, "add", "-A");
  assert.equal(git(dir, "commit", "-q", "-m", "init").status, 0);

  const md = criteriaMd || `# Loop Goal\n\n## Status\nREADY\n\n### Done criteria\n- [command] \`node check-a.mjs\` → exit 0\n- [command] \`node check-b.mjs\` → exit 0\n`;
  const criteria = P.criteriaFromMarkdown(md);
  const task = T.newTask(dir, { request: "Converge goal", title: "Loop Goal", mode: "goal" });
  task.base = gitOut(dir, "rev-parse", "HEAD");
  task.git = W.createWorkspace({ cwd: dir, root: dir, name: "loop-goal", mode: "worktree" });
  G.initGoal(dir, task, { criteria, maxSpendUsd });
  T.saveTask(dir, task);
  return { dir, task, wt: task.git.path };
}

test("multi-iteration convergence produces bounded round prompts and handoff", () => {
  const { dir, task, wt } = setupGoal();

  // Round 1: fix c1 only
  put(wt, "a.txt", "a\n");
  const r1 = G.verifyGoal(dir, task.id, { hypothesis: "add a.txt" });
  assert.equal(r1.verdict, "FAIL");
  assert.deepEqual(r1.passed, ["c1"]);
  assert.deepEqual(r1.failed, ["c2"]);
  assert.equal(r1.improved, true);

  const plan = G.next(dir, { taskId: task.id });
  assert.equal(plan.continue, true);
  assert.equal(plan.iteration, 2);
  assert.ok(plan.prompt.split("\n").length <= 15, "round prompt must be bounded <= 15 lines");
  assert.match(plan.prompt, /✓ c1/);
  assert.match(plan.prompt, /✗ c2/);

  const handoff = G.goalHandoff(dir, task.id);
  assert.match(handoff, /Goal Handoff/);
  assert.match(handoff, /✓ c1/);

  // Round 2: fix c2 as well -> reached!
  put(wt, "b.txt", "b\n");
  const r2 = G.verifyGoal(dir, task.id, { hypothesis: "add b.txt" });
  assert.equal(r2.verdict, "PASS");
  assert.equal(r2.goal.status, "reached");
  assert.equal(G.next(dir, { taskId: task.id }).continue, false);
  assert.equal(G.next(dir, { taskId: task.id }).reason, "reached");
});

test("strict monotonic ratchet checkpoints best, archives regressed attempt, reverts tree, and logs bannedApproach", () => {
  const { dir, task, wt } = setupGoal();

  // Iter 1: pass c1 -> saved as best checkpoint
  put(wt, "a.txt", "good-a\n");
  const r1 = G.verifyGoal(dir, task.id, { hypothesis: "create a.txt" });
  assert.equal(r1.improved, true);
  assert.equal(r1.checkpointRef, G.bestRef(task.id));

  // Iter 2: break c1 while adding b.txt (regresses c1!)
  rmSync(join(wt, "a.txt"));
  put(wt, "b.txt", "only-b\n");
  const r2 = G.verifyGoal(dir, task.id, { hypothesis: "replace a with b" });
  assert.equal(r2.verdict, "FAIL");
  assert.deepEqual(r2.regressed, ["c1"]);
  assert.equal(r2.reverted, true);
  assert.equal(r2.attemptRef, G.iterRef(task.id, 2));

  // Worktree was reverted back to best: a.txt is back, b.txt is cleaned!
  assert.equal(existsSync(join(wt, "a.txt")), true);
  assert.equal(readFileSync(join(wt, "a.txt"), "utf8"), "good-a\n");
  assert.equal(existsSync(join(wt, "b.txt")), false);

  // Archived ref still exists in git
  const archivedSha = gitOut(wt, "rev-parse", "--verify", G.iterRef(task.id, 2));
  assert.match(archivedSha, /^[0-9a-f]{40}$/);

  // Gap Ledger captured lesson and bannedApproach
  const log = T.iterations(dir, task.id);
  assert.equal(log.length, 2);
  assert.equal(log[1].reverted, true);
  assert.match(log[1].lesson, /regressed c1/i);
  assert.match(log[1].bannedApproach, /replace a with b/);
});

test("spend ceiling pauses cleanly while stall escalates strategy without stopping early", () => {
  const { dir, task } = setupGoal({ maxSpendUsd: 5 });

  // Two flat failing iterations -> stall triggers escalation hint, NOT pause
  G.verifyGoal(dir, task.id, { hypothesis: "try 1" });
  G.verifyGoal(dir, task.id, { hypothesis: "try 2" });
  const plan = G.next(dir, { taskId: task.id });
  assert.equal(plan.continue, true);
  assert.equal(plan.stalled, true);
  assert.match(plan.prompt, /Escalate:/);

  // Quota exhaustion parks as wait without burning an iteration
  const waitPlan = G.next(dir, { taskId: task.id, lastTurn: { held: true, resetAt: new Date(Date.now() + 600_000).toISOString() } });
  assert.equal(waitPlan.continue, false);
  assert.equal(waitPlan.wait, true);
  assert.equal(waitPlan.reason, "quota_wait");

  // Spend over ceiling pauses cleanly
  T.recordUsage(dir, task.id, { at: new Date().toISOString(), agent: "orchestrator", costUsd: 5.5, ms: 1000 });
  const capped = G.next(dir, { taskId: task.id });
  assert.equal(capped.continue, false);
  assert.equal(capped.pause, true);
  assert.match(capped.reason, /spend_ceiling/);
});

test("crash recovery clears stale PID claim, reports orphaned children, and converges if tree is already fixed", () => {
  const { dir, task, wt } = setupGoal();
  // Simulate dead PID claim and orphaned open child
  writeJson(G.goalClaimFile(dir, task.id), { taskId: task.id, pid: 999999, at: new Date().toISOString(), token: "dead" });
  T.updateTask(dir, task.id, (t) => {
    t.children = [{ name: "dev-orphan", state: "open", path: join(dir, ".bot-herdr/worktrees/orphan") }];
  });
  // Tree already has both fixes from right before crash
  put(wt, "a.txt", "a\n");
  put(wt, "b.txt", "b\n");

  const rec = G.recoverGoal(dir, task.id);
  assert.equal(rec.ok, true);
  assert.equal(rec.clearedStaleClaim, true);
  assert.deepEqual(rec.orphanedChildren, ["dev-orphan"]);
  assert.equal(rec.verified.verdict, "PASS");
  assert.equal(rec.verified.goal.status, "reached");
});

test("live Goal PID claim blocks bh improve apply (mutual exclusion)", () => {
  const { dir, task } = setupGoal();
  const claim = G.acquireGoalClaim(dir, task.id);
  try {
    assert.throws(
      () => IM.applyExperiment(dir, { branch: "bh/improve-test", title: "test" }),
      /Goal .* is actively running/i
    );
  } finally {
    G.releaseGoalClaim(dir, task.id, claim.token);
  }
});
