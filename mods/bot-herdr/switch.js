// The switch in the top bar: Chat (every agent in one place), Terminals (herdr's own panes, to
// work in an agent's CLI directly) and Settings. Picking a tab or an agent anywhere in herdr
// shows the Terminals page, so the terminal you asked for is never hidden behind the chat.
//
// This file also carries the shell pieces every page shares: the segmented control and the one
// empty/loading state.

import { div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { focused, shared, theme, nextCommand, window as herdrWindow, run, setShared } from "herdr";
import { SIZE, TYPE, TYPE_SCALE, LINE, SPACE, CONTROL, CHIP, DOT, GLYPH, ICON, clickable, looping } from "./look.js";
import { actionButton } from "./button.js";
import { colors } from "./theme.js";
import { PAGES, HOLD, activePage, showPage } from "./pages.js";
import { OPEN_COUNTS } from "./signals.js";
import { alpha, breatheFor } from "./working.js";
import { KEYMAP_OPEN } from "./keymap.js";
import { bhJson, projectDir } from "./bh.js";

const HOLD_MS = 3000;
/** herdr's own tabs (mods/tabs) are 29px tall; the page switch's tabs match them. */
const HERDR_TAB = 29;

/**
 * The two selection idioms, one per control type (the spec's Tabs and selection rule): tabs pick
 * a view, so the picked label is in the accent over a 2px accent underline, with no track or fill;
 * a segmented choice (`choice: true`) picks a value, so it keeps its grey track and the picked item
 * is filled grey, with no underline. Nothing is outlined all round or pill-shaped to mean "chosen".
 *
 * The one strip control: a page's sub-tabs, a task's tab strip; with `choice`, a setting's value.
 * `items` is [{ id, label, on, count }]; `onPick(id, cx)` receives the picked one. `bar` styles the
 * strip itself before its items are added: the page switch hands it the top bar's own styles, so
 * its tabs sit straight on the bar instead of on a second grey track inside a second frame.
 * `padX` narrows every item's padding together, so a strip can fit any window.
 */
export function segmented(c, { id, items, onPick, grow = false, height = null, padX = SPACE[4], bar = null, choice = false }) {
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
    .when(!bar && choice, (el) => el.rounded(SIZE.control).bg(c.well))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    // A tab list's own keys while one of its tabs holds the keyboard: the arrows, Home and End
    // pick the neighbouring, first or last tab (the tabs themselves are tab stops).
    .on_key_down((e, cx) => {
      const next = tabStep(e?.key, items.findIndex((item) => item.on), items.length);
      if (next < 0) return;
      cx.stop_propagation();
      onPick(items[next].id, cx);
    })
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
          // A tab's underline keeps its 2px on every item, transparent until it is the picked one,
          // so nothing moves when the pick changes. A choice fills its picked item grey instead.
          .when(!choice && item.on, (el) => el.border_b(2).border_color(c.accent).text_color(c.accent))
          .when(!choice && !item.on, (el) => el.border_b(2).border_color(alpha(c.accent, 0)))
          .when(choice && item.on, (el) => el.bg(c.fill).text_color(c.textPrimary))
          .when(!item.on, (el) => el.text_color(c.textSecondary).hover((s) => s.text_color(c.textPrimary)))
          .on_click((_e, cx) => onPick(item.id, cx))
          // An item that opens something under itself learns where it is on the press.
          .when(Boolean(item.onDown), (el) => el.on_mouse_down("left", (e, cx) => item.onDown(e, cx)))
          // An icon before the label, in the label's colour; the label is always there.
          .when(Boolean(item.icon), (el) => el.child(svg(ICON(item.icon)).flex_none().size(GLYPH.sm)))
          .child(item.label)
          .when(item.count != null, (el) => el.child(div().text_size(TYPE_SCALE.metadata).font_semibold().text_color(item.on && !choice ? c.accent : c.textMuted).child(String(item.count)))),
        c,
        `${id}-${item.id}`,
        { edge: true },
      )));
}

/** The tab a tab list's arrow key picks from `at` among `n` (wrapping), or -1 for any other key. */
export function tabStep(key, at, n) {
  if (!(n > 0)) return -1;
  const k = String(key ?? "").toLowerCase();
  const from = at < 0 ? 0 : at;
  if (k === "right" || k === "arrow-right") return (from + 1) % n;
  if (k === "left" || k === "arrow-left") return (from - 1 + n) % n;
  if (k === "home") return 0;
  if (k === "end") return n - 1;
  return -1;
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
    .when(pulse, (x) => x.child(looping(div().size(DOT).rounded_full().bg(tone), "opacity", { from: 0.35, to: 1, period: 1400, easing: "ease-in-out" })))
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
    { edge: true, fill: c.hover },
  );
}

/** An agent's avatar: its initial on a wash of its colour, ringed in it. */
export function avatar(c, name, tone, size = 28, { working = false } = {}) {
  const initial = String(name ?? "?").replace(/^@/, "").charAt(0).toUpperCase() || "?";
  const breathe = breatheFor(working);
  const el = div()
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
  // It breathes (opacity 0.7 to 1.0) only while its agent works; still under Reduce motion.
  return breathe ? looping(el, "opacity", breathe) : el;
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
        .child(looping(div()
          .size(DOT)
          .rounded_full()
          .bg(c.accent)
          .opacity(0.5), "opacity", { from: 0.25, to: 1, period: 1200, easing: "ease-in-out" }))
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
    // ctrl+shift+m (keys.json: "bot-herdr.focus") opens Threads and puts the keyboard in it;
    // ? opens the map on any page; ctrl+. pauses or resumes the current goal.
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (command === "focus" || command === "chat") showPage("chat");
        else if (command === "map") setShared(KEYMAP_OPEN, true);
        else if (command === "goal") this.goal(cx);
        else if (PAGES.some((p) => p.id === command)) showPage(command);
        else {
          // herdr's own tab.select:N (keys.json: ctrl-1..ctrl-5) picks the five layout tabs,
          // which are the five destinations: Home, Threads, Agents, Library and Settings.
          const tab = /^tab\.select:(\d+)$/.exec(String(command ?? ""));
          if (tab) showPage(PAGES[Math.max(0, Number(tab[1]) - 1)]?.id ?? "home");
        }
        cx.notify();
      }
    });
  }

  /** Ctrl+.: pause or resume the in-flight goal (the fleet's goals from `bh home`). */
  async goal(cx) {
    const got = await bhJson(["home"], { cwd: projectDir() });
    const g = (got?.fleet?.goals ?? []).find((x) => x?.task && !x.stopped && x.state !== "reached" && x.state !== "done");
    if (!g) return;
    const resume = Boolean(g.paused || g.state === "paused");
    cx.spawn(async (cx) => {
      await bhJson(["goal", resume ? "resume" : "pause", g.task, "--json"], { cwd: projectDir() });
      cx.notify();
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
        .children(tabs.map((p, i) => pageTab(c, { ...p, i, n: PAGES.length, height: HERDR_TAB, on: p.id === active, count: countOf(p.id), pulse: p.id === "home", onClick: () => showPage(p.id) })))
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
function pageTab(c, { id, label = null, icon = null, on, count = null, i = 0, n = 1, height = HERDR_TAB, padX = SPACE[4], a11y = null, pulse = false, onClick }) {
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
      // The Home tab's badge pulses while needs-you exists on the app; under Reduce motion
      // `looping` rests it at full opacity instead of fading.
      .when(pulse && count != null, (el) => el.child(looping(div().text_size(TYPE_SCALE.metadata).font_semibold().text_color(on ? c.accent : c.textMuted).child(String(count)), "opacity", { from: 0.35, to: 1, period: 1400, easing: "ease-in-out" })))
      .when(!pulse && count != null, (el) => el.child(div().text_size(TYPE_SCALE.metadata).font_semibold().text_color(on ? c.accent : c.textMuted).child(String(count)))),
    c,
    `bh-pages-${id}`, { edge: true },
  );
}
