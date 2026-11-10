// Tasks and their boards. A task is a request the Orchestrator took on: its steps (the person's
// checklist), who works on each and for how long, the classifier's read, and a board where the
// agents post contracts, decisions, blockers, questions and what they finished.
//
// .bot-herdr/tasks/<id>/task.json, board.jsonl, reports/

import { join } from "node:path";
import { appendJsonl, listDir, newId, now, readJson, readJsonl, store, titleFrom, writeJson } from "./core.mjs";

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

export function listTasks(root, { all = false } = {}) {
  return listDir(store(root, "tasks"))
    .filter((d) => d.isDirectory())
    .map((d) => readJson(join(store(root, "tasks"), d.name, "task.json")))
    .filter((t) => t && (all || !t.archived))
    .sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
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

/** How long agents have worked on a task, in ms: finished time plus what is running now. */
export function worked(task, at = Date.now()) {
  return task.steps.reduce((sum, s) => sum + (s.workedMs ?? 0) + (s.status === "active" && s.started ? at - Date.parse(s.started) : 0), 0);
}

export function post(root, id, { kind, text, from = null, to = null }) {
  if (!BOARD_KINDS.includes(kind)) throw new Error(`A board post is one of: ${BOARD_KINDS.join(", ")}.`);
  const entry = { n: board(root, id).length + 1, at: now(), kind, from, to, text: String(text ?? "").trim() };
  appendJsonl(join(dir(root, id), "board.jsonl"), entry);
  return entry;
}

export function board(root, id, { kinds = null, since = 0 } = {}) {
  return readJsonl(join(dir(root, id), "board.jsonl")).filter((e) => e.n > since && (!kinds || kinds.includes(e.kind)));
}

/** The person's comment on a task, or on one of its steps (`step`, its number). */
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

/** One line per task for `bh task list`. */
export function taskLine(t) {
  const done = t.steps.filter((s) => s.status === "done" || s.status === "skipped").length;
  return `${t.id}  ${t.status.padEnd(9)} ${t.steps.length ? `${done}/${t.steps.length} steps  ` : ""}${t.title}`;
}

export function taskText(t, entries = []) {
  const mins = Math.round(worked(t) / 60000);
  const lines = [
    `# ${t.title}`,
    `${t.id} · ${t.status} · ${t.track} track${t.plan ? ` · from plan ${t.plan}` : ""} · agents worked ${mins} min`,
    "",
    "## Request",
    t.request || "(none)",
    "",
    "## Steps",
    ...(t.steps.length ? t.steps.map((s) => `${s.n}. [${s.status}] ${s.title}${s.agent ? ` (${s.agent})` : ""}${s.note ? ` — ${s.note}` : ""}`) : ["(none yet: `bh task steps`)"]),
    ...(openComments(t).length ? ["", "## Open comments from the person", ...openComments(t).map((c) => `- ${c.step ? `step ${c.step} ("${c.quote}")` : "the task"}: ${c.text}`)] : []),
  ];
  if (t.triage) lines.push("", "## Classifier triage", JSON.stringify(t.triage));
  if (t.qa) lines.push("", "## QA risk", `${t.qa.risk}: ${t.qa.reasoning ?? ""}`);
  if (entries.length) lines.push("", "## Board", ...entries.map((e) => `${e.n}. [${e.kind}]${e.from ? ` ${e.from}` : ""}${e.to ? ` → ${e.to}` : ""}: ${e.text}`));
  return lines.join("\n");
}
