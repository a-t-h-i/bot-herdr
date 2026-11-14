// The chat page: one conversation with every agent in the space. Your messages and the agents'
// replies run up the page; the composer sits at the foot. It is a page of its own (the layout's
// "pages" stack), so the terminals stay untouched on theirs.
//
// An agent's reply is the file it writes at the end of each turn (brief.js tells it where). We
// read those files every few seconds. An agent that stops without writing one, or that needs an
// answer in its terminal, gets a line here with a way to its terminal.

import { div, svg, image } from "gpui-kit";
import { v_flex, h_flex, TextView, InputState, Input } from "gpui-base";
import { terminals, spaces, focused, settings, shared, setShared, readTextFile, appHome } from "herdr";
import * as fs from "fs/promises";
import { SIZE, ICON, TYPE, LINE, SPACE, CHIP, CONTROL, TARGET, GLYPH, MOTION, SCRIM, textWidth, agentInk, clickable, isLight } from "./look.js";
import { actionButton } from "./button.js";
import { stateView } from "./switch.js";
import { colors } from "./theme.js";
import { Composer, outboxDir, liveAgents } from "./composer.js";
import { isQuiet, quietStatus } from "./live.js";
import { FOCUS, OUTGOING, activePage, openTerminal } from "./pages.js";
import { replyFile, replyBody, push, shown, scrollBy, clampScroll, isNew, isHandled, outcome, clock, segments, fold, linkFiles, addComment, editComment, resolveComment, deleteComment, fileKey, logNew, groupChildren, entryName } from "./feed.js";
import { openFile, openLink } from "./viewer.js";
import { projectDir } from "./bh.js";
import { mentionTone, alpha } from "./indicators.js";
import { summary } from "./drawer.js";
import { mockup, openInBrowser, previews, isImage } from "./media.js";
import { commentRow } from "./plandoc.js";
import { openLightbox } from "./lightbox.js";
import { OpenQuestions, publishCounts } from "./questions.js";

/** An agent's round initial, in its hue: a folded child row's badge. `size` is the circle's. */
function agentBadge(c, name, size = CONTROL) {
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
    .text_size(size < CONTROL ? TYPE.xs : TYPE.sm)
    .font_semibold()
    .text_color(tone)
    .child(String(name ?? "?").charAt(0).toUpperCase());
}

const POLL_MS = 2500;
const KID_LINES = 3; // a child report's first lines, folded
const KID_BADGES = 4; // child badges on a folded row before "+n"

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

/** The id of the newest entry, or null: the feed's cache changes with it. */
const lastId = (entries) => (entries?.length ? entries[entries.length - 1].id : null);

/** Whether two address→entry maps hold the same addresses, with the same lead. */
function sameAddresses(before, after) {
  if (before === after) return true;
  if (!before || !after || before.size !== after.size) return false;
  for (const [address, entry] of before) {
    const now = after.get(address);
    if (!now || Boolean(now.lead) !== Boolean(entry.lead)) return false;
  }
  return true;
}

/** A path under the app home, from there as image() shows it (bh clip and bh preview name them so); else null. */
function underHome(path) {
  const home = `${appHome().replace(/\\/g, "/")}/`;
  const p = String(path ?? "").replace(/\\/g, "/");
  return p.toLowerCase().startsWith(home.toLowerCase()) ? p.slice(home.length) : null;
}

/**
 * Each picture that still exists, as image() shows it: one under the app home from there, any
 * other from herdr's preview (its own path when that fails). A picture that is gone is left out.
 */
async function shownImages(paths) {
  const here = [];
  for (const path of paths) {
    if (await fs.exists(path)) here.push(path);
  }
  const got = await previews(here.filter((path) => !underHome(path)));
  return new Map(here.map((path) => [path, underHome(path) ?? got.find((g) => g.file === path)?.image ?? path]));
}

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
    this.entries = load("feed", []).filter((e) => !(e.kind === "agent" && isHandled(e.text)));
    this.seen = load("seen", {}); // address → the last reply text shown
    this.logSeen = load("logSeen", {}); // a reply log's key → the last turn time shown from it
    this.kidsOpen = new Set(); // child groups opened in place (item ids)
    this.kidsHeights = new Map(); // child group item id → its drawn height, so opening animates to it
    this.waits = {}; // address → { name, worked, stopped, blocked }: agents we wrote to
    this.back = 0; // whole entries scrolled up from the newest
    this.px = 0; // pixels scrolled into the entry `back` up from the newest
    this.heights = new Map(); // entry id → its drawn height, gap included
    this.feedCache = null; // the last items(space) built: reused while the feed and who runs where hold
    this.handle = cx.focus_handle(); // holds the keyboard while the composer is folded
    this.focusAt = shared(FOCUS) ?? 0;
    this.outAt = shared(OUTGOING)?.at ?? 0; // the last message another page asked us to send
    this.page = null;
    this.reading = false;
    this.open = new OpenQuestions();
    this.unfolded = new Set(); // your long messages opened with Show more
    this.hovered = null; // entry id under the pointer: its actions show
    this.arrived = new Set(); // entry ids already drawn once: new ones arrive with MOTION.arrive
    this.primed = false; // the first draw is not an arrival
    this.arriving = new Set(); // ids drawn at rest for their one arrival frame
    this.commenting = null; // the reply with its comment box open: { entry, edit: cid | null }
    this.commentBoxes = new Map(); // agent name → its comment box (a placeholder is fixed when made)
    this.composer = new Composer({
      sent: (message, cx) => this.sent(message, cx),
      relabel: (id, from, name, cx) => this.relabel(id, from, name, cx),
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
        actionButton(c, `bh-e-c-${e.id}`, "Comment", (_ev, cx) => this.startComment(e, null, cx), { icon: "comment", tone: "quiet" })
          .self_start()
          // Readable enough to Tab to; it lights fully under the pointer or the keyboard.
          .opacity(show ? 1 : 0.5)
          .transition("opacity", MOTION.hover),
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

  /** Adds a message we sent; returns its feed id, so a recipient can be named later (`relabel`). */
  sent({ text, files, paths, to }, cx) {
    for (const t of to) if (t.address) this.expect(t.address, t.name);
    this.add({ kind: "me", text, files, paths, to: to.map((t) => t.name) }, cx);
    return this.entries[this.entries.length - 1].id;
  }

  /** A message's recipient, once its real name is known: `from` in its `to` becomes `name`. */
  relabel(id, from, name, cx) {
    this.setFeed(this.entries.map((e) => (e.id === id ? { ...e, to: (e.to ?? []).map((n) => (n === from ? name : n)) } : e)));
    cx.notify();
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
        // Every turn in every agent's reply log first, live or not: an agent killed right after
        // its turn still said what it said.
        const logged = await this.readLogs(live, cx);
        for (const a of live) {
          if (a.address.includes("/")) continue; // another machine: its reply file is not here
          if (logged.has(fileKey(a.address))) continue; // its log holds every turn it took
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
          if (isHandled(text)) continue;
          this.add({ kind: "agent", space: a.space, text: replyBody(text), from: { address: a.address, name: this.composer.nameOf(a.address), tile: a.tile } }, cx);
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

  /**
   * Every turn in every reply log (`replies/<key>.jsonl`), whether or not its agent is still
   * live: a reply reaches the feed even when the agent was killed before the next poll. A log
   * seen for the first time is history — its newest line is recorded and nothing is added.
   * Returns the keys that have a log, so their `.md` is left alone.
   */
  async readLogs(live, cx) {
    let names = [];
    try {
      names = (await fs.readdir(outboxDir())).map(entryName).filter((n) => n.endsWith(".jsonl"));
    } catch {
      names = []; // no folder yet: nothing has replied
    }
    for (const name of names) {
      const key = name.slice(0, -".jsonl".length);
      const { entries, at } = logNew(await this.logText(key), this.logSeen[key]);
      if (at !== this.logSeen[key]) {
        this.logSeen[key] = at;
        save("logSeen", this.logSeen);
      }
      for (const line of entries) this.addLogged(key, line, live, cx);
    }
    return new Set(names.map((n) => n.slice(0, -".jsonl".length)));
  }

  /** One reply log's text, or "" when it cannot be read. */
  async logText(key) {
    try {
      return (await readTextFile(replyFile(outboxDir(), key).replace(/\.md$/, ".jsonl"))) ?? "";
    } catch {
      return "";
    }
  }

  /** One turn of a reply log, added as a reply is: in the agent's space while it is still live. */
  addLogged(key, line, live, cx) {
    const agent = live.find((a) => fileKey(a.address) === key);
    const address = agent?.address ?? key;
    delete this.waits[address];
    const text = replyBody(String(line.text ?? ""));
    if (!text || isHandled(text)) return;
    const name = line.name ?? this.composer.nameOf(address);
    this.add({ kind: "agent", space: agent?.space ?? this.space(), text, from: { address, name, tile: agent?.tile ?? null } }, cx);
  }

  /** Reads new question files; a file that went (answered) drops its card; the tabs keep the count. */
  async readQuestions(cx) {
    if (await this.open.poll()) cx.notify();
    publishCounts(this.open.list);
  }

  /** Your answers to an agent's questions (from the composer's drawer), sent back with bh answer. */
  submit(q, answers, cx, { dismissed = false } = {}) {
    const file = this.open.drop(q);
    const who = q.fromName ?? this.composer.nameOf(q.from);
    this.add({ kind: "me", text: dismissed ? `Dismissed: ${who} makes the calls.` : summary(q, answers), files: [], to: [who] }, cx);
    cx.spawn(async (cx) => {
      const r = await this.open.send(q, answers, file);
      if (!r.sent) return this.composer.say(`Couldn't send your answers: ${r.why}`, cx, "error");
      if (!r.ok) this.add({ kind: "note", text: `Saved, but ${who} didn't get them: ${r.why}`, address: q.from }, cx);
      cx.notify();
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
    const columnLeft = Math.round((this.size.width - width) / 2);
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
    const view = shown(this.items(space), space, this.back);
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
    this.composer.questions = this.open.list;
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
                .left(columnLeft)
                .flex_none()
                .w(width)
                .gap(SPACE[4])
                .pt(SPACE[4])
                .children(view.list.map((e) => this.entry(c, e, width))),
            ))
          // Stays put over the feed while the column scrolls under it.
          .when(up, (el) => el.child(this.newer(c, view.back))),
      )
      // An open pane on the composer dims the feed behind it, and takes
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
      // The composer, bottom centre of the chat column. Its suggestions grow upward over the feed.
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

  /**
   * The feed of this space as it is drawn: a run of child replies folded into one row of reports.
   * Built once a frame, and built again only when the space, the entries or who runs where change.
   */
  items(space) {
    const byAddress = this.composer.entriesByAddress();
    const at = this.feedCache;
    if (at && at.space === space && at.entries === this.entries && at.last === lastId(this.entries) && sameAddresses(at.byAddress, byAddress)) return at.items;
    const mine = this.entries.filter((x) => (x.space ?? null) === (space ?? null));
    const items = groupChildren(mine, (e) => this.childEntry(e, byAddress));
    this.feedCache = { space, entries: this.entries, last: lastId(this.entries), byAddress, items };
    return items;
  }

  /** Whether an entry is a child's reply: an agent's that is not the Orchestrator's, gone or not. */
  childEntry(e, byAddress) {
    if (e.kind !== "agent" || !e.from?.address) return false;
    const entry = byAddress.get(e.from.address) ?? null;
    return !(entry ? entry.lead : e.from.name === "Orchestrator");
  }

  /** This space's entries' drawn heights (gap included), newest first; undefined until measured. */
  feedHeights(space) {
    const mine = this.items(space);
    return mine.map((_, i) => this.heights.get(mine[mine.length - 1 - i].id));
  }

  empty(c, width) {
    const lead = this.composer.leadEntry().name;
    return v_flex()
      .relative()
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
    const el = e.kind === "me" ? this.mine(c, e, width) : e.kind === "kids" ? this.kids(c, e) : e.kind === "agent" ? this.reply(c, e, width) : this.note(c, e);
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
    const chips = (e.files ?? []).map((name, i) => this.sentChip(c, e, name, i));
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

  /** A file on a sent message: a picture opens large, any other file in the viewer. */
  sentChip(c, e, name, i) {
    const path = e.paths?.[i];
    const picture = isImage(path);
    const chip = h_flex().h(path ? CONTROL : CHIP).px(SPACE[3]).gap(SPACE[2]).items_center().rounded(SIZE.nested).bg(c.hover).text_size(TYPE.xs).text_color(c.muted)
      .child(svg(ICON(picture ? "image" : "file")).size(GLYPH.sm)).child(name);
    if (!path) return chip;
    return clickable(chip.on_click((_ev, cx) => (picture ? this.openSent(e, i, cx) : openFile({ path }))), c, `bh-mine-file-${e.id}-${i}`);
  }

  /** A picture sent with a message, opened large from the one clicked; the message's others step beside it. */
  openSent(e, i, cx) {
    const sent = (e.paths ?? []).map((path, j) => ({ path, j, title: e.files?.[j] ?? path })).filter((x) => isImage(x.path));
    cx.spawn(async (cx) => {
      const images = await shownImages(sent.map((x) => x.path));
      const items = sent.filter((x) => images.has(x.path));
      const at = items.findIndex((x) => x.j === i);
      if (at < 0) return this.composer.say(`Couldn't open ${e.files?.[i] ?? "the picture"}: it is no longer there.`, cx, "error");
      openLightbox({ items: items.map((x) => ({ image: images.get(x.path), title: x.title, note: `Sent ${clock(e.at)}` })), at });
    });
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
            ? TextView.markdown(`bh-md-${e.id}-${i}`, linkFiles(p.text)).selectable(true).on_link_click((url) => openLink(url, projectDir()))
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

  /** A run of child replies folded into one row: whose they were, how many, and a click that opens them. */
  kids(c, e) {
    const open = this.kidsOpen.has(e.id);
    return v_flex()
      .id(`bh-e-${e.id}`)
      .flex_none()
      .gap(SPACE[3])
      .child(this.kidsHead(c, e, open))
      .child(this.kidsBody(c, e, open));
  }

  /** The folded row: the children's badges and names, how many reports, and the chevron. */
  kidsHead(c, e, open) {
    const n = e.children.length;
    const names = [...new Set(e.children.map((k) => k.from?.name ?? "Agent"))].join(", ");
    return clickable(
      h_flex()
        .gap(SPACE[2])
        .items_center()
        .px(SPACE[3])
        .py(SPACE[2])
        .rounded(SIZE.radius)
        .bg(c.fill)
        .border_1()
        .border_color(c.edge)
        .on_click((_ev, cx) => this.openKids(e.id, cx))
        .children(e.children.slice(0, KID_BADGES).map((k) => agentBadge(c, k.from?.name ?? "Agent", CHIP)))
        .when(n > KID_BADGES, (el) => el.child(div().text_size(TYPE.xs).text_color(c.faint).child(`+${n - KID_BADGES}`)))
        .child(div().flex_none().text_size(TYPE.sm).font_medium().text_color(c.ink).child(`${n} child report${n === 1 ? "" : "s"}`))
        .child(div().flex_1().min_w(0).truncate().text_size(TYPE.sm).text_color(c.muted).child(`· ${names}`))
        .child(svg(ICON(open ? "chevron-down" : "chevron-right")).flex_none().size(GLYPH.sm).text_color(c.faint)),
      c,
      `bh-kids-${e.id}`,
    );
  }

  /** The group's reports, in a box whose height grows to what they measured and folds to nothing. */
  kidsBody(c, e, open) {
    return div()
      .overflow_hidden()
      .opacity(open ? 1 : 0)
      .h(open ? this.kidsHeights.get(e.id) || e.children.length * 120 : 0)
      .transition("height", MOTION.row)
      .transition("opacity", MOTION.row)
      .child(v_flex()
        .id(`bh-kids-body-${e.id}`)
        .gap(SPACE[3])
        .pl(SPACE[4])
        .on_size_change((size, cx) => this.measureKids(e.id, size, cx))
        .children(e.children.map((k) => this.kidReport(c, k))));
  }

  /** Records a group's drawn height, so opening it starts from the size it ends at. */
  measureKids(id, size, cx) {
    const h = size.height / (Number(settings().zoom) || 1);
    if (Math.abs((this.kidsHeights.get(id) ?? -1) - h) < 1) return;
    this.kidsHeights.set(id, h);
    cx.notify();
  }

  openKids(id, cx) {
    if (this.kidsOpen.has(id)) this.kidsOpen.delete(id);
    else this.kidsOpen.add(id);
    cx.notify();
  }

  /** One child's report in an opened group: who, when, its first lines and Show all. */
  kidReport(c, k) {
    const lines = String(k.text ?? "").split("\n");
    const open = this.unfolded.has(k.id);
    const text = open || lines.length <= KID_LINES ? String(k.text ?? "") : `${lines.slice(0, KID_LINES).join("\n")}…`;
    return v_flex()
      .id(`bh-kid-${k.id}`)
      .flex_none()
      .gap(SPACE[1])
      .child(h_flex().gap(SPACE[3]).items_center()
        .child(div().text_size(TYPE.sm).font_semibold().text_color(agentInk(c, k.from?.name ?? "Agent")).child(k.from?.name ?? "Agent"))
        .child(div().text_size(TYPE.xs).text_color(c.faint).child(clock(k.at))))
      .child(div().text_size(TYPE.sm).line_height(`${LINE.sm}px`)
        .child(TextView.markdown(`bh-kid-md-${k.id}-${open ? "o" : "c"}`, linkFiles(text)).selectable(true).on_link_click((url) => openLink(url, projectDir()))))
      .when(lines.length > KID_LINES, (el) => el.child(
        actionButton(c, `bh-kid-more-${k.id}`, open ? "Show less" : "Show all", (_ev, cx) => this.showKidFull(k.id, cx), { tone: "quiet" }).self_start(),
      ));
  }

  /** A child report whole, or folded back to its first lines. */
  showKidFull(id, cx) {
    if (this.unfolded.has(id)) this.unfolded.delete(id);
    else this.unfolded.add(id);
    cx.notify();
  }

  /** A reply's quiet action: always readable, and fully lit while its reply is under the pointer or the keyboard. */
  link(c, id, label, onClick, show = true) {
    return actionButton(c, id, label, onClick, { tone: "quiet" })
      .opacity(show ? 1 : 0.5)
      .transition("opacity", MOTION.hover);
  }

  newer(c, back) {
    return h_flex()
      .absolute()
      .left(0)
      .right(0)
      .bottom(SPACE[3])
      .justify_center()
      .child(
        actionButton(c, "bh-newest", back > 0 ? `${back} newer · jump to latest` : "Jump to latest", (_e, cx) => {
          this.back = 0;
          this.px = 0;
          cx.notify();
        }, { tone: "secondary" }),
      );
  }
}
