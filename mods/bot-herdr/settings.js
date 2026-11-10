// Settings: the agents. Each one is a harness (Claude Code, Codex, pi, …) with a model and an
// effort level, under a name you reach it by: `@name` in the composer. One of them leads: it
// gets every message that names no one, and hands work to the others.
//
// Saved in herdr's shared state (roster.js), so the composer sees a change at once. A change
// applies the next time that agent starts.

import { div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { agents, spaces, focused, settings, shared, setShared, knownAgents } from "herdr";
import { LIGHT, DARK, SIZE, ICON } from "./look.js";
import { ROSTER_KEY, roster, argvOf, runnable, runningAs, effortsOf, blank, slug } from "./roster.js";

const FIELDS = [
  { key: "name", placeholder: "Name" },
  { key: "model", placeholder: "The harness's default" },
  { key: "args", placeholder: "None" },
];

export class Settings {
  init(_props, cx) {
    this.known = [];
    this.inputs = {}; // agent id → { name, model, args }: one text box each
    this.width = 900;
    this.sync();
    this.loadKnown(cx);
    cx.timer.every(60000, (cx) => this.loadKnown(cx));
  }

  loadKnown(cx) {
    cx.spawn(async (cx) => {
      try {
        this.known = await knownAgents({ on: this.space()?.machine ?? null });
      } catch {
        this.known = [];
      }
      this.sync();
      cx.notify();
    });
  }

  space() {
    const f = focused();
    return spaces().find((s) => s.id === f?.space) ?? spaces().find((s) => s.active) ?? null;
  }

  list() {
    return roster(shared(ROSTER_KEY), this.known);
  }

  save(list) {
    setShared(ROSTER_KEY, list);
  }

  change(id, patch) {
    this.save(this.list().map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  /** Text boxes are made here (never while drawing), one set per agent. */
  sync() {
    const list = this.list();
    for (const a of list) {
      if (this.inputs[a.id]) continue;
      const set = {};
      for (const f of FIELDS) {
        const state = InputState.new({ value: a[f.key] ?? "", placeholder: f.placeholder });
        state.on("change", (_e, cx) => {
          const value = state.value();
          const now = this.list().find((x) => x.id === a.id);
          if (!now || now[f.key] === value) return;
          // A name must stay one that can be typed; an empty one keeps the old until typed.
          if (f.key === "name" && !value.trim()) return;
          this.change(a.id, { [f.key]: f.key === "name" ? value : value.trim() });
          cx.notify();
        });
        set[f.key] = state;
      }
      this.inputs[a.id] = set;
    }
    for (const id of Object.keys(this.inputs)) if (!list.some((a) => a.id === id)) delete this.inputs[id];
  }

  add(cx) {
    const list = this.list();
    this.save([...list, blank(list, this.known)]);
    this.sync();
    cx.notify();
  }

  remove(id, cx) {
    const list = this.list().filter((a) => a.id !== id);
    this.save(roster(list, this.known));
    this.sync();
    cx.notify();
  }

  lead(id, cx) {
    this.save(this.list().map((a) => ({ ...a, lead: a.id === id })));
    cx.notify();
  }

  // ── Drawing ────────────────────────────────────────────────────────────────────────────────

  render() {
    const c = settings().dark ? DARK : LIGHT;
    const list = this.list();
    const width = Math.max(320, Math.min(SIZE.maxWidth, this.width - SIZE.gutter * 2));
    const running = agents();
    const space = this.space()?.id ?? null;
    return div()
      .id("bh-settings")
      .relative()
      .size_full()
      .bg(c.ground)
      .text_color(c.ink)
      .on_size_change((size, cx) => {
        this.width = size.width;
        cx.notify();
      })
      .child(
        v_flex()
          .id("bh-settings-scroll")
          .absolute()
          .inset_0()
          .overflow_y_scroll()
          .items_center()
          .child(
            v_flex()
              .flex_none()
              .w(width)
              .py(24)
              .gap(12)
              .child(div().text_size(19).font_semibold().child("Agents"))
              .child(div().text_size(13).text_color(c.muted).child("Each agent is a harness with a model and an effort level. The lead gets every message that names no one and hands work to the others. Reach any of them with @name."))
              .children(list.filter((a) => this.inputs[a.id]).map((a) => this.card(c, a, list, running, space)))
              .child(
                h_flex()
                  .pt(2)
                  .gap(12)
                  .items_center()
                  .child(this.button(c, "bh-add", "Add agent", (_e, cx) => this.add(cx)))
                  .child(div().text_size(12).text_color(c.faint).child("A change applies the next time that agent starts.")),
              ),
          ),
      );
  }

  card(c, a, list, running, space) {
    const inputs = this.inputs[a.id];
    const harnesses = this.known.filter((k) => k.installed || k.key === a.harness);
    if (!harnesses.some((k) => k.key === a.harness)) harnesses.push({ key: a.harness, name: a.harness, installed: false });
    const efforts = effortsOf(a.harness);
    const ok = runnable(a, this.known);
    const live = runningAs(a, running, space);
    const command = argvOf(a, this.known).join(" ");
    const label = (text) => div().w(118).flex_none().text_size(12.5).text_color(c.muted).child(text);
    const row = (name, body) => h_flex().min_h(32).gap(10).items_center().child(label(name)).child(body);
    const field = (state) =>
      div()
        .flex_1()
        .min_w(0)
        .h(32)
        .px(10)
        .flex()
        .items_center()
        .rounded(SIZE.control)
        .bg(c.ground)
        .border_1()
        .border_color(c.edge)
        .child(Input.new(state).w_full().h_full().text_size(13).text_color(c.ink));
    return v_flex()
      .id(`bh-agent-${a.id}`)
      .flex_none()
      .p(14)
      .gap(8)
      .rounded(SIZE.radius)
      .bg(c.fill)
      .border_1()
      .border_color(c.edge)
      .child(
        h_flex()
          .gap(10)
          .items_center()
          .child(label("Name"))
          .child(field(inputs.name))
          .child(this.chip(c, `bh-lead-${a.id}`, a.lead ? "Leads" : "Make lead", a.lead, (_e, cx) => this.lead(a.id, cx)))
          .when(list.length > 1, (el) =>
            el.child(
              div()
                .id(`bh-del-${a.id}`)
                .size(28)
                .flex_none()
                .flex()
                .items_center()
                .justify_center()
                .rounded(SIZE.nested)
                .text_color(c.muted)
                .cursor_pointer()
                .hover((s) => s.bg(c.hover).text_color(c.danger))
                .on_click((_e, cx) => this.remove(a.id, cx))
                .child(svg(ICON("x")).size(14)),
            )),
      )
      .child(row("Harness", h_flex().flex_1().min_w(0).flex_wrap().gap(6).children(harnesses.map((k) =>
        this.chip(c, `bh-h-${a.id}-${k.key}`, k.installed ? k.name : `${k.name} (not installed)`, k.key === a.harness, (_e, cx) => {
          // Another harness has its own effort levels: keep the level only if it has it too.
          this.change(a.id, { harness: k.key, effort: effortsOf(k.key).includes(a.effort) ? a.effort : "" });
          cx.notify();
        })))))
      .child(row("Model", field(inputs.model)))
      .child(row("Effort", efforts.length
        ? h_flex().flex_1().min_w(0).flex_wrap().gap(6).children(["", ...efforts].map((e) =>
            this.chip(c, `bh-e-${a.id}-${e || "default"}`, e || "Default", a.effort === e, (_e, cx) => {
              this.change(a.id, { effort: e });
              cx.notify();
            })))
        : div().flex_1().text_size(12.5).text_color(c.faint).child("This harness has no effort flag we know. Use extra arguments.")))
      .child(row("Extra arguments", field(inputs.args)))
      .child(
        h_flex()
          .pt(2)
          .gap(8)
          .items_center()
          .text_size(12)
          .child(div().flex_none().text_color(c.faint).child(a.lead ? "Plain messages" : `@${slug(a.name)}`))
          .child(div().flex_1().min_w(0).truncate().text_color(c.muted).child(command))
          .child(div().flex_none().text_color(ok ? (live ? c.accent : c.faint) : c.danger).child(ok ? (live ? "running here" : "not running") : "harness not installed")),
      );
  }

  chip(c, id, label, on, onClick) {
    return div()
      .id(id)
      .flex_none()
      .h(SIZE.chip)
      .px(10)
      .flex()
      .items_center()
      .rounded(SIZE.nested)
      .border_1()
      .text_size(12.5)
      .cursor_pointer()
      .when(on, (el) => el.bg(c.well).border_color(c.accent).text_color(c.ink).font_medium())
      .when(!on, (el) => el.border_color(c.edge).text_color(c.muted).hover((s) => s.bg(c.hover).text_color(c.ink)))
      .on_click(onClick)
      .child(label);
  }

  button(c, id, label, onClick) {
    return div()
      .id(id)
      .flex_none()
      .h(32)
      .px(14)
      .flex()
      .items_center()
      .rounded(SIZE.control)
      .bg(c.accent)
      .border_b(1)
      .border_color(c.accentLip)
      .text_size(13)
      .font_medium()
      .text_color(c.accentInk)
      .cursor_pointer()
      .hover((s) => s.opacity(0.92))
      .on_click(onClick)
      .child(label);
  }
}
