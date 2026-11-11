// A markdown editor with a live preview: every block is drawn rendered, and the one you click (or
// tab into) turns into its source for editing. Blocks are split so that joining them gives back
// the exact original text: nothing is normalised, so CRLF, a missing final newline and an
// unclosed fence all survive a round trip.
//
// gpui has no rich-text editing widget, so the source of the active block is a TextareaState and
// every other block is a read-only TextView.markdown.

import { div } from "gpui-kit";
import { v_flex, TextView, Textarea, TextareaState } from "gpui-base";
import { SIZE, SPACE, TYPE, clickable } from "./look.js";
import { splitBlocks, joinBlocks, withBody } from "./mdblocks.js";

export { splitBlocks, joinBlocks };

/** The end of a paragraph with a blank line after it, in either line ending. */
const BLANK_END = /(?:\r?\n)[ \t]*(?:\r?\n)$/;

/**
 * A live-preview markdown editor. Create one per document; its blocks, the active one and the
 * source field outlive a render.
 */
export class MarkdownEditor {
  constructor({ value = "", placeholder = "" } = {}) {
    this.placeholder = placeholder;
    this.blocks = splitBlocks(value);
    this.active = this.blocks.length === 1 && !this.blocks[0].body ? 0 : null;
    this.state = null;
    this.handlers = [];
  }

  value() {
    return joinBlocks(this.blocks);
  }

  set_value(text) {
    this.active = null;
    this.drop();
    this.blocks = splitBlocks(text);
    if (!this.blocks[0]?.body) this.active = 0;
  }

  /** `on("change", handler)`: the whole text after every edit. */
  on(event, handler) {
    if (event === "change" && typeof handler === "function") this.handlers.push(handler);
  }

  emit(cx) {
    for (const h of this.handlers) h(this.value(), cx);
  }

  /** The active block's textarea, made on the spot (a state needs a live host call). */
  source(i) {
    this.drop();
    const st = TextareaState.new({ value: this.blocks[i].body, placeholder: this.placeholder });
    st.set_auto_grow(1, SIZE.maxRows);
    st.on("change", (_e, cx) => this.edited(i, st, cx));
    st.on("blur", (_e, cx) => { if (this.state === st) this.deactivate(cx); });
    this.state = st;
    return st;
  }

  drop() {
    if (this.state) {
      try {
        this.state.release();
      } catch {
        // a state the host already dropped
      }
    }
    this.state = null;
  }

  edited(i, st, cx) {
    const b = this.blocks[i];
    if (!b) return;
    const value = st.value();
    // Enter twice at the end of a paragraph starts the next block: this one keeps a blank line
    // after it and the new one gets its own, so what is typed next is a paragraph of its own.
    if (b.type === "paragraph" && BLANK_END.test(value)) {
      const head = value.replace(BLANK_END, "");
      const eol = (/\r?\n/.exec(b.gap) ?? /\r?\n/.exec(value) ?? ["\n"])[0];
      const blank = b.gap.length >= eol.length * 2 ? b.gap : eol + eol;
      this.blocks = this.blocks.map((x, j) => (j === i ? { ...x, body: head, gap: blank, text: head + blank } : x));
      // A new block joins as nothing until it is typed in; from then on it ends in a blank line.
      this.blocks.splice(i + 1, 0, { type: "paragraph", text: "", body: "", gap: blank });
      this.source(i + 1).focus();
      this.active = i + 1;
      this.emit(cx);
      cx.notify();
      return;
    }
    this.blocks = withBody(this.blocks, i, value);
    this.emit(cx);
  }

  activate(i, cx) {
    if (!this.blocks[i]) return;
    this.source(i).focus();
    this.active = i;
    cx.notify();
  }

  deactivate(cx) {
    if (this.active === null) return;
    this.active = null;
    this.drop();
    cx.notify();
  }

  move(by, cx) {
    const i = this.active ?? 0;
    const next = i + by;
    if (!this.blocks[next]) return;
    this.source(next).focus();
    this.active = next;
    cx.notify();
  }

  /**
   * Up and Down leave a one-line block for the one above or below it. The textarea reports no
   * caret position, so inside a multi-line block the keys stay its own.
   */
  keys(e, cx) {
    if (e.key === "escape") {
      this.deactivate(cx);
      cx.stop_propagation();
      return;
    }
    const up = e.key === "up" || e.key === "arrow-up";
    const down = e.key === "down" || e.key === "arrow-down";
    if (!up && !down) return;
    if ((this.state?.value() ?? "").includes("\n")) return;
    this.move(up ? -1 : 1, cx);
    cx.stop_propagation();
  }

  render(c, cx, id) {
    const active = this.active;
    if (active !== null && !this.state) {
      cx.timer.after(1, (cx) => {
        if (this.active !== active || this.state) return;
        this.source(active).focus();
        cx.notify();
      });
    }
    return v_flex()
      .id(id)
      .gap(SPACE[1])
      .children(this.blocks.map((b, i) => {
        if (i === active && this.state) return this.editor(c, `${id}-src-${i}`);
        return this.shown(c, cx, b, i, `${id}-b${i}`);
      }));
  }

  /** A block as it reads; a press makes it the one being edited. */
  shown(c, cx, b, i, id) {
    return clickable(
      div()
        .w_full()
        .px(SPACE[3])
        .py(SPACE[2])
        .rounded(SIZE.nested)
        .hover((s) => s.bg(c.hover))
        .on_click((_e, cx) => this.activate(i, cx))
        .child(TextView.markdown(id, b.body)),
      c,
      id,
    );
  }

  editor(c, id) {
    return div()
      .id(id)
      .w_full()
      .px(SPACE[3])
      .py(SPACE[2])
      .rounded(SIZE.control)
      .bg(c.ground)
      .border_1()
      .border_color(c.accent)
      .on_key_down((e, cx) => this.keys(e, cx))
      .child(Textarea.new(this.state).w_full().text_size(TYPE.md).text_color(c.ink));
  }
}
