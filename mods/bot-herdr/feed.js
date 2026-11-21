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

/** An agent's reply log (`replies/<key>.jsonl`): one { id, at, kind, name, space, text } per turn, oldest first; unreadable lines dropped. */
export function logEntries(text) {
  const out = [];
  for (const line of String(text ?? "").split("\n")) {
    if (!line.trim()) continue;
    try {
      const got = JSON.parse(line);
      if (!got || !Number.isFinite(Date.parse(got.at))) continue;
      const kind = typeof got.kind === "string" && got.kind ? got.kind : "reply";
      const hasText = typeof got.text === "string";
      if (!hasText && kind !== "asked") continue;
      out.push({
        id: typeof got.id === "string" && got.id ? got.id : null,
        at: got.at,
        kind,
        name: got.name ?? null,
        space: got.space ?? null,
        text: hasText ? got.text : "",
      });
    } catch {
      // half a line the engine had not finished writing, or one that was never one
    }
  }
  return out;
}

/**
 * What a reply log adds to the feed: the turns later than `cursor` (an ISO string or `{ at, ids }`),
 * and the newest time (plus seen IDs at that time) for the caller to keep. Never rewinds `at`
 * backwards on a partial read, and never drops or replays same-millisecond entries with distinct IDs.
 * A log never read before adds its turns since `floorAt`; with no floor either it adds nothing.
 */
export function logNew(text, cursor, floorAt = null) {
  const isObj = Boolean(cursor && typeof cursor === "object");
  const prevAt = isObj ? (cursor.at ?? null) : (cursor ?? null);
  const prevIds = isObj && cursor.ids ? [...cursor.ids].filter(Boolean) : [];
  const prevMs = prevAt ? Date.parse(prevAt) : NaN;
  const lines = logEntries(text);

  let newestAt = null;
  let newestMs = NaN;
  for (const line of lines) {
    const ms = Date.parse(line.at);
    if (!Number.isFinite(newestMs) || ms > newestMs) {
      newestMs = ms;
      newestAt = line.at;
    }
  }

  let nextAt = prevAt;
  let nextIds = [...prevIds];
  if (Number.isFinite(newestMs) && (!Number.isFinite(prevMs) || newestMs > prevMs)) {
    nextAt = newestAt;
    nextIds = [...new Set(lines.filter((l) => Date.parse(l.at) === newestMs && l.id).map((l) => l.id))];
  } else if (Number.isFinite(newestMs) && Number.isFinite(prevMs) && newestMs === prevMs) {
    const merged = new Set(prevIds);
    for (const l of lines) if (Date.parse(l.at) === prevMs && l.id) merged.add(l.id);
    nextIds = [...merged];
  }

  const extra = isObj || nextIds.length > 0 ? { ids: nextIds } : {};
  const cutoff = prevAt || floorAt;
  if (!cutoff) return { entries: [], at: nextAt, ...extra };
  const since = Date.parse(cutoff);
  const seenIds = new Set(prevAt ? prevIds : []);
  const entries = [];
  for (const line of lines) {
    const ms = Date.parse(line.at);
    if (ms > since) {
      entries.push(line);
      if (line.id) seenIds.add(line.id);
    } else if (ms === since && line.id && !seenIds.has(line.id)) {
      entries.push(line);
      seenIds.add(line.id);
    }
  }
  return { entries, at: nextAt, ...extra };
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

let entrySeq = 0;

/** Adds an entry, dropping the oldest beyond KEEP. */
export function push(entries, entry) {
  entrySeq += 1;
  const next = [...entries, { id: `${Number(entry.at ?? 0).toString(36)}-${entrySeq.toString(36)}`, ...entry }];
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

export const TASK_LINK = "bh-task:";
const TASK_ID = /\bt-\d{8}-[a-z0-9]{4}\b/g;

/** Markdown with every task id (t-20261120-n1rc) made a TASK_LINK; code and existing links are left alone. */
export function linkTasks(markdown) {
  const parts = String(markdown ?? "").split(/(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$))/);
  return parts.map((part, i) => {
    if (i % 2 === 1) return part;
    return part.split(/(\[[^\]]*\]\([^)]*\)|`[^`\n]+`)/)
      .map((bit, j) => (j % 2 === 1 ? bit : bit.replace(TASK_ID, (id) => `[${id}](${TASK_LINK}${id})`)))
      .join("");
  }).join("");
}

/** The task id a TASK_LINK points at, or null for any other link. */
export const taskTarget = (url) => (String(url ?? "").startsWith(TASK_LINK) ? String(url).slice(TASK_LINK.length) : null);

/**
 * How scroll position changes when a feed entry arrives: snaps to the bottom on your own message
 * or when already at the bottom; while scrolled up, keeps the same entry anchored in view.
 */
export function scrollOnAdd({ back = 0, px = 0, kind = "agent", sameSpace = true, delta = 1 } = {}) {
  if (kind === "me" || (back === 0 && px === 0)) return { back: 0, px: 0 };
  if (!sameSpace) return { back, px };
  return { back: back + delta, px };
}

/** The space a reply or note belongs to: explicit log space, live agent, recorded wait, or active space. */
export function resolveSpace({ lineSpace = null, agentSpace = null, waitSpace = null, activeSpace = null } = {}) {
  return lineSpace ?? agentSpace ?? waitSpace ?? activeSpace ?? null;
}

/** Stable signature of currently working agents in a space: changes on start, stop, or status change. */
export function workerSignature(list) {
  return (list ?? [])
    .map((a) => `${a.address}:${a.status ?? "working"}`)
    .sort()
    .join("|");
}

/** Whether two addresses refer to the same agent (exact match or matching fileKey). */
export function sameAddress(a, b) {
  if (!a || !b) return false;
  return a === b || fileKey(a) === fileKey(b);
}

/** Whether any open question card belongs to `address`. */
export function hasOpenQuestion(questions, address) {
  return (questions ?? []).some((q) => sameAddress(q?.from, address));
}

/** Whether a "silent" wait note should be suppressed because the agent has an open question card. */
export function shouldSuppressSilent(address, openQuestions) {
  return hasOpenQuestion(openQuestions, address);
}

/** Whether a `.jsonl` reply duplicates a `.md` reply just ingested for the same agent. */
export function isDuplicateMd(text, seenMd, seenAt, lineAt, windowMs = 15000) {
  if (!seenMd || replyBody(seenMd) !== text) return false;
  const lineMs = Date.parse(lineAt ?? "");
  if (Number.isFinite(seenAt) && Number.isFinite(lineMs) && Math.abs(lineMs - seenAt) <= windowMs) return true;
  const stamp = /<!--\s*bh ([^>]+?)\s*-->/.exec(String(seenMd))?.[1];
  const stampMs = stamp ? Date.parse(stamp) : NaN;
  return Number.isFinite(stampMs) && Number.isFinite(lineMs) && Math.abs(lineMs - stampMs) <= windowMs;
}

/** Queues a cross-page programmatic message (`sendText`) without touching the user's draft. */
export function enqueueOutbox(queue, text) {
  const s = String(text ?? "").trim();
  if (!s) return false;
  queue.push(s);
  return true;
}

/** Pops the next queued cross-page message when the composer is idle, else null. */
export function nextOutbox(queue, sending) {
  if (sending || !queue?.length) return null;
  return queue.shift();
}

/**
 * Matches a newly started agent to a pending `start` record by tab/agent name rather than
 * blindly adopting any unrelated terminal in the space.
 */
export function matchAdopted(start, agents, justBriefed = new Set()) {
  const candidates = (agents ?? []).filter(
    (a) => a.space === start.space && !start.before?.has(a.address) && !justBriefed.has(a.address),
  );
  if (!candidates.length) return null;
  const wantTab = String(start.tab ?? "").trim().toLowerCase();
  if (wantTab) {
    const byTab = candidates.find((a) => String(a.tab_name ?? "").trim().toLowerCase() === wantTab);
    if (byTab) return byTab;
  }
  const wantName = String(start.name ?? "").trim().toLowerCase();
  if (wantName) {
    const byName = candidates.find((a) => {
      const tab = String(a.tab_name ?? "").trim().toLowerCase();
      const prog = String(a.program?.name ?? a.program?.key ?? "").trim().toLowerCase();
      const title = String(a.title ?? "").trim().toLowerCase();
      return tab === wantName || prog === wantName || title === wantName;
    });
    if (byName) return byName;
  }
  if (wantTab) return null;
  return candidates.length === 1 ? candidates[0] : null;
}
