// The allowlist: pins, the classifier's picks and whatever was added after a blocker; `picked:
// null` keeps the old behaviour (pins only, nothing ticked = no restriction), a `picked` array
// denies everything installed outside the allowed set (even when it is empty). `bh spawn --skill`
// adds a name, and the step records what that spawn was allowed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const tmp = mkdtempSync(join(tmpdir(), "bh-skills-allowlist-"));
const APP = join(tmp, "app");
const PROJECT = join(tmp, "project");
mkdirSync(PROJECT, { recursive: true });
process.env.BH_APP_HOME = APP;
process.env.XDG_CONFIG_HOME = join(tmp, "xdg");

const BH = fileURLToPath(new URL("../mods/bot-herdr/engine/bh.mjs", import.meta.url));
const { allowedFor, limitArgs } = await import(new URL("../mods/bot-herdr/roster.js", import.meta.url));
const team = await import(new URL("../mods/bot-herdr/engine/lib/team.mjs", import.meta.url));
const T = await import(new URL("../mods/bot-herdr/engine/lib/tasks.mjs", import.meta.url));
const P = await import(new URL("../mods/bot-herdr/engine/lib/plans.mjs", import.meta.url));

const installed = { skills: ["alpha", "beta", "gamma"], mcp: ["github", "db"] };
const dev = { role: "dev", name: "Dev", harness: "claude", skills: [], mcp: [], installed };

test("allowedFor: no entry is the old behaviour; an empty picked array restricts everything", () => {
  assert.deepEqual(allowedFor(dev, null), { skills: null, mcp: null });
  assert.deepEqual(allowedFor({ ...dev, skills: ["alpha"] }, null), { skills: ["alpha"], mcp: null });
  assert.deepEqual(allowedFor(dev, { picked: [], added: [] }), { skills: [], mcp: [] });
});

test("allowedFor: pins, picks and added together, skills and MCP servers kept apart", () => {
  const agent = { ...dev, skills: ["alpha"], mcp: ["github"], allowed: { picked: ["beta"], added: ["gamma", "db"] } };
  assert.deepEqual(allowedFor(agent, agent.allowed), { skills: ["alpha", "beta", "gamma"], mcp: ["github", "db"] });
});

test("limitArgs: claude denies what is neither pinned, picked nor added", () => {
  assert.deepEqual(limitArgs({ ...dev, allowed: null }), []); // nothing ticked, classifier off: no flags
  const all = limitArgs({ ...dev, allowed: { picked: [], added: [] } });
  assert.deepEqual(JSON.parse(all[1]), { permissions: { deny: ["Skill(skill:alpha)", "Skill(skill:beta)", "Skill(skill:gamma)", "mcp__github", "mcp__db"] } });
  const some = limitArgs({ ...dev, skills: ["alpha"], allowed: { picked: ["beta"], added: [] } });
  assert.deepEqual(JSON.parse(some[1]), { permissions: { deny: ["Skill(skill:gamma)", "mcp__github", "mcp__db"] } });
});

test("limitArgs: codex denies the unpicked MCP servers it can name, and nothing for skills", () => {
  const codex = { ...dev, harness: "codex", allowed: { picked: ["github"], added: [] } };
  assert.deepEqual(limitArgs({ ...codex, installed: { skills: ["alpha"], mcp: ["github", "my.server", "db"] } }), ["-c", "mcp_servers.db.enabled=false"]);
  assert.deepEqual(limitArgs({ ...codex, allowed: null }), []);
});

test("the brief names the allowed skills and says how to ask for another", () => {
  const agent = { ...dev, harness: "pi", allowed: { picked: ["alpha"], added: ["extra"] } };
  const brief = team.brief(agent, { mode: "child", root: PROJECT });
  assert.match(brief, /## Your skills and MCP servers\nUse only these skills: alpha, extra\. If you need another, post a blocker naming it\.\nUse only these MCP servers: none\./);
  assert.doesNotMatch(team.brief({ ...dev, harness: "pi" }, { mode: "child", root: PROJECT }), /## Your skills and MCP servers/);
});

const LOG = join(tmp, "hc.jsonl");
const fake = join(tmp, "fake-hc.mjs");
writeFileSync(fake, `import { appendFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(LOG)}, JSON.stringify(process.argv.slice(2)) + "\\n");\n`);

function setTeam() {
  mkdirSync(join(APP, "data", "bot-herdr"), { recursive: true });
  writeFileSync(join(APP, "data", "bot-herdr", "agents.json"), JSON.stringify({
    agents: [{ role: "research", harness: "pi", model: "", effort: "" }],
    known: [{ key: "pi", name: "Pi", run: ["pi"], installed: true }],
  }));
}

const spawn = (...args) => spawnSync(process.execPath, [BH, "spawn", ...args], {
  cwd: PROJECT, encoding: "utf8", timeout: 20000,
  env: { ...process.env, BH_APP_HOME: APP, XDG_CONFIG_HOME: join(tmp, "xdg"), BH_HC: fake, HC_TERMINAL_ID: "", BH_AGENT: "" },
});

test("bh spawn --skill adds to the agent's picks, and the step records what the spawn was allowed", () => {
  setTeam();
  const task = T.newTask(PROJECT, { request: "Skills", steps: ["One"] });
  T.updateTask(PROJECT, task.id, (t) => {
    t.skills = { research: { picked: ["alpha"], added: [] } };
  });
  const r = spawn("research", "--name", "r1", "--task", task.id, "--step", "1", "--skill", "extra", "read it");
  assert.equal(r.status, 0, r.stderr);
  const saved = T.loadTask(PROJECT, task.id);
  assert.deepEqual(saved.skills.research, { picked: ["alpha"], added: ["extra"] });
  assert.deepEqual(saved.steps[0].skills, { pinned: [], picked: ["alpha"], added: ["extra"], fallback: false });
  const listed = spawnSync(process.execPath, [BH, "task", "list", "--all", "--json"], {
    cwd: PROJECT, encoding: "utf8", env: { ...process.env, BH_APP_HOME: APP, XDG_CONFIG_HOME: join(tmp, "xdg"), PATH: "" },
  });
  assert.deepEqual(JSON.parse(listed.stdout).find((t) => t.id === task.id).steps[0].skills, saved.steps[0].skills);
  assert.ok(readFileSync(LOG, "utf8").includes("agent"));
});

test("a spawn with no picks (classifier off) falls back to the pins", () => {
  setTeam();
  const task = T.newTask(PROJECT, { request: "No picks", steps: ["One"] });
  const r = spawn("research", "--name", "r2", "--task", task.id, "--step", "1", "read it");
  assert.equal(r.status, 0, r.stderr);
  const saved = T.loadTask(PROJECT, task.id);
  assert.deepEqual(saved.steps[0].skills, { pinned: [], picked: [], added: [], fallback: true });
});

test("bh spawn --panel --skill records the skill on the plan", () => {
  setTeam();
  const plan = P.newPlan(PROJECT, { idea: "A plan", skills: { research: { picked: ["alpha"], added: [] } } });
  const r = spawn("research", "--name", "research-panel", "--panel", plan.id, "--skill", "extra", "read the plan");
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(P.loadPlan(PROJECT, plan.id).skills.research, { picked: ["alpha"], added: ["extra"] });
});

test("allowedFor: --skill additions join the pins when the classifier is off", () => {
  const agent = { ...dev, skills: ["alpha"] };
  assert.deepEqual(allowedFor(agent, { picked: null, added: ["beta"] }), { skills: ["alpha", "beta"], mcp: null });
  const flags = limitArgs({ ...agent, allowed: { picked: null, added: ["beta"] } });
  assert.deepEqual(JSON.parse(flags[1]), { permissions: { deny: ["Skill(skill:gamma)"] } });
  // no pins at all: still no restriction, additions or not
  assert.deepEqual(allowedFor({ ...dev, skills: [], mcp: [] }, { picked: null, added: ["beta"] }), { skills: null, mcp: null });
});

test("allowedFor: a picked MCP server never lands in the skills list", () => {
  const agent = { ...dev, installed: { skills: ["alpha"], mcp: ["github", "db"] } };
  assert.deepEqual(allowedFor(agent, { picked: ["github"], added: [] }), { skills: [], mcp: ["github"] });
  const brief = team.brief({ ...agent, allowed: { picked: ["github"], added: [] } }, { mode: "child", root: PROJECT });
  assert.match(brief, /Use only these skills: none\./);
  assert.match(brief, /Use only these MCP servers: github\./);
});

test("allowedFor: with picked null a --skill addition restricts only its own pinned category", () => {
  const agent = { ...dev, skills: ["alpha"], mcp: [], installed: { skills: ["alpha", "beta"], mcp: ["github", "db"] } };
  assert.deepEqual(allowedFor(agent, { picked: null, added: ["github"] }), { skills: ["alpha"], mcp: null });
  assert.deepEqual(limitArgs({ ...agent, allowed: { picked: null, added: ["github"] } }), ["--settings", JSON.stringify({ permissions: { deny: ["Skill(skill:beta)"] } })]);
  assert.deepEqual(allowedFor(agent, { picked: null, added: ["beta"] }), { skills: ["alpha", "beta"], mcp: null });
});
