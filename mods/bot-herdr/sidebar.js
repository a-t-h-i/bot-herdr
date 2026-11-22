// The sidebar: the one place you go from. The pages first (Chat, Home, Agents, Terminals,
// Library), then your threads, what needs you on top, then Settings at the foot. Thin one-line
// rows; the open place is filled grey. A thread's name is coloured by its state, and under the
// pointer it offers Close and Delete. Narrowed to the rail (herdr's collapse button, or dragging
// it under 160px), only the page icons stay, each with its name as a tooltip.

import { div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents as reported, layout, theme, shared } from "herdr";
import { SIZE, TYPE_SCALE, SPACE, GLYPH, ICON, STATE, threadTone, clickable } from "./look.js";
import { actionButton } from "./button.js";
import { colors } from "./theme.js";
import { find, shownPlace, showPage, openThread, THREAD_SHOWN } from "./pages.js";
import { bh, bhJson, projectDir } from "./bh.js";
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
    this.hovered = null; // the thread row under the pointer: it shows Close and Delete
    this.armed = null; // the thread whose Delete was clicked once
    this.ending = null; // the thread being closed or deleted
    this.problem = null; // why the last close or delete failed, for a few seconds
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
          .when(Boolean(this.problem), (el) => el.child(div().px(SPACE[3]).pb(SPACE[1]).text_size(TYPE_SCALE.metadata).text_color(c.danger).child(this.problem)))
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

  /** Closes (archives) or deletes a thread's task or plan; the list reads again either way. */
  end(r, verb, cx) {
    if (this.ending) return;
    this.ending = r.id;
    this.armed = null;
    this.problem = null;
    cx.notify();
    cx.spawn(async (cx) => {
      const got = await bh([r.kind === "plan" || r.id.startsWith("p-") ? "plan" : "task", verb, r.id], { cwd: projectDir() });
      this.ending = null;
      if (got.code === 0) {
        if (shared(THREAD_SHOWN) === r.id) openThread(null);
      } else {
        this.problem = String(got.stderr || got.stdout || `Could not ${verb === "delete" ? "delete" : "close"} it.`).trim().split("\n")[0].replace(/^bh: /, "");
        cx.timer.after(6000, (cx) => {
          this.problem = null;
          cx.notify();
        });
      }
      this.busy = false;
      this.load(cx);
    });
  }

  /**
   * A thread: its title in its state's colour (no glyph before it) and how long ago it moved.
   * Under the pointer the age gives way to Close and Delete; Delete asks once more first.
   */
  threadRow(c, r, on) {
    const s = STATE[r.state] ?? STATE.idle;
    const hovered = this.hovered === r.id;
    const sure = this.armed === r.id;
    const showTools = hovered || sure;
    const stop = (_e, cx) => cx.stop_propagation();
    const tool = (id, icon, tip, tone, run) => actionButton(c, id, null, (_e, cx) => {
      cx.stop_propagation();
      run(cx);
    }, { icon, tone, tooltip: tip, a11y: tip }).on_mouse_down("left", stop);
    const el = h_flex()
      .role("link")
      .accessibility_label(`${s.word}: ${r.title}`)
      .aria_selected(on)
      .w_full()
      .h(ROW_H)
      .pl(SPACE[3])
      .pr(showTools ? 0 : SPACE[3])
      .gap(SPACE[2])
      .items_center()
      .rounded(SIZE.nested)
      .text_size(TYPE_SCALE.body)
      .when(on, (x) => x.bg(c.bubble).font_medium())
      .on_hover((over, cx) => {
        const next = over ? r.id : this.hovered === r.id ? null : this.hovered;
        if (next === this.hovered) return;
        this.hovered = next;
        if (!over && this.armed === r.id) this.armed = null;
        cx.notify();
      })
      .on_mouse_down("left", stop)
      .on_click(() => openThread(r.id))
      .child(div().flex_1().min_w(0).truncate().text_color(threadTone(c, r.state)).opacity(this.ending === r.id ? 0.5 : 1).child(r.title))
      .when(!showTools && Boolean(r.age), (x) => x.child(div().flex_none().text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child(r.age)))
      .when(showTools && !sure, (x) => x
        .child(tool(`bh-side-close-${r.id}`, "archive", "Close: it leaves the list, its files stay", "quiet", (cx) => this.end(r, "archive", cx)))
        .child(tool(`bh-side-delete-${r.id}`, "trash", "Delete this thread and its records", "quiet", (cx) => {
          this.armed = r.id;
          cx.notify();
        })))
      .when(sure, (x) => x.child(actionButton(c, `bh-side-delete-sure-${r.id}`, "Delete?", (_e, cx) => {
        cx.stop_propagation();
        this.end(r, "delete", cx);
      }, { tone: "danger", tooltip: "Click again to delete it for good" }).on_mouse_down("left", stop)));
    return clickable(el, c, `bh-side-thread-${r.id}`, { edge: true, fill: on ? c.bubble : c.hover });
  }
}
