// A file named in a message, opened over the chat: read only, with its syntax, at the line the
// message named. Opened as a dialog with props { view: "file", path, line?, root }. "Open in its
// app" hands it to the system; Esc closes.

import { div, svg } from "gpui-kit";
import { v_flex, h_flex, Editor, EditorState } from "gpui-base";
import { props, settings, theme, readTextFile, closeOverlay, openOverlay } from "herdr";
import { SIZE, ICON } from "./look.js";
import { colors } from "./theme.js";
import { bh } from "./bh.js";

const LANG = { ts: "js", tsx: "js", mts: "js", cts: "js", jsx: "js", mjs: "js", cjs: "js", toml: "yaml", yml: "yaml", jsonc: "json", svelte: "html", vue: "html", htm: "html", md: "markdown" };
const MAX = 400000;

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

export class FileView {
  init(given, cx) {
    this.p = given ?? props() ?? {};
    this.code = null;
    this.error = null;
    this.handle = cx.focus_handle();
    this.handle.focus();
    const path = this.p.path;
    cx.spawn(async (cx) => {
      try {
        const text = await readTextFile(path);
        if (text === null) this.error = "This file isn't there. It may have moved, or it lives in another folder.";
        else if (text.includes("\0")) this.error = "This is not a text file. Open it in its app.";
        else {
          const t = theme();
          const ext = /\.([A-Za-z0-9]+)$/.exec(path)?.[1]?.toLowerCase() ?? "txt";
          this.code = EditorState.new({
            language: LANG[ext] ?? ext,
            readonly: true,
            value: text.length > MAX ? `${text.slice(0, MAX)}\n… (cut here: open it in its app for the rest)` : text,
            font_family: settings().font_family,
            font_size: 12.5,
            syntax: { keyword: t.ansi5, string: t.ansi2, comment: t.dim, function: t.ansi4, type: t.ansi3, number: t.ansi1, constant: t.ansi6 },
          });
        }
      } catch {
        this.error = "Couldn't read this file (too large, or not readable).";
      }
      cx.notify();
    });
  }

  close() {
    closeOverlay(props()?.overlay ?? this.p.overlay);
  }

  render() {
    const c = colors();
    const shown = this.p.shown ?? this.p.path ?? "";
    const name = String(shown).split(/[\\/]/).pop();
    const action = (id, icon, label, onClick) => h_flex()
      .id(id)
      .flex_none()
      .h(28)
      .px(9)
      .gap(6)
      .items_center()
      .rounded(SIZE.nested)
      .text_size(12.5)
      .text_color(c.muted)
      .cursor_pointer()
      .hover((s) => s.bg(c.hover).text_color(c.ink))
      .on_click(onClick)
      .when(Boolean(icon), (el) => el.child(svg(ICON(icon)).size(13)))
      .when(Boolean(label), (el) => el.child(label));
    return v_flex()
      .id("bh-file")
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key !== "escape") return;
        this.close();
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
          .h(52)
          .px(16)
          .gap(10)
          .items_center()
          .child(svg(ICON("file")).size(16).text_color(c.muted))
          .child(
            v_flex()
              .flex_1()
              .min_w(0)
              .child(div().truncate().text_size(14).font_semibold().child(name || "File"))
              .child(div().truncate().text_size(12).text_color(c.muted).child(`${this.p.path ?? ""}${this.p.line ? ` · line ${this.p.line}` : ""}`)),
          )
          .child(action("bh-file-open", "external-link", "Open in its app", (_e, cx) => cx.spawn(async () => {
            await bh(["open", this.p.path]);
          })))
          .child(action("bh-file-close", "x", null, () => this.close())),
      )
      .child(
        div()
          .flex_1()
          .min_h(0)
          .mx(12)
          .mb(12)
          .rounded(SIZE.control)
          .border_1()
          .border_color(c.edge)
          .bg(c.ground)
          .overflow_hidden()
          .flex()
          .flex_col()
          .child(this.code
            ? Editor.new(this.code).flex_1().min_h(0)
            : div().p(14).text_size(13).text_color(c.muted).child(this.error ?? "Opening…")),
      );
  }
}
