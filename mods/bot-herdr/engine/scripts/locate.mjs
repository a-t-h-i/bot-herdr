#!/usr/bin/env node
// purpose: deterministically locate the files a request is about: filename/path matches, content hits, one-hop imports and their tests, ranked with reasons and top declarations
// usage: node {script} <query or keywords> [--max <n>] [--json]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { declarations, fail, importGraph, isCode, isTest, listProjectFiles, parseArgs, projectRoot, searchProject, stripBomAndCr, testsFor, toPosix } from "./lib/common.mjs";

const { flags, rest } = parseArgs(process.argv.slice(2), ["json", "include-meta"]);
const query = rest.join(" ").trim();
if (!query) fail("usage: locate.mjs <query or keywords> [--max <n>] [--json]");
const root = projectRoot();
const max = Math.max(1, Number(flags.max ?? 15) || 15);
const tokens = [...new Set(query.toLowerCase().split(/[^a-z0-9_$]+/).filter((token) => token.length > 1))];
const words = tokens.length ? tokens : [query.toLowerCase()];
const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const scores = new Map();
const reasons = new Map();
const hits = new Map();

function touch(file, score, reason) {
  const path = toPosix(file);
  scores.set(path, (scores.get(path) ?? 0) + score);
  reasons.set(path, [...new Set([...(reasons.get(path) ?? []), reason])]);
}

let files;
try {
  files = listProjectFiles(root);
} catch (error) {
  fail(`locate: ${error.message}`);
}
for (const file of files) {
  const lower = file.toLowerCase();
  const base = lower.split("/").pop();
  if (base.includes(query.toLowerCase())) touch(file, 8, "filename");
  for (const token of words) if (base.includes(token)) touch(file, 4, `name:${token}`);
  if (lower.includes(query.toLowerCase())) touch(file, 2, "path");
}

const found = searchProject(root, { pattern: words.map(escapeRe).join("|"), regex: true, ignoreCase: true, word: true, max: 300 });
if (!found.ok) fail(`locate: ${found.error}`);
for (const hit of found.matches) {
  touch(hit.file, 1, "content");
  if ((hits.get(hit.file) ?? []).length < 3) hits.set(hit.file, [...(hits.get(hit.file) ?? []), { line: hit.line, text: hit.text.trim().slice(0, 160) }]);
}

const seeds = [...scores.keys()].sort((a, b) => scores.get(b) - scores.get(a) || a.localeCompare(b)).slice(0, 12);
if (seeds.length > 0) {
  try {
    const graph = importGraph(root);
    const reverse = new Map();
    for (const [file, deps] of graph) for (const dep of deps) reverse.set(dep, [...(reverse.get(dep) ?? []), file]);
    for (const seed of seeds) {
      for (const dep of graph.get(seed) ?? []) touch(dep, 3, `imports ${seed}`);
      for (const user of reverse.get(seed) ?? []) touch(user, 2, `imports ${seed}`);
    }
  } catch { /* the import graph is a bonus, not a requirement */ }
  const covered = testsFor(root, seeds.filter((file) => isCode(file) && !isTest(file)));
  for (const [file, list] of covered) for (const test of list) touch(test, 2, `tests ${file}`);
}

const ranked = [...scores].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max);
const candidates = ranked.map(([file, score]) => {
  let top = [];
  try {
    const text = stripBomAndCr(readFileSync(join(root, file), "utf8"));
    const all = declarations(text, file);
    const named = all.filter((decl) => words.some((word) => decl.name.toLowerCase().includes(word)));
    top = (named.length ? named : all.filter((decl) => decl.indent === 0)).slice(0, 3);
  } catch { /* an unreadable candidate still ranks by path */ }
  return { file, score, reasons: reasons.get(file) ?? [], hits: hits.get(file) ?? [], declarations: top };
});

if (flags.json) {
  console.log(JSON.stringify({ query, candidates }, null, 2));
} else if (candidates.length === 0) {
  console.log(`No candidates for "${query}".`);
} else {
  console.log(`## ${candidates.length} candidate file(s) for "${query}"`);
  candidates.forEach((candidate, index) => {
    console.log(`${index + 1}. ${candidate.file}  [${candidate.score}]  ${candidate.reasons.join(", ")}`);
    for (const decl of candidate.declarations) console.log(`   ${candidate.file}:${decl.start}-${decl.end}  ${decl.name}`);
    for (const hit of candidate.hits) console.log(`   ${candidate.file}:${hit.line}  ${hit.text}`);
  });
}
