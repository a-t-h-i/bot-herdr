#!/usr/bin/env node
// purpose: find where a name is defined and used, or where a setting lives (--config), across tracked and untracked files; --body prints each definition's full declaration
// usage: node {script} <name> [--defs] [--body] [--max-lines <n>] [--include-meta] [--max <lines>]  |  node {script} --config <KEY or dotted.key>
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { declarations, fail, isNoise, parseArgs, projectRoot, searchProject, stripBomAndCr } from "./lib/common.mjs";

const { flags, rest } = parseArgs(process.argv.slice(2), ["defs", "body", "include-meta"]);
const name = typeof flags.config === "string" ? flags.config : rest[0];
if (!name || !/^[\w$.-]+$/.test(name)) fail("usage: find_symbol.mjs <name> [--defs] [--body] [--max-lines <n>] [--include-meta] [--max <lines>]");
const root = projectRoot();
const max = Number(flags.max ?? 60);
const includeMeta = Boolean(flags["include-meta"]);
const backend = typeof flags.backend === "string" ? flags.backend : undefined;
if (flags.config) config();
const escaped = name.replace(/[.$]/g, "\\$&");
const result = searchProject(root, { pattern: escaped, regex: true, word: true, includeMeta, max: 100000, backend });
if (!result.ok) fail(`find_symbol: ${result.error}`);
const hits = result.matches.filter((hit) => !isNoise(hit.file));
if (hits.length === 0) {
  console.log(`"${name}" not found in project files.`);
  process.exit(1);
}
const DEFINES = new RegExp([
  `(function\\*?|class|interface|type|enum|struct|trait|impl|def|fn|func|module|namespace)\\s+${escaped}\\b`,
  `(const|let|var|val)\\s+${escaped}\\s*[:=]`,
  `export\\s+(default\\s+)?(async\\s+)?(function|class|const)\\s+${escaped}\\b`,
  `^\\s*(public|private|protected|static|async|\\s)*${escaped}\\s*\\([^)]*\\)\\s*[:{]`,
  `^\\s*${escaped}\\s*[:=]\\s*(async\\s*)?(\\(|function)`,
  `func\\s+\\([^)]*\\)\\s+${escaped}\\b`,
].join("|"));
const defs = [];
const uses = [];
for (const hit of hits) {
  const body = hit.text.trim();
  (DEFINES.test(body) ? defs : uses).push({ file: hit.file, line: hit.line, body: body.length > 140 ? `${body.slice(0, 140)}…` : body });
}
console.log(`## Defined (${defs.length})`);
for (const hit of defs) console.log(`${hit.file}:${hit.line}  ${hit.body}`);
if (flags.body) printBodies(defs);
if (flags.defs) process.exit(0);
const byFile = new Map();
for (const hit of uses) byFile.set(hit.file, [...(byFile.get(hit.file) ?? []), hit]);
console.log(`## Used (${uses.length} in ${byFile.size} files)`);
let shown = 0;
for (const [file, list] of byFile) {
  if (shown >= max) {
    console.log(`… ${uses.length - shown} more uses; narrow with search_code`);
    break;
  }
  for (const hit of list.slice(0, 5)) {
    console.log(`${file}:${hit.line}  ${hit.body}`);
    shown += 1;
  }
  if (list.length > 5) console.log(`${file}  … ${list.length - 5} more in this file`);
}

/** The full declaration behind each definition, numbered, within one shared line budget. */
function printBodies(defs) {
  const budget = Math.max(0, Number(flags["max-lines"] ?? 120));
  let left = budget;
  const texts = new Map();
  for (const hit of defs) {
    if (left <= 0) {
      console.log(`… bodies capped at ${budget} lines (--max-lines)`);
      return;
    }
    if (!texts.has(hit.file)) {
      try { texts.set(hit.file, declarations(stripBomAndCr(readFileSync(join(root, hit.file), "utf8")), hit.file)); } catch { texts.set(hit.file, []); }
    }
    const all = texts.get(hit.file);
    const decl = all.find((item) => item.start === hit.line) ?? all.find((item) => item.start <= hit.line && item.end >= hit.line);
    if (!decl) continue;
    const rows = stripBomAndCr(readFileSync(join(root, hit.file), "utf8")).split("\n");
    const end = Math.min(decl.end, rows.length);
    console.log(`\n### ${hit.file}:${decl.start}-${end}  ${decl.name}`);
    for (let n = decl.start; n <= end && left > 0; n += 1, left -= 1) console.log(`${String(n).padStart(5)} ${rows[n - 1]}`);
  }
}

/** Where a setting lives: config and env files that set it, code that reads it from the environment or a settings object. */
function config() {
  const leaf = name.split(".").pop();
  const found = searchProject(root, { pattern: leaf.replace(/[$]/g, "\\$&"), regex: true, word: true, includeMeta, max: 100000, backend });
  if (!found.ok) fail(`find_symbol: ${found.error}`);
  const hits = found.matches.filter((hit) => !isNoise(hit.file));
  if (hits.length === 0) {
    console.log(`"${name}" is not set or read in any project file.`);
    process.exit(1);
  }
  const CONFIG_FILE = /(^|\/)(\.env[\w.-]*|[\w.-]+\.(ya?ml|toml|ini|cfg|conf|properties)|[\w.-]*config[\w.-]*\.json|settings[\w.-]*\.json|package\.json|Dockerfile[\w.-]*|docker-compose[\w.-]*|Makefile|\.github\/.*)$/i;
  const e = leaf.replace(/[$]/g, "\\$&");
  const SETS = new RegExp(`^\\s*(-\\s*)?(export\\s+|ENV\\s+|ARG\\s+|set\\s+)?["']?${e}["']?\\s*[:=]|^\\s*(ENV|ARG)\\s+${e}\\b`);
  const ENV_READ = new RegExp(`process\\.env(\\.${e}\\b|\\[\\s*["'\`]${e}["'\`])|import\\.meta\\.env\\.${e}\\b|os\\.(environ(\\.get)?\\s*[\\[(]\\s*["']${e}["']|getenv\\(\\s*["']${e}["'])|os\\.(Getenv|LookupEnv)\\(\\s*"${e}"|env::var\\(\\s*"${e}"|ENV\\[["']${e}["']\\]|\\$\\{?${e}\\b`);
  const groups = { set: [], env: [], code: [] };
  for (const hit of hits) {
    const body = hit.text.trim();
    const row = `${hit.file}:${hit.line}  ${body.length > 140 ? `${body.slice(0, 140)}…` : body}`;
    if (CONFIG_FILE.test(hit.file) && SETS.test(body)) groups.set.push(row);
    else if (ENV_READ.test(body)) groups.env.push(row);
    else if (name.includes(".") ? body.includes(name) || new RegExp(`[.\\["']${e}\\b`).test(body) : true) groups.code.push(row);
  }
  console.log(`## Set in config or env files (${groups.set.length})`);
  for (const row of groups.set) console.log(row);
  console.log(`## Read from the environment (${groups.env.length})`);
  for (const row of groups.env.slice(0, max)) console.log(row);
  console.log(`## Other mentions: defaults, schemas, settings reads (${groups.code.length})`);
  for (const row of groups.code.slice(0, max)) console.log(row);
  if (groups.code.length > max) console.log(`… ${groups.code.length - max} more`);
  process.exit(0);
}
