// The chat page: one conversation with every agent in the space. Your messages and the agents'
// replies run up the page; the composer sits at the foot. It is a page of its own (the layout's
// "pages" stack), so the terminals stay untouched on theirs.
//
// An agent's reply is the file it writes at the end of each turn (brief.js tells it where). We
// read those files every few seconds. An agent that stops without writing one, or that needs an
// answer in its terminal, gets a line here with a way to its terminal.

import { div, svg, image } from "gpui-kit";
import { v_flex, h_flex, TextView, InputState, Input } from "gpui-base";
import { terminals, spaces, focused, settings, shared, setShared, readTextFile } from "herdr";
import * as fs from "fs/promises";
import { SIZE, ICON, TYPE, LINE, SPACE, ROW, CHIP, CONTROL, TARGET, HAIR, MARK, DOT, PIP, GLYPH, MOTION, SCRIM, readable, textWidth, agentInk, clickable, isLight } from "./look.js";
import { stateView } from "./switch.js";
import { colors } from "./theme.js";
import { Composer, outboxDir, liveAgents } from "./composer.js";
import { isQuiet, quietStatus } from "./live.js";
import { FOCUS, OUTGOING, OPEN_TASK, activePage, openTerminal, showPage, sendFromChat } from "./pages.js";
import { replyFile, replyBody, push, shown, scrollBy, clampScroll, isNew, outcome, clock, segments, fold, linkFiles, fileTarget, FILE_LINK, addComment, editComment, resolveComment, deleteComment } from "./feed.js";
import { openFile } from "./viewer.js";
import { bh, bhJson, enc, projectDir } from "./bh.js";
import { roleWord, roleTone, mentionTone, alpha } from "./indicators.js";
import { indicatorFor, roleOf, onTurn, TURN_MS } from "./working.js";
import { findAgent, roster, ROSTER_KEY } from "./roster.js";
import { summary } from "./drawer.js";
import { mockup, openInBrowser } from "./media.js";
import { commentRow } from "./plandoc.js";
import { openLightbox } from "./lightbox.js";

/** Where agents' questions for the person wait (bh ask writes them; answered ones move aside). */
const questionsDir = () => `${outboxDir().replace(/\/replies$/, "")}/questions`;
/** What an agent run headless is doing right now (agent.mjs writes it on each tool call). */
const activityDir = () => `${outboxDir().replace(/\/replies$/, "")}/activity`;

const POLL_MS = 2500;
const TASKS_MS = 5000;
const WIDGET_W = 260;

const load = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
};
const save = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // the feed still works for this session
  }
};

/** Plain text as Markdown that shows it verbatim: every mark escaped, every line break kept. */
export function plainMarkdown(text) {
  return String(text ?? "")
    .split(/\n{2,}/)
    .map((para) => para.split("\n").map((line) => line.replace(/([\\`*_{}\[\]()#+\-.!|<>~&])/g, "\\$1")).join("\\\n"))
    .join("\n\n");
}

/** Selectable text: a press on it selects (and Ctrl/Cmd+C copies) instead of reaching the feed. */
const selectable = (id, text) => TextView.markdown(id, plainMarkdown(text)).selectable(true);
/** Keeps a press on text from the feed's handler, which would take focus and end the selection. */
const keepPress = (el) => el.on_mouse_down("left", (_e, cx) => cx.stop_propagation());

export class Chat {
  init(props, cx) {
    this.size = { width: 960, height: 640 };
    this.entries = load("feed", []);
    this.seen = load("seen", {}); // address → the last reply text shown
    this.waits = {}; // address → { name, worked, stopped, blocked }: agents we wrote to
    this.doing = {}; // address → what a headless agent is doing ("Read src/app.tsx")
    this.back = 0; // whole entries scrolled up from the newest
    this.px = 0; // pixels scrolled into the entry `back` up from the newest
    this.heights = new Map(); // entry id → its drawn height, gap included
    this.handle = cx.focus_handle(); // holds the keyboard while the composer is folded
    this.focusAt = shared(FOCUS) ?? 0;
    this.outAt = shared(OUTGOING)?.at ?? 0; // the last message another page asked us to send
    this.page = null;
    this.reading = false;
    this.questions = []; // open questions from agents, oldest first (bh ask): the composer asks them
    this.qfiles = {}; // file name → its question, read once
    this.unfolded = new Set(); // your long messages opened with Show more
    this.turn = null; // the agent on the working line when several work (its address)
    this.turnShown = true; // the line's first frame is drawn low and clear, then slides up
    this.drawnFx = null; // the motion the working line showed last, to redraw when it changes
    this.verbShown = true; // false for the one frame before a new verb fades in
    this.hovered = null; // entry id under the pointer: its actions show
    this.arrived = new Set(); // entry ids already drawn once: new ones arrive with MOTION.arrive
    this.primed = false; // the first draw is not an arrival
    this.arriving = new Set(); // ids drawn at rest for their one arrival frame
    this.commenting = null; // the reply with its comment box open: { entry, edit: cid | null }
    this.commentBoxes = new Map(); // agent name → its comment box (a placeholder is fixed when made)
    this.composer = new Composer({
      sent: (message, cx) => this.sent(message, cx),
      born: (address, name) => this.expect(address, name),
      answered: (q, answers, cx, opts) => this.submit(q, answers, cx, opts),
    });
    this.composer.init(props, cx);
    cx.spawn(async () => {
      try {
        await fs.mkdir(outboxDir(), { recursive: true });
      } catch {
        // the brief also tells agents to create it
      }
    });
    cx.timer.every(POLL_MS, (cx) => this.poll(cx));
    this.tasks = []; // the project's tasks under way, for the widget beside the chat
    this.taskOpen = undefined; // the task row open in it (undefined: the first; null: none)
    this.loadTasks(cx);
    cx.timer.every(TASKS_MS, (cx) => {
      if (activePage() === "chat") this.loadTasks(cx);
    });
    // The working line: one agent at a time, the next one's turn every few seconds; and a new
    // word when its 30 to 60 seconds are up.
    cx.timer.every(TURN_MS, (cx) => this.nextTurn(cx));
    cx.timer.after(300, () => this.composer.focus());
  }

  space() {
    const f = focused();
    return (spaces().find((s) => s.id === f?.space) ?? spaces().find((s) => s.active))?.id ?? null;
  }

  add(entry, cx) {
    this.entries = push(this.entries, { at: Date.now(), space: this.space(), ...entry });
    this.back = 0;
    this.px = 0;
    save("feed", this.entries);
    cx.notify();
  }

  /** The feed changed by a comment: kept the way add() keeps it. */
  setFeed(entries) {
    this.entries = entries;
    save("feed", entries);
  }

  // ── Comments on a reply ────────────────────────────────────────────────────────────────────

  /** The comment box for replies from one agent: its placeholder names who reads the comment. */
  commentBox(name) {
    let box = this.commentBoxes.get(name);
    if (!box) {
      box = InputState.new({ placeholder: `Your comment. Enter sends it to ${name}` });
      box.on("submit", (_e, cx) => this.sendComment(cx));
      this.commentBoxes.set(name, box);
    }
    return box;
  }

  /** Opens the box under a reply (a new comment, or `cid` to edit one); again closes it. */
  startComment(e, cid, cx) {
    const same = this.commenting?.entry === e.id && this.commenting.edit === cid;
    this.commenting = same ? null : { entry: e.id, edit: cid };
    const box = this.commentBox(e.from?.name ?? "Agent");
    box.set_value(cid ? (e.comments ?? []).find((x) => x.id === cid)?.text ?? "" : "");
    if (!same) box.focus();
    cx.notify();
  }

  sendComment(cx) {
    const where = this.commenting;
    const e = where && this.entries.find((x) => x.id === where.entry);
    if (!e) return;
    const box = this.commentBox(e.from?.name ?? "Agent");
    const text = box.value().trim();
    if (!text) return;
    box.set_value("");
    this.commenting = null;
    const at = Date.now();
    this.setFeed(where.edit ? editComment(this.entries, e.id, where.edit, text, at) : addComment(this.entries, e.id, text, at));
    const quote = String(e.text ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    this.tellAuthor(e, `${where.edit ? "Changed comment: " : ""}About your reply ("${quote}…"): ${text}`, cx);
    cx.notify();
  }

  /** A comment goes to the agent that wrote the reply; to the Orchestrator once that agent is gone. */
  tellAuthor(e, text, cx) {
    const address = e.from?.address;
    const name = e.from?.name ?? "Agent";
    if (!address || !liveAgents().some((a) => a.address === address)) return this.composer.sendText(`(${name} is no longer running) ${text}`, cx);
    this.expect(address, name);
    cx.spawn(async (cx) => {
      try {
        await this.composer.runStep({ do: "send", address, text, files: [] }, liveAgents());
      } catch (err) {
        this.composer.say(String(err?.message ?? err), cx, "error");
      }
      cx.notify();
    });
  }

  /** Resolve, reopen, edit and delete for one comment on a reply: they change the feed. */
  replyCommentActions(e, x) {
    const change = (entries, cx) => {
      this.setFeed(entries);
      cx.notify();
    };
    return {
      key: `bh-e-c-${e.id}-${x.id}`,
      resolve: (cx) => change(resolveComment(this.entries, e.id, x.id), cx),
      reopen: (cx) => change(editComment(this.entries, e.id, x.id, x.text, x.edited), cx),
      edit: (cx) => this.startComment(e, x.id, cx),
      delete: (cx) => {
        if (this.commenting?.entry === e.id && this.commenting.edit === x.id) this.commenting = null;
        change(deleteComment(this.entries, e.id, x.id), cx);
      },
    };
  }

  /** Under a reply: its comments (the box under the one being edited), the Comment link, the new box. */
  replyComments(c, e, show = true) {
    const w = this.commenting?.entry === e.id ? this.commenting : null;
    return v_flex()
      .flex_none()
      .gap(SPACE[2])
      .children((e.comments ?? []).map((x) => (w?.edit === x.id
        ? v_flex().flex_none().gap(SPACE[2]).child(commentRow(c, x, this.replyCommentActions(e, x))).child(this.commentInput(c, e))
        : commentRow(c, x, this.replyCommentActions(e, x)))))
      .child(
        clickable(
          h_flex()
            .flex_none()
            .self_start()
            .gap(SPACE[2])
            .items_center()
            .text_size(TYPE.xs)
            .text_color(c.faint)
            .opacity(show ? 1 : 0)
            .transition("opacity", MOTION.hover)
            .on_click((_ev, cx) => this.startComment(e, null, cx))
            .child(svg(ICON("comment")).size(GLYPH.sm))
            .child("Comment"),
          c,
          `bh-e-c-${e.id}`,
        ),
      )
      .when(Boolean(w && !w.edit), (el) => el.child(this.commentInput(c, e)));
  }

  commentInput(c, e) {
    return h_flex()
      .flex_none()
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
          .child(Input.new(this.commentBox(e.from?.name ?? "Agent")).w_full().h_full().text_size(TYPE.md).text_color(c.ink)),
      )
      .child(this.link(c, `bh-e-c-cancel-${e.id}`, "Cancel", (_ev, cx) => {
        this.commenting = null;
        cx.notify();
      }));
  }

  // ── Out ────────────────────────────────────────────────────────────────────────────────────

  sent({ text, files, paths, to }, cx) {
    for (const t of to) if (t.address) this.expect(t.address, t.name);
    this.add({ kind: "me", text, files, paths, to: to.map((t) => t.name) }, cx);
  }

  /** We wrote to this agent: watch for its reply, or for it stopping without one. */
  expect(address, name) {
    this.waits[address] = { name: name ?? this.composer.nameOf(address), worked: false, stopped: null, blocked: false, at: Date.now() };
  }

  // ── In ─────────────────────────────────────────────────────────────────────────────────────

  /**
   * Every live agent, with the space it is in and what to call it. One that never reports a
   * status (`quiet`, live.js) counts as working from our message until its reply.
   */
  live() {
    const now = Date.now();
    const listed = liveAgents();
    const byAddress = new Map(listed.map((a) => [a.address, a]));
    const statusOf = (a, quiet) => (quiet ? quietStatus(this.waits[a.address], now) : a.status ?? null);
    const out = listed.map((a) => ({ address: a.address, space: a.space, status: statusOf(a, a.quiet), tile: a.program?.tile ?? null, quiet: Boolean(a.quiet) }));
    for (const t of terminals()) {
      if (t.state !== "live" || byAddress.has(t.address) || !t.parent) continue;
      const quiet = !t.status && isQuiet(t);
      if (!(t.program?.agent || t.status || quiet)) continue;
      out.push({ address: t.address, space: byAddress.get(t.parent)?.space ?? this.space(), status: statusOf(t, quiet), tile: t.program?.tile ?? null, quiet });
    }
    return out;
  }

  poll(cx) {
    if (this.reading) return;
    this.reading = true;
    cx.spawn(async (cx) => {
      try {
        const now = Date.now();
        const live = this.live();
        for (const a of live) {
          if (a.address.includes("/")) continue; // another machine: its reply file is not here
          let text = null;
          try {
            text = await readTextFile(replyFile(outboxDir(), a.address));
          } catch {
            text = null;
          }
          if (!isNew(text, this.seen[a.address])) continue;
          this.seen[a.address] = text;
          save("seen", this.seen);
          delete this.waits[a.address];
          this.add({ kind: "agent", space: a.space, text: replyBody(text), from: { address: a.address, name: this.composer.nameOf(a.address), tile: a.tile } }, cx);
        }
        const doing = {};
        for (const a of live) {
          if (a.status !== "working" || a.address.includes("/")) continue;
          try {
            const got = JSON.parse((await readTextFile(replyFile(activityDir(), a.address).replace(/\.md$/, ".json"))) ?? "null");
            if (got?.line) doing[a.address] = String(got.line);
          } catch {
            // not run headless, or nothing yet
          }
        }
        if (JSON.stringify(doing) !== JSON.stringify(this.doing)) {
          this.doing = doing;
          cx.notify();
        }
        for (const [address, wait] of Object.entries(this.waits)) {
          const status = live.find((a) => a.address === address)?.status ?? null;
          if (status === "working") {
            wait.worked = true;
            wait.stopped = null;
          } else if (wait.worked && wait.stopped === null) wait.stopped = now;
          const what = outcome(wait, status, now);
          if (what === "gone") delete this.waits[address];
          if (what === "blocked") {
            wait.blocked = true;
            this.add({ kind: "note", text: `${wait.name} is waiting for you in its terminal.`, address }, cx);
          }
          if (what === "silent") {
            delete this.waits[address];
            // One that reports no status may still be at it: we only know no reply came.
            const quiet = live.find((a) => a.address === address)?.quiet;
            this.add({ kind: "note", text: quiet ? `No reply from ${wait.name} yet. Its terminal shows where it is.` : `${wait.name} finished without writing a reply.`, address }, cx);
          }
          if (status !== "blocked") wait.blocked = false;
        }
        await this.readQuestions(cx);
      } finally {
        this.reading = false;
      }
    });
  }

  /** Set a task's status from the chat widget. */
  actTask(id, status, cx) {
    cx.spawn(async (cx) => {
      try {
        await bhJson(["task", "status", id, status], { cwd: projectDir() });
      } catch {
        // ignore; the widget refreshes on the next poll
      }
      this.loadingTasks = false;
      this.loadTasks(cx);
    });
  }

  /** The tasks under way in this space's project, for the widget. */
  loadTasks(cx) {
    if (this.loadingTasks) return;
    this.loadingTasks = true;
    cx.spawn(async (cx) => {
      try {
        const got = await bhJson(["task", "list"], { cwd: projectDir() });
        const now = (Array.isArray(got) ? got : []).filter((t) => !t.archived && (t.status === "active" || t.status === "paused"));
        if (JSON.stringify(now) !== JSON.stringify(this.tasks)) {
          this.tasks = now;
          cx.notify();
        }
      } finally {
        this.loadingTasks = false;
      }
    });
  }

  /**
   * The tasks under way, beside the chat on a wide window: a row each with its steps done, one
   * open at a time into its steps as a checklist, the one being worked on marked live.
   */
  taskWidget(c) {
    const rows = this.tasks;
    const open = this.taskOpen === undefined ? rows[0]?.id : this.taskOpen;
    const box = (mark, { pulse = false } = {}) => {
      const el = div().flex_none().mt(SPACE[1]).size(MARK).rounded(PIP).flex().items_center().justify_center();
      if (mark === "done") return el.bg(c.accent).child(svg(ICON("check")).size(GLYPH.xs).text_color(c.accentInk));
      if (mark === "now") {
        const inner = div().size(DOT).rounded(PIP).bg(c.accent);
        return el.border_1().border_color(c.accent).child(pulse ? inner.opacity(0.45).loop("opacity", { from: 0.25, to: 0.9, period: 1600, easing: "ease-in-out" }) : inner.opacity(0.6));
      }
      if (mark === "blocked") return el.border_1().border_color(c.warning).child(div().text_size(TYPE.xs).font_bold().text_color(c.warning).child("!"));
      if (mark === "wait") return el.border_1().border_color(c.warning);
      if (mark === "skip") return el.border_1().border_color(c.edge).child(div().w(DOT).h(HAIR).bg(c.faint));
      return el.border_1().border_color(c.edge);
    };
    const markOf = (s) => (s.status === "done" ? "done" : s.status === "skipped" ? "skip" : s.status === "active" ? "now" : s.status === "blocked" ? "blocked" : "open");
    return v_flex()
      .id("bh-tasks-widget")
      .on_scroll_wheel((_e, cx) => cx.stop_propagation())
      .absolute()
      .top(SPACE[4])
      .left(SPACE[4])
      .w(WIDGET_W)
      .max_h(Math.max(160, this.size.height - 220))
      .overflow_hidden()
      .p(SPACE[3])
      .gap(SPACE[1])
      .rounded(SIZE.radius)
      .bg(c.fill)
      .border_1()
      .border_color(c.edge)
      .child(h_flex().px(SPACE[3]).pb(SPACE[2]).gap(SPACE[3]).items_center()
        .child(div().text_size(TYPE.sm).font_semibold().text_color(c.muted).child(rows.length === 1 ? "Task" : "Tasks"))
        .when(rows.length > 1, (el) => el.child(div().text_size(TYPE.xs).text_color(c.faint).child(String(rows.length)))))
      .child(v_flex()
        .id("bh-tasks-widget-list")
        .overflow_y_scroll()
        .gap(SPACE[1])
        .on_scroll_wheel((_e, cx) => {
          // Scroll the tasks list on its own; never let the wheel reach the chat feed.
          cx.stop_propagation();
        })
        .children(rows.map((t) => {
          const steps = t.steps ?? [];
          const done = steps.filter((s) => s.status === "done" || s.status === "skipped").length;
          const live = steps.some((s) => s.status === "active");
          const isOpen = open === t.id;
          return v_flex()
            .flex_none()
            .child(clickable(
              h_flex()
                .px(SPACE[3])
                .py(SPACE[2])
                .gap(SPACE[3])
                .items_start()
                .rounded(SIZE.nested)
                .on_click((_e, cx) => {
                  this.taskOpen = isOpen ? null : t.id;
                  cx.notify();
                })
                .child(box(live ? "now" : t.status === "paused" ? "wait" : "open", { pulse: false }))
                .child(div().flex_1().min_w(0).text_size(TYPE.md).font_medium().line_height(`${LINE.sm}px`).truncate().child(t.title ?? t.id))
                .when(steps.length > 0, (el) => el.child(div().flex_none().text_size(TYPE.xs).line_height(`${LINE.sm}px`).text_color(c.faint).child(`${done}/${steps.length}`)))
                .child(svg(ICON(isOpen ? "chevron-down" : "chevron-right")).flex_none().mt(SPACE[1]).size(GLYPH.sm).text_color(c.faint)),
              c,
              `bh-tw-${t.id}`,
            ))
            .when(isOpen, (el) => el.child(v_flex().pl(SPACE[3]).pr(SPACE[2]).pb(SPACE[3]).gap(SPACE[1])
              .when(!steps.length, (x) => x.child(div().pl(SPACE[4]).text_size(TYPE.sm).text_color(c.faint).child("No plan yet.")))
              .children(steps.map((s) => h_flex().relative().gap(SPACE[3]).items_start()
                .child(box(markOf(s), { pulse: s.status === "active" }))
                .child(v_flex().flex_1().min_w(0)
                  .child(div().text_size(TYPE.sm).line_height(`${LINE.sm}px`)
                    .text_color(s.status === "done" || s.status === "skipped" ? c.faint : s.status === "active" ? c.ink : c.muted)
                    .child(s.title ?? `Step ${s.n}`))
                  // The step under way: a short accent segment travelling along a faint track.
                  .when(s.status === "active", (el) => el.child(div().relative().h(SPACE[1]).mt(SPACE[1]).rounded(PIP).bg(alpha(c.accent, 0.15)).overflow_hidden()
                    .child(div().absolute().top(0).w(SPACE[4]).h(SPACE[1]).rounded(PIP).bg(c.accent).loop("left", { from: -SPACE[4], to: 200, period: 2400, easing: "linear" })))))))
              .child(h_flex().mt(SPACE[2]).gap(SPACE[3]).items_center()
                .child(clickable(
                  h_flex()
                    .gap(SPACE[2])
                    .items_center()
                    .text_size(TYPE.sm)
                    .text_color(c.accent)
                    .on_click(() => {
                      setShared(OPEN_TASK, { id: t.id, at: Date.now() });
                      showPage("tasks");
                    })
                    .child("Open in Tasks")
                    .child(svg(ICON("external-link")).size(GLYPH.xs)),
                  c,
                  `bh-tw-open-${t.id}`,
                ))
                .child(clickable(
                  div()
                    .text_size(TYPE.sm)
                    .font_medium()
                    .text_color(t.status === "paused" ? c.accent : c.warning)
                    .on_click((_e, cx) => {
                      if (t.status === "paused") sendFromChat(`Resume task ${t.id}`);
                      else this.actTask(t.id, "paused", cx);
                    })
                    .child(t.status === "paused" ? "Resume" : "Pause"),
                  c,
                  `bh-tw-toggle-${t.id}`,
                )))));
        })));
  }

  /** Reads new question files; a file that went (answered) drops its card. */
  async readQuestions(cx) {
    let names = [];
    try {
      names = (await fs.readdir(questionsDir())).map((d) => (typeof d === "string" ? d : d.name)).filter((n) => /^q-.*\.json$/.test(n));
    } catch {
      names = [];
    }
    let changed = false;
    for (const name of names) {
      if (name in this.qfiles) continue;
      let q = null;
      try {
        q = JSON.parse((await readTextFile(`${questionsDir()}/${name}`)) ?? "null");
      } catch {
        q = null;
      }
      this.qfiles[name] = q?.status === "open" && Array.isArray(q.questions) && q.questions.length ? q : null;
      changed = true;
    }
    for (const name of Object.keys(this.qfiles)) {
      if (names.includes(name)) continue;
      delete this.qfiles[name];
      changed = true;
    }
    if (!changed) return;
    this.questions = Object.values(this.qfiles).filter(Boolean).sort((a, b) => String(a.created).localeCompare(String(b.created)));
    cx.notify();
  }

  /** Your answers to an agent's questions (from the composer's drawer), sent back with bh answer. */
  submit(q, answers, cx, { dismissed = false } = {}) {
    const file = Object.keys(this.qfiles).find((name) => this.qfiles[name]?.id === q.id);
    if (file) this.qfiles[file] = null;
    this.questions = this.questions.filter((x) => x.id !== q.id);
    const who = q.fromName ?? this.composer.nameOf(q.from);
    this.add({ kind: "me", text: dismissed ? `Dismissed: ${who} makes the calls.` : summary(q, answers), files: [], to: [who] }, cx);
    cx.spawn(async (cx) => {
      const r = await bh(["answer", q.id, "--json", "--data", enc(answers)]);
      let sent = null;
      try {
        sent = JSON.parse(r.stdout);
      } catch {
        sent = null;
      }
      if (r.code !== 0 || !sent) {
        // Read the file again on the next poll, so the questions come back.
        if (file) delete this.qfiles[file];
        this.composer.say(`Couldn't send your answers: ${(r.stderr || r.stdout || "node didn't run").trim().split("\n")[0]}`, cx, "error");
        return;
      }
      if (!sent.ok) this.add({ kind: "note", text: `Saved, but ${who} didn't get them: ${sent.error}`, address: q.from }, cx);
      cx.notify();
    });
  }

  /** The working line moves to the next agent (with more than one at work), or shows a new word. */
  nextTurn(cx) {
    const list = this.workers();
    if (list.length > 1) {
      const next = onTurn(list, this.turn, 1);
      this.turn = next.agent.address;
      this.turnShown = false;
      cx.notify();
      cx.timer.after(16, (cx) => {
        this.turnShown = true;
        cx.notify();
      });
      return;
    }
    if (list.length === 1 && indicatorFor(roleOf(list[0].role)).fx !== this.drawnFx) cx.notify();
  }

  /** Who works in this space now, with what they are doing (an agent run headless says). */
  workers() {
    const space = this.space();
    const team = roster(shared(ROSTER_KEY), []);
    return this.live().filter((a) => a.space === space && a.status === "working").map((a) => {
      const name = this.composer.nameOf(a.address);
      const role = this.composer.entryAt(a.address)?.role ?? findAgent(team, name)?.role ?? (/(^|[-_ ])(dev|design|qa|scout|research|planner|panel)/i.exec(name)?.[2] ?? "agent");
      return { address: a.address, name, tile: a.tile, role, doing: this.doing[a.address] ?? (a.quiet ? "Its terminal shows its progress" : null) };
    });
  }

  // ── Drawing ────────────────────────────────────────────────────────────────────────────────

  render(cx) {
    this.cx = cx; // mockups in replies start drawing as they are drawn
    // Take the keyboard when asked (ctrl+shift+m, the Chat pill) or when this page comes up.
    const stamp = shared(FOCUS) ?? 0;
    const page = activePage();
    if (stamp !== this.focusAt || (page === "chat" && this.page !== "chat" && this.page !== null)) this.composer.focus();
    this.focusAt = stamp;
    this.page = page;
    const out = shared(OUTGOING);
    if (out?.at > this.outAt) {
      this.outAt = out.at;
      cx.timer.after(1, (cx) => this.composer.sendText(String(out.text ?? ""), cx));
    }

    const c = colors();
    const width = Math.max(320, Math.min(SIZE.maxWidth, this.size.width - SIZE.gutter * 2));
    const space = this.space();
    const foot = SIZE.foot + this.composer.height(width) + SPACE[4];
    // The feed's height. Heights measured since the last wheel, or the composer folding to its
    // slim bar, can change how far up the feed goes: never leave empty space above the oldest.
    this.room = Math.max(0, this.size.height - foot);
    if (this.back > 0 || this.px > 0) {
      const heights = this.feedHeights(space);
      const next = clampScroll({ back: this.back, px: this.px }, heights, heights.length, this.room);
      this.back = next.back;
      this.px = next.px;
    }
    const view = shown(this.entries, space, this.back);
    this.back = view.back;
    if (view.total === 0) this.px = 0;
    // A new message lands rather than appears: drawn at rest for one frame, then faded in.
    const fresh = view.list.filter((e) => !this.arrived.has(e.id));
    for (const e of fresh) this.arrived.add(e.id);
    if (!this.primed) this.primed = true;
    this.arriving = this.primed && fresh.length ? new Set(fresh.map((e) => e.id)) : new Set();
    if (this.arriving.size) cx.timer.after(16, (cx) => {
      this.arriving = new Set();
      cx.notify();
    });
    const up = this.back > 0 || this.px > 0;
    const working = this.workers();
    this.composer.questions = this.questions;
    // A pane with nothing to draw (a suggestion list that matches nothing) dims nothing either.
    const pane = this.composer.paneShown() ? this.composer.paneNow() : null;

    return div()
      .id("bh-chat")
      .relative()
      .size_full()
      .bg(c.ground)
      .text_color(c.ink)
      .on_size_change((size, cx) => {
        // on_size_change reports px with the app's zoom multiplied in; we draw without it.
        const zoom = Number(settings().zoom) || 1;
        this.size = { width: size.width / zoom, height: size.height / zoom };
        cx.notify();
      })
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        const chord = e.modifiers.control || e.modifiers.platform || e.modifiers.alt;
        if (this.commenting || !this.composer.isFolded() || !e.key_char || chord) return; // a comment box open takes the typing
        this.composer.typeFolded(e.key_char, cx);
        cx.stop_propagation();
      })
      .child(
        v_flex()
          .id("bh-feed")
          .absolute()
          .top(0)
          .left(0)
          .right(0)
          .bottom(foot)
          .overflow_hidden()
          .justify_end()
          .items_center()
          .on_mouse_down("left", () => {
            if (this.commenting) return; // a comment box open takes the click
            this.composer.expanded = false; // the slim bar; a click on it or typing grows it back
            this.handle.focus(); // the text box is not drawn while folded: typing comes here
          })
          .on_scroll_wheel((e, cx) => this.scroll(e, view.total, cx))
          .when(view.total === 0, (el) => el.child(this.empty(c, width)))
          .when(view.total > 0, (el) =>
            el.child(
              // Bottom-anchored and shifted down by the pixel offset, so its foot is clipped.
              v_flex()
                .absolute()
                .bottom(-this.px)
                .left(Math.round((this.size.width - width) / 2))
                .flex_none()
                .w(width)
                .gap(SPACE[4])
                .pt(SPACE[4])
                .children(view.list.map((e) => this.entry(c, e, width)))
                .when(!up && working.length > 0, (col) => col.child(this.working(c, working, width))),
            ))
          // Stays put over the feed while the column scrolls under it.
          .when(up, (el) => el.child(this.newer(c, view.back))),
      )
      // The tasks under way, top left, when the window has room for them beside the chat.
      .when(this.tasks.length > 0 && (this.size.width - width) / 2 >= WIDGET_W + 28, (el) => el.child(this.taskWidget(c)))
      // An open pane on the composer dims the feed and the tasks widget behind it, and takes
      // their clicks and wheel. gpui has no blur, so the scrim stands in for one. A press on it
      // puts the pane away; question cards stay until answered or dismissed. It is drawn whether
      // or not a pane is up, so it fades both ways; with none, it carries no handlers, and an
      // element with no handlers takes no pointer, so every press and wheel passes through it.
      .child(div()
        .id("bh-ask-dim")
        .absolute()
        .inset_0()
        .bg(SCRIM[isLight(c) ? "light" : "dark"])
        .opacity(pane && pane !== "bar" ? 1 : 0)
        .transition("opacity", MOTION.pane)
        .when(pane && pane !== "bar", (el) => el
          .on_mouse_down("left", (_e, cx) => {
            cx.stop_propagation();
            if (pane === "ask") return; // answered or dismissed, never put away by a stray press
            if (pane === "attach") this.composer.closeBrowse(cx);
            this.composer.close(cx);
          })
          .on_scroll_wheel((_e, cx) => cx.stop_propagation())))
      // The composer, bottom centre. Its suggestions grow upward over the feed.
      .child(
        v_flex()
          .absolute()
          .left(0)
          .right(0)
          .bottom(SIZE.foot)
          .items_center()
          .child(this.composer.render(cx, this.size.width, this.size.height)),
      );
  }

  /** The wheel moves the feed by pixels: positive towards older entries, as before. */
  scroll(e, total, cx) {
    const heights = this.feedHeights(this.space());
    const next = scrollBy({ back: this.back, px: this.px }, e.delta.y, heights, total, undefined, this.room ?? null);
    if (next.back === this.back && next.px === this.px) return;
    const was = this.back > 0 || this.px > 0;
    this.back = next.back;
    this.px = next.px;
    // Scrolling up from the newest message folds the composer to its slim bar; typing unfolds.
    if (!was && (this.back > 0 || this.px > 0)) {
      this.composer.expanded = false;
      this.handle.focus();
    }
    cx.notify();
  }

  /** This space's entries' drawn heights (gap included), newest first; undefined until measured. */
  feedHeights(space) {
    const mine = this.entries.filter((x) => (x.space ?? null) === (space ?? null));
    return mine.map((_, i) => this.heights.get(mine[mine.length - 1 - i].id));
  }

  empty(c, width) {
    const lead = this.composer.leadEntry().name;
    return v_flex()
      .w(width)
      .flex_1()
      .items_center()
      .justify_center()
      .child(stateView(c, {
        id: "bh-chat-empty",
        title: `Talk to ${lead}`,
        line: "Type @ for an agent, / for commands.",
      }));
  }

  entry(c, e, width) {
    const el = e.kind === "me" ? this.mine(c, e, width) : e.kind === "agent" ? this.reply(c, e, width) : this.note(c, e);
    const arriving = this.arriving.has(e.id);
    // Measured for the pixel scroll: its height plus the column's gap.
    return el
      .relative()
      .top(arriving ? SPACE[3] : 0)
      .opacity(arriving ? 0 : 1)
      .transition("top", MOTION.arrive)
      .transition("opacity", MOTION.arrive)
      .on_size_change((size, cx) => {
        const zoom = Number(settings().zoom) || 1;
        const h = size.height / zoom + SPACE[4];
        if (this.heights.get(e.id) === h) return;
        this.heights.set(e.id, h);
        // Scrolled up, a new height can move the top limit (render clamps to it).
        if (this.back > 0 || this.px > 0) cx?.notify();
      });
  }

  mine(c, e, width) {
    // A long message folds, with Show more; both text measures stay near 75 characters.
    const room = Math.min(600, Math.round(width * 0.82));
    const inner = room - SPACE[4] * 2;
    const folded = fold(e.text, inner, (line) => textWidth(line, TYPE.md));
    const open = this.unfolded.has(e.id);
    const text = folded.folded && !open ? folded.text : String(e.text ?? "");
    const chips = (e.files ?? []).map((name, i) => {
      const chip = h_flex().h(CHIP).px(SPACE[3]).gap(SPACE[2]).items_center().rounded(SIZE.nested).bg(c.hover).text_size(TYPE.xs).text_color(c.muted)
        .child(svg(ICON("file")).size(GLYPH.sm)).child(name);
      return e.paths?.[i]
        ? clickable(chip.on_click(() => openFile({ path: e.paths[i] })), c, `bh-mine-file-${e.id}-${i}`)
        : chip;
    });
    return v_flex()
      .id(`bh-e-${e.id}`)
      .flex_none()
      .items_end()
      .gap(SPACE[2])
      .child(
        v_flex()
          .max_w(room)
          .px(SPACE[4])
          .py(SPACE[3])
          .rounded(SIZE.radius)
          .bg(c.bubble)
          .border_1()
          .border_color(c.bubbleEdge)
          .text_size(TYPE.md)
          .line_height(`${LINE.md}px`)
          .child(keepPress(div().child(selectable(`bh-mine-md-${e.id}-${open ? "o" : "c"}`, text))))
          .when(folded.folded, (el) => el.child(
            clickable(
              div()
                .pt(SPACE[2])
                .text_size(TYPE.sm)
                .font_medium()
                .text_color(c.accent)
                .on_click((_ev, cx) => {
                  if (open) this.unfolded.delete(e.id);
                  else this.unfolded.add(e.id);
                  cx.notify();
                })
                .child(open ? "Show less" : `Show more · ${folded.rows - 12} more lines`),
              c,
              `bh-fold-${e.id}`,
            ),
          ))
          .when(chips.length > 0, (el) =>
            el.child(h_flex().pt(SPACE[2]).gap(SPACE[3]).flex_wrap().children(chips))),
      )
      .child(h_flex().gap(SPACE[1]).items_center().text_size(TYPE.xs)
        .children((e.to ?? []).map((n, i) => div().id(`bh-e-to-${e.id}-${i}`).font_medium().text_color(mentionTone(c, n, this.composer.roster())).child(String(n))))
        .child(div().text_color(c.faint).child(`· ${clock(e.at)}`)));
  }

  /** A link in a reply: a file it names opens over the chat; any other link opens in the browser. */
  openLink(url) {
    if (String(url).startsWith(FILE_LINK)) {
      const { path, line } = fileTarget(url);
      return openFile({ path, line, root: projectDir() });
    }
    if (/^https?:\/\//.test(String(url))) bh(["open", String(url)]);
  }

  reply(c, e, width) {
    // Markdown, with any ```mockup block drawn as a picture.
    const parts = segments(e.text);
    const pics = parts.filter((p) => p.kind === "mockup");
    const show = this.hovered === e.id;
    return v_flex()
      .id(`bh-e-${e.id}`)
      .flex_none()
      .gap(SPACE[2])
      .on_hover((hovered, cx) => {
        const next = hovered ? e.id : null;
        if (this.hovered !== next) {
          this.hovered = next;
          cx.notify();
        }
      })
      .child(
        h_flex()
          .gap(SPACE[3])
          .items_center()
          // Agents are named in their own colour, no icon and no dot.
          .child(div().text_size(TYPE.sm).font_semibold().text_color(mentionTone(c, e.from?.name ?? "Agent", this.composer.roster())).child(e.from?.name ?? "Agent"))
          .child(div().text_size(TYPE.xs).text_color(c.faint).child(clock(e.at)))
          .child(div().flex_1())
          .child(this.link(c, `bh-open-${e.id}`, "Open terminal", () => openTerminal(e.from.address), show)),
      )
      .child(
        keepPress(v_flex())
          .id(`bh-body-${e.id}`)
          .max_w(600)
          .gap(SPACE[3])
          .text_size(TYPE.md)
          .line_height(`${LINE.md}px`)
          .children(parts.map((p, i) => (p.kind === "md"
            ? TextView.markdown(`bh-md-${e.id}-${i}`, linkFiles(p.text)).selectable(true).on_link_click((url) => this.openLink(url))
            : this.picture(c, e, p, pics.indexOf(p), pics, width)))),
      )
      .child(this.replyComments(c, e, show));
  }

  /** A mockup in a reply: its picture (16:11), opened large on a click; drawing, or a way to the browser. */
  picture(c, e, p, index, all, width) {
    const d = mockup(p.html, this.cx);
    const w = Math.min(width, 520);
    const h = Math.round((w * 11) / 16);
    const open = () => {
      const drawn = all.map((x) => ({ x, d: mockup(x.html, this.cx) })).filter((y) => y.d.state === "ready");
      openLightbox({
        items: drawn.map((y) => ({ image: y.d.image, title: y.x.title, note: `${e.from?.name ?? "Agent"} · ${clock(e.at)}`, html: y.d.html })),
        at: Math.max(0, drawn.findIndex((y) => y.x === p)),
      });
    };
    return v_flex()
      .id(`bh-pic-${e.id}-${index}`)
      .flex_none()
      .w(w)
      .gap(SPACE[3])
      .child(
        (d.state === "ready"
          ? clickable(
            div()
              .relative()
              .flex_none()
              .w(w)
              .h(h)
              .rounded(SIZE.radius)
              .bg(c.well)
              .border_1()
              .border_color(c.edge)
              .overflow_hidden()
              .flex()
              .items_center()
              .justify_center()
              .on_click(() => open())
              .child(image(d.image).w(w - 2).h(h - 2))
              .child(
                div().absolute().top(SPACE[3]).right(SPACE[3]).size(TARGET).flex().items_center().justify_center().rounded(SIZE.nested)
                  .bg(c.fill).border_1().border_color(c.edge).text_color(c.muted).child(svg(ICON("expand")).size(GLYPH.sm)),
              ),
            c,
            `bh-pic-box-${e.id}-${index}`,
          )
          : div()
            .relative()
            .flex_none()
            .w(w)
            .h(h)
            .rounded(SIZE.radius)
            .bg(c.well)
            .border_1()
            .border_color(c.edge)
            .overflow_hidden()
            .flex()
            .items_center()
            .justify_center()
            .when(d.state === "drawing", (el) => el.child(div().text_size(TYPE.sm).text_color(c.faint).child("Drawing the mockup…")))
            .when(d.state === "failed", (el) => el.child(
              v_flex().items_center().gap(SPACE[3]).px(SPACE[4])
                .child(div().text_size(TYPE.md).text_color(c.muted).child("This mockup couldn't be drawn here."))
                .child(div().max_w(w - SPACE[4] * 4).text_size(TYPE.xs).text_color(c.faint).child(String(d.error ?? "").split("\n")[0]))
                .child(this.link(c, `bh-pic-open-${e.id}-${index}`, "Open in browser", (_ev, cx) => openInBrowser(d.html, cx))),
            ))),
      )
      .child(
        h_flex()
          .gap(SPACE[3])
          .items_center()
          .child(svg(ICON("image")).size(GLYPH.md).text_color(c.faint))
          .child(div().flex_1().min_w(0).truncate().text_size(TYPE.sm).text_color(c.muted).child(p.title))
          .child(this.link(c, `bh-pic-web-${e.id}-${index}`, "Open in browser", (_ev, cx) => openInBrowser(d.html, cx))),
      );
  }

  note(c, e) {
    return h_flex()
      .id(`bh-e-${e.id}`)
      .flex_none()
      .gap(SPACE[3])
      .items_center()
      .text_size(TYPE.sm)
      .text_color(c.muted)
      .child(keepPress(div().min_w(0)).child(selectable(`bh-note-md-${e.id}`, e.text)))
      .when(Boolean(e.address), (el) => el.child(this.link(c, `bh-open-${e.id}`, "Open terminal", () => openTerminal(e.address))));
  }

  link(c, id, label, onClick, show = true) {
    return clickable(
      div()
        .flex_none()
        .h(CHIP)
        .px(SPACE[3])
        .flex()
        .items_center()
        .rounded(SIZE.nested)
        .text_size(TYPE.xs)
        .text_color(c.muted)
        .opacity(show ? 1 : 0)
        .transition("opacity", MOTION.hover)
        .on_click(onClick)
        .child(label),
      c,
      id,
    );
  }

  /**
   * The working line: one agent at a time, only its role's word, shimmering in its colour beside
   * the motion that acts out its job (no name, nothing else). With several at work they take
   * turns, each sliding in over the last.
   */
  working(c, list, width) {
    const now = onTurn(list, this.turn, 0);
    this.turn = now.agent.address;
    const a = now.agent;
    // Coloured by the agent's type, so a glance says who is at work.
    const tone = roleTone(c, a.role);
    const fx = indicatorFor(roleOf(a.role)).fx;
    if (fx !== this.drawnFx) {
      // A new verb: drawn clear for one frame, then faded in.
      this.verbShown = false;
      this.cx.timer.after(16, (cx) => {
        this.verbShown = true;
        cx.notify();
      });
    }
    this.drawnFx = fx;
    const line = h_flex()
      .id(`bh-working-${a.address}`)
      .absolute()
      .left(0)
      .right(0)
      .top(this.turnShown ? SPACE[2] : SPACE[4])
      .transition("top", MOTION.turn)
      .opacity(this.turnShown ? 1 : 0)
      .transition("opacity", MOTION.turn)
      .gap(SPACE[3])
      .items_start()
      .text_size(TYPE.sm)
      .child(div()
        .id("bh-working-verb")
        // Shrinks before the line overflows a narrow window; the word clips rather than collides.
        .flex_shrink(1)
        .min_w(0)
        .overflow_hidden()
        .opacity(this.verbShown === false ? 0 : 1)
        .transition("opacity", MOTION.verb)
        .child(roleWord(c, { role: a.role, tone, id: `bh-rw-${a.address}` })))
      .child(div().flex_1())
      .when(now.count > 1, (el) => el.child(
        clickable(
          div()
            .flex_none()
            .h(CHIP)
            .px(SPACE[3])
            .flex()
            .items_center()
            .rounded(SIZE.nested)
            .text_size(TYPE.xs)
            .line_height(`${LINE.sm}px`)
            .text_color(c.faint)
            .on_click((_e, cx) => this.nextTurn(cx))
            .child(`${now.index + 1} of ${now.count}`),
          c,
          "bh-working-next",
        ),
      ));
    // Not clipped: some motions reach a little past the word.
    return div().id("bh-working").relative().flex_none().w(width).h(ROW).child(line);
  }

  newer(c, back) {
    return h_flex()
      .absolute()
      .left(0)
      .right(0)
      .bottom(SPACE[3])
      .justify_center()
      .child(
        clickable(
          div()
            .h(CHIP)
            .px(SPACE[3])
            .flex()
            .items_center()
            .rounded_full()
            .bg(c.well)
            .text_size(TYPE.xs)
            .text_color(c.muted)
            .on_click((_e, cx) => {
              this.back = 0;
              this.px = 0;
              cx.notify();
            })
            .child(back > 0 ? `${back} newer · jump to latest` : "Jump to latest"),
          c,
          "bh-newest",
        ),
      );
  }
}
