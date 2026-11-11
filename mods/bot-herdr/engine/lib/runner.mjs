// Headless turns: each message to an agent runs its harness in its own non-interactive mode
// (Claude Code `-p`, `codex exec`, pi `-p --mode json`, or the Agent Client Protocol for Gemini,
// opencode and Qwen Code), resuming the agent's own session, and turns the harness's JSON
// stream into a few plain events: what it is doing, and its final answer.
//
// The answer comes from the harness itself, so the chat always has it; the agent needn't
// remember to write a reply. The session is the harness's own, so `/cli` in the agent's terminal
// opens the same conversation in the full interactive CLI.
//
// What an agent may do without asking is the person's choice (Settings → Agent access):
//   standard (the default)  edit files in the project, read and search, run the team's own
//                           tools (bh, which also runs the project's checks, and hc), read-only
//                           git, and any command the person listed under "Also allow"; other
//                           commands are refused and the agent says so. Codex runs in its
//                           workspace-write sandbox.
//   full                    anything, with no prompts: only for a machine or folder the person
//                           is happy to let agents run free in
// pi and Oh My Pi have no permission system of their own: they run as they would in a terminal.

import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { existsSync, readFileSync, statSync } from "node:fs";
import { HEADLESS, argvOf, effortsOf, headless } from "../../roster.js";
import { BH, DATA, ensureDir } from "./core.mjs";

export { HEADLESS, headless };
export const ACCESS = ["standard", "full"];

const WIN = process.platform === "win32";

/** An argument for cmd.exe (Windows runs npm's .cmd shims through it). */
function winQuote(a) {
  return /^[\w@%+=:,./\\-]+$/.test(a) ? a : `"${String(a).replace(/"/g, '""')}"`;
}

// ── Who agents run as ──────────────────────────────────────────────────────────────────────
// Started as root, herdr doesn't hand root to its agents: each harness runs as a normal user, so
// its files, sign-ins (~/.claude and the like) and permissions are that user's. The user is
// BH_AGENT_USER when set, else the one sudo was run by, else the owner of the project folder.
// BH_AGENT_USER=root keeps them as root.

const isRoot = () => !WIN && process.getuid?.() === 0;

/** A user's passwd entry: { name, uid, gid, home, shell }, or null. */
export function userEntry(nameOrUid, passwd = null) {
  let text = passwd;
  if (text === null) {
    try {
      text = readFileSync("/etc/passwd", "utf8");
    } catch {
      text = "";
    }
  }
  for (const line of text.split("\n")) {
    const [name, , uid, gid, , home, shell] = line.split(":");
    if (!name || uid === undefined) continue;
    if (name === String(nameOrUid) || uid === String(nameOrUid)) return { name, uid: Number(uid), gid: Number(gid), home, shell };
  }
  return null;
}

/** The groups a user is a member of in /etc/group, beyond their own. */
function memberGroups(name) {
  try {
    return readFileSync("/etc/group", "utf8").split("\n").map((l) => l.split(":"))
      .filter((f) => f.length >= 4 && f[3].split(",").includes(name)).map((f) => Number(f[2])).filter(Number.isFinite);
  } catch {
    return [];
  }
}

const userCache = new Map();

/**
 * The user agents run as when herdr is root: { name, uid, gid, home, groups }, or null to run
 * them as herdr itself (herdr isn't root, BH_AGENT_USER=root, or no user to hand them to).
 */
export function agentUser(cwd = process.cwd()) {
  if (!isRoot()) return null;
  const wanted = process.env.BH_AGENT_USER || process.env.SUDO_USER || "";
  const key = `${wanted}|${cwd}`;
  if (userCache.has(key)) return userCache.get(key);
  let u = null;
  if (wanted) u = userEntry(wanted);
  else {
    let owner = null;
    try {
      owner = statSync(cwd).uid;
    } catch {}
    if (owner) u = userEntry(owner);
  }
  let found = null;
  if (u && u.uid !== 0) {
    // Its own groups, and the ones herdr was given: on Android those carry network access
    // (inet, 3003) and appear in no /etc/group, so a switch that rebuilt them from there would
    // leave the agent offline.
    const groups = [...new Set([u.gid, ...memberGroups(u.name), ...(process.getgroups?.() ?? [])])].filter((g) => g !== 0);
    found = { ...u, groups, how: switcher(u, groups) };
    if (!found.how) found = null;
  }
  userCache.set(key, found);
  return found;
}

/** How to become the user: setpriv (keeps the groups), runuser, or node's own uid switch. Tried once. */
function switcher(u, groups) {
  const setpriv = ["setpriv", `--reuid=${u.uid}`, `--regid=${u.gid}`, `--groups=${groups.join(",")}`, "--"];
  const runuser = ["runuser", "-u", u.name, "--"];
  for (const prefix of [setpriv, runuser]) {
    const r = spawnSync(prefix[0], [...prefix.slice(1), "id", "-u"], { encoding: "utf8", timeout: 5000 });
    if (r.status === 0 && String(r.stdout).trim() === String(u.uid)) return { prefix };
  }
  const r = spawnSync("id", ["-u"], { uid: u.uid, gid: u.gid, encoding: "utf8", timeout: 5000 });
  if (r.status === 0 && String(r.stdout).trim() === String(u.uid)) return { uid: u.uid, gid: u.gid };
  return null;
}

/** Whether a harness started in `cwd` runs as root, where Claude Code refuses to bypass its permissions. */
export const asRoot = (cwd = process.cwd()) => isRoot() && !agentUser(cwd);

/** Starts a program, with Windows' .cmd shims working. Long text goes over stdin or in files. */
export function launch(argv, { cwd, env = process.env, stdio = ["pipe", "pipe", "pipe"] } = {}) {
  const [cmd, ...args] = argv;
  if (WIN) return spawn([cmd, ...args].map(winQuote).join(" "), { cwd, env, stdio, shell: true, windowsHide: true });
  const u = agentUser(cwd ?? process.cwd());
  if (!u) return spawn(cmd, args, { cwd, env, stdio });
  // The user's own home and name, so the harness finds its sign-in and settings there.
  const as = { ...env, HOME: u.home, USER: u.name, LOGNAME: u.name };
  delete as.SUDO_USER;
  delete as.SUDO_UID;
  delete as.SUDO_GID;
  delete as.SUDO_COMMAND;
  if (u.how.prefix) return spawn(u.how.prefix[0], [...u.how.prefix.slice(1), cmd, ...args], { cwd, env: as, stdio });
  return spawn(cmd, args, { cwd, env: as, stdio, uid: u.how.uid, gid: u.how.gid });
}

/** Ends a program and whatever it started. */
export function stop(child) {
  if (!child || child.exitCode !== null) return;
  if (WIN) {
    // taskkill ends the whole tree. Its home is System32, so a bare PATH can't hide it.
    const exe = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe");
    const kill = existsSync(exe) ? spawn(exe, ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true }) : null;
    if (kill) kill.on("error", () => child.kill());
    else child.kill();
  } else child.kill("SIGTERM");
}

/** One short line for a tool call: "Read src/app.tsx", "Run npm test". */
export function toolLine(name, input = {}) {
  const n = String(name ?? "tool");
  const path = input.file_path ?? input.path ?? input.filePath ?? input.notebook_path ?? (Array.isArray(input.locations) ? input.locations[0]?.path : undefined);
  const command = input.command ?? input.cmd;
  const query = input.pattern ?? input.query ?? input.url ?? input.description;
  const what = (typeof command === "string" && command) || (typeof path === "string" && path) || (typeof query === "string" && query) || "";
  const verb = { Read: "Read", read: "Read", Edit: "Edit", edit: "Edit", MultiEdit: "Edit", Write: "Write", write: "Write", Bash: "Run", bash: "Run", shell: "Run", Grep: "Search", grep: "Search", Glob: "Find", find: "Find", ls: "List", WebFetch: "Fetch", WebSearch: "Search the web", TodoWrite: "Update its plan", Task: "Start a subagent" }[n] ?? n;
  return `${verb}${what ? ` ${String(what).split("\n")[0].slice(0, 140)}` : ""}`;
}

/**
 * Claude Code's own question tool (AskUserQuestion) as bh ask's questions:
 * { questions: [{ question, header, options: [{ label, description }], multiSelect }] }.
 * Run headless it can't show its own prompt, so the chat shows the questions instead.
 */
export function fromAskTool(input) {
  const list = Array.isArray(input?.questions) ? input.questions : [];
  const questions = list
    .filter((q) => q && typeof q.question === "string")
    .map((q) => ({
      seat: null,
      text: q.question,
      multi: Boolean(q.multiSelect),
      options: (Array.isArray(q.options) ? q.options : []).filter((o) => o?.label).map((o) => ({
        label: String(o.label).replace(/\s*\(Recommended\)\s*/i, "").trim(),
        meaning: String(o.description ?? ""),
        recommended: /\(Recommended\)/i.test(String(o.label)),
        mockup: null,
      })),
    }));
  if (!questions.length) return null;
  return { title: list[0]?.header || "Questions", questions };
}

/** Reads a child's stdout as JSON lines. */
function lines(child, onLine) {
  let buf = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buf += chunk;
    let at;
    while ((at = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, at).trim();
      buf = buf.slice(at + 1);
      if (!line) continue;
      try {
        onLine(JSON.parse(line));
      } catch {
        // not JSON: a harness's own notice
      }
    }
  });
}

function collectErr(child) {
  let err = "";
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (d) => {
    err = (err + d).slice(-4000);
  });
  return () => err.trim();
}

const textOf = (content) => (Array.isArray(content) ? content : []).filter((b) => b?.type === "text" && typeof b.text === "string").map((b) => b.text).join("");
const extra = (agent) => (agent.args ? agent.args.split(/\s+/).filter(Boolean) : []);

// ── One-shot harnesses: a process per turn ─────────────────────────────────────────────────

/** Commands every agent may run in standard access: the team's tools and read-only git. */
export function standardCommands() {
  const bh = BH.replace(/\\/g, "/");
  return [`node "${bh}"`, `node ${bh}`, "hc", "git status", "git diff", "git log", "git show"];
}

/**
 * Claude Code's permissions: edits, the team's tools and what the person allowed; everything when
 * chosen. When it would run as root (herdr is root and no user to hand it to, or BH_AGENT_USER=root),
 * Claude Code won't start with bypassPermissions at all, so full access falls back to standard
 * there rather than failing every turn.
 */
export function claudeAccess(access, allow = [], { root = asRoot() } = {}) {
  if (access === "full" && !root) return ["--permission-mode", "bypassPermissions"];
  const commands = [...standardCommands(), ...allow].map((c) => `Bash(${c}:*)`);
  const tools = ["Read", "Edit", "Write", "MultiEdit", "NotebookEdit", "Glob", "Grep", "LS", "TodoWrite", "WebSearch", "WebFetch", ...commands];
  return ["--permission-mode", "acceptEdits", "--allowedTools", tools.join(",")];
}

/** Claude Code: `claude -p --output-format stream-json`, the brief as an appended system prompt. */
function claudeTurn({ agent, known, state, briefFile, prompt, cwd, on, access, allow }) {
  const first = !state.session;
  const id = state.session ?? randomUUID();
  const argv = [
    ...argvOf(agent, known),
    "-p", "--output-format", "stream-json", "--verbose",
    ...claudeAccess(access, allow, { root: asRoot(cwd) }),
    ...(first ? ["--session-id", id, "--append-system-prompt-file", briefFile] : ["--resume", id]),
  ];
  return oneShot(argv, prompt, cwd, (event, turn) => {
    if (event.type === "assistant") {
      for (const b of event.message?.content ?? []) {
        if (b.type === "tool_use") {
          // Its question tool can't prompt headless: the card is the question, and the turn ends
          // so the model waits for the answers (the next message) instead of deciding alone.
          const asked = b.name === "AskUserQuestion" ? fromAskTool(b.input) : null;
          if (asked) {
            on({ kind: "ask", ...asked });
            turn.asked = true;
            return;
          }
          on({ kind: "tool", line: toolLine(b.name, b.input) });
          // bh ask: the command writes the card itself, so the turn must outlive the call; it
          // ends when the call's result arrives (the user event below), not when it starts.
          if (asksPerson(b.name, b.input)) turn.askIds = [...(turn.askIds ?? []), b.id];
        }
        if (b.type === "text" && b.text?.trim()) {
          turn.text = b.text;
          on({ kind: "text", text: b.text });
        }
      }
    } else if (event.type === "user") {
      // The result of a bh ask call: the card is made, so the turn ends here.
      for (const b of event.message?.content ?? []) {
        if (b.type === "tool_result" && (turn.askIds ?? []).includes(b.tool_use_id)) turn.asked = true;
      }
    } else if (event.type === "result") {
      if (event.is_error || (event.subtype && event.subtype !== "success")) turn.error = event.result?.trim() || (event.errors ?? []).join("; ") || `stopped: ${event.subtype}`;
      else if (typeof event.result === "string" && event.result.trim()) turn.text = event.result;
    }
  }, { session: id });
}

/** Codex: `codex exec --json`, resumed by thread id; the brief leads the first prompt. */
function codexTurn({ agent, known, state, brief, prompt, cwd, on, access }) {
  const run = known.find((k) => k.key === agent.harness)?.run ?? ["codex"];
  const effort = agent.effort && effortsOf("codex", agent.model).includes(agent.effort) ? ["-c", `model_reasoning_effort=${agent.effort}`] : [];
  const argv = [
    ...run, "exec", "--json", "--skip-git-repo-check",
    "-s", access === "full" ? "danger-full-access" : "workspace-write", "-c", "approval_policy=never",
    ...(agent.model ? ["-m", agent.model] : []), ...effort, ...extra(agent),
    ...(state.session ? ["resume", state.session] : []), "-",
  ];
  const text = state.session ? prompt : `${brief}\n\n${prompt}`;
  return oneShot(argv, text, cwd, (event, turn) => {
    if (event.type === "thread.started" && event.thread_id) turn.session = event.thread_id;
    const item = event.item ?? {};
    if (event.type === "item.started" && item.type === "command_execution") {
      on({ kind: "tool", line: toolLine("bash", { command: item.command }) });
      // bh ask: the command writes the card itself; the turn ends when the command completes.
      if (asksPerson("bash", { command: item.command })) turn.askCmd = item.command;
    }
    if (event.type === "item.completed" && item.type === "command_execution" && item.command && item.command === turn.askCmd) turn.asked = true;
    if (event.type === "item.completed") {
      if (item.type === "agent_message" && item.text?.trim()) {
        turn.text = item.text;
        on({ kind: "text", text: item.text });
      }
      if (item.type === "file_change") for (const ch of item.changes ?? []) on({ kind: "tool", line: toolLine(ch.kind === "add" ? "write" : "edit", { path: ch.path }) });
      if (item.type === "web_search") on({ kind: "tool", line: toolLine("WebSearch", { query: item.query }) });
      if (item.type === "mcp_tool_call") on({ kind: "tool", line: `${item.server ?? "mcp"}: ${item.tool ?? "tool"}` });
    }
    if (event.type === "turn.failed") turn.error = event.error?.message ?? "Codex reported a failed turn";
  }, { session: state.session });
}

/** pi and Oh My Pi: `-p --mode json`, one session folder per agent; the brief as a system prompt file. */
function piTurn({ agent, known, state, key, briefFile, prompt, cwd, on }) {
  const dir = ensureDir(join(DATA, "sessions", key));
  const argv = [...argvOf(agent, known), "-p", "--mode", "json", "--session-dir", dir, "--append-system-prompt", briefFile, ...(state.session ? ["--continue"] : [])];
  return oneShot(argv, prompt, cwd, (event, turn) => {
    if (event.type === "session" && event.id) turn.session = event.id;
    if (event.type === "tool_execution_start") {
      on({ kind: "tool", line: toolLine(event.toolName, event.args ?? {}) });
      // bh ask: the command writes the card itself; the turn ends when the tool call ends.
      if (asksPerson(event.toolName, event.args ?? {})) turn.askTool = { id: event.toolCallId ?? null, name: event.toolName };
    }
    if (event.type === "tool_execution_end" && turn.askTool && (turn.askTool.id !== null ? event.toolCallId === turn.askTool.id : event.toolName === turn.askTool.name)) turn.asked = true;
    if (event.type === "message_end" && event.message?.role === "assistant") {
      const text = textOf(event.message.content);
      if (text.trim()) {
        turn.text = text;
        on({ kind: "text", text });
      }
      if (event.message.stopReason === "error") turn.error = event.message.errorMessage || "the model returned an error";
    }
  }, { session: state.session ?? "pi" });
}

function asksPerson(name, input = {}) {
  if (name === "AskUserQuestion") return true;
  const command = input.command ?? input.cmd;
  if (typeof command !== "string") return false;
  const cmd = command.replace(/\\/g, "/");
  return /\bbh(?:\.mjs)?["']?\s+ask\b/.test(cmd) || /\/bh\.mjs["']?\s+ask\b/.test(cmd);
}

/** Runs one process for one turn: the prompt on stdin, JSON lines out. */
function oneShot(argv, prompt, cwd, handle, init = {}) {
  const child = launch(argv, { cwd });
  const turn = { text: "", error: null, session: init.session ?? null, cancelled: false, asked: false };
  const err = collectErr(child);
  lines(child, (event) => {
    if (turn.asked) return;
    handle(event, turn);
    if (turn.asked) stop(child); // it asked the person: the turn ends here
  });
  child.stdin.on("error", () => {});
  child.stdin.end(prompt);
  const done = new Promise((resolve) => {
    child.on("error", (e) => resolve({ ...turn, error: `couldn't start ${argv[0]}: ${e.message}` }));
    child.on("close", (code) => {
      if (turn.cancelled || turn.asked) return resolve(turn);
      if (code !== 0 && !turn.text && !turn.error) turn.error = err().split("\n").slice(-6).join("\n") || `${argv[0]} exited with ${code}`;
      resolve(turn);
    });
  });
  return {
    done,
    cancel: () => {
      turn.cancelled = true;
      stop(child);
    },
  };
}

// ── ACP harnesses: one process for the agent's whole life ──────────────────────────────────

/**
 * Whether an ACP tool call may run without asking, by access level: reading, searching, editing
 * and fetching always; a command when it starts with one the team or the person allowed.
 */
export function acpAllowed(kind, access, { command = "", allow = [] } = {}) {
  if (access === "full") return true;
  if (["read", "search", "think", "edit", "fetch"].includes(String(kind ?? ""))) return true;
  if (kind !== "execute" || typeof command !== "string") return false;
  const cmd = command.trim().replace(/\\/g, "/");
  if (/[;&|`$<>]|\n/.test(cmd)) return false; // one plain command, nothing chained
  return [...standardCommands(), ...allow].some((p) => cmd === p || cmd.startsWith(`${p} `));
}

/** A JSON-RPC session with an Agent Client Protocol agent (Gemini CLI, opencode, Qwen Code). */
export class Acp {
  constructor({ agent, known, cwd, access, allow = [] }) {
    const run = known.find((k) => k.key === agent.harness)?.run ?? [agent.harness];
    this.argv = [...run, ...HEADLESS[agent.harness].acp, ...extra(agent)];
    this.agent = agent;
    this.harnessName = known.find((k) => k.key === agent.harness)?.name ?? agent.harness;
    this.newResult = null; // what session/new offered: config options and models
    this.modelSet = null; // the model the session is running (set once it takes)
    this.cwd = cwd;
    this.access = access;
    this.allow = allow;
    this.next = 1;
    this.pending = new Map();
    this.child = null;
    this.session = null;
    this.text = "";
    this.block = "";
    this.asked = false;
    this.askCall = null; // a bh ask tool call in flight: the turn ends when it completes
    this.on = () => {};
  }

  send(message) {
    this.child?.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
  }

  request(method, params) {
    const id = this.next++;
    this.send({ id, method, params });
    return new Promise((resolve) => this.pending.set(id, resolve));
  }

  async start() {
    this.child = launch(this.argv, { cwd: this.cwd });
    this.err = collectErr(this.child);
    this.child.stdin.on("error", () => {});
    this.child.on("close", () => {
      for (const resolve of this.pending.values()) resolve({ error: { message: this.err() || "the agent stopped" } });
      this.pending.clear();
      this.child = null;
      this.session = null;
    });
    lines(this.child, (m) => this.message(m));
    const init = await this.request("initialize", { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false }, clientInfo: { name: "bot-herdr", version: "1" } });
    if (init.error) throw new Error(init.error.message ?? "the agent didn't start");
    const made = await this.request("session/new", { cwd: this.cwd, mcpServers: [] });
    if (made.error || typeof made.result?.sessionId !== "string") throw new Error(made.error?.message ?? "the agent didn't open a session (sign in to it once in a terminal)");
    this.session = made.result.sessionId;
    this.newResult = made.result;
    this.modelSet = null; // a fresh session: the chosen model goes on before the first prompt
  }

  /**
   * Puts the agent's chosen model on the session. The standard way is the model config option
   * (every current ACP agent takes it); an older one that listed `models` instead takes
   * session/set_model. One that offered neither gets both, and a refusal is said out loud,
   * so a harness silently running its default never surprises anyone.
   */
  async pickModel() {
    if (!this.agent.model || this.modelSet === this.agent.model) return;
    const made = this.newResult ?? {};
    const option = (Array.isArray(made.configOptions) ? made.configOptions : []).find((o) => o.category === "model");
    const listed = Array.isArray(made.models) && made.models.length > 0;
    let r;
    if (option) r = await this.request("session/set_config_option", { sessionId: this.session, configId: option.id, value: this.agent.model });
    else if (listed) r = await this.request("session/set_model", { sessionId: this.session, modelId: this.agent.model });
    else {
      r = await this.request("session/set_config_option", { sessionId: this.session, configId: "model", value: this.agent.model });
      if (r.error) r = await this.request("session/set_model", { sessionId: this.session, modelId: this.agent.model });
    }
    this.modelSet = this.agent.model; // asked once per model: a refused harness keeps its default
    if (r.error) this.on({ kind: "tool", line: `Model ${this.agent.model} not set (${r.error.message ?? "refused"}): ${this.harnessName} runs its default` });
  }

  /** A chunk of the agent's words: the reply is the last block that had any. */
  said(chunk) {
    this.block += chunk;
    if (this.block.trim()) this.text = this.block;
  }

  message(m) {
    if (m.method === "session/update") {
      const u = m.params?.update ?? {};
      if (u.sessionUpdate === "agent_message_chunk" && u.content?.type === "text") this.said(u.content.text);
      if (u.sessionUpdate === "tool_call") {
        this.block = ""; // what it says after a tool call is a new block; the last non-empty block stays the reply
        const input = { ...(u.rawInput ?? {}), locations: u.locations };
        this.on({ kind: "tool", line: toolLine(u.title ?? u.kind ?? "tool", input) });
        // bh ask: the command writes the card itself; let it run, and end the turn when it's done.
        if (asksPerson(u.title ?? u.kind ?? "tool", input) && u.toolCallId !== undefined) this.askCall = u.toolCallId;
      }
      if (u.sessionUpdate === "tool_call_update" && u.toolCallId === this.askCall && u.status === "completed") {
        this.asked = true; // the card is made: stop the agent here, so it waits for the answers
        this.askCall = null;
        if (this.session) this.send({ method: "session/cancel", params: { sessionId: this.session } });
      }
      return;
    }
    if (m.method === "session/request_permission" && m.id !== undefined) {
      const options = m.params?.options ?? [];
      const call = m.params?.toolCall ?? {};
      const command = call.rawInput?.command ?? call.rawInput?.cmd;
      const textCmd = Array.isArray(command) ? command.join(" ") : command;
      const asks = asksPerson(call.title ?? call.kind ?? "tool", { ...(call.rawInput ?? {}), command: textCmd });
      // A bh ask call is allowed at every access level: its card is the prompt, and the turn
      // ends only once the command has run and written the card (the tool_call_update above).
      const allow = acpAllowed(call.kind, this.access, { command: textCmd, allow: this.allow }) || asks;
      if (asks && call.toolCallId !== undefined) this.askCall = call.toolCallId;
      const pick = allow
        ? options.find((o) => o.kind === "allow_once") ?? options.find((o) => o.kind === "allow_always")
        : options.find((o) => o.kind === "reject_once") ?? options.find((o) => o.kind === "reject_always");
      this.send({ id: m.id, result: { outcome: pick ? { outcome: "selected", optionId: pick.optionId } : { outcome: "cancelled" } } });
      if (!allow) this.on({ kind: "tool", line: `Refused (Agent access is standard): ${m.params?.toolCall?.title ?? m.params?.toolCall?.kind ?? "a tool"}` });
      return;
    }
    if (m.method && m.id !== undefined) {
      this.send({ id: m.id, error: { code: -32601, message: `Method not found: ${m.method}` } });
      return;
    }
    if (typeof m.id === "number" && this.pending.has(m.id)) {
      const resolve = this.pending.get(m.id);
      this.pending.delete(m.id);
      resolve(m);
    }
  }

  turn({ brief, prompt, on }) {
    this.on = on;
    this.text = "";
    this.block = "";
    this.asked = false;
    this.askCall = null;
    const done = (async () => {
      try {
        const first = !this.child;
        if (first) await this.start();
        await this.pickModel(); // every turn: a model changed in Settings reaches a live session too
        const r = await this.request("session/prompt", { sessionId: this.session, prompt: [{ type: "text", text: first ? `${brief}\n\n${prompt}` : prompt }] });
        if (this.asked) return { text: this.text, asked: true, error: null, session: this.session };
        if (r.error) return { text: this.text, error: r.error.message ?? "the agent refused the prompt", session: this.session };
        if (r.result?.stopReason === "cancelled") return { text: this.text, cancelled: true, session: this.session };
        if (this.text.trim()) on({ kind: "text", text: this.text });
        return { text: this.text, error: null, session: this.session };
      } catch (e) {
        return { text: "", error: e.message, session: null };
      }
    })();
    return {
      done,
      cancel: () => {
        if (this.session) this.send({ method: "session/cancel", params: { sessionId: this.session } });
      },
    };
  }

  close() {
    stop(this.child);
  }
}

/**
 * One turn. `state` is the agent's saved { session }; `key` names its session folder; `brief`
 * the role brief (and `briefFile` the same text on disk); `access` standard or full, and
 * `allow` the commands the person added to standard. Returns
 * { done, cancel }: `done` resolves to { text, error, session, cancelled }.
 */
export function turn(opts) {
  const h = opts.agent.harness;
  if (h === "claude") return claudeTurn(opts);
  if (h === "codex") return codexTurn(opts);
  if (h === "pi" || h === "omp") return piTurn(opts);
  if (HEADLESS[h]?.acp) {
    opts.acp.current ??= new Acp(opts);
    opts.acp.current.access = opts.access;
    opts.acp.current.allow = opts.allow ?? [];
    return opts.acp.current.turn(opts);
  }
  throw new Error(`${h} has no headless mode here.`);
}

/** The interactive CLI on the same conversation, for `/cli`. */
export function interactive(agent, known, state, key) {
  const argv = argvOf(agent, known);
  if (agent.harness === "claude" && state.session) return [...argv, "--resume", state.session];
  if (agent.harness === "codex" && state.session) {
    const run = known.find((k) => k.key === "codex")?.run ?? ["codex"];
    return [...run, "resume", state.session];
  }
  if ((agent.harness === "pi" || agent.harness === "omp") && state.session) return [...argv, "--session-dir", join(DATA, "sessions", key), "--continue"];
  return argv;
}

