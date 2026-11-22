// Thread map: the tree under a thread header showing the parent, its child workers (avatar + name,
// state glyph, step) and its forked threads (title, state) as one-line rows. Space opens the peek
// drawer for a row; Enter or click opens its thread or terminal. Hidden when there are no children
// and no forks (Principle 3). Also draws the muted clickable "Forked from <title>" origin link.

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { TYPE_SCALE, SPACE, CONTROL, RADIUS, STATE, stateTone, clickable } from "./look.js";
import { avatar } from "./switch.js";
import { mentionTone } from "./indicators.js";
import { keyName, opensRow } from "./rowkeys.js";

/** Keyboard handler for a tree row: Space peeks, Enter opens. */
function treeKeys(item, onPeek, onOpen) {
  return (e, cx) => {
    const key = keyName(e);
    if (key === "space") {
      cx.stop_propagation();
      onPeek(item, cx);
    } else if (opensRow(key)) {
      cx.stop_propagation();
      onOpen(item, cx);
    }
  };
}

/** One child worker row: connector, avatar + name, state glyph, optional step number. */
function childRow(c, item, last, { onPeek, onOpen }) {
  const s = STATE[item.state] ?? STATE.idle;
  const meta = item.step ? `step ${item.step}` : "";
  const label = `Child ${item.name}: ${s.word}${meta ? `, ${meta}` : ""}`;
  return clickable(
    h_flex()
      .role("tree_item")
      .accessibility_label(label)
      .w_full()
      .min_h(CONTROL)
      .pl(SPACE[4])
      .pr(SPACE[3])
      .gap(SPACE[2])
      .items_center()
      .rounded(RADIUS.control)
      .on_click((_e, cx) => onOpen(item, cx))
      .on_key_down(treeKeys(item, onPeek, onOpen))
      .child(div().flex_none().text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child(last ? "└" : "├"))
      .child(avatar(c, item.agent, mentionTone(c, item.agent), 18))
      .child(div().flex_1().min_w(0).truncate().text_size(TYPE_SCALE.metadata).font_semibold().text_color(c.textPrimary).child(item.name))
      .child(div().flex_none().text_size(TYPE_SCALE.metadata).text_color(stateTone(c, item.state)).child(`${s.glyph} ${s.word}`))
      .when(Boolean(meta), (el) => el.child(div().flex_none().text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child(meta))),
    c,
    item.rowId,
    { fill: c.hover },
  );
}

/** One forked thread row: connector, state glyph, title, "Fork" label. */
function forkRow(c, item, last, { onPeek, onOpen }) {
  const s = STATE[item.state] ?? STATE.idle;
  return clickable(
    h_flex()
      .role("tree_item")
      .accessibility_label(`Forked thread ${item.title}: ${s.word}`)
      .w_full()
      .min_h(CONTROL)
      .pl(SPACE[4])
      .pr(SPACE[3])
      .gap(SPACE[2])
      .items_center()
      .rounded(RADIUS.control)
      .on_click((_e, cx) => onOpen(item, cx))
      .on_key_down(treeKeys(item, onPeek, onOpen))
      .child(div().flex_none().text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child(last ? "└" : "├"))
      .child(div().flex_none().text_size(TYPE_SCALE.metadata).text_color(stateTone(c, item.state)).child(s.glyph))
      .child(div().flex_1().min_w(0).truncate().text_size(TYPE_SCALE.metadata).text_color(c.textPrimary).child(item.title))
      .child(div().flex_none().text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child("Fork")),
    c,
    item.rowId,
    { fill: c.hover },
  );
}

/** Muted clickable "Forked from <title>" line when `forkOf` is set; null otherwise. */
export function renderForkOrigin(c, { forkOf, onOpen }) {
  if (!forkOf?.id) return null;
  return clickable(
    h_flex()
      .role("link")
      .accessibility_label(`Forked from ${forkOf.title}`)
      .min_h(CONTROL)
      .px(SPACE[2])
      .gap(SPACE[2])
      .items_center()
      .rounded(RADIUS.control)
      .on_click((_e, cx) => onOpen(forkOf.id, cx))
      .on_key_down((e, cx) => {
        if (!opensRow(keyName(e))) return;
        cx.stop_propagation();
        onOpen(forkOf.id, cx);
      })
      .child(div().text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child(`Forked from ${forkOf.title}`)),
    c,
    "bh-thread-fork-of",
    { fill: c.hover },
  );
}

/**
 * Draws the thread map tree (`bh-thread-map`) under the thread header: parent, children and forks.
 * Returns null when there are no children and no forks.
 */
export function renderThreadMap(c, { model, onPeek = (_item, _cx) => {}, onOpen = (_item, _cx) => {} }) {
  if (!model?.hasTree) return null;
  const s = STATE[model.parent.state] ?? STATE.idle;
  const items = [...model.children, ...model.forks];
  return v_flex()
    .id("bh-thread-map")
    .role("tree")
    .accessibility_label("Thread map")
    .w_full()
    .py(SPACE[1])
    .gap(SPACE[1])
    .child(h_flex()
      .px(SPACE[2])
      .gap(SPACE[2])
      .items_center()
      .child(div().flex_none().text_size(TYPE_SCALE.metadata).text_color(stateTone(c, model.parent.state)).child(s.glyph))
      .child(div().flex_1().min_w(0).truncate().text_size(TYPE_SCALE.metadata).font_semibold().text_color(c.textSecondary).child(model.parent.title)))
    .children(items.map((item, i) => {
      const last = i === items.length - 1;
      return item.kind === "child"
        ? childRow(c, item, last, { onPeek, onOpen })
        : forkRow(c, item, last, { onPeek, onOpen });
    }));
}
