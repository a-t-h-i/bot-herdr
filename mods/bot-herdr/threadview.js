// Pure view models for Threads, the peek drawer, the goal row and the status bar: they shape
// `bh thread list|show|peek` and `bh goal progress` answers into what the views draw, and never
// throw on corrupt, legacy or missing data (a bad record is dropped, a bad field reads as empty).
// No gpui-kit, gpui-base or herdr imports, so `npm test` fuzzes every function here.

import { machineKind } from "./machinefold.js";

/** The seven states, in the order the thread list groups them: what needs you first. */
export const STATE_ORDER = ["needsYou", "review", "working", "paused", "done", "failed", "idle"];

/** Each group's heading in the thread list. */
export const GROUP_LABELS = {
  needsYou: "Needs you",
  review: "Review",
  working: "Working",
  paused: "Paused",
  done: "Done",
  failed: "Failed",
  idle: "Idle",
};

/** A thread's second row, in order. */
export const SUB_TABS = [
  { id: "conversation", label: "Conversation" },
  { id: "plan", label: "Plan" },
  { id: "steps", label: "Steps" },
  { id: "changes", label: "Changes" },
];

/** The Orchestrator's chat, pinned at the top of the thread list. */
export const ORCHESTRATOR = "orchestrator";

/** How many conversation entries and peek output lines are drawn at once. */
export const SHOWN_ENTRIES = 40;
export const PEEK_LINES = 5;

/** Reads a property without throwing on null, primitives or hostile getters. */
function get(value, key) {
  if (value === null || value === undefined) return undefined;
  try {
    return value[key];
  } catch {
    return undefined;
  }
}

/** A value as text: strings as they are, numbers in decimal, anything else empty. */
export function text(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

/** A value as a list: an array as it is, anything else empty. */
export const list = (value) => (Array.isArray(value) ? value : []);

/** A finite, non-negative number, else 0. */
export const num = (value) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0);

/** A state the design language knows, else idle. */
export const stateOf = (value) => (STATE_ORDER.includes(/** @type {string} */ (value)) ? /** @type {string} */ (value) : "idle");

/** The first line of a text, folded to one line of at most `max` characters. */
export function firstLine(value, max = 140) {
  const line = text(value).split(/\r?\n/).find((l) => l.trim()) ?? "";
  const flat = line.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/** An entry's one line: its first line, or (when that is only a brace or bracket, as JSON is) the whole text folded. */
export function leadLine(value, max = 140) {
  const first = firstLine(value, max);
  if (/\w/.test(first)) return first;
  const flat = text(value).replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/** Whether a text holds more than its first line shows. */
export function hasMore(value, max = 140) {
  const all = text(value).trim();
  return all.length > 0 && all.replace(/\s+/g, " ") !== firstLine(all, max);
}

/** "2/6" for steps or a gate, "" when there is nothing to count. */
export function fraction(done, total) {
  const t = num(total);
  return t ? `${Math.min(num(done), t)}/${t}` : "";
}

/** One thread row from bh thread list, or null when it has no id to be keyed by. */
export function threadRow(raw) {
  const id = text(get(raw, "id"));
  if (!id) return null;
  const steps = get(raw, "steps");
  const summary = get(raw, "summary");
  return {
    id,
    kind: text(get(raw, "kind")) === "plan" ? "plan" : "task",
    title: text(get(raw, "title")) || id,
    state: stateOf(get(raw, "state")),
    agents: list(get(raw, "agents")).map(text).filter(Boolean),
    steps: fraction(get(steps, "done"), get(steps, "total")),
    age: text(get(raw, "age")),
    summary: firstLine(typeof summary === "string" ? summary : get(summary, "text")),
    goal: Boolean(get(raw, "goal")),
    planId: text(get(raw, "planId")),
  };
}

/** Every keyable thread row in an answer (or a bare list), once each. */
export function threadRows(answer) {
  const raw = Array.isArray(answer) ? answer : list(get(answer, "threads"));
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const row = threadRow(item);
    if (!row || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

/** Whether a row matches the search: its title, id, summary or one of its agents. */
export function matches(row, query) {
  const q = text(query).trim().toLowerCase();
  if (!q) return true;
  const hay = [row?.title, row?.id, row?.summary, ...list(row?.agents)].map(text).join(" ").toLowerCase();
  return hay.includes(q);
}

/** The states the rows are in, with how many each: { needsYou: 2, working: 1 }. Zeros left out. */
export function stateCounts(rows) {
  const out = {};
  for (const row of list(rows)) {
    const s = stateOf(row?.state);
    out[s] = (out[s] ?? 0) + 1;
  }
  return out;
}

/** The thread list in its groups, needs-you first, after the search and the one state filter. */
export function groupThreads(rows, { query = "", state = null } = {}) {
  const shown = list(rows).filter((r) => r && matches(r, query) && (!state || r.state === state));
  return STATE_ORDER
    .map((s) => ({ state: s, label: GROUP_LABELS[s], rows: shown.filter((r) => r.state === s) }))
    .filter((g) => g.rows.length > 0);
}

/** The rows in the order they are drawn: what J and K walk through. */
export const drawnOrder = (groups) => list(groups).flatMap((g) => list(g?.rows));

/** A sub-tab id the thread view knows, else Conversation. */
export const subOrDefault = (sub) => (SUB_TABS.some((t) => t.id === sub) ? sub : "conversation");

/** The one-line breadcrumb: Threads › <title> › <sub-tab>. */
export function breadcrumb(title, sub) {
  const tab = SUB_TABS.find((t) => t.id === sub);
  return ["Threads", text(title) || "Thread", ...(tab ? [tab.label] : [])];
}

/** The word a conversation entry carries, muted, in place of a pill. */
function entryWord(raw) {
  const kind = text(get(raw, "kind"));
  if (kind === "board") return text(get(raw, "boardKind")) || "note";
  if (kind === "comment") return "comment";
  return "reply";
}

/** One conversation entry: type word, author, time, first line, and whether it expands. */
export function conversationEntry(raw, i) {
  const body = text(get(raw, "text"));
  if (!body.trim()) return null;
  const at = text(get(raw, "at"));
  const ref = text(get(raw, "ref"));
  return {
    key: `${ref || at || "e"}-${i}`,
    word: entryWord(raw),
    from: text(get(raw, "from")) || "the team",
    to: text(get(raw, "to")),
    at,
    first: leadLine(body),
    more: hasMore(body),
    machine: Boolean(machineKind(body)),
    text: body,
  };
}

/** The thread's conversation, newest last, the last `max` entries. */
export function conversation(show, max = SHOWN_ENTRIES) {
  const raw = list(get(get(show, "conversation"), "entries"));
  const out = raw.map((e, i) => conversationEntry(e, i)).filter(Boolean);
  return out.slice(Math.max(0, out.length - max));
}

/** The thread's plan document, or null when it has none. */
export function planModel(show) {
  const plan = get(show, "plan");
  const markdown = text(get(plan, "markdown"));
  const id = text(get(plan, "id"));
  if (!id && !markdown) return null;
  return { id, title: text(get(plan, "title")) || id, status: text(get(plan, "status")), round: num(get(plan, "round")), markdown, plan };
}

/** The thread's steps: number, title, agent, state word. */
export function stepsModel(show) {
  const steps = get(show, "steps");
  const items = list(get(steps, "items") ?? steps).map((s, i) => ({
    n: num(get(s, "n")) || i + 1,
    title: text(get(s, "title")) || `Step ${i + 1}`,
    agent: text(get(s, "agent")),
    status: text(get(s, "status")) || "todo",
  }));
  return { done: fraction(get(steps, "done"), get(steps, "total")), items };
}

/** The thread's diff stat: files with +/−, the totals, and whether git could answer. */
export function changesModel(show) {
  const ch = get(show, "changes");
  const files = list(get(ch, "files"))
    .map((f) => ({ path: text(get(f, "path")), added: num(get(f, "added")), removed: num(get(f, "removed")) }))
    .filter((f) => f.path);
  const count = num(get(ch, "filesChanged")) || files.length;
  const added = num(get(ch, "added"));
  const removed = num(get(ch, "removed"));
  return {
    available: Boolean(get(ch, "available")) && files.length > 0,
    files,
    truncated: Boolean(get(ch, "truncated")),
    branch: text(get(ch, "branch")),
    from: text(get(ch, "from")),
    summary: count ? `${count} ${count === 1 ? "file" : "files"} · +${added} −${removed}` : "",
  };
}

/** The goal row: ◎, gate, elapsed, retries left, the judge's last reason; null for a non-Goal. */
export function goalRowModel(progress) {
  if (!get(progress, "isGoal")) return null;
  const gate = get(progress, "gate");
  const retries = get(progress, "retries");
  const left = num(get(retries, "left"));
  const paused = Boolean(get(progress, "paused")) || text(get(progress, "status")) === "paused";
  return {
    task: text(get(progress, "task")),
    title: text(get(progress, "title")) || "Goal",
    gate: fraction(get(gate, "passed"), get(gate, "total")),
    reached: Boolean(get(gate, "reached")),
    elapsed: text(get(progress, "elapsed")),
    retries: get(retries, "cap") == null ? "" : `${left} ${left === 1 ? "retry" : "retries"} left`,
    reason: firstLine(get(progress, "lastReason"), 160),
    paused,
    stopped: text(get(progress, "status")) === "stopped",
  };
}

/** The parts of the goal row after its glyph, in reading order, empty ones left out. */
export function goalRowParts(model) {
  if (!model) return [];
  const gate = model.gate ? `${model.reached ? "Gate reached" : "Gate"} ${model.gate}` : "";
  return [gate, model.elapsed, model.retries, model.paused ? "Paused" : ""].filter(Boolean);
}

/** A question's options, as up to nine labels (strings, or { label } records). */
export function questionOptions(question) {
  return list(get(question, "options"))
    .map((o) => (typeof o === "string" ? o : text(get(o, "label"))))
    .filter(Boolean)
    .slice(0, 9);
}

/** Which option a key picks: "1"…"9" to 0…8 when that option exists, else -1. */
export function optionForKey(key, count) {
  const k = text(key);
  if (!/^[1-9]$/.test(k)) return -1;
  const i = Number(k) - 1;
  return i < num(count) ? i : -1;
}

/** "$1.82 · 58.3M tokens · 2h" from a cost record, with the formatters the caller passes. */
export function costLine(cost, { price = (n) => `$${n}`, compact = (n) => String(n), duration = (ms) => `${ms}ms` } = {}) {
  const usd = num(get(cost, "costUsd"));
  const tokens = num(get(cost, "tokens"));
  const minutes = num(get(cost, "minutes"));
  return [usd ? price(usd) : "", tokens ? `${compact(tokens)} tokens` : "", minutes ? duration(minutes * 60000) : ""].filter(Boolean).join(" · ");
}

/** The peek drawer: who it is, its line, recent output, the open question, where a reply goes. */
export function peekModel(answer, agent = null) {
  const question = get(answer, "question");
  const target = get(answer, "replyTarget");
  const summary = get(answer, "summary");
  const address = text(get(agent, "address")) || text(get(target, "address"));
  return {
    title: text(get(answer, "title")) || text(get(agent, "name")) || "Thread",
    state: stateOf(get(answer, "state") ?? get(agent, "state")),
    summary: firstLine(text(get(summary, "text")) || text(get(agent, "summary"))),
    output: list(get(answer, "output")).slice(-PEEK_LINES)
      .map((o) => ({ from: text(get(o, "from")), at: text(get(o, "at")), text: firstLine(get(o, "text"), 220) }))
      .filter((o) => o.text),
    question: question && text(get(question, "text")) ? { text: text(get(question, "text")), from: text(get(question, "from")), options: questionOptions(question) } : null,
    reply: address ? { address, name: text(get(agent, "name")) || text(get(target, "name")) || address } : null,
    harness: text(get(agent, "harness")),
    model: text(get(agent, "model")),
    cost: get(answer, "cost") ?? null,
  };
}

/** The status bar: the machine, the branch, the agent count. */
export function statusModel(space, agentList) {
  const n = list(agentList).length;
  return {
    machine: text(get(space, "machine")) || "This computer",
    branch: text(get(space, "branch")),
    agents: `${n} ${n === 1 ? "agent" : "agents"}`,
  };
}

/** The palette's key as bound ("Ctrl+Shift+P  commands"), or just "commands" without a binding. */
export function paletteHint(binding, mac = false) {
  const keys = text(get(binding, "keys"));
  if (!keys) return "commands";
  const mod = { cmd: mac ? "⌘" : "Ctrl+", ctrl: mac ? "⌃" : "Ctrl+", shift: mac ? "⇧" : "Shift+", alt: mac ? "⌥" : "Alt+", option: mac ? "⌥" : "Alt+" };
  const parts = keys.endsWith("--") ? [...keys.slice(0, -2).split("-"), "-"] : keys.split("-");
  return `${parts.map((p) => mod[p.toLowerCase()] ?? p.toUpperCase()).join("")}  commands`;
}
