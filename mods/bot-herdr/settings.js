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
import { v_flex, h_flex, InputState, Input, TextareaState, Textarea } from "gpui-base";
import { agents, panes, spaces, settings, shared, setShared, knownAgents, notify } from "herdr";
import { SIZE, ICON, TYPE, SPACE, CONTROL, CHIP, MARK, PIP, HAIR, GLYPH, clickable, pressable, focusable } from "./look.js";
import { stateView } from "./switch.js";
import { colors } from "./theme.js";
import { ROSTER_KEY, HEADLESS_KEY, HEADLESS, ROLES, roster, roleOf, argvOf, runnable, runningAs, effortsOf, modelsOf, blank, slug } from "./roster.js";
import { bh, bhJson, enc, currentSpace, ROUTING_KEY } from "./bh.js";
import { PICKED, REFRESH, openPick } from "./pick.js";
import { withQuiet } from "./live.js";

const GAP = 14; // between cards
const MAX = 1140; // the page's widest
const MIN_CARD = 280; // a card's narrowest before the grid drops a column
const PAD = 14; // inside a card
const KNOB = 16;

/** What `bh models` said, per harness, for this session: the picker asks a harness once. */
const MODEL_CACHE = new Map();
const NO_MODELS = "This harness could not be asked for its models; type a model id.";

const FIELDS = [
  { key: "name", placeholder: "Name" },
  { key: "model", placeholder: "The harness's default" },
  { key: "args", placeholder: "Flags only, e.g. --verbose" },
  { key: "instructions", placeholder: "What this agent should always do, in plain words", rows: 3 },
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
/** The classifier's choices without a harness: the engine's `kind`. */
const KINDS = [
  { kind: "jev", value: "kind|jev", label: "Jev", note: "TypeSafe System One" },
  { kind: "laya", value: "kind|laya", label: "Laya", note: "TypeSafe System One, or your own base URL" },
  { kind: "clef", value: "kind|clef", label: "Clef", note: "Cloudflare Workers AI: needs an account id" },
  { kind: "rules", value: "kind|rules", label: "Rules only", note: "no model: the built-in rules decide" },
];
const kindOf = (kind) => KINDS.find((k) => k.kind === kind) ?? null;

export class Settings {
  init(_props, cx) {
    this.known = [];
    this.knownSaved = "";
    this.inputs = {}; // agent id → { name, model, args, instructions }
    this.open = null; // "<id>:harness" or "<id>:model": the field whose list is open
    this.pickedAt = shared(PICKED)?.at ?? 0;
    this.refreshedAt = shared(REFRESH)?.at ?? 0;
    this.asking = {}; // harness → true while `bh models` runs for it
    this.waiting = {}; // harness → what to do with the answer (reopen its list)
    this.pickBounds = null; // where the open list's field sits, to reopen it after a refresh
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
    // Clef's account id and Laya's base URL, saved as typed (on Enter or leaving the field).
    this.accountIdInput = InputState.new({ placeholder: "Your Cloudflare account id" });
    this.baseUrlInput = InputState.new({ placeholder: "The default base URL" });
    for (const [state, field] of [[this.accountIdInput, "accountId"], [this.baseUrlInput, "baseUrl"]]) {
      const save = (_e, cx) => {
        const v = state.value().trim();
        if (this.classifier && v !== (this.classifier[field] ?? "")) this.config({ [field]: v }, cx);
      };
      state.on("submit", save);
      state.on("blur", save);
    }
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
    this.accountIdInput.set_value(got.accountId ?? "");
    this.baseUrlInput.set_value(got.baseUrl ?? "");
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
        const options = { value: a[f.key] ?? "", placeholder: f.placeholder };
        const state = f.rows ? TextareaState.new({ ...options, rows: f.rows }) : InputState.new(options);
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
  openList(a, field, bounds, cx) {
    const key = `${a.id}:${field}`;
    this.open = key;
    if (field === "harness") {
      const shown = this.known.filter((k) => k.installed || k.key === a.harness);
      if (!shown.some((k) => k.key === a.harness)) shown.unshift({ key: a.harness, name: a.harness, installed: false });
      openPick({ key, bounds, selected: a.harness, options: shown.map((k) => ({ value: k.key, label: k.name, note: k.installed ? "" : "not installed" })) });
      return;
    }
    // Model lists come from this machine (`bh models`), so a space on another machine types one.
    if (currentSpace()?.machine) return;
    this.pickBounds = bounds;
    const name = this.harnessName(a.harness);
    const got = MODEL_CACHE.get(a.harness);
    if (!got) {
      this.ask(a.harness, cx, { then: () => this.openList(a, "model", bounds, cx) });
      openPick({ key, bounds, selected: a.model, loading: true, options: [] });
      return;
    }
    openPick({
      key,
      bounds,
      selected: a.model,
      header: got.source === "harness" ? `From ${name}` : "Built-in list",
      error: got.error ?? null,
      refreshable: true,
      options: this.modelOptions(a, got),
    });
  }

  harnessName(key) {
    return this.known.find((k) => k.key === key)?.name ?? key;
  }

  /** The list the popup shows: the default, what the harness reports, and a typed id. */
  modelOptions(a, got) {
    const row = (m) => ({ value: m.id, label: m.name ?? m.id, note: m.name && m.name !== m.id ? m.id : "" });
    const options = [{ value: "", label: "The harness's default" }, ...(got.models ?? []).map(row)];
    if (a.model && !options.some((o) => o.value === a.model)) options.splice(1, 0, { value: a.model, label: a.model, note: "typed" });
    return options;
  }

  /** The classifier's model: one of an installed harness's models, or a kind that needs none. */
  openClassifierModels(bounds) {
    const k = this.classifier;
    const can = k?.harnesses ?? [];
    const options = [];
    for (const h of this.known.filter((x) => x.installed && can.includes(x.key))) {
      options.push({ heading: h.name });
      options.push({ value: `${h.key}|`, label: `${h.name} · its default model` });
      for (const m of modelsOf(h.key).filter((m) => m.current)) options.push({ value: `${h.key}|${m.id}`, label: m.name, note: m.id !== m.name ? m.id : "" });
    }
    if (!options.length) options.push({ heading: "No installed harness can run it (Claude Code, Codex, Gemini or Qwen Code)" });
    options.push({ heading: "Without a harness" }, ...KINDS.map((x) => ({ value: x.value, label: x.label, note: x.note })));
    const selected = kindOf(k?.kind) ? `kind|${k.kind}` : k?.harness ? `${k.harness}|${k.harnessModel ?? ""}` : "";
    this.open = "classifier:model";
    openPick({ key: "classifier:model", bounds, selected, options, minWidth: 300 });
  }

  /** A pick from a list (pick.js), applied once. */
  applyPick(cx) {
    const picked = shared(PICKED);
    if (!picked?.at || picked.at <= this.pickedAt) return;
    this.pickedAt = picked.at;
    if (picked.key === "classifier:model") {
      const [harness, ...model] = String(picked.value ?? "").split("|");
      this.open = null;
      if (harness === "kind") return this.config({ kind: model.join("|"), harness: "" }, cx);
      return this.config({ kind: "", harness, harnessModel: model.join("|") }, cx);
    }
    const [id, field] = String(picked.key ?? "").split(":");
    const a = this.list().find((x) => x.id === id);
    this.open = null;
    if (!a) return;
    if (field === "harness") this.pickHarness(a, picked.value, cx);
    if (field === "model") this.pickModel(a, picked.value, cx);
  }

  /** Asks `bh models` for a harness (once per session, or again with --refresh); waiters run after. */
  ask(harness, cx, { refresh = false, then = null } = {}) {
    if (then) (this.waiting[harness] ??= []).push(then);
    if (this.asking[harness]) return;
    this.asking[harness] = true;
    const run = this.known.find((k) => k.key === harness)?.run ?? [harness];
    cx.spawn(async (cx) => {
      const got = await this.fetchModels(harness, run[0], refresh);
      MODEL_CACHE.set(harness, got);
      this.asking[harness] = false;
      const waiting = this.waiting[harness] ?? [];
      delete this.waiting[harness];
      for (const w of waiting) w(got);
      cx.notify();
    });
  }

  /** What `bh models` printed, or the shape of a failure: no models and one plain sentence. */
  async fetchModels(harness, command, refresh) {
    const args = ["models", harness];
    if (command) args.push("--command", command);
    if (refresh) args.push("--refresh");
    const got = await bhJson(args, { timeout: 60000 });
    return got ?? { harness, source: "builtin", method: "none", models: [], error: NO_MODELS };
  }

  /** The refresh button in the open list: ask again, then show the new list under the same field. */
  applyRefresh(cx) {
    const asked = shared(REFRESH);
    this.refreshedAt = asked?.at ?? 0;
    const [id, field] = String(asked?.key ?? "").split(":");
    const a = this.list().find((x) => x.id === id);
    if (!a || field !== "model" || currentSpace()?.machine) return;
    this.open = `${a.id}:model`;
    this.ask(a.harness, cx, { refresh: true, then: () => this.openList(a, "model", this.pickBounds, cx) });
  }

  /** The effort levels the model reports, else what the harness takes (roster.js). */
  effortsFor(harness, model) {
    const listed = MODEL_CACHE.get(harness)?.models?.find((m) => m.id === model);
    if (listed?.efforts?.length) return listed.efforts;
    return effortsOf(harness, model);
  }

  pickModel(a, id, cx) {
    this.inputs[a.id]?.model.set_value(id);
    const efforts = this.effortsFor(a.harness, id);
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
    if (!currentSpace()?.machine) this.ask(key, cx);
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
    if ((shared(REFRESH)?.at ?? 0) > this.refreshedAt) cx.timer.after(1, (cx) => this.applyRefresh(cx));
    const c = colors();
    const list = this.list().filter((a) => this.inputs[a.id]);
    const content = Math.max(MIN_CARD, Math.min(MAX, this.width - SIZE.gutter * 2));
    const cols = content >= MIN_CARD * 3 + GAP * 2 ? 3 : content >= MIN_CARD * 2 + GAP ? 2 : 1;
    const cardW = Math.floor((content - GAP * (cols - 1)) / cols);
    const running = withQuiet({ agents: agents(), panes: panes(), spaces: spaces() });
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
              .py(SPACE[5])
              .gap(GAP)
              .child(this.heading(c, "Agents", "Each agent runs on a harness with a model and an effort level. The Orchestrator gets every message that names no one and hands work to the others; reach any of them with @name. A change applies to an agent's next message when it runs headless, or the next time it starts."))
              .when(Boolean(this.problem), (el) => el.child(div().text_size(TYPE.sm).text_color(c.danger).child(this.problem)))
              .children(rows.map((row, r) =>
                h_flex().id(`bh-row-${r}`).flex_none().gap(GAP).items_start().children(row.map((a) => this.card(c, a, cardW, running, space)))))
              .child(
                h_flex()
                  .gap(SPACE[4])
                  .items_center()
                  .child(this.button(c, "bh-add", "plus", "Add agent", (_e, cx) => this.add(cx)))
                  .child(div().text_size(TYPE.sm).text_color(c.faint).child("Your own agents sit beside the six: give one a name, a harness and a model.")),
              )
              .child(div().h(MARK))
              .child(this.accessCard(c))
              .child(div().h(MARK))
              .child(this.harnesses(c))
              .child(div().h(MARK))
              .child(this.classifierCard(c)),
          ),
      );
  }

  heading(c, title, about) {
    return v_flex()
      .gap(SPACE[2])
      .child(div().text_size(TYPE.xl).font_semibold().child(title))
      .when(Boolean(about), (el) => el.child(div().text_size(TYPE.md).text_color(c.muted).child(about)));
  }

  label(c, text, right = null) {
    return h_flex()
      .h(CHIP)
      .items_center()
      .justify_between()
      .text_size(TYPE.xs)
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
    const efforts = this.effortsFor(a.harness, a.model);
    const stops = ["", ...efforts];
    const state = ok ? (live ? "running" : "") : "not installed";
    return v_flex()
      .id(`bh-agent-${a.id}`)
      .flex_none()
      .w(width)
      .p(PAD)
      .gap(SPACE[3])
      .rounded(SIZE.radius)
      .bg(c.fill)
      .border_1()
      .border_color(c.edge)
      .child(
        h_flex()
          .h(CONTROL)
          .gap(SPACE[3])
          .items_center()
          .child(a.role === "custom"
            ? this.field(c, inputs.name)
            : div().flex_1().min_w(0).truncate().text_size(TYPE.lg).font_semibold().child(a.name))
          .when(Boolean(state), (el) => el.child(div().flex_none().text_size(TYPE.xs).text_color(ok ? c.accent : c.danger).child(state)))
          .when(a.role === "custom", (el) => el.child(this.iconButton(c, `bh-del-${a.id}`, "x", (_e, cx) => this.remove(a.id, cx), true))),
      )
      .child(div().min_h(34).text_size(TYPE.sm).text_color(c.muted).child(role?.does ?? "An agent you added. It works on what you send it with @name."))
      .child(v_flex().gap(SPACE[2]).child(this.label(c, "Harness")).child(this.select(c, a, "harness", harnessName, inner)))
      .child(v_flex().gap(SPACE[2]).child(this.label(c, "Model")).child(this.modelField(c, a, inputs.model, inner))
        .when(Boolean(currentSpace()?.machine), (el) => el.child(div().text_size(TYPE.xs).text_color(c.faint).child("Model lists come from this machine; type a model id for this space."))))
      .child(v_flex().gap(SPACE[2])
        .child(this.label(c, "Effort", efforts.length ? (a.effort || "Default") : null))
        .child(efforts.length
          ? this.slider(c, a, stops, inner)
          : div().text_size(TYPE.sm).text_color(c.faint).child("No effort flag we know for this harness; use extra arguments.")))
      .child(v_flex().gap(SPACE[2]).child(this.label(c, "Extra arguments")).child(this.field(c, inputs.args)))
      .child(v_flex().gap(SPACE[2]).child(this.label(c, "Instructions")).child(this.textarea(c, inputs.instructions)))
      .child(
        div()
          .pt(SPACE[1])
          .truncate()
          .text_size(TYPE.xs)
          .text_color(c.faint)
          .child(`${a.lead ? "Plain messages" : `@${slug(a.name)}`} · ${argvOf(a, this.known).join(" ")}`),
      );
  }

  /** A multi-line field, framed like field(). */
  textarea(c, state) {
    return div()
      .px(SPACE[3])
      .py(SPACE[3])
      .rounded(SIZE.control)
      .bg(c.ground)
      .border_1()
      .border_color(c.edge)
      .child(Textarea.new(state).w_full().text_size(TYPE.md).text_color(c.ink));
  }

  field(c, state) {
    return div()
      .flex_1()
      .min_w(0)
      .h(CONTROL)
      .px(SPACE[3])
      .flex()
      .items_center()
      .rounded(SIZE.control)
      .bg(c.ground)
      .border_1()
      .border_color(c.edge)
      .child(Input.new(state).w_full().h_full().text_size(TYPE.md).text_color(c.ink));
  }

  select(c, a, field, value, width) {
    const open = false;
    return focusable(
      pressable(
        h_flex()
          .w(width)
          .h(CONTROL)
          .px(SPACE[3])
          .gap(SPACE[3])
          .items_center()
          .rounded(SIZE.control)
          .bg(c.ground)
          .border_1()
          .border_color(open ? c.accent : c.edge)
          .hover((s) => s.border_color(c.accent))
          .on_mouse_down("left", (e, cx) => {
            cx.stop_propagation();
            this.openList(a, field, e.bounds, cx);
            cx.notify();
          })
          .child(div().flex_1().min_w(0).truncate().text_size(TYPE.md).child(value))
          .child(svg(ICON("chevron-down")).size(MARK).text_color(c.muted)),
      ),
      `bh-sel-${a.id}-${field}`,
      c,
    );
  }

  modelField(c, a, state, inner) {
    const open = false; // the list is a popup now; the field stays as it is
    const remote = Boolean(currentSpace()?.machine); //  asks this machine only
    return h_flex()
      .h(CONTROL)
      .pl(SPACE[3])
      .pr(SPACE[2])
      .gap(SPACE[2])
      .items_center()
      .rounded(SIZE.control)
      .bg(c.ground)
      .border_1()
      .border_color(open ? c.accent : c.edge)
      .child(div().flex_1().min_w(0).h_full().child(Input.new(state).w_full().h_full().text_size(TYPE.md).text_color(c.ink)))
      .when(!remote, (el) => el.child(focusable(
        pressable(
          div()
            .size(CHIP)
            .flex_none()
            .flex()
            .items_center()
            .justify_center()
            .rounded(SIZE.nested)
            .hover((s) => s.bg(c.hover))
            .on_mouse_down("left", (e, cx) => {
              cx.stop_propagation();
              // Under the whole field, not just the arrow.
              const b = e.bounds;
              const field = b ? { x: b.x - (inner - 28) * (Number(settings().zoom) || 1), y: b.y - 4, width: inner * (Number(settings().zoom) || 1), height: b.height + 8 } : null;
              this.openList(a, "model", field, cx);
              cx.notify();
            })
            .child(svg(ICON("chevron-down")).size(MARK).text_color(c.muted)),
        ),
        `bh-models-${a.id}`,
        c,
      )));
  }

  slider(c, a, stops, width) {
    const n = stops.length;
    const at = Math.max(0, stops.indexOf(a.effort));
    const span = width - KNOB;
    const x = (i) => KNOB / 2 + (n > 1 ? (span * i) / (n - 1) : 0);
    return focusable(
      pressable(
        div()
          .relative()
          .w(width)
          .h(CONTROL)
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
          .child(div().absolute().left(KNOB / 2).w(span).top(SPACE[4]).h(SPACE[2]).rounded(PIP).bg(c.well))
          .child(div().absolute().left(KNOB / 2).w(x(at) - KNOB / 2).top(SPACE[4]).h(SPACE[2]).rounded(PIP).bg(c.accent))
          .children(stops.map((_s, i) => div().absolute().left(x(i) - SPACE[1]).top(SPACE[4]).size(SPACE[2]).rounded(PIP).bg(i <= at ? c.accentInk : c.faint).opacity(i === at ? 0 : 0.7)))
          .child(
            div()
              .absolute()
              .left(x(at) - KNOB / 2)
              .top(SPACE[2])
              .size(KNOB)
              .rounded_full()
              .bg(c.fill)
              .border(2)
              .border_color(c.accent),
          ),
      ),
      `bh-eff-${a.id}`,
      c,
    );
  }

  harnesses(c) {
    const installed = this.known.filter((k) => k.installed).map((k) => k.name);
    const f = this.harnessForm;
    const col = (label, state, w) => v_flex().gap(SPACE[2]).w(w).child(this.label(c, label)).child(this.field(c, state));
    return v_flex()
      .gap(GAP)
      .child(this.heading(c, "Harnesses", installed.length ? `herdr found ${installed.join(", ")} on your PATH. Add one it doesn't know by the command that starts it; models and effort for it then go in each agent's card.` : "herdr found no agent harness on your PATH yet. Add one by the command that starts it."))
      .child(
        h_flex()
          .p(PAD)
          .gap(SPACE[3])
          .items_end()
          .rounded(SIZE.radius)
          .bg(c.fill)
          .border_1()
          .border_color(c.edge)
          .child(col("Key", f.key, 130))
          .child(col("Name", f.name, 180))
          .child(v_flex().flex_1().min_w(0).gap(SPACE[2]).child(this.label(c, "Command")).child(this.field(c, f.run)))
          .child(this.button(c, "bh-add-harness", "plus", "Add harness", (_e, cx) => this.addHarness(cx))),
      );
  }

  accessCard(c) {
    const k = this.access;
    if (!k) return stateView(c, { id: "bh-access-loading", title: "Loading…", line: "It needs node on your PATH.", loading: true });
    const on = k.headless !== false;
    const full = k.access === "full";
    const quiet = this.known.filter((h) => h.installed && HEADLESS[h.key]).map((h) => h.name);
    const row = (label, chips, about, danger = false) => v_flex()
      .gap(SPACE[3])
      .child(this.label(c, label))
      .child(h_flex().flex_wrap().gap(SPACE[3]).children(chips))
      .child(div().text_size(TYPE.sm).text_color(danger ? c.danger : c.muted).child(about));
    return v_flex()
      .gap(GAP)
      .child(this.heading(c, "How agents run", "Headless, each message runs the harness on its own and the answer comes straight back to the chat. The agent's terminal still shows what it does, and /cli there opens the full CLI on the same conversation."))
      .child(
        v_flex()
          .p(PAD)
          .gap(SPACE[4])
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
              .gap(SPACE[2])
              .child(this.label(c, "Also allow these commands"))
              .child(this.field(c, this.allowInput))
              .child(div().text_size(TYPE.xs).text_color(c.faint).child("Comma separated; each allows that command and anything after it. Claude Code, Gemini, opencode and Qwen Code follow this list. Codex runs commands in its workspace sandbox; pi and Oh My Pi have no permission system and run as they would in a terminal.")),
          ))
          .child(row("Git isolation", ["off", "branch", "worktree"].map((m) =>
            this.chip(c, `bh-git-${m}`, { off: "Off", branch: "Branch", worktree: "Worktree" }[m], (k.git ?? "off") === m, (_e, cx) => this.setAccess({ git: m }, cx))),
          { off: "Tasks work in the project folder as it is.", branch: "Each new task gets a git branch named after it, checked out in the project folder.", worktree: "Each new task gets its own worktree and branch, named after it: every agent of the task runs there, apart from your checkout." }[k.git ?? "off"])),
      );
  }

  classifierCard(c) {
    const k = this.classifier;
    if (!k) return stateView(c, { id: "bh-cls-loading", title: "Loading…", line: "It needs node on your PATH.", loading: true });
    const hosts = k.hosts ?? {};
    const using = hosts[k.using]?.label ?? k.using;
    const kind = k.harness ? null : kindOf(k.kind);
    const harness = k.harness ? this.known.find((x) => x.key === k.harness) : null;
    const harnessName = harness?.name ?? k.harness;
    const modelName = k.harness ? (modelsOf(k.harness).find((m) => m.id === k.harnessModel)?.name ?? (k.harnessModel || "its default model")) : "";
    const rules = kind?.kind === "rules";
    const ready = k.harness ? k.harnessReady : rules || k.keyFound;
    const status = !k.enabled
      ? "Off: plain rules make these calls."
      : k.harness
        ? (ready ? `On, using ${harnessName} · ${modelName}.` : `On, but ${harnessName} isn't installed here: pick another model.`)
        : rules ? "On: the built-in rules decide."
        : k.keyFound ? `On, using ${kind?.label ?? using}.` : `On, but no key found: paste one${kind ? "" : ` or set ${hosts[k.using]?.env ?? "a key"}`}.`;
    const picked = k.harness ? `${harnessName} · ${modelName}` : kind?.label ?? using;
    return v_flex()
      .gap(GAP)
      .child(this.heading(c, "Classifier", "A fast model makes the small calls so the agents don't spend tokens on them: who answers a message, a task's size and track, each step's effort, how deep QA goes and which shared scripts help."))
      .child(
        v_flex()
          .p(PAD)
          .gap(SPACE[4])
          .rounded(SIZE.radius)
          .bg(c.fill)
          .border_1()
          .border_color(c.edge)
          .child(
            h_flex()
              .gap(SPACE[3])
              .items_center()
              .child(this.toggle(c, "bh-cls-on", k.enabled, (_e, cx) => this.config({ enabled: !k.enabled }, cx)))
              .child(div().text_size(TYPE.md).text_color(k.enabled && !ready ? c.danger : c.ink).child(status)),
          )
          .child(v_flex().gap(SPACE[2]).child(this.label(c, "Model", "from the harnesses installed here")).child(focusable(
            pressable(
              h_flex()
                .w(360)
                .h(CONTROL)
                .px(SPACE[3])
                .gap(SPACE[3])
                .items_center()
                .rounded(SIZE.control)
                .bg(c.ground)
                .border_1()
                .border_color(this.open === "classifier:model" ? c.accent : c.edge)
                .hover((s) => s.border_color(c.accent))
                .on_mouse_down("left", (e, cx) => {
                  cx.stop_propagation();
                  this.openClassifierModels(e.bounds);
                  cx.notify();
                })
                .child(div().flex_1().min_w(0).truncate().text_size(TYPE.md).child(picked))
                .child(svg(ICON("chevron-down")).size(MARK).text_color(c.muted)),
            ),
            "bh-cls-model",
            c,
          )))
          .when(!k.harness && !kind, (el) => el
            .child(v_flex().gap(SPACE[2]).child(this.label(c, "Host")).child(
              h_flex().flex_wrap().gap(SPACE[3]).children(HOST_ORDER.filter((h) => h === "auto" || hosts[h]).map((h) =>
                this.chip(c, `bh-host-${h}`, h === "auto" ? "Auto" : hosts[h].label, k.host === h, (_e, cx) => this.config({ host: h }, cx)))),
            )))
          .when(!k.harness && !rules, (el) => el
            .child(
              h_flex()
                .gap(SPACE[3])
                .items_end()
                .child(v_flex().flex_1().min_w(0).gap(SPACE[2]).child(this.label(c, "Key", k.key ? "set" : "not set")).child(this.field(c, this.keyInput)))
                .child(v_flex().flex_1().min_w(0).gap(SPACE[2]).child(this.label(c, "API model")).child(this.field(c, this.modelInput))),
            ))
          .when(kind?.kind === "clef", (el) => el.child(v_flex().gap(SPACE[2]).child(this.label(c, "Account id")).child(this.field(c, this.accountIdInput))))
          .when(kind?.kind === "laya", (el) => el.child(v_flex().gap(SPACE[2]).child(this.label(c, "Base URL")).child(this.field(c, this.baseUrlInput))))
          .when(Boolean(k.harness), (el) => el.child(div().text_size(TYPE.xs).text_color(c.faint).child("Each call starts the harness once, so a routed message waits a few seconds longer than with the API. It uses the harness's own sign-in.")))
          .child(v_flex().gap(SPACE[2]).child(this.label(c, "Use it for")).child(
            h_flex().flex_wrap().gap(SPACE[3]).children(FEATURES.map((f) =>
              this.chip(c, `bh-feat-${f.key}`, f.label, k.features?.[f.key] !== false, (_e, cx) => this.config({ features: { [f.key]: k.features?.[f.key] === false } }, cx)))),
          ))
          .child(
            h_flex().gap(SPACE[3]).children(THRESHOLDS.map((t) =>
              v_flex().flex_1().min_w(0).gap(SPACE[2]).child(this.label(c, t.label)).child(div().w(84).child(this.field(c, this.thresholdInputs[t.key]))))),
          )
          .child(div().text_size(TYPE.xs).text_color(c.faint).child("Thresholds are the classifier's confidence, 0 to 1. The effort set on each agent is the ceiling: routing only lowers it.")),
      );
  }

  toggle(c, id, on, onClick) {
    return focusable(
      pressable(
        div()
          .relative()
          .flex_none()
          .w(CONTROL + SPACE[3])
          .h(CHIP)
          .rounded(SIZE.control)
          .bg(on ? c.accent : c.well)
          .border_1()
          .border_color(on ? c.accentLip : c.edge)
          .hover((s) => s.opacity(0.9))
          .on_click(onClick)
          .child(div().absolute().top(HAIR).left(on ? CONTROL - SPACE[3] + HAIR : HAIR).size(GLYPH.lg).rounded(SIZE.nested).bg(c.fill)),
      ),
      id,
      c,
    );
  }

  chip(c, id, label, on, onClick) {
    return clickable(
      div()
        .flex_none()
        .h(CHIP)
        .px(SPACE[3])
        .flex()
        .items_center()
        .rounded(SIZE.nested)
        .border_1()
        .text_size(TYPE.sm)
        .when(on, (el) => el.bg(c.well).border_color(c.accent).text_color(c.ink).font_medium())
        .when(!on, (el) => el.border_color(c.edge).text_color(c.muted).hover((s) => s.bg(c.hover).text_color(c.ink)))
        .on_click(onClick)
        .child(label),
      c,
      id,
    );
  }

  iconButton(c, id, icon, onClick, danger = false) {
    return focusable(
      pressable(
        div()
          .size(CONTROL)
          .flex_none()
          .flex()
          .items_center()
          .justify_center()
          .rounded(SIZE.nested)
          .text_color(c.muted)
          .hover((s) => s.bg(c.hover).text_color(danger ? c.danger : c.ink))
          .on_click(onClick)
          .child(svg(ICON(icon)).size(MARK)),
      ),
      id,
      c,
    );
  }

  button(c, id, icon, label, onClick) {
    return clickable(
      h_flex()
        .flex_none()
        .h(CONTROL)
        .px(SPACE[4])
        .gap(SPACE[3])
        .items_center()
        .rounded(SIZE.control)
        .bg(c.accent)
        .border_b(1)
        .border_color(c.accentLip)
        .text_size(TYPE.md)
        .font_medium()
        .text_color(c.accentInk)
        .hover((s) => s.opacity(0.92))
        .on_click(onClick)
        .when(Boolean(icon), (el) => el.child(svg(ICON(icon)).size(MARK).text_color(c.accentInk)))
        .child(label),
      c,
      id,
    );
  }
}

export { ROLES };
