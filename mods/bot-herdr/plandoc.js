// A plan opened in its own window: the draft exactly as the Plans page draws it — a click on a
// line comments on it, its open comments sit under it, and Start task hands it to the team.
// Opened by the Plans page's "View plan" tab over everything, with an expand control for full size.

import { div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextView } from "gpui-base";
import { props, closeOverlay, openOverlay } from "herdr";
import { SIZE, ICON, TYPE, LINE, SPACE, CHIP, CONTROL, PIP, HAIR, GLYPH, clickable, accentFill, pressable, focusable } from "./look.js";
import { colors } from "./theme.js";
import { blocks } from "./doc.js";
import { bh, enc, projectDir } from "./bh.js";
import { sendFromChat } from "./pages.js";

/** Comments, the open ones first, then the resolved ones, each in their own order. */
export function openFirst(list) {
  return [...(list ?? []).filter((x) => x.open !== false), ...(list ?? []).filter((x) => x.open === false)];
}

/**
 * A comment of yours: a quiet line with the accent at its edge, then its links (Resolve, Edit,
 * Delete; Reopen and Delete once resolved). `actions.key` makes the links' ids; each link is
 * `(cx) => void`. Shared by the work pages, the chat and the plan window.
 */
export function commentRow(c, comment, actions) {
  const open = comment.open !== false;
  const link = (name, label, run) => clickable(
    div()
      .flex_none()
      .text_size(TYPE.xs)
      .line_height(`${LINE.sm}px`)
      .text_color(c.faint)
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run(cx);
      })
      .child(label),
    c,
    `${actions.key}-${name}`,
  );
  return h_flex()
    .flex_none()
    .gap(SPACE[3])
    .items_start()
    .when(!open, (el) => el.opacity(0.55))
    .child(div().flex_none().w(SPACE[1]).h_full().min_h(SPACE[5]).rounded(PIP).bg(c.accent))
    .child(div().flex_1().min_w(0).text_size(TYPE.sm).line_height(`${LINE.sm}px`).text_color(c.muted).when(!open, (el) => el.line_through()).child(comment.text))
    .when(open, (el) => el.child(link("resolve", "Resolve", actions.resolve)).child(link("edit", "Edit", actions.edit)))
    .when(!open && Boolean(actions.reopen), (el) => el.child(link("reopen", "Reopen", actions.reopen)))
    .child(link("delete", "Delete", actions.delete));
}

/** Opens the plan over everything; `big` asks for the whole window. */
export function openPlan(plan, { big = false } = {}) {
  return openOverlay({
    mod: "bot-herdr",
    kind: "dialog",
    frame: "none",
    width: big ? 0.98 : 0.8,
    height: big ? 0.96 : 0.86,
    props: { view: "plan", plan, big },
  });
}

export class PlanDoc {
  init(given, cx) {
    this.p = given ?? props() ?? {};
    this.plan = this.p.plan ?? null;
    this.big = Boolean(this.p.big);
    this.commenting = null; // { line, edit: comment id | null }
    this.busy = false;
    this.problem = null;
    this.inline = InputState.new({ placeholder: "Your comment. Enter sends it to the Orchestrator" });
    this.inline.on("submit", (_e, cx) => this.sendInline(cx));
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.reload(cx);
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

  sendInline(cx) {
    const text = this.inline.value().trim();
    const where = this.commenting;
    const plan = this.plan;
    if (!text || !where || !plan) return;
    this.inline.set_value("");
    this.commenting = null;
    this.act(["plan", "comment", plan.id, "--line", String(where.line), "--data", enc(text)], cx, (r) => {
      if (r.code === 0) sendFromChat(`The person commented on line ${where.line} of plan ${plan.id} ("${plan.title}"): ${text}\n\nRevise the draft (bh plan show ${plan.id}) or say why it needs no change.`);
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

  render(cx) {
    const c = colors();
    const p = this.plan;
    if (!p) return div().size_full().bg(c.ground).child(div().p(SPACE[5]).text_size(TYPE.md).text_color(c.muted).child("This plan is gone."));
    const all = openFirst(p.comments);
    const close = () => closeOverlay(props()?.overlay ?? this.p.overlay);
    const reopen = (big) => {
      closeOverlay(props()?.overlay ?? this.p.overlay);
      openPlan(p, { big });
    };
    return v_flex()
      .id("bh-plan-doc")
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key !== "escape") return;
        close();
        cx.stop_propagation();
      })
      .size_full()
      .bg(c.ground)
      .border_1()
      .border_color(c.edge)
      .rounded(SIZE.radius)
      .overflow_hidden()
      .text_color(c.ink)
      .child(
        h_flex()
          .flex_none()
          .h(CONTROL + SPACE[4])
          .px(SPACE[4])
          .gap(SPACE[3])
          .items_center()
          .border_b(1)
          .border_color(c.edge)
          .child(svg(ICON("file")).size(GLYPH.lg).text_color(c.muted))
          .child(div().flex_1().min_w(0).truncate().text_size(TYPE.lg).font_semibold().child(p.title ?? p.id))
          .child(focusable(
            pressable(
              div()
                .size(CONTROL)
                .flex_none()
                .flex()
                .items_center()
                .justify_center()
                .rounded(SIZE.nested)
                .text_color(c.muted)
                .hover((s) => s.bg(c.hover).text_color(c.ink))
                .on_click(() => reopen(!this.big))
                .child(svg(ICON("expand")).size(GLYPH.md)),
            ),
            "bh-plan-doc-expand",
            c,
          ))
          .child(focusable(
            pressable(
              div()
                .size(CONTROL)
                .flex_none()
                .flex()
                .items_center()
                .justify_center()
                .rounded(SIZE.nested)
                .text_color(c.muted)
                .hover((s) => s.bg(c.hover).text_color(c.ink))
                .on_click(close)
                .child(svg(ICON("x")).size(GLYPH.md)),
            ),
            "bh-plan-doc-close",
            c,
          )),
      )
      .child(
        v_flex()
          .flex_1()
          .min_h(0)
          .overflow_y_scroll()
          .items_center()
          .child(
            v_flex()
              .flex_none()
              .w_full()
              .max_w(720)
              .p(SPACE[5])
              .gap(SPACE[4])
              .child(
                h_flex()
                  .gap(SPACE[3])
                  .items_center()
                  .child(div().flex_1().min_w(0).text_size(TYPE.lg).font_semibold().child(p.title ?? p.id))
                  .when(p.status === "ready" && !p.task, (el) => el.child(clickable(
                    div()
                      .flex_none()
                      .h(CONTROL)
                      .px(SPACE[4])
                      .flex()
                      .items_center()
                      .rounded(SIZE.control)
                      .bg(c.accent)
                      .border_b(1)
                      .border_color(c.accentLip)
                      .text_size(TYPE.sm)
                      .font_medium()
                      .text_color(c.accentInk)
                      .on_click(() => sendFromChat(`The plan ${p.id} ("${p.title}") is agreed: make it a task (bh plan task ${p.id}) and start it.`))
                      .child("Start task"),
                    c,
                    "bh-plan-start", { fill: accentFill(c) },
                  )))
                  .child(clickable(
                    div()
                      .flex_none()
                      .h(CHIP)
                      .px(SPACE[3])
                      .flex()
                      .items_center()
                      .rounded(SIZE.nested)
                      .border_1()
                      .border_color(c.edge)
                      .text_size(TYPE.sm)
                      .text_color(c.muted)
                      .hover((s) => s.bg(c.hover).text_color(c.ink))
                      .on_click((_e, cx) => this.act(["plan", p.status === "archived" ? "unarchive" : "archive", p.id], cx))
                      .child(p.status === "archived" ? "Unarchive" : "Archive"),
                    c,
                    "bh-plan-arch",
                  )),
              )
              .when(Boolean(this.problem), (el) => el.child(div().text_size(TYPE.sm).text_color(c.danger).child(this.problem)))
              .when(Boolean(p.markdown), (el) => el.child(div().text_size(TYPE.xs).text_color(c.faint).child("Click any line to comment on it.")))
              .child(p.markdown
                ? this.lines(c, p)
                : div().text_size(TYPE.md).text_color(c.muted).child("No draft yet: the panel is still asking."))
              .when(all.some((x) => !x.line), (el) => el.child(
                v_flex()
                  .gap(SPACE[3])
                  .child(div().text_size(TYPE.sm).font_semibold().text_color(c.muted).child("Your comments on the plan"))
                  .children(all.filter((x) => !x.line).map((x) => this.commentNote(c, x))),
              )),
          ),
      );
  }

  /** The draft in pieces (a heading, an item, a paragraph…), each one a click away from a comment. */
  lines(c, p) {
    const parts = blocks(p.markdown);
    const count = String(p.markdown).split("\n").length;
    return v_flex()
      .gap(SPACE[1])
      .children(parts.map((b, i) => {
        const next = parts[i + 1]?.line ?? count + 1;
        const notes = openFirst(p.comments).filter((x) => x.line != null && x.line >= b.line && x.line < next);
        const live = notes.filter((x) => x.open !== false).length;
        const on = this.commenting?.line === b.line && !this.commenting.edit;
        return v_flex()
          .flex_none()
          .child(
            clickable(
              h_flex()
                .px(SPACE[3])
                .py(SPACE[1])
                .gap(SPACE[3])
                .items_start()
                .rounded(SIZE.nested)
                .when(on, (el) => el.bg(c.hover))
                .on_click((_e, cx) => this.startInline(b.line, cx))
                .child(div().flex_1().min_w(0).max_w(600).text_size(TYPE.md).line_height(`${LINE.md}px`).child(TextView.markdown(`bh-plan-doc-md-${p.id}-${p.round ?? 0}-${b.line}`, b.text)))
                .when(live > 0, (el) => el.child(h_flex().flex_none().pt(SPACE[1]).gap(SPACE[1]).items_center().text_size(TYPE.xs).text_color(c.accent)
                  .child(svg(ICON("comment")).size(GLYPH.sm)).child(String(live)))),
              c,
              `bh-plan-doc-b-${p.id}-${b.line}`,
            ),
          )
          .children(notes.map((x) => this.commentNote(c, x)))
          .when(on, (el) => el.child(this.inlineBox(c)));
      }));
  }

  commentNote(c, x) {
    const actions = this.commentActions(x);
    const row = commentRow(c, x, actions).ml(0).mr(0).mb(SPACE[2]);
    return actions.editing ? v_flex().flex_none().child(row).child(this.inlineBox(c)) : row;
  }

  inlineBox(c) {
    return clickable(
      h_flex()
        .flex_none()
        .mt(SPACE[2])
        .mb(SPACE[3])
        .gap(SPACE[3])
        .items_center()
        .child(
          div()
            .flex_1()
            .min_w(0)
            .h(CONTROL)
            .px(SPACE[3])
            .flex()
            .items_center()
            .rounded(SIZE.control)
            .bg(c.fill)
            .border_1()
            .border_color(c.edge)
            .child(Input.new(this.inline).w_full().h_full().text_size(TYPE.md).text_color(c.ink)),
        )
        .child(focusable(
          pressable(
            div()
              .flex_none()
              .h(CONTROL)
              .px(SPACE[4])
              .flex()
              .items_center()
              .rounded(SIZE.control)
              .bg(c.accent)
              .text_size(TYPE.sm)
              .font_medium()
              .text_color(c.accentInk)
              .hover((s) => s.opacity(0.92))
              .on_click((_e, cx) => this.sendInline(cx))
              .child("Comment"),
          ),
          "bh-plan-doc-send",
          c,
        )),
      c,
      "bh-plan-doc-inline",
    );
  }
}
