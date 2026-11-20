// Where the project root is, without starting git: a walk up from the folder to the first one
// holding `.git` (a normal repo's folder, or a worktree's `.git` file). No `.git`: the folder itself.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "bh-root-"));
process.env.BH_APP_HOME = join(tmp, "app");
const { projectRoot } = await import("../mods/bot-herdr/engine/lib/core.mjs");

const mk = (...parts) => {
  const dir = join(tmp, ...parts);
  mkdirSync(dir, { recursive: true });
  return dir;
};

test("a repo's root is found from the root itself and from any folder under it", () => {
  const root = mk("repo");
  mkdirSync(join(root, ".git"));
  assert.equal(projectRoot(root), root);
  assert.equal(projectRoot(mk("repo", "src", "deep")), root);
});

test("a worktree's .git file marks the worktree folder as the root", () => {
  const repo = mk("wt", "repo");
  mkdirSync(join(repo, ".git"));
  const worktree = mk("wt", "repo", ".bot-herdr", "worktrees", "bh-t-1-dev");
  writeFileSync(join(worktree, ".git"), `gitdir: ${join(repo, ".git", "worktrees", "bh-t-1-dev")}\n`);
  assert.equal(projectRoot(worktree), worktree);
  assert.equal(projectRoot(mk("wt", "repo", ".bot-herdr", "worktrees", "bh-t-1-dev", "src")), worktree);
});

test("no .git above: the folder itself is the root", () => {
  const loose = mk("loose", "a", "b");
  assert.equal(projectRoot(loose), loose);
});
