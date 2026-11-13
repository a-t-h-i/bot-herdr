#!/usr/bin/env node
// purpose: run only the tests that cover the files changed on this branch (or given files), with a timeout; prints the command, the tail of its output and the exit code, and with --json how many ran and which files no test names
// usage: node {script} [files…] [--base <ref>] [--timeout <seconds>] [--dry-run] [--json]
import { baseRef, changedFiles, countTests, detect, isCode, isTest, parseArgs, projectRoot, sh, tail, testsFor } from "./lib/common.mjs";

const { flags, rest } = parseArgs();
const root = projectRoot();
const tool = detect(root);
const files = rest.length > 0 ? rest : changedFiles(root, baseRef(root, flags.base));
const report = [];
const say = (line = "") => report.push(line);

/** What ran, as `bh check` reads it, and the text a person reads. */
function finish(summary, code) {
  const result = { files, ran: false, tests: 0, command: "", untested: [], ...summary };
  if (flags.json) console.log(JSON.stringify({ ...result, report: report.join("\n") }));
  else console.log(report.join("\n"));
  process.exit(code);
}

if (files.length === 0) {
  say("No changed files: nothing to test.");
  finish({ note: "No changed files: nothing to test." }, 0);
}
const covered = testsFor(root, files);
const tests = [...new Set([...covered.values()].flat())];
// A test exists for source files: docs, images, the store's own files and config are not "untested".
const untested = [...covered].filter(([file, hits]) => hits.length === 0 && !isTest(file) && isCode(file) && !file.startsWith(".bot-herdr/")).map(([file]) => file);

function plan() {
  const goTests = files.filter((file) => file.endsWith(".go"));
  if (tool.go && goTests.length > 0) return { cmd: "go", args: ["test", ...new Set(goTests.map((file) => `./${file.split("/").slice(0, -1).join("/") || "."}`))] };
  const py = tests.filter((file) => file.endsWith(".py"));
  if (tool.python && py.length > 0) return { cmd: "python3", args: ["-m", "pytest", "-q", ...py] };
  if (tool.rust && files.some((file) => file.endsWith(".rs"))) return { cmd: "cargo", args: ["test", "--quiet"] };
  const js = tests.filter((file) => /\.[cm]?[jt]sx?$/.test(file));
  if (!tool.pkg || js.length === 0) return undefined;
  const testScript = tool.pkg.scripts?.test ?? "";
  if (tool.deps.vitest || /vitest/.test(testScript)) return { cmd: "npx", args: ["vitest", "run", ...js] };
  if (tool.deps.jest || /jest/.test(testScript)) return { cmd: "npx", args: ["jest", ...js] };
  if (tool.deps.mocha || /mocha/.test(testScript)) return { cmd: "npx", args: ["mocha", ...js] };
  if (/@playwright\/test/.test(JSON.stringify(tool.deps)) && js.every((file) => /e2e|playwright|\/web\//.test(file))) return { cmd: "npx", args: ["playwright", "test", ...js] };
  if (/node\s+--test/.test(testScript) || js.length > 0) return { cmd: "node", args: ["--test", ...js.filter((file) => !/\/(e2e|web)\//.test(file))] };
  return undefined;
}

const run = plan();
say(`Changed: ${files.length} file(s). Tests covering them: ${tests.length}.`);
if (untested.length > 0) say(`No test found for: ${untested.slice(0, 15).join(", ")}${untested.length > 15 ? ", …" : ""}`);
if (!run || run.args.length === 0) {
  say("No targeted test command for these files. Run the project's test command (see project_commands.mjs) if the change needs it.");
  finish({ untested }, 0);
}
const command = `${run.cmd} ${run.args.join(" ")}`;
say(`$ ${command}`);
if (flags["dry-run"]) finish({ command, untested }, 0);
const seconds = Number(flags.timeout ?? 300);
const result = sh(run.cmd, run.args, { cwd: root, timeout: seconds * 1000, env: { ...process.env, CI: "1", FORCE_COLOR: "0" } });
const output = `${result.out}${result.err ? `\n${result.err}` : ""}`;
say(tail(output));
say(result.code === 0 ? "PASS" : `FAIL (exit ${result.code})`);
finish({ ran: true, tests: countTests(output) || tests.length, command, exit: result.code, untested }, result.code === 0 ? 0 : 1);
