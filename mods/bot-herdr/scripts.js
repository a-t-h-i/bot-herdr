// Scripts: the shared scripts the team can run again instead of re-doing a step (`bh scripts
// list`). One row per script: its name as the mono id it is, the line saying what it is for, and
// Copy for the command that runs it. A project's own scripts say so; the built-in ones are the
// quiet default and carry nothing. Every row's command is also reachable from the palette prompt.

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { settings } from "herdr";
import { SIZE, LINE, SPACE, CONTROL, TYPE_SCALE, RADIUS } from "./look.js";
import { stateView } from "./switch.js";
import { actionButton } from "./button.js";
import { colors } from "./theme.js";
import { showPage, viewShown } from "./pages.js";
import { bhJson, projectDir } from "./bh.js";

const REFRESH_MS = 30000;
const MAX = 1140; // the work pages' widest column
const GAP = SPACE[2];
const COPIED_MS = 1500;

/** The app's code face, or null when the setting cannot be read: a script's name is an id. */
function mono() {
  try {
    return settings()?.font_family || null;
  } catch {
    return null;
  }
}

/** A script's command, as the palette and the brief write it: `bh scripts run <name>`. */
const runCommand = (name) => `bh scripts run ${name}`;

/** The scripts a `bh scripts list --json` answer names, whatever shape it came in. */
function scriptList(data) {
  const list = Array.isArray(data) ? data : Array.isArray(data?.scripts) ? data.scripts : [];
  return list.filter((s) => s && typeof s.name === "string" && s.name);
}

export class Scripts {
  init(_given, cx) {
    this.data = null; // the last answer of bh scripts list
    this.loading = true;
    this.failed = false;
    this.busy = false;
    this.shown = false;
    this.width = 900;
    this.copied = null; // the row whose command was just copied, for the button's one word
    this.load(cx);
    cx.timer.every(REFRESH_MS, (cx) => {
      if (viewShown("scripts")) this.load(cx);
    });
  }

  /** Reads the scripts; a failed read keeps the last answer and says so. */
  load(cx) {
    if (this.busy) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      const got = await bhJson(["scripts", "list"], { cwd: projectDir() });
      this.busy = false;
      this.loading = false;
      this.failed = !got;
      if (got) this.data = got;
      cx.notify();
    });
  }

  render(cx) {
    const open = viewShown("scripts");
    if (open && !this.shown) cx.timer.after(1, (cx) => this.load(cx));
    this.shown = open;
    const c = colors();
    const content = Math.max(320, Math.min(MAX, this.width - SIZE.gutter * 2));
    return div()
      .id("bh-scripts")
      .relative()
      .size_full()
      .bg(c.ground)
      .text_color(c.textPrimary)
      .on_size_change((size, cx) => {
        // px with the app's zoom multiplied in; drawn sizes are without it.
        this.width = size.width / (Number(settings().zoom) || 1);
        cx.notify();
      })
      .child(v_flex()
        .id("bh-scripts-scroll")
        .absolute()
        .inset_0()
        .overflow_y_scroll()
        .items_center()
        .child(v_flex().flex_none().w(content).py(SPACE[5]).gap(GAP)
          .child(h_flex().items_center().gap(SPACE[3])
            .child(div().flex_1().min_w(0).text_size(TYPE_SCALE.title).font_semibold().text_color(c.textPrimary).child("Scripts"))
            .child(actionButton(c, "bh-scripts-refresh", null, (_e, cx) => this.load(cx), { icon: "refresh-cw", tone: "quiet", tooltip: "Refresh", a11y: "Refresh scripts" })))
          .child(this.body(c, content))));
  }

  /** The rows, their skeletons while reading, the error, or the teaching empty state. */
  body(c, content) {
    if (!this.data && this.failed) {
      return stateView(c, { id: "bh-scripts-error", title: "Couldn't read the scripts", line: "bh scripts did not answer. Try again, or check that bh is installed.", action: { label: "Try again", on: (_e, cx) => this.load(cx) } });
    }
    if (!this.data) return v_flex().gap(GAP).child(skeletonRow(c, content - SPACE[5])).child(skeletonRow(c, content * 0.7));
    const list = scriptList(this.data);
    if (!list.length) {
      return stateView(c, {
        id: "bh-scripts-empty",
        title: "No script yet.",
        line: "A step the team does twice can become a script every agent runs; it appears here.",
        action: { label: "Open Chat", on: () => showPage("chat") },
      });
    }
    return v_flex().w_full().gap(SPACE[1]).children(list.map((s) => this.row(c, s)));
  }

  /** One script: its name in mono, what it is for, where it came from, and Copy for its command. */
  row(c, s) {
    const copied = this.copied === s.name;
    const face = mono();
    const id = `bh-script-${s.name}`;
    return h_flex()
      .id(id)
      .w_full()
      .min_h(CONTROL + SPACE[4])
      .px(SPACE[3])
      .py(SPACE[2])
      .gap(SPACE[3])
      .items_center()
      .rounded(RADIUS.control)
      .hover((el) => el.bg(c.hover))
      .child(v_flex().flex_1().min_w(0).gap(SPACE[1])
        .child(div().truncate().text_size(TYPE_SCALE.body).text_color(c.textPrimary).when(Boolean(face), (el) => el.font_family(/** @type {string} */ (face))).child(s.name))
        .when(Boolean(s.purpose), (el) => el.child(div().truncate().text_size(TYPE_SCALE.metadata).line_height(`${LINE.md}px`).text_color(c.textSecondary).child(String(s.purpose)))))
      .when(s.source === "project", (el) => el.child(div().flex_none().text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child("project")))
      .child(actionButton(c, `${id}-copy`, copied ? "Copied" : "Copy", (_e, cx) => {
        cx.write_to_clipboard(runCommand(s.name));
        this.copied = s.name;
        cx.timer.after(COPIED_MS, (cx) => {
          if (this.copied !== s.name) return;
          this.copied = null;
          cx.notify();
        });
        cx.notify();
      }, { tone: "quiet" }));
  }
}

/** One skeleton row: the shape a script row will take, in the quiet surface, while it reads. */
function skeletonRow(c, wide) {
  return h_flex()
    .w_full()
    .px(SPACE[3])
    .py(SPACE[2])
    .gap(SPACE[3])
    .items_center()
    .child(div().w_full().max_w(wide).h(10).rounded(SPACE[1]).bg(c.well));
}
