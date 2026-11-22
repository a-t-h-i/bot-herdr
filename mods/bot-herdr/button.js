// The one button every page uses: its sizes and tones are in look.js (buttonTone). The element is
// built here, not in look.js, because the node tests load look.js and cannot resolve gpui-kit.

import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { SIZE, TYPE, LINE, SPACE, CONTROL, CHIP, GLYPH, ICON, buttonTone, clickable } from "./look.js";

/** The contents in one row: the glyph (an icon-only button only), the label, and the key hint after it. */
function face(c, t, label, icon, hint) {
  return [
    // Icons are for navigation and icon-only buttons; a labelled button says what it does.
    icon && label === null ? svg(ICON(icon)).flex_none().size(GLYPH.md).text_color(t.ink) : null,
    label === null ? null : div().whitespace_nowrap().child(label),
    hint ? div().flex().items_center().h(CHIP).px(SPACE[2]).rounded(SIZE.nested).bg(c.kbd).text_size(TYPE.xs).text_color(c.muted).child(hint) : null,
  ].filter(Boolean);
}

/** The sized, toned element with its contents and tooltip, before any pointer or key handling. */
function body(c, t, label, { icon, hint, tooltip, a11y }) {
  const iconOnly = label === null;
  const name = tooltip ?? label ?? a11y;
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
    .when(Boolean(name), (el) => el.accessibility_label(name))
    .children(face(c, t, label, icon, hint));
}

/**
 * The one button every page uses (look.js: 28px tall, SIZE.nested radius, TYPE.sm text, GLYPH.md
 * glyph, SPACE[4] padding, SPACE[2] between glyph and label). `icon` draws only on an icon-only
 * button: a labelled button says what it does, and icons belong to navigation and icon-only
 * buttons (Foundations › Icons). tone: "primary" (accent fill),
 * "secondary" (surface, 1px edge), "danger" (surface, 1px edge, danger ink), "quiet" (no fill or
 * edge until hover). `label` null: a square icon button. `hint`: a small key hint after the label.
 * `disabled`: faint, no click, no hover. `a11y`: the accessible name of an icon button with no label or tooltip.
 */
export function actionButton(c, id, label, onClick, { icon = null, tone = "secondary", disabled = false, hint = null, tooltip = null, a11y = null } = {}) {
  const t = buttonTone(c, tone);
  const el = body(c, t, label, { icon, hint, tooltip, a11y });
  if (disabled) return el.opacity(0.5).cursor_not_allowed();
  return clickable(el.on_click(onClick), c, id, { fill: t.hover });
}
