// Shared scripts: jobs that come back (seeding data, regenerating fixtures, a set of checks) kept
// as scripts every agent can run, so a step done once is run the next time instead of being
// worked out again. Built-in read-only scripts ship with the engine; a project's own live in
// .bot-herdr/scripts/ and replace a built-in one of the same name.
//
// Each script's first lines say what it is for and how to run it:
//   // purpose: …        (or # purpose: …)
//   // usage: …

import { spawnSync } from "node:child_process";
import { rmSync, statSync } from "node:fs";
import { basename, extname, join, relative, sep } from "node:path";
import { ENGINE, appendJsonl, listDir, now, readJsonl, readText, store, withLock, writeText } from "./core.mjs";
import { PROTECTED_BUILTIN_SCRIPTS } from "./resilience.mjs";

const BUILTIN = join(ENGINE, "scripts");
export const RUNNERS = { ".mjs": ["node"], ".js": ["node"], ".cjs": ["node"], ".ts": ["node"], ".py": ["python3"], ".sh": ["bash"], ".ps1": ["powershell", "-NoProfile", "-File"], ".rb": ["ruby"] };

function header(path) {
  const head = readText(path).split("\n").slice(0, 12).join("\n");
  const field = (k) => new RegExp(`^\\s*(?://|#)\\s*${k}:\\s*(.+)$`, "im").exec(head)?.[1]?.trim() ?? "";
  return { purpose: field("purpose"), usage: field("usage") };
}

const nameOf = (file) => basename(file, extname(file));

/** Every script: the project's first, then the built-ins it does not replace. A project script may
 * never take the place of the built-in `bh check` ones: the check is the guardrail, not a choice. */
export function scripts(root) {
  const own = listDir(store(root, "scripts"))
    .filter((d) => d.isFile() && RUNNERS[extname(d.name)] && !PROTECTED_BUILTIN_SCRIPTS.has(nameOf(d.name).toLowerCase()))
    .map((d) => ({ name: nameOf(d.name), file: join(store(root, "scripts"), d.name), source: "project" }));
  const taken = new Set(own.map((s) => s.name));
  const built = listDir(BUILTIN).filter((d) => d.isFile() && d.name.endsWith(".mjs") && !taken.has(nameOf(d.name))).map((d) => ({ name: nameOf(d.name), file: join(BUILTIN, d.name), source: "built-in" }));
  return [...own, ...built].map((s) => ({ ...s, ...header(s.file) }));
}

export function find(root, name) {
  const s = scripts(root).find((x) => x.name === name || basename(x.file) === name);
  if (!s) throw new Error(`No script ${name}. \`bh scripts\` lists them.`);
  return s;
}

export const usageFile = (root) => join(store(root, "scripts"), "usage.jsonl");

/** Records one script invocation in `.bot-herdr/scripts/usage.jsonl` (best-effort, locked). */
export function recordUsage(root, { name, source, exit, ms, task = null }) {
  const path = usageFile(root);
  const entry = { at: now(), name, source, task: task ?? (process.env.BH_TASK || null), exit: Number(exit ?? 0), ms: Math.max(0, Math.round(Number(ms) || 0)) };
  try {
    return withLock(path, () => {
      appendJsonl(path, entry);
      return entry;
    });
  } catch {
    return entry;
  }
}

export function scriptUsage(root) {
  return readJsonl(usageFile(root));
}

/** Runs a script in the project. Returns the exit code, or `{ code, out, err }` when `capture` is asked. */
export function run(root, name, args = [], { capture = false, task = null } = {}) {
  const s = find(root, name);
  const runner = [...RUNNERS[extname(s.file)]];
  if (process.platform === "win32" && runner[0] === "python3") runner[0] = "python";
  const started = Date.now();
  if (capture) {
    const r = spawnSync(runner[0], [...runner.slice(1), s.file, ...args], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const code = r.status ?? 1;
    recordUsage(root, { name: s.name, source: s.source, exit: code, ms: Date.now() - started, task });
    return { code, out: r.stdout ?? "", err: r.stderr ?? (r.error ? String(r.error.message) : "") };
  }
  const r = spawnSync(runner[0], [...runner.slice(1), s.file, ...args], { cwd: root, stdio: "inherit" });
  const code = r.status ?? 1;
  recordUsage(root, { name: s.name, source: s.source, exit: code, ms: Date.now() - started, task });
  return code;
}

/** Saves a script into the project (snake_case name, its language's extension). The one before goes to archive/. */
export function save(root, from, name = null) {
  const ext = extname(from);
  if (!RUNNERS[ext]) throw new Error(`Scripts can be: ${Object.keys(RUNNERS).join(" ")}.`);
  const base = (name ? nameOf(name) : nameOf(from)).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  if (PROTECTED_BUILTIN_SCRIPTS.has(base)) throw new Error(`${base} is a built-in check script: a project script may not replace it. Give this one another name.`);
  const target = join(store(root, "scripts"), `${base}${ext}`);
  const text = readText(from);
  if (!header(from).purpose) throw new Error(`Start the script with a "purpose:" comment line (and "usage:") so the others know what it does.`);
  const before = readText(target, null);
  if (before !== null && before !== text) writeText(join(store(root, "scripts"), "archive", `${base}-${now().replace(/[:.]/g, "-")}${ext}`), before);
  writeText(target, text);
  return target;
}

const words = (text) => new Set(String(text).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));

/** Scripts that share words with a step, best first (the rule the classifier refines). */
export function keywordPick(list, step, max = 5) {
  const want = words(step);
  return list
    .map((s) => ({ s, hits: [...words(`${s.name.replace(/_/g, " ")} ${s.purpose}`)].filter((w) => want.has(w)).length }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, max)
    .map((x) => x.s);
}

export function scriptLine(s) {
  return `${s.name}${s.source === "project" ? " (project)" : ""}: ${s.purpose || "no purpose line"}${s.usage ? `\n    usage: ${s.usage.replace("{script}", s.name)}` : ""}`;
}

// ── Relevance-based script auditing & pruning (archive, never destroy) ───────────────────

const DAY_MS = 86_400_000;

function planReferencedScripts(root) {
  const refs = new Set();
  for (const d of listDir(store(root, "plans"))) {
    if (!d.isDirectory()) continue;
    const md = readText(join(store(root, "plans"), d.name, "plan.md"));
    for (const m of md.matchAll(/\bbh\s+scripts?\s+run\s+([a-z0-9_-]+)/gi)) refs.add(m[1].toLowerCase());
    for (const m of md.matchAll(/\.bot-herdr\/scripts\/([a-z0-9_-]+)\.[a-z0-9]+/gi)) refs.add(m[1].toLowerCase());
  }
  return refs;
}

/**
 * Audits project scripts in `.bot-herdr/scripts/` for relevance using usage telemetry, exit health,
 * and active Goal/plan references. Built-in scripts and active Goal scripts are never prune candidates.
 */
export function auditScripts(root, { staleDays = 30, protectedPaths = new Set(), nowMs = Date.now() } = {}) {
  const days = Math.max(1, Number(staleDays) || 30);
  const projectScripts = scripts(root).filter((s) => s.source === "project");
  const usage = scriptUsage(root);
  const byName = new Map();
  for (const u of usage) {
    const list = byName.get(u.name) ?? [];
    list.push(u);
    byName.set(u.name, list);
  }
  const planRefs = planReferencedScripts(root);
  const protectedNorm = new Set([...(protectedPaths ?? [])].map((p) => String(p).replace(/\\/g, "/").toLowerCase()));

  const audited = projectScripts.map((s) => {
    const rel = relative(root, s.file).split(sep).join("/").toLowerCase();
    const isProtected = protectedNorm.has(rel) || planRefs.has(s.name.toLowerCase()) || PROTECTED_BUILTIN_SCRIPTS.has(s.name.toLowerCase());
    const runs = byName.get(s.name) ?? [];
    const lastUsed = runs.at(-1)?.at ?? null;
    let mtimeMs = nowMs;
    try {
      mtimeMs = statSync(s.file).mtimeMs;
    } catch {}
    const lastActivityMs = lastUsed ? Date.parse(lastUsed) : mtimeMs;
    const ageDays = Math.max(0, Math.floor((nowMs - (Number.isFinite(lastActivityMs) ? lastActivityMs : nowMs)) / DAY_MS));
    const recent = runs.slice(-5);
    const recentFails = recent.filter((r) => Number(r.exit) !== 0).length;
    const recentFailRate = recent.length ? Number((recentFails / recent.length).toFixed(2)) : 0;

    const reasons = [];
    let status = "active";
    if (isProtected) {
      status = "protected";
      reasons.push("referenced by an active Goal or plan");
    } else if (recent.length >= 3 && recentFailRate >= 0.8) {
      status = "broken";
      reasons.push(`${recentFails}/${recent.length} recent runs failed`);
    } else if (runs.length === 0 && ageDays >= days) {
      status = "unused";
      reasons.push(`never run (${ageDays}d old)`);
    } else if (runs.length > 0 && ageDays >= days) {
      status = "stale";
      reasons.push(`unused for ${ageDays}d (last used ${lastUsed})`);
    }

    return {
      name: s.name,
      file: s.file,
      purpose: s.purpose,
      runs: runs.length,
      lastUsedAt: lastUsed,
      ageDays,
      recentFailRate,
      protected: isProtected,
      status,
      pruneCandidate: !isProtected && (status === "stale" || status === "unused" || status === "broken"),
      reasons,
    };
  });

  return { staleDays: days, scripts: audited, candidates: audited.filter((a) => a.pruneCandidate) };
}

/**
 * Archives stale/unused/broken (or explicitly named) project scripts to `.bot-herdr/scripts/archive/`.
 * Never prunes built-in scripts or scripts protected by an active Goal or plan.
 */
export function pruneScripts(root, { staleDays = 30, names = null, dryRun = false, protectedPaths = new Set(), nowMs = Date.now() } = {}) {
  const audit = auditScripts(root, { staleDays, protectedPaths, nowMs });
  const wanted = Array.isArray(names) && names.length ? new Set(names.map((n) => String(n).toLowerCase())) : null;
  const archived = [];
  const skipped = [];

  for (const item of audit.scripts) {
    const selected = wanted ? wanted.has(item.name.toLowerCase()) : item.pruneCandidate;
    if (!selected) continue;
    if (item.protected) {
      skipped.push({ name: item.name, reason: "protected by active Goal/plan or built-in" });
      continue;
    }
    const ext = extname(item.file);
    const archivePath = join(store(root, "scripts"), "archive", `${item.name}-${now().replace(/[:.]/g, "-")}${ext}`);
    if (!dryRun) {
      const content = readText(item.file);
      writeText(archivePath, content);
      rmSync(item.file, { force: true });
    }
    archived.push({ name: item.name, from: item.file, archivePath, status: item.status, reasons: item.reasons });
  }

  // Explicitly requested built-in names must always report skipped, never deleted
  if (wanted) {
    const builtins = scripts(root).filter((s) => s.source === "built-in");
    for (const b of builtins) {
      if (wanted.has(b.name.toLowerCase())) skipped.push({ name: b.name, reason: "built-in script cannot be pruned" });
    }
  }

  return { dryRun: Boolean(dryRun), archived, skipped };
}
