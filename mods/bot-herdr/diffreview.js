// In-place diff review with line-anchored comments (Threads › Changes). One row per diff line in
// mono: add/del use c.stateDone / c.stateFailed text with a + / − gutter (never a fill), and line
// numbers stay muted. Clicking a line or pressing Enter opens one inline input under it; Enter
// saves (bh review add) and Esc cancels. Comments render under their line with Remove.

import { div } from "gpui-kit";
import { v_flex, h_flex, Input } from "gpui-base";
import { settings } from "herdr";
import { SIZE, TYPE_SCALE, LINE, SPACE, CONTROL, RADIUS, clickable, activates } from "./look.js";
import { actionButton } from "./button.js";
import { commentsForLine } from "./threadview.js";

/** The user's configured monospace face, or null if unavailable. */
function mono() {
  try {
    return settings()?.font_family || null;
  } catch {
    return null;
  }
}

/** Formats a line number into a compact fixed column. */
function lineNum(c, n, face) {
  return div()
    .flex_none()
    .w(34)
    .text_size(TYPE_SCALE.metadata)
    .text_color(c.textMuted)
    .when(Boolean(face), (el) => el.font_family(/** @type {string} */ (face)))
    .child(n ? String(n) : "");
}

/** One review comment anchored under its line, with a quiet Remove action. */
function commentCard(c, cm, onRemoveComment) {
  return h_flex()
    .id(`bh-review-comment-${cm.id}`)
    .role("note")
    .accessibility_label(`Review comment on line ${cm.line}: ${cm.text}`)
    .w_full()
    .px(SPACE[3])
    .py(SPACE[2])
    .gap(SPACE[3])
    .items_center()
    .rounded(RADIUS.control)
    .bg(c.fill)
    .border_1()
    .border_color(c.edge)
    .child(div().flex_1().min_w(0).text_size(TYPE_SCALE.body).line_height(`${LINE.md}px`).text_color(c.textPrimary).child(cm.text))
    .when(cm.state === "sent", (el) => el.child(div().flex_none().text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child("Sent")))
    .child(actionButton(c, `bh-review-comment-${cm.id}-remove`, "Remove", (_e, cx) => onRemoveComment(cm, cx), { tone: "quiet", tooltip: "Remove comment" }));
}

/** The inline comment box under one diff line: Enter saves, Esc cancels. */
function commentEditor(c, { path, line, input, saving, onSave, onCancel }) {
  return h_flex()
    .id(`bh-review-editor-${path}-${line}`)
    .w_full()
    .px(SPACE[3])
    .py(SPACE[2])
    .gap(SPACE[2])
    .items_center()
    .rounded(RADIUS.control)
    .bg(c.fill)
    .border_1()
    .border_color(c.controlBorder ?? c.edge)
    .on_key_down((e, cx) => {
      if (String(e?.key ?? "").toLowerCase() !== "escape") return;
      cx.stop_propagation();
      onCancel(cx);
    })
    .child(h_flex()
      .flex_1()
      .min_w(0)
      .h(CONTROL)
      .px(SPACE[3])
      .items_center()
      .rounded(SIZE.control)
      .bg(c.ground)
      .border_1()
      .border_color(c.controlBorder ?? c.edge)
      .accessibility_label(`Add a review comment on ${path} line ${line}`)
      .child(Input.new(input).flex_1().min_w(0).h_full().text_size(TYPE_SCALE.body).text_color(c.textPrimary)))
    .child(actionButton(c, `bh-review-save-${line}`, "Save", (_e, cx) => onSave(cx), { tone: "secondary", disabled: saving, tooltip: "Save comment (Enter)" }))
    .child(actionButton(c, `bh-review-cancel-${line}`, "Cancel", (_e, cx) => onCancel(cx), { tone: "quiet", tooltip: "Cancel (Esc)" }));
}

/** One line of a diff hunk (mono, no fill on add/del, clickable when it has a new-side line). */
function diffLine(c, path, row, face, { onPickLine }) {
  const tone = row.kind === "add" ? c.stateDone : row.kind === "del" ? c.stateFailed : c.textPrimary;
  const label = `${row.kind === "add" ? "Added" : row.kind === "del" ? "Removed" : "Context"} line ${row.newLine ?? row.oldLine ?? ""}: ${row.text}`;
  const inner = h_flex()
    .w_full()
    .min_h(CONTROL)
    .px(SPACE[2])
    .gap(SPACE[2])
    .items_center()
    .rounded(RADIUS.control)
    .accessibility_label(label)
    .child(lineNum(c, row.oldLine, face))
    .child(lineNum(c, row.newLine, face))
    .child(div()
      .flex_none()
      .w(12)
      .text_size(TYPE_SCALE.metadata)
      .text_color(tone)
      .when(Boolean(face), (el) => el.font_family(/** @type {string} */ (face)))
      .child(row.gutter))
    .child(div()
      .flex_1()
      .min_w(0)
      .truncate()
      .text_size(TYPE_SCALE.metadata)
      .line_height(`${LINE.sm}px`)
      .text_color(tone)
      .when(Boolean(face), (el) => el.font_family(/** @type {string} */ (face)))
      .child(row.text || " "));
  if (!row.commentable) return inner.id(row.lineId);
  const open = (cx) => onPickLine(path, row.newLine, cx);
  return clickable(activates(inner.role("button").on_click((_e, cx) => open(cx)), open), c, row.lineId, { fill: c.hover });
}

/** Renders one hunk: its header and each line with any comments or open editor beneath it. */
function diffHunk(c, path, hunk, face, opts) {
  const nodes = [];
  if (hunk.header) {
    nodes.push(div()
      .px(SPACE[2])
      .py(SPACE[1])
      .text_size(TYPE_SCALE.metadata)
      .text_color(c.textMuted)
      .when(Boolean(face), (el) => el.font_family(/** @type {string} */ (face)))
      .child(hunk.header));
  }
  for (const row of hunk.rows) {
    nodes.push(diffLine(c, path, row, face, opts));
    if (row.commentable) {
      for (const cm of commentsForLine(opts.comments, path, row.newLine)) {
        nodes.push(commentCard(c, cm, opts.onRemoveComment));
      }
      if (opts.commentingLine === row.newLine) {
        nodes.push(commentEditor(c, {
          path,
          line: row.newLine,
          input: opts.commentInput,
          saving: opts.saving,
          onSave: opts.onSaveComment,
          onCancel: opts.onCancelComment,
        }));
      }
    }
  }
  return v_flex().w_full().gap(SPACE[1]).children(nodes);
}

/**
 * Draws the in-place diff for one expanded file (`bh-diff-<path>`). Returns null when the diff is
 * unavailable or unimplemented (draws nothing, never an error).
 */
export function renderDiffView(c, {
  path,
  diff,
  loading = false,
  comments = [],
  commentingLine = null,
  commentInput = null,
  saving = false,
  onPickLine = (_p, _l, _cx) => {},
  onSaveComment = (_cx) => {},
  onCancelComment = (_cx) => {},
  onRemoveComment = (_cm, _cx) => {},
}) {
  if (loading) {
    return div().id(`bh-diff-${path}`).px(SPACE[3]).py(SPACE[2]).text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child("Reading diff…");
  }
  if (!diff || !diff.hunks?.length) return null;
  const face = mono();
  const opts = { comments, commentingLine, commentInput, saving, onPickLine, onSaveComment, onCancelComment, onRemoveComment };
  return v_flex()
    .id(`bh-diff-${path}`)
    .w_full()
    .p(SPACE[2])
    .gap(SPACE[2])
    .rounded(RADIUS.control)
    .bg(c.well)
    .border_1()
    .border_color(c.edge)
    .children(diff.hunks.map((h) => diffHunk(c, path, h, face, opts)))
    .when(Boolean(diff.truncated), (el) => el.child(div().px(SPACE[2]).text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child("Diff truncated at 2000 lines; open the diff window for all of it.")));
}
