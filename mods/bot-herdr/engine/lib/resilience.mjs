// Resilience: what happens when a harness runs out of quota mid-task. The config (Settings →
// Resilience) names the fallback order and the guardrail budgets; a cooldown remembers which
// harness:model is out until when, so every agent shares it; and the guardrails here are the
// engine's own circuit breakers (spend, turns, thrash, spawn concurrency, git isolation).

import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { headless } from "../../roster.js";
import { DATA, accessOf, readJson, withLock, writeJson } from "./core.mjs";
import { DEFAULT_QUOTA_COOLDOWN_MS } from "./failures.mjs";
import * as T from "./tasks.mjs";

/** Harness scripts no project script may shadow: `bh check` is the guardrail itself. */
export const PROTECTED_BUILTIN_SCRIPTS = new Set(["check_changed", "run_changed_tests"]);

export const AUTONOMY = ["ask", "guarded", "autonomous"];

/** The resilience settings, as Settings → Resilience starts from (contract #11). */
export const RESILIENCE_DEFAULTS = {
  autonomy: "guarded",
  fallbacks: [],
  guardrails: {
    requireCheckBeforeDone: true,
    maxTaskSpendUsd: 10,
    maxStepTurns: 25,
    maxStepRetries: 3,
    maxQaRounds: 3,
    maxConcurrentSpawns: 4,
    maxSpawnDepth: 3,
    requireGitIsolationInAutonomous: true,
    protectedPaths: [".git", "data/bot-herdr/config.json", "data/bot-herdr/agents.json"],
  },
};

const CONFIG_FILE = () => join(DATA, "config.json");
const STORE_FILE = () => join(DATA, "cooldowns.json");

/** A harness, model and effort a fallback may switch to; "" model means the harness default. */
function fallbackOf(value) {
  if (!value || typeof value !== "object") return null;
  const harness = String(value.harness ?? "").trim();
  if (!harness) return null;
  return { harness, model: String(value.model ?? "").trim(), effort: String(value.effort ?? "").trim() };
}

const number = (value, fallback) => {
  // A blank or missing setting is not a zero: an empty box keeps what was there before.
  if (value === null || value === undefined || typeof value === "boolean") return fallback;
  if (typeof value === "string" && !value.trim()) return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};
const flag = (value, fallback) => (typeof value === "boolean" ? value : fallback);
const paths = (list, fallback) => (Array.isArray(list) ? list.map((p) => String(p ?? "").trim()).filter(Boolean) : fallback);

/** The saved config made whole: unknown keys dropped, numbers and lists sane, defaults filled in. */
function mergeResilience(base, patch) {
  const b = base && typeof base === "object" ? base : {};
  const p = patch && typeof patch === "object" ? patch : {};
  const bg = b.guardrails && typeof b.guardrails === "object" ? b.guardrails : {};
  const pg = p.guardrails && typeof p.guardrails === "object" ? p.guardrails : {};
  const d = RESILIENCE_DEFAULTS.guardrails;
  const pick = (key) => flag(pg[key], flag(bg[key], d[key]));
  const count = (key) => number(pg[key], number(bg[key], d[key]));
  const fallbacksOf = (value) => (Array.isArray(value) ? value.map(fallbackOf).filter(Boolean) : []);
  return {
    autonomy: AUTONOMY.includes(p.autonomy) ? p.autonomy : AUTONOMY.includes(b.autonomy) ? b.autonomy : RESILIENCE_DEFAULTS.autonomy,
    fallbacks: p.fallbacks !== undefined ? fallbacksOf(p.fallbacks) : b.fallbacks !== undefined ? fallbacksOf(b.fallbacks) : [],
    guardrails: {
      requireCheckBeforeDone: pick("requireCheckBeforeDone"),
      maxTaskSpendUsd: count("maxTaskSpendUsd"),
      maxStepTurns: count("maxStepTurns"),
      maxStepRetries: count("maxStepRetries"),
      maxQaRounds: count("maxQaRounds"),
      maxConcurrentSpawns: count("maxConcurrentSpawns"),
      maxSpawnDepth: count("maxSpawnDepth"),
      requireGitIsolationInAutonomous: pick("requireGitIsolationInAutonomous"),
      protectedPaths: paths(pg.protectedPaths ?? bg.protectedPaths, d.protectedPaths),
    },
  };
}

/** The resilience settings as saved, merged over the defaults. */
export function resilienceConfig() {
  const saved = readJson(CONFIG_FILE(), {}) ?? {};
  return mergeResilience(saved.resilience ?? null, null);
}

/** Saves a patch over the saved settings, atomically, and returns the whole config it wrote. */
export function saveResilienceConfig(patch = {}) {
  const file = CONFIG_FILE();
  return withLock(file, () => {
    const saved = readJson(file, {}) ?? {};
    const next = mergeResilience(saved.resilience ?? null, patch ?? {});
    writeJson(file, { ...saved, resilience: next });
    return next;
  });
}

// ── Cooldowns and failovers (DATA/cooldowns.json) ─────────────────────────────────────────

/** The key a harness and model share a cooldown under. */
export const cooldownKey = (harness, model) => `${harness}:${model || "default"}`;

const blank = () => ({ cooldowns: {}, failovers: [] });

function readStore() {
  const saved = readJson(STORE_FILE(), null);
  return {
    cooldowns: saved?.cooldowns && typeof saved.cooldowns === "object" && !Array.isArray(saved.cooldowns) ? saved.cooldowns : {},
    failovers: Array.isArray(saved?.failovers) ? saved.failovers : [],
  };
}

const live = (entry, nowMs) => Boolean(entry?.until) && Date.parse(entry.until) > nowMs;

/** Every cooldown still in force, with how much of it is left. */
export function readCooldowns(nowMs = Date.now()) {
  return Object.values(readStore().cooldowns)
    .filter((c) => live(c, nowMs))
    .map((c) => ({ ...c, remainingMs: Math.max(0, Date.parse(c.until) - nowMs) }))
    .sort((a, b) => String(a.until).localeCompare(String(b.until)));
}

/** The fallovers still in force. */
export function readFailovers(nowMs = Date.now()) {
  return readStore().failovers.filter((f) => live(f, nowMs)).sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

/** Drops what has expired from the store; returns { cooldowns, failovers } removed. */
export function pruneCooldowns(nowMs = Date.now()) {
  const file = STORE_FILE();
  return withLock(file, () => {
    const store = readStore();
    const cooldowns = Object.fromEntries(Object.entries(store.cooldowns).filter(([, c]) => live(c, nowMs)));
    const failovers = store.failovers.filter((f) => live(f, nowMs));
    const removed = { cooldowns: Object.keys(store.cooldowns).length - Object.keys(cooldowns).length, failovers: store.failovers.length - failovers.length };
    if (removed.cooldowns || removed.failovers) writeJson(file, { cooldowns, failovers });
    return removed;
  });
}

/** Remembers that a harness:model is out until `until` (ISO, or ms since the epoch). */
export function recordCooldown({ harness, model = "", kind = "quota", reason = "", until = null, nowMs = Date.now() }) {
  const name = String(harness ?? "");
  const end = until === null || until === undefined ? new Date(nowMs + DEFAULT_QUOTA_COOLDOWN_MS) : new Date(until);
  const entry = { key: cooldownKey(name, model), harness: name, model: String(model ?? ""), kind, reason: String(reason ?? ""), at: new Date(nowMs).toISOString(), until: Number.isFinite(end.getTime()) ? end.toISOString() : new Date(nowMs + DEFAULT_QUOTA_COOLDOWN_MS).toISOString() };
  const file = STORE_FILE();
  withLock(file, () => {
    const store = readStore();
    store.cooldowns[entry.key] = entry;
    writeJson(file, store);
  });
  return entry;
}

/** Remembers that an agent was moved to a fallback (one active entry per agent, not one per turn). */
export function recordFailover({ agent = null, from, to, until = null, reason = "", nowMs = Date.now() }) {
  const asKey = (v) => (typeof v === "string" ? v : cooldownKey(v?.harness ?? "", v?.model ?? ""));
  const end = until === null || until === undefined ? new Date(nowMs + DEFAULT_QUOTA_COOLDOWN_MS) : new Date(until);
  const entry = { agent, from: asKey(from), to: asKey(to), at: new Date(nowMs).toISOString(), until: Number.isFinite(end.getTime()) ? end.toISOString() : new Date(nowMs + DEFAULT_QUOTA_COOLDOWN_MS).toISOString(), reason: String(reason ?? "") };
  const file = STORE_FILE();
  withLock(file, () => {
    const store = readStore();
    const keep = (f) => live(f, nowMs) && !(agent !== null && agent !== undefined && f.agent === agent);
    store.failovers = [...store.failovers.filter(keep), entry];
    writeJson(file, store);
  });
  return entry;
}

/**
 * Clears one cooldown key (`claude:opus`), a harness's cooldowns (`claude`), or — with no key —
 * every cooldown and active failover. A failover recorded from a cleared key goes with it, so
 * `Retry now` takes the stale fallback pill away too. Returns what it cleared.
 */
export function clearCooldowns(keyOrNull = null) {
  const file = STORE_FILE();
  return withLock(file, () => {
    const store = readStore();
    if (keyOrNull === null || keyOrNull === undefined || keyOrNull === "") {
      const cleared = Object.keys(store.cooldowns).length;
      writeJson(file, blank());
      return { cleared, failovers: store.failovers.length };
    }
    // "claude:opus" is one cooldown; "claude" (or "claude:*") is that harness's whole set.
    const wanted = String(keyOrNull).replace(/\*$/, "").replace(/:$/, "");
    const hit = (key) => key === wanted || key.startsWith(`${wanted}:`);
    const kept = Object.fromEntries(Object.entries(store.cooldowns).filter(([key]) => !hit(key)));
    // The failover that moved away from a cleared key is over too: the pill goes with the cooldown.
    const failovers = store.failovers.filter((f) => !hit(String(f.from ?? "")));
    const cleared = Object.keys(store.cooldowns).length - Object.keys(kept).length;
    writeJson(file, { cooldowns: kept, failovers });
    return { cleared, failovers: store.failovers.length - failovers.length };
  });
}

/** Whether this harness:model is cooling down right now. */
export function isCooledDown(harness, model = "", nowMs = Date.now()) {
  const entry = readStore().cooldowns[cooldownKey(harness, model)];
  return live(entry, nowMs);
}

// ── Ordered fallback resolver ────────────────────────────────────────────────────────────

/**
 * Harnesses with no permission system of their own: falling back to one from any harness that does
 * enforce the user's access level (Claude Code, Codex, the ACP ones) would silently widen it.
 */
const UNRESTRICTED = new Set(["pi", "omp"]);

const sameTarget = (a, b) => (a.harness ?? "") === (b.harness ?? "") && (a.model || "") === (b.model || "");

/**
 * The next place to run a turn, per the user's order: another model on the same CLI first (the
 * conversation continues), then another installed harness. `visited` and the cooldowns stop a
 * ping-pong. Returns { target, sameHarness, skipped }, or null when every candidate is spoken for.
 */
export function pickFallback(args = {}) {
  const plan = fallbackPlan(args);
  return plan?.target ? plan : null;
}

/** `pickFallback` with the reasons it passed candidates over, for the note it leaves in chat. */
export function fallbackPlan({ agent = null, current = null, config = null, known = [], cooldowns = [], visited = new Set(), nowMs = Date.now(), allowUnrestrictedFallback = false, access = null, canRun = null } = {}) {
  const here = { harness: String(current?.harness ?? ""), model: String(current?.model ?? "") };
  const candidates = [...(Array.isArray(agent?.fallbacks) ? agent.fallbacks : []), ...(Array.isArray(config?.fallbacks) ? config.fallbacks : [])].map(fallbackOf).filter(Boolean);
  const seen = new Set(visited instanceof Set ? visited : Array.isArray(visited) ? visited : []);
  seen.add(cooldownKey(here.harness, here.model));
  const cooled = new Set(cooldowns.map((c) => (typeof c === "string" ? c : c.key ?? cooldownKey(c?.harness ?? "", c?.model ?? ""))));
  const open = (c) => !seen.has(cooldownKey(c.harness, c.model)) && !cooled.has(cooldownKey(c.harness, c.model)) && !sameTarget(c, here);
  const installed = new Set(known.filter((k) => k && k.installed !== false).map((k) => k.key));
  const level = access ?? accessOf().access;
  // A harness that only runs in a terminal cannot take a turn here: it is passed over, not tried.
  const runs = typeof canRun === "function" ? canRun : (h) => headless(h);

  const same = candidates.find((c) => c.harness === here.harness && c.model !== here.model && open(c));
  if (same) return { target: same, sameHarness: true, skipped: [] };

  const skipped = [];
  for (const c of candidates) {
    if (c.harness === here.harness || !open(c)) continue;
    if (!installed.has(c.harness)) {
      skipped.push({ harness: c.harness, model: c.model, reason: "not installed" });
      continue;
    }
    if (!runs(c.harness)) {
      skipped.push({ harness: c.harness, model: c.model, reason: "no headless mode here: it cannot take a turn" });
      continue;
    }
    if (level !== "full" && !allowUnrestrictedFallback && !UNRESTRICTED.has(here.harness) && UNRESTRICTED.has(c.harness)) {
      skipped.push({ harness: c.harness, model: c.model, reason: `${c.harness} has no permission system: not a silent fallback from ${here.harness} at standard access` });
      continue;
    }
    return { target: c, sameHarness: false, skipped };
  }
  return skipped.length ? { target: null, sameHarness: false, skipped } : null;
}

// ── Continuing from the dirty worktree ──────────────────────────────────────────────────

const clip = (text, max) => {
  const s = String(text ?? "").trim();
  return s.length <= max ? s : `${s.slice(0, max)}\n…(${s.length - max} more characters)`;
};

function gitOut(cwd, args) {
  try {
    const r = spawnSync("git", args, { cwd, encoding: "utf8", timeout: 15000, windowsHide: true });
    return r.status === 0 ? String(r.stdout ?? "").trim() : "";
  } catch {
    return "";
  }
}

/**
 * What a fallback harness is told when it takes over: the same dirty worktree, the changes in
 * it, where the task and its step stand, the recent board, the last reply and the user's message.
 * Never throws: outside git it simply has no diff to show.
 */
export function dirtyTreeHandoff({ cwd, root = cwd, task = null, step = null, from = null, to = null, reason = "", lastReply = "", input = "" } = {}) {
  const id = typeof task === "string" ? task : task?.id ?? null;
  let saved = typeof task === "object" && task ? task : null;
  if (!saved && id) {
    try {
      saved = T.loadTask(root, id);
    } catch {
      saved = null;
    }
  }
  const fromName = typeof from === "string" ? from : cooldownKey(from?.harness ?? "", from?.model ?? "");
  const toName = typeof to === "string" ? to : cooldownKey(to?.harness ?? "", to?.model ?? "");
  const status = gitOut(cwd, ["status", "--short"]);
  const stat = gitOut(cwd, ["diff", "--stat"]);
  const active = step !== null && step !== undefined ? saved?.steps?.find((s) => String(s.n) === String(step)) : saved?.steps?.find((s) => s.status === "active");
  let recent = [];
  if (id) {
    try {
      recent = T.board(root, id).slice(-5);
    } catch {
      recent = [];
    }
  }
  const lines = [
    "## Failover: continue the work in progress",
    "",
    `${fromName || "The previous harness"} could not continue${reason ? ` (${reason})` : ""}; ${toName || "another harness"} has the same task now.`,
    "You are in the same worktree, with the same uncommitted changes. Continue the work from there: do not start over and do not discard them.",
    "",
  ];
  if (id) lines.push(`- Task: ${id}${saved?.title ? ` — ${saved.title}` : ""}`);
  if (active) lines.push(`- Step: ${active.n}. ${active.title} (${active.status})`);
  if (saved?.status) lines.push(`- Task status: ${saved.status}`);
  if (status) lines.push("", "### Uncommitted changes (git status --short)", "", "```", clip(status, 4000), "```");
  if (stat) lines.push("", "### Change size (git diff --stat)", "", "```", clip(stat, 4000), "```");
  if (recent.length) lines.push("", "### Recent board posts", ...recent.map((e) => `- [${e.kind}] #${e.n}${e.from ? ` from ${e.from}` : ""}: ${clip(e.text, 400)}`));
  if (String(lastReply ?? "").trim()) lines.push("", "### The previous reply before it failed", "", clip(lastReply, 1500));
  if (String(input ?? "").trim()) lines.push("", "### The message still to answer", "", clip(input, 4000));
  return lines.join("\n").trim();
}

// ── Guardrails (the engine's own circuit breakers) ───────────────────────────────────────

const guardrailsOf = (config) => ({ ...RESILIENCE_DEFAULTS.guardrails, ...(config?.guardrails ?? {}) });

/** A task's spend from its own usage file. */
export function taskSpend(root, taskId) {
  return Number(T.usageOf(root, taskId).reduce((n, r) => n + (Number(r.costUsd) || 0), 0).toFixed(4));
}

/** The trailing run of failed checks whose tree never changed: the same failure, over and over. */
function thrashOf(root, taskId, maxStepRetries) {
  if (!(maxStepRetries > 0)) return null;
  const receipts = T.checks(root, taskId);
  const tail = [];
  for (let i = receipts.length - 1; i >= 0; i--) {
    if (Number(receipts[i]?.exit ?? 0) === 0) break; // a pass ends the run
    tail.push(receipts[i]);
  }
  if (tail.length < maxStepRetries) return null;
  const diff = String(tail[0]?.diff ?? "");
  if (!diff) return null;
  if (!tail.slice(0, maxStepRetries).every((r) => String(r.diff ?? "") === diff)) return null;
  return `${maxStepRetries} failed bh check runs on the same tree, unchanged: the work is thrashing`;
}

/**
 * The circuit breaker for one task: spend over `maxTaskSpendUsd`, turns on the current step over
 * `maxStepTurns`, or `maxStepRetries` failures of the same tree. Returns { ok, tripped, reason }.
 */
export function checkTaskBudget(root, taskId, config = null) {
  const g = guardrailsOf(config);
  const task = T.loadTask(root, taskId);
  const usage = T.usageOf(root, taskId);
  const spendUsd = taskSpend(root, taskId);
  const active = task.steps?.find((s) => s.status === "active") ?? task.steps?.find((s) => s.status === "todo") ?? null;
  const turns = active ? usage.filter((r) => Number(r.step) === active.n).length : 0;
  if (g.maxTaskSpendUsd > 0 && spendUsd > g.maxTaskSpendUsd) {
    return { ok: false, tripped: "spend", reason: `task ${taskId} spent $${spendUsd.toFixed(2)}, over its $${g.maxTaskSpendUsd} ceiling`, spendUsd, turns };
  }
  if (g.maxStepTurns > 0 && turns >= g.maxStepTurns) {
    return { ok: false, tripped: "turns", reason: `step ${active?.n ?? "?"} used ${turns} turns, its limit is ${g.maxStepTurns}`, spendUsd, turns };
  }
  const thrash = thrashOf(root, taskId, g.maxStepRetries);
  if (thrash) return { ok: false, tripped: "thrash", reason: thrash, spendUsd, turns };
  return { ok: true, tripped: null, reason: "", spendUsd, turns };
}

/**
 * How many children may be open at once (`maxConcurrentSpawns`) and how deep spawns may nest
 * (`maxSpawnDepth`, with BH_SPAWN_DEPTH carried into each child). Returns { ok, reason }.
 */
export function checkSpawnLimits(root, task = null, config = null, { depth = 1 } = {}) {
  const g = guardrailsOf(config);
  if (g.maxSpawnDepth > 0 && Number(depth) > g.maxSpawnDepth) {
    return { ok: false, reason: `a spawn at depth ${depth} is past the limit of ${g.maxSpawnDepth}: finish this level first` };
  }
  if (g.maxConcurrentSpawns > 0) {
    const open = T.listTasks(root).flatMap((t) => t.children ?? []).filter((c) => c.state === "open").length;
    if (open >= g.maxConcurrentSpawns) {
      return { ok: false, reason: `${open} child agents are already working (the limit is ${g.maxConcurrentSpawns}): merge or drop one first` };
    }
  }
  return { ok: true, reason: "" };
}

/** Autonomous mode runs only where every task's work is on its own branch or worktree. */
export function checkAutonomousIsolation(root, config = null, task = null) {
  const c = config ?? resilienceConfig();
  if (c.autonomy !== "autonomous" || !c.guardrails.requireGitIsolationInAutonomous) return { ok: true, reason: "" };
  if (task?.git?.branch) return { ok: true, reason: "" };
  if (accessOf().git !== "off") return { ok: true, reason: "" };
  return { ok: false, reason: "autonomous mode needs git isolation (Settings → How agents run → Git isolation: branch or worktree), so no autonomous task works straight on the main tree" };
}
