// goal.mjs after the redesign: an explicit --max-spend 0 is an uncapped ceiling (omitted keeps the
// $15 default), and the guardrails' maxStepRetries pauses a Goal that keeps failing identically.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "bh-goal-foundation-"));
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
const CRITERIA_MD = "# Goal\n\n## Status\nREADY\n\n### Done criteria\n- [command] `node check-a.mjs` → exit 0\n- [command] `node check-b.mjs` → exit 0\n";

/** A git repo, a worktree task and a frozen Goal; `maxSpendUsd === undefined` leaves it omitted. */
function setupGoal({ name, maxSpendUsd } = {}) {
  const dir = mkdtempSync(join(tmp, "repo-"));
  git(dir, "init", "-q", "-b", "main");
  put(dir, "README.md", "# goal repo\n");
  put(dir, "check-a.mjs", 'import { existsSync } from "node:fs"; process.exit(existsSync("a.txt") ? 0 : 1);\n');
  put(dir, "check-b.mjs", 'import { existsSync } from "node:fs"; process.exit(existsSync("b.txt") ? 0 : 1);\n');
  git(dir, "add", "-A");
  assert.equal(git(dir, "commit", "-q", "-m", "init").status, 0);

  const criteria = P.criteriaFromMarkdown(CRITERIA_MD);
  const task = T.newTask(dir, { request: "Converge goal", title: "Goal", mode: "goal" });
  task.base = gitOut(dir, "rev-parse", "HEAD");
  task.git = W.createWorkspace({ cwd: dir, root: dir, name, mode: "worktree" });
  G.initGoal(dir, task, { criteria, ...(maxSpendUsd === undefined ? {} : { maxSpendUsd }) });
  T.saveTask(dir, task);
  return { dir, task, wt: task.git.path, criteria };
}

test("spendCeiling keeps an explicit 0 and defaults only what is missing", () => {
  assert.equal(G.spendCeiling(0), 0);
  assert.equal(G.spendCeiling("0"), 0);
  assert.equal(G.spendCeiling(undefined), 15);
  assert.equal(G.spendCeiling(null), 15);
  assert.equal(G.spendCeiling(""), 15);
  assert.equal(G.spendCeiling(Number.NaN), 15);
  assert.equal(G.spendCeiling(40), 40);
});

test("--max-spend 0 freezes an uncapped ceiling, and the loop keeps going", () => {
  const { dir, task } = setupGoal({ name: "goal-zero", maxSpendUsd: 0 });
  assert.equal(task.goal.maxSpendUsd, 0);
  assert.equal(G.loadFrozenContract(task.id).contract.maxSpendUsd, 0);
  assert.equal(G.goalStatus(dir, task.id).budget.maxSpendUsd, 0);
  assert.equal(G.next(dir, { taskId: task.id }).continue, true);
});

test("an omitted maxSpendUsd keeps the $15 default", () => {
  const { dir, task } = setupGoal({ name: "goal-default" });
  assert.equal(task.goal.maxSpendUsd, 15);
  assert.equal(G.loadFrozenContract(task.id).contract.maxSpendUsd, 15);
});

test("consecutive identical failures pause at maxStepRetries with a blocker note", () => {
  const { dir, task } = setupGoal({ name: "goal-retry-cap", maxSpendUsd: 15 });
  const maxStepRetries = 3; // resilience' default guardrail

  let streak = 0;
  for (let i = 1; i <= maxStepRetries; i++) {
    const r = G.verifyGoal(dir, task.id, { hypothesis: `attempt ${i}` });
    assert.equal(r.verdict, "FAIL");
    streak += 1;
    assert.equal(r.sameErrorStreak, streak, `iteration ${i} streak`);
    assert.equal(r.retryPaused, i >= maxStepRetries);
  }

  const paused = T.loadTask(dir, task.id);
  assert.equal(paused.goal.status, "paused");
  assert.equal(paused.goal.sameErrorStreak, maxStepRetries);
  assert.match(paused.goal.reason, /^retry_cap \(3\/3 consecutive identical failures\)$/);

  const blockers = T.board(dir, task.id, { kinds: ["blocker"] });
  assert.equal(blockers.length, 1);
  assert.match(blockers[0].text, /retry cap: 3\/3 consecutive iterations failed the same way/);

  const decision = G.next(dir, { taskId: task.id });
  assert.equal(decision.continue, false);
  assert.equal(decision.pause, true);
  assert.match(decision.reason, /^retry_cap \(3\/3/);
});

test("a different failure resets the streak, and a resume clears it", () => {
  const { dir, task, wt } = setupGoal({ name: "goal-retry-reset", maxSpendUsd: 15 });

  const first = G.verifyGoal(dir, task.id, { hypothesis: "nothing yet" });
  assert.equal(first.sameErrorStreak, 1);
  const second = G.verifyGoal(dir, task.id, { hypothesis: "still nothing" });
  assert.equal(second.sameErrorStreak, 2);

  // c1 now passes: the remaining failure is a different wall, so the count starts over.
  put(wt, "a.txt", "a\n");
  const third = G.verifyGoal(dir, task.id, { hypothesis: "add a.txt" });
  assert.deepEqual(third.failed, ["c2"]);
  assert.equal(third.sameErrorStreak, 1);
  assert.equal(third.retryPaused, false);
  const afterThird = T.loadTask(dir, task.id);
  assert.equal(afterThird.goal.status, "running");
  assert.equal(afterThird.goal.sameErrorStreak, 1);
  assert.equal(G.next(dir, { taskId: task.id }).continue, true);

  // A user's resume starts a fresh count even after the cap paused the Goal.
  T.updateTask(dir, task.id, (t) => {
    t.goal.sameErrorStreak = 3;
    t.goal.lastErrorSig = "c2: exit 1 (expected exit 0)";
    return t;
  });
  const resumed = G.setGoalState(dir, task.id, "resume");
  assert.equal(resumed.goal.sameErrorStreak, 0);
  assert.equal(resumed.goal.lastErrorSig, null);
  assert.equal(G.next(dir, { taskId: task.id }).continue, true);
});
