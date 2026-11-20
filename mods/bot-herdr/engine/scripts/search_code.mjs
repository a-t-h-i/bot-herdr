#!/usr/bin/env node
// purpose: search project text or regex with a token budget: literal/regex, word, glob, context lines and hard output caps, across tracked and untracked files
// usage: node {script} <pattern> [paths…] [--literal|-F] [--ignore-case|-i] [--word|-w] [--glob <pattern>] [--context <n>|-C <n>] [--max <n>] [--include-meta]
import { fail, parseArgs, projectRoot, searchProject, toPosix } from "./lib/common.mjs";

const SHORT = { "-F": "--literal", "-i": "--ignore-case", "-w": "--word", "-C": "--context" };
// Short flags are rewritten before `parseArgs`, which knows only `--name` options; after `--`
// nothing is a flag any more, so `search_code -- -i` searches for "-i".
let pastSeparator = false;
const argv = process.argv.slice(2).flatMap((arg) => {
  if (pastSeparator) return [arg];
  if (arg === "--") { pastSeparator = true; return [arg]; }
  if (SHORT[arg]) return [SHORT[arg]];
  if (arg.startsWith("-C") && arg.length > 2) return ["--context", arg.slice(2)];
  return [arg];
});
const { flags, rest } = parseArgs(argv, ["literal", "F", "ignore-case", "i", "word", "w", "include-meta"]);
const pattern = rest[0];
if (!pattern) fail("usage: search_code.mjs <pattern> [paths…] [--literal|-F] [--ignore-case|-i] [--word|-w] [--glob <pattern>] [--context <n>|-C <n>] [--max <n>] [--include-meta]");
const root = projectRoot();
let result;
try {
  result = searchProject(root, {
    pattern,
    regex: !flags.literal,
    ignoreCase: Boolean(flags["ignore-case"]),
    word: Boolean(flags.word),
    glob: typeof flags.glob === "string" ? flags.glob : undefined,
    context: Number(flags.context ?? 0),
    max: Number(flags.max ?? 60),
    includeMeta: Boolean(flags["include-meta"]),
    paths: rest.slice(1).map(toPosix),
  });
} catch (error) {
  fail(`search_code: ${error.message}`);
}
if (!result.ok) fail(`search_code: ${result.error}`);
const out = [`## ${result.matches.length} match(es) for "${pattern}" (${result.backend}${result.truncated ? ", truncated" : ""})`];
const LINE_CAP = 400;
const CHAR_CAP = 60000;
let chars = out[0].length;
let capped = false;
const say = (line) => {
  if (out.length >= LINE_CAP || chars + line.length > CHAR_CAP) { capped = true; return; }
  out.push(line);
  chars += line.length + 1;
};
for (const hit of result.matches) {
  for (const [index, text] of (hit.before ?? []).entries()) say(`${hit.file}-${hit.line - (hit.before.length - index)}- ${text.trimEnd()}`);
  say(`${hit.file}:${hit.line}: ${hit.text.trimEnd()}`);
  for (const [index, text] of (hit.after ?? []).entries()) say(`${hit.file}-${hit.line + index + 1}- ${text.trimEnd()}`);
}
console.log(out.join("\n"));
if (result.matches.length === 0) console.log(`No matches for "${pattern}".`);
if (result.truncated) console.log(`… more matches cut (--max ${Number(flags.max ?? 60)})`);
if (capped) console.log(`… output capped at ${LINE_CAP} lines / ${CHAR_CAP} characters; narrow the query`);
