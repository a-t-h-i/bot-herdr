// The skills and MCP servers a harness has installed (`bh tools <harness>`), read from its own
// folders and config files (never by starting it: `claude mcp list` health-checks every server).
// Settings lists them so the user can tick what each agent may use; the launch denies the rest.
// One answer per harness and project is cached under DATA for a day, like `bh models`.
//
// Claude Code: docs code.claude.com/docs/en/skills and /mcp. Codex: learn.chatgpt.com/docs/build-skills
// and its config reference. OpenCode: opencode.ai/docs/skills and /config.

import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { DATA, ensureDir, readJson, readText, writeJson } from "./core.mjs";

/** The harnesses whose skills and MCP servers we can read. */
export const SUPPORTED = ["claude", "codex", "opencode"];
export const CACHE_MS = 24 * 60 * 60 * 1000;

const dirs = (path) => {
  try {
    return readdirSync(path, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => join(path, d.name));
  } catch {
    return [];
  }
};
const keys = (o) => (o && typeof o === "object" && !Array.isArray(o) ? Object.keys(o) : []);
const named = (list, source) => list.map((name) => ({ name, source }));
/** The first of each name: a project entry never doubles a user one. */
const unique = (list) => list.filter((x, i) => list.findIndex((y) => y.name === x.name) === i);

/** A YAML scalar's first line: a block (`>` or `|`) gives its first indented line. */
function scalar(lines, i) {
  const value = lines[i].replace(/^[\w-]+:[ \t]*/, "").trim();
  if (/^"(.*)"$/.test(value)) return value.slice(1, -1).replace(/\\(["\\])/g, "$1");
  if (!/^[|>][-+]?$/.test(value)) return value.replace(/^'(.*)'$/, "$1");
  return (lines.slice(i + 1).find((l) => l.trim()) ?? "").trim();
}

/** SKILL.md frontmatter: `name` and the first line of `description` ("" when absent). */
export function frontmatter(text) {
  const head = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/.exec(String(text ?? ""))?.[1] ?? "";
  const lines = head.split(/\r?\n/);
  const field = (k) => {
    const i = lines.findIndex((l) => l.startsWith(`${k}:`));
    return i < 0 ? "" : scalar(lines, i);
  };
  return { name: field("name"), description: field("description") };
}

/** The skills in a folder: each subfolder with a SKILL.md, looking `depth` folders further into one without. */
export function skillsIn(folder, source, depth = 0, prefix = "") {
  return dirs(folder).flatMap((dir) => {
    const file = join(dir, "SKILL.md");
    if (!existsSync(file)) return depth > 0 ? skillsIn(dir, source, depth - 1, prefix) : [];
    const fm = frontmatter(readText(file));
    return [{ name: `${prefix}${fm.name || basename(dir)}`, description: fm.description, source }];
  });
}

/** Every `skills` folder of an installed plugin (marketplaces only list plugins one could install). */
function pluginSkillDirs(dir, depth) {
  if (depth < 0) return [];
  return dirs(dir).filter((d) => basename(d) !== "marketplaces").flatMap((d) => (basename(d) === "skills" ? [d] : pluginSkillDirs(d, depth - 1)));
}

/** Plugin skills, named as Claude Code calls them: `<plugin>:<skill>`. */
function pluginSkills(home) {
  return pluginSkillDirs(join(home, ".claude", "plugins"), 5).flatMap((skills) => {
    const plugin = readJson(join(dirname(skills), ".claude-plugin", "plugin.json"), null)?.name || basename(dirname(skills));
    return skillsIn(skills, "plugin", 0, `${plugin}:`);
  });
}

const samePath = (a, b) => {
  const norm = (p) => String(p).replace(/\\/g, "/").replace(/\/+$/, "");
  return process.platform === "win32" ? norm(a).toLowerCase() === norm(b).toLowerCase() : norm(a) === norm(b);
};

/** Claude Code's servers: ~/.claude.json (top level = user, its project entry = project) and .mcp.json. */
function claudeMcp(home, root) {
  const user = readJson(join(home, ".claude.json"), {}) ?? {};
  const project = Object.entries(user.projects ?? {}).find(([p]) => samePath(p, root))?.[1];
  return [
    ...named(keys(user.mcpServers), "user"),
    ...named(keys(project?.mcpServers), "project"),
    ...named(keys(readJson(join(root, ".mcp.json"), {})?.mcpServers), "project"),
  ];
}

function readClaude({ home, root }) {
  // ~/.claude/skills/synced/<id>/<skill>: skills synced from claude.ai sit two folders down.
  const skills = [...skillsIn(join(home, ".claude", "skills"), "user", 2), ...skillsIn(join(root, ".claude", "skills"), "project"), ...pluginSkills(home)];
  return { skills, mcp: claudeMcp(home, root) };
}

/** `[mcp_servers.<id>]` (or a subtable of it) headers in a config.toml: the ids, in order. */
export function tomlServers(text) {
  const found = [...String(text ?? "").matchAll(/^[ \t]*\[[ \t]*mcp_servers\.(?:"([^"]+)"|'([^']+)'|([\w-]+))[ \t]*[\].]/gm)];
  return [...new Set(found.map((m) => m[1] ?? m[2] ?? m[3]))];
}

function readCodex({ home, root, env }) {
  const codexHome = env.CODEX_HOME || join(home, ".codex");
  const skills = [...skillsIn(join(codexHome, "skills"), "user", 1), ...skillsIn(join(home, ".agents", "skills"), "user"), ...skillsIn(join(root, ".agents", "skills"), "project")];
  const mcp = [...named(tomlServers(readText(join(codexHome, "config.toml"))), "user"), ...named(tomlServers(readText(join(root, ".codex", "config.toml"))), "project")];
  return { skills, mcp };
}

/** JSON with comments and trailing commas (opencode.jsonc); null when it does not parse. */
export function jsonc(text) {
  // Strings are kept whole, so a "//" inside one is not a comment; commas go once comments are gone.
  const keep = (m, str) => str ?? "";
  const plain = String(text ?? "").replace(/^\uFEFF/, "")
    .replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, keep)
    .replace(/("(?:\\.|[^"\\])*")|,(?=\s*[}\]])/g, keep);
  try {
    return JSON.parse(plain);
  } catch {
    return null;
  }
}

/** A config's servers: `mcp.servers` (the current schema) or `mcp` itself (the older one). */
const opencodeServers = (cfg) => {
  const mcp = cfg?.mcp;
  const table = mcp?.servers && typeof mcp.servers === "object" ? mcp.servers : mcp;
  return keys(table).filter((k) => table[k] && typeof table[k] === "object");
};

const opencodeFiles = (dir) => ["opencode.json", "opencode.jsonc"].map((f) => jsonc(readText(join(dir, f))));

function readOpencode({ home, root }) {
  const config = join(home, ".config", "opencode");
  const skills = [
    ...skillsIn(join(config, "skills"), "user"), ...skillsIn(join(home, ".claude", "skills"), "user"), ...skillsIn(join(home, ".agents", "skills"), "user"),
    ...skillsIn(join(root, ".opencode", "skills"), "project"), ...skillsIn(join(root, ".claude", "skills"), "project"), ...skillsIn(join(root, ".agents", "skills"), "project"),
  ];
  const user = opencodeFiles(config).flatMap(opencodeServers);
  const project = [...opencodeFiles(root), ...opencodeFiles(join(root, ".opencode"))].flatMap(opencodeServers);
  return { skills, mcp: [...named(user, "user"), ...named(project, "project")] };
}

const READERS = { claude: readClaude, codex: readCodex, opencode: readOpencode };

/** One cache file per harness and project (project skills and servers differ). */
function cacheFile(harness, root) {
  const key = String(root).replace(/\\/g, "/").toLowerCase();
  return join(DATA, "tools", `${harness}-${createHash("sha1").update(key).digest("hex").slice(0, 10)}.json`);
}

function read(harness, opts) {
  try {
    const found = READERS[harness](opts);
    return { harness, supported: true, skills: unique(found.skills), mcp: unique(found.mcp) };
  } catch (e) {
    return { harness, supported: true, skills: [], mcp: [], error: String(e?.message ?? e).split("\n")[0] };
  }
}

/**
 * What a harness has installed: `{ harness, supported, skills: [{name, description, source}],
 * mcp: [{name, source}], error? }`. A harness we cannot read gets `supported: false` and empty
 * lists; a failure gives empty lists and `error`. `refresh` reads again past the cache.
 */
export function listTools(harness, { root = process.cwd(), refresh = false, home = homedir(), env = process.env } = {}) {
  if (!SUPPORTED.includes(harness)) return { harness, supported: false, skills: [], mcp: [] };
  const file = cacheFile(harness, root);
  const saved = refresh ? null : readJson(file, null);
  if (saved && Array.isArray(saved.skills) && Date.now() - Number(saved.at ?? 0) < CACHE_MS) {
    const answer = { ...saved };
    delete answer.at;
    return answer;
  }
  const answer = read(harness, { home, root, env });
  if (!answer.error) {
    ensureDir(dirname(file));
    writeJson(file, { ...answer, at: Date.now() });
  }
  return answer;
}

/** The installed names alone, for the launch to deny what was not ticked. */
export function installedNames(harness, opts) {
  const r = listTools(harness, opts);
  return { skills: r.skills.map((s) => s.name), mcp: r.mcp.map((m) => m.name) };
}
