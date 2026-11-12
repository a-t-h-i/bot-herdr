// The switch in the top bar: Chat (every agent in one place), Terminals (herdr's own panes, to
// work in an agent's CLI directly) and Settings. Picking a tab or an agent anywhere in herdr
// shows the Terminals page, so the terminal you asked for is never hidden behind the chat.
//
// This file also carries the shell pieces every page shares: the segmented control and the one
// empty/loading state.

import { div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { focused, shared, theme, nextCommand, settings } from "herdr";
import { SIZE, TYPE, LINE, SPACE, CONTROL, DOT, GLYPH, ICON, clickable, textWidth } from "./look.js";
import { actionButton } from "./button.js";
import { colors } from "./theme.js";
import { PAGES, HOLD, activePage, showPage } from "./pages.js";
import { alpha } from "./working.js";

const HOLD_MS = 3000;

/**
 * The one segmented control: the page switch, a task's tab strip, a plan's list choice.
 * `items` is [{ id, label, on }]; `onPick(id, cx)` receives the picked one.
 */
export function segmented(c, { id, items, onPick, grow }) {
  // The track is the items' height: each item is a 28px button, inset from the track's sides only.
  return h_flex()
    .id(id)
    .h(CONTROL)
    .px(SPACE[1])
    .gap(SPACE[1])
    .items_center()
    .rounded(SIZE.control)
    .bg(c.well)
    .when(grow, (el) => el.flex_1())
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .children(items.map((item) =>
      clickable(
        div()
          .h(CONTROL)
          .px(SPACE[4])
          .flex()
          .items_center()
          .gap(SPACE[2])
          .rounded(SIZE.nested)
          .text_size(TYPE.sm)
          .font_medium()
          .when(item.grow, (el) => el.flex_1().justify_center())
          .when(item.on, (el) => el.bg(c.fill).text_color(c.ink))
          .when(!item.on, (el) => el.text_color(c.muted).hover((s) => s.text_color(c.ink)))
          .on_click((_e, cx) => onPick(item.id, cx))
          // An icon before the label, in the label's colour (it follows the tab's state). A tab
          // squeezed to its icon (`compact`) names itself in a tooltip.
          .when(Boolean(item.icon), (el) => el.child(svg(ICON(item.icon)).flex_none().size(GLYPH.sm)))
          .when(Boolean(item.compact), (el) => el.px(SPACE[3]).tooltip(item.label))
          .when(!item.compact, (el) => el.child(item.label))
          .when(item.count != null, (el) => el.child(div().text_size(TYPE.xs).text_color(c.faint).child(String(item.count)))),
        c,
        `${id}-${item.id}`,
      )));
}

/**
 * A small rounded label in a tone: its text in the tone, on a wash of it. `pulse` adds a live dot
 * (a running agent, a plan being worked on).
 */
export function pill(c, label, tone, { pulse = false, id = null } = {}) {
  const el = h_flex()
    .flex_none()
    .h(LINE.md)
    .px(SPACE[3])
    .gap(SPACE[2])
    .items_center()
    .rounded_full()
    .bg(alpha(tone, 0.14))
    .border_1()
    .border_color(alpha(tone, 0.3))
    .text_size(TYPE.xs)
    .font_medium()
    .text_color(tone)
    .when(pulse, (x) => x.child(div().size(DOT).rounded_full().bg(tone).loop("opacity", { from: 0.35, to: 1, period: 1400, easing: "ease-in-out" })))
    .child(label);
  return id ? el.id(id) : el;
}

/** An agent's avatar: its initial on a wash of its colour, ringed in it. */
export function avatar(c, name, tone, size = 28) {
  const initial = String(name ?? "?").replace(/^@/, "").charAt(0).toUpperCase() || "?";
  return div()
    .flex_none()
    .size(size)
    .rounded_full()
    .flex()
    .items_center()
    .justify_center()
    .bg(alpha(tone, 0.16))
    .border_1()
    .border_color(alpha(tone, 0.45))
    .text_size(Math.round(size * 0.46))
    .font_semibold()
    .text_color(tone)
    .child(initial);
}

/** A section's heading: its icon on a tinted tile, the title, and a line about it under. */
export function sectionHead(c, icon, title, about = null, tone = null) {
  const t = tone ?? c.accent;
  return h_flex()
    .gap(SPACE[4])
    .items_start()
    .child(div()
      .flex_none()
      .size(36)
      .rounded(SIZE.control)
      .flex()
      .items_center()
      .justify_center()
      .bg(alpha(t, 0.12))
      .border_1()
      .border_color(alpha(t, 0.25))
      .text_color(t)
      .child(svg(ICON(icon)).size(GLYPH.lg)))
    .child(v_flex()
      .flex_1()
      .min_w(0)
      .gap(SPACE[1])
      .child(div().text_size(TYPE.xl).font_semibold().text_color(c.ink).child(title))
      .when(Boolean(about), (el) => el.child(div().text_size(TYPE.md).line_height(`${LINE.md}px`).text_color(c.muted).child(about))));
}

/**
 * The one empty, loading and error panel: a title, one line and an optional action.
 * Loading adds the quiet pulse; an error passes the retry as its action.
 */
export function stateView(c, { id, title, line, action, loading }) {
  // Centred in whatever holds it, its wrapped lines centred too.
  return v_flex()
    .id(id ?? "bh-state")
    .self_center()
    .items_center()
    .gap(SPACE[3])
    .py(SPACE[5])
    .max_w(460)
    .child(
      h_flex()
        .gap(SPACE[3])
        .items_center()
        .when(loading, (el) => el.child(
          div()
            .size(DOT)
            .rounded_full()
            .bg(c.accent)
            .opacity(0.5)
            .loop("opacity", { from: 0.25, to: 1, period: 1200, easing: "ease-in-out" }),
        ))
        .child(div().text_center().text_size(TYPE.lg).font_semibold().text_color(c.ink).child(title)),
    )
    .when(Boolean(line), (el) => el.child(
      div().text_center().text_size(TYPE.md).line_height(`${LINE.md}px`).text_color(c.muted).child(line),
    ))
    .when(Boolean(action), (el) => el.child(
      actionButton(c, `${id ?? "bh-state"}-action`, action.label, action.on, { tone: "secondary" }),
    ));
}

export class Switch {
  init(_props, cx) {
    this.where = null;
    // ctrl+shift+m (keys.json: "bot-herdr.focus") opens the chat and puts the keyboard in it.
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (command === "focus" || command === "chat") showPage("chat");
        else if (PAGES.some((p) => p.id === command)) showPage(command);
        cx.notify();
      }
    });
  }

  /** A tab, space or agent was picked outside the chat: show the terminals. */
  follow(cx) {
    const f = focused();
    const where = f ? `${f.space}:${f.tab}` : null;
    const before = this.where;
    this.where = where;
    if (before === null || where === null || where === before) return;
    if (activePage() !== "chat") return;
    if (Date.now() - Number(shared(HOLD) ?? 0) < HOLD_MS) return;
    cx.timer.after(1, () => showPage("terminals"));
  }

  render(cx) {
    this.follow(cx);
    const c = colors();
    const t = theme();
    const active = activePage();
    // Every tab always shows. Where the strip is too narrow for every label, the tabs not open
    // keep only their icon; narrower still, the open one does too.
    const room = (this.width ?? 9999) - SPACE[4] * 2;
    const tab = (p, label) => SPACE[4] * 2 + (p.icon ? GLYPH.sm + SPACE[2] : 0) + (label ? Math.ceil(textWidth(p.label, TYPE.sm) * 1.15) : 0) - (label ? 0 : SPACE[4] * 2 - SPACE[3] * 2);
    const frame = SPACE[1] * 2 + SPACE[1] * (PAGES.length - 1);
    const full = frame + PAGES.reduce((n, p) => n + tab(p, true), 0);
    const some = frame + PAGES.reduce((n, p) => n + tab(p, p.id === active), 0);
    const mode = full <= room ? "full" : some <= room ? "some" : "icons";
    // Drawn as one bar with herdr's tabs beside it: the same ground and bottom line on the strip,
    // the control itself in our own palette.
    return h_flex()
      .id("bh-switch")
      .size_full()
      .items_center()
      .overflow_hidden()
      .on_size_change((size, cx) => {
        // px with the app's zoom multiplied in; drawn sizes are without it.
        const zoom = Number(settings().zoom) || 1;
        const w = size.width / zoom;
        if (Math.abs(w - (this.width ?? 0)) >= 1) {
          this.width = w;
          cx.notify();
        }
      })
      .pl(SPACE[4])
      .bg(t.chrome)
      .border_b(1)
      .border_color(t.border)
      .child(segmented(c, {
        id: "bh-pages",
        items: PAGES.map((p) => ({ id: p.id, icon: p.icon, label: p.label, on: p.id === active, compact: mode === "icons" || (mode === "some" && p.id !== active) })),
        onPick: (id) => showPage(id),
      }));
  }
}
