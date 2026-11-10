// The classifier: a fast model that makes the small decisions so the large ones don't spend
// tokens on them. Who answers a chat message, a task's size and kind, how hard a step is (effort
// routing), how much QA a change warrants, which shared scripts a step needs.
//
// It calls Jev (TypeSafe's classifier, "System One" API) on OpenCode Zen (free while it lasts),
// TypeSafe, OpenRouter or the Vercel AI Gateway. Off until turned on in Settings; every decision
// falls back to plain rules when it is off or fails.

import { join } from "node:path";
import { DATA, readJson } from "../lib/core.mjs";
import { choice, choiceOf, noul, score, scoreOf, systemOne, yesOf } from "./client.mjs";
import { clip } from "./limits.mjs";
import { assessQaRisk } from "./qa-risk.mjs";
import { askHarness, canClassify, CLASSIFIER_HARNESSES } from "./harness.mjs";

export { CLASSIFIER_HARNESSES, canClassify };

export const HOSTS = {
  opencode: { label: "OpenCode Zen", env: "OPENCODE_API_KEY", baseUrl: "https://opencode.ai/zen", model: "jev-1.13-free" },
  typesafe: { label: "TypeSafe", env: "TYPESAFE_API_KEY", baseUrl: "https://api.typesafe.ai", model: "jev-latest" },
  openrouter: { label: "OpenRouter", env: "OPENROUTER_API_KEY", baseUrl: "https://openrouter.ai/api", model: "~typesafe/jev-latest" },
  vercel: { label: "Vercel AI Gateway", env: "AI_GATEWAY_API_KEY", baseUrl: "https://ai-gateway.vercel.sh/typesafe", model: "typesafe-ai/jev" },
};

export const DEFAULTS = {
  enabled: false,
  host: "auto",
  // Settings → Classifier → Model: a harness you have installed and its model ("" = the Jev API).
  harness: "",
  harnessModel: "",
  key: "",
  model: "",
  features: { lobby: true, triage: true, effort: true, qa: true, scripts: true },
  thresholds: { lobbyAgentAt: 0.5, simpleAt: 0.7, trivialAt: 0.8 },
};

/** Settings → Classifier, as saved by the mod (config.json beside the roster). */
export function classifierConfig() {
  const saved = readJson(join(DATA, "config.json"), {})?.classifier ?? {};
  return {
    ...DEFAULTS,
    ...saved,
    features: { ...DEFAULTS.features, ...(saved.features ?? {}) },
    thresholds: { ...DEFAULTS.thresholds, ...(saved.thresholds ?? {}) },
  };
}

/** The host to call and its key: the one chosen, or (auto) the first with a key, OpenCode first. */
export function target(config = classifierConfig(), env = process.env) {
  const names = config.host === "auto" || !HOSTS[config.host] ? ["opencode", "typesafe", "openrouter", "vercel"] : [config.host];
  for (const name of names) {
    const key = (config.key && (config.host !== "auto" || name === names[0]) ? config.key : "") || env[HOSTS[name].env] || "";
    if (key.trim()) return { name, ...HOSTS[name], key: key.trim(), model: config.model || HOSTS[name].model };
  }
  return { name: names[0], ...HOSTS[names[0]], key: "", model: config.model || HOSTS[names[0]].model };
}

/** The harnesses this machine has (Settings saves them with the team). */
export const knownHarnesses = () => readJson(join(DATA, "agents.json"), {})?.known ?? [];

/** Whether the classifier runs on a harness, and that harness is installed. */
export function onHarness(config = classifierConfig(), known = knownHarnesses()) {
  return Boolean(config.harness && canClassify(config.harness) && known.some((k) => k.key === config.harness && k.installed));
}

/** A classifier for the given config: `enabled(feature)` and `ask(feature, request)`. */
export function makeClassifier(config = classifierConfig()) {
  const t = target(config);
  const known = config.harness ? knownHarnesses() : [];
  const harness = onHarness(config, known);
  return {
    config,
    target: t,
    enabled: (feature) => Boolean(config.enabled && (harness || (!config.harness && t.key)) && config.features[feature] !== false),
    async ask(feature, request) {
      if (!this.enabled(feature)) return undefined;
      try {
        if (harness) return await askHarness({ harness: config.harness, model: config.harnessModel, known }, request, { timeoutMs: 60000 });
        return await systemOne(request, { apiKey: t.key, baseUrl: t.baseUrl, model: t.model, timeoutMs: 8000, retries: 1 });
      } catch (e) {
        if (process.env.BH_DEBUG) console.error(`classifier: ${e.message}`);
        return undefined;
      }
    },
  };
}

// ── Who answers a chat message ──────────────────────────────────────────────────────────────

export const ROUTES = {
  orchestrator: "The Orchestrator: general conversation, the team's tasks and plans, anything across several areas of the project, a request for work too big for one quick change (a new feature, an architecture change, work that needs tests and review), which it hands to the team as a task, or anything no single agent below clearly owns",
  design: "DESIGN: the frontend, meaning pages, components, styling, layout, UX, on-screen copy and browser code, whether a question about it or a change to it",
  dev: "DEV: backend code, meaning APIs, data and databases, server logic, integrations, scripts, build and tooling, whether a question about it or a change to it",
  qa: "QA: tests, meaning writing, running or fixing them, test strategy, how to verify a change, or checking work for bugs",
  research: "RESEARCH: facts from outside the repository, meaning libraries, versions, third-party APIs, documentation, standards, or comparing tools",
  scout: "SCOUT: understanding the existing code without changing it, meaning where something lives, how a part works, or tracing a flow through the code",
  knowledge: "KNOWLEDGE: what the project's saved knowledge says, meaning its conventions, standards, past decisions and architecture notes",
};

/** The agent a chat message belongs to, when the classifier is sure enough; else the Orchestrator. */
export async function route(c, message, recent = []) {
  const fallback = { route: "orchestrator", probability: null, by: "rules" };
  if (!c.enabled("lobby") || !String(message).trim()) return fallback;
  const r = await c.ask("lobby", {
    state: { message: clip(message, 4000), ...(recent.length ? { recent_conversation: clip(recent.join("\n"), 2000) } : {}) },
    questions: { agent: choice("Which member of a software team should answer `message`, which the user typed into the team's chat? Read `recent_conversation`, when present, for what the message refers to.", ROUTES) },
  });
  const picked = choiceOf(r?.answers, "agent");
  if (!picked || !(picked.choice in ROUTES) || picked.probability < c.config.thresholds.lobbyAgentAt) return { ...fallback, probability: picked?.probability ?? null, by: picked ? "classifier (unsure)" : "rules" };
  return { route: picked.choice, probability: picked.probability, by: "classifier" };
}

// ── Triage: a task's size, kind and the areas it touches ────────────────────────────────────

export const SIZES = ["trivial", "small", "medium", "large"];
const SIZE_LEVELS = [
  "trivial: one small, mechanical edit in one file (a rename, a copy change, a one-line fix)",
  "small: a few files in one area, following an existing pattern",
  "medium: several files or two areas (for example an endpoint and its screen), with some design decisions",
  "large: a cross-cutting feature, a new subsystem, a migration or an architecture change",
];
const KINDS = {
  feature: "New capability or behaviour",
  bugfix: "Existing behaviour is wrong, crashes or differs from what it should do",
  refactor: "Restructure code without changing behaviour",
  tests: "Add or fix tests only",
  docs: "Documentation only",
  chore: "Configuration, dependencies, build, tooling or cleanup",
  investigation: "Understand, explain or diagnose something; no change requested yet",
};
const DOMAINS = {
  design: "the frontend: pages, components, styling, client-side state and browser code",
  dev: "the backend: APIs, data, databases, server logic, integrations, build and tooling",
  qa: "tests: new or changed automated tests",
};

/** The rule when the classifier is off: words in the request. */
export function triageByRules(request) {
  const r = String(request).toLowerCase();
  const n = r.split(/\s+/).length;
  const has = (re) => re.test(r);
  return {
    size: n < 12 && has(/\b(rename|typo|copy|text|label|colou?r|one-line|bump)\b/) ? "trivial" : n < 40 ? "small" : n < 120 ? "medium" : "large",
    kind: has(/\b(bug|fix|broken|crash|error|wrong)\b/) ? "bugfix" : has(/\b(test|spec)s?\b/) ? "tests" : has(/\b(readme|docs?|documentation)\b/) ? "docs" : has(/\b(refactor|clean ?up|restructure)\b/) ? "refactor" : has(/\b(why|how does|explain|investigate)\b/) ? "investigation" : "feature",
    domains: {
      design: has(/\b(ui|page|screen|button|css|style|layout|component|frontend|design)\b/) ? 1 : 0,
      dev: has(/\b(api|endpoint|server|database|db|backend|auth|query|migration)\b/) ? 1 : 0,
      qa: has(/\b(test|spec|coverage)s?\b/) ? 1 : 0,
    },
    research: has(/\b(library|version|latest|compare|docs for|third[- ]party)\b/) ? 1 : 0,
    ambiguous: 0,
    by: "rules",
  };
}

export async function triage(c, request, layout = []) {
  if (!c.enabled("triage")) return triageByRules(request);
  const questions = {
    size: score("How big is the change `request` asks for, judged by what it would take to build and verify in this repository?", SIZE_LEVELS),
    needs_research: noul("Does building `request` depend on facts from outside the repository — library or API versions, third-party services, standards, current documentation?", "Yes: a decision needs outside evidence that cannot be read from the code.", "No: the repository and the request are enough."),
    ambiguous: noul("Would building `request` as written probably produce the wrong thing without first asking the user a question?", "Yes: a decision that changes what gets built is missing or contradictory.", "No: a competent engineer could build it as written, deciding details from the codebase."),
    kind: choice("What kind of work does `request` ask for?", KINDS),
    solo: noul("Could one engineer do `request` alone, right away — in one file or one area of the code — with no contract to agree between frontend and backend, no unfamiliar codebase to survey first, no risky change (security, data, payments, migrations) and no decision the user must make first?", "Yes: one person can just do it now.", "No: it needs a team — several areas, a survey of the codebase, a plan to agree, or review before it lands."),
  };
  for (const [d, owns] of Object.entries(DOMAINS)) questions[`domain_${d}`] = noul(`Does building \`request\` require changes in this area: ${owns}?`);
  const r = await c.ask("triage", { state: { request: clip(request, 6000), ...(layout.length ? { repository_layout: layout.join(", ") } : {}) }, questions });
  const size = scoreOf(r?.answers, "size");
  if (!size) return triageByRules(request);
  const kind = choiceOf(r.answers, "kind");
  const round = (x) => (x === undefined ? null : Math.round(x * 100) / 100);
  return {
    size: SIZES[Math.max(0, Math.min(3, size.level))],
    sizeConfidence: round(size.confidence),
    kind: kind?.choice ?? null,
    domains: Object.fromEntries(Object.keys(DOMAINS).map((d) => [d, round(yesOf(r.answers, `domain_${d}`))])),
    research: round(yesOf(r.answers, "needs_research")),
    ambiguous: round(yesOf(r.answers, "ambiguous")),
    solo: round(yesOf(r.answers, "solo")),
    by: "classifier",
  };
}

/** The track a triage suggests: fast for a small, clear, solo change; full otherwise. */
export function trackFor(t) {
  return (t.size === "trivial" || t.size === "small") && (t.ambiguous ?? 0) < 0.5 && (t.solo ?? 1) >= 0.5 ? "fast" : "full";
}

// ── Effort routing ──────────────────────────────────────────────────────────────────────────

export const EFFORT_LEVELS = ["trivial", "simple", "moderate", "complex"];
const EFFORT_TEXT = [
  "trivial: a mechanical edit or lookup — a rename, a copy change, a one-line fix, reading one known file",
  "simple: a small change that follows an existing pattern in one or two files",
  "moderate: new logic or several files, with some judgment about the design",
  "complex: design decisions, cross-cutting or concurrent changes, security, or an unclear root cause",
];

export async function scoreEffort(c, step, context = "") {
  if (!c.enabled("effort") || !String(step).trim()) return null;
  const r = await c.ask("effort", {
    state: { step: clip(step, 6000), ...(context ? { task: clip(context, 3000) } : {}) },
    questions: { effort: score("How much reasoning does an experienced engineer need to do `step` well, given `task`?", EFFORT_TEXT) },
  });
  const s = scoreOf(r?.answers, "effort");
  return s ? { level: EFFORT_LEVELS[Math.max(0, Math.min(3, s.level))], confidence: s.confidence } : null;
}

/**
 * The effort a scored step runs at. The configured level is the ceiling: a simple step runs one
 * level lower, a trivial one at the harness's lowest (never below "low" where it has one).
 */
export function routeEffort(scored, configured, levels, thresholds = DEFAULTS.thresholds) {
  if (!scored || !levels.length) return configured;
  const at = levels.indexOf(configured || levels[Math.floor(levels.length / 2)]);
  if (at < 0) return configured;
  const floor = Math.max(0, levels.indexOf("low"));
  if (scored.level === "trivial" && scored.confidence >= thresholds.trivialAt) return levels[Math.min(at, floor)];
  if ((scored.level === "trivial" || scored.level === "simple") && scored.confidence >= thresholds.simpleAt) return levels[Math.max(Math.min(at, floor), at - 1)];
  return configured;
}

// ── QA risk ─────────────────────────────────────────────────────────────────────────────────

export async function qaRisk(c, input) {
  return assessQaRisk(input, c.enabled("qa") ? c : undefined);
}

// ── Scripts for a step ──────────────────────────────────────────────────────────────────────

export async function pickScripts(c, step, candidates) {
  if (!c.enabled("scripts") || !candidates.length) return null;
  const list = candidates.slice(0, 24);
  const questions = Object.fromEntries(list.map((s, i) => [`s${i}`, noul(`Would running the script \`scripts.${i}\` do part of \`step\`, or check it?`)]));
  const r = await c.ask("scripts", { state: { step: clip(step, 4000), scripts: list.map((s) => `${s.name}: ${s.purpose}`) }, questions });
  if (!r) return null;
  return list.filter((_, i) => (yesOf(r.answers, `s${i}`) ?? 0) >= 0.6);
}
