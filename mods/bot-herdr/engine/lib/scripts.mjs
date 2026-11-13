// Shared scripts: jobs that come back (seeding data, regenerating fixtures, a set of checks) kept
// as scripts every agent can run, so a step done once is run the next time instead of being
// worked out again. Built-in read-only scripts ship with the engine; a project's own live in
// .bot-herdr/scripts/ and replace a built-in one of the same name.
//
// Each script's first lines say what it is for and how to run it:
//   // purpose: …        (or # purpose: …)
//   // usage: …

import { spawnSync } from "node:child_process";
import { basename, extname, join } from "node:path";
import { ENGINE, listDir, now, readText, store, writeText } from "./core.mjs";

const BUILTIN = join(ENGINE, "scripts");
const RUNNERS = { ".mjs": ["node"], ".js": ["node"], ".cjs": ["node"], ".ts": ["node"], ".py": ["python3"], ".sh": ["bash"], ".ps1": ["powershell", "-NoProfile", "-File"], ".rb": ["ruby"] };

function header(path) {
  const head = readText(path).split("\n").slice(0, 12).join("\n");
  const field = (k) => new RegExp(`^\\s*(?://|#)\\s*${k}:\\s*(.+)$`, "im").exec(head)?.[1]?.trim() ?? "";
  return { purpose: field("purpose"), usage: field("usage") };
}

const nameOf = (file) => basename(file, extname(file));

/** Every script: the project's first, then the built-ins it does not replace. */
export function scripts(root) {
  const own = listDir(store(root, "scripts")).filter((d) => d.isFile() && RUNNERS[extname(d.name)]).map((d) => ({ name: nameOf(d.name), file: join(store(root, "scripts"), d.name), source: "project" }));
  const taken = new Set(own.map((s) => s.name));
  const built = listDir(BUILTIN).filter((d) => d.isFile() && d.name.endsWith(".mjs") && !taken.has(nameOf(d.name))).map((d) => ({ name: nameOf(d.name), file: join(BUILTIN, d.name), source: "built-in" }));
  return [...own, ...built].map((s) => ({ ...s, ...header(s.file) }));
}

export function find(root, name) {
  const s = scripts(root).find((x) => x.name === name || basename(x.file) === name);
  if (!s) throw new Error(`No script ${name}. \`bh scripts\` lists them.`);
  return s;
}

/** Runs a script in the project. Returns the exit code, or `{ code, out, err }` when `capture` is asked. */
export function run(root, name, args = [], { capture = false } = {}) {
  const s = find(root, name);
  const runner = RUNNERS[extname(s.file)];
  if (process.platform === "win32" && runner[0] === "python3") runner[0] = "python";
  if (capture) {
    const r = spawnSync(runner[0], [...runner.slice(1), s.file, ...args], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    return { code: r.status ?? 1, out: r.stdout ?? "", err: r.stderr ?? (r.error ? String(r.error.message) : "") };
  }
  const r = spawnSync(runner[0], [...runner.slice(1), s.file, ...args], { cwd: root, stdio: "inherit" });
  return r.status ?? 1;
}

/** Saves a script into the project (snake_case name, its language's extension). The one before goes to archive/. */
export function save(root, from, name = null) {
  const ext = extname(from);
  if (!RUNNERS[ext]) throw new Error(`Scripts can be: ${Object.keys(RUNNERS).join(" ")}.`);
  const base = (name ? nameOf(name) : nameOf(from)).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const target = join(store(root, "scripts"), `${base}${ext}`);
  const text = readText(from);
  if (!header(from).purpose) throw new Error(`Start the script with a "purpose:" comment line (and "usage:") so the others know what it does.`);
  const before = readText(target, null);
  if (before !== null && before !== text) writeText(join(store(root, "scripts"), "archive", `${base}-${now().replace(/[:.]/g, "-")}${ext}`), before);
  writeText(target, text);
  return target;
}

const words = (text) => new Set(String(text).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));

/** Scripts that share words with a step, best first (the rule the classifier refines). */
export function keywordPick(list, step, max = 5) {
  const want = words(step);
  return list
    .map((s) => ({ s, hits: [...words(`${s.name.replace(/_/g, " ")} ${s.purpose}`)].filter((w) => want.has(w)).length }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, max)
    .map((x) => x.s);
}

export function scriptLine(s) {
  return `${s.name}${s.source === "project" ? " (project)" : ""}: ${s.purpose || "no purpose line"}${s.usage ? `\n    usage: ${s.usage.replace("{script}", s.name)}` : ""}`;
}
