// Resilience: a quota cools the model down, the same CLI's next model takes the live conversation,
// another harness continues from the dirty worktree, and with nothing left the agent holds until
// the limit resets instead of crashing. Cooldowns are shared, sessions are per harness.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const tmp = mkdtempSync(join(tmpdir(), "bh-resilience-"));
const APP = join(tmp, "app");
const PROJECT = join(tmp, "project");
const DATA = join(APP, "data", "bot-herdr");
mkdirSync(PROJECT, { recursive: true });
mkdirSync(DATA, { recursive: true });
process.env.BH_APP_HOME = APP;
process.env.XDG_CONFIG_HOME = join(tmp, "xdg");

const BH = fileURLToPath(new URL("../mods/bot-herdr/engine/bh.mjs", import.meta.url));
const lib = (name) => import(new URL(`../mods/bot-herdr/engine/${name}`, import.meta.url));

const git = (cwd, ...args) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8" });
assert.equal(git(PROJECT, "init", "-q", "-b", "main").status, 0);
mkdirSync(join(PROJECT, "src"), { recursive: true });
writeFileSync(join(PROJECT, "src", "a.mjs"), "export const a = 1;\n");
git(PROJECT, "add", "-A");
assert.equal(git(PROJECT, "commit", "-q", "-m", "init").status, 0);

const ENV = (extra = {}) => ({ ...process.env, BH_APP_HOME: APP, XDG_CONFIG_HOME: join(tmp, "xdg"), HC_TERMINAL_ID: "", BH_AGENT: "", BH_PARENT: "", BH_STEP: "", ...extra });

// ── Fake harnesses that speak each CLI's own JSON ─────────────────────────────────────────

const LOG = join(tmp, "calls.jsonl");
const fake = (name, body) => {
  const file = join(tmp, `${name}.mjs`);
  writeFileSync(file, `import { appendFileSync, readFileSync } from "node:fs";\nconst log = (x) => appendFileSync(${JSON.stringify(LOG)}, JSON.stringify(x) + "\\n");\nconst out = (o) => console.log(JSON.stringify(o));\n${body}\n`);
  return file;
};

const LIMITS = "opus-1,sonnet-1";
const FAKES = {
  claude: fake("claude", `
    const argv = process.argv.slice(2);
    const prompt = readFileSync(0, "utf8");
    const model = argv.includes("--model") ? argv[argv.indexOf("--model") + 1] : "";
    log({ harness: "claude", model, argv, prompt });
    out({ type: "system", subtype: "init" });
    const failing = (process.env.BH_FAKE_LIMIT || "").split(",").filter(Boolean);
    if (failing.includes(model) || prompt.includes("TRIGGER_LIMIT")) {
      // Claude Code headless exits 0 on a usage limit and puts the message in the result (issue #79500).
      out({ type: "result", subtype: "success", result: "You've hit your session limit · resets 7:10pm (Africa/Johannesburg)" });
    } else {
      out({ type: "result", subtype: "success", result: "Claude " + model + " says: " + prompt.trim().split("\\n").pop(), usage: { input_tokens: 10, output_tokens: 2 } });
    }
  `),
  codex: fake("codex", `
    const argv = process.argv.slice(2);
    const prompt = readFileSync(0, "utf8");
    log({ harness: "codex", argv, prompt });
    out({ type: "thread.started", thread_id: "th-1" });
    const failing = (process.env.BH_FAKE_LIMIT || "").split(",").includes("codex");
    if (failing === "quota") out({ type: "turn.failed", error: { message: "insufficient_quota: your plan is out" } });
    else if (failing) out({ type: "turn.failed", error: { message: "exceeded retry limit, last status: 429 Too Many Requests" } });
    else {
      out({ type: "item.completed", item: { type: "agent_message", text: "Codex says: " + prompt.trim().split("\\n").pop() } });
      out({ type: "turn.completed", usage: { input_tokens: 10, output_tokens: 3 } });
    }
  `),
  pi: fake("pi", `
    const prompt = readFileSync(0, "utf8");
    log({ harness: "pi", argv: process.argv.slice(2), prompt });
    out({ type: "session", id: "pi-1" });
    out({ type: "message_end", message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "pi says: " + prompt.trim().split("\\n").pop() }] } });
  `),
};

const KNOWN = [
  { key: "claude", name: "Claude Code", run: [process.execPath, FAKES.claude], installed: true },
  { key: "codex", name: "Codex", run: [process.execPath, FAKES.codex], installed: true },
  { key: "pi", name: "pi", run: [process.execPath, FAKES.pi], installed: true },
];

const calls = (harness) => (existsSync(LOG) ? readFileSync(LOG, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((c) => c.harness === harness) : []);
const store = () => JSON.parse(readFileSync(join(DATA, "cooldowns.json"), "utf8"));
const agentState = (terminal) => JSON.parse(readFileSync(join(DATA, "sessions", `dev-${terminal}.json`), "utf8"));
const reply = (terminal) => readFileSync(join(DATA, "replies", `${terminal}.md`), "utf8");

/** The roster, the access level and the resilience config one test starts from. */
function setup({ fallbacks = [], access = "standard", autonomy = "guarded", guardrails = {}, model = "opus-1" } = {}) {
  writeFileSync(join(DATA, "config.json"), JSON.stringify({ agents: { access }, resilience: { autonomy, fallbacks: [], guardrails: { ...guardrails } } }));
  writeFileSync(join(DATA, "agents.json"), JSON.stringify({ agents: [{ role: "dev", name: "Dev", harness: "claude", model, fallbacks }], known: KNOWN }));
  writeFileSync(join(DATA, "cooldowns.json"), JSON.stringify({ cooldowns: {}, failovers: [] }));
}

function agent(terminal, input, args = [], extra = {}) {
  const r = spawnSync(process.execPath, [BH, "agent", "dev", ...args], { cwd: PROJECT, input, encoding: "utf8", timeout: 30000, env: ENV({ HC_TERMINAL_ID: terminal, ...extra }) });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

const bh = (...args) => {
  const r = spawnSync(process.execPath, [BH, ...args], { cwd: PROJECT, encoding: "utf8", timeout: 30000, env: ENV() });
  return { code: r.status, out: r.stdout, err: r.stderr };
};

// ── The fallback chain ──────────────────────────────────────────────────────────────────

test("a quota moves to the next model of the same CLI and keeps the live session", () => {
  setup({ fallbacks: [{ harness: "claude", model: "sonnet-1" }, { harness: "codex", model: "gpt-5" }] });
  const before = calls("claude").length;
  const r = agent("f1", "", ["--", "fix the leak"], { BH_FAKE_LIMIT: LIMITS.split(",").slice(0, 1).join(",") });
  assert.equal(r.code, 0, r.err);
  const made = calls("claude").slice(before);
  assert.equal(made.length, 2);
  assert.deepEqual(made.map((c) => c.model), ["opus-1", "sonnet-1"]); // same CLI's next model first
  // the retry is the same conversation: the session the failed turn started, resumed
  assert.ok(made[1].argv.includes("--resume"));
  assert.equal(made[1].argv[made[1].argv.indexOf("--resume") + 1], made[0].argv[made[0].argv.indexOf("--session-id") + 1]);
  assert.match(reply("f1"), /Claude sonnet-1 says: fix the leak/);
  assert.doesNotMatch(reply("f1"), /Couldn't finish/);
  // the cooldown is shared state, not this process's memory
  assert.equal(store().cooldowns["claude:opus-1"].kind, "quota");
  assert.match(store().cooldowns["claude:opus-1"].reason, /quota/);
});

test("a CLI with no other model fails over to another harness with the dirty worktree handoff", () => {
  setup({ fallbacks: [{ harness: "codex", model: "gpt-5" }] });
  writeFileSync(join(PROJECT, "src", "a.mjs"), "export const a = 2;\n"); // uncommitted work in progress
  const before = { claude: calls("claude").length, codex: calls("codex").length };
  const r = agent("f2", "", ["--", "finish step 2 of the refactor"], { BH_FAKE_LIMIT: "opus-1" });
  assert.equal(r.code, 0, r.err);
  assert.equal(calls("claude").length, before.claude + 1);
  const [codex] = calls("codex").slice(before.codex);
  assert.ok(codex, "the fallback harness ran");
  assert.match(codex.prompt, /## Failover: continue the work in progress/);
  assert.match(codex.prompt, /### Uncommitted changes \(git status --short\)/);
  assert.match(codex.prompt, /src\/a\.mjs/); // the partial diff stat / status names the files
  assert.match(codex.prompt, /### Change size \(git diff --stat\)/);
  assert.match(codex.prompt, /### The message still to answer[\s\S]*finish step 2 of the refactor/);
  assert.match(codex.prompt, /do not start over/i);
  assert.match(reply("f2"), /_Failover: claude → codex \(claude: quota exhausted/);
  assert.match(reply("f2"), /Codex says: finish step 2 of the refactor/);
  const failover = store().activeFailovers ?? store().failovers;
  assert.equal(failover.length, 1);
  assert.deepEqual([failover[0].from, failover[0].to], ["claude:opus-1", "codex:gpt-5"]);
  // both harnesses keep their own conversation, side by side (the limit turn answered nothing, so
  // claude has none to keep)
  const state = agentState("f2");
  assert.equal(state.harness, "codex");
  assert.equal(state.sessions.claude, undefined, "a session that never answered is not saved");
  assert.ok(state.sessions.codex, "codex's own session is kept too");
});

test("the visited set stops a ping-pong across the whole chain", () => {
  setup({ fallbacks: [{ harness: "claude", model: "sonnet-1" }, { harness: "codex", model: "gpt-5" }] });
  const before = { claude: calls("claude").length, codex: calls("codex").length };
  const r = agent("f3", "", ["--", "keep going"], { BH_FAKE_LIMIT: "opus-1,sonnet-1" });
  assert.equal(r.code, 0, r.err);
  const claude = calls("claude").slice(before.claude);
  assert.deepEqual(claude.map((c) => c.model), ["opus-1", "sonnet-1"]); // never back to the cooled primary
  assert.equal(calls("codex").length, before.codex + 1);
  assert.match(reply("f3"), /Codex says: keep going/);
});

test("nothing left: the turn holds cleanly with the reset time instead of a raw stack", () => {
  setup({ fallbacks: [] });
  const r = agent("f4", "", ["--", "try it"], { BH_FAKE_LIMIT: "opus-1" });
  assert.equal(r.code, 0, r.err);
  assert.match(reply("f4"), /\*\*Held — claude: quota exhausted/);
  assert.match(reply("f4"), /back at \d{4}-\d{2}-\d{2}/); // when the limit resets
  assert.match(reply("f4"), /No fallback is configured/);
  assert.doesNotMatch(reply("f4"), /Couldn't finish/);
});

test("Probe A: a held Turn 1 writes its brief but saves no session and moves no cursor", async () => {
  setup({ fallbacks: [] });
  const T = await lib("lib/tasks.mjs");
  const task = T.newTask(PROJECT, { request: "Hold one", steps: ["One"] });
  const base = calls("claude").length;
  assert.equal(agent("h1", "", ["--task", task.id, "--", "one"], { BH_FAKE_LIMIT: "opus-1" }).code, 0);
  assert.match(reply("h1"), /Held/);
  assert.ok(existsSync(join(DATA, "briefs", "dev-h1.md")), "the brief was written before the turn");
  const held = agentState("h1");
  assert.equal(held.session, null, "a session that never answered is not the conversation's");
  assert.equal(held.seen ?? null, null, "a held turn reads nothing, so the cursor does not move");
  // turn 2 is a first turn again: the whole brief, not --resume of a conversation that never ran
  assert.equal(agent("h1", "", ["--task", task.id, "--", "two"], { BH_FAKE_LIMIT: "opus-1" }).code, 0);
  const [first, second] = calls("claude").slice(base);
  assert.ok(first.argv.includes("--append-system-prompt-file"));
  assert.equal(second.argv.includes("--resume"), false, "no --resume of a broken session id");
  assert.ok(second.argv.includes("--append-system-prompt-file"));
  assert.notEqual(second.argv[second.argv.indexOf("--session-id") + 1], first.argv[first.argv.indexOf("--session-id") + 1]);
  assert.equal(agentState("h1").session, null);
});

test("Probe B: turns after the failover continue the live fallback with no repeated failover", async () => {
  setup({ fallbacks: [{ harness: "codex", model: "gpt-5" }] });
  const T = await lib("lib/tasks.mjs");
  const task = T.newTask(PROJECT, { request: "Failover once", steps: ["One"] });
  const base = { claude: calls("claude").length, codex: calls("codex").length };
  for (const msg of ["one", "two", "three"]) assert.equal(agent("fb", "", ["--task", task.id, "--", msg], { BH_FAKE_LIMIT: "opus-1" }).code, 0);
  assert.equal(calls("claude").length, base.claude + 1, "the cooled primary is not tried again");
  const made = calls("codex").slice(base.codex);
  assert.equal(made.length, 3);
  assert.match(made[0].prompt, /## Failover: continue the work in progress/);
  for (const later of made.slice(1)) {
    assert.doesNotMatch(later.prompt, /## Failover/, "no second handoff prompt");
    assert.ok(later.argv.includes("resume"), "the fallback's own conversation continues");
  }
  assert.match(reply("fb"), /Codex says: three/);
  assert.doesNotMatch(reply("fb"), /_Failover:/, "no failover banner on every reply");
  assert.equal((store().failovers ?? []).length, 1, "one active failover, not one per turn");
  assert.equal(T.board(PROJECT, task.id).filter((e) => /^Failover/.test(e.text)).length, 1, "one failover note, not one per turn");
});

test("a held turn loses no brief update: state.seen only moves on a turn that ended well", async () => {
  setup({ fallbacks: [] });
  const T = await lib("lib/tasks.mjs");
  const task = T.newTask(PROJECT, { request: "Seen", steps: ["One", "Two"] });
  const base = calls("claude").length;
  assert.equal(agent("f5", "", ["--task", task.id, "--", "one"]).code, 0);
  T.post(PROJECT, task.id, { kind: "note", text: "the schema changed", from: "qa" });
  assert.equal(agent("f5", "", ["--task", task.id, "--", "two"], { BH_FAKE_LIMIT: "opus-1" }).code, 0);
  assert.match(reply("f5"), /Held/);
  // the update the held turn carried is still unread, so the next turn carries it again
  assert.equal(agent("f5", "", ["--task", task.id, "--", "three"]).code, 0);
  const prompts = calls("claude").slice(base).map((c) => c.prompt);
  assert.match(prompts[1], /## Brief update[\s\S]*the schema changed[\s\S]*two$/);
  assert.match(prompts[2], /## Brief update[\s\S]*the schema changed[\s\S]*three$/);
});

test("a primary still cooling down starts on its fallback, and the two conversations stay apart", () => {
  setup({ fallbacks: [{ harness: "codex", model: "gpt-5" }] });
  assert.equal(agent("f6", "", ["--", "first"], { BH_FAKE_LIMIT: "opus-1" }).code, 0);
  const afterFallback = agentState("f6");
  assert.equal(afterFallback.harness, "codex");
  assert.ok(afterFallback.sessions.codex);
  // the user clears the cooldown: claude starts a conversation of its own, and codex's is still kept
  assert.equal(bh("resilience", "reset", "claude").code, 0);
  const before = calls("claude").length;
  assert.equal(agent("f6", "", ["--", "second"]).code, 0);
  const [back] = calls("claude").slice(before);
  assert.equal(back.model, "opus-1");
  assert.equal(back.argv.includes("--resume"), false, "the limit turn answered nothing, so nothing is resumed");
  assert.ok(back.argv.includes("--session-id"));
  const state = agentState("f6");
  assert.equal(state.harness, "claude");
  assert.ok(state.sessions.claude);
  assert.equal(state.sessions.codex, afterFallback.sessions.codex);
});

test("standard access never silently falls back to a harness without a permission system", () => {
  setup({ fallbacks: [{ harness: "pi", model: "" }] });
  const before = calls("pi").length;
  const r = agent("f7", "", ["--", "do it"], { BH_FAKE_LIMIT: "opus-1" });
  assert.equal(r.code, 0, r.err);
  assert.equal(calls("pi").length, before, "pi must not run at standard access");
  assert.match(reply("f7"), /Held/);
  assert.match(reply("f7"), /pi \(pi has no permission system: not a silent fallback from claude at standard access\)/);
  // the user chose full access: the same fallback is fine
  setup({ fallbacks: [{ harness: "pi", model: "" }], access: "full" });
  const full = agent("f7b", "", ["--", "do it"], { BH_FAKE_LIMIT: "opus-1" });
  assert.equal(full.code, 0, full.err);
  assert.match(reply("f7b"), /pi says: do it/);
});

test("cross-harness failover recomputes the target harness's own skills/MCP allowlist", async () => {
  const T = await lib("lib/tasks.mjs");
  setup({ fallbacks: [{ harness: "codex", model: "gpt-5" }] });
  const home = mkdtempSync(join(tmp, "home-"));
  writeFileSync(join(home, ".claude.json"), JSON.stringify({ mcpServers: { "claude-only": {} } }));
  mkdirSync(join(home, ".codex"), { recursive: true });
  writeFileSync(join(home, ".codex", "config.toml"), '[mcp_servers.codex-only]\ncommand = "node"\n');
  rmSync(join(DATA, "tools"), { recursive: true, force: true });
  try {
    const task = T.newTask(PROJECT, { request: "Allowlist", steps: ["One"] });
    T.updateTask(PROJECT, task.id, (t) => {
      t.skills = { dev: { picked: [], added: [] } }; // nothing ticked: every installed server is denied
    });
    const before = { claude: calls("claude").length, codex: calls("codex").length };
    const r = agent("f8", "", ["--task", task.id, "--", "do it"], { BH_FAKE_LIMIT: "opus-1", HOME: home });
    assert.equal(r.code, 0, r.err);
    const [primary] = calls("claude").slice(before.claude);
    assert.match(primary.argv.join(" "), /mcp__claude-only/, "the primary denies its own installed server");
    const [codex] = calls("codex").slice(before.codex);
    assert.ok(codex, "the fallback ran");
    const flags = codex.argv.join(" ");
    assert.match(flags, /mcp_servers\.codex-only\.enabled=false/, "codex's own unpicked server is denied");
    assert.doesNotMatch(flags, /claude-only/, "the harness it took over from names nothing");
  } finally {
    rmSync(join(DATA, "tools"), { recursive: true, force: true });
  }
});

// ── The store and the resolver, without a process ───────────────────────────────────────

test("pickFallback: same CLI first, then another installed harness, skipping visited and cooled ones", async () => {
  const RZ = await lib("lib/resilience.mjs");
  const known = [{ key: "claude", installed: true }, { key: "codex", installed: true }];
  const agent = { fallbacks: [{ harness: "codex", model: "gpt-5" }, { harness: "claude", model: "sonnet" }] };
  const current = { harness: "claude", model: "opus" };
  const first = RZ.pickFallback({ agent, current, known, access: "standard" });
  assert.deepEqual([first.target.model, first.sameHarness], ["sonnet", true]);
  const next = RZ.pickFallback({ agent, current, known, visited: new Set(["claude:sonnet"]), access: "standard" });
  assert.deepEqual([next.target.harness, next.sameHarness], ["codex", false]);
  const cooled = RZ.pickFallback({ agent, current, known, cooldowns: [{ harness: "claude", model: "sonnet" }], access: "standard" });
  assert.equal(cooled.target.harness, "codex");
  assert.equal(RZ.pickFallback({ agent, current, known, visited: new Set(["claude:sonnet", "codex:gpt-5"]), access: "standard" }), null);
  // the team's chain applies after the agent's own
  const teamWide = RZ.pickFallback({ agent: { fallbacks: [] }, current, config: { fallbacks: [{ harness: "codex", model: "gpt-5" }] }, known, access: "standard" });
  assert.equal(teamWide.target.harness, "codex");
});

test("the non-escalation guard skips a permission-less harness, and can be allowed explicitly", async () => {
  const RZ = await lib("lib/resilience.mjs");
  const known = [{ key: "pi", installed: true }];
  const args = { agent: { fallbacks: [{ harness: "pi", model: "" }] }, current: { harness: "claude", model: "opus" }, known };
  const plan = RZ.fallbackPlan({ ...args, access: "standard" });
  assert.equal(plan.target, null);
  assert.match(plan.skipped[0].reason, /no permission system/);
  assert.equal(RZ.pickFallback({ ...args, access: "standard" }), null);
  assert.equal(RZ.pickFallback({ ...args, access: "full" }).target.harness, "pi");
  assert.equal(RZ.pickFallback({ ...args, access: "standard", allowUnrestrictedFallback: true }).target.harness, "pi");
  // a not-installed harness is passed over too
  const notInstalled = RZ.fallbackPlan({ ...args, known: [], access: "full" });
  assert.match(notInstalled.skipped[0].reason, /not installed/);
});

test("pickFallback: a harness with no headless mode is passed over, not attempted", async () => {
  const RZ = await lib("lib/resilience.mjs");
  const known = [{ key: "claude", installed: true }, { key: "terminal", installed: true }, { key: "codex", installed: true }];
  const args = { agent: { fallbacks: [{ harness: "terminal", model: "" }, { harness: "codex", model: "gpt-5" }] }, current: { harness: "claude", model: "opus" }, known, access: "full" };
  const plan = RZ.fallbackPlan(args);
  assert.equal(plan.target.harness, "codex");
  assert.match(plan.skipped[0].reason, /no headless mode/);
  // a caller may bring its own filter, and it replaces the default
  assert.equal(RZ.pickFallback({ ...args, canRun: (h) => h !== "terminal" }).target.harness, "codex");
  assert.equal(RZ.pickFallback({ ...args, canRun: (h) => h !== "codex" }).target.harness, "terminal");
});

test("cooldowns: recorded, read with the time left, pruned, and cleared by key or harness", async () => {
  const RZ = await lib("lib/resilience.mjs");
  const nowMs = Date.parse("2026-11-21T12:00:00.000Z");
  RZ.clearCooldowns();
  const until = new Date(nowMs + 600_000).toISOString();
  RZ.recordCooldown({ harness: "claude", model: "opus", kind: "quota", reason: "session limit", until, nowMs });
  RZ.recordCooldown({ harness: "claude", model: "", kind: "quota", reason: "default model", until, nowMs });
  RZ.recordCooldown({ harness: "codex", model: "gpt-5", kind: "quota", reason: "plan out", until, nowMs });
  RZ.recordFailover({ agent: "Dev", from: "claude:opus", to: "codex:gpt-5", until, reason: "session limit", nowMs });
  // one active record per agent, however many turns it takes: the newest wins
  RZ.recordFailover({ agent: "Dev", from: "claude:opus", to: "codex:gpt-5", until, reason: "still cooling down", nowMs: nowMs + 1000 });
  RZ.recordFailover({ agent: "QA", from: "claude:opus", to: "codex:gpt-5", until, reason: "session limit", nowMs });
  assert.equal(RZ.isCooledDown("claude", "opus", nowMs), true);
  assert.equal(RZ.isCooledDown("claude", "", nowMs), true);
  assert.equal(RZ.isCooledDown("claude", "opus", nowMs + 600_001), false);
  assert.equal(RZ.readCooldowns(nowMs).length, 3);
  assert.ok(RZ.readCooldowns(nowMs).every((c) => c.remainingMs === 600_000));
  assert.equal(RZ.readFailovers(nowMs).length, 2);
  assert.equal(RZ.readFailovers(nowMs).find((f) => f.agent === "Dev").reason, "still cooling down");
  // Retry now from the key: its cooldown and the failover it caused go together, so no stale pill
  assert.deepEqual(RZ.clearCooldowns("claude:opus"), { cleared: 1, failovers: 2 });
  assert.equal(RZ.readFailovers(nowMs).length, 0);
  assert.deepEqual(RZ.clearCooldowns("claude"), { cleared: 1, failovers: 0 });
  assert.deepEqual(RZ.readCooldowns(nowMs).map((c) => c.key), ["codex:gpt-5"]);
  assert.equal(RZ.clearCooldowns().cleared, 1);
  assert.equal(RZ.readCooldowns(nowMs).length, 0);
  assert.equal(RZ.readFailovers(nowMs).length, 0);
});

test("the resilience config is validated, merged over the defaults and saved atomically", async () => {
  const RZ = await lib("lib/resilience.mjs");
  const saved = RZ.saveResilienceConfig({
    autonomy: "nonsense",
    fallbacks: [{ harness: " codex ", model: " gpt-5 ", effort: "" }, { model: "no-harness" }, "junk"],
    guardrails: { maxStepTurns: "7", requireCheckBeforeDone: "yes" },
  });
  assert.equal(saved.autonomy, "guarded");
  assert.deepEqual(saved.fallbacks, [{ harness: "codex", model: "gpt-5", effort: "" }]);
  assert.equal(saved.guardrails.maxStepTurns, 7);
  assert.equal(saved.guardrails.requireCheckBeforeDone, true); // not a boolean: the default holds
  assert.equal(saved.guardrails.maxConcurrentSpawns, 4);
  assert.deepEqual(saved.guardrails.protectedPaths, RZ.RESILIENCE_DEFAULTS.guardrails.protectedPaths);
  assert.deepEqual(RZ.resilienceConfig(), saved);
  const again = RZ.saveResilienceConfig({ autonomy: "autonomous" });
  assert.equal(again.autonomy, "autonomous");
  assert.deepEqual(again.fallbacks, saved.fallbacks); // an absent key keeps what was saved
  // an empty or null box is not a zero: it keeps what was saved (or the default), never disables the guard
  const blanks = RZ.saveResilienceConfig({ guardrails: { maxTaskSpendUsd: null, maxStepTurns: "", maxStepRetries: false, maxQaRounds: "  " } });
  assert.equal(blanks.guardrails.maxTaskSpendUsd, 10);
  assert.equal(blanks.guardrails.maxStepTurns, 7);
  assert.equal(blanks.guardrails.maxStepRetries, 3);
  assert.equal(blanks.guardrails.maxQaRounds, 3);
  assert.equal(RZ.saveResilienceConfig({ guardrails: { maxSpawnDepth: null } }).guardrails.maxSpawnDepth, 3);
});

test("sessions are kept per harness, and a project change drops them all", async () => {
  const { resumeState } = await lib("lib/agent.mjs");
  const saved = { harness: "codex", session: "cx1", root: "/p", sessions: { claude: "cl-1", codex: "cx1" } };
  const back = resumeState(saved, { harness: "claude", root: "/p" });
  assert.equal(back.state.session, "cl-1");
  assert.deepEqual(back.state.sessions, { claude: "cl-1", codex: "cx1" });
  const moved = resumeState(saved, { harness: "claude", root: "/other" });
  assert.equal(moved.moved, true);
  assert.equal(moved.state.session, null);
  assert.deepEqual(moved.state.sessions ?? {}, {});
});

// ── The CLI contract and the roster ──────────────────────────────────────────────────────

test("bh resilience status|save|reset|pause follow the contract", async () => {
  setup({});
  const T = await lib("lib/tasks.mjs");
  const task = T.newTask(PROJECT, { request: "Status", steps: ["One"] });
  T.recordUsage(PROJECT, task.id, { at: new Date().toISOString(), agent: "Dev", costUsd: 1.5, step: 1 });
  T.recordUsage(PROJECT, task.id, { at: new Date().toISOString(), agent: "Dev", costUsd: 0.5, step: 1 });
  const status = JSON.parse(bh("resilience", "status", "--task", task.id, "--json").out);
  assert.equal(status.config.autonomy, "guarded");
  assert.deepEqual(status.cooldowns, []);
  assert.deepEqual(status.activeFailovers, []);
  assert.deepEqual(status.task, { id: task.id, status: "active", spendUsd: 2, maxTaskSpendUsd: 10, turns: 2, breaker: null });

  const patch = { autonomy: "autonomous", fallbacks: [{ harness: "codex", model: "gpt-5", effort: "high" }], guardrails: { maxStepTurns: 9 } };
  const saved = JSON.parse(bh("resilience", "save", "--data", encodeURIComponent(JSON.stringify(patch)), "--json").out);
  assert.equal(saved.ok, true);
  assert.equal(saved.config.autonomy, "autonomous");
  assert.deepEqual(saved.config.fallbacks, patch.fallbacks);
  assert.equal(saved.config.guardrails.maxStepTurns, 9);
  assert.equal(saved.config.guardrails.maxTaskSpendUsd, 10);

  // the user's own setting: a headless agent may not change it
  const refused = spawnSync(process.execPath, [BH, "resilience", "save", "--data", encodeURIComponent(JSON.stringify({ autonomy: "autonomous" }))], { cwd: PROJECT, encoding: "utf8", env: ENV({ BH_AGENT: "dev-1" }) });
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /Resilience settings is the user's to change/);

  const RZ = await lib("lib/resilience.mjs");
  const soon = new Date(Date.now() + 600_000).toISOString();
  RZ.recordCooldown({ harness: "claude", model: "opus" , until: soon });
  RZ.recordCooldown({ harness: "codex", model: "gpt-5", until: soon });
  const cleared = JSON.parse(bh("resilience", "reset", "claude", "--json").out);
  assert.deepEqual(cleared, { ok: true, cleared: 1 });
  const paused = JSON.parse(bh("resilience", "pause", "--task", task.id, "--json").out);
  assert.deepEqual(paused, { ok: true, id: task.id, status: "paused" });
  assert.equal(JSON.parse(bh("resilience", "reset", "--json").out).cleared, 1);
});

test("bh team save keeps an agent's fallback chain through roster.clean", () => {
  const roster = { agents: [{ role: "dev", harness: "claude", model: "opus-1", fallbacks: [{ harness: " codex ", model: " gpt-5 ", effort: "high" }, { model: "junk" }] }], known: KNOWN };
  const saved = bh("team", "save", "--data", encodeURIComponent(JSON.stringify(roster)), "--json");
  assert.equal(saved.code, 0, saved.err);
  const team = JSON.parse(bh("team", "--json").out);
  const dev = team.agents.find((a) => a.role === "dev");
  assert.deepEqual(dev.fallbacks, [{ harness: "codex", model: "gpt-5", effort: "high" }]);
});
