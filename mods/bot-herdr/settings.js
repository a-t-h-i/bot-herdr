// Settings: the team, how agents run, the harnesses and the classifier.
//
// The team is six fixed roles (Orchestrator, Design, Dev, QA, Research, Scout) plus any agents
// you add, shown as a grid of cards. Each card picks a harness (Claude Code, Codex, pi, Oh My
// Pi, …), a model from that harness's list (or any you type) and an effort level. A change is
// kept in herdr's shared state at once (the composer sees it) and written for the bh tool a
// moment later, which also refreshes each agent's herdr-core template. An agent run headless
// picks it up on its next message; one run as its CLI, the next time it starts.
//
// How agents run: headless (the default: each message runs the harness non-interactively and
// the answer comes back to the chat) or as their CLI; and what they may do without asking,
// standard (edits, reading, the team's tools) unless the person picks full access.

import { div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { agents, exec, settings, shared, setShared, knownAgents, notify } from "herdr";
import { LIGHT, DARK, SIZE, ICON } from "./look.js";
import { ROSTER_KEY, HEADLESS_KEY, HEADLESS, ROLES, roster, roleOf, argvOf, runnable, runningAs, effortsOf, modelsOf, harnessOf, blank, slug, parseModelList } from "./roster.js";
import { bh, bhJson, enc, currentSpace, ROUTING_KEY } from "./bh.js";
import { PICKED, openPick } from "./pick.js";

const GAP = 14; // between cards
const MAX = 1140; // the page's widest
const MIN_CARD = 280; // a card's narrowest before the grid drops a column
const PAD = 14; // inside a card
const KNOB = 16;

const FIELDS = [
  { key: "name", placeholder: "Name" },
  { key: "model", placeholder: "The harness's default" },
  { key: "args", placeholder: "None" },
];

const FEATURES = [
  { key: "lobby", label: "Chat routing", about: "who answers a message that names no one" },
  { key: "triage", label: "Triage", about: "a task's size, kind and domains" },
  { key: "effort", label: "Effort routing", about: "lower effort for simple steps" },
  { key: "qa", label: "QA depth", about: "how deep the QA gate looks" },
  { key: "scripts", label: "Script picks", about: "which shared scripts suit a step" },
];

const THRESHOLDS = [
  { key: "lobbyAgentAt", label: "Hand a message to an agent at" },
  { key: "simpleAt", label: "Lower the effort for a simple step at" },
  { key: "trivialAt", label: "Lowest effort for a trivial step at" },
];

const HOST_ORDER = ["auto", "opencode", "typesafe", "openrouter", "vercel"];

export class Settings {
  init(_props, cx) {
    this.known = [];
    this.knownSaved = "";
    this.inputs = {}; // agent id → { name, model, args }
    this.open = null; // "<id>:harness" or "<id>:model": the field whose list is open
    this.pickedAt = shared(PICKED)?.at ?? 0;
    this.listed = {}; // harness → model ids its own list command printed (pi, Oh My Pi)
    this.listing = {}; // harness → true while asking it
    this.drag = null; // { id, bounds } while an effort slider is held
    this.width = 900;
    this.saveGen = 0;
    this.problem = null;
    this.classifier = null; // what `bh config` reports (the key only as set / not set)
    this.access = null; // what `bh access` reports: { headless, access, allow }
    this.allowInput = InputState.new({ placeholder: "npm test, git add, git commit" });
    const saveAllow = (_e, cx) => {
      const v = this.allowInput.value().trim();
      if (this.access && v !== (this.access.allow ?? []).join(", ")) this.setAccess({ allow: v }, cx);
    };
    this.allowInput.on("submit", saveAllow);
    this.allowInput.on("blur", saveAllow);

    this.harnessForm = {
      key: InputState.new({ placeholder: "omp" }),
      name: InputState.new({ placeholder: "Oh My Pi" }),
      run: InputState.new({ placeholder: "omp --some-flag" }),
    };
    this.keyInput = InputState.new({ placeholder: "Paste a key" });
    this.keyInput.on("submit", (_e, cx) => this.saveKey(cx));
    this.keyInput.on("blur", (_e, cx) => this.saveKey(cx));
    this.modelInput = InputState.new({ placeholder: "The host's default" });
    const saveModel = (_e, cx) => {
      const v = this.modelInput.value().trim();
      if (this.classifier && v !== (this.classifier.model ?? "")) this.config({ model: v }, cx);
    };
    this.modelInput.on("submit", saveModel);
    this.modelInput.on("blur", saveModel);
    this.thresholdInputs = {};
    for (const t of THRESHOLDS) {
      const state = InputState.new({ placeholder: "0.5" });
      const save = (_e, cx) => {
        const n = Number(state.value().trim());
        const was = this.classifier?.thresholds?.[t.key];
        if (!Number.isFinite(n) || n < 0 || n > 1) {
          if (was !== undefined) state.set_value(String(was));
          return;
        }
        if (n !== was) this.config({ thresholds: { [t.key]: n } }, cx);
      };
      state.on("submit", save);
      state.on("blur", save);
      this.thresholdInputs[t.key] = state;
    }

    this.sync();
    this.loadKnown(cx);
    this.loadConfig(cx);
    this.loadAccess(cx);
    cx.timer.every(60000, (cx) => this.loadKnown(cx));
  }

  // ── Data ───────────────────────────────────────────────────────────────────────────────────

  loadKnown(cx) {
    cx.spawn(async (cx) => {
      try {
        this.known = await knownAgents({ on: currentSpace()?.machine ?? null });
      } catch {
        this.known = [];
      }
      this.sync();
      for (const h of new Set(this.list().map((a) => a.harness))) this.askModels(h, cx);
      // The bh tool starts agents by these commands: keep its copy current.
      const now = JSON.stringify(this.knownForBh());
      if (now !== this.knownSaved) {
        this.knownSaved = now;
        this.persist(cx);
      }
      cx.notify();
    });
  }

  knownForBh() {
    return this.known.map((k) => ({ key: k.key, name: k.name, run: k.run, installed: k.installed }));
  }

  loadConfig(cx) {
    cx.spawn(async (cx) => {
      const got = await bhJson(["config"]);
      if (got) this.showConfig(got);
      cx.notify();
    });
  }

  showConfig(got) {
    this.classifier = got;
    const routing = Boolean(got.enabled && got.keyFound && got.features?.lobby !== false);
    if (Boolean(shared(ROUTING_KEY)) !== routing) setShared(ROUTING_KEY, routing);
    this.modelInput.set_value(got.model ?? "");
    for (const t of THRESHOLDS) this.thresholdInputs[t.key].set_value(String(got.thresholds?.[t.key] ?? ""));
  }

  config(patch, cx) {
    if (this.classifier) this.classifier = { ...this.classifier, ...patch, features: { ...this.classifier.features, ...(patch.features ?? {}) }, thresholds: { ...this.classifier.thresholds, ...(patch.thresholds ?? {}) } };
    cx.notify();
    cx.spawn(async (cx) => {
      const got = await bhJson(["config", "--data", enc(patch)]);
      if (got) this.showConfig(got);
      else this.problem = "Couldn't save the classifier settings. Is node on your PATH?";
      cx.notify();
    });
  }

  loadAccess(cx) {
    cx.spawn(async (cx) => {
      const got = await bhJson(["access"]);
      if (got) this.showAccess(got);
      cx.notify();
    });
  }

  showAccess(got) {
    this.access = got;
    this.allowInput.set_value((got.allow ?? []).join(", "));
    const on = got.headless !== false;
    if (shared(HEADLESS_KEY) !== on) setShared(HEADLESS_KEY, on);
  }

  setAccess(patch, cx) {
    if (this.access) this.access = { ...this.access, ...patch, ...(typeof patch.allow === "string" ? { allow: patch.allow.split(",").map((x) => x.trim()).filter(Boolean) } : {}) };
    cx.notify();
    cx.spawn(async (cx) => {
      const got = await bhJson(["access", "--data", enc(patch)]);
      if (got) this.showAccess(got);
      else this.problem = "Couldn't save how agents run. Is node on your PATH?";
      cx.notify();
    });
  }

  saveKey(cx) {
    const key = this.keyInput.value().trim();
    if (!key) return;
    this.keyInput.set_value("");
    this.config({ key }, cx);
  }

  list() {
    return roster(shared(ROSTER_KEY), this.known);
  }

  save(list, cx) {
    setShared(ROSTER_KEY, list);
    this.persist(cx);
  }

  /** Writes the roster for bh (and its templates) once the typing stops. */
  persist(cx) {
    const gen = ++this.saveGen;
    cx.timer.after(600, (cx) => {
      if (gen !== this.saveGen) return;
      cx.spawn(async (cx) => {
        const r = await bh(["team", "save", "--data", enc({ agents: this.list(), known: this.knownForBh() })]);
        this.problem = r.code === 0 ? null : `Couldn't save the team for the agents: ${(r.stderr || r.stdout || "node didn't run").trim().split("\n")[0]}`;
        cx.notify();
      });
    });
  }

  change(id, patch, cx) {
    this.save(this.list().map((a) => (a.id === id ? { ...a, ...patch } : a)), cx);
    cx.notify();
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
          if (f.key === "name" && (!value.trim() || now.role !== "custom")) return;
          this.change(a.id, { [f.key]: f.key === "name" ? value : value.trim() }, cx);
        });
        set[f.key] = state;
      }
      this.inputs[a.id] = set;
    }
    for (const id of Object.keys(this.inputs)) if (!list.some((a) => a.id === id)) delete this.inputs[id];
  }

  add(cx) {
    const list = this.list();
    this.save([...list, blank(list, this.known)], cx);
    this.sync();
    cx.notify();
  }

  remove(id, cx) {
    this.save(this.list().filter((a) => a.id !== id), cx);
    this.sync();
    cx.notify();
  }

  /** Opens a field's list as a popup under it; the pick comes back through shared state. */
  openList(a, field, bounds) {
    const key = `${a.id}:${field}`;
    this.open = key;
    if (field === "harness") {
      const shown = this.known.filter((k) => k.installed || k.key === a.harness);
      if (!shown.some((k) => k.key === a.harness)) shown.unshift({ key: a.harness, name: a.harness, installed: false });
      openPick({ key, bounds, selected: a.harness, options: shown.map((k) => ({ value: k.key, label: k.name, note: k.installed ? "" : "not installed" })) });
      return;
    }
    const own = modelsOf(a.harness);
    const listed = (this.listed[a.harness] ?? []).filter((id) => !own.some((m) => m.id === id));
    const row = (m) => ({ value: m.id, label: m.name, note: m.name !== m.id ? m.id : "" });
    const options = [{ value: "", label: "The harness's default" }, ...own.filter((m) => m.current).map(row)];
    if (listed.length) options.push({ heading: own.length ? "Your providers" : "Models it lists" }, ...listed.map((id) => ({ value: id, label: id })));
    const older = own.filter((m) => !m.current);
    if (older.length) options.push({ heading: "Older" }, ...older.map(row));
    if (a.model && !options.some((o) => o.value === a.model)) options.splice(1, 0, { value: a.model, label: a.model, note: "typed" });
    openPick({ key, bounds, selected: a.model, options });
  }

  /** A pick from a list (pick.js), applied once. */
  applyPick(cx) {
    const picked = shared(PICKED);
    if (!picked?.at || picked.at <= this.pickedAt) return;
    this.pickedAt = picked.at;
    const [id, field] = String(picked.key ?? "").split(":");
    const a = this.list().find((x) => x.id === id);
    this.open = null;
    if (!a) return;
    if (field === "harness") this.pickHarness(a, picked.value, cx);
    if (field === "model") this.pickModel(a, picked.value, cx);
  }

  /** pi and Oh My Pi print their models (every provider you set up): ask once per harness. */
  askModels(harness, cx) {
    const h = harnessOf(harness);
    if (!h.lists || this.listed[harness] || this.listing[harness]) return;
    const run = this.known.find((k) => k.key === harness)?.run ?? [harness];
    this.listing[harness] = true;
    cx.spawn(async (cx) => {
      try {
        const r = await exec(run[0], [...run.slice(1), ...h.lists], { timeout: 20000, on: currentSpace()?.machine ?? null });
        this.listed[harness] = parseModelList(`${r.stdout}\n${r.stderr}`);
      } catch {
        this.listed[harness] = [];
      }
      this.listing[harness] = false;
      cx.notify();
    });
  }

  pickModel(a, id, cx) {
    this.inputs[a.id]?.model.set_value(id);
    const efforts = effortsOf(a.harness, id);
    this.change(a.id, { model: id, effort: efforts.includes(a.effort) ? a.effort : "" }, cx);
    this.open = null;
  }

  pickHarness(a, key, cx) {
    // Another harness has its own models and effort levels: keep only what it has too.
    const keepModel = modelsOf(key).some((m) => m.id === a.model) || (!modelsOf(key).length && !modelsOf(a.harness).length);
    const model = keepModel ? a.model : "";
    this.inputs[a.id]?.model.set_value(model);
    this.change(a.id, { harness: key, model, effort: effortsOf(key, model).includes(a.effort) ? a.effort : "" }, cx);
    this.open = null;
  }

  addHarness(cx) {
    const f = this.harnessForm;
    const key = slug(f.key.value());
    const run = f.run.value().trim();
    if (!f.key.value().trim() || !run) {
      this.problem = "A harness needs a short key and the command that starts it.";
      cx.notify();
      return;
    }
    cx.spawn(async (cx) => {
      const r = await bh(["harness", "add", key, "--name", f.name.value().trim() || key, "--run", run]);
      if (r.code === 0) {
        for (const s of Object.values(f)) s.set_value("");
        this.problem = null;
        notify({ title: "Harness added", body: `${key} shows up in the harness lists within a minute.`, level: "success", timeout: 4000 });
        cx.timer.after(1500, (cx) => this.loadKnown(cx));
      } else this.problem = `Couldn't add it: ${(r.stderr || r.stdout).trim().split("\n")[0]}`;
      cx.notify();
    });
  }

  slide(a, stops, e, cx) {
    const b = this.drag?.bounds ?? e.bounds;
    if (!b?.width) return;
    const ratio = Math.max(0, Math.min(1, (e.position.x - b.x - KNOB / 2) / Math.max(1, b.width - KNOB)));
    const value = stops[Math.round(ratio * (stops.length - 1))];
    if (value !== a.effort) this.change(a.id, { effort: value }, cx);
  }

  // ── Drawing ────────────────────────────────────────────────────────────────────────────────

  render(cx) {
    if ((shared(PICKED)?.at ?? 0) > this.pickedAt) cx.timer.after(1, (cx) => this.applyPick(cx));
    const c = settings().dark ? DARK : LIGHT;
    const list = this.list().filter((a) => this.inputs[a.id]);
    const content = Math.max(MIN_CARD, Math.min(MAX, this.width - SIZE.gutter * 2));
    const cols = content >= MIN_CARD * 3 + GAP * 2 ? 3 : content >= MIN_CARD * 2 + GAP ? 2 : 1;
    const cardW = Math.floor((content - GAP * (cols - 1)) / cols);
    const running = agents();
    const space = currentSpace()?.id ?? null;
    const rows = [];
    for (let i = 0; i < list.length; i += cols) rows.push(list.slice(i, i + cols));
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
              .w(content)
              .py(24)
              .gap(GAP)
              .child(this.heading(c, "Agents", "Each agent runs on a harness with a model and an effort level. The Orchestrator gets every message that names no one and hands work to the others; reach any of them with @name. A change applies to an agent's next message when it runs headless, or the next time it starts."))
              .when(Boolean(this.problem), (el) => el.child(div().text_size(12.5).text_color(c.danger).child(this.problem)))
              .children(rows.map((row, r) =>
                h_flex().id(`bh-row-${r}`).flex_none().gap(GAP).items_start().children(row.map((a) => this.card(c, a, cardW, running, space)))))
              .child(
                h_flex()
                  .gap(12)
                  .items_center()
                  .child(this.button(c, "bh-add", "plus", "Add agent", (_e, cx) => this.add(cx)))
                  .child(div().text_size(12).text_color(c.faint).child("Your own agents sit beside the six: give one a name, a harness and a model.")),
              )
              .child(div().h(14))
              .child(this.accessCard(c))
              .child(div().h(14))
              .child(this.harnesses(c))
              .child(div().h(14))
              .child(this.classifierCard(c)),
          ),
      );
  }

  heading(c, title, about) {
    return v_flex()
      .gap(4)
      .child(div().text_size(19).font_semibold().child(title))
      .when(Boolean(about), (el) => el.child(div().text_size(13).text_color(c.muted).child(about)));
  }

  label(c, text, right = null) {
    return h_flex()
      .h(18)
      .items_center()
      .justify_between()
      .text_size(11.5)
      .font_medium()
      .text_color(c.muted)
      .child(div().child(text))
      .when(right !== null, (el) => el.child(div().text_color(c.ink).child(right)));
  }

  card(c, a, width, running, space) {
    const inputs = this.inputs[a.id];
    const role = roleOf(a.role);
    const ok = runnable(a, this.known);
    const live = runningAs(a, running, space);
    const inner = width - PAD * 2;
    const harnessName = this.known.find((k) => k.key === a.harness)?.name ?? a.harness;
    const efforts = effortsOf(a.harness, a.model);
    const stops = ["", ...efforts];
    const state = ok ? (live ? "running" : "") : "not installed";
    return v_flex()
      .id(`bh-agent-${a.id}`)
      .flex_none()
      .w(width)
      .p(PAD)
      .gap(10)
      .rounded(SIZE.radius)
      .bg(c.fill)
      .border_1()
      .border_color(c.edge)
      .child(
        h_flex()
          .h(28)
          .gap(8)
          .items_center()
          .child(a.role === "custom"
            ? this.field(c, inputs.name, { bold: true })
            : div().flex_1().min_w(0).truncate().text_size(15).font_semibold().child(a.name))
          .when(Boolean(state), (el) => el.child(div().flex_none().text_size(11.5).text_color(ok ? c.accent : c.danger).child(state)))
          .when(a.role === "custom", (el) => el.child(this.iconButton(c, `bh-del-${a.id}`, "x", (_e, cx) => this.remove(a.id, cx), true))),
      )
      .child(div().min_h(34).text_size(12.5).text_color(c.muted).child(role?.does ?? "An agent you added. It works on what you send it with @name."))
      .child(v_flex().gap(5).child(this.label(c, "Harness")).child(this.select(c, a, "harness", harnessName, inner)))
      .child(v_flex().gap(5).child(this.label(c, "Model")).child(this.modelField(c, a, inputs.model, inner)))
      .child(v_flex().gap(5)
        .child(this.label(c, "Effort", efforts.length ? (a.effort || "Default") : null))
        .child(efforts.length
          ? this.slider(c, a, stops, inner)
          : div().text_size(12).text_color(c.faint).child("No effort flag we know for this harness; use extra arguments.")))
      .child(v_flex().gap(5).child(this.label(c, "Extra arguments")).child(this.field(c, inputs.args)))
      .child(
        div()
          .pt(2)
          .truncate()
          .text_size(11.5)
          .text_color(c.faint)
          .child(`${a.lead ? "Plain messages" : `@${slug(a.name)}`} · ${argvOf(a, this.known).join(" ")}`),
      );
  }

  field(c, state, { bold = false } = {}) {
    return div()
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
      .child(Input.new(state).w_full().h_full().text_size(bold ? 14 : 13).text_color(c.ink));
  }

  select(c, a, field, value, width) {
    const open = false;
    return h_flex()
      .id(`bh-sel-${a.id}-${field}`)
      .w(width)
      .h(32)
      .px(10)
      .gap(8)
      .items_center()
      .rounded(SIZE.control)
      .bg(c.ground)
      .border_1()
      .border_color(open ? c.accent : c.edge)
      .cursor_pointer()
      .hover((s) => s.border_color(c.accent))
      .on_mouse_down("left", (e, cx) => {
        cx.stop_propagation();
        this.openList(a, field, e.bounds);
        cx.notify();
      })
      .child(div().flex_1().min_w(0).truncate().text_size(13).child(value))
      .child(svg(ICON("chevron-down")).size(14).text_color(c.muted));
  }

  modelField(c, a, state, inner) {
    const open = false; // the list is a popup now; the field stays as it is
    return h_flex()
      .h(32)
      .pl(10)
      .pr(4)
      .gap(4)
      .items_center()
      .rounded(SIZE.control)
      .bg(c.ground)
      .border_1()
      .border_color(open ? c.accent : c.edge)
      .child(div().flex_1().min_w(0).h_full().child(Input.new(state).w_full().h_full().text_size(13).text_color(c.ink)))
      .child(
        div()
          .id(`bh-models-${a.id}`)
          .size(24)
          .flex_none()
          .flex()
          .items_center()
          .justify_center()
          .rounded(6)
          .cursor_pointer()
          .hover((s) => s.bg(c.hover))
          .on_mouse_down("left", (e, cx) => {
            cx.stop_propagation();
            // Under the whole field, not just the arrow.
            const b = e.bounds;
            const field = b ? { x: b.x - (inner - 28) * (Number(settings().zoom) || 1), y: b.y - 4, width: inner * (Number(settings().zoom) || 1), height: b.height + 8 } : null;
            this.openList(a, "model", field);
            cx.notify();
          })
          .child(svg(ICON("chevron-down")).size(14).text_color(c.muted)),
      );
  }

  slider(c, a, stops, width) {
    const n = stops.length;
    const at = Math.max(0, stops.indexOf(a.effort));
    const span = width - KNOB;
    const x = (i) => KNOB / 2 + (n > 1 ? (span * i) / (n - 1) : 0);
    return div()
      .id(`bh-eff-${a.id}`)
      .relative()
      .w(width)
      .h(26)
      .cursor_pointer()
      .on_mouse_down("left", (e, cx) => {
        cx.stop_propagation();
        this.drag = { id: a.id, bounds: e.bounds };
        this.slide(a, stops, e, cx);
      })
      .on_mouse_move((e, cx) => {
        if (this.drag?.id === a.id) this.slide(a, stops, e, cx);
      })
      .on_mouse_up("left", (_e, cx) => {
        this.drag = null;
        cx.notify();
      })
      .on_hover((hovered, cx) => {
        if (!hovered && this.drag?.id === a.id) {
          this.drag = null;
          cx.notify();
        }
      })
      .child(div().absolute().left(KNOB / 2).w(span).top(11).h(4).rounded(2).bg(c.well))
      .child(div().absolute().left(KNOB / 2).w(x(at) - KNOB / 2).top(11).h(4).rounded(2).bg(c.accent))
      .children(stops.map((_s, i) => div().absolute().left(x(i) - 2).top(11).size(4).rounded(2).bg(i <= at ? c.accentInk : c.faint).opacity(i === at ? 0 : 0.7)))
      .child(
        div()
          .absolute()
          .left(x(at) - KNOB / 2)
          .top(5)
          .size(KNOB)
          .rounded(KNOB / 2)
          .bg(c.fill)
          .border(2)
          .border_color(c.accent),
      );
  }

  harnesses(c) {
    const installed = this.known.filter((k) => k.installed).map((k) => k.name);
    const f = this.harnessForm;
    const col = (label, state, w) => v_flex().gap(5).w(w).child(this.label(c, label)).child(this.field(c, state));
    return v_flex()
      .gap(GAP)
      .child(this.heading(c, "Harnesses", installed.length ? `herdr found ${installed.join(", ")} on your PATH. Add one it doesn't know by the command that starts it; models and effort for it then go in each agent's card.` : "herdr found no agent harness on your PATH yet. Add one by the command that starts it."))
      .child(
        h_flex()
          .p(PAD)
          .gap(10)
          .items_end()
          .rounded(SIZE.radius)
          .bg(c.fill)
          .border_1()
          .border_color(c.edge)
          .child(col("Key", f.key, 130))
          .child(col("Name", f.name, 180))
          .child(v_flex().flex_1().min_w(0).gap(5).child(this.label(c, "Command")).child(this.field(c, f.run)))
          .child(this.button(c, "bh-add-harness", "plus", "Add harness", (_e, cx) => this.addHarness(cx))),
      );
  }

  accessCard(c) {
    const k = this.access;
    if (!k) return this.heading(c, "How agents run", "Loading… (it needs node on your PATH).");
    const on = k.headless !== false;
    const full = k.access === "full";
    const quiet = this.known.filter((h) => h.installed && HEADLESS[h.key]).map((h) => h.name);
    const row = (label, chips, about, danger = false) => v_flex()
      .gap(6)
      .child(this.label(c, label))
      .child(h_flex().flex_wrap().gap(6).children(chips))
      .child(div().text_size(12).text_color(danger ? c.danger : c.muted).child(about));
    return v_flex()
      .gap(GAP)
      .child(this.heading(c, "How agents run", "Headless, each message runs the harness on its own and the answer comes straight back to the chat. The agent's terminal still shows what it does, and /cli there opens the full CLI on the same conversation."))
      .child(
        v_flex()
          .p(PAD)
          .gap(16)
          .rounded(SIZE.radius)
          .bg(c.fill)
          .border_1()
          .border_color(c.edge)
          .child(row("Run agents", [
            this.chip(c, "bh-run-headless", "Headless", on, (_e, cx) => this.setAccess({ headless: true }, cx)),
            this.chip(c, "bh-run-cli", "As their CLI", !on, (_e, cx) => this.setAccess({ headless: false }, cx)),
          ], on
            ? `Headless works for ${quiet.length ? quiet.join(", ") : "Claude Code, Codex, pi, Oh My Pi, Gemini, opencode and Qwen Code"}. Any other harness runs as its CLI.`
            : "Each agent is its harness's own CLI in a terminal. A reply reaches the chat only when the agent writes one with bh reply."))
          .child(row("Access", [
            this.chip(c, "bh-access-standard", "Standard", !full, (_e, cx) => this.setAccess({ access: "standard" }, cx)),
            this.chip(c, "bh-access-full", "Full access", full, (_e, cx) => this.setAccess({ access: "full" }, cx)),
          ], full
            ? "Agents run any command and change any file without asking. Use it only in a folder or on a machine you're happy to let them loose in."
            : "Agents edit files in the project, read and search, run bh (which runs the project's lint, typecheck and tests) and hc, and read git. Anything else is refused and the agent tells you what it needed.", full))
          .when(!full, (el) => el.child(
            v_flex()
              .gap(5)
              .child(this.label(c, "Also allow these commands"))
              .child(this.field(c, this.allowInput))
              .child(div().text_size(11.5).text_color(c.faint).child("Comma separated; each allows that command and anything after it. Claude Code, Gemini, opencode and Qwen Code follow this list. Codex runs commands in its workspace sandbox; pi and Oh My Pi have no permission system and run as they would in a terminal.")),
          )),
      );
  }

  classifierCard(c) {
    const k = this.classifier;
    if (!k) return this.heading(c, "Classifier", "Loading… (it needs node on your PATH).");
    const hosts = k.hosts ?? {};
    const using = hosts[k.using]?.label ?? k.using;
    const status = !k.enabled ? "Off: plain rules make these calls." : k.keyFound ? `On, using ${using}.` : `On, but no key found: paste one or set ${hosts[k.using]?.env ?? "a key"}.`;
    return v_flex()
      .gap(GAP)
      .child(this.heading(c, "Classifier", "A fast model makes the small calls so the agents don't spend tokens on them: who answers a message, a task's size and track, each step's effort, how deep QA goes and which shared scripts help."))
      .child(
        v_flex()
          .p(PAD)
          .gap(14)
          .rounded(SIZE.radius)
          .bg(c.fill)
          .border_1()
          .border_color(c.edge)
          .child(
            h_flex()
              .gap(10)
              .items_center()
              .child(this.toggle(c, "bh-cls-on", k.enabled, (_e, cx) => this.config({ enabled: !k.enabled }, cx)))
              .child(div().text_size(13).text_color(k.enabled && !k.keyFound ? c.danger : c.ink).child(status)),
          )
          .child(v_flex().gap(5).child(this.label(c, "Host")).child(
            h_flex().flex_wrap().gap(6).children(HOST_ORDER.filter((h) => h === "auto" || hosts[h]).map((h) =>
              this.chip(c, `bh-host-${h}`, h === "auto" ? "Auto" : hosts[h].label, k.host === h, (_e, cx) => this.config({ host: h }, cx)))),
          ))
          .child(
            h_flex()
              .gap(10)
              .items_end()
              .child(v_flex().flex_1().min_w(0).gap(5).child(this.label(c, "Key", k.key ? "set" : "not set")).child(this.field(c, this.keyInput)))
              .child(v_flex().flex_1().min_w(0).gap(5).child(this.label(c, "Model")).child(this.field(c, this.modelInput))),
          )
          .child(v_flex().gap(5).child(this.label(c, "Use it for")).child(
            h_flex().flex_wrap().gap(6).children(FEATURES.map((f) =>
              this.chip(c, `bh-feat-${f.key}`, f.label, k.features?.[f.key] !== false, (_e, cx) => this.config({ features: { [f.key]: k.features?.[f.key] === false } }, cx)))),
          ))
          .child(
            h_flex().gap(10).children(THRESHOLDS.map((t) =>
              v_flex().flex_1().min_w(0).gap(5).child(this.label(c, t.label)).child(div().w(84).child(this.field(c, this.thresholdInputs[t.key]))))),
          )
          .child(div().text_size(11.5).text_color(c.faint).child("Thresholds are the classifier's confidence, 0 to 1. The effort set on each agent is the ceiling: routing only lowers it.")),
      );
  }

  toggle(c, id, on, onClick) {
    return div()
      .id(id)
      .relative()
      .flex_none()
      .w(36)
      .h(20)
      .rounded(10)
      .cursor_pointer()
      .bg(on ? c.accent : c.well)
      .border_1()
      .border_color(on ? c.accentLip : c.edge)
      .on_click(onClick)
      .child(div().absolute().top(1).left(on ? 17 : 1).size(16).rounded(8).bg(c.fill));
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

  iconButton(c, id, icon, onClick, danger = false) {
    return div()
      .id(id)
      .size(26)
      .flex_none()
      .flex()
      .items_center()
      .justify_center()
      .rounded(SIZE.nested)
      .text_color(c.muted)
      .cursor_pointer()
      .hover((s) => s.bg(c.hover).text_color(danger ? c.danger : c.ink))
      .on_click(onClick)
      .child(svg(ICON(icon)).size(14));
  }

  button(c, id, icon, label, onClick) {
    return h_flex()
      .id(id)
      .flex_none()
      .h(32)
      .px(14)
      .gap(6)
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
      .when(Boolean(icon), (el) => el.child(svg(ICON(icon)).size(14).text_color(c.accentInk)))
      .child(label);
  }
}

export { ROLES };
