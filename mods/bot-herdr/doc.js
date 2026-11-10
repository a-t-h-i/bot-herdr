// A plan's markdown in pieces you can comment on: each heading, list item, paragraph, table or
// code block, with the line it starts on (1-based, as `bh plan comment --line` takes it). Tested
// without herdr; work.js draws each piece with a way to comment on it.

const ITEM = /^\s{0,3}(?:[-*+]|\d+[.)])\s+/;
const HEADING = /^\s{0,3}#{1,6}\s/;
const FENCE = /^\s{0,3}(```|~~~)/;
const TABLE = /^\s*\|/;

export function blocks(markdown) {
  const lines = String(markdown ?? "").split("\n");
  const out = [];
  let i = 0;
  const take = (from, to) => out.push({ line: from + 1, text: lines.slice(from, to).join("\n") });
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const start = i;
    const fence = FENCE.exec(line);
    if (fence) {
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) i++;
      i = Math.min(lines.length, i + 1);
    } else if (HEADING.test(line)) {
      i++;
    } else if (TABLE.test(line)) {
      while (i < lines.length && TABLE.test(lines[i])) i++;
    } else if (ITEM.test(line)) {
      i++;
      // An item's own wrapped or indented lines stay with it; the next item starts a new piece.
      while (i < lines.length && lines[i].trim() && !ITEM.test(lines[i]) && !HEADING.test(lines[i]) && !FENCE.test(lines[i])) i++;
    } else {
      while (i < lines.length && lines[i].trim() && !HEADING.test(lines[i]) && !ITEM.test(lines[i]) && !FENCE.test(lines[i]) && !TABLE.test(lines[i])) i++;
    }
    take(start, i);
  }
  return out;
}

/** The open comments on the piece that starts at `line` and runs to the next one. */
export function commentsOn(comments, line, nextLine = Infinity) {
  return (comments ?? []).filter((x) => x.open !== false && x.line !== null && x.line >= line && x.line < nextLine);
}

const SECTION = /^\s{0,3}##\s+(.*?)\s*#*\s*$/;
const TITLE = /^\s{0,3}#\s+(.*?)\s*#*\s*$/;

/** What a note is filed under: an entry's first line, without its bullet or heading marks. */
export const entryKey = (text) => String(text ?? "").split("\n")[0].replace(ITEM, "").replace(/^\s{0,3}#{1,6}\s+/, "").trim();

/**
 * A knowledge file as its title and its sections (## Facts, ## Standards…), each with its pieces
 * (blocks above) as entries: `{ line, text, key }`. Pieces before the first section go in one with
 * no name.
 */
export function outline(markdown) {
  let title = null;
  const sections = [];
  let current = null;
  for (const b of blocks(markdown)) {
    const first = b.text.split("\n")[0];
    const t = TITLE.exec(first);
    if (t && title === null && !sections.length && !current) {
      title = t[1];
      continue;
    }
    const s = SECTION.exec(first);
    if (s) {
      current = { name: s[1], line: b.line, entries: [] };
      sections.push(current);
      continue;
    }
    if (!current) {
      current = { name: null, line: b.line, entries: [] };
      sections.push(current);
    }
    current.entries.push({ line: b.line, text: b.text, key: entryKey(b.text) });
  }
  return { title, sections };
}

/** The person's notes on an entry: those whose entry words it holds (as the brief places them). */
export function notesOn(notes, text) {
  const body = String(text ?? "");
  return (notes ?? []).filter((n) => n?.entry && body.includes(n.entry));
}
