// Shared helpers for bot-herdr's built-in scripts. Read-only: nothing here writes, commits or pushes.
import { spawnSync } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync, readdirSync, readSync, statSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, win32 } from "node:path";
import { ENGINE, parseArgs as parseOptions, projectRoot as gitTop, sh as run } from "../../lib/core.mjs";

/** Run a command; never throws. The engine's own runner: the scripts are part of its package. */
export const sh = run;

/** A project path as the rest of the world sees it: forward slashes, no leading `./`. */
export function toPosix(path) {
  return String(path ?? "").replace(/\\/g, "/").replace(/^(\.\/)+/, "");
}

/** Text without a UTF-8 BOM and with CRLF/CR made LF, so line numbers and regexes agree on every OS. */
export function stripBomAndCr(text) {
  return String(text ?? "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

/** A log path without its `file://` shell and with forward slashes (`file:///C:/x` -> `C:/x`). */
export function stripFileUrl(path) {
  let clean = String(path ?? "");
  if (/^file:\/\//i.test(clean)) {
    clean = clean.replace(/^file:\/\//i, "");
    try { clean = decodeURIComponent(clean); } catch { /* keep the raw path */ }
    if (/^\/[A-Za-z]:\//.test(clean)) clean = clean.slice(1);
  }
  return toPosix(clean);
}

export function lines(text) {
  return stripBomAndCr(text).split("\n").map((line) => line.trimEnd()).filter(Boolean);
}

/** Engine state (tasks, briefs, session data) is noise in code searches unless asked for. */
export function isMetaNoise(file) {
  return /(^|\/)\.bot-herdr(\/|$)/.test(toPosix(file));
}

/** An absolute path inside `root`, or an error: `../` and absolute paths outside it never resolve. */
export function resolveSafePath(root, rel) {
  const base = resolve(root);
  const raw = String(rel ?? "");
  if (/^[A-Za-z]:[\\/]/.test(raw)) {
    const back = win32.relative(win32.resolve(base), win32.resolve(raw));
    if (back.startsWith("..") || win32.isAbsolute(back)) throw new Error(`Path escapes the project root: ${raw}`);
    return resolve(base, back);
  }
  if (raw.startsWith("/") || isAbsolute(raw)) {
    const back = relative(base, resolve(raw));
    if (back.startsWith("..") || isAbsolute(back)) throw new Error(`Path escapes the project root: ${raw}`);
    return resolve(raw);
  }
  const parts = toPosix(raw).split("/").filter((part) => part && part !== ".");
  let depth = 0;
  for (const part of parts) {
    depth += part === ".." ? -1 : 1;
    if (depth < 0) throw new Error(`Path escapes the project root: ${raw}`);
  }
  return resolve(base, ...parts);
}

function pathDirs(platform, env) {
  const value = env.PATH ?? env.Path ?? env.path ?? "";
  return String(value).split(platform === "win32" ? ";" : ":").filter(Boolean);
}

function onPath(name, platform, env, probe = existsSync) {
  const suffixes = platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
  for (const dir of pathDirs(platform, env)) for (const suffix of suffixes) if (probe(join(dir, `${name}${suffix}`))) return join(dir, `${name}${suffix}`);
  return undefined;
}

/** `npx`/`python3` as the current OS needs them: Windows runs `npx.cmd` and `python` (or `py`). */
export function resolveCmd(cmd, { platform = process.platform, env = process.env, probe } = {}) {
  if (platform !== "win32") return cmd;
  const find = probe ?? ((name) => Boolean(onPath(name, platform, env)));
  const shim = { npx: "npx.cmd", npm: "npm.cmd", pnpm: "pnpm.cmd", yarn: "yarn.cmd" }[cmd];
  if (shim) return shim;
  if (cmd === "python3" || cmd === "python") return ["python", "py"].find((name) => find(name)) ?? "python";
  return cmd;
}

/** Project-local JS tooling by the package that ships it (the CLI's bin name is the tool's name). */
const LOCAL_PACKAGES = { tsc: "typescript", eslint: "eslint", biome: "@biomejs/biome", vitest: "vitest", jest: "jest", mocha: "mocha", playwright: "@playwright/test" };

/** The first bytes of a file, to tell a `#!` script from a native binary without reading it whole. */
function headOf(file, bytes = 64) {
  let fd;
  try {
    fd = openSync(file, "r");
    const buf = Buffer.alloc(bytes);
    const read = readSync(fd, buf, 0, bytes, 0);
    return buf.subarray(0, read).toString("utf8");
  } catch {
    return "";
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/** `node tools/x.mjs`: a node shebang or a `.js` file runs on this Node; anything else is native or a shim. */
function localEntry(file) {
  const head = headOf(file);
  if (/^#!/.test(head)) return /\bnode\b/.test(head) ? { cmd: process.execPath, args: [file] } : { cmd: file, args: [] };
  return /\.(c|m)?js$/i.test(file) ? { cmd: process.execPath, args: [file] } : { cmd: file, args: [] };
}

/** A package's own `bin` entry for `tool`, when the file is there. */
function packageBin(dir, tool, probe) {
  const pkg = readJson(join(dir, "package.json"));
  if (!pkg) return undefined;
  const bin = typeof pkg.bin === "string" ? { [String(pkg.name ?? tool).split("/").pop()]: pkg.bin } : pkg.bin ?? {};
  const rel = bin[tool] ?? (Object.keys(bin).length === 1 ? Object.values(bin)[0] : undefined);
  if (typeof rel !== "string") return undefined;
  const file = join(dir, rel);
  return probe(file) ? file : undefined;
}

/** An argument for cmd.exe: quoted, never a second command. */
const cmdQuote = (arg) => (/^[\w@%+=:,./\\-]+$/.test(String(arg)) ? String(arg) : `"${String(arg).replace(/"/g, '""')}"`);

/** The last resort on Windows: a `.cmd` shim run through cmd.exe, never handed to execFileSync bare. */
const cmdLaunch = (shim, args, env) => ({ cmd: env.ComSpec || "cmd.exe", args: ["/d", "/s", "/c", [shim, ...args].map(cmdQuote).join(" ")] });

/**
 * A project-local tool as something this OS can start without a shell: the package's JS entry on
 * this same Node (no `.cmd` shim, which Windows refuses and which could reach a shell), its native
 * binary directly, or npx's own JS CLI. Only a missing npx CLI falls back to cmd.exe.
 */
export function resolveLocalBin(root, tool, { args = [], platform = process.platform, env = process.env, probe = existsSync } = {}) {
  const pkg = LOCAL_PACKAGES[tool] ?? tool;
  const entry = packageBin(join(root, "node_modules", ...pkg.split("/")), tool, probe);
  if (entry) {
    if (platform === "win32" && /\.(cmd|bat)$/i.test(entry)) return cmdLaunch(entry, args, env);
    const launch = localEntry(entry);
    return { cmd: launch.cmd, args: [...launch.args, ...args] };
  }
  const cli = join(dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js");
  if (probe(cli)) return { cmd: process.execPath, args: [cli, tool, ...args] };
  if (platform === "win32") return cmdLaunch(onPath(tool, platform, env, probe) ?? `${tool}.cmd`, args, env);
  return { cmd: "npx", args: [tool, ...args] };
}

const toolCache = new Map();

/** Forget probed tools (tests point PATH and BH_BIN_DIR at new fakes). */
export function resetToolCache() {
  toolCache.clear();
}

function isAstGrep(path) {
  const r = spawnSync(path, ["--version"], { encoding: "utf8", timeout: 5000, windowsHide: true });
  return !r.error && r.status === 0 && /^ast-grep\b/i.test(String(r.stdout || r.stderr || "").trim());
}

/**
 * A bundled tool (`engine/bin/rg`, `fd`, `ast-grep`) first (BH_BIN_DIR overrides), then PATH; for
 * ast-grep, a bare `sg` only counts when its --version says ast-grep, never Linux shadow-utils.
 */
export function resolveTool(name, { binDir, platform = process.platform, env = process.env, probe = existsSync } = {}) {
  const dir = binDir ?? env.BH_BIN_DIR ?? join(ENGINE, "bin");
  const pathEnv = env.PATH ?? env.Path ?? env.path ?? "";
  const key = [name, dir, pathEnv, platform].join("\0");
  if (toolCache.has(key)) return toolCache.get(key);
  const bundled = join(dir, platform === "win32" ? `${name}.exe` : name);
  let found = probe(bundled) ? bundled : undefined;
  for (const candidate of found ? [] : name === "ast-grep" ? ["ast-grep", "sg"] : [name]) {
    const hit = onPath(candidate, platform, env, probe);
    if (hit && (candidate !== "sg" || isAstGrep(hit))) { found = hit; break; }
  }
  toolCache.set(key, found);
  return found;
}

function runTool(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  return { code: r.status ?? (r.error ? -1 : 1), out: r.stdout ?? "", err: r.stderr ?? (r.error ? String(r.error.message) : ""), error: r.error };
}

function globToRegExp(glob) {
  let out = "";
  const text = toPosix(glob);
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "*" && text[i + 1] === "*") {
      i += 1;
      if (text[i + 1] === "/") { i += 1; out += "(?:.*/)?"; } else out += ".*";
    } else if (ch === "*") out += "[^/]*";
    else if (ch === "?") out += "[^/]";
    else if (ch === "[") {
      const end = text.indexOf("]", i + 1);
      if (end > i) { out += text.slice(i, end + 1); i = end; } else out += "\\[";
    } else out += ch.replace(/[.+^${}()|\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
}

function globMatch(file, glob) {
  const pattern = toPosix(glob);
  return globToRegExp(pattern).test(pattern.includes("/") ? file : basename(file));
}

function safePaths(root, paths = []) {
  return (Array.isArray(paths) ? paths : [paths]).filter(Boolean).map((path) => toPosix(relative(resolve(root), resolveSafePath(root, path))) || ".");
}

function underAny(file, paths) {
  return paths.length === 0 || paths.some((path) => path === "." || file === path || file.startsWith(`${path}/`));
}

function keepFile(file, opts) {
  const path = toPosix(file);
  if (!path || path.startsWith("../") || isAbsolute(path)) return false;
  if (/(^|\/)(\.git|node_modules)(\/|$)/.test(path)) return false;
  if (!opts.includeMeta && isMetaNoise(path)) return false;
  if (opts.maxDepth !== undefined && path.split("/").length - 1 > Number(opts.maxDepth)) return false;
  if (opts.ext && extname(path).slice(1).toLowerCase() !== String(opts.ext).replace(/^\./, "").toLowerCase()) return false;
  if (opts.glob && !globMatch(path, opts.glob)) return false;
  return true;
}

function uniqueFiles(files) {
  return [...new Set(files.map(toPosix))].sort();
}

/** Basic .gitignore rules: comments, negation, directory rules, `*`, `?` and `**`. */
function ignoreRules(root) {
  let text = "";
  try { text = stripBomAndCr(readFileSync(join(root, ".gitignore"), "utf8")); } catch { return []; }
  return text.split("\n").map((row) => row.trim()).filter((row) => row && !row.startsWith("#")).map((row) => {
    const negate = row.startsWith("!");
    let pattern = toPosix(negate ? row.slice(1) : row);
    const dirOnly = pattern.endsWith("/");
    pattern = pattern.replace(/\/$/, "").replace(/^\//, "");
    const body = globToRegExp(pattern).source.slice(1, -1);
    const anchored = pattern.includes("/") || (negate ? row.slice(1) : row).startsWith("/");
    return { negate, dirOnly, re: new RegExp(anchored ? `^${body}$` : `^(?:.*/)?${body}$`) };
  });
}

function walkFiles(root, opts) {
  const rules = ignoreRules(root);
  const ignored = (rel, isDir) => {
    let hit = false;
    for (const rule of rules) if ((!rule.dirOnly || isDir) && rule.re.test(rel)) hit = !rule.negate;
    return hit;
  };
  const out = [];
  const walk = (dir, depth) => {
    let entries;
    try { entries = readdirSync(join(root, dir), { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const rel = toPosix(dir ? `${dir}/${entry.name}` : entry.name);
      if (entry.isDirectory()) {
        if (entry.name === ".git" || entry.name === "node_modules" || (!opts.includeMeta && entry.name === ".bot-herdr")) continue;
        if (ignored(rel, true)) continue;
        if (opts.maxDepth !== undefined && depth >= Number(opts.maxDepth)) continue;
        walk(rel, depth + 1);
      } else if (entry.isFile() && !ignored(rel, false)) out.push(rel);
    }
  };
  walk("", 0);
  return out;
}

/** Asked paths split into the files they are and the folders to walk (`fd` refuses a file). */
function existingFile(root, path) {
  try {
    return statSync(join(root, path)).isFile();
  } catch {
    return false;
  }
}

/** A lister's exit 1 with nothing on stderr means "no file matched": an empty folder is not an error. */
function listed(name, tool, args, root, extra = []) {
  const r = runTool(tool, args, root);
  if (r.code === 0) return { files: [...extra, ...lines(r.out)] };
  if (r.code === 1 && !r.error && !r.err.trim()) return { files: [] };
  return { error: `${name} failed (exit ${r.code}): ${(r.err.trim() || r.error?.message || "nothing on stderr")}` };
}

function listBackend(name, root, opts, paths) {
  if (name === "node") return { files: walkFiles(root, opts) };
  if (name === "git") {
    const r = runTool("git", ["-c", "core.quotepath=false", "ls-files", "--cached", "--others", "--exclude-standard", ...(paths.length ? ["--", ...paths] : [])], root);
    return r.code === 0 ? { files: lines(r.out) } : { error: `git ls-files failed (exit ${r.code}): ${r.err.trim()}` };
  }
  const tool = resolveTool(name === "fd" ? "fd" : "rg", opts.toolOpts);
  if (!tool) return { missing: true, error: `${name} is not installed` };
  if (name === "fd") {
    const files = paths.filter((path) => existingFile(root, path));
    const dirs = paths.filter((path) => !files.includes(path));
    if (paths.length > 0 && dirs.length === 0) return { files };
    return listed(name, tool, ["--hidden", "--color", "never", "--type", "f", "--exclude", ".git", "--exclude", "node_modules", "--", ".", ...dirs], root, files);
  }
  return listed(name, tool, ["--files", "--hidden", "--no-config", "--glob", "!.git/**", "--glob", "!node_modules/**", ...(paths.length ? ["--", ...paths] : [])], root);
}

/**
 * Project files as sorted `/`-relative paths: fd, then rg --files, then git ls-files, then a Node
 * walk. `.bot-herdr/` is skipped unless `includeMeta`; an explicit backend that fails throws.
 */
export function listProjectFiles(root, opts = {}) {
  const paths = safePaths(root, opts.paths);
  const order = opts.backend ? [opts.backend] : ["fd", "rg", "git", "node"];
  let lastError = "no backend available";
  for (const name of order) {
    const result = listBackend(name, root, opts, paths);
    if (result.missing || result.error) {
      lastError = result.error;
      if (opts.backend) throw new Error(`Cannot list project files with ${name}: ${result.error}`);
      continue;
    }
    return uniqueFiles(result.files).filter((file) => keepFile(file, opts) && underAny(file, paths));
  }
  throw new Error(`Cannot list project files: ${lastError}`);
}

/**
 * `rg`/`git grep` events, the path NUL-delimited from the line (`--null`/`-z`) so a path holding
 * `-<digits>-` or `:` never splits: `path\0line:text` for a match, `path\0line-text` for context.
 * `git grep -z` writes NUL where the `:` and `-` go, so those rows come back with `match: false`.
 */
function parseHits(text) {
  const events = [];
  for (const row of stripBomAndCr(text).split("\n")) {
    if (!row || row === "--") continue;
    const nul = row.indexOf("\0");
    if (nul < 0) continue;
    const m = /^(\d+)([:\-\0])(.*)$/.exec(row.slice(nul + 1));
    if (m) events.push({ file: toPosix(row.slice(0, nul)), line: Number(m[1]), text: m[3].replace(/^\uFEFF/, ""), match: m[2] === ":" });
  }
  return events;
}

function withContext(events, context) {
  const matches = [];
  events.forEach((event, index) => {
    if (!event.match) return;
    const before = [];
    const after = [];
    for (let i = index - 1; i >= 0; i--) {
      const other = events[i];
      if (other.file !== event.file || event.line - other.line > context) break;
      before.unshift(other.text);
    }
    for (let i = index + 1; i < events.length; i++) {
      const other = events[i];
      if (other.file !== event.file || other.line - event.line > context) break;
      after.push(other.text);
    }
    matches.push({ file: event.file, line: event.line, text: event.text, ...(context ? { before, after } : {}) });
  });
  return matches;
}

function finishSearch(backend, events, opts) {
  let matches = withContext(events.filter((event) => keepFile(event.file, opts) && underAny(event.file, opts.paths)), opts.context);
  const seen = new Set();
  matches = matches.filter((hit) => { const key = `${hit.file}:${hit.line}`; if (seen.has(key)) return false; seen.add(key); return true; });
  matches.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  const truncated = matches.length > opts.max;
  return { ok: true, backend, matches: truncated ? matches.slice(0, opts.max) : matches, truncated };
}

function rgArgs(opts) {
  const args = ["--no-config", "--line-number", "--no-heading", "--with-filename", "--null", "--color", "never", "--hidden", "--glob", "!.git/**", "--glob", "!node_modules/**"];
  if (!opts.includeMeta) args.push("--glob", "!.bot-herdr/**");
  if (opts.glob) args.push("--glob", opts.glob);
  if (opts.context) args.push("--context", String(opts.context));
  if (opts.ignoreCase) args.push("--ignore-case");
  if (opts.word) args.push("--word-regexp");
  if (!opts.regex) args.push("--fixed-strings");
  if (Number.isFinite(opts.max)) args.push("--max-count", String(opts.max + 1));
  args.push("-e", opts.pattern, "--", ...(opts.paths.length ? opts.paths : ["."]));
  return args;
}

function searchBackend(name, root, opts) {
  if (name === "node") return searchWithNode(root, opts);
  if (name === "rg") {
    const tool = resolveTool("rg", opts.toolOpts);
    if (!tool) return { missing: true };
    const r = runTool(tool, rgArgs(opts), root);
    if (r.code === 0 || r.code === 1) return finishSearch("rg", parseHits(r.out), opts);
    return { ok: false, backend: "rg", error: r.error ? `rg could not run: ${r.error.message}` : r.err.trim() || `rg failed (exit ${r.code})`, matches: [], truncated: false };
  }
  return searchWithGit(root, opts);
}

function gitArgs(opts, context = opts.context) {
  const args = ["-c", "core.quotepath=false", "grep", "--untracked", "--line-number", "--full-name", "--null", "-I", opts.regex ? "-E" : "-F"];
  if (opts.ignoreCase) args.push("-i");
  if (opts.word) args.push("-w");
  if (context) args.push("-C", String(context));
  args.push("-e", opts.pattern, "--", ...(opts.paths.length ? opts.paths : ["."]));
  return args;
}

function searchWithGit(root, opts) {
  const plain = runTool("git", gitArgs(opts, 0), root);
  if (plain.code !== 0 && plain.code !== 1) return { ok: false, backend: "git", error: plain.err.trim() || `git grep failed (exit ${plain.code})`, matches: [], truncated: false };
  if (!opts.context) return finishSearch("git", parseHits(plain.out).map((event) => ({ ...event, match: true })), opts);
  // With context, git's NUL replaces the `:`/`-` too: the matches-only pass says which rows matched.
  const matched = new Set(parseHits(plain.out).map((event) => `${event.file}\0${event.line}`));
  const wide = runTool("git", gitArgs(opts), root);
  if (wide.code !== 0 && wide.code !== 1) return { ok: false, backend: "git", error: wide.err.trim() || `git grep failed (exit ${wide.code})`, matches: [], truncated: false };
  return finishSearch("git", parseHits(wide.out).map((event) => ({ ...event, match: matched.has(`${event.file}\0${event.line}`) })), opts);
}

function searchWithNode(root, opts) {
  let re;
  try {
    const body = opts.regex ? opts.pattern : escapeRe(opts.pattern);
    // rg -w / git grep -w mean "not next to a word character", which is what a dash-delimited
    // token like `-e` needs (\b would not match it).
    re = new RegExp(opts.word ? `(?<!\\w)(?:${body})(?!\\w)` : body, opts.ignoreCase ? "i" : "");
  } catch (error) {
    return { ok: false, backend: "node", error: `Invalid regular expression: ${error.message}`, matches: [], truncated: false };
  }
  const files = listProjectFiles(root, { paths: opts.paths, includeMeta: opts.includeMeta, glob: opts.glob, maxDepth: opts.maxDepth, backend: "node", toolOpts: opts.toolOpts });
  const matches = [];
  for (const file of files) {
    let text;
    try {
      if (statSync(join(root, file)).size > 20 * 1024 * 1024) continue;
      text = readFileSync(join(root, file), "utf8");
    } catch { continue; }
    if (text.includes("\0")) continue;
    const rows = stripBomAndCr(text).split("\n");
    // rg and git print no context row past the last line of a file that ends with a newline.
    if (rows.at(-1) === "") rows.pop();
    rows.forEach((row, index) => {
      if (!re.test(row)) return;
      const line = index + 1;
      const before = opts.context ? rows.slice(Math.max(0, index - opts.context), index) : [];
      const after = opts.context ? rows.slice(index + 1, Math.min(rows.length, index + 1 + opts.context)) : [];
      matches.push({ file, line, text: row, ...(opts.context ? { before, after } : {}) });
    });
  }
  matches.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  const truncated = matches.length > opts.max;
  return { ok: true, backend: "node", matches: truncated ? matches.slice(0, opts.max) : matches, truncated };
}

/**
 * Text/regex matches across project files: rg, then git grep --untracked, then a Node search.
 * Flags are always passed after `-e` and paths after `--`; a real backend failure is returned.
 */
export function searchProject(root, opts = {}) {
  const max = opts.max === Infinity ? Infinity : Math.max(0, Number(opts.max ?? 100));
  const settings = {
    pattern: String(opts.pattern ?? ""),
    regex: opts.regex !== false,
    word: Boolean(opts.word),
    ignoreCase: Boolean(opts.ignoreCase),
    includeMeta: Boolean(opts.includeMeta),
    context: Math.max(0, Number(opts.context ?? 0) || 0),
    glob: opts.glob,
    maxDepth: opts.maxDepth,
    max,
    paths: safePaths(root, opts.paths),
    toolOpts: opts.toolOpts ?? {},
  };
  const order = opts.backend ? [opts.backend] : ["rg", "git", "node"];
  let lastError = "no search backend available";
  for (const name of order) {
    const result = searchBackend(name, root, settings);
    if (result.missing) { lastError = `${name} is not installed`; continue; }
    if (result.ok === false) {
      const outsideGit = !opts.backend && name === "git" && /not a git repository|not a git work tree/i.test(result.error);
      if (!outsideGit) return result;
      lastError = result.error;
      continue;
    }
    return result;
  }
  return { ok: false, backend: order.at(-1), error: lastError, matches: [], truncated: false };
}

/** The project's root: the git top level around the script (a task's own worktree stays itself), else the folder it runs in. */
export function projectRoot() {
  return gitTop(process.cwd());
}

const BASE_BOOLEANS = ["help", "h", "json", "include-meta", "all", "dry-run", "complex", "tests", "regex"];

/** `--name value` / `--flag` options and the rest as positional arguments; `booleans` never eat one. */
export function parseArgs(argv = process.argv.slice(2), booleans = []) {
  if (argv.includes("--help") || argv.includes("-h")) {
    // The script's own header says what it does and how to run it.
    const head = readFileSync(process.argv[1], "utf8").split("\n").slice(0, 6);
    for (const row of head) if (/^\/\/\s*(purpose|usage):/.test(row)) console.log(row.replace(/^\/\/\s*/, "").replace("{script}", process.argv[1]));
    process.exit(0);
  }
  return parseOptions(argv, [], [...BASE_BOOLEANS, ...booleans]);
}

/** The ref the branch is compared with: `--base`, else the merge base with the default branch, else HEAD. */
export function baseRef(root, asked) {
  if (typeof asked === "string") return asked;
  for (const ref of ["origin/HEAD", "origin/main", "origin/master", "main", "master"]) {
    const base = sh("git", ["merge-base", "HEAD", ref], { cwd: root });
    if (base.code === 0 && base.out.trim()) {
      const head = sh("git", ["rev-parse", "HEAD"], { cwd: root }).out.trim();
      // On the default branch itself, compare with the working tree only.
      return base.out.trim() === head ? "HEAD" : base.out.trim();
    }
  }
  return "HEAD";
}

/** Files changed since `base`: committed on the branch, staged, unstaged and new (untracked, not ignored). */
export function changedFiles(root, base) {
  const files = new Set();
  const add = (text) => lines(text).forEach((file) => files.add(toPosix(file)));
  if (base !== "HEAD") add(sh("git", ["-c", "core.quotepath=false", "diff", "--name-only", "--diff-filter=ACMR", `${base}...HEAD`], { cwd: root }).out);
  add(sh("git", ["-c", "core.quotepath=false", "diff", "--name-only", "--diff-filter=ACMR", "HEAD"], { cwd: root }).out);
  add(sh("git", ["-c", "core.quotepath=false", "ls-files", "--others", "--exclude-standard"], { cwd: root }).out);
  return [...files].filter((file) => existsSync(join(root, file))).sort();
}

export function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

/** What the project is built with. */
export function detect(root) {
  const pkg = readJson(join(root, "package.json"));
  const pm = existsSync(join(root, "pnpm-lock.yaml")) ? "pnpm" : existsSync(join(root, "yarn.lock")) ? "yarn" : existsSync(join(root, "bun.lockb")) || existsSync(join(root, "bun.lock")) ? "bun" : "npm";
  const deps = pkg ? { ...pkg.dependencies, ...pkg.devDependencies } : {};
  return {
    pkg,
    pm,
    deps,
    python: ["pyproject.toml", "setup.py", "setup.cfg", "requirements.txt", "pytest.ini", "tox.ini"].some((file) => existsSync(join(root, file))),
    go: existsSync(join(root, "go.mod")),
    rust: existsSync(join(root, "Cargo.toml")),
  };
}

/** `npm run x` / `pnpm x` / `yarn x` / `bun run x`. */
export function runScript(pm, name) {
  return pm === "npm" ? `npm run ${name}` : pm === "bun" ? `bun run ${name}` : `${pm} ${name}`;
}

const TEST_FILE = /(^|\/)(__tests__|tests?|spec|e2e)\/|\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)test_[^/]+\.py$|_test\.(py|go)$/;

export function isTest(file) {
  return TEST_FILE.test(file);
}

const CODE = /\.(c|m)?[jt]sx?$|\.(py|go|rs|rb|java|kt|swift|vue|svelte|cs|php)$/;

export function isCode(file) {
  return CODE.test(file);
}

function stemOf(file) {
  return basename(file, extname(file)).replace(/\.(test|spec)$/, "").replace(/^test_/, "").replace(/_test$/, "");
}

const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The last two path segments: `lib/tasks.mjs` for `mods/bot-herdr/engine/lib/tasks.mjs`. */
const tailOf = (file) => toPosix(file).split("/").slice(-2).join("/");

/** What names a file in a test: its path tail in a string, and an import of its stem. */
function matchersFor(file) {
  const stem = stemOf(toPosix(file));
  const parts = [escapeRe(tailOf(file))];
  if (stem.length >= 3 && stem !== "index") parts.push(`(from|import|require\\().*[/'"]${escapeRe(stem)}(\\.[a-z]+)?['"]`);
  return parts.map((part) => new RegExp(part));
}

/** One search for every changed file: the tests whose text names one of them. */
function namingTests(root, matchers, dirs) {
  const pattern = [...new Set([...matchers.values()].flat().map((re) => re.source))].join("|");
  const found = [];
  const result = searchProject(root, { pattern, regex: true, paths: dirs, max: Infinity });
  if (!result.ok) return found;
  for (const hit of result.matches) {
    if (!isTest(hit.file)) continue;
    for (const [file, res] of matchers) if (res.some((re) => re.test(hit.text))) found.push([file, hit.file]);
  }
  return found;
}

/** Test files that cover these files: the tests themselves, tests named after them, and tests that name their path. */
export function testsFor(root, files, all = tracked(root)) {
  const wanted = files.map(toPosix);
  const known = all.map(toPosix);
  const tests = known.filter(isTest);
  const found = new Map();
  const matchers = new Map();
  for (const file of wanted) {
    const stem = stemOf(file);
    const named = stem.length < 3 || stem === "index" ? basename(dirname(file)) : stem;
    const hits = new Set(isTest(file) ? [file] : isCode(file) ? tests.filter((test) => stemOf(test) === named) : []);
    if (isCode(file) && !isTest(file)) matchers.set(file, matchersFor(file));
    found.set(file, hits);
  }
  const dirs = [...new Set(tests.map((test) => test.split("/")[0]))];
  if (matchers.size && dirs.length) for (const [file, test] of namingTests(root, matchers, dirs)) found.get(file).add(test);
  return new Map([...found].map(([file, hits]) => [file, [...hits].sort()]));
}

/** What a runner's summary said: total, pass, fail and skipped (zeros when it does not say). */
export function testCounts(text) {
  const find = (...patterns) => patterns.map((re) => re.exec(text)?.[1]).find((n) => n !== undefined);
  const total = find(/(?:^|\n)\s*ℹ tests\s+(\d+)/, /\bTests:\s+(\d+)\b/, /\b(\d+)\s+passing\b/);
  const pass = find(/(?:^|\n)\s*ℹ pass\s+(\d+)/, /\bTests:\s+(\d+)\s+passed/, /\b(\d+)\s+passing\b/, /\b(\d+)\s+passed\b/);
  const fail = find(/(?:^|\n)\s*ℹ fail\s+(\d+)/, /\bTests:\s+(\d+)\s+failed/, /\b(\d+)\s+failing\b/, /\b(\d+)\s+failed\b/);
  const skipped = find(/(?:^|\n)\s*ℹ skipped\s+(\d+)/);
  return { total: Number(total ?? 0), pass: Number(pass ?? total ?? 0), fail: Number(fail ?? 0), skipped: Number(skipped ?? 0) };
}

/** The project's own test command ("" when it has none): what `bh check` falls back to. */
export function testCommand(root, tool = detect(root)) {
  if (tool.pkg?.scripts?.test) return runScript(tool.pm, "test");
  const py = join(root, "pyproject.toml");
  if (tool.python && (existsSync(join(root, "pytest.ini")) || existsSync(join(root, "tests")) || (existsSync(py) && /pytest/.test(readFileSync(py, "utf8"))))) return `${resolveCmd("python3")} -m pytest -q`;
  if (tool.go) return "go test ./...";
  if (tool.rust) return "cargo test";
  return "";
}

/** Keep the last `max` lines, saying how many were cut. */
export function tail(text, max = 120) {
  const rows = text.trimEnd().split("\n");
  return rows.length <= max ? rows.join("\n") : [`… ${rows.length - max} earlier lines cut`, ...rows.slice(-max)].join("\n");
}

export function fail(message) {
  console.error(message);
  process.exit(2);
}

/** Files no review needs: lockfiles, build output, minified and generated files, snapshots. */
const NOISE = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|Cargo\.lock|poetry\.lock|go\.sum|composer\.lock)$|(^|\/)(dist|build|out|coverage|\.next|vendor|node_modules)\/|\.min\.(js|css)$|\.map$|\.snap$|(^|\/)__snapshots__\//;

export function isNoise(file) {
  return NOISE.test(file);
}

const GENERATED_MARK = /@generated|DO NOT EDIT|auto-?generated|generated by|This file was automatically generated|Code generated .* DO NOT EDIT/i;

/** A file that says it is generated in its first lines. */
export function isGenerated(root, file) {
  if (isNoise(file)) return true;
  try {
    const head = readFileSync(join(root, file), "utf8").slice(0, 600);
    // Said in a comment, not code that merely mentions the words.
    return head.split("\n").some((row) => /^\s*(\/\/|#|\/?\*|<!--|--)/.test(row) && GENERATED_MARK.test(row));
  } catch {
    return false;
  }
}

export function tracked(root, ...paths) {
  return listProjectFiles(root, { paths: paths.flat() });
}

const JS_EXT = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];

/** Relative imports of a source file, resolved to project files (JS/TS and Python). */
export function importsOf(root, file, known) {
  file = toPosix(file);
  let text;
  try {
    text = stripBomAndCr(readFileSync(join(root, file), "utf8"));
  } catch {
    return [];
  }
  const dir = dirname(file);
  const out = new Set();
  const resolve = (spec) => {
    const base = toPosix(join(dir, spec));
    const stripped = base.replace(/\.(m|c)?js$/, "");
    for (const candidate of [base, ...JS_EXT.map((ext) => stripped + ext), ...JS_EXT.map((ext) => `${base}/index${ext}`)]) if (known.has(candidate)) return candidate;
    return undefined;
  };
  if (/\.(m|c)?[jt]sx?$/.test(file)) {
    for (const m of text.matchAll(/(?:import|export)\s[^'"]*?from\s*['"](\.{1,2}\/[^'"]+)['"]|import\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)|require\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)|^\s*import\s+['"](\.{1,2}\/[^'"]+)['"]/gm)) {
      // A type-only import never runs, so it makes no cycle at runtime.
      if (/^\s*(import|export)\s+type\s/.test(m[0])) continue;
      const hit = resolve(m[1] ?? m[2] ?? m[3] ?? m[4]);
      if (hit) out.add(hit);
    }
  } else if (file.endsWith(".py")) {
    for (const m of text.matchAll(/^\s*from\s+(\.+)([\w.]*)\s+import/gm)) {
      const up = m[1].length - 1;
      const parts = dir.split("/").slice(0, dir.split("/").length - up);
      const mod = [...parts, ...(m[2] ? m[2].split(".") : [])].join("/");
      for (const candidate of [`${mod}.py`, `${mod}/__init__.py`]) if (known.has(candidate)) out.add(candidate);
    }
  }
  return [...out];
}

/** The import graph of the project's JS/TS and Python files. */
export function importGraph(root) {
  const files = tracked(root).filter((file) => /\.((m|c)?[jt]sx?|py)$/.test(file) && !isNoise(file));
  const known = new Set(files);
  const graph = new Map();
  for (const file of files) graph.set(file, importsOf(root, file, known));
  return graph;
}

/** Changed line ranges per file since `base` (new-side line numbers). */
export function changedRanges(root, base) {
  const ranges = new Map();
  const add = (args) => {
    let file;
    for (const row of sh("git", ["-c", "core.quotepath=false", "diff", "-U0", ...args], { cwd: root }).out.split("\n")) {
      if (row.startsWith("+++ ")) file = row.startsWith("+++ b/") ? toPosix(row.slice(6)) : undefined;
      const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(row);
      if (m && file) ranges.set(file, [...(ranges.get(file) ?? []), [Number(m[1]), Number(m[1]) + Math.max(0, Number(m[2] ?? 1) - 1)]]);
    }
  };
  if (base !== "HEAD") add([`${base}...HEAD`]);
  add(["HEAD"]);
  return ranges;
}

/** Top-level declarations with their line spans, by indentation and braces; good enough to name what a hunk touched. */
export function declarations(text, file) {
  file = toPosix(file);
  const rows = stripBomAndCr(text).split("\n");
  const patterns = file.endsWith(".py")
    ? [/^(\s*)(?:async\s+)?def\s+(\w+)/, /^(\s*)class\s+(\w+)/]
    : file.endsWith(".go")
      ? [/^()func\s+(?:\([^)]*\)\s*)?(\w+)/, /^()type\s+(\w+)/]
      : file.endsWith(".rs")
        ? [/^(\s*)(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+(\w+)/, /^(\s*)(?:pub\s+)?(?:struct|enum|trait)\s+(\w+)/]
        : [
          /^(\s*)(?:export\s+)?(?:default\s+)?(?:async\s+)?function\*?\s+([\w$]+)/,
          /^(\s*)(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([\w$]+)/,
          /^(\s*)(?:export\s+)?(?:interface|type|enum)\s+([\w$]+)/,
          /^(\s*)(?:export\s+)?const\s+([\w$]+)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*(?::[^=]+)?=>/,
          /^(\s{2,4})(?:public\s+|private\s+|protected\s+|static\s+|async\s+|get\s+|set\s+)*([\w$]+)\s*\([^)]*\)\s*(?::\s*[^{]+)?\{\s*$/,
        ];
  const found = [];
  rows.forEach((row, index) => {
    for (const pattern of patterns) {
      const m = pattern.exec(row);
      if (m && !/^(if|for|while|switch|catch|return)$/.test(m[2])) {
        found.push({ name: m[2], indent: m[1].length, start: index + 1 });
        break;
      }
    }
  });
  // A declaration ends where the next one at its indentation (or shallower) starts.
  for (let i = 0; i < found.length; i++) {
    const next = found.slice(i + 1).find((other) => other.indent <= found[i].indent);
    found[i].end = next ? next.start - 1 : rows.length;
    while (found[i].end > found[i].start && !rows[found[i].end - 1].trim()) found[i].end -= 1;
  }
  return found;
}
