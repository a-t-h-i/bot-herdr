// The Tasks, Plans and Knowledge pages: the team's work in the project of the space you are
// looking at. One view; the layout gives each page its own block (props.tab).
//   Tasks      a list (under way, then finished; or the archived ones) beside the chosen task:
//              its steps, each with who did it and for how long, and your comments on any step.
//              Resume hands it back to the Orchestrator; Delete takes a stopped one away.
//   Plans      the panel's drafts: the questions and answers, the rail of seats and actions, and
//              the draft itself in a sheet to comment on line by line; a plan starts as a task.
//   Knowledge  what each agent knows about the project, drawn by section; a note on any entry
//              goes with it into the agent's brief; Edit opens the file itself.
// Everything comes from the bh tool (tasks, plans and knowledge live in the project's
// .bot-herdr folder); messages for the team go through the chat's composer.

import { div, svg, image } from "gpui-kit";
import { v_flex, h_flex, TextView, InputState, Input } from "gpui-base";
import { settings, shared } from "herdr";
import { SIZE, ICON, TYPE, LINE, SPACE, CONTROL, CHIP, GLYPH, MARK, DOT, PIP, HAIR, MOTION, mix, agentHue, agentInk, agentInkOn, isLight, clickable, pressable, focusable } from "./look.js";
import { actionButton } from "./button.js";
import { segmented, stateView, pill } from "./switch.js";
import { commentRow, openFirst, openPlan, sectionLabel, COMMENT_LINKS, arm, armed } from "./plandoc.js";
import { colors } from "./theme.js";
import { activePage, sendFromChat, OPEN_TASK } from "./pages.js";
import { ROSTER_KEY, roster, slug } from "./roster.js";
import { bh, bhJson, enc, projectDir } from "./bh.js";
import { outline, notesOn } from "./doc.js";
import { hash } from "./feed.js";
import { alpha } from "./working.js";
import { mentionTone } from "./indicators.js";
import { MarkdownEditor } from "./mdedit.js";
import { openNoteForm, NOTE_ADDED } from "./noteform.js";
import { Composer } from "./composer.js";
import { mockupFile, openInBrowser } from "./media.js";
import { openLightbox } from "./lightbox.js";

const TABS = [
  { id: "tasks", icon: "page-tasks", label: "Tasks" },
  { id: "plans", icon: "page-plans", label: "Plans" },
  { id: "knowledge", icon: "page-knowledge", label: "Knowledge" },
];
const SECTIONS = [
  { id: "open", label: "Under way", has: ["active", "paused", "backlog"] },
  { id: "done", label: "Finished", has: ["done", "abandoned"] },
];
const LIST_W = 340;
const NARROW = 720; // under this window width a page shows its list or its detail, not both
const RAIL_W = 52;
const PLAN_COL = 810; // the Plans column is at most this wide
const PLAN_LIST_W = 250; // the other plans, beside the column
const MOCK_W = 120; // a question's mockup thumbnail
const MOCK_H = 82;
const STEP_TEXT = SPACE[2] + MARK + SPACE[3] + (SPACE[5] + SPACE[3]) + SPACE[3]; // where a step's text starts

/** How each plan status reads, and its colour token. */
const PLAN_STATUS = {
  grilling: { label: "Being planned", tone: "warning" },
  ready: { label: "Ready", tone: "success" },
  task: { label: "Became a task", tone: "info" },
  archived: { label: "Archived", tone: "faint" },
};
const planTone = (c, status) => c[PLAN_STATUS[status]?.tone] ?? c.muted;

/** The panel that plans with you, in the order it sits, with the names and the rail's three letters. */
const SEATS = [
  { id: "orchestrator", short: "Orc", name: "Orchestrator", fixed: true },
  { id: "dev", short: "Dev", name: "Dev" },
  { id: "design", short: "Des", name: "Design" },
  { id: "qa", short: "QA", name: "QA" },
  { id: "research", short: "Res", name: "Research" },
];

/** Which status circle a task or step gets: each word of the status maps to one mark. */
const MARK_KIND = { done: "done", active: "active", now: "active", paused: "paused", blocked: "blocked", abandoned: "cross", skipped: "cross" };

/** The agents a step names: "dev", "dev, qa", "design-toast & qa" or a list. */
export function stepAgents(s) {
  const raw = Array.isArray(s?.agent) ? s.agent : String(s?.agent ?? "").split(/\s*(?:,|&|\+|\band\b)\s*/);
  return [...new Set(raw.map((a) => String(a ?? "").trim()).filter(Boolean))];
}

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

const firstLine = (r) => (r.stderr || r.stdout || "").trim().split("\n")[0];

/** A composer for a page's box: `onSend(text, cx)` gets what was written, after the box is cleared. */
function pageComposer(given, cx, { minRows, placeholder, onSend }) {
  const comp = new Composer({});
  comp.init(given, cx);
  comp.minRows = minRows;
  comp.placeholder = placeholder;
  comp.send = (cx) => {
    const text = comp.input.value().trim();
    if (comp.sending || !text) return;
    resetComposer(comp);
    cx.notify();
    onSend(text, cx);
  };
  return comp;
}

/** Clears a composer's draft: its text, its files and the pane it had open. */
function resetComposer(comp) {
  comp.files = [];
  comp.input.set_value("");
  comp.text = "";
  comp.pane = null;
}

/** The status circle: done a filled tick, active an accent ring with a dot, paused a muted ring with pause bars, blocked an amber "!", abandoned or skipped a muted cross, open an empty ring. */
function statusMark(c, status, size = GLYPH.lg) {
  const kind = MARK_KIND[status] ?? "open";
  const box = div().flex_none().size(size).flex().items_center().justify_center().rounded_full();
  if (kind === "done") return box.bg(c.success).child(svg(ICON("check")).size(size - SPACE[2]).text_color(c.fill));
  const ring = { active: c.accent, blocked: c.warning }[kind] ?? c.faint;
  const inside = markInside(c, kind);
  return box.border_1().border_color(ring).when(Boolean(inside), (el) => el.child(inside));
}

/** What sits inside a status ring, if anything. */
function markInside(c, kind) {
  if (kind === "active") return div().size(DOT).rounded_full().bg(c.accent);
  if (kind === "paused") return h_flex().gap(SPACE[1]).items_center()
    .child(div().w(SPACE[1]).h(SPACE[3]).rounded(PIP).bg(c.muted))
    .child(div().w(SPACE[1]).h(SPACE[3]).rounded(PIP).bg(c.muted));
  if (kind === "blocked") return div().text_size(TYPE.xs).font_bold().text_color(c.warning).child("!");
  if (kind === "cross") return svg(ICON("x")).size(GLYPH.xs).text_color(c.muted);
  return null;
}

/** The steps as pill-shaped segments: done ones accent, the running one half lit, blocked amber. */
function pips(c, steps) {
  return h_flex().flex_none().gap(SPACE[1]).items_center().children(steps.slice(0, 12).map((s) =>
    div().flex_none().w(SPACE[4]).h(SPACE[2]).rounded(PIP).bg(pipTone(c, s.status))));
}

function pipTone(c, status) {
  if (status === "done" || status === "skipped") return c.accent;
  if (status === "active") return alpha(c.accent, 0.5);
  return status === "blocked" ? c.warning : c.edge;
}

/** A status's word in a pill: active the accent, done the success tone, blocked amber, the rest muted. */
function statusTone(c, status) {
  return { active: c.accent, done: c.success, blocked: c.warning, abandoned: c.faint }[status] ?? c.muted;
}

/** An agent's initial in a ring of its colour: the mark its name is drawn with on a step. */
function agentDot(c, name, size = 18) {
  const tone = agentInk(c, name);
  return div()
    .flex_none()
    .size(size)
    .rounded_full()
    .flex()
    .items_center()
    .justify_center()
    .bg(alpha(tone, 0.16))
    .border_1()
    .border_color(alpha(tone, 0.45))
    .text_size(TYPE.xs)
    .font_semibold()
    .text_color(tone)
    .child(String(name ?? "?").charAt(0).toUpperCase());
}

/** A group's label in the list: small uppercase muted text, and its count in a small pill. */
function groupLabel(c, label, count) {
  return h_flex().flex_none().gap(SPACE[2]).items_center().px(SPACE[2]).pt(SPACE[3])
    .child(div().text_size(TYPE.xs).font_semibold().text_color(c.muted).child(label.toUpperCase()))
    .child(div().px(SPACE[2]).rounded_full().bg(c.well).text_size(TYPE.xs).text_color(c.muted).child(String(count)));
}

/** A row's second line: the status (blocked when a step is) and the track, or, once finished, the time worked. */
function taskMeta(t, blocked, finished) {
  if (finished) return `${t.status} · worked ${duration(workedOf(t))}`;
  return [blocked ? "blocked" : t.status ?? "backlog", t.track ? `${t.track} track` : ""].filter(Boolean).join(" · ");
}

/** How many of a step's comments are still open, in accent with the comment glyph. */
function commentCount(c, n) {
  return h_flex().flex_none().gap(SPACE[1]).items_center().text_size(TYPE.xs).text_color(c.accent)
    .child(svg(ICON("comment")).size(GLYPH.sm))
    .child(String(n));
}

/** A list row's words: the title, then the meta line (in amber when something is blocked). */
function taskRowText(c, t) {
  const finished = t.status === "done" || t.status === "abandoned";
  const blocked = t.status === "blocked" || (t.steps ?? []).some((s) => s.status === "blocked");
  const tone = t.status === "abandoned" ? c.faint : finished ? c.muted : c.ink;
  return v_flex()
    .flex_1()
    .min_w(0)
    .gap(SPACE[1])
    .child(div().truncate().text_size(TYPE.md).font_medium().text_color(tone).child(t.title ?? t.id))
    .child(div().truncate().text_size(TYPE.sm).text_color(blocked ? c.warning : c.muted).child(taskMeta(t, blocked, finished)));
}

/** A small text link: its label in `tone`, ink on hover, reachable by the keyboard. */
function textLink(c, id, label, onClick, tone = c.muted) {
  return focusable(
    div().cursor_pointer().text_size(TYPE.sm).font_medium().text_color(tone).hover((s) => s.text_color(c.ink)).on_click(onClick).child(label),
    id,
    c,
  );
}

/** The way back to a list, on a narrow window: a chevron and its label. */
function backLink(c, id, label, onClick) {
  return focusable(
    h_flex().cursor_pointer().gap(SPACE[2]).items_center().text_size(TYPE.sm).font_medium().text_color(c.muted).hover((s) => s.text_color(c.ink)).on_click(onClick)
      .child(svg(ICON("chevron-left")).size(GLYPH.sm))
      .child(label),
    id,
    c,
  );
}

const mutedLine = (c, text) => div().text_size(TYPE.sm).text_color(c.muted).child(text);

/** A plan's status in the list: a dot in its tone, and the status's word. */
function previousMeta(c, x) {
  return h_flex().gap(SPACE[2]).items_center()
    .child(div().flex_none().size(DOT).rounded_full().bg(planTone(c, x.status)))
    .child(div().text_size(TYPE.sm).text_color(c.muted).child(PLAN_STATUS[x.status]?.label ?? x.status));
}

/** A seat's count of its open questions, at the corner of its pill. */
function seatBadge(c, n) {
  return div()
    .absolute()
    .top(0)
    .right(0)
    .h(GLYPH.md)
    .min_w(GLYPH.md)
    .px(SPACE[1])
    .flex()
    .items_center()
    .justify_center()
    .rounded_full()
    .bg(c.accent)
    .text_size(TYPE.xs)
    .font_semibold()
    .text_color(c.accentInk)
    .child(String(n));
}

/** How many of a plan's questions still wait for the user, asked by this seat. */
function waitingFor(p, seat) {
  return (Array.isArray(p.asked) ? p.asked : []).filter((q) => q.status === "open")
    .reduce((n, q) => n + (q.questions ?? []).filter((x) => String(x.seat ?? "").toLowerCase() === seat).length, 0);
}

/** What the user answered to question `i` of a set: the options picked, and the words typed. */
function answerOf(q, i) {
  const a = q.answers?.[i] ?? {};
  return { picked: [...(a.picks ?? [])], typed: String(a.text ?? "").trim() };
}

/** A seat's name as the page writes it: "Orchestrator", "QA", or the word itself capitalised. */
function seatName(seat) {
  const key = String(seat ?? "").toLowerCase();
  return SEATS.find((s) => s.id === key)?.name ?? key.charAt(0).toUpperCase() + key.slice(1);
}

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
    this.stayClosed = false; // no task opens on its own: one was just deleted, or the list was picked
    this.plan = null; // the plan shown: its full record
    this.planId = load("plan", null);
    this.agent = load("agent", null); // the knowledge file shown
    this.knownText = null; // the file as loaded, to tell an edit from it
    this.editing = false; // the knowledge file open as text, to rewrite it
    this.confirmDelete = null; // "agent:line" of the record whose Delete asks first
    this.armed = null; // a two-step action waiting for its second click (see arm)
    this.notes = [];
    this.busy = false;
    this.problem = null;
    this.descOpen = new Set(); // details and steps the user opened
    this.comment = InputState.new({ placeholder: "Comment" });
    this.idea = InputState.new({ placeholder: "What should the team plan?" });
    this.idea.on("submit", (_e, cx) => this.startPlan(cx));
    this.showPrevious = false; // the Plans page's list of plans, from the rail
    this.tucking = false; // the View plan tab has tucked into the composer (its sheet opens next)
    this.pageKey = null; // the page/tab drawn last: rows stagger when it changes
    this.rowsIn = true; // false for the one frame a freshly opened list is still hidden
    this.comment.on("submit", (_e, cx) => this.sendComment(cx));
    // A comment on one line of a plan, or one step of a task: { kind: "plan" | "task", id, at }.
    this.commenting = null;
    this.inline = InputState.new({ placeholder: "Comment" });
    this.inline.on("submit", (_e, cx) => this.sendInline(cx));
    this.editor = new MarkdownEditor({ value: "", placeholder: "The file itself, as Markdown" });
    this.editor.on("change", (_value, cx) => cx.notify());
    this.knowSearch = InputState.new({ placeholder: "Search notes" });
    this.knowSearch.on("change", (_e, cx) => cx.notify());
    this.knowFilter = new Set();
    this.noteAddedAt = shared(NOTE_ADDED)?.at ?? 0;
    // Plans are written at length: the Plans page's box starts taller than the chat's.
    this.planComposer = pageComposer(given, cx, {
      minRows: 2,
      placeholder: "Describe what to plan, or answer the panel…",
      onSend: (text, cx) => this.sendPlanText(text, cx),
    });
    // The task's box at the foot of its detail: a comment on the task, its placeholder names it.
    this.taskComposer = pageComposer(given, cx, { minRows: 1, placeholder: "Comment on the task…", onSend: (text, cx) => this.sendTaskComment(cx, text) });
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
        this.switchTo(dir);
        if (this.tab === "tasks") await this.loadTasks(dir);
        if (this.tab === "plans") await this.loadPlans(dir);
        if (this.tab === "knowledge") await this.loadKnowledge(dir);
      } finally {
        this.busy = false;
        cx.notify();
      }
    });
  }

  /** A new project folder: what was shown from the old one goes, and each load below drops its answer if the folder changed. */
  switchTo(dir) {
    if (dir === this.dir) return;
    this.dir = dir;
    this.opened = null;
    this.stayClosed = false;
    this.tasks = null;
    this.plans = null;
    this.knowAll = null;
    this.plan = null;
    this.knownText = null;
  }

  async loadTasks(dir) {
    const got = await bhJson(["task", "list", "--all"], { cwd: dir });
    if (dir !== projectDir()) return;
    this.tasks = got ?? [];
    this.problem = got ? null : "Couldn't read the tasks. Is node on your PATH?";
  }

  async loadPlans(dir) {
    const plans = (await bhJson(["plan", "list", "--all"], { cwd: dir })) ?? [];
    if (dir !== projectDir()) return;
    this.plans = plans;
    const id = this.planId === "__new" ? null : this.planId ?? plans.find((p) => p.status !== "archived")?.id ?? null;
    const plan = id ? await bhJson(["plan", "show", id], { cwd: dir }) : null;
    if (dir !== projectDir()) return;
    this.plan = plan;
  }

  async loadKnowledge(dir) {
    const kinds = (await bhJson(["knowledge", "list"], { cwd: dir })) ?? [];
    if (dir !== projectDir()) return;
    const team = roster(shared(ROSTER_KEY), []).map((a) => (a.role === "custom" ? slug(a.name) : a.role));
    const names = [...new Set([...team, ...kinds.map((k) => k.agent)])];
    const all = await Promise.all(names.map(async (agent) => {
      const got = await bhJson(["knowledge", agent], { cwd: dir });
      return { agent, text: got?.text ?? "", notes: Array.isArray(got?.notes) ? got.notes : [] };
    }));
    if (dir !== projectDir()) return;
    this.kinds = kinds;
    this.knowAll = all;
    this.adoptKnowledge(all);
  }

  /** The knowledge file shown: the one picked (else the first), kept as it is while it has an unsaved edit. */
  adoptKnowledge(all) {
    const agent = this.agent ?? all[0]?.agent ?? "orchestrator";
    this.agent = agent;
    const cur = all.find((x) => x.agent === agent) ?? { agent, text: "", notes: [] };
    if (this.knownText !== null && this.editor.value() !== this.knownText) return;
    if (cur.text !== this.knownText) {
      this.knownText = cur.text;
      this.editor.set_value(cur.text);
    }
    this.notes = cur.notes;
  }

  show(tab, cx) {
    this.tab = tab;
    keep("tab", tab);
    this.reload(cx);
    cx.notify();
  }

  /** Runs bh in the project the page is on; `done(r, cx)` gets the answer, unless the project changed meanwhile. */
  run(args, cx, done) {
    if (this.dir !== projectDir()) return this.reload(cx);
    const dir = this.dir;
    cx.spawn(async (cx) => {
      const r = await bh(args, { cwd: dir });
      if (dir === projectDir()) done(r, cx);
      this.reload(cx);
      cx.notify();
    });
  }

  act(args, cx, done) {
    this.run(args, cx, (r) => {
      this.problem = r.code === 0 ? null : firstLine(r);
      done?.(r);
    });
  }

  /** `bh task delete` or `bh plan delete`: `after` runs on success; a failure is said in `composer`. */
  remove(args, composer, cx, after) {
    this.run(args, cx, (r, cx) => {
      if (r.code === 0) return after();
      composer.say(firstLine(r) || "Couldn't delete it.", cx, "error");
    });
  }

  sendComment(cx) {
    const text = this.comment.value().trim();
    const plan = this.plan;
    if (!text || !plan) return;
    this.comment.set_value("");
    this.act(["plan", "comment", plan.id, "--data", enc(text)], cx, (r) => {
      if (r.code === 0) sendFromChat(`The user commented on plan ${plan.id} ("${plan.title}"): ${text}\n\nRevise the draft (bh plan show ${plan.id}) or say why it needs no change.`);
    });
  }

  /** Plan text from the plans box: with no plan open it starts one; with one, the Orchestrator revises it. */
  sendPlanText(text, cx) {
    const plan = this.plan;
    if (!plan) return sendFromChat(`/plan ${text}`);
    this.act(["plan", "comment", plan.id, "--data", enc(text)], cx, (r) => {
      if (r.code === 0) sendFromChat(`The user commented on plan ${plan.id} ("${plan.title}"): ${text}\n\nRevise the draft (bh plan show ${plan.id}) or say why it needs no change.`);
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
        if (r.code === 0) sendFromChat(`The user commented on line ${where.at} of plan ${plan.id} ("${plan.title}")${quote ? `, which reads "${quote.slice(0, 160)}"` : ""}: ${text}\n\nRevise the draft (bh plan show ${plan.id}) or say why it needs no change.`);
      });
      return;
    }
    if (where.kind === "knowledge") {
      const entry = outline(this.knownText ?? "").sections.flatMap((x) => x.entries).find((e) => e.line === where.at);
      if (!entry) return;
      const who = where.id.charAt(0).toUpperCase() + where.id.slice(1);
      if (where.edit) return this.editNote(where.id, who, entry, where.edit, text, cx);
      this.act(["knowledge", "note", where.id, entry.key, "--data", enc(text)], cx, (r) => {
        if (r.code === 0) sendFromChat(`The user left a note on ${who}'s knowledge entry "${entry.key.slice(0, 200)}": ${text}\n\nThe note now goes with that entry into ${who}'s brief. If the entry itself is wrong or out of date, correct it (bh knowledge ${where.id}, then bh knowledge write ${where.id} --file <file>); otherwise say it needs no change.`);
      });
      return;
    }
    // A task's comment: on a step when one is named, else on the task itself.
    if (where.at == null) return this.sendTaskComment(cx, text, where.id);
    const task = (this.tasks ?? []).find((t) => t.id === where.id);
    const step = task?.steps?.find((x) => x.n === where.at);
    this.act(["task", "comment", where.id, "--step", String(where.at), "--data", enc(text)], cx, (r) => {
      if (r.code === 0) sendFromChat(`The user commented on step ${where.at}${step ? ` ("${step.title}")` : ""} of task ${where.id}: ${text}\n\nTake it into account (bh task show ${where.id}) or say why it needs no change.`);
    });
  }

  /** A knowledge note edited: taken back, then kept again with the new text; the Orchestrator hears of it. */
  editNote(agent, who, entry, at, text, cx) {
    this.act(["knowledge", "unnote", agent, "--at", at], cx, (r) => {
      if (r.code !== 0) return;
      this.act(["knowledge", "note", agent, entry.key, "--data", enc(text)], cx, (r2) => {
        if (r2.code === 0) sendFromChat(`The user commented on ${who}'s knowledge entry "${entry.key.slice(0, 200)}": ${text}\n\nTake it into account or say why it needs no change.`);
      });
    });
  }

  /** A comment on the task itself, from the box at its foot or the box under Comments. */
  sendTaskComment(cx, text, id = this.opened) {
    if (!text || !id) return;
    this.act(["task", "comment", id, "--data", enc(text)], cx, (r) => {
      if (r.code === 0) sendFromChat(`The user commented on task ${id}: ${text}\n\nTake it into account (bh task show ${id}) or say why it needs no change.`);
    });
  }

  /** Shows or hides a detail the page keeps open or shut: a task's details, its request, a step's agents. */
  toggleDesc(key, cx) {
    if (!this.descOpen) this.descOpen = new Set();
    if (this.descOpen.has(key)) this.descOpen.delete(key);
    else this.descOpen.add(key);
    cx.notify();
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
    // A note added from its dialog: show it.
    const added = shared(NOTE_ADDED);
    if ((added?.at ?? 0) > this.noteAddedAt) {
      this.noteAddedAt = added.at;
      cx.timer.after(1, (cx) => this.reload(cx));
    }
    const want = shared(OPEN_TASK);
    if (want?.at > (this.openAt ?? 0)) {
      this.openAt = want.at;
      this.opened = want.id;
      this.archived = false;
      this.stayClosed = false;
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
    // Until the project's data is read, nothing of another project is drawn.
    const stale = this.dir !== projectDir();
    if (stale && !this.busy) cx.timer.after(1, (cx) => this.reload(cx));
    const body = stale
      ? stateView(c, { id: "bh-work-switching", title: "Loading…", loading: true })
      : this.tab === "plans" ? this.plansView(c, content) : this.tab === "knowledge" ? this.knowledgeView(c, content) : this.tasksView(c, content);
    return div()
      .id("bh-work")
      .relative()
      .size_full()
      .bg(c.ground)
      .text_color(c.ink)
      .on_size_change((size, cx) => {
        // px with the app's zoom multiplied in; drawn sizes are without it.
        const zoom = Number(settings().zoom) || 1;
        this.width = size.width / zoom;
        this.height = size.height / zoom;
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
                  // The page names itself in the tab bar; only the tabs (when this block has several) and refresh here.
                  .when(!this.fixed, (el) => el.child(this.tabs(c)))
                  .child(div().flex_1())
                  .child(actionButton(c, "bh-work-refresh", null, (_e, cx) => this.reload(cx), { icon: "refresh-cw", tone: "quiet", tooltip: "Refresh" })),
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
      items: TABS.map((t) => ({ id: t.id, icon: t.icon, label: t.label, on: t.id === this.tab })),
      onPick: (id, cx) => this.show(id, cx),
    });
  }

  empty(c, title, about) {
    return stateView(c, { id: "bh-work-state", title, line: about });
  }

  // Tasks

  /** The Tasks page: the list and the chosen task side by side; under NARROW, one of them with a link back. */
  tasksView(c, width) {
    if (this.tasks === null) return stateView(c, { id: "bh-tasks-loading", title: "Loading tasks…", loading: true });
    if (!this.tasks.length) return this.hero(c, width, "page-tasks", "No tasks yet", "Type /task in the chat to start one.");
    const narrow = this.width < NARROW;
    const archived = this.tasks.filter((t) => t.archived);
    const current = this.tasks.filter((t) => !t.archived);
    const list = this.archived ? archived : current;
    if (!narrow && !this.stayClosed && !list.some((t) => t.id === this.opened)) this.opened = (list.find((t) => t.status === "active") ?? list[0])?.id ?? null;
    const open = list.find((t) => t.id === this.opened) ?? null;
    const paneH = Math.max(320, this.height - 96);
    const listW = narrow ? width : Math.min(LIST_W, Math.floor(width * 0.45));
    const paneW = narrow ? width : Math.max(0, width - listW - HAIR);
    return h_flex()
      .w(width)
      .h(paneH)
      .items_start()
      .when(!narrow || !open, (el) => el.child(this.taskList(c, { list, current, archived, width: listW, height: paneH, narrow })))
      .when(!narrow, (el) => el.child(div().flex_none().w(HAIR).h(paneH).bg(c.edge)))
      .when(!narrow || Boolean(open), (el) => el.child(this.taskPane(c, open, { width: paneW, height: paneH, narrow })));
  }

  /** The list column: the "Tasks" heading with the Tasks / Archived switch on its right, then the groups. */
  taskList(c, { list, current, archived, width, height, narrow }) {
    const groups = this.taskGroups(list);
    return v_flex()
      .flex_none()
      .w(width)
      .h(height)
      .gap(SPACE[3])
      .pr(narrow ? 0 : SPACE[4])
      .child(h_flex().items_center().justify_between().gap(SPACE[3])
        .child(div().text_size(TYPE.xl).font_semibold().child("Tasks"))
        .child(this.taskSwitch(c, current, archived)))
      .child(v_flex()
        .id("bh-task-list")
        .flex_1()
        .min_h(0)
        .overflow_y_scroll()
        .gap(SPACE[1])
        .when(!list.length, (el) => el.child(mutedLine(c, this.archived ? "Nothing archived. Archive a finished task from its detail to keep this list short." : "Every task is archived.")))
        .children(groups.flatMap((g) => [groupLabel(c, g.label, g.rows.length), ...g.rows.map((t, i) => this.taskRow(c, t, i))])));
  }

  /** The list's groups: under way and finished (SECTIONS), or the one archived group. */
  taskGroups(list) {
    if (this.archived) return [{ id: "archived", label: "Archived", rows: list }];
    return SECTIONS.map((sec) => ({ ...sec, rows: list.filter((t) => sec.has.includes(t.status ?? "backlog")) })).filter((g) => g.rows.length);
  }

  taskSwitch(c, current, archived) {
    return segmented(c, {
      id: "bh-task-filter",
      items: [
        { id: "tasks", label: "Tasks", count: current.length, on: !this.archived },
        { id: "archived", label: "Archived", count: archived.length, on: this.archived },
      ],
      onPick: (id, cx) => {
        this.archived = id === "archived";
        this.opened = null;
        this.stayClosed = false;
        cx.notify();
      },
    });
  }

  /** A row of the list: its status circle, the title and its meta line; on the right, the steps' pips and count, or the age. */
  taskRow(c, t, i = 0) {
    const on = this.opened === t.id;
    return clickable(
      this.rowFrame(c, t, on, i)
        .child(statusMark(c, t.status, GLYPH.lg))
        .child(taskRowText(c, t))
        .child(this.taskRowEnd(c, t, t.steps ?? [])),
      c,
      `bh-task-${t.id}`,
      { fill: on ? alpha(c.accent, 0.14) : null },
    );
  }

  /** A list row's box: its padding, the accent edge and tint when chosen, and a click that opens the task. */
  rowFrame(c, t, on, i) {
    return h_flex()
      .p(SPACE[3])
      .gap(SPACE[3])
      .items_start()
      .rounded(SIZE.control)
      .border_1()
      .border_color(on ? alpha(c.accent, 0.4) : alpha(c.ground, 0))
      .when(on, (el) => el.bg(alpha(c.accent, 0.1)))
      .opacity(this.rowsIn === false ? 0 : 1)
      .transition("opacity", { ...MOTION.row, delay: Math.min(i, 8) * MOTION.stagger })
      .on_click((_e, cx) => {
        this.opened = t.id;
        this.commenting = null;
        this.stayClosed = false;
        cx.notify();
      });
  }

  /** The row's right end: the steps' pips with done of all, or with no steps, how old the task is. */
  taskRowEnd(c, t, steps) {
    if (!steps.length) return div().flex_none().text_size(TYPE.xs).text_color(c.muted).child(age(t.updated ?? t.created));
    const done = steps.filter((s) => s.status === "done" || s.status === "skipped").length;
    return h_flex().flex_none().gap(SPACE[2]).items_center()
      .child(pips(c, steps))
      .child(div().text_size(TYPE.xs).text_color(c.muted).child(`${done}/${steps.length}`));
  }

  /** The pane beside the list: the chosen task, its comment box pinned at the foot; or, with none, the prompt. */
  taskPane(c, t, { width, height, narrow }) {
    if (!t) return this.pickPrompt(c, width, height);
    const inner = narrow ? width : Math.max(0, width - SPACE[4]);
    this.taskComposer.placeholder = `Comment on ${t.title ?? t.id}…`;
    return v_flex()
      .id("bh-task-detail")
      .flex_none()
      .w(width)
      .h(height)
      .pl(narrow ? 0 : SPACE[4])
      .child(v_flex().id("bh-task-scroll").flex_1().min_h(0).overflow_y_scroll().pb(SPACE[4]).child(this.taskBody(c, t, narrow)))
      .child(this.taskComposer.render(this.cx, inner + SIZE.gutter * 2, height));
  }

  /** With no task chosen (a wide window): a pointer and the line about choosing one, centred. */
  pickPrompt(c, width, height) {
    return v_flex()
      .flex_none()
      .w(width)
      .h(height)
      .pl(SPACE[4])
      .justify_center()
      .items_center()
      .gap(SPACE[3])
      .child(svg(ICON("pointer")).size(24).text_color(c.faint))
      .child(div().max_w(320).text_center().text_size(TYPE.md).text_color(c.muted).child("Choose a task to see its steps, progress and comments."));
  }

  /** The scrolling part of a task's detail, top to bottom: its actions, title, facts, progress, steps and comments. */
  taskBody(c, t, narrow) {
    const comments = openFirst(t.comments);
    return v_flex()
      .gap(SPACE[4])
      .pb(SPACE[4])
      .when(narrow, (el) => el.child(backLink(c, "bh-task-back", "Back to tasks", (_e, cx) => {
        this.opened = null;
        cx.notify();
      })))
      .child(this.taskActions(c, t))
      .child(this.taskTitle(c, t))
      .child(this.taskFacts(c, t))
      .child(this.taskProgress(c, t))
      .child(this.taskSteps(c, t, comments))
      .when(Boolean(t.plan), (el) => el.child(this.taskFullPlan(c, t)))
      .child(this.taskComments(c, t, comments));
  }

  /** Pause, Archive or Unarchive, and Delete once the task is not running; Resume waits in its own box. */
  taskActions(c, t) {
    const running = t.status === "active";
    const finished = t.status === "done" || t.status === "abandoned";
    return h_flex()
      .flex_wrap()
      .gap(SPACE[2])
      .items_center()
      .when(running, (el) => el.child(this.pauseButton(c, t)))
      .when(!running && !finished && t.status !== "paused", (el) => el.child(this.resumeButton(c, t)))
      .child(this.archiveButton(c, t))
      .when(!running, (el) => el.child(this.taskDelete(c, t)));
  }

  /** Pause: `bh task status paused`, and the composer says so. */
  pauseButton(c, t) {
    return actionButton(c, `bh-pause-${t.id}`, "Pause", (_e, cx) => this.act(["task", "status", t.id, "paused"], cx, (r) => {
      if (r.code === 0) this.taskComposer.say(`Paused ${t.title ?? t.id}`, cx);
    }), { icon: "pause" });
  }

  /** Resume asks the Orchestrator to pick the task up again; the toast says the ask went out. */
  resumeButton(c, t) {
    return actionButton(c, `bh-resume-${t.id}`, "Resume", (_e, cx) => {
      sendFromChat(`Resume task ${t.id}`);
      this.taskComposer.say(`Resumed ${t.title ?? t.id}`, cx);
    }, { icon: "play" });
  }

  /** Archive or Unarchive: the list follows the task to the tab it now lives in, and the composer says which. */
  archiveButton(c, t) {
    const label = t.archived ? "Unarchive" : "Archive";
    return actionButton(c, `bh-arch-${t.id}`, label, (_e, cx) => this.act(["task", t.archived ? "unarchive" : "archive", t.id], cx, (r) => {
      if (r.code !== 0) return;
      this.archived = !t.archived;
      this.taskComposer.say(`${t.archived ? "Unarchived" : "Archived"} ${t.title ?? t.id}`, cx);
    }), { icon: "archive" });
  }

  /** Delete a stopped task: `bh task delete`, then the task below it opens (else the one above), its composer saying "Deleted <title>". */
  taskDelete(c, t) {
    return this.twoStep(c, {
      id: `bh-delete-${t.id}`,
      label: "Delete",
      ask: "Delete for good?",
      icon: "trash",
      run: (cx) => {
        const next = this.neighbourOf(t);
        this.remove(["task", "delete", t.id], this.taskComposer, cx, () => {
          this.opened = next?.id ?? null;
          this.stayClosed = !next;
          if (next) this.taskComposer.say(`Deleted ${t.title ?? t.id}`, cx);
        });
      },
    });
  }

  /** The row after `t` in the list as it is drawn, else the one before it, else none. */
  neighbourOf(t) {
    const list = (this.tasks ?? []).filter((x) => Boolean(x.archived) === this.archived);
    const rows = this.taskGroups(list).flatMap((g) => g.rows);
    const at = rows.findIndex((x) => x.id === t.id);
    if (at < 0) return null;
    return rows[at + 1] ?? rows[at - 1] ?? null;
  }

  /** A delete in two steps: the first click asks "for good?" for a few seconds; the second runs it. A label of null is an icon only: its tip says what is asked. */
  twoStep(c, { id, label, ask, icon, tip = null, run }) {
    const sure = armed(this, "armed", id);
    return actionButton(c, id, label === null ? null : sure ? ask : label, (_e, cx) => {
      if (!sure) return arm(this, "armed", id, cx);
      this.armed = null;
      run(cx);
    }, { icon, tone: "danger", tooltip: label === null && sure ? ask : tip });
  }

  taskTitle(c, t) {
    return h_flex().gap(SPACE[3]).items_center()
      .child(statusMark(c, t.status, 18))
      .child(div().flex_1().min_w(0).text_size(TYPE.xl).font_semibold().line_height(`${LINE.xl}px`).child(t.title ?? t.id));
  }

  /** The status pill, the track, and the Details link that opens what the task is made of. */
  taskFacts(c, t) {
    const open = this.descOpen?.has(`details:${t.id}`);
    return v_flex()
      .gap(SPACE[3])
      .child(h_flex().flex_wrap().gap(SPACE[3]).items_center()
        .child(pill(c, t.status ?? "backlog", statusTone(c, t.status)))
        .when(Boolean(t.track), (el) => el.child(div().text_size(TYPE.sm).text_color(c.muted).child(`${t.track} track`)))
        .child(textLink(c, `bh-task-details-${t.id}`, "Details", (_e, cx) => this.toggleDesc(`details:${t.id}`, cx), open ? c.ink : c.muted)))
      .when(Boolean(open), (el) => el.child(this.taskDetails(c, t)));
  }

  /** The id, when it started, the branch or worktree, and the request without its [task] or [plan] tag. */
  taskDetails(c, t) {
    const req = String(t.request ?? "").replace(/^\s*\[(?:task|plan)\]\s*/i, "");
    const started = day(t.created);
    return v_flex()
      .gap(SPACE[2])
      .text_size(TYPE.sm)
      .text_color(c.muted)
      .child(div().child([t.id, started && `started ${started}`].filter(Boolean).join(" · ")))
      .when(Boolean(t.git?.branch), (el) => el.child(h_flex().gap(SPACE[2]).items_center()
        .child(svg(ICON("folder")).flex_none().size(GLYPH.md).text_color(c.faint))
        .child(div().min_w(0).truncate().child(t.git.mode === "worktree" ? `Worktree ${t.git.path} · branch ${t.git.branch}` : `Branch ${t.git.branch}${t.git.from ? ` (from ${t.git.from})` : ""}`))))
      .when(Boolean(req), (el) => el.child(this.requestText(c, t, req)));
  }

  /** The request as Markdown, shortened to a few lines with Show more. */
  requestText(c, t, req) {
    const key = `task-desc:${t.id}`;
    const open = this.descOpen?.has(key);
    const long = req.length > 220 || req.split("\n").length > 4;
    const text = long && !open ? req.slice(0, 200).replace(/\s+\S*$/, "") + "…" : req;
    return v_flex()
      .gap(SPACE[2])
      .child(div().text_size(TYPE.md).line_height(`${LINE.md}px`).child(TextView.markdown(`bh-task-req-${t.id}-${open ? "o" : "c"}`, text)))
      .when(long, (el) => el.child(textLink(c, `bh-task-req-more-${t.id}`, open ? "Show less" : "Show more", (_e, cx) => this.toggleDesc(key, cx), c.accent)));
  }

  /** Pips with "k of n steps", the paused task's waiting box, and under them how long the task has been worked. */
  taskProgress(c, t) {
    const steps = t.steps ?? [];
    const done = steps.filter((s) => s.status === "done" || s.status === "skipped").length;
    return v_flex()
      .gap(SPACE[2])
      .when(steps.length > 0, (el) => el.child(h_flex().gap(SPACE[3]).items_center()
        .child(pips(c, steps))
        .child(mutedLine(c, `${done} of ${steps.length} steps`))))
      .when(t.status === "paused", (el) => el.child(this.waitingBox(c, t)))
      .child(mutedLine(c, `worked ${duration(workedOf(t))}`));
  }

  /** A paused task waits: a tinted box under the pips that says so and holds Resume. */
  waitingBox(c, t) {
    return v_flex()
      .gap(SPACE[3])
      .py(SPACE[2])
      .child(sectionLabel(c, "Waiting on"))
      .child(v_flex()
        .gap(SPACE[3])
        .p(SPACE[4])
        .rounded(SIZE.control)
        .bg(c.well)
        .border_1()
        .border_color(c.edge)
        .child(div().text_size(TYPE.sm).text_color(c.muted).child("Paused"))
        .child(this.resumeButton(c, t)));
  }

  taskSteps(c, t, comments) {
    const steps = t.steps ?? [];
    const next = steps.find((s) => !["done", "skipped", "active", "blocked"].includes(s.status));
    return v_flex()
      .gap(SPACE[1])
      .child(sectionLabel(c, "Steps"))
      .when(!steps.length, (el) => el.child(mutedLine(c, "No steps yet.")))
      .children(steps.map((s) => this.stepRow(c, t, s, { next: s === next, comments })));
  }

  /** A step: its line, then (for several agents) one line per agent, its comments and the box being written. */
  stepRow(c, t, s, { next, comments }) {
    const notes = comments.filter((x) => x.step === s.n);
    const on = this.addingAt("task", t.id, s.n);
    const who = stepAgents(s);
    return v_flex()
      .flex_none()
      .child(this.stepLine(c, t, s, { next, on, who, live: notes.filter((x) => x.open !== false).length }))
      .when(who.length > 1 && this.descOpen?.has(`step:${t.id}:${s.n}`), (el) => el.children(who.map((name) => this.agentLine(c, name, s.status === "active"))))
      .children(notes.map((x) => this.commentNote(c, x, this.commentActions("task", t.id, x), STEP_TEXT)))
      .when(on, (el) => el.child(this.inlineBox(c).ml(STEP_TEXT)));
  }

  stepLine(c, t, s, { next, on, who, live }) {
    const done = s.status === "done" || s.status === "skipped";
    const time = this.stepTime(s);
    return clickable(
      this.stepFrame(c, t, s, on)
        .child(statusMark(c, s.status, MARK))
        .child(div().flex_none().w(SPACE[5] + SPACE[3]).text_size(TYPE.sm).text_color(c.muted).child(`${s.n}.`))
        .child(div().flex_1().min_w(0).text_size(TYPE.md).line_height(`${LINE.md}px`).text_color(done ? c.muted : c.ink).child(s.title))
        .when(next, (el) => el.child(pill(c, "next", c.accent)))
        .when(who.length > 0 && (s.status === "active" || done), (el) => el.child(this.stepWho(c, t, s, who)))
        .when(Boolean(time), (el) => el.child(div().flex_none().text_size(TYPE.sm).text_color(c.muted).child(time)))
        .when(live > 0, (el) => el.child(commentCount(c, live))),
      c,
      `bh-step-${t.id}-${s.n}`,
    );
  }

  /** A step's line box: its padding, the hover fill while its comment box is open, and a click that starts a comment. */
  stepFrame(c, t, s, on) {
    return h_flex()
      .px(SPACE[2])
      .py(SPACE[2])
      .gap(SPACE[3])
      .items_center()
      .rounded(SIZE.nested)
      .when(on, (el) => el.bg(c.hover))
      .opacity(this.rowsIn === false ? 0 : 1)
      .transition("opacity", { ...MOTION.row, delay: Math.min(s.n, 8) * MOTION.stagger })
      .on_click((_e, cx) => this.startInline("task", t.id, s.n, cx));
  }

  /** How long a step has been worked (its record plus the running part); "" for one not started. */
  stepTime(s) {
    if (!s.workedMs && s.status !== "active") return "";
    return duration((s.workedMs ?? 0) + (s.status === "active" && s.started ? Date.now() - Date.parse(s.started) : 0));
  }

  /** Who works on an active or done step: the first agent, or how many; a working dot while it runs; a chevron when several. */
  stepWho(c, t, s, who) {
    const active = s.status === "active";
    const key = `step:${t.id}:${s.n}`;
    const first = who[0];
    return h_flex().flex_none().gap(SPACE[2]).items_center().text_size(TYPE.sm)
      .child(agentDot(c, first))
      .child(div().text_color(agentInk(c, first)).font_medium().child(who.length > 1 ? `${who.length} ${active ? "working" : "agents"}` : first))
      .when(active && who.length === 1, (el) => el.child(h_flex().gap(SPACE[1]).items_center()
        .child(div().size(DOT).rounded_full().bg(c.success))
        .child(div().text_color(c.muted).child("working"))))
      .when(who.length > 1, (el) => el.child(this.chevron(c, key)));
  }

  /** The disclosure for a step's several agents; its click does not open the step's comment box. */
  chevron(c, key) {
    const open = this.descOpen?.has(key);
    return focusable(
      pressable(div()
        .size(CHIP)
        .flex()
        .items_center()
        .justify_center()
        .rounded(SIZE.nested)
        .text_color(c.muted)
        .hover((s) => s.bg(c.hover).text_color(c.ink))
        .on_click((_e, cx) => {
          cx.stop_propagation();
          this.toggleDesc(key, cx);
        })
        .child(svg(ICON(open ? "chevron-down" : "chevron-right")).size(GLYPH.sm))),
      `bh-chevron-${key}`,
      c,
    );
  }

  /** One agent on a step: its initial, its name and, while it works, a dot and "working". */
  agentLine(c, name, working) {
    return h_flex().pl(STEP_TEXT).py(SPACE[1]).gap(SPACE[2]).items_center().text_size(TYPE.sm)
      .child(agentDot(c, name))
      .child(div().text_color(agentInk(c, name)).child(name))
      .when(working, (el) => el.child(div().size(DOT).rounded_full().bg(c.success)).child(div().text_color(c.muted).child("working")));
  }

  /** A task made from a plan: a section whose row opens that plan's sheet. */
  taskFullPlan(c, t) {
    return v_flex()
      .gap(SPACE[1])
      .child(sectionLabel(c, "Full plan"))
      .child(clickable(
        h_flex()
          .flex_none()
          .px(SPACE[2])
          .py(SPACE[2])
          .gap(SPACE[3])
          .items_center()
          .rounded(SIZE.nested)
          .on_click((_e, cx) => this.openFullPlan(t, cx))
          .child(svg(ICON("chevron-right")).size(GLYPH.md).text_color(c.muted))
          .child(div().text_size(TYPE.md).child("Read the details of each step")),
        c,
        `bh-task-plan-${t.id}`,
      ));
  }

  /** Reads the plan the task came from, then opens it in the plan sheet. */
  openFullPlan(t, cx) {
    this.run(["plan", "show", t.plan, "--json"], cx, (r) => {
      let plan = null;
      try {
        const got = JSON.parse(r.stdout);
        if (got && !Array.isArray(got)) plan = got;
      } catch {
        // no plan: say why below
      }
      if (plan) return openPlan(plan);
      this.taskComposer.say(firstLine(r) || "Couldn't open that plan.", cx, "error");
    });
  }

  /** The task's own comments under Comments, with the add box or its button; the step's comments stay under their steps. */
  taskComments(c, t, comments) {
    const adding = this.addingAt("task", t.id, null);
    return v_flex()
      .gap(SPACE[3])
      .child(sectionLabel(c, "Comments"))
      .when(!comments.length, (el) => el.child(mutedLine(c, "No comments yet. Comment here or in the box below (Markdown and images work there); the Orchestrator takes it into account.")))
      .children(comments.filter((x) => !x.step).map((x) => this.commentNote(c, x, this.commentActions("task", t.id, x), 0)))
      .child(adding
        ? this.inlineBox(c)
        : actionButton(c, `bh-task-add-comment-${t.id}`, "Add comment", (_e, cx) => this.startInline("task", t.id, null, cx), { icon: "comment" }));
  }

  /**
   * A comment of yours under what it is about, with Resolve, Edit and Delete (Reopen and Delete
   * once resolved); the inline box opens under it while it is being edited. `indent` is where it starts.
   */
  commentNote(c, comment, actions, indent = SPACE[5]) {
    const row = commentRow(c, comment, actions, COMMENT_LINKS).ml(indent).mr(SPACE[3]).mb(SPACE[2]);
    return actions.editing ? v_flex().flex_none().child(row).child(this.inlineBox(c).ml(indent).mr(SPACE[3])) : row;
  }

  /** The single-line box for a comment under a step, a task, or a knowledge entry, with Comment and Cancel. */
  inlineBox(c) {
    return h_flex()
      .flex_none()
      .mt(SPACE[2])
      .mb(SPACE[3])
      .gap(SPACE[3])
      .items_center()
      .child(this.inputBox(c, this.inline))
      .child(actionButton(c, "bh-inline-send", "Comment", (_e, cx) => this.sendInline(cx), { tone: "primary" }))
      .child(actionButton(c, "bh-inline-cancel", "Cancel", (_e, cx) => {
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
   * The Plans page, as the planning session: a centred column of your idea, the panel's questions
   * with your answers, and the View plan tab over the box. The rail at the right has the round,
   * the seats (click one to leave it out) and the actions; under NARROW the rail moves above.
   */
  plansView(c, width) {
    if (this.plans === null) return stateView(c, { id: "bh-plans-loading", title: "Loading plans…", loading: true });
    if (!this.plans.length) return this.hero(c, width, "page-plans", "No plans yet", "Type /plan in the chat to start one.");
    const p = this.plan;
    const narrow = this.width < NARROW;
    if (!p) return this.noPlan(c, width, narrow);
    if (narrow) return this.narrowPlan(c, width, p);
    return this.widePlan(c, width, p);
  }

  /** No plan open: the box that starts one, with the other plans beside it (stacked when narrow). */
  noPlan(c, width, narrow) {
    if (narrow) return v_flex().w(width).gap(GAP).child(this.previousList(c, width, null)).child(this.planIntro(c, width));
    return h_flex().w(width).gap(GAP).items_start()
      .child(this.previousList(c, PLAN_LIST_W, null))
      .child(this.planIntro(c, Math.max(0, width - PLAN_LIST_W - GAP)));
  }

  /** A narrow window shows the other plans or the plan, never both; the rail sits above the plan. */
  narrowPlan(c, width, p) {
    if (this.showPrevious) {
      return v_flex().w(width).gap(GAP)
        .child(backLink(c, "bh-plan-back", "Back to the plan", (_e, cx) => {
          this.showPrevious = false;
          cx.notify();
        }))
        .child(this.previousList(c, width, p));
    }
    return this.planColumn(c, width, p, { rail: true });
  }

  /** A wide window: the other plans (when open), the column centred in the rest, and the rail at the right edge. */
  widePlan(c, width, p) {
    const listW = this.showPrevious ? PLAN_LIST_W : 0;
    const colW = Math.max(0, width - RAIL_W - GAP - (listW ? listW + GAP : 0));
    return h_flex()
      .w(width)
      .gap(GAP)
      .items_start()
      .when(listW > 0, (el) => el.child(this.previousList(c, listW, p)))
      .child(v_flex().flex_1().min_w(0).items_center().child(this.planColumn(c, Math.min(PLAN_COL, colW), p, { rail: false })))
      .child(this.planRail(c, p, { horizontal: false }));
  }

  /**
   * The conversation column: the rail across its top when narrow, the title and the conversation
   * scrolling above the box, and the View plan tab on the box's top edge.
   */
  planColumn(c, w, p, { rail }) {
    const planH = Math.max(300, this.height - 110);
    return v_flex()
      .id(`bh-plan-main-${p.id}`)
      .flex_none()
      .w(w)
      .h(planH)
      .gap(SPACE[2])
      .when(rail, (el) => el.child(this.planRail(c, p, { horizontal: true })))
      .child(v_flex().flex_1().min_h(0).overflow_y_scroll().gap(SPACE[4]).pb(SPACE[5])
        .child(this.planTitle(c, p))
        .child(this.planConversation(c, p, w)))
      .child(v_flex()
        .flex_none()
        .w_full()
        .items_center()
        .when(Boolean(p.markdown), (el) => el.child(this.viewPlanTab(c, p)))
        .child(this.planComposer.render(this.cx, w, this.height)));
  }

  /** The plan's title in the heading size, with its status pill on the same line. */
  planTitle(c, p) {
    const status = p.status ?? "grilling";
    return h_flex().flex_none().gap(SPACE[3]).items_center()
      .child(div().flex_1().min_w(0).truncate().text_size(TYPE.lg).font_semibold().child(p.title || p.idea || p.id))
      .child(pill(c, PLAN_STATUS[status]?.label ?? status, planTone(c, status), { pulse: status === "grilling" }));
  }

  /** The tab on the box's top edge that opens the plan as a sheet: it tucks into the box, then the sheet slides in. */
  viewPlanTab(c, p) {
    return clickable(
      h_flex()
        .relative()
        .flex_none().h(CONTROL).px(SPACE[4]).gap(SPACE[2]).items_center()
        .rounded_t(SIZE.radius).border_1().border_color(c.edge).bg(c.fill)
        .text_size(TYPE.sm).font_medium().text_color(c.muted).hover((s) => s.text_color(c.ink))
        .top(this.tucking ? CONTROL : 0)
        .transition("top", MOTION.press)
        .on_click((_e, cx) => this.tuckThenPlan(p, cx))
        .child(svg(ICON("file")).size(GLYPH.md))
        .child("View plan"),
      c,
      "bh-view-plan",
    );
  }

  /** The tab goes down behind the box, and a moment later the sheet opens over the page. */
  tuckThenPlan(p, cx) {
    if (this.tucking) return;
    this.tucking = true;
    cx.notify();
    cx.timer.after(MOTION.press.duration + 60, (cx) => {
      this.tucking = false;
      cx.notify();
      openPlan(p);
    });
  }

  /** An empty page: its icon on a tinted tile, a title and one line, centred (Tasks and Plans). */
  hero(c, width, icon, title, line) {
    return v_flex()
      .w(width)
      .pt(SPACE[5] * 2)
      .items_center()
      .gap(SPACE[4])
      .child(div().size(48).rounded(SIZE.radius).flex().items_center().justify_center().bg(alpha(c.accent, 0.14)).border_1().border_color(alpha(c.accent, 0.3)).text_color(c.accent)
        .child(svg(ICON(icon)).size(24)))
      .child(div().text_size(TYPE.xl).font_semibold().child(title))
      .when(Boolean(line), (el) => el.child(div().text_center().text_size(TYPE.md).text_color(c.muted).child(line)));
  }

  /** Before any plan: one line asking what to plan, and a box that starts it. */
  planIntro(c, width) {
    const w = Math.min(900, width);
    return v_flex()
      .w(width)
      .pt(SPACE[5] * 2)
      .items_center()
      .gap(SPACE[4])
      // The page's mark: the map on a tinted tile.
      .child(div().size(48).rounded(SIZE.radius).flex().items_center().justify_center().bg(alpha(c.accent, 0.14)).border_1().border_color(alpha(c.accent, 0.3)).text_color(c.accent)
        .child(svg(ICON("page-plans")).size(24)))
      .child(div().text_size(TYPE.xl).font_semibold().child("What are we planning?"))
      .child(div().mt(SPACE[3]).w(w).child(this.planComposer.render(this.cx, w, this.height)));
  }

  startPlan(cx) {
    const idea = this.idea.value().trim();
    if (!idea) return;
    this.idea.set_value("");
    sendFromChat(`/plan ${idea}`);
    cx.notify();
  }

  /** The other plans as rows on the page (the selected one with an accent tint), then "New plan". */
  previousList(c, w, p) {
    return v_flex()
      .flex_none()
      .w(w)
      .gap(SPACE[1])
      .child(sectionLabel(c, "Plans"))
      .children(this.plans.map((x, i) => this.previousRow(c, x, i, p?.id === x.id)))
      .child(actionButton(c, "bh-plan-new-row", "New plan", (_e, cx) => this.startNewPlan(cx), { icon: "file-plus", tone: "quiet" }));
  }

  previousRow(c, x, i, on) {
    return clickable(
      this.previousFrame(c, x.id, on, i)
        .child(div().truncate().text_size(TYPE.md).font_medium().text_color(x.status === "archived" ? c.faint : c.ink).child(x.title ?? x.id))
        .child(previousMeta(c, x)),
      c,
      `bh-plan-${x.id}`,
      { fill: on ? alpha(c.accent, 0.14) : null },
    );
  }

  /** A plan's row box: the accent tint and edge when it is the one open, and a click that opens it. */
  previousFrame(c, id, on, i) {
    return v_flex()
      .px(SPACE[3])
      .py(SPACE[2])
      .gap(SPACE[1])
      .rounded(SIZE.control)
      .border_1()
      .border_color(on ? alpha(c.accent, 0.4) : alpha(c.ground, 0))
      .when(on, (el) => el.bg(alpha(c.accent, 0.1)))
      .opacity(this.rowsIn === false ? 0 : 1)
      .transition("opacity", { ...MOTION.row, delay: Math.min(i, 8) * MOTION.stagger })
      .on_click((_e, cx) => this.pickPlan(id, cx));
  }

  /** Opens a plan from the list; on a narrow window the list steps aside for it. */
  pickPlan(id, cx) {
    this.planId = id;
    keep("plan", id);
    if (this.width < NARROW) this.showPrevious = false;
    this.reload(cx);
  }

  /** Your idea as a bubble on the right (as the chat draws yours), then the panel's question sets: the newest in full, older ones one line per question. */
  planConversation(c, p, width) {
    const asked = Array.isArray(p.asked) ? p.asked : [];
    const newest = asked.length - 1;
    return v_flex()
      .flex_none()
      .gap(SPACE[4])
      .child(this.ideaBubble(c, p, width))
      .children(asked.map((q, i) => (i === newest ? this.questionSet(c, q) : this.answeredSet(c, q))))
      .when(!asked.length && !p.markdown, (el) => el.child(h_flex().gap(SPACE[3]).items_center()
        .child(div().size(DOT).rounded_full().bg(c.accent).loop("opacity", { from: 0.3, to: 1, period: 1200, easing: "ease-in-out" }))
        .child(mutedLine(c, "Reading the code…"))));
  }

  /** An older round of questions: one line each, as the auto-answered line in the GIF. */
  answeredSet(c, q) {
    return v_flex()
      .flex_none()
      .gap(SPACE[2])
      .children((q.questions ?? []).map((x, i) => this.answeredRow(c, q, x, i)));
  }

  /** A collapsed question: a check, its seat in the seat's colour, the question, the answer in semibold, and what the user typed under it. */
  answeredRow(c, q, x, i) {
    const { picked, typed } = answerOf(q, i);
    const seat = x.seat ? String(x.seat) : "";
    const tone = mentionTone(c, seat || q.fromName || "The panel");
    return v_flex()
      .flex_none()
      .gap(SPACE[1])
      .child(h_flex().flex_none().gap(SPACE[2]).items_baseline()
        .child(svg(ICON("check")).flex_none().size(GLYPH.md).text_color(c.muted))
        .when(Boolean(seat), (el) => el.child(div().flex_none().text_size(TYPE.sm).font_semibold().text_color(tone).child(seatName(seat))))
        .child(h_flex().flex_1().min_w(0).flex_wrap().gap(SPACE[2]).items_baseline()
          .child(div().text_size(TYPE.md).line_height(`${LINE.md}px`).child(x.text))
          .when(picked.length > 0, (el) => el.child(div().text_size(TYPE.md).font_semibold().child(picked.join(", "))))))
      .when(Boolean(typed), (el) => el.child(div().ml(GLYPH.md + SPACE[2]).text_size(TYPE.sm).text_color(c.muted).child(`You: ${typed}`)));
  }

  ideaBubble(c, p, width) {
    return h_flex().justify_end().child(
      div()
        .max_w(Math.round(width * 0.7))
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
  }

  /** One round of the panel's questions: its label in accent and the count, then each question. */
  questionSet(c, q) {
    const n = q.questions?.length ?? 0;
    return v_flex()
      .flex_none()
      .gap(SPACE[3])
      .child(h_flex().gap(SPACE[2]).items_center()
        .child(div().text_size(TYPE.sm).font_semibold().text_color(c.accent).child("Panel"))
        .child(mutedLine(c, `${n} question${n === 1 ? "" : "s"}`)))
      .children((q.questions ?? []).map((x, i) => this.questionRow(c, q, x, i)));
  }

  /** A question: its seat's colour edge and name, the question, its options, the mockups, and what was answered. */
  questionRow(c, q, x, i) {
    const { picked, typed } = answerOf(q, i);
    const seat = x.seat ? String(x.seat) : "";
    const tone = mentionTone(c, seat || q.fromName || "The panel");
    const mocks = (x.options ?? []).some((o) => o.mockupFile);
    return v_flex()
      .flex_none()
      .pl(SPACE[3])
      .gap(SPACE[2])
      .border_l(2)
      .border_color(alpha(tone, 0.55))
      .child(h_flex().flex_wrap().gap(SPACE[2]).items_baseline()
        .when(Boolean(seat), (el) => el.child(div().flex_none().text_size(TYPE.sm).font_semibold().text_color(tone).child(seatName(seat))))
        .child(div().flex_1().min_w(0).text_size(TYPE.md).line_height(`${LINE.md}px`).child(x.text)))
      .when((x.options ?? []).length > 0, (el) => el.child(this.optionRow(c, x, picked)))
      .when(mocks, (el) => el.child(this.mockupRow(c, q, x, i)))
      .when(Boolean(typed), (el) => el.child(mutedLine(c, `You: ${typed}`)))
      .when(q.status === "open" && !picked.length && !typed, (el) => el.child(mutedLine(c, "Waiting for your answer in the chat")));
  }

  /** The options as text runs: "Label — meaning", the picked one with a check, the rest muted. */
  optionRow(c, x, picked) {
    return h_flex().flex_wrap().gap(SPACE[4]).items_center()
      .children(x.options.map((o) => this.optionRun(c, o, picked.includes(o.label))));
  }

  optionRun(c, o, on) {
    return h_flex().flex_none().gap(SPACE[2]).items_center().text_size(TYPE.md)
      .when(on, (el) => el.child(svg(ICON("check")).size(GLYPH.md).text_color(c.ink)))
      .child(div().font_medium().text_color(on ? c.ink : c.muted).child(o.label))
      .when(Boolean(o.meaning), (el) => el.child(div().text_size(TYPE.sm).text_color(c.muted).child(`— ${o.meaning}`)))
      .when(Boolean(o.recommended), (el) => el.child(svg(ICON("star")).size(GLYPH.xs).text_color(c.warning)));
  }

  /** The options' mockups as thumbnails with numbered captions; a click opens them large, one after another. */
  mockupRow(c, q, x, i) {
    const shown = x.options.map((o, k) => ({ o, k, d: o.mockupFile ? mockupFile(o.mockupFile, this.cx) : null })).filter((y) => y.d);
    const ready = shown.filter((y) => y.d.state === "ready");
    const who = q.fromName || "The panel";
    const items = ready.map((y) => ({ image: y.d.image, title: y.o.label, note: `${who} · ${x.text}`, html: y.o.mockupFile, glyph: y.k + 1 }));
    return h_flex().flex_wrap().gap(SPACE[3]).items_start()
      .children(shown.map((y) => this.mockupTile(c, y, `${q.id}-${i}-${y.k}`, items, ready.indexOf(y))));
  }

  mockupTile(c, y, key, items, at) {
    return v_flex()
      .flex_none()
      .w(MOCK_W)
      .gap(SPACE[2])
      .child(this.mockupFrame(c, y, key, items, at))
      .child(div().text_size(TYPE.xs).text_color(c.muted).child(`${y.k + 1}. ${y.o.label}`));
  }

  /** The thumbnail box: the picture when drawn (a click opens the set large), else its state. */
  mockupFrame(c, y, key, items, at) {
    const ready = y.d.state === "ready";
    return clickable(
      div()
        .relative().w(MOCK_W).h(MOCK_H).rounded(SIZE.control).bg(c.well).border_1().border_color(c.edge)
        .overflow_hidden().flex().items_center().justify_center()
        .when(ready, (el) => el.child(image(y.d.image).w(MOCK_W - 2).h(MOCK_H - 2)).child(this.expandGlyph(c)))
        .when(!ready, (el) => el.child(this.mockupStatus(c, y, key)))
        .on_click(() => { if (ready) openLightbox({ items, at }); }),
      c,
      `bh-plan-mock-${key}`,
    );
  }

  expandGlyph(c) {
    return div()
      .absolute()
      .top(SPACE[2])
      .right(SPACE[2])
      .size(CHIP)
      .rounded(SIZE.nested)
      .bg(c.fill)
      .flex()
      .items_center()
      .justify_center()
      .child(svg(ICON("expand")).size(GLYPH.sm).text_color(c.muted));
  }

  /** A thumbnail not drawn yet, or one that failed: its state, and for a failure a link to open it in the browser. */
  mockupStatus(c, y, key) {
    if (y.d.state !== "failed") return mutedLine(c, "Drawing…");
    return v_flex().items_center().gap(SPACE[2]).px(SPACE[3])
      .child(mutedLine(c, "Couldn't draw it here"))
      .child(textLink(c, `bh-plan-mock-open-${key}`, "Open in browser", (_e, cx) => {
        cx.stop_propagation();
        openInBrowser(y.o.mockupFile, cx);
      }));
  }

  /**
   * The rail: the round in a ring, the panel's seats (a click leaves one out or puts it back), a
   * rule, then the actions. Across the top when horizontal (a narrow window).
   */
  planRail(c, p, { horizontal }) {
    const off = new Set(p.off ?? []);
    const round = Math.max(1, p.round ?? 0);
    return (horizontal ? h_flex().flex_wrap().w_full() : v_flex().flex_none().w(RAIL_W))
      .items_center()
      .gap(SPACE[2])
      .when(!horizontal, (el) => el.gap(SPACE[3]))
      .child(div().tooltip(`Round ${round}`).flex_none().size(32).rounded_full().border_1().border_color(c.edge).flex().items_center().justify_center()
        .text_size(TYPE.sm).font_semibold().child(String(round)))
      .children(SEATS.map((seat) => this.seatPill(c, p, seat, off.has(seat.id))))
      .child(div().flex_none().bg(c.edge)
        .when(horizontal, (el) => el.w(HAIR).h(CONTROL))
        .when(!horizontal, (el) => el.w(CONTROL + SPACE[2]).h(HAIR)))
      .children(this.railActions(c, p));
  }

  /** A seat's pill: its three letters in the seat's colour on a tint when on, faint with no fill when off, and a badge of its open questions. */
  seatPill(c, p, seat, off) {
    const hue = agentHue(seat.id, c.accent);
    const on = !off;
    const el = this.seatFace(c, seat, { hue, on, waiting: waitingFor(p, seat.id) });
    if (seat.fixed) return el;
    return focusable(
      pressable(el.hover((s) => s.bg(on ? alpha(hue, 0.22) : c.hover)).on_click((_e, cx) => {
        this.act(["plan", "seat", p.id, seat.id, off ? "--on" : "--off"], cx);
      })),
      `bh-seat-${seat.id}`,
      c,
    );
  }

  /** A seat's three letters on its pill: in the seat's colour on a tint when on, faint with no fill when off. */
  seatFace(c, seat, { hue, on, waiting }) {
    return h_flex()
      .relative()
      .flex_none()
      .w(40)
      .h(CONTROL)
      .justify_center()
      .items_center()
      .rounded(SIZE.control)
      .border_1()
      .border_color(on ? alpha(hue, 0.45) : c.edge)
      .bg(on ? alpha(hue, 0.14) : alpha(c.ground, 0))
      .text_size(TYPE.xs)
      .font_semibold()
      .text_color(on ? agentInk(c, seat.id) : c.faint)
      .tooltip(`${seat.name}${on ? "" : " (off)"}`)
      .child(seat.short)
      .when(waiting > 0, (x) => x.child(seatBadge(c, waiting)));
  }

  /** The rail's icon actions: Other plans, New plan, and Discard (two steps, like Delete). */
  railActions(c, p) {
    return [this.otherPlansButton(c), this.newPlanButton(c), this.discardPlanButton(c, p)];
  }

  otherPlansButton(c) {
    return actionButton(c, "bh-plan-prev", null, (_e, cx) => {
      this.showPrevious = !this.showPrevious;
      cx.notify();
    }, { icon: "history", tone: this.showPrevious ? "secondary" : "quiet", tooltip: "Other plans" });
  }

  newPlanButton(c) {
    return actionButton(c, "bh-plan-new", null, (_e, cx) => this.startNewPlan(cx), { icon: "file-plus", tone: "quiet", tooltip: "New plan" });
  }

  /** Discard: `bh plan delete` (the plan's open questions go with it); then the next plan opens, or the empty page. */
  discardPlanButton(c, p) {
    return this.twoStep(c, {
      id: "bh-plan-discard",
      label: null,
      ask: "Click again to discard it for good",
      icon: "trash",
      tip: "Discard plan",
      run: (cx) => this.remove(["plan", "delete", p.id], this.planComposer, cx, () => {
        this.planId = null;
        keep("plan", null);
        this.plan = null;
      }),
    });
  }

  /** The box that starts a new plan: the page shows the intro until the idea is sent. */
  startNewPlan(cx) {
    this.planId = "__new";
    this.plan = null;
    cx.notify();
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
    if (this.editing) {
      const who = (this.agent ?? "orchestrator");
      return v_flex().w(width).gap(SPACE[3])
        .child(h_flex().gap(SPACE[3]).items_center()
          .child(div().text_size(TYPE.lg).font_semibold().child(who.charAt(0).toUpperCase() + who.slice(1)))
          .child(div().flex_1())
          .child(actionButton(c, "bh-know-undo", "Cancel", (_e, cx) => {
            this.editor.set_value(this.knownText ?? "");
            this.editing = false;
            cx.notify();
          }))
          .when(this.knownText !== null && this.editor.value() !== this.knownText, (x) => x.child(actionButton(c, "bh-know-save", "Save", (_e, cx) => this.saveKnowledge(cx), { tone: "primary" }))))
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
        })))
        .child(actionButton(c, "bh-know-new-open", "New note", () => openNoteForm({
          agents,
          agent: this.agent ?? (filter.size === 1 ? [...filter][0] : "orchestrator"),
          dir: this.dir,
        }), { tone: "primary" })))
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
              .child(actionButton(c, `bh-know-del-yes-${e.line}`, "Delete", (_ev, cx) => { cx.stop_propagation(); this.deleteEntry(agent, e, cx); }, { tone: "danger" }))
              .child(actionButton(c, `bh-know-del-no-${e.line}`, "Keep", (_ev, cx) => { cx.stop_propagation(); this.confirmDelete = null; cx.notify(); }))
            : focusable(
              pressable(
                div().size(CHIP).flex().items_center().justify_center().rounded(SIZE.nested).text_color(c.faint).hover((s) => s.bg(c.well).text_color(c.danger))
                  .on_click((_ev, cx) => { cx.stop_propagation(); this.confirmDelete = `${agent}:${e.line}`; this.agent = agent; cx.notify(); })
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
}
