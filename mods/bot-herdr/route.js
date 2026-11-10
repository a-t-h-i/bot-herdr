// What the composer means, without any drawing: which `/` or `@` word is being typed, the rows
// the suggestion bubble shows for it, and what a message does when it is sent. Pure functions
// only, so `node --test herdr/test` can check them without herdr.

/** Our own commands. Any other `/word` at the start of a message goes to the agent as typed
 *  (Claude Code's /compact, Codex's /model, ...). */
export const COMMANDS = [
  { name: "new", hint: "Start an agent with this message" },
  { name: "orchestrator", hint: "Choose which agent runs the Orchestrator" },
  { name: "all", hint: "Send to every agent in this space" },
  { name: "stop", hint: "Stop the agent where it is" },
  { name: "peek", hint: "Peek at the agent's terminal" },
  { name: "team", hint: "Tell the agent again how to start child agents" },
];

/** Where the text was edited, from the text before and after: the end of what changed.
 *  The text box does not report its caret, and typing happens where the last edit was. */
export function caretAfterEdit(before, after) {
  let suffix = 0;
  const most = Math.min(before.length, after.length);
  while (suffix < most && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++;
  let prefix = 0;
  while (prefix < most - suffix && before[prefix] === after[prefix]) prefix++;
  return Math.max(prefix, after.length - suffix);
}

/** The `/command` (only at the start of the message) or `@agent` (anywhere, after a space)
 *  being typed at the caret, or null. `start`/`end` are the word's offsets in the text. */
export function triggerAt(text, caret) {
  const head = text.slice(0, caret);
  if (/\S/.test(text.slice(caret, caret + 1))) return null;
  const slash = /^(\s*)\/([a-z0-9:_.-]*)$/i.exec(head);
  if (slash) return { kind: "slash", query: slash[2].toLowerCase(), start: slash[1].length, end: caret };
  const at = /(^|\s)@([a-z0-9:_.+-]*)$/i.exec(head);
  if (at) return { kind: "mention", query: at[2].toLowerCase(), start: caret - at[2].length - 1, end: caret };
  return null;
}

/** First what starts with the query, then what merely contains it. */
function rank(rows, query, key) {
  const q = query.toLowerCase();
  const starts = rows.filter((r) => key(r).toLowerCase().startsWith(q));
  const contains = rows.filter((r) => !starts.includes(r) && key(r).toLowerCase().includes(q));
  return [...starts, ...contains];
}

export function slashRows(query) {
  return rank(COMMANDS.map((c) => ({ id: `/${c.name}`, kind: "command", name: c.name, hint: c.hint, tag: "command" })), query, (r) => r.name);
}

/** A short handle for an agent: its program's key ("claude"), or its name in one word. */
export function handle(agent) {
  const key = agent.program?.key && agent.program.key !== "program" && agent.program.key !== "agent" ? agent.program.key : null;
  return (key ?? agent.app ?? agent.program?.name ?? "agent").toLowerCase().replace(/[^a-z0-9_.-]+/g, "-");
}

/**
 * The `@` rows: running agents (this space first, then the rest), then installed agents that
 * are not running yet, which start in a new tab with the message. `startOnly` (after `/new`)
 * leaves out the running ones.
 */
export function mentionRows(query, { agents = [], children = [], known = [], space = null, mode = null } = {}) {
  const startOnly = mode === "start";
  // After /orchestrator: only the installed agents, to choose which one leads.
  if (mode === "orch") {
    return rank(known.filter((k) => k.installed).map((k) => ({
      id: `orch:${k.key}`, kind: "orch", name: k.key, label: k.name, hint: `Run the Orchestrator on ${k.name}`, tag: "lead", color: k.tile ?? null, key: k.key,
    })), query, (r) => `${r.name} ${r.label}`);
  }
  const lead = orchestratorOf(agents, space);
  const here = [...agents.filter((a) => a.space === space && a === lead), ...agents.filter((a) => a.space === space && a !== lead)];
  const there = agents.filter((a) => a.space !== space);
  // Child agents (started by an agent with `hc run`) sit right under their parent.
  const withKids = (list) => list.flatMap((a) => [a, ...childrenOf(children, a.address)]);
  const running = startOnly ? [] : [...withKids(here), ...withKids(there)].map((a) => a.parent ? ({
    id: `agent:${a.address}`,
    kind: "agent",
    name: a.name || handle(a),
    label: a.name || a.program?.name || "Agent",
    hint: `child of ${a.parentName ?? a.parent}${a.status === "working" ? " · working" : a.status === "blocked" || a.status === "error" ? " · needs you" : ""}`,
    tag: "child",
    color: a.program?.tile ?? null,
    address: a.address,
    space: a.space ?? null,
  }) : ({
    id: `agent:${a.address}`,
    kind: "agent",
    name: a === lead ? "orchestrator" : handle(a),
    label: a === lead ? "Orchestrator" : a.program?.name ?? a.app ?? "Agent",
    hint: a === lead ? `Leads this space · ${a.program?.name ?? "agent"}${a.status === "working" ? " · working" : a.status === "blocked" ? " · needs you" : ""}` : `${a.tab_name ? `tab ${a.tab_name}` : a.address}${a.space !== space ? ` · ${a.space_name}` : ""}${a.status === "working" ? " · working" : a.status === "blocked" ? " · needs you" : ""}`,
    tag: a === lead ? "lead" : a.status === "blocked" ? "waiting" : a.status === "working" ? "busy" : "agent",
    color: a.program?.tile ?? null,
    address: a.address,
    space: a.space,
  }));
  const all = startOnly ? [] : (here.length > 1 ? [{ id: "all", kind: "all", name: "all", label: "Everyone", hint: "Every agent in this space", tag: "command" }] : []);
  const start = known.filter((k) => k.installed).map((k) => ({
    id: `start:${k.key}`,
    kind: "start",
    name: `new-${k.key}`,
    label: k.name,
    hint: `Start ${k.name} in a new tab with this message`,
    tag: "start",
    color: k.tile ?? null,
    run: k.run,
  }));
  return rank([...running, ...all, ...start], query, (r) => `${r.name} ${r.label}`);
}

/** The tab name that makes an agent a space's Orchestrator. Rename any agent's tab to appoint it. */
export const ORCHESTRATOR_TAB = "Orchestrator";

/** The space's Orchestrator: the agent in the tab named "Orchestrator" (the oldest, if several). */
export function orchestratorOf(agents, space) {
  return agents
    .filter((a) => a.space === space && (a.tab_name ?? "").trim().toLowerCase() === ORCHESTRATOR_TAB.toLowerCase())
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))[0] ?? null;
}

/** Every live descendant of `address` among `children` (entries with `parent`), depth first. */
export function childrenOf(children, address, seen = new Set()) {
  if (seen.has(address)) return [];
  seen.add(address);
  return children.filter((k) => k.parent === address).flatMap((k) => [k, ...childrenOf(children, k.address, seen)]);
}

/** The token a picked row leaves in the text: the word as typed, drawn as a chip. */
export function tokenFor(row) {
  if (row.kind === "agent") return { id: row.id, text: `@${row.name}`, label: row.label };
  if (row.kind === "start") return { id: row.id, text: `@${row.name}`, label: `New ${row.label}` };
  return { id: "all", text: "@all", label: "Everyone" };
}

/**
 * What sending does. `content` is the text box's `{text, tokens}`; `ctx` has `agents`, `known`,
 * `space`, `target` (the Orchestrator's address, when one is running), `lead` (the installed agent
 * that would run a new Orchestrator) and `files` (attached paths). A message that names nobody
 * goes to the Orchestrator, starting one if the space has none.
 * Returns `{ error }` or `{ steps }`, each step one of
 *   { do: "send", address, text, files }   paste into a running agent and press Enter
 *   { do: "start", run, name, text, files, role? } a new tab running that agent, with this first
 *                                          message; role "orchestrator" makes it the Orchestrator
 *   { do: "interrupt", address }         the agent's stop key
 *   { do: "peek", address }              terminal.peek
 *   { do: "brief", address }             send the child-agent brief again
 */
export function plan(content, ctx) {
  const tokens = [...(content.tokens ?? [])].sort((a, b) => a.range.start - b.range.start);
  let text = "";
  let at = 0;
  for (const t of tokens) {
    text += content.text.slice(at, t.range.start);
    at = t.range.end;
  }
  text += content.text.slice(at);
  text = text.replace(/[ \t]+\n/g, "\n").replace(/[ \t]{2,}/g, " ").trim();

  // `@all` typed by hand counts like the chip.
  const ids = tokens.map((t) => t.token.id);
  if (/(^|\s)@all(\s|$)/.test(text)) {
    ids.push("all");
    text = text.replace(/(^|\s)@all(?=\s|$)/g, "$1").trim();
  }

  let command = null;
  const slash = /^\/([a-z]+)\b\s*/i.exec(text);
  if (slash && COMMANDS.some((c) => c.name === slash[1].toLowerCase())) {
    command = slash[1].toLowerCase();
    text = text.slice(slash[0].length);
  }
  if (command === "all") ids.push("all");

  const files = ctx.files ?? [];

  const agents = ctx.agents ?? [];
  const recipients = [];
  const starts = [];
  for (const id of ids) {
    if (id === "all") {
      for (const a of agents.filter((a) => a.space === ctx.space)) recipients.push(a.address);
    } else if (id.startsWith("agent:")) recipients.push(id.slice(6));
    else if (id.startsWith("start:")) {
      const k = (ctx.known ?? []).find((k) => k.key === id.slice(6));
      if (k) starts.push(k);
    }
  }
  const unique = [...new Set(recipients)];
  if (!unique.length && !starts.length && ctx.target) unique.push(ctx.target);

  if (command === "stop" || command === "peek" || command === "team") {
    if (!unique.length) return { error: command === "team" ? "No agent here to brief." : "No agent to " + command + " here." };
    const act = { stop: "interrupt", peek: "peek", team: "brief" }[command];
    return { steps: unique.map((address) => ({ do: act, address })) };
  }
  if (command === "new" && !starts.length) return { error: "Pick an agent to start: type @ after /new." };
  if (!text && !files.length) return { error: null, steps: [] };
  if (!unique.length && !starts.length) {
    if (ctx.starting) return { error: "The Orchestrator is starting. Send again in a moment." };
    if (text.startsWith("/")) return { error: "No Orchestrator here yet. Send it a message first, or @ an agent." };
    if (!ctx.lead) return { error: "No agent is installed to run the Orchestrator. Install one, or type @ to pick an agent." };
    return { steps: [{ do: "start", role: "orchestrator", run: ctx.lead.run, name: ctx.lead.name, text, files }] };
  }
  return {
    steps: [
      ...unique.map((address) => ({ do: "send", address, text, files })),
      ...starts.map((k) => ({ do: "start", run: k.run, name: k.name, text, files })),
    ],
  };
}

/** The installed agent that runs a new Orchestrator: the person's choice, else the first installed. */
export function leadAgent(known, chosen) {
  const installed = known.filter((k) => k.installed && k.run?.length);
  return installed.find((k) => k.key === chosen) ?? installed[0] ?? null;
}

/** The text without the newline Enter put in before it was read as "send". */
export function withoutEnter(now, before) {
  if (now.length === before.length + 1) {
    for (let i = 0; i < now.length; i++) {
      if (now[i] !== before[i]) return now[i] === "\n" && now.slice(i + 1) === before.slice(i) ? before : now;
    }
  }
  return now.replace(/\n$/, "");
}

/** The message as the agent gets it: the words, then each attached file's path on a line. */
export function messageText(text, paths) {
  return [text, ...paths].filter(Boolean).join("\n");
}
