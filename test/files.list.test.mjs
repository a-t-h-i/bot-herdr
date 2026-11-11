// `bh files <path>`: the folder listing the composer's file browser draws.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { BH } from "../mods/bot-herdr/engine/lib/core.mjs";
import { listFolder } from "../mods/bot-herdr/engine/lib/files.mjs";

const folder = () => {
  const dir = mkdtempSync(join(tmpdir(), "bh-files-"));
  mkdirSync(join(dir, "beta"));
  mkdirSync(join(dir, "Alpha"));
  mkdirSync(join(dir, ".dotdir"));
  for (const name of ["b.md", "A.md", ".hidden"]) writeFileSync(join(dir, name), "x");
  return dir;
};

const bhFiles = (path, ...flags) => {
  const r = spawnSync(process.execPath, [BH, "files", path, "--json", ...flags], { encoding: "utf8", env: { ...process.env, BH_APP_HOME: tmpdir() } });
  return { code: r.status, out: r.stdout.trim() };
};

test("folders come first, then files, each ignoring case", () => {
  const dir = folder();
  const got = listFolder(dir);
  assert.equal(got.path, resolve(dir));
  assert.deepEqual(got.entries.map((e) => e.name), ["Alpha", "beta", "A.md", "b.md"]);
  assert.deepEqual(got.entries.map((e) => e.dir), [true, true, false, false]);
  assert.equal(got.entries[2].path, join(resolve(dir), "A.md"));
  assert.equal(got.entries[2].size, 1);
  assert.equal(typeof got.entries[2].mtime, "number");
  assert.equal(got.parent, resolve(dir, ".."));
  assert.equal(got.truncated, false);
});

test("dot-files are hidden, and --all shows them", () => {
  const dir = folder();
  const plain = listFolder(dir).entries.map((e) => e.name);
  assert.doesNotMatch(plain.join(","), /^\./);
  assert.deepEqual(listFolder(dir, { all: true }).entries.map((e) => e.name), [".dotdir", "Alpha", "beta", ".hidden", "A.md", "b.md"]);
});

test("a small limit truncates after sorting", () => {
  const dir = folder();
  const got = listFolder(dir, { limit: 2 });
  assert.deepEqual(got.entries.map((e) => e.name), ["Alpha", "beta"]);
  assert.equal(got.truncated, true);
});

test("a missing folder and a file path are one sentence, exit 1 with {error}", () => {
  const dir = folder();
  assert.throws(() => listFolder(join(dir, "nope")), /No such folder/);
  assert.throws(() => listFolder(join(dir, "A.md")), /Not a folder/);

  const missing = bhFiles(join(dir, "nope"));
  assert.equal(missing.code, 1);
  assert.match(JSON.parse(missing.out).error, /No such folder/);

  const file = bhFiles(join(dir, "A.md"));
  assert.equal(file.code, 1);
  assert.match(JSON.parse(file.out).error, /Not a folder/);

  const listed = bhFiles(dir);
  assert.equal(listed.code, 0);
  assert.deepEqual(JSON.parse(listed.out).entries.map((e) => e.name), ["Alpha", "beta", "A.md", "b.md"]);
});
