// Skill discovery for every harness the engine can run: each reader looks in that harness's own
// skills folders (SKILL.md with name and description), and `bh tools --list` says which harnesses
// can be read at all. The 24 h cache and folder-mtime staleness apply to all of them.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const tmp = mkdtempSync(join(tmpdir(), "bh-skills-discovery-"));
const APP = join(tmp, "app");
const PROJECT = join(tmp, "project");
mkdirSync(PROJECT, { recursive: true });
process.env.BH_APP_HOME = APP;
process.env.XDG_CONFIG_HOME = join(tmp, "xdg");
const BH = fileURLToPath(new URL("../mods/bot-herdr/engine/bh.mjs", import.meta.url));
const T = await import(new URL("../mods/bot-herdr/engine/lib/tools.mjs", import.meta.url));

const put = (path, text) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};
const skill = (dir, name, description = "") => put(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\nBody.\n`);
const names = (r) => r.skills.map((s) => `${s.source}:${s.name}`).sort();
const fixture = (label) => {
  const home = join(tmp, label, "home");
  const root = join(tmp, label, "project");
  mkdirSync(home, { recursive: true });
  mkdirSync(root, { recursive: true });
  return { home, root };
};

test("gemini: ~/.gemini/skills, the project's .gemini/skills and ~/.agents/skills", () => {
  const { home, root } = fixture("gemini");
  skill(join(home, ".gemini", "skills", "alpha"), "alpha", "A");
  skill(join(root, ".gemini", "skills", "beta"), "beta");
  skill(join(home, ".agents", "skills", "shared"), "shared");
  const r = T.listTools("gemini", { home, root, env: {}, refresh: true });
  assert.equal(r.supported, true);
  assert.deepEqual(names(r), ["project:beta", "user:alpha", "user:shared"]);
  assert.equal(r.skills.find((s) => s.name === "alpha").description, "A");
  assert.deepEqual(r.mcp, []);
});

test("qwen: ~/.qwen/skills, the project's .qwen/skills and ~/.agents/skills", () => {
  const { home, root } = fixture("qwen");
  skill(join(home, ".qwen", "skills", "q1"), "q1", "Q");
  skill(join(root, ".qwen", "skills", "q2"), "q2");
  const r = T.listTools("qwen", { home, root, env: {}, refresh: true });
  assert.deepEqual(names(r), ["project:q2", "user:q1"]);
});

test("antigravity: ~/.gemini/config/skills and the project's .agents/skills", () => {
  const { home, root } = fixture("antigravity");
  skill(join(home, ".gemini", "config", "skills", "ag1"), "ag1");
  skill(join(root, ".agents", "skills", "ag2"), "ag2");
  const r = T.listTools("antigravity", { home, root, env: {}, refresh: true });
  assert.deepEqual(names(r), ["project:ag2", "user:ag1"]);
});

test("pi: <agent-dir>/skills (PI_CODING_AGENT_DIR), .pi/skills and the Agent Skills folders", () => {
  const { home, root } = fixture("pi");
  skill(join(home, ".pi", "agent", "skills", "p1"), "p1");
  skill(join(root, ".pi", "skills", "p2"), "p2");
  skill(join(home, ".agents", "skills", "p3"), "p3");
  skill(join(root, ".agents", "skills", "p4"), "p4");
  assert.deepEqual(names(T.listTools("pi", { home, root, env: {}, refresh: true })), ["project:p2", "project:p4", "user:p1", "user:p3"]);
  const custom = join(tmp, "pi-custom", "skills");
  skill(join(custom, "p5"), "p5");
  assert.deepEqual(names(T.listTools("pi", { home, root, env: { PI_CODING_AGENT_DIR: join(tmp, "pi-custom") }, refresh: true })), ["project:p2", "project:p4", "user:p3", "user:p5"]);
});

test("omp is left unsupported: no skills folder is known for it", () => {
  const { home, root } = fixture("omp");
  assert.deepEqual(T.listTools("omp", { home, root, env: {} }), { harness: "omp", supported: false, skills: [], mcp: [] });
});

test("a new skill folder under a newly read harness is seen without --refresh", () => {
  const { home, root } = fixture("cache");
  const skills = join(home, ".qwen", "skills");
  skill(join(skills, "one"), "one");
  assert.deepEqual(names(T.listTools("qwen", { home, root, env: {} })), ["user:one"]);
  skill(join(skills, "two"), "two");
  const later = new Date(Date.now() + 2000);
  utimesSync(skills, later, later);
  assert.deepEqual(names(T.listTools("qwen", { home, root, env: {} })), ["user:one", "user:two"]);
});

test("bh tools --list prints every harness the engine knows, and whether it can be read", () => {
  const r = spawnSync(process.execPath, [BH, "tools", "--list", "--json"], {
    cwd: PROJECT, encoding: "utf8", env: { ...process.env, BH_APP_HOME: APP, XDG_CONFIG_HOME: join(tmp, "xdg"), PATH: "" },
  });
  assert.equal(r.status, 0, r.stderr);
  const list = JSON.parse(r.stdout);
  const keys = list.map((h) => h.key);
  for (const key of ["claude", "codex", "opencode", "gemini", "qwen", "antigravity", "pi", "omp"]) assert.ok(keys.includes(key), key);
  assert.equal(list.find((h) => h.key === "claude").name, "Claude Code");
  assert.deepEqual(list.filter((h) => !h.supported).map((h) => h.key), ["omp"]);
  assert.ok(list.every((h) => typeof h.name === "string" && typeof h.supported === "boolean"));
});
