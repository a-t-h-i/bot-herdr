// Pure view-model helpers for the Settings Resilience tab and the slim live status strip.
// Zero gpui-kit / gpui-base / herdr / Intl imports so node --test imports it directly.

export const AUTONOMY_MODES = ["ask", "guarded", "autonomous"];

export const AUTONOMY_LABELS = {
  ask: "Ask",
  guarded: "Guarded",
  autonomous: "Autonomous",
};

export const HARNESS_LABELS = {
  claude: "Claude",
  codex: "Codex",
  pi: "pi",
  omp: "Oh My Pi",
  gemini: "Gemini",
  qwen: "Qwen",
  opencode: "OpenCode",
  antigravity: "Antigravity",
};

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

/** Short display label for a harness key. */
export function harnessLabel(key, known = []) {
  const k = String(key ?? "").trim();
  if (!k) return "";
  const listed = (Array.isArray(known) ? known : []).find((x) => x?.key === k);
  if (listed?.name) return String(listed.name);
  if (HARNESS_LABELS[k]) return HARNESS_LABELS[k];
  return k.charAt(0).toUpperCase() + k.slice(1);
}

/** Parses non-negative numeric input cleanly, clamping within [min, max]. */
export function parseBudgetNumber(text, fallback, { min = 0, max = Infinity } = {}) {
  if (text === null || text === undefined) return fallback;
  const raw = typeof text === "number" ? text : Number(String(text).trim().replace(/^\$/, ""));
  if (typeof text === "string" && !text.trim()) return fallback;
  if (!Number.isFinite(raw) || raw < 0) return fallback;
  return Math.max(min, Math.min(max, raw));
}

/** Normalizes one fallback step `{ harness, model, effort }`; returns null if harness is empty. */
export function cleanFallbackStep(step) {
  if (!step || typeof step !== "object") return null;
  const harness = String(step.harness ?? "").trim();
  if (!harness) return null;
  return {
    harness,
    model: String(step.model ?? "").trim(),
    effort: String(step.effort ?? "").trim(),
  };
}

/** Appends a cleaned fallback step without mutating the input array. */
export function addFallbackStep(chain, step) {
  const list = Array.isArray(chain) ? chain.slice() : [];
  const cleaned = cleanFallbackStep(step);
  return cleaned ? [...list, cleaned] : list;
}

/** Removes the fallback step at `index` without mutating the input array. */
export function removeFallbackStep(chain, index) {
  const list = Array.isArray(chain) ? chain.slice() : [];
  if (!Number.isInteger(index) || index < 0 || index >= list.length) return list;
  list.splice(index, 1);
  return list;
}

/** Moves the fallback step at `index` by `delta` (clamped to bounds) without mutating input. */
export function moveFallbackStep(chain, index, delta) {
  const list = Array.isArray(chain) ? chain.slice() : [];
  if (!Number.isInteger(index) || index < 0 || index >= list.length) return list;
  const target = Math.max(0, Math.min(list.length - 1, index + (Number(delta) || 0)));
  if (target === index) return list;
  const [item] = list.splice(index, 1);
  list.splice(target, 0, item);
  return list;
}

/** Formats milliseconds into a compact countdown ("<1m", "14m", "2h 15m") without locale APIs. */
export function formatRemaining(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 60000) return "<1m";
  const totalMin = Math.floor(n / 60000);
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (!hours) return `${totalMin}m`;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

/** Formats a USD amount cleanly ("$1.84", "$10"). */
function formatUsd(amount) {
  const n = Math.max(0, Number(amount) || 0);
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

function normalizeGuardrails(g) {
  const d = RESILIENCE_DEFAULTS.guardrails;
  const raw = g && typeof g === "object" ? g : {};
  const paths = Array.isArray(raw.protectedPaths)
    ? raw.protectedPaths.map((p) => String(p ?? "").trim()).filter(Boolean)
    : [...d.protectedPaths];
  return {
    requireCheckBeforeDone: raw.requireCheckBeforeDone !== undefined ? Boolean(raw.requireCheckBeforeDone) : d.requireCheckBeforeDone,
    maxTaskSpendUsd: parseBudgetNumber(raw.maxTaskSpendUsd, d.maxTaskSpendUsd, { min: 0, max: 10000 }),
    maxStepTurns: parseBudgetNumber(raw.maxStepTurns, d.maxStepTurns, { min: 0, max: 1000 }),
    maxStepRetries: parseBudgetNumber(raw.maxStepRetries, d.maxStepRetries, { min: 0, max: 50 }),
    maxQaRounds: parseBudgetNumber(raw.maxQaRounds, d.maxQaRounds, { min: 0, max: 50 }),
    maxConcurrentSpawns: parseBudgetNumber(raw.maxConcurrentSpawns, d.maxConcurrentSpawns, { min: 1, max: 32 }),
    maxSpawnDepth: parseBudgetNumber(raw.maxSpawnDepth, d.maxSpawnDepth, { min: 1, max: 16 }),
    requireGitIsolationInAutonomous: raw.requireGitIsolationInAutonomous !== undefined ? Boolean(raw.requireGitIsolationInAutonomous) : d.requireGitIsolationInAutonomous,
    protectedPaths: paths,
  };
}

function normalizeCooldown(x) {
  if (!x || typeof x !== "object") return null;
  const harness = String(x.harness ?? "").trim();
  const model = String(x.model ?? "").trim();
  const key = String(x.key ?? [harness, model].filter(Boolean).join(":")).trim();
  if (!key && !harness) return null;
  const untilMs = x.until ? Date.parse(String(x.until)) : NaN;
  const derived = Number.isFinite(untilMs) ? Math.max(0, untilMs - Date.now()) : 0;
  const remainingMs = x.remainingMs != null ? Math.max(0, Number(x.remainingMs) || 0) : derived;
  return {
    key: key || harness,
    harness: harness || key.split(":")[0],
    model,
    kind: String(x.kind ?? "cooldown").trim(),
    reason: String(x.reason ?? "").trim(),
    at: x.at ? String(x.at) : null,
    until: x.until ? String(x.until) : null,
    remainingMs,
  };
}

function normalizeFailover(x) {
  if (!x || typeof x !== "object") return null;
  const side = (s) => {
    if (typeof s === "string") {
      const idx = s.indexOf(":");
      const harness = (idx >= 0 ? s.slice(0, idx) : s).trim();
      const rawModel = idx >= 0 ? s.slice(idx + 1).trim() : "";
      return { harness, model: rawModel === "default" ? "" : rawModel };
    }
    if (s && typeof s === "object") {
      return { harness: String(s.harness ?? "").trim(), model: String(s.model ?? "").trim() };
    }
    return { harness: "", model: "" };
  };
  return {
    agent: String(x.agent ?? "").trim(),
    from: side(x.from),
    to: side(x.to),
    at: x.at ? String(x.at) : null,
    until: x.until ? String(x.until) : null,
    reason: String(x.reason ?? "").trim(),
  };
}

function normalizeTask(t) {
  if (!t || typeof t !== "object") return null;
  return {
    id: String(t.id ?? "").trim(),
    status: String(t.status ?? "").trim(),
    spendUsd: Math.max(0, Number(t.spendUsd ?? 0) || 0),
    maxTaskSpendUsd: Math.max(0, Number(t.maxTaskSpendUsd ?? 0) || 0),
    turns: Math.max(0, Number(t.turns ?? 0) || 0),
    breaker: t.breaker ?? null,
  };
}

/** Safely normalizes `bh resilience status --json` (handles null/partial responses). */
export function normalizeStatus(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const cfg = src.config && typeof src.config === "object" ? src.config : {};
  const autonomy = AUTONOMY_MODES.includes(cfg.autonomy) ? cfg.autonomy : RESILIENCE_DEFAULTS.autonomy;
  const fallbacks = (Array.isArray(cfg.fallbacks) ? cfg.fallbacks : []).map(cleanFallbackStep).filter(Boolean);
  return {
    config: { autonomy, fallbacks, guardrails: normalizeGuardrails(cfg.guardrails) },
    cooldowns: (Array.isArray(src.cooldowns) ? src.cooldowns : []).map(normalizeCooldown).filter(Boolean),
    activeFailovers: (Array.isArray(src.activeFailovers) ? src.activeFailovers : []).map(normalizeFailover).filter(Boolean),
    task: normalizeTask(src.task),
  };
}

function matchCooldown(key, cooldowns) {
  const hits = cooldowns.filter((c) => c.harness === key || c.key === key || c.key.startsWith(`${key}:`));
  if (!hits.length) return null;
  return hits.reduce((best, cur) => (cur.remainingMs > best.remainingMs ? cur : best), hits[0]);
}

/** Builds one health row per installed harness with cooldown / active fallback / healthy status. */
export function providerRows(known = [], cooldowns = [], activeFailovers = []) {
  const list = Array.isArray(known) ? known : [];
  const cds = (Array.isArray(cooldowns) ? cooldowns : []).map(normalizeCooldown).filter(Boolean);
  const fos = (Array.isArray(activeFailovers) ? activeFailovers : []).map(normalizeFailover).filter(Boolean);
  const installed = list.filter((k) => k?.key && k.installed !== false);
  const seen = new Set(list.map((k) => k?.key).filter(Boolean));
  const extra = cds
    .filter((c) => c.harness && !seen.has(c.harness))
    .map((c) => ({ key: c.harness, name: harnessLabel(c.harness) }));
  return [...installed, ...extra].map((h) => buildProviderRow(h, cds, fos));
}

function buildProviderRow(h, cds, fos) {
  const key = String(h.key);
  const label = String(h.name || harnessLabel(key));
  const cd = matchCooldown(key, cds);
  if (cd) {
    const detail = [cd.model, cd.reason || cd.kind].filter(Boolean).join(" · ") || "Cooling down";
    return { key, label, status: "cooldown", detail, remainingText: formatRemaining(cd.remainingMs), cooldownKey: cd.key || key };
  }
  const fo = fos.find((f) => f.to?.harness === key);
  if (fo) {
    const fromName = harnessLabel(fo.from?.harness);
    const detail = [fo.agent ? `Covering ${fo.agent}` : "Active fallback", fromName ? `from ${fromName}` : ""].filter(Boolean).join(" · ");
    return { key, label, status: "active_fallback", detail, remainingText: "", cooldownKey: null };
  }
  return { key, label, status: "healthy", detail: "Ready", remainingText: "", cooldownKey: null };
}

function failoverSummary(failovers, cooldowns) {
  if (failovers.length > 0) {
    const first = failovers[0];
    const toHarness = harnessLabel(first.to?.harness);
    // Another model on the same CLI: the model is what changed, so it is what the strip names.
    const sameCli = Boolean(first.to?.harness) && first.from?.harness === first.to.harness;
    const toName = sameCli && first.to?.model ? [toHarness, first.to.model].filter(Boolean).join(" ") : toHarness || first.to?.model || "fallback";
    const fromKey = first.from?.harness;
    const cd = fromKey ? matchCooldown(fromKey, cooldowns) : null;
    const fromNote = fromKey ? ` (${harnessLabel(fromKey)}${cd ? ` ${formatRemaining(cd.remainingMs)}` : ""})` : "";
    const more = failovers.length > 1 ? ` +${failovers.length - 1}` : "";
    return `Fallback: ${toName}${fromNote}${more}`;
  }
  if (cooldowns.length > 0) {
    const first = cooldowns[0];
    const name = harnessLabel(first.harness || first.key);
    const more = cooldowns.length > 1 ? ` +${cooldowns.length - 1}` : "";
    return `Cooldown: ${name} ${formatRemaining(first.remainingMs)}${more}`;
  }
  return null;
}

function breakerSummary(breaker) {
  if (!breaker) return null;
  if (typeof breaker === "string") return `Breaker: ${breaker}`;
  const text = breaker.reason || breaker.message || breaker.kind || "tripped";
  return `Breaker: ${text}`;
}

/** Computes whether the slim live status strip should show and its exact badge strings. */
export function stripModel(status) {
  const s = normalizeStatus(status);
  const { autonomy } = s.config;
  const { cooldowns, activeFailovers, task } = s;
  const budgetActive = Boolean(task && task.maxTaskSpendUsd > 0 && task.spendUsd > 0 && task.status === "active");
  const visible = autonomy === "autonomous" || activeFailovers.length > 0 || cooldowns.length > 0 || Boolean(task?.breaker) || budgetActive;
  if (!visible) {
    return { visible: false, autonomyLabel: null, failoverText: null, budgetText: null, breakerText: null, canPause: false, canReset: false };
  }
  const hasBudget = Boolean(task && task.maxTaskSpendUsd > 0 && (task.spendUsd > 0 || task.status === "active"));
  return {
    visible: true,
    autonomyLabel: autonomy === "autonomous" ? AUTONOMY_LABELS.autonomous : null,
    failoverText: failoverSummary(activeFailovers, cooldowns),
    budgetText: hasBudget ? `Budget ${formatUsd(task.spendUsd)} / ${formatUsd(task.maxTaskSpendUsd)}` : null,
    breakerText: breakerSummary(task?.breaker),
    canPause: Boolean(task?.id && task.status === "active"),
    canReset: Boolean(cooldowns.length > 0 || activeFailovers.length > 0),
  };
}
