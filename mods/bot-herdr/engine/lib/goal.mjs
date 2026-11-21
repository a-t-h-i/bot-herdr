// Goal-driven autonomous verification loop: immutable DONE contracts stored outside the
// worktree (under DATA/goals/), full-matrix deterministic verification, anti-tamper guards,
// strict monotonic git ratchet (refs/bot-herdr/goal/<task>/best & iter-<n>), Gap Ledger,
// amendment proposals (personOnly approval), single-driver PID claims, and bounded round
// prompts for agent.mjs.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { BH, DATA, appendJsonl, newId, now, readJson, store, withLock, writeJson } from "./core.mjs";
import * as T from "./tasks.mjs";
import * as W from "./workspace.mjs";
import * as S from "./scripts.mjs";
import * as RZ from "./resilience.mjs";
import * as IM from "./improve.mjs";

export const GOAL_STATUSES = ["running", "waiting", "paused", "reached", "stopped"];
export const DEFAULT_MAX_SPEND_USD = 15;

/**
 * A Goal's spend ceiling: an explicit 0 means uncapped, while an omitted, blank or invalid value
 * keeps the default. 0 is a real ceiling value, so `Number(x) > 0 ? x : default` would lose it.
 */
export function spendCeiling(value, fallback = DEFAULT_MAX_SPEND_USD) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string" && !value.trim()) return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
const COMMAND_TIMEOUT_MS = 600_000;
const SHELL_META = /[;&|<>`\r\n]|\$\(/;
const EXTRA_TEST_SABOTAGE = /\b(?:test|it|describe)\.(?:skip|todo)\s*\(/;
const GOAL_PROTECTED_EXTRA = [
  { rule: "protected_goal_engine", match: /^mods\/bot-herdr\/engine\/lib\/goal\.mjs$/ },
];

const normPath = (p) => String(p ?? "").replace(/\\/g, "/").replace(/^"+|"+$/g, "").replace(/^(\.\/)+/, "").trim();
const isTestPath = (p) => /^test\/|\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(normPath(p));
const clip = (text, max = 400) => {
  const s = String(text ?? "").trim();
  return s.length <= max ? s : `${s.slice(0, max)}…`;
};
const firstLine = (text) => String(text ?? "").split("\n").map((l) => l.trim()).find(Boolean) ?? "";

// ── Frozen Goal Contract (stored outside the worktree under DATA/goals/) ─────────────────

export const contractPath = (taskId) => join(DATA, "goals", `${String(taskId)}.json`);

function canonicalContractPayload(c) {
  return {
    version: c.version ?? 1,
    taskId: c.taskId,
    planId: c.planId ?? null,
    base: c.base ?? null,
    criteria: (c.criteria ?? []).map((x) => ({
      id: x.id,
      kind: x.kind,
      text: x.text,
      required: x.required !== false,
      ...(x.command !== undefined ? { command: x.command } : {}),
      ...(x.expect !== undefined ? { expect: x.expect } : {}),
      ...(x.path !== undefined ? { path: x.path } : {}),
    })),
    scriptHashes: Object.fromEntries(Object.entries(c.scriptHashes ?? {}).sort(([a], [b]) => a.localeCompare(b))),
    maxSpendUsd: Number(c.maxSpendUsd ?? DEFAULT_MAX_SPEND_USD),
    createdAt: c.createdAt,
    amendments: c.amendments ?? [],
  };
}

export function contractDigest(contract) {
  return createHash("sha256").update(JSON.stringify(canonicalContractPayload(contract))).digest("hex");
}

/** Parses a command string into argv without a shell; refuses shell operators. */
export function parseArgv(command) {
  const raw = String(command ?? "").trim();
  if (!raw) throw new Error("Command criterion is empty.");
  if (SHELL_META.test(raw)) throw new Error(`Shell operators are not allowed in command criteria: ${raw}`);
  const argv = [];
  let cur = "";
  let quote = null;
  let escape = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (escape) {
      cur += ch;
      escape = false;
      continue;
    }
    if (ch === "\\" && quote !== "'") {
      escape = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (cur) {
        argv.push(cur);
        cur = "";
      }
      continue;
    }
    cur += ch;
  }
  if (quote) throw new Error(`Unclosed quote in command criterion: ${raw}`);
  if (cur) argv.push(cur);
  if (!argv.length) throw new Error("Command criterion has no executable.");
  return argv;
}

function hashFile(absPath) {
  try {
    return createHash("sha256").update(readFileSync(absPath)).digest("hex");
  } catch {
    return null;
  }
}

function insideRepo(cwd, absPath) {
  const rel = relative(resolve(cwd), resolve(absPath));
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return null;
  return rel.split(sep).join("/");
}

/** Collects repo-relative script files referenced by `[command]` criteria so their SHA-256 hashes are frozen. */
export function referencedScripts(cwd, criteria, root = cwd) {
  const paths = new Set();
  for (const c of criteria ?? []) {
    if (c.kind !== "command" || !c.command) continue;
    let argv;
    try {
      argv = parseArgv(c.command);
    } catch {
      continue;
    }
    const [bin, a1, a2, a3] = argv;
    // `bh scripts run <name>` or `bh script run <name>`
    if ((bin === "bh" || /(?:^|\/)bh\.mjs$/.test(bin)) && (a1 === "scripts" || a1 === "script") && a2 === "run" && a3) {
      let found = null;
      try {
        found = S.find(root, a3);
      } catch {}
      if (found?.file) {
        const rel = insideRepo(root, found.file) || insideRepo(cwd, found.file);
        if (rel) paths.add(rel);
      }
      continue;
    }
    // `node <script>` / `bash <script>` / `sh <script>` / `python3 <script>`
    if (/^(?:node|bash|sh|python3?|ruby|perl|bun|deno)$/i.test(bin)) {
      const target = argv.slice(1).find((tok) => !tok.startsWith("-"));
      if (target) {
        const abs = resolve(cwd, target);
        if (existsSync(abs)) {
          const rel = insideRepo(cwd, abs);
          if (rel) paths.add(rel);
        }
      }
      continue;
    }
    // Direct relative executable `./scripts/verify.sh`
    if (bin.includes("/") || bin.startsWith(".")) {
      const abs = resolve(cwd, bin);
      if (existsSync(abs)) {
        const rel = insideRepo(cwd, abs);
        if (rel) paths.add(rel);
      }
    }
  }
  return [...paths].sort();
}

function resolveScriptPath(cwd, root, rel) {
  const p = normPath(rel);
  if (p.startsWith(".bot-herdr/scripts/")) {
    const inRoot = resolve(root, p);
    if (existsSync(inRoot)) return inRoot;
  }
  return resolve(cwd, p);
}

export function hashReferencedScripts(cwd, criteria, root = cwd) {
  const hashes = {};
  for (const rel of referencedScripts(cwd, criteria, root)) {
    const h = hashFile(resolveScriptPath(cwd, root, rel));
    if (h) hashes[rel] = h;
  }
  return hashes;
}

/** Writes the immutable frozen contract outside the git worktree under `DATA/goals/<taskId>.json`. */
export function freezeContract(root, task, criteria, { maxSpendUsd = DEFAULT_MAX_SPEND_USD, cwd = null } = {}) {
  const workDir = cwd || W.taskCwd(task, root);
  const cleanCriteria = (criteria ?? []).map((c, idx) => {
    const item = {
      id: c.id || `c${idx + 1}`,
      kind: c.kind,
      text: String(c.text ?? "").trim(),
      required: c.required !== false,
      ...(c.command !== undefined ? { command: c.command } : {}),
      ...(c.expect !== undefined ? { expect: c.expect } : {}),
      ...(c.path !== undefined ? { path: c.path } : {}),
    };
    if (item.kind === "command") parseArgv(item.command); // validate syntax before freezing
    return item;
  });
  if (!cleanCriteria.length) throw new Error("A Goal requires at least one DONE criterion.");
  const payload = {
    version: 1,
    taskId: task.id,
    planId: task.plan ?? null,
    base: task.base ?? null,
    criteria: cleanCriteria,
    scriptHashes: hashReferencedScripts(workDir, cleanCriteria, root),
    maxSpendUsd: spendCeiling(maxSpendUsd),
    createdAt: now(),
    amendments: [],
  };
  const contract = { ...payload, digest: contractDigest(payload) };
  writeJson(contractPath(task.id), contract);
  return contract;
}

/** Loads and verifies the frozen contract's SHA-256 digest. */
export function loadFrozenContract(taskId) {
  const path = contractPath(taskId);
  const contract = readJson(path, null);
  if (!contract) return { ok: false, reason: `Frozen Goal contract is missing (${path}).` };
  const expected = contractDigest(contract);
  if (contract.digest !== expected) {
    return { ok: false, reason: `Frozen Goal contract digest mismatch for ${taskId}: contract was tampered with.` };
  }
  return { ok: true, contract };
}

/** Returns repo-relative script paths referenced by any active or paused Goal (protected from pruning). */
export function activeGoalScriptPaths(root) {
  const protectedPaths = new Set();
  for (const t of T.listTasks(root)) {
    if (t.mode !== "goal" || (t.status !== "active" && t.status !== "paused")) continue;
    const loaded = loadFrozenContract(t.id);
    if (loaded.ok) {
      for (const rel of Object.keys(loaded.contract.scriptHashes ?? {})) protectedPaths.add(normPath(rel));
    }
  }
  return protectedPaths;
}

// ── Tree hash & Anti-Tamper Integrity Audit ──────────────────────────────────────────────

const EXCLUDE_INTERNAL = [
  ":(exclude).bot-herdr/tasks",
  ":(exclude).bot-herdr/plans",
  ":(exclude).bot-herdr/tmp",
  ":(exclude).bot-herdr/worktrees",
  ":(exclude).bot-herdr/goals",
  ":(exclude).bot-herdr/improve",
  ":(exclude).bot-herdr/issues",
  ":(exclude).bot-herdr/reports",
];

function isInternalPath(rel) {
  const p = normPath(rel);
  return /^\.bot-herdr\/(?:tasks|plans|tmp|worktrees|goals|improve|issues|reports)(?:\/|$)/.test(p);
}

/**
 * Deterministic tree hash for Goal verification: HEAD + binary diff + untracked files,
 * excluding `.bot-herdr/{tasks,plans,tmp,worktrees,...}` ledger files (while STILL including
 * `.bot-herdr/scripts/` so tampering with any project verification script changes the hash).
 */
export function goalChangeHash(cwd, { git = W.runGit } = {}) {
  let head = "";
  let diff = "";
  let untracked = [];
  try {
    head = git(cwd, ["rev-parse", "HEAD"]);
  } catch {
    head = "";
  }
  try {
    diff = git(cwd, ["diff", "HEAD", "--binary", "--", ".", ...EXCLUDE_INTERNAL]);
  } catch {
    diff = "";
  }
  try {
    untracked = git(cwd, ["ls-files", "--others", "--exclude-standard"])
      .split("\n")
      .map((l) => l.trim())
      .filter((f) => f && !isInternalPath(f))
      .sort();
  } catch {
    untracked = [];
  }
  const hash = createHash("sha1");
  hash.update(head + "\n" + diff + "\n");
  for (const file of untracked) {
    hash.update(file + "\n");
    try {
      hash.update(readFileSync(join(cwd, file)));
    } catch {}
    hash.update("\n");
  }
  return { head, diff: hash.digest("hex") };
}

function goalProtectedRules(file) {
  const p = normPath(file).toLowerCase();
  const rules = [
    ...IM.PROTECTED_FILE_PATTERNS.filter((r) => r.match.test(p)).map((r) => r.rule),
    ...GOAL_PROTECTED_EXTRA.filter((r) => r.match.test(p)).map((r) => r.rule),
  ];
  return [...new Set(rules)];
}

/**
 * Audits the Goal tree against `Freeze Goal checks only` policy:
 * - Blocks tampering with frozen Goal verification scripts (both path & SHA-256 hash)
 * - Blocks tampering with protected harness guards, built-in check scripts, and runner configs (.npmrc etc.)
 * - Blocks test sabotage patterns (`process.exit`, `process.kill`, `.skip(`, `.todo(`) in added test lines
 * - Allows updating existing project tests during normal refactoring
 */
export function auditGoalTree(cwd, base, contract, { git = W.runGit, root = cwd } = {}) {
  const violations = [];
  const seen = new Set();
  const add = (rule, file, detail) => {
    const key = `${rule}|${file}|${detail}`;
    if (!seen.has(key)) {
      seen.add(key);
      violations.push({ rule, file, detail });
    }
  };

  // 1. Verify frozen script SHA-256 hashes directly on disk (both root & worktree for .bot-herdr/scripts/*)
  for (const [rel, expectedHash] of Object.entries(contract?.scriptHashes ?? {})) {
    const abs = resolveScriptPath(cwd, root, rel);
    const actual = hashFile(abs);
    if (!actual) add("goal_script_tampered", rel, "referenced Goal verification script is missing");
    else if (actual !== expectedHash) add("goal_script_tampered", rel, "referenced Goal verification script was modified (SHA-256 mismatch)");
    if (normPath(rel).startsWith(".bot-herdr/scripts/")) {
      const inCwd = resolve(cwd, rel);
      if (inCwd !== abs && existsSync(inCwd) && hashFile(inCwd) !== expectedHash) {
        add("goal_script_tampered", rel, "worktree copy of referenced Goal verification script was modified (SHA-256 mismatch)");
      }
    }
  }

  // Defense-in-depth: check runner preload configs directly on disk even if gitignored (e.g. repoHistory off)
  for (const cfg of [".npmrc", ".yarnrc", ".yarnrc.yml", ".yarnrc.yaml", ".pnpmrc", ".pnpmfile.cjs", "bunfig.toml"]) {
    const abs = join(cwd, cfg);
    if (!existsSync(abs)) continue;
    let trackedAtBase = false;
    try {
      git(cwd, ["cat-file", "-e", `${base || "HEAD"}:${cfg}`]);
      trackedAtBase = true;
    } catch {}
    if (!trackedAtBase) add("protected_test_weakening", cfg, "untracked/gitignored runner config added in Goal tree");
  }

  const frozenScripts = new Set(Object.keys(contract?.scriptHashes ?? {}).map((p) => normPath(p).toLowerCase()));
  const checkPath = (p, status = "M", from = null) => {
    const path = normPath(p);
    if (!path || isInternalPath(path)) return;
    if (frozenScripts.has(path.toLowerCase())) {
      add("goal_script_tampered", path, "referenced Goal verification script must not be modified or deleted");
    }
    if (from && from !== path && frozenScripts.has(normPath(from).toLowerCase())) {
      add("goal_script_tampered", normPath(from), `referenced Goal verification script was ${status === "C" ? "copied" : "renamed"} to ${path}`);
    }
    for (const rule of goalProtectedRules(path)) add(rule, path, "a protected harness or runner config file");
    if (from && from !== path) {
      for (const rule of goalProtectedRules(from)) add(rule, normPath(from), `a protected file (${status === "C" ? "copied" : "renamed"} to ${path})`);
    }
  };

  const scanAddedTestLines = (diffText) => {
    let curFile = null;
    let inHunk = false;
    for (const raw of String(diffText ?? "").split("\n")) {
      if (raw.startsWith("diff --git ")) {
        const m = /^diff --git "?a\/(.+?)"? "?b\/(.+?)"?$/.exec(raw);
        curFile = m ? normPath(m[2]) : null;
        inHunk = false;
        continue;
      }
      if (raw.startsWith("+++ ")) {
        const plus = normPath(raw.slice(4).replace(/^b\//, ""));
        curFile = plus === "/dev/null" ? null : plus;
        continue;
      }
      if (raw.startsWith("@@")) {
        inHunk = true;
        continue;
      }
      if (!inHunk || !curFile || !isTestPath(curFile) || !raw.startsWith("+") || raw.startsWith("+++")) continue;
      const line = raw.slice(1);
      if (/\bprocess\.(?:exit|abort|reallyExit)\s*\(|\bprocess\.kill\s*\(/.test(line) || EXTRA_TEST_SABOTAGE.test(line)) {
        add("goal_test_sabotage", curFile, `sabotage pattern added to test: ${clip(line, 140)}`);
      }
    }
  };

  // 2. Committed diff since base (if git repo & valid base)
  let inGit = true;
  try {
    git(cwd, ["rev-parse", "--git-dir"]);
  } catch {
    inGit = false;
  }

  if (inGit) {
    const compareBase = base || "HEAD";
    try {
      const nameStatus = git(cwd, ["diff", "--name-status", "--find-renames", compareBase]);
      for (const row of nameStatus.split("\n").filter(Boolean)) {
        const [st, p1, p2] = row.split("\t");
        const status = String(st ?? "M").charAt(0).toUpperCase();
        checkPath(p2 ?? p1, status, p2 ? p1 : null);
      }
      const unified = git(cwd, ["diff", "-U0", "--no-color", "--find-renames", compareBase]);
      scanAddedTestLines(unified);
    } catch {}

    // 3. Untracked files (e.g. sneaky untracked `.npmrc` or sabotaged new test file)
    try {
      const untracked = git(cwd, ["ls-files", "--others", "--exclude-standard"]).split("\n").filter(Boolean);
      for (const rel of untracked) {
        checkPath(rel, "A");
        if (isTestPath(rel)) {
          try {
            const text = readFileSync(join(cwd, rel), "utf8");
            for (const line of text.split("\n")) {
              if (/\bprocess\.(?:exit|abort|reallyExit)\s*\(|\bprocess\.kill\s*\(/.test(line) || EXTRA_TEST_SABOTAGE.test(line)) {
                add("goal_test_sabotage", normPath(rel), `sabotage pattern in new test: ${clip(line, 140)}`);
                break;
              }
            }
          } catch {}
        }
      }
    } catch {}
  }

  return { ok: violations.length === 0, violations };
}

// ── Strict Monotonic Git Ratchet (best & iter-<n> refs) ──────────────────────────────────

const refSafe = (s) => String(s ?? "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "");
export const bestRef = (taskId) => `refs/bot-herdr/goal/${refSafe(taskId)}/best`;
export const iterRef = (taskId, n) => `refs/bot-herdr/goal/${refSafe(taskId)}/iter-${Number(n)}`;

/**
 * Snapshots the full working tree (tracked + untracked, excluding internal `.bot-herdr/` state)
 * into a git commit object referenced by `refName`, without disturbing the real index or branch.
 */
export function snapshotTree(cwd, refName, message, { git = W.runGit } = {}) {
  const index = join(tmpdir(), `bh-goal-idx-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const env = { GIT_INDEX_FILE: index };
  try {
    const head = git(cwd, ["rev-parse", "--verify", "HEAD"]);
    git(cwd, ["read-tree", "HEAD"], env);
    // Stage tracked changes + untracked non-internal files into the temporary index
    git(cwd, ["add", "-A", "--", ".", ...EXCLUDE_INTERNAL], env);
    const tree = git(cwd, ["write-tree"], env);
    const sha = git(cwd, ["commit-tree", tree, "-p", head, "-m", message], {
      ...env,
      GIT_AUTHOR_NAME: "bot-herdr",
      GIT_AUTHOR_EMAIL: "bot-herdr@localhost",
      GIT_COMMITTER_NAME: "bot-herdr",
      GIT_COMMITTER_EMAIL: "bot-herdr@localhost",
    });
    git(cwd, ["update-ref", refName, sha]);
    return { ok: true, ref: refName, sha };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    rmSync(index, { force: true });
    rmSync(`${index}.lock`, { force: true });
  }
}

/** Reverts the Goal worktree cleanly to the snapshot stored at `refName`. */
export function revertToRef(cwd, refName, { git = W.runGit } = {}) {
  try {
    const sha = git(cwd, ["rev-parse", "--verify", refName]);
    git(cwd, ["reset", "--hard", sha]);
    git(cwd, ["clean", "-fd", "-e", ".bot-herdr"]);
    return { ok: true, ref: refName, sha };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── Single-Driver PID Claim (prevents concurrent Goal loops & blocks bh improve apply) ───

const claimsDir = (root) => store(root, "goals");
export const goalClaimFile = (root, taskId) => join(claimsDir(root), `${String(taskId)}.claim.json`);

function pidAlive(pid) {
  if (!Number.isFinite(Number(pid)) || Number(pid) <= 0) return false;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

/** Returns any live Goal driver claim in this project (cleaning up stale dead-PID claims). */
export function activeGoalClaim(root) {
  const dir = claimsDir(root);
  if (!existsSync(dir)) return null;
  let entries = [];
  try {
    entries = readdirSync(dir).filter((f) => f.endsWith(".claim.json"));
  } catch {
    return null;
  }
  for (const name of entries) {
    const file = join(dir, name);
    const claim = readJson(file, null);
    if (claim?.pid && pidAlive(claim.pid)) return claim;
    // Dead PID: stale claim from a crashed driver
    try {
      rmSync(file, { force: true });
    } catch {}
  }
  return null;
}

export function acquireGoalClaim(root, taskId) {
  const file = goalClaimFile(root, taskId);
  const token = newId("gdrv");
  return withLock(join(claimsDir(root), String(taskId)), () => {
    const held = readJson(file, null);
    if (held?.pid && pidAlive(held.pid) && held.pid !== process.pid) {
      throw new Error(`Goal ${taskId} is already being driven by pid ${held.pid} (since ${held.at}).`);
    }
    const claim = { taskId, pid: process.pid, at: now(), token };
    writeJson(file, claim);
    return claim;
  });
}

export function releaseGoalClaim(root, taskId, token) {
  const file = goalClaimFile(root, taskId);
  return withLock(join(claimsDir(root), String(taskId)), () => {
    const held = readJson(file, null);
    if (!held || (token && held.token !== token)) return false;
    rmSync(file, { force: true });
    return true;
  });
}

export function withGoalClaim(root, taskId, fn) {
  const claim = acquireGoalClaim(root, taskId);
  try {
    return fn(claim);
  } finally {
    releaseGoalClaim(root, taskId, claim.token);
  }
}

// ── Goal Initialization ──────────────────────────────────────────────────────────────────

/**
 * Initializes `task.mode = "goal"` and `task.goal`, freezes the DONE contract under
 * `DATA/goals/<taskId>.json`, and snapshots the baseline `best` ref.
 */
export function initGoal(root, task, { criteria, maxSpendUsd = DEFAULT_MAX_SPEND_USD, maxIterations = 0, git = W.runGit } = {}) {
  const cwd = W.taskCwd(task, root);
  const contract = freezeContract(root, task, criteria, { maxSpendUsd, cwd });
  const snap = snapshotTree(cwd, bestRef(task.id), `goal baseline: ${task.id}`, { git });
  task.mode = "goal";
  task.goal = {
    status: "running",
    plan: task.plan ?? null,
    contractDigest: contract.digest,
    criteria: contract.criteria.map((c) => ({
      ...c,
      verdict: null,
      at: null,
      evidence: null,
      head: null,
      diff: null,
    })),
    iteration: 0,
    maxSpendUsd: contract.maxSpendUsd,
    maxIterations: Number(maxIterations) > 0 ? Number(maxIterations) : 0,
    bestScore: 0,
    bestPassedIds: [],
    bestCheckpoint: snap.ok ? snap.ref : null,
    bestHead: snap.ok ? snap.sha : null,
    noProgressStreak: 0,
    seenFailedHashes: [],
    awaitingQa: false,
    pendingAmendment: null,
    waitUntil: null,
    reason: null,
    reachedAt: null,
    reachedHead: null,
    reachedDiff: null,
  };
  return { task, contract, baseline: snap };
}

// ── Criterion Evaluation & Full-Matrix Verification ──────────────────────────────────────

function defaultRunCommand(cwd, command, { timeoutMs = COMMAND_TIMEOUT_MS } = {}) {
  const argv = parseArgv(command);
  let [bin, ...args] = argv;
  if (bin === "bh") {
    bin = process.execPath;
    args = [BH, ...args];
  }
  const env = { ...process.env, FORCE_COLOR: "0" };
  delete env.NODE_TEST_CONTEXT;
  const started = Date.now();
  const r = spawnSync(bin, args, { cwd, shell: false, encoding: "utf8", timeout: timeoutMs, env, windowsHide: true });
  const ms = Date.now() - started;
  if (r.error) return { exit: 1, out: r.error.message, ms };
  return { exit: r.status ?? 1, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim(), ms };
}

function matchExpect(result, expect) {
  const exp = String(expect ?? "exit 0").trim();
  const exitMatch = /^exit\s+(\d+)$/i.exec(exp);
  if (exitMatch) return result.exit === Number(exitMatch[1]);
  const containsMatch = /^contains\s*:\s*(.+)$/i.exec(exp);
  if (containsMatch) return result.exit === 0 && String(result.out ?? "").includes(containsMatch[1].trim());
  return result.exit === 0;
}

function defaultRunCheck(cwd, base) {
  const started = Date.now();
  const args = [BH, "check", "--json", ...(base ? ["--base", base] : [])];
  const env = { ...process.env, FORCE_COLOR: "0" };
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(process.execPath, args, { cwd, shell: false, encoding: "utf8", timeout: COMMAND_TIMEOUT_MS, env, windowsHide: true });
  const ms = Date.now() - started;
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  let parsed = null;
  try {
    parsed = JSON.parse(String(r.stdout ?? "").trim());
  } catch {}
  return { exit: r.status ?? 1, out, receipt: parsed, ms };
}

/** True only for an independent QA reviewer identity (`qa`, `qa-*`, `qa_*`), or empty `from` for human CLI when allowed. */
export function isIndependentQaName(name) {
  return /^qa(?:[-_\s/]|$)/i.test(String(name ?? "").trim());
}

/** True if a QA gate record represents an independent QA verdict (never self-graded by orchestrator/dev/design/other workers). */
export function isIndependentQaGate(gate, { allowEmpty = true } = {}) {
  if (!gate) return false;
  const from = String(gate.from ?? "").trim();
  if (!from) return Boolean(allowEmpty);
  return isIndependentQaName(from);
}

function latestMatchingGate(task, head, diff) {
  const gates = task.gates ?? [];
  for (let i = gates.length - 1; i >= 0; i--) {
    const g = gates[i];
    if (!g) continue;
    if (!g.diff || !diff || g.diff !== diff) continue;
    if (head && (!g.head || g.head !== head)) continue;
    if (!isIndependentQaGate(g)) continue;
    return g;
  }
  return null;
}

/**
 * Verifies every criterion in the frozen Goal contract against the task's isolated tree.
 * Enforces:
 * 1. Missing worktree refusal (never silently checks main checkout)
 * 2. Frozen contract digest & script hash + anti-tamper integrity audit
 * 3. Full-matrix deterministic evaluation (`check`, `command`, `file`)
 * 4. Independent QA gate matching exact `(head, diff)` for `[qa]` criteria (only after 100% deterministic PASS)
 * 5. Strict monotonic ratchet (checkpoint improvements to `best`, archive & revert regressions to `iter-<n>`)
 * 6. Append-only Gap Ledger (`iterations.jsonl`) and per-criterion receipts (`criteria.jsonl`)
 */
export function verifyGoal(root, taskId, {
  hypothesis = "",
  runCheck = defaultRunCheck,
  runCommand = defaultRunCommand,
  git = W.runGit,
  noRevert = false,
  timeoutMs = COMMAND_TIMEOUT_MS,
} = {}) {
  const task = T.loadTask(root, taskId);
  if (task.mode !== "goal" || !task.goal) throw new Error(`Task ${taskId} is not a Goal.`);
  const missing = W.missingWorktree(task);
  if (missing) throw new Error(missing);

  const loaded = loadFrozenContract(task.id);
  if (!loaded.ok) throw new Error(loaded.reason);
  const contract = loaded.contract;
  const cwd = W.taskCwd(task, root);
  const iteration = Number(task.goal.iteration ?? 0) + 1;
  const { head, diff } = goalChangeHash(cwd, { git });

  // Step 1: Anti-tamper & script-hash integrity audit
  const integrity = auditGoalTree(cwd, contract.base ?? task.base, contract, { git, root });
  const results = [];
  const verifiedAt = now();

  if (!integrity.ok) {
    const tamperMsg = integrity.violations.map((v) => `${v.rule}: ${v.file} (${v.detail})`).join("; ");
    for (const c of contract.criteria) {
      results.push({ id: c.id, kind: c.kind, text: c.text, required: c.required !== false, ok: false, verdict: "FAIL", observed: `Blocked by integrity guard: ${clip(tamperMsg, 260)}`, ms: 0 });
    }
  } else {
    // Step 2: Run all deterministic criteria in full matrix
    const det = contract.criteria.filter((c) => c.kind !== "qa");
    for (const c of det) {
      const started = Date.now();
      let ok = false;
      let observed = "";
      let ms = 0;
      if (c.kind === "check") {
        const res = runCheck(cwd, contract.base ?? task.base);
        ok = Number(res.exit) === 0;
        ms = res.ms ?? (Date.now() - started);
        observed = ok ? "bh check passed" : clip(firstLine(res.out) || `bh check exited ${res.exit}`, 260);
      } else if (c.kind === "command") {
        try {
          const res = runCommand(cwd, c.command, { timeoutMs });
          ok = matchExpect(res, c.expect);
          ms = res.ms ?? (Date.now() - started);
          observed = ok
            ? `exit ${res.exit}${res.out ? ` — ${clip(firstLine(res.out), 140)}` : ""}`
            : `exit ${res.exit} (expected ${c.expect ?? "exit 0"})${res.out ? `: ${clip(firstLine(res.out), 180)}` : ""}`;
        } catch (e) {
          ok = false;
          ms = Date.now() - started;
          observed = clip(e.message, 260);
        }
      } else if (c.kind === "file") {
        const abs = resolve(cwd, c.path || "");
        const rel = insideRepo(cwd, abs);
        ok = Boolean(rel) && existsSync(abs);
        ms = Date.now() - started;
        observed = !rel ? `path escapes repo: ${c.path}` : ok ? `${c.path} exists` : `missing file: ${c.path}`;
      }
      results.push({ id: c.id, kind: c.kind, text: c.text, required: c.required !== false, ok, verdict: ok ? "PASS" : "FAIL", observed, ms });
    }

    // Step 3: Evaluate `[qa]` criteria ONLY when all required deterministic criteria pass
    const detFailed = results.some((r) => r.required && !r.ok);
    const gate = detFailed ? null : latestMatchingGate(task, head, diff);
    for (const c of contract.criteria.filter((x) => x.kind === "qa")) {
      if (detFailed) {
        results.push({ id: c.id, kind: "qa", text: c.text, required: c.required !== false, ok: false, verdict: "PENDING", observed: "Waiting for deterministic criteria to pass before independent QA review.", ms: 0 });
      } else if (gate?.verdict === "PASS") {
        results.push({ id: c.id, kind: "qa", text: c.text, required: c.required !== false, ok: true, verdict: "PASS", observed: `QA gate round ${gate.round} PASS (${gate.file}): ${clip(gate.summary, 180)}`, ms: 0 });
      } else if (gate?.verdict === "CHANGES_REQUIRED" || gate?.verdict === "BLOCKED") {
        results.push({ id: c.id, kind: "qa", text: c.text, required: c.required !== false, ok: false, verdict: "FAIL", observed: `QA gate round ${gate.round} ${gate.verdict}: ${clip(gate.summary, 180)}`, ms: 0 });
      } else {
        results.push({ id: c.id, kind: "qa", text: c.text, required: c.required !== false, ok: false, verdict: "PENDING", observed: "All deterministic checks pass; awaiting independent QA gate PASS on current tree.", ms: 0 });
      }
    }
  }

  // Order results to match frozen contract order
  const byId = new Map(results.map((r) => [r.id, r]));
  const ordered = contract.criteria.map((c) => byId.get(c.id));

  const detResults = ordered.filter((r) => r.kind !== "qa");
  const detPassedIds = detResults.filter((r) => r.ok).map((r) => r.id);
  const detPassedSet = new Set(detPassedIds);
  const passed = ordered.filter((r) => r.ok).map((r) => r.id);
  const failed = ordered.filter((r) => r.verdict === "FAIL").map((r) => r.id);
  const pendingQa = ordered.filter((r) => r.verdict === "PENDING").map((r) => r.id);
  // A failure signature that repeats means the same wall, hit again: the ids and their first line
  // of evidence are what a retry cap counts. Different evidence is a different signature.
  const errorSig = failed.length
    ? clip(ordered.filter((r) => r.verdict === "FAIL").map((r) => `${r.id}: ${firstLine(r.observed)}`).join(" | "), 400)
    : null;
  const sameErrorStreak = !errorSig ? 0 : errorSig === (task.goal.lastErrorSig ?? null) ? Number(task.goal.sameErrorStreak ?? 0) + 1 : 1;
  const allDetPassed = integrity.ok && detResults.filter((r) => r.required).every((r) => r.ok);
  const allRequiredPassed = integrity.ok && ordered.filter((r) => r.required).every((r) => r.ok);

  // Step 4: Strict Monotonic Ratchet
  const prevBestScore = Number(task.goal.bestScore ?? 0);
  const prevBestPassed = Array.isArray(task.goal.bestPassedIds) ? task.goal.bestPassedIds : [];
  const regressed = integrity.ok
    ? prevBestPassed.filter((id) => !detPassedSet.has(id))
    : [...prevBestPassed];
  const scoreDropped = integrity.ok && detPassedIds.length < prevBestScore;
  const isRegression = !integrity.ok || regressed.length > 0 || scoreDropped;

  let checkpointRef = task.goal.bestCheckpoint ?? null;
  let bestHead = task.goal.bestHead ?? null;
  let bestScore = prevBestScore;
  let bestPassedIds = [...prevBestPassed];
  let attemptRef = null;
  let reverted = false;
  let lesson = "";
  let bannedApproach = "";
  let improved = false;

  if (isRegression) {
    const archived = snapshotTree(cwd, iterRef(task.id, iteration), `goal iter ${iteration} (archived regression): ${task.id}`, { git });
    if (archived.ok) attemptRef = archived.ref;
    if (!noRevert && checkpointRef) {
      const rev = revertToRef(cwd, checkpointRef, { git });
      reverted = rev.ok;
    }
    lesson = !integrity.ok
      ? `Integrity guard blocked attempt: ${integrity.violations.map((v) => `${v.file} (${v.rule})`).join(", ")}.`
      : `Attempt regressed ${regressed.length ? regressed.join(", ") : `score ${prevBestScore} → ${detPassedIds.length}`}; reverted to ${checkpointRef ?? "best"}.`;
    bannedApproach = hypothesis ? clip(hypothesis, 180) : clip(lesson, 180);
  } else if (detPassedIds.length > prevBestScore || !checkpointRef) {
    const snap = snapshotTree(cwd, bestRef(task.id), `goal best iter ${iteration} (${detPassedIds.length}/${detResults.length}): ${task.id}`, { git });
    if (snap.ok) {
      checkpointRef = snap.ref;
      bestHead = snap.sha;
    }
    improved = detPassedIds.length > prevBestScore;
    bestScore = Math.max(prevBestScore, detPassedIds.length);
    bestPassedIds = [...detPassedIds];
  }

  // Recompute tree hash if we didn't revert (when reached, bind to exact verified tree)
  const finalTree = reverted ? goalChangeHash(cwd, { git }) : { head, diff };

  // Record per-criterion receipts
  for (const r of ordered) {
    T.recordCriterion(root, task.id, {
      at: verifiedAt,
      iteration,
      criterion: r.id,
      kind: r.kind,
      ok: r.ok,
      verdict: r.verdict,
      observed: r.observed,
      ms: r.ms,
      head,
      diff,
    });
  }

  const spendUsd = RZ.taskSpend(root, task.id);
  const turns = T.usageOf(root, task.id).length;
  const verdict = allRequiredPassed ? "PASS" : "FAIL";
  const seenFailed = Array.isArray(task.goal.seenFailedHashes) ? task.goal.seenFailedHashes : [];
  const repeatedHash = !allRequiredPassed && Boolean(diff) && seenFailed.includes(diff);
  const nextSeenFailed = !allRequiredPassed && diff && !repeatedHash ? [...seenFailed.slice(-30), diff] : seenFailed;
  const noProgressStreak = improved || allRequiredPassed ? 0 : Number(task.goal.noProgressStreak ?? 0) + 1;

  // Detect oscillation (same criterion flipping PASS <-> FAIL across recent iterations)
  const recentIters = T.iterations(root, task.id, { limit: 4 });
  const oscillating = detectOscillation([...recentIters, { passed, failed }]);

  const iterRow = {
    n: iteration,
    at: verifiedAt,
    verdict,
    passed,
    failed,
    pendingQa,
    regressed,
    head,
    diff,
    checkpointRef,
    attemptRef,
    reverted,
    improved,
    repeatedHash,
    oscillating,
    sameErrorStreak,
    lastErrorSig: errorSig,
    spendUsd,
    turns,
    hypothesis: clip(hypothesis, 220) || null,
    lesson: lesson || null,
    bannedApproach: bannedApproach || null,
    ...(integrity.ok ? {} : { tamperViolations: integrity.violations }),
  };
  T.recordIteration(root, task.id, iterRow);

  const maxStepRetries = Number(RZ.resilienceConfig()?.guardrails?.maxStepRetries ?? 3);
  const retryCap = !allRequiredPassed && maxStepRetries > 0 && sameErrorStreak >= maxStepRetries;

  // Update task.goal atomically under task lock
  let updatedTask;
  T.updateTask(root, task.id, (t) => {
    t.goal.iteration = iteration;
    t.goal.criteria = contract.criteria.map((c) => {
      const r = byId.get(c.id);
      return {
        ...c,
        verdict: r.verdict,
        at: verifiedAt,
        evidence: r.observed,
        head,
        diff,
      };
    });
    t.goal.bestScore = bestScore;
    t.goal.bestPassedIds = bestPassedIds;
    t.goal.bestCheckpoint = checkpointRef;
    t.goal.bestHead = bestHead;
    t.goal.noProgressStreak = noProgressStreak;
    t.goal.sameErrorStreak = sameErrorStreak;
    t.goal.lastErrorSig = errorSig;
    t.goal.seenFailedHashes = nextSeenFailed;
    t.goal.awaitingQa = Boolean(allDetPassed && pendingQa.length > 0);
    if (retryCap) {
      // The same failure this many times in a row is a wall, not a next step: stop the loop and
      // let the board say so, instead of burning rounds on identical attempts.
      t.goal.status = "paused";
      t.goal.reason = `retry_cap (${sameErrorStreak}/${maxStepRetries} consecutive identical failures)`;
      t.goal.waitUntil = null;
      T.setStatus(t, "paused");
    } else if (allRequiredPassed) {
      t.goal.status = "reached";
      t.goal.reachedAt = verifiedAt;
      t.goal.reachedHead = finalTree.head;
      t.goal.reachedDiff = finalTree.diff;
      t.goal.reason = null;
      t.goal.waitUntil = null;
    } else if (t.goal.status === "reached") {
      t.goal.status = "running";
      t.goal.reachedAt = null;
      t.goal.reachedHead = null;
      t.goal.reachedDiff = null;
    }
    updatedTask = t;
  });

  // Board note for transparency
  if (allRequiredPassed) {
    T.post(root, task.id, { kind: "done", text: `Goal reached on iteration ${iteration}: all ${ordered.length}/${ordered.length} DONE criteria verified.`, from: "goal-verifier" });
  } else if (allDetPassed && pendingQa.length > 0) {
    T.post(root, task.id, { kind: "note", text: `Goal iter ${iteration}: deterministic checks PASS (${detPassedIds.length}/${detResults.length}); awaiting independent QA review for ${pendingQa.join(", ")}.`, from: "goal-verifier" });
  } else {
    const failSummary = ordered.filter((r) => !r.ok).slice(0, 3).map((r) => `${r.id}: ${firstLine(r.observed)}`).join(" | ");
    const revertNote = reverted ? ` [reverted to ${checkpointRef}; archived at ${attemptRef}]` : "";
    T.post(root, task.id, { kind: "note", text: `Goal iter ${iteration} FAIL (${passed.length}/${ordered.length}): ${failSummary}${revertNote}`, from: "goal-verifier" });
  }
  if (retryCap) {
    T.post(root, task.id, { kind: "blocker", text: `Goal paused at the retry cap: ${sameErrorStreak}/${maxStepRetries} consecutive iterations failed the same way (${clip(errorSig, 240)}). Resume with \`bh goal resume ${task.id}\` once the blocker is cleared.`, from: "goal-verifier" });
  }

  return {
    task: task.id,
    verdict,
    iteration,
    allDetPassed,
    allRequiredPassed,
    criteria: ordered,
    passed,
    failed,
    pendingQa,
    regressed,
    reverted,
    improved,
    checkpointRef,
    attemptRef,
    repeatedHash,
    oscillating,
    sameErrorStreak,
    errorSig,
    retryPaused: retryCap,
    tamperViolations: integrity.violations,
    head: finalTree.head,
    diff: finalTree.diff,
    goal: updatedTask.goal,
  };
}

function detectOscillation(rows) {
  if (rows.length < 3) return false;
  const states = new Map();
  for (const r of rows) {
    for (const id of r.passed ?? []) {
      const seq = states.get(id) ?? [];
      seq.push("P");
      states.set(id, seq);
    }
    for (const id of r.failed ?? []) {
      const seq = states.get(id) ?? [];
      seq.push("F");
      states.set(id, seq);
    }
  }
  for (const seq of states.values()) {
    const s = seq.join("");
    if (s.includes("PFP") || s.includes("FPF")) return true;
  }
  return false;
}

// ── Amendments (Agent Proposes, Human personOnly Approves/Rejects) ───────────────────────

export function proposeAmend(root, taskId, { criterionId = null, action = "edit", text = "", kind = null, reason = "", by = null }) {
  const act = String(action).toLowerCase();
  if (!["edit", "drop", "add"].includes(act)) throw new Error("Amendment action must be edit, drop, or add.");
  if (!String(reason ?? "").trim()) throw new Error("Proposing a criterion amendment requires --reason.");
  const loaded = loadFrozenContract(taskId);
  if (!loaded.ok) throw new Error(loaded.reason);
  const contract = loaded.contract;
  if (act !== "add") {
    const exists = contract.criteria.some((c) => c.id === criterionId);
    if (!exists) throw new Error(`Goal ${taskId} has no criterion ${criterionId}.`);
  }
  if ((act === "edit" || act === "add") && !String(text ?? "").trim()) {
    throw new Error(`Amendment action ${act} requires --text.`);
  }
  const amendment = {
    id: newId("amd"),
    at: now(),
    by: by ?? "agent",
    criterionId: criterionId ?? null,
    action: act,
    text: String(text ?? "").trim(),
    kind: kind ? String(kind).toLowerCase() : null,
    reason: String(reason).trim(),
  };
  T.updateTask(root, taskId, (t) => {
    if (t.mode !== "goal" || !t.goal) throw new Error(`Task ${taskId} is not a Goal.`);
    t.goal.pendingAmendment = amendment;
    t.goal.status = "paused";
    t.goal.reason = "pending_amendment";
    T.setStatus(t, "paused");
  });
  T.post(root, taskId, {
    kind: "question",
    text: `Proposed DONE criterion amendment (${amendment.action}${amendment.criterionId ? ` ${amendment.criterionId}` : ""}): ${amendment.text || "(drop)"} — Reason: ${amendment.reason}. Approve with \`bh goal approve-amend ${taskId}\` or reject with \`bh goal reject-amend ${taskId}\`.`,
    from: by ?? "agent",
  });
  return amendment;
}

export function approveAmend(root, taskId, { parseCriterion } = {}) {
  const task = T.loadTask(root, taskId);
  if (task.mode !== "goal" || !task.goal) throw new Error(`Task ${taskId} is not a Goal.`);
  const amd = task.goal.pendingAmendment;
  if (!amd) throw new Error(`Goal ${taskId} has no pending amendment.`);
  const loaded = loadFrozenContract(taskId);
  if (!loaded.ok) throw new Error(loaded.reason);
  const contract = loaded.contract;
  let nextCriteria = contract.criteria.map((c) => ({ ...c }));

  if (amd.action === "drop") {
    nextCriteria = nextCriteria.filter((c) => c.id !== amd.criterionId);
    if (!nextCriteria.length) throw new Error("Cannot drop the last DONE criterion of a Goal.");
  } else if (amd.action === "edit") {
    nextCriteria = nextCriteria.map((c) => {
      if (c.id !== amd.criterionId) return c;
      const parsed = parseCriterion ? parseCriterion(amd.kind ? `[${amd.kind}] ${amd.text}` : `[${c.kind}] ${amd.text}`) : null;
      const updated = parsed ? { id: c.id, ...parsed } : { ...c, kind: amd.kind || c.kind, text: amd.text };
      if (updated.kind === "command") parseArgv(updated.command);
      return updated;
    });
  } else if (amd.action === "add") {
    const maxId = nextCriteria.reduce((m, c) => Math.max(m, Number(/^c(\d+)$/.exec(c.id)?.[1] ?? 0)), 0);
    const id = `c${maxId + 1}`;
    const parsed = parseCriterion ? parseCriterion(amd.kind ? `[${amd.kind}] ${amd.text}` : amd.text) : null;
    const added = parsed ? { id, ...parsed } : { id, kind: amd.kind || "qa", text: amd.text, required: true };
    if (added.kind === "command") parseArgv(added.command);
    nextCriteria.push(added);
  }

  const cwd = W.taskCwd(task, root);
  const payload = {
    ...canonicalContractPayload(contract),
    criteria: nextCriteria,
    scriptHashes: hashReferencedScripts(cwd, nextCriteria, root),
    amendments: [...(contract.amendments ?? []), { ...amd, approvedAt: now() }],
  };
  const nextContract = { ...payload, digest: contractDigest(payload) };
  writeJson(contractPath(taskId), nextContract);

  T.updateTask(root, taskId, (t) => {
    const prevById = new Map((t.goal.criteria ?? []).map((c) => [c.id, c]));
    t.goal.contractDigest = nextContract.digest;
    t.goal.criteria = nextCriteria.map((c) => {
      const prev = prevById.get(c.id);
      const changed = !prev || prev.kind !== c.kind || prev.text !== c.text;
      return changed ? { ...c, verdict: null, at: null, evidence: null, head: null, diff: null } : { ...prev, ...c };
    });
    t.goal.pendingAmendment = null;
    t.goal.status = "running";
    t.goal.reason = null;
    t.goal.reachedAt = null;
    t.goal.reachedHead = null;
    t.goal.reachedDiff = null;
    t.goal.bestPassedIds = (t.goal.bestPassedIds ?? []).filter((id) => nextCriteria.some((c) => c.id === id) && id !== amd.criterionId);
    t.goal.bestScore = t.goal.bestPassedIds.length;
    T.setStatus(t, "active");
  });
  T.post(root, taskId, { kind: "decision", text: `Approved DONE criterion amendment (${amd.action}${amd.criterionId ? ` ${amd.criterionId}` : ""}). Frozen contract updated.`, from: "user" });
  return { ok: true, amendment: amd, contract: nextContract };
}

export function rejectAmend(root, taskId, { reason = "" } = {}) {
  let amd;
  T.updateTask(root, taskId, (t) => {
    if (t.mode !== "goal" || !t.goal) throw new Error(`Task ${taskId} is not a Goal.`);
    if (!t.goal.pendingAmendment) throw new Error(`Goal ${taskId} has no pending amendment.`);
    amd = t.goal.pendingAmendment;
    t.goal.pendingAmendment = null;
    t.goal.status = "running";
    t.goal.reason = null;
    T.setStatus(t, "active");
  });
  T.post(root, taskId, { kind: "decision", text: `Rejected DONE criterion amendment (${amd.action}${amd.criterionId ? ` ${amd.criterionId}` : ""})${reason ? `: ${reason}` : ""}. Original DONE contract remains frozen.`, from: "user" });
  return { ok: true, rejected: amd };
}

// ── Done-Lock, Lifecycle Controls & Recovery ─────────────────────────────────────────────

/**
 * Enforced by `bh task status <id> done`: a Goal can NEVER be marked done (not even with --force)
 * unless the frozen contract is intact, `goal.status === "reached"`, every required criterion passed
 * on the exact current `changeHash(cwd)`, and the integrity audit is clean.
 */
export function assertGoalDone(root, task, { git = W.runGit } = {}) {
  if (task?.mode !== "goal") return { ok: true };
  const missing = W.missingWorktree(task);
  if (missing) return { ok: false, reason: missing };
  const loaded = loadFrozenContract(task.id);
  if (!loaded.ok) return { ok: false, reason: loaded.reason };
  const contract = loaded.contract;
  if (task.goal?.status !== "reached") {
    return { ok: false, reason: `Goal ${task.id} is not reached yet (status: ${task.goal?.status ?? "unknown"}). Run \`bh goal verify ${task.id}\` until all DONE criteria pass.` };
  }
  const cwd = W.taskCwd(task, root);
  const integrity = auditGoalTree(cwd, contract.base ?? task.base, contract, { git, root });
  if (!integrity.ok) {
    return { ok: false, reason: `Goal ${task.id} failed integrity audit: ${integrity.violations.map((v) => `${v.file} (${v.rule})`).join(", ")}.` };
  }
  const { head, diff } = goalChangeHash(cwd, { git });
  if (!task.goal.reachedDiff || task.goal.reachedDiff !== diff || (task.goal.reachedHead && head && task.goal.reachedHead !== head)) {
    return { ok: false, reason: `Goal ${task.id} tree changed since last PASS verification. Run \`bh goal verify ${task.id}\` on the current tree first.` };
  }
  const receipts = T.criterionReceipts(root, task.id);
  for (const c of contract.criteria.filter((x) => x.required !== false)) {
    const matched = [...receipts].reverse().find((r) => r.criterion === c.id && r.head === head && r.diff === diff && r.ok === true && r.verdict === "PASS");
    if (!matched) {
      return { ok: false, reason: `Goal ${task.id} criterion ${c.id} (${c.kind}) has no PASS receipt on the current tree.` };
    }
  }
  return { ok: true };
}

export function setGoalState(root, taskId, action, { reason = null, waitUntil = null } = {}) {
  let updated;
  T.updateTask(root, taskId, (t) => {
    if (t.mode !== "goal" || !t.goal) throw new Error(`Task ${taskId} is not a Goal.`);
    if (action === "pause") {
      t.goal.status = "paused";
      t.goal.reason = reason || "paused";
      t.goal.waitUntil = null;
      T.setStatus(t, "paused");
    } else if (action === "stop") {
      t.goal.status = "stopped";
      t.goal.reason = reason || "stopped";
      t.goal.waitUntil = null;
      T.setStatus(t, "paused");
    } else if (action === "waiting") {
      t.goal.status = "waiting";
      t.goal.reason = reason || "quota_wait";
      t.goal.waitUntil = waitUntil ?? null;
    } else if (action === "resume") {
      if (t.goal.pendingAmendment) throw new Error(`Goal ${taskId} has a pending criterion amendment: approve or reject it first.`);
      t.goal.status = "running";
      t.goal.reason = null;
      t.goal.waitUntil = null;
      // A resume is the user clearing the wall, so the retry cap starts a fresh count.
      t.goal.sameErrorStreak = 0;
      t.goal.lastErrorSig = null;
      T.setStatus(t, "active");
    } else {
      throw new Error(`Unknown goal state action: ${action}`);
    }
    updated = t;
  });
  return updated;
}

/**
 * Crash / resume recovery for a Goal: checks worktree existence, unresolved merges, stale PID
 * claims, and orphaned open child worktrees, then runs a fresh verification pass before resuming.
 */
export function recoverGoal(root, taskId, opts = {}) {
  const git = opts.git ?? W.runGit;
  const task = T.loadTask(root, taskId);
  if (task.mode !== "goal" || !task.goal) throw new Error(`Task ${taskId} is not a Goal.`);
  const missing = W.missingWorktree(task);
  if (missing) return { ok: false, blocked: true, reason: missing };
  const cwd = W.taskCwd(task, root);

  // Clear stale dead-PID claim if present
  const claimPath = goalClaimFile(root, taskId);
  const existingClaim = readJson(claimPath, null);
  let clearedStaleClaim = false;
  if (existingClaim?.pid && !pidAlive(existingClaim.pid)) {
    rmSync(claimPath, { force: true });
    clearedStaleClaim = true;
  }

  // Detect unresolved merge in progress
  let mergeConflict = false;
  try {
    git(cwd, ["rev-parse", "-q", "--verify", "MERGE_HEAD"]);
    mergeConflict = true;
  } catch {
    try {
      mergeConflict = Boolean(git(cwd, ["ls-files", "-u"]));
    } catch {}
  }
  if (mergeConflict) {
    setGoalState(root, taskId, "pause", { reason: "merge_conflict" });
    return { ok: false, blocked: true, clearedStaleClaim, reason: `Unresolved merge conflict in ${cwd}; resolve it before resuming Goal ${taskId}.` };
  }

  // Detect orphaned open children
  const orphanedChildren = (task.children ?? []).filter((c) => c.state === "open").map((c) => c.name);
  const verified = verifyGoal(root, taskId, { ...opts, hypothesis: "crash-recovery verification" });
  return { ok: true, clearedStaleClaim, orphanedChildren, verified };
}

// ── Loop Planner (`next(root)` for agent.mjs lead drain loop) ────────────────────────────

export function goalStatus(root, taskId = null) {
  const task = taskId ? T.loadTask(root, taskId) : T.currentTask(root);
  if (!task || task.mode !== "goal" || !task.goal) return null;
  const loaded = loadFrozenContract(task.id);
  const spendUsd = RZ.taskSpend(root, task.id);
  const iters = T.iterations(root, task.id, { limit: 10 });
  const plan = next(root, { taskId: task.id });
  return {
    task: task.id,
    title: task.title,
    mode: "goal",
    status: task.goal.status,
    taskStatus: task.status,
    reached: task.goal.status === "reached",
    contractOk: loaded.ok,
    contractError: loaded.ok ? null : loaded.reason,
    criteria: task.goal.criteria ?? [],
    iteration: Number(task.goal.iteration ?? 0),
    bestScore: Number(task.goal.bestScore ?? 0),
    bestCheckpoint: task.goal.bestCheckpoint ?? null,
    noProgressStreak: Number(task.goal.noProgressStreak ?? 0),
    awaitingQa: Boolean(task.goal.awaitingQa),
    pendingAmendment: task.goal.pendingAmendment ?? null,
    budget: {
      maxSpendUsd: Number(task.goal.maxSpendUsd ?? DEFAULT_MAX_SPEND_USD),
      maxIterations: Number(task.goal.maxIterations ?? 0),
      spendUsd,
    },
    waiting: task.goal.status === "waiting" ? { until: task.goal.waitUntil ?? null, reason: task.goal.reason ?? "quota_wait" } : null,
    reason: task.goal.reason ?? null,
    recentIterations: iters,
    next: plan,
  };
}

/**
 * Pure decision for `agent.mjs` lead `drain()`: should the Orchestrator continue the active Goal
 * on a fresh compacted round, wait, or stop?
 * Policy (locked Round 1–2): Spend ceiling only (plus hard blockers/pending amendment/reached).
 * Stalls, cycles, and oscillations trigger strategy escalation hints rather than pausing early.
 */
export function next(root, { taskId = null, lastTurn = null } = {}) {
  const task = taskId ? T.loadTask(root, taskId) : T.currentTask(root);
  if (!task || task.mode !== "goal" || !task.goal) return { continue: false, reason: "no_active_goal" };
  const g = task.goal;
  // Guardrails stop a loop that keeps failing the same way, whether or not the verify already
  // paused the task: the reason names the cap so the user knows what to clear.
  const maxStepRetries = Number(RZ.resilienceConfig()?.guardrails?.maxStepRetries ?? 3);
  if (maxStepRetries > 0 && Number(g.sameErrorStreak ?? 0) >= maxStepRetries) {
    return { continue: false, pause: true, reason: `retry_cap (${g.sameErrorStreak}/${maxStepRetries} consecutive identical failures)` };
  }
  if (task.status !== "active") return { continue: false, reason: `task_${task.status}` };
  if (g.status === "reached") return { continue: false, reason: "reached" };
  if (g.status === "paused" || g.status === "stopped") return { continue: false, reason: g.reason || g.status };
  if (g.pendingAmendment) return { continue: false, reason: "pending_amendment" };
  if (lastTurn?.asked) return { continue: false, pause: true, reason: "asked" };
  if (lastTurn?.cancelled) return { continue: false, pause: true, reason: "cancelled" };
  if (lastTurn?.held) return { continue: false, wait: true, waitUntil: lastTurn.resetAt ?? null, reason: "quota_wait" };
  if (lastTurn?.error) return { continue: false, pause: true, reason: `turn_error: ${clip(firstLine(lastTurn.error), 140)}` };
  if (g.status === "waiting") {
    const untilMs = g.waitUntil ? Date.parse(g.waitUntil) : 0;
    if (untilMs && untilMs > Date.now()) {
      return { continue: false, wait: true, waitUntil: g.waitUntil, reason: g.reason || "quota_wait" };
    }
  }

  // Pause policy: spend ceiling (and optional explicit maxIterations if configured > 0)
  const spendUsd = RZ.taskSpend(root, task.id);
  const maxSpend = Number(g.maxSpendUsd ?? DEFAULT_MAX_SPEND_USD);
  if (maxSpend > 0 && spendUsd >= maxSpend) {
    return { continue: false, pause: true, reason: `spend_ceiling ($${spendUsd.toFixed(2)} >= $${maxSpend.toFixed(2)})` };
  }
  const maxIters = Number(g.maxIterations ?? 0);
  if (maxIters > 0 && Number(g.iteration ?? 0) >= maxIters) {
    return { continue: false, pause: true, reason: `max_iterations (${g.iteration}/${maxIters})` };
  }

  const iters = T.iterations(root, task.id, { limit: 5 });
  const latest = iters.at(-1) ?? null;
  const banned = iters.map((r) => r.bannedApproach).filter(Boolean).slice(-3);
  const stalled = Number(g.noProgressStreak ?? 0) >= 2 || Boolean(latest?.repeatedHash) || Boolean(latest?.oscillating);
  const nextIter = Number(g.iteration ?? 0) + 1;
  const prompt = buildRoundPrompt(task, { nextIter, spendUsd, maxSpend, latest, banned, stalled });
  return { continue: true, task: task.id, iteration: nextIter, stalled, awaitingQa: Boolean(g.awaitingQa), prompt };
}

/** Bounded (<= 15 lines) round prompt built strictly from disk state — zero conversation bloat. */
export function buildRoundPrompt(task, { nextIter, spendUsd, maxSpend, latest, banned = [], stalled = false }) {
  const g = task.goal;
  const criteriaLines = (g.criteria ?? []).slice(0, 6).map((c) => {
    const icon = c.verdict === "PASS" ? "✓" : c.verdict === "PENDING" ? "…" : "✗";
    const detail = c.verdict === "PASS" ? "" : c.evidence ? ` — ${clip(firstLine(c.evidence), 90)}` : "";
    return `  ${icon} ${c.id} [${c.kind}] ${clip(c.text, 70)}${detail}`;
  });
  const lines = [
    `[Goal ${task.id} · Round ${nextIter} · $${spendUsd.toFixed(2)}/$${maxSpend.toFixed(2)} · best ${g.bestScore ?? 0}/${(g.criteria ?? []).length}]`,
    ...criteriaLines,
  ];
  if (latest?.reverted && latest.lesson) {
    lines.push(`Ratchet: ${clip(latest.lesson, 140)}`);
  }
  if (banned.length) {
    lines.push(`Avoid failed approaches: ${banned.map((b) => clip(b, 60)).join(" | ")}`);
  }
  if (g.awaitingQa) {
    lines.push(`Action: All deterministic checks PASS. Spawn independent QA review (\`bh spawn qa --review --task ${task.id}\`) to verify [qa] criteria and record \`bh gate\`, then run \`bh goal verify ${task.id}\`.`);
  } else if (stalled) {
    lines.push(`Escalate: Progress stalled/oscillating (${g.noProgressStreak ?? 0} flat rounds). Spawn Scout/Advisor to diagnose root cause from a new angle before editing, then run \`bh goal verify ${task.id}\`.`);
  } else {
    lines.push(`Action: Fix the highest-impact failing criterion without regressing passing ones, then run \`bh goal verify ${task.id}\`.`);
  }
  return lines.slice(0, 15).join("\n");
}

/** Short handoff summary for `agent.mjs` `handoff()` when compacting between Goal rounds. */
export function goalHandoff(root, taskId) {
  let task;
  try {
    task = T.loadTask(root, taskId);
  } catch {
    return "";
  }
  if (task?.mode !== "goal" || !task.goal) return "";
  const g = task.goal;
  const rows = (g.criteria ?? []).map((c) => `${c.verdict === "PASS" ? "✓" : c.verdict === "PENDING" ? "…" : "✗"} ${c.id} [${c.kind}] ${c.text}${c.verdict !== "PASS" && c.evidence ? ` — ${firstLine(c.evidence)}` : ""}`);
  const latest = T.iterations(root, taskId, { limit: 1 }).at(-1);
  return [
    `## Goal Handoff — ${task.title} (${task.id}, round ${g.iteration ?? 0})`,
    ...rows,
    ...(latest?.lesson ? [`Last lesson: ${latest.lesson}`] : []),
    `Tree: ${W.taskCwd(task, root)}${task.git?.branch ? ` (branch ${task.git.branch})` : ""}`,
  ].join("\n");
}

export function iterationLine(r) {
  const tags = [
    r.improved ? "improved" : "",
    r.reverted ? `reverted→${r.checkpointRef ?? "best"}` : "",
    r.oscillating ? "oscillating" : "",
    r.repeatedHash ? "cycle" : "",
  ].filter(Boolean).join(", ");
  const ids = r.failed?.length ? `fail:[${r.failed.join(",")}]` : r.pendingQa?.length ? `qa:[${r.pendingQa.join(",")}]` : `pass:[${(r.passed ?? []).join(",")}]`;
  return `${r.n}. ${r.verdict} ${ids}${tags ? ` (${tags})` : ""} $${Number(r.spendUsd ?? 0).toFixed(2)} ${r.at}`;
}
