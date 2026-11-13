// Where things live and the small helpers every command uses.
//
// The engine sits in the mod: <app home>/mods/bot-herdr/engine. What belongs to the user
// (the roster, settings, replies, questions) is kept under <app home>/data/bot-herdr. What
// belongs to a project (tasks, plans, knowledge, scripts) is kept in the project, in .bot-herdr/.

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
export const BH = join(ENGINE, "bh.mjs");
/** herdr's app home: the engine is <app home>/mods/bot-herdr/engine. BH_APP_HOME overrides (tests). */
export const APP_HOME = process.env.BH_APP_HOME || resolve(ENGINE, "..", "..", "..");
export const DATA = join(APP_HOME, "data", "bot-herdr");

/**
 * How agents run (Settings → How agents run): headless (the default) or as their CLI, and what
 * they may do without asking: standard (the default) or full, plus commands the user allowed.
 */
export function accessOf() {
  const saved = readJson(join(DATA, "config.json"), {})?.agents ?? {};
  return {
    access: saved.access === "full" ? "full" : "standard",
    allow: Array.isArray(saved.allow) ? saved.allow.map((x) => String(x).trim()).filter(Boolean) : [],
    headless: saved.headless !== false,
    // Settings → Git isolation: a new task's own branch, or worktree, or neither.
    git: ["branch", "worktree"].includes(saved.git) ? saved.git : "off",
    // Settings → Repo history: .bot-herdr/ committed and pushed with the project, unless turned off.
    repoHistory: saved.repoHistory !== false,
  };
}

/** The command an agent types to run bh. */
export const bhCommand = () => `node "${BH.replace(/\\/g, "/")}"`;

/** The git work tree around `cwd` (a task's own worktree stays itself: its files are there), else `cwd`. */
export function projectRoot(cwd = process.cwd()) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || cwd;
  } catch {
    return cwd;
  }
}

/**
 * The project's .bot-herdr folder (made on first use), or a path inside it. A task's worktree
 * (.bot-herdr/worktrees/<branch>) keeps its tasks and plans in the project it was made from.
 */
export function store(root, ...parts) {
  const inWorktree = /^(.*?)[\\/]\.bot-herdr[\\/]worktrees[\\/]/.exec(`${root}/`);
  return join(inWorktree ? inWorktree[1] : root, ".bot-herdr", ...parts);
}

export function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function readJson(path, fallback = null) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

/** Writes JSON whole or not at all (a temporary file, then a rename). */
export function writeJson(path, value) {
  ensureDir(dirname(path));
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n");
  renameSync(tmp, path);
}

export function writeText(path, text) {
  ensureDir(dirname(path));
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

export function readText(path, fallback = "") {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return fallback;
  }
}

export function appendJsonl(path, value) {
  ensureDir(dirname(path));
  appendFileSync(path, JSON.stringify(value) + "\n");
}

const SLEEP = new Int32Array(new SharedArrayBuffer(4)); // for Atomics.wait: a synchronous sleep
const LOCK_WAIT_MS = 15_000; // longer than a stale lock's age, so a killed command never fails the next
const LOCK_STALE_MS = 10_000;
// On Windows a lock file another process is deleting makes an exclusive create fail with EPERM
// (or EACCES), not EEXIST: both mean "held, wait".
const HELD = new Set(["EEXIST", "EPERM", "EACCES"]);

/**
 * Runs `fn` holding `<path>.lock`, so two commands never read-modify-write one file at once. The
 * lock is a file made exclusively and stamped with this command's token, waited on, and removed
 * afterwards only while it still carries that token. One older than 10 s is stale (its holder
 * died) and is renamed away first, so two waiters can never both take it. Returns what `fn` returned.
 */
export function withLock(path, fn) {
  const lock = `${path}.lock`;
  ensureDir(dirname(lock));
  const token = randomUUID();
  const until = Date.now() + LOCK_WAIT_MS;
  let fd;
  while (fd === undefined) {
    try {
      fd = openSync(lock, "wx");
      writeFileSync(fd, token);
    } catch (e) {
      if (!HELD.has(e.code)) throw e;
      if (clearStaleLock(lock)) continue;
      if (Date.now() >= until) throw new Error(`bh: ${path} is locked by another command; try again`);
      Atomics.wait(SLEEP, 0, 0, 25);
    }
  }
  try {
    return fn();
  } finally {
    closeSync(fd);
    try {
      if (readFileSync(lock, "utf8") === token) unlinkSync(lock);
    } catch {}
  }
}

/**
 * Takes away a lock old enough to be a dead command's: renamed to a unique name before it is
 * removed, so two waiters cannot both take it over. True when there is no lock left.
 */
function clearStaleLock(lock) {
  try {
    if (Date.now() - statSync(lock).mtimeMs < LOCK_STALE_MS) return false;
    const stale = `${lock}.${process.pid}.${randomUUID().slice(0, 8)}.stale`;
    renameSync(lock, stale);
    unlinkSync(stale);
    return true;
  } catch {
    return false;
  }
}

export function readJsonl(path) {
  return readText(path).split("\n").filter(Boolean).flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
}

export function listDir(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

export const exists = existsSync;

export const now = () => new Date().toISOString();

/** A short, sortable id: a prefix, the date and a random tail. */
export function newId(prefix) {
  const d = new Date();
  const day = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `${prefix}-${day}-${Math.random().toString(36).slice(2, 6)}`;
}

/** A title from a request's first words, when no one gave one. */
export function titleFrom(text, words = 6) {
  const clean = String(text ?? "").replace(/[`*_#>[\]()]/g, " ").replace(/\s+/g, " ").trim();
  const picked = clean.split(" ").slice(0, words).join(" ");
  return (picked.charAt(0).toUpperCase() + picked.slice(1)).replace(/[.,;:!?-]+$/, "") || "Untitled";
}

/**
 * Arguments: `--flag value`, `--flag=value`, bare `--flag` (true), repeated flags collect into
 * arrays when `many` names them. Everything else is positional.
 */
export const BOOLEANS = ["json", "all", "review", "multi", "force", "on", "off"];

export function parseArgs(argv, many = [], booleans = BOOLEANS) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") {
      rest.push(...argv.slice(i + 1));
      break;
    }
    const m = /^--([a-z][\w-]*)(?:=(.*))?$/i.exec(a);
    if (!m) {
      rest.push(a);
      continue;
    }
    const key = m[1];
    let value = m[2];
    if (value === undefined) value = !booleans.includes(key) && argv[i + 1] !== undefined && !argv[i + 1].startsWith("--") ? argv[++i] : true;
    if (many.includes(key)) (flags[key] ??= []).push(value);
    else flags[key] = value;
  }
  return { flags, rest };
}

/**
 * Text from `--data` (URI-encoded, what the mod passes: no quoting trouble on any OS), else
 * `--file`, else the positional words, else stdin when it is piped.
 */
export function bodyText(flags, rest) {
  if (typeof flags.data === "string") return decodeURIComponent(flags.data);
  if (typeof flags.file === "string") return readFileSync(flags.file, "utf8");
  if (rest.length) return rest.join(" ");
  if (!process.stdin.isTTY) {
    try {
      return readFileSync(0, "utf8");
    } catch {
      return "";
    }
  }
  return "";
}

/** The terminal this command runs in (herdr-core sets it), or null outside one. */
export const myAddress = () => process.env.HC_TERMINAL_ID || null;

export function sh(cmd, args, opts = {}) {
  try {
    return { code: 0, out: execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024, ...opts }) };
  } catch (e) {
    return { code: e.status ?? 1, out: String(e.stdout ?? ""), err: String(e.stderr ?? e.message ?? "") };
  }
}

export class UsageError extends Error {}
export function need(value, usage) {
  if (value === undefined || value === null || value === "" || value === true) throw new UsageError(usage);
  return value;
}
