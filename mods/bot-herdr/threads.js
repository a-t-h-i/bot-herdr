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
import { terminals, settings, shared, setShared, run } from "herdr";
import { SIZE, TYPE_SCALE, LINE, SPACE, CONTROL, RADIUS, STATE, MOTION, HIGHLIGHT_MS, stateTone, clickable, activates, reducedMotion } from "./look.js";
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
import { activeStage, showPage, openTerminal, viewShown, wakeGoal, FOCUS, OPEN_TASK, OPEN_THREAD } from "./pages.js";
import { appKeyAction, isChord, keyName, nextPick, opensRow } from "./rowkeys.js";
import { KEYMAP_OPEN } from "./keymap.js";
import { arrivedIds, newlyDone } from "./signals.js";
import { PeekDrawer, PEEK_WIDTH, approvalAnswerError } from "./peek.js";
import { renderApprovalCard } from "./approvalcard.js";
import { renderDiffView } from "./diffreview.js";
import { renderThreadMap, renderForkOrigin } from "./threadmap.js";
import {
  ORCHESTRATOR, SUB_TABS, STATE_ORDER, GROUP_LABELS, VIEW_MODES, threadRows, groupThreads, drawnOrder, stateCounts, subOrDefault, breadcrumb,
  conversation, planModel, changesModel, goalRowModel, goalRowParts, approvalsForTask, approvalAnswerArgs,
  diffModel, reviewCommentsList, openReviewCount, reviewAddArgs, reviewRemoveArgs, reviewSendArgs,
  viewModeOrDefault, nextViewMode, filterConversation, threadSummary, threadMapModel, forkPrefill, forkArgs,
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

/** Whether a conversation entry is open in the given view mode. */
export function entryIsOpen(mode, key, expanded, verboseFolded) {
  if (mode === "verbose") return !verboseFolded.has(key);
  if (mode === "summary") return false;
  return expanded.has(key);
}

/** Toggles a machine entry's folded state in the active view mode. */
export function toggleEntryOpen(mode, key, expanded, verboseFolded) {
  if (mode === "verbose") return toggleMachine(verboseFolded, key);
  if (mode === "normal") return toggleMachine(expanded, key);
  return expanded;
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
    this.verboseFolded = new Set(); // conversation entries manually folded in Verbose mode
    this.machineOpen = new Set(); // folded machine text opened in the plan or approval cards
    this.viewModes = new Map(); // thread id -> "summary" | "normal" | "verbose"
    this.approvals = []; // pending approvals belonging to the open thread
    this.approvalAnswered = new Map(); // approval id -> choice while folding
    this.approvalFolded = new Set(); // approval ids finished folding
    this.expandedDiffs = new Set(); // file paths expanded in Changes
    this.diffs = new Map(); // path -> diffModel | null
    this.diffLoading = new Set(); // file paths currently reading diff
    this.reviewComments = []; // bh review list for the open thread
    this.reviewCommenting = null; // { path, line } for the one open inline review box
    this.reviewSaving = false;
    this.reviewSending = false;
    this.reviewTyping = false;
    this.reviewInput = InputState.new({ placeholder: "Add a review comment…" });
    this.reviewInput.on("submit", (_e, cx) => this.saveReviewComment(cx));
    this.reviewInput.on("focus", (_e, cx) => {
      this.reviewTyping = true;
      cx.notify();
    });
    this.reviewInput.on("blur", (_e, cx) => {
      this.reviewTyping = false;
      cx.notify();
    });
    this.forkOpen = false;
    this.forking = false;
    this.forkTyping = false;
    this.forkInput = InputState.new({ placeholder: "What to carry into the forked thread…" });
    this.forkInput.on("submit", (_e, cx) => this.submitFork(cx));
    this.forkInput.on("focus", (_e, cx) => {
      this.forkTyping = true;
      cx.notify();
    });
    this.forkInput.on("blur", (_e, cx) => {
      this.forkTyping = false;
      cx.notify();
    });
    this.armed = null; // Clear, once clicked, waits for a second click
    this.seenNeeds = null; // needs-you thread ids seen at last load, for the one-shot arrival pulse
    this.pulsingNeeds = new Set(); // newly arrived needs-you thread ids pulsing 0.35 -> 1 once
    this.seenDone = null; // thread done states at last load, for the 2 s finish highlight
    this.finishing = new Map(); // thread id -> "on" | "fade" while newly finished
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
    this.peek = new PeekDrawer({ onChanged: (cx) => this.refresh(cx) });
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
      if (got) {
        this.data = got;
        this.trackListTransitions(got, cx);
      }
      cx.notify();
    });
  }

  /** Tracks newly arrived needs-you threads (one-shot pulse) and newly finished threads (2 s highlight). */
  trackListTransitions(got, cx) {
    const rows = threadRows(got);
    const needIds = rows.filter((r) => r.state === "needsYou").map((r) => r.id);
    const { arrived, seen } = arrivedIds(needIds, this.seenNeeds);
    this.seenNeeds = seen;
    if (arrived.length > 0 && !reducedMotion()) {
      for (const id of arrived) this.pulsingNeeds.add(id);
      cx.timer.after(16, (cx) => {
        for (const id of arrived) this.pulsingNeeds.delete(id);
        cx.notify();
      });
    }
    const { finished, seen: doneSeen } = newlyDone(rows.map((r) => ({ id: r.id, done: r.state === "done" })), this.seenDone);
    this.seenDone = doneSeen;
    for (const id of finished) this.triggerHighlight(id, cx);
  }

  /** Holds a soft overlay on a newly finished thread row for 2 s, then fades it over MOTION.highlight. */
  triggerHighlight(id, cx) {
    if (reducedMotion()) return;
    this.finishing.set(id, "on");
    cx.timer.after(HIGHLIGHT_MS, (cx) => {
      if (!this.finishing.has(id)) return;
      this.finishing.set(id, "fade");
      cx.notify();
      cx.timer.after(MOTION.highlight.duration + 32, (cx) => {
        if (this.finishing.get(id) !== "fade") return;
        this.finishing.delete(id);
        cx.notify();
      });
    });
  }

  /** Reads one thread, its goal progress, its pending approvals and its review comments. */
  loadDetail(id, cx) {
    cx.spawn(async (cx) => {
      const dir = projectDir();
      const [got, ap, rv] = await Promise.all([
        bhJson(["thread", "show", id], { cwd: dir }),
        bhJson(["approvals", "list"], { cwd: dir }),
        bhJson(["review", "list", id], { cwd: dir }),
      ]);
      if (this.opened !== id) return;
      if (got) {
        this.detail = got;
        this.detailId = id;
      }
      this.approvals = approvalsForTask(ap, id);
      this.reviewComments = reviewCommentsList(rv);
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
    this.verboseFolded = new Set();
    this.forkOpen = false;
    this.reviewCommenting = null;
    if (this.detailId !== id) {
      this.detail = null;
      this.progress = null;
      this.approvals = [];
      this.reviewComments = [];
      this.expandedDiffs.clear();
      this.diffs.clear();
      this.diffLoading.clear();
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

  /** View-local app keys (Ctrl+1..5, ?), peek keys, Esc back, `v` view mode, then list keys. */
  keys(e, cx) {
    const typing = Boolean(
      this.searching
      || this.peek.typing
      || this.reviewTyping
      || this.forkTyping
      || this.chat.composer.focused
      || this.chat.composer.typingCount > 0
      || this.chat.typingCount > 0
      || this.work.typingCount > 0
      || this.work.editing
      || this.work.taskComposer?.focused
      || (this.work.taskComposer?.typingCount ?? 0) > 0,
    );
    const app = appKeyAction(e, { typing });
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
    if (this.peek.keys(e, cx)) return cx.stop_propagation();
    const key = keyName(e);
    if (key === "escape" && this.forkOpen) {
      this.forkOpen = false;
      cx.stop_propagation();
      return cx.notify();
    }
    if (key === "escape" && this.reviewCommenting) {
      this.reviewCommenting = null;
      cx.stop_propagation();
      return cx.notify();
    }
    if (key === "escape" && this.opened && !this.chat.composer.focused) {
      this.back(cx);
      return cx.stop_propagation();
    }
    if (this.opened && this.opened !== ORCHESTRATOR && !typing && key === "v") {
      this.setViewMode(nextViewMode(this.viewMode()), cx);
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
    const room = this.width - (this.peek.isOpen() ? PEEK_WIDTH : 0);
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
    const pulsing = t.state === "needsYou" && this.pulsingNeeds.has(t.id) && !reducedMotion();
    const hl = this.finishing.get(t.id);
    // One amber pulse on arrival, then still (and no pulse under Reduce motion).
    const glyph = div()
      .id(`bh-thread-glyph-${t.id}`)
      .flex_none()
      .text_size(TYPE_SCALE.title)
      .text_color(stateTone(c, t.state))
      .opacity(pulsing ? 0.35 : 1)
      .transition("opacity", MOTION.arrive)
      .child(s.glyph);
    return clickable(
      rowShell(c, picked).accessibility_label(`${s.word}: ${t.title}`)
        .on_click((_e, cx) => {
          this.pick = at;
          this.openThread(t.id, cx);
        })
        .when(Boolean(hl), (el) => el.child(div()
          .id(`bh-thread-hl-${t.id}`)
          .absolute()
          .inset_0()
          .rounded(RADIUS.control)
          .bg(stateTone(c, "done"))
          .opacity(hl === "on" ? 0.14 : 0)
          .transition("opacity", MOTION.highlight)))
        .child(glyph)
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

  /** Active conversation density mode for the open thread (Normal by default). */
  viewMode() {
    return viewModeOrDefault(this.viewModes.get(this.opened));
  }

  /** Stores the view mode per thread in memory and redraws. */
  setViewMode(mode, cx) {
    if (!this.opened || this.opened === ORCHESTRATOR) return;
    this.viewModes.set(this.opened, viewModeOrDefault(mode));
    this.verboseFolded = new Set();
    cx.notify();
  }

  /** Opens or closes the inline Fork context input, prefilled with the thread's summary line. */
  toggleFork(cx) {
    this.forkOpen = !this.forkOpen;
    if (this.forkOpen) {
      const row = this.rows().find((r) => r.id === this.opened) ?? null;
      this.forkInput.set_value(forkPrefill(this.detail, row));
      this.forkInput.focus();
    }
    cx.notify();
  }

  /** Runs `bh thread fork <id> "<text>"` and opens the newly forked thread. */
  submitFork(cx) {
    const args = forkArgs(this.opened, this.forkInput.value());
    if (!args || this.forking) return;
    this.forking = true;
    cx.notify();
    cx.spawn(async (cx) => {
      const got = await bhJson(args, { cwd: projectDir() });
      this.forking = false;
      this.forkOpen = false;
      if (got && got.implemented !== false && got.id) {
        this.load(cx);
        this.openThread(String(got.id), cx);
        return;
      }
      if (got && got.implemented !== false && got.error) this.problem = String(got.error);
      cx.notify();
    });
  }

  /** Inline input for starting a forked thread with carried context. */
  forkBar(c) {
    return h_flex()
      .id("bh-fork-input")
      .w_full()
      .gap(SPACE[2])
      .items_center()
      .on_key_down((e, cx) => {
        if (keyName(e) !== "escape") return;
        this.forkOpen = false;
        cx.stop_propagation();
        cx.notify();
      })
      .child(h_flex().flex_1().min_w(0).h(CONTROL).px(SPACE[3]).items_center().rounded(SIZE.control).bg(c.fill).border_1().border_color(c.controlBorder ?? c.edge)
        .accessibility_label("Context to carry into the forked thread")
        .child(Input.new(this.forkInput).flex_1().min_w(0).h_full().text_size(TYPE_SCALE.body).text_color(c.textPrimary)))
      .child(actionButton(c, "bh-fork-submit", "Create fork", (_e, cx) => this.submitFork(cx), { tone: "secondary", disabled: this.forking, tooltip: "Create forked thread (Enter)" }))
      .child(actionButton(c, "bh-fork-cancel", "Cancel", (_e, cx) => {
        this.forkOpen = false;
        cx.notify();
      }, { tone: "quiet", tooltip: "Cancel (Esc)" }));
  }

  /** Peeks a child worker or forked thread from the thread map. */
  peekMapItem(item, cx) {
    if (item.kind === "fork") return this.peek.toggle({ kind: "thread", id: item.id }, cx);
    const live = this.findChildTerminal(item);
    this.peek.toggle({
      kind: "agent",
      agent: { name: item.name, address: live?.address ?? item.address ?? item.name, state: item.state, task: this.opened },
    }, cx);
  }

  /** Opens a forked thread or a child worker's terminal (or Steps when no terminal is live). */
  openMapItem(item, cx) {
    if (item.kind === "fork") return this.openThread(item.id, cx);
    const live = this.findChildTerminal(item);
    if (live?.address) return openTerminal(live.address);
    this.sub = "steps";
    cx.notify();
  }

  /** Finds a live terminal for a child worker by address or name. */
  findChildTerminal(item) {
    const wanted = String(item.address || item.name || "").toLowerCase();
    return terminals().find((t) => t?.state === "live" && (String(t.address ?? "").toLowerCase() === wanted || String(t.name ?? "").toLowerCase() === wanted)) ?? null;
  }

  /** The breadcrumb, the second row (sub-tabs + view mode), optional thread map, and the sub-tab body. */
  threadPage(c, cx) {
    const content = this.column();
    const sub = subOrDefault(this.sub);
    const mode = this.viewMode();
    const map = this.detail && this.detailId === this.opened ? threadMapModel(this.detail, { rows: this.rows() }) : null;
    const peeking = this.peek.isOpen();
    return div().size_full().relative()
      .child(v_flex().absolute().top(0).bottom(0).left(0).right(peeking ? PEEK_WIDTH : 0).items_center()
        .child(v_flex().flex_none().w(content).pt(SPACE[5]).gap(SPACE[3])
          .child(h_flex().gap(SPACE[2]).items_center()
            .child(div().flex_1().min_w(0).child(this.crumbs(c, sub)))
            .child(actionButton(c, "bh-thread-fork", "Fork", (_e, cx) => this.toggleFork(cx), { tone: "secondary", tooltip: "Fork this thread with carried context" }))
            .child(actionButton(c, "bh-thread-files", "Files", () => run("mod.open", { name: "files" }), { tone: "quiet", tooltip: "Open the Files window" })))
          .when(Boolean(map?.forkOf), (el) => el.child(renderForkOrigin(c, { forkOf: map.forkOf, onOpen: (id, cx) => this.openThread(id, cx) })))
          .when(this.forkOpen, (el) => el.child(this.forkBar(c)))
          .child(h_flex().gap(SPACE[3]).items_center()
            .child(segmented(c, {
              id: "bh-thread-tabs",
              items: SUB_TABS.map((t) => ({ id: t.id, label: t.label, on: t.id === sub })),
              onPick: (id, cx) => {
                this.sub = subOrDefault(id);
                cx.notify();
              },
            }))
            .child(div().flex_1())
            .when(sub === "conversation", (el) => el.child(segmented(c, {
              id: "bh-view-mode",
              choice: true,
              items: VIEW_MODES.map((m) => ({ id: m.id, label: m.label, on: m.id === mode })),
              onPick: (id, cx) => this.setViewMode(id, cx),
            }))))
          .when(Boolean(map?.hasTree), (el) => el.child(renderThreadMap(c, {
            model: map,
            onPeek: (item, cx) => this.peekMapItem(item, cx),
            onOpen: (item, cx) => this.openMapItem(item, cx),
          })))
          .when(Boolean(this.problem), (el) => el.child(div().text_size(TYPE_SCALE.metadata).text_color(c.danger).child(this.problem))))
        .child(div().flex_1().min_h(0).w_full().relative().child(this.subBody(c, sub, content, cx))))
      .when(peeking, (el) => el.child(this.peek.render(c)));
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

  /** Answers a pending approval card in this thread and folds it over MOTION.fold. */
  answerApproval(record, choice, cx) {
    const args = approvalAnswerArgs(record?.id, choice);
    if (!args || this.approvalAnswered.has(record.id)) return;
    this.approvalAnswered.set(record.id, choice);
    if (reducedMotion()) {
      this.approvalFolded.add(record.id);
    } else {
      cx.timer.after(MOTION.fold.duration + 16, (cx) => {
        if (this.approvalAnswered.get(record.id) !== choice) return;
        this.approvalFolded.add(record.id);
        cx.notify();
      });
    }
    cx.notify();
    cx.spawn(async (cx) => {
      const r = await bh([...args, "--json"], { cwd: projectDir() });
      const error = approvalAnswerError(r);
      if (error) {
        this.approvalAnswered.delete(record.id);
        this.approvalFolded.delete(record.id);
        this.problem = error;
      } else {
        this.problem = null;
        if (this.opened && this.opened !== ORCHESTRATOR) this.loadDetail(this.opened, cx);
      }
      cx.notify();
    });
  }

  // Conversation: pending approvals, then the board and replies (in Summary/Normal/Verbose), the goal row and composer.
  conversationBody(c, cx) {
    const composer = this.chat.composer;
    const availW = this.width - (this.peek.isOpen() ? PEEK_WIDTH : 0);
    const pageW = Math.max(320, Math.min(SIZE.maxWidth, availW - SIZE.gutter * 2));
    const goal = goalRowModel(this.progress);
    const foot = SIZE.foot + composer.height(pageW) + SPACE[4] + (goal ? GOAL_H + SPACE[3] : 0);
    const mode = this.viewMode();
    const allEntries = conversation(this.detail);
    const entries = filterConversation(allEntries, mode);
    const summaryLine = mode === "summary" ? threadSummary(this.detail) : "";
    const pendingApprovals = this.approvals.filter((r) => !this.approvalFolded.has(r.id));
    return div().absolute().inset_0()
      .child(v_flex().id("bh-thread-feed").absolute().top(0).left(0).right(0).bottom(foot).overflow_y_scroll().items_center()
        .child(v_flex().flex_none().w(pageW).py(SPACE[4]).gap(SPACE[3])
          .children(pendingApprovals.map((rec, i) => renderApprovalCard(c, {
            record: rec,
            answered: this.approvalAnswered.get(rec.id) ?? null,
            folded: this.approvalFolded.has(rec.id),
            expanded: this.machineOpen.has(`ap-${rec.id}`),
            onToggleCommand: (_e, cx) => {
              toggleMachine(this.machineOpen, `ap-${rec.id}`);
              cx.notify();
            },
            onAnswer: (r, ch, cx) => this.answerApproval(r, ch, cx),
            allowPrimary: i === 0,
          })).filter(Boolean))
          .when(Boolean(summaryLine), (el) => el.child(div().id("bh-thread-summary").px(SPACE[3]).py(SPACE[2]).rounded(RADIUS.control).bg(c.fill).border_1().border_color(c.edge).text_size(TYPE_SCALE.body).text_color(c.textSecondary).child(summaryLine)))
          .when(!entries.length && !pendingApprovals.length && !summaryLine, (el) => el.child(stateView(c, { id: "bh-thread-quiet", title: "Nothing said here yet.", line: "Replies, comments and the board's entries for this thread appear here. Write below to start." })))
          .children(entries.map((e) => this.entry(c, e, mode)))))
      .child(v_flex().absolute().left(0).right(0).bottom(SIZE.foot).items_center().gap(SPACE[3])
        .when(Boolean(goal), (el) => el.child(this.goalRow(c, goal, pageW)))
        .child(composer.render(cx, availW, this.height, c)));
  }

  /** One board entry: type word (muted), author, time, first line; Summary stays 1 line, Verbose unfolds all. */
  entry(c, e, mode = "normal") {
    const open = entryIsOpen(mode, e.key, this.expanded, this.verboseFolded);
    const head = h_flex().gap(SPACE[2]).items_center()
      .child(div().flex_none().text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child(e.word))
      .child(div().flex_none().text_size(TYPE_SCALE.metadata).font_semibold().text_color(c.textPrimary).child(e.from))
      .when(Boolean(e.to), (el) => el.child(div().flex_none().text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child(`→ ${e.to}`)))
      .child(div().flex_none().text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child(ago(e.at)));
    if (e.machine) return this.machineEntry(c, e, head, open, mode);
    const body = open
      ? div().text_size(TYPE_SCALE.body).line_height(`${LINE.md}px`).text_color(c.textPrimary).child(e.text)
      : div().truncate().text_size(TYPE_SCALE.body).text_color(c.textPrimary).child(e.first);
    const fold = e.more && mode === "normal" ? (open ? " (open; press to fold)" : " (press to read all)") : "";
    const card = v_flex().role("article").accessibility_label(`${e.word} from ${e.from}: ${e.first}${fold}`).gap(SPACE[1]).px(SPACE[3]).py(SPACE[2]).rounded(RADIUS.control).child(head).child(body);
    if (!e.more || mode !== "normal") return card.id(`bh-thread-entry-${e.key}`);
    return clickable(card.on_click((_e, cx) => {
      if (this.expanded.has(e.key)) this.expanded.delete(e.key);
      else this.expanded.add(e.key);
      cx.notify();
    }), c, `bh-thread-entry-${e.key}`, { edge: true, fill: c.hover });
  }

  /** A board entry whose body is JSON, a stack trace or a path: one muted mono line that unfolds. */
  machineEntry(c, e, head, open, mode = "normal") {
    const id = `bh-thread-entry-${e.key}`;
    const line = machineLine(c, { id: `${id}-text`, text: e.text, expanded: open, onToggle: (_e, cx) => {
      toggleEntryOpen(mode, e.key, this.expanded, this.verboseFolded);
      cx.notify();
    } });
    return v_flex().id(id).role("article").accessibility_label(`${e.word} from ${e.from}: machine text`).gap(SPACE[1]).px(SPACE[3]).py(SPACE[2]).rounded(RADIUS.control).child(head).child(line);
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

  /** Expands or collapses one file's in-place diff (`bh review diff`). */
  toggleDiff(path, cx) {
    if (this.expandedDiffs.has(path)) {
      this.expandedDiffs.delete(path);
      if (this.reviewCommenting?.path === path) this.reviewCommenting = null;
      return cx.notify();
    }
    this.expandedDiffs.add(path);
    if (!this.diffs.has(path) && !this.diffLoading.has(path)) {
      const taskId = this.opened;
      this.diffLoading.add(path);
      cx.spawn(async (cx) => {
        const got = await bhJson(["review", "diff", taskId, path], { cwd: projectDir() });
        this.diffLoading.delete(path);
        if (this.opened !== taskId) return;
        this.diffs.set(path, diffModel(got));
        cx.notify();
      });
    }
    cx.notify();
  }

  /** Opens the one inline review comment box under `(path, line)`. */
  startReviewComment(path, line, cx) {
    const same = this.reviewCommenting?.path === path && this.reviewCommenting?.line === line;
    this.reviewCommenting = same ? null : { path, line };
    if (!same) {
      this.reviewInput.set_value("");
      this.reviewInput.focus();
    }
    cx.notify();
  }

  /** Saves the open inline comment via `bh review add`. */
  saveReviewComment(cx) {
    const where = this.reviewCommenting;
    const args = where ? reviewAddArgs(this.opened, where.path, where.line, this.reviewInput.value()) : null;
    if (!args || this.reviewSaving) return;
    this.reviewSaving = true;
    cx.notify();
    cx.spawn(async (cx) => {
      const got = await bhJson(args, { cwd: projectDir() });
      this.reviewSaving = false;
      this.reviewCommenting = null;
      this.reviewInput.set_value("");
      if (got && got.implemented !== false && got.id) {
        const rv = await bhJson(["review", "list", this.opened], { cwd: projectDir() });
        this.reviewComments = reviewCommentsList(rv);
      }
      cx.notify();
    });
  }

  /** Removes one review comment via `bh review remove`. */
  removeReviewComment(cm, cx) {
    const args = reviewRemoveArgs(this.opened, cm?.id);
    if (!args) return;
    cx.spawn(async (cx) => {
      const got = await bhJson(args, { cwd: projectDir() });
      if (got && got.implemented !== false) {
        this.reviewComments = this.reviewComments.filter((x) => x.id !== cm.id);
      }
      cx.notify();
    });
  }

  /** Sends all open review comments to Dev via `bh review send`. */
  sendReviewComments(cx) {
    const args = reviewSendArgs(this.opened);
    if (!args || this.reviewSending) return;
    this.reviewSending = true;
    cx.notify();
    cx.spawn(async (cx) => {
      const got = await bhJson(args, { cwd: projectDir() });
      this.reviewSending = false;
      if (got && got.implemented !== false && this.opened) this.loadDetail(this.opened, cx);
      cx.notify();
    });
  }

  /** Changes: file rows expand in place into diffs with inline comments; Send to Dev hidden when 0. */
  changesBody(c) {
    const ch = changesModel(this.detail);
    if (!ch.available) return stateView(c, { id: "bh-thread-changes-none", title: "No changes yet.", line: "Files this thread's agents change appear here, with lines added and removed." });
    const openCount = openReviewCount(this.reviewComments);
    return v_flex().gap(SPACE[2])
      .child(h_flex().gap(SPACE[3]).items_center()
        .child(div().flex_1().min_w(0).text_size(TYPE_SCALE.body).text_color(c.textSecondary).child(ch.summary))
        .when(openCount > 0, (el) => el.child(actionButton(c, "bh-review-send", `Send to Dev · ${openCount}`, (_e, cx) => this.sendReviewComments(cx), { tone: "primary", disabled: this.reviewSending, tooltip: "Send open review comments to Dev" })))
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
      .child(v_flex().id("bh-thread-changes").role("list").gap(SPACE[1]).children(ch.files.map((f) => {
        const open = this.expandedDiffs.has(f.path);
        const toggle = (cx) => this.toggleDiff(f.path, cx);
        const row = clickable(
          activates(
            h_flex().role("list_item").accessibility_label(`${f.path}: ${f.added} added, ${f.removed} removed${open ? " (expanded)" : ""}`).h(CONTROL).px(SPACE[3]).gap(SPACE[3]).items_center().rounded(RADIUS.control)
              .on_click((_e, cx) => toggle(cx))
              .child(div().flex_1().min_w(0).truncate().text_size(TYPE_SCALE.body).text_color(c.textPrimary).child(f.path))
              .child(div().flex_none().text_size(TYPE_SCALE.metadata).text_color(c.stateDone ?? c.textSecondary).child(`+${f.added}`))
              .child(div().flex_none().text_size(TYPE_SCALE.metadata).text_color(c.stateFailed ?? c.textSecondary).child(`−${f.removed}`)),
            toggle,
          ),
          c,
          `bh-thread-change-${f.path}`,
          { fill: c.hover },
        );
        if (!open) return row;
        const diffEl = renderDiffView(c, {
          path: f.path,
          diff: this.diffs.get(f.path) ?? null,
          loading: this.diffLoading.has(f.path),
          comments: this.reviewComments,
          commentingLine: this.reviewCommenting?.path === f.path ? this.reviewCommenting.line : null,
          commentInput: this.reviewInput,
          saving: this.reviewSaving,
          onPickLine: (p, l, cx) => this.startReviewComment(p, l, cx),
          onSaveComment: (cx) => this.saveReviewComment(cx),
          onCancelComment: (cx) => {
            this.reviewCommenting = null;
            cx.notify();
          },
          onRemoveComment: (cm, cx) => this.removeReviewComment(cm, cx),
        });
        return diffEl ? v_flex().w_full().gap(SPACE[1]).child(row).child(diffEl) : row;
      })))
      .when(ch.truncated, (el) => el.child(div().text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child("More files changed than are listed; open the diff for all of them.")));
  }
}

/** A list row's frame: one height, one pick style. */
function rowShell(c, picked) {
  return h_flex()
    .relative()
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
