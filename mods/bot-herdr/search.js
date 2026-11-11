// Text search over a whole file, without drawing: every place a query appears, as a line and a
// column range in it. Tested without herdr; viewer.js lists the hits.
//
// Lines are 1-based and `start`/`end` count characters in the line without its ending, so CRLF
// and LF files give the same positions.

/**
 * Every match of `query` in `text`: `[{ line, start, end }]`, in reading order, one entry per
 * match (several on a line are several entries). An empty query matches nothing.
 */
export function findMatches(text, query, { caseSensitive = false } = {}) {
  const q = String(query ?? "");
  if (!q) return [];
  const needle = caseSensitive ? q : q.toLowerCase();
  const out = [];
  String(text ?? "").split(/\r?\n/).forEach((line, i) => {
    const hay = caseSensitive ? line : line.toLowerCase();
    let at = hay.indexOf(needle);
    while (at !== -1) {
      out.push({ line: i + 1, start: at, end: at + q.length });
      at = hay.indexOf(needle, at + needle.length);
    }
  });
  return out;
}

/** The line's text, split around one match so the hit can be drawn apart: `{ before, hit, after }`. */
export function around(line, match) {
  const text = String(line ?? "");
  return { before: text.slice(0, match.start), hit: text.slice(match.start, match.end), after: text.slice(match.end) };
}

/** The next match index, wrapping both ways; -1 when there is none. */
export function step(at, count, by = 1) {
  return count ? (at + by + count) % count : -1;
}
