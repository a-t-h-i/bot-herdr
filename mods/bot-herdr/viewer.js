// A file named in a message, opened over the chat: read only, with its syntax, at the line the
// message named. A `.md` file opens rendered, with a Source toggle for the text itself. Opened as
// a dialog with props { view: "file", path, line?, root }. Ctrl+F (or the header's find button)
// searches the file and lists the matching lines. "Open in its app" hands it to the system; Esc
// closes the search row, then the dialog.

import { div, svg } from "gpui-kit";
import { v_flex, h_flex, TextView, InputState, Input, Editor, EditorState } from "gpui-base";
import { props, settings, theme, readTextFile, closeOverlay, openOverlay } from "herdr";
import { SIZE, ICON, TYPE, LINE, SPACE, CONTROL, ROW, PIP, GLYPH, clickable, mix } from "./look.js";
import { segmented } from "./switch.js";
import { colors } from "./theme.js";
import { bh } from "./bh.js";
import { splitBlocks } from "./mdblocks.js";
import { findMatches, around, step } from "./search.js";

const LANG = { ts: "js", tsx: "js", mts: "js", cts: "js", jsx: "js", mjs: "js", cjs: "js", toml: "yaml", yml: "yaml", jsonc: "json", svelte: "html", vue: "html", htm: "html", md: "markdown" };
const MAX = 400000;
const MONO = (s) => s.font_family(settings().font_family);

/** Where a path in a message points: as is when absolute, else inside the project. */
export function resolvePath(path, root) {
  const p = String(path ?? "").trim().replace(/^~(?=[\\/])/, "");
  if (/^([A-Za-z]:[\\/]|[\\/])/.test(p)) return p;
  const base = String(root ?? "").replace(/[\\/]+$/, "");
  return base ? `${base}/${p.replace(/^\.[\\/]/, "")}` : p;
}

/** Opens a file over everything. */
export function openFile({ path, line = null, root = null }) {
  return openOverlay({
    mod: "bot-herdr",
    kind: "dialog",
    frame: "none",
    width: 0.8,
    height: 0.86,
    props: { view: "file", path: resolvePath(path, root), shown: path, line },
  });
}

/** A header control: an icon and, when given, a label. */
function button(c, id, icon, label, onClick) {
  return clickable(
    h_flex()
      .flex_none()
      .h(CONTROL)
      .px(SPACE[3])
      .gap(SPACE[2])
      .items_center()
      .rounded(SIZE.nested)
      .text_size(TYPE.sm)
      .text_color(c.muted)
      .on_click(onClick)
      .when(Boolean(icon), (el) => el.child(svg(ICON(icon)).size(GLYPH.md)))
      .when(Boolean(label), (el) => el.child(label)),
    c,
    id,
  );
}

export class FileView {
  init(given, cx) {
    this.p = given ?? props() ?? {};
    this.code = null;
    this.text = "";
    this.error = null;
    const ext = /\.([A-Za-z0-9]+)$/.exec(String(this.p.path ?? ""))?.[1]?.toLowerCase() ?? "txt";
    this.md = ext === "md";
    this.mode = this.md ? "read" : "source";
    this.search = { open: false, query: "", caseSensitive: false, at: 0 };
    this.findInput = InputState.new({ placeholder: "Find in this file" });
    this.findInput.on("change", (_e, cx) => {
      this.search.query = this.findInput.value();
      this.search.at = 0;
      cx.notify();
    });
    this.findInput.on("submit", (e, cx) => this.hit(e?.shift ? -1 : 1, cx));
    this.handle = cx.focus_handle();
    this.handle.focus();
    const path = this.p.path;
    cx.spawn(async (cx) => {
      try {
        const text = await readTextFile(path);
        if (text === null) this.error = "This file isn't there. It may have moved, or it lives in another folder.";
        else if (text.includes("\0")) this.error = "This is not a text file. Open it in its app.";
        else {
          this.text = text;
          this.code = this.editorState(text, ext);
        }
      } catch {
        this.error = "Couldn't read this file (too large, or not readable).";
      }
      cx.notify();
    });
  }

  editorState(text, ext) {
    const t = theme();
    return EditorState.new({
      language: LANG[ext] ?? ext,
      readonly: true,
      value: text.length > MAX ? `${text.slice(0, MAX)}\n… (cut here: open it in its app for the rest)` : text,
      font_family: settings().font_family,
      font_size: TYPE.sm,
      syntax: { keyword: t.ansi5, string: t.ansi2, comment: t.dim, function: t.ansi4, type: t.ansi3, number: t.ansi1, constant: t.ansi6 },
    });
  }

  close() {
    closeOverlay(props()?.overlay ?? this.p.overlay);
  }

  /** The matches of the current query, in reading order. */
  results() {
    return findMatches(this.text, this.search.query, { caseSensitive: this.search.caseSensitive });
  }

  openFind(cx) {
    this.search.open = true;
    this.findInput.focus();
    cx.notify();
  }

  closeFind(cx) {
    this.search.open = false;
    cx.notify();
  }

  /** The next (or, with -1, previous) match, wrapping at either end. */
  hit(by, cx) {
    const count = this.results().length;
    if (!count) return;
    this.search.at = step(this.search.at, count, by);
    cx.notify();
  }

  render(cx) {
    const c = colors();
    const shown = this.p.shown ?? this.p.path ?? "";
    const name = String(shown).split(/[\\/]/).pop();
    const hits = this.search.open ? this.results() : [];
    const read = this.md && this.mode === "read";
    return v_flex()
      .id("bh-file")
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.keystroke === "ctrl-f") {
          this.openFind(cx);
          cx.stop_propagation();
          return;
        }
        if (e.key !== "escape") return;
        if (this.search.open) this.closeFind(cx);
        else this.close();
        cx.stop_propagation();
      })
      .size_full()
      .bg(c.fill)
      .border_1()
      .border_color(c.edge)
      .rounded(SIZE.radius)
      .overflow_hidden()
      .text_color(c.ink)
      .child(
        h_flex()
          .flex_none()
          .h(ROW * 2)
          .px(SPACE[4])
          .gap(SPACE[3])
          .items_center()
          .child(svg(ICON("file")).size(GLYPH.lg).text_color(c.muted))
          .child(
            v_flex()
              .flex_1()
              .min_w(0)
              .child(div().truncate().text_size(TYPE.md).font_semibold().child(name || "File"))
              .child(div().truncate().text_size(TYPE.sm).text_color(c.muted).child(`${this.p.path ?? ""}${this.p.line ? ` · line ${this.p.line}` : ""}`)),
          )
          .when(this.md && Boolean(this.code), (el) => el.child(segmented(c, {
            id: "bh-file-mode",
            items: [
              { id: "read", label: "Preview", on: this.mode === "read" },
              { id: "source", label: "Source", on: this.mode === "source" },
            ],
            onPick: (id, cx) => {
              this.mode = id;
              cx.notify();
            },
          })))
          .child(button(c, "bh-file-find", "search", null, (_e, cx) => this.openFind(cx)))
          .child(button(c, "bh-file-open", "external-link", "Open in its app", (_e, cx) => cx.spawn(async () => {
            await bh(["open", this.p.path]);
          })))
          .child(button(c, "bh-file-close", "x", null, () => this.close())),
      )
      .child(
        div()
          .flex_1()
          .min_h(0)
          .mx(SPACE[4])
          .mb(SPACE[4])
          .rounded(SIZE.control)
          .border_1()
          .border_color(c.edge)
          .bg(c.ground)
          .overflow_hidden()
          .flex()
          .flex_col()
          .when(this.search.open, (el) => el.child(this.findRow(c, hits, cx)))
          .when(this.search.open && hits.length, (el) => el.child(this.hits(c, hits, cx)))
          .child(this.body(c, read)),
      );
  }

  /** The find field, how far along the matches are, and next/previous/case/close. */
  findRow(c, hits, cx) {
    const count = hits.length;
    const say = count ? `${this.search.at + 1} of ${count}` : this.search.query ? "No matches" : "";
    const flat = () => h_flex().flex_none().h(CONTROL).gap(SPACE[1]).items_center().rounded(SIZE.nested).px(SPACE[2]).text_size(TYPE.xs).font_medium().text_color(c.muted).hover((s) => s.bg(c.hover));
    return h_flex()
      .flex_none()
      .px(SPACE[4])
      .py(SPACE[2])
      .gap(SPACE[3])
      .items_center()
      .border_b(1)
      .border_color(c.edge)
      .child(
        h_flex()
          .flex_1()
          .min_w(0)
          .h(CONTROL)
          .px(SPACE[3])
          .gap(SPACE[2])
          .items_center()
          .rounded(SIZE.control)
          .border_1()
          .border_color(c.edge)
          .child(svg(ICON("search")).size(GLYPH.sm).text_color(c.faint))
          .child(div().flex_1().min_w(0).h_full().child(Input.new(this.findInput).w_full().h_full().text_size(TYPE.sm).text_color(c.ink))),
      )
      .when(Boolean(say), (el) => el.child(div().flex_none().text_size(TYPE.xs).text_color(count ? c.muted : c.faint).child(say)))
      .child(clickable(flat().on_click((_e, cx) => this.hit(-1, cx)).child(svg(ICON("chevron-left")).size(GLYPH.md)), c, "bh-find-prev"))
      .child(clickable(flat().on_click((_e, cx) => this.hit(1, cx)).child(svg(ICON("chevron-right")).size(GLYPH.md)), c, "bh-find-next"))
      .child(clickable(
        h_flex()
          .flex_none()
          .h(CONTROL)
          .px(SPACE[2])
          .items_center()
          .rounded(SIZE.nested)
          .text_size(TYPE.sm)
          .font_medium()
          .when(this.search.caseSensitive, (el) => el.bg(c.well).text_color(c.ink))
          .when(!this.search.caseSensitive, (el) => el.text_color(c.muted).hover((s) => s.bg(c.hover)))
          .on_click((_e, cx) => {
            this.search.caseSensitive = !this.search.caseSensitive;
            this.search.at = 0;
            cx.notify();
          })
          .child("Aa"),
        c,
        "bh-find-case",
      ))
      .child(button(c, "bh-find-close", "x", null, (_e, cx) => this.closeFind(cx)));
  }

  /** The matching lines, each with the hit drawn in the accent; a press makes one current. */
  hits(c, hits, cx) {
    const lines = this.text.split(/\r?\n/);
    return v_flex()
      .id("bh-find-hits")
      .flex_none()
      .max_h(ROW * SIZE.rowsShown)
      .overflow_y_scroll()
      .p(SPACE[2])
      .gap(SPACE[1])
      .border_b(1)
      .border_color(c.edge)
      .children(hits.map((m, i) => {
        const parts = around(lines[m.line - 1], m);
        const on = i === this.search.at;
        return clickable(
          h_flex()
            .flex_none()
            .h(ROW)
            .px(SPACE[2])
            .gap(SPACE[3])
            .items_center()
            .rounded(SIZE.nested)
            .when(on, (el) => el.bg(c.well))
            .on_click((_e, cx) => {
              this.search.at = i;
              cx.notify();
            })
            .child(div().flex_none().w(SPACE[5] * 3).text_size(TYPE.xs).text_color(c.faint).child(String(m.line)))
            .child(
              MONO(h_flex().min_w(0).overflow_hidden().whitespace_nowrap().text_size(TYPE.sm).text_color(c.muted))
                .child(div().flex_none().child(parts.before))
                .child(div().flex_none().rounded(PIP).bg(mix(c.ground, c.accent, on ? 0.5 : 0.25)).text_color(c.ink).child(parts.hit))
                .child(div().flex_none().child(parts.after)),
            ),
          c,
          `bh-find-hit-${i}`,
        );
      }));
  }

  /** The file: rendered blocks for a `.md` in Preview, the code editor otherwise. */
  body(c, read) {
    if (!this.code) return div().p(SPACE[4]).text_size(TYPE.md).text_color(c.muted).child(this.error ?? "Opening…");
    if (!read) return Editor.new(this.code).flex_1().min_h(0);
    return v_flex()
      .id("bh-file-read")
      .flex_1()
      .min_h(0)
      .overflow_y_scroll()
      .items_center()
      .child(
        v_flex()
          .flex_none()
          .w_full()
          .max_w(SIZE.maxWidth)
          .px(SPACE[4])
          .py(SPACE[4])
          .gap(SPACE[3])
          .children(splitBlocks(this.text).filter((b) => b.body).map((b, i) =>
            div().text_size(TYPE.md).line_height(`${LINE.md}px`).child(TextView.markdown(`bh-file-md-${i}`, b.body)))),
      );
  }
}
