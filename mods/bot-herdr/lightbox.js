// A picture opened large: a mockup from a reply or a question, or an image on the composer.
// Opened as a dialog over everything with props { items: [{ image, title, note?, html?, glyph? }],
// at, choose? }. ← and → move between the pictures, Esc closes. With `choose` (a question's
// mockups), "Choose this" (or Enter) posts { key: choose, index, at } in shared state for the
// opener and closes.

import { div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, settings, setShared, closeOverlay, openOverlay } from "herdr";
import { SIZE, ICON, TYPE, SPACE, ROW, CONTROL, CHIP, GLYPH, clickable, accentFill } from "./look.js";
import { colors } from "./theme.js";
import { alpha } from "./working.js";
import { openInBrowser } from "./media.js";

export const CHOSEN = "bot-herdr.lightbox";
const HEAD = ROW * 2;
const FOOT = ROW * 2;

/** Opens the pictures large, at the one numbered `at`. */
export function openLightbox({ items, at = 0, choose = null }) {
  const shown = (items ?? []).filter((x) => x?.image);
  if (!shown.length) return null;
  return openOverlay({
    mod: "bot-herdr",
    kind: "dialog",
    frame: "none",
    width: 0.86,
    height: 0.88,
    props: { view: "lightbox", items: shown, at: Math.max(0, Math.min(shown.length - 1, at)), choose },
  });
}

export class Lightbox {
  init(given, cx) {
    this.p = given ?? props() ?? {};
    this.at = this.p.at ?? 0;
    this.size = { width: 1000, height: 760 };
    this.handle = cx.focus_handle();
    this.handle.focus();
  }

  items() {
    return this.p.items ?? [];
  }

  close() {
    closeOverlay(props()?.overlay ?? this.p.overlay);
  }

  move(by, cx) {
    const n = this.items().length;
    if (n < 2) return;
    this.at = (this.at + by + n) % n;
    cx.notify();
  }

  choose() {
    if (!this.p.choose) return;
    setShared(CHOSEN, { key: this.p.choose, index: this.at, at: Date.now() });
    this.close();
  }

  render() {
    const c = colors();
    const items = this.items();
    const item = items[this.at] ?? {};
    const many = items.length > 1;
    const imgW = Math.max(120, this.size.width - SPACE[5] * 2);
    const imgH = Math.max(120, this.size.height - HEAD - FOOT - SPACE[5]);
    const round = (id, icon, onClick) => clickable(
      div()
        .flex_none()
        .size(CONTROL)
        .flex()
        .items_center()
        .justify_center()
        .rounded_full()
        .text_color(c.muted)
        .on_click(onClick)
        .child(svg(ICON(icon)).size(GLYPH.lg)),
      c,
      id,
    );
    return v_flex()
      .id("bh-lightbox")
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "left") this.move(-1, cx);
        else if (e.key === "right") this.move(1, cx);
        else if (e.key === "enter" && this.p.choose) this.choose();
        else if (e.key === "escape") this.close();
        else return;
        cx.stop_propagation();
      })
      .on_size_change((size, cx) => {
        // px with the app's zoom multiplied in; drawn sizes are without it.
        const zoom = Number(settings().zoom) || 1;
        this.size = { width: size.width / zoom, height: size.height / zoom };
        cx.notify();
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
          .h(HEAD)
          .px(SPACE[4])
          .gap(SPACE[3])
          .items_center()
          .when(Boolean(item.glyph), (el) => el.child(
            div().flex_none().size(CHIP).flex().items_center().justify_center().rounded(SIZE.nested)
              .bg(alpha(item.tone ?? c.accent, 0.14)).border_1().border_color(alpha(item.tone ?? c.accent, 0.38))
              .text_size(TYPE.xs).font_semibold().text_color(item.tone ?? c.accent).child(String(item.glyph)),
          ))
          .child(
            v_flex()
              .flex_1()
              .min_w(0)
              .child(div().truncate().text_size(TYPE.md).font_semibold().child(item.title ?? "Picture"))
              .when(Boolean(item.note), (el) => el.child(div().truncate().text_size(TYPE.sm).text_color(c.muted).child(item.note))),
          )
          .when(many, (el) => el.child(div().flex_none().text_size(TYPE.sm).text_color(c.faint).child(`${this.at + 1} of ${items.length}`)))
          .child(round("bh-lb-close", "x", () => this.close())),
      )
      .child(
        div()
          .flex_1()
          .min_h(0)
          .mx(SPACE[4])
          .flex()
          .items_center()
          .justify_center()
          .rounded(SIZE.control)
          .bg(c.well)
          .overflow_hidden()
          .child(image(item.image).w(imgW - 16).h(imgH - 16)),
      )
      .child(
        h_flex()
          .flex_none()
          .h(FOOT)
          .px(SPACE[4])
          .gap(SPACE[3])
          .items_center()
          .when(many, (el) => el
            .child(round("bh-lb-prev", "chevron-left", (_e, cx) => this.move(-1, cx)))
            .child(round("bh-lb-next", "chevron-right", (_e, cx) => this.move(1, cx))))
          .when(Boolean(item.html), (el) => el.child(
            clickable(
              h_flex()
                .h(CONTROL)
                .px(SPACE[3])
                .gap(SPACE[3])
                .items_center()
                .rounded(SIZE.nested)
                .text_size(TYPE.sm)
                .text_color(c.muted)
                .on_click((_e, cx) => openInBrowser(item.html, cx))
                .child(svg(ICON("external-link")).size(GLYPH.md))
                .child("Open in browser"),
              c,
              "bh-lb-open",
            ),
          ))
          .child(div().flex_1())
          .child(div().text_size(TYPE.xs).text_color(c.faint).child(many ? "← → to move · Esc to close" : "Esc to close"))
          .when(Boolean(this.p.choose), (el) => el.child(
            clickable(
              div()
                .h(CONTROL)
                .px(SPACE[4])
                .flex()
                .items_center()
                .rounded(SIZE.control)
                .bg(c.accent)
                .border_b(1)
                .border_color(c.accentLip)
                .text_size(TYPE.md)
                .font_medium()
                .text_color(c.accentInk)
                .on_click(() => this.choose())
                .child("Choose this"),
              c,
              "bh-lb-choose", { fill: accentFill(c) },
            ),
          )),
      );
  }
}
