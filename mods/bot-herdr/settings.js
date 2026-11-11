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
import { SIZE, ICON, TYPE, LINE, SPACE, CONTROL, CHIP, MARK, PIP, HAIR, GLYPH, clickable, accentFill, pressable, focusable, textWidth } from "./look.js";
import { stateView, pill, avatar, segmented } from "./switch.js";
import { mentionTone, alpha } from "./indicators.js";
import { colors } from "./theme.js";
import { ROSTER_KEY, HEADLESS_KEY, HEADLESS, ROLES, roster, roleOf, argvOf, runnable, runningAs, effortsOf, modelsOf, slug } from "./roster.js";
import { bh, bhJson, enc, currentSpace, ROUTING_KEY } from "./bh.js";
import { PICKED, REFRESH, openPick, harnessMark } from "./pick.js";
import { withQuiet } from "./live.js";

const GAP = 14; // between cards
const MAX = 1140; // the page's widest
const MIN_CARD = 280; // a card's narrowest before the grid drops a column
const PAD = 14; // inside a card
const KNOB = 18;
/** An agent card's height with its essentials (header, harness, model, effort, More): every card is at least this. */
const CARD_H = 320;

/** The page's tabs, one section each. */
const SECTIONS = [
  { id: "agents", label: "Agents", icon: "users" },
  { id: "general", label: "General", icon: "page-settings" },
  { id: "harnesses", label: "Harnesses", icon: "page-terminals" },
];
const SECTION_KEY = "bot-herdr.settings-section";
/** The tab last open, kept for next time (a convenience: it may not be kept). */
const remembered = () => {
  try {
    return localStorage.getItem(SECTION_KEY) || "agents";
  } catch {
    return "agents";
  }
};
const remember = (id) => {
  try {
    localStorage.setItem(SECTION_KEY, id);
  } catch {
    // only a convenience
  }
};

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

/** OpenRouter's classifier models (System One): the only provider the classifier uses. */
const OPENROUTER_MODELS = [{ id: "~typesafe/jev-latest", label: "Jev" }];

export class Settings {
  init(_props, cx) {
    this.known = [];
    this.knownSaved = "";
    this.inputs = {}; // agent id → { name, model, args, instructions }
    this.open = null; // "<id>:harness" or "<id>:model": the field whose list is open
    const was = remembered();
    this.section = was === "access" || was === "classifier" ? "general" : was; // the tab open
    this.more = new Set(); // the parts opened past their essentials: an agent's id, "access", "harness", "classifier"
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
    this.keyInput = InputState.new({ placeholder: "sk-or-…" });
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
    // The key is OpenRouter's: the classifier runs there, on its model (Jev unless one was picked).
    const k = this.classifier ?? {};
    this.config({ key, kind: "", harness: "", harnessModel: "", host: "openrouter", model: k.host === "openrouter" && k.model ? k.model : OPENROUTER_MODELS[0].id }, cx);
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
    // A model changed elsewhere (the composer sets the Orchestrator's): its field follows.
    for (const a of list) {
      const field = this.inputs[a.id]?.model;
      if (field && field.value().trim() !== (a.model ?? "")) field.set_value(a.model ?? "");
    }
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

  /**
   * The classifier's model: OpenRouter's classifier models, and only once an OpenRouter key is set
   * (saved here or in OPENROUTER_API_KEY). A model id typed in the search can be used too.
   */
  openClassifierModels(bounds) {
    const k = this.classifier;
    const keyed = Boolean(k?.openrouterKey);
    const options = keyed
      ? [{ heading: "OpenRouter" }, ...OPENROUTER_MODELS.map((m) => ({ value: `openrouter|${m.id}`, label: m.label, note: m.id }))]
      : [{ heading: "Add an OpenRouter key to pick a model" }];
    const selected = k?.host === "openrouter" && !k?.harness && !k?.kind ? `openrouter|${k.model || OPENROUTER_MODELS[0].id}` : "";
    if (keyed && k?.model && !options.some((o) => o.value === `openrouter|${k.model}`)) options.push({ value: `openrouter|${k.model}`, label: k.model, note: "picked before" });
    this.open = "classifier:model";
    openPick({ key: "classifier:model", bounds, selected, options, minWidth: 320, searchable: keyed, typed: keyed ? [{ prefix: "openrouter|", label: "OpenRouter" }] : [] });
  }

  /** A pick from a list (pick.js), applied once. */
  applyPick(cx) {
    const picked = shared(PICKED);
    if (!picked?.at || picked.at <= this.pickedAt) return;
    this.pickedAt = picked.at;
    if (picked.key === "classifier:model") {
      const [harness, ...model] = String(picked.value ?? "").split("|");
      this.open = null;
      if (harness === "openrouter") return this.config({ kind: "", harness: "", harnessModel: "", host: "openrouter", model: model.join("|") }, cx);
      return;
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

  /** The stop under the pointer: measured inside the track, in the same (zoomed) pixels as its bounds. */
  slide(a, stops, e, cx) {
    const b = e.bounds;
    if (!b?.width) return;
    const zoom = Number(settings().zoom) || 1;
    const knob = KNOB * zoom;
    const local = e.local_position?.x ?? e.position.x - b.x;
    const ratio = Math.max(0, Math.min(1, (local - knob / 2) / Math.max(1, b.width - knob)));
    const value = stops[Math.round(ratio * (stops.length - 1))];
    if (value !== (a.effort ?? "")) this.change(a.id, { effort: value }, cx);
  }

  // ── Drawing ────────────────────────────────────────────────────────────────────────────────

  render(cx) {
    if ((shared(PICKED)?.at ?? 0) > this.pickedAt) cx.timer.after(1, (cx) => this.applyPick(cx));
    if ((shared(REFRESH)?.at ?? 0) > this.refreshedAt) cx.timer.after(1, (cx) => this.applyRefresh(cx));
    // The roster changed from outside (the composer's model chip): bring the fields in line.
    const rosterNow = shared(ROSTER_KEY);
    if (rosterNow !== this.rosterSeen) {
      this.rosterSeen = rosterNow;
      cx.timer.after(1, (cx) => {
        this.sync();
        cx.notify();
      });
    }
    const c = colors();
    const section = SECTIONS.some((x) => x.id === this.section) ? this.section : "agents";
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
        // px with the app's zoom multiplied in; drawn sizes are without it.
        const zoom = Number(settings().zoom) || 1;
        this.width = size.width / zoom;
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
              // One section at a time, picked from the tabs.
              .child(h_flex().items_center().child(segmented(c, {
                id: "bh-settings-tabs",
                items: SECTIONS.map((x) => ({ id: x.id, icon: x.icon, label: x.label, on: x.id === section })),
                onPick: (id, cx) => {
                  this.section = id;
                  remember(id);
                  cx.notify();
                },
              }))
)
              .when(Boolean(this.problem), (el) => el.child(div().text_size(TYPE.sm).text_color(c.danger).child(this.problem)))
              .when(section === "agents", (el) => el
                .children(rows.map((row, r) =>
                  // Cards in a row share its height; every card is at least the height of a full one.
                  h_flex().id(`bh-row-${r}`).flex_none().gap(GAP).items_stretch().children(row.map((a) => this.card(c, a, cardW, running, space))))))
              // Access and the classifier together: side by side when there's room, else stacked.
              .when(section === "general", (el) => el.child(v_flex().w(Math.min(640, content)).gap(GAP)
                .child(this.accessCard(c))
                .child(this.classifierCard(c))))
              .when(section === "harnesses", (el) => el.child(this.harnesses(c))),
          ),
      );
  }

  /** A section's heading: a small icon and the title. */
  heading(c, title) {
    const icon = { Agents: "users", Harnesses: "page-terminals", Access: "shield-check", Classifier: "zap" }[title] ?? "page-settings";
    return h_flex().gap(SPACE[3]).items_center().text_color(c.ink)
      .child(svg(ICON(icon)).size(GLYPH.lg).text_color(c.muted))
      .child(div().text_size(TYPE.lg).font_semibold().child(title));
  }

  /** "More" / "Less": opens a part past its essentials. */
  disclosure(c, key, label = "More") {
    const open = this.more.has(key);
    return clickable(
      h_flex().flex_none().h(CHIP).px(SPACE[2]).gap(SPACE[2]).items_center().rounded(SIZE.nested)
        .text_size(TYPE.xs).font_medium().text_color(c.muted)
        .on_click((_e, cx) => {
          if (open) this.more.delete(key);
          else this.more.add(key);
          cx.notify();
        })
        .child(open ? "Less" : label)
        .child(svg(ICON(open ? "chevron-down" : "chevron-right")).size(GLYPH.xs)),
      c,
      `bh-more-${key}`,
    );
  }

  /** One setting on one line: its name (and a short hint under it) on the left, its control on the right. */
  settingRow(c, label, control, hint = null) {
    return h_flex().min_h(CONTROL + SPACE[3]).px(PAD).py(SPACE[3]).gap(SPACE[4]).items_center()
      .child(v_flex().flex_1().min_w(0).gap(SPACE[1])
        .child(div().text_size(TYPE.md).font_medium().text_color(c.ink).child(label))
        .when(Boolean(hint), (el) => el.child(div().text_size(TYPE.xs).text_color(c.faint).child(hint))))
      .child(div().flex_none().child(control));
  }

  /**
   * A settings group: a compact card with a header (icon, title, and a control on the right, the
   * classifier's switch say), then its rows.
   */
  group(c, { id, icon, title, right = null, rows = [] }) {
    const shown = rows.filter(Boolean);
    return v_flex()
      .id(id)
      .w_full()
      .rounded(SIZE.radius)
      .bg(c.fill)
      .border_1()
      .border_color(c.edge)
      .overflow_hidden()
      .child(h_flex().h(CONTROL + SPACE[4]).px(PAD).gap(SPACE[3]).items_center()
        .child(div().flex_none().size(26).rounded(SIZE.nested).flex().items_center().justify_center().bg(c.well).text_color(c.muted)
          .child(svg(ICON(icon)).size(GLYPH.md)))
        .child(div().flex_1().min_w(0).text_size(TYPE.md).font_semibold().child(title))
        .when(Boolean(right), (el) => el.child(right)))
      .children(shown)
      .child(div().h(SPACE[2]));
  }

  /** A compact segmented choice for a setting row. */
  choice(c, id, options, value, onPick) {
    return segmented(c, { id, items: options.map(([v, label]) => ({ id: v, label, on: v === value })), onPick });
  }

  /** A quiet card: the frame every section sits in. */
  panel(c) {
    return v_flex().p(PAD).gap(SPACE[4]).rounded(SIZE.radius).bg(c.fill).border_1().border_color(c.edge);
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
    // The essentials: who, harness, model, effort. The rest opens under More.
    const tone = mentionTone(c, a.role !== "custom" ? a.role : a.name);
    const more = this.more.has(a.id);
    // Plain: the card, the agent's avatar and name, then its fields. Colour only in the avatar
    // and the effort slider.
    return v_flex()
      .id(`bh-agent-${a.id}`)
      .flex_none()
      .w(width)
      .min_h(CARD_H)
      .rounded(SIZE.radius)
      .bg(c.fill)
      .border_1()
      .border_color(c.edge)
      .child(
        h_flex()
          .h(CONTROL)
          .mx(PAD)
          .mt(PAD)
          .gap(SPACE[3])
          .items_center()
          .child(avatar(c, a.name, tone, 28))
          .child(h_flex().flex_1().min_w(0).gap(SPACE[2]).items_center()
              .child(div().min_w(0).truncate().text_size(TYPE.lg).font_semibold().child(a.name))
              .when(Boolean(a.lead), (el) => el.child(div().text_size(TYPE.xs).text_color(c.faint).child("Lead"))))
          .when(!ok, (el) => el.child(pill(c, "Not installed", c.danger)))

      )
      .child(v_flex().flex_1().p(PAD).pt(SPACE[4]).gap(SPACE[4])
      .child(v_flex().gap(SPACE[2]).child(this.label(c, "Harness")).child(this.select(c, a, "harness", harnessName, inner)))
      .child(v_flex().gap(SPACE[2]).child(this.label(c, "Model")).child(this.modelField(c, a, inputs.model, inner))
        .when(Boolean(currentSpace()?.machine), (el) => el.child(div().text_size(TYPE.xs).text_color(c.faint).child("Type a model id for this space."))))
      .child(v_flex().gap(SPACE[2])
        .child(this.label(c, "Effort"))
        .child(efforts.length
          ? this.slider(c, a, stops, inner, tone)
          : div().text_size(TYPE.sm).text_color(c.faint).child("No effort setting for this harness.")))
      .when(more, (el) => el
        .child(v_flex().gap(SPACE[2]).child(this.label(c, "Arguments")).child(this.field(c, inputs.args)))
        .child(v_flex().gap(SPACE[2]).child(this.label(c, "Instructions")).child(this.textarea(c, inputs.instructions)))
        .child(div().truncate().text_size(TYPE.xs).text_color(c.faint).child(argvOf(a, this.known).join(" "))))
      // Pinned to the foot, so every card's More sits on the same line.
      .child(div().flex_1())
      .child(h_flex().child(this.disclosure(c, a.id))));
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
          .when(field === "harness", (el) => el.child(harnessMark(c, this.known.find((k) => k.key === a.harness) ?? { key: a.harness, name: a.harness }, GLYPH.lg)))
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

  /**
   * The effort slider: a track with a stop per level, the level's name under each, and a knob on
   * the one set. A press or drag picks the nearest stop, a name picks its own, and with the
   * slider focused the arrow keys step along it.
   */
  slider(c, a, stops, width, tone = c.accent) {
    const n = stops.length;
    const at = Math.max(0, stops.indexOf(a.effort ?? ""));
    const span = width - KNOB;
    const x = (i) => KNOB / 2 + (n > 1 ? (span * i) / (n - 1) : 0);
    const name = (v) => (v ? v.charAt(0).toUpperCase() + v.slice(1) : "Default");
    const pick = (i, cx) => {
      const value = stops[Math.max(0, Math.min(n - 1, i))];
      if (value !== (a.effort ?? "")) this.change(a.id, { effort: value }, cx);
    };
    // Every level is named under its stop: in full when the names fit their slots, shortened
    // when the card is tight, and only the one set when even that won't fit. Names never wrap.
    const SHORT = { "": "Def", low: "Low", medium: "Med", high: "High", xhigh: "XHi", max: "Max", minimal: "Min" };
    const slot = n > 1 ? span / (n - 1) : span;
    const fits = (f) => Math.max(...stops.map((v) => textWidth(f(v), TYPE.xs) * 1.1)) + SPACE[2] <= slot;
    const short = (v) => SHORT[v] ?? name(v).slice(0, 4);
    const label = fits(name) ? name : fits(short) ? short : null;
    const labelW = Math.ceil(label ? slot : Math.max(...stops.map((v) => textWidth(name(v), TYPE.xs) * 1.15)) + SPACE[3]);
    const place = (i) => Math.round(Math.max(0, Math.min(width - labelW, x(i) - labelW / 2)));
    const mid = Math.round((KNOB + SPACE[3]) / 2);
    return focusable(
      v_flex()
        .w(width)
        .gap(SPACE[1])
        .on_key_down((e, cx) => {
          if (["left", "arrow-left", "down", "arrow-down"].includes(e.key)) pick(at - 1, cx);
          else if (["right", "arrow-right", "up", "arrow-up"].includes(e.key)) pick(at + 1, cx);
          else return;
          cx.stop_propagation();
        })
        .child(div()
          .relative()
          .w(width)
          .h(KNOB + SPACE[3])
          .cursor_pointer()
          .on_mouse_down("left", (e, cx) => {
            cx.stop_propagation();
            this.drag = { id: a.id };
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
          // The track, filled in the agent's colour up to the level set, a stop per level.
          .child(div().absolute().left(KNOB / 2).w(span).top(mid - 3).h(6).rounded_full().bg(c.well))
          .child(div().absolute().left(KNOB / 2).w(Math.max(0, x(at) - KNOB / 2)).top(mid - 3).h(6).rounded_full().bg(tone))
          .children(stops.map((_s, i) => div().absolute().left(x(i) - 2).top(mid - 2).size(4).rounded_full()
            .bg(i < at ? c.fill : c.faint).opacity(i === at ? 0 : i < at ? 0.85 : 0.6)))
          // The knob: ringed in the colour, a dot of it at the centre.
          .child(div().absolute().left(x(at) - KNOB / 2).top(mid - KNOB / 2).size(KNOB).rounded_full().bg(c.fill).border(2).border_color(tone).shadow_sm()
            .flex().items_center().justify_center()
            .child(div().size(6).rounded_full().bg(tone))))
        // Each level's name under its stop; a click on one picks it.
        // Each name sits in an absolutely placed slot; the clickable is inside it (clickable makes
        // its element relative, which would pull it out of place).
        .child(div().relative().w(width).h(LINE.sm).children(stops.map((v, i) => [v, i]).filter(([, i]) => label || i === at).map(([v, i]) =>
          div().absolute().top(0).left(place(i)).w(labelW).h(LINE.sm).child(clickable(
            div().size_full().flex().justify_center().items_center().rounded(SIZE.nested)
              .whitespace_nowrap().overflow_hidden()
              .text_size(TYPE.xs).font_medium().text_color(i === at ? tone : c.faint).when(i === at, (el) => el.font_semibold())
              .on_click((_e, cx) => pick(i, cx))
              .child(label ? label(v) : name(v)),
            c,
            `bh-eff-${a.id}-${i}`,
          ))))),
      `bh-eff-${a.id}`,
      c,
    );
  }

  harnesses(c) {
    const f = this.harnessForm;
    const open = this.more.has("harness");
    const col = (label, state, w) => v_flex().gap(SPACE[2]).w(w).child(this.label(c, label)).child(this.field(c, state));
    const found = this.known.filter((k) => k.installed);
    return v_flex()
      .gap(SPACE[4])
      .child(this.panel(c)
        .child(h_flex().flex_wrap().gap(SPACE[3]).items_center()
          .children(found.map((k) => h_flex().h(CHIP).pl(SPACE[2]).pr(SPACE[3]).gap(SPACE[2]).items_center().rounded_full().bg(c.ground).border_1().border_color(c.edge)
            .child(harnessMark(c, k, GLYPH.md))
            .child(div().text_size(TYPE.sm).text_color(c.ink).child(k.name))))
          .when(!found.length, (el) => el.child(div().text_size(TYPE.sm).text_color(c.muted).child("None found")))
          .child(div().flex_1())
          .child(this.disclosure(c, "harness", "Add")))
        .when(open, (el) => el.child(h_flex().gap(SPACE[3]).items_end()
          .child(col("Key", f.key, 120))
          .child(col("Name", f.name, 160))
          .child(v_flex().flex_1().min_w(0).gap(SPACE[2]).child(this.label(c, "Command")).child(this.field(c, f.run)))
          .child(this.button(c, "bh-add-harness", "plus", "Add", (_e, cx) => this.addHarness(cx))))));
  }

  accessCard(c) {
    const k = this.access;
    if (!k) return stateView(c, { id: "bh-access-loading", title: "Loading…", loading: true });
    const on = k.headless !== false;
    const full = k.access === "full";
    return this.group(c, {
      id: "bh-access",
      icon: "shield-check",
      title: "Access",
      rows: [
        this.settingRow(c, "Run agents", this.choice(c, "bh-run", [["headless", "Headless"], ["cli", "CLI"]], on ? "headless" : "cli",
          (v, cx) => this.setAccess({ headless: v === "headless" }, cx))),
        this.settingRow(c, "Permissions", this.choice(c, "bh-perm", [["standard", "Standard"], ["full", "Full"]], full ? "full" : "standard",
          (v, cx) => this.setAccess({ access: v }, cx)), full ? "Agents run any command without asking" : null),
        !full && this.settingRow(c, "Also allow", div().w(240).child(this.field(c, this.allowInput)), "Commands, comma separated"),
        this.settingRow(c, "Git per task", this.choice(c, "bh-git", [["off", "Off"], ["branch", "Branch"], ["worktree", "Worktree"]], k.git ?? "off",
          (v, cx) => this.setAccess({ git: v }, cx))),
      ],
    });
  }

  classifierCard(c) {
    const k = this.classifier;
    if (!k) return stateView(c, { id: "bh-cls-loading", title: "Loading…", loading: true });
    // OpenRouter only: the model is OpenRouter's, and nothing works until its key is set.
    const onOpenRouter = !k.harness && !k.kind && k.host === "openrouter";
    const model = onOpenRouter ? k.model || OPENROUTER_MODELS[0].id : "";
    const picked = !k.openrouterKey ? "Needs an OpenRouter key" : onOpenRouter ? OPENROUTER_MODELS.find((m) => m.id === model)?.label ?? model : "Pick a model";
    const problem = !k.enabled ? null : !k.openrouterKey ? "Add your OpenRouter key below" : !onOpenRouter ? "Pick an OpenRouter model" : null;
    const more = this.more.has("classifier");
    const modelSelect = focusable(
      pressable(
        h_flex()
          .w(240)
          .h(CONTROL)
          .px(SPACE[3])
          .gap(SPACE[2])
          .items_center()
          .rounded(SIZE.control)
          .bg(c.ground)
          .border_1()
          .border_color(this.open === "classifier:model" ? c.accent : c.edge)
          .hover((st) => st.border_color(c.accent))
          .on_mouse_down("left", (e, cx) => {
            cx.stop_propagation();
            this.openClassifierModels(e.bounds);
            cx.notify();
          })
          .child(div().flex_1().min_w(0).truncate().text_size(TYPE.sm).text_color(k.openrouterKey ? c.ink : c.faint).child(picked))
          .child(svg(ICON("chevron-down")).size(MARK).text_color(c.muted)),
      ),
      "bh-cls-model",
      c,
    );
    const field = (state, w = 240) => div().w(w).child(this.field(c, state));
    return this.group(c, {
      id: "bh-classifier",
      icon: "zap",
      title: "Classifier",
      right: this.toggle(c, "bh-cls-on", k.enabled, (_e, cx) => this.config({ enabled: !k.enabled }, cx)),
      rows: [
        this.settingRow(c, "Model", modelSelect, problem),
        this.settingRow(c, "OpenRouter key", field(this.keyInput), k.key ? "Saved" : k.openrouterKey ? "From OPENROUTER_API_KEY" : "Not set"),
        more && v_flex().px(PAD).py(SPACE[3]).gap(SPACE[2])
          .child(div().text_size(TYPE.md).font_medium().child("Use it for"))
          .child(h_flex().flex_wrap().gap(SPACE[2]).children(FEATURES.map((f) =>
            this.chip(c, `bh-feat-${f.key}`, f.label, k.features?.[f.key] !== false, (_e, cx) => this.config({ features: { [f.key]: k.features?.[f.key] === false } }, cx))))),
        more && h_flex().px(PAD).py(SPACE[3]).gap(SPACE[3]).children(THRESHOLDS.map((t) =>
          v_flex().flex_1().min_w(0).gap(SPACE[2]).child(div().text_size(TYPE.xs).text_color(c.muted).child(t.label)).child(div().w(84).child(this.field(c, this.thresholdInputs[t.key]))))),
        h_flex().px(PAD).py(SPACE[2]).child(this.disclosure(c, "classifier", "Advanced")),
      ],
    });
  }

  /** A switch: a pill track, the knob centred in it, sliding to the side that's set. */
  toggle(c, id, on, onClick) {
    const W = 36;
    const H = 20;
    const KNOB_D = 14;
    const inset = (H - 2 - KNOB_D) / 2; // inside the 1px border
    return focusable(
      div()
        .relative()
        .flex_none()
        .w(W)
        .h(H)
        .rounded_full()
        .cursor_pointer()
        .bg(on ? c.accent : c.well)
        .border_1()
        .border_color(on ? c.accent : c.edge)
        .on_click(onClick)
        .child(div()
          .absolute()
          .top(inset)
          .left(on ? W - 2 - KNOB_D - inset : inset)
          .spring("left", { response: 220, damping: 0.9 })
          .size(KNOB_D)
          .rounded_full()
          .bg(on ? c.accentInk : c.fill)
          .shadow_sm()),
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
        .on_click(onClick)
        .when(Boolean(icon), (el) => el.child(svg(ICON(icon)).size(MARK).text_color(c.accentInk)))
        .child(label),
      c,
      id, { fill: accentFill(c) },
    );
  }
}

export { ROLES };
