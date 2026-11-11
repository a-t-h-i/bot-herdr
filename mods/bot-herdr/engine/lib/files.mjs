// A folder's entries, for the composer's file browser (`bh files <path>`): folders first, then
// files, each sorted by name ignoring case; dot-files hidden unless asked. One folder only: the
// pane asks for the folder it is showing, and only reads what this returns.

import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, parse, resolve } from "node:path";

/** At most this many entries in one folder; the rest are left out and `truncated` says so. */
export const LIMIT = 2000;

/** Where a path the person typed points: `~` is home, a relative path the folder bh runs in. */
export function resolveFolder(path = "") {
  const text = String(path ?? "").trim();
  if (!text) return process.cwd();
  if (text === "~") return homedir();
  if (text.startsWith("~/") || text.startsWith("~\\")) return resolve(homedir(), text.slice(2));
  return resolve(text);
}

/** One entry, or null when its stat fails (a broken link, a folder this account can't reach). */
function entryOf(full, name) {
  let st;
  try {
    st = statSync(full);
  } catch {
    return null;
  }
  return { name, path: full, dir: st.isDirectory(), size: st.size, mtime: Math.round(st.mtimeMs) };
}

/** The drives that exist on this machine, as folder entries (Windows has no single root). */
function driveRoots() {
  const roots = [];
  for (let c = 65; c <= 90; c++) {
    const drive = `${String.fromCharCode(c)}:\\`;
    if (!existsSync(drive)) continue;
    const entry = entryOf(drive, drive);
    if (entry) roots.push(entry);
  }
  return roots;
}

const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.name.localeCompare(b.name);
const byFolderThenName = (a, b) => (a.dir === b.dir ? byName(a, b) : a.dir ? -1 : 1);

/** The folder's entries as the pane draws them. Throws one plain sentence when it can't be read. */
export function listFolder(path = "", { all = false, limit = LIMIT } = {}) {
  const asked = String(path ?? "").trim();
  if (process.platform === "win32" && (asked === "" || asked === "/" || asked === "\\")) {
    return { path: parse(process.cwd()).root, parent: null, entries: driveRoots().sort(byFolderThenName), truncated: false };
  }
  const dir = resolveFolder(asked);
  let names;
  try {
    names = readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    throw new Error(
      e.code === "ENOENT" ? `No such folder: ${dir}`
        : e.code === "ENOTDIR" ? `Not a folder: ${dir}`
          : `Can't read ${dir}: ${e.code === "EACCES" || e.code === "EPERM" ? "permission denied" : e.message}`,
    );
  }
  const entries = [];
  for (const d of names) {
    if (!all && d.name.startsWith(".")) continue;
    const entry = entryOf(join(dir, d.name), d.name);
    if (entry) entries.push(entry);
  }
  entries.sort(byFolderThenName);
  const up = dirname(dir);
  return { path: dir, parent: up === dir ? null : up, entries: entries.slice(0, Math.max(0, limit)), truncated: entries.length > limit };
}
