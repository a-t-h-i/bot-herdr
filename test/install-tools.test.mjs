// Install-time provisioning of the bundled retrieval binaries: the pinned manifest, SHA256
// verification, the app-home cache, archive extraction, and the offline/Windows paths.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureTools, extractBinary, loadManifest, sha256File, targetKey } from "../mods/bot-herdr/engine/lib/install-tools.mjs";

const ENGINE = fileURLToPath(new URL("../mods/bot-herdr/engine", import.meta.url));
const MANIFEST = join(ENGINE, "tools-manifest.json");
const TARGETS = ["win32-x64", "win32-arm64", "linux-x64", "linux-arm64", "darwin-x64", "darwin-arm64"];
const tmp = () => mkdtempSync(join(tmpdir(), "bh-install-"));
const sha = (buffer) => createHash("sha256").update(buffer).digest("hex");

/** A real .tar.gz with `<name>-1.0.0/<name>` in it, as the releases ship it. */
function tarGz(name) {
  const work = tmp();
  mkdirSync(join(work, `${name}-1.0.0`), { recursive: true });
  writeFileSync(join(work, `${name}-1.0.0`, name), `#!/bin/sh\necho ${name}\n`, { mode: 0o755 });
  const archive = join(work, `${name}-1.0.0.tar.gz`);
  const r = spawnSync("tar", ["-czf", archive, "-C", work, `${name}-1.0.0`], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr || r.error?.message);
  const bytes = readFileSync(archive);
  return { bytes, sha256: sha(bytes) };
}

/** A manifest with one tool's target; the other two tools have no build and are skipped. */
function manifestFor(tool, target, entry, version = "1.0.0") {
  return { [tool]: { version, targets: { [target]: { sha256Source: "test fixture", ...entry } } } };
}

const fetchOf = (bytes, counter = { calls: 0 }) => {
  const fetchImpl = async () => {
    counter.calls += 1;
    return { ok: true, status: 200, arrayBuffer: async () => bytes };
  };
  return { fetchImpl, counter };
};

test("the pinned manifest has all 18 verified targets and honest metadata", () => {
  const tools = loadManifest(MANIFEST);
  const versions = { rg: "15.2.0", fd: "10.5.2", "ast-grep": "0.51.3" };
  assert.deepEqual(Object.keys(tools).sort(), ["ast-grep", "fd", "rg"]);
  assert.equal(targetKey("win32", "arm64"), "win32-arm64");
  for (const [tool, version] of Object.entries(versions)) {
    assert.equal(tools[tool].version, version);
    assert.match(tools[tool].repo, /^[\w.-]+\/[\w.-]+$/);
    assert.match(tools[tool].releaseUrl, /^https:\/\/github\.com\//);
    assert.match(tools[tool].checkedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(Object.keys(tools[tool].targets).sort(), [...TARGETS].sort(), tool);
    for (const target of TARGETS) {
      const entry = tools[tool].targets[target];
      assert.match(entry.url, /^https:\/\/github\.com\//, `${tool} ${target}`);
      assert.match(entry.sha256, /^[0-9a-f]{64}$/, `${tool} ${target}`);
      assert.match(entry.sha256Source, /asset digest/, `${tool} ${target}`);
      assert.ok(entry.binaryInArchive, `${tool} ${target}`);
      assert.match(entry.asset, /\.(zip|tar\.gz)$/, `${tool} ${target}`);
      assert.match(entry.archive, /^(zip|tar\.gz)$/, `${tool} ${target}`);
    }
  }
  const hashes = Object.values(tools).flatMap((t) => Object.values(t.targets).map((e) => e.sha256));
  assert.equal(new Set(hashes).size, 18);
});

test("a verified tar.gz installs into engine/bin and a repeat run comes from the cache", async () => {
  const { bytes, sha256 } = tarGz("rg");
  const modDir = tmp();
  const cacheDir = tmp();
  const manifest = manifestFor("rg", "linux-x64", {
    url: "https://example.test/rg-1.0.0.tar.gz",
    asset: "rg-1.0.0.tar.gz",
    archive: "tar.gz",
    binaryInArchive: "rg-1.0.0/rg",
    sha256,
  });
  const { fetchImpl, counter } = fetchOf(bytes);
  const first = await ensureTools({ modDir, cacheDir, manifest, platform: "linux", arch: "x64", fetchImpl });
  assert.equal(counter.calls, 1);
  assert.equal(first.find((r) => r.tool === "rg").status, "downloaded");
  const bin = join(modDir, "engine", "bin", "rg");
  assert.equal(readFileSync(bin, "utf8"), "#!/bin/sh\necho rg\n");
  assert.equal(sha256File(bin), sha(readFileSync(bin)));
  if (process.platform !== "win32") assert.ok(statSync(bin).mode & 0o111);

  rmSync(modDir, { recursive: true, force: true });
  const again = await ensureTools({ modDir, cacheDir, manifest, platform: "linux", arch: "x64", fetchImpl });
  assert.equal(counter.calls, 1);
  assert.equal(again.find((r) => r.tool === "rg").status, "cached");
  assert.ok(existsSync(bin));
});

test("a checksum mismatch installs nothing and writes no cache binary", async () => {
  const { bytes } = tarGz("rg");
  const modDir = tmp();
  const cacheDir = tmp();
  const manifest = manifestFor("rg", "linux-x64", {
    url: "https://example.test/rg-1.0.0.tar.gz",
    asset: "rg-1.0.0.tar.gz",
    archive: "tar.gz",
    binaryInArchive: "rg-1.0.0/rg",
    sha256: "0".repeat(64),
  });
  const { fetchImpl } = fetchOf(bytes);
  const results = await ensureTools({ modDir, cacheDir, manifest, platform: "linux", arch: "x64", fetchImpl });
  const rg = results.find((r) => r.tool === "rg");
  assert.equal(rg.status, "failed");
  assert.match(rg.reason, /sha256 mismatch/i);
  assert.equal(existsSync(join(modDir, "engine", "bin", "rg")), false);
  assert.equal(existsSync(join(cacheDir, "rg-1.0.0-linux-x64", "rg")), false);
});

test("a binary entry that escapes the temp dir is refused", async () => {
  const { bytes, sha256 } = tarGz("rg");
  const modDir = tmp();
  const cacheDir = tmp();
  const manifest = manifestFor("rg", "linux-x64", {
    url: "https://example.test/rg-1.0.0.tar.gz",
    asset: "rg-1.0.0.tar.gz",
    archive: "tar.gz",
    binaryInArchive: "../evil",
    sha256,
  });
  const { fetchImpl } = fetchOf(bytes);
  const results = await ensureTools({ modDir, cacheDir, manifest, platform: "linux", arch: "x64", fetchImpl });
  const rg = results.find((r) => r.tool === "rg");
  assert.equal(rg.status, "failed");
  assert.match(rg.reason, /escapes/i);
  assert.equal(existsSync(join(modDir, "engine", "bin", "rg")), false);
  assert.equal(existsSync(join(cacheDir, "rg-1.0.0-linux-x64", "rg")), false);
});

test("an unsafe archive entry is refused before anything is unpacked", () => {
  const destPath = join(tmp(), "rg");
  const calls = [];
  const spawn = (...args) => {
    calls.push(args);
    return { status: 0 };
  };
  for (const binaryInArchive of ["../evil", "/usr/bin/rg", "C:\\Windows\\rg.exe", "pkg/../../rg", "pk\0g/rg"]) {
    assert.throws(() => extractBinary("/no/such/archive.tar.gz", { archive: "tar.gz", binaryInArchive }, { destPath, spawn }), /escapes/, JSON.stringify(binaryInArchive));
  }
  assert.equal(calls.length, 0, "no extractor ran");
  assert.equal(existsSync(destPath), false);
});

test("a symlink in the archive cannot copy a file from outside it", (t) => {
  if (process.platform === "win32") {
    t.skip("creating a symlink needs a privilege Windows does not always grant");
    return;
  }
  const work = tmp();
  const outside = join(tmp(), "secret.txt");
  mkdirSync(join(work, "pkg"), { recursive: true });
  writeFileSync(join(work, "pkg", "real"), "#!/bin/sh\n");
  writeFileSync(outside, "TOP_SECRET_DATA\n");
  try {
    symlinkSync(outside, join(work, "pkg", "rg"));
  } catch {
    t.skip("symlinks are not available here");
    return;
  }
  const archive = join(work, "pkg.tar.gz");
  const made = spawnSync("tar", ["-czf", archive, "-C", work, "pkg"], { encoding: "utf8" });
  assert.equal(made.status, 0, made.stderr || made.error?.message);
  const destPath = join(tmp(), "rg");
  assert.throws(() => extractBinary(archive, { archive: "tar.gz", binaryInArchive: "pkg/rg" }, { destPath }), /escapes/);
  assert.equal(existsSync(destPath), false, "nothing was copied out of the archive");
});

test("the cache binary and its marker land atomically, with no temp files left", async () => {
  const { bytes, sha256 } = tarGz("rg");
  const modDir = tmp();
  const cacheDir = tmp();
  const manifest = manifestFor("rg", "linux-x64", {
    url: "https://example.test/rg-1.0.0.tar.gz",
    asset: "rg-1.0.0.tar.gz",
    archive: "tar.gz",
    binaryInArchive: "rg-1.0.0/rg",
    sha256,
  });
  const { fetchImpl } = fetchOf(bytes);
  const results = await ensureTools({ modDir, cacheDir, manifest, platform: "linux", arch: "x64", fetchImpl });
  assert.equal(results.find((r) => r.tool === "rg").status, "downloaded");
  assert.deepEqual(readdirSync(join(cacheDir, "rg-1.0.0-linux-x64")).sort(), [".sha256", "rg"]);
  assert.match(readFileSync(join(cacheDir, "rg-1.0.0-linux-x64", ".sha256"), "utf8"), /^1\.0\.0 linux-x64 [0-9a-f]{64}\n$/);
  assert.deepEqual(readdirSync(join(modDir, "engine", "bin")), ["rg"]);
});

test("offline and HTTP failures are reported, never thrown", async () => {
  const modDir = tmp();
  const cacheDir = tmp();
  const manifest = manifestFor("rg", "linux-x64", {
    url: "https://example.test/rg-1.0.0.tar.gz",
    asset: "rg-1.0.0.tar.gz",
    archive: "tar.gz",
    binaryInArchive: "rg-1.0.0/rg",
    sha256: "1".repeat(64),
  });
  const disconnected = async () => {
    throw new Error("getaddrinfo ENOTFOUND example.test");
  };
  const results = await ensureTools({ modDir, cacheDir, manifest, platform: "linux", arch: "x64", fetchImpl: disconnected });
  const rg = results.find((r) => r.tool === "rg");
  assert.equal(rg.status, "failed");
  assert.match(rg.reason, /ENOTFOUND/);
  assert.equal(results.find((r) => r.tool === "fd").status, "skipped");
  assert.equal(existsSync(join(modDir, "engine", "bin", "rg")), false);
});

test("a Windows target installs rg.exe through the injected extractor", async () => {
  const bytes = Buffer.from("windows binary");
  const modDir = tmp();
  const cacheDir = tmp();
  const calls = [];
  const spawn = (cmd, args, options) => {
    calls.push({ cmd, args, options });
    const at = args.indexOf("-C");
    mkdirSync(args[at + 1], { recursive: true });
    writeFileSync(join(args[at + 1], "rg.exe"), bytes);
    return { status: 0 };
  };
  const manifest = manifestFor("rg", "win32-x64", {
    url: "https://example.test/rg.zip",
    asset: "rg.zip",
    archive: "zip",
    binaryInArchive: "rg.exe",
    sha256: sha(bytes),
  });
  const { fetchImpl } = fetchOf(bytes);
  const results = await ensureTools({ modDir, cacheDir, manifest, platform: "win32", arch: "x64", fetchImpl, spawn });
  const rg = results.find((r) => r.tool === "rg");
  assert.equal(rg.status, "downloaded");
  assert.equal(rg.path, join(modDir, "engine", "bin", "rg.exe"));
  assert.equal(readFileSync(rg.path, "utf8"), "windows binary");
  assert.equal(calls[0].cmd, "tar");
  assert.deepEqual(calls[0].args.slice(0, 1), ["-xf"]);
  assert.equal(calls[0].options.shell, undefined);
});
