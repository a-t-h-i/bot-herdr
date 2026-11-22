// The status bar: the machine, the branch, how many agents run, and the palette's key. Nothing
// else and no buttons; what herdr's workspace bar also said ("· 2 needs you") is Home's header
// count now, and a row's cost, harness and model are in its peek.

import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, keys, window as herdrWindow } from "herdr";
import { SPACE, TYPE_SCALE } from "./look.js";
import { colors } from "./theme.js";
import { statusModel, paletteHint } from "./threadview.js";

/** Reads a herdr list without letting a failing bridge call break the bar. */
function safeList(read) {
  try {
    const got = read();
    return Array.isArray(got) ? got : [];
  } catch {
    return [];
  }
}

export class StatusBar {
  init() {}

  render() {
    const c = colors();
    const space = safeList(spaces).find((s) => s?.active) ?? null;
    const m = statusModel(space, safeList(agents));
    const binding = safeList(keys).find((k) => k?.section === "global" && k?.action === "app.palette") ?? null;
    let mac = false;
    try {
      mac = herdrWindow()?.platform === "macos";
    } catch {
      mac = false;
    }
    const hint = paletteHint(binding, mac);
    const parts = [m.machine, m.branch, m.agents].filter(Boolean);
    return h_flex()
      .id("bh-status")
      .role("status")
      .accessibility_label(`${parts.join(", ")}. ${hint}`)
      .size_full()
      .px(SPACE[4])
      .gap(SPACE[4])
      .items_center()
      .bg(c.ground)
      .border_t_1()
      .border_color(c.edge)
      .text_size(TYPE_SCALE.metadata)
      .text_color(c.textSecondary)
      .children(parts.map((p) => div().flex_none().max_w(260).truncate().child(p)))
      .child(div().flex_1())
      .child(div().flex_none().text_color(c.textMuted).child(hint));
  }
}
