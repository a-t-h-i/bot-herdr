// Self-improvement (bh improve): mine what the task telemetry keeps repeating, fold the knowledge
// files, and apply a proposed change to the harness only through a hard eval gate. The experiment
// is evaluated in its own worktree, merged, installed, and rolled back when the next window's
// metrics regress; a rejection, a failed install or a rollback pauses self-improvement until the
// user resumes it. The safety invariants are the boundary: an improvement may never weaken
// `personOnly`, the access checks or the built-in `bh check` scripts, and may never edit this file.
//
// .bot-herdr/improve/experiments.jsonl (append-only), state.json

import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { resolveLocalBin, testCommand } from "../scripts/lib/common.mjs";
import { BH, appendJsonl, newId, now, readJson, readJsonl, store, withLock, writeJson } from "./core.mjs";
import * as K from "./knowledge.mjs";
import * as T from "./tasks.mjs";
import { runGit } from "./workspace.mjs";

const GATE_TIMEOUT = 900000;
const round = (n, digits = 4) => Number((Number(n) || 0).toFixed(digits));
const rate = (part, total) => (total ? round(part / total) : 0);
const sum = (list, pick) => list.reduce((n, item) => n + (Number(pick(item)) || 0), 0);
const pct = (n) => `${Math.round((Number(n) || 0) * 100)}%`;
const tail = (text, lines = 6) => String(text ?? "").trimEnd().split("\n").slice(-lines).join("\n");

// ── Telemetry: what the last window's tasks cost, broke and re-asked ─────────────────────

/** A task's telemetry and what it cost: the usage log, and the time its turns took. */
function spendOf(root, task) {
  const usage = T.usageOf(root, task.id);
  return { costUsd: T.usageTotals(usage).costUsd, ms: T.worked(root, task) };
}

/**
 * The newest tasks the window covers, each with its checks, board and spend (a task is `updated`
 * last). `since` keeps only tasks created at or after it: a task begun before an apply and merely
 * touched after it belongs to the baseline, not to the window that judges the apply.
 */
function windowTasks(root, { window = 10, since = null } = {}) {
  const size = Math.max(1, Number(window) || 10);
  return T.listTasks(root, { all: true })
    .filter((task) => !since || String(task.created) >= String(since))
    .sort((a, b) => String(b.updated).localeCompare(String(a.updated)))
    .slice(0, size)
    .map((task) => ({ task, checks: T.checks(root, task.id), board: T.board(root, task.id), spend: spendOf(root, task) }));
}

function metricsOf(rows) {
  const checks = rows.flatMap((r) => r.checks);
  const gates = rows.flatMap((r) => r.task.gates ?? []);
  const failedChecks = checks.filter((c) => Number(c.exit) !== 0).length;
  const failedGates = gates.filter((g) => g.verdict !== "PASS").length;
  const totalCostUsd = round(sum(rows, (r) => r.spend.costUsd));
  const blockerCount = rows.reduce((n, r) => n + r.board.filter((e) => e.kind === "blocker").length, 0);
  return {
    tasks: rows.length,
    completedTasks: rows.filter((r) => r.task.status === "done").length,
    totalCostUsd,
    avgCostUsd: rows.length ? round(totalCostUsd / rows.length) : 0,
    avgWorkedMs: rows.length ? Math.round(sum(rows, (r) => r.spend.ms) / rows.length) : 0,
    totalChecks: checks.length,
    failedChecks,
    checkFailRate: rate(failedChecks, checks.length),
    totalGateRounds: gates.length,
    failedGateRounds: failedGates,
    qaFailRate: rate(failedGates, gates.length),
    avgQaRounds: rows.length ? round(gates.length / rows.length, 2) : 0,
    blockerCount,
  };
}

/** The window's numbers: tasks, spend, time, check and QA failures, gate rounds, blockers. */
export function computeMetrics(root, { window = 10, since = null } = {}) {
  return metricsOf(windowTasks(root, { window, since }));
}

// ── Findings: each one names the deterministic fix, never a longer prompt ────────────────

const SEVERITY = { high: 3, medium: 2, low: 1 };

function qaFinding(rows, m) {
  if (m.qaFailRate <= 0.25 && m.failedGateRounds < 2) return null;
  const evidence = rows.flatMap((r) => (r.task.gates ?? []).filter((g) => g.verdict !== "PASS")
    .map((g) => `${r.task.id} round ${g.round}: ${g.verdict} — ${String(g.summary ?? "").slice(0, 100)}`));
  return {
    kind: "qa_failures",
    severity: m.qaFailRate > 0.5 || m.failedGateRounds >= 3 ? "high" : "medium",
    count: m.failedGateRounds,
    summary: `${m.failedGateRounds} of ${m.totalGateRounds} QA gate rounds failed (${pct(m.qaFailRate)})`,
    recommendation: "Turn the repeated QA finding into a test under test/ (or a bh check case) so the gate fails on the code, not on the prompt; run `bh scripts save` when the fix is a repeatable job.",
    evidence: evidence.slice(0, 5),
  };
}

function checkFinding(rows, m) {
  if (m.checkFailRate <= 0.2 && m.failedChecks < 2) return null;
  const evidence = rows.flatMap((r) => r.checks.filter((c) => Number(c.exit) !== 0)
    .map((c) => `${r.task.id}: ${c.command ?? "a check"} failed at ${c.at}${c.fallback ? ` (full suite: ${c.fallback})` : ""}`));
  return {
    kind: "check_failures",
    severity: m.checkFailRate > 0.5 || m.failedChecks >= 4 ? "high" : "medium",
    count: m.failedChecks,
    summary: `${m.failedChecks} of ${m.totalChecks} bh check runs failed (${pct(m.checkFailRate)})`,
    recommendation: "Add the failing case to the project's tests (test/) or to a shared script (`bh scripts save`) so `bh check` catches it before an agent has to: a deterministic check repeats for free.",
    evidence: evidence.slice(0, 5),
  };
}

function blockerFinding(rows, m) {
  if (m.blockerCount < 2) return null;
  const evidence = rows.flatMap((r) => r.board.filter((e) => e.kind === "blocker")
    .map((e) => `${r.task.id}: ${String(e.text ?? "").slice(0, 110)}`));
  return {
    kind: "blockers",
    severity: m.blockerCount >= 4 ? "high" : "medium",
    count: m.blockerCount,
    summary: `${m.blockerCount} blocker posts: the same wall was hit more than once`,
    recommendation: "Script the blocked step (`bh scripts save`) or fix the missing capability once in the engine: a scripted step is a check the next task runs, a note is not.",
    evidence: evidence.slice(0, 5),
  };
}

function costFinding(rows, m) {
  if (rows.length < 2 || m.avgCostUsd <= 0) return null;
  const costly = rows.filter((r) => r.spend.costUsd > m.avgCostUsd * 2 || (m.avgWorkedMs > 0 && r.spend.ms > m.avgWorkedMs * 2));
  if (!costly.length) return null;
  const heavy = costly.some((r) => r.spend.costUsd > m.avgCostUsd * 3 || r.spend.ms > m.avgWorkedMs * 3);
  return {
    kind: "high_cost",
    severity: heavy ? "high" : "medium",
    count: costly.length,
    summary: `${costly.length} of ${rows.length} tasks cost or ran far over the window's average ($${m.avgCostUsd}, ${Math.round(m.avgWorkedMs / 60000)} min)`,
    recommendation: "Split the expensive step and give its repeatable part a script (`bh scripts save`): a scripted step runs for free and is a check; a longer brief is paid every time.",
    evidence: costly.slice(0, 5).map((r) => `${r.task.id}: $${r.spend.costUsd}, ${Math.round(r.spend.ms / 60000)} min, ${(r.task.steps ?? []).length} steps`),
  };
}

function knowledgeFinding(root) {
  const bloated = K.list(root).filter((k) => k.chars > 8000 || k.over);
  if (!bloated.length) return null;
  return {
    kind: "knowledge_bloat",
    severity: bloated.some((k) => k.over) ? "high" : "medium",
    count: bloated.length,
    summary: `${bloated.length} knowledge file${bloated.length === 1 ? "" : "s"} over 8k characters: the brief gets cut and the agent reads less`,
    recommendation: "Fold them (`bh improve fold`, or `bh improve fold <agent> --dry-run` first): it dedupes bullets, keeps user-noted entries, trims the oldest History and archives the version before.",
    evidence: bloated.map((k) => `${k.agent}: ${k.chars} characters, ${k.entries} entries${k.over ? " (over the 20k limit)" : ""}`),
  };
}

const RATCHET = {
  kind: "ratchet",
  severity: "low",
  summary: "The guardrail ratchet: every recommendation is a check, a test, a script or a fold — never prompt prose alone",
  recommendation: "Prefer a test, a `bh check` case, a shared script or a knowledge fold over longer role prompts; never touch `personOnly`, the access checks or the built-in `bh check` scripts.",
  evidence: [],
};

/** The ranked findings for the window, plus the ratchet rule that ranks them. */
export function analyze(root, { window = 10 } = {}) {
  const rows = windowTasks(root, { window });
  const metrics = metricsOf(rows);
  const found = [qaFinding(rows, metrics), checkFinding(rows, metrics), blockerFinding(rows, metrics), costFinding(rows, metrics), knowledgeFinding(root)]
    .filter(Boolean)
    .sort((a, b) => SEVERITY[b.severity] - SEVERITY[a.severity] || b.count - a.count);
  return { window, metrics, findings: [...found, { ...RATCHET, count: found.length }] };
}

// ── Safety invariants: a hard boundary an improvement can never talk its way past ────────

const normPath = (path) => String(path ?? "").replace(/\\/g, "/").replace(/^"+|"+$/g, "").replace(/^(\.\/)+/, "").trim();
const diffPath = (path) => normPath(normPath(path).replace(/^[ab]\//, ""));
const isTest = (path) => /^test\//.test(path);

/**
 * Whole files (or path shapes) a self-improvement diff may never touch, rename, copy or delete:
 * the guards themselves (a body can be neutered without touching a named line), the gate and
 * everything it runs on, the installer that runs on main after a merge, and the test command.
 * Matched case-insensitively, so a case-only rename is still the same file.
 */
const frozenRule = (rule, match) => Object.freeze({ rule, match: Object.freeze(match) });

export const PROTECTED_FILE_PATTERNS = Object.freeze([
  frozenRule("protected_builtin_scripts", /^mods\/bot-herdr\/engine\/scripts\/(check_changed|run_changed_tests)\.[^/]+$/),
  frozenRule("protected_builtin_scripts", /^\.bot-herdr\/scripts\/(check_changed|run_changed_tests)\.[^/]+$/),
  frozenRule("protected_builtin_scripts", /^mods\/bot-herdr\/engine\/lib\/scripts\.mjs$/),
  frozenRule("protected_builtin_scripts", /^mods\/bot-herdr\/engine\/scripts\/lib\/common\.mjs$/),
  frozenRule("protected_self_guard", /^mods\/bot-herdr\/engine\/lib\/(improve|workspace)\.mjs$/),
  frozenRule("protected_self_guard", /^install\.mjs$/),
  frozenRule("protected_person_only", /^mods\/bot-herdr\/engine\/bh\.mjs$/),
  frozenRule("protected_access_control", /^mods\/bot-herdr\/engine\/lib\/(core|runner|resilience|agent)\.mjs$/),
  frozenRule("protected_access_control", /^mods\/bot-herdr\/roster\.js$/),
  frozenRule("protected_test_weakening", /^(package\.json|package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|yarn\.lock|bun\.lockb?|\.npmrc|\.yarnrc(\.ya?ml)?|\.pnpmrc|\.pnpmfile\.cjs|bunfig\.toml|tsconfig\.json|jsconfig\.json)$/),
  frozenRule("protected_test_weakening", /^mods\/bot-herdr\/(jsconfig\.json|gpui-kit\.d\.ts)$/),
  frozenRule("protected_runtime_config", /^(\.git\/|\.gitattributes$|\.gitmodules$)/),
  frozenRule("protected_runtime_config", /^data\/bot-herdr\/(config|agents)\.json$/),
]);

/** Lines no improvement may add or remove in an eligible file (all guard files are now protected whole). */
export const GUARDED_LINES = Object.freeze([]);

/** Patterns that can short-circuit or neuter a newly added test file. */
const TEST_SABOTAGE = /\bprocess\.(?:exit|abort|reallyExit)\s*\(|\bprocess\.kill\s*\(/;

/** The rules a path breaks just by being touched. */
function protectedRules(file) {
  const path = String(file ?? "").toLowerCase();
  return PROTECTED_FILE_PATTERNS.filter((p) => p.match.test(path)).map((p) => p.rule);
}

/** One changed path from a plain path, a `M\tpath` line or a `{ status, path, from }` record. */
function fileEntry(entry) {
  if (typeof entry === "string") {
    const [first, second, third] = entry.split("\t");
    if (second === undefined) return { status: "M", path: normPath(first), from: null };
    return { status: String(first).charAt(0).toUpperCase(), path: normPath(third ?? second), from: third ? normPath(second) : null };
  }
  if (!entry || typeof entry !== "object") return { status: "M", path: "", from: null };
  return { status: String(entry.status ?? "M").charAt(0).toUpperCase(), path: normPath(entry.path ?? entry.file), from: entry.from ? normPath(entry.from) : null };
}

/** A `--name-status` listing as records (renames keep both paths, so the old one still counts). */
function parseNameStatus(text) {
  return String(text ?? "").split("\n").filter(Boolean).map(fileEntry);
}

/** Both sides of a `diff --git a/<from> b/<to>` header (quoted or not), or null. */
function headerPaths(raw) {
  const m = /^diff --git "?a\/(.+?)"? "?b\/(.+?)"?$/.exec(raw);
  return m ? { from: diffPath(m[1]), to: diffPath(m[2]) } : null;
}

/**
 * The added and removed lines of each file in a unified diff, the files it deletes whole, and the
 * old path of each file it renames or copies (`a/` side), so the old path is checked too.
 */
function hunksOf(diff) {
  const files = new Map();
  const added = new Set();
  const deleted = new Set();
  const moved = new Map();
  let file = null;
  let minus = null;
  let inHunk = false;
  const open = (path) => {
    file = path;
    if (file && !files.has(file)) files.set(file, []);
  };
  for (const raw of String(diff ?? "").split("\n")) {
    if (raw.startsWith("diff --git ")) {
      const sides = headerPaths(raw);
      open(sides?.to ?? null);
      if (sides && sides.from !== sides.to) moved.set(sides.to, sides.from);
      inHunk = false;
      continue;
    }
    if (!inHunk && raw.startsWith("--- ")) {
      minus = diffPath(raw.slice(4));
      continue;
    }
    if (!inHunk && raw.startsWith("+++ ")) {
      const plus = diffPath(raw.slice(4));
      if (plus === "/dev/null" && minus) deleted.add(minus);
      else {
        open(plus);
        if (minus === "/dev/null" && plus) added.add(plus);
      }
      if (plus !== "/dev/null" && minus && minus !== "/dev/null" && minus !== plus) moved.set(plus, minus);
      minus = null;
      continue;
    }
    if (raw.startsWith("@@")) {
      inHunk = true;
      continue;
    }
    if (!file || !inHunk || raw.startsWith("\\")) continue;
    if (raw.startsWith("+") || raw.startsWith("-")) files.get(file).push({ sign: raw[0], text: raw.slice(1) });
  }
  return { files, added, deleted, moved };
}

/** The path-level rules: protected files on either side of a rename or copy, and existing tests immutable. */
function pathViolations(add, { status, path, from }) {
  for (const rule of protectedRules(path)) add(rule, path, "a protected file");
  if (from && from !== path) for (const rule of protectedRules(from)) add(rule, from, `a protected file (${status === "C" ? "copied" : "renamed"} to ${path})`);
  if (status === "D" && isTest(path)) add("protected_test_weakening", path, "an existing test must not be deleted");
  if (status === "R" && from && from !== path && isTest(from)) add("protected_test_weakening", from, "an existing test must not be renamed away");
  if (status !== "A" && status !== "D" && status !== "R" && isTest(path)) add("protected_test_weakening", path, "existing tests are immutable: add a new test file under test/ instead");
}

/** The line-level rules: guard lines in eligible files, and sabotage patterns in new tests. */
function lineViolations(add, path, lines) {
  const guards = GUARDED_LINES.filter((g) => g.files.some((re) => re.test(path)));
  for (const { sign, text } of lines) {
    const hit = guards.find((g) => g.lines.test(text));
    if (hit) add(hit.rule, path, `${sign} ${String(text).trim()}`.slice(0, 200));
    if (isTest(path) && sign === "+" && TEST_SABOTAGE.test(text)) {
      add("protected_test_weakening", path, `early exit or process kill in test: ${String(text).trim()}`.slice(0, 200));
    }
  }
  const removed = lines.filter((l) => l.sign === "-").length;
  if (isTest(path) && removed) add("protected_test_weakening", path, `${removed} line${removed === 1 ? "" : "s"} removed from an existing test: add tests, never weaken one`);
}

/**
 * Whether a change is allowed at all: protected files (touched, renamed, copied or deleted), the
 * guard lines in eligible files, and existing tests a diff may not delete, move or modify. Reads
 * both the changed paths and the diff's own lines, so a caller may give either or both.
 */
export function checkDiffSafety({ files = [], diff = "" } = {}) {
  const found = new Map();
  const paths = new Set();
  const add = (rule, file, detail) => {
    const key = `${rule}|${file}|${detail}`;
    if (!found.has(key)) found.set(key, { rule, file, detail });
  };
  const hunks = hunksOf(diff);
  const listed = files.map(fileEntry);
  const listedPaths = new Set(listed.map((e) => e.path));
  const entries = [
    ...listed,
    ...[...hunks.files.keys()]
      .filter((path) => !listedPaths.has(path) || hunks.moved.has(path))
      .map((path) => ({ status: hunks.moved.has(path) ? "R" : hunks.added.has(path) ? "A" : "M", path, from: hunks.moved.get(path) ?? null })),
    ...[...hunks.deleted].map((path) => ({ status: "D", path, from: null })),
  ].filter((e) => e.path);
  for (const entry of entries) {
    paths.add(entry.path);
    pathViolations(add, entry);
  }
  for (const [path, lines] of hunks.files) lineViolations(add, path, lines);
  const violations = [...found.values()];
  return { ok: violations.length === 0, files: [...paths].sort(), violations };
}

/** The same check for a branch, from git: `--name-status` (renames, deletions, modes) and `-U0`. */
export function verifyBranchSafety(root, baseRef, targetRef = "HEAD") {
  const base = String(baseRef ?? "HEAD");
  const range = `${base}...${targetRef}`;
  const files = parseNameStatus(runGit(root, ["diff", "--name-status", "--find-renames", range]));
  const diff = runGit(root, ["diff", "-U0", "--no-color", "--find-renames", range]);
  return { ...checkDiffSafety({ files, diff }), baseRef: base, targetRef };
}

// ── The experiment ledger and the pause that a failure leaves behind ─────────────────────

const improveDir = (root) => store(root, "improve");
export const experimentsFile = (root) => join(improveDir(root), "experiments.jsonl");
export const stateFile = (root) => join(improveDir(root), "state.json");
const EMPTY_STATE = { paused: false, reason: null, at: null, experimentId: null };

export function readState(root) {
  return { ...EMPTY_STATE, ...(readJson(stateFile(root), {}) ?? {}) };
}

/** Pauses self-improvement until the user resumes it: a rejection or a rollback is not shrugged off. */
export function setPaused(root, paused, reason = null, experimentId = null) {
  const state = { paused: Boolean(paused), reason: paused ? String(reason || "a gate failed") : null, at: now(), experimentId: experimentId ?? null };
  return withLock(stateFile(root), () => {
    writeJson(stateFile(root), state);
    return state;
  });
}

export function listExperiments(root, { limit = 0 } = {}) {
  const all = readJsonl(experimentsFile(root));
  return limit > 0 ? all.slice(-limit) : all;
}

function rolledBackIds(root) {
  return new Set(listExperiments(root).filter((e) => e.verdict === "rolled_back").map((e) => e.id));
}

/** The newest experiment still applied (not since rolled back), or null. */
export function latestApplied(root) {
  const all = listExperiments(root);
  const rolled = new Set(all.filter((e) => e.verdict === "rolled_back").map((e) => e.id));
  return all.filter((e) => e.verdict === "applied" && !rolled.has(e.id)).at(-1) ?? null;
}

/** The applied (or rollback_failed) experiment `id` still on main, or null; throws when already rolled back. */
function experimentById(root, id) {
  if (rolledBackIds(root).has(id)) throw new Error(`Experiment ${id} was already rolled back.`);
  return listExperiments(root).filter((e) => (e.verdict === "applied" || e.verdict === "rollback_failed") && e.appliedCommit && e.id === id).at(-1) ?? null;
}

function appendExperiment(root, record) {
  return withLock(experimentsFile(root), () => {
    appendJsonl(experimentsFile(root), record);
    return record;
  });
}

/** Refuses to start while a rejection or a rollback is unresolved. */
function assertUnpaused(root) {
  const state = readState(root);
  if (state.paused) throw new Error(`Self-improvement is paused: ${state.reason || "a gate failed"}. Run bh improve resume to re-enable.`);
  return state;
}

// One apply or rollback at a time. A gate run outlives withLock's 10 s stale-lock age, so the lock
// only guards a claim file naming the running process; a claim whose process is gone is taken over.
const claimFile = (root) => join(improveDir(root), "apply.json");

function alive(pid) {
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

function exclusive(root, fn) {
  const file = claimFile(root);
  const token = newId("run");
  withLock(store(root, "improve", "apply"), () => {
    const held = readJson(file, null);
    if (held?.pid && alive(held.pid)) throw new Error(`Another bh improve apply or rollback is running (pid ${held.pid}, since ${held.at}); try again when it finishes.`);
    writeJson(file, { pid: process.pid, at: now(), token });
  });
  try {
    return fn();
  } finally {
    withLock(store(root, "improve", "apply"), () => {
      if (readJson(file, null)?.token === token) rmSync(file, { force: true });
    });
  }
}

// ── Applying an experiment: gate, merge, install — and pause when any of it fails ────────

function git(root, args) {
  return runGit(root, args);
}

function gitOut(root, args) {
  return String(runGit(root, args) ?? "");
}

function shellIn(cwd, command) {
  const env = { ...process.env, FORCE_COLOR: "0" };
  delete env.NODE_TEST_CONTEXT; // the project's tests are their own run, not part of a caller's
  const r = spawnSync(command, { cwd, shell: true, encoding: "utf8", timeout: GATE_TIMEOUT, env, maxBuffer: 64 * 1024 * 1024 });
  return { ok: (r.status ?? 1) === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

function defaultRunTests({ cwd }) {
  const command = testCommand(cwd);
  return command ? shellIn(cwd, command) : { ok: true, out: "no test command in this project" };
}

function defaultRunCheck({ cwd }) {
  const r = spawnSync(process.execPath, [BH, "check"], { cwd, encoding: "utf8", timeout: GATE_TIMEOUT, windowsHide: true, env: { ...process.env, FORCE_COLOR: "0" } });
  return { ok: (r.status ?? 1) === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

const TS_UNRESOLVED = /^(\S.*?)\(\d+,\d+\): error TS(2304|2552):/gm;

/** Unresolved names outside the engine: the GPUI mod must stay type-clean; the engine has its own run. */
function tscViolations(out) {
  return [...String(out ?? "").matchAll(TS_UNRESOLVED)].map((m) => m[1].trim().replace(/\\/g, "/")).filter((file) => !file.startsWith("mods/bot-herdr/engine/"));
}

function defaultRunTsc({ cwd }) {
  if (!existsSync(join(cwd, "mods", "bot-herdr", "jsconfig.json"))) return { ok: true, out: "no mods/bot-herdr/jsconfig.json" };
  const launch = resolveLocalBin(cwd, "tsc", { args: ["-p", "mods/bot-herdr/jsconfig.json", "--noEmit"] });
  const r = spawnSync(launch.cmd, launch.args, { cwd, encoding: "utf8", timeout: GATE_TIMEOUT, windowsHide: true, env: { ...process.env, FORCE_COLOR: "0" } });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const bad = tscViolations(out);
  return bad.length ? { ok: false, out: `unresolved names outside the engine: ${bad.join(", ")}` } : { ok: true, out };
}

function defaultRunInstall({ root }) {
  const r = spawnSync(process.execPath, [join(root, "install.mjs")], { cwd: root, encoding: "utf8", timeout: GATE_TIMEOUT, windowsHide: true, env: { ...process.env, FORCE_COLOR: "0" } });
  return { ok: (r.status ?? 1) === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

/** An injected runner's answer or the default's, as one `{ ok, detail }`. */
function asResult(result, label) {
  if (typeof result === "number") return { ok: result === 0, detail: result === 0 ? "" : `${label} exited ${result}` };
  if (!result || typeof result !== "object") return { ok: false, detail: `${label}: no result` };
  const ok = typeof result.ok === "boolean" ? result.ok : Number(result.code) === 0;
  return ok ? { ok, detail: String(result.detail ?? "") } : { ok, detail: `${label}: ${tail(result.out ?? result.detail ?? "failed")}` };
}

function installMod(root, install, runInstall) {
  if (!install) return { ok: true, detail: "install skipped" };
  if (!existsSync(join(root, "install.mjs"))) return { ok: true, detail: "no install.mjs in this project" };
  try {
    return asResult(typeof runInstall === "function" ? runInstall({ root, cwd: root }) : defaultRunInstall({ root }), "install.mjs");
  } catch (e) {
    return { ok: false, detail: `install.mjs: ${e.message}` };
  }
}

/** The branch must be ours, must exist, must be ahead of the base, and must not clash with the tree. */
function readyBranch(root, branch, baseRef) {
  if (!branch) throw new Error("bh improve apply --branch <name>: the self-improvement branch to apply.");
  if (!String(branch).startsWith("bh/improve-")) throw new Error(`${branch} is not a self-improvement branch: its name must start with bh/improve-.`);
  try {
    git(root, ["rev-parse", "--verify", `${branch}^{commit}`]);
  } catch {
    throw new Error(`No branch ${branch} in this project.`);
  }
  const baseCommit = gitOut(root, ["rev-parse", baseRef]).trim();
  if (!Number(gitOut(root, ["rev-list", "--count", `${baseCommit}..${branch}`]) || 0)) throw new Error(`${branch} has no commits ahead of ${baseRef}: nothing to apply.`);
  const files = gitOut(root, ["diff", "--name-only", `${baseCommit}...${branch}`]).split("\n").map((f) => f.trim()).filter(Boolean);
  const local = new Set([
    ...gitOut(root, ["diff", "--name-only", "HEAD"]).split("\n"),
    ...gitOut(root, ["ls-files", "--others", "--exclude-standard"]).split("\n"),
  ].map((f) => f.trim()).filter(Boolean));
  const clash = files.filter((file) => local.has(file));
  if (clash.length) throw new Error(`The working tree has uncommitted changes to ${clash.join(", ")}: commit or stash them before applying ${branch}.`);
  return { baseCommit, files };
}

function newExperiment({ branch, title, baseCommit, files, baselineMetrics }) {
  return {
    id: newId("imp"),
    at: now(),
    title: title || branch,
    kind: "apply",
    branch,
    baseCommit,
    appliedCommit: null,
    rollbackRef: null,
    files,
    baselineMetrics,
    evals: { safety: null, tests: null, check: null, tsc: null, install: null },
    verdict: "applied",
    reason: "",
    rollbackCommit: null,
    rolledBackAt: null,
  };
}

/** The four gates, in order, inside the branch's isolated worktree. The first failure stops it. */
function runGates(root, { worktree, branch, baseCommit, files, runTests, runCheck, runTsc }) {
  const evals = { safety: null, tests: null, check: null, tsc: null, install: null };
  const safety = verifyBranchSafety(root, baseCommit, branch);
  evals.safety = { ok: safety.ok, detail: safety.violations.map((v) => `${v.rule}: ${v.file}${v.detail ? ` — ${v.detail}` : ""}`).join("\n") };
  if (!safety.ok) return { ok: false, reason: `safety invariants violated:\n${evals.safety.detail}`, evals };
  const tests = asResult(typeof runTests === "function" ? runTests({ cwd: worktree, root, files }) : defaultRunTests({ cwd: worktree }), "tests");
  evals.tests = tests;
  if (!tests.ok) return { ok: false, reason: `tests failed: ${tests.detail}`, evals };
  const check = asResult(typeof runCheck === "function" ? runCheck({ cwd: worktree, root, files }) : defaultRunCheck({ cwd: worktree }), "bh check");
  evals.check = check;
  if (!check.ok) return { ok: false, reason: `bh check failed: ${check.detail}`, evals };
  const needsTsc = files.some((file) => /^mods\/bot-herdr\/[^/]+\.js$/.test(file));
  const tsc = needsTsc
    ? asResult(typeof runTsc === "function" ? runTsc({ cwd: worktree, root, files }) : defaultRunTsc({ cwd: worktree }), "tsc")
    : { ok: true, detail: "no mods/bot-herdr UI js changed: tsc not needed" };
  evals.tsc = tsc;
  if (!tsc.ok) return { ok: false, reason: `GPUI tsc failed: ${tsc.detail}`, evals };
  return { ok: true, evals };
}

function addWorktree(root, path, branch) {
  try {
    git(root, ["worktree", "add", "--force", path, branch]);
  } catch (e) {
    throw new Error(`Could not create the isolated worktree for ${branch}: ${e.message}`);
  }
}

function removeWorktree(root, path) {
  try {
    git(root, ["worktree", "remove", "--force", path]);
  } catch {
    // already gone
  }
  try {
    git(root, ["worktree", "prune"]);
  } catch {
    // nothing to prune
  }
}

/** Keeps the base a merge can always be undone to, then merges the branch with a merge commit. */
function mergeBranch(root, branch, title, experiment) {
  experiment.rollbackRef = `refs/bot-herdr/improve-rollback/${experiment.id}`;
  try {
    git(root, ["update-ref", experiment.rollbackRef, experiment.baseCommit]);
    git(root, ["merge", "--no-ff", branch, "-m", `Self-improvement: ${title}`]);
  } catch (e) {
    try {
      git(root, ["merge", "--abort"]);
    } catch {
      // nothing to abort
    }
    return { ok: false, reason: `merging ${branch} failed (${e.message}); the tree was left alone` };
  }
  experiment.appliedCommit = gitOut(root, ["rev-parse", "HEAD"]).trim();
  return { ok: true };
}

/** A rejected experiment: main is untouched, nothing is installed, and self-improvement pauses. */
function reject(root, experiment, reason) {
  experiment.verdict = "rejected";
  experiment.reason = reason;
  appendExperiment(root, experiment);
  setPaused(root, true, reason, experiment.id);
  return { ok: false, verdict: "rejected", experiment };
}

/** Reverts the merge (its first parent is the base), reinstalls, and records the rollback. */
function revertApplied(root, experiment) {
  const commit = experiment.appliedCommit;
  if (!commit) throw new Error(`Experiment ${experiment.id} has no applied commit to revert.`);
  const parents = gitOut(root, ["rev-list", "--parents", "-n", "1", commit]).trim().split(/\s+/).filter(Boolean);
  const args = parents.length > 2 ? ["revert", "--no-edit", "-m", "1", commit] : ["revert", "--no-edit", commit];
  try {
    git(root, args);
  } catch (e) {
    try {
      git(root, ["revert", "--abort"]);
    } catch {
      // no revert was left in progress
    }
    throw new Error(`Could not revert ${commit} cleanly (${e.message}); nothing was rolled back.`);
  }
  return gitOut(root, ["rev-parse", "HEAD"]).trim();
}

function recordRollback(root, experiment, reason, rollbackCommit, installed) {
  const failed = experiment.evals?.install && experiment.evals.install.ok === false;
  const evalInstall = failed ? { ...experiment.evals.install, reinstalled: installed.ok } : installed;
  const record = { ...experiment, verdict: "rolled_back", reason, rollbackCommit, rolledBackAt: now(), evals: { ...experiment.evals, install: evalInstall } };
  appendExperiment(root, record);
  setPaused(root, true, reason, experiment.id);
  return record;
}

function rollbackApplied(root, experiment, reason, install, runInstall) {
  const rollbackCommit = revertApplied(root, experiment);
  const reinstalled = installMod(root, install, runInstall);
  const record = recordRollback(root, experiment, reason, rollbackCommit, reinstalled);
  return { ok: true, id: record.id, rollbackCommit, installed: reinstalled.ok, paused: true, record };
}

/** The revert itself failed: main still holds the merge, so the ledger says so and everything pauses. */
function recordRollbackFailed(root, experiment, reason, error) {
  const why = `${reason}; the automatic rollback failed too (${error.message}): main still holds ${experiment.appliedCommit ?? "the merge"}, so fix the tree by hand, then run bh improve rollback ${experiment.id} and bh improve resume`;
  const record = { ...experiment, verdict: "rollback_failed", reason: why, rollbackCommit: null, rolledBackAt: null };
  appendExperiment(root, record);
  setPaused(root, true, why, experiment.id);
  return record;
}

/** Rolls back, or — when the revert cannot run — records `rollback_failed` and pauses; never throws past the ledger. */
function rollbackOrPause(root, experiment, reason, install, runInstall) {
  try {
    return { ok: true, rollback: rollbackApplied(root, experiment, reason, install, runInstall) };
  } catch (e) {
    return { ok: false, record: recordRollbackFailed(root, experiment, reason, e), error: e.message };
  }
}

/**
 * Applies a `bh/improve-*` branch only if every gate passes: the safety invariants, the project's
 * tests, `bh check` and the GPUI tsc. Evaluation runs in a temporary worktree, so the project's
 * own tree only changes when the branch is merged. A rejected gate leaves the tree untouched,
 * installs nothing and pauses self-improvement until the user resumes it.
 */
export function applyExperiment(root, options = {}) {
  return exclusive(root, () => {
    const { branch, title = "", baseRef = "HEAD", window = 10 } = options;
    assertUnpaused(root);
    const { baseCommit, files } = readyBranch(root, branch, baseRef);
    const experiment = newExperiment({ branch, title, baseCommit, files, baselineMetrics: computeMetrics(root, { window }) });
    const worktree = join(store(root, "worktrees"), `improve-${experiment.id}`);
    try {
      addWorktree(root, worktree, branch);
      return gateMergeInstall(root, experiment, { ...options, worktree, branch, baseCommit, files });
    } finally {
      removeWorktree(root, worktree);
    }
  });
}

/** The gates, the merge and the install; any failure after the merge rolls back (or records why it could not). */
function gateMergeInstall(root, experiment, options) {
  const { install = true, runInstall } = options;
  const gate = runGates(root, options);
  experiment.evals = gate.evals;
  if (!gate.ok) return reject(root, experiment, gate.reason);
  const merged = mergeBranch(root, options.branch, experiment.title, experiment);
  if (!merged.ok) return reject(root, experiment, merged.reason);
  const installed = installMod(root, install, runInstall);
  experiment.evals.install = installed;
  if (installed.ok) {
    appendExperiment(root, experiment);
    return { ok: true, verdict: "applied", experiment };
  }
  const back = rollbackOrPause(root, experiment, `install failed: ${installed.detail || "install.mjs exited non-zero"}`, install, runInstall);
  if (!back.ok) return { ok: false, verdict: "rollback_failed", experiment: back.record, error: back.error };
  return { ok: false, verdict: "rolled_back", experiment: back.rollback.record, rollback: back.rollback };
}

// ── Regressions: the next window's metrics decide whether the experiment stayed ───────────

/** Whether the window after an apply got worse: more failed checks or gates, or much more spend. */
export function detectRegression(baseline, post, { minTasks = 2, maxCheckFailDelta = 0.15, maxQaFailDelta = 0.15, maxCostRatio = 1.25 } = {}) {
  if (!post || Number(post.tasks ?? 0) < minTasks) return { regressed: false, enoughData: false, reasons: [] };
  const reasons = [];
  const baseCheck = Number(baseline?.checkFailRate ?? 0);
  const baseQa = Number(baseline?.qaFailRate ?? 0);
  if (Number(post.checkFailRate ?? 0) - baseCheck > maxCheckFailDelta) reasons.push(`check failure rate rose from ${pct(baseCheck)} to ${pct(post.checkFailRate)}`);
  if (Number(post.qaFailRate ?? 0) - baseQa > maxQaFailDelta) reasons.push(`QA failure rate rose from ${pct(baseQa)} to ${pct(post.qaFailRate)}`);
  const baseCost = Number(baseline?.avgCostUsd ?? 0);
  if (baseCost > 0 && Number(post.avgCostUsd ?? 0) > baseCost * maxCostRatio) reasons.push(`average task cost rose from $${baseCost} to $${post.avgCostUsd} (over ${maxCostRatio}×)`);
  return { regressed: reasons.length > 0, enoughData: true, reasons };
}

/**
 * Takes an applied experiment back: `git revert` of its merge (or plain) commit, the mod installed
 * again from the rolled-back tree, a ledger entry, and self-improvement paused until the user
 * resumes it. A conflicting revert aborts and says so; it never leaves a half-reverted tree.
 */
export function rollbackExperiment(root, { id = null, reason = "Manual rollback", install = true, runInstall } = {}) {
  return exclusive(root, () => {
    const experiment = id ? experimentById(root, id) : latestApplied(root);
    if (!experiment) throw new Error(id ? `No applied experiment ${id} to roll back.` : "No applied experiment to roll back.");
    const rollback = rollbackApplied(root, experiment, reason, install, runInstall);
    return { ok: true, id: experiment.id, rollbackCommit: rollback.rollbackCommit, installed: rollback.installed, paused: true, record: rollback.record };
  });
}

/** Checks the window after an apply: a regression rolls the experiment back (and pauses) by itself. */
export function verifyExperiment(root, { id = null, window = 10, autoRollback = true, install = true, runInstall } = {}) {
  const experiment = id ? experimentById(root, id) : latestApplied(root);
  if (!experiment) throw new Error(id ? `No applied experiment ${id} to verify.` : "No applied experiment to verify. Run bh improve apply first.");
  const post = computeMetrics(root, { window, since: experiment.at });
  const verdict = detectRegression(experiment.baselineMetrics, post);
  const base = { regressed: verdict.regressed, reasons: verdict.reasons, baseline: experiment.baselineMetrics, post, id: experiment.id, enoughData: verdict.enoughData };
  if (!verdict.regressed) return { ...base, ok: true, rolledBack: false };
  const reason = `Regression after ${experiment.id}: ${verdict.reasons.join("; ")}`;
  if (!autoRollback) {
    setPaused(root, true, reason, experiment.id);
    return { ...base, ok: false, rolledBack: false };
  }
  const back = exclusive(root, () => rollbackOrPause(root, experiment, reason, install, runInstall));
  if (!back.ok) return { ...base, ok: false, rolledBack: false, verdict: "rollback_failed", experiment: back.record, error: back.error };
  return { ...base, ok: false, rolledBack: true, rollback: back.rollback };
}
