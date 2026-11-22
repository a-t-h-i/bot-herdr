// The Metrics page: how much each agent worked in a window (today, 7 days, 30 days, all), read
// from `bh metrics`. A window picker, one totals row, then a card per agent, busiest first, with
// its six numbers and a bar per day. The words and numbers come from metricsview.js.

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { settings } from "herdr";
import { SIZE, TYPE, LINE, SPACE, CONTROL, TYPE_SCALE, RADIUS } from "./look.js";
import { segmented, stateView, avatar } from "./switch.js";
import { actionButton } from "./button.js";
import { colors } from "./theme.js";
import { viewShown } from "./pages.js";
import { bhJson, projectDir } from "./bh.js";
import { mentionTone } from "./indicators.js";
import { WINDOWS, DEFAULT_WINDOW, cells, hero, cardDetail, columnsFor, barHeights, dailyLabel, rankOf } from "./metricsview.js";

const REFRESH_MS = 10000;
const MAX = 1140; // the work pages' widest column
const GAP = 14; // between cards, as on Settings
const PAD = 14; // inside a card, as on Settings
const BARS_H = 44; // the daily chart's tallest bar

/** One number: its value, a muted second line when it has one, and its label under. */
function cell(c, x, size) {
  return v_flex()
    .flex_1()
    .min_w(0)
    .gap(SPACE[1])
    .child(div().truncate().text_size(size).font_semibold().text_color(c.ink)
      .when(Boolean(x.tip), (el) => el.tooltip(x.tip))
      .child(x.value))
    .when(Boolean(x.sub), (el) => el.child(div().truncate().text_size(TYPE.xs).text_color(c.muted).child(x.sub)))
    .child(div().truncate().text_size(TYPE.xs).text_color(c.muted).child(x.label));
}

/** Six numbers in rows of `per`. */
function cellRows(c, list, per, size) {
  const rows = [];
  for (let i = 0; i < list.length; i += per) rows.push(list.slice(i, i + per));
  return v_flex().gap(SPACE[4]).children(rows.map((row) => h_flex().gap(SPACE[4]).items_start().children(row.map((x) => cell(c, x, size)))));
}

/** The daily bars: a neutral step, as tall as the busiest day, under a one-word label; said in words for a screen reader. */
function bars(c, daily) {
  return v_flex()
    .role("image")
    .accessibility_label(dailyLabel(daily))
    .w_full()
    .gap(SPACE[1])
    .child(div().text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child("Daily time"))
    .child(h_flex()
      .h(BARS_H + SPACE[3])
      // A month of bars sits closer together, so each stays wide enough to read.
      .gap((daily?.length ?? 0) > 14 ? SPACE[1] : SPACE[2])
      .items_end()
      .border_t_1()
      .border_color(c.edge)
      // A day's bar stays a bar: it grows to the room it has but never becomes a block.
      .children(barHeights(daily, BARS_H).map((h) => div().flex_1().max_w(24).h(h).rounded(SPACE[1]).bg(c.controlBorder))));
}

export class Metrics {
  init(_given, cx) {
    this.window = DEFAULT_WINDOW;
    this.data = null; // the last answer of bh metrics for this window
    this.failed = false;
    this.busy = false;
    this.shown = false; // the page was showing at the last draw: opening it reads again
    this.width = 900;
    this.openCards = new Set(); // the cards whose other numbers are folded open
    this.reload(cx);
    cx.timer.every(REFRESH_MS, (cx) => {
      if (viewShown("metrics")) this.reload(cx);
    });
  }

  /** Reads the window's numbers; an answer for a window no longer picked is dropped and read again. */
  reload(cx) {
    if (this.busy) return;
    this.busy = true;
    const w = this.window;
    cx.spawn(async (cx) => {
      const got = await bhJson(["metrics", "--window", w], { cwd: projectDir() });
      this.busy = false;
      if (w !== this.window) return this.reload(cx);
      this.data = got;
      this.failed = !got;
      cx.notify();
    });
  }

  pick(id, cx) {
    if (id === this.window) return;
    this.window = id;
    this.data = null;
    this.failed = false;
    this.reload(cx);
    cx.notify();
  }

  render(cx) {
    const open = viewShown("metrics");
    if (open && !this.shown) cx.timer.after(1, (cx) => this.reload(cx));
    this.shown = open;
    const c = colors();
    const content = Math.max(280, Math.min(MAX, this.width - SIZE.gutter * 2));
    return div().id("bh-metrics").relative().size_full().bg(c.ground).text_color(c.ink)
      .on_size_change((size, cx) => {
        // px with the app's zoom multiplied in; drawn sizes are without it.
        this.width = size.width / (Number(settings().zoom) || 1);
        cx.notify();
      })
      .child(v_flex().id("bh-metrics-scroll").absolute().inset_0().overflow_y_scroll().items_center()
        .child(v_flex().flex_none().w(content).py(SPACE[5]).gap(GAP)
          .child(h_flex().h(CONTROL).items_center().child(this.picker(c)))
          .child(this.body(c, content))));
  }

  picker(c) {
    return segmented(c, {
      id: "bh-metrics-window",
      choice: true,
      items: WINDOWS.map((w) => ({ id: w.id, label: w.label, on: w.id === this.window })),
      onPick: (id, cx) => this.pick(id, cx),
    });
  }

  /** Loading, an error, an empty window, or the totals and the cards. */
  body(c, content) {
    if (this.failed) {
      return stateView(c, { id: "bh-metrics-error", title: "Couldn't read the metrics", line: "bh metrics did not answer. Try again, or check that bh is installed.", action: { label: "Try again", on: (_e, cx) => this.reload(cx) } });
    }
    if (!this.data) return stateView(c, { id: "bh-metrics-loading", title: "Loading…", loading: true });
    const agents = this.data.agents ?? [];
    if (!agents.length) return stateView(c, { id: "bh-metrics-empty", title: "No agent has worked yet in this window.", line: "Pick a longer window, or start a task." });
    return v_flex().gap(GAP).child(this.totals(c)).children(this.grid(c, agents, content));
  }

  /** The window's totals in one row (two rows of three on a narrow page). */
  totals(c) {
    const per = columnsFor(this.width) === 1 ? 3 : 6;
    return v_flex().p(PAD).rounded(SIZE.radius).bg(c.fill).border_1().border_color(c.edge)
      .child(cellRows(c, cells(this.data.totals), per, TYPE.lg));
  }

  /** The agent cards in rows of as many columns as the page has room for. */
  grid(c, agents, content) {
    const cols = columnsFor(this.width);
    const width = Math.floor((content - GAP * (cols - 1)) / cols);
    const rows = [];
    for (let i = 0; i < agents.length; i += cols) rows.push(agents.slice(i, i + cols).map((a, j) => this.card(c, a, i + j, width)));
    return rows.map((row, r) => h_flex().id(`bh-metrics-row-${r}`).gap(GAP).items_stretch().children(row));
  }

  /** An agent's card: avatar, name and harness, ONE hero number (its cost), its days as quiet bars.
   * Every other number is in the card's tooltip and under Details, never on the card (Principle 4). */
  card(c, a, i, width) {
    const tone = mentionTone(c, a.role && a.role !== "custom" ? a.role : a.name);
    const lead = hero(a);
    const id = `bh-metrics-${a.id}`;
    const open = this.openCards.has(id);
    return v_flex().id(id).flex_none().w(width).p(PAD).gap(SPACE[4])
      .rounded(RADIUS.card).bg(c.fill).border_1().border_color(c.edge)
      .tooltip(`${rankOf(i)} in this window · ${cardDetail(a)}`)
      .child(h_flex().h(CONTROL).gap(SPACE[3]).items_center()
        .child(avatar(c, a.name, tone, CONTROL))
        .child(v_flex().flex_1().min_w(0)
          .child(div().truncate().text_size(TYPE_SCALE.title).line_height(`${LINE.lg}px`).font_semibold().child(a.name ?? a.id))
          .when(Boolean(a.harness), (el) => el.child(div().truncate().text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child(a.harness))))
        .child(actionButton(c, `${id}-more`, open ? "Less" : "Details", (_e, cx) => {
          if (open) this.openCards.delete(id);
          else this.openCards.add(id);
          cx.notify();
        }, { tone: "quiet" })))
      .child(v_flex().gap(SPACE[1])
        .child(div().truncate().text_size(TYPE_SCALE.hero).font_semibold().text_color(c.ink)
          .when(Boolean(lead.tip), (el) => el.tooltip(lead.tip))
          .child(lead.value))
        .child(div().text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child(lead.label)))
      .child(bars(c, a.daily))
      .when(open, (el) => el.child(cellRows(c, cells(a).filter((x) => x.key !== "cost"), 3, TYPE_SCALE.body)));
  }
}
