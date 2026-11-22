// Agents: the team at work. Agents working (or waiting on you) are cards: name, what it is doing
// now, the task it is on (a link to its thread) and its harness. Under them, the tasks in progress
// with who is on each, then the idle agents by name. Clicking an agent (or Enter on the picked
// one) opens its terminal; Space peeks it. The terminals-stage strip (props.sub "terminals") is
// kept for layouts from before the sidebar.

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents as reported, terminals, layout, run, settings, shared, setShared } from "herdr";
import { SIZE, TYPE_SCALE, LINE, SPACE, CONTROL, RADIUS, STATE, stateTone, threadTone, clickable } from "./look.js";
import { segmented, stateView } from "./switch.js";
import { actionButton } from "./button.js";
import { colors } from "./theme.js";
import { viewShown, openTerminal, openThread, showAgentsTab, showPage, showSettings } from "./pages.js";
import { threadRows, groupThreads, drawnOrder } from "./threadview.js";
import { sectionLabel } from "./plandoc.js";
import { bhJson, projectDir } from "./bh.js";
import { mentionTone, agentStateMark } from "./indicators.js";
import { count, ago } from "./numbers.js";
import { appKeyAction, isChord, keyName, nextPick, opensRow } from "./rowkeys.js";
import { KEYMAP_OPEN } from "./keymap.js";
import { OPEN_COUNTS, HOME_NEEDS, needsYouCount, needsYouIds, withHomeCount, isTiledLayout, withTiledPanes, tileAddresses } from "./signals.js";
import { PeekDrawer, PEEK_WIDTH } from "./peek.js";

const REFRESH_MS = 10000;
const MAX = 1140; // the work pages' widest column
const GAP = SPACE[4];
/** The thread states that count as being worked on. */
const ACTIVE = new Set(["working", "needsYou", "review"]);

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
    const list = this.agents();
    const next = nextPick(keyName(e), this.pick, list.length);
    if (next >= 0 && next !== this.pick) {
      this.pick = next;
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
    const content = Math.max(320, Math.min(MAX, this.width - (peeking ? PEEK_WIDTH : 0) - SIZE.gutter * 2));
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
          .child(this.body(c, content))))
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

  /** "Agents" and how many are running: "3 agents". */
  header(c) {
    const n = this.agents().length;
    return h_flex().items_center().gap(SPACE[3])
      .child(div().flex_1().text_size(TYPE_SCALE.metadata).text_color(c.textSecondary).child(n > 0 ? `${count(n, "agent")} running. Click an agent for its terminal, or its task to open it.` : ""))
      .child(actionButton(c, "bh-agents-team", "Edit team", () => showSettings("agents"), { tone: "quiet", tooltip: "Harness, model and effort per agent" }));
  }

  /** The board: agents at work as cards, the tasks in progress, then who is idle. */
  body(c, content) {
    if (!this.data && this.failed) {
      return stateView(c, { id: "bh-agents-error", title: "Couldn't read the team", line: "bh home did not answer. Try again, or check that bh is installed.", action: { label: "Try again", on: (_e, cx) => this.load(cx) } });
    }
    if (!this.data) {
      return v_flex().gap(SPACE[2])
        .child(skeletonRow(c, content - SPACE[5], content * 0.4))
        .child(skeletonRow(c, content * 0.6, content * 0.3));
    }
    const list = this.agents();
    const busy = list.filter((a) => a?.state && a.state !== "idle");
    const idle = list.filter((a) => !a?.state || a.state === "idle");
    const tasks = this.tasksInProgress(list);
    if (!list.length && !tasks.length) {
      return stateView(c, {
        id: "bh-agents-empty",
        title: "No agent is running.",
        line: "Ask something in Chat and the agents working on it appear here, with what each is doing and the task it is on.",
        action: { label: "Open Chat", on: () => showPage("chat") },
      });
    }
    const cols = content >= 880 ? 3 : content >= 560 ? 2 : 1;
    const cardW = Math.floor((content - GAP * (cols - 1)) / cols);
    const rows = [];
    for (let i = 0; i < busy.length; i += cols) rows.push(busy.slice(i, i + cols));
    return v_flex().w_full().gap(SPACE[5] + SPACE[3])
      .child(v_flex().gap(SPACE[3])
        .child(sectionLabel(c, busy.length ? `At work · ${busy.length}` : "At work"))
        .when(!busy.length, (el) => el.child(div().text_size(TYPE_SCALE.body).text_color(c.textSecondary).child("Nobody is working right now.")))
        .children(rows.map((row, r) => h_flex().id(`bh-agents-cards-${r}`).gap(GAP).items_stretch()
          .children(row.map((a, k) => this.card(c, a, r * cols + k, cardW))))))
      .when(tasks.length > 0, (el) => el.child(v_flex().gap(SPACE[2])
        .child(sectionLabel(c, `Tasks in progress · ${tasks.length}`))
        .children(tasks.map((t) => this.taskRow(c, t, list)))))
      .when(idle.length > 0, (el) => el.child(v_flex().gap(SPACE[2])
        .child(sectionLabel(c, `Idle · ${idle.length}`))
        .child(h_flex().flex_wrap().gap(SPACE[2]).children(idle.map((a, k) => this.idleChip(c, a, busy.length + k))))));
  }

  /** The threads being worked on (or waiting on you), what needs you first. */
  tasksInProgress(list) {
    const live = new Set(list.map((a) => a?.task).filter(Boolean));
    return drawnOrder(groupThreads(this.threads ?? [])).filter((t) => ACTIVE.has(t.state) || live.has(t.id));
  }

  /** The title of the thread an agent is on, or null. */
  taskTitle(id) {
    if (!id) return null;
    return (this.threads ?? []).find((t) => t.id === id) ?? { id, title: id, state: "working" };
  }

  /** An agent at work: who, what it is doing now, the task it is on, and its harness. */
  card(c, a, i, w) {
    const state = STATE[a?.state] ? a.state : "idle";
    const name = String(a?.name ?? "Agent");
    const picked = i === this.pick;
    const task = this.taskTitle(a?.task);
    const when = ago(a?.at);
    const doing = a?.summary && a.summary !== "Working" ? String(a.summary) : STATE[state].word;
    const meta = [a?.harness, when].filter(Boolean).join(" · ");
    return clickable(
      v_flex()
        .role("list_item")
        .accessibility_label(`${name}: ${doing}`)
        .aria_selected(picked)
        .w(w)
        .flex_none()
        .p(SPACE[4])
        .gap(SPACE[3])
        .rounded(RADIUS.card)
        .bg(picked ? c.hover : c.fill)
        .border_1()
        .border_color(state === "needsYou" ? stateTone(c, "needsYou") : c.edge)
        .on_click(() => a?.address && openTerminal(a.address))
        .child(h_flex().gap(SPACE[3]).items_center()
          .child(div().flex_1().min_w(0).truncate().text_size(TYPE_SCALE.title).font_semibold().text_color(mentionTone(c, name)).child(name))
          .child(agentStateMark(c, a, state, `bh-agent-activity-${String(a?.address ?? i)}`)))
        .child(div().h(LINE.md * 2).overflow_hidden().text_size(TYPE_SCALE.body).line_height(`${LINE.md}px`).text_color(c.textPrimary).child(doing))
        .child(div().h(1).w_full().bg(c.edge))
        .child(task
          ? clickable(h_flex().role("link").gap(SPACE[2]).items_center().rounded(SIZE.nested)
            .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
            .on_click((_e, cx) => {
              cx.stop_propagation();
              openThread(task.id);
            })
            .child(div().flex_none().text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child("On"))
            .child(div().flex_1().min_w(0).truncate().text_size(TYPE_SCALE.body).font_medium().text_color(threadTone(c, task.state)).child(task.title)), c, `bh-agent-task-${String(a?.address ?? i)}`, { edge: true })
          : div().text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child("Not on a task"))
        .when(Boolean(meta), (el) => el.child(div().truncate().text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child(meta))),
      c,
      `bh-agent-card-${String(a?.address ?? i)}`,
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

  /** An idle agent, by name: a click opens its terminal. */
  idleChip(c, a, i) {
    const name = String(a?.name ?? "Agent");
    return clickable(
      div()
        .role("link")
        .accessibility_label(`${name}: idle`)
        .h(CONTROL)
        .px(SPACE[4])
        .flex()
        .items_center()
        .rounded(SIZE.control)
        .bg(i === this.pick ? c.hover : c.fill)
        .border_1()
        .border_color(c.edge)
        .text_size(TYPE_SCALE.body)
        .text_color(mentionTone(c, name))
        .on_click(() => a?.address && openTerminal(a.address))
        .child(name),
      c,
      `bh-agent-idle-${String(a?.address ?? i)}`,
      { fill: c.hover, edge: true },
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
