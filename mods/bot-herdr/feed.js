// The chat feed's pure parts: what is kept, what is shown, and where an agent's reply is read
// from. Tested without herdr.

export const KEEP = 300; // entries kept across restarts
export const SHOWN = 40; // entries drawn at once

/** The file an agent writes its reply to (brief.js tells it): its address, `/` as `_`. */
export function replyFile(outbox, address) {
  return `${outbox}/${String(address).replace(/[\\/]/g, "_")}.md`;
}

/** The key of an address in the replies folder (the same rule as engine/lib/agent.mjs `fileKey`). */
export const fileKey = (address) => String(address).replace(/[\\/]/g, "_");

/** A directory entry's name, whether `readdir` hands back a name or a Dirent. */
export const entryName = (entry) => (typeof entry === "string" ? entry : String(entry?.name ?? ""));

/** An agent's reply log (`replies/<key>.jsonl`): one { at, name, text } per turn, oldest first; unreadable lines dropped. */
export function logEntries(text) {
  const out = [];
  for (const line of String(text ?? "").split("\n")) {
    if (!line.trim()) continue;
    try {
      const got = JSON.parse(line);
      if (got && typeof got.text === "string" && Number.isFinite(Date.parse(got.at))) out.push({ at: got.at, name: got.name ?? null, text: got.text });
    } catch {
      // half a line the engine had not finished writing, or one that was never one
    }
  }
  return out;
}

/**
 * What a reply log adds to the feed: the turns later than `sinceAt` (an ISO time), and the newest
 * time the log holds, for the caller to keep. A log never read before (`sinceAt` null or empty)
 * adds nothing — the history behind it is not the feed's — and only its newest time is recorded.
 */
export function logNew(text, sinceAt) {
  const lines = logEntries(text);
  const newest = lines.length ? lines[lines.length - 1].at : sinceAt ?? null;
  if (!sinceAt) return { entries: [], at: newest };
  const since = Date.parse(sinceAt);
  return { entries: lines.filter((line) => Date.parse(line.at) > since), at: newest };
}

/**
 * The feed with a run of child replies folded: consecutive child entries between two other entries
 * become one item ({ id, kind: "kids", at, space, children }) the feed draws as one row.
 */
export function groupChildren(list, isChild) {
  const out = [];
  for (const e of list ?? []) {
    const last = out[out.length - 1];
    if (!isChild(e)) out.push(e);
    else if (last?.kind === "kids") out[out.length - 1] = { ...last, children: [...last.children, e], space: last.space ?? e.space ?? null };
    else out.push({ id: `kids-${e.id}`, kind: "kids", at: e.at, space: e.space ?? null, children: [e] });
  }
  return out;
}

/** Adds an entry, dropping the oldest beyond KEEP. */
export function push(entries, entry) {
  const next = [...entries, { id: `${entry.at.toString(36)}-${entries.length.toString(36)}`, ...entry }];
  return next.length > KEEP ? next.slice(next.length - KEEP) : next;
}

/** Changes one comment list on one entry; unknown ids give the entries back unchanged. */
function onComments(entries, entryId, change) {
  const i = entries.findIndex((e) => e.id === entryId);
  if (i < 0) return entries;
  const before = entries[i].comments ?? [];
  const after = change(before);
  if (after === before) return entries;
  return entries.map((e, k) => (k === i ? { ...e, comments: after } : e));
}

/** Changes one comment on one entry; unknown ids give the entries back unchanged. */
function onComment(entries, entryId, cid, change) {
  return onComments(entries, entryId, (list) => (list.some((x) => x.id === cid) ? list.map((x) => (x.id === cid ? change(x) : x)) : list));
}

/** A comment of yours on an agent's reply: `c<max+1>`, open. */
export function addComment(entries, entryId, text, at) {
  return onComments(entries, entryId, (list) => {
    const max = list.reduce((m, x) => Math.max(m, Number(String(x.id).slice(1)) || 0), 0);
    return [...list, { id: `c${max + 1}`, text, at, open: true }];
  });
}

export function editComment(entries, entryId, cid, text, at) {
  return onComment(entries, entryId, cid, (x) => ({ ...x, text, edited: at, open: true }));
}

export function resolveComment(entries, entryId, cid) {
  return onComment(entries, entryId, cid, (x) => ({ ...x, open: false }));
}

export function deleteComment(entries, entryId, cid) {
  return onComments(entries, entryId, (list) => (list.some((x) => x.id === cid) ? list.filter((x) => x.id !== cid) : list));
}

/** The entries of one space to draw, `back` entries up from the newest. */
export function shown(entries, space, back = 0) {
  const mine = entries.filter((e) => (e.space ?? null) === (space ?? null));
  const end = Math.max(Math.min(mine.length, 1), mine.length - back);
  return { list: mine.slice(Math.max(0, end - SHOWN), end), total: mine.length, back: mine.length - end };
}

/**
 * Scrolls the feed by `delta` pixels (positive: towards older entries). `back` is how many whole
 * entries sit below the view, `px` how far into entry `back` the view has moved; `heights[i]` is
 * the drawn height (gap included) of the entry `i` up from the newest, `fallback` until measured.
 */
export function scrollBy(state, delta, heights, total, fallback = 120, room = null) {
  const h = (i) => heights[i] ?? fallback;
  let { back, px } = state;
  px += delta;
  while (px >= h(back) && back < total - 1) {
    px -= h(back);
    back += 1;
  }
  while (px < 0 && back > 0) {
    back -= 1;
    px += h(back);
  }
  if (back === 0 && px < 0) px = 0;
  if (back >= total - 1) px = Math.max(0, Math.min(px, h(back) - 1));
  return room == null ? { back, px } : clampScroll({ back, px }, heights, total, room, fallback);
}

/**
 * Keeps the feed from scrolling past its oldest entry: scrolled all the way up, the oldest
 * entry's top sits at the top of the view (`room` px tall), never below it with empty space
 * above. With everything fitting in the view, it doesn't scroll at all.
 */
export function clampScroll(state, heights, total, room, fallback = 120) {
  const h = (i) => heights[i] ?? fallback;
  let content = 0;
  for (let i = 0; i < total; i++) content += h(i);
  const most = Math.max(0, content - room);
  let offset = state.px;
  for (let i = 0; i < state.back && i < total; i++) offset += h(i);
  if (offset <= most) return state;
  let back = 0;
  let px = most;
  while (back < total - 1 && px >= h(back)) {
    px -= h(back);
    back += 1;
  }
  return { back, px };
}

/** What a reply file says, without its stamp (`<!-- bh <time> -->`, so the same words twice still count). */
export function replyBody(text) {
  return String(text ?? "").replace(/<!--\s*bh [^>]*-->/g, "").trim();
}

/** An agent's answer to a late report it already dealt with (engine/lib/agent.mjs HANDLED): never shown. */
export const HANDLED = "(handled)";
export const isHandled = (text) => replyBody(text) === HANDLED;

/** A reply file's text counts as new when it has words and differs from the last one seen. */
export function isNew(text, seen) {
  return typeof text === "string" && replyBody(text).length > 0 && text !== seen;
}

/**
 * What became of an agent we wrote to and are waiting on. "reply" is decided by the caller (a
 * new file); here: "blocked" when it needs the user, "silent" when it worked and stopped
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

/** The link a file named in a message gets: clicking it opens the file (viewer.js). */
export const FILE_LINK = "bh-file:";
const PATHISH = /^(?:[A-Za-z]:[\\/]|~?[\\/]|\.{1,2}[\\/])?[\w@.+-]+(?:[\\/][\w@.+ -]+)*\.[A-Za-z0-9]{1,10}(?::\d+(?::\d+)?)?$/;
const BARE = /(^|[\s(])((?:[A-Za-z]:[\\/]|~?\/|\.{1,2}\/)?[\w@.+-]+(?:\/[\w@.+-]+)+\.[A-Za-z0-9]{1,10}(?::\d+(?::\d+)?)?)(?=[\s),.;:!?]*(?:\s|$))/g;

/** Whether text names a file: a path with a name and an extension, not a web address. */
export function isPath(text) {
  const t = String(text ?? "").trim();
  if (!t || t.length > 300 || t.includes("://") || /\s{2}/.test(t)) return false;
  return PATHISH.test(t) && (/[\\/]/.test(t) || /\.(m?[jt]sx?|c?js|json|md|css|scss|html?|py|rs|go|java|kt|swift|rb|php|cs|cpp|c|h|ya?ml|toml|sql|sh|ps1|txt|svg|vue|svelte)(?::\d+)?$/i.test(t));
}

/** A file link's path and line: "src/a.ts:12" → { path: "src/a.ts", line: 12 }. */
export function fileTarget(url) {
  const raw = decodeURIComponent(String(url ?? "").slice(FILE_LINK.length));
  const m = /^(.*?)(?::(\d+)(?::\d+)?)?$/.exec(raw);
  return { path: m[1], line: m[2] ? Number(m[2]) : null };
}

/**
 * Markdown with every file it names made a link: `src/app.tsx` in backticks, or a bare path
 * with a folder in it. Code blocks and existing links are left alone.
 */
export function linkFiles(markdown) {
  const parts = String(markdown ?? "").split(/(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$))/);
  return parts.map((part, i) => {
    if (i % 2 === 1) return part;
    return part.split(/(\[[^\]]*\]\([^)]*\)|`[^`\n]+`)/).map((bit, j) => {
      if (j % 2 === 1) {
        if (bit.startsWith("`")) {
          const inner = bit.slice(1, -1);
          return isPath(inner) ? `[${bit}](${FILE_LINK}${encodeURIComponent(inner.trim())})` : bit;
        }
        return bit;
      }
      return bit.replace(BARE, (all, lead, path) => (isPath(path) ? `${lead}[${path}](${FILE_LINK}${encodeURIComponent(path)})` : all));
    }).join("");
  }).join("");
}
