// Settings → Repo history: .bot-herdr/ in the project's git, or out of it, with one commit.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const tmp = mkdtempSync(join(tmpdir(), "bh-repo-history-"));
const APP = join(tmp, "app");
const BH = fileURLToPath(new URL("../mods/bot-herdr/engine/bh.mjs", import.meta.url));
const run = (cwd, args, env = {}) => spawnSync(process.execPath, [BH, ...args], { cwd, encoding: "utf8", env: { ...process.env, BH_APP_HOME: APP, HC_TERMINAL_ID: "t1", BH_AGENT: "", ...env } });
const access = (cwd, args = [], env = {}) => JSON.parse(run(cwd, ["access", ...args, "--json"], env).stdout);
const git = (cwd, args) => spawnSync("git", args, { cwd, encoding: "utf8" });
const gitOut = (cwd, args) => git(cwd, args).stdout.trim();
const commits = (cwd) => Number(gitOut(cwd, ["rev-list", "--count", "HEAD"]));

/** A folder with a commit that holds .bot-herdr/tasks/x.json. */
function repo(name) {
  const dir = join(tmp, name);
  mkdirSync(join(dir, ".bot-herdr", "tasks"), { recursive: true });
  writeFileSync(join(dir, ".bot-herdr", "tasks", "x.json"), "{}\n");
  git(dir, ["init", "-q"]);
  git(dir, ["config", "user.name", "Test"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-q", "-m", "Start"]);
  return dir;
}

/** A folder whose only commit holds README.md; .bot-herdr/ is there but untracked, and there is no .gitignore. */
function fresh(name) {
  const dir = join(tmp, name);
  mkdirSync(join(dir, ".bot-herdr", "tasks"), { recursive: true });
  writeFileSync(join(dir, ".bot-herdr", "tasks", "x.json"), "{}\n");
  writeFileSync(join(dir, "README.md"), "hi\n");
  git(dir, ["init", "-q"]);
  git(dir, ["config", "user.name", "Test"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["add", "README.md"]);
  git(dir, ["commit", "-q", "-m", "Start"]);
  return dir;
}

test("a fresh app home keeps repo history on", () => {
  const plain = join(tmp, "fresh");
  mkdirSync(plain);
  const shown = access(plain);
  assert.equal(shown.repoHistory, true);
  assert.equal(shown.repoHistoryNote, undefined);
});

test("off untracks .bot-herdr once, and on tracks it again", () => {
  const dir = repo("project");
  const before = commits(dir);
  const off = access(dir, ["--repo-history", "off"]);
  assert.equal(off.repoHistory, false);
  assert.equal(access(dir).repoHistory, false);
  assert.equal(typeof off.repoHistoryNote, "string");
  assert.ok(off.repoHistoryNote.length);
  assert.equal(off.repoHistoryError, null);
  assert.match(readFileSync(join(dir, ".gitignore"), "utf8"), /^\.bot-herdr\/$/m);
  assert.equal(gitOut(dir, ["ls-files", "--", ".bot-herdr"]), "");
  assert.equal(commits(dir), before + 1);
  assert.equal(gitOut(dir, ["log", "-1", "--format=%s"]), "Keep bot-herdr's repo history out of git");
  // already converged: no second commit
  const again = access(dir, ["--repo-history", "off"]);
  assert.equal(again.repoHistoryNote, "already excluded");
  assert.equal(commits(dir), before + 1);
  const on = access(dir, ["--repo-history", "on"]);
  assert.equal(on.repoHistory, true);
  assert.ok(!/^\.bot-herdr\/$/m.test(readFileSync(join(dir, ".gitignore"), "utf8")));
  assert.notEqual(gitOut(dir, ["ls-files", "--", ".bot-herdr"]), "");
  assert.equal(commits(dir), before + 2);
  assert.equal(gitOut(dir, ["log", "-1", "--format=%s"]), "Track bot-herdr's repo history in git");
  // the user's setting is the user's: an agent's patch is refused and changes nothing
  const refused = run(dir, ["access", "--repo-history", "off"], { BH_AGENT: "1", HC_TERMINAL_ID: "" });
  assert.notEqual(refused.status, 0);
  assert.equal(access(dir).repoHistory, true);
  assert.equal(commits(dir), before + 2);
});

test("a folder that is not a git repository is only noted", () => {
  const plain = join(tmp, "plain");
  mkdirSync(plain);
  const off = access(plain, ["--repo-history", "off"]);
  assert.equal(off.repoHistory, false);
  assert.equal(off.repoHistoryNote, "not a git repository");
  assert.equal(off.repoHistoryError, null);
  assert.equal(run(plain, ["access", "--repo-history", "on", "--json"]).status, 0);
  const data = access(plain, ["--data", '{"repoHistory":false}']);
  assert.equal(data.repoHistory, false);
  assert.equal(run(plain, ["access", "--repo-history", "maybe"]).status, 2);
  assert.equal(run(plain, ["access", "--data", '{"repoHistory":"off"}']).status, 2);
});

test("on tracks .bot-herdr in a project with no .gitignore", () => {
  const dir = fresh("no-ignore");
  const before = commits(dir);
  const on = access(dir, ["--repo-history", "on"]);
  assert.equal(on.repoHistoryError, null);
  assert.notEqual(gitOut(dir, ["ls-files", "--", ".bot-herdr"]), "");
  assert.equal(commits(dir), before + 1);
  assert.equal(gitOut(dir, ["log", "-1", "--format=%s"]), "Track bot-herdr's repo history in git");
});

test("on removes a bare .bot-herdr rule before tracking", () => {
  const dir = fresh("bare-rule");
  writeFileSync(join(dir, ".gitignore"), "node_modules\n.bot-herdr\n");
  git(dir, ["add", ".gitignore"]);
  git(dir, ["commit", "-q", "-m", "Ignore"]);
  const on = access(dir, ["--repo-history", "on"]);
  assert.equal(on.repoHistoryError, null);
  assert.doesNotMatch(readFileSync(join(dir, ".gitignore"), "utf8"), /^\.bot-herdr$/m);
  assert.notEqual(gitOut(dir, ["ls-files", "--", ".bot-herdr"]), "");
  assert.equal(gitOut(dir, ["log", "-1", "--format=%s"]), "Track bot-herdr's repo history in git");
});

test("a flip commits only .bot-herdr and .gitignore, leaving staged work alone", () => {
  const dir = repo("scoped");
  writeFileSync(join(dir, "wip.txt"), "wip\n");
  git(dir, ["add", "wip.txt"]);
  const off = access(dir, ["--repo-history", "off"]);
  assert.equal(off.repoHistoryError, null);
  const changed = gitOut(dir, ["show", "--name-only", "--format=", "HEAD"]).split("\n").filter(Boolean);
  assert.ok(changed.length);
  for (const file of changed) assert.ok(file.startsWith(".bot-herdr/") || file === ".gitignore", file);
  assert.equal(gitOut(dir, ["diff", "--cached", "--name-only"]), "wip.txt");
  assert.equal(gitOut(dir, ["ls-files", "--", ".bot-herdr"]), "");
});

test("off keeps the other .gitignore rules", () => {
  const dir = repo("keep-rules");
  writeFileSync(join(dir, ".gitignore"), "node_modules\n.env\n*.log\n");
  git(dir, ["add", ".gitignore"]);
  git(dir, ["commit", "-q", "-m", "Ignore"]);
  const off = access(dir, ["--repo-history", "off"]);
  assert.equal(off.repoHistoryError, null);
  const rules = readFileSync(join(dir, ".gitignore"), "utf8").split("\n");
  for (const rule of ["node_modules", ".env", "*.log", ".bot-herdr/"]) assert.ok(rules.includes(rule), rule);
  assert.deepEqual(gitOut(dir, ["show", "HEAD:.gitignore"]).split("\n"), ["node_modules", ".env", "*.log", ".bot-herdr/"]);
  assert.equal(gitOut(dir, ["ls-files", "--", ".bot-herdr"]), "");
});

test("off leaves HEAD clean when .bot-herdr was only staged", () => {
  const dir = fresh("staged-only");
  git(dir, ["add", ".bot-herdr"]);
  assert.notEqual(gitOut(dir, ["ls-files", "--", ".bot-herdr"]), "");
  const off = access(dir, ["--repo-history", "off"]);
  assert.equal(off.repoHistoryError, null);
  assert.equal(gitOut(dir, ["ls-tree", "-r", "--name-only", "HEAD", "--", ".bot-herdr"]), "");
  assert.match(readFileSync(join(dir, ".gitignore"), "utf8"), /^\.bot-herdr\/$/m);
});

test("off removes .bot-herdr from HEAD when the user staged its deletion", () => {
  const dir = repo("staged-delete");
  git(dir, ["rm", "-r", "-q", "--", ".bot-herdr"]);
  assert.notEqual(gitOut(dir, ["diff", "--cached", "--name-only", "--", ".bot-herdr"]), "");
  const off = access(dir, ["--repo-history", "off"]);
  assert.equal(off.repoHistoryError, null);
  assert.equal(gitOut(dir, ["ls-tree", "-r", "--name-only", "HEAD", "--", ".bot-herdr"]), "");
  assert.equal(gitOut(dir, ["log", "-1", "--format=%s"]), "Keep bot-herdr's repo history out of git");
});

test("a flip is refused mid-merge", () => {
  const dir = repo("merging");
  const base = gitOut(dir, ["rev-parse", "--abbrev-ref", "HEAD"]);
  writeFileSync(join(dir, "f.txt"), "base\n");
  git(dir, ["add", "f.txt"]);
  git(dir, ["commit", "-q", "-m", "Base"]);
  git(dir, ["checkout", "-q", "-b", "side"]);
  writeFileSync(join(dir, "f.txt"), "side\n");
  git(dir, ["commit", "-q", "-am", "Side"]);
  git(dir, ["checkout", "-q", base]);
  writeFileSync(join(dir, "f.txt"), "main\n");
  git(dir, ["commit", "-q", "-am", "Main"]);
  assert.notEqual(git(dir, ["merge", "side"]).status, 0);
  const before = commits(dir);
  const off = access(dir, ["--repo-history", "off"]);
  assert.equal(off.repoHistory, false);
  assert.equal(off.repoHistoryError, "finish the merge in progress first");
  assert.equal(commits(dir), before);
  assert.equal(gitOut(dir, ["rev-parse", "-q", "--verify", "MERGE_HEAD"]).length, 40);
  assert.equal(existsSync(join(dir, ".gitignore")), false);
  assert.notEqual(gitOut(dir, ["ls-files", "-u", "--", "f.txt"]), "");
});
