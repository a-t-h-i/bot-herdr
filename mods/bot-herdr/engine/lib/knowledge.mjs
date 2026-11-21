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

// ── Folding: shortening a file without losing what the user marked ───────────────────────

/** The caps a fold works to: the hard one, the brief one, and how much History may keep. */
export const FOLD = { maxChars: 16000, briefTarget: 7500, historyCap: 4000 };

/** A bullet's text with case and spacing folded: two bullets that read the same are the same. */
const bulletKey = (line) => line.replace(/^-\s+/, "").replace(/\s+/g, " ").trim().toLowerCase();

/** A section's lines as units: a `- ` bullet with its indented continuation lines, or one other line. */
function unitsOf(lines) {
  const units = [];
  for (const line of lines) {
    const last = units.at(-1);
    if (last?.bullet && /^\s+\S/.test(line)) last.lines.push(line);
    else units.push({ bullet: line.startsWith("- "), lines: [line] });
  }
  return units;
}

const unitText = (unit) => unit.lines.join("\n");
const joinUnits = (head, units) => [head, ...units.map(unitText)].join("\n");

/** One section with exact-duplicate bullets dropped (the first copy stays, continuation lines with it). */
function dedupeSection(section) {
  const [head, ...rest] = section.split("\n");
  const units = unitsOf(rest);
  const seen = new Set();
  const kept = units.filter((unit) => {
    if (!unit.bullet) return true;
    const key = bulletKey(unit.lines.join(" "));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { section: joinUnits(head, kept), dropped: units.length - kept.length };
}

/** A section with its oldest bullets (and their continuation lines) dropped until it fits in `budget`; a bullet the user noted is never dropped. */
function trimSection(section, budget, isNoted) {
  const [head, ...rest] = section.split("\n");
  const units = unitsOf(rest);
  let dropped = 0;
  while (joinUnits(head, units).length > budget) {
    const at = units.findIndex((unit) => unit.bullet && !isNoted(unitText(unit)));
    if (at < 0) break;
    units.splice(at, 1);
    dropped++;
  }
  return { section: joinUnits(head, units), dropped };
}

/**
 * Shortens one agent's knowledge to the caps: duplicate bullets go first, then the oldest History
 * entries (newest kept), and the oldest Facts only when the file is still over its hard cap. A
 * bullet a user noted is never dropped: their note is an instruction, not a hint. The version
 * before is archived by `write`. `dryRun` says what it would do and changes nothing.
 */
export function fold(root, agent, { maxChars = FOLD.maxChars, briefTarget = FOLD.briefTarget, dryRun = false, compactForBrief = false } = {}) {
  const before = read(root, agent);
  if (!before.trim()) return { agent, beforeChars: before.length, afterChars: before.length, removedEntries: 0, archived: false, changed: false };
  const noted = notes(root, agent).map((n) => String(n.entry ?? "")).filter(Boolean);
  const isNoted = (line) => noted.some((entry) => line.includes(entry));
  const [head, raw] = sectionsOf(before);
  let removedEntries = 0;
  const sections = raw.map((section) => {
    const folded = dedupeSection(section);
    removedEntries += folded.dropped;
    return folded.section;
  });
  const doc = () => [head, ...sections].filter((part) => part.trim()).join("\n").trimEnd() + "\n";
  const at = (name) => sections.findIndex((section) => sectionName(section) === name);
  const cut = (index, budget) => {
    const trimmed = trimSection(sections[index], budget, isNoted);
    if (!trimmed.dropped) return;
    sections[index] = trimmed.section;
    removedEntries += trimmed.dropped;
  };
  const cap = compactForBrief ? Math.min(maxChars, briefTarget) : maxChars;
  const history = at("History");
  if (history >= 0) {
    const room = Math.min(briefTarget, FOLD.historyCap, sections[history].length - Math.max(0, doc().length - cap));
    if (sections[history].length > room) cut(history, Math.max(0, room));
  }
  while (doc().length > maxChars) {
    const facts = at("Facts");
    if (facts < 0) break;
    const size = sections[facts].length;
    cut(facts, Math.max(0, size - (doc().length - maxChars)));
    if (sections[facts].length === size) break;
  }
  const next = removedEntries ? doc() : before;
  if (removedEntries && !dryRun) write(root, agent, next);
  return { agent, beforeChars: before.length, afterChars: next.length, removedEntries, archived: Boolean(removedEntries && !dryRun && before.trim()), changed: next !== before };
}

/** Every agent's file, folded: what `bh improve fold` runs when it is given no agent. */
export function foldAll(root, opts = {}) {
  return list(root).map((k) => fold(root, k.agent, opts));
}

/** A file split into the part before its first `## ` section and the sections themselves, in order. */
function sectionsOf(md) {
  const lines = md.split("\n");
  const at = lines.findIndex((l) => l.startsWith("## "));
  if (at < 0) return [md, []];
  return [lines.slice(0, at).join("\n"), lines.slice(at).join("\n").split(/(?=^## )/m).filter(Boolean)];
}

const sectionName = (section) => section.split("\n")[0].replace(/^##\s+/, "").trim();

/** The section cut to the last whole `- ` entry that fits in `budget` characters (its heading always stays). */
function entriesThatFit(section, budget) {
  const lines = section.split("\n");
  let end = 1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].startsWith("- ") && lines.slice(0, i + 1).join("\n").length <= budget) end = i + 1;
  }
  return lines.slice(0, end).join("\n");
}

/** What goes in a brief: the file with notes, whole sections up to `max` characters, and the names of those left out. */
export function forBrief(root, agent, max = 8000) {
  const md = withNotes(root, agent).trim();
  if (!md || md.length <= max) return md;
  const [head, sections] = sectionsOf(md);
  if (!sections.length) return `${md.slice(0, max)}\n\n[… cut: the whole file is in \`bh knowledge ${agent}\`]`;
  const kept = [head];
  let size = head.length + 1; // the newline between the head and the first section
  let at = sections.length;
  for (const [i, section] of sections.entries()) {
    if (size + section.length > max) {
      at = i;
      break;
    }
    kept.push(section);
    size += section.length;
  }
  if (at === 0 && sections[0].length > max - size) kept.push(entriesThatFit(sections[0], max - size));
  const left = sections.slice(at).map(sectionName).join(", ");
  const cut = left ? `[… cut: ${left}; the whole file is in \`bh knowledge ${agent}\`]` : "";
  return `${kept.join("\n").trim()}${cut ? `\n\n${cut}` : ""}`;
}

export { join };
