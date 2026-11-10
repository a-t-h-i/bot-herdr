// The switch in the top bar: Chat (every agent in one place), Terminals (herdr's own panes, to
// work in an agent's CLI directly) and Settings. Picking a tab or an agent anywhere in herdr
// shows the Terminals page, so the terminal you asked for is never hidden behind the chat.

import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { focused, settings, shared, theme, nextCommand } from "herdr";
import { LIGHT, DARK, SIZE } from "./look.js";
import { PAGES, HOLD, activePage, showPage } from "./pages.js";

const HOLD_MS = 3000;

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
    const c = settings().dark ? DARK : LIGHT;
    const t = theme();
    const active = activePage();
    // Drawn as one bar with herdr's tabs beside it: the same ground and bottom line.
    return h_flex()
      .id("bh-switch")
      .size_full()
      .items_center()
      .pl(10)
      .bg(t.chrome)
      .border_b(1)
      .border_color(t.border)
      .child(
        h_flex()
          .h(30)
          .p(2)
          .gap(2)
          .items_center()
          .rounded(SIZE.control)
          .bg(c.well)
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .children(PAGES.map((p) =>
            div()
              .id(`bh-page-${p.id}`)
              .h(26)
              .px(11)
              .flex()
              .items_center()
              .rounded(SIZE.nested)
              .text_size(12.5)
              .font_medium()
              .cursor_pointer()
              .when(p.id === active, (el) => el.bg(c.fill).text_color(c.ink).shadow_sm())
              .when(p.id !== active, (el) => el.text_color(c.muted).hover((s) => s.text_color(c.ink)))
              .on_click(() => showPage(p.id))
              .child(p.label))),
      );
  }
}
