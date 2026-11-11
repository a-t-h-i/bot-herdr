// herdr's notifications in the bot-herdr layout (its root names this mod as "toast"): an agent
// that needs you or finished, a terminal that failed, anything a mod posts with notify(). While
// the Chat page shows, the notification is handed to the composer, and rises out of its top
// edge like every other toast there; this copy closes at once. On another page it shows here,
// in herdr's toast corner, drawn the same way: its mark in its tone, the words, its action.

import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { props, settings, setShared, closeOverlay, run } from "herdr";
import { ICON, TYPE, LINE, SPACE, CONTROL, GLYPH, MOTION, SIZE, clickable } from "./look.js";
import { colors } from "./theme.js";
import { activePage } from "./pages.js";
import { TOAST_KEY, noteText } from "./toasts.js";

export const TOAST_ICONS = { info: "info", success: "check-circle", warning: "alert-triangle", error: "x-circle" };
export const toneOf = (c, kind) => (kind === "error" ? c.danger : c[kind] ?? c.info);

/** Whether a layout copy's props are a notification (herdr gives the toast mod no view). */
export const isNotification = (p) => Boolean(p && !p.view && p.overlay && ("title" in p || "body" in p));

/** The card holds a beat while its words leave, then fades itself. */
const TOAST_OUT_DELAY = 80;

export class Toast {
  init(given, cx) {
    this.p = given ?? props() ?? {};
    this.up = false;
    this.out = false;
    if (activePage() === "chat") {
      this.handed = true;
      setShared(TOAST_KEY, { title: this.p.title ?? "", body: this.p.body ?? "", level: this.p.level ?? "info", action: this.p.action ?? null, at: Date.now() });
      cx.timer.after(1, () => closeOverlay(this.p.overlay));
      return;
    }
    this.cx = cx;
    // Drawn low and clear first, then it rises into place.
    cx.timer.after(16, (cx) => {
      this.up = true;
      cx.notify();
    });
  }

  close() {
    if (this.out || this.handed) return;
    this.out = true;
    this.up = false;
    this.cx?.notify();
    // The words sink and fade, then the card fades after them; the overlay goes a frame after
    // the card is fully transparent, so nothing pops.
    this.cx?.timer.after(TOAST_OUT_DELAY + MOTION.toastOut.duration + 16, () => closeOverlay(this.p.overlay));
  }

  render() {
    if (this.handed) return div();
    const c = colors();
    const p = this.p;
    const kind = TOAST_ICONS[p.level] ? p.level : "info";
    const action = p.action?.name ? p.action : null;
    return clickable(
      div()
        .size_full()
        .bg(c.fill)
        .overflow_hidden()
        .opacity(this.out ? 0 : 1)
        .transition("opacity", { ...MOTION.toastOut, delay: TOAST_OUT_DELAY })
        .on_click(() => {
          if (action) run(action.name, action.args ?? {});
          this.close();
        })
        .child(
          h_flex()
            .absolute()
            .left(0)
            .right(0)
            .top(this.up ? 0 : SPACE[4])
            // Up with a little give; going, straight down with no bounce while it fades.
            .spring("top", this.out ? { response: 260, damping: 1 } : { response: 420, damping: 0.78 })
            .h_full()
            .px(SPACE[4])
            .gap(SPACE[3])
            .items_center()
            .opacity(this.up ? 1 : 0)
            .transition("opacity", this.out ? MOTION.toastTextOut : { ...MOTION.tool, delay: 120 })
            .text_color(c.ink)
            .child(svg(ICON(TOAST_ICONS[kind])).flex_none().size(GLYPH.lg).text_color(toneOf(c, kind)))
            .child(div().flex_1().min_w(0).max_h(LINE.md * 3).overflow_hidden().text_size(TYPE.md).line_height(`${LINE.md}px`).child(noteText(p)))
            .when(Boolean(action), (el) => el.child(
              div().flex_none().h(CONTROL).px(SPACE[3]).flex().items_center().rounded(SIZE.nested).border_1().border_color(c.edge)
                .text_size(TYPE.sm).font_medium().hover((s) => s.bg(c.hover)).child("Show"),
            )),
        ),
      c,
      "bh-toast-hit",
    );
  }
}
