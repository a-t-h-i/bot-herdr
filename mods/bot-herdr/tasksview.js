// Pure view-model helpers for the Tasks workbench (mods/bot-herdr/work.js).
// Zero gpui-kit, gpui-base, herdr, or Intl imports so `node --test` imports and verifies
// every state transition, filter, grouping, progress model, and terminal lookup directly.

export const DETAIL_TABS = ["steps", "iterations", "board", "comments", "plan"];
export const STATUS_CHIPS = ["active", "blocked", "done", "archived"];
export const BOARD_KINDS = ["all", "contract", "decision", "blocker", "question", "done", "note"];
export const SETTINGS_GRID_BREAKPOINT = 860;
export const GOAL_START_PRESETS = [
  { id: "standard", label: "Start as goal — Standard", hint: "$15 spend cap · relentless verify", maxSpendUsd: 15 },
  { id: "deep", label: "Start as goal — Deep", hint: "$40 spend cap · extended research", maxSpendUsd: 40 },
];

/** Responsive column count for Settings → General and Settings → Resilience card grids. */
export function settingsGridColumns(width) {
  return Number(width) >= SETTINGS_GRID_BREAKPOINT ? 2 : 1;
}

const OPEN_STATUSES = ["active", "paused", "backlog"];
const DONE_STATUSES = ["done", "abandoned"];

/** Splits an agent string or array into unique non-empty agent names. */
function splitAgents(raw) {
  const list = Array.isArray(raw) ? raw : String(raw ?? "").split(/\s*(?:,|&|\+|\band\b)\s*/);
  return [...new Set(list.map((a) => String(a ?? "").trim()).filter(Boolean))];
}

/** Extracts the latest QA gate verdict from a summary or full task record. */
function normalizeGate(t) {
  const g = t?.latestGate ?? (Array.isArray(t?.gates) && t.gates.length ? t.gates[t.gates.length - 1] : null);
  if (!g || typeof g !== "object" || !g.verdict) return null;
  const round = Number(g.round);
  return { verdict: String(g.verdict).toUpperCase(), round: Number.isFinite(round) && round > 0 ? round : 1 };
}

/**
 * Normalizes both lightweight `bh task list --summary` records and full legacy `bh task list`
 * records into one consistent summary shape.
 */
export function taskSummaryFallback(t) {
  const steps = Array.isArray(t?.steps) ? t.steps : [];
  const status = String(t?.status ?? "backlog");
  const done = Number.isFinite(t?.done) ? t.done : steps.filter((s) => s?.status === "done" || s?.status === "skipped").length;
  const total = Number.isFinite(t?.total) ? t.total : steps.length;
  const blocked = Number.isFinite(t?.blocked) ? t.blocked : steps.filter((s) => s?.status === "blocked").length;
  const openComments = Number.isFinite(t?.openComments)
    ? t.openComments
    : (Array.isArray(t?.comments) ? t.comments.filter((c) => c?.open !== false).length : 0);
  const activeAgents = Array.isArray(t?.activeAgents)
    ? [...new Set(t.activeAgents.map((a) => String(a ?? "").trim()).filter(Boolean))]
    : [...new Set(steps.filter((s) => s?.status === "active").flatMap((s) => splitAgents(s.agentName ?? s.agent)))];
  const workedMs = Number.isFinite(t?.workedMs)
    ? t.workedMs
    : (Number.isFinite(t?.timeMs) ? t.timeMs : steps.reduce((sum, s) => sum + (Number(s?.timeMs ?? s?.workedMs) || 0), 0));
  const latestGate = normalizeGate(t);
  const mode = t?.mode === "goal" ? "goal" : "task";
  const rawCriteria = Array.isArray(t?.goal?.criteria) ? t.goal.criteria : [];
  const goal = mode === "goal" && t?.goal
    ? {
        status: String(t.goal.status ?? "running"),
        done: Number.isFinite(t.goal.done) ? t.goal.done : rawCriteria.filter((c) => c?.verdict === "PASS").length,
        total: Number.isFinite(t.goal.total) ? t.goal.total : rawCriteria.length,
        iteration: Number(t.goal.iteration ?? 0) || 0,
        maxSpendUsd: Number(t.goal.maxSpendUsd ?? 0) || null,
        pendingAmendment: Boolean(t.goal.pendingAmendment),
      }
    : null;
  const github = t?.github
    ? {
        repo: t.github.repo ?? null,
        issues: Array.isArray(t.github.issues) ? t.github.issues.map((i) => (typeof i === "object" ? i.number : i)).filter(Boolean) : [],
        prNumber: t.github.prNumber ?? null,
        prUrl: t.github.prUrl ?? null,
      }
    : null;
  return {
    id: String(t?.id ?? ""),
    title: String(t?.title || t?.id || ""),
    status,
    mode,
    goal,
    github,
    archived: Boolean(t?.archived),
    track: t?.track ?? null,
    plan: t?.plan ?? null,
    created: t?.created ?? null,
    updated: t?.updated ?? t?.created ?? null,
    done,
    total,
    blocked,
    openComments,
    needsYou: typeof t?.needsYou === "boolean"
      ? t.needsYou
      : Boolean(status === "paused" || blocked > 0 || openComments > 0 || latestGate?.verdict === "CHANGES_REQUIRED" || latestGate?.verdict === "BLOCKED" || Boolean(goal?.pendingAmendment) || goal?.status === "paused"),
    running: typeof t?.running === "boolean"
      ? t.running
      : Boolean(status === "active" && (steps.some((s) => s?.status === "active") || !steps.length || goal?.status === "running")),
    activeAgents,
    spendUsd: Number.isFinite(t?.spendUsd) ? t.spendUsd : (Number(t?.usage?.costUsd) || 0),
    workedMs,
    latestGate,
  };
}

/** Whether a task matches a given status chip. */
function matchesChip(t, chip) {
  const status = String(t?.status ?? "backlog");
  const archived = Boolean(t?.archived);
  if (chip === "all" || !chip) return true;
  if (chip === "archived") return archived;
  if (archived) return false;
  if (chip === "active") return OPEN_STATUSES.includes(status);
  if (chip === "blocked") return (Number(t?.blocked) || 0) > 0 || status === "paused" || Boolean(t?.needsYou);
  if (chip === "done") return DONE_STATUSES.includes(status);
  return true;
}

/** Counts tasks across each status filter chip: `{ active, blocked, done, archived }`. */
export function chipCounts(tasks) {
  const counts = { active: 0, blocked: 0, done: 0, archived: 0 };
  for (const t of tasks ?? []) {
    if (!t) continue;
    for (const chip of STATUS_CHIPS) {
      if (matchesChip(t, chip)) counts[chip]++;
    }
  }
  return counts;
}

/** Filters tasks by chip (`active` | `blocked` | `done` | `archived` | `all`) and substring query. */
export function filterTasks(tasks, { query = "", chip = "active" } = {}) {
  const q = String(query ?? "").trim().toLowerCase();
  return (tasks ?? []).filter((t) => {
    if (!t || !matchesChip(t, chip)) return false;
    if (!q) return true;
    const agents = Array.isArray(t.activeAgents) ? t.activeAgents.join(" ") : "";
    const hay = `${t.title ?? ""} ${t.id ?? ""} ${t.track ?? ""} ${agents}`.toLowerCase();
    return hay.includes(q);
  });
}

/** Groups filtered tasks into labelled sections (`[{ id, label, items }]`), omitting empty headers. */
export function groupTasks(tasks, chip = "active") {
  const list = Array.isArray(tasks) ? tasks : [];
  if (!list.length) return [];
  if (chip === "blocked") return [{ id: "blocked", label: "Blocked", items: list }];
  if (chip === "done") return [{ id: "done", label: "Finished", items: list }];
  if (chip === "archived") return [{ id: "archived", label: "Archived", items: list }];
  const open = list.filter((t) => !t?.archived && OPEN_STATUSES.includes(String(t?.status ?? "backlog")));
  const done = list.filter((t) => !t?.archived && DONE_STATUSES.includes(String(t?.status ?? "backlog")));
  const archived = list.filter((t) => Boolean(t?.archived));
  return [
    { id: "open", label: "Under way", items: open },
    { id: "done", label: "Finished", items: done },
    { id: "archived", label: "Archived", items: archived },
  ].filter((g) => g.items.length > 0);
}

/** Compact progress bar model: `{ done, total, pct, tone, label }`. */
export function progressModel(task) {
  const steps = Array.isArray(task?.steps) ? task.steps : [];
  const done = Number.isFinite(task?.done) ? task.done : steps.filter((s) => s?.status === "done" || s?.status === "skipped").length;
  const total = Number.isFinite(task?.total) ? task.total : steps.length;
  const pct = total > 0 ? Math.max(0, Math.min(100, Math.round((done / total) * 100))) : (task?.status === "done" ? 100 : 0);
  const blocked = (Number(task?.blocked) || 0) > 0 || steps.some((s) => s?.status === "blocked") || task?.status === "paused";
  let tone = "muted";
  if (task?.status === "done" || (total > 0 && done >= total)) tone = "success";
  else if (blocked) tone = "warning";
  else if (task?.status === "abandoned") tone = "muted";
  else if (task?.status === "active" || done > 0) tone = "accent";
  return { done, total, pct, tone, label: `${done}/${total}` };
}

/** Formats the latest QA gate into `{ label: "QA: PASS (r2)", tone }` or null. */
export function gateBadge(task) {
  const g = normalizeGate(task);
  if (!g) return null;
  const tone = g.verdict === "PASS" ? "success" : g.verdict === "BLOCKED" ? "danger" : "warning";
  return { label: `QA: ${g.verdict} (r${g.round})`, tone };
}

/** Uses engine-supplied `allowedActions` when present, else derives them from status and archived. */
export function allowedActionsFallback(task) {
  if (task?.allowedActions && typeof task.allowedActions === "object") {
    const a = task.allowedActions;
    return {
      pause: Boolean(a.pause),
      resume: Boolean(a.resume),
      done: Boolean(a.done),
      verify: Boolean(a.verify),
      archive: Boolean(a.archive),
      unarchive: Boolean(a.unarchive),
      delete: Boolean(a.delete),
    };
  }
  const status = String(task?.status ?? "backlog");
  const archived = Boolean(task?.archived);
  const isGoal = task?.mode === "goal";
  return {
    pause: status === "active",
    resume: status === "paused" || status === "backlog",
    done: isGoal
      ? Boolean((status === "active" || status === "paused") && task?.goal?.status === "reached")
      : status === "active" || status === "paused",
    verify: Boolean(isGoal && status !== "done" && status !== "abandoned"),
    archive: !archived && status !== "active",
    unarchive: archived,
    delete: status !== "active",
  };
}

/** Goal progress view-model for inline row badges and the collapsible pinned DONE criteria strip. */
export function goalProgressModel(task) {
  if (task?.mode !== "goal" || !task?.goal) return null;
  const g = task.goal;
  const criteria = Array.isArray(g.criteria) ? g.criteria : [];
  const done = Number.isFinite(g.done) ? g.done : criteria.filter((c) => c?.verdict === "PASS").length;
  const total = Number.isFinite(g.total) ? g.total : criteria.length;
  const pct = total > 0 ? Math.max(0, Math.min(100, Math.round((done / total) * 100))) : 0;
  const status = String(g.status ?? "running");
  let tone = "accent";
  if (status === "reached" || (total > 0 && done >= total)) tone = "success";
  else if (status === "paused" || g.pendingAmendment) tone = "warning";
  else if (status === "waiting") tone = "info";
  else if (status === "stopped") tone = "muted";
  const iteration = Number(g.iteration ?? 0) || 0;
  return {
    isGoal: true,
    status,
    done,
    total,
    pct,
    iteration,
    maxSpendUsd: Number(g.maxSpendUsd ?? 0) || null,
    awaitingQa: Boolean(g.awaitingQa),
    pendingAmendment: g.pendingAmendment ?? null,
    tone,
    label: `${done}/${total} DONE${iteration > 0 ? ` · iter ${iteration}` : ""}`,
  };
}

/** Display badge metadata for a single DONE criterion verdict. */
export function goalCriterionBadge(c) {
  const v = String(c?.verdict ?? "").toUpperCase();
  if (v === "PASS") return { icon: "✓", tone: "success", label: "PASS" };
  if (v === "PENDING") return { icon: "…", tone: "info", label: "PENDING" };
  if (v === "FAIL") return { icon: "✗", tone: "danger", label: "FAIL" };
  return { icon: "○", tone: "muted", label: "UNCHECKED" };
}

/** The status chip a task belongs under: `archived`, `done` (done or abandoned), else `active`. */
export function chipForTask(task) {
  if (task?.archived) return "archived";
  if (task?.status === "done" || task?.status === "abandoned") return "done";
  return "active";
}

/**
 * What a chip click opens: the first match on a wide window unless the open task is still listed;
 * none on a narrow one, where the filtered list itself is what the user wants to see.
 */
export function nextOpenedOnChip(filtered, currentOpened, isNarrow) {
  const list = Array.isArray(filtered) ? filtered.filter(Boolean) : [];
  if (isNarrow || !list.length) return null;
  return list.some((t) => t.id === currentOpened) ? null : list[0].id;
}

/** Returns the interactive state transition actions for one step. */
export function stepActions(step) {
  const status = String(step?.status ?? "todo");
  if (status === "done" || status === "skipped") {
    return [{ id: "reopen", label: "Reopen", to: "todo", tone: "secondary" }];
  }
  if (status === "active") {
    return [
      { id: "done", label: "Mark done", to: "done", tone: "secondary" },
      { id: "block", label: "Block", to: "block", tone: "secondary" },
      { id: "skip", label: "Skip", to: "skip", tone: "quiet" },
    ];
  }
  if (status === "blocked") {
    return [
      { id: "resume", label: "Resume", to: "start", tone: "secondary" },
      { id: "done", label: "Mark done", to: "done", tone: "secondary" },
      { id: "skip", label: "Skip", to: "skip", tone: "quiet" },
    ];
  }
  return [
    { id: "start", label: "Start", to: "start", tone: "secondary" },
    { id: "done", label: "Mark done", to: "done", tone: "secondary" },
    { id: "block", label: "Block", to: "block", tone: "secondary" },
    { id: "skip", label: "Skip", to: "skip", tone: "quiet" },
  ];
}

/**
 * Finds a matching live terminal for a step by open child name, `step.agentName`, or `step.agent`.
 * Returns `{ id, name } | null` where `id` is `address ?? id`.
 */
export function terminalForStep(step, children = [], liveTerminals = []) {
  if (!step || !Array.isArray(liveTerminals) || !liveTerminals.length) return null;
  const live = liveTerminals.filter((t) => t && (t.state === undefined || t.state === "live"));
  if (!live.length) return null;
  const openKids = (children ?? []).filter((c) => c?.step === step.n && c?.state === "open").map((c) => c.name);
  const anyKids = (children ?? []).filter((c) => c?.step === step.n).map((c) => c.name);
  const candidates = [...new Set([
    ...openKids,
    ...anyKids,
    ...(step.agentName ? [step.agentName] : []),
    ...splitAgents(step.agent),
  ].map((s) => String(s ?? "").trim().toLowerCase()).filter(Boolean))];
  for (const cand of candidates) {
    const match = live.find((t) => {
      const name = String(t.name ?? t.tab_name ?? "").trim().toLowerCase();
      return name === cand;
    });
    if (match) {
      const id = String(match.address ?? match.id ?? "");
      if (id) return { id, name: String(match.name ?? match.tab_name ?? cand) };
    }
  }
  return null;
}

/** Counts shown on the detail tab strip: `{ stepsText, boardCount, commentsCount, openCommentsCount, hasPlan }`. */
export function detailTabCounts(detail) {
  const steps = Array.isArray(detail?.steps) ? detail.steps : [];
  const done = Number.isFinite(detail?.done) ? detail.done : steps.filter((s) => s?.status === "done" || s?.status === "skipped").length;
  const total = Number.isFinite(detail?.total) ? detail.total : steps.length;
  const comments = Array.isArray(detail?.comments) ? detail.comments : [];
  const isGoal = detail?.mode === "goal";
  const iterationsCount = Array.isArray(detail?.iterations)
    ? detail.iterations.length
    : Number(detail?.goal?.iteration ?? 0) || 0;
  return {
    stepsText: `${done}/${total}`,
    isGoal,
    iterationsCount,
    boardCount: Array.isArray(detail?.board) ? detail.board.length : 0,
    commentsCount: comments.length,
    openCommentsCount: comments.filter((c) => c?.open !== false).length,
    hasPlan: Boolean(detail?.plan),
  };
}

/** Filters board entries by kind and computes counts per kind (`{ items, counts }`). */
export function filterBoard(entries = [], kind = "all") {
  const list = Array.isArray(entries) ? entries.filter(Boolean) : [];
  const counts = { all: list.length, contract: 0, decision: 0, blocker: 0, question: 0, done: 0, note: 0 };
  for (const e of list) {
    const k = String(e.kind ?? "note").toLowerCase();
    if (k in counts) counts[k]++;
  }
  const want = String(kind ?? "all").toLowerCase();
  const items = want === "all" ? list : list.filter((e) => String(e.kind ?? "note").toLowerCase() === want);
  return { items, counts };
}

/**
 * Pure state machine for queued refresh: a reload requested while `busy === true` is never dropped;
 * `queued` coalesces concurrent requests into a single follow-up reload on `finish`.
 */
export function nextRefreshAction(state = { busy: false, queued: false }, event = "start") {
  const busy = Boolean(state?.busy);
  const queued = Boolean(state?.queued);
  if (event === "start" || event === "queue") {
    if (!busy) return { state: { busy: true, queued: false }, action: "run" };
    return { state: { busy: true, queued: true }, action: "defer" };
  }
  if (event === "finish") {
    if (queued) return { state: { busy: false, queued: false }, action: "rerun" };
    return { state: { busy: false, queued: false }, action: "idle" };
  }
  return { state: { busy, queued }, action: "idle" };
}

/** Formats USD cost cleanly without Intl; returns "" when zero or invalid. */
export function formatUsd(usd) {
  const n = Number(usd);
  return Number.isFinite(n) && n > 0 ? `$${n.toFixed(2)}` : "";
}

/** Formats worked milliseconds into compact text (`<1m`, `24m`, `1h 2m`); "" when <= 0. */
export function formatWorked(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return "";
  const m = Math.floor(n / 60000);
  if (m < 1) return "<1m";
  const h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}m`;
}

/** Tone token name for a step timeline event (`check`, `board`, `report`, `merge`). */
export function stepEventTone(ev) {
  const kind = String(ev?.kind ?? "").toLowerCase();
  if (kind === "check") return /fail/i.test(String(ev?.text ?? "")) ? "danger" : "success";
  if (kind === "report") return "accent";
  if (kind === "board") {
    const d = String(ev?.detail ?? "").toLowerCase();
    if (d === "blocker" || d === "question") return "warning";
    if (d === "done") return "success";
    if (d === "contract" || d === "decision") return "accent";
    return "muted";
  }
  return "muted";
}

/** The friendly line for a stale `--if-updated` write (an engine `Conflict:` payload says it exactly). */
const STALE_WRITE = "Task changed elsewhere. Refreshed — please try again.";

/** A JSON payload the failed `bh` call printed (stdout first, then stderr), or null. */
function jsonPayload(result) {
  for (const chunk of [result?.stdout, result?.stderr]) {
    const text = String(chunk ?? "").trim();
    if (!text.startsWith("{")) continue;
    try {
      return JSON.parse(text);
    } catch {
      // plain text, not a payload
    }
  }
  return null;
}

/** The first line of a bh error, without its `bh: ` prefix. */
const errorLine = (text) => String(text ?? "").trim().split("\n")[0].trim().replace(/^bh:\s*/i, "");

/**
 * Reads a failed mutation as `{ conflict, message }`: only a `--json` payload with `conflict: true`
 * (or the engine's own `Conflict: task …` line) is a stale write. A git error that merely mentions
 * "conflict files" is a plain error with its own message.
 */
export function mutationError(result) {
  if (!result || result.code === 0) return { conflict: false, message: "" };
  const parsed = jsonPayload(result);
  if (parsed?.conflict === true) return { conflict: true, message: parsed.error || STALE_WRITE };
  const line = errorLine(result.stderr) || errorLine(result.stdout);
  if (/^Conflict:\s*task\b/i.test(line)) return { conflict: true, message: STALE_WRITE };
  return { conflict: false, message: line };
}

/** Detects a `--if-updated` stale-write conflict from a `bh` CLI result. */
export function conflictMessage(result) {
  const { conflict, message } = mutationError(result);
  return conflict ? message : null;
}

/**
 * A task's skills as one line: `{ [agent]: { picked, added } }` (older records may hold an array)
 * becomes `dev: docx, pdf · qa: audit`, leaving out agents with none.
 */
export function formatTaskSkills(skills) {
  if (!skills || typeof skills !== "object") return "";
  const names = (list) => [...new Set((Array.isArray(list) ? list : []).map((s) => String(s ?? "").trim()).filter(Boolean))];
  if (Array.isArray(skills)) return names(skills).join(", ");
  const parts = [];
  for (const [agent, value] of Object.entries(skills)) {
    const list = Array.isArray(value) ? names(value) : names([...(value?.picked ?? []), ...(value?.added ?? [])]);
    if (list.length) parts.push(`${agent}: ${list.join(", ")}`);
  }
  return parts.join(" · ");
}
