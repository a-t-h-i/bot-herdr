// Usage roll-ups for `bh metrics`: per agent and for the whole team, over a window, from what each
// agent terminal recorded (DATA/usage/*.jsonl, mirrored on its task). Aggregation is pure; the two
// readers here only load the price table.
//
// What a harness did not report is estimated and marked estimated: a turn with tokens but no cost
// is priced from the model's prices; a turn with only time gets the uncached tokens per minute of
// reported turns on the same model (else of all reported turns), split as those were, then priced.
// A usage file is never changed by any of this.

import { join } from "node:path";
import { slug } from "../../roster.js";
import { DATA, ENGINE, readJson } from "./core.mjs";

export const WINDOWS = ["today", "7d", "30d", "all"];
export const DEFAULT_WINDOW = "7d";
const DAYS = { today: 1, "7d": 7, "30d": 30, all: 30 }; // all: the last 30 days of bars
const TOKENS = ["input", "output", "cacheRead", "cacheWrite"];
const pad = (n) => String(n).padStart(2, "0");

/** A local day, "YYYY-MM-DD": the user's days, not UTC. */
export const dayKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Local midnight `back` days before `now` (month and DST safe). */
const dayStart = (now, back = 0) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);

/** The window's name, its first moment (null for all) and the days its bars show, oldest first. */
export function windowOf(name, now = new Date()) {
  const window = WINDOWS.includes(name) ? name : DEFAULT_WINDOW;
  const days = [];
  for (let i = DAYS[window] - 1; i >= 0; i--) days.push(dayKey(dayStart(now, i)));
  return { window, from: window === "all" ? null : dayStart(now, DAYS[window] - 1), to: now, days };
}

/** The price table: the engine's, with the user's `DATA/prices.json` overriding models and aliases. */
export function readPrices({ data = DATA, engine = ENGINE } = {}) {
  const base = readJson(join(engine, "prices.json"), {}) ?? {};
  const own = readJson(join(data, "prices.json"), null);
  if (!own) return base;
  return {
    updated: own.updated ?? base.updated ?? null,
    models: { ...(base.models ?? {}), ...(own.models ?? {}) },
    aliases: { ...(base.aliases ?? {}), ...(own.aliases ?? {}) },
  };
}

/** One record per turn: the global file and the task's copy are the same turn (`at` and `agent`). */
export function dedupe(records) {
  const seen = new Set();
  return records.filter((r) => {
    const key = `${r.at}|${r.agent}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const number = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Whether a turn reported its tokens or cost: new records say so, old ones are read off the fields. */
const gaveTokens = (r) => (typeof r.reported?.tokens === "boolean" ? r.reported.tokens : TOKENS.some((k) => number(r[k]) !== null));
const gaveCost = (r) => (typeof r.reported?.cost === "boolean" ? r.reported.cost : number(r.costUsd) !== null);

/** A record's model for prices: `harness/default` when it ran its harness's default model. */
const modelKey = (r) => r.model || `${r.harness ?? "unknown"}/default`;

/** The model's prices, following one alias (`claude/default` for the lead's default model), or null. */
function priceOf(prices, r) {
  const key = modelKey(r);
  return prices?.models?.[prices?.aliases?.[key] ?? key] ?? null;
}

/**
 * What a turn's tokens cost at the model's prices, or null when there is no price for it. A null
 * `cacheWrite` means the provider has no separate rate for it: its tokens cost the input price.
 */
function costOf(price, tokens) {
  if (!price) return null;
  const rate = (key) => {
    const own = price[key];
    if (typeof own === "number") return own;
    return key === "cacheWrite" && own === null ? Number(price.input) || 0 : 0;
  };
  return TOKENS.reduce((sum, k) => sum + ((tokens[k] ?? 0) * rate(k)) / 1e6, 0);
}

/** Uncached tokens per minute and the input share, over the turns that reported their tokens. */
function rates(list) {
  const sum = { ms: 0, input: 0, output: 0 };
  for (const r of list) {
    if (!gaveTokens(r)) continue;
    sum.ms += number(r.ms) ?? 0;
    sum.input += number(r.input) ?? 0;
    sum.output += number(r.output) ?? 0;
  }
  const minutes = sum.ms / 60000;
  const tokens = sum.input + sum.output;
  return minutes > 0 && tokens > 0 ? { perMinute: tokens / minutes, share: sum.input / tokens } : null;
}

/** The rate for a turn's own model when it reported none of its own, else the rate of all turns. */
function rateLookup(list) {
  const byModel = new Map();
  for (const r of list) byModel.set(modelKey(r), [...(byModel.get(modelKey(r)) ?? []), r]);
  const all = rates(list);
  return (r) => rates(byModel.get(modelKey(r)) ?? []) ?? all;
}

/**
 * One turn's tokens and cost, and which of the two had to be estimated (the record is untouched).
 * `tokens` is null when the harness reported none and no rate could estimate them; `costUsd` is
 * null when nothing was reported and no price table covers the model.
 */
function turnNumbers(r, { prices, ratesFor }) {
  const estimated = { tokens: false, cost: false };
  let tokens = null;
  if (gaveTokens(r)) {
    tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    for (const k of TOKENS) tokens[k] = number(r[k]) ?? 0;
  } else {
    const rate = ratesFor(r);
    const minutes = (number(r.ms) ?? 0) / 60000;
    if (rate && minutes > 0) {
      const total = Math.round(rate.perMinute * minutes);
      tokens = { input: Math.round(total * rate.share), output: 0, cacheRead: 0, cacheWrite: 0 };
      tokens.output = total - tokens.input;
      estimated.tokens = true;
    }
  }
  const reported = gaveCost(r) ? number(r.costUsd) ?? 0 : null;
  const priced = reported === null && tokens ? costOf(priceOf(prices, r), tokens) : null;
  if (priced !== null) estimated.cost = true;
  return { tokens, costUsd: reported ?? priced, estimated };
}

/** ids and display names for the roster: a built-in agent's id is its role, a custom agent's its slug. */
function rosterIndex(agents) {
  const known = new Map();
  for (const a of agents) {
    const id = a.role === "custom" ? slug(a.name) : a.role;
    if (!known.has(id)) known.set(id, { id, name: a.name, harness: a.harness ?? null });
  }
  return { known, prefixes: [...known.keys()].sort((a, b) => b.length - a.length) };
}

/** The agent a record or step belongs to: its role, or its name rolled up to the longest roster id. */
function idFor(name, role, index) {
  const base = String(role ?? "").trim() ? slug(role) : String(name ?? "").trim() ? slug(name) : "unknown";
  if (index.known.has(base)) return base;
  return index.prefixes.find((p) => base.startsWith(p)) ?? base;
}

/** A row's counters. */
const counters = () => ({
  timeMs: 0,
  turns: 0,
  tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  costUsd: 0,
  priced: false,
  hasTokens: false,
  tasks: new Set(),
  steps: 0,
  estimated: { tokens: false, cost: false },
  models: new Map(),
  daily: new Map(),
});

/** The row for an agent, made on its first turn. */
function rowFor(rows, id, index) {
  if (!rows.has(id)) {
    const member = index.known.get(id);
    rows.set(id, { id, name: member?.name ?? id, role: id, harness: member?.harness ?? null, ...counters() });
  }
  return rows.get(id);
}

/** Adds a turn to a row; `day` is its local date. */
function addTurn(row, r, turn, day) {
  const ms = number(r.ms) ?? 0;
  row.timeMs += ms;
  row.turns += 1;
  if (turn.tokens) {
    row.hasTokens = true;
    for (const k of TOKENS) row.tokens[k] += turn.tokens[k];
  }
  row.estimated.tokens ||= turn.estimated.tokens;
  row.estimated.cost ||= turn.estimated.cost;
  if (turn.costUsd !== null) {
    row.costUsd += turn.costUsd;
    row.priced = true;
  }
  if (r.task) row.tasks.add(r.task);
  row.models.set(r.model ?? "default", (row.models.get(r.model ?? "default") ?? 0) + 1);
  const bucket = row.daily.get(day) ?? { timeMs: 0, turns: 0 };
  bucket.timeMs += ms;
  bucket.turns += 1;
  row.daily.set(day, bucket);
}

/** Each agent's done steps whose work finished inside the window, rolled up like the records. */
function stepCounts(tasks, span, index) {
  const from = span.from ? span.from.getTime() : -Infinity;
  const to = span.to.getTime();
  const counts = new Map();
  for (const t of tasks) {
    for (const s of t.steps ?? []) {
      const at = Date.parse(s.finished);
      if (s.status !== "done" || !Number.isFinite(at) || at < from || at > to) continue;
      const id = idFor(s.agent, null, index);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}

/** How a row reads in the answer: totals as numbers, cost null when there was none to show. */
function outRow(row, days) {
  const models = [...row.models.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([m]) => m);
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    harness: row.harness,
    models,
    timeMs: row.timeMs,
    turns: row.turns,
    tokens: row.hasTokens ? { ...row.tokens } : null,
    costUsd: row.priced ? Number(row.costUsd.toFixed(4)) : null,
    tasks: row.tasks.size,
    steps: row.steps,
    estimated: { ...row.estimated },
    daily: days.map((day) => ({ day, timeMs: Math.round(row.daily.get(day)?.timeMs ?? 0), turns: row.daily.get(day)?.turns ?? 0 })),
  };
}

/**
 * The answer `bh metrics --json` prints: the window, the team's totals and one row per agent,
 * busiest first (`timeMs`), each with its days as `daily`. Pure: same inputs, same answer.
 */
export function metrics({ records = [], tasks = [], agents = [], prices = {}, window = DEFAULT_WINDOW, now = new Date() } = {}) {
  const span = windowOf(window, now);
  const index = rosterIndex(agents);
  const listed = within(records, span);
  const { rows, total } = collect(listed, { prices, ratesFor: rateLookup(listed), index });
  for (const [id, n] of stepCounts(tasks, span, index)) if (rows.has(id)) rows.get(id).steps += n;
  const list = [...rows.values()].sort((a, b) => b.timeMs - a.timeMs || a.name.localeCompare(b.name)).map((row) => outRow(row, span.days));
  return answerOf(span, outRow(total, span.days), list);
}

/** The records inside the window. */
function within(records, span) {
  const from = span.from ? span.from.getTime() : -Infinity;
  const to = span.to.getTime();
  return records.filter((r) => {
    const at = Date.parse(r.at);
    return Number.isFinite(at) && at >= from && at <= to;
  });
}

/** Every agent's counters over the window's records, and the same counters summed for the team. */
function collect(records, { prices, ratesFor, index }) {
  const rows = new Map();
  const total = counters();
  for (const r of records) {
    const row = rowFor(rows, idFor(r.agent, r.role, index), index);
    const turn = turnNumbers(r, { prices, ratesFor });
    const day = dayKey(new Date(r.at));
    addTurn(row, r, turn, day);
    addTurn(total, r, turn, day);
  }
  return { rows, total };
}

/** The answer's shape (board contract #4, as amended): tokens and cost are null when nobody reported them and nothing could be estimated. */
const answerOf = (span, sums, list) => ({
  window: span.window,
  from: span.from?.toISOString() ?? null,
  to: span.to.toISOString(),
  totals: {
    timeMs: sums.timeMs,
    turns: sums.turns,
    tokens: sums.tokens,
    costUsd: sums.costUsd,
    tasks: sums.tasks,
    steps: list.reduce((n, a) => n + a.steps, 0),
    estimated: sums.estimated,
  },
  agents: list,
});
