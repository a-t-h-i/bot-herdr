// Sibling Windows fixes: .cmd/python command resolution, RUNNERS immutability, backslash paths in
// the scripts, file:// and drive-letter log parsing, pyproject reading without `cat`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as common from "../mods/bot-herdr/engine/scripts/lib/common.mjs";
import * as S from "../mods/bot-herdr/engine/lib/scripts.mjs";

const ENGINE = fileURLToPath(new URL("../mods/bot-herdr/engine", import.meta.url));
const script = (name) => join(ENGINE, "scripts", `${name}.mjs`);
const git = (cwd, ...args) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8" });
const write = (root, file, text) => {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), text);
};
const run = (name, args, cwd, env = {}) => {
  const r = spawnSync(process.execPath, [script(name), ...args], { cwd, encoding: "utf8", env: { ...process.env, ...env } });
  return { code: r.status, out: r.stdout, err: r.stderr };
};
const repo = (files) => {
  const root = mkdtempSync(join(tmpdir(), "bh-windows-"));
  for (const [file, text] of Object.entries(files)) write(root, file, text);
  git(root, "init", "-q");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "init");
  return root;
};

test("path, BOM/CRLF, file URL and Windows command helpers", () => {
  assert.equal(common.toPosix("./src\\lib\\a.mjs"), "src/lib/a.mjs");
  assert.equal(common.stripBomAndCr("\uFEFFa\r\nb\rc"), "a\nb\nc");
  assert.equal(common.stripFileUrl("file:///C:/proj/src/a.js"), "C:/proj/src/a.js");
  assert.equal(common.stripFileUrl("C:\\proj\\src\\a.js"), "C:/proj/src/a.js");
  assert.equal(common.resolveCmd("npx", { platform: "win32", env: { PATH: "" } }), "npx.cmd");
  assert.equal(common.resolveCmd("python3", { platform: "win32", env: { PATH: "" }, probe: (name) => name === "python" }), "python");
  assert.equal(common.resolveCmd("python3", { platform: "win32", env: { PATH: "" }, probe: (name) => name === "py" }), "py");
  assert.equal(common.resolveCmd("python3", { platform: "linux", env: { PATH: "" } }), "python3");
});

test("lib/scripts.mjs never mutates RUNNERS when pretending to be Windows", () => {
  const root = mkdtempSync(join(tmpdir(), "bh-runners-"));
  write(root, ".bot-herdr/scripts/noop.py", "print('ok')\n");
  const descriptor = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { value: "win32", configurable: true });
  try {
    S.run(root, "noop", [], { capture: true });
    S.run(root, "noop", [], { capture: true });
  } finally {
    Object.defineProperty(process, "platform", descriptor);
  }
  assert.deepEqual(S.RUNNERS[".py"], ["python3"]);
});

test("find_tests_for normalizes a Windows backslash path, in git and outside git", () => {
  const root = repo({ "src/lib/foo.mjs": "export const foo = 1;\n", "test/foo.test.mjs": "import '../src/lib/foo.mjs';\n" });
  const gitRun = run("find_tests_for", ["src\\lib\\foo.mjs"], root);
  assert.equal(gitRun.code, 0, gitRun.err);
  assert.match(gitRun.out, /src\/lib\/foo\.mjs:/);
  assert.match(gitRun.out, /test\/foo\.test\.mjs/);
  const outside = mkdtempSync(join(tmpdir(), "bh-nongit-fixtures-"));
  write(outside, "tests/helpers.js", "export function makeUser() { return {}; }\n");
  write(outside, "test/user.test.js", "import { makeUser } from '../tests/helpers.js';\n");
  const fixtures = run("find_test_fixtures", [], outside);
  assert.equal(fixtures.code, 0, fixtures.err);
  assert.match(fixtures.out, /tests\/helpers\.js/);
});

test("find_test_fixtures names test setup files that git does not track", () => {
  const root = repo({ "src/a.js": "export const a = 1;\n", "test/a.test.js": "import { makeUser } from '../tests/fixtures/make.js';\n", "tests/fixtures/make.js": "export const makeUser = () => ({});\n" });
  write(root, "vitest.config.js", "export default {};\n");
  const result = run("find_test_fixtures", [], root);
  assert.equal(result.code, 0, result.err);
  assert.match(result.out, /## Test setup: vitest\.config\.js/);
});

test("affected_packages compares git's forward-slash files with package dirs", () => {
  const root = repo({
    "package.json": JSON.stringify({ name: "root", private: true, workspaces: ["packages/*"] }),
    "packages/a/package.json": JSON.stringify({ name: "a", version: "1.0.0" }),
    "packages/a/index.js": "export const a = 1;\n",
    "packages/b/package.json": JSON.stringify({ name: "b", version: "1.0.0", dependencies: { a: "1.0.0" } }),
    "packages/b/index.js": "export const b = 1;\n",
  });
  write(root, "packages/a/index.js", "export const a = 2;\n");
  const result = run("affected_packages", ["--base", "HEAD"], root);
  assert.equal(result.code, 0, result.err);
  assert.match(result.out, /changed {2}a \(packages\/a,/);
  assert.match(result.out, /affected b \(packages\/b, through a\)/);
});

test("check_contract_breakage finds a Windows-style relative importer and tolerates CRLF", () => {
  const root = repo({
    "lib/a.mjs": "export function oldName(x) { return x; }\n",
    "lib/use.mjs": "import { oldName } from './a.mjs';\nconsole.log(oldName(1));\n",
  });
  write(root, "lib/a.mjs", "export function newName(x) { return x; }\r\n");
  const result = run("check_contract_breakage", ["--base", "HEAD"], root);
  assert.equal(result.code, 1, result.err);
  assert.match(result.out, /oldName/);
  assert.match(result.out, /lib\/use\.mjs/);
});

test("failure_digest parses backslashes and file:// URLs and strips CRLF", () => {
  const root = mkdtempSync(join(tmpdir(), "bh-digest-"));
  write(root, "src/lib/a.js", "const one = 1;\r\nconst two = 2;\r\nconst three = 3;\r\nconst four = 4;\r\n");
  const log = join(root, "run.log");
  writeFileSync(log, [
    "src\\lib\\a.js:2:5:  boom\r\n",
    `    at handler (file://${join(root, "src/lib/a.js")}:3:7)\r\n`,
    "src\\lib\\a.ts(2,5): error TS1005: ';' expected.\r\n",
    "error[E0308]: mismatched types\r\n",
    " --> src\\lib\\b.rs:2:3\r\n",
  ].join(""));
  const result = run("failure_digest", [log], root);
  assert.equal(result.code, 0, result.err);
  assert.match(result.out, /src\/lib\/a\.js/);
  assert.match(result.out, /boom/);
  assert.match(result.out, /## Where it broke/);
  assert.match(result.out, /src\/lib\/a\.js:3/);
  // TypeScript and Rust name their files with backslashes too, and CRLF source keeps its \r.
  assert.match(result.out, /src\/lib\/a\.ts\n {2}2: TS1005/);
  assert.match(result.out, /src\/lib\/b\.rs\n {2}2: mismatched types/);
  assert.doesNotMatch(result.out, /src\\lib/);
  assert.doesNotMatch(result.out, /\r/);
});

test("resolveLocalBin runs a local package's JS bin on this Node, its native bin directly, and never a .cmd bare", () => {
  const root = mkdtempSync(join(tmpdir(), "bh-local-bin-"));
  // typescript ships `bin/tsc` with a node shebang and no extension.
  write(root, "node_modules/typescript/package.json", JSON.stringify({ name: "typescript", bin: { tsc: "./bin/tsc", tsserver: "./bin/tsserver" } }));
  write(root, "node_modules/typescript/bin/tsc", "#!/usr/bin/env node\nprocess.exit(0);\n");
  // Something native: no shebang, no JS extension.
  write(root, "node_modules/@biomejs/biome/package.json", JSON.stringify({ name: "@biomejs/biome", bin: { biome: "./bin/biome" } }));
  write(root, "node_modules/@biomejs/biome/bin/biome", "\u007fELF\u0002\u0001\u0001");

  const tsc = common.resolveLocalBin(root, "tsc", { args: ["--noEmit"] });
  assert.equal(tsc.cmd, process.execPath);
  assert.deepEqual(tsc.args, [join(root, "node_modules/typescript/bin/tsc"), "--noEmit"]);
  const biome = common.resolveLocalBin(root, "biome", { args: ["check"] });
  assert.equal(biome.cmd, join(root, "node_modules/@biomejs/biome/bin/biome"));
  assert.deepEqual(biome.args, ["check"]);

  // Windows: no `.cmd` path ever goes to execFileSync; without a local package or npx-cli.js the
  // shim is only reached through cmd.exe, with its arguments quoted into one command line.
  const bare = common.resolveLocalBin(root, "vitest", { args: ["run"], platform: "win32", probe: () => false });
  assert.match(bare.cmd, /cmd\.exe$/i);
  assert.equal(bare.cmd.endsWith(".cmd"), false);
  assert.deepEqual(bare.args.slice(0, 3), ["/d", "/s", "/c"]);
  assert.match(bare.args[3], /^vitest\.cmd run$/);
});

test("check_changed and run_changed_tests run the project's own JS tools on this Node", () => {
  const root = repo({ "a.ts": "export const a = 1;\n" });
  write(root, "tsconfig.json", "{}\n");
  write(root, "node_modules/typescript/package.json", JSON.stringify({ name: "typescript", bin: { tsc: "./bin/tsc" } }));
  write(root, "node_modules/typescript/bin/tsc", `#!/usr/bin/env node\nrequire("node:fs").writeFileSync(${JSON.stringify(join(root, "tsc-ran.txt"))}, process.argv.slice(2).join(" "));\n`);
  const checked = run("check_changed", ["a.ts", "--json"], root);
  assert.equal(checked.code, 0, checked.err);
  assert.match(readFileSync(join(root, "tsc-ran.txt"), "utf8"), /--noEmit -p \./);
  assert.ok(JSON.parse(checked.out).checks.some((check) => check.name.startsWith("typecheck")), checked.out);

  const tests = repo({ "test/a.test.js": "test('a', () => {});\n", "src/a.js": "export const a = 1;\n" });
  write(tests, "package.json", JSON.stringify({ name: "app", devDependencies: { vitest: "^1.0.0" } }));
  write(tests, "node_modules/vitest/package.json", JSON.stringify({ name: "vitest", bin: { vitest: "./vitest.mjs" } }));
  write(tests, "node_modules/vitest/vitest.mjs", `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(join(tests, "vitest-ran.txt"))}, process.argv.slice(2).join(" "));\nconsole.log("Tests 1 passed");\n`);
  const ran = run("run_changed_tests", ["test/a.test.js"], tests);
  assert.equal(ran.code, 0, ran.err);
  assert.match(ran.out, /\$ npx vitest run test\/a\.test\.js/);
  assert.match(readFileSync(join(tests, "vitest-ran.txt"), "utf8"), /^run test\/a\.test\.js$/);
});

test("check_changed reads pyproject.toml itself and resolves python without cat/npx failures", () => {
  const root = mkdtempSync(join(tmpdir(), "bh-check-"));
  write(root, "pyproject.toml", "[tool.mypy]\nstrict = true\n");
  write(root, "a.py", "def f():\n    return 1\n");
  const bin = join(root, "fake-bin");
  mkdirSync(bin, { recursive: true });
  const python = join(bin, "python3");
  writeFileSync(python, "#!/bin/sh\nexit 0\n");
  chmodSync(python, 0o755);
  const result = run("check_changed", ["a.py", "--json"], root, { PATH: `${bin}:${process.env.PATH}` });
  assert.equal(result.code, 0, result.err);
  const parsed = JSON.parse(result.out);
  assert.ok(parsed.checks.some((check) => check.name === "mypy"));
  assert.ok(parsed.checks.some((check) => check.name === "python syntax"));
});
