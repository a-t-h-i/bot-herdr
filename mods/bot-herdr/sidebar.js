// The sidebar: the one place you go from. The pages first (Chat, Home, Agents, Terminals,
// Library), then your threads, what needs you on top, then Settings at the foot. Thin one-line
// rows; the open place is filled grey. Narrowed to the rail (herdr's collapse button, or dragging
// it under 160px), only the page icons stay, each with its name as a tooltip.

import { div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents as reported, layout, theme, shared } from "herdr";
import { SIZE, TYPE_SCALE, SPACE, GLYPH, ICON, STATE, stateTone, clickable } from "./look.js";
import { colors } from "./theme.js";
import { find, shownPlace, showPage, openThread, THREAD_SHOWN } from "./pages.js";
import { bhJson, projectDir } from "./bh.js";
import { threadRows, groupThreads, drawnOrder } from "./threadview.js";
import { OPEN_COUNTS, HOME_NEEDS } from "./signals.js";

const REFRESH_MS = 10000;
const ROW_H = 28;
/** How many threads the sidebar lists before "All threads" takes over. */
const SHOWN = 12;

/** The pages, in the order you reach for them. */
const PLACES = [
  { id: "chat", icon: "page-chat", label: "Chat" },
  { id: "home", icon: "page-home", label: "Home" },
  { id: "agents", icon: "users", label: "Agents" },
  { id: "terminals", icon: "page-terminals", label: "Terminals" },
  { id: "library", icon: "page-library", label: "Library" },
];

/** Whether herdr has the sidebar narrowed to its icon rail. */
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

export class Sidebar {
  init(_props, cx) {
    this.data = null;
    this.busy = false;
    this.load(cx);
    cx.timer.every(REFRESH_MS, (cx) => this.load(cx));
  }

  load(cx) {
    if (this.busy) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      const got = await bhJson(["thread", "list"], { cwd: projectDir() });
      this.busy = false;
      if (got) this.data = got;
      cx.notify();
    });
  }

  /** Threads in the order that matters: what needs you, then review, working, and the rest. */
  threads() {
    return drawnOrder(groupThreads(threadRows(this.data)));
  }

  /** How many things wait on you: Home's own count when it has one, else the threads that do. */
  needsYou(rows) {
    const counts = /** @type {Record<string, number> | null} */ (shared(OPEN_COUNTS)) ?? {};
    const home = Number(counts.home ?? /** @type {any} */ (shared(HOME_NEEDS))?.count) || 0;
    return Math.max(home, rows.filter((r) => r.state === "needsYou").length);
  }

  render(cx) {
    const c = colors();
    const t = /** @type {Record<string, any>} */ (theme());
    const rail = narrow();
    const place = shownPlace();
    const shownThread = shared(THREAD_SHOWN);
    const rows = this.threads();
    const working = reported().filter((a) => a?.status === "working").length;
    const badge = { home: this.needsYou(rows) || null, agents: working || null };
    const navRow = (p) => this.row(c, {
      id: `bh-side-${p.id}`,
      icon: p.icon,
      label: p.label,
      on: place === p.id,
      count: badge[p.id] ?? null,
      countTone: p.id === "home" ? c.stateNeedsYou : c.textMuted,
      rail,
      onClick: () => showPage(p.id),
    });
    return v_flex()
      .id("bh-sidebar")
      .size_full()
      .bg(t.chrome ?? c.ground)
      .text_color(c.textPrimary)
      .child(v_flex()
        .flex_none()
        .px(rail ? 0 : SPACE[3])
        .pt(SPACE[2])
        .gap(SPACE[1])
        .when(rail, (el) => el.items_center())
        .children(PLACES.map(navRow)))
      .child(rail
        ? div().flex_1()
        : v_flex()
          .id("bh-side-threads")
          .flex_1()
          .min_h(0)
          .overflow_y_scroll()
          .px(SPACE[3])
          .pt(SPACE[5])
          .pb(SPACE[3])
          .gap(SPACE[1])
          .child(div().px(SPACE[3]).pb(SPACE[1]).text_size(TYPE_SCALE.metadata).font_medium().text_color(c.textMuted).child("Threads"))
          .when(!rows.length, (el) => el.child(div().px(SPACE[3]).text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child(this.data ? "None yet. Ask in Chat for a task or a plan." : "Reading…")))
          .children(rows.slice(0, SHOWN).map((r) => this.threadRow(c, r, place === "threads" && shownThread === r.id)))
          .when(rows.length > 0, (el) => el.child(this.row(c, {
            id: "bh-side-all-threads",
            label: rows.length > SHOWN ? `All threads (${rows.length})` : "All threads",
            on: place === "threads" && !shownThread,
            quiet: true,
            onClick: () => openThread(null),
          }))))
      .child(v_flex()
        .flex_none()
        .px(rail ? 0 : SPACE[3])
        .py(SPACE[3])
        .border_t(1)
        .border_color(t.border ?? c.edge)
        .when(rail, (el) => el.items_center())
        .child(this.row(c, { id: "bh-side-settings", icon: "page-settings", label: "Settings", on: place === "settings", rail, onClick: () => showPage("settings") })));
  }

  /** One thin row: icon, label, an optional count at the end; filled grey when it is open. */
  row(c, { id, icon = null, label, on = false, count = null, countTone = null, rail = false, quiet = false, onClick }) {
    const el = h_flex()
      .role("link")
      .accessibility_label(label)
      .aria_selected(on)
      .h(ROW_H)
      .gap(SPACE[3])
      .items_center()
      .rounded(SIZE.nested)
      .text_size(TYPE_SCALE.body)
      .when(rail, (x) => x.relative().w(32).justify_center().tooltip(label))
      .when(!rail, (x) => x.w_full().px(SPACE[3]))
      .when(on, (x) => x.bg(c.bubble).text_color(c.textPrimary).font_medium())
      .when(!on, (x) => x.text_color(quiet ? c.textMuted : c.textSecondary).hover((s) => s.text_color(c.textPrimary)))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(onClick)
      .when(Boolean(icon), (x) => x.child(svg(ICON(icon)).flex_none().size(GLYPH.md)))
      .when(!rail, (x) => x.child(div().flex_1().min_w(0).truncate().child(label)))
      .when(!rail && count != null, (x) => x.child(div().flex_none().text_size(TYPE_SCALE.metadata).font_semibold().text_color(countTone ?? c.textMuted).child(String(count))))
      .when(rail && count != null, (x) => x.child(div().absolute().top(5).right(5).size(6).rounded_full().bg(countTone ?? c.accent)));
    return clickable(el, c, id, { edge: true, fill: on ? c.bubble : c.hover });
  }

  /** A thread: its state glyph in its tone, its title, and how long ago it moved. */
  threadRow(c, r, on) {
    const s = STATE[r.state] ?? STATE.idle;
    const el = h_flex()
      .role("link")
      .accessibility_label(`${s.word}: ${r.title}`)
      .aria_selected(on)
      .w_full()
      .h(ROW_H)
      .px(SPACE[3])
      .gap(SPACE[3])
      .items_center()
      .rounded(SIZE.nested)
      .text_size(TYPE_SCALE.body)
      .when(on, (x) => x.bg(c.bubble).text_color(c.textPrimary))
      .when(!on, (x) => x.text_color(c.textSecondary).hover((st) => st.text_color(c.textPrimary)))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(() => openThread(r.id))
      .child(div().flex_none().w(GLYPH.md).text_size(TYPE_SCALE.metadata).text_color(stateTone(c, r.state)).child(s.glyph))
      .child(div().flex_1().min_w(0).truncate().child(r.title))
      .when(Boolean(r.age), (x) => x.child(div().flex_none().text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child(r.age)));
    return clickable(el, c, `bh-side-thread-${r.id}`, { edge: true, fill: on ? c.bubble : c.hover });
  }
}
