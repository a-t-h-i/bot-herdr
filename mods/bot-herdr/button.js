// The one button every page uses: its sizes and tones are in look.js (buttonTone). The element is
// built here, not in look.js, because the node tests load look.js and cannot resolve gpui-kit.

import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { SIZE, TYPE, LINE, SPACE, CONTROL, CHIP, GLYPH, ICON, buttonTone, clickable } from "./look.js";

/** The contents in one row: the glyph, the label (null for none), and the key hint after it. */
function face(c, t, label, icon, hint) {
  return [
    icon ? svg(ICON(icon)).flex_none().size(GLYPH.md).text_color(t.ink) : null,
    label === null ? null : div().whitespace_nowrap().child(label),
    hint ? div().flex().items_center().h(CHIP).px(SPACE[2]).rounded(SIZE.nested).bg(c.kbd).text_size(TYPE.xs).text_color(c.muted).child(hint) : null,
  ].filter(Boolean);
}

/** The sized, toned element with its contents and tooltip, before any pointer or key handling. */
function body(c, t, label, { icon, hint, tooltip }) {
  const iconOnly = label === null;
  return h_flex()
    .h(CONTROL)
    .when(iconOnly, (el) => el.w(CONTROL))
    .when(!iconOnly, (el) => el.px(SPACE[4]))
    .flex_none()
    .items_center()
    .justify_center()
    .gap(SPACE[2])
    .rounded(SIZE.nested)
    .text_size(TYPE.sm)
    .line_height(`${LINE.sm}px`)
    .text_color(t.ink)
    .when(Boolean(t.fill), (el) => el.bg(t.fill))
    .when(Boolean(t.edge), (el) => el.border_1().border_color(t.edge))
    .when(Boolean(tooltip), (el) => el.tooltip(tooltip))
    .children(face(c, t, label, icon, hint));
}

/**
 * The one button every page uses (look.js: 28px tall, SIZE.nested radius, TYPE.sm text, GLYPH.md
 * glyph, SPACE[4] padding, SPACE[2] between glyph and label). tone: "primary" (accent fill),
 * "secondary" (surface, 1px edge), "danger" (surface, 1px edge, danger ink), "quiet" (no fill or
 * edge until hover). `label` null: a square icon button. `hint`: a small key hint after the label.
 * `disabled`: faint, no click, no hover.
 */
export function actionButton(c, id, label, onClick, { icon = null, tone = "secondary", disabled = false, hint = null, tooltip = null } = {}) {
  const t = buttonTone(c, tone);
  const el = body(c, t, label, { icon, hint, tooltip });
  if (disabled) return el.opacity(0.5).cursor_not_allowed();
  return clickable(el.on_click(onClick), c, id, { fill: t.hover });
}
