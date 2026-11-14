// A task's timeline, without drawing: its steps with their agent, their time and the events behind
// them; the word an agent's tool line becomes; and how a finished task folds. Pure, so `npm test`
// checks it; tracker.js draws it.
//
// Today's `bh task show --json` has steps (status, agent, workedMs, started, report) and the
// task's `board`; step 14 adds `steps[].events`, `agentName`, `elapsedMs` and the task's `done`/
// `total`. Both shapes are read here, so the switch is this file alone.

/** An event's detail as its row shows it: a file's own name (the mockup's "CHANGELOG.md"), else the text. */
export function shortDetail(detail) {
  const text = String(detail ?? "");
  const cut = text.replace(/[\\/]+$/, "").split(/[\\/]/).pop();
  return cut && cut !== text && /\.[A-Za-z0-9]{1,10}$/.test(cut) ? cut : text;
}

/** The agents a step names: "dev", "dev, qa", "design-toast & qa" or a list. */
export function stepAgents(s) {
  const raw = Array.isArray(s?.agent) ? s.agent : String(s?.agent ?? "").split(/\s*(?:,|&|\+|\band\b)\s*/);
  return [...new Set(raw.map((a) => String(a ?? "").trim()).filter(Boolean))];
}

/** The word an agent's tool line becomes: "Edit src/x" → "Editing", "Run npm test" → "Running tests". */
export function actionWord(line) {
  const text = String(line ?? "").trim();
  if (!text) return "Working";
  const [verb, ...rest] = text.split(/\s+/);
  const what = rest.join(" ");
  if (/^(run|bash|shell)$/i.test(verb)) return /\b(tests?|specs?|vitest|jest|pytest|check|lint)\b/i.test(what) ? "Running tests" : "Running";
  if (/^(edit|write|multiedit|apply)$/i.test(verb)) return "Editing";
  if (/^(read|grep|search|glob|find|list|ls)$/i.test(verb)) return "Reading";
  return "Working";
}

/** A step's time in one short word: "8s", "34s", "12m", "1h 5m"; "" before it started. */
export function stepTime(ms) {
  const s = Math.floor((Number(ms) || 0) / 1000);
  if (s < 1) return "";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/**
 * What a task or a step cost, in one line: "12.4k tokens · $1.23 · 38 min". A part that is 0 or
 * missing is left out (a harness that reports no tokens shows minutes only); "" when there is none.
 */
export function usageText(u) {
  const tokens = Number(u?.tokens) || 0;
  const cost = Number(u?.costUsd) || 0;
  const minutes = Math.round(Number(u?.minutes) || 0);
  return [
    tokens > 0 ? `${tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens)} tokens` : "",
    cost > 0 ? `$${cost.toFixed(2)}` : "",
    minutes > 0 ? `${minutes} min` : "",
  ].filter(Boolean).join(" · ");
}

/** A step's events: the ones step 14 gives, else the report and the board posts on that step. */
export function stepEvents(s, board = []) {
  if (Array.isArray(s?.events)) return s.events;
  const out = [];
  if (s?.report?.file) out.push({ at: s.report.at, kind: "report", text: s.report.summary ?? s.report.file, detail: s.report.file, from: s.report.from });
  for (const e of board ?? []) {
    if (e?.step !== s?.n) continue;
    out.push({ at: e.at, kind: "board", text: e.text, detail: e.kind, from: e.from });
  }
  return out.sort((a, b) => String(a.at ?? "").localeCompare(String(b.at ?? "")));
}

/**
 * A step's time: its recorded ms (`timeMs`, else `elapsedMs`, else `workedMs`), plus the part of
 * the turn its agent is in right now. `working` maps an agent's lower-case name to that turn's start.
 */
function stepWorked(s, agentName, now, working) {
  const base = Number.isFinite(s.timeMs) ? s.timeMs : Number.isFinite(s.elapsedMs) ? s.elapsedMs : (s.workedMs ?? 0);
  const since = (working ?? {})[String(agentName ?? "").toLowerCase()];
  if (s.status !== "active" || !Number.isFinite(since)) return base;
  return base + Math.max(0, now - since);
}

/** What a task worked: the engine's own turn total, else its `worked`, else the steps' times added up. */
function taskWorked(task, steps) {
  if (Number.isFinite(task?.timeMs)) return task.timeMs;
  if (Number.isFinite(task?.worked)) return task.worked;
  return steps.reduce((n, s) => n + s.ms, 0);
}

/** One step as the tracker draws it: its agent, its time, whether it needs you, and its events. */
function stepRow(s, board, now, asking, working) {
  const agentName = s.agentName ?? stepAgents(s)[0] ?? null;
  const active = s.status === "active";
  const ms = stepWorked(s, agentName, now, working);
  return {
    n: s.n,
    title: s.title ?? `Step ${s.n}`,
    status: s.status ?? "todo",
    agentName,
    active,
    done: s.status === "done" || s.status === "skipped",
    needs: s.status === "blocked" || Boolean(agentName && asking.has(String(agentName).toLowerCase())),
    ms,
    time: stepTime(ms),
    events: stepEvents(s, board),
  };
}

/**
 * A task as the tracker shows it: its steps in order, how many are done, the agents at work, its
 * total time and what it cost. `asking` holds the agents with a question open for the user;
 * `working` maps an agent working now to when its current turn started.
 */
export function trackerModel(task, { now = Date.now(), asking = [], working = {} } = {}) {
  const asks = new Set((asking ?? []).map((a) => String(a).toLowerCase()));
  const steps = (Array.isArray(task?.steps) ? task.steps : []).map((s) => stepRow(s, task?.board, now, asks, working));
  const worked = taskWorked(task, steps);
  return {
    id: task?.id ?? null,
    title: task?.title ?? task?.id ?? "Task",
    status: task?.status ?? "backlog",
    done: Number.isFinite(task?.done) ? task.done : steps.filter((s) => s.done).length,
    total: Number.isFinite(task?.total) ? task.total : steps.length,
    worked,
    time: stepTime(worked),
    usage: task?.usage ?? null,
    working: [...new Set(steps.filter((s) => s.active && s.agentName).map((s) => s.agentName))],
    steps,
  };
}

/** Whether a task's card folds to one line: it is finished. */
export const trackerFolds = (task) => task?.status === "done" || task?.status === "abandoned";

/** The rail's TASKS rows: one per task, its title and how far it got. */
export function taskRows(tasks, now = Date.now()) {
  return (tasks ?? []).map((t) => {
    const m = trackerModel(t, { now });
    return { id: t.id, title: m.title, done: m.done, total: m.total, status: m.status };
  });
}
