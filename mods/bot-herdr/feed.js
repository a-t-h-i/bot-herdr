// The chat feed's pure parts: what is kept, what is shown, and where an agent's reply is read
// from. Tested without herdr.

export const KEEP = 300; // entries kept across restarts
export const SHOWN = 40; // entries drawn at once

/** The file an agent writes its reply to (brief.js tells it): its address, `/` as `_`. */
export function replyFile(outbox, address) {
  return `${outbox}/${String(address).replace(/[\\/]/g, "_")}.md`;
}

/** Adds an entry, dropping the oldest beyond KEEP. */
export function push(entries, entry) {
  const next = [...entries, { id: `${entry.at.toString(36)}-${entries.length.toString(36)}`, ...entry }];
  return next.length > KEEP ? next.slice(next.length - KEEP) : next;
}

/** The entries of one space to draw, `back` entries up from the newest. */
export function shown(entries, space, back = 0) {
  const mine = entries.filter((e) => (e.space ?? null) === (space ?? null));
  const end = Math.max(Math.min(mine.length, 1), mine.length - back);
  return { list: mine.slice(Math.max(0, end - SHOWN), end), total: mine.length, back: mine.length - end };
}

/** What a reply file says, without its stamp (`<!-- bh <time> -->`, so the same words twice still count). */
export function replyBody(text) {
  return String(text ?? "").replace(/<!--\s*bh [^>]*-->/g, "").trim();
}

/** A reply file's text counts as new when it has words and differs from the last one seen. */
export function isNew(text, seen) {
  return typeof text === "string" && replyBody(text).length > 0 && text !== seen;
}

/**
 * What became of an agent we wrote to and are waiting on. "reply" is decided by the caller (a
 * new file); here: "blocked" when it needs the person, "silent" when it worked and stopped
 * without writing a reply (after `grace` ms), else "wait".
 */
export function outcome(wait, status, now, grace = 8000) {
  if (!status) return "gone";
  if (status === "blocked") return wait.blocked ? "wait" : "blocked";
  if (status === "working") return "wait";
  if (wait.worked && now - (wait.stopped ?? now) >= grace) return "silent";
  return "wait";
}

/** 14:05 */
export function clock(at) {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * A reply cut where it carries pictures: markdown, then a ```mockup (or ```html) block drawn as
 * a picture, then markdown again. Returns [{ kind: "md", text } | { kind: "mockup", html, title }].
 */
export function segments(text) {
  const out = [];
  const src = String(text ?? "");
  const fence = /^```[ \t]*(mockup|html)[^\n]*\n([\s\S]*?)^```[ \t]*$/gim;
  let last = 0;
  for (let m = fence.exec(src); m; m = fence.exec(src)) {
    const before = src.slice(last, m.index).trim();
    if (before) out.push({ kind: "md", text: before });
    const html = m[2].trim();
    const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() || /<h[12][^>]*>([^<]*)</i.exec(html)?.[1]?.trim() || "Mockup";
    if (html) out.push({ kind: "mockup", html, title });
    last = m.index + m[0].length;
  }
  const rest = src.slice(last).trim();
  if (rest) out.push({ kind: "md", text: rest });
  return out;
}

/** A short stable hash of some text (FNV-1a), for file names. */
export function hash(text) {
  let h = 0x811c9dc5;
  const s = String(text ?? "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** A message folds past this many rows (with some slack, so a fold always hides something worth it). */
export const FOLD_ROWS = 12;
export const FOLD_SLACK = 3;

/**
 * A long message of yours, folded: the rows it takes at `width` (`measure(text)` is a line's
 * width) and, past FOLD_ROWS + FOLD_SLACK, the text of its first FOLD_ROWS rows.
 */
export function fold(text, width, measure) {
  const lines = String(text ?? "").split("\n");
  let rows = 0;
  const kept = [];
  for (const line of lines) {
    const need = Math.max(1, Math.ceil(measure(line) / Math.max(40, width)));
    if (rows < FOLD_ROWS) {
      if (rows + need <= FOLD_ROWS) kept.push(line);
      else kept.push(line.slice(0, Math.max(1, Math.floor((line.length * (FOLD_ROWS - rows)) / need))));
    }
    rows += need;
  }
  if (rows <= FOLD_ROWS + FOLD_SLACK) return { rows, folded: false, text: String(text ?? "") };
  return { rows, folded: true, text: kept.join("\n").trimEnd() };
}
