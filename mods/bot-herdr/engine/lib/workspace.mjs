// Where a task's work lives in git. Settings → How agents run → Git isolation: a new task gets a
// branch of its own (`branch`: created and checked out in the project folder), or a worktree of
// its own (`worktree`: a second checkout on that branch, which every agent of the task runs in,
// so tasks never trample each other's files), or neither (`off`). Both are named after the task.
// Every failure comes back as one readable line and the task simply runs without isolation: git
// being unusable never stops a task.
//
// Worktrees: <project>/.bot-herdr/worktrees/<branch>, kept out of `git add -A` by a local exclude.

import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export const ISOLATIONS = ["off", "branch", "worktree"];

/** Runs git; returns trimmed stdout, throws with git's own first line. */
export function runGit(cwd, args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", timeout: 30000, windowsHide: true });
  if (r.error?.code === "ENOENT") throw new Error("git is not installed");
  if (r.status !== 0) {
    const line = String(r.stderr || r.error?.message || "").split("\n").find((l) => l.trim())?.trim().replace(/^(fatal|error):\s*/i, "");
    throw new Error(line || "git failed");
  }
  return String(r.stdout ?? "").trim();
}

export const worktreesRoot = (root) => join(root, ".bot-herdr", "worktrees");

/** A branch name git accepts, made from a task's title. */
export function branchName(name) {
  const cleaned = String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s~^:?*[\\]+/g, "-")
    .replace(/@\{/g, "-")
    .replace(/[^a-z0-9._/-]/g, "")
    .replace(/\.{2,}/g, ".")
    .replace(/\/{2,}/g, "/")
    .replace(/-{2,}/g, "-")
    .replace(/^[-./]+|[-./]+$/g, "")
    .replace(/\.lock$/, "")
    .slice(0, 60)
    .replace(/[-./]+$/g, "");
  return cleaned || "task";
}

/** The first of `name`, `name-2`, `name-3`… that no branch (local or remote) uses. */
function freeBranch(git, top, name) {
  const base = branchName(name);
  for (let n = 1; n < 100; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    let taken = "";
    try {
      taken = git(top, ["for-each-ref", "--count=1", "--format=%(refname)", `refs/heads/${candidate}`, `refs/remotes/*/${candidate}`]);
    } catch {
      taken = "";
    }
    if (!taken) return candidate;
  }
  throw new Error(`every branch name like ${base} is taken`);
}

function canon(p) {
  try {
    return (realpathSync.native || realpathSync)(resolve(p));
  } catch {
    return resolve(p);
  }
}

function excludeWorktrees(git, top, root) {
  try {
    const inside = relative(canon(top), canon(worktreesRoot(root)));
    if (!inside || inside.startsWith("..") || isAbsolute(inside)) return;
    const file = resolve(top, git(top, ["rev-parse", "--git-path", "info/exclude"]));
    const line = `/${inside.split(sep).join("/")}/`;
    const current = existsSync(file) ? readFileSync(file, "utf8") : "";
    if (current.split("\n").some((l) => l.trim() === line)) return;
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${current && !current.endsWith("\n") ? "\n" : ""}# bot-herdr: one worktree per task\n${line}\n`);
  } catch {
    // only a convenience: a read-only .git leaves the worktrees showing as untracked
  }
}

/**
 * Gives a task its branch (or worktree and branch). Returns { mode, branch, from?, base?, path? },
 * or one line saying why not; the task then runs without.
 */
export function createWorkspace({ cwd, root = cwd, name, mode, git = runGit }) {
  if (mode !== "branch" && mode !== "worktree") return "git isolation is off";
  let top;
  try {
    top = git(cwd, ["rev-parse", "--show-toplevel"]);
  } catch {
    return "this folder is not a git repository";
  }
  const safe = (args) => {
    try {
      return git(top, args);
    } catch {
      return "";
    }
  };
  const current = safe(["branch", "--show-current"]);
  const head = safe(["rev-parse", "--verify", "HEAD"]);
  let branch;
  try {
    branch = freeBranch(git, top, name);
    git(top, ["check-ref-format", "--branch", branch]);
  } catch (e) {
    return `no valid branch name for ${name}: ${e.message}`;
  }
  const from = current || (head ? `detached at ${head.slice(0, 7)}` : null);
  const base = { branch, ...(from ? { from } : {}), ...(head ? { base: head } : {}) };
  if (mode === "branch") {
    try {
      git(top, ["checkout", "-b", branch]);
    } catch (e) {
      return `could not create branch ${branch}: ${e.message}`;
    }
    return { mode: "branch", ...base };
  }
  if (!head) return "a worktree needs at least one commit to start from; commit first, or use a branch";
  const path = join(worktreesRoot(root), branch);
  try {
    mkdirSync(dirname(path), { recursive: true });
    git(top, ["worktree", "add", "-b", branch, path, head]);
  } catch (e) {
    return `could not create a worktree for ${branch}: ${e.message}`;
  }
  excludeWorktrees(git, top, root);
  return { mode: "worktree", ...base, path };
}

/** The folder a task's agents run in: its worktree when it has one (and it is still there), else `cwd`. */
export function taskCwd(task, cwd) {
  const g = task?.git;
  return g?.mode === "worktree" && g.path && existsSync(g.path) ? g.path : cwd;
}

/** Why a task's worktree can't be used (it was removed), or "" when it is there or the task has none. */
export function missingWorktree(task) {
  const g = task?.git;
  if (g?.mode !== "worktree" || !g.path || existsSync(g.path)) return "";
  return `The worktree ${g.path} of branch ${g.branch} is gone. Restore it with: git worktree add "${g.path}" ${g.branch}`;
}

/** What the Orchestrator and every agent of the task are told about where its work lives. */
export function gitLine(g) {
  if (!g?.branch) return "";
  const from = g.from ? ` (from ${g.from})` : "";
  if (g.mode === "branch") return `Git: this task works on its own branch ${g.branch}${from}, checked out in the project folder. Commit there; never switch branches.`;
  return [
    `Git: this task works in its own worktree ${g.path} on branch ${g.branch}${from}. Every agent of the task runs there; bh spawn --task starts them there.`,
    `Look at the task's files under that folder (git -C "${g.path}" diff --stat), and never edit outside it.`,
    "Uncommitted changes in the main checkout are not in the worktree.",
  ].join(" ");
}
