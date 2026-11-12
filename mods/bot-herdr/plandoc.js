// A plan opened as a sheet on the right of the Plans page: the draft as the page draws it. A click
// on a line comments on it, its open comments sit under it, and Start task hands it to the team.
// The header holds Start task, Archive, Discard and Close (Esc); the body scrolls under it.

import { div, svg } from "gpui-kit";
import { v_flex, h_flex, TextareaState, Textarea, TextView } from "gpui-base";
import { props, settings, closeOverlay, openOverlay } from "herdr";
import { SIZE, ICON, TYPE, LINE, SPACE, PIP, DOT, CHIP, HAIR, GLYPH, SCRIM, MOTION, isLight, clickable } from "./look.js";
import { actionButton } from "./button.js";
import { alpha } from "./working.js";
import { colors } from "./theme.js";
import { blocks } from "./doc.js";
import { bh, enc, projectDir } from "./bh.js";
import { sendFromChat } from "./pages.js";

/** How long a two-step action (Discard, Delete) waits for its second click. */
export const CONFIRM_MS = 5000;
/** The comment links on the work pages: links in TYPE.sm, Delete in the danger tone. */
export const COMMENT_LINKS = { link: TYPE.sm, danger: true };
const SHEET_MIN = 480;

/** Comments, the open ones first, then the resolved ones, each in their own order. */
export function openFirst(list) {
  return [...(list ?? []).filter((x) => x.open !== false), ...(list ?? []).filter((x) => x.open === false)];
}

/** Arms a two-step action: `owner[field]` holds `id` for CONFIRM_MS, unless a later arm replaced it. */
export function arm(owner, field, id, cx) {
  const token = { id };
  owner[field] = token;
  cx.notify();
  cx.timer.after(CONFIRM_MS, (cx) => {
    if (owner[field] !== token) return;
    owner[field] = null;
    cx.notify();
  });
}

/** Whether the two-step action `id` is armed on `owner`. */
export const armed = (owner, field, id) => owner[field]?.id === id;

/** A section's label: small semibold muted text, then a hairline to the row's end (every page). */
export function sectionLabel(c, text) {
  return h_flex()
    .flex_none()
    .gap(SPACE[3])
    .items_center()
    .child(div().flex_none().text_size(TYPE.sm).font_semibold().text_color(c.muted).child(text))
    .child(div().flex_1().h(HAIR).bg(c.edge));
}

/** One link on a comment: its label, run on a click without reaching the row it is in. */
function commentLink(c, id, size, label, run, tone) {
  return clickable(
    div()
      .flex_none()
      .text_size(size)
      .line_height(`${LINE.sm}px`)
      .text_color(tone)
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run(cx);
      })
      .child(label),
    c,
    id,
  );
}

/**
 * A comment of yours: a quiet line with the accent at its edge, then its links (Resolve, Edit,
 * Delete; Reopen and Delete once resolved). `actions.key` makes the links' ids; each link is
 * `(cx) => void`. `link` is the links' text size; `danger` puts Delete in the danger tone. Shared
 * by the work pages, the chat and the plan sheet.
 */
export function commentRow(c, comment, actions, { link = TYPE.xs, danger = false } = {}) {
  const open = comment.open !== false;
  const at = (name, label, run, tone = c.faint) => commentLink(c, `${actions.key}-${name}`, link, label, run, tone);
  return h_flex()
    .flex_none()
    .gap(SPACE[3])
    .items_start()
    .when(!open, (el) => el.opacity(0.55))
    .child(div().flex_none().w(SPACE[1]).h_full().min_h(SPACE[5]).rounded(PIP).bg(c.accent))
    .child(div().flex_1().min_w(0).text_size(TYPE.sm).line_height(`${LINE.sm}px`).text_color(c.muted).when(!open, (el) => el.line_through()).child(comment.text))
    .when(open, (el) => el.child(at("resolve", "Resolve", actions.resolve)).child(at("edit", "Edit", actions.edit)))
    .when(!open && Boolean(actions.reopen), (el) => el.child(at("reopen", "Reopen", actions.reopen)))
    .child(at("delete", "Delete", actions.delete, danger ? c.danger : c.faint));
}

/** Opens the plan as a sheet over the whole window: the page stays behind it, and a click beside the sheet closes it. */
export function openPlan(plan) {
  return openOverlay({
    mod: "bot-herdr",
    kind: "dialog",
    frame: "none",
    width: 1,
    height: 1,
    props: { view: "plan", plan },
  });
}

export class PlanDoc {
  init(given, cx) {
    this.p = given ?? props() ?? {};
    this.plan = this.p.plan ?? null;
    this.width = 0; // the window's width, as it is drawn
    this.commenting = null; // { line, edit: comment id | null }
    this.focusing = false; // the comment's text area has the keyboard: its edge is the accent
    this.armed = null; // Discard, once clicked, waits for a second click
    this.problem = null;
    this.hoverLine = null; // the draft line under the pointer
    this.in = false; // the sheet has slid in (the first frame draws it off the right edge)
    this.sized = false; // the window is measured: the slide can start
    this.leaving = false; // Close: the sheet slides out, then the overlay goes
    this.cx = null;
    this.inline = TextareaState.new({ placeholder: "Your comment", rows: 2 });
    // Enter sends; Shift+Enter is a new line (as the composer does).
    this.inline.on("submit", (e, cx) => {
      if (e?.shift || e?.secondary) return;
      this.sendInline(cx);
    });
    this.inline.on("focus", (_e, cx) => this.focusChanged(true, cx));
    this.inline.on("blur", (_e, cx) => this.focusChanged(false, cx));
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.reload(cx);
  }

  focusChanged(on, cx) {
    this.focusing = on;
    cx.notify();
  }

  /** Close: the sheet slides back out, then the overlay goes (Esc and the scrim take this path too). */
  closeSelf() {
    const overlay = props()?.overlay ?? this.p.overlay;
    if (this.leaving) return;
    if (!this.cx) return closeOverlay(overlay);
    this.leaving = true;
    this.in = false;
    this.cx.notify();
    this.cx.timer.after(MOTION.arrive.duration, () => closeOverlay(overlay));
  }

  /** The plan as it is now (a comment, an archive change): re-read from bh. */
  reload(cx) {
    const id = this.plan?.id;
    if (!id) return;
    cx.spawn(async (cx) => {
      const r = await bh(["plan", "show", id, "--json"], { cwd: projectDir() });
      try {
        const got = JSON.parse(r.stdout);
        if (got && !Array.isArray(got)) this.plan = got;
      } catch {
        // keep what we have
      }
      cx.notify();
    });
  }

  act(args, cx, done) {
    cx.spawn(async (cx) => {
      const r = await bh(args, { cwd: projectDir() });
      this.problem = r.code === 0 ? null : (r.stderr || r.stdout).trim().split("\n")[0];
      done?.(r);
      this.reload(cx);
      cx.notify();
    });
  }

  startInline(line, cx) {
    const same = this.commenting?.line === line && !this.commenting.edit;
    this.commenting = same ? null : { line, edit: null };
    this.inline.set_value("");
    if (!same) this.inline.focus();
    cx.notify();
  }

  cancelComment(cx) {
    this.commenting = null;
    this.inline.set_value("");
    cx.notify();
  }

  sendInline(cx) {
    const text = this.inline.value().trim();
    const where = this.commenting;
    const plan = this.plan;
    if (!text || !where || !plan) return;
    this.inline.set_value("");
    this.commenting = null;
    this.act(["plan", "comment", plan.id, "--line", String(where.line), "--data", enc(text)], cx, (r) => {
      if (r.code === 0) sendFromChat(`The user commented on line ${where.line} of plan ${plan.id} ("${plan.title}"): ${text}\n\nRevise the draft (bh plan show ${plan.id}) or say why it needs no change.`);
    });
  }

  commentActions(x) {
    const w = this.commenting;
    return {
      key: `bh-plan-doc-c-${this.plan?.id}-${x.id}`,
      editing: Boolean(w && w.edit === x.id),
      resolve: (cx) => this.act(["plan", "resolve", this.plan.id, "--comment", x.id], cx),
      reopen: (cx) => this.act(["plan", "comment", this.plan.id, "--edit", x.id, "--data", enc(x.text)], cx),
      edit: (cx) => {
        this.commenting = { line: x.line ?? null, edit: x.id };
        this.inline.set_value(x.text ?? "");
        this.inline.focus();
        cx.notify();
      },
      delete: (cx) => this.act(["plan", "comment", this.plan.id, "--delete", x.id], cx),
    };
  }

  onKey(e, cx) {
    if (e.key !== "escape") return;
    if (this.commenting) this.cancelComment(cx);
    else this.closeSelf();
    cx.stop_propagation();
  }

  /** 45% of the window, at least 480px, and never wider than the window. */
  sheetW() {
    if (!this.width) return SHEET_MIN;
    return Math.min(this.width, Math.max(SHEET_MIN, Math.round(this.width * 0.45)));
  }

  /** The sheet's left edge: SPACE[4] off the window's right edge; the first frame puts it past that edge. */
  sheetLeft() {
    return Math.max(SPACE[4], this.width - this.sheetW() - SPACE[4]);
  }

  render(cx) {
    this.cx = cx;
    const c = colors();
    const p = this.plan;
    if (!p) return div().size_full().bg(c.ground).child(div().p(SPACE[5]).text_size(TYPE.md).text_color(c.muted).child("This plan is gone."));
    const inPlace = this.in && this.sized;
    return div()
      .id("bh-plan-doc")
      .track_focus(this.handle)
      .on_key_down((e, cx) => this.onKey(e, cx))
      .on_size_change((size, cx) => {
        this.width = size.width / (Number(settings().zoom) || 1);
        if (!this.sized) this.slideIn(cx);
        cx.notify();
      })
      .relative()
      .size_full()
      .text_color(c.ink)
      // The page behind the sheet: a scrim (gpui has no blur) that fades in with the sheet; a click on it closes.
      .child(div().absolute().inset_0().bg(isLight(c) ? SCRIM.light : SCRIM.dark)
        .opacity(inPlace ? 1 : 0)
        .transition("opacity", MOTION.arrive)
        .on_click(() => this.closeSelf()))
      .child(v_flex()
        .absolute()
        .top(SPACE[4])
        .bottom(SPACE[4])
        .left(inPlace ? this.sheetLeft() : this.width || 0)
        .w(this.sheetW())
        .opacity(this.sized ? 1 : 0)
        .transition("left", MOTION.arrive)
        .child(this.sheet(c, p)));
  }

  /** Once the window is measured, the sheet slides in from its right edge on the next frame. */
  slideIn(cx) {
    this.sized = true;
    cx.timer.after(16, (cx) => {
      if (this.leaving) return;
      this.in = true;
      cx.notify();
    });
  }

  sheet(c, p) {
    return v_flex()
      .size_full()
      .bg(c.fill)
      .border_1()
      .border_color(c.edge)
      .rounded(SIZE.radius)
      .shadow_md()
      .overflow_hidden()
      .child(this.sheetHead(c, p))
      .child(this.sheetBody(c, p));
  }

  /** The title is the sheet's own: "Draft plan", its round, and the actions on the right. */
  sheetHead(c, p) {
    return h_flex()
      .flex_none()
      .flex_wrap()
      .gap(SPACE[3])
      .p(SPACE[4])
      .items_center()
      .border_b(1)
      .border_color(c.edge)
      .child(v_flex().flex_1().min_w(160).gap(SPACE[1])
        .child(div().text_size(TYPE.lg).font_semibold().child("Draft plan"))
        .child(div().text_size(TYPE.sm).text_color(c.muted).child(`round ${p.round ?? 0} · choose a line to comment on it`)))
      .child(this.headActions(c, p));
  }

  headActions(c, p) {
    const ready = p.status === "ready" && !p.task;
    const archived = p.status === "archived";
    return h_flex()
      .flex_none()
      .flex_wrap()
      .gap(SPACE[2])
      .items_center()
      .justify_end()
      .when(ready, (el) => el.child(actionButton(c, "bh-plan-start", "Start task", () => sendFromChat(`The plan ${p.id} ("${p.title}") is agreed: make it a task (bh plan task ${p.id}) and start it.`), { tone: "primary", icon: "play" })))
      .child(actionButton(c, "bh-plan-arch", archived ? "Unarchive" : "Archive", (_e, cx) => this.act(["plan", archived ? "unarchive" : "archive", p.id], cx), { icon: "archive" }))
      .child(this.discardButton(c, p))
      .child(actionButton(c, "bh-plan-doc-close", "Close", () => this.closeSelf(), { hint: "Esc" }));
  }

  /** Discard: the first click asks again; the second deletes the plan and its open questions, then closes the sheet. */
  discardButton(c, p) {
    const sure = armed(this, "armed", "discard");
    return actionButton(c, "bh-plan-discard", sure ? "Discard for good?" : "Discard", (_e, cx) => {
      if (!sure) return arm(this, "armed", "discard", cx);
      this.armed = null;
      this.act(["plan", "delete", p.id], cx, (r) => {
        if (r.code === 0) this.closeSelf();
      });
    }, { icon: "trash", tone: "danger" });
  }

  sheetBody(c, p) {
    const all = openFirst(p.comments);
    return v_flex()
      .flex_1()
      .min_h(0)
      .overflow_y_scroll()
      .p(SPACE[5])
      .gap(SPACE[4])
      .when(Boolean(this.problem), (el) => el.child(div().text_size(TYPE.sm).text_color(c.danger).child(this.problem)))
      .child(p.markdown
        ? this.lines(c, p)
        : div().text_size(TYPE.md).text_color(c.muted).child("No draft yet: the panel is still asking."))
      .when(all.some((x) => !x.line), (el) => el.child(v_flex()
        .gap(SPACE[3])
        .child(sectionLabel(c, "Your comments on the plan"))
        .children(all.filter((x) => !x.line).map((x) => this.commentNote(c, x)))));
  }

  /** The draft in pieces (a heading, an item, a paragraph…), each one a click away from a comment. */
  lines(c, p) {
    const parts = blocks(p.markdown);
    const count = String(p.markdown).split("\n").length;
    return v_flex().gap(SPACE[1]).children(parts.map((b, i) => this.lineBlock(c, p, b, parts[i + 1]?.line ?? count + 1)));
  }

  /** One block of the draft: hovered or chosen it takes the hover fill, and its comments and the box sit under it. */
  lineBlock(c, p, b, next) {
    const notes = openFirst(p.comments).filter((x) => x.line != null && x.line >= b.line && x.line < next);
    const live = notes.filter((x) => x.open !== false).length;
    const on = this.commenting?.line === b.line && !this.commenting.edit;
    return v_flex()
      .flex_none()
      .child(this.lineRow(c, p, b, on, live))
      .children(notes.map((x) => this.noteLine(c, x)))
      .when(on, (el) => el.child(this.commentBox(c).mt(SPACE[2])));
  }

  /** The block itself, clickable: hovered or chosen it takes the hover fill, with its comment glyph in the right margin. */
  lineRow(c, p, b, on, live) {
    const hovered = this.hoverLine === b.line;
    return clickable(
      h_flex()
        .px(SPACE[3])
        .py(SPACE[1])
        .gap(SPACE[3])
        .items_start()
        .rounded(SIZE.nested)
        .when(on || hovered, (el) => el.bg(c.hover))
        .on_hover((over, cx) => this.hoverChanged(b.line, over, cx))
        .on_click((_e, cx) => this.startInline(b.line, cx))
        .child(this.markSlot(c, live))
        .child(div().flex_1().min_w(0).max_w(600).text_size(TYPE.md).line_height(`${LINE.md}px`).child(TextView.markdown(`bh-plan-doc-md-${p.id}-${p.round ?? 0}-${b.line}`, b.text)))
        .child(div().flex_1().min_w(0))
        .child(this.marginGlyph(c, live, on || hovered)),
      c,
      `bh-plan-doc-b-${p.id}-${b.line}`,
    );
  }

  /** The pointer on a line: its fill and comment glyph show while it is over it. */
  hoverChanged(line, over, cx) {
    if (over === (this.hoverLine === line)) return;
    this.hoverLine = over ? line : null;
    cx.notify();
  }

  /** The line's left margin: an accent dot once it has an open comment. */
  markSlot(c, live) {
    return div().flex_none().w(SPACE[3]).pt(SPACE[2])
      .when(live > 0, (el) => el.child(div().size(DOT).rounded_full().bg(c.accent)));
  }

  /** The comment glyph in the sheet's right margin: shown on hover, outlined in the accent when the line has comments. */
  marginGlyph(c, live, show) {
    if (!show && !live) return div().flex_none().size(CHIP);
    const has = live > 0;
    return div()
      .flex_none()
      .size(CHIP)
      .flex()
      .items_center()
      .justify_center()
      .rounded(SIZE.nested)
      .when(has, (el) => el.border_1().border_color(alpha(c.accent, 0.55)))
      .child(svg(ICON("comment")).size(GLYPH.sm).text_color(has ? c.accent : c.muted));
  }

  /** A comment under its line: an italic note on the accent tint, full width of the text column, with its links. */
  noteRow(c, x, actions) {
    const open = x.open !== false;
    const at = (name, label, run, tone = c.faint) => commentLink(c, `${actions.key}-${name}`, TYPE.xs, label, run, tone);
    return h_flex()
      .flex_none()
      .w_full()
      .max_w(600)
      .gap(SPACE[3])
      .items_start()
      .px(SPACE[3])
      .py(SPACE[2])
      .rounded(SIZE.nested)
      .bg(alpha(c.accent, 0.12))
      .when(!open, (el) => el.opacity(0.55))
      .child(div().flex_1().min_w(0).italic().text_size(TYPE.sm).line_height(`${LINE.sm}px`).text_color(c.ink)
        .when(!open, (el) => el.line_through())
        .child(x.text))
      .when(open, (el) => el.child(at("resolve", "Resolve", actions.resolve)).child(at("edit", "Edit", actions.edit)))
      .when(!open && Boolean(actions.reopen), (el) => el.child(at("reopen", "Reopen", actions.reopen)))
      .child(at("delete", "Delete", actions.delete, c.danger));
  }

  /** A line's comment, with its box under it while it is being edited. */
  noteLine(c, x) {
    const actions = this.commentActions(x);
    const row = this.noteRow(c, x, actions).mb(SPACE[2]);
    return actions.editing ? v_flex().flex_none().child(row).child(this.commentBox(c).mt(SPACE[2])) : row;
  }

  commentNote(c, x) {
    const actions = this.commentActions(x);
    const row = commentRow(c, x, actions, COMMENT_LINKS).mb(SPACE[2]);
    return actions.editing ? v_flex().flex_none().child(row).child(this.commentBox(c).mt(SPACE[2])) : row;
  }

  /** The box for a comment: its label and a cancel, the text area (accent edge while it has the keyboard), the keys, and Add comment. */
  commentBox(c) {
    return v_flex()
      .flex_none()
      .gap(SPACE[2])
      .p(SPACE[3])
      .rounded(SIZE.control)
      .bg(c.well)
      .border_1()
      .border_color(c.edge)
      .child(this.commentHead(c))
      .child(this.commentField(c))
      .child(h_flex().gap(SPACE[3]).items_center()
        .child(div().flex_1().min_w(0).text_size(TYPE.xs).text_color(c.muted).child("Enter adds the comment · Esc cancels"))
        .child(actionButton(c, "bh-plan-doc-send", "Add comment", (_e, cx) => this.sendInline(cx), { tone: "primary", icon: "send" })));
  }

  /** "Your comment" and the close that cancels it. */
  commentHead(c) {
    return h_flex().gap(SPACE[3]).items_center()
      .child(div().flex_1().min_w(0).text_size(TYPE.sm).font_semibold().text_color(c.muted).child("Your comment"))
      .child(actionButton(c, "bh-plan-doc-cancel", null, (_e, cx) => this.cancelComment(cx), { icon: "x", tone: "quiet", tooltip: "Cancel" }));
  }

  /** The text area: its edge is the accent while it has the keyboard. */
  commentField(c) {
    return div()
      .rounded(SIZE.control)
      .bg(c.fill)
      .border_1()
      .border_color(this.focusing ? c.accent : c.edge)
      .p(SPACE[2])
      .child(Textarea.new(this.inline).w_full().h(LINE.md * 2).text_size(TYPE.md).text_color(c.ink));
  }
}
