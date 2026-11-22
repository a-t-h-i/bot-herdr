// Home: what needs you first, then the fleet (the agents running now and the Goals in flight) and
// today's spend — read from `bh home --json`. Every row opens its thread (openThread), and Space
// peeks it in the shared drawer (peek.js) without leaving Home. Nothing empty is drawn (a quiet line says
// so instead), a page that is still reading is skeleton rows in the final layout, never a
// spinner, and an empty project says what will appear here and offers the one thing to do.

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { settings, shared, setShared } from "herdr";
import { SIZE, TYPE_SCALE, LINE, SPACE, CONTROL, RADIUS, STATE, MOTION, HIGHLIGHT_MS, stateTone, clickable, reducedMotion } from "./look.js";
import { stateView, avatar } from "./switch.js";
import { sectionLabel } from "./plandoc.js";
import { colors } from "./theme.js";
import { activeStage, openThread, openTerminal, showPage, viewShown } from "./pages.js";
import { bhJson, projectDir } from "./bh.js";
import { mentionTone, agentStateMark as stateMark } from "./indicators.js";
import { price, compact, duration, ago } from "./numbers.js";
import { appKeyAction, isChord, keyName, nextPick, opensRow } from "./rowkeys.js";
import { KEYMAP_OPEN } from "./keymap.js";
import { OPEN_COUNTS, HOME_NEEDS, needsYouCount, needsYouIds, withHomeCount, arrivedIds, newlyDone } from "./signals.js";
import { PeekDrawer, PEEK_WIDTH } from "./peek.js";

const REFRESH_MS = 10000;
const MAX = 1140; // the work pages' widest column
const GAP = SPACE[4];
const AVATARS = 3; // how many agents a thread row names before it stops

/** How each kind of "needs you" reads in one word, in the row's own muted metadata. */
const KIND_WORDS = { question: "Question", blocker: "Blocker", review: "Review", approval: "Approval", issue: "Issue" };
const kindWord = (kind) => KIND_WORDS[kind] ?? "Needs you";

/** The reply count and the age a thread row carries: "2/6 · 3h". */
const threadMeta = (t) => [Number(t?.steps?.total) ? `${Number(t.steps.done) || 0}/${Number(t.steps.total)}` : null, ago(t?.updated)].filter(Boolean).join(" · ");

/** One skeleton row: the shape a row will take, in the quiet surface, while Home is reading. */
function skeletonRow(c, wide, narrow) {
  return h_flex()
    .w_full()
    .px(SPACE[3])
    .py(SPACE[2])
    .gap(SPACE[3])
    .items_center()
    .child(div().flex_none().size(20).rounded_full().bg(c.well))
    .child(v_flex().flex_1().min_w(0).gap(SPACE[2])
      .child(div().w_full().max_w(wide).h(10).rounded(SPACE[1]).bg(c.well))
      .child(div().w_full().max_w(narrow).h(8).rounded(SPACE[1]).bg(c.well)));
}

export class Home {
  init(_given, cx) {
    this.data = null; // the last answer of bh home
    this.loading = true;
    this.failed = false;
    this.busy = false;
    this.shown = false; // Home was showing at the last draw: opening it reads again
    this.width = 900;
    this.pick = 0; // the row Enter opens
    this.seenNeeds = null; // needs-you ids seen at the last load, for the one-shot arrival pulse
    this.pulsingNeeds = new Set(); // newly arrived needs-you ids animating 0.35 -> 1 once
    this.seenDone = null; // thread/goal done states at the last load, for the 2 s finish highlight
    this.finishing = new Map(); // id -> "on" | "fade" while a newly finished row highlights
    this.publishedHomeSig = "";
    this.handle = cx.focus_handle();
    this.peek = new PeekDrawer({ onChanged: (cx) => this.load(cx) }); // Space opens it for the picked row, Esc closes it
    this.load(cx);
    cx.timer.every(REFRESH_MS, (cx) => {
      if (viewShown("home") && activeStage() !== "terminals") this.load(cx);
    });
  }

  /** Publishes Home's needs-you total to OPEN_COUNTS.home and HOME_NEEDS for the top-bar badge. */
  publishHome(data) {
    if (!data) return;
    const count = needsYouCount(data);
    const ids = needsYouIds(data);
    const sig = `${count}:${ids.join(",")}`;
    if (sig === this.publishedHomeSig) return;
    this.publishedHomeSig = sig;
    setShared(OPEN_COUNTS, withHomeCount(shared(OPEN_COUNTS), count));
    setShared(HOME_NEEDS, { count, ids });
  }

  /** Tracks newly arrived needs-you items (one-shot pulse) and newly finished rows (2 s highlight). */
  trackUpdates(data, cx) {
    this.publishHome(data);
    const { arrived, seen } = arrivedIds(needsYouIds(data), this.seenNeeds);
    this.seenNeeds = seen;
    if (arrived.length > 0 && !reducedMotion()) {
      for (const id of arrived) this.pulsingNeeds.add(id);
      cx.timer.after(16, (cx) => {
        for (const id of arrived) this.pulsingNeeds.delete(id);
        cx.notify();
      });
    }
    const items = [
      ...(Array.isArray(data?.review) ? data.review.map((t) => ({ id: t?.id, done: t?.state === "done" })) : []),
      ...(Array.isArray(data?.fleet?.goals) ? data.fleet.goals.map((g) => ({ id: g?.task, done: g?.state === "done" })) : []),
    ];
    const { finished, seen: doneSeen } = newlyDone(items, this.seenDone);
    this.seenDone = doneSeen;
    for (const id of finished) this.triggerHighlight(id, cx);
  }

  /** Holds a soft overlay on a newly finished row for 2 s, then fades it over MOTION.highlight. */
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

  /** Reads what needs you and what is running; a failed read keeps the last answer and says so. */
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
        this.trackUpdates(got, cx);
      }
      cx.notify();
    });
  }

  /**
   * The page's rows in the order they are drawn, so J / K / Home / End move the pick and Enter
   * opens the picked one. Reviews are their own section (their own glyph), so they are not here
   * twice. Empty while Home is still reading.
   */
  rows() {
    const d = this.data;
    if (!d) return [];
    const needPeek = (n) => (n.kind === "approval"
      ? { kind: "approval", id: n.ref, thread: n.thread ?? null, item: n }
      : n.thread ? { kind: "thread", id: n.thread } : null);
    return [
      ...this.needs().map((n) => ({
        id: n.thread ?? n.ref,
        open: (cx) => (n.thread ? openThread(n.thread) : n.kind === "approval" ? this.peek.toggle(needPeek(n), cx) : null),
        peek: needPeek(n),
      })),
      ...this.reviews().map((t) => ({ id: t.id, open: () => openThread(t.id), peek: { kind: "thread", id: t.id } })),
      ...this.agents().map((a) => ({ id: a.address, open: () => openTerminal(a.address), peek: { kind: "agent", agent: a } })),
      ...this.goals().map((g) => ({ id: g.task, open: () => openThread(g.task), peek: { kind: "thread", id: g.task } })),
    ];
  }

  /** The things that need you, reviews aside (those have their own section and glyph). */
  needs() {
    const list = this.data?.needsYou;
    return Array.isArray(list) ? list.filter((n) => n?.kind !== "review") : [];
  }
  /** The threads waiting on a review. */
  reviews() {
    const list = this.data?.review;
    return Array.isArray(list) ? list : [];
  }
  /** The agents running now. */
  agents() {
    const list = this.data?.fleet?.agents;
    return Array.isArray(list) ? list : [];
  }
  /** The Goals in flight. */
  goals() {
    const list = this.data?.fleet?.goals;
    return Array.isArray(list) ? list : [];
  }

  /** View-local app keys (Ctrl+1..5, ?), peek keys (Esc, 1–9), then J / K / Home / End / Space / Enter. */
  keys(e, cx) {
    const app = appKeyAction(e, { typing: this.peek.typing });
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
    if (this.peek.typing) return;
    const rows = this.rows();
    const next = nextPick(keyName(e), this.pick, rows.length);
    if (next >= 0 && next !== this.pick) {
      this.pick = next;
      cx.stop_propagation();
      cx.notify();
      return;
    }
    const picked = rows[this.pick];
    if (keyName(e) === "space" && picked?.peek) {
      this.peek.toggle(picked.peek, cx);
      cx.stop_propagation();
    } else if (opensRow(keyName(e)) && picked) {
      picked.open(cx);
      cx.stop_propagation();
    }
  }

  render(cx) {
    const open = viewShown("home");
    if (open && !this.shown) cx.timer.after(1, (cx) => this.load(cx));
    this.shown = open;
    if (this.data && !this.publishedHomeSig) this.publishHome(this.data);
    const c = colors();
    const peeking = this.peek.isOpen();
    const content = Math.max(320, Math.min(MAX, this.width - (peeking ? PEEK_WIDTH : 0) - SIZE.gutter * 2));
    return div()
      .id("bh-home")
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
        .id("bh-home-scroll")
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

  /** "Home" and the one count that says how the fleet is doing: "3 running · 1 needs you". */
  header(c) {
    const text = String(this.data?.header?.text ?? "");
    return h_flex().items_center().gap(SPACE[3])
      .child(div().text_size(TYPE_SCALE.title).font_semibold().text_color(c.textPrimary).child("Home"))
      .when(Boolean(text), (el) => el.child(div().text_size(TYPE_SCALE.metadata).text_color(c.textSecondary).child(text)));
  }

  /** What Home draws: the last read data, its skeletons, its error, or the teaching empty state. */
  body(c, content) {
    if (!this.data && this.failed) {
      return stateView(c, { id: "bh-home-error", title: "Couldn't read what needs you", line: "bh home did not answer. Try again, or check that bh is installed.", action: { label: "Try again", on: (_e, cx) => this.load(cx) } });
    }
    if (!this.data) {
      return v_flex().gap(GAP)
        .child(skeletonRow(c, content - SPACE[5], content * 0.4))
        .child(skeletonRow(c, content * 0.6, content * 0.3))
        .child(skeletonRow(c, content - SPACE[5], content * 0.5));
    }
    const needs = this.needs();
    const review = this.reviews();
    const agents = this.agents();
    const goals = this.goals();
    const spend = this.spendSection(c);
    if (!needs.length && !review.length && !agents.length && !goals.length) {
      return stateView(c, {
        id: "bh-home-empty",
        title: "Nothing is running.",
        line: "Start a task or a plan and its thread appears here, with whatever needs you on top.",
        action: { label: "Open Threads", on: () => showPage("threads") },
      });
    }
    // Every row knows where it sits in the page, so the keyboard's pick lands on the one drawn.
    return v_flex().gap(SPACE[5])
      .child(this.needsSection(c, needs, 0))
      .child(this.reviewSection(c, review, needs.length))
      .child(this.fleetSection(c, agents, goals, needs.length + review.length))
      .when(Boolean(spend), (el) => el.child(spend));
  }

  /** What needs you: questions, blockers, approvals and issues, each one row (reviews follow). */
  needsSection(c, items, at) {
    return v_flex().id("bh-home-needs").gap(SPACE[2])
      .child(sectionLabel(c, "Needs you"))
      .when(!items.length, (el) => el.child(quietLine(c, "Nothing needs you.")))
      .child(this.list(c, items.map((n, i) => this.needRow(c, n, at + i))));
  }

  /** QA's reviews, in the Review state's own glyph: one thread row each. */
  reviewSection(c, threads, at) {
    return v_flex().gap(SPACE[2])
      .child(sectionLabel(c, "Review first"))
      .when(!threads.length, (el) => el.child(quietLine(c, "Nothing is waiting on a review.")))
      .child(this.list(c, threads.map((t, i) => this.threadRow(c, t, at + i))));
  }

  /** The fleet: the agents running now, then the Goals in flight. */
  fleetSection(c, agents, goals, at) {
    return v_flex().gap(SPACE[2])
      .child(sectionLabel(c, "Running"))
      .when(!agents.length && !goals.length, (el) => el.child(quietLine(c, "No agent is running.")))
      .child(this.list(c, [
        ...agents.map((a, i) => this.agentRow(c, a, at + i)),
        ...goals.map((g, i) => this.goalRow(c, g, at + agents.length + i)),
      ]));
  }

  /** Today's spend, in the one number language: "$1.82 · 58.3M tokens · 5 turns". */
  spendSection(c) {
    const s = this.data?.spendToday;
    if (!s || !(Number(s.turns) > 0 || Number(s.costUsd) > 0)) return null;
    const parts = [price(s.costUsd), `${compact(s.tokens)} tokens`, `${Number(s.turns) || 0} turns`, duration(Number(s.minutes) * 60000)].filter(Boolean);
    return h_flex().items_center().gap(SPACE[2])
      .child(div().text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child("Today"))
      .child(div().text_size(TYPE_SCALE.body).text_color(c.textSecondary).child(parts.join(" · ")));
  }

  /** One list: its rows, or nothing when it has none. */
  list(c, rows) {
    const shown = rows.filter(Boolean);
    return v_flex().role("list").w_full().gap(SPACE[1]).children(shown);
  }

  /** One thing that needs you: its amber glyph, what it is, the line about it and who it is from. */
  needRow(c, item, at) {
    const who = String(item?.from ?? "");
    const picked = at === this.pick;
    const label = `${kindWord(item?.kind)}: ${String(item?.title ?? "Needs you")}`;
    const needKey = `${item?.kind ?? "need"}:${item?.thread ?? ""}:${item?.ref ?? item?.title ?? at}`;
    const pulsing = this.pulsingNeeds.has(needKey) && !reducedMotion();
    // One amber pulse on arrival, then still (and no pulse under Reduce motion).
    const glyph = div()
      .id(`bh-home-need-glyph-${item?.thread ?? item?.ref ?? at}`)
      .flex_none()
      .text_size(TYPE_SCALE.title)
      .text_color(stateTone(c, "needsYou"))
      .opacity(pulsing ? 0.35 : 1)
      .transition("opacity", MOTION.arrive)
      .child(STATE.needsYou.glyph);
    return clickable(
      h_flex()
        .role("list_item")
        .accessibility_label(label)
        .aria_selected(picked)
        .w_full()
        .min_h(CONTROL + SPACE[4])
        .px(SPACE[3])
        .py(SPACE[2])
        .gap(SPACE[3])
        .items_center()
        .rounded(RADIUS.control)
        .when(picked, (el) => el.bg(c.hover))
        .on_click((_e, cx) => {
          if (item?.kind === "approval" && !item?.thread) this.peek.toggle({ kind: "approval", id: item.ref, thread: null, item }, cx);
          else openThread(item?.thread);
        })
        .child(glyph)
        .child(v_flex().flex_1().min_w(0).gap(SPACE[1])
          .child(div().truncate().text_size(TYPE_SCALE.body).font_semibold().text_color(c.textPrimary).child(String(item?.title ?? "Needs you")))
          .when(Boolean(item?.text), (el) => el.child(div().id(`bh-row-summary-need-${item?.thread ?? item?.ref ?? at}`).truncate().text_size(TYPE_SCALE.metadata).text_color(c.textSecondary).child(String(item.text)))))
        .child(div().flex_none().text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child(kindWord(item?.kind)))
        .when(Boolean(who), (el) => el.child(avatar(c, who, mentionTone(c, who), 20))),
      c,
      `bh-home-need-${item?.thread ?? item?.ref ?? at}`,
      { fill: c.hover },
    );
  }

  /** A thread at a glance: state glyph, title, its agents, its steps and its age. */
  threadRow(c, t, at) {
    const state = STATE[t?.state] ? t.state : "idle";
    const agents = (t?.agents ?? []).slice(0, AVATARS);
    const meta = threadMeta(t);
    const picked = at === this.pick;
    const hl = t?.id ? this.finishing.get(String(t.id)) : null;
    return clickable(
      h_flex()
        .relative()
        .role("list_item")
        .accessibility_label(`${STATE[state].word}: ${String(t?.title ?? "Thread")}`)
        .aria_selected(picked)
        .w_full()
        .min_h(CONTROL + SPACE[4])
        .px(SPACE[3])
        .py(SPACE[2])
        .gap(SPACE[3])
        .items_center()
        .rounded(RADIUS.control)
        .when(picked, (el) => el.bg(c.hover))
        .on_click(() => openThread(t?.id))
        .when(Boolean(hl), (el) => el.child(doneOverlay(c, `bh-home-thread-hl-${t.id}`, hl)))
        .child(div().flex_none().text_size(TYPE_SCALE.title).text_color(stateTone(c, state)).child(STATE[state].glyph))
        .child(div().flex_1().min_w(0).truncate().text_size(TYPE_SCALE.body).text_color(c.textPrimary).child(String(t?.title ?? "Thread")))
        .child(h_flex().flex_none().gap(SPACE[1]).children(agents.map((name) => avatar(c, name, mentionTone(c, name), 20))))
        .when(Boolean(meta), (el) => el.child(div().flex_none().text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child(meta))),
      c,
      `bh-home-thread-${t?.id ?? at}`,
      { fill: c.hover },
    );
  }

  /** An agent running now: its avatar, name, the line it is on, its state and how fresh it is. */
  agentRow(c, a, at) {
    const state = STATE[a?.state] ? a.state : "idle";
    const name = String(a?.name ?? "Agent");
    const when = ago(a?.at);
    const picked = at === this.pick;
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
        .on_click(() => openTerminal(a?.address))
        .child(avatar(c, name, mentionTone(c, name), CONTROL, { working: state === "working" }))
        .child(v_flex().flex_1().min_w(0).gap(SPACE[1])
          .child(div().truncate().text_size(TYPE_SCALE.body).font_semibold().text_color(c.textPrimary).child(name))
          .when(Boolean(a?.summary), (el) => el.child(div().id(`bh-row-summary-agent-${a?.address ?? at}`).truncate().text_size(TYPE_SCALE.metadata).text_color(c.textSecondary).child(String(a.summary)))))
        // The state is glyph, colour and word, in the one place it is read (never colour alone);
        // at work, the glyph is its activity's cycle and the word what it is doing.
        .child(stateMark(c, a, state, `bh-home-activity-${a?.address ?? at}`))
        .when(Boolean(when), (el) => el.child(div().flex_none().text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child(when))),
      c,
      `bh-home-agent-${a?.address ?? at}`,
      { fill: c.hover },
    );
  }

  /** A Goal in flight: its state, its title, the judge's line, which gate it is at and its spend. */
  goalRow(c, g, at) {
    const state = STATE[g?.state] ? g.state : "working";
    const gate = Number(g?.total) ? `${Number(g.passed) || 0}/${Number(g.total)}` : "";
    const spend = Number(g?.maxSpendUsd) > 0 ? `${price(g.spendUsd)} of ${price(g.maxSpendUsd)}` : price(g?.spendUsd);
    const picked = at === this.pick;
    const hl = g?.task ? this.finishing.get(String(g.task)) : null;
    return clickable(
      h_flex()
        .relative()
        .role("list_item")
        .accessibility_label(`Goal: ${String(g?.title ?? "Goal")}, ${STATE[state].word}`)
        .aria_selected(picked)
        .w_full()
        .min_h(CONTROL + SPACE[4])
        .px(SPACE[3])
        .py(SPACE[2])
        .gap(SPACE[3])
        .items_center()
        .rounded(RADIUS.control)
        .when(picked, (el) => el.bg(c.hover))
        .on_click(() => openThread(g?.task))
        .when(Boolean(hl), (el) => el.child(doneOverlay(c, `bh-home-goal-hl-${g.task}`, hl)))
        // The state is glyph, colour and word, as on an agent row (never colour or glyph alone).
        .child(h_flex().flex_none().gap(SPACE[1]).items_center().text_color(stateTone(c, state))
          .child(div().text_size(TYPE_SCALE.title).child(STATE[state].glyph))
          .child(div().text_size(TYPE_SCALE.metadata).child(STATE[state].word)))
        .child(v_flex().flex_1().min_w(0).gap(SPACE[1])
          .child(div().truncate().text_size(TYPE_SCALE.body).font_semibold().text_color(c.textPrimary).child(String(g?.title ?? g?.task ?? "Goal")))
          .when(Boolean(g?.summary), (el) => el.child(div().id(`bh-row-summary-goal-${g?.task ?? at}`).truncate().text_size(TYPE_SCALE.metadata).text_color(c.textSecondary).child(String(g.summary)))))
        .when(Boolean(gate), (el) => el.child(div().flex_none().text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child(gate)))
        .when(Boolean(spend), (el) => el.child(div().flex_none().text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child(spend))),
      c,
      `bh-home-goal-${g?.task ?? at}`,
      { fill: c.hover },
    );
  }
}

/** Soft opacity overlay held for 2 s when a row turns done, then faded via MOTION.highlight. */
function doneOverlay(c, id, phase) {
  return div()
    .id(id)
    .absolute()
    .inset_0()
    .rounded(RADIUS.control)
    .bg(stateTone(c, "done"))
    .opacity(phase === "on" ? 0.14 : 0)
    .transition("opacity", MOTION.highlight);
}

/** A quiet line where a section has nothing: said once, never as a zero count. */
function quietLine(c, text) {
  return div().px(SPACE[3]).py(SPACE[2]).text_size(TYPE_SCALE.metadata).line_height(`${LINE.md}px`).text_color(c.textMuted).child(text);
}
