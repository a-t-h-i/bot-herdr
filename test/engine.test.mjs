// The bh tool: its libraries, and the command line end to end in a throwaway app home.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const tmp = mkdtempSync(join(tmpdir(), "bh-test-"));
const APP = join(tmp, "app");
const XDG = join(tmp, "xdg");
const PROJECT = join(tmp, "project");
mkdirSync(PROJECT, { recursive: true });
// The libraries read where the person's data lives when they load.
process.env.BH_APP_HOME = APP;
process.env.XDG_CONFIG_HOME = XDG;

const BH = fileURLToPath(new URL("../mods/bot-herdr/engine/bh.mjs", import.meta.url));
const lib = (name) => import(new URL(`../mods/bot-herdr/engine/${name}`, import.meta.url));
const enc = (v) => encodeURIComponent(typeof v === "string" ? v : JSON.stringify(v));
// The chat and Settings run bh outside any terminal; an agent runs it in one (HC_TERMINAL_ID).
const run = (args, env) => {
  const r = spawnSync(process.execPath, [BH, ...args], { cwd: PROJECT, encoding: "utf8", env: { ...process.env, BH_APP_HOME: APP, XDG_CONFIG_HOME: XDG, HC_TERMINAL_ID: "", BH_AGENT: "", PATH: "", ...env } });
  return { code: r.status, out: r.stdout, err: r.stderr };
};
const bh = (...args) => run(args, {});
const asAgent = (...args) => run(args, { HC_TERMINAL_ID: "t1" });
const json = (...args) => JSON.parse(bh(...args, "--json").out);

test("arguments: flags, booleans that take no value, repeated flags and --data", async () => {
  const { parseArgs, bodyText } = await lib("lib/core.mjs");
  const { flags, rest } = parseArgs(["spawn", "qa", "--review", "the brief", "--option", "A", "--option", "B", "--name=x"], ["option"]);
  assert.equal(flags.review, true);
  assert.deepEqual(flags.option, ["A", "B"]);
  assert.equal(flags.name, "x");
  assert.deepEqual(rest, ["spawn", "qa", "the brief"]);
  assert.equal(bodyText({ data: enc('{"a": "b c"}') }, ["ignored"]), '{"a": "b c"}');
});

test("tasks: steps from a plan, timing, board", async () => {
  const T = await lib("lib/tasks.mjs");
  const root = mkdtempSync(join(tmp, "p-"));
  const steps = T.stepsFromMarkdown("## Plan\n### Steps\n1. Add the **endpoint**\n2. Draw the page\n### Objective\n1. not a step");
  assert.deepEqual(steps, ["Add the endpoint", "Draw the page"]);
  const task = T.newTask(root, { request: "Add a page", steps });
  assert.match(task.id, /^t-\d{8}-\w+$/);
  T.moveStep(task, 1, "start", { agent: "dev" });
  task.steps[0].started = new Date(Date.now() - 120000).toISOString();
  T.moveStep(task, 1, "done");
  assert.ok(task.steps[0].workedMs >= 119000);
  assert.ok(T.worked(task) >= 119000);
  T.saveTask(root, task);
  assert.equal(T.listTasks(root).length, 1);
  T.post(root, task.id, { kind: "contract", text: "GET /api/x returns { ok }", from: "dev" });
  assert.equal(T.board(root, task.id)[0].kind, "contract");
  assert.throws(() => T.post(root, task.id, { kind: "gossip", text: "x" }));
});

test("plans: drafts set the status and title; comments quote their line", async () => {
  const P = await lib("lib/plans.mjs");
  const root = mkdtempSync(join(tmp, "p-"));
  const plan = P.newPlan(root, { idea: "Dark mode" });
  P.writeDraft(plan, "## Status\nREADY\n## Title\nDark mode toggle\n## Plan\n### Steps\n1. Add tokens");
  assert.equal(plan.status, "ready");
  assert.equal(plan.title, "Dark mode toggle");
  assert.equal(plan.round, 1);
  const c = P.comment(plan, { line: 4, text: "Keep the light theme default" });
  assert.equal(c.quote, "Dark mode toggle");
  assert.equal(P.openComments(plan).length, 1);
});

test("questions: numbered, seats, options with meanings, a recommendation and mockups", async () => {
  const { parseQuestions } = await lib("lib/ask.mjs");
  const q = parseQuestions([
    "A few things first.",
    "1. [DESIGN] Where does the toggle go?",
    "   - Top bar (Recommended) — next to the avatar",
    "     ```mockup",
    "     <div>top</div>",
    "     ```",
    "   - Settings — under Appearance",
    "2. [DEV] Store it where?",
    "   - Cookie — read on the server",
    "   - Local storage — client only",
  ].join("\n"));
  assert.equal(q.intro, "A few things first.");
  assert.equal(q.questions.length, 2);
  assert.equal(q.questions[0].seat, "DESIGN");
  assert.deepEqual(q.questions[0].options.map((o) => [o.label, o.recommended]), [["Top bar", true], ["Settings", false]]);
  assert.match(q.questions[0].options[0].mockup, /<div>top<\/div>/);
  assert.equal(q.questions[1].options[1].meaning, "client only");
});

test("knowledge: added once, kept per agent, in the brief", async () => {
  const K = await lib("lib/knowledge.mjs");
  const root = mkdtempSync(join(tmp, "p-"));
  assert.equal(K.add(root, "dev", "Tests run with node --test", "Facts").added, true);
  assert.equal(K.add(root, "dev", "Tests run with node --test", "Facts").added, false);
  assert.match(K.forBrief(root, "dev"), /node --test/);
  assert.equal(K.forBrief(root, "design"), "");
});

test("classifier rules: triage, track and effort routing (the configured level is the ceiling)", async () => {
  const C = await lib("classifier/index.mjs");
  const t = C.triageByRules("Fix the typo in the button label");
  assert.equal(t.size, "trivial");
  assert.equal(t.kind, "bugfix");
  assert.equal(t.domains.design, 1);
  assert.equal(C.trackFor(t), "fast");
  assert.equal(C.trackFor({ size: "large" }), "full");
  const levels = ["low", "medium", "high", "xhigh", "max"];
  assert.equal(C.routeEffort({ level: "trivial", confidence: 0.9 }, "high", levels), "low");
  assert.equal(C.routeEffort({ level: "simple", confidence: 0.75 }, "high", levels), "medium");
  assert.equal(C.routeEffort({ level: "simple", confidence: 0.6 }, "high", levels), "high");
  assert.equal(C.routeEffort({ level: "complex", confidence: 0.99 }, "medium", levels), "medium");
  assert.equal(C.routeEffort(null, "high", levels), "high");
  const off = C.makeClassifier({ ...C.DEFAULTS, enabled: false });
  assert.deepEqual(await C.route(off, "make the button blue"), { route: "orchestrator", probability: null, by: "rules" });
});

test("briefs: every agent learns how to start child agents; the panel and reviewers don't", async () => {
  const team = await lib("lib/team.mjs");
  const lead = team.brief({ id: "orchestrator", role: "orchestrator", name: "Orchestrator", harness: "claude", lead: true }, { mode: "lead", root: PROJECT });
  assert.match(lead, /## Child agents/);
  assert.match(lead, /bh spawn dev/);
  assert.match(lead, /bh reply/);
  const dev = team.brief({ id: "dev", role: "dev", name: "Dev", harness: "claude" }, { mode: "lead", root: PROJECT });
  assert.match(dev, /You can start child agents/);
  assert.doesNotMatch(dev, /bh spawn dev\b/); // not itself
  const child = team.brief({ id: "qa", role: "qa", name: "QA", harness: "claude" }, { mode: "child", root: PROJECT, parent: "t1", task: "t-20261110-abcd" });
  assert.match(child, /only when your brief says you may/);
  assert.match(child, /reports\/qa\.md/);
  const panel = team.brief({ id: "dev", role: "dev", name: "Dev", harness: "claude" }, { mode: "panel", root: PROJECT });
  assert.doesNotMatch(panel, /## Child agents/);
  for (const text of [lead, dev, child, panel]) assert.doesNotMatch(text, /bot[- ]lobby/i);
});

test("briefs: the person's own instructions for an agent close its brief", async () => {
  const team = await lib("lib/team.mjs");
  const text = team.brief({ id: "dev", role: "dev", name: "Dev", harness: "claude", instructions: "Never commit." }, { mode: "child", root: PROJECT });
  assert.ok(text.endsWith("\n\n## The person's instructions for you\n\nNever commit.\n\n[end of brief]"));
  assert.doesNotMatch(team.brief({ id: "dev", role: "dev", name: "Dev", harness: "claude", instructions: "" }, { mode: "child", root: PROJECT }), /The person's instructions/);
});

test("bh team save keeps instructions; a sentence in extra arguments is moved there and saved", () => {
  const file = join(APP, "data", "bot-herdr", "agents.json");
  const known = [{ key: "claude", name: "Claude Code", run: ["claude"], installed: true }];
  assert.equal(bh("team", "save", "--data", enc({ agents: [{ role: "qa", harness: "claude", instructions: "Be strict." }, { role: "scout", harness: "claude", args: "Read only." }], known })).code, 0);
  const saved = JSON.parse(readFileSync(file, "utf8")).agents;
  assert.equal(saved[0].instructions, "Be strict.");
  assert.deepEqual([saved[1].args, saved[1].instructions], ["", "Read only."]);
});

test("bh end to end: team, config, harnesses, tasks, questions", () => {
  const known = [{ key: "claude", name: "Claude Code", run: ["claude"], installed: true }];
  assert.equal(bh("team", "save", "--data", enc({ agents: [{ role: "dev", harness: "claude", model: "claude-sonnet-5-5", effort: "high" }], known })).code, 0);
  assert.match(bh("team").out, /Dev: claude --model claude-sonnet-5-5 --effort high/);
  // Claude Code runs headless: the template starts the agent terminal, which writes its own brief.
  const template = () => readFileSync(join(XDG, "herdr-core", "templates", "dev.md"), "utf8");
  assert.match(template(), /command: node \S+bh\.mjs agent dev --mode child\n/);
  assert.match(template(), /managed: bot-herdr/);
  bh("access", "--data", enc({ headless: false })); // rewrites the templates
  assert.match(template(), /command: claude --model claude-sonnet-5-5 --effort high/);
  assert.match(template(), /## Child agents/);
  bh("access", "--data", enc({ headless: true }));

  const config = json("config", "--data", enc({ enabled: true, key: "secret", features: { qa: false } }));
  assert.equal(config.enabled, true);
  assert.equal(config.key, true); // never the key itself
  assert.equal(config.features.qa, false);
  assert.equal(config.features.triage, true);
  assert.equal(json("config", "--data", enc({ host: "openrouter" })).key, true); // a change without a key keeps it

  bh("harness", "add", "omp", "--name", "Oh My Pi", "--run", "omp --fast");
  const programs = JSON.parse(readFileSync(join(APP, "programs.json"), "utf8"));
  assert.deepEqual(programs.programs.omp.run, ["omp", "--fast"]);
  assert.equal(programs.programs.omp.name, "Oh My Pi");

  const task = json("task", "new", "Add a health endpoint", "--title", "Health endpoint");
  assert.equal(task.title, "Health endpoint");
  bh("task", "steps", task.id, "Add GET /health", "Test it");
  assert.equal(json("task", "show", task.id).steps.length, 2);
  bh("task", "archive", task.id);
  assert.equal(json("task", "list").length, 0);
  assert.equal(json("task", "list", "--all").length, 1);

  const asked = JSON.parse(asAgent("ask", "Which database?", "--option", "Postgres (Recommended) — what we run", "--option", "SQLite — simpler", "--json").out);
  assert.equal(asked.from, "t1");
  assert.equal(asked.questions[0].options[0].recommended, true);
  assert.equal(json("questions").length, 1);
  const answered = bh("answer", asked.id, "--data", enc([{ picks: ["Postgres"], text: "" }]));
  assert.match(answered.out, /Saved, but couldn't send/); // no hc here; the answer is still kept
  assert.equal(json("questions").length, 0);
  assert.ok(existsSync(join(APP, "data", "bot-herdr", "questions", "answered", `${asked.id}.json`)));
  assert.match(bh("answers", asked.id).out, /Postgres/);
});

test("agents can't change the settings that decide what they may do", () => {
  for (const args of [["access", "full"], ["access", "--allow", "rm"], ["team", "save", "--data", enc({ agents: [] })], ["config", "--data", enc({ enabled: true })], ["harness", "add", "x", "--run", "x"]]) {
    const r = run(args, { BH_AGENT: "Dev", HC_TERMINAL_ID: "t1" });
    assert.equal(r.code, 1, args.join(" "));
    assert.match(r.err, /the person's to change/);
  }
  assert.equal(json("access").access, "standard");
  const set = json("access", "--data", enc({ access: "full", allow: "npm test, git commit", headless: false }));
  assert.deepEqual(set, { access: "full", allow: ["npm test", "git commit"], headless: false, git: "off" });
  assert.equal(json("access", "standard").access, "standard");
  assert.equal(json("access").headless, false);
  bh("access", "--data", enc({ headless: true, allow: "" }));
  assert.deepEqual(json("access"), { access: "standard", allow: [], headless: true, git: "off" });
});

test("nothing in the repository mentions the old name", () => {
  const r = spawnSync("git", ["grep", "-il", "-e", "bot-lobby", "-e", "bot lobby", "--", ".", ":!test/engine.test.mjs"], { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8" });
  assert.equal(r.stdout.trim(), "");
});

writeFileSync(join(tmp, ".done"), "");
