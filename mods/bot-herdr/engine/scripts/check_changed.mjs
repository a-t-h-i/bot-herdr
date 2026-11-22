#!/usr/bin/env node
// purpose: typecheck and lint only what changed on this branch (or given files) with the project's own tools; prints each check's findings and a pass/fail line, and with --json the counts that ran
// usage: node {script} [files…] [--base <ref>] [--timeout <seconds>] [--json]
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { baseRef, changedFiles, detect, parseArgs, projectRoot, resolveCmd, resolveLocalBin, sh, tail, toPosix } from "./lib/common.mjs";

const { flags, rest } = parseArgs();
const root = projectRoot();
const tool = detect(root);
const files = rest.length > 0 ? rest.map(toPosix) : changedFiles(root, baseRef(root, flags.base));
// Local tooling runs as this Node plus its JS entry (or its native binary), never as a `.cmd` shim.
const local = (tool, args) => resolveLocalBin(root, tool, { args });
const python = resolveCmd("python3");
const timeout = Number(flags.timeout ?? 240) * 1000;
const has = (name) => existsSync(join(root, name));
const pick = (pattern) => files.filter((file) => pattern.test(file));
const checks = [];
const report = [];
const say = (line = "") => report.push(line);

const ts = pick(/\.[cm]?tsx?$/);
if (ts.length > 0 && has("tsconfig.json")) checks.push({ name: "typecheck (whole project: tsc cannot check one file with the project's settings)", kind: "typecheck", ...local("tsc", ["--noEmit", "-p", "."]) });
// A mod's UI is untyped JavaScript checked by its own jsconfig, not by a file tsc could take on
// its own; it needs the project's typescript, and says so rather than reaching for npx.
const uiProject = "mods/bot-herdr/jsconfig.json";
const ui = files.filter((file) => file === uiProject || /^mods\/bot-herdr\/[^/]+\.js$/.test(file));
if (ui.length > 0 && has(uiProject)) {
  const name = `typecheck (${uiProject}: the mod's UI)`;
  if (has("node_modules/typescript/package.json")) checks.push({ name, kind: "typecheck", ...local("tsc", ["--noEmit", "-p", uiProject]) });
  else checks.push({ name, kind: "typecheck", missing: `typescript is not installed: run npm install (needed for ${uiProject})` });
}
const js = pick(/\.[cm]?[jt]sx?$/);
const eslint = ["eslint.config.js", "eslint.config.mjs", "eslint.config.ts", ".eslintrc", ".eslintrc.js", ".eslintrc.cjs", ".eslintrc.json"].some(has) || tool.pkg?.eslintConfig;
if (js.length > 0 && eslint) checks.push({ name: "eslint", kind: "lint", ...local("eslint", js) });
if (js.length > 0 && (has("biome.json") || has("biome.jsonc"))) checks.push({ name: "biome", kind: "lint", ...local("biome", ["check", ...js]) });
const py = pick(/\.py$/);
if (py.length > 0) {
  if (sh("ruff", ["--version"]).code === 0) checks.push({ name: "ruff", kind: "lint", cmd: "ruff", args: ["check", ...py] });
  else checks.push({ name: "python syntax", kind: "lint", cmd: python, args: ["-m", "py_compile", ...py] });
  const pyproject = (() => { try { return readFileSync(join(root, "pyproject.toml"), "utf8"); } catch { return ""; } })();
  if (has("mypy.ini") || /\[tool\.mypy\]/.test(pyproject)) checks.push({ name: "mypy", kind: "typecheck", cmd: python, args: ["-m", "mypy", ...py] });
}
const go = pick(/\.go$/);
if (go.length > 0 && tool.go) checks.push({ name: "go vet", kind: "lint", cmd: "go", args: ["vet", ...new Set(go.map((file) => `./${file.split("/").slice(0, -1).join("/") || "."}`))] });
if (pick(/\.rs$/).length > 0 && tool.rust) checks.push({ name: "cargo check", kind: "lint", cmd: "cargo", args: ["check", "--quiet"] });

/** What ran, as `bh check` reads it: counts by kind plus each check's outcome, and the text a person reads. */
function finish(summary, code) {
  const result = { files, lint: 0, typecheck: 0, checks: [], ...summary };
  if (flags.json) console.log(JSON.stringify({ ...result, report: report.join("\n") }));
  else console.log(report.join("\n"));
  process.exit(code);
}

if (files.length === 0) {
  say("No changed files: nothing to check.");
  finish({ note: "No changed files: nothing to check." }, 0);
}
if (checks.length === 0) {
  say(`Changed: ${files.length} file(s). No typechecker or linter is set up for them.`);
  finish({ note: `Changed: ${files.length} file(s). No typechecker or linter is set up for them.` }, 0);
}

const ran = [];
let failed = 0;
for (const check of checks) {
  if (check.missing) {
    failed += 1;
    say(`## ${check.name}: cannot run (${check.missing})`);
    ran.push({ name: check.name, kind: check.kind, ok: false, exit: null, missing: check.missing });
    continue;
  }
  const result = sh(check.cmd, check.args, { cwd: root, timeout, env: { ...process.env, FORCE_COLOR: "0" } });
  const ok = result.code === 0;
  if (!ok) failed += 1;
  say(`## ${check.name}: ${ok ? "clean" : `findings (exit ${result.code})`}`);
  const output = `${result.out}${result.err}`.trim();
  if (!ok && output) say(tail(output, 80));
  ran.push({ name: check.name, kind: check.kind, ok, exit: result.code });
}
say(failed === 0 ? "PASS" : `FAIL (${failed} of ${checks.length} checks)`);
const count = (kind) => ran.filter((check) => check.kind === kind).length;
finish({ lint: count("lint"), typecheck: count("typecheck"), checks: ran }, failed === 0 ? 0 : 1);
