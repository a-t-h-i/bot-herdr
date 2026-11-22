// The switch in the top bar: Chat (every agent in one place), Terminals (herdr's own panes, to
// work in an agent's CLI directly) and Settings. Picking a tab or an agent anywhere in herdr
// shows the Terminals page, so the terminal you asked for is never hidden behind the chat.
//
// This file also carries the shell pieces every page shares: the segmented control and the one
// empty/loading state.

import { div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { focused, shared, theme, nextCommand, window as herdrWindow, run } from "herdr";
import { SIZE, TYPE, TYPE_SCALE, LINE, SPACE, CONTROL, CHIP, DOT, GLYPH, ICON, clickable } from "./look.js";
import { actionButton } from "./button.js";
import { colors } from "./theme.js";
import { PAGES, HOLD, activePage, showPage } from "./pages.js";
import { OPEN_COUNTS } from "./signals.js";
import { alpha } from "./working.js";

const HOLD_MS = 3000;
/** herdr's own tabs (mods/tabs) are 29px tall; the page switch's tabs match them. */
const HERDR_TAB = 29;

/**
 * The one selection style, app-wide: the picked item's label in the accent over a 2px accent
 * underline. Nothing is filled, outlined all round or pill-shaped to mean "chosen" (Principle 2
 * and the spec's Tabs and selection rule). A segmented control keeps its grey track, so a group
 * of choices reads as one control.
 *
 * The one segmented control: the page switch, a task's tab strip, a plan's list choice, a setting.
 * `items` is [{ id, label, on, count }]; `onPick(id, cx)` receives the picked one. `bar` styles the
 * strip itself before its items are added: the page switch hands it the top bar's own styles, so
 * its tabs sit straight on the bar instead of on a second grey track inside a second frame.
 * `padX` narrows every item's padding together, so a strip can fit any window.
 */
export function segmented(c, { id, items, onPick, grow = false, height = null, padX = SPACE[4], bar = null }) {
  // The track insets its items by 2px on every side, so the picked one sits centred in it.
  // `height` is the items' own (the page switch matches herdr's 29px tabs); by default the track
  // is a control's height. The 2px inset is optical, the one step off the 4px grid.
  const itemH = height ?? CONTROL - SPACE[1] * 2;
  return h_flex()
    .id(id)
    .role("tab_list")
    .p(SPACE[1])
    .gap(SPACE[1])
    .items_center()
    .when(grow, (el) => el.flex_1())
    .when(Boolean(bar), (el) => bar(el))
    .when(!bar, (el) => el.rounded(SIZE.control).bg(c.well))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .children(items.map((item, i) =>
      clickable(
        div()
          .role("tab")
          .set_position(i + 1, items.length)
          .aria_selected(Boolean(item.on))
          .h(itemH)
          .px(padX)
          .flex()
          .items_center()
          .gap(SPACE[2])
          .rounded(SIZE.nested)
          .text_size(TYPE_SCALE.metadata)
          .font_medium()
          .when(item.grow, (el) => el.flex_1().justify_center())
          // The underline keeps its 2px on every item, transparent until it is the picked one,
          // so nothing moves when the pick changes.
          .when(item.on, (el) => el.border_b(2).border_color(c.accent).text_color(c.accent))
          .when(!item.on, (el) => el.border_b(2).border_color(alpha(c.accent, 0)).text_color(c.textSecondary).hover((s) => s.text_color(c.textPrimary)))
          .on_click((_e, cx) => onPick(item.id, cx))
          // An item that opens something under itself learns where it is on the press.
          .when(Boolean(item.onDown), (el) => el.on_mouse_down("left", (e, cx) => item.onDown(e, cx)))
          // An icon before the label, in the label's colour; the label is always there.
          .when(Boolean(item.icon), (el) => el.child(svg(ICON(item.icon)).flex_none().size(GLYPH.sm)))
          .child(item.label)
          .when(item.count != null, (el) => el.child(div().text_size(TYPE_SCALE.metadata).font_semibold().text_color(item.on ? c.accent : c.textMuted).child(String(item.count)))),
        c,
        `${id}-${item.id}`,
      )));
}

/**
 * A state or status word in its tone: the state's glyph carries the colour and the word names it,
 * with no chip, wash or pill (Principle 5: colour means identity or state, never decoration).
 * `pulse` adds a live dot (a running agent, a plan being worked on).
 */
export function pill(c, label, tone, { pulse = false, id = null } = {}) {
  const el = h_flex()
    .flex_none()
    .h(LINE.md)
    .gap(SPACE[2])
    .items_center()
    .text_size(TYPE_SCALE.metadata)
    .font_medium()
    .text_color(tone)
    .when(pulse, (x) => x.child(div().size(DOT).rounded_full().bg(tone).loop("opacity", { from: 0.35, to: 1, period: 1400, easing: "ease-in-out" })))
    .child(label);
  return id ? el.id(id) : el;
}

/** Whether a filter has anything behind it, or is the one being shown: only then is its chip drawn. */
export const chipHasResults = (count, on = false) => Boolean(on) || Number(count) > 0;

/**
 * A filter chip: its label and, when there are any, how many match. Nothing empty is drawn
 * (Principle 3), so a chip with a zero count never appears and a count only reads above zero.
 * Chosen, it takes the app's one selection style: accent text over a 2px accent underline.
 */
export function filterChip(c, { id, label, count = null, on = false, onClick }) {
  const n = Number(count);
  const text = Number.isFinite(n) && n > 0 ? `${label} · ${n}` : label;
  return clickable(
    h_flex()
      .role("tab")
      .aria_selected(on)
      .flex_none()
      .h(CHIP)
      .px(SPACE[2])
      .gap(SPACE[1])
      .items_center()
      .rounded(SIZE.nested)
      .text_size(TYPE_SCALE.metadata)
      .font_medium()
      .when(on, (el) => el.border_b(2).border_color(c.accent).text_color(c.accent))
      .when(!on, (el) => el.border_b(2).border_color(alpha(c.accent, 0)).text_color(c.textSecondary).hover((s) => s.text_color(c.textPrimary)))
      .on_click(onClick)
      .child(text),
    c,
    id,
    { fill: c.hover },
  );
}

/** An agent's avatar: its initial on a wash of its colour, ringed in it. */
export function avatar(c, name, tone, size = 28) {
  const initial = String(name ?? "?").replace(/^@/, "").charAt(0).toUpperCase() || "?";
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
    .text_size(Math.round(size * 0.46))
    .font_semibold()
    .text_color(tone)
    .child(initial);
}

/** A section's heading: its icon on a tinted tile, the title, and a line about it under. */
export function sectionHead(c, icon, title, about = null, tone = null) {
  const t = tone ?? c.accent;
  return h_flex()
    .gap(SPACE[4])
    .items_start()
    .child(div()
      .flex_none()
      .size(36)
      .rounded(SIZE.control)
      .flex()
      .items_center()
      .justify_center()
      .bg(alpha(t, 0.12))
      .border_1()
      .border_color(alpha(t, 0.25))
      .text_color(t)
      .child(svg(ICON(icon)).size(GLYPH.lg)))
    .child(v_flex()
      .flex_1()
      .min_w(0)
      .gap(SPACE[1])
      .child(div().text_size(TYPE.xl).font_semibold().text_color(c.ink).child(title))
      .when(Boolean(about), (el) => el.child(div().text_size(TYPE.md).line_height(`${LINE.md}px`).text_color(c.muted).child(about))));
}

/**
 * The one empty, loading and error panel: a title, one line and an optional action.
 * Loading adds the quiet pulse; an error passes the retry as its action.
 */
export function stateView(c, { id, title, line = null, action = null, loading = false }) {
  // Centred in whatever holds it, its wrapped lines centred too. The title needs a row only when a
  // working dot sits before it.
  const heading = div().text_center().text_size(TYPE_SCALE.title).font_semibold().text_color(c.textPrimary).child(title);
  return v_flex()
    .id(id ?? "bh-state")
    .self_center()
    .items_center()
    .gap(SPACE[3])
    .py(SPACE[5])
    .max_w(460)
    .child(loading
      ? h_flex()
        .gap(SPACE[3])
        .items_center()
        .child(div()
          .size(DOT)
          .rounded_full()
          .bg(c.accent)
          .opacity(0.5)
          .loop("opacity", { from: 0.25, to: 1, period: 1200, easing: "ease-in-out" }))
        .child(heading)
      : heading)
    .when(Boolean(line), (el) => el.child(
      div().text_center().text_size(TYPE_SCALE.body).line_height(`${LINE.md}px`).text_color(c.textSecondary).child(line),
    ))
    .when(Boolean(action), (el) => el.child(
      actionButton(c, `${id ?? "bh-state"}-action`, action.label, action.on, { tone: "secondary" }),
    ));
}

export class Switch {
  init(_props, cx) {
    this.where = null;
    // ctrl+shift+m (keys.json: "bot-herdr.focus") opens Threads and puts the keyboard in it.
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (command === "focus" || command === "chat") showPage("threads");
        else if (PAGES.some((p) => p.id === command)) showPage(command);
        cx.notify();
      }
    });
  }

  /** A tab, space or agent was picked outside Threads: show herdr's terminals (Agents › Terminals). */
  follow(cx) {
    const f = focused();
    const where = f ? `${f.space}:${f.tab}` : null;
    const before = this.where;
    this.where = where;
    if (before === null || where === null || where === before) return;
    if (activePage() !== "threads") return;
    if (Date.now() - Number(shared(HOLD) ?? 0) < HOLD_MS) return;
    cx.timer.after(1, () => showPage("terminals"));
  }

  render(cx) {
    this.follow(cx);
    const c = colors();
    const t = /** @type {Record<string, import("gpui-kit").Color>} */ (theme());
    const active = activePage();
    // A destination's open-question count, so a question is never missed from another page. A
    // question is about a plan or a chat, and both are the same thread now.
    const counts = /** @type {Record<string, number> | null} */ (shared(OPEN_COUNTS)) ?? {};
    const countOf = (id) => {
      const n = id === "threads" ? (Number(counts.chat) || 0) + (Number(counts.plans) || 0) : Number(counts[id]);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const tabs = PAGES.filter((p) => !p.gear);
    const gear = PAGES.find((p) => p.gear) ?? PAGES[PAGES.length - 1];
    return h_flex()
      .id("bh-pages")
      .size_full()
      .items_center()
      .p(SPACE[1])
      .gap(SPACE[1])
      .overflow_hidden()
      .pl(SPACE[4])
      .bg(t.chrome)
      .border_b(1)
      .border_color(t.border)
      // One bar, not a bar holding a second bar: the tabs sit straight on herdr's top bar, and the
      // picked one is underlined (the app's one selection style). The gear ends the row.
      .child(h_flex()
        .role("tab_list")
        .flex_1()
        .min_w(0)
        .items_center()
        .gap(SPACE[1])
        .children(tabs.map((p, i) => pageTab(c, { ...p, i, n: PAGES.length, height: HERDR_TAB, on: p.id === active, count: countOf(p.id), onClick: () => showPage(p.id) })))
        .child(div().flex_1())
        .child(pageTab(c, { ...gear, label: null, i: PAGES.length - 1, n: PAGES.length, height: HERDR_TAB, on: gear.id === active, a11y: gear.label, padX: SPACE[3], onClick: () => showPage(gear.id) })))
      // The window's own buttons are controls, not destinations: outside the tab list, at the end.
      .when(Boolean(herdrWindow()?.buttons), (el) => el.child(windowButtons(c)));
  }
}

/**
 * The window's own buttons, where the system draws none (Linux and Windows; macOS keeps its traffic
 * lights over the rail). The bar that used to carry them, herdr's tab strip, is gone from this
 * layout, so minimizing, maximizing and closing stay in reach here rather than only in the palette.
 */
function windowButtons(c) {
  // A press on a button acts; it never starts dragging the window the bar sits on.
  const stop = (_e, cx) => cx.stop_propagation();
  const button = (id, icon, label, command) =>
    actionButton(c, id, null, () => run(command), { icon, tone: "quiet", tooltip: label, a11y: label }).on_mouse_down("left", stop);
  return h_flex()
    .flex_none()
    .items_center()
    .gap(SPACE[1])
    .child(button("bh-window-minimize", "window-minimize", "Minimize", "window.minimize"))
    .child(button("bh-window-maximize", "window-maximize", "Maximize", "window.maximize"))
    .child(button("bh-window-close", "x", "Close window", "window.close"));
}

/**
 * One top-bar destination: accent text over a 2px accent underline when it is the one showing,
 * with the same underline kept transparent otherwise so nothing moves when the pick changes
 * (Tabs and selection). An icon-only tab — the Settings gear — carries its name as its label.
 */
function pageTab(c, { id, label = null, icon = null, on, count = null, i = 0, n = 1, height = HERDR_TAB, padX = SPACE[4], a11y = null, onClick }) {
  return clickable(
    div()
      .role("tab")
      .set_position(i + 1, n)
      .aria_selected(Boolean(on))
      .h(height)
      .px(padX)
      .flex_none()
      .flex()
      .items_center()
      .gap(SPACE[2])
      .rounded(SIZE.nested)
      .text_size(TYPE_SCALE.metadata)
      .font_medium()
      .when(on, (el) => el.border_b(2).border_color(c.accent).text_color(c.accent))
      .when(!on, (el) => el.border_b(2).border_color(alpha(c.accent, 0)).text_color(c.textSecondary).hover((s) => s.text_color(c.textPrimary)))
      .when(Boolean(a11y), (el) => el.accessibility_label(a11y).tooltip(a11y))
      // A press on a tab picks it; it never starts dragging the window the bar sits on.
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(onClick)
      .when(Boolean(icon), (el) => el.child(svg(ICON(icon)).flex_none().size(GLYPH.sm)))
      .when(Boolean(label), (el) => el.child(label))
      .when(count != null, (el) => el.child(div().text_size(TYPE_SCALE.metadata).font_semibold().text_color(on ? c.accent : c.textMuted).child(String(count)))),
    c,
    `bh-pages-${id}`,
  );
}
