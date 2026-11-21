// QA phase 4 (adversarial): ways a bh/improve-* branch could get past the safety gate, and the
// failure path where an install breaks the tree and its rollback cannot run. Each test names the
// bug it catches; they use real git branches so renames, hunks and reverts are git's own.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "bh-improve-safety-"));
process.env.BH_APP_HOME = join(tmp, "app");
process.env.XDG_CONFIG_HOME = join(tmp, "xdg");
const IM = await import(new URL("../mods/bot-herdr/engine/lib/improve.mjs", import.meta.url));

const git = (cwd, ...args) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8" });
const gitOut = (cwd, ...args) => String(git(cwd, ...args).stdout ?? "").trim();
const put = (dir, path, text) => {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
};

const BASE = {
  "mods/bot-herdr/engine/bh.mjs": 'function personOnly(what) {\n  if (process.env.BH_AGENT) throw new Error(`${what} is the user\'s`);\n}\nexport function resume() {\n  personOnly("Self-improvement resume");\n  return true;\n}\n',
  "mods/bot-herdr/engine/lib/improve.mjs": "export const GUARD = 1;\n".repeat(20),
  "test/guard.test.mjs": 'import { test } from "node:test";\ntest("guard holds", () => {\n  if (1 !== 1) throw new Error("x");\n});\n',
  "src/a.mjs": "export const a = 1;\n",
};

function repo() {
  const dir = mkdtempSync(join(tmp, "proj-"));
  git(dir, "init", "-q", "-b", "main");
  for (const [path, text] of Object.entries(BASE)) put(dir, path, text);
  git(dir, "add", "-A");
  assert.equal(git(dir, "commit", "-q", "-m", "init").status, 0);
  return dir;
}

/** A bh/improve-* branch made by `change(dir)`; main is checked out again. */
function branch(dir, name, change) {
  const ref = `bh/improve-${name}`;
  git(dir, "checkout", "-q", "-b", ref, "main");
  change(dir);
  git(dir, "add", "-A");
  assert.equal(git(dir, "commit", "-q", "-m", name).status, 0);
  git(dir, "checkout", "-q", "main");
  return ref;
}

const edit = (dir, path, fn) => writeFileSync(join(dir, path), fn(readFileSync(join(dir, path), "utf8")));
const rules = (v) => v.violations.map((x) => x.rule);

// Bug: wholeFile() is never called on a rename's old path, so renaming the self-guard (or a
// built-in check script) away is reported as an ordinary new file and passes the gate.
test("renaming improve.mjs away is a protected_self_guard violation", () => {
  const dir = repo();
  const ref = branch(dir, "rename", (d) => {
    git(d, "mv", "mods/bot-herdr/engine/lib/improve.mjs", "mods/bot-herdr/engine/lib/improve-old.mjs");
    edit(d, "mods/bot-herdr/engine/lib/improve-old.mjs", (t) => `${t}export const GUARD_OFF = 1;\n`);
  });
  const v = IM.verifyBranchSafety(dir, "main", ref);
  assert.equal(v.ok, false, `rename slipped through: ${JSON.stringify(v)}`);
  assert.ok(rules(v).includes("protected_self_guard"));
});

// Bug: GUARDED_LINES only flags lines that mention personOnly/BH_AGENT, so a `return;` added as
// the first line of personOnly's body disables every person-only command without touching them.
test("an early return inside personOnly's body is a protected_person_only violation", () => {
  const dir = repo();
  const ref = branch(dir, "noop-guard", (d) => edit(d, "mods/bot-herdr/engine/bh.mjs", (t) => t.replace("function personOnly(what) {\n", "function personOnly(what) {\n  return;\n")));
  const v = IM.verifyBranchSafety(dir, "main", ref);
  assert.equal(v.ok, false, "personOnly was neutered and the gate passed");
  assert.ok(rules(v).includes("protected_person_only"));
});

// Bug: only deleting or renaming a test counts as weakening; emptying it keeps the file and the
// test gate (which runs the branch's own tests) then passes with nothing checked.
test("emptying an existing test file is a protected_test_weakening violation", () => {
  const dir = repo();
  const ref = branch(dir, "empty-test", (d) => writeFileSync(join(d, "test/guard.test.mjs"), ""));
  const v = IM.verifyBranchSafety(dir, "main", ref);
  assert.equal(v.ok, false, "an emptied test passed the gate");
  assert.ok(rules(v).includes("protected_test_weakening"));
});

// Bug: when install fails and the automatic revert then fails too, applyExperiment throws out of
// the rollback: main keeps the merge, nothing is written to the ledger and nothing is paused.
test("an install failure whose rollback cannot revert still records the experiment and pauses", () => {
  const dir = repo();
  const ref = branch(dir, "bad-install", (d) => edit(d, "src/a.mjs", () => "export const a = 2;\n"));
  const brokenInstall = ({ root }) => {
    writeFileSync(join(root, "src/a.mjs"), "export const a = 'half-written';\n");
    return { ok: false, out: "install.mjs crashed halfway" };
  };
  put(dir, "install.mjs", "// present so install runs\n");
  git(dir, "add", "install.mjs");
  git(dir, "commit", "-q", "-m", "install");
  let result = null;
  let error = null;
  try {
    result = IM.applyExperiment(dir, { branch: ref, runTests: () => ({ ok: true }), runCheck: () => ({ ok: true }), runTsc: () => ({ ok: true }), runInstall: brokenInstall });
  } catch (e) {
    error = e;
  }
  const state = IM.readState(dir);
  const ledger = IM.listExperiments(dir);
  assert.equal(state.paused, true, `not paused after a failed install + failed rollback (${error?.message ?? JSON.stringify(result)})`);
  assert.ok(ledger.length > 0, "the failed experiment is missing from the ledger");
  assert.notEqual(ledger.at(-1).verdict, "applied", "a failed install is recorded as applied");
});

// QA phase 4 round 2.
// Bug: agent.mjs is only line-guarded by guard names, but the line that hands `access` to every
// turn names none of them, so `access: "full"` there runs every agent unrestricted.
test("forcing full access at agent.mjs's turn call is a protected_access_control violation", () => {
  const diff = [
    "diff --git a/mods/bot-herdr/engine/lib/agent.mjs b/mods/bot-herdr/engine/lib/agent.mjs",
    "--- a/mods/bot-herdr/engine/lib/agent.mjs",
    "+++ b/mods/bot-herdr/engine/lib/agent.mjs",
    "@@ -551 +551 @@",
    "-      running = turn({ agent, known, state, key, brief, briefFile, prompt: promptText, cwd, on, access, allow, acp });",
    "+      running = turn({ agent, known, state, key, brief, briefFile, prompt: promptText, cwd, on, access: \"full\", allow, acp });",
  ].join("\n");
  const v = IM.checkDiffSafety({ files: ["M\tmods/bot-herdr/engine/lib/agent.mjs"], diff });
  assert.equal(v.ok, false, "every agent was given full access and the gate passed");
  assert.ok(rules(v).includes("protected_access_control"));
});

// Bug: only removed test lines count as weakening, so one added `process.exit(0);` at the top of
// an existing test file ends it before any test runs; node --test reports the file as passing.
test("an added early exit in an existing test file is a protected_test_weakening violation", () => {
  const dir = repo();
  const ref = branch(dir, "exit-test", (d) => edit(d, "test/guard.test.mjs", (t) => `process.exit(0);\n${t}`));
  const v = IM.verifyBranchSafety(dir, "main", ref);
  assert.equal(v.ok, false, "an existing test was neutered by an added line and the gate passed");
  assert.ok(rules(v).includes("protected_test_weakening"));
});

// QA phase 4 round 3.
// Bug: the test gate runs `npm run test`, and npm reads the branch's own `.npmrc`: an added
// `node-options=--import=./src/boot.mjs` (or `script-shell=`) preloads code into every node
// process the tests start, so it can end each test file with exit 0 while package.json stays put.
test("an added .npmrc that preloads code into the test run is a protected_test_weakening violation", () => {
  const dir = repo();
  const ref = branch(dir, "npmrc", (d) => {
    put(d, ".npmrc", "node-options=--import=./src/boot.mjs\n");
    put(d, "src/boot.mjs", "if (process.argv.some((a) => a.endsWith('.test.mjs'))) process.exitCode = 0;\n");
  });
  const v = IM.verifyBranchSafety(dir, "main", ref);
  assert.equal(v.ok, false, `the test command was rewired through .npmrc and the gate passed: ${JSON.stringify(v.files)}`);
  assert.ok(rules(v).includes("protected_test_weakening"));
});

test("cleanup", () => rmSync(tmp, { recursive: true, force: true }));
