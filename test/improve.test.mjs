// Self-improvement: the telemetry becomes ranked findings, knowledge folds under its caps, and a
// mod change is applied only through the safety/eval gate — rejected or rolled back (and paused)
// when anything fails, and reverted when the next window's metrics regress. The adversarial cases
// here are the boundary: no improvement may weaken the guards or shadow the built-in checks.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const tmp = mkdtempSync(join(tmpdir(), "bh-improve-"));
const APP = join(tmp, "app");
mkdirSync(join(APP, "data", "bot-herdr"), { recursive: true });
process.env.BH_APP_HOME = APP;
process.env.XDG_CONFIG_HOME = join(tmp, "xdg");

const BH = fileURLToPath(new URL("../mods/bot-herdr/engine/bh.mjs", import.meta.url));
const lib = (name) => import(new URL(`../mods/bot-herdr/engine/${name}`, import.meta.url));
const IM = await lib("lib/improve.mjs");
const K = await lib("lib/knowledge.mjs");
const T = await lib("lib/tasks.mjs");

const ENV = (extra = {}) => ({ ...process.env, BH_APP_HOME: APP, XDG_CONFIG_HOME: join(tmp, "xdg"), HC_TERMINAL_ID: "", BH_AGENT: "", BH_PARENT: "", BH_STEP: "", ...extra });
const cli = (args, cwd, extra = {}) => {
  const r = spawnSync(process.execPath, [BH, ...args], { cwd, encoding: "utf8", timeout: 60000, env: ENV(extra) });
  return { code: r.status, out: r.stdout, err: r.stderr };
};
const git = (cwd, ...args) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8" });
const gitOut = (cwd, ...args) => String(git(cwd, ...args).stdout ?? "").trim();
const at = () => new Date().toISOString();

const write = (dir, path, text) => {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
};

/** A git project with one commit holding `files`. */
function repo(files = { "src/a.mjs": "export const a = 1;\n" }) {
  const dir = mkdtempSync(join(tmp, "proj-"));
  assert.equal(git(dir, "init", "-q", "-b", "main").status, 0);
  git(dir, "config", "user.name", "t");
  git(dir, "config", "user.email", "t@t");
  git(dir, "config", "commit.gpgsign", "false");
  for (const [path, text] of Object.entries(files)) write(dir, path, text);
  git(dir, "add", "-A");
  assert.equal(git(dir, "commit", "-q", "-m", "init").status, 0);
  return dir;
}

/** A `bh/improve-*` branch off main holding one commit of `files`; main is checked out again. */
function improvement(dir, name, files) {
  const branch = `bh/improve-${name}`;
  assert.equal(git(dir, "checkout", "-q", "-b", branch, "main").status, 0);
  for (const [path, text] of Object.entries(files)) write(dir, path, text);
  assert.equal(git(dir, "add", "--", ...Object.keys(files)).status, 0);
  assert.equal(git(dir, "commit", "-q", "-m", `improve ${name}`).status, 0);
  assert.equal(git(dir, "checkout", "-q", "main").status, 0);
  return branch;
}

const passing = () => ({ ok: true });

// ── analyze: the window's telemetry, and the fix each finding names ─────────────────────────

test("analyze mines the window's tasks, checks, gates, spend and knowledge", async () => {
  const dir = repo();
  const a = T.newTask(dir, { request: "first", steps: ["one"] });
  T.recordCheck(dir, a.id, { at: at(), exit: 1, command: "bh check" });
  T.recordCheck(dir, a.id, { at: at(), exit: 1, command: "bh check" });
  T.recordCheck(dir, a.id, { at: at(), exit: 0, command: "bh check" });
  T.recordUsage(dir, a.id, { at: at(), agent: "dev", costUsd: 3, ms: 600000 });
  T.recordGate(dir, a.id, { verdict: "CHANGES_REQUIRED", file: "r.md", summary: "two majors" });
  T.recordGate(dir, a.id, { verdict: "CHANGES_REQUIRED", file: "r.md", summary: "still wrong" });
  T.post(dir, a.id, { kind: "blocker", text: "the tool is missing", from: "dev" });
  T.post(dir, a.id, { kind: "blocker", text: "the tool is still missing", from: "dev" });
  const b = T.newTask(dir, { request: "second", steps: ["one"] });
  T.recordCheck(dir, b.id, { at: at(), exit: 0, command: "bh check" });
  T.recordGate(dir, b.id, { verdict: "PASS", file: "r.md", summary: "ok" });
  T.recordUsage(dir, b.id, { at: at(), agent: "dev", costUsd: 1, ms: 60000 });
  K.write(dir, "dev", `# dev. what I know\n\n## Facts\n${Array.from({ length: 400 }, (_, i) => `- a fact number ${i} with plenty of words`).join("\n")}\n`);

  const answer = IM.analyze(dir, { window: 10 });
  const m = answer.metrics;
  assert.equal(m.tasks, 2);
  assert.equal(m.completedTasks, 0);
  assert.equal(m.totalChecks, 4);
  assert.equal(m.failedChecks, 2);
  assert.equal(m.checkFailRate, 0.5);
  assert.equal(m.totalGateRounds, 3);
  assert.equal(m.failedGateRounds, 2);
  assert.equal(m.qaFailRate, 0.6667);
  assert.equal(m.avgQaRounds, 1.5);
  assert.equal(m.blockerCount, 2);
  assert.equal(m.totalCostUsd, 4);
  assert.equal(m.avgCostUsd, 2);
  assert.equal(m.avgWorkedMs, 330000);

  const kinds = answer.findings.map((f) => f.kind);
  for (const kind of ["qa_failures", "check_failures", "blockers", "knowledge_bloat", "ratchet"]) assert.ok(kinds.includes(kind), `no ${kind} finding`);
  const weight = { high: 3, medium: 2, low: 1 };
  const ranked = answer.findings.map((f) => weight[f.severity]);
  assert.deepEqual(ranked, [...ranked].sort((x, y) => y - x), "findings are ranked, worst first");
  for (const f of answer.findings) assert.ok(/test|script|check|fold/i.test(f.recommendation), `${f.kind} names no deterministic fix`);
  const knowledge = answer.findings.find((f) => f.kind === "knowledge_bloat");
  assert.match(knowledge.recommendation, /bh improve fold/);
  assert.ok(knowledge.evidence.some((line) => line.startsWith("dev:")));

  assert.equal(IM.computeMetrics(dir, { since: "2999-01-01T00:00:00.000Z" }).tasks, 0, "since filters the window");
  assert.equal(IM.computeMetrics(dir, { window: 1 }).tasks, 1, "window keeps the newest tasks only");
});

// ── fold: shorter, without losing what the user marked ─────────────────────────────────────

test("fold dedupes, trims the oldest History, keeps user-noted bullets and archives the old file", async () => {
  const dir = repo();
  const facts = ["- keep this fact", "- KEEP  this   fact", "- a fact the user cares about", `- ${"long fact ".repeat(300)}`];
  const history = Array.from({ length: 120 }, (_, i) => `- history entry ${i} ${"x".repeat(60)}`);
  K.write(dir, "dev", ["# dev: what I know about this project", "", "## Facts", ...facts, "", "## History", ...history, ""].join("\n"));
  K.note(dir, "dev", "a fact the user cares about", "this one stays");

  const preview = K.fold(dir, "dev", { maxChars: 9000, briefTarget: 4000, dryRun: true });
  assert.equal(preview.changed, true);
  assert.ok(preview.removedEntries >= 70, `removed ${preview.removedEntries}`);
  assert.equal(K.read(dir, "dev").includes("history entry 119"), true, "dry run changes nothing");
  assert.equal(existsSync(join(dir, ".bot-herdr", "knowledge", "archive")), false, "a dry run writes no archive");

  const folded = K.fold(dir, "dev", { maxChars: 9000, briefTarget: 4000 });
  const text = K.read(dir, "dev");
  assert.equal(folded.changed, true);
  assert.equal(folded.archived, true);
  assert.ok(folded.afterChars <= 9000, `${folded.afterChars} is over the cap`);
  assert.equal(text.includes("history entry 0 "), false, "the oldest History entries went");
  assert.equal(text.includes("history entry 119"), true, "the newest History entry stays");
  assert.equal(text.includes("a fact the user cares about"), true, "a user-noted fact is never dropped");
  assert.equal((text.match(/- keep this fact/gi) ?? []).length, 1, "the duplicate fact is deduped");
  const archived = readdirSync(join(dir, ".bot-herdr", "knowledge", "archive"));
  assert.equal(archived.length, 1);
  assert.ok(archived[0].startsWith("dev-") && archived[0].endsWith(".md"));
  assert.ok(readFileSync(join(dir, ".bot-herdr", "knowledge", "archive", archived[0]), "utf8").includes("history entry 0 "), "the version before is archived");

  // Over the hard cap: the oldest non-noted Facts go, the noted one stays.
  const tight = K.fold(dir, "dev", { maxChars: 1500, briefTarget: 800 });
  const small = K.read(dir, "dev");
  assert.ok(tight.removedEntries > 0);
  assert.ok(small.length < text.length);
  assert.equal(small.includes("a fact the user cares about"), true, "the noted fact survives the Facts trim");
  assert.ok(readdirSync(join(dir, ".bot-herdr", "knowledge", "archive")).length >= 2);

  K.write(dir, "qa", "# qa\n\n## Facts\n- one\n");
  const all = K.foldAll(dir, { dryRun: true });
  assert.deepEqual(all.map((f) => f.agent).sort(), ["dev", "qa"]);
});

// ── The safety invariants: adversarial diffs must not pass ─────────────────────────────────

test("checkDiffSafety blocks the built-in check scripts and any shadow of them", () => {
  for (const file of ["mods/bot-herdr/engine/scripts/check_changed.mjs", "mods/bot-herdr/engine/scripts/run_changed_tests.mjs"]) {
    const v = IM.checkDiffSafety({ files: [`M\t${file}`] });
    assert.equal(v.ok, false, file);
    assert.equal(v.violations[0].rule, "protected_builtin_scripts");
  }
  for (const file of [".bot-herdr/scripts/check_changed.mjs", ".bot-herdr/scripts/CHECK_CHANGED.mjs", ".bot-herdr/scripts/run_changed_tests.py"]) {
    const v = IM.checkDiffSafety({ files: [`A\t${file}`] });
    assert.equal(v.ok, false, file);
    assert.equal(v.violations[0].rule, "protected_builtin_scripts", file);
  }
  const edited = IM.checkDiffSafety({
    files: ["M\tmods/bot-herdr/engine/lib/scripts.mjs"],
    diff: [
      "diff --git a/mods/bot-herdr/engine/lib/scripts.mjs b/mods/bot-herdr/engine/lib/scripts.mjs",
      "--- a/mods/bot-herdr/engine/lib/scripts.mjs",
      "+++ b/mods/bot-herdr/engine/lib/scripts.mjs",
      "@@ -14,1 +14,1 @@",
      "-export const PROTECTED_BUILTIN_SCRIPTS = new Set([\"check_changed\", \"run_changed_tests\"]);",
      "+export const PROTECTED_BUILTIN_SCRIPTS = new Set();",
    ].join("\n"),
  });
  assert.equal(edited.ok, false);
  assert.equal(edited.violations[0].rule, "protected_builtin_scripts");
});

test("checkDiffSafety blocks any edit to bh.mjs, personOnly's home, even one that adds a guard call", () => {
  const removal = [
    "diff --git a/mods/bot-herdr/engine/bh.mjs b/mods/bot-herdr/engine/bh.mjs",
    "--- a/mods/bot-herdr/engine/bh.mjs",
    "+++ b/mods/bot-herdr/engine/bh.mjs",
    "@@ -100,3 +100,1 @@",
    "-function personOnly(what) {",
    "-  if (process.env.BH_AGENT) throw new Error(what);",
    "-}",
    "+function personOnly() {}",
  ].join("\n");
  const blocked = IM.checkDiffSafety({ files: ["M\tmods/bot-herdr/engine/bh.mjs"], diff: removal });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.violations[0].rule, "protected_person_only");
  // The environment write that defeats the guard is an added line, not a removed one.
  const sneaky = IM.checkDiffSafety({ diff: "diff --git a/mods/bot-herdr/engine/bh.mjs b/mods/bot-herdr/engine/bh.mjs\n--- a/mods/bot-herdr/engine/bh.mjs\n+++ b/mods/bot-herdr/engine/bh.mjs\n@@ -1,0 +1,1 @@\n+process.env.BH_AGENT = \"\";\n" });
  assert.equal(sneaky.ok, false);
  assert.equal(sneaky.violations[0].rule, "protected_person_only");
  const tightening = IM.checkDiffSafety({ diff: "diff --git a/mods/bot-herdr/engine/bh.mjs b/mods/bot-herdr/engine/bh.mjs\n--- a/mods/bot-herdr/engine/bh.mjs\n+++ b/mods/bot-herdr/engine/bh.mjs\n@@ -1,0 +1,1 @@\n+        personOnly(\"Self-improvement resume\");\n" });
  assert.equal(tightening.ok, false, "bh.mjs is protected whole: no diff may touch it");
  assert.equal(tightening.violations[0].rule, "protected_person_only");
});

test("checkDiffSafety protects the guard files, the gate's own dependencies, the installer and the test command whole", () => {
  const cases = [
    ["mods/bot-herdr/engine/lib/workspace.mjs", "protected_self_guard"],
    ["install.mjs", "protected_self_guard"],
    ["mods/bot-herdr/engine/lib/core.mjs", "protected_access_control"],
    ["mods/bot-herdr/engine/lib/runner.mjs", "protected_access_control"],
    ["mods/bot-herdr/engine/lib/resilience.mjs", "protected_access_control"],
    ["mods/bot-herdr/engine/lib/agent.mjs", "protected_access_control"],
    ["mods/bot-herdr/roster.js", "protected_access_control"],
    ["mods/bot-herdr/engine/lib/scripts.mjs", "protected_builtin_scripts"],
    ["mods/bot-herdr/engine/scripts/lib/common.mjs", "protected_builtin_scripts"],
    ["mods/bot-herdr/engine/scripts/Run_Changed_Tests.mjs", "protected_builtin_scripts"],
    ["mods/bot-herdr/engine/bh.mjs", "protected_person_only"],
    ["package.json", "protected_test_weakening"],
  ];
  for (const [file, rule] of cases) {
    // An edit that names no guard at all: the file itself is the boundary.
    const diff = [`diff --git a/${file} b/${file}`, `--- a/${file}`, `+++ b/${file}`, "@@ -1,0 +1,1 @@", "+  return;"].join("\n");
    const v = IM.checkDiffSafety({ diff });
    assert.equal(v.ok, false, file);
    assert.ok(v.violations.some((x) => x.rule === rule), `${file}: ${JSON.stringify(v.violations)}`);
  }
  assert.equal(Object.isFrozen(IM.PROTECTED_FILE_PATTERNS[0]), true, "entries are deep-frozen");
  const eligible = ["mods/bot-herdr/engine/lib/tasks.mjs", "mods/bot-herdr/work.js", "mods/bot-herdr/engine/roles/worker.md", "mods/bot-herdr/engine/classifier/rules.json", "mods/bot-herdr/engine/scripts/locate.mjs", ".bot-herdr/scripts/my_job.mjs"];
  const fine = IM.checkDiffSafety({ files: [...eligible.map((f) => `M\t${f}`), "A\ttest/new-regression.test.mjs"] });
  assert.deepEqual(fine.violations, [], "the rest of the mod stays open to eval-gated improvement");
});

test("checkDiffSafety checks both sides of a rename or copy, from the listing or the diff header", () => {
  for (const [from, rule] of [
    ["mods/bot-herdr/engine/lib/improve.mjs", "protected_self_guard"],
    ["mods/bot-herdr/engine/scripts/check_changed.mjs", "protected_builtin_scripts"],
    ["mods/bot-herdr/engine/bh.mjs", "protected_person_only"],
    ["mods/bot-herdr/engine/lib/core.mjs", "protected_access_control"],
  ]) {
    const listed = IM.checkDiffSafety({ files: [`R095\t${from}\tmods/bot-herdr/engine/lib/moved.mjs`] });
    assert.ok(listed.violations.some((x) => x.rule === rule && x.file === from), `listing: ${from}`);
    const copied = IM.checkDiffSafety({ files: [`C100\t${from}\tmods/bot-herdr/engine/lib/copy.mjs`] });
    assert.ok(copied.violations.some((x) => x.rule === rule && x.file === from), `copy: ${from}`);
    const header = IM.checkDiffSafety({ diff: `diff --git a/${from} b/mods/bot-herdr/engine/lib/moved.mjs\nsimilarity index 100%\nrename from ${from}\nrename to mods/bot-herdr/engine/lib/moved.mjs\n` });
    assert.ok(header.violations.some((x) => x.rule === rule && x.file === from), `header: ${from}`);
  }
  const into = IM.checkDiffSafety({ files: ["R100\tmods/bot-herdr/engine/lib/tasks.mjs\tinstall.mjs"] });
  assert.equal(into.violations[0].rule, "protected_self_guard", "renaming onto a protected path counts too");
});

test("checkDiffSafety allows adding new test files and refuses modifying existing tests or sabotaging new ones", () => {
  const file = "test/guard.test.mjs";
  const diff = (...lines) => [`diff --git a/${file} b/${file}`, `--- a/${file}`, `+++ b/${file}`, "@@ -3,1 +3,2 @@", ...lines].join("\n");
  const editedExisting = IM.checkDiffSafety({ files: [`M\t${file}`], diff: diff("+  assert.ok(true);") });
  assert.equal(editedExisting.ok, false, "existing test files are immutable");
  assert.equal(editedExisting.violations[0].rule, "protected_test_weakening");
  const weakened = IM.checkDiffSafety({ files: [`M\t${file}`], diff: diff("-  assert.equal(a, 1);", "+  assert.ok(true);") });
  assert.equal(weakened.ok, false);
  assert.equal(weakened.violations[0].rule, "protected_test_weakening");
  const added = IM.checkDiffSafety({ files: ["A\ttest/new.test.mjs"], diff: "diff --git a/test/new.test.mjs b/test/new.test.mjs\nnew file mode 100644\n--- /dev/null\n+++ b/test/new.test.mjs\n@@ -0,0 +1,1 @@\n+test('x', () => {});\n" });
  assert.equal(added.ok, true, "a new test file is fine");
  const sabotagedNew = IM.checkDiffSafety({ files: ["A\ttest/bad.test.mjs"], diff: "diff --git a/test/bad.test.mjs b/test/bad.test.mjs\nnew file mode 100644\n--- /dev/null\n+++ b/test/bad.test.mjs\n@@ -0,0 +1,1 @@\n+process.exit(0);\n" });
  assert.equal(sabotagedNew.ok, false, "new test file with process.exit is refused");
  assert.equal(sabotagedNew.violations[0].rule, "protected_test_weakening");
});

test("checkDiffSafety blocks weakening the access checks in the files that enforce them", () => {
  const cases = [
    ["mods/bot-herdr/roster.js", "-export function limitArgs(agent) {", "+export function limitArgs() { return []; }"],
    ["mods/bot-herdr/engine/lib/runner.mjs", "-export function acpAllowed(kind, access, { command = \"\", allow = [] } = {}) {", "+export function acpAllowed() { return true; }"],
    ["mods/bot-herdr/engine/lib/resilience.mjs", "-const UNRESTRICTED = new Set([\"pi\", \"omp\"]);", "+const UNRESTRICTED = new Set([\"pi\", \"omp\", \"claude\"]);"],
    ["mods/bot-herdr/engine/lib/agent.mjs", "-      const allow = acpAllowed(call.kind, this.access, { command: textCmd, allow: this.allow }) || asks;", "+      const allow = true;"],
    ["mods/bot-herdr/engine/lib/core.mjs", "-export function accessOf() {", "+export function accessOf() { return { access: \"full\", allow: [], headless: true, git: \"off\", repoHistory: true };"],
    ["mods/bot-herdr/engine/lib/runner.mjs", "-export function claudeAccess(access, allow = []) {", "+export function claudeAccess() { return []; }"],
  ];
  for (const [file, before, after] of cases) {
    const diff = [`diff --git a/${file} b/${file}`, `--- a/${file}`, `+++ b/${file}`, "@@ -1,1 +1,1 @@", before, after].join("\n");
    const v = IM.checkDiffSafety({ files: [`M\t${file}`], diff });
    assert.equal(v.ok, false, file);
    assert.equal(v.violations[0].rule, "protected_access_control", file);
  }
});

test("checkDiffSafety blocks self-editing, the runtime config and deleted tests, and allows a real mod edit", () => {
  assert.equal(IM.checkDiffSafety({ files: ["M\tmods/bot-herdr/engine/lib/improve.mjs"] }).violations[0].rule, "protected_self_guard");
  for (const file of ["data/bot-herdr/config.json", "data/bot-herdr/agents.json", ".git/config"]) {
    const v = IM.checkDiffSafety({ files: [`M\t${file}`] });
    assert.equal(v.ok, false, file);
    assert.equal(v.violations[0].rule, "protected_runtime_config", file);
  }
  const deleted = IM.checkDiffSafety({ files: ["D\ttest/improve.test.mjs"] });
  assert.equal(deleted.ok, false);
  assert.equal(deleted.violations[0].rule, "protected_test_weakening");
  const renamed = IM.checkDiffSafety({ files: ["R100\ttest/guardrails.test.mjs\ttest/old.test.mjs"] });
  assert.equal(renamed.ok, false);
  assert.equal(renamed.violations[0].rule, "protected_test_weakening");

  const fine = IM.checkDiffSafety({
    files: ["M\tmods/bot-herdr/engine/lib/util.mjs", "A\ttest/new-helper.test.mjs"],
    diff: ["diff --git a/mods/bot-herdr/engine/lib/util.mjs b/mods/bot-herdr/engine/lib/util.mjs", "--- a/mods/bot-herdr/engine/lib/util.mjs", "+++ b/mods/bot-herdr/engine/lib/util.mjs", "@@ -1,1 +1,2 @@", " export const x = 1;", "+export const y = 2;"].join("\n"),
  });
  assert.deepEqual(fine.violations, []);
  assert.equal(fine.ok, true);
});

test("verifyBranchSafety reads the real diff of a branch (paths, hunks, deletes)", () => {
  const dir = repo({ "mods/bot-herdr/engine/lib/util.mjs": "export const x = 1;\n", "test/keep.test.mjs": "// a test\n" });
  const safe = improvement(dir, "safe", { "mods/bot-herdr/engine/lib/util.mjs": "export const x = 1;\nexport const y = 2;\n" });
  const ok = IM.verifyBranchSafety(dir, "main", safe);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.files, ["mods/bot-herdr/engine/lib/util.mjs"]);

  const shadow = improvement(dir, "shadow", { ".bot-herdr/scripts/CHECK_CHANGED.mjs": "// purpose: pass everything\n" });
  const bad = IM.verifyBranchSafety(dir, "main", shadow);
  assert.equal(bad.ok, false);
  assert.equal(bad.violations[0].rule, "protected_builtin_scripts");

  assert.equal(git(dir, "checkout", "-q", "-b", "bh/improve-gone", "main").status, 0);
  assert.equal(git(dir, "rm", "-q", "test/keep.test.mjs").status, 0);
  assert.equal(git(dir, "commit", "-q", "-m", "drop the test").status, 0);
  assert.equal(git(dir, "checkout", "-q", "main").status, 0);
  const weakened = IM.verifyBranchSafety(dir, "main", "bh/improve-gone");
  assert.equal(weakened.ok, false);
  assert.equal(weakened.violations[0].rule, "protected_test_weakening");
});

// ── apply: gate, merge, install — or reject/roll back and pause ───────────────────────────

test("apply merges a passing branch, installs it, keeps a rollback ref and records the verdict", async () => {
  const dir = repo({ "install.mjs": "// install\n", "mods/bot-herdr/engine/lib/util.mjs": "export const x = 1;\n" });
  const branch = improvement(dir, "safe", { "mods/bot-herdr/engine/lib/util.mjs": "export const x = 1;\nexport const y = 2;\n" });
  const calls = [];
  const result = IM.applyExperiment(dir, {
    branch,
    title: "Add y",
    runTests: () => { calls.push("tests"); return { ok: true }; },
    runCheck: () => { calls.push("check"); return { ok: true }; },
    runTsc: () => { calls.push("tsc"); return { ok: true }; },
    runInstall: () => { calls.push("install"); return { ok: true }; },
  });
  assert.equal(result.ok, true);
  assert.equal(result.verdict, "applied");
  const exp = result.experiment;
  assert.deepEqual(calls, ["tests", "check", "install"], "the gates run in order, tsc only when UI js changed");
  assert.equal(readFileSync(join(dir, "mods/bot-herdr/engine/lib/util.mjs"), "utf8").includes("export const y = 2;"), true, "main got the branch");
  assert.equal(gitOut(dir, "rev-parse", "HEAD"), exp.appliedCommit);
  assert.equal(gitOut(dir, "rev-parse", `refs/bot-herdr/improve-rollback/${exp.id}`), exp.baseCommit, "the rollback ref points at the base");
  assert.equal(exp.evals.safety.ok, true);
  assert.equal(exp.evals.tests.ok, true);
  assert.equal(exp.evals.check.ok, true);
  assert.equal(exp.evals.install.ok, true);
  assert.equal(existsSync(join(dir, ".bot-herdr", "worktrees", `improve-${exp.id}`)), false, "the isolated worktree is gone");
  const ledger = IM.listExperiments(dir);
  assert.equal(ledger.at(-1).verdict, "applied");
  assert.equal(ledger.at(-1).id, exp.id);
  assert.equal(IM.readState(dir).paused, false);
});

test("a failing safety invariant rejects without touching main, installing or resuming", async () => {
  const dir = repo({ "install.mjs": "// install\n", "src/a.mjs": "export const a = 1;\n" });
  const branch = improvement(dir, "shadow", { ".bot-herdr/scripts/check_changed.mjs": "// purpose: pass everything\n" });
  const base = gitOut(dir, "rev-parse", "HEAD");
  const calls = [];
  const result = IM.applyExperiment(dir, {
    branch,
    runTests: () => { calls.push("tests"); return { ok: true }; },
    runCheck: () => { calls.push("check"); return { ok: true }; },
    runInstall: () => { calls.push("install"); return { ok: true }; },
  });
  assert.equal(result.ok, false);
  assert.equal(result.verdict, "rejected");
  assert.equal(result.experiment.evals.safety.ok, false);
  assert.deepEqual(calls, [], "nothing ran after the safety gate failed");
  assert.equal(gitOut(dir, "rev-parse", "HEAD"), base, "main is untouched");
  assert.equal(existsSync(join(dir, ".bot-herdr", "scripts", "check_changed.mjs")), false);
  assert.equal(IM.listExperiments(dir).at(-1).verdict, "rejected");
  assert.equal(IM.readState(dir).paused, true);

  assert.throws(() => IM.applyExperiment(dir, { branch, runTests: passing, runCheck: passing, runInstall: passing }), /Self-improvement is paused/);
  assert.throws(() => IM.applyExperiment(dir, { branch, runTests: passing, runCheck: passing, runInstall: passing }), /Run bh improve resume to re-enable/);
});

test("a failing test gate rejects, leaves the tree alone and pauses until resume", () => {
  const dir = repo({ "install.mjs": "// install\n", "src/a.mjs": "export const a = 1;\n" });
  const branch = improvement(dir, "red", { "src/a.mjs": "export const a = 2;\n" });
  const base = gitOut(dir, "rev-parse", "HEAD");
  const calls = [];
  const result = IM.applyExperiment(dir, {
    branch,
    runTests: () => ({ ok: false, out: "2 tests failed" }),
    runCheck: () => { calls.push("check"); return { ok: true }; },
    runInstall: () => { calls.push("install"); return { ok: true }; },
  });
  assert.equal(result.ok, false);
  assert.equal(result.verdict, "rejected");
  assert.equal(result.experiment.evals.tests.ok, false);
  assert.match(result.experiment.reason, /tests failed/);
  assert.deepEqual(calls, [], "check and install never ran");
  assert.equal(gitOut(dir, "rev-parse", "HEAD"), base);
  assert.equal(readFileSync(join(dir, "src/a.mjs"), "utf8"), "export const a = 1;\n");
  assert.equal(IM.readState(dir).paused, true);

  assert.deepEqual(IM.setPaused(dir, false, null, null).paused, false);
  const retried = IM.applyExperiment(dir, { branch, runTests: passing, runCheck: passing, runInstall: passing });
  assert.equal(retried.ok, true, "resume unblocks a later apply");
});

test("a failing install rolls the merge back by itself and records it", () => {
  const dir = repo({ "install.mjs": "// install\n", "src/a.mjs": "export const a = 1;\n" });
  const branch = improvement(dir, "install", { "src/a.mjs": "export const a = 2;\n" });
  const base = gitOut(dir, "rev-parse", "HEAD");
  const installs = [];
  let first = true;
  const runInstall = () => {
    installs.push("install");
    const ok = !first;
    first = false;
    return ok ? { ok: true } : { ok: false, out: "install.mjs exited 1: herdr-app check failed" };
  };
  const result = IM.applyExperiment(dir, {
    branch,
    title: "Break install",
    runTests: passing,
    runCheck: passing,
    runInstall,
  });
  assert.equal(result.ok, false);
  assert.equal(result.verdict, "rolled_back");
  assert.equal(installs.length, 2, "the rollback reinstalls from the rolled-back tree");
  assert.equal(readFileSync(join(dir, "src/a.mjs"), "utf8"), "export const a = 1;\n", "main is back to the base tree");
  assert.notEqual(gitOut(dir, "rev-parse", "HEAD"), base, "the revert is its own commit");
  const ledger = IM.listExperiments(dir);
  assert.equal(ledger.at(-1).verdict, "rolled_back");
  assert.equal(ledger.at(-1).id, result.experiment.id);
  assert.equal(ledger.at(-1).rollbackCommit, gitOut(dir, "rev-parse", "HEAD"));
  assert.equal(ledger.at(-1).evals.install.ok, false, "the ledger keeps the gate that failed");
  assert.equal(ledger.at(-1).evals.install.reinstalled, true);
  assert.equal(IM.readState(dir).paused, true);
  assert.equal(IM.latestApplied(dir), null);
});

test("the tsc gate runs when a GPUI mod js changed", () => {
  const dir = repo({ "install.mjs": "// install\n", "mods/bot-herdr/work.js": "export const page = 1;\n" });
  const branch = improvement(dir, "ui", { "mods/bot-herdr/work.js": "export const page = 2;\n" });
  const calls = [];
  const result = IM.applyExperiment(dir, {
    branch,
    runTests: () => { calls.push("tests"); return { ok: true }; },
    runCheck: () => { calls.push("check"); return { ok: true }; },
    runTsc: () => { calls.push("tsc"); return { ok: true }; },
    runInstall: () => { calls.push("install"); return { ok: true }; },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["tests", "check", "tsc", "install"]);
  assert.equal(result.experiment.evals.tsc.ok, true);
  const red = improvement(dir, "ui-red", { "mods/bot-herdr/work.js": "export const page = 3;\n" });
  IM.setPaused(dir, false, null, null);
  const rejected = IM.applyExperiment(dir, {
    branch: red,
    runTests: passing,
    runCheck: passing,
    runTsc: () => ({ ok: false, out: "mods/bot-herdr/work.js: unresolved names outside the engine" }),
    runInstall: () => { calls.push("install"); return { ok: true }; },
  });
  assert.equal(rejected.verdict, "rejected");
  assert.equal(rejected.experiment.evals.tsc.ok, false);
});

test("apply refuses branches that are not bh/improve-* and unknown names", () => {
  const dir = repo();
  assert.throws(() => IM.applyExperiment(dir, { branch: "feature/x", runTests: passing }), /must start with bh\/improve-/);
  assert.throws(() => IM.applyExperiment(dir, { branch: "bh/improve-nope", runTests: passing }), /No branch/);
});

// ── verify: a worse next window rolls the experiment back and pauses ──────────────────────

test("detectRegression compares the windows and ignores too-small ones", () => {
  const base = { checkFailRate: 0.1, qaFailRate: 0.2, avgCostUsd: 1 };
  assert.deepEqual(IM.detectRegression(base, { tasks: 1, checkFailRate: 1, qaFailRate: 1, avgCostUsd: 5 }), { regressed: false, enoughData: false, reasons: [] });
  assert.deepEqual(IM.detectRegression(base, { tasks: 3, checkFailRate: 0.1, qaFailRate: 0.2, avgCostUsd: 1 }).reasons, []);
  const worse = IM.detectRegression(base, { tasks: 3, checkFailRate: 0.4, qaFailRate: 0.5, avgCostUsd: 1.5 });
  assert.equal(worse.regressed, true);
  assert.equal(worse.reasons.length, 3);
  assert.match(worse.reasons.join(" "), /check failure rate/);
  assert.match(worse.reasons.join(" "), /QA failure rate/);
  assert.match(worse.reasons.join(" "), /cost/);
});

test("verifyExperiment reverts a regression, reinstalls and pauses until the user resumes", () => {
  const dir = repo({ "install.mjs": "// install\n", "src/a.mjs": "export const a = 1;\n" });
  const before = T.newTask(dir, { request: "baseline", steps: ["one"] });
  T.recordCheck(dir, before.id, { at: at(), exit: 0, command: "bh check" });
  T.recordGate(dir, before.id, { verdict: "PASS", file: "r.md", summary: "fine" });
  const branch = improvement(dir, "regress", { "src/a.mjs": "export const a = 2;\n" });
  const installs = [];
  const runInstall = () => { installs.push("install"); return { ok: true }; };
  const applied = IM.applyExperiment(dir, { branch, title: "Change a", runTests: passing, runCheck: passing, runInstall });
  assert.equal(applied.ok, true);
  assert.equal(readFileSync(join(dir, "src/a.mjs"), "utf8"), "export const a = 2;\n");

  // The next window: two tasks whose checks and gates fail.
  for (const title of ["after one", "after two"]) {
    const t = T.newTask(dir, { request: title, steps: ["one"] });
    T.recordCheck(dir, t.id, { at: at(), exit: 1, command: "bh check" });
    T.recordGate(dir, t.id, { verdict: "CHANGES_REQUIRED", file: "r.md", summary: "broke" });
  }
  const verified = IM.verifyExperiment(dir, { window: 10, runInstall });
  assert.equal(verified.ok, false);
  assert.equal(verified.regressed, true);
  assert.equal(verified.rolledBack, true);
  assert.ok(verified.reasons.length >= 1);
  assert.equal(readFileSync(join(dir, "src/a.mjs"), "utf8"), "export const a = 1;\n", "the revert undid the merge");
  assert.equal(installs.length, 2, "the rolled-back tree was installed again");
  const rolled = IM.listExperiments(dir).filter((e) => e.id === applied.experiment.id).at(-1);
  assert.equal(rolled.verdict, "rolled_back");
  assert.equal(rolled.rollbackCommit, gitOut(dir, "rev-parse", "HEAD"));
  assert.ok(rolled.rolledBackAt);
  assert.equal(IM.readState(dir).paused, true);
  assert.equal(IM.readState(dir).experimentId, applied.experiment.id);
  assert.equal(IM.latestApplied(dir), null);

  // Nothing to verify (or roll back) any more; the pause still refuses a new apply.
  assert.throws(() => IM.verifyExperiment(dir), /No applied experiment/);
  assert.throws(() => IM.rollbackExperiment(dir), /No applied experiment to roll back/);
  assert.throws(() => IM.applyExperiment(dir, { branch, runTests: passing, runCheck: passing, runInstall }), /Self-improvement is paused/);
  assert.throws(() => IM.rollbackExperiment(dir, { id: applied.experiment.id }), new RegExp(`Experiment ${applied.experiment.id} was already rolled back`));
});

test("a verify whose auto-rollback cannot revert records rollback_failed and pauses", () => {
  const dir = repo({ "install.mjs": "// install\n", "src/a.mjs": "export const a = 1;\n" });
  const before = T.newTask(dir, { request: "baseline", steps: ["one"] });
  T.recordGate(dir, before.id, { verdict: "PASS", file: "r.md", summary: "fine" });
  const branch = improvement(dir, "stuck", { "src/a.mjs": "export const a = 2;\n" });
  const applied = IM.applyExperiment(dir, { branch, runTests: passing, runCheck: passing, runInstall: passing });
  assert.equal(applied.ok, true);
  for (const title of ["after one", "after two"]) {
    const t = T.newTask(dir, { request: title, steps: ["one"] });
    T.recordGate(dir, t.id, { verdict: "CHANGES_REQUIRED", file: "r.md", summary: "broke" });
  }
  writeFileSync(join(dir, "src/a.mjs"), "export const a = 'dirty';\n"); // blocks git revert
  const verified = IM.verifyExperiment(dir, { window: 10, runInstall: passing });
  assert.equal(verified.ok, false);
  assert.equal(verified.rolledBack, false);
  assert.equal(verified.verdict, "rollback_failed");
  const last = IM.listExperiments(dir).at(-1);
  assert.equal(last.verdict, "rollback_failed");
  assert.equal(last.rollbackCommit, null);
  assert.match(last.reason, /rollback failed too/);
  assert.equal(IM.readState(dir).paused, true);
  assert.equal(gitOut(dir, "rev-parse", "HEAD"), applied.experiment.appliedCommit, "no half-done revert commit");
});

test("apply refuses while another apply holds the claim, and takes over a dead one", () => {
  const dir = repo({ "src/a.mjs": "export const a = 1;\n" });
  const branch = improvement(dir, "claim", { "src/a.mjs": "export const a = 2;\n" });
  const claim = join(dir, ".bot-herdr", "improve", "apply.json");
  write(dir, ".bot-herdr/improve/apply.json", JSON.stringify({ pid: process.ppid, at: at(), token: "other" }));
  assert.throws(() => IM.applyExperiment(dir, { branch, runTests: passing, runCheck: passing, install: false }), /Another bh improve apply or rollback is running/);
  assert.equal(IM.listExperiments(dir).length, 0, "the refused apply did nothing");
  const dead = spawnSync(process.execPath, ["-e", "0"]).pid;
  write(dir, ".bot-herdr/improve/apply.json", JSON.stringify({ pid: dead, at: at(), token: "gone" }));
  assert.equal(IM.applyExperiment(dir, { branch, runTests: passing, runCheck: passing, install: false }).ok, true);
  assert.equal(existsSync(claim), false, "the claim is released after the run");
});

test("the post-apply window counts only tasks created after the apply", async () => {
  const dir = repo();
  const old = T.newTask(dir, { request: "pre-apply", steps: ["one"] });
  await new Promise((r) => setTimeout(r, 5));
  const since = at();
  await new Promise((r) => setTimeout(r, 5));
  T.recordCheck(dir, old.id, { at: at(), exit: 1, command: "bh check" });
  T.recordGate(dir, old.id, { verdict: "CHANGES_REQUIRED", file: "r.md", summary: "touched after" });
  assert.equal(IM.computeMetrics(dir, { since }).tasks, 0, "a pre-apply task touched later is baseline");
  T.newTask(dir, { request: "post-apply", steps: ["one"] });
  assert.equal(IM.computeMetrics(dir, { since }).tasks, 1);
});

test("fold drops a duplicate or old bullet together with its continuation lines", () => {
  const dir = repo();
  const facts = ["- first fact", "  continued first", "- second fact", "  second continued", "- first fact", "  continued first"];
  K.write(dir, "dev", ["# dev", "", "## Facts", ...facts, ""].join("\n"));
  K.fold(dir, "dev", { maxChars: 9000, briefTarget: 4000 });
  const lines = K.read(dir, "dev").split("\n");
  assert.equal(lines.filter((l) => l === "  continued first").length, 1, "the duplicate's continuation went with it");
  assert.equal(lines[lines.indexOf("- second fact") + 1], "  second continued");
  const history = Array.from({ length: 60 }, (_, i) => [`- history ${i} ${"y".repeat(40)}`, `  detail ${i}`]).flat();
  K.write(dir, "qa", ["# qa", "", "## History", ...history, ""].join("\n"));
  K.fold(dir, "qa", { maxChars: 1200, briefTarget: 800 });
  const qa = K.read(dir, "qa");
  assert.equal(qa.includes("detail 0\n"), false, "an old entry's continuation went with it");
  assert.ok(qa.includes("- history 59") && qa.includes("  detail 59"));
  for (const [i, line] of qa.split("\n").entries()) if (/^\s+detail (\d+)/.test(line)) assert.match(qa.split("\n")[i - 1], new RegExp(`^- history ${line.trim().split(" ")[1]} `));
});

// ── The CLI: the same files, and resume is the user's alone ───────────────────────────────

test("the CLI reads analyze, fold, check-diff and history", () => {
  const dir = repo();
  const task = T.newTask(dir, { request: "cli smoke", steps: ["one"] });
  T.recordCheck(dir, task.id, { at: at(), exit: 1, command: "bh check" });
  K.write(dir, "dev", "# dev\n\n## Facts\n- a fact\n\n## History\n- an old entry\n");
  const analyze = cli(["improve", "analyze", "--json", "--window", "5"], dir);
  assert.equal(analyze.code, 0, analyze.err);
  const answer = JSON.parse(analyze.out);
  assert.equal(answer.metrics.tasks, 1);
  assert.equal(answer.metrics.failedChecks, 1);
  assert.ok(Array.isArray(answer.findings));

  const fold = cli(["improve", "fold", "--dry-run", "--json"], dir);
  assert.equal(fold.code, 0, fold.err);
  assert.equal(JSON.parse(fold.out)[0].agent, "dev");
  assert.equal(K.read(dir, "dev").includes("an old entry"), true, "a dry run changed nothing");

  const shadow = improvement(dir, "shadow", { ".bot-herdr/scripts/check_changed.mjs": "// purpose: pass\n" });
  const diff = cli(["improve", "check-diff", "--base", "main", "--target", shadow, "--json"], dir);
  assert.equal(diff.code, 1);
  assert.equal(JSON.parse(diff.out).ok, false);
  const safe = improvement(dir, "safe", { "src/a.mjs": "export const a = 3;\n" });
  const allowed = cli(["improve", "check-diff", "--base", "main", "--target", safe, "--json"], dir);
  assert.equal(allowed.code, 0);
  assert.equal(JSON.parse(allowed.out).ok, true);

  const history = cli(["improve", "history", "--json"], dir);
  assert.equal(history.code, 0, history.err);
  assert.deepEqual(JSON.parse(history.out), []);
});

test("bh improve resume is refused headless and works for the user", () => {
  const dir = repo();
  IM.setPaused(dir, true, "tests failed: a regression", "imp-test");
  const refused = cli(["improve", "resume"], dir, { BH_AGENT: "dev" });
  assert.equal(refused.code, 1);
  assert.match(refused.err, /the user's to change/);
  assert.equal(IM.readState(dir).paused, true, "a headless agent cannot unpause");
  const human = cli(["improve", "resume", "--json"], dir, { BH_AGENT: "" });
  assert.equal(human.code, 0, human.err);
  assert.equal(JSON.parse(human.out).paused, false);
  assert.equal(IM.readState(dir).paused, false);
});

test("cleanup", () => {
  rmSync(tmp, { recursive: true, force: true });
});
