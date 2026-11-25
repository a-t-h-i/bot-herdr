// The Agents graph: the Orchestrator on the left, one chain per task in progress (lead → worker →
// task card) joined by dotted edges a small dot travels along, the lead's step pills, each task's
// reports-back line, the bench, and the detail panel for the picked agent. Geometry comes from
// agentsgraphlayout.js (pure, tested); this file only draws it. agents.js owns the state.

import { div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { TYPE_SCALE, SPACE, RADIUS, CHIP, DOT, GLYPH, ICON, STATE, stateTone, clickable } from "./look.js";
import { mentionTone, roleTone } from "./indicators.js";
import { alpha } from "./working.js";
import { sectionLabel } from "./plandoc.js";
import { actionButton } from "./button.js";
import { count, ago } from "./numbers.js";
import { GRAPH, pointAt, dotProgress, benchGrid, relativeTo } from "./agentsgraphlayout.js";

/** The detail panel's width beside the graph. */
export const PANEL_W = 320;
/** The faint grid's pitch and the travelling dot's size. */
const GRID = 32;
const TRAVEL = 6;
const BENCH_H = 40;

/** An agent's colour: its role's when it has one, else its name's. */
export const toneOf = (c, a) => (a?.role && a.role !== "custom" ? roleTone(c, a.role) : mentionTone(c, a?.name ?? a?.label ?? ""));

/** A role word with its first letter up: "dev" is "Dev". */
const roleWord = (role) => (role ? String(role).charAt(0).toUpperCase() + String(role).slice(1) : "");

/** Text in the user's mono face, when they have one. */
const monoed = (el, mono) => (mono ? el.font_family(mono) : el);

/** The gap between two dots on a dotted line, and a dot's size. */
const PITCH = 6;
const SPECK = 2;

/** One dotted stretch of an edge: a row (or column) of 2px dots. A dashed border on a 0-wide box draws nothing in gpui. */
function segment(a, b, tone) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.floor(len / PITCH));
  return Array.from({ length: n + 1 }, (_, i) => {
    const x = a[0] + ((b[0] - a[0]) * i) / n;
    const y = a[1] + ((b[1] - a[1]) * i) / n;
    return div().absolute().left(x - SPECK / 2).top(y - SPECK / 2).size(SPECK).rounded_full().bg(tone);
  });
}

/** A polyline's dotted stretches. */
const dotted = (points, tone) => points.slice(1).flatMap((p, i) => segment(points[i], p, tone));

/** An absolutely placed box for a node: `clickable` makes its element relative, so it goes inside. */
const placed = (n, inner) => div().absolute().left(n.x).top(n.y).w(n.w).h(n.h).child(inner);

/** The small filled dot on an edge, `t` of the way along it. */
function travelDot(id, points, t, tone) {
  const [x, y] = pointAt(points, t);
  return div().id(id).absolute().left(x - TRAVEL / 2).top(y - TRAVEL / 2).size(TRAVEL).rounded_full().bg(tone);
}

/** An edge's label: centred above a level line (under it for reports back), beside an upright one. */
function edgeLabel(c, e, tone, mono) {
  if (!e.label) return null;
  // A level label keeps to its stretch of line, so it never runs under the nodes either side.
  const w = e.at.level && !e.below ? Math.max(40, e.at.len - SPACE[3]) : 168;
  const el = div().id(`${e.id}-label`).absolute().truncate().text_size(TYPE_SCALE.metadata).text_color(tone);
  const placed = e.at.level
    ? el.w(w).left(e.at.x - w / 2).top(e.below ? e.at.y + SPACE[2] : e.at.y - GRAPH.labelH).text_center()
    : el.w(w).left(e.at.x + SPACE[3]).top(e.at.y - GRAPH.labelH / 2);
  return (e.mono ? monoed(placed, mono) : placed).child(e.label);
}

/** The faint dot grid behind the graph. */
function dotGrid(c, w, h) {
  const tone = alpha(c.textMuted, 0.16);
  const cols = Math.max(0, Math.floor(w / GRID));
  const rows = Math.max(0, Math.floor(h / GRID));
  const dots = [];
  for (let r = 1; r <= rows; r++) for (let k = 1; k <= cols; k++) dots.push(div().absolute().left(k * GRID).top(r * GRID).size(2).rounded_full().bg(tone));
  return div().absolute().top(0).left(0).w(w).h(h).children(dots);
}

/** A node's box: placed, rounded, edged in `edge`, filled when picked. */
function nodeBox(c, n, edge, picked, tone) {
  return h_flex().size_full().px(SPACE[4]).gap(SPACE[3]).items_center()
    .rounded(RADIUS.control).border_1().border_color(picked ? tone : edge).bg(picked ? alpha(tone, 0.08) : c.ground);
}

/** Two lines in a node: the name in its colour, then a quiet line. */
function nodeText(c, name, tone, line, { mono = null, live = false } = {}) {
  return v_flex().flex_1().min_w(0).gap(SPACE[1])
    .child(h_flex().gap(SPACE[2]).items_center()
      .child(div().min_w(0).truncate().text_size(TYPE_SCALE.body).font_semibold().text_color(tone).child(name))
      .when(live, (el) => el.child(div().flex_none().size(DOT).rounded_full().bg(stateTone(c, "working")))))
    .child(monoed(div().truncate().text_size(TYPE_SCALE.metadata).text_color(c.textMuted), mono).child(line));
}

/** The Orchestrator: who briefs every chain. */
function orchNode(c, n, routing) {
  return placed(n, nodeBox(c, n, c.edge, false, c.textPrimary).id("bh-graph-orch").bg(c.fill)
    .child(svg(ICON("users")).flex_none().size(GLYPH.lg).text_color(c.textSecondary))
    .child(nodeText(c, "Orchestrator", c.textPrimary, `Routing ${count(routing, "task")}`)));
}

/** A lead or worker node, tinted in its role's colour; a click picks it. */
function agentNode(c, n, g) {
  const a = n.agent;
  const tone = toneOf(c, a);
  const picked = g.picked && g.picked === a.name;
  const lead = n.kind === "lead";
  const line = lead ? `Supervising ${g.chains[n.chain]?.task?.title ?? ""}` : [a.harness, a.at ? ago(a.at) : ""].filter(Boolean).join(" · ") || "Not running";
  const box = nodeBox(c, n, alpha(tone, 0.5), picked, tone)
    .role("button")
    .accessibility_label(`${a.name}: ${lead ? "lead" : "worker"}`)
    .aria_selected(Boolean(picked))
    .on_click((_e, cx) => g.onPick(a, cx))
    .when(!lead, (el) => el.child(svg(ICON("page-terminals")).flex_none().size(GLYPH.lg).text_color(tone)))
    .child(nodeText(c, a.name, tone, line, { mono: lead ? null : g.mono, live: !lead && a.state === "working" }));
  return placed(n, clickable(box, c, `bh-graph-${n.id}`, { fill: alpha(tone, 0.08), edge: true }));
}

/** A task's card: its state word, title, the step's done-when and how many agents feed it. */
function taskCard(c, n, g) {
  const ch = g.chains[n.chain];
  const t = ch.task;
  const s = STATE[t.state] ?? STATE.working;
  const word = t.state === "working" ? "In progress" : s.word;
  const box = v_flex().size_full().p(SPACE[4]).gap(SPACE[1]).justify_center()
    .rounded(RADIUS.card).border_1().border_color(c.edge).bg(c.fill)
    .role("link").accessibility_label(`${word}: ${t.title}`)
    .on_click(() => g.onOpenTask(t))
    .child(div().text_size(TYPE_SCALE.metadata).font_medium().text_color(stateTone(c, t.state)).child(word.toUpperCase()))
    .child(div().truncate().text_size(TYPE_SCALE.title).font_semibold().text_color(c.textPrimary).child(t.title))
    .when(Boolean(ch.done), (el) => el.child(div().truncate().text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child(`Done when: ${ch.done}`)))
    .child(monoed(div().text_size(TYPE_SCALE.metadata).text_color(c.textSecondary), g.mono).child(`${count(ch.feeding, "agent")} feeding`));
  return placed(n, clickable(box, c, `bh-graph-${n.id}`, { fill: c.hover, edge: true }));
}

/** A step pill under its lead: a dot and the step, in the role's colour. */
function stepPill(c, p) {
  const tone = toneOf(c, p.agent);
  return h_flex().id(p.id).absolute().left(p.x).top(p.y).w(p.w).h(p.h).px(SPACE[4]).gap(SPACE[2]).items_center().justify_center()
    .rounded_full().border_1().border_color(alpha(tone, 0.5)).bg(c.ground)
    .child(div().flex_none().size(DOT).rounded_full().bg(tone))
    .child(div().min_w(0).truncate().text_size(TYPE_SCALE.metadata).text_color(tone).child(p.label));
}

/** An edge's colour: its source agent's, else quiet. */
const edgeTone = (c, e) => (e.from ? alpha(toneOf(c, e.from), 0.7) : c.textMuted);

/** Every edge and bracket: dotted lines, labels and their dots. */
function edges(c, layout, g) {
  const t = dotProgress(g.tick, g.reduced || !g.moving);
  const out = [];
  for (const b of layout.brackets) out.push(...dotted(b.points, alpha(toneOf(c, b.agent), 0.6)));
  for (const e of layout.edges) {
    const tone = edgeTone(c, e);
    out.push(...dotted(e.points, tone), travelDot(`${e.id}-dot`, e.points, t, e.from ? toneOf(c, e.from) : c.textSecondary), edgeLabel(c, e, e.from ? toneOf(c, e.from) : c.textMuted, g.mono));
  }
  return out.filter(Boolean);
}

/** The graph itself: grid, edges, then nodes and pills on top. */
function canvas(c, layout, width, g) {
  const nodes = layout.nodes.map((n) => (n.kind === "orch" ? orchNode(c, n, g.chains.length) : n.kind === "card" ? taskCard(c, n, g) : agentNode(c, n, g)));
  return div().id("bh-graph-canvas").relative().w(width).h(layout.height)
    .children(edges(c, layout, g))
    .children(layout.pills.map((p) => stepPill(c, p)))
    .children(nodes);
}

/** One bench card: a ready roster agent (dot, name, Ready) or an idle terminal (dashed, terminal icon). */
function benchCard(c, r, w, g) {
  const tone = toneOf(c, { name: r.label, role: r.role });
  const idle = r.running;
  const role = roleWord(r.role);
  const line = idle ? ["Idle", ago(r.at)].filter(Boolean).join(" ") + (role ? ` · ${role}` : "") : "Ready";
  const box = h_flex().w(w).h(BENCH_H).px(SPACE[4]).gap(SPACE[3]).items_center().rounded(RADIUS.control).border_1().border_color(c.edge).bg(c.ground)
    .when(idle, (el) => el.border_dashed())
    .when(g.picked === r.label || (r.name && g.picked === r.name), (el) => el.border_color(tone))
    .role("button").accessibility_label(`${r.label}: ${line}`)
    .on_click((_e, cx) => g.onPick(r, cx))
    .child(idle ? svg(ICON("page-terminals")).flex_none().size(GLYPH.md).text_color(c.textMuted) : div().flex_none().size(DOT + 2).rounded_full().bg(tone))
    .child(div().flex_none().text_size(TYPE_SCALE.body).font_semibold().text_color(idle ? c.textSecondary : tone).child(r.label))
    .child(div().min_w(0).truncate().text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child(line));
  return clickable(box, c, `bh-bench-${String(r.address ?? r.label)}`, { fill: c.hover, edge: true });
}

/** On the bench: every roster agent not running, and every idle running terminal. */
function bench(c, rows, inner, g) {
  if (!rows.length) return null;
  const grid = benchGrid(inner, rows.length);
  return v_flex().px(GRAPH.pad).pb(GRAPH.pad).gap(SPACE[3])
    .child(sectionLabel(c, "ON THE BENCH"))
    .child(h_flex().flex_wrap().gap(SPACE[4]).children(rows.map((r) => benchCard(c, r, grid.w, g))));
}

/**
 * The graph card, `width` wide. `g` holds { chains, layout, bench, tick, reduced, moving, picked,
 * mono, onPick(agent, cx), onOpenTask(task) }.
 */
export function graphCard(c, width, g) {
  const inner = Math.max(0, width - GRAPH.pad * 2);
  const benchRows = Math.ceil(g.bench.length / Math.max(1, benchGrid(inner, g.bench.length).cols));
  const h = g.layout.height + (g.bench.length ? benchRows * (BENCH_H + SPACE[4]) + 40 : 0);
  return v_flex().id("bh-graph").relative().flex_none().w(width).rounded(RADIUS.card).border_1().border_color(c.edge).overflow_hidden()
    .child(dotGrid(c, width, h))
    .child(canvas(c, g.layout, width, g))
    .child(bench(c, g.bench, inner, g));
}

/** A key and its value in the panel. */
function kv(c, key, value, { tone = null, mono = null } = {}) {
  return h_flex().gap(SPACE[4]).items_center().min_h(28)
    .child(div().flex_none().w(96).text_size(TYPE_SCALE.body).text_color(c.textMuted).child(key))
    .child(monoed(div().flex_1().min_w(0).truncate().text_size(TYPE_SCALE.body).text_color(tone ?? c.textPrimary), mono).child(value));
}

/** One LIVE line: a dot, what happened (mono) and when. */
function liveLine(c, line, i, mono) {
  return h_flex().gap(SPACE[3]).items_center().min_h(28)
    .child(div().flex_none().size(DOT).rounded_full().bg(i === 0 ? stateTone(c, "working") : alpha(c.textMuted, 0.6)))
    .child(monoed(div().flex_1().min_w(0).truncate().text_size(TYPE_SCALE.body).text_color(i === 0 ? c.textPrimary : c.textSecondary), mono).child(line.text))
    .when(Boolean(line.when), (el) => el.child(div().flex_none().text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child(line.when)));
}

/** The panel's head: the task (or agent) in the role's colour, its state chip and the close ×. */
function panelHead(c, p, tone, onClose) {
  const state = p.task?.state ?? p.agent.state ?? "idle";
  const word = STATE[state]?.word ?? "Idle";
  const chipTone = stateTone(c, state);
  return h_flex().gap(SPACE[3]).items_center()
    .child(div().min_w(0).truncate().text_size(TYPE_SCALE.title).font_semibold().text_color(tone).child(p.task?.title ?? p.agent.label ?? p.agent.name))
    .child(div().flex_none().h(CHIP).px(SPACE[3]).flex().items_center().rounded(SPACE[2]).bg(alpha(chipTone, 0.16)).text_size(TYPE_SCALE.metadata).font_medium().text_color(chipTone).child(word))
    .child(div().flex_1())
    .child(actionButton(c, "bh-graph-panel-close", null, onClose, { icon: "x", tone: "quiet", tooltip: "Close (Esc)", a11y: "Close the detail panel" }));
}

/**
 * The detail panel for the picked agent. `p` holds { agent, task, parent, top (it is the Orchestrator), root, lines, mono,
 * onClose, onOpen, onMessage, onPause }; `width` is its width (full width when stacked).
 */
export function detailPanel(c, width, p) {
  const a = p.agent;
  const tone = toneOf(c, { name: a.label ?? a.name, role: a.role });
  const where = relativeTo(a.cwd, p.root);
  return v_flex().id("bh-graph-panel").role("region").accessibility_label(`${a.label ?? a.name}: details`)
    .flex_none().w(width).p(GRAPH.pad).gap(SPACE[5]).rounded(RADIUS.card).border_1().border_color(c.edge)
    .child(panelHead(c, p, tone, p.onClose))
    .child(v_flex().gap(SPACE[1])
      .when(!p.top, (el) => el.child(kv(c, "Parent", p.parent?.name ?? "Orchestrator", { tone: p.parent ? toneOf(c, p.parent) : null })))
      .when(Boolean(p.task), (el) => el.child(kv(c, "Task", p.task?.title ?? "")))
      .when(Boolean(a.harness), (el) => el.child(kv(c, "Runtime", a.harness, { mono: p.mono })))
      .when(Boolean(where), (el) => el.child(kv(c, "Working in", where, { mono: p.mono }))))
    .child(v_flex().gap(SPACE[2])
      .child(div().text_size(TYPE_SCALE.metadata).font_semibold().text_color(c.textMuted).child("LIVE"))
      .when(!p.lines.length, (el) => el.child(div().text_size(TYPE_SCALE.body).text_color(c.textMuted).child(a.running === false ? "Not running. Start it from the chat." : "Nothing yet.")))
      .children(p.lines.map((line, i) => liveLine(c, line, i, p.mono))))
    .child(div().flex_1().min_h(SPACE[5]))
    .child(h_flex().flex_wrap().gap(SPACE[3])
      .child(actionButton(c, "bh-graph-open", "Open session", p.onOpen, { tone: "primary", disabled: !a.address, tooltip: "Show its terminal (Enter)" }))
      .child(actionButton(c, "bh-graph-message", "Message", p.onMessage, { disabled: !a.address, tooltip: "Peek and reply (Space)" }))
      .child(actionButton(c, "bh-graph-pause", "Pause", p.onPause, { disabled: !p.task, tooltip: p.task ? "Pause this task" : "Not on a task" })));
}
