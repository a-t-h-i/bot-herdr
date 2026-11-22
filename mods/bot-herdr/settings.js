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
// standard (edits, reading, the team's tools) unless the user picks full access. Repo history,
// on by default, pushes .bot-herdr/ to git with the project; off keeps it out via .gitignore.

import { div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextareaState, Textarea } from "gpui-base";
import { agents, panes, spaces, settings, shared, setShared, knownAgents, notify, props, closeOverlay, openOverlay } from "herdr";
import { SIZE, ICON, TYPE, LINE, SPACE, CONTROL, CHIP, MARK, PIP, HAIR, GLYPH, clickable, pressable, focusable, textWidth } from "./look.js";
import { actionButton } from "./button.js";
import { stateView, pill, avatar, segmented } from "./switch.js";
import { mentionTone, alpha } from "./indicators.js";
import { colors } from "./theme.js";
import { ROSTER_KEY, HEADLESS_KEY, HEADLESS, ROLES, blank, roster, roleOf, argvOf, runnable, runningAs, effortsOf, modelsOf, slug } from "./roster.js";
import { bh, bhJson, enc, currentSpace, ROUTING_KEY } from "./bh.js";
import { PICKED, REFRESH, openPick, harnessMark } from "./pick.js";
import { withQuiet } from "./live.js";
import { arm, armed } from "./plandoc.js";
import { SEARCH_OVER, filterTools, newestActive, pickedFor, supportedNames } from "./skillsview.js";
import {
  normalizeStatus, providerRows, addFallbackStep, removeFallbackStep, moveFallbackStep, parseBudgetNumber, harnessLabel,
} from "./resilienceview.js";
import { settingsGridColumns } from "./tasksview.js";
import { OPEN_RESILIENCE } from "./statusstrip.js";

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
  { id: "resilience", label: "Resilience", icon: "shield-check" },
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

/** What `bh tools` said, per harness, for this session; TOOLS_ASKING holds the ones still running. */
const TOOLS_CACHE = new Map();
const TOOLS_ASKING = new Set();
/** The harnesses that support picking skills, from `bh tools --list` (null until known or when it fails). */
const SUPPORTED = { names: null, asked: false };
const SUPPORTED_FALLBACK = "Claude Code, Codex and OpenCode";
const NO_TOOLS = "Couldn't ask which skills and MCP servers are installed.";

/** The skills and MCP servers a harness has installed, or the shape of a failure. */
async function fetchTools(harness, refresh) {
  const got = await bhJson(["tools", harness, ...(refresh ? ["--refresh"] : [])], { timeout: 60000 });
  return got ?? { harness, supported: false, skills: [], mcp: [], error: NO_TOOLS };
}

const AGENT_FIELDS = [
  { key: "name", placeholder: "Name" },
  { key: "does", placeholder: "One line: what this agent is for (the Orchestrator reads it)" },
  { key: "args", placeholder: "Flags only, e.g. --verbose" },
  { key: "instructions", placeholder: "What this agent should always do, in plain words", rows: 3 },
];

const FEATURES = [
  { key: "lobby", label: "Chat routing", about: "who answers a message that names no one" },
  { key: "triage", label: "Triage", about: "a task's size, kind and domains" },
  { key: "effort", label: "Effort routing", about: "lower effort for simple steps" },
  { key: "qa", label: "QA depth", about: "how deep the QA gate looks" },
  { key: "scripts", label: "Script picks", about: "which shared scripts suit a step" },
  { key: "skills", label: "Skill picks", about: "Picks skills for each agent when a task or plan starts." },
];

const THRESHOLDS = [
  { key: "lobbyAgentAt", label: "Hand a message to an agent at" },
  { key: "simpleAt", label: "Lower the effort for a simple step at" },
  { key: "trivialAt", label: "Lowest effort for a trivial step at" },
];

/** OpenRouter's classifier models (System One): the only provider the classifier uses. */
const OPENROUTER_MODELS = [{ id: "~typesafe/jev-latest", label: "Jev" }];

/** Presets for the Resilience tab's autonomy mode and guardrail budgets. */
const AUTONOMY_OPTIONS = [["ask", "Ask"], ["guarded", "Guarded"], ["autonomous", "Autonomous"]];
const AUTONOMY_HINTS = {
  ask: "Pauses for approval before autonomous retries or fallbacks",
  guarded: "Auto-retries and falls back within guardrail limits",
  autonomous: "Runs end-to-end with git isolation and budget ceilings",
};
const SPEND_OPTIONS = [["5", "$5"], ["10", "$10"], ["25", "$25"], ["0", "Off"]];
const RETRY_OPTIONS = [["2", "2"], ["3", "3"], ["5", "5"]];
const SPAWN_OPTIONS = [["2", "2"], ["4", "4"], ["6", "6"]];
const QA_OPTIONS = [["2", "2"], ["3", "3"], ["5", "5"]];
const FALLBACK_HARNESSES = ["claude", "codex", "gemini", "opencode", "pi", "qwen"];

/** How long the roster's "Saved" cue stays. */
const SAVED_MS = 2000;

/** Shared signals so MoreSheet tells Settings to refresh harnesses or classifier config. */
const HARNESS_ADDED = "bot-herdr.harness-added";
const CONFIG_CHANGED = "bot-herdr.config-changed";

const labelRow = (c, text, right = null) =>
  h_flex().h(CHIP).items_center().justify_between().text_size(TYPE.xs).font_medium().text_color(c.muted)
    .child(div().child(text))
    .when(right !== null, (el) => el.child(div().text_color(c.ink).child(right)));

const textField = (c, state) =>
  div().flex_1().min_w(0).h(CONTROL).px(SPACE[3]).flex().items_center().rounded(SIZE.control).bg(c.ground).border_1().border_color(c.edge)
    .child(Input.new(state).w_full().h_full().text_size(TYPE.md).text_color(c.ink));

const textArea = (c, state) =>
  div().px(SPACE[3]).py(SPACE[3]).rounded(SIZE.control).bg(c.ground).border_1().border_color(c.edge)
    .child(Textarea.new(state).w_full().text_size(TYPE.md).text_color(c.ink));

const chipButton = (c, id, label, on, onClick) =>
  clickable(
    div().flex_none().h(CONTROL).px(SPACE[3]).flex().items_center().rounded(SIZE.nested).border_1().text_size(TYPE.sm)
      .when(on, (el) => el.bg(c.well).border_color(c.accent).text_color(c.ink).font_medium())
      .when(!on, (el) => el.border_color(c.edge).text_color(c.muted).hover((s) => s.bg(c.hover).text_color(c.ink)))
      .on_click(onClick)
      .child(label),
    c,
    id,
  );

/** Opens a card's extra content as a dialog over the page; MoreSheet draws it from plain props + shared state. */
function openMore({ kind, key, known = [], classifier = null }) {
  return openOverlay({
    mod: "bot-herdr",
    kind: "dialog",
    frame: "none",
    width: 0.6,
    height: 0.7,
    props: { view: "settings-more", kind, key, known, classifier },
  });
}

export class Settings {
  init(_props, cx) {
    this.known = [];
    this.knownSaved = "";
    this.inputs = {}; // agent id → { model }
    this.open = null; // "<id>:harness" or "<id>:model": the field whose list is open
    const was = remembered();
    this.section = was === "access" || was === "classifier" ? "general" : was; // the tab open
    this.pickedAt = /** @type {{ at?: number } | null} */ (shared(PICKED))?.at ?? 0;
    this.refreshedAt = /** @type {{ at?: number } | null} */ (shared(REFRESH))?.at ?? 0;
    this.harnessAddedAt = Number(shared(HARNESS_ADDED) ?? 0);
    this.configChangedAt = Number(shared(CONFIG_CHANGED) ?? 0);
    this.openResilienceAt = Number(/** @type {{ at?: number } | null} */ (shared(OPEN_RESILIENCE))?.at ?? 0);
    this.resilience = null;
    this.resilienceLoading = false;
    this.resilienceBusy = false;
    this.resilienceUnavailable = false;
    this.addingStep = false;
    this.draftHarness = "";
    this.draftEffort = "";
    this.draftModelInput = InputState.new({ placeholder: "Model id (optional)" });
    this.draftModelInput.on("submit", (_e, cx) => this.commitFallbackStep(cx));
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
    /** @type {Array<[import("gpui-base").InputState, string]>} */
    const savedFields = [[this.accountIdInput, "accountId"], [this.baseUrlInput, "baseUrl"]];
    for (const [state, field] of savedFields) {
      const save = (_e, cx) => {
        const v = state.value().trim();
        if (this.classifier && v !== (this.classifier[field] ?? "")) this.config({ [field]: v }, cx);
      };
      state.on("submit", save);
      state.on("blur", save);
    }

    this.sync();
    this.rosterSeen = JSON.stringify(shared(ROSTER_KEY) ?? null);
    this.loadKnown(cx);
    this.loadConfig(cx);
    this.loadAccess(cx);
    this.loadResilience(cx);
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
    if (got.repoHistoryError) this.problem = got.repoHistoryError;
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

  loadResilience(cx) {
    if (this.resilienceLoading) return;
    this.resilienceLoading = true;
    cx.spawn(async (cx) => {
      try {
        const got = await bhJson(["resilience", "status"]);
        if (got) {
          this.resilience = normalizeStatus(got);
          this.resilienceUnavailable = false;
        } else {
          this.resilience ??= normalizeStatus(null);
          this.resilienceUnavailable = true;
        }
      } finally {
        this.resilienceLoading = false;
        cx.notify();
      }
    });
  }

  saveResilience(nextConfig, cx) {
    const cur = this.resilience ?? normalizeStatus(null);
    this.resilience = { ...cur, config: nextConfig };
    cx.notify();
    cx.spawn(async (cx) => {
      const got = await bhJson(["resilience", "save", "--data", enc(nextConfig)]);
      if (got && got.ok !== false) {
        const saved = normalizeStatus({ ...this.resilience, config: got.config ?? nextConfig });
        this.resilience = { ...this.resilience, config: saved.config };
        this.resilienceUnavailable = false;
        this.problem = null;
        this.markSaved(cx);
      } else {
        this.problem = got?.error ?? "Couldn't save resilience settings. Is node on your PATH?";
      }
      cx.notify();
    });
  }

  updateResilience(patch, cx) {
    const cur = (this.resilience ?? normalizeStatus(null)).config;
    this.saveResilience({ ...cur, ...patch }, cx);
  }

  updateGuardrails(patch, cx) {
    const cur = (this.resilience ?? normalizeStatus(null)).config;
    this.saveResilience({ ...cur, guardrails: { ...cur.guardrails, ...patch } }, cx);
  }

  resetResilience(key, cx) {
    if (this.resilienceBusy) return;
    this.resilienceBusy = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const r = await bh(key ? ["resilience", "reset", key] : ["resilience", "reset"]);
        if (r.code === 0) {
          this.problem = null;
          this.markSaved(cx);
        } else {
          this.problem = `Couldn't reset cooldowns: ${(r.stderr || r.stdout || "command failed").trim().split("\n")[0]}`;
        }
      } finally {
        this.resilienceBusy = false;
        this.loadResilience(cx);
        cx.notify();
      }
    });
  }

  fallbackHarnesses() {
    const installed = this.known.filter((k) => k.installed).map((k) => k.key);
    return installed.length ? installed : FALLBACK_HARNESSES;
  }

  toggleAddStep(cx) {
    this.addingStep = !this.addingStep;
    if (this.addingStep) {
      const choices = this.fallbackHarnesses();
      this.draftHarness = choices[0] ?? "claude";
      this.draftEffort = "";
      this.draftModelInput.set_value("");
    }
    cx.notify();
  }

  commitFallbackStep(cx) {
    if (!this.draftHarness) return;
    const cur = (this.resilience ?? normalizeStatus(null)).config;
    const next = addFallbackStep(cur.fallbacks, {
      harness: this.draftHarness,
      model: this.draftModelInput.value(),
      effort: this.draftEffort,
    });
    this.addingStep = false;
    this.draftEffort = "";
    this.draftModelInput.set_value("");
    this.updateResilience({ fallbacks: next }, cx);
  }

  moveFallback(index, delta, cx) {
    const cur = (this.resilience ?? normalizeStatus(null)).config;
    this.updateResilience({ fallbacks: moveFallbackStep(cur.fallbacks, index, delta) }, cx);
  }

  removeFallback(index, cx) {
    const cur = (this.resilience ?? normalizeStatus(null)).config;
    this.updateResilience({ fallbacks: removeFallbackStep(cur.fallbacks, index) }, cx);
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
    this.rosterSeen = JSON.stringify(shared(ROSTER_KEY) ?? null);
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
        if (r.code === 0) this.markSaved(cx);
        cx.notify();
      });
    });
  }

  /** The "Saved" cue under the tabs: shown for SAVED_MS after a roster save succeeds. */
  markSaved(cx) {
    const at = Date.now();
    this.saved = at;
    cx.timer.after(SAVED_MS, (cx) => {
      if (this.saved === at) cx.notify();
    });
  }

  change(id, patch, cx) {
    this.save(this.list().map((a) => (a.id === id ? { ...a, ...patch } : a)), cx);
    cx.notify();
  }

  /** Model text boxes are made here (never while drawing), one per agent. */
  sync() {
    const list = this.list();
    // A model changed elsewhere (the composer sets the Orchestrator's): its field follows.
    for (const a of list) {
      const field = this.inputs[a.id]?.model;
      if (field && field.value().trim() !== (a.model ?? "")) field.set_value(a.model ?? "");
    }
    for (const a of list) {
      if (this.inputs[a.id]) continue;
      const state = InputState.new({ value: a.model ?? "", placeholder: "The harness's default" });
      state.on("change", (_e, cx) => {
        const value = state.value().trim();
        const now = this.list().find((x) => x.id === a.id);
        if (!now || now.model === value) return;
        this.change(a.id, { model: value }, cx);
      });
      this.inputs[a.id] = { model: state };
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
    const options = /** @type {Array<{ heading?: string, value?: string, label?: string, note?: string }>} */ (keyed
      ? [{ heading: "OpenRouter" }, ...OPENROUTER_MODELS.map((m) => ({ value: `openrouter|${m.id}`, label: m.label, note: m.id }))]
      : [{ heading: "Add an OpenRouter key to pick a model" }]);
    const selected = k?.host === "openrouter" && !k?.harness && !k?.kind ? `openrouter|${k.model || OPENROUTER_MODELS[0].id}` : "";
    if (keyed && k?.model && !options.some((o) => o.value === `openrouter|${k.model}`)) options.push({ value: `openrouter|${k.model}`, label: k.model, note: "picked before" });
    this.open = "classifier:model";
    openPick({ key: "classifier:model", bounds, selected, options, minWidth: 320, searchable: keyed, typed: keyed ? [{ prefix: "openrouter|", label: "OpenRouter" }] : [] });
  }

  /** A pick from a list (pick.js), applied once. */
  applyPick(cx) {
    const picked = /** @type {{ key?: string, value?: string, at?: number } | null} */ (shared(PICKED));
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
    const asked = /** @type {{ key?: string, at?: number } | null} */ (shared(REFRESH));
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
    if ((/** @type {{ at?: number } | null} */ (shared(PICKED))?.at ?? 0) > this.pickedAt) cx.timer.after(1, (cx) => this.applyPick(cx));
    if ((/** @type {{ at?: number } | null} */ (shared(REFRESH))?.at ?? 0) > this.refreshedAt) cx.timer.after(1, (cx) => this.applyRefresh(cx));
    const harnessAdded = Number(shared(HARNESS_ADDED) ?? 0);
    if (harnessAdded > this.harnessAddedAt) {
      this.harnessAddedAt = harnessAdded;
      cx.timer.after(1500, (cx) => this.loadKnown(cx));
    }
    const configChanged = Number(shared(CONFIG_CHANGED) ?? 0);
    if (configChanged > this.configChangedAt) {
      this.configChangedAt = configChanged;
      cx.timer.after(1, (cx) => this.loadConfig(cx));
    }
    const openResilience = Number(/** @type {{ at?: number } | null} */ (shared(OPEN_RESILIENCE))?.at ?? 0);
    if (openResilience > this.openResilienceAt) {
      this.openResilienceAt = openResilience;
      this.section = "resilience";
      remember("resilience");
      cx.timer.after(1, (cx) => this.loadResilience(cx));
    }
    // The roster changed from outside (the composer's model chip or MoreSheet): sync and persist.
    // shared() deserializes a fresh copy each call, so compare by content instead of reference.
    const rosterNow = JSON.stringify(shared(ROSTER_KEY) ?? null);
    if (rosterNow !== this.rosterSeen) {
      this.rosterSeen = rosterNow;
      cx.timer.after(1, (cx) => {
        this.sync();
        this.persist(cx);
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
        const w = size.width / zoom;
        if (Math.abs(w - this.width) >= 1) {
          this.width = w;
          cx.notify();
        }
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
                  if (id === "resilience") this.loadResilience(cx);
                  cx.notify();
                },
              }))
)
              .when(Boolean(this.problem), (el) => el.child(div().text_size(TYPE.sm).text_color(c.danger).child(this.problem)))
              .when(!this.problem && Date.now() - (this.saved ?? 0) < SAVED_MS, (el) => el.child(div().text_size(TYPE.xs).text_color(c.muted).child("Saved")))
              .when(section === "agents", (el) => el
                .children(rows.map((row, r) =>
                  // Cards in a row share its height; every card is at least the height of a full one.
                  h_flex().id(`bh-row-${r}`).flex_none().gap(GAP).items_stretch().children(row.map((a) => this.card(c, a, cardW, running, space)))))
                .child(h_flex().flex_none().child(this.button(c, "bh-add-agent", "plus", "Add agent", (_e, cx) => {
                  const list = this.list();
                  this.save([...list, blank(list, this.known)], cx);
                  this.sync();
                  cx.notify();
                }))))
              // Access and the classifier together: 2-column grid when wide (>= 860px), stacked when narrow.
              .when(section === "general", (el) => el.child(this.generalSection(c, content)))
              .when(section === "resilience", (el) => el.child(this.resilienceSection(c, content)))
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

  /** "More" and its siblings ("Add", "Advanced"): opens the card's extra content in a dialog. */
  disclosure(c, kind, key, label = "More") {
    const extra = kind === "agent" ? { known: this.knownForBh() } : kind === "classifier" ? { classifier: this.classifier } : {};
    return actionButton(c, `bh-more-${key}`, label, () => openMore({ kind, key, ...extra }), { icon: "chevron-right", tone: "quiet" });
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
   * A card: its title (no icon in front of it), an optional control on the right (the classifier's
   * switch, say), then its rows.
   */
  group(c, { id, title, right = null, rows = [] }) {
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
    return labelRow(c, text, right);
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
      // Effort is drawn only for a harness that has effort levels: there is nothing to say otherwise.
      .when(efforts.length > 0, (el) => el.child(v_flex().gap(SPACE[2])
        .child(this.label(c, "Effort"))
        .child(this.slider(c, a, stops, inner, tone))))
      // Pinned to the foot, so every card's More sits on the same line.
      .child(div().flex_1())
      .child(h_flex().child(this.disclosure(c, "agent", a.id))));
  }

  field(c, state) {
    return textField(c, state);
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
              // Under the whole field, not just the arrow. (`gpui-shell`'s ElementBounds carries x
              // and y from Point at run time; the generated declaration loses that base.)
              const b = /** @type {{ x: number, y: number, width: number, height: number } | undefined} */ (e.bounds);
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
          .child(this.disclosure(c, "harness", "harness", "Add"))));
  }

  accessCard(c) {
    const k = this.access;
    if (!k) return stateView(c, { id: "bh-access-loading", title: "Loading…", loading: true });
    const on = k.headless !== false;
    const full = k.access === "full";
    return this.group(c, {
      id: "bh-access",
      title: "Access",
      rows: [
        this.settingRow(c, "Run agents", this.choice(c, "bh-run", [["headless", "Headless"], ["cli", "CLI"]], on ? "headless" : "cli",
          (v, cx) => this.setAccess({ headless: v === "headless" }, cx))),
        this.settingRow(c, "Permissions", this.choice(c, "bh-perm", [["standard", "Standard"], ["full", "Full"]], full ? "full" : "standard",
          (v, cx) => this.setAccess({ access: v }, cx)), full ? "Agents run any command without asking" : null),
        !full && this.settingRow(c, "Also allow", div().w(240).child(this.field(c, this.allowInput)), "Commands, comma separated"),
        this.settingRow(c, "Git per task", this.choice(c, "bh-git", [["off", "Off"], ["branch", "Branch"], ["worktree", "Worktree"]], k.git ?? "off",
          (v, cx) => this.setAccess({ git: v }, cx))),
        this.settingRow(c, "Repo history", this.choice(c, "bh-repo-history", [["on", "Pushed"], ["off", "Local only"]], k.repoHistory === false ? "off" : "on",
          (v, cx) => this.setAccess({ repoHistory: v === "on" }, cx)), k.repoHistory === false ? ".bot-herdr/ is gitignored and untracked in every project" : null),
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
      title: "Classifier",
      right: this.toggle(c, "bh-cls-on", k.enabled, (_e, cx) => this.config({ enabled: !k.enabled }, cx)),
      rows: [
        this.settingRow(c, "Model", modelSelect, problem),
        this.settingRow(c, "OpenRouter key", field(this.keyInput), k.key ? "Saved" : k.openrouterKey ? "From OPENROUTER_API_KEY" : "Not set"),
        h_flex().px(PAD).py(SPACE[2]).child(this.disclosure(c, "classifier", "classifier", "Advanced")),
      ],
    });
  }

  /** The Resilience tab: provider health & cooldowns, ordered fallback chain, and guardrail budgets. */
  /** General tab: responsive 2-column grid (>= 860px) placing Access and Classifier cards side-by-side. */
  generalSection(c, content) {
    if (settingsGridColumns(content) === 2) {
      return h_flex()
        .id("bh-general-grid")
        .w(content)
        .gap(GAP)
        .items_start()
        .child(v_flex().flex_1().min_w(0).gap(GAP).child(this.accessCard(c)))
        .child(v_flex().flex_1().min_w(0).gap(GAP).child(this.classifierCard(c)));
    }
    return v_flex()
      .id("bh-general-grid")
      .w(content)
      .gap(GAP)
      .child(this.accessCard(c))
      .child(this.classifierCard(c));
  }

  resilienceSection(c, content) {
    if (!this.resilience && this.resilienceLoading) {
      return stateView(c, { id: "bh-res-loading", title: "Loading resilience…", loading: true });
    }
    const r = this.resilience ?? normalizeStatus(null);
    const notice = this.resilienceUnavailable
      ? div().text_size(TYPE.xs).text_color(c.muted).child("Live resilience status unavailable; showing defaults.")
      : null;
    const grid = settingsGridColumns(content) === 2
      ? h_flex()
        .id("bh-resilience-grid")
        .w(content)
        .gap(GAP)
        .items_start()
        .child(v_flex().flex_1().min_w(0).gap(GAP)
          .child(this.providerHealthCard(c, r))
          .child(this.fallbackChainCard(c, r)))
        .child(v_flex().flex_1().min_w(0).gap(GAP)
          .child(this.guardrailsCard(c, r)))
      : v_flex()
        .id("bh-resilience-grid")
        .w(content)
        .gap(GAP)
        .child(this.providerHealthCard(c, r))
        .child(this.fallbackChainCard(c, r))
        .child(this.guardrailsCard(c, r));
    return v_flex()
      .w(content)
      .gap(GAP)
      .when(Boolean(notice), (el) => el.child(notice))
      .child(grid);
  }

  providerHealthCard(c, r) {
    const rows = providerRows(this.known, r.cooldowns, r.activeFailovers);
    const controls = h_flex()
      .gap(SPACE[2])
      .items_center()
      .child(actionButton(c, "bh-res-refresh", null, (_e, cx) => this.loadResilience(cx), {
        icon: "refresh-cw",
        tone: "quiet",
        tooltip: "Refresh status",
        a11y: "Refresh provider health",
      }))
      .child(actionButton(c, "bh-res-reset-all", "Reset all", (_e, cx) => this.resetResilience(null, cx), {
        icon: "refresh-cw",
        tone: "secondary",
        disabled: this.resilienceBusy,
        tooltip: "Clear all provider cooldowns",
      }));
    return this.group(c, {
      id: "bh-resilience-health",
      title: "Provider health & cooldowns",
      right: controls,
      rows: rows.length
        ? rows.map((row) => this.providerHealthRow(c, row))
        : [div().px(PAD).py(SPACE[3]).text_size(TYPE.sm).text_color(c.muted).child("No installed harnesses detected.")],
    });
  }

  providerHealthRow(c, row) {
    const entry = this.known.find((k) => k.key === row.key) ?? { key: row.key, name: row.label };
    const badge = row.status === "cooldown"
      ? pill(c, `Cooldown ${row.remainingText}`, c.warning)
      : row.status === "active_fallback"
        ? pill(c, "Active fallback", c.info, { pulse: true })
        : pill(c, "Healthy", c.success);
    return h_flex()
      .id(`bh-res-prov-${row.key}`)
      .min_h(CONTROL + SPACE[3])
      .px(PAD)
      .py(SPACE[3])
      .gap(SPACE[3])
      .items_center()
      .child(harnessMark(c, entry, GLYPH.lg))
      .child(
        v_flex()
          .flex_1()
          .min_w(0)
          .gap(SPACE[1])
          .child(div().truncate().text_size(TYPE.md).font_medium().text_color(c.ink).child(row.label))
          .child(div().truncate().text_size(TYPE.xs).text_color(c.faint).child(row.detail)),
      )
      .child(badge)
      .when(row.status === "cooldown", (el) => el.child(
        actionButton(c, `bh-res-retry-${row.key}`, "Retry now", (_e, cx) => this.resetResilience(row.cooldownKey ?? row.key, cx), {
          icon: "refresh-cw",
          tone: "secondary",
          disabled: this.resilienceBusy,
          tooltip: `Clear cooldown for ${row.label}`,
        }),
      ));
  }

  fallbackChainCard(c, r) {
    const chain = r.config.fallbacks;
    const toggleBtn = actionButton(c, "bh-fb-add-toggle", this.addingStep ? "Cancel" : "Add step", (_e, cx) => this.toggleAddStep(cx), {
      icon: this.addingStep ? "x" : "plus",
      tone: this.addingStep ? "quiet" : "secondary",
    });
    const rows = chain.length
      ? chain.map((step, i) => this.fallbackStepRow(c, step, i, chain.length))
      : [div().px(PAD).py(SPACE[3]).text_size(TYPE.sm).text_color(c.muted).child("No fallback steps yet. Add a model or harness to continue automatically if quota runs out.")];
    if (this.addingStep) rows.push(this.addFallbackRow(c));
    return this.group(c, {
      id: "bh-resilience-fallbacks",
      title: "Fallback chain",
      right: toggleBtn,
      rows,
    });
  }

  fallbackStepRow(c, step, i, total) {
    const entry = this.known.find((k) => k.key === step.harness) ?? { key: step.harness, name: harnessLabel(step.harness, this.known) };
    const title = `${i + 1}. ${harnessLabel(step.harness, this.known)}${step.model ? ` · ${step.model}` : " · default model"}${step.effort ? ` (${step.effort})` : ""}`;
    return h_flex()
      .id(`bh-fb-row-${i}`)
      .min_h(CONTROL + SPACE[3])
      .px(PAD)
      .py(SPACE[2])
      .gap(SPACE[3])
      .items_center()
      .child(harnessMark(c, entry, GLYPH.md))
      .child(div().flex_1().min_w(0).truncate().text_size(TYPE.md).text_color(c.ink).child(title))
      .child(
        h_flex()
          .flex_none()
          .gap(SPACE[1])
          .items_center()
          .child(actionButton(c, `bh-fb-up-${i}`, "↑", (_e, cx) => this.moveFallback(i, -1, cx), {
            tone: "quiet",
            disabled: i === 0,
            tooltip: `Move step ${i + 1} up`,
            a11y: `Move fallback step ${i + 1} up`,
          }))
          .child(actionButton(c, `bh-fb-down-${i}`, "↓", (_e, cx) => this.moveFallback(i, 1, cx), {
            tone: "quiet",
            disabled: i === total - 1,
            tooltip: `Move step ${i + 1} down`,
            a11y: `Move fallback step ${i + 1} down`,
          }))
          .child(actionButton(c, `bh-fb-rm-${i}`, "✕", (_e, cx) => this.removeFallback(i, cx), {
            tone: "danger",
            tooltip: `Remove step ${i + 1}`,
            a11y: `Remove fallback step ${i + 1}`,
          })),
      );
  }

  addFallbackRow(c) {
    const harnesses = this.fallbackHarnesses();
    const chosen = this.draftHarness || harnesses[0] || "claude";
    const efforts = effortsOf(chosen, this.draftModelInput.value().trim());
    const effortStops = ["", ...efforts];
    return v_flex()
      .id("bh-fb-draft")
      .mx(PAD)
      .my(SPACE[2])
      .p(SPACE[4])
      .gap(SPACE[3])
      .rounded(SIZE.control)
      .bg(c.ground)
      .border_1()
      .border_color(c.edge)
      .child(labelRow(c, "Harness"))
      .child(h_flex().flex_wrap().gap(SPACE[2]).children(harnesses.map((key) =>
        chipButton(c, `bh-fb-h-${key}`, harnessLabel(key, this.known), key === chosen, (_e, cx) => {
          this.draftHarness = key;
          if (!effortsOf(key).includes(this.draftEffort)) this.draftEffort = "";
          cx.notify();
        }))))
      .child(labelRow(c, "Model (optional)"))
      .child(textField(c, this.draftModelInput))
      .when(efforts.length > 0, (el) => el
        .child(labelRow(c, "Effort (optional)"))
        .child(h_flex().flex_wrap().gap(SPACE[2]).children(effortStops.map((eff) =>
          chipButton(c, `bh-fb-e-${eff || "default"}`, eff ? eff.charAt(0).toUpperCase() + eff.slice(1) : "Default", eff === this.draftEffort, (_e, cx) => {
            this.draftEffort = eff;
            cx.notify();
          })))))
      .child(h_flex().justify_end().gap(SPACE[2])
        .child(actionButton(c, "bh-fb-cancel", "Cancel", (_e, cx) => this.toggleAddStep(cx), { tone: "quiet" }))
        .child(actionButton(c, "bh-fb-commit", "Add to chain", (_e, cx) => this.commitFallbackStep(cx), { icon: "plus", tone: "primary" })));
  }

  guardrailsCard(c, r) {
    const cfg = r.config;
    const g = cfg.guardrails;
    const presetHint = (options, val, fmt = (v) => String(v)) =>
      options.some(([k]) => Number(k) === val) ? null : `Current: ${fmt(val)}`;
    return this.group(c, {
      id: "bh-resilience-guardrails",
      title: "Guardrails & Autonomous budgets",
      rows: [
        this.settingRow(
          c,
          "Autonomy mode",
          this.choice(c, "bh-res-autonomy", AUTONOMY_OPTIONS, cfg.autonomy, (v, cx) => this.updateResilience({ autonomy: v }, cx)),
          AUTONOMY_HINTS[cfg.autonomy] ?? null,
        ),
        this.settingRow(
          c,
          "Require bh check before step done",
          this.toggle(c, "bh-res-check", g.requireCheckBeforeDone, (_e, cx) => this.updateGuardrails({ requireCheckBeforeDone: !g.requireCheckBeforeDone }, cx), "Require bh check before step done"),
        ),
        this.settingRow(
          c,
          "Require git isolation in Autonomous mode",
          this.toggle(c, "bh-res-git-iso", g.requireGitIsolationInAutonomous, (_e, cx) => this.updateGuardrails({ requireGitIsolationInAutonomous: !g.requireGitIsolationInAutonomous }, cx), "Require git isolation in Autonomous mode"),
        ),
        this.settingRow(
          c,
          "Task spend cap ($)",
          this.choice(c, "bh-res-spend", SPEND_OPTIONS, String(g.maxTaskSpendUsd), (v, cx) => this.updateGuardrails({ maxTaskSpendUsd: parseBudgetNumber(v, 10, { min: 0, max: 10000 }) }, cx)),
          presetHint(SPEND_OPTIONS, g.maxTaskSpendUsd, (v) => (v > 0 ? `$${v}` : "Off")),
        ),
        this.settingRow(
          c,
          "Max retries on identical failure",
          this.choice(c, "bh-res-retries", RETRY_OPTIONS, String(g.maxStepRetries), (v, cx) => this.updateGuardrails({ maxStepRetries: parseBudgetNumber(v, 3, { min: 0, max: 50 }) }, cx)),
          presetHint(RETRY_OPTIONS, g.maxStepRetries),
        ),
        this.settingRow(
          c,
          "Max concurrent spawns",
          this.choice(c, "bh-res-spawns", SPAWN_OPTIONS, String(g.maxConcurrentSpawns), (v, cx) => this.updateGuardrails({ maxConcurrentSpawns: parseBudgetNumber(v, 4, { min: 1, max: 32 }) }, cx)),
          presetHint(SPAWN_OPTIONS, g.maxConcurrentSpawns),
        ),
        this.settingRow(
          c,
          "Max QA rounds",
          this.choice(c, "bh-res-qa", QA_OPTIONS, String(g.maxQaRounds), (v, cx) => this.updateGuardrails({ maxQaRounds: parseBudgetNumber(v, 3, { min: 0, max: 50 }) }, cx)),
          presetHint(QA_OPTIONS, g.maxQaRounds),
        ),
        this.invariantsRow(c, g.protectedPaths),
      ],
    });
  }

  invariantsRow(c, protectedPaths) {
    const paths = (Array.isArray(protectedPaths) ? protectedPaths : []).join(", ");
    const summary = `personOnly, access checks, built-in bh check scripts${paths ? ` · ${paths}` : ""}`;
    return v_flex()
      .id("bh-res-invariants")
      .px(PAD)
      .py(SPACE[3])
      .gap(SPACE[1])
      .child(
        h_flex()
          .gap(SPACE[2])
          .items_center()
          .child(div().text_size(TYPE.md).font_medium().text_color(c.ink).child("Protected invariants"))
          .child(div().px(SPACE[2]).rounded_full().bg(c.well).text_size(TYPE.xs).text_color(c.muted).child("Read-only")),
      )
      .child(div().text_size(TYPE.xs).text_color(c.faint).child(summary));
  }

  /** A switch: a pill track, the knob centred in it, sliding to the side that's set. */
  toggle(c, id, on, onClick, label = null) {
    const W = 36;
    const H = 20;
    const KNOB_D = 14;
    const inset = (H - 2 - KNOB_D) / 2; // inside the 1px border
    return focusable(
      div()
        .role("switch")
        .when(Boolean(label), (el) => el.accessibility_label(label))
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

  iconButton(c, id, icon, onClick, danger = false, a11y = null) {
    return actionButton(c, id, null, onClick, { icon, tone: danger ? "danger" : "quiet", a11y });
  }

  button(c, id, icon, label, onClick) {
    return actionButton(c, id, label, onClick, { icon, tone: "primary" });
  }
}

export { ROLES };

/**
 * A settings card's More, as a self-contained dialog over the page: an agent's extra fields
 * (and Name / What it does / Remove for custom agents), adding a harness, or the classifier's
 * advanced settings. Reads and writes through shared state and `bh` directly so it never relies
 * on sharing a module realm with the Settings page. Props: { view: "settings-more", kind, key, known, classifier }.
 */
export class MoreSheet {
  init(given, cx) {
    this.p = given ?? props() ?? {};
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.known = Array.isArray(this.p.known) ? this.p.known : [];
    this.problem = null;
    if (this.p.kind === "agent") this.initAgent(cx);
    else if (this.p.kind === "harness") this.initHarness();
    else this.initClassifier(cx);
  }

  initAgent(cx) {
    const a = this.agent();
    this.inputs = {};
    for (const f of AGENT_FIELDS) {
      const options = { value: a?.[f.key] ?? "", placeholder: f.placeholder };
      const state = f.rows ? TextareaState.new({ ...options, rows: f.rows }) : InputState.new(options);
      state.on("change", (_e, cx) => {
        const value = state.value();
        const now = this.agent();
        if (!now || now[f.key] === value) return;
        if (f.key === "name" && (!value.trim() || now.role !== "custom")) return;
        this.changeAgent({ [f.key]: f.key === "name" ? value : value.trim() }, cx);
      });
      this.inputs[f.key] = state;
    }
    if (!this.known.length) {
      cx.spawn(async (cx) => {
        try {
          this.known = await knownAgents({ on: currentSpace()?.machine ?? null });
        } catch {
          this.known = [];
        }
        cx.notify();
      });
    }
    if (a) this.loadTools(a.harness, cx);
    this.toolSearch = InputState.new({ placeholder: "Search skills and MCP servers" });
    this.toolSearch.on("change", (_e, cx) => cx.notify());
    this.taskPick = null; // what the classifier picked for this agent on the running task (pickedFor)
    if (a) this.loadTaskPick(a, cx);
    this.loadSupported(cx);
  }

  /** The newest active task's skills for this agent (id: its role, or its name's slug when custom). */
  loadTaskPick(a, cx) {
    cx.spawn(async (cx) => {
      const task = newestActive(await bhJson(["task", "list"]));
      const shown = task ? await bhJson(["task", "show", task.id]) : null;
      this.taskPick = pickedFor(shown, a.role === "custom" ? slug(a.name) : a.role);
      cx.notify();
    });
  }

  /** Which harnesses support picking, asked once per session; the fixed sentence stays until it answers. */
  loadSupported(cx) {
    if (SUPPORTED.asked) return;
    SUPPORTED.asked = true;
    cx.spawn(async (cx) => {
      SUPPORTED.names = supportedNames(await bhJson(["tools", "--list"]));
      cx.notify();
    });
  }

  initHarness() {
    this.harnessForm = {
      key: InputState.new({ placeholder: "omp" }),
      name: InputState.new({ placeholder: "Oh My Pi" }),
      run: InputState.new({ placeholder: "omp --some-flag" }),
    };
  }

  initClassifier(cx) {
    this.classifier = this.p.classifier ?? null;
    this.thresholdInputs = {};
    for (const t of THRESHOLDS) {
      const initial = this.classifier?.thresholds?.[t.key];
      const state = InputState.new({ value: initial !== undefined ? String(initial) : "", placeholder: "0.5" });
      const save = (_e, cx) => {
        const n = Number(state.value().trim());
        const was = this.classifier?.thresholds?.[t.key];
        if (!Number.isFinite(n) || n < 0 || n > 1) {
          if (was !== undefined) state.set_value(String(was));
          return;
        }
        if (n !== was) this.saveConfig({ thresholds: { [t.key]: n } }, cx);
      };
      state.on("submit", save);
      state.on("blur", save);
      this.thresholdInputs[t.key] = state;
    }
    if (!this.classifier) {
      cx.spawn(async (cx) => {
        const got = await bhJson(["config"]);
        if (got) this.showConfig(got);
        cx.notify();
      });
    }
  }

  list() {
    return roster(shared(ROSTER_KEY), this.known);
  }

  agent() {
    return this.list().find((x) => x.id === this.p.key) ?? null;
  }

  harnessName(key) {
    return this.known.find((k) => k.key === key)?.name ?? key;
  }

  changeAgent(patch, cx) {
    setShared(ROSTER_KEY, this.list().map((x) => (x.id === this.p.key ? { ...x, ...patch } : x)));
    cx.notify();
  }

  loadTools(harness, cx, refresh = false) {
    if (TOOLS_ASKING.has(harness) || (!refresh && TOOLS_CACHE.has(harness))) return;
    TOOLS_ASKING.add(harness);
    cx.spawn(async (cx) => {
      TOOLS_CACHE.set(harness, await fetchTools(harness, true));
      TOOLS_ASKING.delete(harness);
      cx.notify();
    });
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
        setShared(HARNESS_ADDED, Date.now());
        notify({ title: "Harness added", body: `${key} shows up in the harness lists within a minute.`, level: "success", timeout: 4000 });
      } else this.problem = `Couldn't add it: ${(r.stderr || r.stdout).trim().split("\n")[0]}`;
      cx.notify();
    });
  }

  showConfig(got) {
    this.classifier = got;
    const routing = Boolean(got.enabled && got.keyFound && got.features?.lobby !== false);
    if (Boolean(shared(ROUTING_KEY)) !== routing) setShared(ROUTING_KEY, routing);
    for (const t of THRESHOLDS) this.thresholdInputs[t.key].set_value(String(got.thresholds?.[t.key] ?? ""));
  }

  saveConfig(patch, cx) {
    if (this.classifier) this.classifier = { ...this.classifier, ...patch, features: { ...this.classifier.features, ...(patch.features ?? {}) }, thresholds: { ...this.classifier.thresholds, ...(patch.thresholds ?? {}) } };
    cx.notify();
    cx.spawn(async (cx) => {
      const got = await bhJson(["config", "--data", enc(patch)]);
      if (got) {
        this.showConfig(got);
        setShared(CONFIG_CHANGED, Date.now());
      } else this.problem = "Couldn't save the classifier settings. Is node on your PATH?";
      cx.notify();
    });
  }

  close() {
    closeOverlay(props()?.overlay ?? this.p.overlay);
  }

  /** The card's title: the agent's avatar and name, or the section's icon and title. */
  heading(c) {
    const agent = this.p.kind === "agent" ? this.agent() : null;
    const icon = { agent: "users", harness: "page-terminals", classifier: "zap" }[this.p.kind] ?? "page-settings";
    const title = this.p.kind === "agent" ? (agent?.name ?? "Agent") : this.p.kind === "harness" ? "Add a harness" : "Classifier";
    return h_flex().flex_none().h(CONTROL + SPACE[4]).px(PAD).gap(SPACE[3]).items_center()
      .border_b(1)
      .border_color(c.edge)
      .when(Boolean(agent), (el) => el.child(avatar(c, agent?.name ?? "", mentionTone(c, agent?.role !== "custom" ? agent?.role : agent?.name), 28)))
      .when(!agent, (el) => el.child(div().flex_none().size(26).rounded(SIZE.nested).flex().items_center().justify_center().bg(c.well).text_color(c.muted)
        .child(svg(ICON(icon)).size(GLYPH.md))))
      .child(div().flex_1().min_w(0).truncate().text_size(TYPE.lg).font_semibold().child(title))
      .child(actionButton(c, "bh-more-close", null, () => this.close(), { icon: "x", tone: "quiet", a11y: "Close" }));
  }

  toolsMore(c, a) {
    const got = TOOLS_CACHE.get(a.harness);
    const note = (text) => div().text_size(TYPE.xs).text_color(c.muted).child(text);
    const refresh = actionButton(c, "bh-tools-refresh", null, (_e, cx) => this.loadTools(a.harness, cx, true), { icon: "refresh-cw", tone: "quiet", a11y: "Refresh skills and MCP servers" });
    const head = v_flex().gap(SPACE[2]).child(h_flex().items_center().gap(SPACE[2]).child(div().flex_1().child(labelRow(c, "Pinned by you"))).child(refresh));
    if (!got || TOOLS_ASKING.has(a.harness)) return head.child(note("Looking for installed skills and MCP servers…"));
    if (got.error) return head.child(note(got.error));
    if (!got.supported) return head.child(note(this.unsupportedText(a.harness)));
    const searching = (got.skills?.length ?? 0) + (got.mcp?.length ?? 0) > SEARCH_OVER;
    const query = searching ? this.toolSearch.value() : "";
    const pinnedHint = "Always allowed. The classifier adds skills for each task on top.";
    return v_flex().gap(SPACE[4])
      .child(head
        .when(searching, (el) => el.child(textField(c, this.toolSearch)))
        .child(this.toolChips(c, a, "skills", got.skills, query, pinnedHint)))
      .child(this.taskPicks(c))
      .child(v_flex().gap(SPACE[2]).child(labelRow(c, "MCP servers")).child(this.toolChips(c, a, "mcp", got.mcp, query)));
  }

  /** "<harness> isn't supported yet: <the supported ones> are." from bh tools --list, or the fixed list until it answers. */
  unsupportedText(harness) {
    const names = SUPPORTED.names ?? SUPPORTED_FALLBACK;
    return `${this.harnessName(harness)} isn't supported yet: ${names} ${names.includes(" and ") ? "are" : "is"}.`;
  }

  /** Read-only: the skills the classifier picked for this agent on the running task, added ones marked. */
  taskPicks(c) {
    const p = this.taskPick;
    const note = (text) => div().text_size(TYPE.xs).text_color(c.muted).child(text);
    const body = !p ? note("Looking at the running task…")
      : p.kind === "none" ? note("No task running.")
      : p.kind === "off" ? note("Classifier off: only your pins apply.")
      : !p.names.length ? note("Nothing extra for this task.")
      : h_flex().flex_wrap().gap(SPACE[2]).children(p.names.map((x) => div().flex_none().h(CHIP).px(SPACE[3]).flex().items_center()
        .rounded(SIZE.nested).bg(c.well).text_size(TYPE.xs).text_color(c.muted).child(x.added ? `${x.name} (added)` : x.name)));
    return v_flex().gap(SPACE[2]).child(labelRow(c, "Picked for the current task")).child(body);
  }

  toolChips(c, a, kind, items, query = "", fixedHint = null) {
    const ticked = a[kind] ?? [];
    const shown = filterTools([...(items ?? []), ...ticked.map((name) => ({ name }))], query);
    const names = [...new Set(shown.map((t) => t.name))];
    const toggle = (name, cx) => this.changeAgent({ [kind]: ticked.includes(name) ? ticked.filter((n) => n !== name) : [...ticked, name] }, cx);
    const hint = fixedHint ?? (ticked.length ? "Only the ticked ones." : "None ticked: it can use all of them.");
    return v_flex().gap(SPACE[2])
      .child(div().text_size(TYPE.xs).text_color(c.muted).child(hint))
      .when(!names.length, (el) => el.child(div().text_size(TYPE.sm).text_color(c.muted).child(query ? "None match." : "None installed.")))
      .child(h_flex().flex_wrap().gap(SPACE[2]).children(names.map((name) =>
        chipButton(c, `bh-${kind}-${name}`, name, ticked.includes(name), (_e, cx) => toggle(name, cx)))));
  }

  agentMore(c) {
    const a = this.agent();
    if (!a) return div().text_size(TYPE.sm).text_color(c.muted).child("This agent is no longer on the team.");
    const custom = a.role === "custom";
    return v_flex().gap(SPACE[4])
      .when(custom, (el) => el
        .child(v_flex().gap(SPACE[2]).child(labelRow(c, "Name")).child(textField(c, this.inputs.name)))
        .child(v_flex().gap(SPACE[2]).child(labelRow(c, "What it does")).child(textField(c, this.inputs.does))))
      .child(v_flex().gap(SPACE[2]).child(labelRow(c, "Arguments")).child(textField(c, this.inputs.args)))
      .child(v_flex().gap(SPACE[2]).child(labelRow(c, "Instructions")).child(textArea(c, this.inputs.instructions)))
      .child(this.toolsMore(c, a))
      .child(div().text_size(TYPE.xs).text_color(c.faint).child(argvOf(a, this.known).join(" ")))
      .when(custom, (el) => el.child(h_flex().child(this.removeButton(c, a))));
  }

  /** Remove in two steps, as a task's Delete: the first click asks "Remove <name>?", the second removes. */
  removeButton(c, a) {
    const id = "bh-remove-agent-" + a.id;
    const sure = armed(this, "armed", id);
    return actionButton(c, id, sure ? `Remove ${a.name}?` : "Remove agent", (_e, cx) => {
      if (!sure) return arm(this, "armed", id, cx);
      this.armed = null;
      setShared(ROSTER_KEY, this.list().filter((x) => x.id !== a.id));
      this.close();
    }, { icon: "trash", tone: "danger" });
  }

  harnessMore(c) {
    const f = this.harnessForm;
    const col = (label, state, w) => v_flex().gap(SPACE[2]).w(w).child(labelRow(c, label)).child(textField(c, state));
    return v_flex().gap(SPACE[4])
      .child(h_flex().flex_wrap().gap(SPACE[3]).items_end()
        .child(col("Key", f.key, 120))
        .child(col("Name", f.name, 160))
        .child(v_flex().flex_1().min_w(0).gap(SPACE[2]).child(labelRow(c, "Command")).child(textField(c, f.run))))
      .child(h_flex().child(actionButton(c, "bh-add-harness", "Add", (_e, cx) => this.addHarness(cx), { icon: "plus", tone: "primary" })))
      .when(Boolean(this.problem), (el) => el.child(div().text_size(TYPE.sm).text_color(c.danger).child(this.problem)));
  }

  classifierMore(c) {
    const k = this.classifier;
    if (!k) return stateView(c, { id: "bh-cls-more-loading", title: "Loading…", loading: true });
    return v_flex().gap(SPACE[4])
      .child(v_flex().gap(SPACE[2])
        .child(div().text_size(TYPE.md).font_medium().child("Use it for"))
        .child(h_flex().flex_wrap().gap(SPACE[2]).children(FEATURES.map((f) =>
          chipButton(c, `bh-feat-${f.key}`, f.label, k.features?.[f.key] !== false, (_e, cx) => this.saveConfig({ features: { [f.key]: k.features?.[f.key] === false } }, cx))))))
      .child(h_flex().gap(SPACE[3]).items_start().children(THRESHOLDS.map((t) =>
        v_flex().flex_1().min_w(0).gap(SPACE[2]).child(div().text_size(TYPE.xs).text_color(c.muted).child(t.label)).child(div().w(84).child(textField(c, this.thresholdInputs[t.key]))))))
      .when(Boolean(this.problem), (el) => el.child(div().text_size(TYPE.sm).text_color(c.danger).child(this.problem)));
  }

  body(c) {
    if (this.p.kind === "agent") return this.agentMore(c);
    if (this.p.kind === "harness") return this.harnessMore(c);
    return this.classifierMore(c);
  }

  render() {
    const c = colors();
    return v_flex()
      .id("bh-settings-more")
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key !== "escape") return;
        cx.stop_propagation();
        this.close();
      })
      .size_full()
      .rounded(SIZE.radius)
      .bg(c.fill)
      .border_1()
      .border_color(c.edge)
      .shadow_lg()
      .overflow_hidden()
      .text_color(c.ink)
      .child(this.heading(c))
      .child(div().id("bh-settings-more-scroll").flex_1().min_h(0).overflow_y_scroll().p(PAD)
        .child(this.body(c)));
  }
}
