// What each agent knows about the project: stable facts, its standards, decisions with their
// reasons, and a short history of finished tasks. Agents propose; the Orchestrator records, so
// nothing gets in unchecked. The user can edit any file and leave a note on any entry; a note
// travels with its entry into the agent's brief.
//
// .bot-herdr/knowledge/<agent>.md, notes.json, archive/

import { join } from "node:path";
import { listDir, now, readJson, readText, store, writeJson, writeText } from "./core.mjs";

export const SECTIONS = ["Facts", "Standards", "Decisions", "History"];
/** A file past this many characters is due to be rewritten shorter. */
export const LIMIT = 20000;

export const kfile = (root, agent) => store(root, "knowledge", `${agent}.md`);
const notesFile = (root) => store(root, "knowledge", "notes.json");

export function read(root, agent) {
  return readText(kfile(root, agent));
}

export function notes(root, agent = null) {
  return readJson(notesFile(root), []).filter((n) => !agent || n.agent === agent);
}

/** Every agent with a file, with its size. */
export function list(root) {
  return listDir(store(root, "knowledge"))
    .filter((d) => d.isFile() && d.name.endsWith(".md"))
    .map((d) => {
      const agent = d.name.slice(0, -3);
      const text = read(root, agent);
      return { agent, chars: text.length, entries: (text.match(/^- /gm) ?? []).length, over: text.length > LIMIT };
    });
}

function skeleton(agent) {
  return `# ${agent}: what I know about this project\n\n${SECTIONS.map((s) => `## ${s}\n`).join("\n")}`;
}

/** Adds one entry under a section (made if missing). Skips an exact duplicate. */
export function add(root, agent, text, section = "Facts") {
  const entry = String(text).trim().replace(/^-\s+/, "");
  if (!entry) throw new Error("Nothing to add.");
  let md = read(root, agent) || skeleton(agent);
  if (md.split("\n").some((l) => l.replace(/^-\s+/, "").trim() === entry)) return { added: false, chars: md.length };
  const head = new RegExp(`^##\\s+${section}\\s*$`, "im");
  if (!head.test(md)) md = `${md.trimEnd()}\n\n## ${section}\n`;
  const lines = md.split("\n");
  const at = lines.findIndex((l) => head.test(l));
  let end = at + 1;
  while (end < lines.length && !/^##\s/.test(lines[end])) end++;
  while (end > at + 1 && !lines[end - 1].trim()) end--;
  lines.splice(end, 0, `- ${entry}`);
  md = lines.join("\n").replace(/\n{3,}/g, "\n\n");
  write(root, agent, md);
  return { added: true, chars: md.length };
}

/** Replaces the whole file; the version before goes to archive/. */
export function write(root, agent, text) {
  const before = read(root, agent);
  if (before && before !== text) writeText(store(root, "knowledge", "archive", `${agent}-${now().replace(/[:.]/g, "-")}.md`), before);
  writeText(kfile(root, agent), text.endsWith("\n") ? text : `${text}\n`);
}

export function note(root, agent, entry, text) {
  const all = readJson(notesFile(root), []);
  const n = { agent, entry: String(entry).trim(), note: String(text).trim(), at: now() };
  all.push(n);
  writeJson(notesFile(root), all);
  return n;
}

/** Takes a note back: the one made at `at` for this agent. Returns whether one went. */
export function unnote(root, agent, at) {
  const all = readJson(notesFile(root), []);
  const left = all.filter((n) => !(n.agent === agent && n.at === at));
  if (left.length !== all.length) writeJson(notesFile(root), left);
  return left.length !== all.length;
}

/** The file with each note under the entry it is about, for an agent's brief. */
export function withNotes(root, agent) {
  const md = read(root, agent);
  if (!md) return "";
  const mine = notes(root, agent);
  if (!mine.length) return md;
  return md.split("\n").flatMap((line) => {
    const hits = mine.filter((n) => n.entry && line.includes(n.entry));
    return [line, ...hits.map((n) => `  > Note from the user: ${n.note}`)];
  }).join("\n");
}

/** Lines across every agent's file that hold every word asked for. */
export function search(root, words) {
  const want = String(words).toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const out = [];
  for (const { agent } of list(root)) {
    for (const line of read(root, agent).split("\n")) {
      const l = line.toLowerCase();
      if (line.startsWith("- ") && want.length && want.every((w) => l.includes(w))) out.push(`${agent}: ${line.slice(2)}`);
    }
  }
  return out;
}

/** What goes in a brief: the file with notes, cut at `max` characters with a pointer to the rest. */
export function forBrief(root, agent, max = 8000) {
  const md = withNotes(root, agent).trim();
  if (!md) return "";
  if (md.length <= max) return md;
  return `${md.slice(0, max)}\n\n[… cut: the whole file is in \`bh knowledge ${agent}\`]`;
}

export { join };
