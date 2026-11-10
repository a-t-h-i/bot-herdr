// The chat page: one conversation with every agent in the space. Your messages and the agents'
// replies run up the page; the composer sits at the foot. It is a page of its own (the layout's
// "pages" stack), so the terminals stay untouched on theirs.
//
// An agent's reply is the file it writes at the end of each turn (brief.js tells it where). We
// read those files every few seconds. An agent that stops without writing one, or that needs an
// answer in its terminal, gets a line here with a way to its terminal.

import { div, svg } from "gpui-kit";
import { v_flex, h_flex, TextView } from "gpui-base";
import { agents, terminals, spaces, focused, settings, shared, readTextFile } from "herdr";
import * as fs from "fs/promises";
import { LIGHT, DARK, SIZE, ICON } from "./look.js";
import { Composer, outboxDir } from "./composer.js";
import { FOCUS, activePage, openTerminal } from "./pages.js";
import { replyFile, push, shown, isNew, outcome, clock } from "./feed.js";

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
    this.page = null;
    this.reading = false;
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
      } finally {
        this.reading = false;
      }
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
          .child(div().text_size(12.5).font_semibold().text_color(e.from?.tile ?? c.accent).child(e.from?.name ?? "Agent"))
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
