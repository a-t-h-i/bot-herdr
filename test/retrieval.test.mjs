// The cross-platform retrieval layer and the new reading scripts: backend parity, Windows-safe
// paths, injection guards, loud errors, spec-driven tools and the deterministic locator.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as common from "../mods/bot-herdr/engine/scripts/lib/common.mjs";

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

/** A git project with CRLF, BOM, spaces, non-ASCII, binary, ignored, untracked and meta files. */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "bh-retrieval-"));
  write(root, ".gitignore", "ignored.log\n");
  write(root, "src/app.js", "export function decide(input) {\n  return input ? \"yes\" : \"no\";\n}\n");
  write(root, "src/crlf.js", "const first = 1;\r\nconst needle = \"crlf\";\r\n");
  write(root, "src/bom.js", "\uFEFFconst needle = \"bom\";\n");
  write(root, "src/space name.js", "const needle = \"space\";\n");
  write(root, "src/naïve.js", "const needle = \"unicode\";\n");
  write(root, "src/deep/nested.js", "const needle = \"deep\";\n");
  write(root, "src/many.js", `${Array.from({ length: 5 }, (_, i) => `const needle${i} = ${i};`).join("\n")}\n`);
  write(root, "src/literal.js", "const command = \"--pre=echo\";\nconst shell = \"$(touch pwned)\";\nconst dash = \"-e\";\n");
  write(root, ".bot-herdr/noise.js", "const needle = \"meta\";\n");
  write(root, "src/ignored.log", "needle ignored\n");
  writeFileSync(join(root, "src/blob.bin"), Buffer.from([0, 110, 101, 101, 100, 108, 101]));
  git(root, "init", "-q");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "init");
  write(root, "src/untracked.js", "const needle = \"untracked\";\n");
  return root;
}

const toolOpts = (root) => ({ binDir: join(root, "missing-bin"), platform: process.platform, env: process.env });

function searchBackends(root) {
  return [...(common.resolveTool("rg", toolOpts(root)) ? ["rg"] : []), "git", "node"];
}
function listBackends(root) {
  return [...(common.resolveTool("fd", toolOpts(root)) ? ["fd"] : []), ...(common.resolveTool("rg", toolOpts(root)) ? ["rg"] : []), "git", "node"];
}
const signatures = (result) => result.matches.map((hit) => `${hit.file}:${hit.line}:${hit.text}`);

test("listProjectFiles: fd, rg, git and Node agree on sorted / paths, untracked, ignored and meta", () => {
  const root = fixture();
  const expected = [".gitignore", "src/app.js", "src/blob.bin", "src/bom.js", "src/crlf.js", "src/deep/nested.js", "src/literal.js", "src/many.js", "src/naïve.js", "src/space name.js", "src/untracked.js"];
  for (const backend of listBackends(root)) assert.deepEqual(common.listProjectFiles(root, { backend, toolOpts: toolOpts(root) }), expected, backend);
  assert.ok(!common.listProjectFiles(root).includes(".bot-herdr/noise.js"));
  assert.ok(!common.listProjectFiles(root).includes("src/ignored.log"));
  assert.ok(common.listProjectFiles(root, { includeMeta: true }).includes(".bot-herdr/noise.js"));
  assert.ok(!common.listProjectFiles(root, { backend: "node", maxDepth: 1 }).includes("src/deep/nested.js"));
  assert.ok(common.listProjectFiles(root, { backend: "node", maxDepth: 1 }).includes("src/app.js"));
});

test("searchProject: rg, git grep --untracked and the Node fallback return identical hits", () => {
  const root = fixture();
  const results = searchBackends(root).map((backend) => [backend, common.searchProject(root, { pattern: "needle", backend, toolOpts: toolOpts(root) })]);
  for (const [backend, result] of results) assert.equal(result.ok, true, backend);
  const first = signatures(results[0][1]);
  for (const [backend, result] of results.slice(1)) assert.deepEqual(signatures(result), first, backend);
  assert.ok(first.some((line) => line.startsWith("src/untracked.js:1:")));
  assert.ok(first.some((line) => line.startsWith("src/space name.js:1:")));
  assert.ok(first.some((line) => line.startsWith("src/naïve.js:1:")));
  assert.ok(!first.some((line) => line.startsWith(".bot-herdr/")));
  assert.ok(!first.some((line) => line.includes("ignored.log")));
  assert.ok(!first.some((line) => line.includes("blob.bin")));
  assert.ok(first.filter((line) => line.startsWith("src/bom.js:")).every((line) => !line.includes("\uFEFF")));
  assert.ok(first.filter((line) => line.startsWith("src/crlf.js:")).every((line) => !line.includes("\r")));
});

test("searchProject: --include-meta opts into engine noise; truncation is identical on every backend", () => {
  const root = fixture();
  for (const backend of searchBackends(root)) {
    const meta = common.searchProject(root, { pattern: "needle", backend, includeMeta: true, toolOpts: toolOpts(root) });
    assert.ok(signatures(meta).some((line) => line.startsWith(".bot-herdr/noise.js:1:")), backend);
    const cut = common.searchProject(root, { pattern: "needle", backend, max: 2, toolOpts: toolOpts(root) });
    assert.equal(cut.matches.length, 2, backend);
    assert.equal(cut.truncated, true, backend);
  }
});

test("searchProject: bad regex, a missing backend and a non-git explicit backend are loud, not empty", () => {
  const root = fixture();
  const invalid = common.searchProject(root, { pattern: "[", backend: "node" });
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /regular expression/i);
  const empty = join(root, "empty-bin");
  mkdirSync(empty, { recursive: true });
  const missing = common.searchProject(root, { pattern: "needle", backend: "rg", toolOpts: { binDir: empty, env: { PATH: empty }, platform: process.platform } });
  assert.equal(missing.ok, false);
  assert.match(missing.error, /not installed/i);
  const outside = mkdtempSync(join(tmpdir(), "bh-nongit-"));
  assert.throws(() => common.listProjectFiles(outside, { backend: "git" }), /git/i);
  assert.throws(() => common.listProjectFiles(outside, { backend: "rg", toolOpts: { binDir: empty, env: { PATH: empty }, platform: process.platform } }), /not installed/i);
});

test("resolveTool: bundled first, then PATH, and Linux shadow-utils sg is never ast-grep", () => {
  const root = mkdtempSync(join(tmpdir(), "bh-tools-"));
  const bin = join(root, "bin");
  const pathDir = join(root, "path");
  mkdirSync(bin, { recursive: true });
  mkdirSync(pathDir, { recursive: true });
  writeFileSync(join(bin, "rg"), "");
  writeFileSync(join(pathDir, "rg"), "");
  common.resetToolCache();
  const opts = { platform: "linux", env: { PATH: pathDir } };
  assert.equal(common.resolveTool("rg", { ...opts, binDir: bin }), join(bin, "rg"));
  assert.equal(common.resolveTool("rg", { ...opts, binDir: join(root, "none") }), join(pathDir, "rg"));

  const sg = join(pathDir, "sg");
  writeFileSync(sg, "#!/bin/sh\necho 'sg from shadow-utils'\n");
  chmodSync(sg, 0o755);
  common.resetToolCache();
  assert.equal(common.resolveTool("ast-grep", { ...opts, binDir: join(root, "none") }), undefined);
  writeFileSync(sg, "#!/bin/sh\necho 'ast-grep 0.51.3'\n");
  common.resetToolCache();
  assert.equal(common.resolveTool("ast-grep", { ...opts, binDir: join(root, "none") }), sg);
  writeFileSync(join(pathDir, "ast-grep"), "");
  common.resetToolCache();
  assert.equal(common.resolveTool("ast-grep", { ...opts, binDir: join(root, "none") }), join(pathDir, "ast-grep"));
});

test("security: leading-dash and shell-metacharacter patterns stay data, and ../ never escapes", () => {
  const root = fixture();
  for (const backend of searchBackends(root)) {
    const option = common.searchProject(root, { pattern: "--pre=echo", regex: false, backend, toolOpts: toolOpts(root) });
    assert.equal(option.ok, true, backend);
    assert.ok(signatures(option).some((line) => line.includes("--pre=echo")), backend);
    const shell = common.searchProject(root, { pattern: "$(touch pwned)", regex: false, backend, toolOpts: toolOpts(root) });
    assert.equal(shell.ok, true, backend);
    assert.ok(signatures(shell).some((line) => line.includes("touch pwned")), backend);
    assert.equal(existsSync(join(root, "pwned")), false);
    const dash = common.searchProject(root, { pattern: "-e", regex: false, backend, toolOpts: toolOpts(root) });
    assert.equal(dash.ok, true, backend);
  }
  const symbol = run("find_symbol", ["-e"], root);
  assert.equal(symbol.code, 0, symbol.err);
  assert.match(symbol.out, /src\/literal\.js:3\s/);
  assert.throws(() => common.resolveSafePath(root, "../secret"), /escapes/);
  assert.throws(() => common.resolveSafePath(root, "/etc/passwd"), /escapes/);
});

test("scripts: search_code, find_symbol --body, read_slice, find_files and locate work end to end", () => {
  const root = fixture();
  const search = run("search_code", ["needle", "--max", "2"], root);
  assert.equal(search.code, 0, search.err);
  assert.match(search.out, /truncated/);
  assert.match(search.out, /src\/.*needle/);
  const literal = run("search_code", ["--literal", "--", "--pre=echo"], root);
  assert.equal(literal.code, 0, literal.err);
  assert.match(literal.out, /src\/literal\.js:1:/);

  const symbol = run("find_symbol", ["decide", "--body", "--max-lines", "6"], root);
  assert.equal(symbol.code, 0, symbol.err);
  assert.match(symbol.out, /src\/app\.js:1-/);
  assert.match(symbol.out, /1 export function decide/);

  const slice = run("read_slice", ["src/app.js:1-2", "src/crlf.js:2-2"], root);
  assert.equal(slice.code, 0, slice.err);
  assert.match(slice.out, /## src\/app\.js:1-2/);
  assert.match(slice.out, /2 {3}return input/);
  assert.match(slice.out, /## src\/crlf\.js:2-2/);
  assert.doesNotMatch(slice.out, /\r/);

  const files = run("find_files", ["app", "--glob", "*.js"], root);
  assert.equal(files.code, 0, files.err);
  assert.match(files.out, /src\/app\.js/);
  const capped = run("find_files", ["--glob", "*.js", "--max", "2"], root);
  assert.equal(capped.code, 0, capped.err);
  assert.match(capped.out, /more file\(s\) cut/);

  const locate = run("locate", ["decide", "--max", "3"], root);
  assert.equal(locate.code, 0, locate.err);
  assert.match(locate.out, /src\/app\.js/);
  assert.match(locate.out, /src\/app\.js:1-\d+\s+decide/);
});

test("scripts: traversal arguments exit 2, find_symbol rejects a path as a name, and ast_search explains a missing tool", () => {
  const root = fixture();
  for (const [name, args] of [
    ["read_slice", ["../secret:1-2"]],
    ["outline_file", ["../secret.js"]],
    ["search_code", ["needle", "../"]],
    ["find_files", [".."]],
    ["find_symbol", ["../secret"]],
  ]) {
    const result = run(name, args, root);
    assert.equal(result.code, 2, `${name}: ${result.out}${result.err}`);
  }
  const empty = join(root, "empty-bin");
  mkdirSync(empty, { recursive: true });
  const missing = run("ast_search", ["foo($A)"], root, { BH_BIN_DIR: empty, PATH: empty });
  assert.equal(missing.code, 2);
  assert.match(missing.err, /ast-grep is not installed/);
});

test("scripts: ast_search reads ast-grep JSON stream, normalizes paths and caps output", () => {
  const root = fixture();
  const bin = join(root, "fake-bin");
  mkdirSync(bin, { recursive: true });
  const fake = join(bin, "ast-grep");
  const seen = join(bin, "argv.jsonl");
  writeFileSync(fake, `#!/usr/bin/env node\nimport { appendFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(seen)}, JSON.stringify(process.argv.slice(2)) + "\\n");\nconst rows = [{ file: "src/app.js", line: 2, text: "  decide(input);" }, { file: ".bot-herdr/noise.js", line: 1, text: "needle" }];\nprocess.stdout.write(rows.map((row) => JSON.stringify(row)).join("\\n") + "\\n");\n`);
  chmodSync(fake, 0o755);
  const result = run("ast_search", ["decide($A)"], root, { BH_BIN_DIR: bin });
  assert.equal(result.code, 0, result.err);
  assert.match(result.out, /src\/app\.js:2: decide\(input\);/);
  assert.doesNotMatch(result.out, /.bot-herdr/);
  // A pattern that starts with `-` is data: `--pattern=<value>` never becomes a clap flag.
  const dash = run("ast_search", ["-e"], root, { BH_BIN_DIR: bin });
  assert.equal(dash.code, 0, dash.err);
  const last = JSON.parse(readFileSync(seen, "utf8").trim().split("\n").at(-1));
  assert.ok(last.includes("--pattern=-e"), last.join(" "));
});

/** A git project whose path holds `-<digits>-`, the shape `path:line:text` used to split in two. */
function hyphenFixture() {
  const root = mkdtempSync(join(tmpdir(), "bh-hyphen-"));
  write(root, "tasks/t-20261121-ilrm/foo.js", "one\nneedle two\nthree\n");
  write(root, "src/app.js", "one\nneedle two\nthree\n");
  git(root, "init", "-q");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "init");
  return root;
}

test("a path holding -<digits>- parses the same on rg, git and Node, with and without context", () => {
  const root = hyphenFixture();
  for (const context of [0, 1]) {
    const results = searchBackends(root).map((backend) => [backend, common.searchProject(root, { pattern: "needle", backend, context, toolOpts: toolOpts(root) })]);
    const first = results[0][1].matches;
    assert.deepEqual(first.map((hit) => `${hit.file}:${hit.line}:${hit.text}`), ["src/app.js:2:needle two", "tasks/t-20261121-ilrm/foo.js:2:needle two"], `context ${context}`);
    for (const [backend, result] of results) assert.deepEqual(result.matches, first, `context ${context} ${backend}`);
    if (context) assert.deepEqual(first[1].before, ["one"], "a context line is marked context, not a match");
  }
});

test("a single-file path is searched the same on rg, git and Node, and by search_code", () => {
  const root = fixture();
  for (const backend of searchBackends(root)) {
    const result = common.searchProject(root, { pattern: "needle", paths: ["src/bom.js"], backend, toolOpts: toolOpts(root) });
    assert.deepEqual(signatures(result), ["src/bom.js:1:const needle = \"bom\";"], backend);
  }
  const cli = run("search_code", ["needle", "src/bom.js"], root);
  assert.equal(cli.code, 0, cli.err);
  assert.match(cli.out, /src\/bom\.js:1: const needle/);
});

test("word: true matches a token like -e the way rg -w and git grep -w do", () => {
  const root = fixture();
  const results = searchBackends(root).map((backend) => [backend, common.searchProject(root, { pattern: "-e", regex: false, word: true, backend, toolOpts: toolOpts(root) })]);
  const first = signatures(results[0][1]);
  assert.deepEqual(first, ["src/literal.js:3:const dash = \"-e\";"]);
  for (const [backend, result] of results) assert.deepEqual(signatures(result), first, backend);
});

test("listProjectFiles: an empty folder and a single-file path agree on every backend", () => {
  const root = fixture();
  mkdirSync(join(root, "empty"), { recursive: true });
  for (const backend of listBackends(root)) {
    assert.deepEqual(common.listProjectFiles(root, { paths: ["empty"], backend, toolOpts: toolOpts(root) }), [], `${backend} empty`);
    assert.deepEqual(common.listProjectFiles(root, { paths: ["src/app.js"], backend, toolOpts: toolOpts(root) }), ["src/app.js"], `${backend} single file`);
  }
});

test("scripts: boolean flags never eat the positional, and -- makes a dash pattern data", () => {
  const root = fixture();
  const literal = run("search_code", ["-F", "needle"], root);
  assert.equal(literal.code, 0, literal.err);
  assert.match(literal.out, /for "needle"/);
  assert.match(literal.out, /src\/bom\.js:1:/);

  const long = run("search_code", ["--literal", "needle"], root);
  assert.equal(long.code, 0, long.err);
  assert.match(long.out, /src\/bom\.js:1:/);

  const insensitive = run("search_code", ["-i", "NEEDLE"], root);
  assert.equal(insensitive.code, 0, insensitive.err);
  assert.match(insensitive.out, /for "NEEDLE"/);
  assert.match(insensitive.out, /src\/bom\.js:1:/);

  const dash = run("search_code", ["--", "-e"], root);
  assert.equal(dash.code, 0, dash.err);
  assert.match(dash.out, /for "-e"/);
  assert.match(dash.out, /src\/literal\.js:3:/);

  const defs = run("find_symbol", ["--defs", "needle"], root);
  assert.equal(defs.code, 0, defs.err);
  assert.match(defs.out, /## Defined \([1-9]\d*\)/);
  assert.match(defs.out, /src\/bom\.js:1 /);
  assert.doesNotMatch(defs.out, /## Used/);

  const body = run("find_symbol", ["--body", "decide"], root);
  assert.equal(body.code, 0, body.err);
  assert.match(body.out, /### src\/app\.js:1-3\s+decide/);

  const files = run("find_files", ["--regex", "app"], root);
  assert.equal(files.code, 0, files.err);
  assert.match(files.out, /src\/app\.js/);
  assert.doesNotMatch(files.out, /src\/crlf\.js/);

  const locate = run("locate", ["--json", "needle"], root);
  assert.equal(locate.code, 0, locate.err);
  const found = JSON.parse(locate.out);
  assert.equal(found.query, "needle");
  assert.ok(found.candidates.some((candidate) => candidate.file === "src/bom.js"), locate.out);

  const map = run("repo_map", ["--include-meta", "src"], root);
  assert.equal(map.code, 0, map.err);
  assert.match(map.out, /^## src \(\d+ files\)/);
});
