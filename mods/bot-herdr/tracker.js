// The live task tracker in the chat's feed: one card per task, its steps on a timeline joined by
// one line, the agent, the time and, behind a chevron, the events a step left. The model is in
// steps.js; this file draws it.

import { div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { SIZE, TYPE, LINE, SPACE, CHIP, DOT, HAIR, GLYPH, MOTION, ICON, clickable, agentInk } from "./look.js";
import { pill } from "./switch.js";
import { agentBadge } from "./railview.js";
import { shimmerWord } from "./indicators.js";
import { shortDetail, usageText } from "./steps.js";

const CARD_W = 600; // the card at most, as wide as a reply
const CIRCLE = 18; // a step's status circle
const STEP_H = 36; // a step's row
const EV_H = 22; // an event's row
const BRANCH = CIRCLE + SPACE[4]; // where a step's events hang from its line
const TEXT_X = CIRCLE + SPACE[3] + CHIP + SPACE[3]; // where a step's title starts

/**
 * The card. `view` is { key, width, finished, open, openSteps, actions, acts }:
 * `actions` maps an agent name (lower case) to the word it is at, `acts` is
 * { open(cx), step(n, cx), needs(step, cx) }.
 */
export function tracker(c, model, view) {
  return v_flex()
    .id(`bh-tracker-${model.id}`)
    .flex_none()
    .w(Math.min(view.width, CARD_W))
    .p(SPACE[4])
    .gap(SPACE[3])
    .rounded(SIZE.radius)
    .bg(c.fill)
    .border_1()
    .border_color(c.edge)
    .child(head(c, model, view))
    .when(view.open && model.steps.length > 0, (el) => el.child(steps(c, model, view)));
}

/** The header: the title, the agents at work, done/total and what it cost; a finished task's is its one line. */
function head(c, model, view) {
  const title = div().flex_1().min_w(0).truncate().text_size(TYPE.lg).font_semibold().text_color(c.ink).child(model.title);
  const count = div().flex_none().text_size(TYPE.sm).text_color(c.muted).child(`${model.done}/${model.total}`);
  const usage = usageText(model.usage);
  if (!view.finished) {
    return h_flex().flex_none().items_center().gap(SPACE[3])
      .child(title)
      .child(chip(c, model))
      .child(count)
      .when(Boolean(usage), (el) => el.child(quiet(c, usage)));
  }
  const line = h_flex().flex_none().items_center().gap(SPACE[3]).on_click((_e, cx) => view.acts.open(cx))
    .child(svg(ICON("check")).flex_none().size(GLYPH.md).text_color(c.accent))
    .child(title)
    .child(count)
    .when(Boolean(usage), (el) => el.child(quiet(c, usage)))
    .when(Boolean(model.time), (el) => el.child(quiet(c, model.time)))
    .child(svg(ICON(view.open ? "chevron-down" : "chevron-right")).flex_none().size(GLYPH.sm).text_color(c.faint));
  return clickable(line, c, `bh-tracker-open-${model.id}`);
}

/** A muted fact on a step's or the card's line: a time, a cost. */
function quiet(c, text) {
  return div().flex_none().text_size(TYPE.sm).text_color(c.faint).child(text);
}

/** The agents at work in one live chip, else what the task is doing. */
function chip(c, model) {
  if (!model.working.length) return pill(c, model.status === "paused" ? "Paused" : "Waiting", c.muted);
  return pill(c, model.working.join(" · "), agentInk(c, model.working[0]), { pulse: true });
}

/** The steps, in order, each one block: its line, its events under it, its piece of the timeline. */
function steps(c, model, view) {
  return v_flex()
    .flex_none()
    .children(model.steps.map((s, i) => {
      const h = view.openSteps.has(s.n) ? s.events.length * EV_H + SPACE[2] : 0;
      return v_flex()
        .id(`bh-tracker-${model.id}-${s.n}`)
        .flex_none()
        .relative()
        .child(connector(c, s, i === model.steps.length - 1, h))
        .child(stepLine(c, s, view))
        .child(events(c, s, view));
    }));
}

/** The line under a step's circle: full when the step is done, with a dot travelling below a live one. */
function connector(c, s, last, extra) {
  if (last) return div();
  return div()
    .absolute()
    .left(BRANCH - HAIR)
    .top(STEP_H / 2)
    .w(HAIR * 2)
    .h(STEP_H + extra)
    .bg(c.edge)
    .child(div().absolute().top(0).left(0).w(HAIR * 2).h(s.done ? STEP_H : 0).bg(c.accent).transition("height", MOTION.row))
    .when(s.active, (el) => el.child(div()
      .absolute()
      .left(-SPACE[1])
      .top(0)
      .size(DOT)
      .rounded_full()
      .bg(c.accent)
      .loop("top", { from: 0, to: STEP_H, period: 1600, easing: "ease-in-out" })));
}

/** A step's row: its circle, its agent, its title, and what it says about now. */
function stepLine(c, s, view) {
  const row = h_flex()
    .flex_none()
    .h(STEP_H)
    .items_center()
    .gap(SPACE[3])
    .child(circle(c, s))
    .when(Boolean(s.agentName), (el) => el.child(agentBadge(c, s.agentName, CHIP)))
    .child(div().flex_1().min_w(0).truncate().text_size(TYPE.sm).text_color(s.done ? c.muted : c.ink).child(s.title))
    .when(s.needs, (el) => el.child(needsPill(c, s, view)))
    .when(!s.needs && s.active, (el) => el.child(live(c, s, view)))
    .when(!s.needs && !s.active && Boolean(s.time), (el) => el.child(div().flex_none().text_size(TYPE.sm).text_color(c.faint).child(s.time)))
    .when(s.events.length > 0, (el) => el.child(svg(ICON(view.openSteps.has(s.n) ? "chevron-down" : "chevron-right")).flex_none().size(GLYPH.sm).text_color(c.faint)));
  if (!s.events.length) return row;
  return clickable(row.on_click((_e, cx) => view.acts.step(s.n, cx)), c, `bh-tracker-row-${view.key}-${s.n}`);
}

/** A step's status: a check, a live ring, a dashed warning ring, or a quiet one still to come. */
function circle(c, s) {
  const base = div().flex_none().size(CIRCLE).rounded_full().flex().items_center().justify_center();
  if (s.done) return base.bg(c.accent).child(svg(ICON("check")).size(GLYPH.xs).text_color(c.accentInk));
  if (s.needs) return base.border_2().border_dashed().border_color(c.warning);
  if (s.active) {
    return base.border_2().border_color(c.accent).opacity(0.55)
      .loop("opacity", { from: 0.35, to: 1, period: 1600, easing: "ease-in-out" })
      .child(div().size(DOT).rounded_full().bg(c.accent));
  }
  return base.border_2().border_color(c.edge);
}

/** The word an agent is at, shimmering, and how long the step has taken. */
function live(c, s, view) {
  const word = view.actions[String(s.agentName ?? "").toLowerCase()] ?? "Working";
  return h_flex().flex_none().items_center().gap(SPACE[3])
    .child(shimmerWord(c, word, c.accent, `bh-tw-${view.key}-${s.n}`))
    .child(div().flex_none().text_size(TYPE.sm).text_color(c.faint).child(s.time));
}

/** The amber pill a step that needs the user wears; a click opens its question. */
function needsPill(c, s, view) {
  return clickable(pill(c, "Needs you", c.warning).on_click((_e, cx) => {
    cx.stop_propagation();
    view.acts.needs(s, cx);
  }), c, `bh-tw-needs-${view.key}-${s.n}`);
}

/** A step's events on a branch of the line: what happened on the left, its detail on the right. */
function events(c, s, view) {
  const open = view.openSteps.has(s.n);
  const h = s.events.length * EV_H + SPACE[2];
  return div()
    .overflow_hidden()
    .opacity(open ? 1 : 0)
    .h(open ? h : 0)
    .transition("height", MOTION.row)
    .transition("opacity", MOTION.row)
    .child(v_flex()
      .flex_none()
      .relative()
      .h(h)
      .child(div().absolute().left(BRANCH - HAIR).top(0).w(HAIR).h(h).bg(c.edge))
      .children(s.events.map((e) => eventRow(c, e))));
}

/** One event: a dot on the branch, its text, and its detail in one muted word. */
function eventRow(c, e) {
  return h_flex()
    .flex_none()
    .relative()
    .h(EV_H)
    .items_center()
    .child(div().absolute().left(BRANCH - DOT / 2).top((EV_H - DOT) / 2).size(DOT).rounded_full().bg(c.edge))
    .child(div().flex_1().min_w(0).truncate().pl(TEXT_X).text_size(TYPE.sm).text_color(c.muted).child(String(e.text ?? "")))
    .child(div().flex_none().text_size(TYPE.xs).line_height(`${LINE.xs}px`).text_color(c.faint).child(shortDetail(e.detail)));
}
