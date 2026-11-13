// Where a task's work lives in git. Settings → How agents run → Git isolation: a new task gets a
// branch of its own (`branch`: created and checked out in the project folder), or a worktree of
// its own (`worktree`: a second checkout on that branch, which every agent of the task runs in,
// so tasks never trample each other's files), or neither (`off`). Both are named after the task.
// Every failure comes back as one readable line and the task simply runs without isolation: git
// being unusable never stops a task.
//
// Worktrees: <project>/.bot-herdr/worktrees/<branch>, kept out of `git add -A` by a local exclude.

import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export const ISOLATIONS = ["off", "branch", "worktree"];

/** Runs git; returns trimmed stdout, throws with git's own first line. `env` adds to the process environment. */
export function runGit(cwd, args, env) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", timeout: 30000, windowsHide: true, env: env ? { ...process.env, ...env } : process.env });
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

const HISTORY_LINE = ".bot-herdr/";
const HISTORY_LINES = new Set([".bot-herdr", ".bot-herdr/", "/.bot-herdr", "/.bot-herdr/"]);
const HISTORY_PATHS = [".bot-herdr", ".gitignore"];

/** Adds the canonical `.bot-herdr/` line to the .gitignore (creating it) when `want`, else removes any history rule; true when changed. */
function setHistoryEntry(file, want) {
  const current = existsSync(file) ? readFileSync(file, "utf8") : "";
  const has = current.split("\n").some((l) => HISTORY_LINES.has(l.trim()));
  if (want === has) return false;
  const rest = current.split("\n").filter((l) => !HISTORY_LINES.has(l.trim())).join("\n");
  const next = want ? `${current}${current && !current.endsWith("\n") ? "\n" : ""}${HISTORY_LINE}\n` : rest.trim() ? rest : "";
  writeFileSync(file, next);
  return true;
}

/** Seeds a temp index from HEAD; an empty one only while the repository has no commit. */
function seedIndex(git, top, scoped) {
  try {
    git(top, ["rev-parse", "-q", "--verify", "HEAD"]);
  } catch {
    scoped(["read-tree", "--empty"]);
    return;
  }
  scoped(["read-tree", "HEAD"]);
}

/** Commits the temp index, turning git's ref-lock race into something a user can act on. */
function commitIndex(scoped, message) {
  try {
    scoped(["commit", "-q", "-m", message]);
  } catch (e) {
    throw new Error(/cannot lock ref/.test(e.message) ? "another git commit was running; turn the setting off and on again" : e.message);
  }
}

/** Pushes the flip's commit; a failure stays one readable note. */
function pushHistory(git, top, committed) {
  try {
    git(top, ["push"]);
  } catch (e) {
    return { committed, pushed: false, note: `committed; push failed: ${e.message}` };
  }
  return { committed, pushed: true, note: "committed and pushed" };
}

/**
 * Commits only the repo-history paths, through an index seeded from HEAD, so the user's staged
 * work is neither committed nor disturbed; then pushes when the repository has a remote.
 */
function commitHistory(git, top, message, already, stage) {
  if (!HISTORY_PATHS.some((p) => existsSync(join(top, p)))) return { committed: null, pushed: false, note: already };
  const index = join(tmpdir(), `bh-history-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const scoped = (args) => git(top, args, { GIT_INDEX_FILE: index });
  try {
    seedIndex(git, top, scoped);
    stage(scoped);
    if (!scoped(["diff", "--cached", "--name-only", "--", ...HISTORY_PATHS])) return { committed: null, pushed: false, note: already };
    commitIndex(scoped, message);
  } finally {
    rmSync(index, { force: true });
    rmSync(`${index}.lock`, { force: true });
  }
  git(top, ["reset", "-q", "--", ...HISTORY_PATHS]);
  const committed = git(top, ["rev-parse", "HEAD"]);
  if (!git(top, ["remote"])) return { committed, pushed: false, note: "committed; no remote to push to" };
  return pushHistory(git, top, committed);
}

/** Whether HEAD holds any path under .bot-herdr (false while the repository has no commit). */
function headTracksHistory(git, top) {
  try {
    return Boolean(git(top, ["ls-tree", "-r", "--name-only", "HEAD", "--", ".bot-herdr"]));
  } catch {
    return false;
  }
}

function untrackHistory(git, top) {
  const ignore = join(top, ".gitignore");
  const changed = setHistoryEntry(ignore, true);
  if (!changed && !headTracksHistory(git, top)) return { committed: null, pushed: false, note: "already excluded" };
  return commitHistory(git, top, "Keep bot-herdr's repo history out of git", "already excluded", (scoped) => {
    if (scoped(["ls-files", "--", ".bot-herdr"])) scoped(["rm", "-r", "-q", "--cached", "--", ".bot-herdr"]);
    if (existsSync(ignore)) scoped(["add", ".gitignore"]);
  });
}

function trackHistory(git, top) {
  const ignore = join(top, ".gitignore");
  const changed = setHistoryEntry(ignore, false);
  const present = existsSync(join(top, ".bot-herdr"));
  if (!present && !changed) return { committed: null, pushed: false, note: "nothing to track" };
  const specs = [...(present ? [".bot-herdr", ":(exclude).bot-herdr/worktrees"] : []), ...(existsSync(ignore) ? [".gitignore"] : [])];
  return commitHistory(git, top, "Track bot-herdr's repo history in git", "already tracked", (scoped) => {
    if (specs.length) scoped(["add", "-f", "--", ...specs]);
  });
}

/** Whether the real index holds an unresolved merge; a flip would commit it on a temp index. */
function mergeInProgress(git, top) {
  try {
    git(top, ["rev-parse", "-q", "--verify", "MERGE_HEAD"]);
    return true;
  } catch {
    return Boolean(git(top, ["ls-files", "-u"]));
  }
}

/**
 * Settings → Repo history: keeps the project's `.bot-herdr/` in git (`on`) or out of it (`off`),
 * with one commit, pushed when the repository has a remote. Never throws: a failure is one line.
 */
export function applyRepoHistory({ root, on, git = runGit }) {
  let top;
  try {
    top = git(root, ["rev-parse", "--show-toplevel"]);
  } catch {
    return { repo: false, on: Boolean(on), committed: null, pushed: false, note: "not a git repository", error: null };
  }
  if (mergeInProgress(git, top)) {
    return { repo: true, on: Boolean(on), committed: null, pushed: false, note: "", error: "finish the merge in progress first" };
  }
  try {
    return { repo: true, on: Boolean(on), ...(on ? trackHistory(git, top) : untrackHistory(git, top)), error: null };
  } catch (e) {
    return { repo: true, on: Boolean(on), committed: null, pushed: false, note: "", error: e.message };
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
