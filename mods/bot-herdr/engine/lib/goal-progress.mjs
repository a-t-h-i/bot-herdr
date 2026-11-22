// bh goal progress: the goal row above a thread's composer, from the same Goal state
// (`bh goal status --json`) the loop itself reads. It also writes the task's progress.md checks
// table from that one source (`--sync`), so the markdown and the row never drift: only the table
// is generated, every hand-written section stays as written.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { now, readText, store, writeText } from "./core.mjs";
import * as G from "./goal.mjs";
import * as RZ from "./resilience.mjs";
import * as T from "./tasks.mjs";
import { ageText, oneLine } from "./thread.mjs";

const asList = (value) => (Array.isArray(value) ? value : []);
const atMs = (at) => Date.parse(at ?? "") || 0;

/** The guardrail's retry cap (Settings → Resilience), which is what "retries left" counts against. */
const retryCap = () => Number(RZ.resilienceConfig()?.guardrails?.maxStepRetries ?? 3);

/** Which step of the task (its milestone) the Goal is on: active, else the next todo, else the last. */
export function milestoneOf(task) {
  const steps = asList(task.steps);
  if (!steps.length) return null;
  const step = steps.find((s) => s.status === "active") ?? steps.find((s) => s.status === "todo") ?? steps.at(-1);
  return { n: step.n, total: steps.length, title: step.title, status: step.status };
}

/** The task's Gate: how many of its frozen DONE criteria passed, and whether all required ones did. */
export function gateOf(task) {
  const criteria = asList(task.goal?.criteria);
  const required = criteria.filter((c) => c.required !== false);
  return {
    passed: criteria.filter((c) => c.verdict === "PASS").length,
    total: criteria.length,
    reached: required.length > 0 && required.every((c) => c.verdict === "PASS"),
    best: Number(task.goal?.bestScore ?? 0),
  };
}

/** When the Goal began: its first round, its first turn, else when the task was made. */
export function goalStart(root, task, status) {
  const times = [atMs(task.created), ...asList(status.recentIterations).map((r) => atMs(r.at)), ...T.usageOf(root, task.id).map((r) => atMs(r.at))].filter((t) => t > 0);
  return times.length ? Math.min(...times) : Date.now();
}

/** The last thing verification said: the round's lesson, else its verdict, else the gate's reason. */
export function judgeReason(task, status) {
  const round = asList(status.recentIterations).at(-1) ?? null;
  if (round?.lesson) return oneLine(round.lesson, 180);
  if (round) {
    const ids = [...asList(round.failed).map((id) => `fail ${id}`), ...asList(round.pendingQa).map((id) => `QA ${id}`)];
    return oneLine(`${round.verdict}: ${ids.join(", ") || `pass ${asList(round.passed).join(", ")}`}`, 180);
  }
  const gate = asList(task.gates).at(-1);
  if (gate?.summary) return oneLine(gate.summary, 180);
  return status.reason ? oneLine(status.reason, 180) : "No round has been verified yet.";
}

const lastRoundOf = (status) => {
  const round = asList(status.recentIterations).at(-1);
  return round ? { n: round.n ?? null, at: round.at ?? null, verdict: round.verdict ?? null, spendUsd: round.spendUsd ?? null } : null;
};

/** The goal row's data for a task: title, milestone, gate, elapsed, retries left and the last reason. */
export function goalProgress(root, taskId = null) {
  const task = taskId ? T.loadTask(root, taskId) : T.currentTask(root);
  const at = now();
  if (!task) return { command: "goal progress", at, task: null, isGoal: false, reason: "no task in this project" };
  const base = { command: "goal progress", at, task: task.id, title: task.title, taskStatus: task.status ?? null, mode: task.mode === "goal" ? "goal" : "task" };
  if (task.mode !== "goal" || !task.goal) return { ...base, isGoal: false, reason: `${task.id} is not a Goal` };
  const status = G.goalStatus(root, task.id);
  if (!status) return { ...base, isGoal: false, reason: `${task.id} is not a Goal` };
  const elapsedMs = Math.max(0, Date.now() - goalStart(root, task, status));
  const used = Number(task.goal.sameErrorStreak ?? 0);
  const cap = retryCap();
  return {
    ...base,
    isGoal: true,
    status: status.status,
    paused: task.status === "paused" || ["paused", "stopped"].includes(status.status),
    milestone: milestoneOf(task),
    gate: gateOf(task),
    iteration: Number(task.goal.iteration ?? 0),
    awaitingQa: Boolean(task.goal.awaitingQa),
    pendingAmendment: task.goal.pendingAmendment ?? null,
    elapsedMs,
    elapsed: ageText(elapsedMs),
    workedMs: T.worked(root, task),
    retries: { used, cap, left: cap > 0 ? Math.max(0, cap - used) : null },
    lastReason: judgeReason(task, status),
    lastRound: lastRoundOf(status),
    budget: { spendUsd: status.budget?.spendUsd ?? 0, maxSpendUsd: status.budget?.maxSpendUsd ?? null, maxIterations: status.budget?.maxIterations ?? 0 },
    contract: { ok: status.contractOk, error: status.contractError ?? null },
    waiting: status.waiting,
    criteria: asList(task.goal.criteria).map((c) => ({ id: c.id, kind: c.kind ?? null, text: c.text ?? "", verdict: c.verdict ?? null, evidence: c.evidence ?? null, at: c.at ?? null })),
  };
}

/** A table cell: a `|` inside the words would end the column, so it is escaped. */
const cell = (text, max) => String(oneLine(text, max)).replace(/\|/g, "\\|");

/** The progress.md checks table for a Goal: one row per frozen DONE criterion, with its verdict. */
export function checksTable(progress) {
  const rows = asList(progress.criteria).map((c) => {
    const verdict = c.verdict ?? "not run yet";
    return `| ${cell(`${c.id} · ${c.text}`, 90)} | ${cell(c.evidence ? `${verdict} — ${c.evidence}` : verdict, 90)} |`;
  });
  return ["| Check | Result |", "| --- | --- |", ...rows].join("\n");
}

/** The `## Checks` section's lines with its table (if any) replaced: everything else is kept. */
function sectionWithTable(section, table) {
  const start = section.findIndex((line) => /^\s*\|/.test(line));
  if (start < 0) return [...section, "", table];
  let end = start;
  while (end + 1 < section.length && /^\s*\|/.test(section[end + 1])) end++;
  return [...section.slice(0, start), table, ...section.slice(end + 1)];
}

/** The document with only its `## Checks` table replaced; every other section is left as written. */
export function replaceChecksTable(markdown, table) {
  const source = String(markdown ?? "");
  const crlf = source.includes("\r\n");
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const keep = (text) => (crlf ? text.replace(/\n/g, "\r\n") : text);
  const start = lines.findIndex((line) => /^##\s+Checks\s*$/i.test(line));
  if (start < 0) return keep(`${lines.join("\n").replace(/\s+$/, "")}\n\n## Checks\n\n${table}\n`);
  let end = lines.findIndex((line, i) => i > start && /^#{1,6}\s/.test(line));
  if (end < 0) end = lines.length;
  const next = [...lines.slice(0, start + 1), ...sectionWithTable(lines.slice(start + 1, end), table), ...lines.slice(end)];
  return keep(`${next.join("\n").replace(/\s+$/, "")}\n`);
}

/** Writes the task's progress.md checks table from the Goal's own state; nothing else is touched. */
export function syncProgress(root, taskId, progress) {
  const file = join(store(root, "tasks", String(taskId)), "progress.md");
  if (!existsSync(file)) return { file, synced: false, rows: 0, reason: "no progress.md to sync" };
  const before = readText(file);
  const after = replaceChecksTable(before, checksTable(progress));
  if (after !== before) writeText(file, after);
  return { file, synced: after !== before, rows: asList(progress.criteria).length, reason: after === before ? "already in step" : null };
}

const minutes = (ms) => `${Math.round((Number(ms) || 0) / 60000)} min`;

function progressText(p) {
  if (!p.isGoal) return `${p.task ?? "This project"}: ${p.reason ?? "no Goal here"}.`;
  const milestone = p.milestone ? `${p.milestone.n}/${p.milestone.total} ${p.milestone.title}` : "no milestone";
  const gate = `${p.gate.passed}/${p.gate.total} DONE${p.gate.reached ? " · gate reached" : ""}`;
  const ceiling = p.budget.maxSpendUsd ? ` of $${Number(p.budget.maxSpendUsd).toFixed(2)}` : "";
  const lines = [
    `◎ ${p.title}`,
    `${milestone} · ${gate} · iter ${p.iteration}`,
    `Elapsed ${p.elapsed} · worked ${minutes(p.workedMs)} · ${p.retries.left === null ? "no retry cap" : `${p.retries.left} of ${p.retries.cap} retries left`} · $${Number(p.budget.spendUsd).toFixed(2)}${ceiling}`,
    `Status: ${p.status}${p.paused ? " (paused)" : ""}${p.awaitingQa ? " · waiting on QA" : ""}`,
    `Last round: ${p.lastReason}`,
  ];
  if (p.pendingAmendment) lines.push(`Pending amendment: ${p.pendingAmendment.action} ${p.pendingAmendment.criterionId ?? ""} — ${p.pendingAmendment.reason ?? ""}`);
  if (p.progress) lines.push(p.progress.synced ? `Synced ${p.progress.rows} checks into ${p.progress.file}.` : `progress.md not changed: ${p.progress.reason}.`);
  return lines.join("\n");
}

/** `bh goal progress [<task>] [--sync] [--json]`. */
export function runGoalProgressCli({ root, task, flags, out }) {
  const progress = goalProgress(root, task ?? null);
  if (flags.sync) progress.progress = progress.isGoal ? syncProgress(root, progress.task, progress) : { synced: false, rows: 0, reason: progress.reason ?? "not a Goal" };
  return out(flags, progress, progressText);
}
