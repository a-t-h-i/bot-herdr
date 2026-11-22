// The peek drawer: an in-page right drawer (400 px) that Home, Threads and Agents share. Space
// opens it for the picked row and Esc closes it; it holds the row's recent output, any open
// question as a Question card (1–9 pick an option) and a reply box that sends without leaving the
// list. Cost, tokens, harness and model live here, never in the rows. The page that owns it keeps
// the keyboard (one focus tree): it hands its keys to `keys()` first.

import { div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { hc } from "herdr";
import { SIZE, TYPE_SCALE, LINE, SPACE, CONTROL, RADIUS, STATE, MOTION, stateTone, threadTone, clickable, reducedMotion } from "./look.js";
import { actionButton } from "./button.js";
import { sectionLabel } from "./plandoc.js";
import { bh, bhJson, projectDir } from "./bh.js";
import { price, compact, duration, ago } from "./numbers.js";
import { keyName } from "./rowkeys.js";
import { peekModel, costLine, optionForKey, approvalsList, approvalChoiceForKey, approvalAnswerArgs } from "./threadview.js";
import { renderApprovalCard } from "./approvalcard.js";

/** The drawer's width (px at zoom 1): the design's 380–420 px. */
export const PEEK_WIDTH = 400;

/** Parses `bh approvals answer --json` output (even on non-zero exit); returns an error sentence or null. */
export function approvalAnswerError(r) {
  let parsed = null;
  try {
    parsed = JSON.parse(String(r?.stdout ?? ""));
  } catch {
    parsed = null;
  }
  if (parsed?.implemented === false) return null;
  if (r?.code !== 0 || parsed?.ok === false) {
    return typeof parsed?.error === "string" && parsed.error.trim() ? parsed.error : "That approval could not be answered.";
  }
  return null;
}

const FORMAT = { price, compact, duration };
const OPTION_H = CONTROL + SPACE[2]; // fixed height so unchosen options fold cleanly to 0 over MOTION.fold

export class PeekDrawer {
  /** Built in the owner's `init` (an input state needs a live host). */
  constructor({ onChanged = null } = {}) {
    this.onChanged = onChanged;
    this.target = null; // { kind: "thread", id } | { kind: "agent", agent } | { kind: "approval", id, thread?, item? }
    this.answer = null; // the last bh thread peek answer for the target
    this.approval = null; // matching pending approval record when peeking an approval row
    this.approvalAnswered = null; // "once" | "project" | "deny" once clicked/keyed
    this.approvalFolded = false; // true once the approval card finishes folding
    this.approvalExpanded = false; // whether the approval command line is unfolded
    this.loading = false;
    this.problem = null; // a send or read that failed, said in one line
    this.chosen = -1; // the question option picked (the rest fold away)
    this.folded = false; // true once unchosen options finish folding (instant under Reduce motion)
    this.typing = false; // the reply box has the keyboard: the owner's row keys stand down
    this.sending = false;
    this.input = InputState.new({ placeholder: "Reply…" });
    this.input.on("submit", (_e, cx) => this.send(this.input.value(), cx));
    this.input.on("focus", (_e, cx) => this.setTyping(true, cx));
    this.input.on("blur", (_e, cx) => this.setTyping(false, cx));
  }

  setTyping(on, cx) {
    this.typing = on;
    cx.notify();
  }

  isOpen() {
    return Boolean(this.target);
  }

  /** The stable key of a target, so Space on the open row closes it again. */
  keyOf(target) {
    if (!target) return "";
    if (target.kind === "agent") return `agent:${target.agent?.address ?? ""}`;
    if (target.kind === "approval") return `approval:${target.id ?? ""}`;
    return `thread:${target.id ?? ""}`;
  }

  /** Opens the drawer for a row (a second Space on the same row closes it) and reads its peek. */
  toggle(target, cx) {
    if (!target) return;
    if (this.keyOf(target) === this.keyOf(this.target)) return this.close(cx);
    this.target = target;
    this.answer = null;
    this.approval = null;
    this.approvalAnswered = null;
    this.approvalFolded = false;
    this.approvalExpanded = false;
    this.problem = null;
    this.chosen = -1;
    this.folded = false;
    this.load(cx);
    cx.notify();
  }

  close(cx) {
    this.target = null;
    this.answer = null;
    this.approval = null;
    this.approvalAnswered = null;
    this.approvalFolded = false;
    this.approvalExpanded = false;
    this.chosen = -1;
    this.folded = false;
    this.typing = false;
    cx.notify();
  }

  /** The thread the target belongs to: the thread itself, or the task an agent/approval works on. */
  threadId() {
    const t = this.target;
    if (!t) return "";
    if (t.kind === "agent") return String(t.agent?.task ?? "");
    if (t.kind === "approval") return String(t.thread ?? "");
    return String(t.id ?? "");
  }

  load(cx) {
    const id = this.threadId();
    const isApproval = this.target?.kind === "approval";
    if (!id && !isApproval) return;
    const key = this.keyOf(this.target);
    const approvalId = isApproval ? String(this.target?.id ?? "") : "";
    this.loading = true;
    cx.spawn(async (cx) => {
      const dir = projectDir();
      const [got, ap] = await Promise.all([
        id ? bhJson(["thread", "peek", id], { cwd: dir }) : Promise.resolve(null),
        isApproval ? bhJson(["approvals", "list"], { cwd: dir }) : Promise.resolve(null),
      ]);
      if (key !== this.keyOf(this.target)) return; // another row was peeked meanwhile
      this.loading = false;
      this.answer = got;
      this.approval = isApproval ? approvalsList(ap).find((r) => r.id === approvalId) ?? null : null;
      if (id && !got && !isApproval) this.problem = "Couldn't read this thread's peek. Press Space on the row again to retry.";
      cx.notify();
    });
  }

  model() {
    const fallback = this.target?.kind === "approval" && !this.answer && this.target.item
      ? { title: this.target.item.title, state: "needsYou", summary: this.target.item.text }
      : null;
    return peekModel(this.answer ?? fallback, this.target?.kind === "agent" ? this.target.agent : null);
  }

  /**
   * The owner's keys, first: Esc closes, 1–3 answer a shown approval card, 1–9 pick a question
   * option. True when the key was the drawer's (the owner stops there).
   */
  keys(e, cx) {
    if (!this.target) return false;
    const key = keyName(e);
    if (key === "escape") {
      this.close(cx);
      return true;
    }
    if (this.typing) return false;
    if (this.approval && !this.approvalAnswered && !this.approvalFolded) {
      const choice = approvalChoiceForKey(e?.key);
      if (choice) {
        this.answerApproval(this.approval, choice, cx);
        return true;
      }
    }
    const m = this.model();
    const i = m.question ? optionForKey(e?.key, m.question.options.length) : -1;
    if (i < 0) return false;
    this.pick(i, m, cx);
    return true;
  }

  /** Answers a held approval card (Allow once / project / Deny) and folds it over MOTION.fold. */
  answerApproval(record, choice, cx) {
    const args = approvalAnswerArgs(record?.id, choice);
    if (!args || this.approvalAnswered) return;
    this.approvalAnswered = choice;
    this.approvalFolded = reducedMotion();
    if (!this.approvalFolded) {
      cx.timer.after(MOTION.fold.duration + 16, (cx) => {
        if (this.approvalAnswered !== choice) return;
        this.approvalFolded = true;
        cx.notify();
      });
    }
    cx.notify();
    cx.spawn(async (cx) => {
      const r = await bh([...args, "--json"], { cwd: projectDir() });
      const error = approvalAnswerError(r);
      if (error) {
        this.approvalAnswered = null;
        this.approvalFolded = false;
        this.problem = error;
      } else {
        this.problem = null;
        this.onChanged?.(cx);
      }
      cx.notify();
    });
  }

  /** A question option, picked: it gets the check, the rest fold away over MOTION.fold (instant if reduced), and it goes as the reply. */
  pick(i, m, cx) {
    if (this.chosen >= 0) return;
    this.chosen = i;
    this.folded = reducedMotion();
    if (!this.folded) {
      cx.timer.after(MOTION.fold.duration + 16, (cx) => {
        if (this.chosen !== i) return;
        this.folded = true;
        cx.notify();
      });
    }
    cx.notify();
    this.send(m.question.options[i], cx);
  }

  /** Sends a reply to the agent the thread's peek names, staying on the list. */
  send(value, cx) {
    const textOut = String(value ?? "").trim();
    const to = this.model().reply;
    if (!textOut || !to || this.sending) return;
    this.sending = true;
    cx.spawn(async (cx) => {
      let r = null;
      try {
        r = await hc(["send", to.address, textOut]);
      } catch {
        r = null;
      }
      this.sending = false;
      if (r?.code === 0) {
        this.input.set_value("");
        this.problem = null;
        this.load(cx);
      } else {
        this.chosen = -1;
        this.folded = false;
        this.problem = `Couldn't send to ${to.name}. Check that it is still running, then send again.`;
      }
      cx.notify();
    });
  }

  /** The drawer, over the right edge of the owner's page; null while closed. */
  render(c) {
    if (!this.target) return null;
    const m = this.model();
    return v_flex()
      .id("bh-peek")
      .role("dialog")
      .accessibility_label(`Peek: ${m.title}`)
      .tab_index(0)
      .absolute()
      .top(0)
      .right(0)
      .bottom(0)
      .w(PEEK_WIDTH)
      .bg(c.fill)
      .border_l_1()
      .border_color(c.edge)
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .child(this.head(c, m))
      .child(v_flex().id("bh-peek-body").flex_1().min_h(0).overflow_y_scroll().px(SPACE[4]).pb(SPACE[4]).gap(SPACE[4])
        .child(this.meta(c, m))
        .when(Boolean(this.approval && !this.approvalFolded), (el) => el.child(renderApprovalCard(c, {
          record: this.approval,
          answered: this.approvalAnswered,
          folded: this.approvalFolded,
          expanded: this.approvalExpanded,
          onToggleCommand: (_e, cx) => {
            this.approvalExpanded = !this.approvalExpanded;
            cx.notify();
          },
          onAnswer: (rec, choice, cx) => this.answerApproval(rec, choice, cx),
          allowPrimary: true,
        })))
        .child(this.output(c, m))
        .when(Boolean(m.question), (el) => el.child(this.questionCard(c, m)))
        .when(Boolean(this.problem), (el) => el.child(div().text_size(TYPE_SCALE.metadata).line_height(`${LINE.md}px`).text_color(c.danger).child(this.problem))))
      .when(Boolean(m.reply), (el) => el.child(this.replyBox(c, m)));
  }

  /** The state glyph, the title and the one close button. */
  head(c, m) {
    const s = STATE[m.state] ?? STATE.idle;
    return h_flex().flex_none().h(CONTROL + SPACE[5]).px(SPACE[4]).gap(SPACE[3]).items_center()
      .child(div().flex_1().min_w(0).truncate().text_size(TYPE_SCALE.title).font_semibold().text_color(threadTone(c, m.state)).child(m.title))
      .child(actionButton(c, "bh-peek-close", null, (_e, cx) => this.close(cx), { icon: "x", tone: "quiet", tooltip: "Close (Esc)", a11y: "Close the peek" }));
  }

  /** The line it is on, then what it costs and runs on: harness · model · cost. */
  meta(c, m) {
    const s = STATE[m.state] ?? STATE.idle;
    const run = [m.harness, m.model, costLine(m.cost, FORMAT)].filter(Boolean).join(" · ");
    return v_flex().gap(SPACE[2])
      .child(div().text_size(TYPE_SCALE.metadata).text_color(stateTone(c, m.state)).child(`${s.glyph} ${s.word}`))
      .when(Boolean(m.summary), (el) => el.child(div().text_size(TYPE_SCALE.body).line_height(`${LINE.md}px`).text_color(c.textSecondary).child(m.summary)))
      .when(Boolean(run), (el) => el.child(div().id("bh-peek-cost").text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child(run)));
  }

  /** The last few lines of output, one line each, oldest first. */
  output(c, m) {
    const quiet = this.loading ? "Reading…" : "No output yet.";
    return v_flex().gap(SPACE[2])
      .child(sectionLabel(c, "Recent output"))
      .when(!m.output.length, (el) => el.child(div().text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child(quiet)))
      .children(m.output.map((o, i) => v_flex().id(`bh-peek-line-${i}`).gap(SPACE[1])
        .child(div().text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child([o.from, ago(o.at)].filter(Boolean).join(" · ")))
        .child(div().text_size(TYPE_SCALE.body).line_height(`${LINE.md}px`).text_color(c.textPrimary).child(o.text))));
  }

  /** The open question: its text, then each option as a card numbered for its key. */
  questionCard(c, m) {
    const q = m.question;
    const options = this.chosen >= 0 && this.folded ? [this.chosen] : q.options.map((_o, i) => i);
    return v_flex().id("bh-answer-card").role("group").accessibility_label(`Question: ${q.text}`).gap(SPACE[2]).p(SPACE[3]).rounded(RADIUS.card).border_1().border_color(c.edge)
      .child(div().text_size(TYPE_SCALE.body).font_semibold().line_height(`${LINE.md}px`).text_color(c.textPrimary).child(q.text))
      .when(!q.options.length, (el) => el.child(div().text_size(TYPE_SCALE.metadata).text_color(c.textMuted).child("Answer it in the reply box below.")))
      .children(options.map((i) => this.option(c, q.options[i], i, m, this.chosen >= 0 && i !== this.chosen)));
  }

  option(c, label, i, m, folding = false) {
    const picked = this.chosen === i;
    if (folding) {
      return h_flex()
        .id(`bh-answer-card-${i}`)
        .h(0)
        .opacity(0)
        .overflow_hidden()
        .transition("height", MOTION.fold)
        .transition("opacity", MOTION.fold);
    }
    return clickable(
      h_flex().role("button").accessibility_label(`Option ${i + 1}: ${label}`).h(OPTION_H).px(SPACE[3]).gap(SPACE[3]).items_center().overflow_hidden().rounded(RADIUS.control).bg(c.ground)
        .opacity(1)
        .transition("height", MOTION.fold)
        .transition("opacity", MOTION.fold)
        .on_click((_e, cx) => this.pick(i, m, cx))
        .child(div().flex_none().text_size(TYPE_SCALE.metadata).text_color(picked ? c.accent : c.textMuted).child(picked ? "✓" : String(i + 1)))
        .child(div().flex_1().min_w(0).text_size(TYPE_SCALE.body).text_color(c.textPrimary).child(label)),
      c,
      `bh-answer-card-${i}`,
      { fill: c.hover },
    );
  }

  /** The reply box: Enter sends to the agent the thread names. */
  replyBox(c, m) {
    return h_flex().id("bh-peek-reply").flex_none().p(SPACE[4]).gap(SPACE[3]).items_center().border_t_1().border_color(c.edge)
      .child(h_flex().flex_1().min_w(0).h(CONTROL).px(SPACE[3]).items_center().rounded(SIZE.control).bg(c.ground).border_1().border_color(c.controlBorder ?? c.edge)
        .accessibility_label(`Reply to ${m.reply.name}`)
        .child(Input.new(this.input).flex_1().min_w(0).h_full().text_size(TYPE_SCALE.body).text_color(c.textPrimary)))
      .child(actionButton(c, "bh-peek-send", "Send", (_e, cx) => this.send(this.input.value(), cx), { tone: "secondary", disabled: this.sending, tooltip: `Send to ${m.reply.name} (Enter)` }));
  }
}
