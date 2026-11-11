// The Tasks, Plans and Knowledge pages: the team's work in the project of the space you are
// looking at. One view; the layout gives each page its own block (props.tab).
//   Tasks      a list (under way, then finished; or the archived ones) beside the chosen task:
//              its steps, each with who did it and for how long, and your comments on any step.
//              Resume hands it back to the Orchestrator.
//   Plans      the panel's drafts: read one, comment on any line of it, start it as a task.
//   Knowledge  what each agent knows about the project, drawn by section; a note on any entry
//              goes with it into the agent's brief; Edit opens the file itself.
// Everything comes from the bh tool (tasks, plans and knowledge live in the project's
// .bot-herdr folder); messages for the team go through the chat's composer.

import { div, svg } from "gpui-kit";
import { v_flex, h_flex, TextView, InputState, Input } from "gpui-base";
import { settings, shared } from "herdr";
import { SIZE, ICON, TYPE, LINE, SPACE, ROW, CHIP, CONTROL, MARK, DOT, PIP, HAIR, GLYPH, MOTION, mix, agentHue, agentInk, agentInkOn, isLight, clickable, pressable, focusable } from "./look.js";
import { segmented, stateView } from "./switch.js";
import { commentRow, openFirst, openPlan } from "./plandoc.js";
import { colors } from "./theme.js";
import { activePage, sendFromChat, OPEN_TASK } from "./pages.js";
import { ROSTER_KEY, roster, slug } from "./roster.js";
import { bh, bhJson, enc, projectDir } from "./bh.js";
import { outline, notesOn } from "./doc.js";
import { hash } from "./feed.js";
import { alpha } from "./working.js";
import { MarkdownEditor } from "./mdedit.js";
import { Composer } from "./composer.js";

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
    this.editing = false; // the knowledge file open as text, to rewrite it
    this.confirmDelete = null; // "agent:line" of the record whose Delete asks first
    this.notes = [];
    this.busy = false;
    this.problem = null;
    this.descOpen = new Set();
    this.comment = InputState.new({ placeholder: "Comment on this plan; the Orchestrator revises it" });
    this.idea = InputState.new({ placeholder: "What should the team plan?" });
    this.idea.on("submit", (_e, cx) => this.startPlan(cx));
    this.showPrevious = false; // the Plans page's list of plans, from the rail
    this.pageKey = null; // the page/tab drawn last: rows stagger when it changes
    this.rowsIn = true; // false for the one frame a freshly opened list is still hidden
    this.comment.on("submit", (_e, cx) => this.sendComment(cx));
    // A comment on one line of a plan, or one step of a task: { kind: "plan" | "task", id, at }.
    this.commenting = null;
    this.inline = InputState.new({ placeholder: "Your comment. Enter sends it to the Orchestrator" });
    this.inline.on("submit", (_e, cx) => this.sendInline(cx));
    this.taskComment = InputState.new({ placeholder: "Comment on this task; the Orchestrator takes it up" });
    this.taskComment.on("submit", (_e, cx) => this.sendTaskComment(cx));
    this.editor = new MarkdownEditor({ value: "", placeholder: "The file itself, as Markdown" });
    this.editor.on("change", (_value, cx) => cx.notify());
    this.knowSearch = InputState.new({ placeholder: "Search notes" });
    this.knowSearch.on("change", (_e, cx) => cx.notify());
    this.knowFilter = new Set();
    this.planComposer = new Composer({});
    this.planComposer.init(given, cx);
    const self = this;
    this.planComposer.send = (cx) => {
      if (self.planComposer.sending) return;
      const text = self.planComposer.input.value().trim();
      const plan = self.plan;
      if (!text || !plan) return;
      self.planComposer.files = [];
      self.planComposer.input.set_value("");
      self.planComposer.text = "";
      self.planComposer.pane = null;
      cx.notify();
      self.act(["plan", "comment", plan.id, "--data", enc(text)], cx, (r) => {
        if (r.code === 0) sendFromChat(`The person commented on plan ${plan.id} ("${plan.title}"): ${text}\n\nRevise the draft (bh plan show ${plan.id}) or say why it needs no change.`);
      });
    };
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
          const id = this.planId === "__new" ? null : this.planId ?? this.plans.find((p) => p.status !== "archived")?.id ?? null;
          this.plan = id ? await bhJson(["plan", "show", id], { cwd: dir }) : null;
        }
        if (this.tab === "knowledge") {
          const kinds = (await bhJson(["knowledge", "list"], { cwd: dir })) ?? [];
          this.kinds = kinds;
          const team = roster(shared(ROSTER_KEY), []).map((a) => (a.role === "custom" ? slug(a.name) : a.role));
          const names = [...new Set([...team, ...kinds.map((k) => k.agent)])];
          const all = await Promise.all(names.map(async (agent) => {
            const got = await bhJson(["knowledge", agent], { cwd: dir });
            return { agent, text: got?.text ?? "", notes: Array.isArray(got?.notes) ? got.notes : [] };
          }));
          this.knowAll = all;
          const agent = this.agent ?? all[0]?.agent ?? "orchestrator";
          this.agent = agent;
          const cur = all.find((x) => x.agent === agent) ?? { agent, text: "", notes: [] };
          if (this.knownText === null || this.editor.value() === this.knownText) {
            if (cur.text !== this.knownText) {
              this.knownText = cur.text;
              this.editor.set_value(cur.text);
            }
            this.notes = cur.notes;
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
    const same = this.commenting && !this.commenting.edit && this.commenting.kind === kind && this.commenting.id === id && this.commenting.at === at;
    this.commenting = same ? null : { kind, id, at };
    this.inline.set_value("");
    if (!same) this.inline.focus();
    cx.notify();
  }

  /** Edit: the comment's text goes into the inline box under it; sending changes it. */
  editInline(kind, id, at, cid, text, cx) {
    this.commenting = { kind, id, at, edit: cid };
    this.inline.set_value(text);
    this.inline.focus();
    cx.notify();
  }

  /** The add box under a line, step or entry: not while one of its comments is being edited. */
  addingAt(kind, id, at) {
    const w = this.commenting;
    return Boolean(w && !w.edit && w.kind === kind && w.id === id && w.at === at);
  }

  /** Resolve, reopen, edit and delete for a task's or a plan's comment (`kind` "task" or "plan"). */
  commentActions(kind, id, x) {
    const w = this.commenting;
    return {
      key: `bh-${kind}-c-${id}-${x.id}`,
      editing: Boolean(w && w.kind === kind && w.id === id && w.edit === x.id),
      resolve: (cx) => this.act([kind, "resolve", id, "--comment", x.id], cx),
      reopen: (cx) => this.act([kind, "comment", id, "--edit", x.id, "--data", enc(x.text)], cx),
      edit: (cx) => this.editInline(kind, id, x.step ?? x.line ?? null, x.id, x.text, cx),
      delete: (cx) => this.act([kind, "comment", id, "--delete", x.id], cx),
    };
  }

  sendInline(cx) {
    const text = this.inline.value().trim();
    const where = this.commenting;
    if (!text || !where) return;
    this.inline.set_value("");
    this.commenting = null;
    if (where.edit && where.kind !== "knowledge") return this.act([where.kind, "comment", where.id, "--edit", where.edit, "--data", enc(text)], cx);
    if (where.kind === "plan") {
      const plan = this.plan;
      if (!plan) return;
      const quote = String(plan.markdown ?? "").split("\n")[where.at - 1]?.trim() ?? "";
      this.act(["plan", "comment", plan.id, "--line", String(where.at), "--data", enc(text)], cx, (r) => {
        if (r.code === 0) sendFromChat(`The person commented on line ${where.at} of plan ${plan.id} ("${plan.title}")${quote ? `, which reads "${quote.slice(0, 160)}"` : ""}: ${text}\n\nRevise the draft (bh plan show ${plan.id}) or say why it needs no change.`);
      });
      return;
    }
    if (where.kind === "knowledge") {
      const entry = outline(this.knownText ?? "").sections.flatMap((x) => x.entries).find((e) => e.line === where.at);
      if (!entry) return;
      const who = where.id.charAt(0).toUpperCase() + where.id.slice(1);
      if (where.edit) return this.editNote(where.id, who, entry, where.edit, text, cx);
      this.act(["knowledge", "note", where.id, entry.key, "--data", enc(text)], cx, (r) => {
        if (r.code === 0) sendFromChat(`The person left a note on ${who}'s knowledge entry "${entry.key.slice(0, 200)}": ${text}\n\nThe note now goes with that entry into ${who}'s brief. If the entry itself is wrong or out of date, correct it (bh knowledge ${where.id}, then bh knowledge write ${where.id} --file <file>); otherwise say it needs no change.`);
      });
      return;
    }
    const task = (this.tasks ?? []).find((t) => t.id === where.id);
    const step = task?.steps?.find((x) => x.n === where.at);
    this.act(["task", "comment", where.id, "--step", String(where.at), "--data", enc(text)], cx, (r) => {
      if (r.code === 0) sendFromChat(`The person commented on step ${where.at}${step ? ` ("${step.title}")` : ""} of task ${where.id}: ${text}\n\nTake it into account (bh task show ${where.id}) or say why it needs no change.`);
    });
  }

  /** A knowledge note edited: taken back, then kept again with the new text; the Orchestrator hears of it. */
  editNote(agent, who, entry, at, text, cx) {
    this.act(["knowledge", "unnote", agent, "--at", at], cx, (r) => {
      if (r.code !== 0) return;
      this.act(["knowledge", "note", agent, entry.key, "--data", enc(text)], cx, (r2) => {
        if (r2.code === 0) sendFromChat(`The person commented on ${who}'s knowledge entry "${entry.key.slice(0, 200)}": ${text}\n\nTake it into account or say why it needs no change.`);
      });
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
    this.editing = false;
    this.commenting = null;
    this.knownText = null;
    this.reload(cx);
  }

  /** Deletes one knowledge record: the file is written without it (the version before is archived). */
  deleteEntry(agent, e, cx) {
    this.confirmDelete = null;
    const cur = (this.knowAll ?? []).find((x) => x.agent === agent);
    const base = cur?.text ?? (this.agent === agent ? this.knownText : "") ?? "";
    const notes = cur?.notes ?? (this.agent === agent ? this.notes : []) ?? [];
    const lines = String(base).split("\n");
    const from = e.line - 1;
    const count = e.text.split("\n").length;
    if (lines.slice(from, from + count).join("\n") !== e.text) {
      this.problem = "The file changed; try again.";
      this.reload(cx);
      return;
    }
    lines.splice(from, count);
    const text = lines.join("\n").replace(/\n{3,}/g, "\n\n");
    for (const n of notesOn(notes, e.text)) this.act(["knowledge", "unnote", agent, "--at", n.at], cx);
    this.act(["knowledge", "write", agent, "--data", enc(text)], cx, (r) => {
      if (r.code === 0) {
        if (cur) cur.text = text;
        if (this.agent === agent) {
          this.knownText = text;
          this.editor.set_value(text);
        }
      }
    });
    cx.notify();
  }

  saveKnowledge(cx) {
    const text = this.editor.value();
    const agent = this.agent ?? "orchestrator";
    this.act(["knowledge", "write", agent, "--data", enc(text)], cx, (r) => {
      if (r.code === 0) {
        this.knownText = text;
        this.editing = false;
      }
    });
  }

  // ── Drawing ────────────────────────────────────────────────────────────────────────────────

  render(cx) {
    this.cx = cx;
    const want = shared(OPEN_TASK);
    if (want?.at > (this.openAt ?? 0)) {
      this.openAt = want.at;
      this.opened = want.id;
      this.archived = false;
    }
    const c = colors();
    const content = Math.max(320, Math.min(MAX, this.width - SIZE.gutter * 2));
    // A page or tab opening draws its rows from hidden, then staggers them in; re-renders do not.
    const pageKey = `${this.tab}:${this.archived}`;
    if (pageKey !== this.pageKey) {
      this.pageKey = pageKey;
      this.rowsIn = false;
      cx.timer.after(16, (cx) => {
        this.rowsIn = true;
        cx.notify();
      });
    }
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
              .py(SPACE[5])
              .gap(GAP)
              .child(
                h_flex()
                  .gap(SPACE[4])
                  .items_center()
                  .child(this.fixed ? div().text_size(TYPE.xl).font_semibold().child(TABS.find((t) => t.id === this.fixed).label) : this.tabs(c))
                  .child(div().flex_1().min_w(0).truncate().text_size(TYPE.sm).text_color(c.faint).child(this.dir ?? ""))
                  .child(this.iconButton(c, "bh-work-refresh", "refresh-cw", (_e, cx) => this.reload(cx))),
              )
              .when(Boolean(this.problem), (el) => el.child(stateView(c, {
                id: "bh-work-error",
                title: "Couldn't load this page",
                line: this.problem,
                action: { label: "Try again", on: (_e, cx) => this.reload(cx) },
              })))
              .child(body),
          ),
      );
  }

  tabs(c) {
    return segmented(c, {
      id: "bh-work-tabs",
      items: TABS.map((t) => ({ id: t.id, label: t.label, on: t.id === this.tab })),
      onPick: (id, cx) => this.show(id, cx),
    });
  }

  empty(c, title, about) {
    return stateView(c, { id: "bh-work-state", title, line: about });
  }

  // Tasks

  tasksView(c, width) {
    if (this.tasks === null) return stateView(c, { id: "bh-tasks-loading", title: "Loading tasks…", loading: true });
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
          .gap(SPACE[3])
          .pr(SPACE[4])
          .child(segmented(c, {
            id: "bh-task-filter",
            items: [
              { id: "tasks", label: "Tasks", count: current.length, on: !this.archived, grow: true },
              { id: "archived", label: "Archived", count: archived.length, on: this.archived, grow: true },
            ],
            onPick: (id, cx) => {
              this.archived = id === "archived";
              this.opened = null;
              cx.notify();
            },
          }))
          .child(
            v_flex()
              .id("bh-task-list")
              .flex_1()
              .min_h(0)
              .overflow_y_scroll()
              .gap(SPACE[1])
              .when(!list.length, (el) => el.child(div().pt(SPACE[4]).text_size(TYPE.sm).text_color(c.muted).child(this.archived ? "Nothing archived. Archive a finished task from its detail to keep this list short." : "Every task is archived.")))
              .children(groups.flatMap((g) => [
                ...(groups.length > 1 || this.archived ? [h_flex().flex_none().h(CONTROL).pt(SPACE[3]).px(SPACE[3]).gap(SPACE[3]).items_center()
                  .child(div().text_size(TYPE.xs).font_semibold().text_color(c.muted).child(g.label.toUpperCase()))
                  .child(div().text_size(TYPE.xs).text_color(c.faint).child(String(g.rows.length)))] : []),
                ...g.rows.map((t, i) => this.taskRow(c, t, i)),
              ])),
          ),
      )
      .child(div().flex_none().w(HAIR).h(paneH).bg(c.edge))
      .child(
        v_flex()
          .id("bh-task-detail")
          .flex_1()
          .min_w(0)
          .h(paneH)
          .overflow_y_scroll()
          .pl(SPACE[4])
          .child(open
            ? this.taskDetail(c, open, width - LIST_W - 37)
            : v_flex().pt(SPACE[5]).items_center().gap(SPACE[3]).child(div().text_size(TYPE.md).text_color(c.muted).child("Choose a task to see its steps, progress and comments."))),
      );
  }

  /** A row of the list: its mark, the title and its age; under them the facts and the steps' pips. */
  taskRow(c, t, i = 0) {
    const steps = t.steps ?? [];
    const done = steps.filter((s) => s.status === "done" || s.status === "skipped").length;
    const on = this.opened === t.id;
    const finished = t.status === "done" || t.status === "abandoned";
    const blocked = steps.some((s) => s.status === "blocked");
    const facts = finished
      ? `${t.status === "done" ? "done" : "abandoned"} · worked ${duration(workedOf(t))}`
      : [blocked ? "blocked" : t.status, t.track ? `${t.track} track` : "", t.git?.branch ? t.git.branch : ""].filter(Boolean).join(" · ");
    return clickable(
      v_flex()
        .flex_none()
        .px(SPACE[3])
        .py(SPACE[3])
        .gap(SPACE[1])
        .rounded(SIZE.control)
        .border_1()
        .border_color(on ? c.edge : "#00000000")
        .when(on, (el) => el.bg(c.fill))
        .opacity(this.rowsIn === false ? 0 : 1)
        .transition("opacity", { ...MOTION.row, delay: Math.min(i, 8) * MOTION.stagger })
        .on_click((_e, cx) => {
          this.opened = t.id;
          this.commenting = null;
          cx.notify();
        })
        .child(
          h_flex()
            .gap(SPACE[3])
            .items_center()
            .child(this.mark(c, t.status, { pulse: false }))
            .child(div().flex_1().min_w(0).truncate().text_size(TYPE.md).font_medium().text_color(t.status === "abandoned" ? c.faint : finished ? c.muted : c.ink).child(t.title ?? t.id))
            .child(div().flex_none().text_size(TYPE.xs).text_color(c.faint).child(age(t.updated ?? t.created))),
        )
        .child(
          h_flex()
            .pl(SPACE[4])
            .gap(SPACE[3])
            .items_center()
            .child(div().flex_1().min_w(0).truncate().text_size(TYPE.sm).text_color(blocked ? c.warning : c.muted).child(facts))
            .when(steps.length > 0 && !finished, (el) => el
              .child(this.pips(c, steps))
              .child(div().flex_none().text_size(TYPE.xs).text_color(c.faint).child(`${done}/${steps.length}`))),
        ),
      c,
      `bh-task-${t.id}`,
    );
  }

  /** A task's checkbox mark (read-only): done = accent+tick, active = pulsing inner, blocked/paused = amber !. */
  mark(c, status, { pulse = false, small = false } = {}) {
    const size = small ? MARK : GLYPH.lg;
    const box = div().flex_none().size(size).flex().items_center().justify_center().rounded(PIP);
    if (status === "done") return box.bg(c.accent).child(svg(ICON("check")).size(GLYPH.xs).text_color(c.accentInk));
    if (status === "abandoned" || status === "skipped") return box.border_1().border_color(c.faint).child(div().w(size - SPACE[3]).h(HAIR).rounded(PIP).bg(c.faint));
    if (status === "blocked" || status === "paused") return box.border_1().border_color(c.warning).child(div().text_size(TYPE.xs).font_bold().line_height(`${size}px`).text_color(c.warning).child("!"));
    if (status === "active" || status === "now") {
      const inner = div().size(small ? DOT : SPACE[3]).rounded(PIP).bg(c.accent);
      return box.border_1().border_color(c.accent).child(pulse ? inner.opacity(0.45).loop("opacity", { from: 0.25, to: 0.9, period: 1600, easing: "ease-in-out" }) : inner.opacity(0.55));
    }
    return box.border_1().border_color(c.faint);
  }

  /** A pip per step: done ones lit, the running one half lit. */
  pips(c, steps) {
    const shown = steps.slice(0, 12);
    return h_flex().flex_none().gap(SPACE[1]).items_center().children(shown.map((s) =>
      div().flex_none().w(DOT).h(DOT).rounded(PIP).bg(s.status === "done" || s.status === "skipped" ? c.accent : s.status === "active" ? alpha(c.accent, 0.5) : s.status === "blocked" ? c.warning : c.edge)));
  }

  taskDetail(c, t, width) {
    const steps = t.steps ?? [];
    const comments = openFirst(t.comments);
    const finished = t.status === "done" || t.status === "abandoned";
    const facts = [t.status, t.track ? `${t.track} track` : "", `worked ${duration(workedOf(t))}`, `started ${day(t.created)}`].filter(Boolean).join(" · ");
    const reqKey = `task-desc:${t.id}`;
    const req = String(t.request ?? "");
    const reqOpen = this.descOpen?.has(reqKey);
    const reqLong = req.length > 220 || req.split("\n").length > 4;
    const reqText = reqLong && !reqOpen ? req.slice(0, 200).replace(/\s+\S*$/, "") + "…" : req;
    return v_flex()
      .w(width)
      .gap(SPACE[4])
      .pb(SPACE[4])
      .child(
        h_flex()
          .gap(SPACE[3])
          .items_start()
          .child(
            v_flex()
              .flex_1()
              .min_w(0)
              .gap(SPACE[1])
              .child(div().text_size(TYPE.lg).font_semibold().line_height(`${LINE.lg}px`).child(t.title ?? t.id))
              .child(div().text_size(TYPE.sm).text_color(c.muted).child(`${t.id} · ${facts}`)),
          )
          .when(t.status === "paused", (el) => el.child(this.button(c, `bh-resume-${t.id}`, "Resume", () => sendFromChat(`Resume task ${t.id}`))))
          .when(t.status === "active", (el) => el.child(this.button(c, `bh-pause-${t.id}`, "Pause", (_e, cx) => this.act(["task", "status", t.id, "paused"], cx))))
          .when(!finished && t.status !== "active" && t.status !== "paused", (el) => el.child(this.button(c, `bh-resume-${t.id}`, "Resume", () => sendFromChat(`Resume task ${t.id}`))))
          .child(this.chip(c, `bh-arch-${t.id}`, t.archived ? "Unarchive" : "Archive", false, (_e, cx) => this.act(["task", t.archived ? "unarchive" : "archive", t.id], cx))),
      )
      .when(Boolean(t.git?.branch), (el) => el.child(
        h_flex().gap(SPACE[3]).items_center().text_size(TYPE.sm).text_color(c.muted)
          .child(svg(ICON("folder")).size(GLYPH.md).text_color(c.faint))
          .child(div().min_w(0).truncate().child(t.git.mode === "worktree" ? `Worktree ${t.git.path} · branch ${t.git.branch}` : `Branch ${t.git.branch}${t.git.from ? ` (from ${t.git.from})` : ""}`)),
      ))
      .when(Boolean(req), (el) => el.child(v_flex().gap(SPACE[2])
        .child(div().text_size(TYPE.md).line_height(`${LINE.md}px`).child(TextView.markdown(`bh-task-req-${t.id}-${reqOpen ? "o" : "c"}`, reqText)))
        .when(reqLong, (x) => x.child(focusable(
          pressable(
            div()
              .text_size(TYPE.sm)
              .font_medium()
              .text_color(c.accent)
              .hover((s) => s.opacity(0.85))
              .on_click((_e, cx) => {
                if (!this.descOpen) this.descOpen = new Set();
                if (reqOpen) this.descOpen.delete(reqKey); else this.descOpen.add(reqKey);
                cx.notify();
              })
              .child(reqOpen ? "Show less" : "Show more"),
          ),
          `bh-task-req-more-${t.id}`,
          c,
        )))))
      .child(
        v_flex()
          .gap(SPACE[1])
          .child(h_flex().h(CONTROL).gap(SPACE[3]).items_center()
            .child(div().text_size(TYPE.sm).font_semibold().text_color(c.muted).child("STEPS"))
            .child(div().text_size(TYPE.xs).text_color(c.faint).child(steps.length ? "Click a step to comment on it." : "None yet: the Orchestrator adds them.")))
          .children(steps.map((s, i) => {
            const on = this.addingAt("task", t.id, s.n);
            const notes = comments.filter((x) => x.step === s.n);
            const live = notes.filter((x) => x.open !== false).length;
            const time = s.workedMs || s.status === "active" ? duration((s.workedMs ?? 0) + (s.status === "active" && s.started ? Date.now() - Date.parse(s.started) : 0)) : "";
            const status = s.status === "active" ? "active" : s.status === "blocked" ? "blocked" : s.status === "done" ? "done" : s.status === "skipped" ? "skipped" : "open";
            return v_flex()
              .flex_none()
              .child(
                clickable(
                  h_flex()
                    .px(SPACE[3])
                    .py(SPACE[3])
                    .gap(SPACE[3])
                    .items_start()
                    .rounded(SIZE.nested)
                    .when(on, (el) => el.bg(c.hover))
                    .opacity(this.rowsIn === false ? 0 : 1)
                    .transition("opacity", { ...MOTION.row, delay: Math.min(i, 8) * MOTION.stagger })
                    .on_click((_e, cx) => this.startInline("task", t.id, s.n, cx))
                    .child(this.mark(c, status, { pulse: s.status === "active", small: true }))
                    .child(v_flex().flex_1().min_w(0)
                      .child(div().text_size(TYPE.md).line_height(`${LINE.md}px`)
                        .text_color(s.status === "done" || s.status === "skipped" ? c.faint : c.ink)
                        .child(`${s.n}. ${s.title}`))
                      // The step under way: a short accent segment travelling along a faint track.
                      .when(s.status === "active", (el) => el.child(div().relative().h(SPACE[1]).mt(SPACE[1]).rounded(PIP).bg(alpha(c.accent, 0.15)).overflow_hidden()
                        .child(div().absolute().top(0).w(SPACE[4]).h(SPACE[1]).rounded(PIP).bg(c.accent).loop("left", { from: -SPACE[4], to: 200, period: 2400, easing: "linear" })))))
                    .child(div().flex_none().text_size(TYPE.xs).text_color(c.faint).child([s.agent, time].filter(Boolean).join(" · ")))
                    .when(live > 0, (el) => el.child(h_flex().flex_none().gap(SPACE[1]).items_center().text_size(TYPE.xs).text_color(c.accent)
                      .child(svg(ICON("comment")).size(GLYPH.sm)).child(String(live)))),
                  c,
                  `bh-step-${t.id}-${s.n}`,
                ),
              )
              .children(notes.map((x) => this.commentNote(c, x, this.commentActions("task", t.id, x))))
              .when(on, (el) => el.child(this.inlineBox(c)));
          })),
      )
      .when(comments.some((x) => !x.step), (el) => el.child(
        v_flex()
          .gap(SPACE[3])
          .child(div().text_size(TYPE.sm).font_semibold().text_color(c.muted).child("YOUR COMMENTS"))
          .children(comments.filter((x) => !x.step).map((x) => this.commentNote(c, x, this.commentActions("task", t.id, x)))),
      ))
      .child(
        h_flex()
          .gap(SPACE[3])
          .items_center()
          .child(this.inputBox(c, this.taskComment))
          .child(this.button(c, "bh-task-comment", "Comment", (_e, cx) => this.sendTaskComment(cx))),
      );
  }

  /**
   * A comment of yours under what it is about, with Resolve, Edit and Delete (Reopen and Delete once
   * resolved); the inline box opens under it while it is being edited.
   */
  commentNote(c, comment, actions) {
    const row = commentRow(c, comment, actions).ml(SPACE[5]).mr(SPACE[3]).mb(SPACE[2]);
    return actions.editing ? v_flex().flex_none().child(row).child(this.inlineBox(c)) : row;
  }

  /** The text box for the comment being written under a line or step. */
  inlineBox(c) {
    return h_flex()
      .flex_none()
      .ml(SPACE[5])
      .mr(SPACE[3])
      .mt(SPACE[2])
      .mb(SPACE[3])
      .gap(SPACE[3])
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
      .h(CONTROL)
      .px(SPACE[3])
      .flex()
      .items_center()
      .rounded(SIZE.control)
      .bg(c.fill)
      .border_1()
      .border_color(c.edge)
      .child(Input.new(state).w_full().h_full().text_size(TYPE.md).text_color(c.ink));
  }

  // Plans

  /**
   * The Plans page, as the planning session: your idea, then the panel's questions with your
   * answers, then the draft to comment on line by line. A rail at the right has the round, the
   * panel's seats (click one to leave it out) and the actions; Previous lists the other plans.
   */
  plansView(c, width) {
    if (this.plans === null) return stateView(c, { id: "bh-plans-loading", title: "Loading plans…", loading: true });
    const p = this.plan;
    if (!this.plans.length || !p) {
      if (!this.plans.length) return this.planIntro(c, width);
      return h_flex().gap(GAP).items_start().child(this.previousList(c, 250, p)).child(this.planIntro(c, width - 250 - GAP));
    }
    const railW = 52;
    const listW = this.showPrevious ? 250 : 0;
    const mainW = Math.min(780, width - railW - GAP - (listW ? listW + GAP : 0));
    return h_flex()
      .gap(GAP)
      .items_start()
      .when(listW > 0, (el) => el.child(this.previousList(c, listW, p)))
      .child(div().flex_1())
      .child(v_flex()
        .id(`bh-plan-main-${p.id}`)
        .flex_none()
        .w(mainW)
        .h(Math.max(300, this.height - 110))
        .gap(SPACE[1])
        .child(v_flex().flex_1().min_h(0).overflow_y_scroll().gap(SPACE[4]).pb(SPACE[4])
          .child(this.planConversation(c, p, mainW)))
        .child(
          v_flex()
            .flex_none()
            .w_full()
            .items_center()
            .when(Boolean(p.markdown), (el) => el.child(this.viewPlanTab(c, p)))
            .child(this.planComposer.render(this.cx || { notify() {}, spawn() {}, timer: { after() {}, every() {} } }, mainW, this.height)),
        ))
      .child(div().flex_1())
      .child(this.planRail(c, p, railW));
  }

  /** The tab on the composer's top edge that opens the plan over everything. */
  viewPlanTab(c, p) {
    return clickable(
      h_flex()
        .flex_none()
        .h(CHIP)
        .px(SPACE[3])
        .gap(SPACE[2])
        .items_center()
        .rounded_t(SIZE.radius)
        .border_1()
        .border_color(c.edge)
        .bg(c.fill)
        .text_size(TYPE.sm)
        .font_medium()
        .text_color(c.muted)
        .hover((s) => s.text_color(c.ink))
        .on_click(() => openPlan(p))
        .child(svg(ICON("file")).size(GLYPH.sm))
        .child("View plan")
        .child(div().size(GLYPH.lg).rounded_full().bg(c.well).flex().items_center().justify_center().child(svg(ICON("expand")).size(GLYPH.xs))),
      c,
      "bh-view-plan",
    );
  }

  /** Before any plan: one line asking what to plan, and a box that starts it. */
  planIntro(c, width) {
    return v_flex()
      .w(width)
      .pt(SPACE[5])
      .items_center()
      .gap(SPACE[3])
      .child(div().text_size(TYPE.lg).font_semibold().child("What are we planning?"))
      .child(div().text_size(TYPE.md).text_color(c.muted).child("Describe it. The Orchestrator and the panel (Dev, Design, QA, Research) ask what they need, then draft the plan here."))
      .child(h_flex().mt(SPACE[3]).w(Math.min(560, width)).gap(SPACE[3]).items_center()
        .child(this.inputBox(c, this.idea))
        .child(this.button(c, "bh-plan-go", "Plan it", (_e, cx) => this.startPlan(cx))));
  }

  startPlan(cx) {
    const idea = this.idea.value().trim();
    if (!idea) return;
    this.idea.set_value("");
    sendFromChat(`/plan ${idea}`);
    cx.notify();
  }

  previousList(c, w, p) {
    return v_flex()
      .flex_none()
      .w(w)
      .gap(SPACE[2])
      .child(div().px(SPACE[3]).pb(SPACE[1]).text_size(TYPE.sm).font_semibold().text_color(c.muted).child("Plans"))
      .children(this.plans.map((x, i) =>
        clickable(
          v_flex()
            .px(SPACE[3])
            .py(SPACE[3])
            .gap(SPACE[1])
            .rounded(SIZE.control)
            .when(p?.id === x.id, (el) => el.bg(c.fill).border_1().border_color(c.edge))
            .opacity(this.rowsIn === false ? 0 : 1)
            .transition("opacity", { ...MOTION.row, delay: Math.min(i, 8) * MOTION.stagger })
            .on_click((_e, cx) => {
              this.planId = x.id;
              keep("plan", x.id);
              this.reload(cx);
            })
            .child(div().truncate().text_size(TYPE.md).font_medium().text_color(x.status === "archived" ? c.faint : c.ink).child(x.title ?? x.id))
            .child(div().text_size(TYPE.xs).text_color(c.faint).child(`${{ grilling: "Being planned", ready: "Ready", task: "Became a task", archived: "Archived" }[x.status] ?? x.status} · ${day(x.updated)}`)),
          c,
          `bh-plan-${x.id}`,
        )))
      .child(clickable(
        div().mt(SPACE[2]).px(SPACE[3]).py(SPACE[3]).rounded(SIZE.control).text_size(TYPE.sm).text_color(c.accent)
          .on_click((_e, cx) => {
            this.planId = "__new";
            this.plan = null;
            cx.notify();
          })
          .child("New plan"),
        c,
        "bh-plan-new-row",
      ));
  }

  /** Your idea in a bubble, then each set of the panel's questions with what you answered. */
  planConversation(c, p, width) {
    const asked = Array.isArray(p.asked) ? p.asked : [];
    const bubble = h_flex().justify_end().child(
      div()
        .max_w(Math.round(width * 0.82))
        .px(SPACE[4])
        .py(SPACE[3])
        .rounded(SIZE.radius)
        .bg(c.bubble)
        .border_1()
        .border_color(c.bubbleEdge)
        .text_size(TYPE.md)
        .line_height(`${SIZE.line}px`)
        .child(p.idea || p.title || p.id),
    );
    const set = (q) => v_flex()
      .flex_none()
      .gap(SPACE[3])
      .child(h_flex().gap(SPACE[3]).items_center()
        .child(div().text_size(TYPE.sm).font_semibold().text_color(c.accent).child(q.fromName || "The panel"))
        .child(div().text_size(TYPE.xs).text_color(c.faint).child(q.status === "open" ? "waiting for you: answer in the chat" : `answered ${day(q.answered)}`)))
      .children(q.questions.map((x, i) => {
        const a = q.answers?.[i] ?? {};
        const picked = [...(a.picks ?? [])];
        const typed = (a.text ?? "").trim();
        return v_flex()
          .flex_none()
          .pl(SPACE[3])
          .gap(SPACE[2])
          .border_l(2)
          .border_color(c.edge)
          .child(div().text_size(TYPE.md).line_height(`${LINE.md}px`).child(`${x.seat ? `[${x.seat}] ` : ""}${x.text}`))
          .child(h_flex().flex_wrap().gap(SPACE[3]).children(x.options.map((o) => {
            const on = picked.includes(o.label);
            return div().h(CHIP).px(SPACE[3]).flex().items_center().rounded(SIZE.nested).border_1().text_size(TYPE.sm)
              .border_color(on ? c.accent : c.edge).text_color(on ? c.ink : c.muted).when(on, (el) => el.bg(c.well).font_medium())
              .child(`${o.label}${o.recommended ? " (recommended)" : ""}`);
          })))
          .when(Boolean(typed), (el) => el.child(div().text_size(TYPE.sm).text_color(c.muted).child(`You: ${typed}`)))
          .when(q.status !== "open" && !picked.length && !typed, (el) => el.child(div().text_size(TYPE.sm).text_color(c.faint).child("Left for the panel to decide")));
      }));
    return v_flex()
      .flex_none()
      .gap(SPACE[4])
      .child(bubble)
      .children(asked.map(set))
      .when(!asked.length && !p.markdown, (el) => el.child(div().text_size(TYPE.md).text_color(c.muted).child("The panel is reading the code. Its questions show here and in the chat.")));
  }

  /** The rail: the round, the panel's seats, the actions. */
  planRail(c, p, w) {
    const seats = [
      ["orchestrator", "Orchestrator", ICON("ask"), true],
      ["dev", "Dev", ICON("file"), false],
      ["design", "Design", ICON("image"), false],
      ["qa", "QA", ICON("check"), false],
      ["research", "Research", ICON("info"), false],
    ];
    const hues = { orchestrator: agentHue("orchestrator", c.accent), dev: agentHue("dev"), design: agentHue("design"), qa: agentHue("qa"), research: agentHue("research") };
    const off = new Set(p.off ?? []);
    return v_flex()
      .flex_none()
      .w(w)
      .pt(SPACE[1])
      .gap(SPACE[3])
      .items_center()
      .child(v_flex().items_center().pb(SPACE[2])
        .child(div().text_size(TYPE.lg).font_semibold().child(String(Math.max(1, p.round ?? 0))))
        .child(div().text_size(TYPE.xs).text_color(c.faint).child("round")))
      .children(seats.map(([seat, name, icon, fixed]) => {
        const on = !off.has(seat);
        const hue = hues[seat] || c.accent;
        return focusable(
          pressable(
            div()
              .tooltip(name)
              .relative()
              .size(ROW)
              .flex_none()
              .flex()
              .items_center()
              .justify_center()
              .rounded(SIZE.control)
              .border_1()
              .border_color(on ? alpha(hue, 0.45) : c.edge)
              .bg(on ? alpha(hue, 0.14) : c.ground)
              .text_color(on ? agentInk(c, name) : c.faint)
              .when(!fixed, (el) => el.hover((s) => s.bg(on ? alpha(hue, 0.22) : c.hover)).on_click((_e, cx) => {
                this.act(["plan", "seat", p.id, seat, off.has(seat) ? "--on" : "--off"], cx);
              }))
              .child(svg(icon).size(GLYPH.lg)),
          ),
          `bh-seat-${seat}`,
          c,
        );
      }))
      .child(div().w(CHIP).h(HAIR).my(SPACE[2]).bg(c.edge))
      .child(clickable(
        div().size(ROW).flex().items_center().justify_center().rounded(SIZE.control).border_1().border_color(c.edge)
          .on_click((_e, cx) => { this.showPrevious = !this.showPrevious; cx.notify(); })
          .child(svg(ICON("chevron-left")).size(GLYPH.lg).text_color(this.showPrevious ? c.accent : c.muted)),
        c,
        "bh-plan-prev",
      ))
      .child(clickable(
        div().size(ROW).flex().items_center().justify_center().rounded(SIZE.control).border_1().border_color(c.edge)
          .on_click((_e, cx) => { this.planId = "__new"; this.plan = null; cx.notify(); })
          .child(svg(ICON("plus")).size(GLYPH.lg).text_color(c.muted)),
        c,
        "bh-plan-new",
      ));
  }

  // Knowledge

  knowledgeView(c, width) {
    if (this.knowAll == null) return stateView(c, { id: "bh-know-loading", title: "Loading knowledge…", loading: true });
    const all = this.knowAll ?? [];
    const agents = all.map((x) => x.agent);
    const q = (this.knowSearch?.value?.() ?? "").toLowerCase().trim();
    const filter = this.knowFilter ?? new Set();
    const hueFor = (a) => agentHue(a, c.accent);
    const cards = all.flatMap(({ agent, text, notes }) => outline(text ?? "").sections.flatMap((s) => s.entries.map((e) => ({
      agent, section: s.name, entry: e, notes: notesOn(notes ?? [], e.text), text: e.text, title: e.key || (s.name ?? agent),
    })))).filter((card) => !filter.size || filter.has(card.agent))
      .filter((card) => !q || `${card.agent} ${card.section ?? ""} ${card.title} ${card.text}`.toLowerCase().includes(q));
    const cols = width >= 900 ? 3 : width >= 620 ? 2 : 1;
    const columns = Array.from({ length: cols }, () => []);
    cards.forEach((card, i) => columns[i % cols].push(card));
    const bodyH = Math.max(300, this.height - 170);
    const edited = this.knownText !== null && this.editor.value() === this.knownText ? false : this.knownText !== null && this.editor.value() !== this.knownText;
    if (this.editing) {
      const who = (this.agent ?? "orchestrator");
      return v_flex().w(width).gap(SPACE[3])
        .child(h_flex().gap(SPACE[3]).items_center()
          .child(div().text_size(TYPE.lg).font_semibold().child(who.charAt(0).toUpperCase() + who.slice(1)))
          .child(div().flex_1())
          .child(this.chip(c, "bh-know-undo", "Cancel", false, (_e, cx) => { this.editor.set_value(this.knownText ?? ""); this.editing = false; cx.notify(); }))
          .when(this.knownText !== null && this.editor.value() !== this.knownText, (x) => x.child(this.button(c, "bh-know-save", "Save", (_e, cx) => this.saveKnowledge(cx)))))
        .child(div().text_size(TYPE.sm).text_color(c.muted).child("The file itself, as Markdown. Saving keeps the version before in the archive."))
        .child(div().h(bodyH).p(SPACE[3]).rounded(SIZE.control).bg(c.ground).border_1().border_color(c.edge).overflow_y_scroll()
          .child(this.editor.render(c, this.cx, "bh-know-md")));
    }
    return v_flex()
      .w(width)
      .gap(SPACE[4])
      .child(h_flex().gap(SPACE[3]).items_center()
        .child(div().flex_1().min_w(180).max_w(320).h(CONTROL).px(SPACE[3]).flex().items_center().rounded(SIZE.control).bg(c.fill).border_1().border_color(c.edge)
          .child(Input.new(this.knowSearch).w_full().h_full().text_size(TYPE.md).text_color(c.ink)))
        .child(h_flex().flex_1().gap(SPACE[3]).flex_wrap().items_center().children(agents.map((a) => {
          const on = !filter.size || filter.has(a);
          const hue = hueFor(a);
          const light = isLight(c);
          return focusable(
            pressable(
              div().h(CONTROL).px(SPACE[3]).flex().items_center().gap(SPACE[3]).rounded_full().border_1()
                .border_color(on ? alpha(hue, light ? 0.35 : 0.5) : c.edge)
                .bg(on ? (light ? alpha(hue, 0.04) : alpha(hue, 0.16)) : c.fill)
                .text_color(on ? c.ink : c.muted)
                .hover((s) => s.bg(light ? c.hover : alpha(hue, 0.22)))
                .on_click((_e, cx) => {
                  if (!this.knowFilter) this.knowFilter = new Set();
                  if (this.knowFilter.has(a)) this.knowFilter.delete(a); else { if (!this.knowFilter.size) this.knowFilter = new Set(agents.filter((x) => x !== a)); else this.knowFilter.add(a); }
                  if (this.knowFilter.size === agents.length) this.knowFilter.clear();
                  cx.notify();
                })
                .child(div().size(SPACE[3]).rounded_full().bg(hue))
                .child(div().text_size(TYPE.sm).font_medium().child(a.charAt(0).toUpperCase() + a.slice(1))),
            ),
            `bh-know-chip-${a}`,
            c,
          );
        }))))
      .child(h_flex().w(width).gap(SPACE[4]).items_start().children(
        columns.map((col) =>
          v_flex().flex_1().min_w(0).gap(SPACE[4]).children(
            col.map((card, i) => this.knowNoteCard(c, card, hueFor(card.agent), i)),
          ),
        ),
      ))
      .when(!cards.length, (el) => el.child(div().w_full().py(SPACE[5]).text_size(TYPE.md).text_color(c.muted).child("No notes match.")));
  }

  /** A knowledge note's links: Resolve and Delete both take it back; Edit is unnote, then note again. */
  noteActions(agent, e, n) {
    const w = this.commenting;
    const unnote = (cx) => this.act(["knowledge", "unnote", agent, "--at", n.at], cx);
    return {
      key: `bh-know-n-${agent}-${hash(`${n.at}${n.note}`)}`,
      editing: Boolean(w && w.kind === "knowledge" && w.id === agent && w.edit === n.at),
      resolve: unnote,
      delete: unnote,
      edit: (cx) => {
        this.agent = agent;
        this.editInline("knowledge", agent, e.line, n.at, n.note, cx);
      },
    };
  }

  knowNoteCard(c, card, hue, index = 0) {
    const { agent, entry: e, notes, section } = card;
    const on = this.addingAt("knowledge", agent, e.line);
    const body = /^\s{0,3}[-*+]\s+/.test(e.text) ? e.text.replace(/^\s{0,3}[-*+]\s+/, "") : e.text;
    const light = isLight(c);
    return clickable(
      v_flex()
        .flex_none()
        .relative()
        .p(SPACE[4])
        .gap(SPACE[3])
        .rounded(SIZE.radius)
        .bg(light ? c.fill : mix(c.ground, hue, 0.08))
        .border_1()
        .border_color(c.edge)
        .hover((s) => (light ? s.border_color(alpha(hue, 0.35)) : s.bg(mix(c.ground, hue, 0.12)).border_color(alpha(hue, 0.35))))
        .opacity(this.rowsIn === false ? 0 : 1)
        .transition("opacity", { ...MOTION.row, delay: Math.min(index, 8) * MOTION.stagger })
        .on_click((_e, cx) => { this.agent = agent; this.startInline("knowledge", agent, e.line, cx); })
        // The agent is marked by its dot and name only; no stripe.
        .child(h_flex().gap(SPACE[3]).items_center()
          .child(div().size(SPACE[3]).rounded_full().bg(hue))
          .child(div().text_size(TYPE.xs).font_medium().text_color(light ? agentInk(c, agent) : agentInkOn(c, agent, mix(c.ground, hue, 0.12))).child(agent.charAt(0).toUpperCase() + agent.slice(1)))
          .when(Boolean(section), (el) => el.child(div().text_size(TYPE.xs).text_color(c.faint).child(section)))
          .child(div().flex_1())
          .child(focusable(
            pressable(
              div().size(CHIP).flex().items_center().justify_center().rounded(SIZE.nested).text_color(c.faint).hover((s) => s.bg(c.hover).text_color(c.ink))
                .on_click((_ev, cx) => { cx.stop_propagation?.(); this.agent = agent; this.knownText = (this.knowAll?.find((x) => x.agent === agent)?.text ?? ""); this.editor.set_value(this.knownText); this.editing = true; cx.notify(); })
                .child(svg(ICON("external-link")).size(GLYPH.sm)),
            ),
            `bh-know-edit-${agent}-${e.line}`,
            c,
          ))
          .child(this.confirmDelete === `${agent}:${e.line}`
            ? h_flex().gap(SPACE[2]).items_center()
              .child(this.chip(c, `bh-know-del-yes-${e.line}`, "Delete", false, (_ev, cx) => { cx.stopPropagation?.(); this.deleteEntry(agent, e, cx); }))
              .child(this.chip(c, `bh-know-del-no-${e.line}`, "Keep", false, (_ev, cx) => { cx.stopPropagation?.(); this.confirmDelete = null; cx.notify(); }))
            : focusable(
              pressable(
                div().size(CHIP).flex().items_center().justify_center().rounded(SIZE.nested).text_color(c.faint).hover((s) => s.bg(c.well).text_color(c.danger))
                  .on_click((_ev, cx) => { cx.stopPropagation?.(); this.confirmDelete = `${agent}:${e.line}`; this.agent = agent; cx.notify(); })
                  .child(svg(ICON("trash")).size(GLYPH.sm)),
              ),
              `bh-know-del-${agent}-${e.line}`,
              c,
            )))
        .child(div().text_size(TYPE.md).line_height(`${LINE.md}px`).child(TextView.markdown(`bh-know-card-md-${agent}-${e.line}-${hash(e.text)}`, body)))
        .when(notes.length > 0, (el) => el.child(v_flex().gap(SPACE[2]).children(notes.map((n) => this.commentNote(c, { id: n.at, text: n.note, open: true }, this.noteActions(agent, e, n))))))
        .when(on, (el) => el.child(this.inlineBox(c).ml(0).mr(0))),
      c,
      `bh-know-card-${agent}-${e.line}`,
    );
  }

  // Bits

  chip(c, id, label, on, onClick) {
    return clickable(
      div()
        .flex_none()
        .h(CHIP)
        .px(SPACE[3])
        .flex()
        .items_center()
        .rounded(SIZE.nested)
        .border_1()
        .text_size(TYPE.sm)
        .when(on, (el) => el.bg(c.well).border_color(c.accent).text_color(c.ink).font_medium())
        .when(!on, (el) => el.border_color(c.edge).text_color(c.muted).hover((s) => s.bg(c.hover).text_color(c.ink)))
        .on_click(onClick)
        .child(label),
      c,
      id,
    );
  }

  button(c, id, label, onClick) {
    return clickable(
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
        .hover((s) => s.opacity(0.92))
        .on_click(onClick)
        .child(label),
      c,
      id,
    );
  }

  iconButton(c, id, icon, onClick) {
    return clickable(
      div()
        .size(CONTROL)
        .flex_none()
        .flex()
        .items_center()
        .justify_center()
        .rounded(SIZE.nested)
        .text_color(c.muted)
        .on_click(onClick)
        .child(svg(ICON(icon)).size(MARK)),
      c,
      id,
    );
  }
}
