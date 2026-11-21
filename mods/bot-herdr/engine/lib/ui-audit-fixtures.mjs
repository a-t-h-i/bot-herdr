// Deterministic data for `bh ui-audit`: every page it renders gets the same project, team and
// replies, so a visible-element count or a Fix-table counter is comparable between runs. The
// wrapper module the audit writes into its temp app imports what this builds.

const NOW = "2026-11-21T20:00:00.000Z";

/** The team the Settings cards draw: five harnesses with no effort levels, each with its model unset. */
const ROSTER = [
  { id: "orchestrator", role: "orchestrator", name: "Orchestrator", harness: "claude", model: "claude-opus-5-5" },
  { id: "dev", role: "dev", name: "Dev", harness: "gemini", model: "" },
  { id: "design", role: "design", name: "Design", harness: "qwen", model: "" },
  { id: "qa", role: "qa", name: "QA", harness: "opencode", model: "" },
  { id: "research", role: "research", name: "Research", harness: "agy", model: "" },
  { id: "scout", role: "scout", name: "Scout", harness: "my-harness", model: "" },
];

const KNOWN = [
  { key: "claude", name: "Claude Code", run: ["claude"], installed: true },
  { key: "gemini", name: "Gemini", run: ["gemini"], installed: true },
  { key: "qwen", name: "Qwen", run: ["qwen"], installed: true },
  { key: "opencode", name: "OpenCode", run: ["opencode"], installed: true },
  { key: "agy", name: "Antigravity", run: ["agy"], installed: true },
];

const TASK_ONE = {
  id: "t-20261121-2024",
  title: "Redesign the task board",
  status: "active",
  mode: "goal",
  goal: { status: "running", done: 2, total: 6, iteration: 1, maxSpendUsd: 40, pendingAmendment: false },
  github: null,
  archived: false,
  track: "planned",
  plan: "p-20261121-2024",
  created: "2026-11-20T09:00:00.000Z",
  updated: "2026-11-21T18:00:00.000Z",
  done: 2,
  total: 6,
  blocked: 0,
  openComments: 1,
  needsYou: true,
  running: true,
  activeAgents: ["dev-m1", "Dev"],
  spendUsd: 1.32,
  workedMs: 4712000,
  latestGate: null,
};

const TASK_TWO = {
  id: "t-20261120-1830",
  title: "Answer the plan question",
  status: "paused",
  mode: "task",
  goal: null,
  github: null,
  archived: false,
  track: "fast",
  plan: null,
  created: "2026-11-20T08:00:00.000Z",
  updated: "2026-11-20T12:00:00.000Z",
  done: 0,
  total: 2,
  blocked: 1,
  openComments: 0,
  needsYou: true,
  running: false,
  activeAgents: [],
  spendUsd: 0.21,
  workedMs: 620000,
  latestGate: null,
};

const BOARD_CONTRACT = '{\n  "command": "ui-audit",\n  "exit": { "pass": false },\n  "failures": [{ "check": "zeroCountChips", "value": 3 }]\n}';

const TASK_DETAIL = {
  id: TASK_ONE.id,
  title: TASK_ONE.title,
  request: "Make the task board quieter: one selection style, folded machine text and no empty filters.",
  status: "active",
  mode: "goal",
  goal: TASK_ONE.goal,
  track: "planned",
  plan: TASK_ONE.plan,
  by: "Orchestrator",
  created: TASK_ONE.created,
  updated: TASK_ONE.updated,
  archived: false,
  steps: [
    { n: 1, title: "Audit tooling (bh ui-audit)", agent: "dev-m1", status: "active", workedMs: 3120000, note: "", events: [] },
    { n: 2, title: "Tokens and state language", agent: null, status: "todo", workedMs: 0, note: "", events: [] },
  ],
  triage: null,
  qa: null,
  summary: "Audit tooling renders every page and counts the Fix table.",
  skills: { design: { picked: null, added: [] }, dev: { picked: null, added: [] } },
  base: "37d74fbd9312c35cc67f3cc621f0fd13a2247374",
  git: { mode: "worktree", branch: "redesign-bot-herdr-ui-to-design-language-dev-m1", from: "main", base: "37d74fbd9312c35cc67f3cc621f0fd13a2247374", path: "/tmp/bot-herdr/worktrees/redesign-bot-herdr-ui-to-design-language-dev-m1" },
  children: [{ name: "dev-m1", agent: "Dev", step: 1, branch: "redesign-bot-herdr-ui-to-design-language-dev-m1", state: "open" }],
  gates: [],
  github: null,
  iterations: 0,
  done: 2,
  total: 6,
  usage: { tokens: 1830000, costUsd: 1.32, minutes: 52 },
  timeMs: 3120000,
  checks: [{ at: NOW, passed: false, detail: "zeroCountChips=3" }],
  allowedActions: ["pause", "report"],
  worked: 4712000,
  board: [
    { n: 1, at: NOW, kind: "contract", from: "Orchestrator", to: "dev-m1", step: 1, text: BOARD_CONTRACT },
    { n: 2, at: NOW, kind: "question", from: "Dev", to: "Orchestrator", step: 1, text: "Which selection style should the filter chips use?" },
    { n: 3, at: NOW, kind: "done", from: "Design", to: null, step: 1, text: "Token map agreed." },
  ],
  cwd: "/tmp/bot-herdr",
};

const PLANS = [
  { id: "p-20261121-2024", title: "Redesign bot-herdr UI to Design Language", status: "task", round: 2, task: TASK_ONE.id, created: "2026-11-20T08:00:00.000Z", updated: NOW, goal: null },
  { id: "p-20261119-0900", title: "Fold machine text into one muted line", status: "ready", round: 1, task: null, created: "2026-11-19T09:00:00.000Z", updated: NOW, goal: null },
];

const PLAN = {
  id: "p-20261121-2024",
  title: "Redesign bot-herdr UI to Design Language",
  idea: "A quieter app with one selection style and folded machine text.",
  status: "task",
  round: 2,
  task: TASK_ONE.id,
  created: "2026-11-20T08:00:00.000Z",
  updated: NOW,
  markdown: "## Plan\n\n1. Audit tooling\n2. Tokens and state language\n",
  goal: null,
  off: [],
  asked: [],
  comments: [],
  skills: { design: { picked: null, added: [] }, dev: { picked: null, added: [] } },
};

const STACK = "TypeError: cannot read properties of undefined (reading 'id')\n    at renderIssue (mods/bot-herdr/issues.js:512:18)\n    at render (mods/bot-herdr/main.js:246:12)\n    at Object.run (gpui-shell.js:1:1)";

const ISSUES = {
  repo: "a-t-h-i/bot-herdr",
  transport: "gh",
  fetchedAt: "2026-11-21T19:00:00.000Z",
  authenticated: true,
  canWrite: true,
  issues: [
    {
      number: 1,
      title: "Error message shows up in chat tab",
      state: "open",
      author: "a-t-h-i",
      labels: ["bug"],
      updatedAt: "2026-11-20T10:00:00.000Z",
      createdAt: "2026-11-19T10:00:00.000Z",
      url: "https://github.com/a-t-h-i/bot-herdr/issues/1",
      commentCount: 0,
      body: `When a reply fails the error text is drawn in the chat, at full size.\n\n\`\`\`\n${STACK}\n\`\`\`\n`,
      comments: [],
      triage: null,
    },
    {
      number: 2,
      title: "Add a palette command for the Home page",
      state: "closed",
      author: "a-t-h-i",
      labels: ["enhancement"],
      updatedAt: "2026-11-18T10:00:00.000Z",
      createdAt: "2026-11-17T10:00:00.000Z",
      url: "https://github.com/a-t-h-i/bot-herdr/issues/2",
      commentCount: 1,
      body: "Home should open from the palette.",
      comments: [],
      triage: { decision: "accept", risk: "low", effort: "s", reason: "Small additive command" },
    },
  ],
};

const KIND_TEXT = {
  orchestrator: "# orchestrator: what I know\n\n## Facts\n- The plan names the sections the agents follow\n- Home opens first\n\n## Standards\n- QA passes a milestone\n",
  dev: "# dev: what I know\n\n## Facts\n- bh --data is URI-encoded\n- Contracts fold into one mono line\n\n## Standards\n- Renders never throw\n",
  design: "# design: what I know\n\n## Facts\n- One coral action per view\n- State is glyph, colour and word\n",
};

const KINDS = [
  { agent: "orchestrator", entries: 2, chars: KIND_TEXT.orchestrator.length, over: false },
  { agent: "dev", entries: 2, chars: KIND_TEXT.dev.length, over: false },
  { agent: "design", entries: 2, chars: KIND_TEXT.design.length, over: false },
];

const KNOW_ALL = Object.entries(KIND_TEXT).map(([agent, text]) => ({ agent, text, notes: [] }));

const LESSONS = [
  { slug: "multi-harness-agent-runner", title: "Multi-Harness Agent Runner and ACP Adapter", summary: "How one turn() runs every harness.", chapter: "architecture", readMins: 2, sources: [], updated: NOW },
  { slug: "append-only-logs", title: "Append-Only Event Logs and Atomic State Snapshots", summary: "How the ledgers stay crash-safe.", chapter: "architecture", readMins: 2, sources: [], updated: NOW },
];

const METRICS = {
  window: "today",
  from: "2026-11-20T22:00:00.000Z",
  to: NOW,
  totals: { timeMs: 3600000, turns: 42, tokens: { input: 1200000, output: 400000, cacheRead: 8000000, cacheWrite: 120000 }, costUsd: 2.31, tasks: 2, steps: 3, estimated: { tokens: true, cost: false } },
  agents: [
    { id: "orchestrator", name: "Orchestrator", role: "orchestrator", harness: "claude", models: ["claude-opus-5-5"], timeMs: 1800000, turns: 21, tokens: { input: 600000, output: 200000, cacheRead: 4000000, cacheWrite: 60000 }, costUsd: 1.31, tasks: 1, steps: 2, estimated: { tokens: true, cost: false }, daily: [{ day: "2026-11-21", timeMs: 1800000, turns: 21 }] },
    { id: "dev", name: "Dev", role: "dev", harness: "gemini", models: ["gemini-3-pro"], timeMs: 1200000, turns: 14, tokens: { input: 400000, output: 130000, cacheRead: 2600000, cacheWrite: 40000 }, costUsd: 0.71, tasks: 1, steps: 1, estimated: { tokens: true, cost: true }, daily: [{ day: "2026-11-21", timeMs: 1200000, turns: 14 }] },
    { id: "qa", name: "QA", role: "qa", harness: "opencode", models: [], timeMs: 600000, turns: 7, tokens: { input: 200000, output: 70000, cacheRead: 1400000, cacheWrite: 20000 }, costUsd: 0.29, tasks: 0, steps: 0, estimated: { tokens: false, cost: false }, daily: [{ day: "2026-11-21", timeMs: 600000, turns: 7 }] },
  ],
};

const ACCESS = { headless: true, access: "standard", allow: [], git: "worktree", repoHistory: true };
const CLASSIFIER = { enabled: false, keyFound: false, model: "", harness: "", kind: "", host: "openrouter", features: {}, thresholds: {} };
const RESILIENCE = { config: { autonomy: "guarded", fallbacks: [], guardrails: {} }, cooldowns: [], activeFailovers: [], task: null };

/** The audit's page list: today's destinations plus one variant per sub-tab the Fix table names. */
export const AUDIT_PAGES = [
  { id: "chat", props: { view: "chat" } },
  { id: "tasks", props: { view: "work", tab: "tasks" } },
  { id: "tasks-board", props: { view: "work", tab: "tasks" } },
  { id: "plans", props: { view: "work", tab: "plans" } },
  { id: "issues", props: { view: "issues" } },
  { id: "knowledge", props: { view: "work", tab: "knowledge" } },
  { id: "learning", props: { view: "learning" } },
  { id: "metrics", props: { view: "metrics" } },
  { id: "settings", props: { view: "settings" } },
  { id: "settings-general", props: { view: "settings" } },
  { id: "switch", props: { view: "switch" } },
];

const DATA = { tasks: [TASK_ONE, TASK_TWO], detail: TASK_DETAIL, plans: PLANS, plan: PLAN, issues: ISSUES, kinds: KINDS, knowAll: KNOW_ALL, lessons: LESSONS, metrics: METRICS, known: KNOWN, access: ACCESS, classifier: CLASSIFIER, resilience: RESILIENCE };

/** The seed lines one page needs after its view initialises, before the first render. */
const SEEDS = {
  tasks: `page.dir = projectDir();
  page.tasks = DATA.tasks;
  page.busy = false;
  page.opened = DATA.tasks[0].id;
  page.taskChip = "active";
  page.archived = false;
  page.taskDetail = DATA.detail;
  page.taskDetailId = DATA.detail.id;
  page.detailTab = "steps";`,
  "tasks-board": `page.dir = projectDir();
  page.tasks = DATA.tasks;
  page.busy = false;
  page.opened = DATA.tasks[0].id;
  page.taskChip = "active";
  page.archived = false;
  page.taskDetail = DATA.detail;
  page.taskDetailId = DATA.detail.id;
  page.detailTab = "board";`,
  plans: `page.dir = projectDir();
  page.plans = DATA.plans;
  page.plan = DATA.plan;
  page.planId = DATA.plan.id;
  page.showPrevious = true;`,
  issues: `page.dir = projectDir();
  page.data = DATA.issues;
  page.loading = false;
  page.chip = "open";
  page.opened = 1;
  page.shown = true;`,
  knowledge: `page.dir = projectDir();
  page.kinds = DATA.kinds;
  page.knowAll = DATA.knowAll;
  page.agent = DATA.knowAll[0].agent;
  page.notes = [];`,
  learning: `page.dir = projectDir();
  page.lessons = DATA.lessons;
  page.candidatesCount = 2;
  page.updated = "${NOW}";
  page.loading = false;
  page.busy = false;`,
  metrics: `page.window = "today";
  page.data = DATA.metrics;
  page.failed = false;
  page.busy = false;`,
  settings: `page.known = DATA.known;
  page.section = "agents";
  page.access = DATA.access;
  page.classifier = DATA.classifier;
  page.sync();`,
  "settings-general": `page.known = DATA.known;
  page.section = "general";
  page.access = DATA.access;
  page.classifier = DATA.classifier;
  page.resilience = DATA.resilience;
  page.sync();`,
  chat: "",
  switch: "",
};

/** The generated `audit-fixture.js` for one page: its props, the team, the data, and the seeding. */
export function fixtureSource(pageId) {
  const page = AUDIT_PAGES.find((p) => p.id === pageId);
  if (!page) throw new Error(`Unknown audit page: ${pageId}`);
  return `// Generated by bh ui-audit: ${pageId}. Deterministic fixture state for one page's first render.
import { setShared } from "herdr";
import { projectDir } from "./mods/bot-herdr/bh.js";
import { ROSTER_KEY } from "./mods/bot-herdr/roster.js";

export const PAGE = ${JSON.stringify(page.id)};
export const PROPS = ${JSON.stringify(page.props)};
const DATA = ${JSON.stringify(DATA)};
const ROSTER = ${JSON.stringify(ROSTER)};

export function prepare() {
  setShared(ROSTER_KEY, ROSTER);
}

export function seed(page) {
  ${SEEDS[page.id] ?? ""}
}
`;
}

/** The generated `audit-pages.js` for `--shots`: every audited page's props and seeded state. */
export function shotFixtureSource() {
  const cases = AUDIT_PAGES.map((page) => {
    const seed = (SEEDS[page.id] ?? "").trim();
    if (!seed) return "";
    return `    case ${JSON.stringify(page.id)}:\n${seed.split("\n").map((line) => `      ${line.trimStart()}`).join("\n")}\n      break;`;
  }).filter(Boolean).join("\n");
  return `// Generated by bh ui-audit --shots: every audited page's props and its seeded fixture state.
import { setShared } from "herdr";
import { projectDir } from "./bh-real.js";
import { ROSTER_KEY } from "./roster.js";

const DATA = ${JSON.stringify(DATA)};
const ROSTER = ${JSON.stringify(ROSTER)};
export const PAGES = ${JSON.stringify(Object.fromEntries(AUDIT_PAGES.map((p) => [p.id, p.props])), null, 2)};

export function prepare() {
  setShared(ROSTER_KEY, ROSTER);
}

export function seedPage(page, id) {
  switch (id) {
${cases}
    default:
      break;
  }
}
`;
}

/** The wrapper app the audit checks: the real mod with one page opened over the fixtures. */
export const WRAPPER_MAIN = `import { View } from "gpui-kit";
import BotHerdr from "./mods/bot-herdr/main.js";
import { PROPS, prepare, seed } from "./audit-fixture.js";

export default class AuditPage extends View {
  init(given, cx) {
    prepare();
    this.inner = new BotHerdr();
    this.inner.init(PROPS, cx);
    if (this.inner.page) seed(this.inner.page);
  }

  render(cx) {
    return this.inner.render(cx);
  }
}
`;
