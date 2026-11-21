// Step 3 tests: continuous knowledge pruning (dead paths, obsolete tags, archived script refs,
// preserving user-noted bullets, auto-fold on task done), script usage telemetry, repeating-step
// script promotion candidates in analyze(), and relevance-based script auditing/pruning that
// archives stale/broken project scripts while protecting built-ins and active Goal scripts.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const tmp = mkdtempSync(join(tmpdir(), "bh-ks-life-"));
const appHome = join(tmp, "app");
const xdg = join(tmp, "xdg");
process.env.BH_APP_HOME = appHome;
process.env.XDG_CONFIG_HOME = xdg;

const BH = fileURLToPath(new URL("../mods/bot-herdr/engine/bh.mjs", import.meta.url));
const K = await import(new URL("../mods/bot-herdr/engine/lib/knowledge.mjs", import.meta.url));
const S = await import(new URL("../mods/bot-herdr/engine/lib/scripts.mjs", import.meta.url));
const T = await import(new URL("../mods/bot-herdr/engine/lib/tasks.mjs", import.meta.url));
const G = await import(new URL("../mods/bot-herdr/engine/lib/goal.mjs", import.meta.url));
const W = await import(new URL("../mods/bot-herdr/engine/lib/workspace.mjs", import.meta.url));
const IM = await import(new URL("../mods/bot-herdr/engine/lib/improve.mjs", import.meta.url));

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

function makeRepo() {
  const dir = mkdtempSync(join(tmp, "repo-"));
  git(dir, "init", "-q", "-b", "main");
  put(dir, "src/alive.mjs", "export const ok = true;\n");
  git(dir, "add", "-A");
  assert.equal(git(dir, "commit", "-q", "-m", "init").status, 0);
  return dir;
}

test("knowledge.fold prunes dead repo paths and [obsolete] entries while preserving live paths and user notes", () => {
  const dir = makeRepo();
  K.write(dir, "dev", [
    "# dev: what I know about this project",
    "",
    "## Facts",
    "- Live module `src/alive.mjs` exports ok",
    "- Deleted module `src/removed_legacy.mjs` used old schema",
    "- Noted legacy `src/noted_deleted.mjs` must stay because user pinned it",
    "- [obsolete] Old deployment command no longer used",
    "",
  ].join("\n"));
  K.note(dir, "dev", "noted_deleted.mjs", "Keep this historical context");

  const res = K.fold(dir, "dev");
  assert.equal(res.changed, true);
  assert.equal(res.prunedStale, 2);
  assert.equal(res.archived, true);

  const afterText = K.read(dir, "dev");
  assert.match(afterText, /src\/alive\.mjs/);
  assert.match(afterText, /src\/noted_deleted\.mjs/);
  assert.doesNotMatch(afterText, /src\/removed_legacy\.mjs/);
  assert.doesNotMatch(afterText, /\[obsolete\]/);
});

test("bh scripts run logs usage telemetry and improve.analyze surfaces repeating-step promotion candidates", () => {
  const dir = makeRepo();
  put(dir, "tmp-ok.mjs", "// purpose: test helper\n// usage: bh scripts run test_helper\nprocess.exit(0);\n");
  S.save(dir, join(dir, "tmp-ok.mjs"), "test_helper");

  const code = S.run(dir, "test_helper", [], { capture: true }).code;
  assert.equal(code, 0);
  const usage = S.scriptUsage(dir);
  assert.equal(usage.length, 1);
  assert.equal(usage[0].name, "test_helper");
  assert.equal(usage[0].exit, 0);

  // Two tasks with the same repeating manual step -> promotion candidate
  T.newTask(dir, { request: "Task 1", steps: ["Regenerate database seed fixtures and validate schema"] });
  T.newTask(dir, { request: "Task 2", steps: ["Regenerate database seed fixtures and validate schema"] });
  const analysis = IM.analyze(dir, { window: 10 });
  const promo = analysis.findings.find((f) => f.kind === "script_promotion");
  assert.ok(promo, "expected script_promotion finding");
  assert.equal(promo.candidates[0].count, 2);
  assert.ok(promo.candidates[0].suggestedName.includes("regenerate"));
});

test("scripts audit/prune archives stale and broken project scripts, strips dead knowledge refs, and protects built-ins & active Goal scripts", () => {
  const dir = makeRepo();
  put(dir, "s-stale.mjs", "// purpose: stale job\nprocess.exit(0);\n");
  put(dir, "s-broken.mjs", "// purpose: broken job\nprocess.exit(1);\n");
  put(dir, "s-goal.mjs", "// purpose: active goal verifier\nprocess.exit(0);\n");

  const staleFile = S.save(dir, join(dir, "s-stale.mjs"), "stale_job");
  S.save(dir, join(dir, "s-broken.mjs"), "broken_job");
  S.save(dir, join(dir, "s-goal.mjs"), "goal_verifier");

  // Backdate stale_job file mtime by 45 days
  const oldTime = new Date(Date.now() - 45 * 86_400_000);
  utimesSync(staleFile, oldTime, oldTime);

  // Run broken_job 3 times failing -> classified broken
  for (let i = 0; i < 3; i++) S.run(dir, "broken_job", [], { capture: true });

  // Attach goal_verifier to an active Goal's frozen contract
  git(dir, "add", ".bot-herdr/scripts/goal_verifier.mjs");
  git(dir, "commit", "-q", "-m", "add goal verifier");
  const task = T.newTask(dir, { request: "Active goal", title: "Active Goal", mode: "goal" });
  task.base = gitOut(dir, "rev-parse", "HEAD");
  task.git = W.createWorkspace({ cwd: dir, root: dir, name: "active-goal", mode: "worktree" });
  G.initGoal(dir, task, { criteria: [{ id: "c1", kind: "command", command: "bh scripts run goal_verifier", text: "goal verifier passes" }] });
  T.saveTask(dir, task);

  // Also add a knowledge reference to stale_job
  K.write(dir, "dev", "# dev\n\n## Facts\n- Run `bh scripts run stale_job` for old imports\n- Keep `src/alive.mjs` clean\n");

  const protectedPaths = G.activeGoalScriptPaths(dir);
  const audit = S.auditScripts(dir, { staleDays: 30, protectedPaths });
  assert.equal(audit.scripts.find((s) => s.name === "stale_job").status, "unused");
  assert.equal(audit.scripts.find((s) => s.name === "broken_job").status, "broken");
  assert.equal(audit.scripts.find((s) => s.name === "goal_verifier").status, "protected");

  // Prune all via improve.pruneAll -> archives stale_job & broken_job, preserves goal_verifier, strips stale_job ref from knowledge
  const pruned = IM.pruneAll(dir, { staleDays: 30, protectedPaths });
  const archivedNames = pruned.scripts.archived.map((a) => a.name).sort();
  assert.deepEqual(archivedNames, ["broken_job", "stale_job"]);
  assert.equal(existsSync(staleFile), false);
  assert.ok(readdirSync(join(dir, ".bot-herdr", "scripts", "archive")).some((f) => f.startsWith("stale_job-")));
  assert.equal(existsSync(join(dir, ".bot-herdr", "scripts", "goal_verifier.mjs")), true);

  // Dead script ref stripped from dev knowledge
  const devKnowledge = K.read(dir, "dev");
  assert.doesNotMatch(devKnowledge, /stale_job/);
  assert.match(devKnowledge, /src\/alive\.mjs/);

  // Explicit prune of built-in check_changed or protected goal_verifier is refused/skipped
  const refused = S.pruneScripts(dir, { names: ["check_changed", "goal_verifier"], protectedPaths });
  assert.equal(refused.archived.length, 0);
  assert.equal(refused.skipped.length, 2);
});

test("bh task status done automatically folds stale knowledge entries", () => {
  const dir = makeRepo();
  K.write(dir, "dev", "# dev\n\n## Facts\n- [obsolete] old step\n- `src/alive.mjs` works\n");
  const t = T.newTask(dir, { request: "Finish task", steps: ["One"] });
  const env = { ...process.env, BH_APP_HOME: appHome, XDG_CONFIG_HOME: xdg };
  delete env.BH_AGENT;
  const r = spawnSync(process.execPath, [BH, "task", "status", t.id, "done"], { cwd: dir, encoding: "utf8", env });
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(K.read(dir, "dev"), /\[obsolete\]/);
  assert.match(K.read(dir, "dev"), /src\/alive\.mjs/);
});
