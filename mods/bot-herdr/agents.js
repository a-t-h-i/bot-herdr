// Agents: Fleet | Terminals, with herdr's own terminals in the second sub-tab. Fleet is a calm
// list of the agents running now — avatar, name, state glyph and word, and the one line it is on;
// its harness and model belong to the peek, not the row. Enter opens the picked agent's terminal
// (clicking a row does the same). Terminals is herdr's pane stage: this view draws only the
// sub-tab strip above it, so the same tabs stay in reach while the panes have the screen.

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { settings, shared, setShared } from "herdr";
import { SIZE, TYPE_SCALE, LINE, SPACE, CONTROL, RADIUS, STATE, stateTone, clickable } from "./look.js";
import { segmented, stateView, avatar } from "./switch.js";
import { colors } from "./theme.js";
import { viewShown, openTerminal, showAgentsTab, showPage } from "./pages.js";
import { bhJson, projectDir } from "./bh.js";
import { mentionTone, agentStateMark } from "./indicators.js";
import { count, ago } from "./numbers.js";
import { appKeyAction, isChord, keyName, nextPick, opensRow } from "./rowkeys.js";
import { KEYMAP_OPEN } from "./keymap.js";
import { OPEN_COUNTS, HOME_NEEDS, needsYouCount, needsYouIds, withHomeCount } from "./signals.js";
import { PeekDrawer, PEEK_WIDTH } from "./peek.js";

const REFRESH_MS = 10000;
const MAX = 1140; // the work pages' widest column
const GAP = SPACE[4];

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
      const got = await bhJson(["home"], { cwd: projectDir() });
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

  /** The agents the list draws. */
  agents() {
    const list = this.data?.fleet?.agents;
    return Array.isArray(list) ? list : [];
  }

  /** View-local app keys (Ctrl+1..5, ?), peek keys (Esc, 1–9), then J / K / Home / End / Space / Enter. */
  keys(e, cx) {
    const app = appKeyAction(e, { typing: Boolean(this.peek?.typing) });
    if (app?.kind === "page") {
      showPage(app.page);
      return cx.stop_propagation();
    }
    if (app?.kind === "keymap") {
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
      return div()
        .id("bh-agents-tabs")
        .flex()
        .size_full()
        .items_start()
        .pt(SPACE[2])
        .pl(SPACE[3])
        .bg(c.ground)
        .track_focus(this.handle)
        .on_key_down((e, cx) => this.keys(e, cx))
        .child(this.tabs(c));
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
          .child(h_flex().items_center().child(this.tabs(c)))
          .child(this.header(c))
          .child(this.body(c, content))))
      .when(peeking, (el) => el.child(this.peek.render(c)));
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
      .child(div().text_size(TYPE_SCALE.title).font_semibold().text_color(c.textPrimary).child("Agents"))
      .when(n > 0, (el) => el.child(div().text_size(TYPE_SCALE.metadata).text_color(c.textSecondary).child(count(n, "agent"))));
  }

  /** The list, its skeletons while reading, its error, or the list's teaching empty state. */
  body(c, content) {
    if (!this.data && this.failed) {
      return stateView(c, { id: "bh-agents-error", title: "Couldn't read the fleet", line: "bh home did not answer. Try again, or check that bh is installed.", action: { label: "Try again", on: (_e, cx) => this.load(cx) } });
    }
    if (!this.data) {
      return v_flex().gap(SPACE[2])
        .child(skeletonRow(c, content - SPACE[5], content * 0.4))
        .child(skeletonRow(c, content * 0.6, content * 0.3));
    }
    const list = this.agents();
    if (!list.length) {
      return stateView(c, {
        id: "bh-agents-empty",
        title: "No agent is running.",
        line: "Start one from a thread's composer and it appears here, with the line it is on.",
        action: { label: "Open Threads", on: () => showPage("threads") },
      });
    }
    return v_flex().role("list").w_full().gap(SPACE[1]).children(list.map((a, i) => this.row(c, a, i)));
  }

  /** One agent: its avatar, name, the line it is on, its state in the state language, its age. */
  row(c, a, i) {
    const state = STATE[a?.state] ? a.state : "idle";
    const name = String(a?.name ?? "Agent");
    const when = ago(a?.at);
    const picked = i === this.pick;
    return clickable(
      h_flex()
        .role("list_item")
        .accessibility_label(`${name}: ${STATE[state].word}`)
        .aria_selected(picked)
        .w_full()
        .min_h(CONTROL + SPACE[4])
        .px(SPACE[3])
        .py(SPACE[2])
        .gap(SPACE[3])
        .items_center()
        .rounded(RADIUS.control)
        .when(picked, (el) => el.bg(c.hover))
        .on_click(() => a?.address && openTerminal(a.address))
        .child(avatar(c, name, mentionTone(c, name), CONTROL, { working: state === "working" }))
        .child(v_flex().flex_1().min_w(0).gap(SPACE[1])
          .child(div().truncate().text_size(TYPE_SCALE.body).font_semibold().text_color(c.textPrimary).child(name))
          .when(Boolean(a?.summary), (el) => el.child(div().truncate().text_size(TYPE_SCALE.metadata).text_color(c.textSecondary).child(String(a.summary)))))
        .child(agentStateMark(c, a, state, `bh-agent-activity-${String(a?.address ?? i)}`))
        .when(Boolean(when), (el) => el.child(div().flex_none().text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child(when))),
      c,
      `bh-agent-row-${String(a?.address ?? i)}`,
      { fill: null },
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
