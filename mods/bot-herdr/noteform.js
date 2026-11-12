// The new knowledge note, as a dialog over the Knowledge page: whose file it goes to, its section,
// and the note. "Add note" keeps it (bh knowledge add) and tells the page to reload
// (`NOTE_ADDED`); Cancel or Esc closes it.

import { div, svg } from "gpui-kit";
import { v_flex, h_flex, TextareaState, Textarea } from "gpui-base";
import { props, setShared, closeOverlay, openOverlay } from "herdr";
import { SIZE, ICON, TYPE, SPACE, CONTROL, GLYPH, clickable } from "./look.js";
import { actionButton } from "./button.js";
import { colors } from "./theme.js";
import { bh, enc } from "./bh.js";
import { mentionTone, alpha } from "./indicators.js";
import { avatar } from "./switch.js";

export const NOTE_ADDED = "bot-herdr.note-added";

/** Who a note can go to before their file exists, and a knowledge file's sections. */
const NOTE_AGENTS = ["orchestrator", "dev", "design", "qa", "research", "scout"];
const NOTE_SECTIONS = ["Facts", "Standards", "Decisions", "History"];

/** Opens the dialog; `agents` are the ones with a knowledge file, `agent` the one picked first. */
export function openNoteForm({ agents = [], agent = "orchestrator", dir = null }) {
  return openOverlay({
    mod: "bot-herdr",
    kind: "dialog",
    // Drawn by the form itself: rounded, bordered and shadowed like the mod's other cards.
    frame: "none",
    width: 520,
    props: { view: "note", agents, agent, dir },
  });
}

const title = (a) => (a === "qa" ? "QA" : a.charAt(0).toUpperCase() + a.slice(1));

export class NoteForm {
  init(given, cx) {
    this.p = given ?? props() ?? {};
    this.agent = this.p.agent ?? "orchestrator";
    this.section = "Facts";
    this.busy = false;
    this.problem = null;
    this.text = TextareaState.new({ value: "", placeholder: "The note", rows: 4 });
    this.text.on("change", (_e, cx) => cx.notify());
    this.handle = cx.focus_handle();
    cx.timer.after(16, () => this.text.focus?.());
  }

  close() {
    closeOverlay(props()?.overlay ?? this.p.overlay);
  }

  add(cx) {
    const note = this.text.value().trim();
    if (!note || this.busy) return;
    this.busy = true;
    this.problem = null;
    cx.notify();
    cx.spawn(async (cx) => {
      const args = ["knowledge", "add", this.agent, "--section", this.section, "--data", enc(note)];
      const r = await bh(args, this.p.dir ? { cwd: this.p.dir } : {});
      this.busy = false;
      if (r.code !== 0) {
        this.problem = (r.stderr || r.stdout || "Couldn't keep the note.").trim().split("\n")[0];
        cx.notify();
        return;
      }
      setShared(NOTE_ADDED, { agent: this.agent, at: Date.now() });
      this.close();
    });
  }

  chip(c, id, label, on, onClick, lead = null) {
    return clickable(
      h_flex().h(CONTROL).px(SPACE[3]).gap(SPACE[2]).items_center().rounded_full().border_1()
        .border_color(on ? c.accent : c.edge).when(on, (el) => el.bg(alpha(c.accent, 0.12)))
        .text_size(TYPE.sm).font_medium().text_color(on ? c.ink : c.muted)
        .on_click(onClick)
        .when(Boolean(lead), (el) => el.child(lead))
        .child(label),
      c,
      id,
    );
  }

  render(cx) {
    const c = colors();
    const who = [...new Set([...NOTE_AGENTS, ...(this.p.agents ?? [])])];
    const empty = !this.text.value().trim();
    const row = (label, children) => v_flex().gap(SPACE[2])
      .child(div().text_size(TYPE.xs).font_medium().text_color(c.muted).child(label))
      .child(h_flex().flex_wrap().gap(SPACE[2]).children(children));
    return v_flex()
      .id("bh-note-form")
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "escape") {
          cx.stop_propagation();
          this.close();
        }
      })
      .w_full()
      .p(SPACE[5])
      .gap(SPACE[5])
      .rounded(SIZE.radius)
      .bg(c.fill)
      .border_1()
      .border_color(c.edge)
      .shadow_lg()
      .overflow_hidden()
      .text_color(c.ink)
      .child(h_flex().gap(SPACE[3]).items_center()
        .child(div().size(32).rounded(SIZE.control).flex().items_center().justify_center()
          .bg(alpha(c.accent, 0.14)).border_1().border_color(alpha(c.accent, 0.3)).text_color(c.accent)
          .child(svg(ICON("page-knowledge")).size(GLYPH.lg)))
        .child(div().text_size(TYPE.lg).font_semibold().child("New note")))
      .child(row("For", who.map((a) => this.chip(c, `bh-note-a-${a}`, title(a), this.agent === a, (_e, cx) => { this.agent = a; cx.notify(); }, avatar(c, title(a), mentionTone(c, a), 16)))))
      .child(row("Section", NOTE_SECTIONS.map((sec) => this.chip(c, `bh-note-s-${sec}`, sec, this.section === sec, (_e, cx) => { this.section = sec; cx.notify(); }))))
      .child(div().p(SPACE[3]).rounded(SIZE.control).bg(c.ground).border_1().border_color(c.edge)
        .child(Textarea.new(this.text).w_full().text_size(TYPE.md).text_color(c.ink)))
      .when(Boolean(this.problem), (el) => el.child(div().text_size(TYPE.sm).text_color(c.danger).child(this.problem)))
      .child(h_flex().gap(SPACE[3]).items_center()
        .child(div().flex_1())
        .child(actionButton(c, "bh-note-cancel", "Cancel", () => this.close(), { tone: "secondary" }))
        .child(actionButton(c, "bh-note-add", this.busy ? "Adding…" : "Add note", (_e, cx) => this.add(cx), { tone: "primary", disabled: empty })));
  }
}
