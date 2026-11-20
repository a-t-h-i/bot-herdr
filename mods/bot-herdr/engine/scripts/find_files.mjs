#!/usr/bin/env node
// purpose: find files quickly by name or path with glob, extension and depth filters, on any OS and with or without git
// usage: node {script} [query] [folder] [--glob <pattern>] [--ext <ext>] [--depth <n>] [--max <n>] [--regex] [--include-meta]
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fail, listProjectFiles, parseArgs, projectRoot, toPosix } from "./lib/common.mjs";

const { flags, rest } = parseArgs(process.argv.slice(2), ["regex", "include-meta"]);
const root = projectRoot();
const max = Math.max(0, Number(flags.max ?? 100) || 100);
const args = rest.map(toPosix);
const folder = args.length > 1 || (args.length === 1 && existsSync(join(root, args[0]))) ? args.at(-1) : undefined;
const query = args.length > (folder ? 1 : 0) ? args[0] : undefined;
let files;
try {
  files = listProjectFiles(root, {
    paths: folder ? [folder] : [],
    includeMeta: Boolean(flags["include-meta"]),
    glob: typeof flags.glob === "string" ? flags.glob : undefined,
    ext: typeof flags.ext === "string" ? flags.ext : undefined,
    maxDepth: flags.depth === undefined ? undefined : Number(flags.depth),
  });
} catch (error) {
  fail(`find_files: ${error.message}`);
}
let matcher;
if (query) {
  try {
    matcher = flags.regex ? new RegExp(query, "i") : undefined;
  } catch (error) {
    fail(`find_files: invalid --regex: ${error.message}`);
  }
}
const found = query ? files.filter((file) => (matcher ? matcher.test(file) : file.toLowerCase().includes(query.toLowerCase()))) : files;
const shown = found.slice(0, max);
if (shown.length === 0) console.log(`No files found${query ? ` matching "${query}"` : ""}.`);
else console.log(shown.join("\n"));
if (found.length > shown.length) console.log(`… ${found.length - shown.length} more file(s) cut (--max ${max})`);
