#!/usr/bin/env node
// purpose: read several exact file ranges in one call, numbered and CRLF/BOM-safe, with a total line cap
// usage: node {script} <file:start-end> [more file:start-end…] [--start <n>] [--end <n>] [--max <lines>]
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { fail, parseArgs, projectRoot, resolveSafePath, stripBomAndCr, toPosix } from "./lib/common.mjs";

const { flags, rest } = parseArgs();
if (rest.length === 0) fail("usage: read_slice.mjs <file:start-end> [more file:start-end…] [--start <n>] [--end <n>] [--max <lines>]");
const root = projectRoot();
const max = Math.max(1, Number(flags.max ?? 250) || 250);
const fallbackStart = Number(flags.start ?? 1);
const fallbackEnd = flags.end === undefined ? undefined : Number(flags.end);
let left = max;
let stopped = false;

/** `file:start-end`, `file:start`, or a bare file with --start/--end. Windows drive colons stay in the path. */
function parseSpec(spec) {
  const clean = toPosix(spec);
  const range = /^(.*):(\d+)(?:-(\d+))?$/.exec(clean);
  if (range) return { file: range[1], start: Number(range[2]), end: range[3] === undefined ? Number(range[2]) : Number(range[3]) };
  return { file: clean, start: fallbackStart, end: fallbackEnd };
}

for (const spec of rest.map(parseSpec)) {
  if (stopped) {
    console.log(`… remaining ranges not shown (--max ${max})`);
    break;
  }
  let file;
  let text;
  try {
    const abs = resolveSafePath(root, spec.file);
    file = toPosix(relative(root, abs)) || toPosix(spec.file);
    text = stripBomAndCr(readFileSync(abs, "utf8"));
  } catch (error) {
    fail(`read_slice: ${error.message}`);
  }
  const rows = text === "" ? [] : text.split("\n");
  const start = Math.max(1, Number(spec.start) || 1);
  const end = spec.end === undefined ? rows.length : Math.min(rows.length, Number(spec.end));
  if (rows.length === 0) {
    console.log(`## ${file} (empty)`);
    continue;
  }
  if (start > rows.length || end < start) {
    console.log(`## ${file}:${start}-${end} (outside ${rows.length} lines)`);
    continue;
  }
  console.log(`## ${file}:${start}-${end}`);
  for (let n = start; n <= end; n += 1) {
    if (left <= 0) {
      console.log(`… ${end - n + 1} more lines in this range not shown (--max ${max})`);
      stopped = true;
      break;
    }
    console.log(`${String(n).padStart(5)} ${rows[n - 1]}`);
    left -= 1;
  }
}
