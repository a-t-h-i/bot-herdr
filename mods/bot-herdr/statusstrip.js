// Slim live resilience status strip shared by Chat (docked above the composer) and Tasks.
// Polls `bh resilience status --json` only while the host page is active and degrades cleanly
// to hidden when idle or when the engine command is unavailable.

import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { setShared } from "herdr";
import { SIZE, ICON, TYPE, SPACE, CONTROL, GLYPH } from "./look.js";
import { actionButton } from "./button.js";
import { pill } from "./switch.js";
import { bh, bhJson } from "./bh.js";
import { showPage } from "./pages.js";
import { normalizeStatus, stripModel } from "./resilienceview.js";

export const STATUS_POLL_MS = 6000;
/** Drawn height of one single-row status strip (px at zoom 1), used to offset the chat feed. */
export const STRIP_HEIGHT = CONTROL + SPACE[3] * 2;
/** Shared signal so clicking Resilience on the strip jumps Settings straight to the Resilience tab. */
export const OPEN_RESILIENCE = "bot-herdr.open-resilience";

/** Opens Settings directly on the Resilience tab. */
export function openResilienceSettings() {
  setShared(OPEN_RESILIENCE, { at: Date.now() });
  showPage("settings");
}

function stripTone(c, model) {
  if (model.breakerText) return { border: c.danger, icon: "alert-triangle", iconColor: c.danger };
  if (model.failoverText) return { border: c.warning, icon: "alert-triangle", iconColor: c.warning };
  return { border: c.edge, icon: "shield-check", iconColor: c.accent };
}

function stripSummary(model) {
  return [model.autonomyLabel, model.breakerText, model.failoverText, model.budgetText].filter(Boolean).join(" · ") || "Workspace resilience status";
}

/**
 * Renders the compact live status strip. Returns null when `model.visible` is false so idle views
 * stay completely uncluttered.
 */
export function renderStatusStrip(c, model, { idPrefix = "bh-strip", onPause = null, onReset = null, onOpenSettings = null } = {}) {
  if (!model?.visible) return null;
  const tone = stripTone(c, model);
  return h_flex()
    .id(idPrefix)
    .role("status")
    .accessibility_label(stripSummary(model))
    .w_full()
    .min_h(STRIP_HEIGHT)
    .px(SPACE[4])
    .py(SPACE[3])
    .gap(SPACE[3])
    .items_center()
    .justify_between()
    .rounded(SIZE.control)
    .bg(c.fill)
    .border_1()
    .border_color(tone.border)
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .child(
      h_flex()
        .flex_1()
        .min_w(0)
        .flex_wrap()
        .gap(SPACE[2])
        .items_center()
        .child(svg(ICON(tone.icon)).flex_none().size(GLYPH.md).text_color(tone.iconColor))
        .when(Boolean(model.autonomyLabel), (el) => el.child(pill(c, model.autonomyLabel, c.accent, { pulse: true })))
        .when(Boolean(model.breakerText), (el) => el.child(pill(c, model.breakerText, c.danger)))
        .when(Boolean(model.failoverText), (el) => el.child(pill(c, model.failoverText, c.warning)))
        .when(Boolean(model.budgetText), (el) => el.child(
          div().flex_none().whitespace_nowrap().text_size(TYPE.xs).font_medium().text_color(c.muted).child(model.budgetText),
        )),
    )
    .child(
      h_flex()
        .flex_none()
        .gap(SPACE[2])
        .items_center()
        .when(Boolean(model.canPause && onPause), (el) => el.child(
          actionButton(c, `${idPrefix}-pause`, "Pause", onPause, { icon: "pause", tone: "secondary", tooltip: "Pause active autonomous run" }),
        ))
        .when(Boolean(model.canReset && onReset), (el) => el.child(
          actionButton(c, `${idPrefix}-reset`, "Reset", onReset, { icon: "refresh-cw", tone: "secondary", tooltip: "Reset provider cooldowns" }),
        ))
        .when(Boolean(onOpenSettings), (el) => el.child(
          actionButton(c, `${idPrefix}-settings`, null, onOpenSettings, { icon: "shield-check", tone: "quiet", tooltip: "Resilience settings", a11y: "Open resilience settings" }),
        )),
    );
}

/**
 * Shared poller for `bh resilience status --json`: polls every 6s only while the page is active,
 * guards against overlapping in-flight requests, and refreshes immediately after Pause / Reset.
 */
export class ResilienceMonitor {
  /** @param {{ isActive?: () => boolean, cwd?: () => string | undefined }} [opts] */
  constructor({ isActive = () => true, cwd = () => undefined } = {}) {
    this.isActive = isActive;
    this.cwd = cwd;
    this.status = normalizeStatus(null);
    this.loaded = false;
    this.inFlight = false;
    this.busyAction = false;
    this.sig = "";
  }

  start(cx) {
    this.refresh(cx);
    cx.timer.every(STATUS_POLL_MS, (cx) => {
      if (this.isActive()) this.refresh(cx);
    });
  }

  refresh(cx) {
    if (this.inFlight) return;
    this.inFlight = true;
    const dir = this.cwd();
    cx.spawn(async (cx) => {
      try {
        const got = await bhJson(["resilience", "status"], dir ? { cwd: dir } : undefined);
        const loaded = got !== null;
        const next = normalizeStatus(got);
        const sig = `${loaded}:${JSON.stringify(next)}`;
        if (sig !== this.sig) {
          this.sig = sig;
          this.loaded = loaded;
          this.status = next;
          cx.notify();
        }
      } catch {
        if (this.loaded) {
          this.loaded = false;
          this.status = normalizeStatus(null);
          this.sig = "";
          cx.notify();
        }
      } finally {
        this.inFlight = false;
      }
    });
  }

  model() {
    return this.loaded ? stripModel(this.status) : { visible: false, autonomyLabel: null, failoverText: null, budgetText: null, breakerText: null, canPause: false, canReset: false };
  }

  runAction(args, cx) {
    if (this.busyAction) return;
    this.busyAction = true;
    const dir = this.cwd();
    cx.spawn(async (cx) => {
      try {
        await bh(args, dir ? { cwd: dir } : undefined);
      } finally {
        this.busyAction = false;
        this.refresh(cx);
        cx.notify();
      }
    });
  }

  /** Pause the task the strip is showing; with no active task there is nothing to pause. */
  pause(cx) {
    const taskId = this.status?.task?.id;
    if (!taskId) return;
    this.runAction(["resilience", "pause", "--task", taskId], cx);
  }

  reset(cx, key = null) {
    const args = key ? ["resilience", "reset", key] : ["resilience", "reset"];
    this.runAction(args, cx);
  }
}
