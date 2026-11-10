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
