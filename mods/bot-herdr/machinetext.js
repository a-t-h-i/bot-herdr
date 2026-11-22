// Machine text is folded (Principle 6): JSON, stack traces, paths and branch names draw as ONE
// muted mono line, truncated in the middle, that unfolds on a click and copies in one. Its rules
// are pure and live in machinefold.js; this file draws them.

import { div } from "gpui-kit";
import { h_flex, v_flex, TextView } from "gpui-base";
import { settings } from "herdr";
import { TYPE_SCALE, SPACE_SCALE, RADIUS, focusable } from "./look.js";
import { fenced, middleTruncate, splitFences } from "./machinefold.js";
import { actionButton } from "./button.js";

/** The code face the app is set to, or null when the setting cannot be read. */
function mono() {
  try {
    return settings()?.font_family || null;
  } catch {
    return null;
  }
}

/** Whether the machine text `id` is open; flips it in a view's own `Set`. */
export function toggleMachine(open, id) {
  if (open.has(id)) open.delete(id);
  else open.add(id);
  return open;
}

/**
 * The whole text behind the folded line, in the app's code face. A native markdown code block
 * keeps its own lines and scrolls, so nothing is re-wrapped at body size.
 */
export function machineBody(c, { id, text }) {
  return div()
    .id(`${id}-body`)
    .w_full()
    .max_h(220)
    .overflow_y_scroll()
    .p(SPACE_SCALE[1])
    .rounded(RADIUS.control)
    .bg(c.well)
    .border_1()
    .border_color(c.controlBorder)
    .child(TextView.markdown(`${id}-body-md`, fenced(text)).selectable());
}

const COPIED_MS = 1500;
/** Machine-line ids whose Copy button was clicked within COPIED_MS, showing "Copied" inline. */
const copiedIds = new Set();

/**
 * One muted mono line of machine text, middle-truncated. A click (or Enter, once it has focus)
 * unfolds the whole text under the line; Copy hands it to the clipboard and reads "Copied" for 1.5 s.
 * `lead` says what it is ("branch", "TypeError: …").
 */
export function machineLine(c, { id, text, lead = null, expanded = false, onToggle = null }) {
  const face = mono();
  const copied = copiedIds.has(id);
  const shown = lead ? `${lead} ${middleTruncate(text)}` : middleTruncate(text);
  const line = div()
    .flex_1()
    .min_w(0)
    .truncate()
    .text_size(TYPE_SCALE.metadata)
    .line_height(`${TYPE_SCALE.metadata + 4}px`)
    .text_color(c.textMuted)
    .when(Boolean(face), (el) => el.font_family(/** @type {string} */ (face)))
    .when(Boolean(onToggle), (el) => focusable(el, `${id}-fold`, c).cursor_pointer().tooltip(expanded ? "Collapse" : "Expand").hover((s) => s.text_color(c.textPrimary)).on_click(onToggle))
    .child(shown);
  const row = h_flex()
    .id(id)
    .w_full()
    .min_w(0)
    .gap(SPACE_SCALE[1])
    .items_center()
    .child(line)
    .child(actionButton(c, `${id}-copy`, copied ? "Copied" : null, (_e, cx) => {
      cx.write_to_clipboard(String(text ?? ""));
      copiedIds.add(id);
      cx.notify();
      cx.timer.after(COPIED_MS, (cx) => {
        copiedIds.delete(id);
        cx.notify();
      });
    }, {
      icon: copied ? null : "copy",
      tone: "quiet",
      tooltip: copied ? "Copied" : "Copy",
      a11y: copied ? "Copied" : "Copy",
    }));
  if (!expanded) return row;
  return v_flex().w_full().gap(SPACE_SCALE[1]).child(row).child(machineBody(c, { id, text }));
}

/** A markdown body with its fenced code folded: prose stays markdown, code becomes machine lines.
 * `onLink` is called for a link in the prose; without one (untrusted text) links do nothing. */
export function markdownWithFoldedCode(c, { id, text, open, onLink = null, level = 1 }) {
  const prose = (partId, body) => div().child(TextView.markdown(partId, body).when(Boolean(onLink), (el) => el.on_link_click((url) => onLink(url))));
  const parts = splitFences(text);
  if (!parts.some((part) => part.kind === "code")) return prose(id, String(text ?? ""));
  return v_flex()
    .w_full()
    .gap(SPACE_SCALE[1])
    .children(parts.map((part, at) => {
      if (part.kind === "prose") return prose(`${id}-p${at}`, part.text);
      const codeId = `${id}-c${at}`;
      return machineLine(c, {
        id: codeId,
        text: part.text,
        lead: part.lang || null,
        expanded: open.has(codeId),
        onToggle: (_e, cx) => {
          toggleMachine(open, codeId);
          cx.notify();
        },
      });
    }));
}
