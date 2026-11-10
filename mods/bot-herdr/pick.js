// A dropdown list, opened as a popup over everything (so a card never grows to show it).
// Settings opens it under a field with the options; a pick is posted in shared state for the
// opener (`PICKED`: { key, value, at }) and the popup closes. Esc or a click beside it closes it.

import { div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, settings, setShared, closeOverlay, openOverlay } from "herdr";
import { SIZE, ICON } from "./look.js";
import { colors } from "./theme.js";

export const PICKED = "bot-herdr.picked";
const ROW = 30;
const HEADING = 24;

/** Opens the list under the element whose bounds (from a mouse-down event) are given. */
export function openPick({ key, options, selected, bounds, minWidth = 220 }) {
  const zoom = Number(settings().zoom) || 1;
  const height = Math.min(340, 10 + options.reduce((n, o) => n + (o.heading ? HEADING : ROW + 1), 0));
  const width = Math.max(minWidth, (bounds?.width ?? minWidth * zoom) / zoom);
  return openOverlay({
    mod: "bot-herdr",
    kind: "popup",
    frame: "none",
    width,
    height,
    ...(bounds ? { at: { x: bounds.x, y: bounds.y + bounds.height + 4 } } : {}),
    props: { view: "pick", key, options, selected },
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

  render() {
    const c = colors();
    const options = this.p.options ?? [];
    return v_flex()
      .id("bh-pick")
      .size_full()
      .p(4)
      .gap(1)
      .rounded(SIZE.control)
      .bg(c.fill)
      .border_1()
      .border_color(c.edge)
      .text_color(c.ink)
      .overflow_y_scroll()
      .children(options.map((o, i) => {
        if (o.heading) return div().flex_none().h(HEADING).px(8).pt(8).text_size(11).text_color(c.faint).child(o.heading);
        const on = o.value === this.p.selected;
        return h_flex()
          .id(`bh-pick-${i}`)
          .flex_none()
          .h(ROW)
          .px(8)
          .gap(8)
          .items_center()
          .rounded(SIZE.nested)
          .cursor_pointer()
          .when(on, (el) => el.bg(c.well))
          .hover((s) => s.bg(c.hover))
          .on_click(() => this.choose(o.value))
          .child(div().flex_1().min_w(0).truncate().text_size(13).child(o.label))
          .when(Boolean(o.note), (el) => el.child(div().flex_none().max_w(140).truncate().text_size(11.5).text_color(c.faint).child(o.note)))
          .when(on, (el) => el.child(svg(ICON("check")).size(14).text_color(c.accent)));
      }));
  }
}
