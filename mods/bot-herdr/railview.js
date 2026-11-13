// The agents rail drawn: a card of groups with a row per agent, beside the chat on a wide window
// and over the feed on a narrow one. rail.js holds the pure part (grouping, order, elapsed, the
// width that keeps the rail beside the chat); this file only draws, since gpui-kit cannot be
// loaded by the node tests.

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { SIZE, TYPE, LINE, SPACE, CONTROL, DOT, MOTION, agentInk, clickable } from "./look.js";
import { alpha } from "./working.js";
import { actionButton } from "./button.js";
import { RAIL_W, groupLabel } from "./rail.js";

/** An agent's round initial, in its hue, as work.js draws a seat's. */
function badge(c, name) {
  const tone = agentInk(c, name);
  return div()
    .flex_none()
    .size(CONTROL)
    .rounded_full()
    .flex()
    .items_center()
    .justify_center()
    .bg(alpha(tone, 0.16))
    .border_1()
    .border_color(alpha(tone, 0.45))
    .text_size(TYPE.sm)
    .font_semibold()
    .text_color(tone)
    .child(String(name ?? "?").charAt(0).toUpperCase());
}

/** A row's status dot: green and breathing at work, amber needing you, faint at rest. */
function statusDot(c, group) {
  const ink = group === "working" ? c.success : group === "needs" ? c.warning : c.faint;
  const el = div().flex_none().size(DOT).rounded_full().bg(ink);
  return group === "working" ? el.opacity(0.45).loop("opacity", { from: 0.25, to: 0.9, period: 1600, easing: "ease-in-out" }) : el;
}

/** Answer, on a row that needs you: the composer's drawer opens on that question. */
function answerButton(c, r, model) {
  return actionButton(c, `bh-rail-answer-${r.address}`, "Answer", (_e, cx) => {
    cx.stop_propagation();
    model.acts.answer(r, cx);
  }, { tone: "primary" });
}

/** A row's words: its name and dot, its one muted line, and Answer when it needs you. */
function rowText(c, r, model) {
  const needs = r.group === "needs";
  return v_flex()
    .flex_1()
    .min_w(0)
    .gap(SPACE[1])
    .child(h_flex().items_center().gap(SPACE[2])
      .child(div().text_size(TYPE.sm).font_semibold().text_color(agentInk(c, r.name)).child(r.name))
      .child(statusDot(c, r.group)))
    .child(div().truncate().text_size(TYPE.xs).line_height(`${LINE.xs}px`)
      .text_color(needs ? c.warning : c.muted).child(r.note))
    .when(needs && r.question, (el) => el.child(h_flex().pt(SPACE[1]).child(answerButton(c, r, model))));
}

/** One agent: a press opens its terminal; it fades in as it joins. */
function row(c, r, model) {
  const needs = r.group === "needs";
  const body = h_flex()
    .flex_none()
    .gap(SPACE[3])
    .px(SPACE[3])
    .py(SPACE[2])
    .rounded(SIZE.nested)
    .when(needs, (el) => el.bg(alpha(c.warning, 0.1)).border_1().border_color(alpha(c.warning, 0.34)))
    .child(badge(c, r.name))
    .child(rowText(c, r, model));
  return clickable(body.on_click(() => model.acts.open(r)), c, `bh-rail-${r.address}`, {
    fill: needs ? alpha(c.warning, 0.18) : null,
  })
    .role("button")
    .accessibility_label(`${r.name}, ${groupLabel(r.group)}, ${r.note}`)
    .opacity(model.fresh.has(r.address) ? 0 : 1)
    .transition("opacity", MOTION.row);
}

/** A group's label, small and uppercase, and its rows. */
function groupBlock(c, g, model) {
  return v_flex()
    .flex_none()
    .child(div().flex_none().px(SPACE[2]).pt(SPACE[3]).pb(SPACE[1]).text_size(TYPE.xs).font_semibold().text_color(c.muted).child(g.label.toUpperCase()))
    .children(g.rows.map((r) => row(c, r, model)));
}

/** The card's head: AGENTS, and how many are live. */
function head(c, live) {
  return h_flex().flex_none().items_center().gap(SPACE[2]).px(SPACE[3]).py(SPACE[3])
    .child(div().flex_1().text_size(TYPE.xs).font_semibold().text_color(c.faint).child("AGENTS"))
    .child(div().text_size(TYPE.xs).text_color(c.muted).child(`${live} live`));
}

/** The card itself: its head, then the groups; the rows scroll when they outgrow the height. */
function card(c, model) {
  return v_flex()
    .flex_none()
    .w(RAIL_W)
    .max_h(model.maxH)
    .rounded(SIZE.radius)
    .bg(c.fill)
    .border_1()
    .border_color(c.edge)
    .overflow_hidden()
    .child(head(c, model.live))
    .child(v_flex()
      .id("bh-rail-rows")
      .flex_1()
      .min_h(0)
      .px(SPACE[3])
      .pb(SPACE[3])
      .overflow_y_scroll()
      .on_scroll_wheel((_e, cx) => cx.stop_propagation())
      .when(!model.groups.length, (el) => el.child(div().px(SPACE[2]).text_size(TYPE.xs).text_color(c.faint).child("No agent in this space.")))
      .children(model.groups.map((g) => groupBlock(c, g, model))));
}

/** The rail beside the chat: pinned at `left` and `top`, down to `maxH`. */
export function railBeside(c, model) {
  return div().id("bh-rail").absolute().top(model.top).left(model.left).child(card(c, model));
}

/**
 * The rail over the feed on a narrow window: a press beside it, or Esc, puts it away. It takes
 * the keyboard while open (`handle`), so Esc reaches it; the rows stay Tab-reachable.
 */
export function railPopover(c, model) {
  return v_flex()
    .id("bh-rail-pop")
    .absolute()
    .inset_0()
    .items_end()
    .on_mouse_down("left", (_e, cx) => {
      cx.stop_propagation();
      model.acts.close(cx);
    })
    .child(div()
      .id("bh-rail-pop-card")
      .track_focus(model.handle)
      .on_key_down((e, cx) => {
        if (e.key !== "escape") return;
        cx.stop_propagation();
        model.acts.close(cx);
      })
      .mt(model.top)
      .mr(model.right)
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .child(card(c, model)));
}

/** The folded rail's one button, at the chat's top right: "Agents · N working". */
export function railButton(c, working, onClick) {
  return actionButton(c, "bh-rail-open", `Agents · ${working} working`, onClick, { icon: "users", tone: "secondary" });
}
