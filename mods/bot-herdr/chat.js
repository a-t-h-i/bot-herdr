// The chat page: one conversation with every agent in the space. Your messages and the agents'
// replies run up the page; the composer sits at the foot. It is a page of its own (the layout's
// "pages" stack), so the terminals stay untouched on theirs.
//
// An agent's reply is the file it writes at the end of each turn (brief.js tells it where). We
// read those files every few seconds. An agent that stops without writing one, or that needs an
// answer in its terminal, gets a line here with a way to its terminal.

import { div, svg, image } from "gpui-kit";
import { v_flex, h_flex, TextView } from "gpui-base";
import { terminals, spaces, focused, settings, shared, readTextFile } from "herdr";
import * as fs from "fs/promises";
import { LIGHT, DARK, SIZE, ICON, readable, textWidth } from "./look.js";
import { Composer, outboxDir, liveAgents } from "./composer.js";
import { isQuiet, quietStatus } from "./live.js";
import { FOCUS, OUTGOING, activePage, openTerminal } from "./pages.js";
import { replyFile, replyBody, push, shown, isNew, outcome, clock, segments, fold } from "./feed.js";
import { bh, enc } from "./bh.js";
import { roleWord } from "./indicators.js";
import { indicatorFor, roleOf, onTurn, TURN_MS } from "./working.js";
import { findAgent, roster, ROSTER_KEY } from "./roster.js";
import { summary } from "./drawer.js";
import { mockup, openInBrowser } from "./media.js";
import { openLightbox } from "./lightbox.js";

/** Where agents' questions for the person wait (bh ask writes them; answered ones move aside). */
const questionsDir = () => `${outboxDir().replace(/\/replies$/, "")}/questions`;
/** What an agent run headless is doing right now (agent.mjs writes it on each tool call). */
const activityDir = () => `${outboxDir().replace(/\/replies$/, "")}/activity`;

const POLL_MS = 2500;
const WHEEL_STEP = 70; // px of wheel per entry

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

export class Chat {
  init(props, cx) {
    this.size = { width: 960, height: 640 };
    this.entries = load("feed", []);
    this.seen = load("seen", {}); // address → the last reply text shown
    this.waits = {}; // address → { name, worked, stopped, blocked }: agents we wrote to
    this.doing = {}; // address → what a headless agent is doing ("Read src/app.tsx")
    this.back = 0; // entries scrolled up from the newest
    this.wheel = 0;
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
    save("feed", this.entries);
    cx.notify();
  }

  // ── Out ────────────────────────────────────────────────────────────────────────────────────

  sent({ text, files, to }, cx) {
    for (const t of to) if (t.address) this.expect(t.address, t.name);
    this.add({ kind: "me", text, files, to: to.map((t) => t.name) }, cx);
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

    const c = settings().dark ? DARK : LIGHT;
    const width = Math.max(320, Math.min(SIZE.maxWidth, this.size.width - SIZE.gutter * 2));
    const space = this.space();
    const view = shown(this.entries, space, this.back);
    this.back = view.back;
    const working = this.workers();
    const foot = SIZE.foot + this.composer.height(width) + 14;
    this.composer.questions = this.questions;

    return div()
      .id("bh-chat")
      .relative()
      .size_full()
      .bg(c.ground)
      .text_color(c.ink)
      .on_size_change((size, cx) => {
        this.size = size;
        cx.notify();
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
          .on_scroll_wheel((e, cx) => this.scroll(e, view.total, cx))
          .when(view.total === 0, (el) => el.child(this.empty(c, width)))
          .when(view.total > 0, (el) =>
            el.child(
              v_flex()
                .flex_none()
                .w(width)
                .gap(14)
                .pt(16)
                .children(view.list.map((e) => this.entry(c, e, width)))
                .when(view.back > 0, (col) => col.child(this.newer(c, view.back)))
                .when(view.back === 0 && working.length > 0, (col) => col.child(this.working(c, working, width))),
            )),
      )
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

  scroll(e, total, cx) {
    this.wheel += e.delta.y;
    const steps = Math.trunc(this.wheel / WHEEL_STEP);
    if (!steps) return;
    this.wheel -= steps * WHEEL_STEP;
    const back = Math.max(0, Math.min(Math.max(0, total - 1), this.back + steps));
    if (back === this.back) return;
    this.back = back;
    cx.notify();
  }

  empty(c, width) {
    const lead = this.composer.leadEntry().name;
    return v_flex()
      .w(width)
      .flex_1()
      .items_center()
      .justify_center()
      .gap(6)
      .child(div().text_size(17).font_semibold().child(`Talk to ${lead}`))
      .child(div().text_size(13).text_color(c.muted).child("It plans, hands work to other agents and reports back here."))
      .child(div().text_size(13).text_color(c.muted).child("Type @ to reach one agent, / for commands."));
  }

  entry(c, e, width) {
    if (e.kind === "me") return this.mine(c, e, width);
    if (e.kind === "agent") return this.reply(c, e, width);
    return this.note(c, e);
  }

  mine(c, e, width) {
    // A long message folds, with Show more.
    const inner = Math.round(width * 0.82) - 26;
    const folded = fold(e.text, inner, (line) => textWidth(line, 14));
    const open = this.unfolded.has(e.id);
    const text = folded.folded && !open ? folded.text : String(e.text ?? "");
    const lines = text.split("\n");
    return v_flex()
      .id(`bh-e-${e.id}`)
      .flex_none()
      .items_end()
      .gap(4)
      .child(
        v_flex()
          .max_w(Math.round(width * 0.82))
          .px(13)
          .py(9)
          .rounded(SIZE.radius)
          .bg(c.bubble)
          .border_1()
          .border_color(c.bubbleEdge)
          .text_size(14)
          .line_height(`${SIZE.line}px`)
          .children(lines.map((line) => div().min_h(SIZE.line).child(line)))
          .when(folded.folded, (el) => el.child(
            div()
              .id(`bh-fold-${e.id}`)
              .pt(4)
              .text_size(12.5)
              .font_medium()
              .text_color(c.accent)
              .cursor_pointer()
              .hover((s) => s.opacity(0.85))
              .on_click((_ev, cx) => {
                if (open) this.unfolded.delete(e.id);
                else this.unfolded.add(e.id);
                cx.notify();
              })
              .child(open ? "Show less" : `Show more · ${folded.rows - 12} more lines`),
          ))
          .when((e.files ?? []).length > 0, (el) =>
            el.child(h_flex().pt(4).gap(6).flex_wrap().children(e.files.map((name) =>
              h_flex().h(22).px(6).gap(4).items_center().rounded(6).bg(c.hover).text_size(11.5).text_color(c.muted)
                .child(svg(ICON("file")).size(12)).child(name))))),
      )
      .child(div().text_size(11).text_color(c.faint).child(`to ${(e.to ?? []).join(", ")} · ${clock(e.at)}`));
  }

  reply(c, e, width) {
    // Markdown, with any ```mockup block drawn as a picture.
    const parts = segments(e.text);
    const pics = parts.filter((p) => p.kind === "mockup");
    return v_flex()
      .id(`bh-e-${e.id}`)
      .flex_none()
      .gap(4)
      .child(
        h_flex()
          .gap(8)
          .items_center()
          // Agents are named in their own colour, no icon and no dot.
          .child(div().text_size(12.5).font_semibold().text_color(e.from?.tile ? readable(c, e.from.tile, c.ground) : c.accent).child(e.from?.name ?? "Agent"))
          .child(div().text_size(11).text_color(c.faint).child(clock(e.at)))
          .child(div().flex_1())
          .child(this.link(c, `bh-open-${e.id}`, "Open terminal", () => openTerminal(e.from.address))),
      )
      .child(
        v_flex()
          .id(`bh-body-${e.id}`)
          .max_h(pics.length ? 900 : 460)
          .overflow_y_scroll()
          .gap(10)
          .text_size(14)
          .line_height(`${SIZE.line}px`)
          .children(parts.map((p, i) => (p.kind === "md"
            ? TextView.markdown(`bh-md-${e.id}-${i}`, p.text).selectable(true)
            : this.picture(c, e, p, pics.indexOf(p), pics, width)))),
      );
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
      .gap(6)
      .child(
        div()
          .id(`bh-pic-box-${e.id}-${index}`)
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
          .when(d.state === "ready", (el) => el
            .cursor_pointer()
            .hover((s) => s.border_color(c.faint))
            .on_click(() => open())
            .child(image(d.image).w(w - 2).h(h - 2))
            .child(
              div().absolute().top(8).right(8).size(26).flex().items_center().justify_center().rounded(SIZE.nested)
                .bg(c.fill).border_1().border_color(c.edge).text_color(c.muted).child(svg(ICON("expand")).size(12)),
            ))
          .when(d.state === "drawing", (el) => el.child(div().text_size(12.5).text_color(c.faint).child("Drawing the mockup…")))
          .when(d.state === "failed", (el) => el.child(
            v_flex().items_center().gap(6).px(24)
              .child(div().text_size(13).text_color(c.muted).child("This mockup couldn't be drawn here."))
              .child(div().max_w(w - 48).text_size(11.5).text_color(c.faint).child(String(d.error ?? "").split("\n")[0]))
              .child(this.link(c, `bh-pic-open-${e.id}-${index}`, "Open in browser", (_ev, cx) => openInBrowser(d.html, cx))),
          )),
      )
      .child(
        h_flex()
          .gap(8)
          .items_center()
          .child(svg(ICON("image")).size(13).text_color(c.faint))
          .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(c.muted).child(p.title))
          .child(this.link(c, `bh-pic-web-${e.id}-${index}`, "Open in browser", (_ev, cx) => openInBrowser(d.html, cx))),
      );
  }

  note(c, e) {
    return h_flex()
      .id(`bh-e-${e.id}`)
      .flex_none()
      .gap(8)
      .items_center()
      .text_size(12.5)
      .text_color(c.muted)
      .child(div().child(e.text))
      .when(Boolean(e.address), (el) => el.child(this.link(c, `bh-open-${e.id}`, "Open terminal", () => openTerminal(e.address))));
  }

  link(c, id, label, onClick) {
    return div()
      .id(id)
      .flex_none()
      .h(22)
      .px(7)
      .flex()
      .items_center()
      .rounded(6)
      .text_size(11.5)
      .text_color(c.muted)
      .cursor_pointer()
      .hover((s) => s.bg(c.hover).text_color(c.ink))
      .on_click(onClick)
      .child(label);
  }

  /**
   * The working line: one agent at a time, its role's word shimmering in its colour beside the
   * motion that acts out its job, then its name and what it is doing. With several at work they
   * take turns, each sliding in over the last.
   */
  working(c, list, width) {
    const now = onTurn(list, this.turn, 0);
    this.turn = now.agent.address;
    const a = now.agent;
    const tone = a.tile ? readable(c, a.tile, c.ground) : c.accent;
    this.drawnFx = indicatorFor(roleOf(a.role)).fx;
    const line = h_flex()
      .id(`bh-working-${a.address}`)
      .absolute()
      .left(0)
      .right(0)
      .top(this.turnShown ? 4 : 14)
      .transition("top", { duration: 260, easing: "ease-out" })
      .opacity(this.turnShown ? 1 : 0)
      .transition("opacity", { duration: 220, easing: "ease-out" })
      .gap(8)
      .items_start()
      .text_size(12.5)
      .child(roleWord(c, { role: a.role, tone, id: `bh-rw-${a.address}` }))
      .child(div().flex_none().h(18).line_height("18px").whitespace_nowrap().font_semibold().text_color(tone).child(a.name))
      .when(Boolean(a.doing), (el) => el.child(div().flex_1().min_w(0).h(18).line_height("18px").truncate().text_color(c.faint).child(a.doing)))
      .when(!a.doing, (el) => el.child(div().flex_1()))
      .when(now.count > 1, (el) => el.child(
        div()
          .id("bh-working-next")
          .flex_none()
          .h(18)
          .px(6)
          .flex()
          .items_center()
          .rounded(6)
          .text_size(11.5)
          .line_height("18px")
          .text_color(c.faint)
          .cursor_pointer()
          .hover((s) => s.bg(c.hover).text_color(c.ink))
          .on_click((_e, cx) => this.nextTurn(cx))
          .child(`${now.index + 1} of ${now.count}`),
      ));
    // Not clipped: some motions reach a little past the word.
    return div().id("bh-working").relative().flex_none().w(width).h(28).child(line);
  }

  newer(c, back) {
    return h_flex()
      .flex_none()
      .justify_center()
      .child(
        div()
          .id("bh-newest")
          .h(24)
          .px(10)
          .flex()
          .items_center()
          .rounded_full()
          .bg(c.well)
          .text_size(11.5)
          .text_color(c.muted)
          .cursor_pointer()
          .hover((s) => s.text_color(c.ink))
          .on_click((_e, cx) => {
            this.back = 0;
            cx.notify();
          })
          .child(`${back} newer · jump to latest`),
      );
  }
}
