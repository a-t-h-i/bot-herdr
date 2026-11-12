// The composer: one text box for every agent herdr runs. It sits at the foot of the chat page
// (chat.js). One raised bubble with the text on top and a tools row under it (attach, the space
// chip, the Orchestrator's model chip, stop, a round send key). The `/` commands, the `@` agents, the attach menu and
// the spaces list grow out of its top edge as a smaller bubble joined to it by curved fillets.
//
// A message goes to the space's Orchestrator: the roster's lead agent (Settings), running in the
// tab that carries its name, started on the first message if the space has none. It plans and
// hands work to child agents. Or it goes to whoever you `@`: an agent from Settings (started if it
// is not running), any other running agent, a child agent, `@all` in this space, or
// `@new-<harness>` to start a plain one. `/stop` and `/peek` act on the agent; any other
// `/command` is sent as typed, so each harness's own commands still work. Sending is `hc send`.
//
// A roster agent whose harness has a headless mode (Claude Code, Codex, pi, Oh My Pi, Gemini,
// opencode, Qwen Code) starts as `bh agent` in its tab: each message runs the harness headless and
// its answer comes back to the chat by itself (engine/lib/agent.mjs). Settings can turn that off.
// Any other agent is its harness's own CLI, told once how to start child agents and where to
// write its reply (brief.js): in front of its first message from here, or of the task it is
// started with. `/team` repeats it.
//
// An agent's questions (bh ask) grow out of the same top edge, one at a time; put away with Esc,
// they shrink to a bar that brings them back. Toasts rise out of it too, one at a time, and sink
// back in when they go.

import { div, svg, image } from "gpui-kit";
import { v_flex, h_flex, TextareaState, Textarea, InputState, Input } from "gpui-base";
import {
  agents as reported, panes, terminals, spaces, focused, settings, run, hc, knownAgents, pickFolder, exec, window as herdrWindow,
  shared, setShared, appHome,
} from "herdr";
import { showPage, hold } from "./pages.js";
import { SIZE, MOTION, ICON, TYPE, LINE, SPACE, ROW, CHIP, CONTROL, TARGET, MARK, DOT, PIP, HAIR, GLYPH, tint, readable, textWidth, rowsFor, baseName, upFrom, filterEntries, togglePick, sizeText, clickable, pressable, focusable } from "./look.js";
import { actionButton } from "./button.js";
import { stateView } from "./switch.js";
import { colors } from "./theme.js";
import {
  triggerAt, caretAfterEdit, slashRows, mentionRows, tokenFor, plan, orchestratorOf, withoutEnter, messageText, commandColor,
} from "./route.js";
import { ROSTER_KEY, HEADLESS_KEY, roster, argvOf, runnable, runningAs, slug, headless, withPrompt, modelsOf, effortsOf } from "./roster.js";
import { harnessMark } from "./pick.js";
import { mentionTone } from "./indicators.js";
import { withQuiet, isQuiet } from "./live.js";
import { BRIEFED, teamBrief, orchestratorBrief, briefed } from "./brief.js";
import { bh, bhJson, bhPath, enc, projectDir, ROUTING_KEY } from "./bh.js";
import { queue, push as pushToast, dismiss as dismissToast, stayFor, toastSize, noteText, TOAST_KEY } from "./toasts.js";
import { TOAST_ICONS, toneOf } from "./toast.js";
import * as Drawer from "./drawer.js";
import { alpha } from "./working.js";
import { mockupFile, fromClipboard, previews, isImage, openInBrowser } from "./media.js";
import { openLightbox, CHOSEN } from "./lightbox.js";

/** Every agent running now: herdr's, and the terminals of harnesses that never report a status. */
export const liveAgents = () => withQuiet({ agents: reported(), panes: panes(), spaces: spaces() });
const agents = liveAgents;

/** A terminal running `bh agent` (an agent run headless) carries this label. */
const HEADLESS_LABEL = "bot-herdr.headless";
const runsHeadlessAt = (address) => Boolean(terminals().find((t) => t.address === address)?.labels?.[HEADLESS_LABEL]);

/** How far in from the box's sides a pane starts: past the box's corner curve, so the joins meet a straight edge. */
const PANE_INSET = SIZE.radius + 6;

const PLACEHOLDER = "Write a message, run a command, or ask an agent";
const CLEAR = "#00000000";

/** Where agents write their replies for the chat (see brief.js and chat.js). */
export const outboxDir = () => `${appHome().replace(/\\/g, "/")}/data/bot-herdr/replies`;

/** The toast's springs: the rise out of the composer's edge and the shape it swells into. */
const TOAST_SPRINGS = {
  rise: { response: 420, damping: 0.82 },
  height: { response: 360, damping: 0.66 },
  width: { response: 440, damping: 0.7 },
};

/**
 * Going is coming in reverse. The words fade first (they came last), then the shape, still
 * solid, springs back down on the same springs it rose on: it narrows, drops and slips under
 * the composer's top edge, where the box covers it. It never fades in mid-air.
 */
const TOAST_EXIT_TEXT = { duration: 140, easing: "ease-out" };
/** How long the shape holds while its words go, before it sinks. */
const TOAST_SINK_DELAY = 100;
/** How far under the edge the shape comes to rest, so its shadow is covered too. */
const TOAST_SINK_DEPTH = 6;

/**
 * How long a spring takes to come to rest, from its own numbers: the envelope
 * `exp(-damping·ω·t)`, with `ω = 2π/response`, has fallen to 1% of the travel.
 */
const settleFor = ({ response, damping }) => Math.ceil((response * Math.log(100)) / (2 * Math.PI * damping));

/** From the start of the sink to out of the tree: once the drop has settled, under the edge. */
const TOAST_GONE = settleFor(TOAST_SPRINGS.rise) + 16;

/** The send key: its accent swells in with a little give and goes back without; a send launches its arrow. */
const SEND_GROW = { response: 320, damping: 0.62 };
const SEND_SHRINK = { response: 220, damping: 1 };
/** How far the arrow flies up when sent (a new one rises from a little below). */
const SEND_TRAVEL = 18;
const SEND_LAUNCH = { duration: 200, easing: "ease-in" };
const SEND_LAUNCH_FADE = { duration: 160, easing: "ease-in" };
const SEND_RISE = { duration: 220, easing: "ease-out" };
const SEND_SPIN_IN = { duration: 160, delay: 160, easing: "ease-out" };

/** One folder's listing, at most this many entries. */
const LIST_LIMIT = 500;

/**
 * Lists a folder as herdr's built-in file explorer does: a small sh script run through herdr's
 * `exec`, so it needs neither node nor the engine. Returns { path, entries, truncated }, or
 * { fallback: true } where there is no sh (Windows), or { error } when the folder can't be read.
 */
async function listWithHerdr(path, hidden = false) {
  if (herdrWindow()?.platform === "windows" || /^[a-z]:[\\/]?/i.test(String(path))) return { fallback: true };
  const dir = String(path || "/").replace(/\/+$/, "") || "/";
  const script = 'n=0; for p in "$1"/* "$1"/.[!.]* "$1"/..?*; do [ -e "$p" ] || [ -L "$p" ] || continue; name=${p##*/}; [ "$name" = .git ] && continue; if [ -d "$p" ]; then kind=d; else kind=f; fi; printf "%s\\0%s\\0" "$kind" "$name"; n=$((n+1)); [ "$n" -gt ' + LIST_LIMIT + ' ] && break; done; test -d "$1"';
  let r;
  try {
    r = await exec("sh", ["-c", script, "files", dir], { timeout: 15000 });
  } catch (e) {
    return String(e).includes("not found") ? { fallback: true } : { error: `Couldn't list ${dir}: ${String(e?.message ?? e)}` };
  }
  if (r.code !== 0) return { error: (r.stderr || "").trim() || `No such folder: ${dir}` };
  const fields = String(r.stdout ?? "").split("\0");
  const entries = [];
  for (let i = 0; i + 1 < fields.length; i += 2) {
    const name = fields[i + 1];
    if (!name || (!hidden && name.startsWith("."))) continue;
    entries.push({ name, path: dir === "/" ? `/${name}` : `${dir}/${name}`, dir: fields[i] === "d" });
  }
  entries.sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) : a.dir ? -1 : 1));
  return { path: dir, entries: entries.slice(0, LIST_LIMIT), truncated: entries.length > LIST_LIMIT };
}

/** Each harness's models as `bh models` reported them, for the Orchestrator's chip. */
const COMPOSER_MODELS = new Map();

/** The Scout name `bh knowledge ask --json` answers with; null when the reply has none. */
function askedName(stdout) {
  try {
    return JSON.parse(stdout)?.name || null;
  } catch {
    return null;
  }
}

export class Composer {
  /**
   * `hooks.sent({ text, to, files })` is called for each message that went out and returns its
   * feed id; `hooks.relabel(id, from, name, cx)` renames one recipient of that message once known.
   */
  constructor(hooks = {}) {
    this.hooks = hooks;
  }

  init(_props, cx) {
    this.text = "";
    this.trigger = null;
    this.dismissed = null; // the text Esc closed the suggestions on; they stay shut until it changes
    this.mode = null; // "start" after /new: the @ list offers only agents to start
    this.starts = []; // agents we started and are waiting to see, to mark them as briefed
    this.pane = null; // "suggest" | "attach" | "spaces"
    this.at = 0;
    this.offset = 0; // first suggestion row shown when there are more than fit
    this.ready = false; // a pane's first frame is drawn closed, then opens, so it animates
    this.files = [];
    this.known = [];
    this.toasts = queue(); // toasts waiting their turn (toasts.js)
    this.toast = null; // the one on screen: { item, phase: "start" | "up" | "out" | "sink", rose, at, n }
    this.toastN = 0;
    this.noteAt = shared(TOAST_KEY)?.at ?? 0; // the last herdr notification taken in
    this.questions = []; // agents' open questions, oldest first (the chat reads them)
    // The attach pane's file browser: one listing at a time, on this machine only.
    this.browse = null; // { path, parent, entries, truncated, error, loading, selected:Set, hidden, foreign }
    this.browseAt = 0; // the row the keyboard is on
    this.browseLast = null; // { path, at }: a second click on the same folder opens it
    // The Orchestrator's model pane: a search over every harness's models, and its effort.
    this.modelSearch = InputState.new({ placeholder: "Search models" });
    this.modelSearch.on("change", (_e, cx) => cx.notify());
    this.modelSearch.on("submit", (_e, cx) => {
      const first = this.modelRows().find((o) => !o.heading);
      if (first) this.pickLeadModel(first.value, cx);
    });
    this.browseSearch = InputState.new({ placeholder: "Search this folder" });
    this.browseSearch.on("change", (_e, cx) => cx.notify());
    this.browseTyped = InputState.new({ placeholder: "A path on this machine" });
    this.browseTyped.on("submit", (_e, cx) => this.attachTyped(cx));
    this.browseHandle = cx.focus_handle();
    this.walk = null; // the questions being answered: drawer.js state
    this.putAway = new Set(); // question sets Esc put away: a bar brings them back
    this.dismissing = null; // the set whose Dismiss asks "Dismiss it?"
    this.chosenAt = shared(CHOSEN)?.at ?? 0; // the last "Choose this" from a picture opened large
    this.shownPane = null; // the pane drawn last, so a new one opens with its animation
    this.pageHeight = 700;
    this.sending = false;
    this.sendFx = { n: 0, phase: "rest" }; // the send key's arrow: "rest" | "launch" | "land" | "rise"
    this.width = SIZE.maxWidth;
    this.justBriefed = new Set(); // briefed this session; the label can take a moment to show
    this.expanded = true;

    // The box's height is ours (see box()): the text box fills whatever it is given, so it is
    // never left to size itself.
    this.input = TextareaState.new({ rows: 1 });
    this.input.set_soft_wrap(true);
    this.input.on("change", (_e, cx) => this.changed(cx));
    // Enter is bound to our send action below; if the text box ever gets it first, it inserts a
    // newline and reports `submit`, and we send what was there before the newline.
    this.input.on("submit", (e, cx) => {
      if (e?.shift || e?.secondary) return;
      const before = this.text;
      const now = this.input.value();
      if (now === before) return;
      this.input.set_value(withoutEnter(now, before));
      this.text = this.input.value();
      if (this.menuOpen()) this.pick(this.rows()[this.at], cx);
      else this.send(cx);
    });
    // A paste with no text: the clipboard's image (or files copied in the file manager) goes on
    // as attachments, images with a preview.
    this.input.on("paste_other", (_e, cx) => this.pasteOther(cx));

    // Keys while the text box has the keyboard ("A > Input": the text box inside our element).
    // Later bindings win over the text box's own at the same depth, and the menu ones are added
    // last so they win over send. A failure here must not stop the composer: the `submit`
    // fallback above still sends.
    try {
      cx.bind_keys([
        { keystroke: "enter", action: "bot_herdr_send", context: "BotHerdr > Input" },
        { keystroke: "enter", action: "bot_herdr_pick", context: "BotHerdrMenu > Input" },
        { keystroke: "tab", action: "bot_herdr_pick", context: "BotHerdrMenu > Input" },
        { keystroke: "up", action: "bot_herdr_up", context: "BotHerdrMenu > Input" },
        { keystroke: "down", action: "bot_herdr_down", context: "BotHerdrMenu > Input" },
        { keystroke: "escape", action: "bot_herdr_close", context: "BotHerdrPane > Input" },
      ]);
    } catch (e) {
      console.log("bot-herdr: key bindings not installed:", String(e?.message ?? e));
    }

    this.loadKnown(cx);
    cx.timer.every(60000, (cx) => this.loadKnown(cx));
  }

  focus() {
    this.expanded = true;
    this.input.focus();
  }

  loadKnown(cx) {
    cx.spawn(async (cx) => {
      try {
        this.known = await knownAgents({ on: this.space()?.machine ?? null });
      } catch {
        this.known = [];
      }
      cx.notify();
    });
  }

  // ── What is where ──────────────────────────────────────────────────────────────────────────

  space() {
    const f = focused();
    return spaces().find((s) => s.id === f?.space) ?? spaces().find((s) => s.active) ?? null;
  }

  /** The agents set up in Settings. */
  roster() {
    return roster(shared(ROSTER_KEY), this.known);
  }

  leadEntry() {
    return this.roster().find((a) => a.lead);
  }

  // ── The Orchestrator's model, picked from the bar (the others are set in Settings) ────────

  /** The Orchestrator's model as the chip shows it: its name, or its harness's default. */
  leadModelName() {
    const a = this.leadEntry();
    if (!a?.model) return "Default model";
    const got = COMPOSER_MODELS.get(a.harness);
    return (got?.models ?? []).find((m) => m.id === a.model)?.name ?? modelsOf(a.harness).find((m) => m.id === a.model)?.name ?? a.model;
  }

  /** Asks every installed harness here for its models (`bh models`), once; the pane redraws as they come. */
  askLeadModels(cx) {
    if (this.askingModels || this.space()?.machine) return;
    const pending = this.known.filter((k) => k.installed && !COMPOSER_MODELS.has(k.key));
    if (!pending.length) return;
    this.askingModels = true;
    cx.spawn(async (cx) => {
      await Promise.all(pending.map(async (k) => {
        const r = await bhJson(["models", k.key, "--command", (k.run ?? [k.key])[0]], { timeout: 60000 });
        COMPOSER_MODELS.set(k.key, r ?? { models: [] });
        cx.notify();
      }));
      this.askingModels = false;
      cx.notify();
    });
  }

  /** Opens or closes the model pane, which grows out of the composer like the others. */
  toggleModels(cx) {
    if (this.pane === "model") return this.toggle("model", cx);
    this.modelSearch.set_value("");
    this.askLeadModels(cx);
    this.open("model", cx);
    cx.timer.after(16, (cx) => {
      this.modelSearch.focus();
      cx.notify();
    });
  }

  /**
   * Every installed harness's models, each section headed by the harness, the Orchestrator's own
   * first: what the harness reports, else the built-in list meanwhile. Filtered by the search.
   */
  modelRows() {
    const a = this.leadEntry();
    if (!a) return [];
    const local = !this.space()?.machine;
    const installed = this.known.filter((k) => k.installed);
    const order = [...installed].sort((x, y) => (y.key === a.harness) - (x.key === a.harness));
    const words = this.modelSearch.value().toLowerCase().split(/\s+/).filter(Boolean);
    const rows = [];
    for (const full of order) {
      const k = { key: full.key, name: full.name, icon: full.icon ?? null, tint: full.tint, tile: full.tile ?? null, color: full.color ?? null };
      const got = local ? COMPOSER_MODELS.get(k.key) : null;
      const found = got?.models?.length ? got.models : modelsOf(k.key).filter((m) => m.current !== false);
      const list = [{ value: `${k.key}|`, label: "Default model", harness: k }];
      if (k.key === a.harness && a.model && !found.some((m) => m.id === a.model)) list.push({ value: `${k.key}|${a.model}`, label: a.model, note: "set in Settings", harness: k });
      const seen = new Set();
      for (const m of found) {
        if (!m?.id || seen.has(m.id)) continue;
        seen.add(m.id);
        const name = m.name ?? m.id;
        list.push({ value: `${k.key}|${m.id}`, label: name, note: name !== m.id ? m.id : "", harness: k });
      }
      const kept = words.length ? list.filter((o) => words.every((w) => `${o.label} ${o.note ?? ""} ${k.name} ${k.key}`.toLowerCase().includes(w))) : list;
      if (kept.length) rows.push({ heading: k.name }, ...kept);
    }
    return rows;
  }

  /** A model picked in the pane: the Orchestrator moves to it (and its harness); the pane closes. */
  pickLeadModel(value, cx) {
    const lead = this.leadEntry();
    this.pane = null;
    this.input.focus();
    cx.notify();
    if (!lead) return;
    const [harness, ...rest] = String(value ?? "").split("|");
    const model = rest.join("|");
    if (!harness || (harness === lead.harness && model === (lead.model ?? ""))) return;
    const effort = effortsOf(harness, model).includes(lead.effort) ? lead.effort : "";
    this.saveLead({ harness, model, effort }, cx);
  }

  /** The model pane: search on top, the Orchestrator's effort, then the models, scrolling. */
  modelBody(c) {
    const a = this.leadEntry();
    const rows = this.modelRows();
    const levels = a ? effortsOf(a.harness, a.model ?? "") : [];
    const listH = Math.min(7 * ROW, Math.max(ROW, rows.reduce((n, o) => n + (o.heading ? CONTROL : ROW), 0)));
    const head = CONTROL + SPACE[3] + (levels.length ? CHIP + SPACE[3] : 0) + (this.askingModels ? ROW + SPACE[3] : 0);
    const selected = a ? `${a.harness}|${a.model ?? ""}` : "";
    const body = v_flex()
      .w_full()
      .gap(SPACE[3])
      .child(h_flex().flex_none().h(CONTROL).px(SPACE[3]).gap(SPACE[2]).items_center().rounded(SIZE.nested).bg(c.ground).border_1().border_color(c.edge)
        .child(svg(ICON("search")).flex_none().size(GLYPH.sm).text_color(c.faint))
        .child(div().flex_1().min_w(0).h_full().child(Input.new(this.modelSearch).w_full().h_full().text_size(TYPE.md).text_color(c.ink))))
      .when(levels.length > 0, (el) => el.child(h_flex().flex_none().h(CONTROL).gap(SPACE[2]).items_center()
        .child(div().flex_none().w(52).text_size(TYPE.xs).font_medium().text_color(c.muted).child("Effort"))
        .children(["", ...levels].map((l) => {
          const on = (a.effort ?? "") === l;
          return clickable(
            div().h(CONTROL).px(SPACE[3]).flex().items_center().rounded(SIZE.nested).border_1()
              .border_color(on ? c.accent : c.edge).when(on, (x) => x.bg(c.well))
              .text_size(TYPE.sm).text_color(on ? c.ink : c.muted)
              .on_click((_e, cx) => {
                if ((a.effort ?? "") !== l) this.saveLead({ effort: l }, cx);
                cx.notify();
              })
              .child(l ? l.charAt(0).toUpperCase() + l.slice(1) : "Default"),
            c,
            `bc-effort-${l || "default"}`,
          );
        }))))
      .when(Boolean(this.askingModels), (el) => el.child(div().flex_none().h(ROW).flex().items_center().text_size(TYPE.xs).text_color(c.faint).child("Asking the harnesses for their models…")))
      .child(v_flex().id("bc-models").flex_none().h(listH).overflow_y_scroll()
        .when(!rows.length, (el) => el.child(div().h(ROW).px(SPACE[3]).flex().items_center().text_size(TYPE.md).text_color(c.muted).child("No model matches.")))
        .children(rows.map((o, i) => (o.heading
          ? div().flex_none().h(CONTROL).px(SPACE[3]).flex().items_end().pb(SPACE[1]).text_size(TYPE.xs).text_color(c.faint).child(o.heading)
          : clickable(
            h_flex().flex_none().h(ROW).px(SPACE[3]).gap(SPACE[3]).items_center().rounded(SIZE.nested)
              .when(o.value === selected, (el) => el.bg(c.hover))
              .on_click((_e, cx) => this.pickLeadModel(o.value, cx))
              .child(harnessMark(c, o.harness, GLYPH.md))
              .child(div().flex_1().min_w(0).truncate().text_size(TYPE.md).child(o.label))
              .when(Boolean(o.note), (el) => el.child(div().flex_none().max_w(160).truncate().text_size(TYPE.xs).text_color(c.faint).child(o.note)))
              .when(o.value === selected, (el) => el.child(svg(ICON("check")).size(GLYPH.md).text_color(c.accent))),
            c,
            `bc-model-${i}`,
          )))));
    return { body, h: head + listH + SPACE[3] * 2 };
  }

  /** Changes the Orchestrator's entry in the team, as Settings would, and saves it for bh. */
  saveLead(patch, cx) {
    const list = this.roster().map((a) => (a.lead ? { ...a, ...patch } : a));
    setShared(ROSTER_KEY, list);
    const known = this.known.map((k) => ({ key: k.key, name: k.name, run: k.run, installed: k.installed }));
    cx.timer.after(1, (cx) => cx.spawn(async (cx) => {
      const r = await bh(["team", "save", "--data", enc({ agents: list, known })]);
      if (r.code !== 0) this.say(`Couldn't save the Orchestrator's settings: ${(r.stderr || r.stdout || "node didn't run").trim().split("\n")[0]}`, cx);
      cx.notify();
    }));
  }


  /** The Orchestrator a plain message goes to, or null when this space has none yet. */
  target() {
    return orchestratorOf(agents(), this.space()?.id ?? null, this.leadEntry().name);
  }

  /** What starts a new Orchestrator, or null when its harness is not installed. */
  lead() {
    const entry = this.leadEntry();
    if (!runnable(entry, this.known)) return null;
    return { run: argvOf(entry, this.known), name: this.known.find((k) => k.key === entry.harness)?.name ?? entry.harness, tab: entry.name };
  }

  /** Roster agents that are not running in this space: `@name` starts them. Then the bare harnesses. */
  startables() {
    const space = this.space()?.id ?? null;
    const mine = this.roster()
      .filter((a) => !a.lead && runnable(a, this.known) && !runningAs(a, agents(), space))
      .map((a) => {
        const k = this.known.find((k) => k.key === a.harness);
        return {
          key: `cfg:${a.id}`, entry: a.id, name: a.name, handle: slug(a.name), run: argvOf(a, this.known), installed: true, tab: a.name, tile: k?.tile ?? null,
          hint: `Start ${a.name} · ${[k?.name ?? a.harness, a.model, a.effort].filter(Boolean).join(" · ")}`,
        };
      });
    // Only the team's agents start from here: no bare harness, no agent of one's own.
    return mine;
  }

  /** Running agents that are roster entries, by address: the name they go by. */
  names() {
    const space = this.space()?.id ?? null;
    const out = {};
    for (const a of this.roster()) {
      const running = runningAs(a, agents(), space);
      if (running) out[running.address] = a.name;
    }
    return out;
  }

  /** What the briefs need: the installed harnesses, the roster with its commands, the outbox. */
  briefing(extra = {}) {
    return {
      known: this.known,
      roster: this.roster().filter((a) => !a.lead && runnable(a, this.known)).map((a) => ({ name: a.name, command: argvOf(a, this.known).join(" ") })),
      outbox: outboxDir(),
      space: this.space()?.name,
      ...extra,
    };
  }

  /** The roster entry a running agent is: the Orchestrator, or the one whose tab carries its name. */
  entryAt(address) {
    if (this.target()?.address === address) return this.leadEntry();
    const name = this.names()[address];
    return name ? this.roster().find((a) => a.name === name) ?? null : null;
  }

  /**
   * What an agent is told before its first message from here. A roster agent gets its role's
   * brief from bh (the role, the team and how to start them, the project's knowledge, how to
   * reply); any other agent, or when node can't run, brief.js's team brief.
   */
  async briefFor(entry, opts) {
    if (entry) {
      const r = await bh(["brief", slug(entry.name), "--mode", "lead"], { cwd: projectDir(this.space()) });
      if (r.code === 0 && r.stdout.trim()) return r.stdout.trim();
    }
    return opts?.role === "orchestrator" ? orchestratorBrief(opts) : teamBrief(opts);
  }

  /**
   * With the classifier on, a message that names no one may suit one agent better than the
   * Orchestrator (a styling question → Design). Returns the steps to run and a note, or null.
   */
  async reroute(step) {
    const r = await bh(["classify", "route", "--json", "--data", enc(step.text)], { cwd: projectDir(this.space()), timeout: 70000 });
    let routed = null;
    try {
      routed = JSON.parse(r.stdout);
    } catch {
      return null;
    }
    const entry = this.roster().find((a) => a.role === routed?.route);
    if (!entry || entry.lead || !runnable(entry, this.known)) return null;
    const running = runningAs(entry, agents(), this.space()?.id ?? null);
    const note = `To ${entry.name}: the classifier picked it${routed.probability ? ` (${Math.round(routed.probability * 100)}%)` : ""}.`;
    if (running) return { note, steps: [{ do: "send", address: running.address, text: step.text, files: step.files }] };
    return { note, steps: [{ do: "start", run: argvOf(entry, this.known), name: entry.name, tab: entry.name, entry: entry.id, text: step.text, files: step.files }] };
  }

  /** Agents we started carry the brief in their task: once one shows up, mark it as briefed. */
  adopt() {
    if (!this.starts.length) return;
    const now = Date.now();
    this.starts = this.starts.filter((s) => now - s.at < 60000);
    for (const s of [...this.starts]) {
      const born = agents().find((a) => a.space === s.space && !s.before.has(a.address) && !this.justBriefed.has(a.address));
      if (!born) continue;
      this.starts.splice(this.starts.indexOf(s), 1);
      this.markBriefed(born.address);
      this.hooks.born?.(born.address, s.name);
    }
  }

  /** Live child agents that have no pane of their own (those with one are in agents()). */
  children() {
    const listed = new Set(agents().map((a) => a.address));
    const all = terminals().filter((t) => t.state === "live");
    const nameOf = (address) => {
      const t = all.find((x) => x.address === address);
      return t?.name || t?.program?.name || address;
    };
    return all
      .filter((t) => t.parent && !listed.has(t.address) && (t.program?.agent || t.status || isQuiet(t)))
      .map((t) => ({ address: t.address, parent: t.parent, parentName: nameOf(t.parent), name: t.name ?? null, status: t.status ?? null, program: t.program }));
  }

  /** What to call a terminal in a message to the user. */
  nameOf(address) {
    const named = this.names()[address];
    if (named) return named;
    if (this.target()?.address === address) return this.leadEntry().name;
    const a = agents().find((x) => x.address === address);
    if (a) return a.program?.name ?? address;
    const t = terminals().find((x) => x.address === address);
    return t?.name || t?.program?.name || address;
  }

  /** Whether a roster agent starts headless: its harness can, and Settings didn't turn it off. */
  runsHeadless(entry) {
    return Boolean(entry) && headless(entry.harness) && shared(HEADLESS_KEY) !== false;
  }

  needsBrief(address) {
    if (this.justBriefed.has(address) || runsHeadlessAt(address)) return false;
    return !briefed(terminals().find((t) => t.address === address));
  }

  async markBriefed(address) {
    this.justBriefed.add(address);
    try {
      await hc(["label", address, `${BRIEFED}=1`]);
    } catch {
      // the label is only a memory aid; this session still remembers
    }
  }

  menuOpen() {
    return this.pane === "suggest" && this.rows().length > 0;
  }

  rows() {
    if (this.pane !== "suggest" || !this.trigger) return [];
    if (this.trigger.kind === "slash") return slashRows(this.trigger.query);
    return mentionRows(this.trigger.query, this.mentionContext());
  }

  mentionContext(mode = this.mode) {
    return {
      agents: agents(),
      children: this.children(),
      known: this.startables(),
      space: this.space()?.id ?? null,
      mode,
      leadName: this.leadEntry().name,
      names: this.names(),
    };
  }

  /** The agent a typed @word names exactly (a running agent, or one of the team to start), or null. */
  mentionMatch(word) {
    const w = String(word ?? "").toLowerCase();
    return mentionRows(w, this.mentionContext(null)).find((r) => (r.kind === "agent" || r.kind === "start") && String(r.name).toLowerCase() === w) ?? null;
  }

  /**
   * An @name typed out in full and ended (a space or punctuation after it) becomes the agent's
   * token, as if picked from the list: drawn bold in the agent's colour. The caret stays put.
   */
  tokenizeTyped(before, caret) {
    if (this.text.length <= before.length) return false;
    const m = /(^|\s)@([a-z0-9_.+-]*[a-z0-9_+-])([\s,.;:!?)])$/i.exec(this.text.slice(0, caret));
    if (!m) return false;
    const end = caret - m[3].length;
    const start = end - m[2].length - 1;
    if ((this.input.tokens?.() ?? []).some((t) => t.range.start <= start && t.range.end > start)) return false;
    const row = this.mentionMatch(m[2]);
    if (!row) return false;
    this.input.replace_range_with_token({ start, end }, tokenFor(row));
    this.input.set_selected_range({ start: caret, end: caret });
    this.text = this.input.value();
    return true;
  }

  // ── Typing ─────────────────────────────────────────────────────────────────────────────────

  changed(cx) {
    const before = this.text;
    this.text = this.input.value();
    if (this.text === before) return; // our own edit (pick, send), already accounted for
    this.expanded = true;
    const caret = caretAfterEdit(before, this.text);
    this.tokenizeTyped(before, caret);
    const trigger = this.text === this.dismissed ? null : triggerAt(this.text, caret);
    if (trigger?.kind !== "mention") this.mode = null;
    const was = this.pane;
    this.trigger = trigger;
    if (trigger) this.open("suggest", cx);
    else if (this.pane === "suggest") this.pane = null;
    else if (this.pane) this.pane = null;
    if (this.pane === "suggest" && (was !== "suggest" || trigger?.query !== this.lastQuery)) {
      this.at = 0;
      this.offset = 0;
    }
    this.lastQuery = trigger?.query;
    cx.notify();
  }

  // A pane's first frame is drawn small and clear, then opens, so it grows into place (render
  // sees the pane change).
  open(pane, cx) {
    if (this.pane === pane) return;
    this.pane = pane;
    cx.notify();
  }

  toggle(pane, cx) {
    if (this.pane === pane) this.pane = null;
    else this.open(pane, cx);
    this.input.focus();
    cx.notify();
  }

  close(cx) {
    // Esc on the questions puts them away; the bar brings them back.
    if (!this.pane && this.paneNow() === "ask") return this.minimiseAsk(cx);
    if (this.pane === "suggest") this.dismissed = this.text;
    this.pane = null;
    this.mode = null;
    cx.notify();
  }

  move(by, cx) {
    const n = this.rows().length;
    if (!n) return;
    this.at = (this.at + by + n) % n;
    if (this.at < this.offset) this.offset = this.at;
    if (this.at >= this.offset + SIZE.rowsShown) this.offset = this.at - SIZE.rowsShown + 1;
    cx.notify();
  }

  pick(row, cx) {
    const t = this.trigger;
    if (!row || !t) return;
    const range = { start: t.start, end: t.end };
    // /new turns into an @ list of the agents that can be started; /settings acts at once.
    const lists = row.kind === "command" && row.name === "new";
    if (row.kind === "command" && row.name === "settings") {
      this.input.set_value("");
      this.mode = null;
      showPage("settings");
    } else if (lists) {
      this.input.set_selected_range(range);
      this.mode = "start";
      this.input.replace("@");
    } else {
      this.mode = null;
      this.input.replace_range_with_token(range, tokenFor(row));
      this.input.replace(" ");
    }
    this.text = this.input.value();
    this.trigger = lists ? triggerAt(this.text, t.start + 1) : null;
    this.pane = this.trigger ? "suggest" : null;
    this.at = 0;
    this.offset = 0;
    this.input.focus();
    cx.notify();
  }

  // ── Toasts ─────────────────────────────────────────────────────────────────────────────────

  /** A toast over the composer. `action`: { label, run } (a button on it). */
  say(text, cx, level = "info", action = null) {
    pushToast(this.toasts, level, text, { action });
    this.pumpToast(cx);
  }

  /** Brings up the next toast when none shows; with more waiting, the one on screen goes sooner. */
  pumpToast(cx) {
    const shown = this.toast;
    if (shown) {
      if (this.toasts.waiting.length && shown.phase === "up") {
        const wait = Math.max(1, shown.at + stayFor(this.toasts) - Date.now());
        cx.timer.after(wait, (cx) => this.dropToast(shown.item.id, cx));
      }
      cx.notify();
      return;
    }
    const item = this.toasts.current;
    if (!item) return;
    const t = { item, phase: "start", rose: false, at: Date.now(), n: ++this.toastN };
    this.toast = t;
    cx.notify();
    // Its first frame is a low swell in the composer's top edge; then it springs up.
    cx.timer.after(16, (cx) => {
      if (this.toast !== t || t.phase !== "start") return;
      t.phase = "up";
      t.rose = true;
      t.at = Date.now();
      cx.notify();
      cx.timer.after(stayFor(this.toasts), (cx) => this.dropToast(item.id, cx));
    });
  }

  /** The toast sinks back into the composer, then the next comes up. */
  dropToast(id, cx) {
    const t = this.toast;
    if (!t || t.item.id !== id || t.phase === "out" || t.phase === "sink") return;
    // Its words go first, the shape holding; then the shape sinks back under the edge.
    t.phase = "out";
    cx.notify();
    cx.timer.after(t.rose ? TOAST_SINK_DELAY : 1, (cx) => {
      if (this.toast !== t) return;
      t.phase = "sink";
      cx.notify();
      // Removed a frame after the shape is at rest under the edge, so nothing pops.
      cx.timer.after(TOAST_GONE, (cx) => {
        if (this.toast !== t) return;
        this.toast = null;
        dismissToast(this.toasts, id);
        this.pumpToast(cx);
        cx.notify();
      });
    });
  }

  /** herdr's notifications, handed over by toast.js while this page shows. */
  takeNotes(cx) {
    const note = shared(TOAST_KEY);
    if (!note?.at || note.at <= this.noteAt) return;
    this.noteAt = note.at;
    const action = note.action?.name ? { label: "Show", run: () => run(note.action.name, note.action.args ?? {}) } : null;
    cx.timer.after(1, (cx) => this.say(noteText(note), cx, note.level ?? "info", action));
  }

  // ── Files ──────────────────────────────────────────────────────────────────────────────────

  /** Attaches files; images get a preview herdr can show (`image`, a path under its home). */
  addFiles(paths, cx, shown = {}) {
    const fresh = [];
    for (const path of paths) {
      if (!path || this.files.some((f) => f.path === path)) continue;
      const file = { path, name: path.split(/[\\/]/).filter(Boolean).pop() ?? path, image: shown[path] ?? null };
      // A readable image file can be shown directly if preview generation fails (e.g. ScreenClip paths).
      if (!file.image && isImage(path)) file.image = path;
      this.files.push(file);
      if (isImage(path) && !shown[path]) fresh.push(path);
    }
    this.pane = null;
    this.expanded = true;
    this.input.focus();
    cx.notify();
    if (!fresh.length) return;
    cx.spawn(async (cx) => {
      for (const got of await previews(fresh)) {
        const f = this.files.find((x) => x.path === got.file);
        if (!f) continue;
        if (got.image) f.image = got.image;
        else if (isImage(f.path)) f.image = f.path;
      }
      cx.notify();
    });
  }

  pasteOther(cx) {
    cx.spawn(async (cx) => {
      const got = await fromClipboard();
      if (!got.length) return this.say("The clipboard holds no image or files to attach.", cx);
      this.addFiles(got.map((x) => x.file), cx, Object.fromEntries(got.filter((x) => x.image).map((x) => [x.file, x.image])));
    });
  }

  /** The attached images, opened large from the one clicked. */
  openImages(path) {
    const shown = this.files.filter((f) => f.image || isImage(f.path));
    openLightbox({ items: shown.map((f) => ({ image: f.image || f.path, title: f.name, note: "Attached to your message" })), at: Math.max(0, shown.findIndex((f) => f.path === path)) });
  }

  /**
   * "Attach document…": the browser inside the attach pane. It lists this machine's folders
   * through `bh files`; a space on another machine says so and takes a typed path instead.
   */
  openBrowser(cx, { folders = false, purpose = "attach" } = {}) {
    const space = this.space();
    // Opening a folder starts one level up, beside the project, where the next one usually is.
    const start = purpose === "open" ? (upFrom(projectDir(space)) ?? projectDir(space)) : projectDir(space);
    this.pane = "attach";
    this.browse = {
      folders,
      purpose,
      path: start,
      parent: upFrom(start),
      entries: [],
      truncated: false,
      error: null,
      loading: !space?.machine,
      selected: new Set(),
      hidden: false,
      foreign: Boolean(space?.machine),
    };
    this.browseAt = 0;
    this.browseLast = null;
    this.browseSearch.set_value("");
    this.browseTyped.set_value("");
    cx.timer.after(16, (cx) => {
      this.browseHandle.focus();
      cx.notify();
    });
    cx.notify();
    if (!this.browse.foreign) this.loadBrowse(cx);
  }

  /** Reads one folder through `bh files`; the answer replaces the listing. */
  loadBrowse(cx, path = this.browse?.path) {
    const b = this.browse;
    if (!b || b.foreign) return;
    // "" is the drive list: the one place above a drive's own foot. Elsewhere it is the root.
    if (path === "" && herdrWindow()?.platform !== "windows") path = "/";
    const drives = path === "";
    // Every ask takes the next number: a listing that is not the latest is dropped, so a folder
    // opened quickly after another can't be overwritten by the slower answer.
    const seq = (b.seq = (b.seq ?? 0) + 1);
    b.loading = true;
    b.error = null;
    cx.notify();
    cx.spawn(async (cx) => {
      // Listed the way herdr's own file explorer lists a folder (its shell, through herdr), and
      // through `bh files` only where that can't run (Windows, the drive list).
      let data = drives ? null : await listWithHerdr(path, b.hidden);
      let r = { code: 0, stderr: "" };
      if (!data || data.fallback) {
        r = await bh(["files", path, ...(b.hidden ? ["--all"] : []), "--json"], { cwd: projectDir() });
        try {
          data = JSON.parse(r.stdout);
        } catch {
          data = data?.error ? { error: data.error } : null;
        }
      }
      if (this.browse !== b || b.seq !== seq) return;
      b.loading = false;
      if (r.code !== 0 || !data || !Array.isArray(data.entries)) {
        b.error = String(data?.error ?? ((r.stderr || "").trim() || "Couldn't list that folder."));
      } else {
        b.path = drives ? "" : (data.path ?? path);
        b.parent = upFrom(b.path);
        b.entries = data.entries;
        b.truncated = Boolean(data.truncated);
        const kept = new Set(data.entries.filter((e) => (b.folders ? e.dir : !e.dir)).map((e) => e.path));
        b.selected = new Set([...b.selected].filter((p) => kept.has(p)));
        b.error = null;
      }
      this.browseAt = 0;
      cx.notify();
    });
  }

  openFolder(path, cx) {
    const b = this.browse;
    if (!b || b.foreign) return;
    b.path = path;
    b.parent = upFrom(path);
    this.browseSearch.set_value("");
    this.browseAt = 0;
    this.browseHandle.focus(); // Backspace keeps going up after a press on the up button
    this.loadBrowse(cx, path);
  }

  /** A row was clicked: a second click on a folder opens it; any click toggles its selection. */
  pickBrowse(entry, index, cx) {
    const b = this.browse;
    if (!b) return;
    const now = Date.now();
    const again = this.browseLast?.path === entry.path && now - this.browseLast.at < 420;
    this.browseLast = { path: entry.path, at: now };
    this.browseAt = index;
    if (entry.dir && again) return this.openFolder(entry.path, cx);
    b.selected = togglePick(b.selected, entry.path);
    cx.notify();
  }

  attachBrowse(cx) {
    const b = this.browse;
    const paths = [...(b?.selected ?? [])];
    if (!paths.length && b?.folders && b.path) paths.push(b.path);
    if (!paths.length) return;
    this.browse = null;
    if (b.purpose === "open") return this.openSpace(paths[0], cx);
    this.addFiles(paths, cx);
  }

  /** "Open folder…": the folder picked in the browser becomes a new space. */
  openSpace(folder, cx) {
    this.browse = null;
    this.pane = null;
    this.browseSearch.set_value("");
    hold();
    run("space.new", { folder });
    this.input.focus();
    cx.notify();
  }

  /** A typed path (another machine, or this one): attached as it is. */
  attachTyped(cx) {
    const path = this.browseTyped.value().trim();
    if (!path) return;
    this.browse = null;
    this.browseTyped.set_value("");
    this.addFiles([path], cx);
  }

  closeBrowse(cx) {
    this.browse = null;
    this.browseSearch.set_value("");
    this.browseTyped.set_value("");
    cx.notify();
  }

  /** "Attach folder…": the same browser, listing folders only. */
  pickFolderToAttach(cx) {
    this.openBrowser(cx, { folders: true });
  }

  /** The rows the browser shows: folders only when it is picking folders, then the search. */
  browseRows(b) {
    return filterEntries(b.folders ? b.entries.filter((e) => e.dir) : b.entries, this.browseSearch.value?.() ?? "");
  }

  /** One row of the browser: its checkbox, icon, name and (for a file) its size. */
  browseRow(c, entry, index) {
    const b = this.browse;
    const picked = b.selected.has(entry.path);
    const at = index === this.browseAt;
    return clickable(
      h_flex()
        .h(ROW)
        .px(SPACE[3])
        .gap(SPACE[3])
        .items_center()
        .rounded(SIZE.nested)
        .when(picked || at, (el) => el.bg(c.hover))
        .on_click((_e, cx) => this.pickBrowse(entry, index, cx))
        .child(
          div()
            .size(GLYPH.md)
            .flex_none()
            .flex()
            .items_center()
            .justify_center()
            .rounded(PIP)
            .border_1()
            .border_color(picked ? c.accent : c.edge)
            .when(picked, (el) => el.bg(c.accent).child(svg(ICON("check")).size(GLYPH.xs).text_color(c.accentInk))),
        )
        .child(svg(ICON(entry.dir ? "folder" : "file")).size(GLYPH.md).text_color(entry.dir ? c.muted : c.faint))
        .child(div().flex_1().min_w(0).truncate().text_size(TYPE.sm).text_color(c.ink).child(entry.name))
        .when(!entry.dir, (el) => el.child(div().flex_none().text_size(TYPE.xs).text_color(c.faint).child(sizeText(entry.size)))),
      c,
      `bc-browse-${index}`,
    );
  }

  /** The browser's body and the height the pane gives it. */
  browseBody(c) {
    const b = this.browse;
    const visible = this.browseRows(b);
    const shown = Math.min(8, Math.max(3, visible.length));
    const listH = shown * ROW;
    const h = Math.min(360, CONTROL + SPACE[2] + CONTROL + SPACE[2] + listH + SPACE[2] + CONTROL + SPACE[3] * 2);
    const toggle = (id, label, on, onClick) => clickable(
      div().flex_none().h(CONTROL).px(SPACE[3]).flex().items_center().rounded(SIZE.nested).border_1()
        .border_color(on ? c.accent : c.edge).text_size(TYPE.sm)
        .when(on, (el) => el.bg(c.well).text_color(c.ink).font_medium())
        .when(!on, (el) => el.text_color(c.muted))
        .on_click(onClick)
        .child(label),
      c,
      id,
    );
    const primary = (id, label, onClick) => actionButton(c, id, label, onClick, { tone: "primary" });
    const list = v_flex()
      .id("bc-browse-list")
      .on_scroll_wheel((_e, cx) => cx.stop_propagation())
      .w_full()
      .h(listH)
      .gap(SPACE[1])
      .overflow_y_scroll()
      .track_focus(this.browseHandle)
      .tab_index(0)
      .focus((s) => s.border_2().border_color(c.accent))
      .on_key_down((e, cx) => {
        const rows = this.browseRows(b);
        if (!rows.length) return;
        const at = Math.max(0, Math.min(rows.length - 1, this.browseAt));
        if (e.key === "up" || e.key === "arrow-up") this.browseAt = Math.max(0, at - 1);
        else if (e.key === "down" || e.key === "arrow-down") this.browseAt = Math.min(rows.length - 1, at + 1);
        else if (e.key === "space" || e.key === " ") b.selected = togglePick(b.selected, rows[at].path);
        else if (e.key === "enter") {
          if (rows[at].dir) return this.openFolder(rows[at].path, cx);
          b.selected = togglePick(b.selected, rows[at].path);
          return this.attachBrowse(cx);
        } else if (e.key === "backspace") {
          if (b.parent === null) return;
          return this.openFolder(b.parent, cx);
        } else if (e.key === "escape") {
          this.closeBrowse(cx);
          return;
        } else return;
        cx.stop_propagation();
        cx.notify();
      })
      .children(visible.map((entry, i) => this.browseRow(c, entry, i)))
      .when(!visible.length, (el) => el.child(div().p(SPACE[4]).text_size(TYPE.sm).text_color(c.muted).child("Nothing here.")));

    const body = v_flex()
      .w_full()
      .gap(SPACE[2])
      .child(
        h_flex().gap(SPACE[2]).items_center()
          .child(this.iconButton(c, "bc-browse-up", "chevron-left", b.parent !== null && !b.foreign, (_e, cx) => b.parent !== null && this.openFolder(b.parent, cx)))
          .child(div().flex_1().min_w(0).truncate().text_size(TYPE.sm).text_color(c.muted).child(b.foreign ? "Another machine" : b.path || "Drives"))
          .child(this.iconButton(c, "bc-browse-close", "x", false, (_e, cx) => this.closeBrowse(cx))),
      );

    if (b.foreign) {
      return {
        h,
        body: body
          .child(div().text_size(TYPE.sm).text_color(c.muted).child("Browsing is for this machine. Drop files or type a path."))
          .child(div().h(CONTROL).px(SPACE[3]).flex().items_center().rounded(SIZE.control).bg(c.ground).border_1().border_color(c.edge)
            .child(Input.new(this.browseTyped).w_full().h_full().text_size(TYPE.md).text_color(c.ink)))
          .child(h_flex().gap(SPACE[3]).items_center()
            .child(div().flex_1().text_size(TYPE.xs).text_color(c.faint).child("Enter attaches what you typed."))
            .child(primary("bc-browse-attach", "Attach", (_e, cx) => this.attachTyped(cx)))),
      };
    }

    body
      .child(div().h(CONTROL).px(SPACE[3]).flex().items_center().rounded(SIZE.control).bg(c.ground).border_1().border_color(c.edge)
        .child(Input.new(this.browseSearch).w_full().h_full().text_size(TYPE.md).text_color(c.ink)))
      .when(b.loading, (el) => el.child(stateView(c, { id: "bc-browse-loading", title: "Loading…", loading: true })))
      .when(Boolean(b.error), (el) => el.child(stateView(c, {
        id: "bc-browse-error",
        title: "Couldn't list that folder",
        line: b.error,
        action: { label: "Retry", on: (_e, cx) => this.loadBrowse(cx) },
      })))
      .when(!b.loading && !b.error, (el) => el.child(list))
      .when(b.truncated, (el) => el.child(div().text_size(TYPE.xs).text_color(c.faint).child("Showing the first 2000")))
      .child(
        h_flex().gap(SPACE[3]).items_center()
          // The drive list is no folder of its own: nothing to count, nothing to attach, just a
          // drive to pick.
          .child(div().flex_1().text_size(TYPE.xs).text_color(c.muted).child(b.path ? `${b.selected.size} selected` : "Pick a drive"))
          .child(toggle("bc-browse-hidden", "Show hidden", b.hidden, (_e, cx) => {
            b.hidden = !b.hidden;
            this.loadBrowse(cx);
          }))
          .when(Boolean(b.path), (el) => el.child(primary("bc-browse-attach",
            b.purpose === "open" ? (b.selected.size ? "Open" : "Open this folder") : b.folders && !b.selected.size ? "Attach this folder" : "Attach",
            (_e, cx) => this.attachBrowse(cx)))),
      );
    return { h, body: body.id("bc-browse").on_scroll_wheel((_e, cx) => cx.stop_propagation()) };
  }

  // ── Sending ────────────────────────────────────────────────────────────────────────────────

  /** Sends text from another page (Resume on a task, a plan comment) as if typed here; a draft stays. */
  sendText(text, cx) {
    const draft = this.input.value();
    this.input.set_value(text);
    this.text = text;
    this.send(cx);
    if (draft) {
      this.input.set_value(draft);
      this.text = draft;
    }
  }

  send(cx) {
    if (this.sending) return;
    // With a question up, what you type answers it.
    if (!this.pane && this.paneNow() === "ask") {
      const q = this.asking();
      const typed = this.input.value().trim();
      const at = Drawer.current(q, this.walking(q));
      const picks = this.walk.answers[at.step].picks;
      if (!typed && !(at.question?.multi && picks.length)) return;
      this.input.set_value("");
      this.text = "";
      return this.answerAsk(q, { text: typed }, cx);
    }
    const content = this.input.content();
    const all = agents();
    const target = this.target();
    const result = plan(content, {
      agents: all,
      known: this.startables(),
      space: this.space()?.id ?? null,
      target: target?.address ?? null,
      lead: this.lead(),
      starting: this.starts.some((s) => s.lead && s.space === (this.space()?.id ?? null)),
      files: this.files.map((f) => f.path),
    });
    if (result.error) return this.say(result.error, cx, "warning");
    if (!result.steps.length) return;
    if (result.steps[0].do === "settings") {
      this.input.set_value("");
      this.text = "";
      showPage("settings");
      return cx.notify();
    }
    if (result.steps[0].do === "knowledge") return this.askKnowledge(result.steps[0].question, cx);
    const keptFiles = this.files;
    const sentText = result.steps.find((s) => s.text !== undefined)?.text;
    this.files = [];
    this.input.set_value("");
    this.text = "";
    this.pane = null;
    this.trigger = null;
    this.mode = null;
    this.dismissed = null;
    this.sending = true;
    // The arrow shoots up out of the key as the message goes.
    this.sendFx = { n: this.sendFx.n, phase: "launch" };
    cx.notify();
    // A plain message (no @, no /command) to the Orchestrator may go to one agent instead.
    const first = result.steps[0];
    const plain = !(content.tokens ?? []).length && !/^\s*\//.test(content.text) && result.steps.length === 1
      && ((first.do === "send" && first.address === target?.address) || first.role === "orchestrator");
    cx.spawn(async (cx) => {
      const failed = [];
      const to = [];
      let steps = result.steps;
      if (plain && shared(ROUTING_KEY)) {
        const routed = await this.reroute(first);
        if (routed) {
          steps = routed.steps;
          this.say(routed.note, cx, "info");
        }
      }
      for (const step of steps) {
        try {
          await this.runStep(step, all);
          if (step.do === "send") to.push({ address: step.address, name: this.nameOf(step.address) });
          if (step.do === "start") to.push({ address: null, name: step.tab ?? step.name });
        } catch (e) {
          failed.push(String(e?.message ?? e));
        }
      }
      if (to.length) this.hooks.sent?.({ text: sentText ?? "", files: keptFiles.map((f) => f.name), paths: keptFiles.map((f) => f.path), to }, cx);
      this.sending = false;
      this.landSend(cx);
      if (failed.length) {
        // Put the message back so nothing typed is lost.
        if (!this.input.value()) {
          this.input.set_value(content);
          this.text = this.input.value();
          this.files = keptFiles;
        }
        this.say(failed[0], cx, "error");
      }
      this.input.focus();
      cx.notify();
    });
  }

  /**
   * /bh-info: the question goes in the feed as yours, to "knowledge-scout" until the call returns
   * the project's Scout by its real name; Scout's answer arrives as a reply.
   */
  askKnowledge(question, cx) {
    this.input.set_value("");
    this.text = "";
    this.trigger = null;
    this.mode = null;
    const id = this.hooks.sent?.({ text: question, files: [], paths: [], to: [{ address: null, name: "knowledge-scout" }] }, cx);
    cx.notify();
    cx.spawn(async (cx) => {
      const r = await bh(["knowledge", "ask", "--data", enc(question), "--json"], { cwd: projectDir() });
      if (r.code !== 0) this.say((r.stderr || r.stdout).trim().split("\n")[0] || "Couldn't ask Scout.", cx, "error");
      else this.hooks.relabel?.(id, "knowledge-scout", askedName(r.stdout) ?? "knowledge-scout", cx);
      cx.notify();
    });
  }

  async runStep(step, all) {
    const agent = all.find((a) => a.address === step.address);
    const name = step.address ? this.nameOf(step.address) : "";
    if (step.do === "peek") return run("terminal.peek", { terminal: step.address });
    if (step.do === "interrupt") {
      const r = await hc(["interrupt", step.address]);
      if (r.code !== 0) throw new Error(`Couldn't stop ${name}: ${(r.stderr || r.stdout).trim()}`);
      return;
    }
    if (step.do === "start") {
      // A new agent gets the brief with its task, so it knows from its first turn. The
      // Orchestrator's tab carries its name: that name is what makes it the Orchestrator.
      const space = this.space();
      const lead = step.role === "orchestrator";
      const entry = lead ? this.leadEntry() : step.entry ? this.roster().find((a) => a.id === step.entry) ?? null : null;
      const headlessly = this.runsHeadless(entry);
      const brief = headlessly ? "" : await this.briefFor(entry, this.briefing({ role: step.role }));
      this.starts.push({ space: space?.id ?? null, before: new Set(agents().map((a) => a.address)), at: Date.now(), lead, name: step.tab ?? step.name });
      const task = headlessly ? messageText(step.text, step.files) : `${brief}\n\n${messageText(step.text, step.files)}`.trimEnd();
      // Starting a tab moves herdr's focus; tell the page switch this was us, so it stays on Chat.
      hold();
      run("tab.new", {
        ...(step.tab ? { name: step.tab } : {}),
        // Headless: the agent terminal builds its own brief; the message is its first turn. A CLI
        // gets it as its first prompt (after -i for agy and the like, which would run a bare one
        // once and exit).
        argv: headlessly ? ["node", bhPath(), "agent", slug(entry.name), "--mode", "lead", "--"] : withPrompt(step.run, task),
        task,
        space: space?.id,
      });
      return;
    }
    if (step.do === "brief") {
      if (runsHeadlessAt(step.address)) {
        // The agent terminal sends its brief again itself.
        const r = await hc(["send", step.address, "/team"]);
        if (r.code !== 0) throw new Error(`Couldn't brief ${name}: ${(r.stderr || r.stdout).trim()}`);
        return;
      }
      const lead = this.target()?.address === step.address;
      const text = await this.briefFor(this.entryAt(step.address), this.briefing({ self: step.address, role: lead ? "orchestrator" : null }));
      const r = await hc(["send", step.address, text]);
      if (r.code !== 0) throw new Error(`Couldn't brief ${name}: ${(r.stderr || r.stdout).trim()}`);
      await this.markBriefed(step.address);
      return;
    }
    // On another machine, files go over first (`hc put`), and the message names where they landed.
    let paths = step.files;
    if (step.address.includes("/") && paths.length) {
      paths = [];
      for (const f of step.files) {
        const r = await hc(["put", step.address, f]);
        if (r.code !== 0) throw new Error(`Couldn't copy ${f} to ${name}: ${(r.stderr || r.stdout).trim()}`);
        paths.push(r.stdout.trim().split(/\r?\n/).pop());
      }
    }
    // An agent's first message from here carries the brief; a harness's own /command goes bare.
    const body = messageText(step.text, paths);
    const brief = !body.startsWith("/") && this.needsBrief(step.address);
    // A tab the user named "Orchestrator" themselves gets the Orchestrator's brief here.
    const role = this.target()?.address === step.address ? "orchestrator" : null;
    const r = await hc(["send", step.address, brief ? `${await this.briefFor(this.entryAt(step.address), this.briefing({ self: step.address, role }))}\n\n${body}` : body]);
    if (r.code === 0 && brief) await this.markBriefed(step.address);
    if (r.code !== 0) {
      const why = (r.stderr || r.stdout).trim();
      if (agent?.status === "blocked") throw new Error(`${name} is waiting for you. Answer it in its pane first.`);
      throw new Error(`Couldn't send to ${name}${why ? `: ${why}` : "."}`);
    }
  }

  stop(cx) {
    const t = this.target();
    if (!t) return;
    cx.spawn(async (cx) => {
      const r = await hc(["interrupt", t.address]);
      if (r.code !== 0) this.say(`Couldn't stop ${t.program?.name ?? t.address}.`, cx, "error");
      cx.notify();
    });
  }

  // ── Questions ──────────────────────────────────────────────────────────────────────────────

  /** The question set up now (the oldest), or null. */
  asking() {
    return this.questions[0] ?? null;
  }

  /** Where you are in that set: kept while it stays the same set. */
  walking(q) {
    if (!this.walk || this.walk.id !== q.id) {
      this.walk = Drawer.start(q);
      this.dismissing = null;
    }
    return this.walk;
  }

  /** The pane showing: the one you opened, else the questions (or their bar when put away). */
  paneNow() {
    if (this.pane) return this.pane;
    const q = this.asking();
    if (!q) return null;
    return this.putAway.has(q.id) ? "bar" : "ask";
  }

  /** Whether `paneView` would draw anything: a suggestion list that matches nothing draws none. */
  paneShown() {
    const kind = this.paneNow();
    return Boolean(kind) && !(kind === "suggest" && !this.rows().length);
  }

  /** Answers the question up now and moves on; after the last, the answers go back together. */
  answerAsk(q, given, cx) {
    const walk = this.walking(q);
    const done = Drawer.answer(q, walk, given);
    this.dismissing = null;
    if (done) {
      this.walk = null;
      this.putAway.delete(q.id);
      this.questions = this.questions.filter((x) => x.id !== q.id);
      this.hooks.answered?.(q, Drawer.payload(walk), cx);
    }
    this.input.focus();
    cx.notify();
  }

  /** Dismiss: the agent gets no answers and makes the calls itself. */
  dismissAsk(q, cx) {
    const walk = Drawer.start(q);
    this.walk = null;
    this.dismissing = null;
    this.putAway.delete(q.id);
    this.questions = this.questions.filter((x) => x.id !== q.id);
    this.hooks.answered?.(q, Drawer.payload(walk), cx, { dismissed: true });
    cx.notify();
  }

  /** A "Choose this" from a question's mockups opened large. */
  takeChoice(cx) {
    const got = shared(CHOSEN);
    if (!got?.at || got.at <= this.chosenAt) return;
    this.chosenAt = got.at;
    const map = this.choosing;
    const q = this.asking();
    if (!map || got.key !== map.key || !q) return;
    const label = map.labels[got.index];
    if (label !== undefined) cx.timer.after(1, (cx) => this.answerAsk(q, { picks: [label] }, cx));
  }

  // ── Drawing ────────────────────────────────────────────────────────────────────────────────

  /** Whether the composer should be folded to a slim bar now. */
  isFolded() {
    return Boolean(!this.expanded && !this.pane && this.paneNow() !== "ask" && !this.files.length);
  }

  /** A key typed while folded: grow back and type it at the end of the draft. */
  typeFolded(char, cx) {
    this.focus();
    const end = this.input.value().length;
    this.input.set_selected_range({ start: end, end });
    this.input.replace(char);
    cx.notify();
  }

  // The box's height at a width: the text's rows and the tools row. Attachments sit above the box.
  /** The text box's rows: what the text needs, at least `minRows` (a page can ask for a taller box). */
  textRows(width) {
    return Math.max(this.minRows ?? 0, rowsFor(this.text, width - SIZE.textX * 2 - 2));
  }

  height(width) {
    if (this.isFolded()) return 40;
    return SIZE.textTop + this.textRows(width) * SIZE.line + SIZE.tools + 2;
  }

  /** The attachments row: taller when it shows images. */
  filesH() {
    if (!this.files.length) return 0;
    return this.files.some((f) => f.image) ? SIZE.imagesRow : SIZE.filesRow;
  }

  /** The bubble, for the foot of a page `pageWidth` wide. Its pane grows upward from it. */
  render(cx, pageWidth, pageHeight = this.pageHeight) {
    this.adopt();
    this.cx = cx; // mockups start drawing while the questions are drawn
    this.width = pageWidth;
    this.pageHeight = pageHeight;
    this.takeNotes(cx);
    this.takeChoice(cx);
    // A pane that just changed is drawn closed for one frame, then opens, so it grows into place.
    const now = this.paneNow();
    if (now !== this.shownPane) {
      this.shownPane = now;
      this.ready = false;
      if (now) {
        cx.timer.after(16, (cx) => {
          this.ready = true;
          cx.notify();
        });
      }
    }
    const c = colors();
    const width = Math.max(320, Math.min(SIZE.maxWidth, pageWidth - SIZE.gutter * 2));
    return this.bubble(c, width);
  }

  bubble(c, width) {
    // One element carries all our key contexts (a context is a set of names).
    const contexts = ["BotHerdr"];
    if (this.menuOpen()) contexts.push("BotHerdrMenu");
    if (this.pane || this.paneNow() === "ask") contexts.push("BotHerdrPane");
    const menu = this.paneView(c, width);
    const folded = this.isFolded();
    const attach = !folded && this.files.length > 0 ? this.attachments(c, width) : null;
    return v_flex()
      .id("bc")
      .key_context(contexts.join(" "))
      .on_action("bot_herdr_send", (_e, cx) => this.send(cx))
      .on_action("bot_herdr_pick", (_e, cx) => this.pick(this.rows()[this.at], cx))
      .on_action("bot_herdr_up", (_e, cx) => this.move(-1, cx))
      .on_action("bot_herdr_down", (_e, cx) => this.move(1, cx))
      .on_action("bot_herdr_close", (_e, cx) => this.close(cx))
      .flex_col_reverse()
      .items_center()
      .w(width)
      .text_color(c.ink)
      // The toast first: the box and the pane, painted after, cover the part still inside them.
      .when(Boolean(this.toast), (el) => el.child(this.toastView(c, width)))
      // Painted before the pane, so the pane covers the box's top edge where they join.
      .child(folded ? this.slim(c, width) : this.box(c, width, Boolean(menu)))
      .when(Boolean(attach), (el) => el.child(attach))
      .when(Boolean(menu), (el) => el.child(menu));
  }

  // The composer box: the text and the tools row. Attachments sit above it as thumbnails.
  box(c, width, joined = false) {
    const target = this.target();
    const busy = target?.status === "working";
    const empty = !this.text.trim() && !this.files.length;
    const placeholder = !this.pane && this.paneNow() === "ask" ? "Or type your own reply…" : busy ? `${this.leadEntry().name} is working. Enter steers it…` : this.placeholder ?? PLACEHOLDER;
    // Every height here is stated. The text box stretches to fill its parent, and a floating
    // surface may be offered the whole window, so nothing is left to size itself.
    const textH = this.textRows(width) * SIZE.line;
    return v_flex()
      .id("bc-box")
      .relative()
      .flex_none()
      .w(width)
      .h(SIZE.textTop + textH + SIZE.tools + SPACE[1])
      .bg(c.fill)
      .border_1()
      .border_color(c.edge)
      .rounded(SIZE.radius)
      .shadow_md()
      .on_drop((e, cx) => this.addFiles(e.paths, cx))
      .on_mouse_down("left", (_e, cx) => {
        cx.stop_propagation(); // the box keeps its own presses: the scrim behind must not see them
        this.expanded = true;
        this.input.focus();
      })
      .on_scroll_wheel((_e, cx) => cx.stop_propagation())
      // The bevel: a lit top edge inside the outline. Not while a pane is joined on top: it
      // would draw a line across the join.
      .when(!joined, (el) => el.child(div().absolute().top(0).left(SIZE.radius).right(SIZE.radius).h(HAIR).bg(c.rim)))
      .child(
        div()
          .relative()
          .flex_none()
          .px(SIZE.textX)
          .pt(SIZE.textTop)
          .h(SIZE.textTop + textH)
          .overflow_hidden()
          .when(!this.text, (el) =>
            el.child(div().absolute().top(SIZE.textTop).left(SIZE.textX).text_size(TYPE.md).text_color(c.faint).child(placeholder)))
          .child(
            Textarea.new(this.input)
              .w_full()
              .h(textH)
              .bg(CLEAR)
              .border_0()
              .text_size(TYPE.md)
              .line_height(`${SIZE.line}px`)
              .text_color(c.ink)
              .token((tok) => this.chip(c, tok.token))
              .on_token_click((ev, cx) => {
                this.input.set_selected_range(ev.range);
                cx.notify();
              }),
          ),
      )
      .child(this.tools(c, target, busy, empty));
  }

  /** A slim bar when the feed is scrolled away: click or type to grow it back, draft intact. */
  slim(c, width) {
    const draft = this.text.trim() ? this.text.replace(/\s+/g, " ").trim() : PLACEHOLDER;
    return clickable(
      h_flex()
        .flex_none()
        .w(width)
        .h(CONTROL + SPACE[4])
        .px(SPACE[4])
        .gap(SPACE[3])
        .items_center()
        .bg(c.fill)
        .border_1()
        .border_color(c.edge)
        .rounded(SIZE.radius)
        .shadow_md()
        .cursor_text()
        .on_click((_e, cx) => {
          this.expanded = true;
          this.input.focus();
          cx.notify();
        })
        .child(div().flex_1().min_w(0).truncate().text_size(TYPE.md).text_color(this.text.trim() ? c.ink : c.faint).child(draft)),
      c,
      "bc-slim",
    );
  }

  chip(c, token) {
    const agent = token.id.startsWith("agent:") ? agents().find((a) => a.address === token.id.slice(6)) : null;
    const command = token.id.startsWith("cmd:") ? commandColor(token.id.slice(4)) : null;
    // An agent's mention wears its type's colour, as it does everywhere; a command its own.
    const named = agent?.name ?? String(token.text ?? "").replace(/^@/, "");
    const color = command ? readable(command, c.hover, 4.5, c.ink)
      : token.id === "all" ? c.accent
        : readable(mentionTone(c, named, this.roster()), c.hover, 4.5, c.ink);
    // An agent is its @name, bold in its colour, set in the text like a word; a command keeps a chip.
    if (!command) {
      return div()
        .text_size(TYPE.md)
        .font_semibold()
        .text_color(readable(mentionTone(c, named, this.roster()), c.fill, 4.5, c.ink))
        .child(token.text ?? `@${named}`);
    }
    return h_flex()
      .px(SPACE[3])
      .h(CHIP)
      .items_center()
      .rounded(SIZE.nested)
      .bg(c.hover)
      .border_1()
      .border_color(c.edge)
      .text_size(TYPE.sm)
      .font_medium()
      .text_color(color)
      .child(token.label ?? token.text);
  }

  /** Attached files as thumbnails/chips above the composer box. */
  attachments(c, width) {
    const remove = (i, id) => actionButton(c, id, null, (_e, cx) => {
      cx.stop_propagation();
      this.files.splice(i, 1);
      cx.notify();
    }, { icon: "x", tone: "quiet" });
    return h_flex()
      .id("bc-files")
      .flex_none()
      .w(width)
      .overflow_hidden()
      .gap(SPACE[3])
      .pb(SPACE[3])
      .items_end()
      .flex_wrap()
      .children(this.files.map((f, i) => (f.image || isImage(f.path))
        // An image: its thumbnail above the box, opened large on a click.
        ? clickable(
          div()
            .relative()
            .flex_none()
            .w(SIZE.imagesRow + SPACE[5])
            .h(SIZE.imagesRow - SPACE[3])
            .rounded(SIZE.nested)
            .bg(c.well)
            .border_1()
            .border_color(c.edge)
            .overflow_hidden()
            .hover((s) => s.border_color(c.faint))
            .on_click(() => this.openImages(f.path))
            .child(image(f.image || f.path).w(SIZE.imagesRow + SPACE[5] - SPACE[1]).h(SIZE.imagesRow - SPACE[3] - SPACE[1]))
            .child(div().absolute().top(SPACE[2]).right(SPACE[2]).rounded(SIZE.nested).bg(c.fill).child(remove(i, `bc-file-x-${i}`))),
          c,
          `bc-file-${i}`,
        )
        : h_flex()
          .id(`bc-file-${i}`)
          .h(CONTROL)
          .pl(SPACE[3])
          .pr(SPACE[2])
          .gap(SPACE[3])
          .items_center()
          .rounded(SIZE.nested)
          .bg(c.hover)
          .border_1()
          .border_color(c.edge)
          .text_size(TYPE.sm)
          .child(svg(ICON("file")).size(GLYPH.md).text_color(c.muted))
          .child(div().max_w(220).truncate().child(f.name))
          .child(remove(i, `bc-file-x-${i}`))));
  }

  /**
   * The toast: one more bubble of the composer's surface. It swells out of the top edge, springs
   * up to sit a little above it, and when it goes it does the same in reverse: its words fade,
   * then it springs back down and slips under the edge. The box and any pane are painted over
   * it, so while it is low it is inside them.
   */
  toastView(c, width) {
    const t = this.toast;
    const item = t.item;
    const GAP = 12;
    const { w: W, h: H } = toastSize(item, Math.min(512, width - 32), textWidth);
    const slot = GAP + H;
    const up = t.phase === "up";
    const leaving = t.phase === "out" || t.phase === "sink";
    // Its first frame is a low swell in the edge; then it springs up (rising a beat ahead of
    // filling out) and holds while its words fade on the way out. Sinking, it shrinks back to
    // that swell's size and on down, just under the edge, so nothing is left showing when it
    // is removed.
    const full = t.rose && t.phase !== "sink";
    const sunk = t.phase === "sink";
    const w = full ? W : Math.round(W * 0.4);
    const h = full ? H : sunk ? Math.min(Math.round(H * 0.45), 24) : Math.round(H * 0.45);
    const top = full ? 0 : sunk ? slot + TOAST_SINK_DEPTH : Math.round(GAP + H * 0.85);
    const left = Math.round((width - w) / 2);
    // Leaving, the words keep their place and size (nothing rewraps) and only fade.
    const textW = leaving ? W : w;
    const textH = leaving ? H : h;
    const textTop = leaving ? 0 : top;
    const textLeft = Math.round((width - textW) / 2);
    const shape = div()
      .id(`bc-toast-shape-${t.n}`)
      .absolute()
      .top(top)
      .left(left)
      .w(w)
      .h(h)
      .bg(c.fill)
      .border_1()
      .border_color(c.edge)
      .rounded(SIZE.radius)
      .shadow_md()
      .child(div().absolute().top(0).left(SIZE.radius).right(SIZE.radius).h(HAIR).bg(c.rim))
      .spring("top", TOAST_SPRINGS.rise)
      .spring("height", TOAST_SPRINGS.height)
      .spring("width", TOAST_SPRINGS.width)
      .spring("left", TOAST_SPRINGS.width);
    const tone = toneOf(c, item.kind);
    let body = h_flex()
      .id(`bc-toast-body-${t.n}`)
      .absolute()
      .top(textTop)
      .left(textLeft)
      .w(textW)
      .h(textH)
      .px(SPACE[4])
      .gap(SPACE[3])
      .items_center()
      .opacity(up ? 1 : 0)
      .transition("opacity", leaving ? TOAST_EXIT_TEXT : up ? { ...MOTION.row, delay: 240 } : MOTION.row)
      .text_size(TYPE.md)
      .line_height(`${LINE.md}px`)
      .text_color(c.ink)
      .child(svg(ICON(TOAST_ICONS[item.kind] ?? "info")).flex_none().size(GLYPH.lg).text_color(tone))
      .child(div().flex_1().min_w(0).child(item.message))
      .when(Boolean(item.action), (el) => el.child(actionButton(c, `bc-toast-act-${t.n}`, item.action.label, (_e, cx) => {
        item.action.run?.(cx);
        this.dropToast(item.id, cx);
      }, { tone: "secondary" })));
    // Leaving, the words stay where they are (no spring to a new place) and only fade.
    if (!leaving) body = body.spring("top", TOAST_SPRINGS.rise);
    return div().id("bc-toast").absolute().left(0).right(0).top(-slot).h(slot).child(shape).child(body);
  }

  tools(c, target, busy, empty) {
    const space = this.space();
    const canSend = !empty && !this.sending;
    return h_flex()
      .id("bc-tools")
      .flex_none()
      .h(SIZE.tools)
      .px(SPACE[3])
      .gap(SPACE[3])
      .items_center()
      .child(this.iconButton(c, "bc-attach", "paperclip", this.pane === "attach", (_e, cx) => this.toggle("attach", cx)))
      .child(clickable(
        h_flex()
          .h(CONTROL)
          .px(SPACE[3])
          .gap(SPACE[3])
          .items_center()
          .rounded(SIZE.nested)
          .text_size(TYPE.sm)
          .text_color(c.muted)
          .when(this.pane === "spaces", (el) => el.bg(c.well).text_color(c.ink))
          .on_click((_e, cx) => this.toggle("spaces", cx))
          .child(svg(ICON("folder")).size(GLYPH.md))
          .child(div().max_w(180).truncate().child(space?.name ?? "No space"))
          .when(Boolean(space?.branch), (el) => el.child(div().text_color(c.faint).max_w(120).truncate().child(space.branch)))
          .child(svg(ICON("chevron-down")).size(GLYPH.sm).text_color(c.faint)),
        c,
        "bc-space",
      ))
      // The Orchestrator's model: picked here; every other agent's is set in Settings.
      .when(Boolean(this.leadEntry()), (el) => el.child(clickable(
        h_flex()
          .h(CONTROL)
          .px(SPACE[3])
          .gap(SPACE[3])
          .items_center()
          .rounded(SIZE.nested)
          .text_size(TYPE.sm)
          .text_color(c.muted)
          .hover((x) => x.bg(c.well).text_color(c.ink))
          .when(this.pane === "model", (x) => x.bg(c.well).text_color(c.ink))
          .on_click((_e, cx) => this.toggleModels(cx))
          .child(harnessMark(c, this.known.find((k) => k.key === this.leadEntry().harness) ?? { key: this.leadEntry().harness, name: this.leadEntry().harness }, GLYPH.md))
          .child(div().max_w(this.width >= 560 ? 180 : 110).truncate().child(this.leadModelName()))
          .when(Boolean(this.leadEntry().effort), (x) => x.child(div().flex_none().text_color(c.faint).child(this.leadEntry().effort)))
          .child(svg(ICON("chevron-down")).size(GLYPH.sm).text_color(c.faint)),
        c,
        "bc-lead-model",
      )))
      .child(div().flex_1())
      .when(busy, (el) =>
        el.child(focusable(
          pressable(
            div()
              .size(TARGET)
              .rounded_full()
              .flex()
              .items_center()
              .justify_center()
              .bg(c.stop)
              .hover((s) => s.bg(c.stopHover))
              .on_click((_e, cx) => this.stop(cx))
              .child(div().size(GLYPH.xs).rounded(PIP).bg("#ffffff")),
          ),
          "bc-stop",
          c,
        )))
      .child(focusable(pressable(this.sendKey(c, canSend)), "bc-send", c));
  }

  /**
   * The round send key. gpui animates no colours, so it is drawn in layers: the well, then the
   * accent swelling out of its middle when there is something to send (and going back in when
   * there isn't), then the arrow, whose two colours cross-fade. Sent, the arrow shoots up and
   * fades, a spinner comes up if sending takes a moment, and once the message is out a new
   * arrow rises into place from below.
   */
  sendKey(c, canSend) {
    const fx = this.sendFx;
    const mid = (TARGET - GLYPH.lg) / 2;
    const fill = canSend ? TARGET : 0;
    const launching = fx.phase === "launch";
    const arrowTop = launching ? mid - SEND_TRAVEL : fx.phase === "land" ? mid + SEND_TRAVEL * 0.75 : mid;
    const arrowOn = fx.phase === "rise" || fx.phase === "rest";
    const layer = (id, size) => div().id(id).absolute().size(size);
    const glyph = (id, color, on) => layer(id, GLYPH.lg)
      .opacity(on ? 1 : 0)
      .transition("opacity", MOTION.tool)
      .child(svg(ICON("send")).size(GLYPH.lg).text_color(color));
    return div()
      .size(TARGET)
      .rounded_full()
      .bg(c.well)
      .when(canSend, (el) => el.hover((s) => s.opacity(0.92)))
      .on_click((_e, cx) => this.send(cx))
      .child(layer("bc-send-fill", fill)
        .left((TARGET - fill) / 2)
        .top((TARGET - fill) / 2)
        .rounded_full()
        .bg(c.accent)
        .border_b(1)
        .border_color(c.accentLip)
        .opacity(canSend ? 1 : 0)
        .transition("opacity", MOTION.hover)
        .spring("width", canSend ? SEND_GROW : SEND_SHRINK)
        .spring("height", canSend ? SEND_GROW : SEND_SHRINK)
        .spring("left", canSend ? SEND_GROW : SEND_SHRINK)
        .spring("top", canSend ? SEND_GROW : SEND_SHRINK))
      .child(layer(`bc-send-arrow-${fx.n}`, GLYPH.lg)
        .left(mid)
        .top(arrowTop)
        .opacity(arrowOn ? 1 : 0)
        .transition("top", launching ? SEND_LAUNCH : SEND_RISE)
        .transition("opacity", launching ? SEND_LAUNCH_FADE : SEND_RISE)
        .child(glyph(`bc-send-dim-${fx.n}`, c.faint, !canSend))
        .child(glyph(`bc-send-ink-${fx.n}`, c.accentInk, canSend)))
      // Shown only if sending takes a moment, so a quick send doesn't flash it.
      .child(layer("bc-send-spin", GLYPH.lg)
        .left(mid)
        .top(mid)
        .opacity(launching ? 1 : 0)
        .transition("opacity", launching ? SEND_SPIN_IN : MOTION.hover)
        .when(fx.phase !== "rest", (el) => el.child(svg(ICON("spinner")).size(GLYPH.lg).text_color(c.faint).spin(900))));
  }

  /** The message is out: a new arrow, drawn low and clear first, rises into the send key. */
  landSend(cx) {
    const fx = { n: this.sendFx.n + 1, phase: "land" };
    this.sendFx = fx;
    cx.notify();
    cx.timer.after(16, (cx) => {
      if (this.sendFx !== fx) return;
      fx.phase = "rise";
      cx.notify();
      // The spinner, fading out meanwhile, goes once the arrow is in place.
      cx.timer.after(SEND_RISE.duration + 40, (cx) => {
        if (this.sendFx !== fx) return;
        fx.phase = "rest";
        cx.notify();
      });
    });
  }

  /** An icon button; `on` (its pane is open) keeps it in the well tone. */
  iconButton(c, id, icon, on, onClick) {
    return actionButton(c, id, null, onClick, { icon, tone: "quiet" }).when(on, (el) => el.bg(c.well));
  }

  // ── The pane that grows out of the top ─────────────────────────────────────────────────────

  paneView(c, width) {
    const kind = this.paneNow();
    if (!kind) return null;
    let size;
    let body;
    let pad = { x: SIZE.menuPad, top: 8, bottom: SIZE.menuPad };
    if (kind === "ask" || kind === "bar") {
      const w = width - SIZE.fillet * 2 - PANE_INSET * 2;
      const got = kind === "ask" ? this.askBody(c, this.asking(), w - 26) : this.barBody(c, this.asking());
      size = { w, h: got.h + (kind === "ask" ? 24 : 12) };
      body = got.body;
      // The head stays in view if a guess at a height falls short: the foot is cut, not the top.
      if (kind === "ask") pad = { x: 12, top: 12, bottom: 12, top_first: true };
    } else if (kind === "suggest") {
      const rows = this.rows();
      if (!rows.length) return null;
      const shown = rows.slice(this.offset, this.offset + SIZE.rowsShown);
      let w = 0;
      for (const r of rows) w = Math.max(w, textWidth(r.label && r.kind !== "command" ? r.label : r.name, 13) + textWidth(r.hint, 12.5) + textWidth(r.tag, 10.5));
      size = { w: Math.min(Math.max(Math.ceil(w) + 120, 220), width - 80), h: 12 + shown.length * ROW };
      body = v_flex()
        .id("bc-rows")
        .w_full()
        .on_scroll_wheel((e, cx) => {
          const max = Math.max(0, rows.length - SIZE.rowsShown);
          const step = e.delta.y < 0 ? 1 : e.delta.y > 0 ? -1 : 0;
          this.offset = Math.max(0, Math.min(max, this.offset + step));
          cx.notify();
        })
        .children(shown.map((r, i) => this.row(c, r, this.offset + i, shown.length - 1 - i)));
    } else if (kind === "attach" && this.browse) {
      const got = this.browseBody(c);
      size = { w: 420, h: got.h };
      body = got.body;
      pad = { x: SPACE[3], top: SPACE[3], bottom: SPACE[3] };
    } else if (kind === "model") {
      const got = this.modelBody(c);
      size = { w: Math.min(440, width - 80), h: got.h };
      body = got.body;
      pad = { x: SPACE[3], top: SPACE[3], bottom: SPACE[3] };
    } else if (kind === "attach") {
      size = { w: 260, h: 12 + 3 * ROW };
      body = v_flex()
        .w_full()
        .child(this.menuItem(c, "bc-attach-file", "file", "Attach document…", 2, (_e, cx) => this.openBrowser(cx)))
        .child(this.menuItem(c, "bc-attach-folder", "folder", "Attach folder…", 1, (_e, cx) => this.pickFolderToAttach(cx)))
        .child(h_flex().h(ROW).px(SPACE[3]).items_center().text_size(TYPE.xs).text_color(c.muted).child("Or drop files on the composer"));
    } else {
      const list = spaces();
      const current = this.space()?.id;
      const shown = list.slice(0, 7);
      size = { w: 400, h: 12 + (shown.length + 1) * ROW };
      body = v_flex()
        .w_full()
        .children(shown.map((s, i) =>
          clickable(
            h_flex()
              .h(ROW)
              .px(SPACE[3])
              .gap(SPACE[3])
              .items_center()
              .rounded(SIZE.nested)
              .when(s.id === current, (el) => el.bg(c.hover))
              .opacity(this.ready ? 1 : 0)
              .transition("opacity", { ...MOTION.row, delay: (shown.length - i) * MOTION.stagger })
              .on_click((_e, cx) => {
                hold();
                run("space.select", { id: s.id });
                this.pane = null;
                this.input.focus();
                cx.notify();
              })
              .child(svg(ICON("folder")).size(GLYPH.md).text_color(c.muted))
              .child(div().text_size(TYPE.md).font_medium().truncate().child(s.name))
              .when(Boolean(s.branch), (el) => el.child(div().text_size(TYPE.sm).text_color(c.faint).truncate().child(s.branch)))
              .child(div().flex_1())
              .when(Boolean(s.status), (el) => el.child(div().text_size(TYPE.xs).text_color(c.muted).child(s.status === "blocked" ? "needs you" : s.status))),
            c,
            `bc-sp-${s.id}`,
          )))
        // The same browser as attaching, listing folders: the system's folder dialog isn't
        // there everywhere (a phone, a bare Linux), and failing it just closed the pane.
        .child(this.menuItem(c, "bc-open-folder", "folder-plus", "Open folder…", 0, (_e, cx) => this.openBrowser(cx, { folders: true, purpose: "open" })));
    }
    // The joins must sit on the box's straight top edge, clear of its rounded corners.
    size.w = Math.min(size.w, width - SIZE.fillet * 2 - PANE_INSET * 2);
    const h = this.ready ? size.h : Math.round(size.h * 0.85);
    const w = this.ready ? size.w : Math.round(size.w * 0.85);
    const pane = v_flex()
      .id("bc-pane")
      .relative()
      .flex_none()
      .w_full()
      .h(h)
      .transition("height", MOTION.pane)
      .bg(c.fill)
      .border_t(1)
      .border_l(1)
      .border_r(1)
      .border_color(c.edge)
      .rounded_t(SIZE.radius)
      .overflow_hidden()
      .px(pad.x)
      .pt(pad.top)
      .pb(pad.bottom)
      .when(!pad.top_first, (el) => el.justify_end())
      .child(div().absolute().top(0).left(SIZE.radius).right(SIZE.radius).h(HAIR).bg(c.rim))
      .child(body);
    // The joins: a concave curve each side, so the pane and the box read as one shape. Each is
    // one pixel wider than the gap it fills and is painted over the pane, so it also covers the
    // foot of the pane's side border: the border turns into the curve instead of running on.
    const F = SIZE.fillet;
    const fillet = (side) =>
      div()
        .absolute()
        .bottom(0)
        .when(side === "left", (el) => el.left(0))
        .when(side === "right", (el) => el.right(0))
        .w(F + HAIR)
        .h(F)
        .child(svg(ICON(`fillet-${side}`)).absolute().top(0).left(0).w(F + HAIR).h(F).text_color(c.fill))
        .child(svg(ICON(`fillet-${side}-edge`)).absolute().top(0).left(0).w(F + HAIR).h(F).text_color(c.edge));
    return div()
      .id("bc-pane-row")
      .relative()
      .flex_none()
      .w(w + F * 2)
      .h(h)
      // A press or a wheel inside the pane is the pane's: it never reaches the scrim behind it,
      // which would put the pane away before the click landed.
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_scroll_wheel((_e, cx) => cx.stop_propagation())
      .transition("width", MOTION.menuWidth)
      .transition("height", MOTION.pane)
      .mb(-1)
      .opacity(this.ready ? 1 : 0)
      .transition("opacity", MOTION.menuClose)
      .child(h_flex().absolute().top(0).bottom(0).left(F).right(F).items_end().child(pane))
      .child(fillet("left"))
      .child(fillet("right"));
  }

  /** Who asked, in their colour: the colour reads on the pane. */
  askerTone(c, q) {
    const tile = agents().find((a) => a.address === q.from)?.program?.tile ?? terminals().find((t) => t.address === q.from)?.program?.tile ?? null;
    return tile ? readable(tile, c.fill, 4.5, c.ink) : c.accent;
  }

  /**
   * The question up now: who asks and about what, Back, where it is in the set and Dismiss; the
   * question; its options as rows (or a grid of mockups), each answering it with a click. Every
   * height is worked out here, so the pane can grow to fit. Returns { h, body }.
   */
  askBody(c, q, inner) {
    const walk = this.walking(q);
    const at = Drawer.current(q, walk);
    const x = at.question ?? { text: "", options: [] };
    const who = q.fromName ?? this.nameOf(q.from);
    const tone = this.askerTone(c, q);
    const picks = walk.answers[at.step]?.picks ?? [];
    const rowsOf = (text, size, w) => Math.max(1, Math.ceil(textWidth(String(text ?? ""), size) / Math.max(40, w)));
    const glyph = (n, size = CHIP) => div()
      .flex_none()
      .size(size)
      .flex()
      .items_center()
      .justify_center()
      .rounded(SIZE.nested)
      .bg(alpha(tone, 0.14))
      .border_1()
      .border_color(alpha(tone, 0.38))
      .text_size(TYPE.xs)
      .font_semibold()
      .text_color(tone)
      .child(String(n));
    const link = (id, label, onClick, tone = "quiet") => actionButton(c, id, label, onClick, { tone });

    // The head row.
    const asking = this.dismissing === q.id;
    const head = h_flex()
      .flex_none()
      .h(CONTROL)
      .gap(SPACE[3])
      .items_center()
      .child(div().flex_none().text_size(TYPE.sm).font_semibold().text_color(tone).child(who))
      .child(div().flex_1().min_w(0).truncate().text_size(TYPE.sm).text_color(c.muted).child(q.title && q.title !== "Questions" ? q.title : "has a question"))
      .when(at.step > 0 && !asking, (el) => el.child(link("bc-ask-back", "‹ Back", (_e, cx) => {
        Drawer.back(walk);
        cx.notify();
      })))
      .when(at.count > 1 && !asking, (el) => el.child(div().flex_none().text_size(TYPE.sm).text_color(c.faint).child(`${at.step + 1} of ${at.count}`)))
      .when(!asking, (el) => el.child(link("bc-ask-dismiss", "Dismiss", (_e, cx) => {
        this.dismissing = q.id;
        cx.notify();
      })))
      .when(asking, (el) => el
        .child(div().flex_none().text_size(TYPE.sm).text_color(c.ink).child("Dismiss it? The agent decides."))
        .child(link("bc-ask-yes", "Dismiss", (_e, cx) => this.dismissAsk(q, cx), "danger"))
        .child(link("bc-ask-no", "Keep", (_e, cx) => {
          this.dismissing = null;
          cx.notify();
        })))
      .child(actionButton(c, "bc-ask-min", null, (_e, cx) => this.minimiseAsk(cx), { icon: "chevron-down", tone: "quiet", tooltip: "Minimise: the agent keeps waiting" }));
    let h = CONTROL + SPACE[3];

    // The intro (first question only) and the question.
    const intro = at.step === 0 && q.intro ? String(q.intro).trim() : "";
    const introRows = intro ? Math.min(4, rowsOf(intro, TYPE.md, inner)) : 0;
    if (intro) h += introRows * LINE.md + SPACE[3];
    const qRows = rowsOf(x.text, TYPE.lg, inner);
    h += qRows * LINE.lg + SPACE[4];

    const options = x.options ?? [];
    const multi = Boolean(x.multi);
    let list;
    if (Drawer.hasMockups(x)) {
      // A grid of mockups: two across for two or four, else three.
      const cols = Drawer.gridCols(options.length);
      const gap = SPACE[3];
      const tileW = Math.floor((inner - gap * (cols - 1)) / cols);
      const thumbH = Math.round((tileW * 11) / 16);
      const drawn = options.map((o) => (o.mockupFile ? mockupFile(o.mockupFile, this.cx) : null));
      const ready = options.map((o, i) => ({ o, i, d: drawn[i] })).filter((y) => y.d?.state === "ready");
      const key = `ask:${q.id}:${at.step}`;
      const open = (i) => {
        this.choosing = { key, labels: ready.map((y) => y.o.label) };
        openLightbox({
          items: ready.map((y) => ({ image: y.d.image, title: y.o.label, note: `${who} · ${x.text}`, html: y.o.mockupFile, glyph: y.i + 1, tone })),
          at: Math.max(0, ready.findIndex((y) => y.i === i)),
          choose: key,
        });
      };
      const rows = [];
      for (let r = 0; r < options.length; r += cols) rows.push(options.slice(r, r + cols).map((o, k) => ({ o, i: r + k })));
      let gridH = 0;
      const rowEls = rows.map((row, ri) => {
        const rowH = Math.max(...row.map(({ o }) => thumbH + SPACE[3] + CHIP + (o.meaning ? SPACE[1] + Math.min(3, rowsOf(o.meaning, TYPE.sm, tileW)) * LINE.sm : 0)));
        gridH += rowH + (ri ? gap : 0);
        return h_flex()
          .flex_none()
          .h(rowH)
          .gap(gap)
          .items_start()
          .children(row.map(({ o, i }) => {
            const d = drawn[i];
            const on = picks.includes(o.label);
            return clickable(
              v_flex()
                .flex_none()
                .w(tileW)
                .gap(SPACE[3])
                .opacity(this.ready ? 1 : 0)
                .transition("opacity", { ...MOTION.row, delay: i * MOTION.stagger })
                .on_click((_e, cx) => (multi ? this.toggleAsk(q, o.label, cx) : this.answerAsk(q, { picks: [o.label] }, cx)))
                .child(
                  div()
                    .relative()
                    .flex_none()
                    .w(tileW)
                    .h(thumbH)
                    .rounded(SIZE.control)
                    .bg(c.well)
                    .border_1()
                    .border_color(on ? tone : c.edge)
                    .overflow_hidden()
                    .flex()
                    .items_center()
                    .justify_center()
                    .when(d?.state === "ready", (el) => el.child(image(d.image).w(tileW - SPACE[1]).h(thumbH - SPACE[1])))
                    .when(d?.state === "drawing", (el) => el.child(div().text_size(TYPE.sm).text_color(c.faint).child("Drawing…")))
                    .when(d?.state === "failed" || !d, (el) => el.child(
                      v_flex().items_center().gap(SPACE[2]).px(SPACE[3])
                        .child(div().text_size(TYPE.sm).text_color(c.muted).child("Couldn't draw it here"))
                        .when(Boolean(d?.error), (col) => col.child(div().text_center().text_size(TYPE.xs).line_height(`${LINE.xs}px`).text_color(c.muted).max_h(LINE.xs * 2).overflow_hidden()
                          .child(String(d.error).split("\n")[0].trim())))
                        .when(Boolean(o.mockupFile), (col) => col.child(link(`bc-ask-open-${i}`, "Open in browser", (_e, cx) => {
                          cx.stop_propagation();
                          openInBrowser(o.mockupFile, cx);
                        }))),
                    ))
                    // Placed by its own absolute box; the clickable inside (clickable makes its element relative).
                    .when(d?.state === "ready", (el) => el.child(div().absolute().top(SPACE[3]).right(SPACE[3]).child(actionButton(c, `bc-ask-zoom-${i}`, null, (_e, cx) => {
                      cx.stop_propagation();
                      open(i);
                    }, { icon: "expand", tone: "secondary" })))),
                )
                .child(h_flex().h(CHIP).gap(SPACE[3]).items_center().child(glyph(i + 1, CHIP)).child(div().flex_1().min_w(0).truncate().text_size(TYPE.md).font_medium().child(o.label)))
                .when(Boolean(o.meaning), (el) => el.child(div().max_h(LINE.sm * 3).overflow_hidden().text_size(TYPE.sm).line_height(`${LINE.sm}px`).text_color(c.muted).child(o.meaning))),
              c,
              `bc-ask-tile-${i}`,
            );
          }));
      });
      h += gridH;
      list = v_flex().flex_none().gap(gap).children(rowEls);
    } else {
      // Option rows: the number, the label and what it means, in full.
      const textW = inner - SPACE[5] - CHIP - SPACE[3] - (multi ? CONTROL : 0);
      let listH = 0;
      const rowEls = options.map((o, i) => {
        const descRows = o.meaning ? rowsOf(o.meaning, TYPE.md, textW) : 0;
        const rowH = Math.max(ROW, TYPE.lg + LINE.sm + descRows * LINE.md);
        listH += rowH + (i ? SPACE[1] : 0);
        const on = picks.includes(o.label);
        return clickable(
          h_flex()
            .flex_none()
            .h(rowH)
            .pl(SPACE[3])
            .pr(SPACE[3])
            .pt(SPACE[3])
            .gap(SPACE[3])
            .items_start()
            .rounded(SIZE.nested)
            .when(on, (el) => el.bg(c.hover))
            .opacity(this.ready ? 1 : 0)
            .transition("opacity", { ...MOTION.row, delay: i * MOTION.stagger })
            .on_click((_e, cx) => (multi ? this.toggleAsk(q, o.label, cx) : this.answerAsk(q, { picks: [o.label] }, cx)))
            .child(glyph(i + 1))
            .child(
              v_flex()
                .flex_1()
                .min_w(0)
                .child(h_flex().h(CHIP).gap(SPACE[3]).items_center()
                  .child(div().text_size(TYPE.md).font_medium().child(o.label))
                  .when(Boolean(o.recommended), (el) => el.child(div().text_size(TYPE.xs).text_color(c.accent).child("Recommended"))))
                .when(Boolean(o.meaning), (el) => el.child(div().text_size(TYPE.md).line_height(`${LINE.md}px`).text_color(c.muted).child(o.meaning))),
            )
            .when(multi, (el) => el.child(
              div()
                .flex_none()
                .mt(SPACE[1])
                .size(GLYPH.lg)
                .flex()
                .items_center()
                .justify_center()
                .rounded(PIP)
                .border_1()
                .border_color(on ? c.accent : c.faint)
                .when(on, (b) => b.bg(c.accent).child(svg(ICON("check")).size(GLYPH.xs).text_color(c.accentInk))),
            )),
          c,
          `bc-ask-opt-${i}`,
        );
      });
      h += listH;
      list = v_flex().flex_none().gap(SPACE[1]).children(rowEls);
    }
    // A multi-select moves on when you say so.
    const more = multi
      ? focusable(
        pressable(
          h_flex()
            .flex_none()
            .h(ROW)
            .mt(SPACE[3])
            .px(SPACE[3])
            .gap(SPACE[3])
            .items_center()
            .rounded(SIZE.nested)
            .text_size(TYPE.md)
            .font_medium()
            .when(picks.length > 0, (el) => el.text_color(c.accent).hover((s) => s.bg(c.hover)).on_click((_e, cx) => this.answerAsk(q, { text: "" }, cx)))
            .when(!picks.length, (el) => el.text_color(c.faint))
            .child(picks.length ? `Answer with ${picks.length} picked` : "Pick one or more"),
        ),
        "bc-ask-multi",
        c,
      )
      : null;
    if (multi) h += CONTROL + SPACE[4];

    // Taller than there is room for: the questions scroll, the head stays.
    const most = Math.max(200, Math.round(this.pageHeight * 0.62) - this.height(this.width) - 40);
    const content = v_flex()
      .flex_none()
      .when(Boolean(intro), (el) => el.child(div().flex_none().h(introRows * LINE.md).mb(SPACE[3]).overflow_hidden().text_size(TYPE.md).line_height(`${LINE.md}px`).text_color(c.muted).child(intro)))
      .child(div().flex_none().mb(SPACE[4]).text_size(TYPE.lg).font_medium().line_height(`${LINE.lg}px`).child(x.text))
      .child(list)
      .when(Boolean(more), (el) => el.child(more));
    h += SPACE[2]; // a little room: the heights of wrapped words are a guess
    const scroll = h > most;
    const shownH = scroll ? most : h;
    const body = v_flex()
      .w_full()
      .h(shownH)
      .child(head)
      .child(
        div()
          .id(`bc-ask-scroll-${q.id}-${at.step}`)
          .flex_none()
          .mt(SPACE[3])
          .h(shownH - CONTROL - SPACE[2])
          .overflow_y_scroll()
          .child(content),
      );
    return { h: shownH, body };
  }

  toggleAsk(q, label, cx) {
    Drawer.toggle(this.walking(q), label);
    cx.notify();
  }

  /** Puts the open questions away (Esc or the minimise button); the agent keeps waiting. */
  minimiseAsk(cx) {
    this.putAway.add(this.asking().id);
    this.dismissing = null;
    cx.notify();
  }

  /** The questions put away: one row that brings them back. */
  barBody(c, q) {
    const n = Drawer.left(q, this.walk?.id === q.id ? this.walk : null);
    const more = this.questions.length - 1;
    return {
      h: CONTROL,
      body: clickable(
        h_flex()
          .w_full()
          .h(CONTROL)
          .px(SPACE[3])
          .gap(SPACE[3])
          .items_center()
          .rounded(SIZE.nested)
          .on_click((_e, cx) => {
            this.putAway.delete(q.id);
            this.input.focus();
            cx.notify();
          })
          .child(svg(ICON("ask")).size(GLYPH.lg).text_color(c.accent))
          .child(div().flex_none().text_size(TYPE.md).font_medium().text_color(c.accent).child(`${q.fromName ?? this.nameOf(q.from)} is waiting for your answer`))
          .child(div().flex_1().min_w(0).truncate().text_size(TYPE.sm).text_color(c.muted).child(`${n} left${more > 0 ? ` · ${more} more set${more > 1 ? "s" : ""}` : ""}`)),
        c,
        "bc-ask-bar",
      ),
    };
  }

  row(c, r, index, fromBottom) {
    const active = index === this.at;
    const agentRow = r.kind === "agent" || r.kind === "start";
    // An agent's name wears its colour (the same as everywhere); a command keeps its own.
    const color = agentRow ? readable(mentionTone(c, r.name ?? r.label, this.roster()), c.hover, 4.5, c.ink) : tint(c, r);
    const showName = r.kind === "command" ? r.name : r.label;
    return clickable(
      h_flex()
        .flex_none()
        .h(ROW)
        .px(SPACE[3])
        .gap(SPACE[3])
        .items_center()
        .rounded(SIZE.nested)
        .when(active, (el) => el.bg(c.hover))
        .opacity(this.ready ? 1 : 0)
        .transition("opacity", { ...MOTION.row, delay: fromBottom * MOTION.stagger })
        .on_hover((hovered, cx) => {
          if (hovered && this.at !== index) {
            this.at = index;
            cx.notify();
          }
        })
        .on_click((_e, cx) => this.pick(r, cx))
        // Commands get a tile with their first letter; agents are named in their own colour, no dot.
        .when(r.kind === "command" || r.kind === "all", (el) =>
          el.child(
            div()
              .size(CHIP)
              .flex_none()
              .flex()
              .items_center()
              .justify_center()
              .rounded(SIZE.nested)
              .border_1()
              .border_color(r.color ? color : c.edge)
              .text_size(TYPE.xs)
              .font_semibold()
              .text_color(r.color ? color : c.muted)
              .child(r.name.charAt(0).toUpperCase()),
          ))
        .child(div().flex_none().text_size(TYPE.md)
          .when(agentRow, (el) => el.font_semibold().text_color(color))
          .when(!agentRow, (el) => el.font_medium().text_color(r.kind === "all" ? c.ink : color))
          .child(r.kind === "command" ? `/${showName}` : showName))
        .child(div().flex_1().min_w(0).truncate().text_size(TYPE.sm).text_color(c.muted).child(r.hint))
        .child(div().flex_none().px(SPACE[2]).rounded(SIZE.nested).text_size(TYPE.xs).font_medium().text_color(agentRow ? c.faint : color).child(r.tag)),
      c,
      `bc-row-${r.id}`,
    );
  }

  menuItem(c, id, icon, label, fromBottom, onClick) {
    return clickable(
      h_flex()
        .flex_none()
        .h(ROW)
        .px(SPACE[3])
        .gap(SPACE[3])
        .items_center()
        .rounded(SIZE.nested)
        .opacity(this.ready ? 1 : 0)
        .transition("opacity", { ...MOTION.row, delay: fromBottom * MOTION.stagger })
        .on_click(onClick)
        .child(svg(ICON(icon)).size(GLYPH.lg).text_color(c.muted))
        .child(div().text_size(TYPE.md).font_medium().child(label)),
      c,
      id,
    );
  }
}
