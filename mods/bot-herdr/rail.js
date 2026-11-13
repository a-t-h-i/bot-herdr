// The agents rail beside the chat: who works now, on what, for how long, and who needs you.
// Grouping, order, the elapsed time and the width that keeps the rail beside the chat are here,
// without drawing, so `npm test` can check them; railview.js draws with gpui.

import { SIZE } from "./look.js";

/** The rail's own width, and the gap between it and the chat column. */
export const RAIL_W = 248;
export const RAIL_GAP = 16;

/** The groups, in the order the rail draws them. */
export const GROUPS = [
  { id: "needs", label: "Needs you" },
  { id: "working", label: "Working" },
  { id: "idle", label: "Idle" },
];

/** The group an agent is in: a blocked one, or one with a question open, needs you. */
export function groupOf(status, asked) {
  if (asked || status === "blocked") return "needs";
  return status === "working" ? "working" : "idle";
}

/** A group's name, as a row reads it out. */
export const groupLabel = (id) => GROUPS.find((g) => g.id === id)?.label ?? "Idle";

/** How long ago a status began, as the rail shows it: "now" under a minute, "12m", "1h 5m". */
export function elapsed(at, now = Date.now()) {
  const minutes = Math.floor((now - Number(at ?? now)) / 60000);
  if (!Number.isFinite(minutes) || minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** A question as one line: its first question's first line, else its title. */
export function questionLine(q) {
  const text = q?.questions?.[0]?.text ?? q?.title ?? "";
  return String(text).split("\n").map((s) => s.trim()).find(Boolean) ?? "";
}

/** The muted line under a name: its question, what it is doing and for how long, or that it waits. */
export function note(row, now = Date.now()) {
  if (row.group === "needs") return questionLine(row.question) || "Needs you";
  if (row.group !== "working") return "Waiting for a task";
  const line = [row.doing, row.since == null ? null : elapsed(row.since, now)].filter(Boolean).join(" · ");
  return line || "Working";
}

/** The Orchestrator first, then by name. */
export function order(a, b) {
  if (Boolean(a.lead) !== Boolean(b.lead)) return a.lead ? -1 : 1;
  return String(a.name).localeCompare(String(b.name));
}

/**
 * The rail's groups, each with its rows in order and the line each shows; a group with no rows
 * is left out. A row is { address, name, lead, status, question, doing, since }.
 */
export function groups(list, now = Date.now()) {
  const rows = list.map((r) => ({ ...r, group: groupOf(r.status, Boolean(r.question)) })).sort(order);
  return GROUPS
    .map((g) => ({ ...g, rows: rows.filter((r) => r.group === g.id).map((r) => ({ ...r, note: note(r, now) })) }))
    .filter((g) => g.rows.length);
}

/** How many of these agents are at work (what the folded button counts). */
export const workingCount = (list) => list.filter((r) => groupOf(r.status, Boolean(r.question)) === "working").length;

/** Whether the rail fits beside the chat column; below that width it folds to its button. */
export const showsRail = (width) => width >= SIZE.maxWidth + RAIL_GAP + RAIL_W + SIZE.gutter * 2;
