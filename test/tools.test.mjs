// Skills and MCP servers per agent: `bh tools <harness>` reads what each harness has installed
// (fixture folders under a temp HOME), the launch denies what was not ticked, the brief names the
// picks, and `bh sync` removes our templates for agents that are gone.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "bh-tools-"));
process.env.BH_APP_HOME = join(tmp, "app");
process.env.XDG_CONFIG_HOME = join(tmp, "xdg");
const T = await import("../mods/bot-herdr/engine/lib/tools.mjs");
const team = await import("../mods/bot-herdr/engine/lib/team.mjs");
const { argvOf } = await import("../mods/bot-herdr/roster.js");

const put = (path, text) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};
const skill = (dir, name, description) => put(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\nBody.\n`);
const names = (list) => list.map((x) => `${x.source}:${x.name}`);

function fixture(label) {
  const home = join(tmp, label, "home");
  const root = join(tmp, label, "project");
  mkdirSync(home, { recursive: true });
  mkdirSync(root, { recursive: true });
  return { home, root };
}

test("claude: user (and synced two folders down), project and installed plugin skills; user, project-entry and .mcp.json servers", () => {
  const { home, root } = fixture("claude");
  skill(join(home, ".claude", "skills", "review"), "review", "Reviews code");
  skill(join(home, ".claude", "skills", "synced", "abc", "docx"), "docx", '"Word \\"documents\\""');
  put(join(home, ".claude", "skills", "folder-only", "SKILL.md"), "no frontmatter");
  skill(join(root, ".claude", "skills", "deploy"), "deploy", ">\n  Ships it\n  to prod");
  put(join(home, ".claude", "plugins", "cache", "mkt", "kit", "1.0.0", ".claude-plugin", "plugin.json"), '{"name":"kit"}');
  skill(join(home, ".claude", "plugins", "cache", "mkt", "kit", "1.0.0", "skills", "climb"), "climb", "Climbs");
  skill(join(home, ".claude", "plugins", "marketplaces", "mkt", "other", "skills", "nope"), "nope", "Not installed");
  put(join(home, ".claude.json"), JSON.stringify({ mcpServers: { github: {} }, projects: { [root.replace(/\\/g, "/")]: { mcpServers: { db: {} } } } }));
  put(join(root, ".mcp.json"), JSON.stringify({ mcpServers: { "my.server": {}, github: {} } }));
  const r = T.listTools("claude", { home, root, env: {}, refresh: true });
  assert.equal(r.supported, true);
  assert.deepEqual(names(r.skills).sort(), ["plugin:kit:climb", "project:deploy", "user:docx", "user:folder-only", "user:review"]);
  assert.equal(r.skills.find((s) => s.name === "docx").description, 'Word "documents"');
  assert.equal(r.skills.find((s) => s.name === "deploy").description, "Ships it");
  assert.deepEqual(names(r.mcp), ["user:github", "project:db", "project:my.server"]);
});

test("codex: CODEX_HOME and .agents skills; [mcp_servers.<id>] headers from both config.toml files", () => {
  const { home, root } = fixture("codex");
  const codexHome = join(home, "custom-codex");
  skill(join(codexHome, "skills", "imagegen"), "imagegen", "Images");
  skill(join(home, ".agents", "skills", "lint"), "lint", "Lints");
  skill(join(root, ".agents", "skills", "release"), "release", "Releases");
  put(join(codexHome, "config.toml"), '[mcp_servers.docs]\ncommand = "x"\n[mcp_servers.docs.env]\nA = "1"\n[mcp_servers."quoted.id"]\n# [mcp_servers.commented]\n');
  put(join(root, ".codex", "config.toml"), "  [ mcp_servers.local ]\n[profiles.mcp_servers]\n");
  const r = T.listTools("codex", { home, root, env: { CODEX_HOME: codexHome }, refresh: true });
  assert.deepEqual(names(r.skills), ["user:imagegen", "user:lint", "project:release"]);
  assert.deepEqual(names(r.mcp), ["user:docs", "user:quoted.id", "project:local"]);
});

test("opencode: its skills folders; mcp.servers or mcp keys from opencode.json[c] with comments and trailing commas", () => {
  const { home, root } = fixture("opencode");
  skill(join(home, ".config", "opencode", "skills", "plan"), "plan", "Plans");
  skill(join(root, ".opencode", "skills", "ship"), "ship", "Ships");
  put(join(home, ".config", "opencode", "opencode.jsonc"), '// global\n{ "mcp": { "servers": { "playwright": { "command": ["x"], }, }, "timeout": 5 }, /* url: "http://a//b" */ }');
  put(join(root, "opencode.json"), '{ "url": "http://x//y", "mcp": { "sentry": { "type": "remote" }, "timeout": 1 } }');
  const r = T.listTools("opencode", { home, root, env: {}, refresh: true });
  assert.deepEqual(names(r.skills), ["user:plan", "project:ship"]);
  assert.deepEqual(names(r.mcp), ["user:playwright", "project:sentry"]);
});

test("other harnesses are not supported; an answer is cached until a skills folder changes or --refresh", () => {
  assert.deepEqual(T.listTools("omp"), { harness: "omp", supported: false, skills: [], mcp: [] }); // no skills folder known
  const { home, root } = fixture("cache");
  skill(join(home, ".claude", "skills", "one"), "one", "First");
  assert.equal(T.listTools("claude", { home, root, env: {} }).skills.length, 1);
  skill(join(home, ".claude", "skills", "two"), "two", "Second");
  const later = new Date(Date.now() + 2000);
  utimesSync(join(home, ".claude", "skills"), later, later); // installing a skill moves the folder's mtime on
  assert.equal(T.listTools("claude", { home, root, env: {} }).skills.length, 2); // a new skill folder: read again
  skill(join(home, ".claude", "skills", "two"), "renamed", "Second"); // inside one skill: its folder is unchanged
  assert.equal(T.listTools("claude", { home, root, env: {} }).skills.some((s) => s.name === "renamed"), false);
  assert.equal(T.listTools("claude", { home, root, env: {}, refresh: true }).skills.some((s) => s.name === "renamed"), true);
});

test("the launch denies what was not ticked: claude by --settings, codex by -c; nothing ticked, nothing denied", () => {
  const installed = { skills: ["review", "deploy"], mcp: ["github", "my.server", "db"] };
  const claude = argvOf({ harness: "claude", model: "", effort: "", args: "", skills: ["review"], mcp: ["db"], installed });
  const settings = JSON.parse(claude[claude.indexOf("--settings") + 1]);
  assert.deepEqual(settings, { permissions: { deny: ["Skill(skill:deploy)", "mcp__github", "mcp__my_server"] } });
  const codex = argvOf({ harness: "codex", model: "", effort: "", args: "", skills: ["review"], mcp: ["db"], installed });
  assert.deepEqual(codex, ["codex", "-c", "mcp_servers.github.enabled=false"]); // my.server cannot be named in -c
  assert.deepEqual(argvOf({ harness: "claude", model: "", effort: "", args: "", skills: [], mcp: [], installed }), ["claude"]);
  assert.deepEqual(argvOf({ harness: "opencode", model: "", effort: "", args: "", skills: ["a"], mcp: ["b"], installed }), ["opencode"]);
});

test("the brief names the picks after the role, and leaves the section out when nothing is ticked", () => {
  const dev = { id: "dev", role: "dev", name: "Dev", harness: "claude", model: "", effort: "", args: "", instructions: "" };
  const limited = team.brief({ ...dev, skills: ["review", "deploy"], mcp: ["github"] }, { root: tmp });
  assert.match(limited, /## Your skills and MCP servers\nUse only these skills: review, deploy\. If you need another, post a blocker naming it\.\nUse only these MCP servers: github\./);
  assert.ok(limited.indexOf("## Your skills and MCP servers") < limited.indexOf("## Your tools here"));
  assert.match(team.brief({ ...dev, skills: [], mcp: ["x"] }, { root: tmp }), /## Your skills and MCP servers\nUse only these MCP servers: x\./);
  assert.doesNotMatch(team.brief({ ...dev, skills: [], mcp: [] }, { root: tmp }), /Your skills and MCP servers/);
});

test("sync removes our template for an agent that is gone and keeps the user's own", () => {
  const dir = team.templatesDir();
  put(join(process.env.BH_APP_HOME, "data", "bot-herdr", "agents.json"), JSON.stringify({ agents: [], known: [] }));
  put(join(dir, "old-agent.md"), "---\ncommand: claude\nmanaged: bot-herdr\n---\n");
  put(join(dir, "mine.md"), "---\ncommand: claude\n---\nThe user's own.\n");
  team.sync(tmp);
  assert.equal(existsSync(join(dir, "old-agent.md")), false);
  assert.equal(existsSync(join(dir, "mine.md")), true);
  assert.equal(existsSync(join(dir, "dev.md")), true);
});
