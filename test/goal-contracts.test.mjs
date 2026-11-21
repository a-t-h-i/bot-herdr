// Step 1 contract & CLI tests: plan DONE criteria parsing with stable IDs, starting plans as
// simple tasks vs isolated Goals, frozen DATA/goals/<taskId>.json contracts, Goal CLI commands,
// task summary/detail enrichment, done-lock without --force bypass, and personOnly amendments.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const tmp = mkdtempSync(join(tmpdir(), "bh-goal-contracts-"));
const appHome = join(tmp, "app");
const xdg = join(tmp, "xdg");
process.env.BH_APP_HOME = appHome;
process.env.XDG_CONFIG_HOME = xdg;

const BH = fileURLToPath(new URL("../mods/bot-herdr/engine/bh.mjs", import.meta.url));
const P = await import(new URL("../mods/bot-herdr/engine/lib/plans.mjs", import.meta.url));
const G = await import(new URL("../mods/bot-herdr/engine/lib/goal.mjs", import.meta.url));

after(() => {
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {}
});

const git = (cwd, ...args) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8" });
const put = (dir, rel, text) => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), text);
};

function bh(cwd, args, extraEnv = {}) {
  const env = { ...process.env, BH_APP_HOME: appHome, XDG_CONFIG_HOME: xdg, ...extraEnv };
  delete env.BH_AGENT;
  delete env.BH_LEAD;
  delete env.HC_TERMINAL_ID;
  Object.assign(env, extraEnv);
  const r = spawnSync(process.execPath, [BH, ...args], { cwd, encoding: "utf8", env });
  return { code: r.status ?? 1, out: String(r.stdout ?? ""), err: String(r.stderr ?? "") };
}

function makeRepo() {
  const dir = mkdtempSync(join(tmp, "proj-"));
  git(dir, "init", "-q", "-b", "main");
  put(dir, "README.md", "# test\n");
  put(dir, "scripts/verify.mjs", 'import { existsSync } from "node:fs";\nprocess.exit(existsSync("done.txt") ? 0 : 1);\n');
  git(dir, "add", "-A");
  assert.equal(git(dir, "commit", "-q", "-m", "init").status, 0);
  return dir;
}

const SAMPLE_DRAFT = `# Demo Goal

## Status
READY

## Steps
1. Create marker file
2. Verify script passes

### Done criteria
- [file] \`done.txt\` exists
- [command] \`node scripts/verify.mjs\` → exit 0
- [qa] Code is clean and well-structured
`;

test("criteriaFromMarkdown parses kinds and preserves stable IDs across edits", () => {
  const first = P.criteriaFromMarkdown(SAMPLE_DRAFT);
  assert.equal(first.length, 3);
  assert.deepEqual(first.map((c) => [c.id, c.kind]), [["c1", "file"], ["c2", "command"], ["c3", "qa"]]);
  assert.equal(first[0].path, "done.txt");
  assert.equal(first[1].command, "node scripts/verify.mjs");
  assert.equal(first[1].expect, "exit 0");

  // Reorder and add one: matching (kind, text) keeps its original ID
  const revised = `## DONE Criteria
- [command] \`node scripts/verify.mjs\` → exit 0
- [check] bh check passes
- [file] \`done.txt\` exists
`;
  const second = P.criteriaFromMarkdown(revised, first);
  assert.equal(second[0].id, "c2");
  assert.equal(second[1].id, "c4");
  assert.equal(second[2].id, "c1");
});

test("bh plan task --as goal validates readiness, criteria, isolation, and freezes contract outside worktree", () => {
  const dir = makeRepo();
  const created = JSON.parse(bh(dir, ["plan", "new", "Demo goal idea", "--json"]).out);

  // Refuses grilling plan
  const badStatus = bh(dir, ["plan", "task", created.id, "--as", "goal"]);
  assert.notEqual(badStatus.code, 0);
  assert.match(badStatus.err, /grilling/i);

  // Refuses ready plan with no criteria
  put(dir, ".bot-herdr/tmp/empty.md", "# Empty\n\n## Status\nREADY\n\n## Steps\n1. Do work\n");
  assert.equal(bh(dir, ["plan", "write", created.id, "--file", ".bot-herdr/tmp/empty.md", "--status", "ready"]).code, 0);
  const noCriteria = bh(dir, ["plan", "task", created.id, "--as", "goal"]);
  assert.notEqual(noCriteria.code, 0);
  assert.match(noCriteria.err, /no DONE criteria/i);

  // Write ready draft with DONE criteria
  put(dir, ".bot-herdr/tmp/draft.md", SAMPLE_DRAFT);
  const written = JSON.parse(bh(dir, ["plan", "write", created.id, "--file", ".bot-herdr/tmp/draft.md", "--status", "ready", "--json"]).out);
  assert.equal(written.goal.criteria.length, 3);

  // Refuses --no-git for Goals
  const noGit = bh(dir, ["plan", "task", created.id, "--as", "goal", "--no-git"]);
  assert.notEqual(noGit.code, 0);
  assert.match(noGit.err, /git isolation/i);

  // Starts as Goal with default worktree isolation + frozen contract in DATA/goals/<id>.json
  const started = bh(dir, ["plan", "task", created.id, "--as", "goal", "--max-spend", "25", "--json"]);
  assert.equal(started.code, 0, started.err);
  const task = JSON.parse(started.out);
  assert.equal(task.mode, "goal");
  assert.equal(task.goal.maxSpendUsd, 25);
  assert.equal(task.git.mode, "worktree");
  assert.ok(existsSync(task.git.path));

  const cPath = G.contractPath(task.id);
  assert.ok(existsSync(cPath), "frozen contract stored outside worktree under DATA/goals/");
  assert.ok(!cPath.startsWith(dir), "contract must live outside repo worktree");
  const loaded = G.loadFrozenContract(task.id);
  assert.equal(loaded.ok, true);
  assert.ok(loaded.contract.scriptHashes["scripts/verify.mjs"], "referenced script hash frozen");

  // Task summary & detail expose lightweight/full Goal fields
  const summaries = JSON.parse(bh(dir, ["task", "list", "--summary", "--json"]).out);
  const row = summaries.find((r) => r.id === task.id);
  assert.equal(row.mode, "goal");
  assert.equal(row.goal.total, 3);
  assert.equal(row.goal.done, 0);

  const detail = JSON.parse(bh(dir, ["task", "show", task.id, "--json"]).out);
  assert.equal(detail.mode, "goal");
  assert.equal(detail.allowedActions.verify, true);
  assert.equal(detail.allowedActions.done, false);
});

test("Goal verify, independent QA gate, done-lock without --force bypass, and personOnly amendments", () => {
  const dir = makeRepo();
  const p = JSON.parse(bh(dir, ["plan", "new", "Converge test", "--json"]).out);
  put(dir, ".bot-herdr/tmp/d.md", SAMPLE_DRAFT);
  assert.equal(bh(dir, ["plan", "write", p.id, "--file", ".bot-herdr/tmp/d.md", "--status", "ready"]).code, 0);
  const task = JSON.parse(bh(dir, ["plan", "task", p.id, "--as", "goal", "--json"]).out);
  const wt = task.git.path;

  // Initial verify fails (done.txt missing); [qa] stays PENDING while deterministic fails
  const v1 = bh(dir, ["goal", "verify", task.id, "--json"]);
  assert.equal(v1.code, 1);
  const r1 = JSON.parse(v1.out);
  assert.equal(r1.verdict, "FAIL");
  assert.equal(r1.criteria.find((c) => c.id === "c3").verdict, "PENDING");

  // Cannot mark Goal done even with --force
  const badDone = bh(dir, ["task", "status", task.id, "done", "--force"]);
  assert.notEqual(badDone.code, 0);
  assert.match(badDone.err, /not reached/i);

  // Fix deterministic criteria in the worktree
  put(wt, "done.txt", "ok\n");
  const v2 = bh(dir, ["goal", "verify", task.id, "--json"]);
  assert.equal(v2.code, 1); // still awaiting QA
  const r2 = JSON.parse(v2.out);
  assert.equal(r2.allDetPassed, true);
  assert.deepEqual(r2.pendingQa, ["c3"]);

  // Self-grading by dev agent is refused on bh gate PASS
  put(dir, ".bot-herdr/reports/qa.md", "# QA PASS\n");
  const devGate = bh(dir, ["gate", task.id, "--verdict", "PASS", "--file", ".bot-herdr/reports/qa.md", "looks good"], { BH_AGENT: "dev" });
  assert.notEqual(devGate.code, 0);
  assert.match(devGate.err, /independent QA/i);

  // Independent QA reviewer records PASS on the current tree
  const qaGate = bh(dir, ["gate", task.id, "--verdict", "PASS", "--file", ".bot-herdr/reports/qa.md", "verified c3"], { BH_AGENT: "qa-review" });
  assert.equal(qaGate.code, 0, qaGate.err);

  // Verify again -> PASS & reached!
  const v3 = bh(dir, ["goal", "verify", task.id, "--json"]);
  assert.equal(v3.code, 0, v3.err);
  const r3 = JSON.parse(v3.out);
  assert.equal(r3.verdict, "PASS");
  assert.equal(r3.goal.status, "reached");

  // Modifying tree after PASS invalidates done-lock
  put(wt, "extra.txt", "dirty\n");
  const dirtyDone = bh(dir, ["task", "status", task.id, "done", "--force"]);
  assert.notEqual(dirtyDone.code, 0);
  assert.match(dirtyDone.err, /tree changed/i);

  // Restore clean verified tree -> bh task status done succeeds
  rmSync(join(wt, "extra.txt"));
  const okDone = bh(dir, ["task", "status", task.id, "done"]);
  assert.equal(okDone.code, 0, okDone.err);
});

test("Agent may propose amendment (pauses Goal); only human (personOnly) may approve/reject", () => {
  const dir = makeRepo();
  const p = JSON.parse(bh(dir, ["plan", "new", "Amend test", "--json"]).out);
  put(dir, ".bot-herdr/tmp/d.md", SAMPLE_DRAFT);
  assert.equal(bh(dir, ["plan", "write", p.id, "--file", ".bot-herdr/tmp/d.md", "--status", "ready"]).code, 0);
  const task = JSON.parse(bh(dir, ["plan", "task", p.id, "--as", "goal", "--json"]).out);

  const prop = bh(dir, ["goal", "propose-amend", task.id, "--criterion", "c3", "--action", "drop", "--reason", "not needed"], { BH_AGENT: "orchestrator" });
  assert.equal(prop.code, 0, prop.err);

  const st = JSON.parse(bh(dir, ["goal", "status", task.id, "--json"]).out);
  assert.equal(st.status, "paused");
  assert.equal(st.pendingAmendment.criterionId, "c3");

  // Agent cannot approve its own amendment
  const agentApprove = bh(dir, ["goal", "approve-amend", task.id], { BH_AGENT: "orchestrator" });
  assert.notEqual(agentApprove.code, 0);
  assert.match(agentApprove.err, /user's to change/i);

  // Human approves -> frozen contract updated, digest valid, Goal resumed
  const humanApprove = bh(dir, ["goal", "approve-amend", task.id]);
  assert.equal(humanApprove.code, 0, humanApprove.err);
  const loaded = G.loadFrozenContract(task.id);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.contract.criteria.length, 2);
  assert.equal(loaded.contract.amendments.length, 1);

  const st2 = JSON.parse(bh(dir, ["goal", "status", task.id, "--json"]).out);
  assert.equal(st2.status, "running");
  assert.equal(st2.pendingAmendment, null);
});
