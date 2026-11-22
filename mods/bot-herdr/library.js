// Library: the team's Knowledge, its Learning guides, the shared Scripts it can run and the
// Issues browser — the four pages that used to be destinations of their own, behind one Library
// tab. The existing views are reused as they are; this file only draws the sub-tabs and hands the
// rest of the page to the chosen view. A view that throws draws its own fallback line, never the
// whole Library (renders never throw).

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { setShared } from "herdr";
import { SPACE, SIZE } from "./look.js";
import { segmented, stateView } from "./switch.js";
import { colors } from "./theme.js";
import { setSub, subOf, showPage } from "./pages.js";
import { KEYMAP_OPEN } from "./keymap.js";
import { appKeyAction } from "./rowkeys.js";
import { safeRender } from "./render-safe.js";
import { Work } from "./work.js";
import { Learning } from "./learning.js";
import { Issues } from "./issues.js";
import { Scripts } from "./scripts.js";

/** The four sub-tabs, in order: the team's knowledge, what it learned, its scripts, its issues. */
const SUBS = [
  { id: "knowledge", label: "Knowledge" },
  { id: "learning", label: "Learning" },
  { id: "scripts", label: "Scripts" },
  { id: "issues", label: "Issues" },
];
const SUB_IDS = SUBS.map((s) => s.id);
/** The widest content column each sub-tab draws (work pages 1140, Learning's list 860). */
const COLUMN = { knowledge: 1140, learning: 860, scripts: 1140, issues: 1140 };

const SUB_INPUTS = ["search", "declineReason", "knowSearch", "inline", "taskSearch", "newTaskInput", "comment", "idea"];

export class Library {
  init(given, cx) {
    // The sub-tab the destination remembers, else the one this block asks for, else Knowledge.
    this.sub = SUB_IDS.includes(given?.sub) ? given.sub : subOf("library") ?? "knowledge";
    this.published = this.sub; // the sub-tab this page last made shared, so it only follows others' changes
    this.handle = cx.focus_handle();
    this.typingCount = 0;
    setSub("library", this.sub);
    this.body = this.mount(this.sub, cx);
  }

  /** The chosen sub-tab's own view, initialised with the props it expects. */
  mount(sub, cx) {
    this.typingCount = 0;
    const view = sub === "learning" ? new Learning() : sub === "issues" ? new Issues() : sub === "scripts" ? new Scripts() : new Work();
    const props = sub === "knowledge" ? { view: "work", tab: "knowledge" } : {};
    try {
      view.init(props, cx);
      for (const field of SUB_INPUTS) {
        const input = view[field];
        if (typeof input?.on !== "function") continue;
        input.on("focus", () => { this.typingCount++; });
        input.on("blur", () => { this.typingCount = Math.max(0, this.typingCount - 1); });
      }
      return view;
    } catch (err) {
      report(sub, err);
      return null;
    }
  }

  /** View-local app keys: Ctrl+1..5 switch destinations, `?` opens the keymap when not typing. */
  keys(e, cx) {
    const typing = this.typingCount > 0 || Boolean(this.body && "editing" in this.body && this.body.editing);
    const app = appKeyAction(e, { typing });
    if (app?.kind === "page") {
      showPage(app.page);
      return cx.stop_propagation();
    }
    if (app?.kind === "keymap") {
      setShared(KEYMAP_OPEN, true);
      cx.stop_propagation();
      cx.notify();
    }
  }

  /** Picks a sub-tab: remembered on the destination, and its view built once. */
  pick(id, cx) {
    if (!SUB_IDS.includes(id) || id === this.sub) return;
    this.sub = id;
    this.published = id;
    setSub("library", id);
    this.body = this.mount(id, cx);
    cx.notify();
  }

  render(cx) {
    // A link elsewhere in the app (or the palette) can point Library at a sub-tab: follow it.
    const wanted = subOf("library");
    if (wanted && wanted !== this.published && SUB_IDS.includes(wanted)) {
      this.sub = wanted;
      this.published = wanted;
      this.body = this.mount(wanted, cx);
    }
    const c = colors();
    // The four views draw their own full page; the sub-tabs sit above them, always in reach.
    return v_flex()
      .id("bh-library")
      .size_full()
      .bg(c.ground)
      .items_center()
      .track_focus(this.handle)
      .on_key_down((e, cx) => this.keys(e, cx))
      .child(h_flex().flex_none().w(this.column()).items_center().pt(SPACE[3]).child(this.tabs(c)))
      .child(div().id("bh-library-body").relative().flex_1().w_full().min_h(0).child(this.bodyNode(cx)));
  }

  /** The sub-tab's own content column, so the strip lines up with what it sits above. */
  column() {
    const width = Number(this.body?.width) || 960;
    return Math.max(320, Math.min(COLUMN[this.sub] ?? 1140, width - SIZE.gutter * 2));
  }

  /** The body: the chosen view's node, or a quiet line when it could not draw. */
  bodyNode(cx) {
    const c = colors();
    if (!this.body) {
      return stateView(c, { id: `bh-library-${this.sub}-error`, title: "This view could not be drawn", line: "Pick another sub-tab and back to try it again." });
    }
    const { node, error } = safeRender(this.body, cx, { view: this.sub, onError: (rec) => report(rec.view, rec.message) });
    if (error) {
      return stateView(c, {
        id: `bh-library-${this.sub}-error`,
        title: "This view could not be drawn",
        line: error.detail,
        action: { label: "Try again", on: (_e, cx) => { this.body = this.mount(this.sub, cx); cx.notify(); } },
      });
    }
    return node;
  }

  /** The one segmented control: Knowledge | Learning | Scripts | Issues. */
  tabs(c) {
    return segmented(c, {
      id: "bh-library-tabs",
      items: SUBS.map((s) => ({ id: s.id, label: s.label, on: s.id === this.sub })),
      onPick: (id, cx) => this.pick(id, cx),
    });
  }
}

/** Logs a sub-view's failure once, never throwing while it does. */
function report(where, err) {
  try {
    console.error(`bot-herdr [render:${where}]: ${err instanceof Error ? err.message : String(err)}`);
  } catch {
    // Never throw while reporting.
  }
}
