// The switch in the top bar: Chat (every agent in one place), Terminals (herdr's own panes, to
// work in an agent's CLI directly) and Settings. Picking a tab or an agent anywhere in herdr
// shows the Terminals page, so the terminal you asked for is never hidden behind the chat.
//
// This file also carries the shell pieces every page shares: the segmented control and the one
// empty/loading state.

import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { focused, shared, theme, nextCommand } from "herdr";
import { SIZE, TYPE, LINE, SPACE, CHIP, CONTROL, DOT, clickable } from "./look.js";
import { colors } from "./theme.js";
import { PAGES, HOLD, activePage, showPage } from "./pages.js";

const HOLD_MS = 3000;

/**
 * The one segmented control: the page switch, a task's tab strip, a plan's list choice.
 * `items` is [{ id, label, on }]; `onPick(id, cx)` receives the picked one.
 */
export function segmented(c, { id, items, onPick, grow }) {
  return h_flex()
    .id(id)
    .h(CONTROL)
    .p(SPACE[1])
    .gap(SPACE[1])
    .items_center()
    .rounded(SIZE.control)
    .bg(c.well)
    .when(grow, (el) => el.flex_1())
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .children(items.map((item) =>
      clickable(
        div()
          .h(CHIP)
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
          .child(item.label)
          .when(item.count != null, (el) => el.child(div().text_size(TYPE.xs).text_color(c.faint).child(String(item.count)))),
        c,
        `${id}-${item.id}`,
      )));
}

/**
 * The one empty, loading and error panel: a title, one line and an optional action.
 * Loading adds the quiet pulse; an error passes the retry as its action.
 */
export function stateView(c, { id, title, line, action, loading }) {
  return v_flex()
    .id(id ?? "bh-state")
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
        .child(div().text_size(TYPE.lg).font_semibold().text_color(c.ink).child(title)),
    )
    .when(Boolean(line), (el) => el.child(
      div().text_size(TYPE.md).line_height(`${LINE.md}px`).text_color(c.muted).child(line),
    ))
    .when(Boolean(action), (el) => el.child(
      clickable(
        h_flex()
          .h(CONTROL)
          .px(SPACE[4])
          .items_center()
          .rounded(SIZE.control)
          .border_1()
          .border_color(c.edge)
          .text_size(TYPE.sm)
          .font_medium()
          .text_color(c.ink)
          .hover((s) => s.border_color(c.faint))
          .on_click(action.on)
          .child(action.label),
        c,
        `${id ?? "bh-state"}-action`,
      ),
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
    // Drawn as one bar with herdr's tabs beside it: the same ground and bottom line on the strip,
    // the control itself in our own palette.
    return h_flex()
      .id("bh-switch")
      .size_full()
      .items_center()
      .pl(SPACE[4])
      .bg(t.chrome)
      .border_b(1)
      .border_color(t.border)
      .child(segmented(c, {
        id: "bh-pages",
        items: PAGES.map((p) => ({ id: p.id, label: p.label, on: p.id === active })),
        onPick: (id) => showPage(id),
      }));
  }
}
