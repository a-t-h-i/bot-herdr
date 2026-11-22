// Threads: one task, its plan and its conversation are one thread. The list (bh thread list)
// groups them by state, what needs you first, under a filter bar (search + one Filter button);
// the Orchestrator's chat is pinned on top, and plans that are not tasks yet are threads too.
// Opening one shows a breadcrumb (Threads › title › sub-tab) and the second row Conversation |
// Plan | Steps | Changes (bh thread show). Conversation is the board and replies, with the goal
// row and the composer at its foot; Plan is the plan document (the plan sheet opens from it);
// Steps is the task page's own step cards; Changes is the diff stat. J / K move, Space peeks,
// Enter opens, Esc closes the peek and then goes back.

import { div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { settings, shared, run } from "herdr";
import { SIZE, TYPE_SCALE, LINE, SPACE, CONTROL, RADIUS, STATE, stateTone, clickable, looping } from "./look.js";
import { Chat } from "./chat.js";
import { Work } from "./work.js";
import { safeRender } from "./render-safe.js";
import { colors } from "./theme.js";
import { stateView, avatar, segmented, filterChip } from "./switch.js";
import { actionButton } from "./button.js";
import { sectionLabel, openPlan, arm, armed } from "./plandoc.js";
import { markdownWithFoldedCode, machineLine, toggleMachine } from "./machinetext.js";
import { mentionTone } from "./indicators.js";
import { bh, bhJson, projectDir } from "./bh.js";
import { ago } from "./numbers.js";
import { activeStage, viewShown, wakeGoal, FOCUS, OPEN_TASK, OPEN_THREAD } from "./pages.js";
import { isChord, keyName, nextPick, opensRow } from "./rowkeys.js";
import { PeekDrawer, PEEK_WIDTH } from "./peek.js";
import {
  ORCHESTRATOR, SUB_TABS, STATE_ORDER, GROUP_LABELS, threadRows, groupThreads, drawnOrder, stateCounts, subOrDefault, breadcrumb,
  conversation, planModel, changesModel, goalRowModel, goalRowParts,
} from "./threadview.js";

const REFRESH_MS = 10000;
const MAX = 1140; // the work pages' widest column
const AVATARS = 3; // how many agents a thread row names before it stops
const GOAL_H = 60; // the goal row's drawn height: its line and the judge's reason

/** Logs a sub-view that failed to draw; never throws while reporting. */
function report(view, message) {
  try {
    console.error(`bot-herdr [render:${view}]: ${message}`);
  } catch {
    // Never throw while reporting.
  }
}

export class Threads {
  init(given, cx) {
    this.chat = new Chat();
    this.chat.init({ ...(given ?? {}), view: "chat" }, cx);
    // The task page's step cards are the Steps sub-tab: its view, kept for its cards and actions.
    this.work = new Work();
    this.work.init({ view: "work", tab: "tasks" }, cx);
    this.data = null; // the last bh thread list answer
    this.failed = false;
    this.busy = false;
    this.opened = null; // the open thread's id, ORCHESTRATOR for the chat, null for the list
    this.sub = "conversation";
    this.detail = null; // bh thread show for the open thread
    this.detailId = null;
    this.progress = null; // bh goal progress for the open thread, when it is a Goal
    this.problem = null; // an action that failed, in one line
    this.stateFilter = null;
    this.filterOpen = false;
    this.pick = 0;
    this.listPick = 0; // the pick to come back to from a thread
    this.expanded = new Set(); // conversation entries opened in place
    this.machineOpen = new Set(); // folded machine text opened in the plan
    this.armed = null; // Clear, once clicked, waits for a second click
    this.width = 900;
    this.height = 640;
    this.shown = false;
    this.searching = false;
    this.search = InputState.new({ placeholder: "Search threads" });
    this.search.on("change", (_e, cx) => {
      this.pick = 0;
      cx.notify();
    });
    this.search.on("focus", (_e, cx) => this.setSearching(true, cx));
    this.search.on("blur", (_e, cx) => this.setSearching(false, cx));
    this.peek = new PeekDrawer();
    this.handle = cx.focus_handle();
    this.openAt = /** @type {{ at?: number } | null} */ (shared(OPEN_THREAD))?.at ?? 0;
    this.taskAt = /** @type {{ at?: number } | null} */ (shared(OPEN_TASK))?.at ?? 0;
    this.focusAt = shared(FOCUS) ?? 0;
    this.load(cx);
    cx.timer.every(REFRESH_MS, (cx) => {
      if (viewShown("threads") && activeStage() !== "terminals") this.refresh(cx);
    });
  }

  setSearching(on, cx) {
    this.searching = on;
    cx.notify();
  }

  /** The list again, and the open thread's detail. */
  refresh(cx) {
    if (!this.opened) this.load(cx);
    else if (this.opened !== ORCHESTRATOR) this.loadDetail(this.opened, cx);
  }

  /** Reads the thread list; a failed read keeps the last answer and says so. */
  load(cx) {
    if (this.busy) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      const got = await bhJson(["thread", "list"], { cwd: projectDir() });
      this.busy = false;
      this.failed = !got;
      if (got) this.data = got;
      cx.notify();
    });
  }

  /** Reads one thread, and its goal progress when it is a Goal. */
  loadDetail(id, cx) {
    cx.spawn(async (cx) => {
      const dir = projectDir();
      const got = await bhJson(["thread", "show", id], { cwd: dir });
      if (this.opened !== id) return;
      if (got) {
        this.detail = got;
        this.detailId = id;
      }
      this.progress = got?.goal ? await bhJson(["goal", "progress", id], { cwd: dir }) : null;
      cx.notify();
    });
  }

  rows() {
    return threadRows(this.data);
  }

  groups() {
    return groupThreads(this.rows(), { query: this.search.value(), state: this.stateFilter });
  }

  /** The rows J and K walk through: the pinned Orchestrator chat, then the threads as drawn. */
  order() {
    return [{ id: ORCHESTRATOR, kind: "chat" }, ...drawnOrder(this.groups())];
  }

  /** Opens a thread on a sub-tab (Conversation unless asked), remembering where the list was. */
  openThread(id, cx, sub = "conversation") {
    if (!id) return;
    if (!this.opened) this.listPick = this.pick;
    this.peek.close(cx);
    this.opened = id;
    this.sub = subOrDefault(sub);
    this.problem = null;
    this.expanded = new Set();
    if (this.detailId !== id) {
      this.detail = null;
      this.progress = null;
    }
    if (id !== ORCHESTRATOR) {
      this.loadDetail(id, cx);
      this.work.opened = id;
      this.work.loadTaskDetail(id, projectDir(), cx);
    } else {
      cx.timer.after(1, () => this.chat.composer.focus());
    }
    cx.notify();
  }

  /** Back to the list, its pick where it was. */
  back(cx) {
    this.opened = null;
    this.pick = this.listPick;
    this.handle.focus();
    this.load(cx);
    cx.notify();
  }

  /** What another view asked for since the last frame: a thread, a task, or the chat's keyboard. */
  follow(cx) {
    const want = /** @type {{ id?: string, at?: number } | null} */ (shared(OPEN_THREAD));
    const task = /** @type {{ id?: string, at?: number } | null} */ (shared(OPEN_TASK));
    const focus = shared(FOCUS) ?? 0;
    if (want?.at > this.openAt) {
      this.openAt = want.at;
      if (want.id) cx.timer.after(1, (cx) => this.openThread(String(want.id), cx));
    }
    if (task?.at > this.taskAt) {
      this.taskAt = task.at;
      if (task.id) cx.timer.after(1, (cx) => this.openThread(String(task.id), cx, "steps"));
    }
    if (focus !== this.focusAt) {
      this.focusAt = focus;
      if (this.opened !== ORCHESTRATOR) cx.timer.after(1, (cx) => this.openThread(ORCHESTRATOR, cx));
    }
  }

  /** The page's keys: the peek's first, then Esc back, then the list's J / K / Space / Enter. */
  keys(e, cx) {
    if (isChord(e)) return;
    if (this.peek.keys(e, cx)) return cx.stop_propagation();
    const key = keyName(e);
    if (key === "escape" && this.opened && !this.chat.composer.focused) {
      this.back(cx);
      return cx.stop_propagation();
    }
    if (this.opened || this.searching || this.peek.typing) return;
    this.listKeys(key, cx);
  }

  listKeys(key, cx) {
    const rows = this.order();
    const next = nextPick(key, this.pick, rows.length);
    if (next >= 0 && next !== this.pick) {
      this.pick = next;
      cx.stop_propagation();
      return cx.notify();
    }
    const picked = rows[this.pick];
    if (!picked) return;
    if (opensRow(key)) this.openThread(picked.id, cx);
    else if (key === "space" && picked.id !== ORCHESTRATOR) this.peek.toggle({ kind: "thread", id: picked.id }, cx);
    else return;
    cx.stop_propagation();
  }

  render(cx) {
    const open = viewShown("threads");
    if (open && !this.shown) cx.timer.after(1, (cx) => this.refresh(cx));
    this.shown = open;
    this.follow(cx);
    const c = colors();
    return div()
      .id("bh-threads")
      .relative()
      .size_full()
      .bg(c.ground)
      .text_color(c.textPrimary)
      .track_focus(this.handle)
      .on_key_down((e, cx) => this.keys(e, cx))
      .on_size_change((size, cx) => {
        // px with the app's zoom multiplied in; drawn sizes are without it.
        const zoom = Number(settings().zoom) || 1;
        this.width = size.width / zoom;
        this.height = size.height / zoom;
        cx.notify();
      })
      .child(this.page(c, cx));
  }

  /** The list, the Orchestrator's chat, or the open thread — each behind its own boundary. */
  page(c, cx) {
    const part = !this.opened ? { render: () => this.listPage(c) } : this.opened === ORCHESTRATOR ? { render: (cx) => this.chatPage(c, cx) } : { render: (cx) => this.threadPage(c, cx) };
    const { node, error } = safeRender(part, cx, { view: "threads", onError: (rec) => report(rec.view, rec.message) });
    if (!error) return node;
    return v_flex().size_full().items_center().child(stateView(c, {
      id: "bh-threads-error",
      title: "This thread could not be drawn",
      line: `${error.detail} Go back to the list and open it again.`,
      action: this.opened ? { label: "Back to Threads", on: (_e, cx) => this.back(cx) } : null,
    }));
  }

  column() {
    const room = this.width - (this.peek.isOpen() && !this.opened ? PEEK_WIDTH : 0);
    return Math.max(320, Math.min(MAX, room - SIZE.gutter * 2));
  }

  // ---- The list -------------------------------------------------------------------------------

  listPage(c) {
    const content = this.column();
    return div().size_full().relative()
      .child(v_flex().id("bh-threads-scroll").absolute().top(0).bottom(0).left(0).right(this.peek.isOpen() ? PEEK_WIDTH : 0).overflow_y_scroll().items_center()
        .child(v_flex().flex_none().w(content).py(SPACE[5]).gap(SPACE[4])
          .child(div().text_size(TYPE_SCALE.title).font_semibold().text_color(c.textPrimary).child("Threads"))
          .child(this.filterBar(c))
          .child(this.listBody(c))))
      .when(this.peek.isOpen(), (el) => el.child(this.peek.render(c)));
  }

  /** Search on the left, one Filter button; a chip only for the filter that is on. */
  filterBar(c) {
    const counts = stateCounts(this.rows());
    const on = this.stateFilter;
    return v_flex().gap(SPACE[2])
      .child(h_flex().gap(SPACE[3]).items_center()
        .child(h_flex().flex_1().min_w(0).max_w(420).h(CONTROL).px(SPACE[3]).items_center().rounded(SIZE.control).bg(c.fill).border_1().border_color(c.controlBorder ?? c.edge)
          .accessibility_label("Search threads")
          .child(Input.new(this.search).flex_1().min_w(0).h_full().text_size(TYPE_SCALE.body).text_color(c.textPrimary)))
        .child(actionButton(c, "bh-threads-filter", "Filter", (_e, cx) => {
          this.filterOpen = !this.filterOpen;
          cx.notify();
        }, { tone: "quiet", tooltip: "Filter by state" }))
        .when(Boolean(on), (el) => el.child(filterChip(c, { id: `bh-threads-filter-on-${on}`, label: `${GROUP_LABELS[on]} ✕`, on: true, onClick: (_e, cx) => this.setFilter(null, cx) }))))
      .when(this.filterOpen, (el) => el.child(h_flex().role("tab_list").flex_wrap().gap(SPACE[2])
        .children(STATE_ORDER.filter((s) => counts[s] > 0 && s !== on).map((s) => filterChip(c, {
          id: `bh-threads-filter-${s}`,
          label: GROUP_LABELS[s],
          count: counts[s],
          onClick: (_e, cx) => this.setFilter(s, cx),
        })))));
  }

  setFilter(state, cx) {
    this.stateFilter = state;
    this.filterOpen = false;
    this.pick = 0;
    cx.notify();
  }

  /** The pinned chat, then each state's group; skeletons while reading; an empty state that teaches. */
  listBody(c) {
    const pinned = this.chatRow(c);
    if (!this.data && this.failed) {
      return v_flex().gap(SPACE[4]).child(pinned).child(stateView(c, { id: "bh-threads-list-error", title: "Couldn't read the threads", line: "bh thread list did not answer. Try again, or check that bh is installed.", action: { label: "Try again", on: (_e, cx) => this.load(cx) } }));
    }
    if (!this.data) return v_flex().gap(SPACE[2]).child(pinned).child(skeleton(c)).child(skeleton(c));
    const groups = this.groups();
    if (!groups.length) {
      const filtered = Boolean(this.stateFilter || this.search.value().trim());
      return v_flex().gap(SPACE[4]).child(pinned).child(stateView(c, filtered
        ? { id: "bh-threads-none", title: "No thread matches.", line: "Clear the search or the filter to see every thread." }
        : { id: "bh-threads-empty", title: "No threads yet.", line: "Ask the Orchestrator for a plan or a task, and its thread appears here." }));
    }
    let at = 1; // the pinned chat is row 0
    return v_flex().role("list").gap(SPACE[4]).child(pinned).children(groups.map((g) => {
      const start = at;
      at += g.rows.length;
      return v_flex().id(`bh-threads-group-${g.state}`).gap(SPACE[1])
        .child(sectionLabel(c, g.label))
        .children(g.rows.map((t, i) => this.threadRow(c, t, start + i)));
    }));
  }

  /** The Orchestrator's chat, pinned: no capability of the old chat page is more than a row away. */
  chatRow(c) {
    const picked = this.pick === 0;
    return clickable(
      rowShell(c, picked).accessibility_label("Orchestrator: your chat with the team")
        .on_click((_e, cx) => this.openThread(ORCHESTRATOR, cx))
        .child(avatar(c, "Orchestrator", mentionTone(c, "Orchestrator"), 20))
        .child(div().flex_1().min_w(0).truncate().text_size(TYPE_SCALE.body).font_semibold().text_color(c.textPrimary).child("Orchestrator"))
        .child(div().flex_none().text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child("Pinned")),
      c,
      "bh-thread-row-orchestrator",
      { fill: c.hover },
    );
  }

  /** A thread at a glance: state glyph, title, its one-line summary, agents, steps and age. */
  threadRow(c, t, at) {
    const s = STATE[t.state] ?? STATE.idle;
    const meta = [t.steps, t.age].filter(Boolean).join(" · ");
    const picked = at === this.pick;
    // The needs-you glyph pulses: one amber pulse, nothing else (and nothing while reduced).
    const glyph = div().flex_none().text_size(TYPE_SCALE.title).text_color(stateTone(c, t.state)).child(s.glyph);
    return clickable(
      rowShell(c, picked).accessibility_label(`${s.word}: ${t.title}`)
        .on_click((_e, cx) => {
          this.pick = at;
          this.openThread(t.id, cx);
        })
        .child(t.state === "needsYou" ? looping(glyph, "opacity", { from: 0.35, to: 1, period: 1400, easing: "ease-in-out" }) : glyph)
        .child(v_flex().flex_1().min_w(0).gap(SPACE[1])
          .child(div().truncate().text_size(TYPE_SCALE.body).text_color(c.textPrimary).child(t.title))
          .when(Boolean(t.summary), (el) => el.child(div().id(`bh-row-summary-thread-${t.id}`).truncate().text_size(TYPE_SCALE.metadata).text_color(c.textSecondary).child(t.summary))))
        .child(h_flex().flex_none().gap(SPACE[1]).children(t.agents.slice(0, AVATARS).map((name) => avatar(c, name, mentionTone(c, name), 20))))
        .when(Boolean(meta), (el) => el.child(div().flex_none().text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child(meta))),
      c,
      `bh-thread-row-${t.id}`,
      { fill: c.hover },
    );
  }

  // ---- An open thread -------------------------------------------------------------------------

  /** The title the breadcrumb names: the list row's, else the detail's, else the id. */
  title() {
    if (this.opened === ORCHESTRATOR) return "Orchestrator";
    const row = this.rows().find((r) => r.id === this.opened);
    return row?.title || String(this.detail?.title ?? "") || String(this.opened ?? "Thread");
  }

  /** Threads › title › sub-tab; "Threads" goes back, and so does Esc. */
  crumbs(c, sub) {
    const parts = breadcrumb(this.title(), sub);
    return h_flex().id("bh-thread-crumbs").role("navigation").accessibility_label(parts.join(" › ")).flex_none().gap(SPACE[2]).items_center().min_w(0)
      .child(clickable(div().role("link").text_size(TYPE_SCALE.metadata).text_color(c.textSecondary).on_click((_e, cx) => this.back(cx)).child(parts[0]), c, "bh-thread-crumb-back"))
      .children(parts.slice(1).flatMap((p, i) => [
        div().flex_none().text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child("›"),
        div().min_w(0).truncate().text_size(TYPE_SCALE.metadata).text_color(i === parts.length - 2 ? c.textPrimary : c.textSecondary).child(p),
      ]));
  }

  /** The Orchestrator's chat, whole, under its breadcrumb. */
  chatPage(c, cx) {
    const { node, error } = safeRender(this.chat, cx, { view: "threads-chat", onError: (rec) => report(rec.view, rec.message) });
    return v_flex().size_full()
      .child(h_flex().flex_none().h(CONTROL + SPACE[4]).px(SIZE.gutter).items_center().child(this.crumbs(c, null)))
      .child(div().flex_1().min_h(0).relative().child(error ? stateView(c, { id: "bh-threads-chat-error", title: "The chat could not be drawn", line: error.detail }) : node));
  }

  /** The breadcrumb, the second row and the sub-tab's body. */
  threadPage(c, cx) {
    const content = this.column();
    const sub = subOrDefault(this.sub);
    return v_flex().size_full().items_center()
      .child(v_flex().flex_none().w(content).pt(SPACE[5]).gap(SPACE[3])
        .child(h_flex().gap(SPACE[3]).items_center()
          .child(div().flex_1().min_w(0).child(this.crumbs(c, sub)))
          .child(actionButton(c, "bh-thread-files", "Files", () => run("mod.open", { name: "files" }), { tone: "quiet", tooltip: "Open the Files window" })))
        .child(segmented(c, {
          id: "bh-thread-tabs",
          items: SUB_TABS.map((t) => ({ id: t.id, label: t.label, on: t.id === sub })),
          onPick: (id, cx) => {
            this.sub = subOrDefault(id);
            cx.notify();
          },
        }))
        .when(Boolean(this.problem), (el) => el.child(div().text_size(TYPE_SCALE.metadata).text_color(c.danger).child(this.problem))))
      .child(div().flex_1().min_h(0).w_full().relative().child(this.subBody(c, sub, content, cx)));
  }

  subBody(c, sub, content, cx) {
    if (!this.detail || this.detailId !== this.opened) {
      return v_flex().absolute().inset_0().items_center().child(v_flex().w(content).py(SPACE[4]).gap(SPACE[2]).child(skeleton(c)).child(skeleton(c)));
    }
    if (sub === "plan") return scrolled(content, this.planBody(c));
    if (sub === "steps") return scrolled(content, this.stepsBody(c));
    if (sub === "changes") return scrolled(content, this.changesBody(c));
    return this.conversationBody(c, cx);
  }

  // Conversation: the board and the replies, the goal row and the composer at the foot.
  conversationBody(c, cx) {
    const composer = this.chat.composer;
    const pageW = Math.max(320, Math.min(SIZE.maxWidth, this.width - SIZE.gutter * 2));
    const goal = goalRowModel(this.progress);
    const foot = SIZE.foot + composer.height(pageW) + SPACE[4] + (goal ? GOAL_H + SPACE[3] : 0);
    const entries = conversation(this.detail);
    return div().absolute().inset_0()
      .child(v_flex().id("bh-thread-feed").absolute().top(0).left(0).right(0).bottom(foot).overflow_y_scroll().items_center()
        .child(v_flex().flex_none().w(pageW).py(SPACE[4]).gap(SPACE[3])
          .when(!entries.length, (el) => el.child(stateView(c, { id: "bh-thread-quiet", title: "Nothing said here yet.", line: "Replies, comments and the board's entries for this thread appear here. Write below to start." })))
          .children(entries.map((e) => this.entry(c, e)))))
      .child(v_flex().absolute().left(0).right(0).bottom(SIZE.foot).items_center().gap(SPACE[3])
        .when(Boolean(goal), (el) => el.child(this.goalRow(c, goal, pageW)))
        .child(composer.render(cx, this.width, this.height, c)));
  }

  /** One board entry: type word (muted), author, time, first line; the rest opens in place. */
  entry(c, e) {
    const open = this.expanded.has(e.key);
    const head = h_flex().gap(SPACE[2]).items_center()
      .child(div().flex_none().text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child(e.word))
      .child(div().flex_none().text_size(TYPE_SCALE.metadata).font_semibold().text_color(c.textPrimary).child(e.from))
      .when(Boolean(e.to), (el) => el.child(div().flex_none().text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child(`→ ${e.to}`)))
      .child(div().flex_none().text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child(ago(e.at)));
    const body = open
      ? div().text_size(TYPE_SCALE.body).line_height(`${LINE.md}px`).text_color(c.textPrimary).child(e.text)
      : div().truncate().text_size(TYPE_SCALE.body).text_color(c.textPrimary).child(e.first);
    const fold = e.more ? (open ? " (open; press to fold)" : " (press to read all)") : "";
    const card = v_flex().role("article").accessibility_label(`${e.word} from ${e.from}: ${e.first}${fold}`).gap(SPACE[1]).px(SPACE[3]).py(SPACE[2]).rounded(RADIUS.control).child(head).child(body);
    if (!e.more) return card.id(`bh-thread-entry-${e.key}`);
    return clickable(card.on_click((_e, cx) => {
      if (this.expanded.has(e.key)) this.expanded.delete(e.key);
      else this.expanded.add(e.key);
      cx.notify();
    }), c, `bh-thread-entry-${e.key}`, { edge: true, fill: c.hover });
  }

  /** ◎ the goal, its gate, elapsed time and retries left, the judge's last reason; its actions. */
  goalRow(c, g, width) {
    const parts = goalRowParts(g);
    const clearing = armed(this, "armed", `clear-${g.task}`);
    return v_flex().id("bh-goal-row").role("status").accessibility_label(`Goal: ${parts.join(", ")}. ${g.reason}`)
      .flex_none().w(width).h(GOAL_H).px(SPACE[4]).py(SPACE[2]).gap(SPACE[1]).justify_center().rounded(RADIUS.card).bg(c.fill).border_1().border_color(c.edge)
      .child(h_flex().gap(SPACE[3]).items_center()
        .child(div().flex_none().text_size(TYPE_SCALE.title).text_color(stateTone(c, g.paused ? "paused" : g.reached ? "done" : "working")).child("◎"))
        .child(div().flex_1().min_w(0).truncate().text_size(TYPE_SCALE.metadata).text_color(c.textSecondary).child(parts.join(" · ")))
        .when(!g.stopped, (el) => el.child(actionButton(c, "bh-goal-row-pause", g.paused ? "Resume" : "Pause", (_e, cx) => this.goalAction(g.paused ? "resume" : "pause", g, cx), { tone: "quiet", tooltip: g.paused ? "Resume the goal loop" : "Pause the goal loop" })))
        .child(actionButton(c, "bh-goal-row-edit", "Edit", (_e, cx) => this.editGoal(g, cx), { tone: "quiet", tooltip: "Ask for a change to the goal's criteria" }))
        .when(!g.stopped, (el) => el.child(actionButton(c, "bh-goal-row-clear", clearing ? "Confirm clear" : "Clear", (_e, cx) => {
          if (clearing) return this.goalAction("stop", g, cx);
          arm(this, "armed", `clear-${g.task}`, cx);
        }, { tone: "quiet", tooltip: "Stop the goal loop" }))))
      .when(Boolean(g.reason), (el) => el.child(div().id("bh-goal-row-reason").truncate().text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child(g.reason)));
  }

  /** Pause, resume or stop (clear) the goal with bh goal; resume wakes the Orchestrator too. */
  goalAction(cmd, g, cx) {
    this.armed = null;
    cx.spawn(async (cx) => {
      const r = await bh(["goal", cmd, g.task, "--json"], { cwd: projectDir() });
      if (r.code !== 0) this.problem = `Couldn't ${cmd === "stop" ? "clear" : cmd} the goal: ${String(r.stderr || r.stdout).trim().split("\n")[0] || "bh goal failed"}. Try again.`;
      else {
        this.problem = null;
        if (cmd === "resume") wakeGoal({ id: g.task, title: g.title });
      }
      this.loadDetail(g.task, cx);
      cx.notify();
    });
  }

  /** Edit: the composer takes a request to the Orchestrator for an amendment, for you to finish. */
  editGoal(g, cx) {
    const composer = this.chat.composer;
    composer.input.set_value(`Change goal ${g.task} ("${g.title}"): propose an amendment (bh goal propose-amend) to `);
    composer.text = composer.input.value();
    composer.focus();
    cx.notify();
  }

  /** Plan: the plan document as drawn in the plan sheet, which opens for comments and Start. */
  planBody(c) {
    const p = planModel(this.detail);
    if (!p) return stateView(c, { id: "bh-thread-plan-none", title: "This thread has no plan.", line: "A task started from an agreed plan shows that plan here." });
    return v_flex().gap(SPACE[3])
      .child(h_flex().gap(SPACE[3]).items_center()
        .child(div().flex_1().min_w(0).truncate().text_size(TYPE_SCALE.title).font_semibold().text_color(c.textPrimary).child(p.title))
        .child(actionButton(c, "bh-thread-plan-open", "Open plan", () => openPlan(p.plan), { tone: "secondary", tooltip: "Open the plan sheet: comment, and start it" })))
      .child(p.markdown
        ? markdownWithFoldedCode(c, { id: `bh-thread-plan-${p.id}`, text: p.markdown, open: this.machineOpen })
        : div().text_size(TYPE_SCALE.body).text_color(c.textSecondary).child("The plan is still being written; open the plan sheet to follow it."));
  }

  /** Steps: the task page's own step cards, for this task. */
  stepsBody(c) {
    if (this.detail?.kind === "plan") return stateView(c, { id: "bh-thread-steps-none", title: "No steps yet.", line: "A plan gets its steps when it becomes a task. Open the plan to start it." });
    const t = this.work.taskDetailId === this.opened ? this.work.taskDetail : null;
    if (!t) return v_flex().gap(SPACE[2]).child(skeleton(c)).child(skeleton(c));
    return this.work.taskStepsTab(c, t);
  }

  /** Changes: the diff stat of the thread's branch against where it started. */
  changesBody(c) {
    const ch = changesModel(this.detail);
    if (!ch.available) return stateView(c, { id: "bh-thread-changes-none", title: "No changes yet.", line: "Files this thread's agents change appear here, with lines added and removed." });
    return v_flex().gap(SPACE[2])
      .child(h_flex().gap(SPACE[3]).items_center()
        .child(div().flex_1().min_w(0).text_size(TYPE_SCALE.body).text_color(c.textSecondary).child(ch.summary))
        .child(actionButton(c, "bh-thread-changes-open", "Open diff", () => run("mod.open", { name: "changes" }), { tone: "quiet", tooltip: "Open the Changes window" })))
      // The branch is machine text: one muted mono line, middle-truncated, that expands.
      .when(Boolean(ch.branch), (el) => el.child(machineLine(c, {
        id: "bh-thread-changes-branch",
        text: ch.from ? `${ch.branch} ← ${ch.from}` : ch.branch,
        expanded: this.machineOpen.has("bh-thread-changes-branch"),
        onToggle: (_e, cx) => {
          toggleMachine(this.machineOpen, "bh-thread-changes-branch");
          cx.notify();
        },
      })))
      .child(v_flex().id("bh-thread-changes").role("list").gap(SPACE[1]).children(ch.files.map((f) => h_flex().id(`bh-thread-change-${f.path}`).role("list_item").accessibility_label(`${f.path}: ${f.added} added, ${f.removed} removed`).h(CONTROL).px(SPACE[3]).gap(SPACE[3]).items_center()
        .child(div().flex_1().min_w(0).truncate().text_size(TYPE_SCALE.body).text_color(c.textPrimary).child(f.path))
        .child(div().flex_none().text_size(TYPE_SCALE.metadata).text_color(c.stateDone ?? c.textSecondary).child(`+${f.added}`))
        .child(div().flex_none().text_size(TYPE_SCALE.metadata).text_color(c.stateFailed ?? c.textSecondary).child(`−${f.removed}`)))))
      .when(ch.truncated, (el) => el.child(div().text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child("More files changed than are listed; open the diff for all of them.")));
  }
}

/** A list row's frame: one height, one pick style. */
function rowShell(c, picked) {
  return h_flex()
    .role("list_item")
    .aria_selected(picked)
    .w_full()
    .min_h(CONTROL + SPACE[4])
    .px(SPACE[3])
    .py(SPACE[2])
    .gap(SPACE[3])
    .items_center()
    .rounded(RADIUS.control)
    .when(picked, (el) => el.bg(c.hover));
}

/** A sub-tab's body in the thread's column, scrolling on its own. */
function scrolled(content, body) {
  return v_flex().absolute().inset_0().overflow_y_scroll().items_center().child(v_flex().flex_none().w(content).py(SPACE[4]).child(body));
}

/** One skeleton row: the shape a row will take, while it is read. */
function skeleton(c) {
  return h_flex().w_full().px(SPACE[3]).py(SPACE[2]).gap(SPACE[3]).items_center()
    .child(div().flex_none().size(20).rounded_full().bg(c.well))
    .child(v_flex().flex_1().min_w(0).gap(SPACE[2])
      .child(div().w_full().max_w(420).h(10).rounded(SPACE[1]).bg(c.well))
      .child(div().w_full().max_w(220).h(8).rounded(SPACE[1]).bg(c.well)));
}
