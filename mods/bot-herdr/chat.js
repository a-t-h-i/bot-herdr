// The chat page: one conversation with every agent in the space. Your messages and the agents'
// replies run up the page; the composer sits at the foot. It is a page of its own (the layout's
// "pages" stack), so the terminals stay untouched on theirs.
//
// An agent's reply is the file it writes at the end of each turn (brief.js tells it where). We
// read those files every few seconds. An agent that stops without writing one, or that needs an
// answer in its terminal, gets a line here with a way to its terminal.

import { div, svg } from "gpui-kit";
import { v_flex, h_flex, TextView, InputState, Input } from "gpui-base";
import { agents, terminals, spaces, focused, settings, shared, readTextFile } from "herdr";
import * as fs from "fs/promises";
import { LIGHT, DARK, SIZE, ICON, readable } from "./look.js";
import { Composer, outboxDir } from "./composer.js";
import { FOCUS, OUTGOING, activePage, openTerminal } from "./pages.js";
import { replyFile, push, shown, isNew, outcome, clock } from "./feed.js";
import { bh, enc } from "./bh.js";

/** Where agents' questions for the person wait (bh ask writes them; answered ones move aside). */
const questionsDir = () => `${outboxDir().replace(/\/replies$/, "")}/questions`;

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
    this.back = 0; // entries scrolled up from the newest
    this.wheel = 0;
    this.focusAt = shared(FOCUS) ?? 0;
    this.outAt = shared(OUTGOING)?.at ?? 0; // the last message another page asked us to send
    this.page = null;
    this.reading = false;
    this.questions = []; // open questions from agents, oldest first (bh ask)
    this.qfiles = {}; // file name → its question, read once
    this.answers = {}; // question id → [{ picks: [labels], text: InputState }] per question
    this.answering = null; // the question id being sent
    this.composer = new Composer({
      sent: (message, cx) => this.sent(message, cx),
      born: (address, name) => this.expect(address, name),
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
    this.waits[address] = { name: name ?? this.composer.nameOf(address), worked: false, stopped: null, blocked: false };
  }

  // ── In ─────────────────────────────────────────────────────────────────────────────────────

  /** Every live agent, with the space it is in and what to call it. */
  live() {
    const listed = agents();
    const byAddress = new Map(listed.map((a) => [a.address, a]));
    const out = listed.map((a) => ({ address: a.address, space: a.space, status: a.status, tile: a.program?.tile ?? null }));
    for (const t of terminals()) {
      if (t.state !== "live" || byAddress.has(t.address) || !t.parent) continue;
      if (!(t.program?.agent || t.status)) continue;
      out.push({ address: t.address, space: byAddress.get(t.parent)?.space ?? this.space(), status: t.status ?? null, tile: t.program?.tile ?? null });
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
          this.add({ kind: "agent", space: a.space, text: text.trim(), from: { address: a.address, name: this.composer.nameOf(a.address), tile: a.tile } }, cx);
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
            this.add({ kind: "note", text: `${wait.name} finished without writing a reply.`, address }, cx);
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
      this.qfiles[name] = q?.status === "open" ? q : null;
      if (q?.status === "open") {
        this.answers[q.id] = q.questions.map(() => ({ picks: [], text: InputState.new({ placeholder: "Or answer in your own words" }) }));
      }
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

  pick(q, i, label, cx) {
    const a = this.answers[q.id]?.[i];
    if (!a) return;
    if (q.questions[i].multi) a.picks = a.picks.includes(label) ? a.picks.filter((x) => x !== label) : [...a.picks, label];
    else a.picks = a.picks[0] === label ? [] : [label];
    cx.notify();
  }

  submit(q, cx) {
    if (this.answering) return;
    const answers = (this.answers[q.id] ?? []).map((a) => ({ picks: a.picks, text: a.text.value().trim() }));
    this.answering = q.id;
    cx.notify();
    cx.spawn(async (cx) => {
      const r = await bh(["answer", q.id, "--json", "--data", enc(answers)]);
      this.answering = null;
      let sent = null;
      try {
        sent = JSON.parse(r.stdout);
      } catch {
        sent = null;
      }
      if (r.code !== 0 || !sent) {
        this.add({ kind: "note", text: `Couldn't send your answers: ${(r.stderr || r.stdout || "node didn't run").trim().split("\n")[0]}` }, cx);
        return;
      }
      const who = q.fromName ?? this.composer.nameOf(q.from);
      const summary = q.questions.map((x, i) => `${i + 1}. ${[answers[i].picks.join(", "), answers[i].text].filter(Boolean).join(" — ") || "your call"}`).join("\n");
      this.add({ kind: "me", text: summary, files: [], to: [who] }, cx);
      if (!sent.ok) this.add({ kind: "note", text: `Saved, but ${who} didn't get them: ${sent.error}`, address: q.from }, cx);
      this.questions = this.questions.filter((x) => x.id !== q.id);
      for (const [name, x] of Object.entries(this.qfiles)) if (x?.id === q.id) this.qfiles[name] = null;
      cx.notify();
    });
  }

  // ── Drawing ────────────────────────────────────────────────────────────────────────────────

  render(cx) {
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
    const working = this.live().filter((a) => a.space === space && a.status === "working").map((a) => this.composer.nameOf(a.address));
    const foot = SIZE.foot + this.composer.height(width) + 14;

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
          .when(view.total === 0 && !this.questions.length, (el) => el.child(this.empty(c, width)))
          .when(view.total > 0 || this.questions.length > 0, (el) =>
            el.child(
              v_flex()
                .flex_none()
                .w(width)
                .gap(14)
                .pt(16)
                .children(view.list.map((e) => this.entry(c, e, width)))
                .when(view.back > 0, (col) => col.child(this.newer(c, view.back)))
                .children(this.questions.map((q) => this.question(c, q, width, this.size.height - foot - 32)))
                .when(view.back === 0 && working.length > 0, (col) => col.child(this.working(c, working))),
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
          .child(this.composer.render(cx, this.size.width)),
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
    if (e.kind === "agent") return this.reply(c, e);
    return this.note(c, e);
  }

  mine(c, e, width) {
    const lines = String(e.text ?? "").split("\n");
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
          .bg(c.well)
          .text_size(14)
          .line_height(SIZE.line)
          .children(lines.map((line) => div().min_h(SIZE.line).child(line)))
          .when((e.files ?? []).length > 0, (el) =>
            el.child(h_flex().pt(4).gap(6).flex_wrap().children(e.files.map((name) =>
              h_flex().h(22).px(6).gap(4).items_center().rounded(6).bg(c.hover).text_size(11.5).text_color(c.muted)
                .child(svg(ICON("file")).size(12)).child(name))))),
      )
      .child(div().text_size(11).text_color(c.faint).child(`to ${(e.to ?? []).join(", ")} · ${clock(e.at)}`));
  }

  reply(c, e) {
    return v_flex()
      .id(`bh-e-${e.id}`)
      .flex_none()
      .gap(4)
      .child(
        h_flex()
          .gap(8)
          .items_center()
          // Agents are named in their own colour, no icon and no dot.
          .child(div().text_size(12.5).font_semibold().text_color(e.from?.tile ? readable(c, e.from.tile) : c.accent).child(e.from?.name ?? "Agent"))
          .child(div().text_size(11).text_color(c.faint).child(clock(e.at)))
          .child(div().flex_1())
          .child(this.link(c, `bh-open-${e.id}`, "Open terminal", () => openTerminal(e.from.address))),
      )
      .child(
        div()
          .id(`bh-body-${e.id}`)
          .max_h(460)
          .overflow_y_scroll()
          .text_size(14)
          .line_height(SIZE.line)
          .child(TextView.markdown(`bh-md-${e.id}`, e.text).selectable(true)),
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

  /** An agent's questions: options to pick (with mockups to open), your own words, one Send. */
  question(c, q, width, most) {
    const who = q.fromName ?? this.composer.nameOf(q.from);
    const tile = this.live().find((a) => a.address === q.from)?.tile ?? null;
    const sending = this.answering === q.id;
    return v_flex()
      .id(`bh-q-${q.id}`)
      .flex_none()
      .w(width)
      .max_h(Math.max(240, most))
      .overflow_y_scroll()
      .p(14)
      .gap(14)
      .rounded(SIZE.radius)
      .bg(c.fill)
      .border_1()
      .border_color(c.edge)
      .child(
        h_flex()
          .gap(8)
          .items_center()
          .child(div().text_size(12.5).font_semibold().text_color(tile ? readable(c, tile) : c.accent).child(who))
          .child(div().flex_1().min_w(0).truncate().text_size(12.5).text_color(c.muted).child(q.title && q.title !== "Questions" ? `asks about ${q.title}` : "has questions"))
          .child(this.link(c, `bh-q-open-${q.id}`, "Open terminal", () => openTerminal(q.from))),
      )
      .when(Boolean(q.intro), (el) => el.child(div().text_size(13.5).line_height(SIZE.line).child(TextView.markdown(`bh-q-intro-${q.id}`, q.intro))))
      .children(q.questions.map((x, i) => this.ask(c, q, x, i)))
      .child(
        h_flex()
          .gap(10)
          .items_center()
          .child(
            div()
              .id(`bh-q-send-${q.id}`)
              .flex_none()
              .h(32)
              .px(14)
              .flex()
              .items_center()
              .rounded(SIZE.control)
              .bg(c.accent)
              .border_b(1)
              .border_color(c.accentLip)
              .text_size(13)
              .font_medium()
              .text_color(c.accentInk)
              .cursor_pointer()
              .hover((s) => s.opacity(0.92))
              .on_click((_e, cx) => this.submit(q, cx))
              .child(sending ? "Sending…" : "Send answers"),
          )
          .child(div().text_size(12).text_color(c.faint).child("Anything left open is the agent's call.")),
      );
  }

  ask(c, q, x, i) {
    const a = this.answers[q.id]?.[i] ?? { picks: [], text: null };
    return v_flex()
      .gap(6)
      .child(
        h_flex()
          .gap(6)
          .items_start()
          .child(div().flex_1().min_w(0).text_size(14).font_semibold().line_height(SIZE.line).child(`${i + 1}. ${x.text}`))
          .when(Boolean(x.seat), (el) => el.child(div().flex_none().pt(2).text_size(11).text_color(c.faint).child(String(x.seat).toUpperCase()))),
      )
      .when(Boolean(x.multi), (el) => el.child(div().text_size(11.5).text_color(c.faint).child("Pick any that apply.")))
      .children(x.options.map((o, oi) => {
        const on = a.picks.includes(o.label);
        return h_flex()
          .id(`bh-q-${q.id}-${i}-${oi}`)
          .min_h(36)
          .px(10)
          .py(6)
          .gap(10)
          .items_center()
          .rounded(SIZE.control)
          .border_1()
          .border_color(on ? c.accent : c.edge)
          .when(on, (el) => el.bg(c.well))
          .cursor_pointer()
          .hover((s) => s.bg(c.hover))
          .on_click((_e, cx) => this.pick(q, i, o.label, cx))
          .child(
            div()
              .flex_none()
              .size(16)
              .flex()
              .items_center()
              .justify_center()
              .rounded(x.multi ? 4 : 8)
              .border_1()
              .border_color(on ? c.accent : c.faint)
              .when(on, (el) => el.bg(c.accent).child(svg(ICON("check")).size(11).text_color(c.accentInk))),
          )
          .child(
            v_flex()
              .flex_1()
              .min_w(0)
              .child(h_flex().gap(6).items_center()
                .child(div().text_size(13).font_medium().child(o.label))
                .when(Boolean(o.recommended), (el) => el.child(div().text_size(11).text_color(c.accent).child("Recommended"))))
              .when(Boolean(o.meaning), (el) => el.child(div().text_size(12.5).text_color(c.muted).child(o.meaning))),
          )
          .when(Boolean(o.mockupFile), (el) => el.child(
            h_flex()
              .id(`bh-q-mock-${q.id}-${i}-${oi}`)
              .flex_none()
              .h(24)
              .px(8)
              .gap(5)
              .items_center()
              .rounded(6)
              .text_size(11.5)
              .text_color(c.muted)
              .hover((s) => s.bg(c.fill).text_color(c.ink))
              .on_click((_e, cx) => {
                cx.stop_propagation();
                cx.spawn(async () => {
                  await bh(["open", o.mockupFile]);
                });
              })
              .child(svg(ICON("external-link")).size(12))
              .child("Mockup"),
          ));
      }))
      .when(Boolean(a.text), (el) => el.child(
        div()
          .h(32)
          .px(10)
          .flex()
          .items_center()
          .rounded(SIZE.control)
          .bg(c.ground)
          .border_1()
          .border_color(c.edge)
          .child(Input.new(a.text).w_full().h_full().text_size(13).text_color(c.ink)),
      ));
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

  working(c, names) {
    const who = names.length > 3 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more` : names.join(", ");
    return h_flex()
      .flex_none()
      .gap(8)
      .items_center()
      .text_size(12.5)
      .text_color(c.muted)
      .child(svg(ICON("spinner")).size(13).spin(900))
      .child(`${who} ${names.length === 1 ? "is" : "are"} working…`);
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
