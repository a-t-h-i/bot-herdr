// The Tasks, Plans and Knowledge pages: the team's work in the project of the space you are
// looking at. One view; the layout gives each page its own block (props.tab).
//   Tasks      a board (Backlog, In progress, Completed); a task opens to its steps, each with
//              who did it and for how long. Resume hands it back to the Orchestrator.
//   Plans      the panel's drafts: read one, comment on it, start it as a task.
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

const TABS = [
  { id: "tasks", label: "Tasks" },
  { id: "plans", label: "Plans" },
  { id: "knowledge", label: "Knowledge" },
];
const COLUMNS = [
  { id: "backlog", label: "Backlog", has: ["backlog", "paused"] },
  { id: "active", label: "In progress", has: ["active"] },
  { id: "done", label: "Completed", has: ["done", "abandoned"] },
];
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
    const list = this.tasks.filter((t) => this.archived || !t.archived);
    if (!this.tasks.length) return this.empty(c, "No tasks yet", "Ask the Orchestrator for something sizeable, or type /task in the chat. Its steps, who works on each and for how long show up here.");
    const colW = Math.floor((width - GAP * 2) / 3);
    return v_flex()
      .gap(GAP)
      .child(
        h_flex()
          .gap(8)
          .items_center()
          .child(div().flex_1().text_size(12.5).text_color(c.muted).child(`${list.length} task${list.length === 1 ? "" : "s"}`))
          .child(this.chip(c, "bh-archived", "Show archived", this.archived, (_e, cx) => {
            this.archived = !this.archived;
            cx.notify();
          })),
      )
      .child(
        h_flex()
          .gap(GAP)
          .items_start()
          .children(COLUMNS.map((col) => {
            const here = list.filter((t) => col.has.includes(t.status ?? "backlog"));
            return v_flex()
              .id(`bh-col-${col.id}`)
              .flex_none()
              .w(colW)
              .gap(8)
              .child(
                h_flex()
                  .h(24)
                  .gap(6)
                  .items_center()
                  .child(div().text_size(12.5).font_semibold().child(col.label))
                  .child(div().text_size(12).text_color(c.faint).child(String(here.length))),
              )
              .children(here.map((t) => this.taskCard(c, t, colW)))
              .when(!here.length, (el) => el.child(div().h(56).rounded(SIZE.radius).border_1().border_color(c.edge).opacity(0.6)));
          })),
      );
  }

  taskCard(c, t, width) {
    const steps = t.steps ?? [];
    const done = steps.filter((s) => s.status === "done" || s.status === "skipped").length;
    const open = this.opened === t.id;
    const share = steps.length ? done / steps.length : 0;
    return v_flex()
      .id(`bh-task-${t.id}`)
      .flex_none()
      .p(12)
      .gap(8)
      .rounded(SIZE.radius)
      .bg(c.fill)
      .border_1()
      .border_color(open ? c.accent : c.edge)
      .cursor_pointer()
      .on_click((_e, cx) => {
        this.opened = open ? null : t.id;
        cx.notify();
      })
      .child(div().text_size(13.5).font_semibold().child(t.title ?? t.id))
      .child(
        h_flex()
          .gap(6)
          .text_size(11.5)
          .text_color(c.muted)
          .child(div().child(steps.length ? `${done}/${steps.length} steps` : "No steps yet"))
          .child(div().child("·"))
          .child(div().child(duration(workedOf(t))))
          .when(Boolean(t.track), (el) => el.child(div().child("·")).child(div().child(t.track)))
          .child(div().flex_1())
          .child(div().text_color(c.faint).child(day(t.created))),
      )
      .when(steps.length > 0, (el) => el.child(
        div().h(3).rounded(2).bg(c.well).child(div().h(3).w(Math.max(0, Math.round((width - 26) * share))).rounded(2).bg(c.accent)),
      ))
      .when(open, (el) => el.child(this.taskDetail(c, t)));
  }

  taskDetail(c, t) {
    const glyph = { todo: "○", active: "◐", done: "✓", blocked: "!", skipped: "–" };
    const colour = (s) => (s === "active" ? c.accent : s === "blocked" ? c.danger : s === "done" ? c.ink : c.faint);
    return v_flex()
      .gap(8)
      .pt(4)
      .child(div().text_size(12.5).text_color(c.muted).child(String(t.request ?? "").slice(0, 400)))
      .children((t.steps ?? []).map((s) =>
        h_flex()
          .gap(8)
          .items_start()
          .text_size(12.5)
          .child(div().w(14).flex_none().text_color(colour(s.status)).child(glyph[s.status] ?? "○"))
          .child(div().flex_1().min_w(0).child(`${s.n}. ${s.title}`))
          .child(div().flex_none().text_size(11.5).text_color(c.faint).child([s.agent, s.workedMs || s.status === "active" ? duration((s.workedMs ?? 0) + (s.status === "active" && s.started ? Date.now() - Date.parse(s.started) : 0)) : ""].filter(Boolean).join(" · ")))))
      .child(
        h_flex()
          .pt(4)
          .gap(8)
          .when(t.status !== "done" && t.status !== "abandoned", (el) => el.child(this.button(c, `bh-resume-${t.id}`, "Resume", (_e, cx) => {
            cx.stop_propagation();
            sendFromChat(`Resume task ${t.id}`);
          })))
          .child(this.chip(c, `bh-arch-${t.id}`, t.archived ? "Unarchive" : "Archive", false, (_e, cx) => {
            cx.stop_propagation();
            this.act(["task", t.archived ? "unarchive" : "archive", t.id], cx);
          })),
      );
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
      .child(p.markdown
        ? div().text_size(13.5).line_height(`${SIZE.line}px`).child(TextView.markdown(`bh-plan-md-${p.id}-${p.round ?? 0}`, p.markdown).selectable(true))
        : div().text_size(13).text_color(c.muted).child("No draft yet: the panel is still asking."))
      .when(open.length > 0, (el) => el.child(
        v_flex()
          .gap(6)
          .child(div().text_size(12).font_semibold().text_color(c.muted).child("Your open comments"))
          .children(open.map((x) => div().text_size(12.5).text_color(c.muted).child(`${x.line ? `Line ${x.line}: ` : ""}${x.text}`))),
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
