// A dropdown list, opened as a popup over everything (so a card never grows to show it).
// Settings opens it under a field with the options; a pick is posted in shared state for the
// opener (`PICKED`: { key, value, at }) and the popup closes. Esc or a click beside it closes it.
//
// A list that is asking for its contents says so (`loading`), can carry a line about where its
// entries come from (`header`) and a sentence when asking failed (`error`), and a refresh button
// that posts `REFRESH` for the opener to answer with a fresh list.
//
// A long list can be `searchable` (a box on top filters it as you type; Enter takes the first
// match), and can carry an `efforts` row ({ key, options: [{ value, label }], selected }): a pick
// there is posted under its own key and the list stays open.

import { div, svg, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { props, settings, setShared, closeOverlay, openOverlay } from "herdr";
import { SIZE, ICON, TYPE, SPACE, CONTROL, ROW, CHIP, DOT, HAIR, GLYPH, clickable } from "./look.js";
import { colors } from "./theme.js";

export const PICKED = "bot-herdr.picked";
export const REFRESH = "bot-herdr.pick-refresh";

/** Opens the list under the element whose bounds (from a mouse-down event) are given. */
export function openPick({ key, options, selected, bounds, minWidth = 220, header = null, error = null, loading = false, refreshable = false, searchable = false, efforts = null, typed = null }) {
  const zoom = Number(settings().zoom) || 1;
  const rows = loading ? 1 : options.reduce((n, o) => n + (o.heading ? CONTROL : ROW + HAIR), 0);
  const top = (header ? ROW : 0) + (error ? ROW : 0) + (searchable ? CONTROL + SPACE[2] : 0) + (efforts?.options?.length ? CONTROL + CHIP + SPACE[3] : 0);
  const height = Math.min(searchable ? 440 : 340, 10 + top + rows);
  const width = Math.max(minWidth, (bounds?.width ?? minWidth * zoom) / zoom);
  return openOverlay({
    mod: "bot-herdr",
    kind: "popup",
    frame: "none",
    width,
    height,
    ...(bounds ? { at: { x: bounds.x, y: bounds.y + bounds.height + SPACE[2] } } : {}),
    props: { view: "pick", key, options, selected, header, error, loading, refreshable, searchable, efforts, typed },
  });
}

/**
 * A harness's mark: its icon on its tile, as herdr draws it (programs.json), or its first letter
 * where it has no icon. `k` is a knownAgents() entry.
 */
export function harnessMark(c, k, size = GLYPH.lg) {
  const tile = k?.tile ?? null;
  const ink = k?.color ?? (tile ? "#ffffff" : c.muted);
  const box = div().flex_none().size(size).flex().items_center().justify_center().rounded(Math.max(2, Math.round(size / 4)))
    .when(Boolean(tile), (el) => el.bg(tile));
  if (k?.icon) {
    // herdr's rule (programs.json): `tint: true` is a one-colour glyph, drawn in `color` on the
    // tile or in the text colour; anything else is a picture, drawn in its own colours. svg()
    // always draws one colour, so a picture (Claude Code's, say) goes through image().
    const inner = tile ? Math.round(size * 0.72) : size;
    return box.child(k.tint === true
      ? svg(k.icon).size(inner).text_color(tile ? ink : c.ink)
      : image(k.icon).size(inner));
  }
  return box.when(!tile, (el) => el.bg(c.well)).text_size(Math.round(size * 0.6)).font_semibold().text_color(tile ? ink : c.muted)
    .child(String(k?.name ?? k?.key ?? "?").charAt(0).toUpperCase());
}

export class Pick {
  init(given, cx) {
    this.p = given ?? props() ?? {};
    this.effort = this.p.efforts?.selected ?? null;
    if (this.p.searchable) {
      this.search = InputState.new({ placeholder: "Search models" });
      this.search.on("change", (_e, cx) => cx.notify());
      // Enter takes the first match.
      this.search.on("submit", () => {
        const first = this.shown().find((o) => !o.heading);
        if (first) this.choose(first.value);
      });
      // Focused once the popup is on screen: asking from init, before its first frame, does nothing.
      cx?.timer.after(16, (cx) => {
        this.search.focus();
        cx.notify();
      });
    }
  }

  /** The options the search leaves: matching rows, and the headings over them. */
  shown() {
    const options = this.p.options ?? [];
    const query = (this.search?.value() ?? "").trim();
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return options;
    // What was typed can be used as it is: a model id the lists don't name, for each harness the
    // opener offers (`typed`: [{ prefix, label, harness? }]).
    const own = (this.p.typed ?? []).filter(() => !/\s/.test(query) && !options.some((o) => !o.heading && String(o.value).endsWith(`|${query}`)))
      .map((t) => ({ value: `${t.prefix}${query}`, label: query, note: `on ${t.label}`, harness: t.harness ?? null }));
    const out = [];
    let heading = null;
    for (const o of options) {
      if (o.heading) {
        heading = o;
        continue;
      }
      const hay = `${o.label ?? ""} ${o.note ?? ""} ${o.value ?? ""} ${o.harness?.name ?? ""} ${heading?.heading ?? ""}`.toLowerCase();
      if (!words.every((w) => hay.includes(w))) continue;
      if (heading) {
        out.push(heading);
        heading = null;
      }
      out.push(o);
    }
    if (own.length) out.push({ heading: "Use this model id" }, ...own);
    return out;
  }

  /** An effort picked in the row on top: posted for the opener; the list stays open. */
  chooseEffort(value, cx) {
    this.effort = value;
    setShared(PICKED, { key: this.p.efforts.key, value, at: Date.now() });
    cx?.notify();
  }

  choose(value) {
    setShared(PICKED, { key: this.p.key, value, at: Date.now() });
    closeOverlay(props()?.overlay ?? this.p.overlay);
  }

  /** Ask the opener for a fresh list: it reopens this popup when it has one. */
  refresh() {
    setShared(REFRESH, { key: this.p.key, at: Date.now() });
    closeOverlay(props()?.overlay ?? this.p.overlay);
  }

  render() {
    const c = colors();
    const options = this.shown();
    const efforts = this.p.efforts?.options ?? [];
    // Search and effort stay put on top; the list under them scrolls.
    const list = v_flex()
      .id("bh-pick-list")
      .flex_1()
      .min_h(0)
      .gap(SPACE[1])
      .overflow_y_scroll();
    return v_flex()
      .id("bh-pick")
      .size_full()
      .p(SPACE[2])
      .gap(SPACE[1])
      .rounded(SIZE.control)
      .bg(c.fill)
      .border_1()
      .border_color(c.edge)
      .text_color(c.ink)
      .when(Boolean(this.search), (el) => el.child(
        h_flex()
          .flex_none()
          .h(CONTROL)
          .mb(SPACE[2])
          .px(SPACE[3])
          .gap(SPACE[2])
          .items_center()
          .rounded(SIZE.nested)
          .bg(c.ground)
          .border_1()
          .border_color(c.edge)
          .child(svg(ICON("search")).flex_none().size(GLYPH.sm).text_color(c.faint))
          .child(div().flex_1().min_w(0).h_full().child(Input.new(this.search).w_full().h_full().text_size(TYPE.md).text_color(c.ink))),
      ))
      .when(efforts.length > 0, (el) => el.child(
        v_flex()
          .flex_none()
          .px(SPACE[3])
          .pb(SPACE[2])
          .gap(SPACE[2])
          .child(div().text_size(TYPE.xs).font_medium().text_color(c.muted).child(this.p.efforts.label ?? "Effort"))
          .child(h_flex().gap(SPACE[2]).flex_wrap().children(efforts.map((e, i) => {
            const on = e.value === (this.effort ?? "");
            return clickable(
              div()
                .h(CHIP)
                .px(SPACE[3])
                .flex()
                .items_center()
                .rounded(SIZE.nested)
                .border_1()
                .border_color(on ? c.accent : c.edge)
                .when(on, (x) => x.bg(c.well))
                .text_size(TYPE.sm)
                .text_color(on ? c.ink : c.muted)
                .on_click((_ev, cx) => this.chooseEffort(e.value, cx))
                .child(e.label),
              c,
              `bh-pick-effort-${i}`,
            );
          }))),
      ))
      .when(Boolean(this.p.header), (el) => el.child(
        h_flex()
          .flex_none()
          .h(ROW)
          .px(SPACE[3])
          .gap(SPACE[3])
          .items_center()
          .child(div().flex_1().min_w(0).truncate().text_size(TYPE.xs).font_medium().text_color(c.muted).child(this.p.header))
          .when(this.p.refreshable, (el) => el.child(clickable(
            div()
              .size(CHIP)
              .flex_none()
              .flex()
              .items_center()
              .justify_center()
              .rounded(SIZE.nested)
              .text_color(c.muted)
              .on_click(() => this.refresh())
              .child(svg(ICON("refresh-cw")).size(GLYPH.sm)),
            c,
            "bh-pick-refresh",
          ))),
      ))
      .when(Boolean(this.p.error), (el) => el.child(
        div().flex_none().px(SPACE[3]).pb(SPACE[2]).text_size(TYPE.xs).text_color(c.faint).child(this.p.error),
      ))
      .when(this.p.loading, (el) => el.child(
        h_flex()
          .flex_none()
          .h(ROW)
          .px(SPACE[3])
          .gap(SPACE[3])
          .items_center()
          .child(div().size(DOT).rounded_full().bg(c.accent).opacity(0.5).loop("opacity", { from: 0.25, to: 1, period: 1200, easing: "ease-in-out" }))
          .child(div().text_size(TYPE.md).text_color(c.muted).child("Asking the harness…")),
      ))
      .when(!this.p.loading && Boolean(this.search) && !options.length, (el) => el.child(
        div().flex_none().h(ROW).px(SPACE[3]).flex().items_center().text_size(TYPE.md).text_color(c.muted).child("No model matches."),
      ))
      .when(!this.p.loading, (el) => el.child(list.children(options.map((o, i) => {
        if (o.heading) return div().flex_none().h(CONTROL).px(SPACE[3]).text_size(TYPE.xs).text_color(c.faint).child(o.heading);
        const on = o.value === this.p.selected;
        return clickable(
          h_flex()
            .flex_none()
            .h(ROW)
            .px(SPACE[3])
            .gap(SPACE[3])
            .items_center()
            .rounded(SIZE.nested)
            .when(on, (el) => el.bg(c.well))
            .on_click(() => this.choose(o.value))
            .when(Boolean(o.harness), (el) => el.child(harnessMark(c, o.harness, GLYPH.md)))
            .child(div().flex_1().min_w(0).truncate().text_size(TYPE.md).child(o.label))
            .when(Boolean(o.note), (el) => el.child(div().flex_none().max_w(140).truncate().text_size(TYPE.xs).text_color(c.faint).child(o.note)))
            .when(on, (el) => el.child(svg(ICON("check")).size(GLYPH.md).text_color(c.accent))),
          c,
          `bh-pick-${i}`,
        );
      }))));
  }
}
