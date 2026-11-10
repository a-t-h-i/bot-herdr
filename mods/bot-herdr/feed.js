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

/** A reply file's text counts as new when it has words and differs from the last one seen. */
export function isNew(text, seen) {
  return typeof text === "string" && text.trim().length > 0 && text !== seen;
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
