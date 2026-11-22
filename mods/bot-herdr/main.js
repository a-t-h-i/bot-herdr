// bot-herdr: one mod, several views, picked by the layout block's props.
//   { "view": "switch" }    the top bar: Home, Threads, Agents, Library and the Settings gear (switch.js)
//   { "view": "home" }      what needs you, then the fleet and today's spend (home.js)
//   { "view": "threads" }   the thread list, and a thread's Conversation | Plan | Steps | Changes (threads.js)
//   { "view": "status" }    the status bar: machine, branch, agent count, palette key (statusbar.js)
//   { "view": "agents" }    Agents › Fleet, or (props.sub "terminals") the strip above herdr's panes (agents.js)
//   { "view": "library" }   Library › Knowledge | Learning | Scripts | Issues (library.js)
//   { "view": "scripts" }   Library › Scripts on its own
//   { "view": "chat" }      the Orchestrator's chat used on its own (chat.js)
//   { "view": "work", "tab": "tasks" | "plans" | "knowledge" }   the team's work (work.js)
//   { "view": "pick" }      a dropdown list, opened as a popup by Settings (pick.js)
//   { "view": "settings" }  the agents, run mode, resilience, harnesses and usage (settings.js)
//   { "view": "settings-more" }  a settings card's More, as a dialog (settings.js)
//   { "view": "lightbox" }  a picture opened large, as a dialog (lightbox.js)
//   { "view": "file" }      a file named in a message, opened read only, as a dialog (viewer.js)
//   { "view": "plan" }      a plan's draft opened in its own window (plandoc.js)
//   { "view": "note" }      a new knowledge note, as a dialog (noteform.js)
//   (no view)               herdr's notifications: the layout's "toast" mod (toast.js)

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, settings } from "herdr";
import { SIZE, TYPE, LINE, SPACE, palette } from "./look.js";
import { colors } from "./theme.js";
import { actionButton } from "./button.js";
import { safeInit, safeRender, formatRenderError, errorSignature } from "./render-safe.js";
import { Chat } from "./chat.js";
import { Switch } from "./switch.js";
import { Settings, MoreSheet } from "./settings.js";
import { Work } from "./work.js";
import { Pick } from "./pick.js";
import { Lightbox } from "./lightbox.js";
import { NoteForm } from "./noteform.js";
import { Toast, isNotification } from "./toast.js";
import { FileView } from "./viewer.js";
import { PlanDoc } from "./plandoc.js";
import { Metrics } from "./metrics.js";
import { Learning, LearningDoc } from "./learning.js";
import { Home } from "./home.js";
import { Threads } from "./threads.js";
import { Agents } from "./agents.js";
import { Library } from "./library.js";
import { Scripts } from "./scripts.js";
import Issues from "./issues.js";
import { StatusBar } from "./statusbar.js";

export const VIEWS = { home: Home, threads: Threads, status: StatusBar, agents: Agents, library: Library, scripts: Scripts, chat: Chat, switch: Switch, work: Work, issues: Issues, learning: Learning, "learning-doc": LearningDoc, settings: Settings, pick: Pick, lightbox: Lightbox, toast: Toast, file: FileView, plan: PlanDoc, note: NoteForm, metrics: Metrics, "settings-more": MoreSheet };

/** Resolves theme tokens safely so even a broken theme lookup keeps the fallback readable. */
function safeColors() {
  try {
    return colors();
  } catch {
    return palette();
  }
}

/** Reads the user's configured monospace font family without throwing. */
function monoFont() {
  try {
    return settings()?.font_family || null;
  } catch {
    return null;
  }
}

/** Plain-language guidance sentence for the fallback card. */
function fallbackGuidance(err) {
  if (err?.interrupted) return "Drawing paused to keep the app responsive. Retry to load this view again.";
  return "Something in this view failed to render. Retry to reload it, or open details to inspect the error.";
}

/** One-line folded mono error summary (default collapsed view per Principle 6). */
function detailSummary(c, err, mono) {
  return div()
    .id("bh-fallback-detail-line")
    .w_full()
    .px(SPACE[3])
    .py(SPACE[2])
    .rounded(SIZE.nested)
    .bg(c.well)
    .border_1()
    .border_color(c.edge)
    .truncate()
    .text_size(TYPE.xs)
    .line_height(`${LINE.xs}px`)
    .text_color(c.muted)
    .when(Boolean(mono), (el) => el.font_family(mono))
    .child(err.detail);
}

/** The expandable raw error details box (folded by default per Principle 6). */
function detailsBlock(c, err, mono) {
  const lines = [`view: ${err.view} · phase: ${err.phase} · ${err.at}`, err.message];
  if (err.stack && err.stack !== err.message) lines.push("", err.stack);
  return v_flex()
    .id("bh-fallback-details-body")
    .w_full()
    .max_h(220)
    .overflow_y_scroll()
    .p(SPACE[3])
    .rounded(SIZE.nested)
    .bg(c.well)
    .border_1()
    .border_color(c.edge)
    .text_size(TYPE.xs)
    .line_height(`${LINE.xs}px`)
    .text_color(c.muted)
    .when(Boolean(mono), (el) => el.font_family(mono))
    .child(lines.join("\n"));
}

/** Heading row with the design language's Failed state glyph (`✕`) and plain-language title. */
function fallbackHeader(c, err) {
  return h_flex()
    .gap(SPACE[3])
    .items_center()
    .child(div().flex_none().text_size(TYPE.lg).font_semibold().text_color(c.danger).child("✕"))
    .child(div().flex_1().min_w(0).text_size(TYPE.lg).line_height(`${LINE.lg}px`).font_semibold().text_color(c.ink).child(err.title));
}

/** Action row: one primary Retry button and a quiet toggle for raw machine details. */
function fallbackActions(c, showDetails, onRetry, onToggle) {
  return h_flex()
    .gap(SPACE[3])
    .items_center()
    .child(actionButton(c, "bh-fallback-retry", "Retry", onRetry, { tone: "primary" }))
    .child(actionButton(c, "bh-fallback-details", showDetails ? "Hide details" : "Show details", onToggle, { tone: "quiet" }));
}

/** Calm fallback card drawn when a view throws during init or render. */
function fallbackCard(c, err, showDetails, onRetry, onToggle) {
  const mono = monoFont();
  const card = v_flex()
    .w_full()
    .max_w(460)
    .p(SPACE[5])
    .gap(SPACE[4])
    .rounded(SIZE.radius)
    .bg(c.fill)
    .border_1()
    .border_color(c.edge)
    .child(fallbackHeader(c, err))
    .child(div().text_size(TYPE.md).line_height(`${LINE.md}px`).text_color(c.muted).child(fallbackGuidance(err)))
    .child(showDetails ? detailsBlock(c, err, mono) : detailSummary(c, err, mono))
    .child(fallbackActions(c, showDetails, onRetry, onToggle));
  return div()
    .id("bh-render-fallback")
    .role("alert")
    .size_full()
    .flex()
    .items_center()
    .justify_center()
    .p(SPACE[5])
    .bg(c.ground)
    .text_color(c.ink)
    .child(card);
}

export class BotHerdr extends View {
  init(given, cx) {
    this.loggedErrors = new Set();
    this.showErrorDetails = false;
    this.lastError = null;
    this.page = null;
    this.viewName = "chat";
    this.initProps = {};
    this.mountPage(given, cx);
  }

  /** Reads view props without throwing if the host props lookup fails. */
  resolveProps(given) {
    try {
      const p = given?.view ? given : props() ?? given ?? {};
      return p && typeof p === "object" ? p : {};
    } catch {
      return given && typeof given === "object" ? given : {};
    }
  }

  /** Logs each distinct view failure at most once so rapid renders never spam. */
  logOnce(record) {
    const key = errorSignature(record);
    if (this.loggedErrors.has(key)) return;
    this.loggedErrors.add(key);
    try {
      console.error(`bot-herdr [${record.phase}:${record.view}]: ${record.message}`, record.stack || "");
    } catch {
      // Never throw while reporting an error.
    }
  }

  /** Instantiates and initialises the active view inside `safeInit`. */
  mountPage(given, cx) {
    const p = this.resolveProps(given);
    this.initProps = p;
    this.viewName = typeof p.view === "string" && p.view ? p.view : "chat";
    const { page, error } = safeInit((initProps, ctx) => {
      const isToast = !initProps.view && isNotification(initProps);
      if (isToast) this.viewName = "toast";
      const Page = VIEWS[initProps.view] ?? (isToast ? Toast : Chat);
      const instance = new Page();
      if (typeof instance.init === "function") instance.init(initProps, ctx);
      return instance;
    }, p, cx, { view: this.viewName, onError: (rec) => this.logOnce(rec) });
    this.page = page;
    this.lastError = error;
  }

  /** Clears the error boundary and attempts to re-init the view. */
  retry(cx) {
    this.loggedErrors.clear();
    this.showErrorDetails = false;
    this.lastError = null;
    this.page = null;
    this.mountPage(this.initProps, cx);
    try {
      cx?.notify?.();
    } catch {
      // Ignore stale context errors on retry.
    }
  }

  /** Expands or collapses the raw mono error details block. */
  toggleDetails(cx) {
    this.showErrorDetails = !this.showErrorDetails;
    try {
      cx?.notify?.();
    } catch {
      // Ignore stale context errors on toggle.
    }
  }

  /** Draws the fallback card safely; never throws even if theme/controls fail. */
  renderFallback(err) {
    const record = err ?? formatRenderError(new Error("View failed to initialise"), { view: this.viewName, phase: "render" });
    try {
      return fallbackCard(
        safeColors(),
        record,
        Boolean(this.showErrorDetails),
        (_e, cx) => this.retry(cx),
        (_e, cx) => this.toggleDetails(cx),
      );
    } catch {
      return div().id("bh-render-fallback-bare").p(SPACE[5]).child(record.title);
    }
  }

  render(cx) {
    if (this.lastError || !this.page) return this.renderFallback(this.lastError);
    const { node, error } = safeRender(this.page, cx, {
      view: this.viewName,
      onError: (rec) => this.logOnce(rec),
    });
    if (error) {
      this.lastError = error;
      return this.renderFallback(error);
    }
    return node;
  }
}

export default BotHerdr;
