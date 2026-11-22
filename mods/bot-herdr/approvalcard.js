// Three-choice approval card: Allow once (primary), Allow for this project (secondary), Deny
// (secondary — never a danger fill). Shows the agent's avatar and name, the title, and the held
// command as one folded mono machine line (Principle 6). Keys 1 / 2 / 3 answer while the card has
// focus; once answered, it folds away over MOTION.fold (instant under Reduce motion).

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { TYPE_SCALE, LINE, SPACE, CONTROL, RADIUS, MOTION, focusable } from "./look.js";
import { avatar } from "./switch.js";
import { actionButton } from "./button.js";
import { machineLine } from "./machinetext.js";
import { mentionTone } from "./indicators.js";
import { APPROVAL_CHOICES, approvalChoiceForKey } from "./threadview.js";

/** One approval button: folds to zero height/opacity when another option was picked. */
function choiceButton(c, record, choice, { answered, allowPrimary, onAnswer }) {
  const id = `bh-approval-${record.id}-${choice.id}`;
  const folding = Boolean(answered) && answered !== choice.id;
  if (folding) {
    return div()
      .id(id)
      .h(0)
      .opacity(0)
      .overflow_hidden()
      .transition("height", MOTION.fold)
      .transition("opacity", MOTION.fold);
  }
  const picked = answered === choice.id;
  const tone = choice.tone === "primary" && allowPrimary && !answered ? "primary" : "secondary";
  const label = picked ? `✓ ${choice.label}` : choice.label;
  return actionButton(c, id, label, (_e, cx) => {
    if (!answered) onAnswer(record, choice.id, cx);
  }, {
    tone,
    hint: answered ? null : choice.key,
    tooltip: `${choice.label} (${choice.key})`,
  })
    .opacity(1)
    .transition("height", MOTION.fold)
    .transition("opacity", MOTION.fold);
}

/** Header: agent avatar + name, and the approval title. */
function cardHead(c, record) {
  const who = record.from || record.agent || "Agent";
  return h_flex()
    .gap(SPACE[2])
    .items_center()
    .child(avatar(c, who, mentionTone(c, record.agent || who), 20))
    .child(div().flex_none().text_size(TYPE_SCALE.metadata).font_semibold().text_color(c.textPrimary).child(who))
    .child(div().flex_1().min_w(0).truncate().text_size(TYPE_SCALE.body).font_semibold().line_height(`${LINE.md}px`).text_color(c.textPrimary).child(record.title));
}

/**
 * Draws one three-choice approval card (`bh-approval-<id>`). Returns null once answered and
 * folded, or when the record is missing. `allowPrimary` keeps at most one coral button per view.
 */
export function renderApprovalCard(c, {
  record,
  answered = null,
  folded = false,
  expanded = false,
  onToggleCommand = null,
  onAnswer = (_r, _ch, _cx) => {},
  allowPrimary = true,
}) {
  if (!record || folded) return null;
  const cardId = `bh-approval-${record.id}`;
  const folding = Boolean(answered);
  return focusable(
    v_flex()
      .role("group")
      .accessibility_label(`Approval from ${record.from}: ${record.title}`)
      .w_full()
      .p(SPACE[4])
      .gap(SPACE[3])
      .rounded(RADIUS.card)
      .bg(c.fill)
      .border_1()
      .border_color(c.edge)
      .opacity(folding ? 0 : 1)
      .transition("opacity", MOTION.fold)
      .on_key_down((e, cx) => {
        if (answered) return;
        const choice = approvalChoiceForKey(e?.key);
        if (!choice) return;
        cx.stop_propagation();
        onAnswer(record, choice, cx);
      })
      .child(cardHead(c, record))
      .when(Boolean(record.command), (el) => el.child(machineLine(c, {
        id: `${cardId}-cmd`,
        text: record.command,
        expanded,
        onToggle: onToggleCommand,
      })))
      .child(h_flex()
        .flex_wrap()
        .gap(SPACE[2])
        .items_center()
        .min_h(CONTROL)
        .children(APPROVAL_CHOICES.map((ch) => choiceButton(c, record, ch, { answered, allowPrimary, onAnswer })))),
    cardId,
    c,
    { edge: true },
  );
}
