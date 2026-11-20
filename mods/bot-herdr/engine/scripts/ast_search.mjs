#!/usr/bin/env node
// purpose: structural AST search with ast-grep (pattern, optional language) and compact file:line output, excluding engine noise by default
// usage: node {script} <pattern> [paths…] [--lang <lang>] [--max <n>] [--include-meta]
import { spawnSync } from "node:child_process";
import { relative } from "node:path";
import { fail, isMetaNoise, parseArgs, projectRoot, resolveSafePath, resolveTool, toPosix } from "./lib/common.mjs";

const { flags, rest } = parseArgs(process.argv.slice(2), ["include-meta"]);
const pattern = rest[0];
if (!pattern) fail("usage: ast_search.mjs <pattern> [paths…] [--lang <lang>] [--max <n>] [--include-meta]");
const root = projectRoot();
const tool = resolveTool("ast-grep");
if (!tool) {
  fail([
    "ast_search: ast-grep is not installed.",
    "Run `node install.mjs` to fetch the bundled binaries, or use `bh scripts run search_code` / `bh scripts run find_symbol` meanwhile.",
  ].join("\n"));
}
const max = Math.max(0, Number(flags.max ?? 60) || 60);
let paths;
try {
  paths = rest.slice(1).map((path) => toPosix(relative(root, resolveSafePath(root, path))));
} catch (error) {
  fail(`ast_search: ${error.message}`);
}
const args = ["run", `--pattern=${pattern}`];
if (typeof flags.lang === "string") args.push("--lang", flags.lang);
args.push("--json=stream", "--", ...(paths.length ? paths : ["."]));
const r = spawnSync(tool, args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, windowsHide: true });
if (r.error) fail(`ast_search: ast-grep could not run: ${r.error.message}`);
if (r.status !== 0 && r.status !== 1) fail(`ast_search: ast-grep failed (exit ${r.status}): ${r.stderr.trim()}`);

function lineOf(row) {
  if (Number.isFinite(row.line)) return row.line;
  const line = row.range?.start?.line ?? row.range?.byteOffset?.line;
  return Number.isFinite(line) ? line + 1 : 0;
}

const hits = [];
for (const row of String(r.stdout ?? "").split("\n")) {
  if (!row.trim()) continue;
  let parsed;
  try { parsed = JSON.parse(row); } catch { continue; }
  for (const hit of Array.isArray(parsed) ? parsed : [parsed]) {
    const file = toPosix(hit.file ?? hit.path ?? "");
    if (!file || (!flags["include-meta"] && isMetaNoise(file)) || /(^|\/)(\.git|node_modules)(\/|$)/.test(file)) continue;
    const text = String(hit.text ?? hit.lines ?? hit.matched ?? "").split("\n")[0].trim();
    hits.push({ file, line: lineOf(hit), text });
  }
}
hits.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
const shown = hits.slice(0, max);
console.log(`## ${shown.length} structural match(es) (${toPosix(tool.split(/[\\/]/).pop())})`);
for (const hit of shown) console.log(`${hit.file}:${hit.line}: ${hit.text}`);
if (hits.length === 0) console.log(`No matches for "${pattern}".`);
if (hits.length > shown.length) console.log(`… ${hits.length - shown.length} more match(es) cut (--max ${max})`);
