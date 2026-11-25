// The Agents graph's geometry, pure so `node --test` checks it: who sits on each task's chain
// (Orchestrator → lead → worker → task card), where every node, edge, step pill and bracket goes
// for a width, where a travelling dot is along an edge, and how the bench cards share a row.
// agentsgraph.js draws what this answers; nothing here imports gpui or herdr.

/** The graph's sizes in px (the 4/8 grid). */
export const GRAPH = {
  pad: 24,
  nodeH: 52,
  orchW: 176,
  leadW: 192,
  workW: 208,
  cardW: 216,
  cardH: 96, // state word, title and "N agents feeding"
  doneH: 20, // one more line: "Done when: …"
  edgeMin: 80, // room for a short action label like "edit chat.js"
  edgeMax: 160,
  labelH: 20, // the room an edge label takes above its line
  bus: 16, // from the Orchestrator's right edge to the bus later chains branch from
  pillW: 112,
  pillH: 28,
  pillGap: 8,
  bracket: 24, // from the lead's foot to the bracket's bar
  drop: 32, // from a chain's foot to its reports-back line
  chainGap: 24,
  indent: 32, // stacked: how far the chains sit in from the Orchestrator
  stackGap: 40, // stacked: the edge between two nodes
  minScale: 0.7, // below this the chains stack
  maxPills: 4,
};

/** One loop of a travelling dot, in 50ms ticks: 2.4s. */
export const CYCLE_TICKS = 48;

/** The role a name or agent is of: its `role`, else the name's first word ("design-graph" is design). */
export function roleKey(a) {
  const role = typeof a === "object" && a ? a.role : null;
  if (role && role !== "custom") return String(role).toLowerCase();
  const name = typeof a === "object" && a ? a.name : a;
  return String(name ?? "").trim().toLowerCase().split(/[-_\s.]/)[0];
}

/** What an agent is doing, as an edge label: its summary's first line, lower-cased, at most `max` long. */
export function actionOf(summary, max = 24) {
  const line = String(summary ?? "").split(/\r?\n/)[0].trim();
  if (!line || ["working", "idle", "needs you"].includes(line.toLowerCase())) return "";
  const lower = line.charAt(0).toLowerCase() + line.slice(1);
  return lower.length > max ? `${lower.slice(0, max - 1).trimEnd()}…` : lower;
}

/** A folder said from the project: "mods\\bot-herdr" for one inside it, "." for the project, else as given. */
export function relativeTo(cwd, root) {
  const norm = (p) => String(p ?? "").replace(/[\\/]+$/, "");
  const a = norm(cwd);
  const b = norm(root);
  if (!a) return "";
  if (!b) return a;
  if (a.toLowerCase() === b.toLowerCase()) return ".";
  const head = a.slice(0, b.length + 1).toLowerCase();
  return head === `${b.toLowerCase()}\\` || head === `${b.toLowerCase()}/` ? a.slice(b.length + 1) : a;
}

/** The running agent a name is, or a bare `{ name }` for one not running. */
function agentNamed(fleet, name) {
  return fleet.find((a) => String(a?.name ?? "") === name) ?? { name };
}

/** The steps a task's detail (bh task show) gives to an agent's role, at most `GRAPH.maxPills`. */
function pillsFor(steps, lead) {
  if (!lead || !Array.isArray(steps)) return [];
  const key = roleKey(lead);
  return steps
    .filter((s) => s?.agent && roleKey(String(s.agent)) === key)
    .map((s) => String(s.title ?? s.text ?? "").trim())
    .filter(Boolean)
    .slice(0, GRAPH.maxPills);
}

/** The step being worked now: the worker's active step, else the first active one. */
function currentStep(steps, worker) {
  if (!Array.isArray(steps)) return "";
  const active = steps.filter((s) => s?.status === "active");
  const mine = active.find((s) => String(s.agent ?? "") === String(worker?.name ?? ""));
  return String((mine ?? active[0])?.text ?? (mine ?? active[0])?.title ?? "").trim();
}

/**
 * One task's chain: its lead (the first agent on it; none when only one is on it), the worker
 * (the first other agent at work, else the second), the lead's step pills, the current step and
 * how many agents feed it. `detail` is the task's bh task show answer, when there is one.
 */
export function chainOf(task, fleet = [], detail = null) {
  const names = [...new Set([
    ...(Array.isArray(task?.agents) ? task.agents : []),
    ...fleet.filter((a) => a?.task && a.task === task?.id).map((a) => String(a.name ?? "")),
  ].filter(Boolean))];
  const agents = names.map((n) => agentNamed(fleet, n));
  const lead = agents.length > 1 ? agents[0] : null;
  const rest = agents.slice(lead ? 1 : 0);
  const worker = rest.find((a) => a.state === "working") ?? rest[0] ?? null;
  const steps = detail?.steps;
  return { task, lead, worker, names, pills: pillsFor(steps, lead), done: currentStep(steps, worker), feeding: names.length };
}

/** The node widths at a scale, rounded to whole px. */
function widths(scale) {
  const r = (n) => Math.round(n * scale);
  return { orch: r(GRAPH.orchW), lead: r(GRAPH.leadW), work: r(GRAPH.workW), card: r(GRAPH.cardW) };
}

/** How much the nodes shrink to fit `inner` beside three shortest edges; 1 when they fit as drawn. */
export function fitScale(inner) {
  const sum = GRAPH.orchW + GRAPH.leadW + GRAPH.workW + GRAPH.cardW;
  return Math.min(1, (inner - GRAPH.edgeMin * 3) / sum);
}

/** An edge's label point: the middle of its longest segment, above a level one, beside an upright one. */
function labelAt(points) {
  let best = null;
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    const len = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
    if (!best || len > best.len) best = { len, a, b };
  }
  if (!best) return { x: 0, y: 0, len: 0, level: true };
  const level = best.a[1] === best.b[1];
  return { x: (best.a[0] + best.b[0]) / 2, y: (best.a[1] + best.b[1]) / 2, len: best.len, level };
}

/** An edge with its label placed. */
function edge(id, kind, chain, points, label, extra = {}) {
  return { id, kind, chain, points, label, at: labelAt(points), ...extra };
}

/** Where one chain's step pills and bracket go, under the lead centred at `cx`. */
function pillRow(n, cx, top, minLeft) {
  if (!n) return { pills: [], lines: [], bottom: top };
  const total = n * GRAPH.pillW + (n - 1) * GRAPH.pillGap;
  const left = Math.max(minLeft, cx - total / 2);
  const barY = top + GRAPH.bracket;
  const pillTop = barY + GRAPH.bracket - 8;
  const pills = Array.from({ length: n }, (_, i) => ({ x: left + i * (GRAPH.pillW + GRAPH.pillGap), y: pillTop, w: GRAPH.pillW, h: GRAPH.pillH }));
  const centres = pills.map((p) => p.x + p.w / 2);
  const lines = [[[cx, top], [cx, barY]], ...centres.map((x) => [[x, barY], [x, pillTop]])];
  const lo = Math.min(cx, ...centres);
  const hi = Math.max(cx, ...centres);
  if (hi > lo) lines.push([[lo, barY], [hi, barY]]);
  return { pills, lines, bottom: pillTop + GRAPH.pillH };
}

/** A card's height: one line more when it says what the step is done when. */
const cardHeight = (ch) => GRAPH.cardH + (ch.done ? GRAPH.doneH : 0);

/** The chains side by side: each one row, its pills under the lead, its reports-back line under all. */
function rowLayout(chains, inner, scale) {
  const w = widths(scale);
  const gap = Math.min(GRAPH.edgeMax, (inner - w.orch - w.lead - w.work - w.card) / 3);
  const x = { orch: GRAPH.pad, lead: GRAPH.pad + w.orch + gap };
  x.work = x.lead + w.lead + gap;
  x.card = x.work + w.work + gap;
  const busX = x.orch + w.orch + GRAPH.bus;
  const orchCx = x.orch + w.orch / 2;
  const out = { mode: "row", nodes: [], edges: [], pills: [], brackets: [], height: 0 };
  let top = GRAPH.pad + GRAPH.labelH;
  let bottom = 0;
  let cy0 = top + GRAPH.nodeH / 2;
  chains.forEach((ch, i) => {
    const cardH = cardHeight(ch);
    const rowH = Math.max(GRAPH.nodeH, cardH);
    const cy = top + rowH / 2;
    if (i === 0) cy0 = cy;
    const y = cy - GRAPH.nodeH / 2;
    if (ch.lead) out.nodes.push({ id: `lead-${i}`, kind: "lead", chain: i, agent: ch.lead, x: x.lead, y, w: w.lead, h: GRAPH.nodeH });
    if (ch.worker) out.nodes.push({ id: `worker-${i}`, kind: "worker", chain: i, agent: ch.worker, x: x.work, y, w: w.work, h: GRAPH.nodeH });
    out.nodes.push({ id: `card-${i}`, kind: "card", chain: i, x: x.card, y: cy - cardH / 2, w: w.card, h: cardH });
    const first = ch.lead ? x.lead : ch.worker ? x.work : x.card;
    const start = [x.orch + w.orch, cy0];
    const brief = i === 0 ? [start, [first, cy]] : [start, [busX, cy0], [busX, cy], [first, cy]];
    out.edges.push(edge(`brief-${i}`, "brief", i, brief, "brief", { from: null }));
    if (ch.lead && ch.worker) out.edges.push(edge(`plan-${i}`, "plan", i, [[x.lead + w.lead, cy], [x.work, cy]], "plan", { from: ch.lead }));
    if (ch.worker) out.edges.push(edge(`action-${i}`, "action", i, [[x.work + w.work, cy], [x.card, cy]], actionOf(ch.worker.summary), { from: ch.worker, mono: true }));
    const row = ch.lead ? pillRow(ch.pills.length, x.lead + w.lead / 2, cy + GRAPH.nodeH / 2, busX + GRAPH.pillGap) : pillRow(0, 0, 0, 0);
    row.pills.forEach((p, j) => out.pills.push({ ...p, id: `pill-${i}-${j}`, chain: i, label: ch.pills[j], agent: ch.lead }));
    row.lines.forEach((points, j) => out.brackets.push({ id: `bracket-${i}-${j}`, chain: i, points, agent: ch.lead }));
    const foot = Math.max(top + rowH, row.bottom);
    const lineY = foot + GRAPH.drop;
    const cardCx = x.card + w.card / 2;
    out.edges.push(edge(`reports-${i}`, "reports", i, [[cardCx, cy + cardH / 2], [cardCx, lineY], [orchCx, lineY], [orchCx, cy0 + GRAPH.nodeH / 2]], "reports back", { from: null, below: true }));
    bottom = lineY + GRAPH.labelH;
    top = bottom + GRAPH.chainGap + GRAPH.labelH;
  });
  out.nodes.unshift({ id: "orch", kind: "orch", chain: -1, x: x.orch, y: cy0 - GRAPH.nodeH / 2, w: w.orch, h: GRAPH.nodeH });
  out.height = chains.length ? bottom + GRAPH.pad : GRAPH.pad * 2 + GRAPH.labelH + GRAPH.nodeH;
  return out;
}

/** The chains stacked for a narrow card: the Orchestrator on top, each chain's nodes one under another. */
function stackLayout(chains, inner) {
  const out = { mode: "stack", nodes: [], edges: [], pills: [], brackets: [], height: 0 };
  const x0 = GRAPH.pad;
  const xs = x0 + GRAPH.indent;
  const w = Math.max(0, inner - GRAPH.indent);
  const busX = x0 + GRAPH.bus;
  const lineX = xs + GRAPH.bus;
  out.nodes.push({ id: "orch", kind: "orch", chain: -1, x: x0, y: GRAPH.pad, w: inner, h: GRAPH.nodeH });
  let top = GRAPH.pad + GRAPH.nodeH + GRAPH.stackGap;
  chains.forEach((ch, i) => {
    const parts = [
      ch.lead && { id: `lead-${i}`, kind: "lead", agent: ch.lead, h: GRAPH.nodeH },
      ch.worker && { id: `worker-${i}`, kind: "worker", agent: ch.worker, h: GRAPH.nodeH },
      { id: `card-${i}`, kind: "card", h: cardHeight(ch) },
    ].filter(Boolean);
    parts.forEach((p, j) => {
      const node = { ...p, chain: i, x: xs, y: top, w };
      out.nodes.push(node);
      if (j === 0) out.edges.push(edge(`brief-${i}`, "brief", i, [[busX, GRAPH.pad + GRAPH.nodeH], [busX, top + GRAPH.nodeH / 2], [xs, top + GRAPH.nodeH / 2]], "brief", { from: null }));
      else {
        const prev = parts[j - 1];
        const kind = prev.kind === "lead" ? "plan" : "action";
        const label = kind === "plan" ? "plan" : actionOf(prev.agent?.summary);
        out.edges.push(edge(`${kind}-${i}`, kind, i, [[lineX, top - GRAPH.stackGap], [lineX, top]], label, { from: prev.agent, mono: kind === "action" }));
      }
      top += p.h + GRAPH.stackGap;
    });
    top += GRAPH.chainGap;
  });
  out.height = chains.length ? top - GRAPH.stackGap - GRAPH.chainGap + GRAPH.pad : GRAPH.pad * 2 + GRAPH.nodeH;
  return out;
}

/**
 * Where everything on the graph goes in a card `width` wide: side by side while the nodes fit at
 * `GRAPH.minScale` or more, stacked when they do not or when `stack` is asked for.
 */
export function graphLayout(chains, width, { stack = false } = {}) {
  const inner = Math.max(0, width - GRAPH.pad * 2);
  const scale = fitScale(inner);
  return stack || scale < GRAPH.minScale ? stackLayout(chains, inner) : rowLayout(chains, inner, scale);
}

/** The point `t` (0–1) of the way along a polyline. */
export function pointAt(points, t) {
  if (!points?.length) return [0, 0];
  const lens = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
  let left = Math.max(0, Math.min(1, t)) * lens.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lens.length; i++) {
    if (left <= lens[i] && lens[i] > 0) {
      const f = left / lens[i];
      return [points[i][0] + (points[i + 1][0] - points[i][0]) * f, points[i][1] + (points[i + 1][1] - points[i][1]) * f];
    }
    left -= lens[i];
  }
  return points[points.length - 1];
}

/** How far along its edge a dot is on `tick`: looping every CYCLE_TICKS, or the middle when motion is reduced. */
export const dotProgress = (tick, reduced = false) => (reduced ? 0.5 : (((tick % CYCLE_TICKS) + CYCLE_TICKS) % CYCLE_TICKS) / CYCLE_TICKS);

/** The bench's columns and card width for `n` cards in `inner` px: equal widths, none under `min`. */
export function benchGrid(inner, n, { min = 160, gap = 12 } = {}) {
  if (!(n > 0)) return { cols: 0, w: 0 };
  const cols = Math.max(1, Math.min(n, Math.floor((inner + gap) / (min + gap))));
  return { cols, w: Math.floor((inner - gap * (cols - 1)) / cols) };
}
