// The team: the six roles (Orchestrator, Design, Dev, QA, Research, Scout) and any agents the
// person adds, each on a harness with a model and an effort level. Pure functions, shared by the
// mod and the bh tool, so `npm test` can check them without herdr.

import { MODELS } from "./models.js";

/** Where the roster is kept (herdr shared state: every copy of the mod sees it, and it is saved). */
export const ROSTER_KEY = "bot-herdr.agents";

/** The roles every space has. `edits`: whether the role may change files. */
export const ROLES = [
  { role: "orchestrator", name: "Orchestrator", aliases: ["master", "oracle", "lead"], edits: true, does: "Plans, hands work to the others, checks it and reports back. Gets every message that names no one." },
  { role: "design", name: "Design", aliases: ["frontend", "designer"], edits: true, does: "UI, frontend logic, styling and accessibility." },
  { role: "dev", name: "Dev", aliases: ["backend"], edits: true, does: "Backend, APIs, data, security and integrations." },
  { role: "qa", name: "QA", aliases: ["test", "tests"], edits: true, does: "The quality gate: review and tests, as deep as the change's risk." },
  { role: "research", name: "Research", aliases: ["researcher"], edits: false, does: "Outside facts, with sources." },
  { role: "scout", name: "Scout", aliases: [], edits: false, does: "Reads the code and explains how something works." },
];

export const roleOf = (key) => ROLES.find((r) => r.role === key) ?? null;

/**
 * How each harness takes a model and an effort level on its command line. A harness that is not
 * listed gets `--model` and no effort flag; "Extra arguments" in Settings covers the rest.
 */
export const HARNESSES = {
  claude: { model: (m) => ["--model", m], effort: (e) => ["--effort", e], efforts: ["low", "medium", "high", "xhigh", "max"] },
  codex: { model: (m) => ["-m", m], effort: (e) => ["-c", `model_reasoning_effort=${e}`], efforts: ["minimal", "low", "medium", "high", "xhigh"] },
  pi: { model: (m) => ["--model", m], effort: (e) => ["--thinking", e], efforts: ["off", "minimal", "low", "medium", "high", "xhigh"], lists: ["--list-models"] },
  omp: { model: (m) => ["--model", m], effort: (e) => ["--thinking", e], efforts: ["off", "minimal", "low", "medium", "high", "xhigh"], lists: ["--list-models"] },
  gemini: { model: (m) => ["-m", m], efforts: [] },
  qwen: { model: (m) => ["-m", m], efforts: [] },
  opencode: { model: (m) => ["-m", m], efforts: [] },
};
const OTHER = { model: (m) => ["--model", m], efforts: [] };

/**
 * Harnesses bot-herdr can run headless (engine/lib/runner.mjs), with the name each reports to
 * herdr (OSC 7501 `app`, which picks its icon) and, for Agent Client Protocol ones, the
 * arguments that start that mode.
 */
export const HEADLESS = {
  claude: { app: "claude-code" },
  codex: { app: "codex" },
  pi: { app: "pi" },
  omp: { app: "oh-my-pi" },
  gemini: { app: "gemini", acp: ["--acp"] },
  opencode: { app: "opencode", acp: ["acp"] },
  qwen: { app: "qwen-code", acp: ["--acp"] },
};
export const headless = (key) => Object.hasOwn(HEADLESS, key);

/**
 * Harnesses that never report their status to herdr (no OSC 7501), so herdr's agents() leaves
 * them out. Their terminals are agents here all the same (live.js): idle, as far as anyone can tell.
 */
export const QUIET = new Set(["antigravity"]);

/**
 * CLIs that run a bare prompt once and exit, by command name: they take the first message of an
 * interactive session after this flag instead.
 */
export const PROMPT_FLAG = { agy: "-i", gemini: "-i", qwen: "-i" };

const command = (argv) => String(argv?.[0] ?? "").split(/[\\/]/).pop().replace(/\.(exe|cmd|bat|ps1)$/i, "").toLowerCase();

/** The flag a command's first message goes after, or null when it takes it as a bare argument. */
export const promptFlag = (argv) => PROMPT_FLAG[command(argv)] ?? null;

/** The command, ready for its first message to go last (herdr's tab.new and `hc run` add it there). */
export function withPrompt(argv, text) {
  const flag = promptFlag(argv);
  if (!flag || !String(text ?? "").trim() || argv.at(-1) === flag) return argv;
  return [...argv, flag];
}

/** Where Settings tells the chat whether agents run headless (the default) or as their CLI. */
export const HEADLESS_KEY = "bot-herdr.headless";

export const harnessOf = (key) => HARNESSES[key] ?? OTHER;

/** The models a harness lists, current ones first. Empty when we don't know them (type one). */
export const modelsOf = (key) => MODELS[key] ?? [];

/** The effort levels a harness (and, for Claude Code, the chosen model) takes. "" = its default. */
export function effortsOf(key, model = "") {
  const listed = modelsOf(key).find((m) => m.id === model);
  if (listed?.efforts) return listed.efforts;
  return harnessOf(key).efforts;
}

/** A name as it is typed after @: lower case, one word. */
export function slug(name) {
  return String(name ?? "").trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "") || "agent";
}

const clean = (a, i, fallback) => ({
  id: String(a.id ?? `a${i}`),
  role: String(a.role ?? "custom"),
  name: String(a.name ?? "").trim() || `Agent ${i + 1}`,
  harness: String(a.harness ?? fallback),
  model: String(a.model ?? "").trim(),
  effort: String(a.effort ?? "").trim(),
  args: String(a.args ?? "").trim(),
  lead: Boolean(a.lead),
});

/**
 * The roster as stored, made whole: the six roles in order (each with what was saved for it),
 * then the person's own agents. The Orchestrator leads. With nothing stored, every role runs on
 * the first installed harness at its default model.
 */
export function roster(stored, known = []) {
  const installed = known.filter((k) => k.installed && k.run?.length);
  const fallback = installed[0]?.key ?? known[0]?.key ?? "claude";
  const list = (Array.isArray(stored) ? stored : []).filter((a) => a && typeof a === "object").map((a, i) => clean(a, i, fallback));
  const used = new Set();
  const take = (test) => {
    const found = list.find((a) => !used.has(a) && test(a));
    if (found) used.add(found);
    return found;
  };
  const stock = ROLES.map((r) => {
    // A roster from before the roles: its lead is the Orchestrator.
    const saved = take((a) => a.role === r.role) ?? (r.role === "orchestrator" ? take((a) => a.role === "custom" && (a.id === "orchestrator" || a.lead)) : null);
    return { ...(saved ?? { id: r.role, harness: fallback, model: "", effort: "", args: "" }), role: r.role, name: r.name, lead: r.role === "orchestrator" };
  });
  const own = list.filter((a) => !used.has(a)).map((a) => ({ ...a, role: "custom", lead: false }));
  return [...stock, ...own];
}

/** The roster entry a name, @handle or alias points at ("frontend" is Design). */
export function findAgent(list, word) {
  const w = slug(String(word ?? "").replace(/^@/, ""));
  return list.find((a) => slug(a.name) === w) ?? list.find((a) => roleOf(a.role)?.aliases.includes(w)) ?? null;
}

/** The command that starts an agent: its harness's own, then the model, effort and extra arguments. */
export function argvOf(agent, known = [], over = {}) {
  const base = known.find((k) => k.key === agent.harness)?.run ?? [agent.harness];
  const h = harnessOf(agent.harness);
  const model = over.model ?? agent.model;
  const effort = over.effort ?? agent.effort;
  return [
    ...base,
    ...(model ? h.model(model) : []),
    ...(effort && h.effort && effortsOf(agent.harness, model).includes(effort) ? h.effort(effort) : []),
    ...(agent.args ? agent.args.split(/\s+/).filter(Boolean) : []),
  ];
}

/** Whether the harness an agent names is installed here. */
export function runnable(agent, known = []) {
  return known.some((k) => k.key === agent.harness && k.installed);
}

/** The running agent that is this roster entry: the one in the tab that carries its name. */
export function runningAs(agent, agents, space) {
  const name = agent.name.trim().toLowerCase();
  return agents
    .filter((a) => a.space === space && (a.tab_name ?? "").trim().toLowerCase() === name)
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))[0] ?? null;
}

/** A new entry for Settings' "Add agent". */
export function blank(list, known = []) {
  const installed = known.filter((k) => k.installed);
  let n = 1;
  while (list.some((a) => a.name === `Agent ${n}`)) n++;
  return { id: `a${Date.now().toString(36)}`, role: "custom", name: `Agent ${n}`, harness: installed[0]?.key ?? "claude", model: "", effort: "", args: "", lead: false };
}

/** Parses `pi --list-models`-style output into model ids (provider/model), best effort. */
export function parseModelList(text) {
  const out = [];
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const cols = line.trim().split(/\s{2,}|\t/).filter(Boolean);
    if (cols.length < 2 || /^provider$/i.test(cols[0]) || /^-+$/.test(cols[0])) continue;
    const id = cols[1].includes("/") ? cols[1] : `${cols[0]}/${cols[1]}`;
    if (/^[\w.-]+\/[\w.:@-]+$/.test(id) && !out.includes(id)) out.push(id);
  }
  return out;
}
