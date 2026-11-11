// A dropdown list, opened as a popup over everything (so a card never grows to show it).
// Settings opens it under a field with the options; a pick is posted in shared state for the
// opener (`PICKED`: { key, value, at }) and the popup closes. Esc or a click beside it closes it.
//
// A list that is asking for its contents says so (`loading`), can carry a line about where its
// entries come from (`header`) and a sentence when asking failed (`error`), and a refresh button
// that posts `REFRESH` for the opener to answer with a fresh list.

import { div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, settings, setShared, closeOverlay, openOverlay } from "herdr";
import { SIZE, ICON, TYPE, SPACE, CONTROL, ROW, CHIP, DOT, HAIR, GLYPH, clickable } from "./look.js";
import { colors } from "./theme.js";

export const PICKED = "bot-herdr.picked";
export const REFRESH = "bot-herdr.pick-refresh";

/** Opens the list under the element whose bounds (from a mouse-down event) are given. */
export function openPick({ key, options, selected, bounds, minWidth = 220, header = null, error = null, loading = false, refreshable = false }) {
  const zoom = Number(settings().zoom) || 1;
  const rows = loading ? 1 : options.reduce((n, o) => n + (o.heading ? CONTROL : ROW + HAIR), 0);
  const height = Math.min(340, 10 + (header ? ROW : 0) + (error ? ROW : 0) + rows);
  const width = Math.max(minWidth, (bounds?.width ?? minWidth * zoom) / zoom);
  return openOverlay({
    mod: "bot-herdr",
    kind: "popup",
    frame: "none",
    width,
    height,
    ...(bounds ? { at: { x: bounds.x, y: bounds.y + bounds.height + SPACE[2] } } : {}),
    props: { view: "pick", key, options, selected, header, error, loading, refreshable },
  });
}

export class Pick {
  init(given) {
    this.p = given ?? props() ?? {};
  }

  choose(value) {
    setShared(PICKED, { key: this.p.key, value, at: Date.now() });
    closeOverlay(props()?.overlay ?? this.p.overlay);
  }

  /** Ask the opener for a fresh list: it reopens this popup when it has one. */
  refresh() {
    setShared(REFRESH, { key: this.p.key, at: Date.now() });
    closeOverlay(props()?.overlay ?? this.p.overlay);
  }

  render() {
    const c = colors();
    const options = this.p.options ?? [];
    return v_flex()
      .id("bh-pick")
      .size_full()
      .p(SPACE[2])
      .gap(SPACE[1])
      .rounded(SIZE.control)
      .bg(c.fill)
      .border_1()
      .border_color(c.edge)
      .text_color(c.ink)
      .overflow_y_scroll()
      .when(Boolean(this.p.header), (el) => el.child(
        h_flex()
          .flex_none()
          .h(ROW)
          .px(SPACE[3])
          .gap(SPACE[3])
          .items_center()
          .child(div().flex_1().min_w(0).truncate().text_size(TYPE.xs).font_medium().text_color(c.muted).child(this.p.header))
          .when(this.p.refreshable, (el) => el.child(clickable(
            div()
              .size(CHIP)
              .flex_none()
              .flex()
              .items_center()
              .justify_center()
              .rounded(SIZE.nested)
              .text_color(c.muted)
              .on_click(() => this.refresh())
              .child(svg(ICON("refresh-cw")).size(GLYPH.sm)),
            c,
            "bh-pick-refresh",
          ))),
      ))
      .when(Boolean(this.p.error), (el) => el.child(
        div().flex_none().px(SPACE[3]).pb(SPACE[2]).text_size(TYPE.xs).text_color(c.faint).child(this.p.error),
      ))
      .when(this.p.loading, (el) => el.child(
        h_flex()
          .flex_none()
          .h(ROW)
          .px(SPACE[3])
          .gap(SPACE[3])
          .items_center()
          .child(div().size(DOT).rounded_full().bg(c.accent).opacity(0.5).loop("opacity", { from: 0.25, to: 1, period: 1200, easing: "ease-in-out" }))
          .child(div().text_size(TYPE.md).text_color(c.muted).child("Asking the harness…")),
      ))
      .when(!this.p.loading, (el) => el.children(options.map((o, i) => {
        if (o.heading) return div().flex_none().h(CONTROL).px(SPACE[3]).text_size(TYPE.xs).text_color(c.faint).child(o.heading);
        const on = o.value === this.p.selected;
        return clickable(
          h_flex()
            .flex_none()
            .h(ROW)
            .px(SPACE[3])
            .gap(SPACE[3])
            .items_center()
            .rounded(SIZE.nested)
            .when(on, (el) => el.bg(c.well))
            .on_click(() => this.choose(o.value))
            .child(div().flex_1().min_w(0).truncate().text_size(TYPE.md).child(o.label))
            .when(Boolean(o.note), (el) => el.child(div().flex_none().max_w(140).truncate().text_size(TYPE.xs).text_color(c.faint).child(o.note)))
            .when(on, (el) => el.child(svg(ICON("check")).size(GLYPH.md).text_color(c.accent))),
          c,
          `bh-pick-${i}`,
        );
      })));
  }
}
