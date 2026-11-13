// One worktree per writing child: a Dev or Design child gets its own checkout and branch, its
// work reaches the task's tree only through `bh merge`, and readers and reviews stay shared.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const tmp = mkdtempSync(join(tmpdir(), "bh-worktree-"));
const APP = join(tmp, "app");
mkdirSync(join(APP, "data", "bot-herdr"), { recursive: true });
process.env.BH_APP_HOME = APP;
process.env.XDG_CONFIG_HOME = join(tmp, "xdg");
writeFileSync(join(APP, "data", "bot-herdr", "agents.json"), JSON.stringify({
  agents: [{ role: "dev", harness: "claude" }, { role: "scout", harness: "claude" }, { role: "qa", harness: "claude" }],
  known: [],
}));

const BH = fileURLToPath(new URL("../mods/bot-herdr/engine/bh.mjs", import.meta.url));
const lib = (name) => import(new URL(`../mods/bot-herdr/engine/${name}`, import.meta.url));

const LOG = join(tmp, "hc.jsonl");
const STAND = join(tmp, "fake-hc.mjs");
writeFileSync(STAND, "import { appendFileSync } from \"node:fs\";\nappendFileSync(process.env.BH_HC_LOG, JSON.stringify(process.argv.slice(2)) + \"\\n\");\n");

/** Runs bh with the hc stand-in, whose calls are captured. */
const run = (args, cwd, env = {}) => {
  const r = spawnSync(process.execPath, [BH, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, BH_APP_HOME: APP, XDG_CONFIG_HOME: join(tmp, "xdg"), HC_TERMINAL_ID: "", BH_AGENT: "", BH_PARENT: "", BH_STEP: "", BH_HC: STAND, BH_HC_LOG: LOG, ...env },
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
};

const git = (cwd, ...args) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8" });
const gitOut = (cwd, ...args) => git(cwd, ...args).stdout.trim();
const rev = (cwd) => gitOut(cwd, "rev-parse", "HEAD");

/** Same folder, whatever Windows' 8.3 short name (git reports the long one) or the drive's case. */
const sameDir = (a, b) => {
  try {
    return realpathSync.native(a).toLowerCase() === realpathSync.native(b).toLowerCase();
  } catch {
    return false;
  }
};

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

/** The last hc call's `--cwd`, i.e. where the child was started. */
function cwdOf(r) {
  const calls = readFileSync(LOG, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const argv = calls.at(-1);
  return argv[argv.indexOf("--cwd") + 1];
}

test("a writing child gets its own worktree; a scout and a review stay in the task's tree", async () => {
  const T = await lib("lib/tasks.mjs");
  const dir = repo();
  const task = T.newTask(dir, { request: "Worktree", steps: ["One"] });
  const base = rev(dir);
  const d = run(["spawn", "dev", "--task", task.id, "--name", "dev-1", "build it"], dir);
  assert.equal(d.code, 0, d.err);
  assert.match(d.out, /works in its own worktree/);
  const child = T.loadTask(dir, task.id).children[0];
  assert.ok(sameDir(child.path, join(dir, ".bot-herdr", "worktrees", `${task.id}-dev-1`)), child.path);
  assert.equal(child.branch, `bh/${task.id}-dev-1`);
  assert.deepEqual([child.agent, child.step, child.state, child.base], ["Dev", null, "open", base]);
  assert.ok(existsSync(child.path));
  assert.ok(sameDir(cwdOf(d), child.path), cwdOf(d));
  const s = run(["spawn", "scout", "--task", task.id, "--name", "scout-1", "read it"], dir);
  assert.equal(s.code, 0, s.err);
  assert.ok(sameDir(cwdOf(s), dir), cwdOf(s));
  assert.equal(T.loadTask(dir, task.id).children.length, 1);
  const r = run(["spawn", "qa", "--review", "--task", task.id, "--name", "qa-gate", "review it"], dir);
  assert.equal(r.code, 0, r.err);
  assert.ok(sameDir(cwdOf(r), dir), cwdOf(r));
});

test("bh merge stages the child's change in the task's tree, records the stat and removes the worktree", async () => {
  const T = await lib("lib/tasks.mjs");
  const dir = repo();
  const task = T.newTask(dir, { request: "Merge", steps: ["One"] });
  assert.equal(run(["spawn", "dev", "--task", task.id, "--step", "1", "--name", "dev-1", "build"], dir).code, 0);
  const child = T.loadTask(dir, task.id).children[0];
  writeFileSync(join(child.path, "src", "a.mjs"), "export const a = 2;\n");
  writeFileSync(join(child.path, "src", "b.mjs"), "export const b = 1;\n");
  const m = run(["merge", "dev-1", "--task", task.id], dir);
  assert.equal(m.code, 0, m.err);
  assert.match(m.out, /Merged dev-1: 2 files, \+2 −1/);
  assert.deepEqual(gitOut(dir, "diff", "--cached", "--name-only").split("\n").sort(), ["src/a.mjs", "src/b.mjs"]);
  assert.ok(!existsSync(child.path));
  assert.equal(gitOut(dir, "branch", "--list", child.branch), "");
  const merged = T.loadTask(dir, task.id).children[0];
  assert.equal(merged.state, "merged");
  assert.deepEqual(merged.stat, { files: 2, added: 2, removed: 1 });
  assert.ok(merged.mergedAt);
  const entry = T.board(dir, task.id).at(-1);
  assert.deepEqual([entry.kind, entry.step], ["done", 1]);
  assert.match(entry.text, /^Merged dev-1: 2 files, \+2 −1$/);
});

test("bh merge refuses when the task's tree has uncommitted changes to the same file", async () => {
  const T = await lib("lib/tasks.mjs");
  const dir = repo();
  const task = T.newTask(dir, { request: "Clash", steps: ["One"] });
  assert.equal(run(["spawn", "dev", "--task", task.id, "--name", "dev-1", "build"], dir).code, 0);
  const child = T.loadTask(dir, task.id).children[0];
  writeFileSync(join(child.path, "src", "a.mjs"), "export const a = 2;\n");
  writeFileSync(join(dir, "src", "a.mjs"), "export const a = 3;\n");
  const m = run(["merge", "dev-1", "--task", task.id], dir);
  assert.equal(m.code, 1, m.out + m.err);
  assert.match(m.err, /Not merged: the task's tree has uncommitted changes to src\/a\.mjs/);
  assert.equal(readFileSync(join(dir, "src", "a.mjs"), "utf8"), "export const a = 3;\n");
  assert.ok(existsSync(child.path));
  assert.equal(T.loadTask(dir, task.id).children[0].state, "open");
});

test("bh merge refuses a committed change it cannot merge cleanly", async () => {
  const T = await lib("lib/tasks.mjs");
  const dir = repo();
  const task = T.newTask(dir, { request: "Conflict", steps: ["One"] });
  assert.equal(run(["spawn", "dev", "--task", task.id, "--name", "dev-1", "build"], dir).code, 0);
  const child = T.loadTask(dir, task.id).children[0];
  writeFileSync(join(child.path, "src", "a.mjs"), "export const a = 2;\n");
  writeFileSync(join(dir, "src", "a.mjs"), "export const a = 9;\n");
  git(dir, "add", "-A");
  assert.equal(git(dir, "commit", "-q", "-m", "the other change").status, 0);
  const m = run(["merge", "dev-1", "--task", task.id], dir);
  assert.equal(m.code, 1);
  assert.match(m.err, /conflicts/);
  assert.equal(readFileSync(join(dir, "src", "a.mjs"), "utf8"), "export const a = 9;\n");
  assert.equal(T.loadTask(dir, task.id).children[0].state, "open");
});

test("a second open worktree for the same agent is refused; --drop discards one", async () => {
  const T = await lib("lib/tasks.mjs");
  const dir = repo();
  const task = T.newTask(dir, { request: "Drop", steps: ["One"] });
  assert.equal(run(["spawn", "dev", "--task", task.id, "--name", "dev-1", "one"], dir).code, 0);
  const second = run(["spawn", "dev", "--task", task.id, "--name", "dev-2", "two"], dir);
  assert.equal(second.code, 1);
  assert.match(second.err, /Dev already has an open worktree dev-1: merge or drop it first/);
  const child = T.loadTask(dir, task.id).children[0];
  const d = run(["merge", "dev-1", "--task", task.id, "--drop"], dir);
  assert.equal(d.code, 0, d.err);
  assert.match(d.out, /Dropped dev-1/);
  assert.ok(!existsSync(child.path));
  assert.equal(gitOut(dir, "branch", "--list", child.branch), "");
  assert.equal(T.loadTask(dir, task.id).children[0].state, "dropped");
});

test("bh check inside a child's worktree checks it against the child's base", async () => {
  const T = await lib("lib/tasks.mjs");
  const dir = repo();
  const task = T.newTask(dir, { request: "Check", steps: ["One"] });
  assert.equal(run(["spawn", "dev", "--task", task.id, "--name", "dev-1", "build"], dir).code, 0);
  const child = T.loadTask(dir, task.id).children[0];
  // A commit in the task's tree after the child started is not part of its change.
  writeFileSync(join(dir, "src", "later.mjs"), "export const later = 1;\n");
  git(dir, "add", "-A");
  assert.equal(git(dir, "commit", "-q", "-m", "later").status, 0);
  writeFileSync(join(child.path, "src", "a.mjs"), "export const a = 2;\n");
  const c = run(["check"], child.path);
  assert.equal(c.code, 0, c.err);
  assert.match(c.out, /Changed: 1 file\(s\)/);
  assert.equal(T.checks(dir, task.id).at(-1).base, child.base);
});
