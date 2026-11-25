// Agents: the team at work. Agents working (or waiting on you) are cards: name, what it is doing
// now, the task it is on (a link to its thread) and its harness. Under them, the tasks in progress
// with who is on each, then the idle agents by name. Clicking an agent (or Enter on the picked
// one) opens its terminal; Space peeks it. The terminals-stage strip (props.sub "terminals") is
// kept for layouts from before the sidebar.

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents as reported, terminals, layout, run, settings, shared, setShared } from "herdr";
import { SIZE, TYPE_SCALE, LINE, SPACE, CONTROL, RADIUS, STATE, stateTone, threadTone, clickable, baseName, reducedMotion } from "./look.js";
import { segmented, stateView } from "./switch.js";
import { actionButton } from "./button.js";
import { colors } from "./theme.js";
import { viewShown, openTerminal, openThread, showAgentsTab, showPage, showSettings } from "./pages.js";
import { threadRows, groupThreads, drawnOrder } from "./threadview.js";
import { ROSTER_KEY, roster, roleOf, slug } from "./roster.js";
import { sectionLabel } from "./plandoc.js";
import { bh, bhJson, projectDir } from "./bh.js";
import { mentionTone, agentStateMark } from "./indicators.js";
import { count, ago, compact } from "./numbers.js";
import { appKeyAction, isChord, keyName, nextPick, opensRow } from "./rowkeys.js";
import { KEYMAP_OPEN } from "./keymap.js";
import { OPEN_COUNTS, HOME_NEEDS, needsYouCount, needsYouIds, withHomeCount, isTiledLayout, withTiledPanes, tileAddresses } from "./signals.js";
import { PeekDrawer, PEEK_WIDTH } from "./peek.js";
import { graphCard, detailPanel, PANEL_W } from "./agentsgraph.js";
import { chainOf, graphLayout } from "./agentsgraphlayout.js";

const REFRESH_MS = 10000;
const MAX = 1140; // the work pages' widest column
const GRAPH_MAX = 1600; // the graph view's widest column: the chains need the room
/** The shared (persisted) key of the List | Graph choice; Graph when unset. */
const VIEW_KEY = "bot-herdr.agents-view";
/** Under this page width the panel drops below the graph and the chains stack. */
const NARROW = 900;
/** The travelling dots' tick. */
const DOT_MS = 50;
/** At most this many tasks have their detail (steps) read for the graph. */
const DETAIL_MAX = 4;
const GAP = SPACE[4];
/** The thread states that count as being worked on. */
const ACTIVE = new Set(["working", "needsYou", "review"]);
/** The team table's row height and its fixed columns, so rows line up like a table. */
const ROW_H = 36;
const NAME_W = 120;
const STATUS_W = 130;
const TASK_W = 200;
const META_W = 120;

/** Whether a running agent is this roster entry: its name, its role, or a child of it ("dev-2"). */
function matchesRole(a, entry) {
  const name = slug(String(a?.name ?? ""));
  const keys = [slug(entry.name), slug(entry.role ?? "")].filter(Boolean);
  return keys.some((k) => name === k || name.startsWith(`${k}-`));
}

/** What an agent is doing, said plainly: a shell command apart (drawn in mono), else its line. */
function doingOf(r) {
  if (!r.running) return { text: roleOf(r.role)?.does ?? "" };
  const line = String(r.summary ?? "").trim();
  if (!line || ["Working", "Idle", "Needs you"].includes(line)) return { text: "" };
  const cmd = line.match(/^(?:Run|Running|Ran|\$)\s+(.+)$/i);
  return cmd ? { command: cmd[1] } : { text: line };
}

/** The user's monospace face, or null. */
function monoFont() {
  try {
    const f = settings()?.font_family;
    return typeof f === "string" && f ? f : null;
  } catch {
    return null;
  }
}

/** The two sub-tabs, as one segmented control. */
const SUB_TABS = [
  { id: "fleet", label: "Fleet" },
  { id: "terminals", label: "Terminals" },
];

export class Agents {
  init(given, cx) {
    // The layout shows the terminals stage itself; this block then draws only the sub-tab strip.
    this.sub = given?.sub === "terminals" ? "terminals" : "fleet";
    this.data = null; // the last answer of bh home: its fleet is the list of agents running now
    this.loading = true;
    this.failed = false;
    this.busy = false;
    this.shown = false;
    this.width = 900;
    this.pick = 0; // the row Enter opens
    this.panel = true; // the graph's detail panel; Esc or its × closes it, a pick opens it again
    this.tick = 0; // the travelling dots' phase
    this.ticker = null; // the dots' timer, running only while the graph shows work moving
    this.details = new Map(); // task id → its bh task show answer (steps for the pills)
    this.handle = cx.focus_handle();
    if (this.sub === "terminals") return;
    this.peek = new PeekDrawer(); // Space opens it for the picked agent: harness, model, output, reply
    this.load(cx);
    cx.timer.every(REFRESH_MS, (cx) => {
      if (viewShown("agents")) this.load(cx);
    });
  }

  /** The agents running now (bh home's fleet), newest activity first as bh answers it. */
  load(cx) {
    if (this.busy) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      const [got, threads] = await Promise.all([bhJson(["home"], { cwd: projectDir() }), bhJson(["thread", "list"], { cwd: projectDir() })]);
      if (threads) this.threads = threadRows(threads);
      if (got && this.view() === "graph") await this.loadDetails(got);
      this.busy = false;
      this.loading = false;
      this.failed = !got;
      if (got) {
        this.data = got;
        const count = needsYouCount(got);
        setShared(OPEN_COUNTS, withHomeCount(shared(OPEN_COUNTS), count));
        setShared(HOME_NEEDS, { count, ids: needsYouIds(got) });
      }
      cx.notify();
    });
  }

  /** The steps of the tasks in progress, for the graph's pills and done-when line. */
  async loadDetails(home) {
    const ids = this.tasksInProgress(home?.fleet?.agents ?? []).filter((t) => t.kind === "task").slice(0, DETAIL_MAX).map((t) => t.id);
    const got = await Promise.all(ids.map((id) => bhJson(["task", "show", id], { cwd: projectDir() })));
    this.details = new Map(ids.map((id, i) => [id, got[i]?.task ?? got[i]]).filter(([, d]) => d));
  }

  /** List or Graph, as last chosen. */
  view() {
    return shared(VIEW_KEY) === "list" ? "list" : "graph";
  }

  /** The agents the page draws: the ones at work (or waiting on you) first, then the idle ones. */
  agents() {
    const list = this.data?.fleet?.agents;
    const all = Array.isArray(list) ? list : [];
    return [...all.filter((a) => a?.state && a.state !== "idle"), ...all.filter((a) => !a?.state || a.state === "idle")];
  }

  /** View-local app keys (Ctrl+1..6, ?), peek keys (Esc, 1–9), then J / K / Home / End / Space / Enter. */
  keys(e, cx) {
    const app = appKeyAction(e, { typing: Boolean(this.peek?.typing) });
    if (app?.kind === "page") {
      showPage(app.page);
      return cx.stop_propagation();
    }
    if (app?.kind === "keymap") {
      if (this.sub === "terminals") return;
      setShared(KEYMAP_OPEN, true);
      cx.stop_propagation();
      return cx.notify();
    }
    if (isChord(e)) return;
    if (this.peek?.keys(e, cx)) return cx.stop_propagation();
    if (this.peek?.typing) return;
    if (keyName(e) === "escape" && this.view() === "graph" && this.panel) {
      this.panel = false;
      cx.stop_propagation();
      return cx.notify();
    }
    const list = this.team();
    const next = nextPick(keyName(e), this.pick, list.length);
    if (next >= 0 && next !== this.pick) {
      this.pick = next;
      this.panel = true;
      cx.stop_propagation();
      cx.notify();
      return;
    }
    const picked = list[this.pick];
    if (keyName(e) === "space" && picked?.address && this.peek) {
      this.peek.toggle({ kind: "agent", agent: picked }, cx);
      cx.stop_propagation();
    } else if (opensRow(keyName(e)) && picked?.address) {
      openTerminal(picked.address);
      cx.stop_propagation();
    }
  }

  render(cx) {
    const c = colors();
    const peeking = Boolean(this.peek?.isOpen());
    const graph = this.view() === "graph";
    const content = Math.max(320, Math.min(graph ? GRAPH_MAX : MAX, this.width - (peeking ? PEEK_WIDTH : 0) - SIZE.gutter * 2));
    // The terminals stage: the strip only; herdr draws the panes below it.
    if (this.sub === "terminals") {
      const tiled = isTiledLayout(layout());
      const addrs = tileAddresses(reported(), terminals());
      return h_flex()
        .id("bh-agents-tabs")
        .size_full()
        .items_center()
        .gap(SPACE[3])
        .px(SPACE[3])
        .bg(c.ground)
        .track_focus(this.handle)
        .on_key_down((e, cx) => this.keys(e, cx))
        .child(this.tabs(c))
        .child(actionButton(c, "bh-agents-tile", tiled ? "Single pane" : "Tile", (_e, cx) => this.toggleTile(cx), {
          tone: tiled ? "secondary" : "quiet",
          tooltip: tiled ? "Return to one active pane" : addrs.length >= 2 ? "Show running agents side by side" : "Start two or more agents to tile side by side",
        }));
    }
    const open = viewShown("agents");
    if (open && !this.shown) cx.timer.after(1, (cx) => this.load(cx));
    this.shown = open;
    this.tickWhileMoving(open && graph, cx);
    return div()
      .id("bh-agents")
      .relative()
      .size_full()
      .bg(c.ground)
      .text_color(c.textPrimary)
      .track_focus(this.handle)
      .on_key_down((e, cx) => this.keys(e, cx))
      .on_size_change((size, cx) => {
        // px with the app's zoom multiplied in; drawn sizes are without it.
        this.width = size.width / (Number(settings().zoom) || 1);
        cx.notify();
      })
      .child(v_flex()
        .id("bh-agents-scroll")
        .absolute()
        .top(0)
        .bottom(0)
        .left(0)
        .right(peeking ? PEEK_WIDTH : 0)
        .overflow_y_scroll()
        .items_center()
        .child(v_flex().flex_none().w(content).py(SPACE[5]).gap(GAP)
          .child(this.header(c))
          .child(this.summary(c))
          .child(graph && this.data ? this.graph(c, content) : this.body(c, content))))
      .when(peeking, (el) => el.child(this.peek.render(c)));
  }

  /** Toggles between one active pane and side-by-side `{ terminal }` blocks for live agents. */
  toggleTile(cx) {
    const current = layout();
    if (isTiledLayout(current)) {
      const single = withTiledPanes(current, []);
      if (single) run("layout.set", { layout: single });
      return cx.notify();
    }
    const addrs = tileAddresses(reported(), terminals());
    if (addrs.length < 2) return;
    const next = withTiledPanes(current, addrs);
    if (next) run("layout.set", { layout: next });
    cx.notify();
  }

  /** Fleet | Terminals: Terminals switches the stage to herdr's own panes. */
  tabs(c) {
    return segmented(c, {
      id: "bh-agents-sub",
      items: SUB_TABS.map((t) => ({ id: t.id, label: t.label, on: t.id === this.sub })),
      onPick: (id) => showAgentsTab(id),
    });
  }

  /** `<project> / Team`, then List | Graph and the way to the team's settings. */
  header(c) {
    const view = this.view();
    return h_flex().items_center().gap(SPACE[3])
      .child(h_flex().flex_1().min_w(0).items_baseline()
        .child(div().truncate().text_size(TYPE_SCALE.title).font_semibold().text_color(c.textPrimary).child(baseName(projectDir()) || "Project"))
        .child(div().flex_none().text_size(TYPE_SCALE.title).text_color(c.textMuted).child(" / Team")))
      .child(segmented(c, {
        id: "bh-agents-view",
        choice: true,
        items: [{ id: "list", label: "List", on: view === "list" }, { id: "graph", label: "Graph", on: view === "graph" }],
        onPick: (id, cx) => this.setView(id, cx),
      }))
      .child(actionButton(c, "bh-agents-team", "Edit team", () => showSettings("agents"), { tone: "secondary", tooltip: "Harness, model and effort per agent" }));
  }

  /** Remembers List or Graph; the graph reads its tasks' steps on the way in. */
  setView(id, cx) {
    if (id === this.view()) return;
    setShared(VIEW_KEY, id);
    if (id === "graph") cx.timer.after(1, (cx) => this.load(cx));
    cx.notify();
  }

  /** "N agents at work · N tasks · N on the bench". */
  summary(c) {
    const fleet = this.agents();
    const n = fleet.filter((a) => a?.state && a.state !== "idle").length;
    const tasks = this.tasksInProgress(fleet).length;
    const benched = this.bench().length;
    return h_flex().items_baseline().flex_wrap()
      .child(div().text_size(TYPE_SCALE.hero).font_semibold().text_color(c.textPrimary).child(n > 0 ? `${count(n, "agent")} at work` : "Nobody at work"))
      .child(div().text_size(TYPE_SCALE.body).text_color(c.textMuted).child(` · ${count(tasks, "task")} · ${compact(benched)} on the bench`));
  }

  /** On the bench: roster agents not running, then running terminals sitting idle. */
  bench() {
    const rows = this.team();
    return [...rows.filter((r) => r.running && r.state === "idle"), ...rows.filter((r) => !r.running)];
  }

  /** Runs the dots' 50ms tick while the graph is shown and something works; stops it otherwise. */
  tickWhileMoving(on, cx) {
    const moving = on && !reducedMotion() && this.agents().some((a) => a?.state === "working");
    if (moving && !this.ticker) {
      this.ticker = cx.timer.every(DOT_MS, (cx) => {
        this.tick += 1;
        cx.notify();
      });
    } else if (!moving && this.ticker) {
      this.ticker.cancel();
      this.ticker = null;
    }
    return moving;
  }

  /** The graph view: the chains and bench, and the picked agent's panel beside (or under) it. */
  graph(c, content) {
    const narrow = this.width < NARROW;
    const fleet = this.agents();
    const chains = this.tasksInProgress(fleet).map((t) => chainOf(t, fleet, this.details.get(t.id)));
    const rows = this.team();
    const picked = rows[this.pick] ?? null;
    const side = this.panel && picked && !narrow;
    const width = side ? content - PANEL_W - GAP : content;
    const g = {
      chains,
      layout: graphLayout(chains, width, { stack: narrow }),
      bench: this.bench(),
      tick: this.tick,
      reduced: reducedMotion(),
      moving: Boolean(this.ticker),
      picked: picked ? String(picked.name ?? picked.label) : null,
      mono: monoFont(),
      onPick: (a, cx) => this.pickAgent(a, cx),
      onOpenTask: (t) => openThread(t.id),
    };
    const card = graphCard(c, width, g);
    const panel = this.panel && picked ? detailPanel(c, narrow ? content : PANEL_W, this.panelModel(picked, chains)) : null;
    return narrow
      ? v_flex().w_full().gap(GAP).child(card).when(Boolean(panel), (el) => el.child(panel))
      : h_flex().w_full().items_stretch().gap(GAP).child(card).when(Boolean(panel), (el) => el.child(panel));
  }

  /** Picks the agent a node or bench card is (by name or address) and opens the panel on it. */
  pickAgent(a, cx) {
    const rows = this.team();
    const at = rows.findIndex((r) => (a.address && r.address === a.address) || String(r.name ?? r.label) === String(a.name ?? a.label));
    if (at < 0) return;
    this.pick = at;
    this.panel = true;
    cx.notify();
  }

  /** What the panel shows for an agent: its task, the lead above it, its live lines and actions. */
  panelModel(r, chains) {
    const name = String(r.name ?? r.label);
    const chain = chains.find((ch) => ch.names.includes(name)) ?? null;
    const task = this.taskOf(r.task) ?? chain?.task ?? null;
    const parent = chain?.lead && chain.lead.name !== name ? chain.lead : null;
    const top = /^orchestrator$/i.test(String(r.role ?? r.label ?? ""));
    return {
      agent: r,
      task,
      parent,
      top,
      root: projectDir(),
      lines: this.liveLines(r),
      mono: monoFont(),
      onClose: (_e, cx) => {
        this.panel = false;
        cx.notify();
      },
      onOpen: () => r.address && openTerminal(r.address),
      onMessage: (_e, cx) => r.address && this.peek?.toggle({ kind: "agent", agent: r }, cx),
      onPause: (_e, cx) => task && this.pause(task.id, cx),
    };
  }

  /** Up to three activity lines: its summary now, then earlier output when the peek has read it. */
  liveLines(r) {
    if (!r.running) return [];
    const now = String(r.summary ?? "").trim();
    const first = now ? [{ text: now, when: ago(r.at) }] : [];
    const peeked = this.peek?.isOpen() && this.peek.target?.agent?.address === r.address ? this.peek.model().output ?? [] : [];
    const earlier = [...peeked].reverse().map((o) => ({ text: String(o.text ?? "").split(/\r?\n/)[0], when: ago(o.at) })).filter((o) => o.text && o.text !== now);
    return [...first, ...earlier].slice(0, 3);
  }

  /** Pauses a task (bh task status <id> paused), then reads the team again. */
  pause(id, cx) {
    cx.spawn(async (cx) => {
      await bh(["task", "status", id, "paused"], { cwd: projectDir() });
      this.load(cx);
    });
  }

  /**
   * The team as one compact table: every agent of the roster, plus any other agent terminal that
   * is running, each on one row. At work first, then waiting on you, then idle, then the ones not running (Ready).
   */
  team() {
    const fleet = this.agents();
    const list = roster(shared(ROSTER_KEY), []);
    const used = new Set();
    const rows = list.map((entry) => {
      const found = fleet.find((a) => !used.has(a) && matchesRole(a, entry));
      if (found) used.add(found);
      return { ...(found ?? {}), role: entry.role, label: entry.name, running: Boolean(found), state: found?.state ?? "idle" };
    });
    for (const a of fleet) if (!used.has(a)) rows.push({ ...a, label: String(a?.name ?? "Agent"), running: true, state: a?.state ?? "idle" });
    const rank = (r) => (!r.running ? 3 : r.state === "working" ? 0 : r.state === "needsYou" ? 1 : 2);
    return rows.map((r, i) => ({ r, i })).sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i).map((x) => x.r);
  }

  /** The board: the team table, then the tasks in progress. */
  body(c, content) {
    if (!this.data && this.failed) {
      return stateView(c, { id: "bh-agents-error", title: "Couldn't read the team", line: "bh home did not answer. Try again, or check that bh is installed.", action: { label: "Try again", on: (_e, cx) => this.load(cx) } });
    }
    if (!this.data) {
      return v_flex().gap(SPACE[2])
        .child(skeletonRow(c, content - SPACE[5], content * 0.4))
        .child(skeletonRow(c, content * 0.6, content * 0.3));
    }
    const rows = this.team();
    const tasks = this.tasksInProgress(this.agents());
    const wide = content >= 760;
    return v_flex().w_full().gap(SPACE[5] + SPACE[2])
      .child(v_flex()
        .id("bh-agents-team")
        .role("list")
        .w_full()
        .rounded(RADIUS.card)
        .bg(c.fill)
        .border_1()
        .border_color(c.edge)
        .overflow_hidden()
        .children(rows.map((r, i) => this.teamRow(c, r, i, wide, i === rows.length - 1))))
      .when(tasks.length > 0, (el) => el.child(v_flex().gap(SPACE[2])
        .child(sectionLabel(c, `Tasks in progress · ${tasks.length}`))
        .children(tasks.map((t) => this.taskRow(c, t, this.agents())))));
  }

  /** The threads being worked on (or waiting on you), what needs you first. */
  tasksInProgress(list) {
    const live = new Set(list.map((a) => a?.task).filter(Boolean));
    return drawnOrder(groupThreads(this.threads ?? [])).filter((t) => ACTIVE.has(t.state) || live.has(t.id));
  }

  /** The thread an agent is on, or null. */
  taskOf(id) {
    if (!id) return null;
    return (this.threads ?? []).find((t) => t.id === id) ?? null;
  }

  /**
   * One agent on one 36px line: its name in its colour, its state (the working cycle and verb while
   * it works), what it is doing (a command in the mono face), and, when wide, its task and harness.
   * Idle and not-started agents are drawn quieter, so the ones at work stand out.
   */
  teamRow(c, r, i, wide, last) {
    const state = STATE[r.state] ? r.state : "idle";
    const picked = i === this.pick;
    const quiet = !r.running || state === "idle";
    const doing = doingOf(r);
    const task = this.taskOf(r.task);
    const meta = r.running ? [r.harness, ago(r.at)].filter(Boolean).join(" · ") : "";
    const mono = monoFont();
    const status = !r.running
      ? div().flex_none().w(STATUS_W).text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child("Ready")
      : state === "working"
        ? div().flex_none().w(STATUS_W).overflow_hidden().child(agentStateMark(c, r, state, `bh-agent-activity-${String(r.address ?? i)}`))
        : div().flex_none().w(STATUS_W).text_size(TYPE_SCALE.metadata).text_color(state === "idle" ? c.textMuted : stateTone(c, state)).child(STATE[state].word);
    return clickable(
      h_flex()
        .role("list_item")
        .accessibility_label(`${r.label}: ${r.running ? STATE[state].word : "ready"}`)
        .aria_selected(picked)
        .w_full()
        .h(ROW_H)
        .px(SPACE[4])
        .gap(SPACE[4])
        .items_center()
        .when(!last, (el) => el.border_b(1).border_color(c.edge))
        .when(picked, (el) => el.bg(c.hover))
        .on_click(() => r.address && openTerminal(r.address))
        .child(div().flex_none().w(NAME_W).truncate().text_size(TYPE_SCALE.body).font_semibold().text_color(mentionTone(c, r.label)).opacity(quiet ? 0.6 : 1).child(r.label))
        .child(status)
        .child(div().flex_1().min_w(0).truncate().text_size(TYPE_SCALE.metadata)
          .text_color(quiet ? c.textMuted : c.textSecondary)
          .when(Boolean(doing.command && mono), (el) => el.font_family(mono))
          .child(doing.command ? `$ ${doing.command}` : doing.text))
        .when(wide, (el) => el.child(task
          ? clickable(div().role("link").flex_none().w(TASK_W).truncate().text_size(TYPE_SCALE.metadata).font_medium().text_color(threadTone(c, task.state))
            .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
            .on_click((_e, cx) => {
              cx.stop_propagation();
              openThread(task.id);
            })
            .child(task.title), c, `bh-agent-task-${String(r.address ?? i)}`, { edge: true })
          : div().flex_none().w(TASK_W)))
        .when(wide, (el) => el.child(div().flex_none().w(META_W).truncate().text_right().text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child(meta))),
      c,
      `bh-agent-row-${String(r.address ?? r.label)}`,
      { fill: c.hover, edge: true },
    );
  }

  /** A task in progress: its title in its state's colour, who is on it, its steps and age. */
  taskRow(c, t, list) {
    const on = new Set([...(t.agents ?? []), ...list.filter((a) => a?.task === t.id).map((a) => String(a.name))]);
    const meta = [t.steps, t.age].filter(Boolean).join(" · ");
    return clickable(
      h_flex()
        .role("link")
        .accessibility_label(`${STATE[t.state]?.word ?? "Task"}: ${t.title}`)
        .w_full()
        .min_h(CONTROL + SPACE[3])
        .px(SPACE[3])
        .gap(SPACE[4])
        .items_center()
        .rounded(RADIUS.control)
        .on_click(() => openThread(t.id))
        .child(div().flex_1().min_w(0).truncate().text_size(TYPE_SCALE.body).font_medium().text_color(threadTone(c, t.state)).child(t.title))
        .child(h_flex().flex_none().gap(SPACE[3]).children([...on].slice(0, 4).map((n) => div().text_size(TYPE_SCALE.metadata).font_medium().text_color(mentionTone(c, n)).child(n))))
        .child(div().flex_none().text_size(TYPE_SCALE.metadata).text_color(stateTone(c, t.state)).child(STATE[t.state]?.word ?? ""))
        .when(Boolean(meta), (el) => el.child(div().flex_none().text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child(meta))),
      c,
      `bh-agents-task-${t.id}`,
      { fill: c.hover },
    );
  }
}

/** One skeleton row: the shape an agent row will take, in the quiet surface, while it reads. */
function skeletonRow(c, wide, narrow) {
  return h_flex()
    .w_full()
    .px(SPACE[3])
    .py(SPACE[2])
    .gap(SPACE[3])
    .items_center()
    .child(div().flex_none().size(CONTROL).rounded_full().bg(c.well))
    .child(v_flex().flex_1().min_w(0).gap(SPACE[2])
      .child(div().w_full().max_w(wide).h(10).rounded(SPACE[1]).bg(c.well))
      .child(div().w_full().max_w(narrow).h(8).rounded(SPACE[1]).bg(c.well)));
}
