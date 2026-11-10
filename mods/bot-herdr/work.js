// The Tasks, Plans and Knowledge pages: the team's work in the project of the space you are
// looking at. One view; the layout gives each page its own block (props.tab).
//   Tasks      a list (under way, then finished; or the archived ones) beside the chosen task:
//              its steps, each with who did it and for how long, and your comments on any step.
//              Resume hands it back to the Orchestrator.
//   Plans      the panel's drafts: read one, comment on any line of it, start it as a task.
//   Knowledge  what each agent knows about the project, to read and edit.
// Everything comes from the bh tool (tasks, plans and knowledge live in the project's
// .bot-herdr folder); messages for the team go through the chat's composer.

import { div, svg } from "gpui-kit";
import { v_flex, h_flex, TextView, InputState, Input, TextareaState, Textarea } from "gpui-base";
import { settings, shared } from "herdr";
import { LIGHT, DARK, SIZE, ICON } from "./look.js";
import { activePage, sendFromChat } from "./pages.js";
import { ROSTER_KEY, roster, slug } from "./roster.js";
import { bh, bhJson, enc, projectDir } from "./bh.js";
import { blocks, commentsOn } from "./doc.js";

const TABS = [
  { id: "tasks", label: "Tasks" },
  { id: "plans", label: "Plans" },
  { id: "knowledge", label: "Knowledge" },
];
const SECTIONS = [
  { id: "open", label: "Under way", has: ["active", "paused", "backlog"] },
  { id: "done", label: "Finished", has: ["done", "abandoned"] },
];
const LIST_W = 340;
const GAP = 14;
const MAX = 1140;
const REFRESH_MS = 4000;

const load = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
};
const keep = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // only a convenience
  }
};

/** 3725000 ms → "1h 2m"; under a minute → "<1m". */
export function duration(ms) {
  const m = Math.floor((ms ?? 0) / 60000);
  if (m < 1) return "<1m";
  const h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}m`;
}

const workedOf = (t, at = Date.now()) => (t.steps ?? []).reduce((sum, s) => sum + (s.workedMs ?? 0) + (s.status === "active" && s.started ? at - Date.parse(s.started) : 0), 0);
/** How old something is, in one short word: now, 40s, 3h, 4d. */
export function age(iso, at = Date.now()) {
  const ms = at - Date.parse(iso ?? "");
  if (!Number.isFinite(ms)) return "";
  const s = Math.floor(ms / 1000);
  if (s < 30) return "now";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

const day = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export class Work {
  init(given, cx) {
    // Each page is its own block (props.tab); without one, a tab row switches between them.
    this.fixed = TABS.some((t) => t.id === given?.tab) ? given.tab : null;
    this.tab = this.fixed ?? load("tab", "tasks");
    this.width = 900;
    this.height = 700;
    this.dir = null; // the project folder the data is from
    this.tasks = null;
    this.plans = null;
    this.kinds = null; // knowledge files: [{ agent, entries, chars, over }]
    this.archived = false;
    this.opened = null; // task id shown open
    this.plan = null; // the plan shown: its full record
    this.planId = load("plan", null);
    this.agent = load("agent", null); // the knowledge file shown
    this.knownText = null; // the file as loaded, to tell an edit from it
    this.notes = [];
    this.busy = false;
    this.problem = null;
    this.comment = InputState.new({ placeholder: "Comment on this plan; the Orchestrator revises it" });
    this.comment.on("submit", (_e, cx) => this.sendComment(cx));
    // A comment on one line of a plan, or one step of a task: { kind: "plan" | "task", id, at }.
    this.commenting = null;
    this.inline = InputState.new({ placeholder: "Your comment. Enter sends it to the Orchestrator" });
    this.inline.on("submit", (_e, cx) => this.sendInline(cx));
    this.taskComment = InputState.new({ placeholder: "Comment on this task; the Orchestrator takes it up" });
    this.taskComment.on("submit", (_e, cx) => this.sendTaskComment(cx));
    this.editor = TextareaState.new({ rows: 20 });
    this.editor.set_soft_wrap(true);
    this.editor.on("change", (_e, cx) => cx.notify());
    this.reload(cx);
    cx.timer.every(REFRESH_MS, (cx) => {
      if (activePage() === (this.fixed ?? "work")) this.reload(cx);
    });
  }

  // ── Data ───────────────────────────────────────────────────────────────────────────────────

  reload(cx) {
    if (this.busy) return;
    this.busy = true;
    const dir = projectDir();
    cx.spawn(async (cx) => {
      try {
        if (dir !== this.dir) {
          this.dir = dir;
          this.opened = null;
          this.plan = null;
          this.knownText = null;
        }
        if (this.tab === "tasks") {
          const got = await bhJson(["task", "list", "--all"], { cwd: dir });
          this.tasks = got ?? [];
          this.problem = got ? null : "Couldn't read the tasks. Is node on your PATH?";
        }
        if (this.tab === "plans") {
          this.plans = (await bhJson(["plan", "list", "--all"], { cwd: dir })) ?? [];
          const id = this.planId ?? this.plans.find((p) => p.status !== "archived")?.id ?? null;
          this.plan = id ? await bhJson(["plan", "show", id], { cwd: dir }) : null;
        }
        if (this.tab === "knowledge") {
          this.kinds = (await bhJson(["knowledge", "list"], { cwd: dir })) ?? [];
          const agent = this.agent ?? "orchestrator";
          // Don't pull the file from under an edit in progress.
          if (this.knownText === null || this.editor.value() === this.knownText) {
            const got = await bhJson(["knowledge", agent], { cwd: dir });
            const text = got?.text ?? "";
            if (text !== this.knownText) {
              this.knownText = text;
              this.editor.set_value(text);
            }
            this.notes = Array.isArray(got?.notes) ? got.notes : [];
          }
        }
      } finally {
        this.busy = false;
        cx.notify();
      }
    });
  }

  show(tab, cx) {
    this.tab = tab;
    keep("tab", tab);
    this.reload(cx);
    cx.notify();
  }

  act(args, cx, done) {
    cx.spawn(async (cx) => {
      const r = await bh(args, { cwd: this.dir ?? projectDir() });
      this.problem = r.code === 0 ? null : (r.stderr || r.stdout).trim().split("\n")[0];
      done?.(r);
      this.reload(cx);
      cx.notify();
    });
  }

  sendComment(cx) {
    const text = this.comment.value().trim();
    const plan = this.plan;
    if (!text || !plan) return;
    this.comment.set_value("");
    this.act(["plan", "comment", plan.id, "--data", enc(text)], cx, (r) => {
      if (r.code === 0) sendFromChat(`The person commented on plan ${plan.id} ("${plan.title}"): ${text}\n\nRevise the draft (bh plan show ${plan.id}) or say why it needs no change.`);
    });
  }

  /** Starts a comment on a plan's line or a task's step (or closes it, clicked again). */
  startInline(kind, id, at, cx) {
    const same = this.commenting && this.commenting.kind === kind && this.commenting.id === id && this.commenting.at === at;
    this.commenting = same ? null : { kind, id, at };
    this.inline.set_value("");
    if (!same) this.inline.focus();
    cx.notify();
  }

  sendInline(cx) {
    const text = this.inline.value().trim();
    const where = this.commenting;
    if (!text || !where) return;
    this.inline.set_value("");
    this.commenting = null;
    if (where.kind === "plan") {
      const plan = this.plan;
      if (!plan) return;
      const quote = String(plan.markdown ?? "").split("\n")[where.at - 1]?.trim() ?? "";
      this.act(["plan", "comment", plan.id, "--line", String(where.at), "--data", enc(text)], cx, (r) => {
        if (r.code === 0) sendFromChat(`The person commented on line ${where.at} of plan ${plan.id} ("${plan.title}")${quote ? `, which reads "${quote.slice(0, 160)}"` : ""}: ${text}\n\nRevise the draft (bh plan show ${plan.id}) or say why it needs no change.`);
      });
      return;
    }
    const task = (this.tasks ?? []).find((t) => t.id === where.id);
    const step = task?.steps?.find((x) => x.n === where.at);
    this.act(["task", "comment", where.id, "--step", String(where.at), "--data", enc(text)], cx, (r) => {
      if (r.code === 0) sendFromChat(`The person commented on step ${where.at}${step ? ` ("${step.title}")` : ""} of task ${where.id}: ${text}\n\nTake it into account (bh task show ${where.id}) or say why it needs no change.`);
    });
  }

  sendTaskComment(cx) {
    const text = this.taskComment.value().trim();
    const id = this.opened;
    if (!text || !id) return;
    this.taskComment.set_value("");
    this.act(["task", "comment", id, "--data", enc(text)], cx, (r) => {
      if (r.code === 0) sendFromChat(`The person commented on task ${id}: ${text}\n\nTake it into account (bh task show ${id}) or say why it needs no change.`);
    });
  }

  pickAgent(agent, cx) {
    if (this.knownText !== null && this.editor.value() !== this.knownText) {
      this.problem = "Save or undo your edit first.";
      return cx.notify();
    }
    this.agent = agent;
    keep("agent", agent);
    this.knownText = null;
    this.reload(cx);
  }

  saveKnowledge(cx) {
    const text = this.editor.value();
    const agent = this.agent ?? "orchestrator";
    this.act(["knowledge", "write", agent, "--data", enc(text)], cx, (r) => {
      if (r.code === 0) this.knownText = text;
    });
  }

  // ── Drawing ────────────────────────────────────────────────────────────────────────────────

  render() {
    const c = settings().dark ? DARK : LIGHT;
    const content = Math.max(320, Math.min(MAX, this.width - SIZE.gutter * 2));
    const body = this.tab === "plans" ? this.plansView(c, content) : this.tab === "knowledge" ? this.knowledgeView(c, content) : this.tasksView(c, content);
    return div()
      .id("bh-work")
      .relative()
      .size_full()
      .bg(c.ground)
      .text_color(c.ink)
      .on_size_change((size, cx) => {
        this.width = size.width;
        this.height = size.height;
        cx.notify();
      })
      .child(
        v_flex()
          .id("bh-work-scroll")
          .absolute()
          .inset_0()
          .overflow_y_scroll()
          .items_center()
          .child(
            v_flex()
              .flex_none()
              .w(content)
              .py(20)
              .gap(GAP)
              .child(
                h_flex()
                  .gap(12)
                  .items_center()
                  .child(this.fixed ? div().text_size(19).font_semibold().child(TABS.find((t) => t.id === this.fixed).label) : this.tabs(c))
                  .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(c.faint).child(this.dir ?? ""))
                  .child(this.iconButton(c, "bh-work-refresh", "refresh-cw", (_e, cx) => this.reload(cx))),
              )
              .when(Boolean(this.problem), (el) => el.child(div().text_size(12.5).text_color(c.danger).child(this.problem)))
              .child(body),
          ),
      );
  }

  tabs(c) {
    return h_flex()
      .h(30)
      .p(2)
      .gap(2)
      .items_center()
      .rounded(SIZE.control)
      .bg(c.well)
      .children(TABS.map((t) =>
        div()
          .id(`bh-work-tab-${t.id}`)
          .h(26)
          .px(11)
          .flex()
          .items_center()
          .rounded(SIZE.nested)
          .text_size(12.5)
          .font_medium()
          .cursor_pointer()
          .when(t.id === this.tab, (el) => el.bg(c.fill).text_color(c.ink).shadow_sm())
          .when(t.id !== this.tab, (el) => el.text_color(c.muted).hover((s) => s.text_color(c.ink)))
          .on_click((_e, cx) => this.show(t.id, cx))
          .child(t.label)));
  }

  empty(c, title, about) {
    return v_flex()
      .py(48)
      .items_center()
      .gap(6)
      .child(div().text_size(16).font_semibold().child(title))
      .child(div().max_w(460).text_size(13).text_color(c.muted).child(about));
  }

  // Tasks

  tasksView(c, width) {
    if (this.tasks === null) return this.empty(c, "Loading…", "");
    if (!this.tasks.length) return this.empty(c, "No tasks yet", "Ask the Orchestrator for something sizeable, or type /task in the chat. Its steps, who works on each and for how long show up here.");
    const archived = this.tasks.filter((t) => t.archived);
    const current = this.tasks.filter((t) => !t.archived);
    const list = this.archived ? archived : current;
    if (!list.some((t) => t.id === this.opened)) this.opened = (list.find((t) => t.status === "active") ?? list[0])?.id ?? null;
    const open = list.find((t) => t.id === this.opened) ?? null;
    const paneH = Math.max(320, this.height - 96);
    const groups = this.archived ? [{ id: "archived", label: "Archived", rows: list }] : SECTIONS.map((sec) => ({ ...sec, rows: list.filter((t) => sec.has.includes(t.status ?? "backlog")) })).filter((g) => g.rows.length);
    return h_flex()
      .h(paneH)
      .items_start()
      .child(
        v_flex()
          .flex_none()
          .w(LIST_W)
          .h(paneH)
          .gap(10)
          .pr(14)
          .child(this.segmented(c, [
            { id: "tasks", label: "Tasks", count: current.length, on: !this.archived },
            { id: "archived", label: "Archived", count: archived.length, on: this.archived },
          ], (id, cx) => {
            this.archived = id === "archived";
            this.opened = null;
            cx.notify();
          }))
          .child(
            v_flex()
              .id("bh-task-list")
              .flex_1()
              .min_h(0)
              .overflow_y_scroll()
              .gap(2)
              .when(!list.length, (el) => el.child(div().pt(12).text_size(12.5).text_color(c.muted).child(this.archived ? "Nothing archived. Archive a finished task from its detail to keep this list short." : "Every task is archived.")))
              .children(groups.flatMap((g) => [
                ...(groups.length > 1 || this.archived ? [h_flex().flex_none().h(26).pt(6).px(10).gap(6).items_center()
                  .child(div().text_size(11.5).font_semibold().text_color(c.muted).child(g.label.toUpperCase()))
                  .child(div().text_size(11.5).text_color(c.faint).child(String(g.rows.length)))] : []),
                ...g.rows.map((t) => this.taskRow(c, t)),
              ])),
          ),
      )
      .child(div().flex_none().w(1).h(paneH).bg(c.edge))
      .child(
        v_flex()
          .id("bh-task-detail")
          .flex_1()
          .min_w(0)
          .h(paneH)
          .overflow_y_scroll()
          .pl(22)
          .child(open
            ? this.taskDetail(c, open, width - LIST_W - 37)
            : v_flex().pt(60).items_center().gap(6).child(div().text_size(13).text_color(c.muted).child("Choose a task to see its steps, progress and comments."))),
      );
  }

  /** A row of the list: its mark, the title and its age; under them the facts and the steps' pips. */
  taskRow(c, t) {
    const steps = t.steps ?? [];
    const done = steps.filter((s) => s.status === "done" || s.status === "skipped").length;
    const on = this.opened === t.id;
    const finished = t.status === "done" || t.status === "abandoned";
    const blocked = steps.some((s) => s.status === "blocked");
    const facts = finished
      ? `${t.status === "done" ? "done" : "abandoned"} · worked ${duration(workedOf(t))}`
      : [blocked ? "blocked" : t.status, t.track ? `${t.track} track` : "", t.git?.branch ? t.git.branch : ""].filter(Boolean).join(" · ");
    return v_flex()
      .id(`bh-task-${t.id}`)
      .flex_none()
      .px(10)
      .py(8)
      .gap(3)
      .rounded(SIZE.control)
      .border_1()
      .border_color(on ? c.edge : "#00000000")
      .when(on, (el) => el.bg(c.fill))
      .when(!on, (el) => el.hover((s) => s.bg(c.hover)))
      .cursor_pointer()
      .on_click((_e, cx) => {
        this.opened = t.id;
        this.commenting = null;
        cx.notify();
      })
      .child(
        h_flex()
          .gap(10)
          .items_center()
          .child(this.mark(c, t.status))
          .child(div().flex_1().min_w(0).truncate().text_size(13).font_medium().text_color(t.status === "abandoned" ? c.faint : finished ? c.muted : c.ink).child(t.title ?? t.id))
          .child(div().flex_none().text_size(11.5).text_color(c.faint).child(age(t.updated ?? t.created))),
      )
      .child(
        h_flex()
          .pl(26)
          .gap(8)
          .items_center()
          .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(blocked ? c.warning : c.muted).child(facts))
          .when(steps.length > 0 && !finished, (el) => el
            .child(this.pips(c, steps))
            .child(div().flex_none().text_size(11.5).text_color(c.faint).child(`${done}/${steps.length}`))),
      );
  }

  /** A task's mark: an open ring, a lit ring while agents work, a filled tick when done. */
  mark(c, status) {
    const box = div().flex_none().size(16).flex().items_center().justify_center().rounded_full();
    if (status === "done") return box.bg(c.accent).child(svg(ICON("check")).size(10).text_color(c.accentInk));
    if (status === "abandoned") return box.border_1().border_color(c.faint).child(div().w(7).h(1.5).rounded(1).bg(c.faint));
    if (status === "active") return box.border_1().border_color(c.accent).child(div().size(6).rounded_full().bg(c.accent).loop("opacity", { from: 0.35, to: 1, period: 1600 }));
    return box.border_1().border_color(c.faint);
  }

  /** A pip per step: done ones lit, the running one half lit. */
  pips(c, steps) {
    const shown = steps.slice(0, 12);
    return h_flex().flex_none().gap(2).items_center().children(shown.map((s) =>
      div().flex_none().w(6).h(6).rounded(2).bg(s.status === "done" || s.status === "skipped" ? c.accent : s.status === "active" ? `${c.accent}80` : s.status === "blocked" ? c.warning : c.edge)));
  }

  taskDetail(c, t, width) {
    const glyph = { todo: "○", active: "◐", done: "✓", blocked: "!", skipped: "–" };
    const colour = (s) => (s === "active" ? c.accent : s === "blocked" ? c.warning : s === "done" ? c.ink : c.faint);
    const steps = t.steps ?? [];
    const comments = (t.comments ?? []).filter((x) => x.open !== false);
    const finished = t.status === "done" || t.status === "abandoned";
    const facts = [t.status, t.track ? `${t.track} track` : "", `worked ${duration(workedOf(t))}`, `started ${day(t.created)}`].filter(Boolean).join(" · ");
    return v_flex()
      .w(width)
      .gap(14)
      .pb(24)
      .child(
        h_flex()
          .gap(10)
          .items_start()
          .child(
            v_flex()
              .flex_1()
              .min_w(0)
              .gap(3)
              .child(div().text_size(17).font_semibold().line_height("24px").child(t.title ?? t.id))
              .child(div().text_size(12).text_color(c.muted).child(`${t.id} · ${facts}`)),
          )
          .when(!finished, (el) => el.child(this.button(c, `bh-resume-${t.id}`, "Resume", () => sendFromChat(`Resume task ${t.id}`))))
          .child(this.chip(c, `bh-arch-${t.id}`, t.archived ? "Unarchive" : "Archive", false, (_e, cx) => this.act(["task", t.archived ? "unarchive" : "archive", t.id], cx))),
      )
      .when(Boolean(t.git?.branch), (el) => el.child(
        h_flex().gap(6).items_center().text_size(12).text_color(c.muted)
          .child(svg(ICON("folder")).size(13).text_color(c.faint))
          .child(div().min_w(0).truncate().child(t.git.mode === "worktree" ? `Worktree ${t.git.path} · branch ${t.git.branch}` : `Branch ${t.git.branch}${t.git.from ? ` (from ${t.git.from})` : ""}`)),
      ))
      .when(Boolean(t.request), (el) => el.child(div().text_size(13).line_height("20px").text_color(c.muted).child(String(t.request).slice(0, 600))))
      .child(
        v_flex()
          .gap(2)
          .child(h_flex().h(26).gap(8).items_center()
            .child(div().text_size(12).font_semibold().text_color(c.muted).child("STEPS"))
            .child(div().text_size(11.5).text_color(c.faint).child(steps.length ? "Click a step to comment on it." : "None yet: the Orchestrator adds them.")))
          .children(steps.map((s) => {
            const on = this.commenting?.kind === "task" && this.commenting.id === t.id && this.commenting.at === s.n;
            const notes = comments.filter((x) => x.step === s.n);
            const time = s.workedMs || s.status === "active" ? duration((s.workedMs ?? 0) + (s.status === "active" && s.started ? Date.now() - Date.parse(s.started) : 0)) : "";
            return v_flex()
              .flex_none()
              .child(
                h_flex()
                  .id(`bh-step-${t.id}-${s.n}`)
                  .px(8)
                  .py(6)
                  .gap(10)
                  .items_start()
                  .rounded(SIZE.nested)
                  .cursor_pointer()
                  .when(on, (el) => el.bg(c.hover))
                  .hover((st) => st.bg(c.hover))
                  .on_click((_e, cx) => this.startInline("task", t.id, s.n, cx))
                  .child(div().w(14).flex_none().text_size(13).text_color(colour(s.status)).child(glyph[s.status] ?? "○"))
                  .child(div().flex_1().min_w(0).text_size(13).line_height("19px").child(`${s.n}. ${s.title}`))
                  .child(div().flex_none().text_size(11.5).text_color(c.faint).child([s.agent, time].filter(Boolean).join(" · ")))
                  .when(notes.length > 0, (el) => el.child(h_flex().flex_none().gap(3).items_center().text_size(11.5).text_color(c.accent)
                    .child(svg(ICON("comment")).size(12)).child(String(notes.length)))),
              )
              .children(notes.map((x) => this.commentNote(c, x.text)))
              .when(on, (el) => el.child(this.inlineBox(c)));
          })),
      )
      .when(comments.some((x) => !x.step), (el) => el.child(
        v_flex()
          .gap(6)
          .child(div().text_size(12).font_semibold().text_color(c.muted).child("YOUR COMMENTS"))
          .children(comments.filter((x) => !x.step).map((x) => this.commentNote(c, x.text))),
      ))
      .child(
        h_flex()
          .gap(8)
          .items_center()
          .child(this.inputBox(c, this.taskComment))
          .child(this.button(c, "bh-task-comment", "Comment", (_e, cx) => this.sendTaskComment(cx))),
      );
  }

  /** A comment of yours under what it is about: a quiet line with the accent at its edge. */
  commentNote(c, text) {
    return h_flex()
      .flex_none()
      .ml(32)
      .mr(8)
      .mb(4)
      .gap(8)
      .items_start()
      .child(div().flex_none().w(2).h_full().min_h(18).rounded(1).bg(c.accent))
      .child(div().flex_1().min_w(0).text_size(12.5).line_height("18px").text_color(c.muted).child(text));
  }

  /** The text box for the comment being written under a line or step. */
  inlineBox(c) {
    return h_flex()
      .flex_none()
      .ml(32)
      .mr(8)
      .mt(4)
      .mb(8)
      .gap(8)
      .items_center()
      .child(this.inputBox(c, this.inline))
      .child(this.button(c, "bh-inline-send", "Comment", (_e, cx) => this.sendInline(cx)))
      .child(this.chip(c, "bh-inline-cancel", "Cancel", false, (_e, cx) => {
        this.commenting = null;
        cx.notify();
      }));
  }

  inputBox(c, state) {
    return div()
      .flex_1()
      .min_w(0)
      .h(32)
      .px(10)
      .flex()
      .items_center()
      .rounded(SIZE.control)
      .bg(c.fill)
      .border_1()
      .border_color(c.edge)
      .child(Input.new(state).w_full().h_full().text_size(13).text_color(c.ink));
  }

  /** A row of choices with counts, one lit (Tasks / Archived). */
  segmented(c, items, onPick) {
    return h_flex()
      .flex_none()
      .h(30)
      .p(2)
      .gap(2)
      .items_center()
      .rounded(SIZE.control)
      .bg(c.well)
      .children(items.map((x) =>
        h_flex()
          .id(`bh-seg-${x.id}`)
          .flex_1()
          .h(26)
          .px(10)
          .gap(6)
          .items_center()
          .justify_center()
          .rounded(SIZE.nested)
          .text_size(12.5)
          .font_medium()
          .cursor_pointer()
          .when(x.on, (el) => el.bg(c.fill).text_color(c.ink).shadow_sm())
          .when(!x.on, (el) => el.text_color(c.muted).hover((s) => s.text_color(c.ink)))
          .on_click((_e, cx) => onPick(x.id, cx))
          .child(x.label)
          .child(div().text_size(11.5).text_color(c.faint).child(String(x.count)))));
  }

  // Plans

  plansView(c, width) {
    if (this.plans === null) return this.empty(c, "Loading…", "");
    if (!this.plans.length) return this.empty(c, "No plans yet", "Type /plan and an idea in the chat. The Orchestrator and the panel (Dev, Design, QA, Research) ask what they need, then write the plan here for you to read and comment on.");
    const listW = 260;
    const p = this.plan;
    return h_flex()
      .gap(GAP)
      .items_start()
      .child(
        v_flex()
          .flex_none()
          .w(listW)
          .gap(4)
          .children(this.plans.map((x) =>
            v_flex()
              .id(`bh-plan-${x.id}`)
              .px(10)
              .py(8)
              .gap(2)
              .rounded(SIZE.control)
              .cursor_pointer()
              .when(p?.id === x.id, (el) => el.bg(c.fill).border_1().border_color(c.edge))
              .hover((s) => s.bg(c.hover))
              .on_click((_e, cx) => {
                this.planId = x.id;
                keep("plan", x.id);
                this.reload(cx);
              })
              .child(div().truncate().text_size(13).font_medium().text_color(x.status === "archived" ? c.faint : c.ink).child(x.title ?? x.id))
              .child(div().text_size(11.5).text_color(c.faint).child(`${{ grilling: "Being planned", ready: "Ready", task: "Became a task", archived: "Archived" }[x.status] ?? x.status} · round ${x.round ?? 0} · ${day(x.updated)}`)))),
      )
      .child(p ? this.planDoc(c, p, width - listW - GAP) : div().flex_1());
  }

  planDoc(c, p, width) {
    const open = (p.comments ?? []).filter((x) => x.open !== false);
    return v_flex()
      .flex_none()
      .w(width)
      .p(16)
      .gap(12)
      .rounded(SIZE.radius)
      .bg(c.fill)
      .border_1()
      .border_color(c.edge)
      .child(
        h_flex()
          .gap(8)
          .items_center()
          .child(div().flex_1().min_w(0).text_size(16).font_semibold().child(p.title ?? p.id))
          .when(p.status === "ready" && !p.task, (el) => el.child(this.button(c, "bh-plan-start", "Start task", () => sendFromChat(`The plan ${p.id} ("${p.title}") is agreed: make it a task (bh plan task ${p.id}) and start it.`))))
          .child(this.chip(c, "bh-plan-arch", p.status === "archived" ? "Unarchive" : "Archive", false, (_e, cx) => this.act(["plan", p.status === "archived" ? "unarchive" : "archive", p.id], cx))),
      )
      .when(Boolean(p.markdown), (el) => el.child(div().text_size(11.5).text_color(c.faint).child("Click any line to comment on it.")))
      .child(p.markdown
        ? this.planLines(c, p)
        : div().text_size(13).text_color(c.muted).child("No draft yet: the panel is still asking."))
      .when(open.some((x) => !x.line), (el) => el.child(
        v_flex()
          .gap(6)
          .child(div().text_size(12).font_semibold().text_color(c.muted).child("Your comments on the plan"))
          .children(open.filter((x) => !x.line).map((x) => this.commentNote(c, x.text))),
      ))
      .child(
        h_flex()
          .gap(8)
          .items_center()
          .child(
            div()
              .flex_1()
              .min_w(0)
              .h(32)
              .px(10)
              .flex()
              .items_center()
              .rounded(SIZE.control)
              .bg(c.ground)
              .border_1()
              .border_color(c.edge)
              .child(Input.new(this.comment).w_full().h_full().text_size(13).text_color(c.ink)),
          )
          .child(this.button(c, "bh-plan-comment", "Comment", (_e, cx) => this.sendComment(cx))),
      );
  }

  /** The draft in pieces (a heading, an item, a paragraph…), each one a click away from a comment. */
  planLines(c, p) {
    const parts = blocks(p.markdown);
    const lines = String(p.markdown).split("\n").length;
    return v_flex()
      .gap(1)
      .children(parts.map((b, i) => {
        const next = parts[i + 1]?.line ?? lines + 1;
        const notes = commentsOn(p.comments, b.line, next);
        const on = this.commenting?.kind === "plan" && this.commenting.id === p.id && this.commenting.at === b.line;
        return v_flex()
          .flex_none()
          .child(
            h_flex()
              .id(`bh-plan-b-${p.id}-${b.line}`)
              .px(8)
              .py(2)
              .gap(8)
              .items_start()
              .rounded(SIZE.nested)
              .cursor_pointer()
              .when(on, (el) => el.bg(c.hover))
              .hover((st) => st.bg(c.hover))
              .on_click((_e, cx) => this.startInline("plan", p.id, b.line, cx))
              .child(div().flex_1().min_w(0).text_size(13.5).line_height(`${SIZE.line}px`).child(TextView.markdown(`bh-plan-md-${p.id}-${p.round ?? 0}-${b.line}`, b.text)))
              .when(notes.length > 0, (el) => el.child(h_flex().flex_none().pt(3).gap(3).items_center().text_size(11.5).text_color(c.accent)
                .child(svg(ICON("comment")).size(12)).child(String(notes.length)))),
          )
          .children(notes.map((x) => this.commentNote(c, x.text)))
          .when(on, (el) => el.child(this.inlineBox(c)));
      }));
  }

  // Knowledge

  knowledgeView(c, width) {
    const team = roster(shared(ROSTER_KEY), []).map((a) => (a.role === "custom" ? slug(a.name) : a.role));
    const files = (this.kinds ?? []).map((k) => k.agent);
    const names = [...new Set([...team, ...files])];
    const counts = Object.fromEntries((this.kinds ?? []).map((k) => [k.agent, k]));
    const agent = this.agent ?? "orchestrator";
    const listW = 220;
    const edited = this.knownText !== null && this.editor.value() !== this.knownText;
    const notesH = this.notes.length ? 120 : 0;
    const editH = Math.max(280, this.height - 200 - notesH);
    return h_flex()
      .gap(GAP)
      .items_start()
      .child(
        v_flex()
          .flex_none()
          .w(listW)
          .gap(4)
          .children(names.map((n) =>
            h_flex()
              .id(`bh-know-${n}`)
              .h(32)
              .px(10)
              .gap(8)
              .items_center()
              .rounded(SIZE.control)
              .cursor_pointer()
              .when(n === agent, (el) => el.bg(c.fill).border_1().border_color(c.edge))
              .hover((s) => s.bg(c.hover))
              .on_click((_e, cx) => this.pickAgent(n, cx))
              .child(div().flex_1().min_w(0).truncate().text_size(13).font_medium().child(n.charAt(0).toUpperCase() + n.slice(1)))
              .child(div().text_size(11.5).text_color(counts[n]?.over ? c.danger : c.faint).child(counts[n] ? `${counts[n].entries}` : "—")))),
      )
      .child(
        v_flex()
          .flex_none()
          .w(width - listW - GAP)
          .p(14)
          .gap(10)
          .rounded(SIZE.radius)
          .bg(c.fill)
          .border_1()
          .border_color(c.edge)
          .child(
            h_flex()
              .gap(8)
              .items_center()
              .child(div().flex_1().text_size(13).text_color(c.muted).child("What this agent is told about the project when it starts. The Orchestrator adds what the agents learn; you can edit it."))
              .when(edited, (el) => el
                .child(this.chip(c, "bh-know-undo", "Undo", false, (_e, cx) => {
                  this.editor.set_value(this.knownText ?? "");
                  cx.notify();
                }))
                .child(this.button(c, "bh-know-save", "Save", (_e, cx) => this.saveKnowledge(cx)))),
          )
          .child(
            div()
              .h(editH)
              .p(10)
              .rounded(SIZE.control)
              .bg(c.ground)
              .border_1()
              .border_color(c.edge)
              .child(Textarea.new(this.editor).w_full().h(editH - 20).text_size(13).text_color(c.ink)),
          )
          .when(this.notes.length > 0, (el) => el.child(
            v_flex()
              .id("bh-know-notes")
              .max_h(notesH)
              .overflow_y_scroll()
              .gap(4)
              .child(div().text_size(12).font_semibold().text_color(c.muted).child("Notes"))
              .children(this.notes.map((n) => div().text_size(12).text_color(c.muted).child(`${n.entry}: ${n.note}`))),
          )),
      );
  }

  // Bits

  chip(c, id, label, on, onClick) {
    return div()
      .id(id)
      .flex_none()
      .h(SIZE.chip)
      .px(10)
      .flex()
      .items_center()
      .rounded(SIZE.nested)
      .border_1()
      .text_size(12.5)
      .cursor_pointer()
      .when(on, (el) => el.bg(c.well).border_color(c.accent).text_color(c.ink).font_medium())
      .when(!on, (el) => el.border_color(c.edge).text_color(c.muted).hover((s) => s.bg(c.hover).text_color(c.ink)))
      .on_click(onClick)
      .child(label);
  }

  button(c, id, label, onClick) {
    return div()
      .id(id)
      .flex_none()
      .h(30)
      .px(12)
      .flex()
      .items_center()
      .rounded(SIZE.control)
      .bg(c.accent)
      .border_b(1)
      .border_color(c.accentLip)
      .text_size(12.5)
      .font_medium()
      .text_color(c.accentInk)
      .cursor_pointer()
      .hover((s) => s.opacity(0.92))
      .on_click(onClick)
      .child(label);
  }

  iconButton(c, id, icon, onClick) {
    return div()
      .id(id)
      .size(28)
      .flex_none()
      .flex()
      .items_center()
      .justify_center()
      .rounded(SIZE.nested)
      .text_color(c.muted)
      .cursor_pointer()
      .hover((s) => s.bg(c.hover).text_color(c.ink))
      .on_click(onClick)
      .child(svg(ICON(icon)).size(14));
  }
}
