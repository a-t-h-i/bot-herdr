// The composer: one text box for every agent herdr runs. It sits at the foot of the chat page
// (chat.js). One raised bubble with the text on top and a tools row under it (attach, the space
// chip, key hints, stop, a round send key). The `/` commands, the `@` agents, the attach menu and
// the spaces list grow out of its top edge as a smaller bubble joined to it by curved fillets.
//
// A message goes to the space's Orchestrator: the roster's lead agent (Settings), running in the
// tab that carries its name, started on the first message if the space has none. It plans and
// hands work to child agents. Or it goes to whoever you `@`: an agent from Settings (started if it
// is not running), any other running agent, a child agent, `@all` in this space, or
// `@new-<harness>` to start a plain one. `/stop` and `/peek` act on the agent; any other
// `/command` is sent as typed, so each harness's own commands still work. Sending is `hc send`.
//
// Each agent is told once how to start child agents and where to write its reply (brief.js):
// in front of its first message from here, or of the task it is started with. `/team` repeats it.

import { div, svg } from "gpui-kit";
import { v_flex, h_flex, TextareaState, Textarea } from "gpui-base";
import {
  agents, terminals, spaces, focused, settings, run, hc, exec, knownAgents, pickFolder, home,
  shared, appHome, window as appWindow,
} from "herdr";
import { showPage, hold } from "./pages.js";
import { LIGHT, DARK, SIZE, MOTION, ICON, tint, readable, textWidth, rowsFor } from "./look.js";
import {
  triggerAt, caretAfterEdit, slashRows, mentionRows, tokenFor, plan, orchestratorOf, withoutEnter, messageText, commandColor,
} from "./route.js";
import { ROSTER_KEY, roster, argvOf, runnable, runningAs, slug } from "./roster.js";
import { BRIEFED, teamBrief, orchestratorBrief, briefed } from "./brief.js";
import { bh, enc, projectDir, ROUTING_KEY } from "./bh.js";

const PLACEHOLDER = "Write a message, run a command, or ask an agent";
const CLEAR = "#00000000";

/** Where agents write their replies for the chat (see brief.js and chat.js). */
export const outboxDir = () => `${appHome().replace(/\\/g, "/")}/data/bot-herdr/replies`;

export class Composer {
  /** `hooks.sent({ text, to, files })` is called for each message that went out. */
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
    this.notice = null;
    this.sending = false;
    this.width = SIZE.maxWidth;
    this.justBriefed = new Set(); // briefed this session; the label can take a moment to show

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
    this.input.on("paste_other", (_e, cx) => this.say("Images go in as files: drop them on the composer.", cx));

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
    return [...mine, ...this.known];
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
    const r = await bh(["classify", "route", "--json", "--data", enc(step.text)], { cwd: projectDir(this.space()), timeout: 12000 });
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
      .filter((t) => t.parent && !listed.has(t.address) && (t.program?.agent || t.status))
      .map((t) => ({ address: t.address, parent: t.parent, parentName: nameOf(t.parent), name: t.name ?? null, status: t.status ?? null, program: t.program }));
  }

  /** What to call a terminal in a message to the person. */
  nameOf(address) {
    const named = this.names()[address];
    if (named) return named;
    if (this.target()?.address === address) return this.leadEntry().name;
    const a = agents().find((x) => x.address === address);
    if (a) return a.program?.name ?? address;
    const t = terminals().find((x) => x.address === address);
    return t?.name || t?.program?.name || address;
  }

  needsBrief(address) {
    if (this.justBriefed.has(address)) return false;
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
    return mentionRows(this.trigger.query, {
      agents: agents(),
      children: this.children(),
      known: this.startables(),
      space: this.space()?.id ?? null,
      mode: this.mode,
      leadName: this.leadEntry().name,
      names: this.names(),
    });
  }

  // ── Typing ─────────────────────────────────────────────────────────────────────────────────

  changed(cx) {
    const before = this.text;
    this.text = this.input.value();
    if (this.text === before) return; // our own edit (pick, send), already accounted for
    const caret = caretAfterEdit(before, this.text);
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
    this.notice = null;
    cx.notify();
  }

  // A pane's first frame is drawn small and clear, then opens, so it grows into place.
  open(pane, cx) {
    if (this.pane === pane) return;
    this.pane = pane;
    this.ready = false;
    cx.timer.after(16, (cx) => {
      this.ready = true;
      cx.notify();
    });
  }

  toggle(pane, cx) {
    if (this.pane === pane) this.pane = null;
    else this.open(pane, cx);
    this.input.focus();
    cx.notify();
  }

  close(cx) {
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

  say(text, cx, level = "info") {
    this.notice = { text, level };
    cx.notify();
    const shown = this.notice;
    cx.timer.after(5000, (cx) => {
      if (this.notice === shown) {
        this.notice = null;
        cx.notify();
      }
    });
  }

  // ── Files ──────────────────────────────────────────────────────────────────────────────────

  addFiles(paths, cx) {
    for (const path of paths) {
      if (!path || this.files.some((f) => f.path === path)) continue;
      this.files.push({ path, name: path.split(/[\\/]/).filter(Boolean).pop() ?? path });
    }
    this.pane = null;
    this.input.focus();
    cx.notify();
  }

  pickFiles(cx) {
    this.pane = null;
    cx.notify();
    cx.spawn(async (cx) => {
      const os = appWindow().platform;
      const tries = os === "macos"
        ? [["osascript", ["-e", "set fs to choose file with multiple selections allowed", "-e", "set out to \"\"",
            "-e", "repeat with f in fs", "-e", "set out to out & POSIX path of f & linefeed", "-e", "end repeat", "-e", "out"]]]
        : os === "windows"
          ? [["powershell", ["-NoProfile", "-Command",
              "Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.OpenFileDialog; $d.Multiselect = $true; if ($d.ShowDialog() -eq 'OK') { $d.FileNames -join \"`n\" }"]]]
          : [["zenity", ["--file-selection", "--multiple", "--separator=\n"]], ["kdialog", ["--getopenfilename", home(), "--multiple", "--separate-output"]]];
      for (const [cmd, args] of tries) {
        try {
          const r = await exec(cmd, args, { timeout: 600000 });
          if (r.code === 0) this.addFiles(r.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean), cx);
          return;
        } catch {
          // not installed: try the next picker
        }
      }
      this.say("No file picker here. Drop files on the composer instead.", cx);
    });
  }

  pickFolderToAttach(cx) {
    this.pane = null;
    cx.notify();
    cx.spawn(async (cx) => {
      const folder = await pickFolder({ prompt: "Attach" });
      if (folder) this.addFiles([folder], cx);
    });
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
      if (to.length) this.hooks.sent?.({ text: sentText ?? "", files: keptFiles.map((f) => f.name), to }, cx);
      this.sending = false;
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
      const brief = await this.briefFor(entry, this.briefing({ role: step.role }));
      this.starts.push({ space: space?.id ?? null, before: new Set(agents().map((a) => a.address)), at: Date.now(), lead, name: step.tab ?? step.name });
      // Starting a tab moves herdr's focus; tell the page switch this was us, so it stays on Chat.
      hold();
      run("tab.new", {
        ...(step.tab ? { name: step.tab } : {}),
        argv: step.run,
        task: `${brief}\n\n${messageText(step.text, step.files)}`.trimEnd(),
        space: space?.id,
      });
      return;
    }
    if (step.do === "brief") {
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
    // A tab the person named "Orchestrator" themselves gets the Orchestrator's brief here.
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

  // ── Drawing ────────────────────────────────────────────────────────────────────────────────

  /** The box's height at a width: attachments, the text's rows, the tools row. */
  height(width) {
    return (this.files.length ? SIZE.filesRow : 0) + SIZE.textTop + rowsFor(this.text, width - SIZE.textX * 2 - 2) * SIZE.line + SIZE.tools + 2;
  }

  /** The bubble, for the foot of a page `pageWidth` wide. Its pane grows upward from it. */
  render(cx, pageWidth) {
    this.adopt();
    this.width = pageWidth;
    const c = settings().dark ? DARK : LIGHT;
    const width = Math.max(320, Math.min(SIZE.maxWidth, pageWidth - SIZE.gutter * 2));
    return this.bubble(c, width);
  }

  bubble(c, width) {
    // One element carries all our key contexts (a context is a set of names).
    const contexts = ["BotHerdr"];
    if (this.menuOpen()) contexts.push("BotHerdrMenu");
    if (this.pane) contexts.push("BotHerdrPane");
    const menu = this.paneView(c, width);
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
      // Painted first, so the pane above (painted after) covers the box's top edge where they join.
      .child(this.box(c, width, Boolean(menu)))
      .when(Boolean(menu), (el) => el.child(menu));
  }

  // The composer box: attachments, the text, the tools row.
  box(c, width, joined = false) {
    const target = this.target();
    const busy = target?.status === "working";
    const empty = !this.text.trim() && !this.files.length;
    const placeholder = busy ? `${this.leadEntry().name} is working. Enter steers it…` : PLACEHOLDER;
    // Every height here is stated. The text box stretches to fill its parent, and a floating
    // surface may be offered the whole window, so nothing is left to size itself.
    const textH = rowsFor(this.text, width - SIZE.textX * 2 - 2) * SIZE.line;
    const filesH = this.files.length ? SIZE.filesRow : 0;
    return v_flex()
      .id("bc-box")
      .relative()
      .flex_none()
      .w(width)
      .h(filesH + SIZE.textTop + textH + SIZE.tools + 2)
      .bg(c.fill)
      .border_1()
      .border_color(c.edge)
      .rounded(SIZE.radius)
      .shadow_md()
      .on_drop((e, cx) => this.addFiles(e.paths, cx))
      .on_mouse_down("left", () => this.input.focus())
      // The bevel: a lit top edge inside the outline. Not while a pane is joined on top: it
      // would draw a line across the join.
      .when(!joined, (el) => el.child(div().absolute().top(0).left(SIZE.radius).right(SIZE.radius).h(1).bg(c.rim)))
      .when(this.files.length > 0, (el) => el.child(this.filesRow(c)))
      .child(
        div()
          .relative()
          .flex_none()
          .px(SIZE.textX)
          .pt(SIZE.textTop)
          .h(SIZE.textTop + textH)
          .overflow_hidden()
          .when(!this.text, (el) =>
            el.child(div().absolute().top(SIZE.textTop).left(SIZE.textX).text_size(14).text_color(c.faint).child(placeholder)))
          .child(
            Textarea.new(this.input)
              .w_full()
              .h(textH)
              .bg(CLEAR)
              .border_0()
              .text_size(14)
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

  chip(c, token) {
    const agent = token.id.startsWith("agent:") ? agents().find((a) => a.address === token.id.slice(6)) : null;
    const command = token.id.startsWith("cmd:") ? commandColor(token.id.slice(4)) : null;
    const color = command ? readable(c, command, c.hover) : agent?.program?.tile ? readable(c, agent.program.tile, c.hover) : token.id.startsWith("start:") ? c.muted : c.accent;
    return h_flex()
      .px(6)
      .h(20)
      .items_center()
      .rounded(6)
      .bg(c.hover)
      .border_1()
      .border_color(c.edge)
      .text_size(12.5)
      .font_medium()
      .text_color(color)
      .child(token.label ?? token.text);
  }

  filesRow(c) {
    return h_flex()
      .id("bc-files")
      .flex_none()
      .h(SIZE.filesRow)
      .overflow_hidden()
      .gap(6)
      .px(12)
      .pt(12)
      .children(this.files.map((f, i) =>
        h_flex()
          .id(`bc-file-${i}`)
          .h(28)
          .pl(8)
          .pr(4)
          .gap(6)
          .items_center()
          .rounded(SIZE.nested)
          .bg(c.hover)
          .border_1()
          .border_color(c.edge)
          .text_size(12)
          .child(svg(ICON("file")).size(14).text_color(c.muted))
          .child(div().max_w(220).truncate().child(f.name))
          .child(
            div()
              .id(`bc-file-x-${i}`)
              .size(20)
              .rounded(6)
              .flex()
              .items_center()
              .justify_center()
              .text_color(c.muted)
              .cursor_pointer()
              .hover((s) => s.bg(c.well).text_color(c.ink))
              .on_click((_e, cx) => {
                this.files.splice(i, 1);
                cx.notify();
              })
              .child(svg(ICON("x")).size(12)),
          )));
  }

  tools(c, target, busy, empty) {
    const kbd = (text) => div().px(5).py(1).rounded(5).bg(c.kbd).text_size(11).text_color(c.muted).child(text);
    const hints = this.menuOpen()
      ? [kbd("↑"), kbd("↓"), "choose", kbd("↵"), "insert"]
      : this.pane
        ? [kbd("Esc"), "close"]
        : [kbd("Shift"), kbd("↵"), "new line"];
    const space = this.space();
    const canSend = !empty && !this.sending;
    return h_flex()
      .id("bc-tools")
      .flex_none()
      .h(SIZE.tools)
      .px(10)
      .gap(6)
      .items_center()
      .child(this.iconButton(c, "bc-attach", "paperclip", this.pane === "attach", (_e, cx) => this.toggle("attach", cx)))
      .child(
        h_flex()
          .id("bc-space")
          .h(SIZE.chip)
          .px(8)
          .gap(6)
          .items_center()
          .rounded(SIZE.nested)
          .text_size(12.5)
          .text_color(c.muted)
          .cursor_pointer()
          .when(this.pane === "spaces", (el) => el.bg(c.well).text_color(c.ink))
          .hover((s) => s.bg(c.hover).text_color(c.ink))
          .on_click((_e, cx) => this.toggle("spaces", cx))
          .child(svg(ICON("folder")).size(14))
          .child(div().max_w(180).truncate().child(space?.name ?? "No space"))
          .when(Boolean(space?.branch), (el) => el.child(div().text_color(c.faint).max_w(120).truncate().child(space.branch)))
          .child(svg(ICON("chevron-down")).size(12).text_color(c.faint)),
      )
      .child(div().flex_1())
      .when(Boolean(this.notice), (el) =>
        el.child(div().max_w(320).truncate().text_size(12).text_color(this.notice.level === "error" ? c.danger : c.muted).child(this.notice.text)))
      .when(!this.notice && Boolean(target), (el) =>
        el.child(div().max_w(220).truncate().text_size(12).text_color(c.faint).child(`to ${this.leadEntry().name}`)))
      .when(!this.notice && !target && Boolean(this.lead()), (el) =>
        el.child(div().max_w(220).truncate().text_size(12).text_color(c.faint).child(`starts ${this.leadEntry().name} · ${this.lead().name}`)))
      .when(this.width >= 560, (el) => el.child(h_flex().flex_none().gap(4).items_center().text_size(11.5).text_color(c.muted).children(hints)))
      .when(busy, (el) =>
        el.child(
          div()
            .id("bc-stop")
            .size(SIZE.iconButton)
            .rounded_full()
            .flex()
            .items_center()
            .justify_center()
            .bg(c.stop)
            .cursor_pointer()
            .hover((s) => s.bg(c.stopHover))
            .on_click((_e, cx) => this.stop(cx))
            .child(div().size(10).rounded(2).bg("#ffffff")),
        ))
      .child(
        div()
          .id("bc-send")
          .size(SIZE.iconButton)
          .rounded_full()
          .flex()
          .items_center()
          .justify_center()
          .when(canSend, (el) =>
            el.bg(c.accent).border_b(1).border_color(c.accentLip).text_color(c.accentInk).cursor_pointer().hover((s) => s.opacity(0.92)))
          .when(!canSend, (el) => el.bg(c.well).text_color(c.faint))
          .on_click((_e, cx) => this.send(cx))
          .child(this.sending
            ? svg(ICON("spinner")).size(16).spin(900)
            : svg(ICON("send")).size(16)),
      );
  }

  iconButton(c, id, icon, on, onClick) {
    return div()
      .id(id)
      .size(SIZE.iconButton)
      .rounded_full()
      .flex()
      .items_center()
      .justify_center()
      .text_color(on ? c.ink : c.muted)
      .cursor_pointer()
      .when(on, (el) => el.bg(c.well))
      .hover((s) => s.bg(c.well).text_color(c.ink))
      .on_click(onClick)
      .child(svg(ICON(icon)).size(16));
  }

  // ── The pane that grows out of the top ─────────────────────────────────────────────────────

  paneView(c, width) {
    if (!this.pane) return null;
    let size;
    let body;
    if (this.pane === "suggest") {
      const rows = this.rows();
      if (!rows.length) return null;
      const shown = rows.slice(this.offset, this.offset + SIZE.rowsShown);
      let w = 0;
      for (const r of rows) w = Math.max(w, textWidth(r.label && r.kind !== "command" ? r.label : r.name, 13) + textWidth(r.hint, 12.5) + textWidth(r.tag, 10.5));
      size = { w: Math.min(Math.max(Math.ceil(w) + 120, 220), width - 80), h: 12 + shown.length * SIZE.row };
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
    } else if (this.pane === "attach") {
      size = { w: 260, h: 12 + 3 * SIZE.row };
      body = v_flex()
        .w_full()
        .child(this.menuItem(c, "bc-attach-file", "file", "Attach document…", 2, (_e, cx) => this.pickFiles(cx)))
        .child(this.menuItem(c, "bc-attach-folder", "folder", "Attach folder…", 1, (_e, cx) => this.pickFolderToAttach(cx)))
        .child(h_flex().h(SIZE.row).px(8).items_center().text_size(11.5).text_color(c.muted).child("Or drop files on the composer"));
    } else {
      const list = spaces();
      const current = this.space()?.id;
      const shown = list.slice(0, 7);
      size = { w: 400, h: 12 + (shown.length + 1) * SIZE.row };
      body = v_flex()
        .w_full()
        .children(shown.map((s, i) =>
          h_flex()
            .id(`bc-sp-${s.id}`)
            .h(SIZE.row)
            .px(8)
            .gap(8)
            .items_center()
            .rounded(SIZE.nested)
            .cursor_pointer()
            .when(s.id === current, (el) => el.bg(c.hover))
            .hover((st) => st.bg(c.hover))
            .opacity(this.ready ? 1 : 0)
            .transition("opacity", { ...MOTION.row, delay: (shown.length - i) * MOTION.rowStagger })
            .on_click((_e, cx) => {
              hold();
              run("space.select", { id: s.id });
              this.pane = null;
              this.input.focus();
              cx.notify();
            })
            .child(svg(ICON("folder")).size(14).text_color(c.muted))
            .child(div().text_size(13).font_medium().truncate().child(s.name))
            .when(Boolean(s.branch), (el) => el.child(div().text_size(12).text_color(c.faint).truncate().child(s.branch)))
            .child(div().flex_1())
            .when(Boolean(s.status), (el) => el.child(div().text_size(11).text_color(c.muted).child(s.status === "blocked" ? "needs you" : s.status)))))
        .child(this.menuItem(c, "bc-open-folder", "folder-plus", "Open folder…", 0, (_e, cx) => {
          this.pane = null;
          cx.notify();
          cx.spawn(async (cx) => {
            const folder = await pickFolder({ prompt: "Open" });
            if (folder) {
              hold();
              run("space.new", { folder });
            }
            cx.notify();
          });
        }));
    }
    const h = this.ready ? size.h : Math.round(size.h * 0.85);
    const w = this.ready ? size.w : Math.round(size.w * 0.85);
    const pane = v_flex()
      .id("bc-pane")
      .relative()
      .flex_none()
      .w_full()
      .h(h)
      .transition("height", MOTION.menuHeight)
      .bg(c.fill)
      .border_t(1)
      .border_l(1)
      .border_r(1)
      .border_color(c.edge)
      .rounded_t(SIZE.radius)
      .overflow_hidden()
      .px(SIZE.menuPad)
      .pt(8)
      .pb(SIZE.menuPad)
      .justify_end()
      .child(div().absolute().top(0).left(SIZE.radius).right(SIZE.radius).h(1).bg(c.rim))
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
        .w(F + 1)
        .h(F)
        .child(svg(ICON(`fillet-${side}`)).absolute().top(0).left(0).w(F + 1).h(F).text_color(c.fill))
        .child(svg(ICON(`fillet-${side}-edge`)).absolute().top(0).left(0).w(F + 1).h(F).text_color(c.edge));
    return div()
      .id("bc-pane-row")
      .relative()
      .flex_none()
      .w(w + F * 2)
      .h(h)
      .transition("width", MOTION.menuWidth)
      .transition("height", MOTION.menuHeight)
      .mb(-1)
      .opacity(this.ready ? 1 : 0)
      .transition("opacity", { duration: 110, easing: "ease-out" })
      .child(h_flex().absolute().top(0).bottom(0).left(F).right(F).items_end().child(pane))
      .child(fillet("left"))
      .child(fillet("right"));
  }

  row(c, r, index, fromBottom) {
    const active = index === this.at;
    const color = tint(c, r);
    const showName = r.kind === "command" ? r.name : r.label;
    return h_flex()
      .id(`bc-row-${r.id}`)
      .flex_none()
      .h(SIZE.row)
      .px(8)
      .gap(8)
      .items_center()
      .rounded(SIZE.nested)
      .cursor_pointer()
      .when(active, (el) => el.bg(c.hover))
      .hover((s) => s.bg(c.hover))
      .opacity(this.ready ? 1 : 0)
      .transition("opacity", { ...MOTION.row, delay: fromBottom * MOTION.rowStagger })
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
            .size(18)
            .flex_none()
            .flex()
            .items_center()
            .justify_center()
            .rounded(6)
            .border_1()
            .border_color(r.color ? color : c.edge)
            .text_size(10.5)
            .font_semibold()
            .text_color(r.color ? color : c.muted)
            .child(r.name.charAt(0).toUpperCase()),
        ))
      .child(div().flex_none().text_size(13).font_medium().text_color(r.kind === "all" ? c.ink : color).child(r.kind === "command" ? `/${showName}` : showName))
      .child(div().flex_1().min_w(0).truncate().text_size(12.5).text_color(c.muted).child(r.hint))
      .child(div().flex_none().px(5).rounded(5).text_size(10.5).font_medium().text_color(color).child(r.tag));
  }

  menuItem(c, id, icon, label, fromBottom, onClick) {
    return h_flex()
      .id(id)
      .flex_none()
      .h(SIZE.row)
      .px(8)
      .gap(8)
      .items_center()
      .rounded(SIZE.nested)
      .cursor_pointer()
      .hover((s) => s.bg(c.hover))
      .opacity(this.ready ? 1 : 0)
      .transition("opacity", { ...MOTION.row, delay: fromBottom * MOTION.rowStagger })
      .on_click(onClick)
      .child(svg(ICON(icon)).size(16).text_color(c.muted))
      .child(div().text_size(13).font_medium().child(label));
  }
}
