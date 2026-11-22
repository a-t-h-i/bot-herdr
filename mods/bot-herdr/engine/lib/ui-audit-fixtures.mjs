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

/** One thread at a glance (bh thread list's row): what Home's Review section draws. */
const THREAD_ROW = {
  id: TASK_ONE.id,
  kind: "task",
  title: TASK_ONE.title,
  state: "review",
  glyph: "◇",
  status: "active",
  planId: TASK_ONE.plan,
  agents: ["dev-m1", "Dev", "qa-1"],
  steps: { done: 2, total: 6 },
  blocked: 0,
  openComments: 1,
  needs: [],
  activeAgents: ["dev-m1"],
  goal: null,
  ageMs: 51000000,
  age: "2h",
  created: TASK_ONE.created,
  updated: "2026-11-21T19:00:00.000Z",
  branch: "redesign-bot-herdr-ui-to-design-language-dev-m1",
  path: "/tmp/bot-herdr/worktrees/redesign-bot-herdr-ui-to-design-language-dev-m1",
  summary: { text: "Quiet pass is ready for QA", at: "2026-11-21T19:00:00.000Z", source: "activity", agent: "dev-m1" },
};

/** A plan that is not a task yet: its own thread. */
const PLAN_THREAD = {
  ...THREAD_ROW,
  id: "p-20261119-0900",
  kind: "plan",
  title: "Fold machine text into one muted line",
  state: "idle",
  glyph: "○",
  status: "ready",
  planId: "p-20261119-0900",
  agents: [],
  steps: { done: 0, total: 0 },
  openComments: 0,
  activeAgents: [],
  age: "1d",
  updated: "2026-11-20T09:00:00.000Z",
  branch: null,
  path: null,
  summary: { text: "Ready to start", at: "2026-11-20T09:00:00.000Z", source: "state", agent: null },
};

/** `bh thread list --json`: a thread that needs you, one in review, and a plan that is not a task. */
const THREADS = {
  command: "thread",
  sub: "list",
  at: NOW,
  count: 3,
  threads: [
    { ...THREAD_ROW, id: TASK_TWO.id, title: TASK_TWO.title, state: "needsYou", glyph: "◆", status: "paused", planId: null, agents: ["qa-1"], steps: { done: 0, total: 2 }, age: "8h", summary: { text: "Antigravity is offline; QA cannot start", at: NOW, source: "board", agent: "qa-1" } },
    THREAD_ROW,
    PLAN_THREAD,
  ],
  skipped: [],
};

/** `bh thread show <id> --json`: the Goal thread with its conversation, plan, steps and diff stat. */
const THREAD_SHOW = {
  ...THREAD_ROW,
  command: "thread",
  sub: "show",
  goal: { status: "running", passed: 2, total: 6, iteration: 1, maxSpendUsd: 40, awaitingQa: false },
  plan: { id: PLAN.id, title: PLAN.title, status: "task", round: 2, task: TASK_ONE.id, markdown: PLAN.markdown },
  steps: { done: 2, total: 6, items: [{ n: 1, title: "Audit tooling (bh ui-audit)", status: "active", agent: "dev-m1", report: null }] },
  conversation: {
    total: 3,
    entries: [
      { at: "2026-11-21T18:30:00.000Z", kind: "board", boardKind: "contract", from: "Orchestrator", to: "dev-m1", text: BOARD_CONTRACT, ref: "#1" },
      { at: "2026-11-21T19:00:00.000Z", kind: "comment", from: "You", text: "Keep the chips quiet: underline, no fill.", ref: "c3" },
      { at: "2026-11-21T19:40:00.000Z", kind: "reply", from: "dev-m1", text: "The audit renders every page now.\nNext: the Fix-table counters." },
    ],
  },
  changes: {
    available: true,
    base: TASK_DETAIL.base,
    branch: THREAD_ROW.branch,
    from: "main",
    files: [
      { path: "mods/bot-herdr/engine/lib/ui-audit.mjs", added: 420, removed: 0 },
      { path: "mods/bot-herdr/look.js", added: 36, removed: 12 },
    ],
    filesChanged: 2,
    truncated: false,
    added: 456,
    removed: 12,
  },
  cost: { tokens: 1830000, costUsd: 1.32, minutes: 52, turns: 5 },
  comments: [],
  children: [{ name: "dev-m1", agent: "Dev", step: 1, state: "open", branch: "redesign-bot-herdr-ui-to-design-language-dev-m1", mergedAt: null, stat: null }],
  forkOf: null,
  forks: [{ id: "t-20261121-9010", title: "Try a lighter audit fixture pass", state: "working" }],
  questions: [],
};

const APPROVAL_ONE = {
  id: "ap-a1b2c3d4",
  task: TASK_ONE.id,
  agent: "dev",
  from: "dev-m1",
  title: "Run a command",
  command: "npm test",
  kind: "execute",
  at: 1795357337611,
  pid: process.pid,
  status: "pending",
  answer: null,
  answeredAt: null,
};

/** `bh approvals list --json`: one pending approval on the fixture thread with a live pid. */
const APPROVALS = { approvals: [APPROVAL_ONE] };

/** `bh review diff <task> <path> --json`: a 2-file diff on the fixture thread's changes. */
const REVIEW_DIFFS = {
  "mods/bot-herdr/engine/lib/ui-audit.mjs": {
    path: "mods/bot-herdr/engine/lib/ui-audit.mjs",
    truncated: false,
    hunks: [
      {
        header: "@@ -1,3 +1,5 @@",
        lines: [
          { kind: "ctx", old: 1, new: 1, text: "// bh ui-audit: the redesign's design-language audit." },
          { kind: "add", old: null, new: 2, text: "export const AUDIT_VERSION = 6;" },
          { kind: "add", old: null, new: 3, text: "export const MAX_DIFF_LINES = 2000;" },
          { kind: "ctx", old: 2, new: 4, text: "import { execFileSync } from \"node:child_process\";" },
          { kind: "ctx", old: 3, new: 5, text: "import { join } from \"node:path\";" },
        ],
      },
    ],
  },
  "mods/bot-herdr/look.js": {
    path: "mods/bot-herdr/look.js",
    truncated: false,
    hunks: [
      {
        header: "@@ -10,3 +10,4 @@",
        lines: [
          { kind: "ctx", old: 10, new: 10, text: "export const RADIUS = { control8: 8, card12: 12 };" },
          { kind: "del", old: 11, new: null, text: "export const DIFF_GUTTER = 18;" },
          { kind: "add", old: null, new: 11, text: "export const DIFF_GUTTER = 24;" },
          { kind: "add", old: null, new: 12, text: "export const APPROVAL_GAP = 8;" },
          { kind: "ctx", old: 12, new: 13, text: "export const SPACE_SCALE = [4, 8, 12, 16, 24, 32];" },
        ],
      },
    ],
  },
};

/** `bh review list <task> --json`: two open review comments on the fixture thread's diff. */
const REVIEW_COMMENTS = {
  comments: [
    { id: "rc-11223344", at: 1795357337611, path: "mods/bot-herdr/engine/lib/ui-audit.mjs", line: 2, text: "Keep AUDIT_VERSION in sync with the baseline file.", state: "open" },
    { id: "rc-55667788", at: 1795357338611, path: "mods/bot-herdr/look.js", line: 11, text: "Check gutter width on narrow panes.", state: "open" },
  ],
};

/** `bh goal progress <task> --json`: the goal row's gate, elapsed, retries and the judge's reason. */
const GOAL_PROGRESS = {
  command: "goal progress",
  at: NOW,
  task: TASK_ONE.id,
  title: TASK_ONE.title,
  isGoal: true,
  status: "running",
  paused: false,
  gate: { passed: 2, total: 6, reached: false, best: 2 },
  elapsed: "11h",
  retries: { used: 1, cap: 3, left: 2 },
  lastReason: "zeroCountChips is 3: the board still draws empty filter chips.",
};

/** `bh thread peek <id> --json`: recent output, the open question with options, the reply target. */
const PEEK = {
  command: "thread",
  sub: "peek",
  id: TASK_TWO.id,
  kind: "task",
  title: TASK_TWO.title,
  state: "needsYou",
  glyph: "◆",
  summary: { text: "Antigravity is offline; QA cannot start", at: NOW, source: "board", agent: "qa-1" },
  cost: { tokens: 412000, costUsd: 0.21, minutes: 10, turns: 2 },
  output: [
    { at: "2026-11-21T19:18:00.000Z", from: "qa-1", text: "Starting the M3 review." },
    { at: "2026-11-21T19:20:00.000Z", from: "qa-1", text: "agy did not answer within 30s." },
  ],
  question: { kind: "question", ref: "comment c4", text: "Switch QA to another harness?", from: "qa-1", at: NOW, options: ["Use OpenCode", "Wait for Antigravity"] },
  needs: [],
  replyTarget: { name: "qa-1", address: "t9r" },
};

/** `bh home --json`: what needs you (ranked), the reviews, the fleet and today's spend. */
const HOME = {
  command: "home",
  at: NOW,
  header: { running: 3, needsYou: 5, text: "3 running · 5 need you" },
  needsYou: [
    { kind: "question", thread: TASK_ONE.id, ref: "comment c3", title: "Which selection style should the filter chips use?", text: "The board and the chips disagree; pick one.", from: "You", at: "2026-11-21T19:40:00.000Z" },
    { kind: "blocker", thread: TASK_TWO.id, ref: "step 4", title: "Antigravity is offline", text: "QA cannot start until the harness answers.", from: "qa-1", at: "2026-11-21T19:20:00.000Z" },
    { kind: "approval", thread: TASK_ONE.id, ref: APPROVAL_ONE.id, title: "Allow once: run the test suite", text: "Dev asked to run npm test.", from: "dev-m1", at: NOW },
    { kind: "issue", thread: null, ref: "#1", title: "Error message shows up in chat tab", text: "An untriaged GitHub issue.", from: null, at: "2026-11-19T10:00:00.000Z" },
    { kind: "review", thread: TASK_ONE.id, ref: "step 3", title: "Quiet pass ready for review", text: "QA is reading the M3 diff.", from: "dev-m3", at: "2026-11-21T19:50:00.000Z" },
  ],
  review: [THREAD_ROW],
  fleet: {
    agents: [
      { name: "dev-m1", address: "t7a", harness: "pi", state: "working", status: "working", summary: "Editing filters.ts", at: NOW, task: TASK_ONE.id, cwd: "/tmp/bot-herdr" },
      { name: "dev-m3", address: "t10z", harness: "claude", state: "needsYou", status: "blocked", summary: "Waiting on the selection style answer", at: "2026-11-21T19:45:00.000Z", task: TASK_ONE.id, cwd: "/tmp/bot-herdr" },
      { name: "qa-1", address: "t9r", harness: "opencode", state: "idle", status: "idle", summary: "M3 review is queued", at: "2026-11-21T19:10:00.000Z", task: TASK_ONE.id, cwd: "/tmp/bot-herdr" },
    ],
    goals: [
      { task: TASK_ONE.id, title: "Redesign the task board", status: "running", state: "working", passed: 2, total: 6, iteration: 1, maxSpendUsd: 40, spendUsd: 1.32, summary: "M1 audit is green; the tokens come next." },
      { task: TASK_TWO.id, title: "Answer the plan question", status: "waiting", state: "paused", passed: 0, total: 2, iteration: 0, maxSpendUsd: 15, spendUsd: 0.21, summary: "Paused until the plan question is answered." },
    ],
  },
  spendToday: { window: "today", turns: 5, costUsd: 1.8236, tokens: 58265717, minutes: 118.5 },
  skipped: [],
};

/** `bh scripts list --json`: a project script among the built-ins. */
const SCRIPTS = [
  { name: "check_changed", file: "/mods/bot-herdr/engine/scripts/check_changed.mjs", source: "built-in", purpose: "typecheck and lint only what changed on this branch", usage: "node {script} [files…] [--base <ref>]" },
  { name: "find_tests_for", file: "/mods/bot-herdr/engine/scripts/find_tests_for.mjs", source: "built-in", purpose: "list the test files that cover the given source files", usage: "node {script} <file> [more files…]" },
  { name: "seed_demo", file: "/.bot-herdr/scripts/seed_demo.mjs", source: "project", purpose: "seed the demo project data", usage: "node {script}" },
];

const ACCESS = { headless: true, access: "standard", allow: [], git: "worktree", repoHistory: true };
const CLASSIFIER = { enabled: false, keyFound: false, model: "", harness: "", kind: "", host: "openrouter", features: {}, thresholds: {} };
const RESILIENCE = { config: { autonomy: "guarded", fallbacks: [], guardrails: {} }, cooldowns: [], activeFailovers: [], task: null };

/** The audit's page list: the redesign's destinations and each sub-tab it holds, then the views
 * they replaced — still rendered, so a page the navigation drops keeps its coverage until the
 * thread view lands. */
export const AUDIT_PAGES = [
  { id: "home", props: { view: "home" } },
  { id: "threads", props: { view: "threads" } },
  { id: "thread-chat", props: { view: "threads" } },
  { id: "thread-conversation", props: { view: "threads" } },
  { id: "thread-plan", props: { view: "threads" } },
  { id: "thread-steps", props: { view: "threads" } },
  { id: "thread-changes", props: { view: "threads" } },
  { id: "peek", props: { view: "threads" } },
  { id: "agents-fleet", props: { view: "agents" } },
  { id: "agents-terminals", props: { view: "agents", sub: "terminals" } },
  { id: "library-knowledge", props: { view: "library", sub: "knowledge" } },
  { id: "library-learning", props: { view: "library", sub: "learning" } },
  { id: "library-scripts", props: { view: "library", sub: "scripts" } },
  { id: "library-issues", props: { view: "library", sub: "issues" } },
  { id: "settings", props: { view: "settings" } },
  { id: "settings-usage", props: { view: "settings" } },
  { id: "chat", props: { view: "chat" } },
  { id: "tasks", props: { view: "work", tab: "tasks" } },
  { id: "tasks-board", props: { view: "work", tab: "tasks" } },
  { id: "plans", props: { view: "work", tab: "plans" } },
  { id: "issues", props: { view: "issues" } },
  { id: "knowledge", props: { view: "work", tab: "knowledge" } },
  { id: "learning", props: { view: "learning" } },
  { id: "metrics", props: { view: "metrics" } },
  { id: "settings-general", props: { view: "settings" } },
  { id: "switch", props: { view: "switch" } },
];

const DATA = { tasks: [TASK_ONE, TASK_TWO], detail: TASK_DETAIL, plans: PLANS, plan: PLAN, issues: ISSUES, kinds: KINDS, knowAll: KNOW_ALL, lessons: LESSONS, metrics: METRICS, home: HOME, threads: THREADS, threadShow: THREAD_SHOW, approvals: APPROVALS, reviewDiffs: REVIEW_DIFFS, reviewComments: REVIEW_COMMENTS, goalProgress: GOAL_PROGRESS, peek: PEEK, scripts: SCRIPTS, known: KNOWN, access: ACCESS, classifier: CLASSIFIER, resilience: RESILIENCE };

/** The seed lines one page needs after its view initialises, before the first render. */
const SEEDS = {
  home: `page.data = DATA.home;
  page.loading = false;
  page.failed = false;`,
  threads: `page.data = DATA.threads;
  page.failed = false;`,
  "thread-chat": `page.data = DATA.threads;
  page.failed = false;
  page.opened = "orchestrator";`,
  "thread-conversation": `page.data = DATA.threads;
  page.failed = false;
  page.opened = DATA.threadShow.id;
  page.sub = "conversation";
  page.detail = DATA.threadShow;
  page.detailId = DATA.threadShow.id;
  page.progress = DATA.goalProgress;
  page.work.taskDetail = DATA.detail;
  page.work.taskDetailId = DATA.threadShow.id;
  page.approvals = DATA.approvals.approvals.filter((a) => a.task === DATA.threadShow.id);`,
  "thread-plan": `page.data = DATA.threads;
  page.failed = false;
  page.opened = DATA.threadShow.id;
  page.sub = "plan";
  page.detail = DATA.threadShow;
  page.detailId = DATA.threadShow.id;
  page.progress = DATA.goalProgress;
  page.work.taskDetail = DATA.detail;
  page.work.taskDetailId = DATA.threadShow.id;`,
  "thread-steps": `page.data = DATA.threads;
  page.failed = false;
  page.opened = DATA.threadShow.id;
  page.sub = "steps";
  page.detail = DATA.threadShow;
  page.detailId = DATA.threadShow.id;
  page.progress = DATA.goalProgress;
  page.work.taskDetail = DATA.detail;
  page.work.taskDetailId = DATA.threadShow.id;`,
  "thread-changes": `page.data = DATA.threads;
  page.failed = false;
  page.opened = DATA.threadShow.id;
  page.sub = "changes";
  page.detail = DATA.threadShow;
  page.detailId = DATA.threadShow.id;
  page.progress = DATA.goalProgress;
  page.work.taskDetail = DATA.detail;
  page.work.taskDetailId = DATA.threadShow.id;
  page.reviewComments = DATA.reviewComments.comments;
  page.expandedDiffs = new Set([Object.keys(DATA.reviewDiffs)[0]]);
  page.diffs = new Map([[Object.keys(DATA.reviewDiffs)[0], diffModel(DATA.reviewDiffs[Object.keys(DATA.reviewDiffs)[0]])]]);`,
  peek: `page.data = DATA.threads;
  page.failed = false;
  page.pick = 1;
  page.peek.target = { kind: "thread", id: DATA.peek.id };
  page.peek.answer = DATA.peek;`,
  "agents-fleet": `page.data = DATA.home;
  page.loading = false;
  page.failed = false;`,
  "library-knowledge": `page.body.dir = projectDir();
  page.body.kinds = DATA.kinds;
  page.body.knowAll = DATA.knowAll;
  page.body.agent = DATA.knowAll[0].agent;
  page.body.notes = [];`,
  "library-learning": `page.body.dir = projectDir();
  page.body.lessons = DATA.lessons;
  page.body.candidatesCount = 2;
  page.body.updated = "${NOW}";
  page.body.loading = false;
  page.body.busy = false;`,
  "library-scripts": `page.body.data = DATA.scripts;
  page.body.loading = false;
  page.body.busy = false;`,
  "library-issues": `page.body.dir = projectDir();
  page.body.data = DATA.issues;
  page.body.loading = false;
  page.body.chip = "open";
  page.body.opened = 1;
  page.body.shown = true;`,
  "settings-usage": `page.known = DATA.known;
  page.section = "usage";
  page.access = DATA.access;
  page.classifier = DATA.classifier;
  page.sync();
  page.metrics.window = "today";
  page.metrics.data = DATA.metrics;
  page.metrics.busy = false;`,
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
import { SUB } from "./mods/bot-herdr/pages.js";
import { diffModel } from "./mods/bot-herdr/threadview.js";

export const PAGE = ${JSON.stringify(page.id)};
export const PROPS = ${JSON.stringify(page.props)};
const DATA = ${JSON.stringify(DATA)};
const ROSTER = ${JSON.stringify(ROSTER)};

export function prepare() {
  // Each page opens as if for the first time: no sub-tab remembered by a page rendered before it.
  setShared(SUB, {});
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
import { SUB } from "./pages.js";
import { diffModel } from "./threadview.js";

const DATA = ${JSON.stringify(DATA)};
const ROSTER = ${JSON.stringify(ROSTER)};
export const PAGES = ${JSON.stringify(Object.fromEntries(AUDIT_PAGES.map((p) => [p.id, p.props])), null, 2)};

export function prepare() {
  // Each page opens as if for the first time: no sub-tab remembered by the page shot before it.
  setShared(SUB, {});
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
    // Prepared again so the shared state a page may have published (its sub-tab) cannot leak in
    // from a page rendered in the same process: this page draws its own seeded state.
    prepare();
    return this.inner.render(cx);
  }
}
`;
