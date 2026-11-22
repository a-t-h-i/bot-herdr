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
import { settings, shared, terminals } from "herdr";
import { SIZE, ICON, TYPE, TYPE_SCALE, LINE, SPACE, CONTROL, CHIP, TARGET, GLYPH, MARK, DOT, PIP, HAIR, MOTION, HIGHLIGHT_MS, RADIUS, STATE, agentInk, stateTone, clickable, pressable, focusable, foldRegion, looping, reducedMotion } from "./look.js";
import { actionButton } from "./button.js";
import { segmented, stateView, pill, filterChip, chipHasResults } from "./switch.js";
import { commentRow, openFirst, openPlan, sectionLabel, COMMENT_LINKS, arm, armed, startMenuTrigger, startMenuPanel, issueChips } from "./plandoc.js";
import { colors } from "./theme.js";
import { openTerminal, sendFromChat, showPage, startPlanTask, viewShown, wakeGoal, OPEN_TASK } from "./pages.js";
import { ROSTER_KEY, roster, slug } from "./roster.js";
import { bh, bhJson, enc, projectDir } from "./bh.js";
import { outline, notesOn } from "./doc.js";
import { hash, linkFiles } from "./feed.js";
import { alpha } from "./working.js";
import { mentionTone } from "./indicators.js";
import { MarkdownEditor } from "./mdedit.js";
import { openNoteForm, NOTE_ADDED } from "./noteform.js";
import { Composer } from "./composer.js";
import { messageText } from "./route.js";
import { mockupFile, openInBrowser } from "./media.js";
import { openLightbox } from "./lightbox.js";
import { openFile, openLink } from "./viewer.js";
import { OpenQuestions, publishCounts } from "./questions.js";
import { seatStates, seatsOf, boardAge, newlyDone } from "./signals.js";
import { cardKeysActive, isChord, keyName } from "./rowkeys.js";
import { stepAgents, usageText } from "./steps.js";
import { skillsLine } from "./skillsview.js";
import {
  STATUS_CHIPS,
  BOARD_KINDS,
  taskSummaryFallback,
  chipCounts,
  filterTasks,
  groupTasks,
  progressModel,
  goalProgressModel,
  goalCriterionBadge,
  gateBadge,
  allowedActionsFallback,
  stepActions,
  terminalForStep,
  detailTabCounts,
  filterBoard,
  nextRefreshAction,
  formatUsd,
  formatWorked,
  stepEventTone,
  mutationError,
  chipForTask,
  nextOpenedOnChip,
  formatTaskSkills,
} from "./tasksview.js";
import { duration, ago } from "./numbers.js";
import { machineLine, markdownWithFoldedCode, toggleMachine } from "./machinetext.js";
import { machineKind } from "./machinefold.js";

const TABS = [
  { id: "tasks", icon: "page-tasks", label: "Tasks" },
  { id: "plans", icon: "page-plans", label: "Plans" },
  { id: "knowledge", icon: "page-knowledge", label: "Knowledge" },
];
const CHIP_LABELS = { active: "Active", blocked: "Blocked", done: "Done", archived: "Archived" };
const LIST_W = 330;
const NARROW = 720; // under this window width a page shows its list or its detail, not both
const RAIL_W = 52;
const PLAN_COL = 810; // the Plans column is at most this wide
const PLAN_LIST_W = 250; // the other plans, beside the column
const MOCK_W = 120; // a question's mockup thumbnail
const MOCK_H = 82;

/** How each plan status reads, and its colour token. */
const PLAN_STATUS = {
  grilling: { label: "Being planned", tone: "warning" },
  ready: { label: "Ready", tone: "success" },
  task: { label: "Became a task", tone: "info" },
  archived: { label: "Archived", tone: "faint" },
};
const planTone = (c, status) => c[PLAN_STATUS[status]?.tone] ?? c.muted;

/** The panel that plans with you, in the order it sits: the built-in seats, then the team's custom agents. */
const seats = () => seatsOf(roster(shared(ROSTER_KEY), []));


const GAP = 14;
const MAX = 1140;
const REFRESH_MS = 4000;
const QUESTIONS_MS = 2500; // the chat's cadence, so a card answered on one page goes from the others together
const UNDO_MS = 5000; // how long a Knowledge entry/note delete offers inline Undo
const PAGE_CHROME = SPACE[5] + CONTROL + GAP; // the page's top padding, its tab bar, and the gap under it

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

/** Time worked in one short word (numbers.js); kept exported here for the rows that read it. */
export { duration };
/** How old something is, in one short word: now, 40s, 3m, 4h, 3d. */
export const age = ago;

const day = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const firstLine = (r) => (r.stderr || r.stdout || "").trim().split("\n")[0];

/** A composer for a page's box: `onSend(text, cx)` gets what was written, with each attached file's path on a line of its own as the chat sends them, after the box is cleared; `onAnswer(q, answers, cx)` gets what was answered on its question cards. */
function pageComposer(given, cx, { minRows, placeholder, onSend, onAnswer }) {
  const comp = new Composer({});
  comp.init(given, cx);
  comp.minRows = minRows;
  comp.placeholder = placeholder;
  comp.hooks.answered = onAnswer ? (q, answers, cx) => onAnswer(q, answers, cx) : undefined;
  comp.send = (cx) => {
    const text = messageText(comp.input.value().trim(), comp.files.map((f) => f.path));
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

/** Which state a task's status draws as (look.js STATE has the one glyph and tone per state). */
const STATUS_STATE = { done: "done", active: "working", now: "working", paused: "paused", blocked: "needsYou", abandoned: "idle", skipped: "idle" };

/**
 * A task's status as the state language's one glyph in its tone: ● working, ◆ needs you, ✓ done,
 * ‖ paused, ○ idle. The same mark on every page and surface, and one element, not a ring and its
 * contents (Foundations › State language).
 */
function statusMark(c, status, size = GLYPH.lg) {
  const key = STATUS_STATE[status] ?? "idle";
  return div()
    .flex_none()
    .w(size)
    .text_size(size)
    .line_height(`${size}px`)
    .text_center()
    .text_color(stateTone(c, key))
    .child(STATE[key].glyph);
}

/** Resolves a semantic tone key ("success" | "warning" | "danger" | "accent" | "muted") to a theme colour. */
function toneColor(c, tone) {
  return { success: c.success, warning: c.warning, danger: c.danger, accent: c.accent, muted: c.muted }[tone] ?? c.muted;
}

/** Compact 5px progress bar replacing wide pip strips on task rows. */
function progressBar(c, prog) {
  const fill = toneColor(c, prog.tone);
  return div()
    .flex_1()
    .min_w(36)
    .h(5)
    .rounded_full()
    .bg(c.edge)
    .overflow_hidden()
    .when(prog.pct > 0, (el) => el.child(div().h_full().w(`${prog.pct}%`).rounded_full().bg(fill)));
}

/** A status's word: working the accent, done the success tone, blocked amber, paused muted. */
function statusTone(c, status) {
  return { active: stateTone(c, "working"), done: stateTone(c, "done"), blocked: stateTone(c, "needsYou"), paused: stateTone(c, "paused"), abandoned: c.faint }[status] ?? stateTone(c, "idle");
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

/** How many of a step's comments are still open, in accent with the comment glyph. */
function commentCount(c, n) {
  return h_flex().flex_none().gap(SPACE[1]).items_center().text_size(TYPE.xs).text_color(c.accent)
    .child(svg(ICON("comment")).size(GLYPH.sm))
    .child(String(n));
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

/** A seat's state in words, as its tooltip reads it out. */
const SEAT_STATE = { working: "working", done: "done", none: "not started" };

/** A seat's state from its terminal: a breathing dot at work (no lower than 0.75, so it keeps 3:1), a check once it answered, a quiet ring before it starts. */
function seatMark(c, state) {
  if (state === "working") {
    return looping(div().flex_none().size(DOT).rounded_full().bg(stateTone(c, "working")), "opacity", { from: 0.75, to: 1, period: 1600, easing: "ease-in-out" });
  }
  if (state === "done") return svg(ICON("check")).flex_none().size(GLYPH.xs).text_color(stateTone(c, "done"));
  return div().flex_none().size(DOT).rounded_full().border_1().border_color(stateTone(c, "idle"));
}

/** What the user answered to question `i` of a set: the options picked, and the words typed. */
function answerOf(q, i) {
  const a = q.answers?.[i] ?? {};
  return { picked: [...(a.picks ?? [])], typed: String(a.text ?? "").trim() };
}

/** A seat's name as the page writes it: "Orchestrator", "QA", or the word itself capitalised. */
function seatName(seat) {
  const key = String(seat ?? "").toLowerCase();
  return seats().find((s) => s.id === key)?.name ?? key.charAt(0).toUpperCase() + key.slice(1);
}

export class Work {
  init(given, cx) {
    // Each page is its own block (props.tab); without one, a tab row switches between them.
    this.fixed = TABS.some((t) => t.id === given?.tab) ? given.tab : null;
    this.tab = this.fixed ?? load("tab", "tasks");
    this.width = 900;
    this.height = 700;
    this.dir = null; // the project folder the data is from
    this.machineOpen = new Set(); // the machine-text lines the user expanded (branch names, contracts, stacks)
    this.tasks = null;
    this.taskDetail = null; // full `bh task show` record for the currently opened task
    this.taskDetailId = null;
    this.pendingDetailId = null;
    this.detailReqSeq = 0;
    this.plans = null;
    this.planStartOpen = false;
    this.goalStripCollapsed = false;
    this.goalVerifying = false;
    this.expandedCriteria = new Set();
    this.kinds = null; // knowledge files: [{ agent, entries, chars, over }]
    this.archived = false;
    this.taskChip = "active"; // active | blocked | done | archived
    this.detailTab = "steps"; // steps | board | comments | plan
    this.boardKind = "all";
    this.expandedSteps = new Set(); // expanded step numbers for the opened task
    this.expandedTaskId = null;
    this.creatingTask = false;
    this.creatingBusy = false;
    this.commentStep = null; // { n, title } when composer targets one step
    this.opened = null; // task id shown open
    this.stayClosed = false; // no task opens on its own: one was just deleted, or the list was picked
    this.plan = null; // the plan shown: its full record
    this.planId = load("plan", null);
    this.agent = load("agent", null); // the knowledge file shown
    this.knownText = null; // the file as loaded, to tell an edit from it
    this.editing = false; // the knowledge file open as text, to rewrite it
    this.confirmDelete = null; // "agent:line" of the record whose Delete asks first
    this.actionsOn = new Set(); // Knowledge cards whose Edit/Delete show on hover, focus or a key on the card
    this.knowHandles = new Map(); // Knowledge card focus handles (key -> { card, edit, del }), created outside render
    this.knowHandleSync = false;
    this.knowUndos = []; // inline 5 s Undo records for Knowledge entry/note deletes
    this.seenStepsDone = new Map(); // task id -> Map(stepKey -> boolean) for 2 s finish highlight
    this.stepFinishing = new Map(); // `${taskId}:${stepN}` -> "on" | "fade"
    this.typingCount = 0; // focused text inputs on Work (so view-local `?` stands down)
    this.armed = null; // a two-step action waiting for its second click (see arm)
    this.notes = [];
    this.busy = false;
    this.reloadQueued = false;
    this.problem = null; // a page load that failed
    this.taskActionError = null; // a task command that failed: kept until the next action or Dismiss
    this.openWanted = null; // a task Chat asked to open, until the list knows its status chip
    this.descOpen = new Set(); // details and steps the user opened
    const track = (state) => {
      state.on("focus", () => { this.typingCount++; });
      state.on("blur", () => { this.typingCount = Math.max(0, this.typingCount - 1); });
      return state;
    };
    this.comment = track(InputState.new({ placeholder: "Comment" }));
    this.idea = track(InputState.new({ placeholder: "What should the team plan?" }));
    this.idea.on("submit", (_e, cx) => this.startPlan(cx));
    this.taskSearch = track(InputState.new({ placeholder: "Search tasks…" }));
    this.taskSearch.on("change", (_e, cx) => cx.notify());
    this.newTaskInput = track(InputState.new({ placeholder: "Describe the new task…" }));
    this.newTaskInput.on("submit", (_e, cx) => this.createTask(cx));
    this.showPrevious = false; // the Plans page's list of plans, from the rail
    this.tucking = false; // the View plan tab has tucked into the composer (its sheet opens next)
    this.pageKey = null; // the page/tab drawn last: rows stagger when it changes
    this.rowsIn = true; // false for the one frame a freshly opened list is still hidden
    this.comment.on("submit", (_e, cx) => this.sendComment(cx));
    // A comment on one line of a plan, or one step of a task: { kind: "plan" | "task", id, at }.
    this.commenting = null;
    this.inline = track(InputState.new({ placeholder: "Comment" }));
    this.inline.on("submit", (_e, cx) => this.sendInline(cx));
    this.editor = new MarkdownEditor({ value: "", placeholder: "The file itself, as Markdown" });
    this.editor.on("change", (_value, cx) => cx.notify());
    this.knowSearch = track(InputState.new({ placeholder: "Search notes" }));
    this.knowSearch.on("change", (_e, cx) => cx.notify());
    this.knowFilter = new Set();
    this.noteAddedAt = /** @type {{ at?: number } | null} */ (shared(NOTE_ADDED))?.at ?? 0;
    this.handle = cx.focus_handle(); // holds the keyboard while the Plans box is folded
    this.open = new OpenQuestions(); // the agents' open questions, read here as the chat reads them
    this.wasActive = false;
    this.seatSig = ""; // the panel's seat states drawn last, so a change redraws the rail
    // Plans are written at length: the Plans page's box starts taller than the chat's.
    this.planComposer = pageComposer(given, cx, {
      minRows: 2,
      placeholder: "Describe what to plan, or answer the panel…",
      onSend: (text, cx) => this.sendPlanText(text, cx),
      onAnswer: (q, answers, cx) => this.answerQuestion(this.planComposer, q, answers, cx),
    });
    // The task's box at the foot of its detail: starts folded, expands on click or step Comment.
    this.taskComposer = pageComposer(given, cx, {
      minRows: 1,
      placeholder: "Comment on the task…",
      onSend: (text, cx) => this.sendTaskComment(cx, text),
      onAnswer: (q, answers, cx) => this.answerQuestion(this.taskComposer, q, answers, cx),
    });
    this.taskComposer.expanded = false;
    this.readQuestions(cx);
    cx.timer.every(QUESTIONS_MS, (cx) => {
      if (viewShown(this.fixed ?? "work")) this.readQuestions(cx);
    });
    this.reload(cx);
    cx.timer.every(REFRESH_MS, (cx) => {
      if (viewShown(this.fixed ?? "work")) this.reload(cx);
    });
  }

  // ── Data ───────────────────────────────────────────────────────────────────────────────────

  reload(cx) {
    const step = nextRefreshAction({ busy: this.busy, queued: this.reloadQueued }, "start");
    this.busy = step.state.busy;
    this.reloadQueued = step.state.queued;
    if (step.action !== "run") return;
    const dir = projectDir();
    cx.spawn(async (cx) => {
      try {
        this.cx = cx;
        this.switchTo(dir);
        if (this.tab === "tasks") await this.loadTasks(dir);
        if (this.tab === "plans") await this.loadPlans(dir);
        if (this.tab === "knowledge") await this.loadKnowledge(dir);
      } finally {
        const done = nextRefreshAction({ busy: this.busy, queued: this.reloadQueued }, "finish");
        this.busy = done.state.busy;
        this.reloadQueued = done.state.queued;
        cx.notify();
        if (done.action === "rerun") this.reload(cx);
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
    this.taskDetail = null;
    this.taskDetailId = null;
    this.expandedSteps = new Set();
    this.expandedTaskId = null;
    this.creatingTask = false;
    this.commentStep = null;
    this.plans = null;
    this.knowAll = null;
    this.plan = null;
    this.knownText = null;
  }

  /** Two-tier task load: lightweight `--summary` list (legacy fallback), then `bh task show` for the opened task. */
  async loadTasks(dir) {
    let got = await bhJson(["task", "list", "--summary", "--all"], { cwd: dir });
    if (got === null) got = await bhJson(["task", "list", "--all"], { cwd: dir });
    if (dir !== projectDir()) return;
    const list = Array.isArray(got) ? got.map(taskSummaryFallback) : [];
    this.tasks = list;
    this.problem = got ? null : "Couldn't read the tasks. Is node on your PATH?";
    this.alignChip(list);
    this.openWanted = null;
    const id = this.pickOpenedId(list);
    if (id) await this.fetchTaskDetail(id, dir, this.cx);
    else {
      this.taskDetail = null;
      this.taskDetailId = null;
    }
  }

  /** Keeps the chip showing the open task: one opened from Chat is not hidden by the `active` chip. */
  alignChip(list) {
    const found = (list ?? []).find((t) => t.id === this.opened);
    if (!found || filterTasks([found], { chip: this.taskChip }).length) return;
    this.taskChip = chipForTask(found);
    this.archived = this.taskChip === "archived";
  }

  /** Resolves which task id should be open right now, keeping a live selection or picking the top match. */
  pickOpenedId(list) {
    if (this.opened && list.some((t) => t.id === this.opened)) return this.opened;
    if (this.stayClosed || this.width < NARROW) return null;
    const visible = filterTasks(list, { query: this.taskSearch?.value?.() ?? "", chip: this.taskChip });
    const pick = visible.find((t) => t.status === "active") ?? visible[0] ?? null;
    this.opened = pick?.id ?? null;
    return this.opened;
  }

  /** Fetches full detail for one task via `bh task show`, dropping stale or superseded responses. */
  async fetchTaskDetail(id, dir, cx = null) {
    const seq = ++this.detailReqSeq;
    const detail = await bhJson(["task", "show", id], { cwd: dir });
    if (dir !== projectDir() || seq !== this.detailReqSeq || (this.opened && this.opened !== id)) return;
    if (!detail || Array.isArray(detail)) return;
    this.taskDetail = detail;
    this.taskDetailId = id;
    const steps = Array.isArray(detail.steps) ? detail.steps : [];
    const { finished, seen } = newlyDone(steps.map((s) => ({ id: `${id}:${s.n}`, done: s.status === "done" })), this.seenStepsDone.get(id) ?? null);
    this.seenStepsDone.set(id, seen);
    if (cx) for (const stepKey of finished) this.triggerStepHighlight(stepKey, cx);
    if (this.expandedTaskId !== id) {
      this.expandedTaskId = id;
      const active = steps.filter((s) => s.status === "active").map((s) => s.n);
      const firstBlocked = steps.find((s) => s.status === "blocked")?.n;
      this.expandedSteps = new Set(active.length ? active : firstBlocked != null ? [firstBlocked] : []);
    }
    if (this.detailTab === "plan" && !detail.plan) this.detailTab = "steps";
  }

  /** Holds a soft overlay on a newly finished step for 2 s, then fades it over MOTION.highlight. */
  triggerStepHighlight(key, cx) {
    if (reducedMotion() || !cx?.timer) return;
    this.stepFinishing.set(key, "on");
    cx.timer.after(HIGHLIGHT_MS, (cx) => {
      if (!this.stepFinishing.has(key)) return;
      this.stepFinishing.set(key, "fade");
      cx.notify();
      cx.timer.after(MOTION.highlight.duration + 32, (cx) => {
        if (this.stepFinishing.get(key) !== "fade") return;
        this.stepFinishing.delete(key);
        cx.notify();
      });
    });
  }

  /** Kicks an immediate detail fetch when the user clicks a different task row. */
  loadTaskDetail(id, dir, cx) {
    if (!id) return;
    cx.spawn(async (cx) => {
      await this.fetchTaskDetail(id, dir, cx);
      cx.notify();
    });
  }

  /** Selects a task from the list and immediately fetches its full detail without waiting for the 4s poll. */
  openTask(id, cx) {
    this.opened = id;
    this.commenting = null;
    this.commentStep = null;
    this.stayClosed = false;
    this.boardKind = "all";
    if (this.taskDetailId !== id) this.taskDetail = null;
    const summary = (this.tasks ?? []).find((t) => t.id === id);
    if (this.detailTab === "plan" && !summary?.plan) this.detailTab = "steps";
    this.loadTaskDetail(id, this.dir ?? projectDir(), cx);
    cx.notify();
  }

  /** Creates a new task from the inline creation card, opens it, and refreshes the list. */
  createTask(cx) {
    const text = this.newTaskInput.value().trim();
    if (!text || this.creatingBusy) return;
    const dir = this.dir ?? projectDir();
    this.creatingBusy = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const created = await bhJson(["task", "new", `--data=${enc(text)}`], { cwd: dir });
        if (dir !== projectDir()) return;
        if (!created?.id) {
          this.problem = "Couldn't create the task.";
          return;
        }
        this.newTaskInput.set_value("");
        this.creatingTask = false;
        this.taskChip = "active";
        this.archived = false;
        this.problem = null;
        this.openTask(created.id, cx);
        this.taskComposer.say(`Created ${created.title ?? created.id}`, cx);
        this.reload(cx);
      } finally {
        this.creatingBusy = false;
        cx.notify();
      }
    });
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
    this.syncKnowHandles(all, this.cx);
    this.adoptKnowledge(all);
  }

  /** Creates stable FocusHandles for Knowledge cards outside render (never calls cx.focus_handle in render). */
  syncKnowHandles(all, cx) {
    if (!cx?.focus_handle || !Array.isArray(all)) return;
    const live = new Set();
    for (const { agent, text } of all) {
      for (const s of outline(text ?? "").sections) {
        for (const e of s.entries) {
          const key = `${agent}:${e.line}`;
          live.add(key);
          if (!this.knowHandles.has(key)) {
            this.knowHandles.set(key, { card: cx.focus_handle(), edit: cx.focus_handle(), del: cx.focus_handle() });
          }
        }
      }
    }
    for (const key of this.knowHandles.keys()) if (!live.has(key)) this.knowHandles.delete(key);
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

  // ── Questions ──────────────────────────────────────────────────────────────────────────────

  /** Reads the agents' open questions and the panel's live seats; the page redraws when either changes. */
  async readQuestions(cx) {
    if (!this.hasComposer()) return;
    const changed = await this.open.poll();
    publishCounts(this.open.list);
    if (changed || this.trackSeats()) cx.notify();
  }

  /** Each seat's state from the live terminal named `<seat>-panel`. */
  seatsNow() {
    return seatStates(terminals(), seats());
  }

  /** Whether a seat's state changed since the last draw (the rail's pills follow their terminals). */
  trackSeats() {
    const now = JSON.stringify(this.seatsNow());
    if (now === this.seatSig) return false;
    this.seatSig = now;
    return true;
  }

  /** Your answers to an agent's questions, from the page's box: the chat's bh answer, sent from here. */
  answerQuestion(composer, q, answers, cx) {
    const file = this.open.drop(q);
    cx.notify(); // the card goes now; a failure brings it back on the next poll
    cx.spawn(async (cx) => {
      const r = await this.open.send(q, answers, file);
      if (!r.sent) composer.say(`Couldn't send your answers: ${r.why}`, cx, "error");
      else if (!r.ok) composer.say(`Saved, but the agent didn't get them: ${r.why}`, cx, "warning");
      cx.notify();
    });
  }

  /** Whether the tab shown has a box for the cards: Tasks and Plans do; Knowledge has none. */
  hasComposer() {
    return this.tab === "tasks" || this.tab === "plans";
  }

  show(tab, cx) {
    this.tab = tab;
    keep("tab", tab);
    this.reload(cx);
    this.readQuestions(cx);
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
    this.run(args, cx, (r, cx) => {
      this.problem = r.code === 0 ? null : firstLine(r);
      done?.(r, cx);
    });
  }

  /** Appends `--if-updated <iso>` when an expected timestamp is known for optimistic concurrency. */
  withIfUpdated(args, updated) {
    return updated ? [...args, "--if-updated", String(updated)] : args;
  }

  /** Latest known `updated` ISO timestamp for a task id (preferring full detail over summary). */
  taskUpdated(id) {
    if (this.taskDetailId === id && this.taskDetail?.updated) return this.taskDetail.updated;
    return (this.tasks ?? []).find((t) => t.id === id)?.updated ?? null;
  }

  /** Mutating task CLI call: `--json` for a structured conflict, `--if-updated`, and a kept failure line. */
  actTask(args, cx, done = null, updated = null) {
    this.run(this.withIfUpdated([...args, "--json"], updated), cx, (r, cx) => {
      const { conflict, message } = mutationError(r);
      // A failed command is said and kept: the list reload that follows never erases it.
      this.taskActionError = message || null;
      if (conflict) this.taskComposer?.say(message, cx, "warning");
      else if (message) this.taskComposer?.say(message, cx, "error");
      done?.(r, cx);
    });
  }

  /** `bh task delete` or `bh plan delete`: `after` runs on success; a failure is said in `composer`. */
  remove(args, composer, cx, after, failed = null) {
    this.run(args, cx, (r, cx) => {
      if (r.code === 0) return after();
      const { conflict, message } = mutationError(r);
      composer.say(message || "Couldn't delete it.", cx, conflict ? "warning" : "error");
      failed?.(message);
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
    const runCmd = (args, cx) => (kind === "task" ? this.actTask(args, cx, null, this.taskUpdated(id)) : this.act(args, cx));
    return {
      key: `bh-${kind}-c-${id}-${x.id}`,
      editing: Boolean(w && w.kind === kind && w.id === id && w.edit === x.id),
      resolve: (cx) => runCmd([kind, "resolve", id, "--comment", x.id], cx),
      reopen: (cx) => runCmd([kind, "comment", id, "--edit", x.id, "--data", enc(x.text)], cx),
      edit: (cx) => this.editInline(kind, id, x.step ?? x.line ?? null, x.id, x.text, cx),
      delete: (cx) => runCmd([kind, "comment", id, "--delete", x.id], cx),
    };
  }

  sendInline(cx) {
    const text = this.inline.value().trim();
    const where = this.commenting;
    if (!text || !where) return;
    this.inline.set_value("");
    this.commenting = null;
    if (where.edit && where.kind !== "knowledge") {
      const args = [where.kind, "comment", where.id, "--edit", where.edit, "--data", enc(text)];
      return where.kind === "task" ? this.actTask(args, cx, null, this.taskUpdated(where.id)) : this.act(args, cx);
    }
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
    const detail = this.taskDetailId === where.id ? this.taskDetail : null;
    const step = detail?.steps?.find((x) => x.n === where.at);
    this.actTask(["task", "comment", where.id, "--step", String(where.at), "--data", enc(text)], cx, (r) => {
      if (r.code === 0) sendFromChat(`The user commented on step ${where.at}${step ? ` ("${step.title}")` : ""} of task ${where.id}: ${text}\n\nTake it into account (bh task show ${where.id}) or say why it needs no change.`);
    }, this.taskUpdated(where.id));
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

  /** A comment on the task (or targeted step) from the foldable composer; folds back when sent. */
  sendTaskComment(cx, text, id = this.opened) {
    if (!text || !id) return;
    const target = id === this.opened ? this.commentStep : null;
    const updated = this.taskUpdated(id);
    this.commentStep = null;
    this.taskComposer.expanded = false;
    if (target?.n != null) {
      this.actTask(["task", "comment", id, "--step", String(target.n), "--data", enc(text)], cx, (r) => {
        if (r.code === 0) sendFromChat(`The user commented on step ${target.n}${target.title ? ` ("${target.title}")` : ""} of task ${id}: ${text}\n\nTake it into account (bh task show ${id}) or say why it needs no change.`);
      }, updated);
      return;
    }
    this.actTask(["task", "comment", id, "--data", enc(text)], cx, (r) => {
      if (r.code === 0) sendFromChat(`The user commented on task ${id}: ${text}\n\nTake it into account (bh task show ${id}) or say why it needs no change.`);
    }, updated);
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

  /** Deletes one knowledge record immediately and offers inline "Deleted · Undo" for 5 s to restore it exactly. */
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
    const prevText = String(base);
    const removedNotes = notesOn(notes, e.text).map((n) => ({ ...n }));
    lines.splice(from, count);
    const text = lines.join("\n").replace(/\n{3,}/g, "\n\n");
    if (cur) {
      cur.text = text;
      cur.notes = (cur.notes ?? []).filter((n) => !removedNotes.some((r) => r.at === n.at));
    }
    if (this.agent === agent) {
      this.knownText = text;
      this.editor.set_value(text);
    }
    for (const n of removedNotes) this.act(["knowledge", "unnote", agent, "--at", n.at], cx);
    this.act(["knowledge", "write", agent, "--data", enc(text)], cx, (r) => {
      if (r.code !== 0 && cur) cur.text = prevText;
    });
    this.pushKnowUndo({
      id: `entry-${agent}-${Date.now()}`,
      kind: "entry",
      agent,
      prevText,
      entryKey: e.key,
      notes: removedNotes,
    }, cx);
    cx.notify();
  }

  /** Deletes one knowledge note immediately and offers inline "Deleted · Undo" for 5 s to restore it. */
  deleteKnowledgeNote(agent, e, n, cx) {
    const cur = (this.knowAll ?? []).find((x) => x.agent === agent);
    if (cur) cur.notes = (cur.notes ?? []).filter((x) => x.at !== n.at);
    this.act(["knowledge", "unnote", agent, "--at", n.at], cx);
    this.pushKnowUndo({
      id: `note-${agent}-${hash(`${n.at}${n.note}`)}-${Date.now()}`,
      kind: "note",
      agent,
      entryKey: n.entry ?? e.key,
      noteText: n.note,
    }, cx);
    cx.notify();
  }

  /** Keeps an inline Undo banner for 5 s, then lets it expire. */
  pushKnowUndo(record, cx) {
    this.knowUndos = [...this.knowUndos, record];
    cx.timer.after(UNDO_MS, (cx) => {
      const next = this.knowUndos.filter((u) => u.id !== record.id);
      if (next.length === this.knowUndos.length) return;
      this.knowUndos = next;
      cx.notify();
    });
  }

  /** Restores a deleted Knowledge entry (with its notes) or a deleted Knowledge note. */
  undoKnowledgeDelete(u, cx) {
    this.knowUndos = this.knowUndos.filter((x) => x.id !== u.id);
    const cur = (this.knowAll ?? []).find((x) => x.agent === u.agent);
    if (u.kind === "entry") {
      if (cur) cur.text = u.prevText;
      if (this.agent === u.agent) {
        this.knownText = u.prevText;
        this.editor.set_value(u.prevText);
      }
      this.act(["knowledge", "write", u.agent, "--data", enc(u.prevText)], cx, (r, cx) => {
        if (r.code !== 0) return;
        for (const n of u.notes ?? []) this.act(["knowledge", "note", u.agent, n.entry ?? u.entryKey, "--data", enc(n.note)], cx);
      });
    } else if (u.kind === "note") {
      this.act(["knowledge", "note", u.agent, u.entryKey, "--data", enc(u.noteText)], cx);
    }
    cx.notify();
  }

  /** Returns pre-created FocusHandles for a Knowledge card and its Edit/Delete buttons (never calls cx.focus_handle during render). */
  cardHandles(key) {
    const h = this.knowHandles.get(key) ?? null;
    if (!h && !this.knowHandleSync && this.cx?.timer) {
      this.knowHandleSync = true;
      this.cx.timer.after(1, (cx) => {
        this.knowHandleSync = false;
        this.syncKnowHandles(this.knowAll, cx);
        cx.notify();
      });
    }
    return h;
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
    const added = /** @type {{ at?: number } | null} */ (shared(NOTE_ADDED));
    if ((added?.at ?? 0) > this.noteAddedAt) {
      this.noteAddedAt = added.at;
      cx.timer.after(1, (cx) => this.reload(cx));
    }
    const active = viewShown(this.fixed ?? "work");
    if (active && !this.wasActive) {
      cx.timer.after(1, (cx) => {
        this.readQuestions(cx);
      });
    }
    this.wasActive = active;
    const want = /** @type {{ id?: string, at?: number } | null} */ (shared(OPEN_TASK));
    if (want?.at > (this.openAt ?? 0)) {
      this.openAt = want.at;
      this.opened = want.id;
      this.openWanted = want.id;
      this.archived = false;
      this.stayClosed = false;
      // A done or archived task opens under its own chip; while the list loads, the old chip stays.
      const found = (this.tasks ?? []).find((t) => t.id === want.id);
      if (found) this.taskChip = chipForTask(found);
      cx.timer.after(1, (cx) => this.loadTaskDetail(want.id, projectDir(), cx));
    }
    const banner = this.problem || (this.tab === "tasks" ? this.taskActionError : null);
    const c = colors();
    const content = Math.max(320, Math.min(MAX, this.width - SIZE.gutter * 2));
    // A page or tab opening draws its rows from hidden, then staggers them in; re-renders do not.
    const pageKey = `${this.tab}:${this.taskChip}`;
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
    // The agents' open questions go to the box of the tab shown; the Knowledge tab has no box.
    this.planComposer.questions = this.tab === "plans" ? this.open.list : [];
    this.taskComposer.questions = this.tab === "tasks" ? this.open.list : [];
    // A pinned plan or the split Tasks workbench reaches the page's foot with its own inner scroll.
    const pinned = stale ? null : this.shownPlan();
    const fullPage = Boolean(pinned) || (!stale && this.tab === "tasks" && Boolean(this.tasks?.length));
    return div()
      .id("bh-work")
      .relative()
      .size_full()
      .bg(c.ground)
      .text_color(c.ink)
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        // Typing on the Plans page while its box is folded grows the box back, as on the chat.
        const chord = e.modifiers.control || e.modifiers.platform || e.modifiers.alt;
        if (!e.key_char || chord || !this.planBoxFolded()) return;
        this.planComposer.typeFolded(e.key_char, cx);
        cx.stop_propagation();
      })
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
          .when(!fullPage || Boolean(banner), (el) => el.overflow_y_scroll())
          .items_center()
          .child(
            v_flex()
              .flex_none()
              .w(content)
              .pt(SPACE[5])
              .when(!fullPage, (el) => el.pb(SPACE[5]))
              .gap(GAP)
              // The plan column reaches the page's top: a pinned plan is a whole page of conversation,
              // so its empty tab bar (the pin puts no tabs there) would only cut the chats; its
              // refresh sits in the rail instead. Every other page keeps the bar.
              .when(!(this.fixed && pinned), (el) => el.child(
                h_flex()
                  .gap(SPACE[4])
                  .items_center()
                  // The page names itself in the tab bar; only the tabs (when this block has several) and refresh here.
                  .when(!this.fixed, (el) => el.child(this.tabs(c)))
                  .child(div().flex_1())
                  .child(actionButton(c, "bh-work-refresh", null, (_e, cx) => this.reload(cx), { icon: "refresh-cw", tone: "quiet", tooltip: "Refresh" })),
              ))
              .when(Boolean(banner), (el) => el.child(stateView(c, {
                id: "bh-work-error",
                title: this.problem ? "Couldn't load this page" : "That action didn't work",
                line: banner,
                action: this.problem
                  ? { label: "Try again", on: (_e, cx) => this.reload(cx) }
                  : { label: "Dismiss", on: (_e, cx) => {
                    this.taskActionError = null;
                    cx.notify();
                  } },
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

  /** The Tasks workbench: searchable, filterable split list with tabbed interactive detail. */
  tasksView(c, width) {
    if (this.tasks === null) return stateView(c, { id: "bh-tasks-loading", title: "Loading tasks…", loading: true });
    if (!this.tasks.length) {
      return v_flex()
        .w(width)
        .items_center()
        .gap(SPACE[4])
        .child(this.hero(c, width, "page-tasks", "No tasks yet", "Create a task below or type /task in the chat."))
        .child(this.creatingTask
          ? div().w(Math.min(440, width)).child(this.newTaskCard(c))
          : actionButton(c, "bh-task-empty-new", "New task", (_e, cx) => this.toggleNewTask(cx), { icon: "plus", tone: "primary" }));
    }
    const narrow = this.width < NARROW;
    const counts = chipCounts(this.tasks);
    const query = this.taskSearch.value();
    const filtered = filterTasks(this.tasks, { query, chip: this.taskChip });
    if (!narrow && !this.stayClosed && !this.openWanted && !filtered.some((t) => t.id === this.opened)) {
      const next = (filtered.find((t) => t.status === "active") ?? filtered[0])?.id ?? null;
      if (next !== this.opened) {
        this.opened = next;
        if (next && this.taskDetailId !== next && this.pendingDetailId !== next) {
          this.pendingDetailId = next;
          this.cx?.timer.after(1, (cx) => {
            this.pendingDetailId = null;
            this.loadTaskDetail(next, this.dir ?? projectDir(), cx);
          });
        }
      }
    }
    const open = filtered.find((t) => t.id === this.opened) ?? this.tasks.find((t) => t.id === this.opened) ?? null;
    const paneH = Math.max(320, this.height - PAGE_CHROME);
    const listW = narrow ? width : Math.min(LIST_W, Math.floor(width * 0.42));
    const paneW = narrow ? width : Math.max(0, width - listW - HAIR);
    return h_flex()
      .w(width)
      .h(paneH)
      .items_start()
      .when(!narrow || !open, (el) => el.child(this.taskList(c, { filtered, counts, query, width: listW, height: paneH, narrow })))
      .when(!narrow, (el) => el.child(div().flex_none().w(HAIR).h(paneH).bg(c.edge)))
      .when(!narrow || Boolean(open), (el) => el.child(this.taskPane(c, open, { width: paneW, height: paneH, narrow })));
  }

  /** Toggles the compact inline task creation card and focuses its input when opening. */
  toggleNewTask(cx) {
    this.creatingTask = !this.creatingTask;
    if (this.creatingTask) this.newTaskInput.focus();
    else this.newTaskInput.set_value("");
    cx.notify();
  }

  /** Compact inline creation card for `+ New task`. */
  newTaskCard(c) {
    return v_flex()
      .id("bh-task-new-card")
      .flex_none()
      .p(SPACE[3])
      .gap(SPACE[2])
      .rounded(SIZE.control)
      .bg(c.fill)
      .border_1()
      .border_color(alpha(c.accent, 0.5))
      .child(this.inputBox(c, this.newTaskInput))
      .child(h_flex().gap(SPACE[2]).justify_end().items_center()
        .child(actionButton(c, "bh-task-new-cancel", "Cancel", (_e, cx) => this.toggleNewTask(cx), { tone: "quiet" }))
        .child(actionButton(c, "bh-task-new-submit", this.creatingBusy ? "Creating…" : "Create", (_e, cx) => this.createTask(cx), { tone: "primary", disabled: this.creatingBusy })));
  }

  /** The left list column: heading + New task, search box, status chips, and scrollable grouped rows. */
  taskList(c, { filtered, counts, query, width, height, narrow }) {
    const groups = groupTasks(filtered, this.taskChip);
    const hasQuery = Boolean(query.trim());
    return v_flex()
      .flex_none()
      .w(width)
      .h(height)
      .gap(SPACE[3])
      .pr(narrow ? 0 : SPACE[4])
      .pb(SPACE[4])
      .child(h_flex().flex_none().items_center().justify_between().gap(SPACE[3])
        .child(div().text_size(TYPE.xl).font_semibold().child("Tasks"))
        .child(actionButton(c, "bh-task-new-btn", "New task", (_e, cx) => this.toggleNewTask(cx), { icon: "plus", tone: "primary" })))
      .when(this.creatingTask, (el) => el.child(this.newTaskCard(c)))
      .child(this.taskSearchBox(c, hasQuery))
      .child(this.taskChipBar(c, counts))
      .child(v_flex()
        .id("bh-task-list")
        .flex_1()
        .min_h(0)
        .overflow_y_scroll()
        .gap(SPACE[1])
        .when(!filtered.length, (el) => el.child(this.emptyFilterNote(c, hasQuery)))
        .children(groups.flatMap((g) => [groupLabel(c, g.label, g.items.length), ...g.items.map((t, i) => this.taskRow(c, t, i))])));
  }

  /** Search input with search icon and a clear `×` button when non-empty. */
  taskSearchBox(c, hasQuery) {
    return h_flex()
      .flex_none()
      .h(CONTROL)
      .px(SPACE[3])
      .gap(SPACE[2])
      .items_center()
      .rounded(SIZE.control)
      .bg(c.fill)
      .border_1()
      .border_color(c.edge)
      .child(svg(ICON("search")).flex_none().size(GLYPH.sm).text_color(c.faint))
      .child(Input.new(this.taskSearch).flex_1().min_w(0).h_full().text_size(TYPE.sm).text_color(c.ink))
      .when(hasQuery, (el) => el.child(
        actionButton(c, "bh-task-search-clear", null, (_e, cx) => {
          this.taskSearch.set_value("");
          cx.notify();
        }, { icon: "x", tone: "quiet", tooltip: "Clear search", a11y: "Clear search" }),
      ));
  }

  /** Status filter chips (`Active · N`, `Blocked · N`, …): a chip with nothing behind it is not drawn. */
  taskChipBar(c, counts) {
    return h_flex()
      .role("tab_list")
      .flex_none()
      .flex_wrap()
      .gap(SPACE[2])
      .items_center()
      .children(STATUS_CHIPS.filter((id) => chipHasResults(counts[id], this.taskChip === id)).map((id) => filterChip(c, {
        id: `bh-task-chip-${id}`,
        label: CHIP_LABELS[id],
        count: counts[id],
        on: this.taskChip === id,
        onClick: (_e, cx) => {
          this.taskChip = id;
          this.archived = id === "archived";
          this.stayClosed = false;
          const next = filterTasks(this.tasks ?? [], { query: this.taskSearch.value(), chip: id });
          // Narrow windows stay on the filtered list: opening the first match would hide it.
          const open = nextOpenedOnChip(next, this.opened, this.width < NARROW);
          if (open) this.openTask(open, cx);
          else cx.notify();
        },
      })));
  }

  /** Helpful message when no tasks match the active filter or search query. */
  emptyFilterNote(c, hasQuery) {
    const line = hasQuery
      ? "No tasks match your search."
      : this.taskChip === "archived"
        ? "Nothing archived yet."
        : this.taskChip === "blocked"
          ? "No blocked or paused tasks."
          : this.taskChip === "done"
            ? "No finished tasks yet."
            : "No active tasks.";
    return v_flex()
      .py(SPACE[4])
      .px(SPACE[2])
      .gap(SPACE[2])
      .items_start()
      .child(mutedLine(c, line))
      .when(hasQuery, (el) => el.child(actionButton(c, "bh-task-clear-query", "Clear search", (_e, cx) => {
        this.taskSearch.set_value("");
        cx.notify();
      }, { tone: "quiet" })));
  }

  /** A list row: status mark + truncated title on line 1; compact 5px progress bar + metrics on line 2. The opened row steps its surface up one level; no colour marks it (it is not a primary action). */
  taskRow(c, t, i = 0) {
    const on = this.opened === t.id;
    const finished = t.status === "done" || t.status === "abandoned";
    const tone = t.status === "abandoned" ? c.faint : finished ? c.muted : c.ink;
    const goalProg = goalProgressModel(t);
    const prog = goalProg ?? progressModel(t);
    const cost = formatUsd(t.spendUsd);
    const worked = formatWorked(t.workedMs);
    const prNum = t.github?.prNumber ?? null;
    return clickable(
      v_flex()
        .flex_none()
        .p(SPACE[3])
        .gap(SPACE[2])
        .rounded(SIZE.control)
        .border_1()
        .border_color(on ? c.controlBorder : alpha(c.ground, 0))
        .when(on, (el) => el.bg(c.hover))
        .opacity(this.rowsIn === false ? 0 : 1)
        .transition("opacity", { ...MOTION.row, delay: Math.min(i, 8) * MOTION.stagger })
        .on_click((_e, cx) => this.openTask(t.id, cx))
        .child(h_flex().gap(SPACE[2]).items_center()
          .child(statusMark(c, t.blocked > 0 && t.status === "active" ? "blocked" : t.status, GLYPH.lg))
          .child(div().flex_1().min_w(0).truncate().text_size(TYPE.md).font_medium().text_color(tone).child(t.title || t.id))
          .when(Boolean(goalProg), (el) => el.child(pill(c, "Goal", toneColor(c, goalProg.tone))))
          .when(Boolean(prNum), (el) => el.child(pill(c, `PR #${prNum}`, c.info))))
        .child(h_flex().pl(GLYPH.lg + SPACE[3]).gap(SPACE[2]).items_center().text_size(TYPE.xs).text_color(c.muted)
          .when(prog.total > 0, (el) => el.child(progressBar(c, prog)))
          .when(t.blocked > 0, (el) => el.child(div().flex_none().font_medium().text_color(c.warning).child("blocked")))
          .when(!t.blocked && t.needsYou, (el) => el.child(div().flex_none().font_medium().text_color(c.accent).child(goalProg?.pendingAmendment ? "amendment" : "needs you")))
          .child(div().flex_none().child(prog.total > 0 ? prog.label : age(t.updated ?? t.created)))
          .when(Boolean(cost), (el) => el.child(div().flex_none().child(`· ${cost}`)))
          .when(Boolean(worked), (el) => el.child(div().flex_none().child(`· ${worked}`)))),
      c,
      `bh-task-${t.id}`,
      { edge: true, fill: on ? c.hover : null },
    );
  }

  /** Right detail pane: fixed header + collapsible Goal DONE strip + detail tabs + ONE scrollable tab body + foldable composer. */
  taskPane(c, open, { width, height, narrow }) {
    if (!open) return this.pickPrompt(c, width, height);
    const detail = this.taskDetailId === open.id && this.taskDetail ? this.taskDetail : open;
    const inner = narrow ? width : Math.max(0, width - SPACE[5]);
    const targetTitle = this.commentStep ? `step ${this.commentStep.n}` : (detail.title || detail.id);
    this.taskComposer.placeholder = `Comment on ${targetTitle}…`;
    return v_flex()
      .id("bh-task-detail")
      .flex_none()
      .w(width)
      .h(height)
      .pl(narrow ? 0 : SPACE[5])
      .when(narrow, (el) => el.child(div().flex_none().pb(SPACE[2]).child(backLink(c, "bh-task-back", "Tasks", (_e, cx) => {
        this.opened = null;
        this.stayClosed = true;
        cx.notify();
      }))))
      .child(this.taskDetailHead(c, detail))
      .when(detail.mode === "goal" && Boolean(detail.goal), (el) => el.child(this.goalCriteriaStrip(c, detail)))
      .child(this.taskDetailTabs(c, detail))
      .child(v_flex()
        .id("bh-task-scroll")
        .flex_1()
        .min_h(0)
        .overflow_y_scroll()
        .gap(SPACE[3])
        .py(SPACE[2])
        .pr(SPACE[1])
        .child(this.taskTabBody(c, detail)))
      .child(this.taskComposerDock(c, detail, inner, height));
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
      .child(div().max_w(320).text_center().text_size(TYPE.md).text_color(c.muted).child("Choose a task to see its steps, board and comments."));
  }

  /** Fixed detail header: title + allowed actions, meta line with status/Goal/PR/QA gate/branch/usage, collapsible Details. */
  taskDetailHead(c, t) {
    const open = this.descOpen?.has(`details:${t.id}`);
    const gate = gateBadge(t);
    const goalProg = goalProgressModel(t);
    const issues = issueChips(c, t.github?.issues);
    const prNum = t.github?.prNumber ?? null;
    const prUrl = t.github?.prUrl ?? null;
    const usage = usageText(t.usage);
    const worked = formatWorked(t.timeMs ?? t.workedMs);
    const metrics = usage || [formatUsd(t.spendUsd), worked].filter(Boolean).join(" · ");
    return v_flex()
      .flex_none()
      .gap(SPACE[3])
      .pb(SPACE[4])
      .border_b(HAIR)
      .border_color(c.edge)
      .child(h_flex().gap(SPACE[3]).items_start().justify_between()
        .child(h_flex().flex_1().min_w(0).gap(SPACE[3]).items_center()
          .child(statusMark(c, t.status, 18))
          .child(div().flex_1().min_w(0).text_size(TYPE.xl).font_semibold().line_height(`${LINE.xl}px`).child(t.title ?? t.id)))
        .child(this.taskActions(c, t)))
      .child(h_flex().flex_wrap().gap(SPACE[2]).items_center().text_size(TYPE.sm).text_color(c.muted)
        .child(pill(c, t.status ?? "backlog", statusTone(c, t.status), { pulse: t.status === "active" }))
        .when(Boolean(goalProg), (el) => el.child(pill(c, `Goal · ${goalProg.status}`, toneColor(c, goalProg.tone))))
        .when(Boolean(gate), (el) => el.child(pill(c, gate.label, toneColor(c, gate.tone))))
        .when(Boolean(issues), (el) => el.child(issues))
        .when(Boolean(prNum), (el) => el.child(prUrl
          ? clickable(pill(c, `PR #${prNum}`, c.info).on_click((_e, cx) => {
            cx.stop_propagation();
            openLink(prUrl);
          }), c, `bh-task-pr-${t.id}`)
          : pill(c, `PR #${prNum}`, c.info)))
        .when(Boolean(t.track), (el) => el.child(div().child(`${t.track} track`)))
        .when(Boolean(metrics), (el) => el.child(div().child(`· ${metrics}`)))
        .child(textLink(c, `bh-task-details-${t.id}`, open ? "Details ▴" : "Details ▾", (_e, cx) => this.toggleDesc(`details:${t.id}`, cx), open ? c.ink : c.accent)))
      // A branch name is machine text: one muted mono line, folded in the middle, never at body size.
      .when(Boolean(t.git?.branch), (el) => el.child(machineLine(c, {
        id: `bh-task-branch-${t.id}`,
        text: t.git.branch,
        lead: "branch",
        expanded: this.machineOpen.has(`bh-task-branch-${t.id}`),
        onToggle: (_e, cx) => {
          toggleMachine(this.machineOpen, `bh-task-branch-${t.id}`);
          cx.notify();
        },
      })))
      .when(Boolean(open), (el) => el.child(this.taskDetails(c, t)));
  }

  /** Action buttons driven by `allowedActionsFallback(t)`, passing `--if-updated` on every mutation. */
  taskActions(c, t) {
    const acts = allowedActionsFallback(t);
    return h_flex()
      .flex_none()
      .flex_wrap()
      .gap(SPACE[2])
      .items_center()
      .when(acts.pause, (el) => el.child(this.pauseButton(c, t)))
      .when(acts.resume, (el) => el.child(this.resumeButton(c, t)))
      .when(acts.done, (el) => el.child(this.markDoneButton(c, t)))
      .when(acts.archive || acts.unarchive, (el) => el.child(this.archiveButton(c, t, acts.unarchive)))
      .when(acts.delete, (el) => el.child(this.taskDelete(c, t)));
  }

  /** Pause: pauses a task, or for a Goal runs `bh goal pause` so goal.status stays in sync. */
  pauseButton(c, t) {
    return actionButton(c, `bh-pause-${t.id}`, "Pause", (_e, cx) => {
      if (t.mode === "goal") {
        this.run(["goal", "pause", t.id, "--json"], cx, (r, cx) => {
          if (r.code !== 0) {
            this.taskActionError = firstLine(r) || "Couldn't pause goal.";
            return;
          }
          this.taskActionError = null;
          this.taskComposer.say(`Paused Goal ${t.title ?? t.id}`, cx);
        });
        return;
      }
      this.actTask(["task", "status", t.id, "paused"], cx, (r, cx) => {
        if (r.code === 0) this.taskComposer.say(`Paused ${t.title ?? t.id}`, cx);
      }, t.updated);
    }, { icon: "pause" });
  }

  /** Resume: resumes a task, or for a Goal runs `bh goal resume` and wakes the Orchestrator. */
  resumeButton(c, t) {
    return actionButton(c, `bh-resume-${t.id}`, "Resume", (_e, cx) => {
      if (t.mode === "goal") {
        this.run(["goal", "resume", t.id, "--json"], cx, (r, cx) => {
          if (r.code !== 0) {
            this.taskActionError = firstLine(r) || "Couldn't resume goal.";
            return;
          }
          this.taskActionError = null;
          this.taskComposer.say(`Resumed Goal ${t.title ?? t.id}`, cx);
          wakeGoal(t);
        });
        return;
      }
      this.actTask(["task", "status", t.id, "active"], cx, (r, cx) => {
        if (r.code === 0) this.taskComposer.say(`Resumed ${t.title ?? t.id}`, cx);
      }, t.updated);
    }, { icon: "play" });
  }

  /** Mark done: `bh task status <id> done --if-updated <updated>`. */
  markDoneButton(c, t) {
    return actionButton(c, `bh-done-${t.id}`, "Mark done", (_e, cx) => this.actTask(["task", "status", t.id, "done"], cx, (r, cx) => {
      if (r.code === 0) this.taskComposer.say(`Marked ${t.title ?? t.id} done`, cx);
    }, t.updated), { icon: "check" });
  }

  /** Archive or Unarchive with `--if-updated`. */
  archiveButton(c, t, isArchived = Boolean(t.archived)) {
    const label = isArchived ? "Unarchive" : "Archive";
    return actionButton(c, `bh-arch-${t.id}`, label, (_e, cx) => this.actTask(["task", isArchived ? "unarchive" : "archive", t.id], cx, (r, cx) => {
      if (r.code !== 0) return;
      this.archived = !isArchived;
      // Unarchiving keeps a done task under Done; only an open one returns to Active.
      this.taskChip = chipForTask({ ...t, archived: false });
      this.taskComposer.say(`${isArchived ? "Unarchived" : "Archived"} ${t.title ?? t.id}`, cx);
    }, t.updated), { icon: "archive" });
  }

  /** Delete a stopped task (two-click confirm via `arm`/`armed`) with `--if-updated`. */
  taskDelete(c, t) {
    return this.twoStep(c, {
      id: `bh-delete-${t.id}`,
      label: "Delete",
      ask: "Delete for good?",
      icon: "trash",
      run: (cx) => {
        const next = this.neighbourOf(t);
        this.remove(this.withIfUpdated(["task", "delete", t.id, "--json"], t.updated), this.taskComposer, cx, () => {
          this.opened = next?.id ?? null;
          this.taskDetail = null;
          this.taskDetailId = null;
          this.stayClosed = !next;
          if (next) {
            this.loadTaskDetail(next.id, this.dir ?? projectDir(), cx);
            this.taskComposer.say(`Deleted ${t.title ?? t.id}`, cx);
          }
        }, (message) => {
          this.taskActionError = message || "Couldn't delete the task.";
        });
      },
    });
  }

  /** The row after `t` in the current filtered list, else the one before it, else none. */
  neighbourOf(t) {
    const filtered = filterTasks(this.tasks ?? [], { query: this.taskSearch?.value?.() ?? "", chip: this.taskChip });
    const rows = groupTasks(filtered, this.taskChip).flatMap((g) => g.items);
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

  /** Collapsible metadata drawer: id, started date, branch/worktree, request, triage, skills and checks. */
  taskDetails(c, t) {
    const req = String(t.request ?? "").replace(/^\s*\[(?:task|plan)\]\s*/i, "");
    const started = day(t.created);
    const triage = this.triageSummary(t.triage);
    const skills = formatTaskSkills(t.skills);
    // `bh check` run for the whole task (no step): its receipts are not on any step card.
    const lastCheck = (Array.isArray(t.checks) ? t.checks : []).filter((r) => r?.step == null).at(-1);
    return v_flex()
      .p(SPACE[3])
      .gap(SPACE[2])
      .rounded(SIZE.control)
      .bg(c.well)
      .text_size(TYPE.sm)
      .text_color(c.muted)
      .child(div().child([t.id, started && `started ${started}`].filter(Boolean).join(" · ")))
      .when(Boolean(t.git?.branch), (el) => el.child(h_flex().gap(SPACE[2]).items_center()
        .child(svg(ICON("folder")).flex_none().size(GLYPH.md).text_color(c.faint))
        .child(div().min_w(0).truncate().child(t.git.mode === "worktree" ? `Worktree ${t.git.path} · branch ${t.git.branch}` : `Branch ${t.git.branch}${t.git.from ? ` (from ${t.git.from})` : ""}`))))
      .when(Boolean(triage), (el) => el.child(div().child(`Triage: ${triage}`)))
      .when(Boolean(skills), (el) => el.child(div().child(`Skills: ${skills}`)))
      .when(Boolean(lastCheck), (el) => el.child(div().child(this.checkLine(lastCheck))))
      .when(Boolean(req), (el) => el.child(this.requestText(c, t, req)));
  }

  /** The last task-level `bh check` as one line: exit, tests and when. */
  checkLine(receipt) {
    const counts = receipt?.counts ?? {};
    const tests = counts.total ? `${counts.pass ?? 0}/${counts.total} tests` : `${receipt?.ran?.tests ?? 0} tests`;
    const when = receipt?.at ? ` · ${boardAge(receipt.at)}` : "";
    return `Last bh check: ${Number(receipt?.exit ?? 0) === 0 ? "passed" : "failed"} · ${tests}${when}`;
  }

  /** Formats classifier triage object cleanly for the Details drawer. */
  triageSummary(tr) {
    if (!tr || typeof tr !== "object") return "";
    const domains = tr.domains && typeof tr.domains === "object"
      ? Object.entries(tr.domains).filter(([, p]) => p && p !== "none").map(([d, p]) => `${d} (${p})`).join(", ")
      : "";
    return [tr.size && `size ${tr.size}`, tr.kind, domains && `domains ${domains}`, tr.research && `research ${tr.research}`].filter(Boolean).join(" · ");
  }

  /** The request as Markdown, shortened to a few lines with Show more. */
  requestText(c, t, req) {
    const key = `task-desc:${t.id}`;
    const open = this.descOpen?.has(key);
    const long = req.length > 220 || req.split("\n").length > 4;
    const text = long && !open ? req.slice(0, 200).replace(/\s+\S*$/, "") + "…" : req;
    return v_flex()
      .gap(SPACE[2])
      .child(div().text_size(TYPE.md).line_height(`${LINE.md}px`).text_color(c.ink).child(TextView.markdown(`bh-task-req-${t.id}-${open ? "o" : "c"}`, text)))
      .when(long, (el) => el.child(textLink(c, `bh-task-req-more-${t.id}`, open ? "Show less" : "Show more", (_e, cx) => this.toggleDesc(key, cx), c.accent)));
  }

  /** Runs `bh goal verify <id>` on demand from the pinned DONE criteria strip. */
  verifyGoalNow(t, cx) {
    if (this.goalVerifying) return;
    this.goalVerifying = true;
    cx.notify();
    this.run(["goal", "verify", t.id, "--json"], cx, (r, cx) => {
      this.goalVerifying = false;
      this.taskActionError = null;
      if (r.code === 0) this.taskComposer.say(`All DONE criteria verified for ${t.title ?? t.id}`, cx);
      else this.taskComposer.say(`Goal verify finished with failing checks on ${t.title ?? t.id}`, cx, "warning");
      this.loadTaskDetail(t.id, this.dir ?? projectDir(), cx);
    });
  }

  /** Approves or rejects an agent-proposed DONE criterion amendment (human action in UI). */
  resolveAmendment(t, approve, cx) {
    const cmd = approve ? "approve-amend" : "reject-amend";
    this.run(["goal", cmd, t.id, "--json"], cx, (r, cx) => {
      if (r.code !== 0) {
        this.taskActionError = firstLine(r) || `Couldn't ${approve ? "approve" : "reject"} amendment.`;
        return;
      }
      this.taskActionError = null;
      this.taskComposer.say(approve ? "Amendment approved; Goal resumed." : "Amendment rejected; original DONE contract kept and Goal resumed.", cx);
      wakeGoal(t);
      this.loadTaskDetail(t.id, this.dir ?? projectDir(), cx);
    });
  }

  /** Collapsible pinned DONE criteria strip inside a Goal's own detail pane (zero global banners). */
  goalCriteriaStrip(c, t) {
    const g = t.goal;
    const prog = goalProgressModel(t);
    const criteria = Array.isArray(g?.criteria) ? g.criteria : [];
    const spend = formatUsd(t.spendUsd ?? t.usage?.costUsd) || "$0.00";
    const cap = g?.maxSpendUsd ? `$${g.maxSpendUsd}` : "∞";
    const amd = g?.pendingAmendment ?? null;
    const collapsed = this.goalStripCollapsed;
    return v_flex()
      .id(`bh-goal-strip-${t.id}`)
      .flex_none()
      .mt(SPACE[3])
      .p(SPACE[3])
      .gap(SPACE[2])
      .rounded(SIZE.control)
      .bg(c.fill)
      .border_1()
      .border_color(amd ? alpha(c.warning, 0.55) : c.edge)
      .child(h_flex().gap(SPACE[2]).items_center().justify_between()
        .child(h_flex().flex_1().min_w(0).gap(SPACE[2]).items_center()
          .child(div().text_size(TYPE.sm).font_semibold().text_color(c.ink).child(`DONE Criteria · ${prog?.done ?? 0}/${prog?.total ?? criteria.length}`))
          .child(div().text_size(TYPE.xs).text_color(c.muted).child(`iter ${g?.iteration ?? 0} · ${spend}/${cap}`)))
        .child(h_flex().flex_none().gap(SPACE[2]).items_center()
          .when(t.status !== "done" && t.status !== "abandoned", (el) => el.child(actionButton(
            c,
            `bh-goal-verify-${t.id}`,
            this.goalVerifying ? "Verifying…" : "Verify now",
            (_e, cx) => this.verifyGoalNow(t, cx),
            { icon: "refresh-cw", tone: "secondary", disabled: this.goalVerifying },
          )))
          .child(textLink(c, `bh-goal-strip-toggle-${t.id}`, collapsed ? "Show ▾" : "Hide ▴", (_e, cx) => {
            this.goalStripCollapsed = !this.goalStripCollapsed;
            cx.notify();
          }, c.muted))))
      .when(Boolean(amd), (el) => el.child(
        v_flex()
          .p(SPACE[2])
          .gap(SPACE[2])
          .rounded(SIZE.nested)
          .bg(alpha(c.warning, 0.1))
          .border_1()
          .border_color(alpha(c.warning, 0.35))
          .child(div().text_size(TYPE.xs).font_semibold().text_color(c.warning)
            .child(`Proposed amendment (${amd.action}${amd.criterionId ? ` ${amd.criterionId}` : ""}): ${amd.text || "(drop)"}`))
          .child(div().text_size(TYPE.xs).text_color(c.muted).child(`Reason: ${amd.reason || "—"}`))
          .child(h_flex().gap(SPACE[2]).items_center()
            .child(actionButton(c, `bh-goal-amd-approve-${t.id}`, "Approve", (_e, cx) => this.resolveAmendment(t, true, cx), { tone: "primary" }))
            .child(actionButton(c, `bh-goal-amd-reject-${t.id}`, "Reject", (_e, cx) => this.resolveAmendment(t, false, cx), { tone: "danger" }))),
      ))
      .when(!collapsed && criteria.length > 0, (el) => el.child(
        v_flex().gap(SPACE[1]).children(criteria.map((cr) => {
          const b = goalCriterionBadge(cr);
          const key = `${t.id}:${cr.id}`;
          const expanded = this.expandedCriteria.has(key);
          const hasLog = Boolean(cr.evidence);
          return v_flex()
            .gap(1)
            .child(clickable(
              h_flex()
                .px(SPACE[2])
                .py(SPACE[1])
                .gap(SPACE[2])
                .items_center()
                .rounded(SIZE.nested)
                .hover((s) => s.bg(c.hover))
                .on_click((_e, cx) => {
                  if (!hasLog) return;
                  if (this.expandedCriteria.has(key)) this.expandedCriteria.delete(key);
                  else this.expandedCriteria.add(key);
                  cx.notify();
                })
                .child(div().flex_none().w(14).text_size(TYPE.xs).font_semibold().text_color(toneColor(c, b.tone)).child(b.icon))
                .child(div().flex_none().px(SPACE[1]).rounded(SIZE.nested).bg(c.well).text_size(TYPE.xs).text_color(c.muted).child(cr.kind))
                .child(div().flex_1().min_w(0).truncate().text_size(TYPE.sm).text_color(c.ink).child(cr.text))
                .when(hasLog, (el2) => el2.child(div().flex_none().text_size(TYPE.xs).text_color(c.faint).child(expanded ? "▴" : "▾"))),
              c,
              `bh-goal-cr-${t.id}-${cr.id}`,
            ))
            .when(expanded && hasLog, (el2) => el2.child(
              div()
                .ml(SPACE[5])
                .px(SPACE[2])
                .py(SPACE[1])
                .rounded(SIZE.nested)
                .bg(c.well)
                .text_size(TYPE.xs)
                .text_color(b.tone === "danger" ? c.danger : c.muted)
                .child(cr.evidence),
            ));
        })),
      ));
  }

  /** Detail tabs (`Steps`, `Iterations` for Goals, `Board`, `Comments`, `Full plan`) + Expand/Collapse all on Steps tab. */
  taskDetailTabs(c, t) {
    const counts = detailTabCounts(t);
    const activeTab = (this.detailTab === "plan" && !counts.hasPlan) || (this.detailTab === "iterations" && !counts.isGoal)
      ? "steps"
      : this.detailTab;
    const items = [
      { id: "steps", label: "Steps", count: counts.stepsText, on: activeTab === "steps" },
      ...(counts.isGoal ? [{ id: "iterations", label: "Iterations", count: counts.iterationsCount || null, on: activeTab === "iterations" }] : []),
      { id: "board", label: "Board", count: counts.boardCount || null, on: activeTab === "board" },
      { id: "comments", label: "Comments", count: counts.openCommentsCount || counts.commentsCount || null, on: activeTab === "comments" },
      ...(counts.hasPlan ? [{ id: "plan", label: "Full plan", on: activeTab === "plan" }] : []),
    ];
    const steps = Array.isArray(t.steps) ? t.steps : [];
    const allOpen = steps.length > 0 && steps.every((s) => this.expandedSteps.has(s.n));
    return h_flex()
      .flex_none()
      .py(SPACE[3])
      .gap(SPACE[2])
      .items_center()
      .justify_between()
      .child(segmented(c, {
        id: "bh-task-detail-tabs",
        items,
        onPick: (id, cx) => {
          this.detailTab = id;
          cx.notify();
        },
      }))
      .when(activeTab === "steps" && steps.length > 0, (el) => el.child(
        actionButton(c, "bh-steps-toggle-all", allOpen ? "Collapse all" : "Expand all", (_e, cx) => {
          this.expandedSteps = allOpen ? new Set() : new Set(steps.map((s) => s.n));
          cx.notify();
        }, { tone: "quiet" }),
      ));
  }

  /** Renders the currently active detail tab inside the single scroll container. */
  taskTabBody(c, t) {
    const loadingDetail = this.taskDetailId !== t.id;
    if (loadingDetail && this.detailTab !== "plan") {
      return stateView(c, { id: "bh-task-detail-loading", title: "Loading task details…", loading: true });
    }
    if (this.detailTab === "iterations" && t.mode === "goal") return this.taskIterationsTab(c, t);
    if (this.detailTab === "board") return this.taskBoardTab(c, t);
    if (this.detailTab === "comments") return this.taskCommentsTab(c, t);
    if (this.detailTab === "plan" && t.plan) return this.taskPlanTab(c, t);
    return this.taskStepsTab(c, t);
  }

  /** Iterations tab: Gap Ledger history for Goal runs (newest first, showing ratchet reverts & lessons). */
  taskIterationsTab(c, t) {
    const rows = Array.isArray(t.iterations) ? [...t.iterations].reverse() : [];
    if (!rows.length) return mutedLine(c, "No verification iterations yet. Click Verify now or let the Goal loop run.");
    return v_flex()
      .gap(SPACE[2])
      .children(rows.map((r) => {
        const pass = r.verdict === "PASS";
        const spend = formatUsd(r.spendUsd) || "$0.00";
        const passed = Array.isArray(r.passed) ? r.passed : [];
        const failed = Array.isArray(r.failed) ? r.failed : [];
        return v_flex()
          .id(`bh-goal-iter-${t.id}-${r.n}`)
          .p(SPACE[3])
          .gap(SPACE[2])
          .rounded(SIZE.control)
          .bg(c.fill)
          .border_1()
          .border_color(r.reverted ? alpha(c.warning, 0.45) : c.edge)
          .child(h_flex().gap(SPACE[2]).items_center().justify_between()
            .child(h_flex().gap(SPACE[2]).items_center()
              .child(div().text_size(TYPE.sm).font_semibold().text_color(c.ink).child(`Iteration #${r.n}`))
              .child(pill(c, r.verdict || "FAIL", pass ? c.success : c.danger))
              .when(Boolean(r.improved), (el) => el.child(pill(c, "Ratchet ↑", c.success)))
              .when(Boolean(r.reverted), (el) => el.child(pill(c, "Reverted to best", c.warning)))
              .when(Boolean(r.oscillating), (el) => el.child(pill(c, "Oscillating", c.warning))))
            .child(div().text_size(TYPE.xs).text_color(c.faint).child(`${spend}${r.at ? ` · ${boardAge(r.at)}` : ""}`)))
          .child(div().text_size(TYPE.xs).text_color(c.muted)
            .child(`Passed: ${passed.join(", ") || "none"} · Failed: ${failed.join(", ") || "none"}`))
          .when(Boolean(r.hypothesis), (el) => el.child(div().text_size(TYPE.xs).text_color(c.muted).child(`Hypothesis: ${r.hypothesis}`)))
          .when(Boolean(r.lesson), (el) => el.child(div().text_size(TYPE.xs).text_color(r.reverted ? c.warning : c.ink).child(`Lesson: ${r.lesson}`)))
          .when(Boolean(r.bannedApproach), (el) => el.child(div().text_size(TYPE.xs).text_color(c.danger).child(`Banned approach: ${r.bannedApproach}`)));
      }));
  }

  /** Steps tab: interactive expandable step cards with live terminals, timeline events, and transitions. */
  taskStepsTab(c, t) {
    const steps = Array.isArray(t.steps) ? t.steps : [];
    if (!steps.length) return mutedLine(c, "No steps yet.");
    const comments = openFirst(t.comments);
    const liveTerminals = terminals();
    const next = steps.find((s) => !["done", "skipped", "active", "blocked"].includes(s.status));
    return v_flex()
      .gap(SPACE[2])
      .children(steps.map((s) => this.stepCard(c, t, s, { next: s === next, comments, liveTerminals })));
  }

  /** Toggles one step card's expanded state. */
  toggleStep(n, cx) {
    const next = new Set(this.expandedSteps);
    if (next.has(n)) next.delete(n);
    else next.add(n);
    this.expandedSteps = next;
    cx.notify();
  }

  /** One expandable step card: clickable header + expanded events, comments, and action controls. */
  stepCard(c, t, s, { next, comments, liveTerminals }) {
    const expanded = this.expandedSteps.has(s.n);
    const notes = comments.filter((x) => x.step === s.n);
    const liveNotes = notes.filter((x) => x.open !== false).length;
    const who = stepAgents(s.agentName && !s.agent ? { agent: s.agentName } : s);
    const term = terminalForStep(s, t.children ?? [], liveTerminals);
    const termWorking = Boolean(term && liveTerminals.find((x) => (x.address ?? x.id) === term.id)?.status === "working");
    const done = s.status === "done" || s.status === "skipped";
    const time = this.stepTime(s);
    const hl = this.stepFinishing.get(`${t.id}:${s.n}`);
    return v_flex()
      .relative()
      .flex_none()
      .rounded(SIZE.control)
      .bg(c.fill)
      .border_1()
      .border_color(expanded ? alpha(c.accent, 0.45) : c.edge)
      .px(SPACE[4])
      .py(SPACE[3])
      .gap(SPACE[3])
      .when(Boolean(hl), (el) => el.child(div()
        .id(`bh-step-hl-${t.id}-${s.n}`)
        .absolute()
        .inset_0()
        .rounded(SIZE.control)
        .bg(stateTone(c, "done"))
        .opacity(hl === "on" ? 0.14 : 0)
        .transition("opacity", MOTION.highlight)))
      .child(this.stepCardHeader(c, t, s, { expanded, next, done, who, time, liveNotes, working: s.status === "active" || termWorking }))
      .when(expanded, (el) => el.child(this.stepCardBody(c, t, s, { notes, term })));
  }

  /** Clickable header row of a step card. */
  stepCardHeader(c, t, s, { expanded, next, done, who, time, liveNotes, working }) {
    const first = who[0] ?? s.agentName ?? null;
    return clickable(
      h_flex()
        .gap(SPACE[2])
        .items_center()
        .rounded(SIZE.nested)
        .on_click((_e, cx) => this.toggleStep(s.n, cx))
        .child(svg(ICON(expanded ? "chevron-down" : "chevron-right")).flex_none().size(GLYPH.sm).text_color(c.faint))
        .child(statusMark(c, s.status, MARK))
        .child(div().flex_none().w(SPACE[5] + SPACE[2]).text_size(TYPE.sm).text_color(c.muted).child(`${s.n}.`))
        .child(div().flex_1().min_w(0).text_size(TYPE.md).font_medium().line_height(`${LINE.md}px`).text_color(done ? c.muted : c.ink).child(s.title))
        .when(next, (el) => el.child(pill(c, "next", c.accent)))
        .when(Boolean(first), (el) => el.child(h_flex().flex_none().gap(SPACE[2]).items_center().text_size(TYPE.sm)
          .child(agentDot(c, first))
          .child(div().font_medium().text_color(agentInk(c, first)).child(who.length > 1 ? `${who.length} agents` : first))))
        .when(working, (el) => el.child(pill(c, "working", stateTone(c, "working"), { pulse: true })))
        .when(Boolean(time), (el) => el.child(div().flex_none().text_size(TYPE.sm).text_color(c.muted).child(`· ${time}`)))
        .when(liveNotes > 0, (el) => el.child(commentCount(c, liveNotes)))
        .when(Boolean(s.report?.file), (el) => el.child(this.reportLink(c, s.report.file, `bh-step-report-${t.id}-${s.n}`))),
      c,
      `bh-step-${t.id}-${s.n}`,
    );
  }

  /** Expanded body of a step card: note/summary, events timeline, step comments, actions, and usage. */
  stepCardBody(c, t, s, { notes, term }) {
    const events = Array.isArray(s.events) ? s.events : [];
    const skills = skillsLine(s.skills);
    const usage = usageText(s.usage);
    const actions = stepActions(s);
    return v_flex()
      .ml(SPACE[5] + SPACE[3])
      .pt(SPACE[3])
      .gap(SPACE[3])
      .border_t(HAIR)
      .border_color(c.edge)
      .when(Boolean(s.note), (el) => el.child(div().text_size(TYPE.sm).text_color(c.muted).child(s.note)))
      .when(Boolean(s.report?.summary), (el) => el.child(div().text_size(TYPE.sm).text_color(c.muted).child(s.report.summary)))
      .when(Boolean(skills), (el) => el.child(div().text_size(TYPE.xs).text_color(c.faint).child(skills)))
      .when(events.length > 0, (el) => el.child(v_flex().gap(SPACE[2]).children(events.map((ev, idx) => this.stepEventRow(c, ev, idx)))))
      .when(notes.length > 0, (el) => el.child(v_flex().gap(SPACE[2]).children(notes.map((x) => this.commentNote(c, x, this.commentActions("task", t.id, x), 0)))))
      .child(h_flex().flex_wrap().gap(SPACE[2]).items_center().justify_between().pt(SPACE[1])
        .child(h_flex().flex_wrap().gap(SPACE[2]).items_center()
          .when(Boolean(term), (el) => el.child(actionButton(c, `bh-step-term-${t.id}-${s.n}`, "Open terminal", (_e, cx) => {
            cx.stop_propagation();
            openTerminal(term.id);
          }, { icon: "page-terminals" })))
          .child(actionButton(c, `bh-step-comment-${t.id}-${s.n}`, "Comment", (_e, cx) => {
            cx.stop_propagation();
            this.commentStep = { n: s.n, title: s.title };
            this.taskComposer.expanded = true;
            this.taskComposer.focus();
            cx.notify();
          }, { icon: "comment" }))
          .children(actions.map((a) => actionButton(c, `bh-step-act-${t.id}-${s.n}-${a.id}`, a.label, (_e, cx) => {
            cx.stop_propagation();
            this.actTask(["task", "step", t.id, String(s.n), a.to], cx, (r, cx) => {
              if (r.code === 0) this.taskComposer.say(`Step ${s.n}: ${a.label}`, cx);
            }, t.updated);
          }, { tone: a.tone }))))
        .when(Boolean(usage), (el) => el.child(div().flex_none().text_size(TYPE.xs).text_color(c.faint).child(usage))));
  }

  /** One event row in an expanded step's inline timeline (checks, board posts, reports, merges). */
  stepEventRow(c, ev, idx) {
    const label = ev.kind === "board" && ev.detail ? String(ev.detail) : String(ev.kind ?? "event");
    const tone = toneColor(c, stepEventTone(ev));
    const head = ev.kind === "board" ? (ev.from || "team") : (ev.text || ev.from || label);
    const tail = ev.kind === "board" ? ev.text : ev.detail;
    const when = boardAge(ev.at);
    return h_flex()
      .id(`bh-ev-${idx}-${hash(`${ev.at}${ev.text}`)}`)
      .gap(SPACE[2])
      .items_center()
      .text_size(TYPE.sm)
      .child(pill(c, label, tone))
      .child(div().flex_none().font_medium().text_color(c.ink).child(String(head ?? "")))
      .when(Boolean(tail), (el) => el.child(div().flex_1().min_w(0).truncate().text_color(c.muted).child(`— ${tail}`)))
      .when(Boolean(when), (el) => el.child(div().flex_none().text_size(TYPE.xs).text_color(c.faint).child(when)));
  }

  /** A quiet Report link: the file opens over the page, from the project folder; the click stays its own. */
  reportLink(c, file, id) {
    const open = (_e, cx) => {
      cx.stop_propagation();
      openFile({ path: file, root: projectDir() });
    };
    return focusable(
      pressable(h_flex().flex_none().h(CHIP).px(SPACE[2]).gap(SPACE[2]).items_center().rounded(SIZE.nested)
        .text_size(TYPE.sm).text_color(c.muted).hover((s) => s.bg(c.hover).text_color(c.ink)).on_click(open)
        .child(svg(ICON("file")).flex_none().size(GLYPH.sm)).child("Report")),
      id, c);
  }

  /** Board tab: kind filter chips (only kinds with entries) + live newest-first board entries. */
  taskBoardTab(c, t) {
    const board = Array.isArray(t.board) ? t.board : [];
    const { items, counts } = filterBoard(board, this.boardKind);
    const rows = [...items].reverse();
    return v_flex()
      .gap(SPACE[3])
      .child(h_flex().role("tab_list").flex_wrap().gap(SPACE[2]).items_center().children(BOARD_KINDS
        .filter((kind) => chipHasResults(counts[kind], this.boardKind === kind))
        .map((kind) => filterChip(c, {
          id: `bh-board-kind-${kind}`,
          label: kind === "all" ? "All" : kind,
          count: counts[kind],
          on: this.boardKind === kind,
          onClick: (_e, cx) => {
            this.boardKind = kind;
            cx.notify();
          },
        }))))
      .when(!rows.length, (el) => el.child(mutedLine(c, board.length ? `No ${this.boardKind} entries on the board.` : "Nothing on the board yet.")))
      .children(rows.map((e, i) => this.boardRow(c, t, e, i)));
  }

  /** One board entry: its number, type word, who posted it and when, then what it says. A contract, a
   * stack trace or a path is machine text: one muted mono line that expands. */
  boardRow(c, t, e, i) {
    const raw = String(e.text ?? "");
    const text = linkFiles(raw);
    const id = `bh-board-text-${t.id}-${e.n}`;
    const kind = machineKind(raw);
    return v_flex()
      .flex_none()
      .gap(SPACE[2])
      .p(SPACE[3])
      .rounded(SIZE.control)
      .bg(c.fill)
      .border_1()
      .border_color(c.edge)
      .opacity(this.rowsIn === false ? 0 : 1)
      .transition("opacity", { ...MOTION.row, delay: Math.min(i, 8) * MOTION.stagger })
      .child(h_flex().flex_wrap().gap(SPACE[2]).items_center()
        .when(e.n != null, (el) => el.child(div().text_size(TYPE_SCALE.metadata).text_color(c.faint).child(`#${e.n}`)))
        .child(div().text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child(String(e.kind ?? "note")))
        .child(div().text_size(TYPE.sm).font_medium().text_color(agentInk(c, e.from ?? "the team")).child(e.from ?? "the team"))
        .when(Boolean(e.to), (el) => el.child(div().text_size(TYPE.sm).text_color(c.muted).child(`→ ${e.to}`)))
        .child(div().text_size(TYPE_SCALE.metadata).text_color(c.faint).child(boardAge(e.at)))
        .when(Boolean(e.file), (el) => el.child(this.reportLink(c, e.file, `bh-board-report-${t.id}-${e.n}`))))
      .child(kind
        ? machineLine(c, {
          id,
          text: raw,
          expanded: this.machineOpen.has(id),
          onToggle: (_e, cx) => {
            toggleMachine(this.machineOpen, id);
            cx.notify();
          },
        })
        : markdownWithFoldedCode(c, { id, text, open: this.machineOpen, onLink: (url) => openLink(url, projectDir()) }));
  }

  /** A step's recorded time (its `timeMs`, else its stored `workedMs`); "" for one not started. */
  stepTime(s) {
    const ms = Number.isFinite(s.timeMs) ? s.timeMs : (s.workedMs ?? 0);
    if (!ms && s.status !== "active") return "";
    return duration(ms);
  }

  /** Full plan tab: displays plan id and quick actions to open the plan sheet or switch to Plans tab. */
  taskPlanTab(c, t) {
    return v_flex()
      .p(SPACE[4])
      .gap(SPACE[3])
      .rounded(SIZE.control)
      .bg(c.fill)
      .border_1()
      .border_color(c.edge)
      .child(h_flex().gap(SPACE[2]).items_center()
        .child(svg(ICON("page-plans")).flex_none().size(GLYPH.lg).text_color(c.accent))
        .child(div().text_size(TYPE.md).font_semibold().child(`Plan ${t.plan}`)))
      .child(mutedLine(c, "This task was created from an agreed plan. Open the full plan sheet to inspect step details or jump to the Plans tab."))
      .child(h_flex().flex_wrap().gap(SPACE[2]).items_center()
        .child(actionButton(c, `bh-task-plan-open-${t.id}`, "Open full plan", (_e, cx) => this.openFullPlan(t, cx), { icon: "file", tone: "primary" }))
        .child(actionButton(c, `bh-task-plan-tab-${t.id}`, "View in Plans tab", (_e, cx) => {
          this.planId = t.plan;
          keep("plan", t.plan);
          if (this.fixed) showPage("plans");
          else this.show("plans", cx);
        }, { icon: "page-plans" })));
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

  /** Comments tab: all open and resolved comments with step badges and `--if-updated` actions. */
  taskCommentsTab(c, t) {
    const comments = openFirst(t.comments);
    if (!comments.length) {
      return mutedLine(c, "No comments yet. Click the bar below to write a comment — Markdown and images work there, and the Orchestrator takes it into account.");
    }
    return v_flex()
      .gap(SPACE[2])
      .children(comments.map((x) => v_flex()
        .flex_none()
        .p(SPACE[3])
        .gap(SPACE[2])
        .rounded(SIZE.control)
        .bg(c.fill)
        .border_1()
        .border_color(c.edge)
        .when(x.step != null, (el) => el.child(h_flex().gap(SPACE[2]).items_center()
          .child(pill(c, `Step ${x.step}`, c.accent))
          .when(Boolean(x.at), (el2) => el2.child(div().text_size(TYPE.xs).text_color(c.faint).child(boardAge(x.at))))))
        .child(this.commentNote(c, x, this.commentActions("task", t.id, x), 0))));
  }

  /** Foldable composer dock at the foot of the task detail pane: sleek bar when folded, bounded Composer when open. */
  taskComposerDock(c, t, inner, height) {
    const folded = this.taskComposer.isFolded() && !this.taskComposer.toast;
    if (folded) {
      const label = this.commentStep
        ? `Comment on step ${this.commentStep.n}… (click to write)`
        : `Comment on ${t.title ?? t.id}… (click to write)`;
      return div()
        .flex_none()
        .pt(SPACE[2])
        .pb(SIZE.foot)
        .child(clickable(
          h_flex()
            .w_full()
            .h(CONTROL + SPACE[4])
            .px(SPACE[4])
            .gap(SPACE[3])
            .items_center()
            .justify_between()
            .bg(c.fill)
            .border_1()
            .border_color(c.edge)
            .rounded(SIZE.radius)
            .shadow_sm()
            .cursor_text()
            .on_click((_e, cx) => {
              this.taskComposer.expanded = true;
              this.taskComposer.focus();
              cx.notify();
            })
            .child(div().flex_1().min_w(0).truncate().text_size(TYPE.md).text_color(c.faint).child(label))
            .child(div().flex_none().text_size(TYPE.xs).font_medium().text_color(c.accent).child("↵ Send")),
          c,
          "bh-task-composer-bar", { edge: true },
        ));
    }
    const compW = Math.min(SIZE.maxWidth, Math.max(320, inner));
    return v_flex()
      .flex_none()
      .pt(SPACE[2])
      .pb(SIZE.foot)
      .gap(SPACE[2])
      .items_center()
      // The header belongs to the open box: a toast over the folded slim bar must not bring it back.
      .when(!this.taskComposer.isFolded(), (el) => el.child(h_flex().w(Math.min(compW, inner)).items_center().justify_between().gap(SPACE[2])
        .child(h_flex().gap(SPACE[2]).items_center()
          .when(Boolean(this.commentStep), (el2) => el2.child(pill(c, `Commenting on step ${this.commentStep.n}`, c.accent))
            .child(actionButton(c, "bh-task-step-clear", null, (_e, cx) => {
              this.commentStep = null;
              cx.notify();
            }, { icon: "x", tone: "quiet", tooltip: "Comment on whole task", a11y: "Clear step target" }))))
        .child(actionButton(c, "bh-task-composer-hide", "Hide", (_e, cx) => {
          this.taskComposer.expanded = false;
          this.commentStep = null;
          cx.notify();
        }, { tone: "quiet" }))))
      .child(this.taskComposer.render(this.cx, compW + SIZE.gutter * 2, height));
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

  /** The plan whose column the page draws now: the box pins to the page's foot with it, and not on the list or the intro. */
  shownPlan() {
    if (this.tab !== "plans" || !this.plan) return null;
    return this.width < NARROW && this.showPrevious ? null : this.plan;
  }

  /** Whether the Plans box is folded to its slim bar on the page drawn now. */
  planBoxFolded() {
    return Boolean(this.shownPlan()) && this.planComposer.isFolded();
  }

  /** A press on the conversation folds the box to its slim bar; a click on the bar or typing grows it back, draft intact. */
  foldPlanBox(cx) {
    if (this.planStartOpen) {
      this.planStartOpen = false;
      cx.notify();
    }
    if (this.commenting) return; // an open comment box takes the press
    this.planComposer.expanded = false;
    this.handle.focus(); // the text box is not drawn while folded: typing comes here
    cx.notify();
  }

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
   * scrolling above the box, and the View plan tab on the box's top edge at the page's foot.
   */
  planColumn(c, w, p, { rail }) {
    const box = this.planComposer.height(w);
    const tab = p.markdown ? CONTROL : 0;
    return v_flex()
      .id(`bh-plan-main-${p.id}`)
      .relative()
      .flex_none()
      .w(w)
      // A pinned plan page has no tab bar above it (its refresh is in the rail): the column starts at
      // the page's own top padding and reaches its foot. A block that keeps its tabs subtracts them.
      .h(Math.max(300, this.height - (this.fixed ? SPACE[5] : PAGE_CHROME)))
      .gap(SPACE[2])
      .when(rail, (el) => el.child(this.planRail(c, p, { horizontal: true })))
      // The conversation ends above the pinned box and its tab: the last round scrolls clear of them.
      .child(foldRegion(v_flex().id(`bh-plan-talk-${p.id}`).flex_1().min_h(0).overflow_y_scroll().gap(SPACE[4]).pb(SIZE.foot + box + tab + SPACE[4])
        .on_mouse_down("left", (_e, cx) => this.foldPlanBox(cx)), `Plan conversation: ${p.title ?? p.id}`, (cx) => this.foldPlanBox(cx))
        .child(this.planTitle(c, p))
        .child(this.planConversation(c, p, w)))
      // The box at the page's foot, as the chat draws its composer: its pane and toast grow up over the page.
      .child(v_flex()
        .absolute()
        .left(0)
        .right(0)
        .bottom(SIZE.foot)
        .items_center()
        .when(Boolean(p.markdown), (el) => el.child(this.viewPlanTab(c, p)))
        .child(this.planComposer.render(this.cx, w, this.height)));
  }

  /** The plan's title in the heading size, with bundled issue chips, status pill, and Compact Start ▾ menu. */
  planTitle(c, p) {
    const status = p.status ?? "grilling";
    const ready = status === "ready" && !p.task;
    const chips = issueChips(c, p.issues);
    return v_flex()
      .flex_none()
      .gap(SPACE[2])
      .child(h_flex().flex_none().gap(SPACE[3]).items_center()
        .child(div().flex_1().min_w(0).truncate().text_size(TYPE.lg).font_semibold().child(p.title || p.idea || p.id))
        .when(Boolean(chips), (el) => el.child(chips))
        .child(pill(c, PLAN_STATUS[status]?.label ?? status, planTone(c, status), { pulse: status === "grilling" }))
        .when(ready, (el) => el.child(startMenuTrigger(c, {
          open: this.planStartOpen,
          idPrefix: `bh-plan-start-${p.id}`,
          onToggle: (cx) => {
            this.planStartOpen = !this.planStartOpen;
            cx.notify();
          },
        }))))
      .when(ready && this.planStartOpen, (el) => el.child(startMenuPanel(c, p, {
        idPrefix: `bh-plan-start-${p.id}`,
        onClose: (cx) => {
          this.planStartOpen = false;
          cx.notify();
        },
      })));
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
      "bh-view-plan", { edge: true },
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
      .children(asked.map((q, i) => (i === newest ? this.questionSet(c, q) : this.answeredSet(c, q))));
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
      .when(q.status === "open" && !picked.length && !typed, (el) => el.child(mutedLine(c, "Answer below")));
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
      `bh-plan-mock-${key}`, { edge: true },
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
    const states = this.seatsNow();
    return (horizontal ? h_flex().flex_wrap().w_full() : v_flex().flex_none().w(RAIL_W))
      .items_center()
      .gap(SPACE[2])
      .when(!horizontal, (el) => el.gap(SPACE[3]))
      .child(div().tooltip(`Round ${round}`).flex_none().size(32).rounded_full().border_1().border_color(c.edge).flex().items_center().justify_center()
        .text_size(TYPE.sm).font_semibold().child(String(round)))
      .children(seats().map((seat) => this.seatPill(c, p, seat, off.has(seat.id), states[seat.id])))
      .child(div().flex_none().bg(c.edge)
        .when(horizontal, (el) => el.w(HAIR).h(CONTROL))
        .when(!horizontal, (el) => el.w(CONTROL + SPACE[2]).h(HAIR)))
      .children(this.railActions(c, p));
  }

  /** A seat's pill: its state and three letters in the seat's colour when on, faint when off, and a badge of its open questions. No tint and no outlined chip: the colour is the identity. */
  seatPill(c, p, seat, off, state = "none") {
    const el = this.seatFace(c, seat, { on: !off, state, waiting: waitingFor(p, seat.id) });
    if (seat.fixed) return el;
    return focusable(
      pressable(el.hover((s) => s.bg(c.hover)).on_click((_e, cx) => {
        this.act(["plan", "seat", p.id, seat.id, off ? "--on" : "--off"], cx);
      })),
      `bh-seat-${seat.id}`,
      c,
    );
  }

  /** A seat's three letters on its pill: in the seat's colour when on, faint when off; only the state dot fills a circle. */
  seatFace(c, seat, { on, state, waiting }) {
    return h_flex()
      .relative()
      .flex_none()
      .w(40)
      .h(CONTROL)
      .gap(SPACE[1])
      .justify_center()
      .items_center()
      .rounded(SIZE.control)
      .text_size(TYPE.xs)
      .font_semibold()
      .text_color(on ? agentInk(c, seat.id) : c.faint)
      .tooltip(`${seat.name}${on ? "" : " (off)"} · ${SEAT_STATE[state] ?? state}`)
      .child(seatMark(c, state))
      .child(seat.short)
      .when(waiting > 0, (x) => x.child(seatBadge(c, waiting)));
  }

  /** The rail's icon actions: Refresh (a pinned plan page has no top bar to hold it), Other plans, New plan, and Discard (two steps, like Delete). */
  railActions(c, p) {
    return [
      ...(this.fixed ? [this.refreshButton(c)] : []),
      this.otherPlansButton(c),
      this.newPlanButton(c),
      this.discardPlanButton(c, p),
    ];
  }

  refreshButton(c) {
    return actionButton(c, "bh-plan-refresh", null, (_e, cx) => this.reload(cx), { icon: "refresh-cw", tone: "quiet", tooltip: "Refresh" });
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
          // The chip is marked as chosen only while a filter is on: with no filter, nothing is picked.
          const on = filter.size > 0 && filter.has(a);
          return focusable(
            pressable(
              h_flex().h(CONTROL).px(SPACE[2]).gap(SPACE[2]).items_center().rounded(SIZE.nested)
                .when(on, (el) => el.bg(c.fill))
                .text_size(TYPE.sm)
                .font_medium()
                .text_color(on ? c.ink : c.muted)
                .hover((s) => s.bg(c.hover))
                .on_click((_e, cx) => {
                  if (!this.knowFilter) this.knowFilter = new Set();
                  if (this.knowFilter.has(a)) this.knowFilter.delete(a); else { if (!this.knowFilter.size) this.knowFilter = new Set(agents.filter((x) => x !== a)); else this.knowFilter.add(a); }
                  if (this.knowFilter.size === agents.length) this.knowFilter.clear();
                  cx.notify();
                })
                .child(div().flex_none().size(DOT).rounded_full().bg(agentInk(c, a)))
                .child(a.charAt(0).toUpperCase() + a.slice(1)),
            ),
            `bh-know-chip-${a}`,
            c, { edge: true },
          );
        })))
        .child(actionButton(c, "bh-know-new-open", "New note", () => openNoteForm({
          agents,
          agent: this.agent ?? (filter.size === 1 ? [...filter][0] : "orchestrator"),
          dir: this.dir,
        }), { tone: "primary" })))
      .when(this.knowUndos.length > 0, (el) => el.child(v_flex().gap(SPACE[2]).children(this.knowUndos.map((u) =>
        h_flex()
          .id(`bh-know-undo-${u.id}`)
          .role("status")
          .h(CONTROL + SPACE[2])
          .px(SPACE[3])
          .gap(SPACE[2])
          .items_center()
          .rounded(RADIUS.control)
          .bg(c.fill)
          .border_1()
          .border_color(c.edge)
          .child(div().text_size(TYPE_SCALE.metadata).text_color(c.textSecondary).child("Deleted ·"))
          .child(actionButton(c, `bh-know-undo-btn-${u.id}`, "Undo", (_ev, cx) => this.undoKnowledgeDelete(u, cx), { tone: "quiet" })),
      ))))
      .child(h_flex().w(width).gap(SPACE[4]).items_start().children(
        columns.map((col) =>
          v_flex().flex_1().min_w(0).gap(SPACE[4]).children(
            col.map((card, i) => this.knowNoteCard(c, card, i)),
          ),
        ),
      ))
      .when(!cards.length, (el) => el.child(div().w_full().py(SPACE[5]).text_size(TYPE.md).text_color(c.muted).child("No notes match.")));
  }

  /** A knowledge note's links: Resolve takes it back, Delete takes it back with 5 s inline Undo, Edit rewrites it. */
  noteActions(agent, e, n) {
    const w = this.commenting;
    const unnote = (cx) => this.act(["knowledge", "unnote", agent, "--at", n.at], cx);
    return {
      key: `bh-know-n-${agent}-${hash(`${n.at}${n.note}`)}`,
      editing: Boolean(w && w.kind === "knowledge" && w.id === agent && w.edit === n.at),
      resolve: unnote,
      delete: (cx) => this.deleteKnowledgeNote(agent, e, n, cx),
      edit: (cx) => {
        this.agent = agent;
        this.editInline("knowledge", agent, e.line, n.at, n.note, cx);
      },
    };
  }

  knowNoteCard(c, card, index = 0) {
    const { agent, entry: e, notes, section } = card;
    const key = `${agent}:${e.line}`;
    const on = this.addingAt("knowledge", agent, e.line);
    const body = /^\s{0,3}[-*+]\s+/.test(e.text) ? e.text.replace(/^\s{0,3}[-*+]\s+/, "") : e.text;
    const handles = this.cardHandles(key);
    const handle = handles?.card ?? null;
    const editHandle = handles?.edit ?? null;
    const delHandle = handles?.del ?? null;
    const showActions = this.actionsOn.has(key)
      || Boolean(handle?.is_focused?.() || editHandle?.is_focused?.() || delHandle?.is_focused?.());
    const openEditor = (cx) => {
      this.agent = agent;
      this.knownText = (this.knowAll?.find((x) => x.agent === agent)?.text ?? "");
      this.editor.set_value(this.knownText);
      this.editing = true;
      cx.notify();
    };
    return clickable(
      v_flex()
        .flex_none()
        .relative()
        .p(SPACE[4])
        .gap(SPACE[3])
        .rounded(SIZE.radius)
        .bg(c.fill)
        .border_1()
        .border_color(c.edge)
        .hover((s) => s.border_color(c.controlBorder))
        .opacity(this.rowsIn === false ? 0 : 1)
        .transition("opacity", { ...MOTION.row, delay: Math.min(index, 8) * MOTION.stagger })
        .when(Boolean(handle), (el) => el.track_focus(handle))
        // Hover and keyboard handlers sit on the outer focusable card so hovering the body or
        // reaching the card by Tab reveals Edit and Delete.
        .on_hover((over, cx) => {
          if (over) this.actionsOn.add(key);
          else this.actionsOn.delete(key);
          cx.notify();
        })
        .on_key_down((ev, cx) => {
          if (!cardKeysActive({ typingCount: this.typingCount, editing: this.editing, commenting: this.commenting })) return;
          if (!this.actionsOn.has(key)) {
            this.actionsOn.add(key);
            cx.notify();
          }
          if (isChord(ev)) return;
          const k = keyName(ev);
          if (k === "e") {
            cx.stop_propagation();
            openEditor(cx);
          } else if (k === "delete" || k === "backspace") {
            cx.stop_propagation();
            this.deleteEntry(agent, e, cx);
          }
        })
        .on_click((_e, cx) => { this.agent = agent; this.startInline("knowledge", agent, e.line, cx); })
        // The agent is marked by its dot and name only: no card wash, no stripe. Both use the
        // identity colour repaired for the card (3:1 for the dot, AA for the name).
        .child(h_flex().gap(SPACE[3]).items_center()
          .child(div().flex_none().size(DOT).rounded_full().bg(agentInk(c, agent)))
          .child(div().text_size(TYPE.xs).font_medium().text_color(agentInk(c, agent)).child(agent.charAt(0).toUpperCase() + agent.slice(1)))
          .when(Boolean(section), (el) => el.child(div().text_size(TYPE.xs).text_color(c.faint).child(section)))
          .child(div().flex_1())
          .when(showActions, (el) => el
            .child(focusable(
              pressable(
                div().size(TARGET).flex().items_center().justify_center().rounded(SIZE.nested).text_color(c.faint).hover((s) => s.bg(c.hover).text_color(c.ink))
                  .when(Boolean(editHandle), (el) => el.track_focus(editHandle))
                  .on_click((_ev, cx) => { cx.stop_propagation?.(); openEditor(cx); })
                  .child(svg(ICON("external-link")).size(GLYPH.sm))
                  .role("button")
                  .accessibility_label(`Edit ${agent}'s knowledge`),
              ),
              `bh-know-edit-${agent}-${e.line}`,
              c,
            ))
            .child(focusable(
              pressable(
                div().size(TARGET).flex().items_center().justify_center().rounded(SIZE.nested).text_color(c.faint).hover((s) => s.bg(c.well).text_color(c.danger))
                  .when(Boolean(delHandle), (el) => el.track_focus(delHandle))
                  .on_click((_ev, cx) => { cx.stop_propagation(); this.deleteEntry(agent, e, cx); })
                  .child(svg(ICON("trash")).size(GLYPH.sm))
                  .role("button")
                  .accessibility_label(`Delete this ${agent} entry`),
              ),
              `bh-know-del-${agent}-${e.line}`,
              c,
            ))))
        .child(div().text_size(TYPE.md).line_height(`${LINE.md}px`).child(TextView.markdown(`bh-know-card-md-${agent}-${e.line}-${hash(e.text)}`, body)))
        .when(notes.length > 0, (el) => el.child(v_flex().gap(SPACE[2]).children(notes.map((n) => this.commentNote(c, { id: n.at, text: n.note, open: true }, this.noteActions(agent, e, n))))))
        .when(on, (el) => el.child(this.inlineBox(c).ml(0).mr(0))),
      c,
      `bh-know-card-${agent}-${e.line}`, { edge: true },
    );
  }
}
