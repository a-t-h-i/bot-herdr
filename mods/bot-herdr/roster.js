// The agents the person set up in Settings: a name, the harness that runs it, a model and an
// effort level. Pure functions, so `npm test` can check them without herdr.

/** Where the roster is kept (herdr shared state: every copy of the mod sees it, and it is saved). */
export const ROSTER_KEY = "bot-herdr.agents";

/**
 * How each harness takes a model and an effort level on its command line. A harness that is not
 * listed gets `--model` and no effort flag; "Extra arguments" in Settings covers the rest.
 */
export const HARNESSES = {
  claude: { model: (m) => ["--model", m], effort: (e) => ["--effort", e], efforts: ["low", "medium", "high", "xhigh", "max"] },
  codex: { model: (m) => ["-m", m], effort: (e) => ["-c", `model_reasoning_effort=${e}`], efforts: ["minimal", "low", "medium", "high", "xhigh"] },
  pi: { model: (m) => ["--model", m], effort: (e) => ["--thinking", e], efforts: ["off", "minimal", "low", "medium", "high", "xhigh"] },
  gemini: { model: (m) => ["-m", m], efforts: [] },
  opencode: { model: (m) => ["-m", m], efforts: [] },
};
const OTHER = { model: (m) => ["--model", m], efforts: [] };

export const harnessOf = (key) => HARNESSES[key] ?? OTHER;

/** The effort levels a harness takes ("" = its own default). */
export const effortsOf = (key) => harnessOf(key).efforts;

/** A name as it is typed after @: lower case, one word. */
export function slug(name) {
  return String(name ?? "").trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "") || "agent";
}

/**
 * The roster as stored, made safe: every entry has an id, a name and a harness; exactly one
 * leads. With nothing stored, one Orchestrator on the first installed harness.
 */
export function roster(stored, known = []) {
  const installed = known.filter((k) => k.installed && k.run?.length);
  const fallback = installed[0]?.key ?? known[0]?.key ?? "claude";
  let list = Array.isArray(stored) ? stored.filter((a) => a && typeof a === "object") : [];
  list = list.map((a, i) => ({
    id: String(a.id ?? `a${i}`),
    name: String(a.name ?? "").trim() || `Agent ${i + 1}`,
    harness: String(a.harness ?? fallback),
    model: String(a.model ?? "").trim(),
    effort: String(a.effort ?? "").trim(),
    args: String(a.args ?? "").trim(),
    lead: Boolean(a.lead),
  }));
  if (!list.length) list = [{ id: "orchestrator", name: "Orchestrator", harness: fallback, model: "", effort: "", args: "", lead: true }];
  const lead = list.find((a) => a.lead) ?? list[0];
  return list.map((a) => ({ ...a, lead: a === lead }));
}

/** The command that starts an agent: its harness's own, then the model, effort and extra arguments. */
export function argvOf(agent, known = []) {
  const base = known.find((k) => k.key === agent.harness)?.run ?? [agent.harness];
  const h = harnessOf(agent.harness);
  return [
    ...base,
    ...(agent.model ? h.model(agent.model) : []),
    ...(agent.effort && h.effort && h.efforts.includes(agent.effort) ? h.effort(agent.effort) : []),
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
  let n = list.length + 1;
  while (list.some((a) => a.name === `Agent ${n}`)) n++;
  return { id: `a${Date.now().toString(36)}`, name: `Agent ${n}`, harness: installed[0]?.key ?? "claude", model: "", effort: "", args: "", lead: false };
}
