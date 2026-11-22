// bh thread: the Thread read model behind the redesign's Threads page and Peek drawer. One task is
// one thread (a plan that became a task merges into it; a plan not yet a task is its own thread).
// Everything is derived from stores that already exist — .bot-herdr/tasks, .bot-herdr/plans,
// DATA/replies, DATA/activity and git — so nothing new is written and older data keeps working.
// A record that cannot be read is skipped with a line in DATA/logs/ui.jsonl and a calm fallback,
// never thrown: a page has to draw regardless of what is on disk.

import { statSync } from "node:fs";
import { join } from "node:path";
import { fileKey } from "./agent.mjs";
import { DATA, UsageError, appendJsonl, listDir, need, now, readJson, readJsonl, readText, store } from "./core.mjs";
import * as Q from "./ask.mjs";
import * as T from "./tasks.mjs";
import * as team from "./team.mjs";
import { runGit, taskCwd } from "./workspace.mjs";

/** The seven states of the design language's state table, in the order Home ranks them. */
export const THREAD_STATES = ["needsYou", "review", "working", "done", "failed", "paused", "idle"];

/** One glyph per state: the same glyph on every page and surface. */
export const STATE_GLYPH = { needsYou: "◆", review: "◇", working: "●", done: "✓", failed: "✕", paused: "‖", idle: "○" };

const RANK = { needsYou: 0, review: 1, working: 2, paused: 3, done: 4, failed: 5, idle: 6 };
const SPEAKS = { needsYou: "Needs you", review: "QA is reviewing", working: "Working", done: "Done", failed: "Stopped", paused: "Paused", idle: "Idle" };
const CONVERSATION_MAX = 120;
const PEEK_LINES = 8;
const TEXT_MAX = 4000;
const CHANGES_MAX = 40;

const asList = (value) => (Array.isArray(value) ? value : []);
const atMs = (at) => Date.parse(at ?? "") || 0;
const isQaName = (name) => /^qa(?:[-_]|$)/i.test(String(name ?? "").trim());

/** A skipped record in the UI log (DATA/logs/ui.jsonl): the page draws a fallback row instead. */
export function logSkipped(source, id, error) {
  try {
    const message = error instanceof Error ? error.message : String(error ?? "");
    appendJsonl(join(DATA, "logs", "ui.jsonl"), { at: now(), kind: "read-model", source, id: id ?? null, error: message.slice(0, 300) });
  } catch {
    // A log that cannot be written never stops a read model.
  }
}

/** One readable line: the first non-empty line, no markdown furniture, at most `max` characters. */
export function oneLine(text, max = 140) {
  const line = String(text ?? "").replace(/\r/g, "").split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  const clean = line.replace(/^[#>*•\-\s]+/, "").replace(/`/g, "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** An age the row can show at a glance: 23m, 3h, 2d. */
export function ageText(ms) {
  const mins = Math.floor((Number(ms) || 0) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

/** A compact number for the text output: 7.2M, 12k, 41. JSON keeps the exact number. */
export function compactNumber(value) {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(Math.round(n));
}

/** Every live and finished herdr terminal (`hc ls --all --json`), [] when herdr is not running. */
export function liveTerminals(hc = team.hc) {
  const r = hc(["ls", "--all", "--json"], { timeout: 2000 });
  if (r.code !== 0) return [];
  try {
    const terminals = JSON.parse(r.out)?.terminals;
    return Array.isArray(terminals) ? terminals.filter((t) => t && typeof t.address === "string") : [];
  } catch (e) {
    logSkipped("live", null, e);
    return [];
  }
}

/** Terminals by lowercase name and by address: how a thread's agent names find their terminal. */
function terminalIndex(terminals) {
  const byName = new Map();
  const byAddress = new Map();
  for (const t of terminals) {
    if (t.name) byName.set(String(t.name).toLowerCase(), t);
    byAddress.set(t.address, t);
  }
  return { byName, byAddress };
}

// ── Reading the stores ────────────────────────────────────────────────────────────────────

/** Every readable record of one store folder; one that cannot be read is logged and skipped. */
function readStore(dir, source, read) {
  const records = [];
  const skipped = [];
  for (const entry of listDir(dir)) {
    if (!entry.isDirectory()) continue;
    const record = read(join(dir, entry.name));
    if (record) {
      records.push(record);
      continue;
    }
    const reason = `${source} record is missing or unreadable`;
    logSkipped(source, entry.name, reason);
    skipped.push({ id: entry.name, source, reason });
  }
  return { records, skipped };
}

const readTask = (dir) => {
  const task = readJson(join(dir, "task.json"), null);
  return task && typeof task === "object" && task.id ? task : null;
};

const readPlan = (dir) => {
  const plan = readJson(join(dir, "plan.json"), null);
  if (!plan || typeof plan !== "object" || !plan.id) return null;
  return { ...plan, markdown: readText(join(dir, "plan.md")), comments: asList(readJson(join(dir, "comments.json"), [])) };
};

/** The tasks, and the plans that are threads of their own (a plan with a task is that thread). */
function threadRecords(root) {
  const tasks = readStore(store(root, "tasks"), "task", readTask);
  const plans = readStore(store(root, "plans"), "plan", readPlan);
  const ids = new Set(tasks.records.map((t) => t.id));
  return {
    tasks: tasks.records.filter((t) => !t.archived),
    plans: plans.records.filter((p) => p.status !== "archived" && !(p.task && ids.has(p.task))),
    skipped: [...tasks.skipped, ...plans.skipped],
  };
}

/** One thread's record by id: a task, else a plan, else it says there is none. */
function loadThread(root, id) {
  const name = String(id ?? "");
  if (!/^[\w-]+$/.test(name)) throw new Error(`No thread ${id}. \`bh thread list\` shows them.`);
  const task = readTask(store(root, "tasks", name));
  if (task) return { kind: "task", task };
  const plan = readPlan(store(root, "plans", name));
  if (plan) return { kind: "plan", plan };
  throw new Error(`No thread ${id}. \`bh thread list\` shows them.`);
}

/** The plans with a question the user has not answered yet (`bh ask`), by plan id. */
function openQuestionsByPlan() {
  const byPlan = new Map();
  try {
    for (const q of Q.openQuestions()) {
      if (!q.plan) continue;
      byPlan.set(q.plan, [...(byPlan.get(q.plan) ?? []), q]);
    }
  } catch (e) {
    logSkipped("question", null, e);
  }
  return byPlan;
}

const boardEntries = (root, id) => readJsonl(join(store(root, "tasks", id), "board.jsonl"));

// ── Derived state ────────────────────────────────────────────────────────────────────────

/**
 * The spec's seven states for a task thread, decided in this order: what waits for the user,
 * then failed, paused, review, done, working, idle. Review covers a QA step running, a Goal
 * waiting on QA, and a QA gate that asked for changes.
 */
export function taskState(task) {
  const steps = asList(task.steps);
  const goal = task.goal ?? null;
  const gate = asList(task.gates).at(-1) ?? null;
  if (T.openComments(task).length || steps.some((s) => s.status === "blocked") || goal?.pendingAmendment || gate?.verdict === "BLOCKED") return "needsYou";
  if (task.status === "abandoned" || goal?.status === "stopped") return "failed";
  if (task.status === "paused" || goal?.status === "paused" || goal?.status === "waiting") return "paused";
  if (goal?.awaitingQa || gate?.verdict === "CHANGES_REQUIRED" || steps.some((s) => s.status === "active" && isQaName(s.agent))) return "review";
  if (task.status === "done" || goal?.status === "reached") return "done";
  if (task.status === "active" || goal?.status === "running" || steps.some((s) => s.status === "active") || asList(task.children).some((c) => c.state === "open")) return "working";
  return "idle";
}

/** A plan that is not yet a task: planning is work; a ready plan waits for the user to start it. */
export function planState(plan, { needs = 0 } = {}) {
  if (needs > 0) return "needsYou";
  return plan.status === "grilling" ? "working" : "idle";
}

// ── Rows (the quiet form) ────────────────────────────────────────────────────────────────

/** The steps' counts and who is on them: what the quiet thread row shows. */
function stepFacts(task) {
  const steps = asList(task.steps);
  return {
    steps: { done: steps.filter((s) => s.status === "done" || s.status === "skipped").length, total: steps.length },
    activeAgents: steps.filter((s) => s.status === "active").map((s) => s.agent).filter(Boolean),
    blocked: steps.filter((s) => s.status === "blocked").length,
  };
}

/** Who is on a thread: its steps' agents and its child agents, once each, in order. */
export function threadAgents(task) {
  const names = [...asList(task.steps).map((s) => s.agent), ...asList(task.children).map((c) => c.name)];
  const seen = new Set();
  return names.filter((name) => {
    const key = String(name ?? "").trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** What on a task waits for the user: open comments, blocked steps, a BLOCKED gate, an amendment. */
function taskNeeds(task) {
  const needs = T.openComments(task).map((c) => ({ kind: "question", ref: `comment ${c.id}`, text: oneLine(c.text, 160), from: "You", at: c.at ?? null }));
  for (const s of asList(task.steps).filter((x) => x.status === "blocked")) {
    needs.push({ kind: "blocker", ref: `step ${s.n}`, text: oneLine(`${s.title}${s.note ? ` — ${s.note}` : ""}`, 160), from: s.agent ?? null, at: s.started ?? task.updated ?? null });
  }
  const gate = asList(task.gates).at(-1);
  if (gate?.verdict === "BLOCKED") needs.push({ kind: "blocker", ref: `gate round ${gate.round}`, text: oneLine(gate.summary, 160), from: gate.from ?? null, at: gate.at ?? null });
  const amendment = task.goal?.pendingAmendment;
  if (amendment) needs.push({ kind: "question", ref: "goal amendment", text: oneLine(amendment.reason || amendment.text, 160), from: amendment.by ?? null, at: amendment.at ?? null });
  return needs.filter((n) => n.text);
}

/** What waits for the user on a plan: the user's own comments and any open question set. */
function planNeeds(plan, questions) {
  return [
    ...T.openComments(plan).map((c) => ({ kind: "question", ref: `comment ${c.id}`, text: oneLine(c.text, 160), from: "You", at: c.at ?? null })),
    ...questions.map((q) => ({ kind: "question", ref: q.id, text: oneLine(q.title || q.questions?.[0]?.text || "A question waits for you", 160), from: q.fromName ?? q.from ?? null, at: q.created ?? null })),
  ].filter((n) => n.text);
}

/** What a thread's row summarizer reads: its activity lines, its board and its last step report. */function summaryEntries(root, task, agents, terminals) {
  const entries = [];
  const index = terminalIndex(terminals);
  for (const name of agents) {
    const terminal = index.byName.get(name.toLowerCase());
    const activity = terminal ? readJson(join(DATA, "activity", `${fileKey(terminal.address)}.json`), null) : null;
    if (activity?.line) entries.push({ at: activity.at ?? null, text: activity.line, source: "activity", agent: name });
  }
  const last = boardEntries(root, task.id).filter((e) => e.at && e.text).at(-1);
  if (last) entries.push({ at: last.at, text: last.text, source: "board", agent: last.from ?? null });
  const report = asList(task.steps).filter((s) => s.report?.at).at(-1);
  if (report) entries.push({ at: report.report.at, text: report.report.summary, source: "step", agent: report.agent ?? null });
  return entries;
}

/** The row's one-line live summary: the latest activity, board or step line, deterministically. */
export function summarize({ state, agents = [], entries = [] }) {
  const latest = entries.filter((e) => e?.text && e.at).sort((a, b) => atMs(b.at) - atMs(a.at))[0] ?? null;
  if (latest) return { text: oneLine(latest.text), at: latest.at, source: latest.source, agent: latest.agent ?? null };
  const who = agents[0] ?? null;
  return { text: idleText(state, who), at: null, source: "state", agent: who };
}

/** What a thread is doing when nothing happened yet: "Needs you", "QA is reviewing (qa-1)", … */
function idleText(state, who) {
  if (state === "review") return who ? `QA is reviewing (${who})` : "QA is reviewing";
  return who ? `${who}: ${SPEAKS[state].toLowerCase()}` : SPEAKS[state];
}

/** The Goal a thread holds, in the row's words: progress, iteration and the ceiling. */
export function goalRow(task) {
  const goal = task.goal;
  if (task.mode !== "goal" || !goal) return null;
  const criteria = asList(goal.criteria);
  return {
    status: goal.status ?? "running",
    passed: criteria.filter((c) => c.verdict === "PASS").length,
    total: criteria.length,
    iteration: Number(goal.iteration ?? 0),
    maxSpendUsd: Number(goal.maxSpendUsd ?? 0) || null,
    awaitingQa: Boolean(goal.awaitingQa),
  };
}

/** One task as a thread row: the quiet form; cost and tokens wait for the peek. */
export function taskRow(root, task, { at = Date.now(), terminals = [] } = {}) {
  const facts = stepFacts(task);
  const state = taskState(task);
  const agents = threadAgents(task);
  const ageMs = Math.max(0, at - (atMs(task.created) || at));
  return {
    id: task.id,
    kind: "task",
    title: String(task.title ?? task.id),
    state,
    glyph: STATE_GLYPH[state],
    status: task.status ?? null,
    planId: task.plan ?? null,
    agents,
    steps: facts.steps,
    blocked: facts.blocked,
    openComments: T.openComments(task).length,
    needs: taskNeeds(task),
    activeAgents: facts.activeAgents,
    goal: goalRow(task),
    ageMs,
    age: ageText(ageMs),
    created: task.created ?? null,
    updated: task.updated ?? null,
    branch: task.git?.branch ?? null,
    path: task.git?.path ?? null,
    summary: summarize({ state, agents, entries: summaryEntries(root, task, agents, terminals) }),
  };
}

/** One plan as a thread row: what the plan is still waiting for, and who planned it. */
export function planRow(plan, { at = Date.now(), questions = [] } = {}) {
  const needs = planNeeds(plan, questions);
  const state = planState(plan, { needs: needs.length });
  const agents = Object.keys(plan.skills ?? {});
  const ageMs = Math.max(0, at - (atMs(plan.created) || at));
  const last = asList(plan.comments).filter((c) => c.at && c.text).at(-1);
  const entries = last ? [{ at: last.at, text: last.text, source: "comment", agent: null }] : [];
  return {
    id: plan.id,
    kind: "plan",
    title: String(plan.title ?? plan.id),
    state,
    glyph: STATE_GLYPH[state],
    status: plan.status ?? null,
    planId: plan.id,
    agents,
    steps: { done: 0, total: 0 },
    blocked: 0,
    openComments: T.openComments(plan).length,
    needs,
    activeAgents: [],
    goal: null,
    ageMs,
    age: ageText(ageMs),
    created: plan.created ?? null,
    updated: plan.updated ?? null,
    branch: null,
    path: null,
    summary: summarize({ state, agents, entries }),
  };
}

/** Rows ranked: what needs you first, then review, then working; newest first inside a state. */
function byRank(a, b) {
  const rank = (RANK[a.state] ?? 9) - (RANK[b.state] ?? 9);
  return rank !== 0 ? rank : String(b.updated ?? "").localeCompare(String(a.updated ?? ""));
}

/** Every thread as a quiet row, ranked. A skipped record is listed, never thrown. */
export function listThreads(root, { at = Date.now(), terminals = null } = {}) {
  const { tasks, plans, skipped } = threadRecords(root);
  const live = terminals ?? liveTerminals();
  const questions = openQuestionsByPlan();
  const rows = [
    ...tasks.map((task) => taskRow(root, task, { at, terminals: live })),
    ...plans.map((plan) => planRow(plan, { at, questions: questions.get(plan.id) ?? [] })),
  ].sort(byRank);
  return { threads: rows, skipped };
}

// ── Show, peek, summary ──────────────────────────────────────────────────────────────────

const stepPart = (s) => ({ n: s.n, title: s.title, status: s.status, agent: s.agent ?? null, note: s.note ?? null, workedMs: Number(s.workedMs ?? 0), report: s.report ?? null });

const childPart = (c) => ({ name: c.name ?? null, agent: c.agent ?? null, step: c.step ?? null, state: c.state ?? null, branch: c.branch ?? null, mergedAt: c.mergedAt ?? null, stat: c.stat ?? null });

const planDoc = (p) => ({ id: p.id, title: p.title ?? null, status: p.status ?? null, round: Number(p.round ?? 0), task: p.task ?? null, markdown: String(p.markdown ?? "") });

/** The row's identity fields, shared by show and peek so both read the same thread. */
function common(row, sub) {
  return {
    command: "thread",
    sub,
    at: now(),
    id: row.id,
    kind: row.kind,
    title: row.title,
    state: row.state,
    glyph: row.glyph,
    status: row.status,
    planId: row.planId,
    agents: row.agents,
    steps: row.steps,
    activeAgents: row.activeAgents,
    needs: row.needs,
    goal: row.goal,
    ageMs: row.ageMs,
    age: row.age,
    created: row.created,
    updated: row.updated,
    branch: row.branch,
    path: row.path,
    summary: row.summary,
  };
}

/** The agents' chat replies (`DATA/replies/*.jsonl`) since the thread began, matched by name. */
function replyEntries(agents, since) {
  const wanted = new Set(agents.map((n) => n.toLowerCase()));
  if (!wanted.size) return [];
  const dir = join(DATA, "replies");
  return listDir(dir).filter((d) => d.isFile() && d.name.endsWith(".jsonl")).flatMap((d) => {
    const file = join(dir, d.name);
    try {
      if (since && statSync(file).mtimeMs < since) return [];
    } catch {
      return [];
    }
    return readJsonl(file)
      .filter((e) => e && wanted.has(String(e.name ?? "").toLowerCase()) && atMs(e.at) >= since)
      .map((e) => ({ at: e.at ?? null, kind: "reply", from: e.name ?? null, text: String(e.text ?? "") }));
  });
}

/** The thread's conversation: the agents' chat replies, the user's comments and its board, oldest first. */
export function conversation(root, task, agents, { since = 0 } = {}) {
  const entries = [
    ...replyEntries(agents, since),
    ...asList(task.comments).map((c) => ({ at: c.at ?? null, kind: "comment", from: "You", text: String(c.text ?? ""), ref: c.id })),
    ...boardEntries(root, task.id).map((e) => ({ at: e.at ?? null, kind: "board", boardKind: e.kind ?? null, from: e.from ?? null, to: e.to ?? null, text: String(e.text ?? ""), ref: `#${e.n}` })),
  ].filter((e) => e.text);
  const sorted = entries.sort((a, b) => atMs(a.at) - atMs(b.at));
  return { total: sorted.length, entries: sorted.slice(-CONVERSATION_MAX).map((e) => ({ ...e, text: e.text.slice(0, TEXT_MAX) })) };
}

/** A plan's conversation: the user's comments and the question sets asked for it. */
function planConversation(plan, questions) {
  const entries = [
    ...asList(plan.comments).map((c) => ({ at: c.at ?? null, kind: "comment", from: "You", text: String(c.text ?? ""), ref: c.id })),
    ...questions.map((q) => ({ at: q.created ?? null, kind: "question", from: q.fromName ?? q.from ?? null, text: `${q.title ?? "Question"}: ${q.questions?.[0]?.text ?? ""}`, ref: q.id })),
  ].filter((e) => e.text);
  return { total: entries.length, entries: entries.sort((a, b) => atMs(a.at) - atMs(b.at)) };
}

/** The Change tab's numbers: the diff from the task's base commit in its own tree, when git answers. */
export function changesOf(root, task) {
  const base = task.git?.base ?? task.base ?? null;
  const branch = task.git?.branch ?? null;
  const from = task.git?.from ?? null;
  if (!base) return { available: false, reason: "this task has no base commit", base: null, branch, from, files: [], filesChanged: 0, added: 0, removed: 0 };
  try {
    const cwd = taskCwd(task, root);
    const numstat = runGit(cwd, ["diff", "--numstat", base]);
    const files = numstat.split("\n").filter(Boolean).map((line) => {
      const [added, removed, ...path] = line.split("\t");
      return { path: path.join("\t"), added: Number(added) || 0, removed: Number(removed) || 0 };
    });
    return {
      available: true,
      base,
      branch,
      from,
      files: files.slice(0, CHANGES_MAX),
      filesChanged: files.length,
      truncated: files.length > CHANGES_MAX,
      added: files.reduce((n, f) => n + f.added, 0),
      removed: files.reduce((n, f) => n + f.removed, 0),
    };
  } catch (e) {
    // A base commit this clone does not have is expected on legacy data: the reason says so, and
    // nothing is logged: this is not a broken record.
    return { available: false, reason: oneLine(e.message, 200), base, branch, from, files: [], filesChanged: 0, added: 0, removed: 0 };
  }
}

/** What the thread cost: tokens, dollars and minutes over its turns (the peek shows it, not the row). */
function costOf(root, task) {
  const records = T.usageOf(root, task.id);
  const totals = T.usageTotals(records);
  return { ...totals, turns: records.length };
}

const askPart = (q) => ({ id: q.id, title: q.title ?? null, from: q.fromName ?? q.from ?? null, at: q.created ?? null });

function showTask(root, task, { at, terminals }) {
  const row = taskRow(root, task, { at, terminals });
  const planId = task.plan ?? null;
  const linked = planId ? readPlan(store(root, "plans", planId)) : null;
  return {
    ...common(row, "show"),
    plan: linked ? planDoc(linked) : null,
    steps: { ...row.steps, items: asList(task.steps).map(stepPart) },
    conversation: conversation(root, task, row.agents, { since: atMs(task.created) }),
    changes: changesOf(root, task),
    cost: costOf(root, task),
    comments: asList(task.comments),
    children: asList(task.children).map(childPart),
    questions: planId ? (openQuestionsByPlan().get(planId) ?? []).map(askPart) : [],
  };
}

function showPlan(plan, { at, terminals }) {
  const questions = openQuestionsByPlan().get(plan.id) ?? [];
  const row = planRow(plan, { at, questions });
  return {
    ...common(row, "show"),
    plan: planDoc(plan),
    steps: { done: 0, total: 0, items: [] },
    conversation: planConversation(plan, questions),
    changes: { available: false, reason: "a plan has no code of its own", base: null, branch: null, from: null, files: [], filesChanged: 0, added: 0, removed: 0 },
    cost: null,
    comments: asList(plan.comments),
    children: [],
    questions: questions.map(askPart),
  };
}

/** One thread in full: its row, its four parts (conversation, plan, steps, changes) and its cost. */
export function showThread(root, id, { at = Date.now(), terminals = null } = {}) {
  const live = terminals ?? liveTerminals();
  const thread = loadThread(root, id);
  return thread.kind === "plan" ? showPlan(thread.plan, { at, terminals: live }) : showTask(root, thread.task, { at, terminals: live });
}

/** Who the peek's reply box talks to: the agent that asked, else the one working on the thread. */
function replyTargetOf(show, terminals) {
  const index = terminalIndex(terminals);
  const asked = show.needs.find((n) => n.kind === "question" && n.from && n.from !== "You")?.from ?? null;
  const name = asked ?? show.activeAgents[0] ?? (show.kind === "plan" ? show.agents[0] : null);
  if (!name) return null;
  const terminal = index.byName.get(String(name).toLowerCase()) ?? index.byAddress.get(String(name)) ?? null;
  return { name: terminal?.name ?? name, address: terminal?.address ?? null };
}

/** The peek: recent output lines, any open question, and who a reply goes to. */
export function peekThread(root, id, { at = Date.now(), terminals = null } = {}) {
  const live = terminals ?? liveTerminals();
  const show = showThread(root, id, { at, terminals: live });
  return {
    command: "thread",
    sub: "peek",
    at: now(),
    id: show.id,
    kind: show.kind,
    title: show.title,
    state: show.state,
    glyph: show.glyph,
    summary: show.summary,
    cost: show.cost,
    output: show.conversation.entries.slice(-PEEK_LINES).map((e) => ({ at: e.at, from: e.from, text: oneLine(e.text, 200) })),
    question: show.needs.find((n) => n.kind === "question") ?? null,
    needs: show.needs,
    replyTarget: replyTargetOf(show, live),
  };
}

/** The one-line live summary of one thread, or one line per thread when no id is given. */
export function threadSummary(root, id = null, { at = Date.now(), terminals = null } = {}) {
  const entry = (row) => ({ id: row.id, title: row.title, state: row.state, text: row.summary.text, source: row.summary.source, agent: row.summary.agent, latestAt: row.summary.at });
  if (!id) {
    const { threads } = listThreads(root, { at, terminals });
    return { summaries: threads.map(entry) };
  }
  const live = terminals ?? liveTerminals();
  const thread = loadThread(root, id);
  const row = thread.kind === "task" ? taskRow(root, thread.task, { at, terminals: live }) : planRow(thread.plan, { at, questions: openQuestionsByPlan().get(thread.plan.id) ?? [] });
  return entry(row);
}

// ── Text ─────────────────────────────────────────────────────────────────────────────────

/** One row of `bh thread list`: id, state, title, steps, age, agents. */
export function threadLine(t) {
  const steps = t.steps.total ? `${t.steps.done}/${t.steps.total}` : "";
  return [t.id, `${t.glyph} ${t.state}`.padEnd(12), t.title, steps, t.age, t.agents.slice(0, 4).join(", ")].filter(Boolean).join("  ");
}

function showText(x) {
  const lines = [`# ${x.title}`, `${x.id} · ${x.glyph} ${x.state}${x.status ? ` · ${x.status}` : ""}${x.branch ? ` · ${x.branch}` : ""}`];
  if (x.summary.text) lines.push(`Live: ${x.summary.text}`);
  if (x.agents.length) lines.push(`Agents: ${x.agents.join(", ")}`);
  if (x.steps.total) lines.push(`Steps: ${x.steps.done}/${x.steps.total}`);
  if (x.cost) lines.push(`Cost: $${x.cost.costUsd.toFixed(2)} · ${compactNumber(x.cost.tokens)} tokens · ${Math.round(x.cost.minutes)} min`);
  if (x.changes.available) lines.push(`Changes: ${x.changes.filesChanged} files, +${x.changes.added} −${x.changes.removed} vs ${String(x.changes.base).slice(0, 7)}`);
  const recent = x.conversation.entries.slice(-12);
  if (recent.length) lines.push("", "## Conversation", ...recent.map((e) => `${String(e.at ?? "").slice(11, 16)} ${e.from ?? "—"}: ${oneLine(e.text, 140)}`));
  return lines.join("\n");
}

function peekText(x) {
  const lines = [`${x.title} · ${x.glyph} ${x.state}`, `Live: ${x.summary.text}`];
  if (x.cost && (x.cost.costUsd || x.cost.tokens)) lines.push(`Cost: $${Number(x.cost.costUsd).toFixed(2)} · ${compactNumber(x.cost.tokens)} tokens`);
  if (x.question) lines.push(`Question: ${x.question.from ? `${x.question.from}: ` : ""}${x.question.text}`);
  if (x.replyTarget) lines.push(`Reply to: ${x.replyTarget.name}${x.replyTarget.address ? ` (${x.replyTarget.address})` : ""}`);
  if (x.output.length) lines.push("", "## Recent output", ...x.output.map((e) => `${String(e.at ?? "").slice(11, 16)} ${e.from ?? "—"}: ${e.text}`));
  return lines.join("\n");
}

/** `bh thread list|show|peek|summary [<id>] [--json]`. */
export function runThreadCli({ root, sub, args, flags, out }) {
  const command = sub && !String(sub).startsWith("-") ? sub : "list";
  if (command === "list") {
    const { threads, skipped } = listThreads(root);
    return out(flags, { command: "thread", sub: "list", at: now(), count: threads.length, threads, skipped }, (x) => x.threads.map(threadLine).join("\n") || "No threads yet.");
  }
  if (command === "summary") {
    const summary = threadSummary(root, args[0] ?? null);
    return out(flags, { command: "thread", sub: "summary", at: now(), ...summary }, (x) => (x.summaries ? x.summaries.map((t) => `${t.id}  ${t.text}`).join("\n") || "No threads yet." : `${x.id}  ${x.text}`));
  }
  if (command === "show" || command === "peek") {
    const id = need(args[0], `bh thread ${command} <id> [--json]`);
    return command === "show" ? out(flags, showThread(root, id), showText) : out(flags, peekThread(root, id), peekText);
  }
  throw new UsageError("bh thread list|show|peek|summary [<id>] [--json]");
}
