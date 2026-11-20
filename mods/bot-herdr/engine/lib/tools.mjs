// The skills and MCP servers a harness has installed (`bh tools <harness>`), read from its own
// folders and config files (never by starting it: `claude mcp list` health-checks every server).
// Settings lists them so the user can tick what each agent may use; the launch denies the rest.
// One answer per harness and project is cached under DATA for a day, like `bh models`.
//
// Claude Code: docs code.claude.com/docs/en/skills and /mcp. Codex: learn.chatgpt.com/docs/build-skills
// and its config reference. OpenCode: opencode.ai/docs/skills and /config. Gemini CLI, Qwen Code and
// Antigravity: their skills folders (see README/docs). pi: docs/skills.md and configuration.md, which
// put skills in <agent-dir>/skills (default ~/.pi/agent), .pi/skills and the Agent Skills folders.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { DATA, ensureDir, readJson, readText, writeJson } from "./core.mjs";

/** The harnesses whose skills and MCP servers we can read. */
export const SUPPORTED = ["claude", "codex", "opencode", "gemini", "qwen", "antigravity", "pi"];

/** Each harness the engine runs, with the name Settings shows it by (saved names come first). */
const HARNESS_NAMES = {
  claude: "Claude Code",
  codex: "Codex",
  opencode: "OpenCode",
  gemini: "Gemini",
  qwen: "Qwen Code",
  antigravity: "Antigravity",
  pi: "Pi",
  omp: "Oh My Pi",
};

/** `bh tools --list`: every harness the engine knows, and whether its skills and MCP servers can be read. */
export function listHarnesses(known = []) {
  const names = new Map((known ?? []).map((k) => [String(k.key), String(k.name ?? k.key)]));
  for (const [key, name] of Object.entries(HARNESS_NAMES)) if (!names.has(key)) names.set(key, name);
  return [...names].map(([key, name]) => ({ key, name, supported: SUPPORTED.includes(key) }));
}
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

/** Plugin skills, named as Claude Code calls them: `<plugin>:<skill>`, and the folders they came from. */
function pluginSkills(home) {
  const folders = pluginSkillDirs(join(home, ".claude", "plugins"), 5);
  const skills = folders.flatMap((skills) => {
    const plugin = readJson(join(dirname(skills), ".claude-plugin", "plugin.json"), null)?.name || basename(dirname(skills));
    return skillsIn(skills, "plugin", 0, `${plugin}:`);
  });
  return { skills, folders };
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
  const user = join(home, ".claude", "skills");
  const project = join(root, ".claude", "skills");
  const plugins = pluginSkills(home);
  const skills = [...skillsIn(user, "user", 2), ...skillsIn(project, "project"), ...plugins.skills];
  return { skills, mcp: claudeMcp(home, root), watched: [user, project, ...plugins.folders] };
}

/** `[mcp_servers.<id>]` (or a subtable of it) headers in a config.toml: the ids, in order. */
export function tomlServers(text) {
  const found = [...String(text ?? "").matchAll(/^[ \t]*\[[ \t]*mcp_servers\.(?:"([^"]+)"|'([^']+)'|([\w-]+))[ \t]*[\].]/gm)];
  return [...new Set(found.map((m) => m[1] ?? m[2] ?? m[3]))];
}

function readCodex({ home, root, env }) {
  const codexHome = env.CODEX_HOME || join(home, ".codex");
  const folders = [join(codexHome, "skills"), join(home, ".agents", "skills"), join(root, ".agents", "skills")];
  const skills = [...skillsIn(folders[0], "user", 1), ...skillsIn(folders[1], "user"), ...skillsIn(folders[2], "project")];
  const mcp = [...named(tomlServers(readText(join(codexHome, "config.toml"))), "user"), ...named(tomlServers(readText(join(root, ".codex", "config.toml"))), "project")];
  return { skills, mcp, watched: folders };
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
  const folders = [
    join(config, "skills"), join(home, ".claude", "skills"), join(home, ".agents", "skills"),
    join(root, ".opencode", "skills"), join(root, ".claude", "skills"), join(root, ".agents", "skills"),
  ];
  const skills = [...folders.slice(0, 3).flatMap((d) => skillsIn(d, "user")), ...folders.slice(3).flatMap((d) => skillsIn(d, "project"))];
  const user = opencodeFiles(config).flatMap(opencodeServers);
  const project = [...opencodeFiles(root), ...opencodeFiles(join(root, ".opencode"))].flatMap(opencodeServers);
  return { skills, mcp: [...named(user, "user"), ...named(project, "project")], watched: folders };
}

/** A harness whose skills live in plain folders (no MCP file we read): SKILL.md skills only. */
function skillFolders(entries) {
  return { skills: entries.flatMap(([folder, source]) => skillsIn(folder, source)), mcp: [], watched: entries.map(([folder]) => folder) };
}

function readGemini({ home, root }) {
  return skillFolders([[join(home, ".gemini", "skills"), "user"], [join(root, ".gemini", "skills"), "project"], [join(home, ".agents", "skills"), "user"]]);
}

function readQwen({ home, root }) {
  return skillFolders([[join(home, ".qwen", "skills"), "user"], [join(root, ".qwen", "skills"), "project"], [join(home, ".agents", "skills"), "user"]]);
}

function readAntigravity({ home, root }) {
  return skillFolders([[join(home, ".gemini", "config", "skills"), "user"], [join(root, ".agents", "skills"), "project"]]);
}

/** pi: `<agent-dir>/skills` (PI_CODING_AGENT_DIR, else ~/.pi/agent), the project's .pi and .agents skills. */
function readPi({ home, root, env }) {
  const agentDir = env.PI_CODING_AGENT_DIR || join(home, ".pi", "agent");
  return skillFolders([[join(agentDir, "skills"), "user"], [join(root, ".pi", "skills"), "project"], [join(home, ".agents", "skills"), "user"], [join(root, ".agents", "skills"), "project"]]);
}

const READERS = { claude: readClaude, codex: readCodex, opencode: readOpencode, gemini: readGemini, qwen: readQwen, antigravity: readAntigravity, pi: readPi };

/** One cache file per harness and project (project skills and servers differ). */
function cacheFile(harness, root) {
  const key = String(root).replace(/\\/g, "/").toLowerCase();
  return join(DATA, "tools", `${harness}-${createHash("sha1").update(key).digest("hex").slice(0, 10)}.json`);
}

function read(harness, opts) {
  try {
    const found = READERS[harness](opts);
    return { answer: { harness, supported: true, skills: unique(found.skills), mcp: unique(found.mcp) }, watched: found.watched ?? [] };
  } catch (e) {
    return { answer: { harness, supported: true, skills: [], mcp: [], error: String(e?.message ?? e).split("\n")[0] }, watched: [] };
  }
}

/** A folder's mtime in ms, or null when it is gone. */
const mtime = (path) => {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return null;
  }
};

/** The folders a read looked at, with their mtimes: a folder that changed since makes the answer stale. */
const stamp = (folders) => [...new Set(folders)].map((path) => ({ path, mtimeMs: mtime(path) }));

/** Whether a cached answer still holds: younger than a day, and no folder it read has changed since. */
function fresh(saved) {
  if (!Array.isArray(saved?.skills) || !Array.isArray(saved.watched) || Date.now() - Number(saved.at ?? 0) >= CACHE_MS) return false;
  return saved.watched.every((w) => mtime(w.path) === w.mtimeMs);
}

/**
 * What a harness has installed: `{ harness, supported, skills: [{name, description, source}],
 * mcp: [{name, source}], error? }`. A harness we cannot read gets `supported: false` and empty
 * lists; a failure gives empty lists and `error`. `refresh` reads again past the cache; otherwise
 * the cached answer is used for a day, or until a skills folder it read changes.
 */
export function listTools(harness, { root = process.cwd(), refresh = false, home = homedir(), env = process.env } = {}) {
  if (!SUPPORTED.includes(harness)) return { harness, supported: false, skills: [], mcp: [] };
  const file = cacheFile(harness, root);
  const saved = refresh ? null : readJson(file, null);
  if (saved && fresh(saved)) {
    const answer = { ...saved };
    delete answer.at;
    delete answer.watched;
    return answer;
  }
  const { answer, watched } = read(harness, { home, root, env });
  if (!answer.error) {
    ensureDir(dirname(file));
    writeJson(file, { ...answer, at: Date.now(), watched: stamp(watched) });
  }
  return answer;
}

/** The installed names alone, for the launch to deny what was not ticked. */
export function installedNames(harness, opts) {
  const r = listTools(harness, opts);
  return { skills: r.skills.map((s) => s.name), mcp: r.mcp.map((m) => m.name) };
}
