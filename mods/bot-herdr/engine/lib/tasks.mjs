// Tasks and their boards. A task is a request the Orchestrator took on: its steps (the user's
// checklist), who works on each and for how long, the classifier's read, and a board where the
// agents post contracts, decisions, blockers, questions and what they finished.
//
// .bot-herdr/tasks/<id>/task.json, board.jsonl, reports/

import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { appendJsonl, listDir, newId, now, readJson, readJsonl, store, titleFrom, withLock, writeJson } from "./core.mjs";
import { runGit } from "./workspace.mjs";

export const STATUSES = ["backlog", "active", "paused", "done", "abandoned"];
export const STEP_STATUSES = ["todo", "active", "done", "blocked", "skipped"];
export const BOARD_KINDS = ["contract", "decision", "blocker", "question", "done", "note"];

const dir = (root, id) => store(root, "tasks", id);
const file = (root, id) => join(dir(root, id), "task.json");

export function loadTask(root, id) {
  const task = readJson(file(root, id));
  if (!task) throw new Error(`No task ${id}. \`bh task list\` shows them.`);
  return task;
}

export function saveTask(root, task) {
  task.updated = now();
  writeJson(file(root, task.id), task);
  return task;
}

/**
 * Changes one task under its lock: loaded fresh, changed, saved. Returns what `change` returned.
 * Two commands changing one task at once never lose an update.
 */
export function updateTask(root, id, change) {
  return withLock(file(root, id), () => {
    const task = loadTask(root, id);
    const result = change(task);
    saveTask(root, task);
    return result;
  });
}

/** A task with usage and time worked on it and on each of its steps, as `bh task show` gives it (the task page reads the list). */
function withUsage(root, task) {
  const usage = usageOf(root, task.id);
  const steps = (task.steps ?? []).map((s) => ({ ...s, timeMs: usage.length ? stepTime(usage, s.n) : (s.workedMs ?? 0), usage: usageTotals(usage.filter((r) => r.step === s.n)) }));
  return { ...task, steps, usage: usageTotals(usage), timeMs: worked(root, task) };
}

export function listTasks(root, { all = false } = {}) {
  return listDir(store(root, "tasks"))
    .filter((d) => d.isDirectory())
    .map((d) => readJson(join(store(root, "tasks"), d.name, "task.json")))
    .filter((t) => t && (all || !t.archived))
    .sort((a, b) => String(b.updated).localeCompare(String(a.updated)))
    .map((t) => withUsage(root, t));
}

/** The task a bare `bh task …` means: the newest active one, else the newest. */
export function currentTask(root) {
  const tasks = listTasks(root);
  return tasks.find((t) => t.status === "active") ?? tasks[0] ?? null;
}

export function newTask(root, { request, title, plan = null, track = "full", by = null, steps = [] }) {
  const task = {
    id: newId("t"),
    title: title?.trim() || titleFrom(request),
    request: String(request ?? "").trim(),
    status: "active",
    track,
    plan,
    by,
    created: now(),
    updated: now(),
    archived: false,
    steps: [],
    triage: null,
    qa: null,
    summary: "",
  };
  setSteps(task, steps);
  return saveTask(root, task);
}

/** Replaces the step list, keeping what is known about steps whose words did not change. */
export function setSteps(task, titles) {
  const old = task.steps ?? [];
  task.steps = titles.map((title, i) => {
    const same = old.find((s) => s.title === title);
    return same ? { ...same, n: i + 1 } : { n: i + 1, title, agent: null, status: "todo", started: null, finished: null, workedMs: 0, note: "" };
  });
  return task;
}

/** The `## Steps` list of a plan (numbered lines), as plain step titles. */
export function stepsFromMarkdown(md) {
  const text = String(md ?? "");
  const at = text.search(/^#{2,3}\s+Steps\s*$/im);
  const from = at >= 0 ? text.slice(at).split("\n").slice(1) : text.split("\n");
  const steps = [];
  for (const line of from) {
    if (/^#{1,3}\s/.test(line) && steps.length) break;
    const m = /^\s*\d+[.)]\s+(.+?)\s*$/.exec(line);
    if (m) steps.push(m[1].replace(/\*\*/g, ""));
  }
  return steps;
}

/** Moves a step on: start, done, block, skip or todo. Time worked counts only while active. */
export function moveStep(task, n, to, { agent, note } = {}) {
  const step = task.steps.find((s) => s.n === Number(n));
  if (!step) throw new Error(`Task ${task.id} has no step ${n}. It has ${task.steps.length}.`);
  const map = { start: "active", done: "done", block: "blocked", skip: "skipped", todo: "todo" };
  const status = map[to] ?? to;
  if (!STEP_STATUSES.includes(status)) throw new Error(`A step can be: start, done, block, skip, todo.`);
  const t = now();
  if (step.status === "active" && status !== "active" && step.started) step.workedMs = (step.workedMs ?? 0) + (Date.parse(t) - Date.parse(step.started));
  if (status === "active") step.started = t;
  if (status === "done" || status === "skipped") step.finished = t;
  step.status = status;
  if (agent) step.agent = agent;
  if (note) step.note = note;
  if (status === "active" && task.status !== "active") task.status = "active";
  return step;
}

export function setStatus(task, status) {
  if (!STATUSES.includes(status)) throw new Error(`A task can be: ${STATUSES.join(", ")}.`);
  task.status = status;
  if (status !== "active") {
    for (const s of task.steps) if (s.status === "active") moveStep(task, s.n, "todo");
  }
  return task;
}

/**
 * Deletes a task's folder, for `bh task delete`. Not while it is active. Its worktree goes first, with
 * git's own check: git refuses when the worktree holds changes, and then nothing is deleted. Its
 * branch is kept. Returns { deleted, branch }.
 */
export function deleteTask(root, id) {
  if (!/^[\w-]+$/.test(String(id))) throw new Error(`No task ${id}. \`bh task list\` shows them.`);
  const task = loadTask(root, id);
  if (task.status === "active") throw new Error(`${id} is active: pause or finish it first.`);
  const g = task.git;
  if (g?.mode === "worktree" && g.path && existsSync(g.path)) removeWorktree(root, g.path);
  rmSync(dir(root, id), { recursive: true, force: true });
  return { deleted: id, branch: g?.branch ?? null };
}

function removeWorktree(root, path) {
  try {
    runGit(root, ["worktree", "remove", path]);
  } catch (e) {
    throw new Error(`${e.message}\nCommit or discard its changes, then delete it again.`);
  }
}

/** One usage record's turn as [start, end] in ms, or null when it records no usable time. */
const turnSpan = (r) => {
  const end = Date.parse(r.at);
  return Number.isFinite(r.ms) && Number.isFinite(end) ? [end - r.ms, end] : null;
};

/** How long one step's turns took, in ms: the turns recorded on it, added up (parallel ones twice). */
export function stepTime(records, step) {
  return records.filter((r) => Number(r.step) === Number(step)).reduce((sum, r) => sum + (turnSpan(r) ? r.ms : 0), 0);
}

/** How long a task's turns took, in ms: their intervals merged, so turns that overlap count once. */
export function taskTime(records) {
  const spans = records.map(turnSpan).filter(Boolean).sort((a, b) => a[0] - b[0]);
  let [total, to] = [0, -Infinity];
  for (const [start, end] of spans) {
    if (end > Math.max(start, to)) total += end - Math.max(start, to);
    to = Math.max(to, end);
  }
  return total;
}

/** How long agents have worked on a task, in ms: its turns when it has any, else what its steps stored. */
export function worked(root, task) {
  const records = usageOf(root, task.id);
  return records.length ? taskTime(records) : (task.steps ?? []).reduce((sum, s) => sum + (s.workedMs ?? 0), 0);
}

export function post(root, id, { kind, text, from = null, to = null, step = null, file = null }) {
  if (!BOARD_KINDS.includes(kind)) throw new Error(`A board post is one of: ${BOARD_KINDS.join(", ")}.`);
  const path = join(dir(root, id), "board.jsonl");
  return withLock(path, () => {
    const entry = { n: board(root, id).length + 1, at: now(), kind, from, to, text: String(text ?? "").trim() };
    // A report's entry names its step (null when it has none) and its file; other kinds keep their shape.
    if (file !== null || step !== null) Object.assign(entry, { step, file });
    appendJsonl(path, entry);
    return entry;
  });
}

/** A board entry as `bh board read` prints it. */
export const boardLine = (e) => `${e.n}. [${e.kind}]${e.from ? ` ${e.from}` : ""}${e.to ? ` → ${e.to}` : ""}: ${e.text}`;

/** A child's report: an entry on the board (the record) and, for a step, its own report on the task. */
export function report(root, id, { step = null, summary, file, from = null, to = null }) {
  const text = String(summary ?? "").trim();
  if (!text) throw new Error("A report needs a one-line summary.");
  const n = step === null || step === undefined ? null : Number(step);
  updateTask(root, id, (t) => {
    if (n === null) return;
    const s = t.steps.find((x) => x.n === n);
    if (!s) throw new Error(`Task ${t.id} has no step ${step}. It has ${t.steps.length}.`);
    stopClock(s, now());
    s.report = { file, summary: text, from, at: now() };
  });
  return post(root, id, { kind: "done", text, from, to, step: n, file });
}

/** Ends a step's running clock, keeping its status: only the Orchestrator marks a step done. */
function stopClock(step, at) {
  if (step.status !== "active" || !step.started) return;
  step.workedMs = (step.workedMs ?? 0) + (Date.parse(at) - Date.parse(step.started));
  step.started = null;
}

export function board(root, id, { kinds = null, since = 0 } = {}) {
  return readJsonl(join(dir(root, id), "board.jsonl")).filter((e) => e.n > since && (!kinds || kinds.includes(e.kind)));
}

/** The user's comment on a task, or on one of its steps (`step`, its number). */
export function comment(task, { step = null, text }) {
  const n = step === null || step === undefined ? null : Number(step);
  if (n !== null && !task.steps.some((s) => s.n === n)) throw new Error(`Task ${task.id} has no step ${step}. It has ${task.steps.length}.`);
  const words = String(text ?? "").trim();
  if (!words) throw new Error("A comment needs words.");
  const c = { id: nextCommentId(task.comments), step: n, quote: n === null ? "" : task.steps.find((s) => s.n === n).title, text: words, at: now(), open: true };
  task.comments = [...(task.comments ?? []), c];
  return c;
}

export const openComments = (task) => (task.comments ?? []).filter((c) => c.open);

/** The next comment id: one past the highest `c<number>`, so ids stay unique after a delete. */
export const nextCommentId = (comments = []) => `c${Math.max(0, ...comments.map((c) => Number(/^c(\d+)$/.exec(c.id ?? "")?.[1] ?? 0))) + 1}`;

/** The comment with this id, or an error naming its owner (`Task t-… has no comment c9.`). */
export function commentById(comments, id, owner) {
  const c = (comments ?? []).find((x) => x.id === id);
  if (!c) throw new Error(`${owner} has no comment ${id}.`);
  return c;
}

/** New words for a comment; it opens again so the agents see the change. */
export function changeComment(comments, id, text, owner) {
  const c = commentById(comments, id, owner);
  const words = String(text ?? "").trim();
  if (!words) throw new Error("A comment needs words.");
  return Object.assign(c, { text: words, edited: now(), open: true });
}

export const editComment = (task, id, text) => changeComment(task.comments, id, text, `Task ${task.id}`);

export function resolveComment(task, id) {
  const c = commentById(task.comments, id, `Task ${task.id}`);
  c.open = false;
  return c;
}

export function deleteComment(task, id) {
  const c = commentById(task.comments, id, `Task ${task.id}`);
  task.comments = task.comments.filter((x) => x !== c);
  return c;
}

export const reportsDir = (root, id) => join(dir(root, id), "reports");

/** One `bh check` run, kept on the task: what ran, on which tree, and its exit (the QA gate reads these). */
export function recordCheck(root, id, receipt) {
  const path = join(dir(root, id), "checks.jsonl");
  return withLock(path, () => {
    appendJsonl(path, receipt);
    return receipt;
  });
}

/** The runs `bh check` kept for a task, oldest first. */
export function checks(root, id) {
  return readJsonl(join(dir(root, id), "checks.jsonl"));
}

/** One turn's usage, kept on the task: what it cost and how long it ran. */
export function recordUsage(root, id, record) {
  const path = join(dir(root, id), "usage.jsonl");
  return withLock(path, () => {
    appendJsonl(path, record);
    return record;
  });
}

/** The turns recorded for a task, oldest first. */
export const usageOf = (root, id) => readJsonl(join(dir(root, id), "usage.jsonl"));

/** Tokens, cost and minutes over some usage records. */
export function usageTotals(list) {
  const sum = (key) => list.reduce((n, r) => n + (Number(r[key]) || 0), 0);
  return { tokens: sum("input") + sum("output") + sum("cacheRead") + sum("cacheWrite"), costUsd: Number(sum("costUsd").toFixed(4)), minutes: Number((sum("ms") / 60000).toFixed(2)) };
}

/** `3/4 tests`, plus `, full suite` when the check ran the whole suite. */
function checkDetail(r) {
  const c = r.counts ?? {};
  return `${c.total ? `${c.pass ?? 0}/${c.total}` : String(r.ran?.tests ?? 0)} tests${r.fallback ? ", full suite" : ""}`;
}

/** A report's or a merge's own board entry: each already has its event, so the entry is not shown twice. */
const echo = (e) => e.kind === "done" && (Boolean(e.file) || String(e.text ?? "").startsWith("Merged "));

/** Everything that happened to one step, oldest first: board posts, its report, checks and merges. */
function stepEvents(step, entries, receipts, children) {
  const events = [
    ...entries.filter((e) => e.step === step.n && !echo(e)).map((e) => ({ at: e.at, kind: "board", text: e.text, detail: e.kind, from: e.from ?? null })),
    ...(step.report ? [{ at: step.report.at, kind: "report", text: step.report.summary, detail: step.report.file, from: step.report.from ?? null }] : []),
    ...receipts.filter((r) => r.step === step.n).map((r) => ({ at: r.at, kind: "check", text: r.exit === 0 ? "Checks passed" : "Checks failed", detail: checkDetail(r), from: r.from ?? null })),
    ...children.filter((c) => c.step === step.n && c.state === "merged").map((c) => ({ at: c.mergedAt ?? c.at, kind: "merge", text: `Merged ${c.name}`, detail: `+${c.stat?.added ?? 0} −${c.stat?.removed ?? 0}`, from: c.agent ?? null })),
  ];
  return events.filter((e) => e.at).sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

/**
 * The task as `bh task show --json` gives it: each step with its events, its agent and the time its
 * turns took, the task's done/total, and usage per step and for the task (what Design's tracker reads).
 */
export function taskDetail(root, task, entries = []) {
  const receipts = checks(root, task.id);
  const usage = usageOf(root, task.id);
  const open = (step) => (task.children ?? []).find((c) => c.state === "open" && c.step === step)?.name ?? null;
  const steps = task.steps.map((s) => {
    const ms = usage.length ? stepTime(usage, s.n) : (s.workedMs ?? 0);
    return { ...s, events: stepEvents(s, entries, receipts, task.children ?? []), agentName: s.agent ?? open(s.n), timeMs: ms, elapsedMs: ms, usage: usageTotals(usage.filter((r) => r.step === s.n)) };
  });
  return { ...task, steps, done: steps.filter((s) => s.status === "done" || s.status === "skipped").length, total: steps.length, usage: usageTotals(usage), timeMs: worked(root, task) };
}

/** A gate verdict on the task, and a `done` board entry for it; round defaults to one past the last. */
export function recordGate(root, id, { verdict, round = null, file, summary, from = null, head = null }) {
  if (!["PASS", "CHANGES_REQUIRED", "BLOCKED"].includes(verdict)) throw new Error("A gate verdict is PASS, CHANGES_REQUIRED or BLOCKED.");
  let gate;
  updateTask(root, id, (t) => {
    gate = { round: round ?? ((t.gates ?? []).at(-1)?.round ?? 0) + 1, verdict, file, summary, from, at: now(), head };
    t.gates = [...(t.gates ?? []), gate];
  });
  post(root, id, { kind: "done", text: summary, from, file });
  return gate;
}

/** One line per task for `bh task list`. */
export function taskLine(t) {
  const done = t.steps.filter((s) => s.status === "done" || s.status === "skipped").length;
  return `${t.id}  ${t.status.padEnd(9)} ${t.steps.length ? `${done}/${t.steps.length} steps  ` : ""}${t.title}`;
}

/** One step as `bh task show` prints it, with its report under it. */
function stepLine(s) {
  const line = `${s.n}. [${s.status}] ${s.title}${s.agent ? ` (${s.agent})` : ""}${s.note ? ` — ${s.note}` : ""}`;
  return s.report ? [line, `   report: ${s.report.file} — ${s.report.summary} (${s.report.from ?? "unknown"})`] : [line];
}

/** The board's counts by kind, then its last five entries (`all`: every entry). */
function boardLines(entries, all) {
  const counts = BOARD_KINDS.map((k) => [k, entries.filter((e) => e.kind === k).length]).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`);
  return ["", "## Board", `board: ${counts.join(", ")}`, ...(all ? entries : entries.slice(-5)).map(boardLine)];
}

export function taskText(t, entries = [], { all = false, workedMs = 0 } = {}) {
  const mins = Math.round(workedMs / 60000);
  const lines = [
    `# ${t.title}`,
    `${t.id} · ${t.status} · ${t.track} track${t.plan ? ` · from plan ${t.plan}` : ""} · agents worked ${mins} min`,
    "",
    "## Request",
    t.request || "(none)",
    "",
    "## Steps",
    ...(t.steps.length ? t.steps.flatMap(stepLine) : ["(none yet: `bh task steps`)"]),
    ...(openComments(t).length ? ["", "## Open comments from the user", ...openComments(t).map((c) => `- ${c.step ? `step ${c.step} ("${c.quote}")` : "the task"}: ${c.text}`)] : []),
  ];
  if (t.triage) lines.push("", "## Classifier triage", JSON.stringify(t.triage));
  if (t.qa) lines.push("", "## QA risk", `${t.qa.risk}: ${t.qa.reasoning ?? ""}`);
  const gate = (t.gates ?? []).at(-1);
  if (gate) lines.push("", "## Gate", `gate: round ${gate.round} ${gate.verdict} — ${gate.summary}`);
  if (entries.length) lines.push(...boardLines(entries, all));
  return lines.join("\n");
}
