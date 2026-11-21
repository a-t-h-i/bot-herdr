// `bh agent <agent>`: a team member in its herdr terminal, run headless.
//
// Each message (typed here, pasted by `hc send`, or the first one on the command line) is one
// turn of the agent's harness in its non-interactive mode (runner.mjs). What the agent does is
// printed as it happens; its final answer is printed, and for an agent the user talks to
// (`--mode lead`) also saved as its reply in the chat. The terminal reports its status to herdr
// (OSC 7501), so herdr, `hc wait` and the chat see it working and done like any agent.
//
// Keys: Enter sends, Esc or Ctrl+C stops the turn, Ctrl+D or /exit quits. /cli opens the
// harness's full interactive CLI on the same conversation; /new starts a fresh one; /team
// sends the brief again.

import { createHash, randomBytes } from "node:crypto";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { slug } from "../../roster.js";
import { DATA, accessOf, appendJsonl, ensureDir, exists, now, projectRoot, readJson, readText, store, writeJson, writeText } from "./core.mjs";
import * as team from "./team.mjs";
import * as T from "./tasks.mjs";
import * as P from "./plans.mjs";
import * as knowledge from "./knowledge.mjs";
import { HEADLESS, agentUser, asRoot, compactSession, headless, interactive, launch, turn } from "./runner.mjs";
import * as Q from "./ask.mjs";

export { accessOf };

const ESC = "\x1b";
const PASTE_START = "\x1b[200~";
const PASTE_END = "\x1b[201~";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RED = "\x1b[31m";
const OFF = "\x1b[0m";

/** A file name for an address ("t3", "laptop/t3"). */
export const fileKey = (address) => String(address).replace(/[\\/]/g, "_");

/** The chat's entry for a turn that ended without any words. */
export const NO_REPLY = "(finished without a reply)";

/** What an agent answers to a child's report it has already dealt with: nothing reaches the chat. */
export const HANDLED = "(handled)";

/**
 * What a turn leaves in the chat, or null for nothing. A turn that ended on a question card leaves
 * nothing (the card says it); a turn on a child's report (`<hc from=…>`) that ends without words or
 * with HANDLED leaves nothing (a late report on finished work); any other turn without words says so.
 */
export function toChat(input, reply, { asked = false } = {}) {
  if (reply === HANDLED || (!reply && /^\s*<hc from=/.test(input))) return null;
  if (!reply && asked) return null;
  return reply || NO_REPLY;
}

/** The chat's reply file: the answer, and a stamp so the same words twice still show twice. */
export function replyText(text) {
  return `${String(text).trim()}\n\n<!-- bh ${now()} -->\n`;
}

/** The most turns a reply log keeps; past it the oldest half goes. */
export const REPLY_LOG_MAX = 400;

/** An event's id: two events in the same millisecond still differ. */
const replyId = () => `${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;

/**
 * One event in an agent's reply log (`replies/<key>.jsonl`): `{ id, at, kind, name, space, text }`,
 * so the chat can show each turn even when two end between its polls or the agent exits first.
 * The log is appended to, never rewritten, so a reader between two turns sees every turn once;
 * only past REPLY_LOG_MAX lines is it rewritten, whole and under a temporary name, then renamed.
 */
export function logReply(file, entry) {
  appendJsonl(file, {
    id: entry.id ?? replyId(),
    at: entry.at ?? now(),
    kind: entry.kind ?? "reply",
    name: entry.name ?? null,
    space: entry.space ?? (process.env.HERDR_SPACE || null),
    text: String(entry.text ?? ""),
  });
  trimLog(file);
}

/** Keeps the newest half of a log past its cap: the rewrite lands whole, or not at all. */
function trimLog(file) {
  const lines = readText(file).split("\n").filter(Boolean);
  if (lines.length <= REPLY_LOG_MAX) return;
  writeText(file, [...lines.slice(-(REPLY_LOG_MAX / 2)), ""].join("\n"));
}

/**
 * Keys from a raw terminal: typed characters, bracketed pastes (what `hc send` uses), Enter,
 * Backspace, Esc, Ctrl+C and Ctrl+D. A paste without the brackets carries its newlines as
 * Enter: an Enter that more input follows within `settle` ms is a new line, not a send.
 */
export class Keys {
  constructor({ line, esc, interrupt, eof, echo = () => {}, settle = 30, timers = { set: setTimeout, clear: clearTimeout } }) {
    Object.assign(this, { onLine: line, onEsc: esc, onInterrupt: interrupt, onEof: eof, echo, settle, timers });
    this.buf = "";
    this.pasting = false;
    this.pending = "";
    this.enter = null;
  }

  add(text) {
    if (!text) return;
    this.buf += text;
    this.echo(text);
  }

  submit() {
    this.enter = null;
    const line = this.buf;
    this.buf = "";
    this.echo("\n");
    this.onLine(line);
  }

  feed(data) {
    let s = this.pending + String(data);
    this.pending = "";
    if (this.enter) {
      this.timers.clear(this.enter);
      this.enter = null;
      this.add("\n");
    }
    for (let i = 0; i < s.length; i++) {
      if (this.pasting) {
        const end = s.indexOf(PASTE_END, i);
        if (end < 0) {
          // Keep a part of the end marker that a chunk split.
          let keep = 0;
          for (let k = Math.min(PASTE_END.length - 1, s.length - i); k > 0; k--) if (PASTE_END.startsWith(s.slice(s.length - k))) { keep = k; break; }
          this.add(s.slice(i, s.length - keep).replace(/\r\n?/g, "\n"));
          this.pending = s.slice(s.length - keep);
          return;
        }
        this.add(s.slice(i, end).replace(/\r\n?/g, "\n"));
        this.pasting = false;
        i = end + PASTE_END.length - 1;
        continue;
      }
      const ch = s[i];
      if (ch === ESC) {
        const rest = s.slice(i);
        if (rest.startsWith(PASTE_START)) {
          this.pasting = true;
          i += PASTE_START.length - 1;
          continue;
        }
        const seq = /^\x1b\[[0-9;?]*[ -/]*[@-~]/.exec(rest) ?? /^\x1bO[\s\S]/.exec(rest);
        if (seq) {
          i += seq[0].length - 1; // arrows, function keys: not used here
          continue;
        }
        if (rest.length > 1 && rest.length < PASTE_START.length && (PASTE_START.startsWith(rest) || /^\x1b\[[0-9;?]*$/.test(rest))) {
          this.pending = rest; // the rest of the sequence is in the next chunk
          return;
        }
        this.onEsc();
        continue;
      }
      if (ch === "\x03") {
        this.onInterrupt();
        continue;
      }
      if (ch === "\x04") {
        if (!this.buf) this.onEof();
        continue;
      }
      if (ch === "\x7f" || ch === "\b") {
        if (this.buf && !this.buf.endsWith("\n")) this.echo("\b \b");
        this.buf = this.buf.slice(0, -1);
        continue;
      }
      if (ch === "\x15") {
        this.buf = "";
        this.echo("\n");
        continue;
      }
      if (ch === "\r" || ch === "\n") {
        if (ch === "\r" && s[i + 1] === "\n") i++;
        if (i < s.length - 1) {
          this.add("\n");
          continue;
        }
        this.enter = this.timers.set(() => this.submit(), this.settle);
        continue;
      }
      if (ch < " " && ch !== "\t") continue;
      this.add(ch);
    }
  }

  clear() {
    this.buf = "";
  }
}

// OSC and DCS, 7-bit (`ESC ]`, `ESC P`) or 8-bit C1 (`\x9d`, `\x90`), up to their terminator (BEL,
// ST, C1 ST) or the end of the string: a lazy body, so one nested inside another is taken with it.
const UNSAFE_SEQUENCE = /(?:\x1b[\]P]|[\x9d\x90])[\s\S]*?(?:\x07|\x1b\\|\x9c|$)/g;

/**
 * A harness's words with the control sequences it could use to drive the terminal itself removed:
 * OSC (herdr's own 7501 status, a clipboard write) and DCS, nested or split by another one too.
 * Ordinary text and SGR styling stay.
 */
export function stripUnsafeEscapes(text) {
  let out = String(text ?? "");
  for (;;) {
    const next = out.replace(UNSAFE_SEQUENCE, "");
    if (next === out) break;
    out = next;
  }
  return out.replace(/\x1b[\]P]|[\x9d\x90]/g, "");
}

/** OSC 7501: what herdr shows for this terminal, and what `hc wait` waits on. */
export function statusReport(state, { app, title, msg } = {}) {
  const b64 = (s) => Buffer.from(String(s)).toString("base64");
  const fields = [`state=${state}`];
  if (app) fields.push(`app=${app}`);
  if (title) fields.push(`title=${b64(title)}`);
  if (msg) fields.push(`msg=${b64(String(msg).slice(0, 200))}`);
  return `\x1b]7501;${fields.join(":")}\x1b\\`;
}

/**
 * The saved conversation to resume, for this harness and project. A conversation belongs to one
 * project: one saved for another starts over (`moved`). One saved before roots were kept keeps its
 * session and takes this project's root.
 */
export function resumeState(saved, { harness, root }) {
  if (saved?.harness !== harness) return { state: { harness, session: null, root }, moved: false };
  if (!saved.root) return { state: { ...saved, root }, moved: false };
  if (saved.root !== root) return { state: { harness, session: null, root }, moved: true };
  return { state: saved, moved: false };
}

/** The harness's question tool as a card, as bh ask makes it, with its mockups drawn now. */
function askCard(e, { address, who, cwd, say }) {
  try {
    const q = Q.ask({ title: e.title ?? "Questions", questions: e.questions, from: address, fromName: who, cwd });
    const { failed } = Q.drawMockups(q);
    say(`${DIM}  · Asked the user (${q.questions.length} question${q.questions.length === 1 ? "" : "s"}); the answers come as the next message.${OFF}`);
    for (const f of failed) say(`${DIM}  · ${stripUnsafeEscapes(`Couldn't draw question ${f.question}, option "${f.option}": ${f.error}`)}${OFF}`);
  } catch (err) {
    say(`${DIM}  · ${stripUnsafeEscapes(`Couldn't ask: ${err.message}`)}${OFF}`);
  }
}

/** Runs the agent until the user quits. `first`: a message to start with. */
export async function runAgent({ word, mode = "lead", name = null, parent = null, task = null, step = null, plan = null, model = null, effort = null, first = "" }) {
  const root = projectRoot();
  const cwd = process.cwd();
  const address = process.env.HC_TERMINAL_ID || null;
  const tty = process.stdin.isTTY;
  const write = (s) => process.stdout.write(s);
  const say = (s = "") => write(`${s}\n`);

  // The agent as Settings has it now: read again before each turn, so a change applies to the next message.
  let last = null;
  const current = () => {
    try {
      const a = team.findMember(word);
      last = { ...a, ...(model ? { model } : {}), ...(effort ? { effort } : {}) };
    } catch (e) {
      if (!last) throw e;
    }
    return { agent: last, known: team.team().known };
  };
  let { agent, known } = current();
  const who = name ?? (mode === "lead" ? agent.name : slug(agent.name));
  const key = `${slug(who)}${address ? `-${fileKey(address)}` : ""}`;
  const stateFile = join(DATA, "sessions", `${key}.json`);
  const briefFile = join(DATA, "briefs", `${key}.md`);
  const resumed = resumeState(readJson(stateFile, null), { harness: agent.harness, root });
  let state = resumed.state;
  const acp = { current: null };
  const app = () => HEADLESS[agent.harness]?.app ?? agent.harness;
  const status = (word2, msg) => tty && write(statusReport(word2, { app: app(), title: who, msg }));

  let running = null;
  const queue = [];
  let brief = "";

  const save = () => writeJson(stateFile, state);
  const activity = (line) => address && writeJson(join(DATA, "activity", `${fileKey(address)}.json`), { line, at: now() });
  const prompt = () => tty && write(`${BOLD}›${OFF} `);

  function header() {
    const k = known.find((x) => x.key === agent.harness);
    const { access } = accessOf();
    say(`${BOLD}${who}${OFF} ${DIM}· ${[k?.name ?? agent.harness, agent.model || "default model", agent.effort ? `effort ${agent.effort}` : ""].filter(Boolean).join(" · ")} · ${access !== "full" ? "standard access" : agent.harness === "claude" && asRoot(cwd) ? "full access (as root: sandboxed)" : "full access"}${agentUser(cwd) ? ` · as ${agentUser(cwd).name}` : ""}${OFF}`);
    say(`${DIM}Headless: each message runs ${k?.name ?? agent.harness} and its answer comes back here${mode === "lead" ? " and in the chat" : ""}. Enter sends, Esc stops, /cli opens the full CLI, /new starts over, /exit quits.${OFF}`);
    say();
  }

  /** The task's or plan's skills entry for this agent: what this spawn may use beyond its pins. */
  function skillEntry() {
    const id = team.knowledgeName(agent);
    const t = task ? load(T.loadTask, task) : null;
    const p = plan ? load(P.loadPlan, plan) : null;
    return (t?.skills ?? {})[id] ?? (p?.skills ?? {})[id] ?? null;
  }

  /** The task and plan as they are now, or null when one is gone. */
  function load(read, id) {
    try {
      return read(root, id);
    } catch {
      return null;
    }
  }

  /** What the brief told the agent that can change, read from one snapshot of the task, plan and board. */
  function snapshot() {
    const t = task ? load(T.loadTask, task) : null;
    const p = plan ? load(P.loadPlan, plan) : null;
    return { t, p, board: task ? T.board(root, task) : [] };
  }

  function seenNow(snap = snapshot()) {
    const known = knowledge.forBrief(root, team.knowledgeName(agent));
    return {
      knowledge: createHash("sha1").update(known).digest("hex"),
      boardN: snap.board.at(-1)?.n ?? 0,
      comments: [...T.openComments(snap.t ?? {}), ...P.openComments(snap.p ?? {})].map((c) => c.id),
      steps: Object.fromEntries((snap.t?.steps ?? []).map((s) => [s.n, s.status])),
    };
  }

  /** The open comments this agent has not seen yet: its task's and its plan's. */
  function newComments(seen, snap) {
    const ids = new Set(seen.comments ?? []);
    return [...T.openComments(snap.t ?? {}), ...P.openComments(snap.p ?? {})].filter((c) => !ids.has(c.id));
  }

  /** `## Brief update`: only what changed since `seen`, and "" when nothing did. */
  function briefUpdate(seen, snap = snapshot()) {
    const now2 = seenNow(snap);
    const lines = [];
    if (seen.knowledge !== now2.knowledge) lines.push(`Your project knowledge changed: run \`bh knowledge ${team.knowledgeName(agent)}\` to read it.`);
    for (const e of snap.board.filter((x) => x.n > seen.boardN)) lines.push(T.boardLine(e));
    for (const c of newComments(seen, snap)) lines.push(`Comment ${c.id}${c.step ? ` (step ${c.step})` : ""}: ${c.text}`);
    const title = (n) => snap.t?.steps.find((s) => String(s.n) === n)?.title ?? "";
    for (const [n, status] of Object.entries(now2.steps)) {
      const was = seen.steps?.[n];
      if (!was) lines.push(`${n}. ${title(n)}: new`);
      else if (was !== status) lines.push(`${n}. ${title(n)}: ${was} → ${status}`);
    }
    for (const n of Object.keys(seen.steps ?? {})) if (!Object.hasOwn(now2.steps, n)) lines.push(`${n}: removed`);
    return lines.length ? `## Brief update\n\n${lines.join("\n")}` : "";
  }

  /** The file a finished task leaves for the Orchestrator's next turn (`bh task status done`, `bh plan task`). */
  const pendingCompact = join(DATA, "sessions", "compact-pending.json");

  /**
   * What a fresh conversation starts from: a task that finished ("done"), or a plan that just
   * became a task ("planned", which starts now), followed by its steps, one line each.
   */
  function handoff(marker) {
    const t = marker.task ? load(T.loadTask, marker.task) : null;
    const p = marker.kind === "planned" && marker.plan ? load(P.loadPlan, marker.plan) : null;
    const first = marker.kind === "planned"
      ? `Previous plan ${p?.title ?? marker.plan} became task ${t?.title ?? marker.task}; it starts now.`
      : `${t?.title ?? marker.task}: done.`;
    return [
      "## Handoff",
      first,
      ...(t?.steps ?? []).map((s) => `${s.n}. ${s.title} — ${s.status}`),
      "Knowledge and boards hold the rest.",
    ].join("\n");
  }

  /**
   * Between tasks, before the next message: Claude Code compacts its own saved conversation
   * headless; any other harness, or a failed compaction, starts over with a short handoff instead.
   * Only this project's Orchestrator takes the marker: another agent the user talks to directly
   * (`--mode lead`), or another project's Orchestrator, leaves it for its owner.
   */
  async function compactIfPending() {
    if (mode !== "lead" || !agent.lead) return "";
    const marker = readJson(pendingCompact, null);
    if (!marker || marker.project !== root) return "";
    rmSync(pendingCompact, { force: true });
    if (!state.session) return ""; // nothing to compact: the next message starts the conversation anyway
    if (agent.harness === "claude") {
      say(`${DIM}Compacting this conversation: ${marker.reason}.${OFF}`);
      const { access, allow } = accessOf();
      const done = await compactSession({ agent, known, state, cwd, access, allow });
      if (done.ok) {
        state.session = done.session ?? state.session;
        save();
        return "";
      }
      say(`${DIM}Couldn't compact (${stripUnsafeEscapes(done.error || "no session")}): a new conversation with a handoff.${OFF}`);
    }
    acp.current?.close();
    acp.current = null;
    state = { harness: agent.harness, session: null, root };
    save();
    return handoff(marker);
  }

  /** One line per turn for `bh usage` and `bh metrics`: what it cost, on which task and step (and in the task's file). */
  function recordUsage(usage, wallMs) {
    const tokens = ["input", "output", "cacheRead", "cacheWrite"].some((k) => typeof usage[k] === "number");
    const record = {
      at: now(),
      agent: who,
      role: team.knowledgeName(agent),
      harness: agent.harness,
      model: agent.model || null,
      effort: agent.effort || null,
      project: root,
      plan: plan ?? null,
      task: task ?? null,
      step: step === null ? null : Number(step),
      ...usage,
      // Only what the harness gave this turn: metrics estimates the rest and marks it estimated.
      reported: { tokens, cost: typeof usage.costUsd === "number" },
      ...(usage.ms === undefined ? { ms: wallMs } : {}),
    };
    // Best effort: a lock timeout or a write error must never fail the turn.
    try {
      appendJsonl(join(DATA, "usage", `${key}.jsonl`), record);
      if (task && exists(join(store(root, "tasks", task), "task.json"))) T.recordUsage(root, task, record);
    } catch {}
  }

  function makeBrief() {
    const child = task ? (load(T.loadTask, task)?.children ?? []).find((c) => c.state === "open" && c.name === who) : null;
    brief = team.brief(agent, { mode, root, parent, task, plan, step, name: name ?? null, headless: true, worktree: child ? { path: child.path, branch: child.branch } : null });
    writeText(briefFile, brief);
    state.seen = seenNow();
    save();
  }

  async function runTurn(text) {
    ({ agent, known } = current());
    agent = team.withAllowlist(agent, skillEntry());
    if (state.harness !== agent.harness) {
      acp.current?.close();
      acp.current = null;
      state = { harness: agent.harness, session: null, root };
      say(`${DIM}${who} now runs on ${agent.harness}: a new conversation.${OFF}`);
    }
    if (!headless(agent.harness)) {
      say(`${RED}${agent.harness} has no headless mode here. Type /cli to open it.${OFF}`);
      return finish({ text: "", error: `${agent.harness} has no headless mode here: open ${who}'s terminal and type /cli.` });
    }
    const carried = await compactIfPending();
    if (!state.session && !acp.current) makeBrief();
    const update = state.seen ? briefUpdate(state.seen) : "";
    const { access, allow } = accessOf();
    status("working", text.split("\n")[0]);
    let shown = "";
    let usage = {};
    const started = Date.now();
    const on = (e) => {
      if (e.kind === "tool") {
        say(`${DIM}  · ${stripUnsafeEscapes(e.line)}${OFF}`);
        status("working", e.line);
        activity(e.line);
      } else if (e.kind === "usage") {
        const { kind, ...rest } = e;
        usage = { ...usage, ...rest };
      } else if (e.kind === "ask" && address) {
        // The harness's own question tool: the same card as bh ask; the answers come back as a message.
        askCard(e, { address, who, cwd, say });
      } else if (e.kind === "text" && e.text.trim() && e.text !== shown) {
        shown = e.text;
        say(`\n${stripUnsafeEscapes(e.text.trim())}\n`);
      }
    };
    try {
      running = turn({ agent, known, state, key, brief, briefFile, prompt: [carried, update, text].filter(Boolean).join("\n\n"), cwd, on, access, allow, acp });
    } catch (e) {
      return finish({ text: "", error: e.message }, text);
    }
    const r = await running.done;
    running = null;
    if (r.session && (r.text || !r.error)) state.session = r.session;
    state.seen = seenNow(); // the next turn's update starts from here
    save();
    recordUsage(usage, Date.now() - started);
    if (r.text && r.text !== shown) say(`\n${stripUnsafeEscapes(r.text.trim())}\n`);
    return finish(r, text);
  }

  function finish(r, input = "") {
    if (address) writeJson(join(DATA, "activity", `${fileKey(address)}.json`), { line: null, at: now() });
    let reply = r.text?.trim() ?? "";
    if (r.cancelled) {
      say(`${DIM}Stopped.${OFF}`);
      reply = reply ? `${reply}\n\n_Stopped before finishing._` : "_Stopped._";
    } else if (r.error) {
      say(`${RED}${stripUnsafeEscapes(r.error)}${OFF}`);
      reply = `${reply ? `${reply}\n\n` : ""}**Couldn't finish:**\n\n\`\`\`\n${String(r.error).slice(-1500)}\n\`\`\``;
    }
    // Every agent's answer reaches the chat, a child's too (it also reports to its parent); toChat
    // says when a turn leaves nothing there.
    const chat = toChat(input, reply, { asked: r.asked });
    if (address) {
      // The log first, the display copy after: a reader of the log never misses the turn the
      // `.md` already shows. A turn that ended on a question card logs that, so the chat stops
      // waiting for a reply that is not coming.
      const log = join(DATA, "replies", `${fileKey(address)}.jsonl`);
      if (chat) {
        const kind = r.cancelled ? "stopped" : r.error ? "error" : "reply";
        logReply(log, { at: now(), kind, name: who, text: chat });
        writeText(join(DATA, "replies", `${fileKey(address)}.md`), replyText(chat));
      } else if (r.asked) {
        logReply(log, { at: now(), kind: "asked", name: who, text: "" });
      }
    }
    status(r.error ? "error" : "done", r.error ? String(r.error).split("\n")[0] : undefined);
  }

  async function cli() {
    ({ agent, known } = current());
    const argv = interactive(agent, known, state, key);
    say(`${DIM}Opening ${argv.join(" ")}. Quit it to come back here.${OFF}`);
    keysOff();
    const child = launch(argv, { cwd, stdio: "inherit" });
    await new Promise((resolve) => {
      child.on("error", (e) => {
        say(`${RED}${e.message}${OFF}`);
        resolve();
      });
      child.on("close", resolve);
    });
    keysOn();
    say();
    header();
    status("idle");
  }

  async function handle(text) {
    const words = text.trim();
    if (words === "/exit" || words === "/quit") return quit();
    if (words === "/cli") return cli();
    if (words === "/new") {
      acp.current?.close();
      acp.current = null;
      state = { harness: agent.harness, session: null, root };
      save();
      say(`${DIM}A new conversation: the next message starts it.${OFF}`);
      return;
    }
    if (words === "/team") {
      makeBrief();
      return runTurn(`${brief}\n\nThat is your brief again (the team or what you know may have changed). Reply with one line once you have read it.`);
    }
    return runTurn(text);
  }

  let busy = false;
  let turns = 0;
  async function drain() {
    if (busy) return;
    busy = true;
    try {
      while (queue.length) {
        const next = queue.shift();
        if (!next.startsWith("/") && turns++) say(`${DIM}${"─".repeat(24)}${OFF}`);
        await handle(next);
      }
    } finally {
      busy = false;
      prompt();
    }
  }

  function enqueue(text) {
    if (!text.trim()) return prompt();
    queue.push(text.replace(/^\s*\n/, "").trimEnd()); // a template's empty body leaves blank lines in front
    if (busy) say(`${DIM}(Queued: it goes after this turn.)${OFF}`);
    drain();
  }

  function cancel() {
    if (running) {
      running.cancel();
      return true;
    }
    return false;
  }

  function quit() {
    cancel();
    acp.current?.close();
    keysOff();
    status("idle");
    process.exit(0);
  }

  const keys = new Keys({
    line: enqueue,
    esc: () => {
      if (!cancel() && keys.buf) {
        keys.clear();
        say();
        prompt();
      }
    },
    interrupt: () => {
      if (cancel()) return;
      if (keys.buf) {
        keys.clear();
        say();
        prompt();
      } else say(`\n${DIM}Ctrl+D or /exit quits.${OFF}`);
    },
    eof: quit,
    echo: (s) => tty && write(s),
  });
  const onData = (d) => keys.feed(d);

  function keysOn() {
    if (!tty) return;
    process.stdin.setRawMode(true);
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", onData);
    process.stdin.resume();
    write("\x1b[?2004h"); // bracketed paste: `hc send` text arrives whole
  }
  function keysOff() {
    if (!tty) return;
    write("\x1b[?2004l");
    process.stdin.off("data", onData);
    process.stdin.setRawMode(false);
    process.stdin.pause();
  }

  // Everything the harness runs knows it is an agent: bh then refuses the user's settings.
  process.env.BH_AGENT = who;
  if (parent) process.env.BH_PARENT = parent;
  if (task) process.env.BH_TASK = task;
  if (step) process.env.BH_STEP = String(step);
  if (mode === "lead") process.env.BH_LEAD = "1";
  for (const sig of ["SIGTERM", "SIGHUP"]) process.on(sig, quit);
  if (tty) write(`\x1b]2;${who}\x07`);
  if (address) team.hc(["label", address, "bot-herdr.briefed3=1", "bot-herdr.headless=1"]);
  ensureDir(join(DATA, "replies"));
  header();
  if (resumed.moved) say(`${DIM}${who} is in another project now: a new conversation.${OFF}`);
  save(); // the saved conversation now names its project
  keysOn();
  if (first.trim()) {
    say(`${BOLD}›${OFF} ${first.trim()}\n`);
    queue.push(first);
    drain();
  } else {
    status("idle");
    prompt();
  }
  if (!tty) {
    // Not a terminal (a test, a pipe): every line is a message, and the end of input quits.
    process.stdin.setEncoding("utf8");
    let rest = "";
    process.stdin.on("data", (d) => {
      rest += d;
      let at;
      while ((at = rest.indexOf("\n")) >= 0) {
        enqueue(rest.slice(0, at));
        rest = rest.slice(at + 1);
      }
    });
    process.stdin.on("end", async () => {
      if (rest.trim()) enqueue(rest);
      while (busy || queue.length) await new Promise((r) => setTimeout(r, 50));
      quit();
    });
  }
  return new Promise(() => {}); // runs until /exit
}

