// Install-time provisioning of the bundled retrieval binaries (rg, fd, ast-grep): the pinned
// manifest, SHA256-verified downloads into a cache under the app home, and a copy of each binary
// into `engine/bin`, where the retrieval layer looks first. A tool that cannot be fetched or
// verified is reported and skipped, never installed and never fatal: install.mjs must work offline,
// and the scripts then fall back to PATH, git and pure Node.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const TOOLS = ["rg", "fd", "ast-grep"];
const DEFAULT_MANIFEST = join(dirname(fileURLToPath(import.meta.url)), "..", "tools-manifest.json");
const DOWNLOAD_TIMEOUT_MS = 60000;

export const targetKey = (platform = process.platform, arch = process.arch) => `${platform}-${arch}`;

/** The tools manifest, validated: every bundled tool has a version and its targets. */
export function loadManifest(manifestPath = DEFAULT_MANIFEST) {
  const data = JSON.parse(readFileSync(manifestPath, "utf8"));
  const tools = data.tools ?? data;
  for (const name of TOOLS) {
    if (!tools[name]?.version || !tools[name]?.targets) throw new Error(`${manifestPath}: no ${name} entry`);
  }
  return tools;
}

export function sha256File(filePath) {
  const hash = createHash("sha256");
  hash.update(readFileSync(filePath));
  return hash.digest("hex");
}

const binName = (tool, platform) => (platform === "win32" ? `${tool}.exe` : tool);

/** Whether `file` resolves inside `root` (no `../` escape from the archive). */
function inside(root, file) {
  const rel = relative(root, file);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/**
 * An archive entry that can only name a file inside the extraction dir: no absolute path, no
 * drive letter, no NUL and no `..` segment. Checked before the archive is unpacked at all.
 */
function safeEntry(name) {
  const text = String(name ?? "");
  const bad = !text || text.includes("\0") || /^[\\/]/.test(text) || /^[A-Za-z]:/.test(text) || text.split(/[\\/]/).includes("..");
  if (bad) throw new Error(`${text || "the archive entry"} escapes the archive`);
  return text;
}

/** Write `text` beside `file`, then rename it into place: a reader never sees half of it. */
function writeAtomic(file, text) {
  const tmp = `${file}.tmp.${process.pid}.${Date.now()}`;
  try {
    writeFileSync(tmp, text);
    renameSync(tmp, file);
  } finally {
    rmSync(tmp, { force: true });
  }
}

function runExtractor(spawn, cmd, args) {
  const r = spawn(cmd, args, { encoding: "utf8", windowsHide: true });
  if (r?.error || r?.status !== 0) throw new Error(r?.error?.message || `${cmd} failed (exit ${r?.status})`);
}

const quotePowerShell = (path) => path.replace(/'/g, "''");

function extractZip(archivePath, dir, platform, spawn) {
  const attempts = platform === "win32"
    ? [["tar", ["-xf", archivePath, "-C", dir]], ["powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${quotePowerShell(archivePath)}' -DestinationPath '${quotePowerShell(dir)}' -Force`]]]
    : [["unzip", ["-o", archivePath, "-d", dir]], ["python3", ["-m", "zipfile", "-e", archivePath, dir]], ["tar", ["-xf", archivePath, "-C", dir]]];
  const worked = attempts.some(([cmd, args]) => {
    try {
      runExtractor(spawn, cmd, args);
      return true;
    } catch {
      return false;
    }
  });
  if (!worked) throw new Error(`no zip extractor could open ${basename(archivePath)}`);
}

function unpack(archivePath, dir, archive, platform, spawn) {
  if (archive === "tar.gz") return runExtractor(spawn, "tar", ["-xzf", archivePath, "-C", dir]);
  if (archive === "zip") return extractZip(archivePath, dir, platform, spawn);
  throw new Error(`unsupported archive ${archive}`);
}

/** Copies a verified binary into place atomically (and executably off Windows). */
function install(from, dest, platform) {
  mkdirSync(dirname(dest), { recursive: true });
  const tmp = `${dest}.tmp.${process.pid}.${Date.now()}`;
  try {
    copyFileSync(from, tmp);
    if (platform !== "win32") chmodSync(tmp, 0o755);
    renameSync(tmp, dest);
  } finally {
    rmSync(tmp, { force: true });
  }
  return dest;
}

/**
 * Extracts only `entry.binaryInArchive` from the archive into `destPath`, refusing an entry that
 * escapes the temporary directory (checked before unpacking, and again after: a symlink in the
 * archive can point outside it). `spawn` is injectable for tests.
 */
export function extractBinary(archivePath, entry, { archive = entry.archive, destPath, platform = process.platform, spawn = spawnSync } = {}) {
  const rel = safeEntry(entry.binaryInArchive);
  const dir = mkdtempSync(join(tmpdir(), "bh-bin-"));
  try {
    const from = join(dir, rel);
    if (!inside(dir, from)) throw new Error(`${rel} escapes the archive`);
    unpack(archivePath, dir, archive, platform, spawn);
    if (!existsSync(from)) throw new Error(`${rel} is not in ${basename(archivePath)}`);
    const stat = lstatSync(from);
    if (stat.isSymbolicLink()) throw new Error(`${rel} escapes the archive: it is a symlink`);
    if (!stat.isFile()) throw new Error(`${rel} is not a file in ${basename(archivePath)}`);
    if (!inside(realpathSync(dir), realpathSync(from))) throw new Error(`${rel} escapes the archive`);
    return install(from, destPath, platform);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function download(url, dest, fetchImpl) {
  if (typeof fetchImpl !== "function") throw new Error("no fetch available");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { redirect: "follow", signal: controller.signal });
    if (!res?.ok) throw new Error(`HTTP ${res?.status ?? "error"} for ${url}`);
    writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  } finally {
    clearTimeout(timer);
  }
}

const readMarker = (file) => {
  try {
    return readFileSync(file, "utf8").trim();
  } catch {
    return "";
  }
};

const markerFor = (spec, target, entry) => `${spec.version} ${target} ${entry.sha256}`;

/** Downloads one tool into the cache, verifies it, and installs it; throws on any failure. */
async function provision(spec, entry, { cacheBin, dest, platform, target, fetchImpl, spawn }) {
  const dir = mkdtempSync(join(tmpdir(), "bh-tool-"));
  try {
    const archivePath = join(dir, entry.asset);
    await download(entry.url, archivePath, fetchImpl);
    const got = sha256File(archivePath);
    if (got !== entry.sha256) throw new Error(`sha256 mismatch for ${entry.asset}: got ${got}, expected ${entry.sha256}`);
    extractBinary(archivePath, entry, { archive: entry.archive, destPath: cacheBin, platform, spawn });
    writeAtomic(join(dirname(cacheBin), ".sha256"), `${markerFor(spec, target, entry)}\n`);
    return install(cacheBin, dest, platform);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Installs rg, fd and ast-grep into `modDir/engine/bin` from `cacheDir`, downloading and verifying
 * only what the cache lacks. Never throws: returns `[{ tool, status, path?, reason? }]` where status
 * is `cached`, `downloaded`, `skipped` (no build for this OS/arch) or `failed` (offline, bad
 * checksum, extractor error), so an offline install still completes.
 */
export async function ensureTools({ modDir, cacheDir, manifest = loadManifest(), platform = process.platform, arch = process.arch, fetchImpl = globalThis.fetch, spawn = spawnSync, log = () => {} }) {
  const target = targetKey(platform, arch);
  const results = [];
  for (const tool of TOOLS) {
    const spec = manifest[tool];
    const entry = spec?.targets?.[target];
    if (!entry) {
      results.push({ tool, status: "skipped", reason: `no ${target} build in the manifest` });
      continue;
    }
    const bin = binName(tool, platform);
    const cacheBin = join(cacheDir, `${tool}-${spec.version}-${target}`, bin);
    const dest = join(modDir, "engine", "bin", bin);
    const cached = existsSync(cacheBin) && readMarker(join(dirname(cacheBin), ".sha256")) === markerFor(spec, target, entry);
    try {
      results.push(cached
        ? { tool, status: "cached", path: install(cacheBin, dest, platform) }
        : { tool, status: "downloaded", path: await provision(spec, entry, { cacheBin, dest, platform, target, fetchImpl, spawn }) });
    } catch (error) {
      log(`tools    ${tool} failed: ${error.message}`);
      results.push({ tool, status: "failed", reason: error.message });
    }
  }
  return results;
}
