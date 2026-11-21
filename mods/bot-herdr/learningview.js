// Pure view-model logic for the Learning page (learning.js): chapter grouping, search,
// read-progress calculation, safe external URL & link filtering, slug validation,
// safe static/slug-only chat prompts, and relative timestamps.
// Strictly zero gpui-kit, gpui-base, herdr, or Intl imports so node:test imports it directly.

export const CHAPTER_META = [
  { id: "decisions", title: "Decisions you made" },
  { id: "architecture", title: "Core architecture & patterns" },
];

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * Allows ONLY valid https:// URLs with a non-empty hostname and no whitespace, control chars,
 * or unsafe characters. Rejects http:, javascript:, file:, data:, vbscript:, etc.
 */
export function isSafeExternalUrl(url) {
  if (typeof url !== "string" || !url.startsWith("https://")) return false;
  if (/[\s\x00-\x1f\x7f]/.test(url)) return false;
  if (/[<>`"'\\]/.test(url)) return false;
  const rest = url.slice("https://".length);
  if (!rest || rest.startsWith("/") || rest.startsWith(".")) return false;
  const hostPort = rest.split("/")[0].split("?")[0].split("#")[0];
  if (!hostPort || hostPort.includes("@")) return false;
  const m = /^([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?::(\d{1,5}))?$/i.exec(hostPort);
  if (!m) return false;
  if (m[2] && Number(m[2]) > 65535) return false;
  return true;
}

/** Filters an array of links to safe https:// entries with a non-empty title. */
export function safeLinks(links) {
  if (!Array.isArray(links)) return [];
  const out = [];
  for (const l of links) {
    const title = typeof l?.title === "string" ? l.title.trim() : "";
    const url = typeof l?.url === "string" ? l.url.trim() : "";
    if (!title || !isSafeExternalUrl(url)) continue;
    const note = typeof l?.note === "string" ? l.note.trim() : "";
    out.push({ title, url, note });
  }
  return out;
}

/** Checks that a lesson slug matches the strict lowercase allowlist. */
export function isValidSlug(slug) {
  return SLUG_RE.test(String(slug ?? ""));
}

/** Computes read count, total count, and rounded completion percentage (0..100). */
export function readProgress(lessons) {
  const list = Array.isArray(lessons) ? lessons : [];
  const total = list.length;
  const read = list.filter((l) => Boolean(l?.read)).length;
  const percent = total === 0 ? 0 : Math.round((read / total) * 100);
  return { read, total, percent };
}

function matchesQuery(lesson, q) {
  if (String(lesson?.title ?? "").toLowerCase().includes(q)) return true;
  if (String(lesson?.summary ?? "").toLowerCase().includes(q)) return true;
  if (String(lesson?.whyRepo ?? "").toLowerCase().includes(q)) return true;
  if (String(lesson?.slug ?? "").toLowerCase().includes(q)) return true;
  const sources = Array.isArray(lesson?.sources) ? lesson.sources : [];
  return sources.some((s) => String(s?.label ?? "").toLowerCase().includes(q));
}

/** Case-insensitive substring filter across title, summary, whyRepo, slug, and sources[].label. */
export function filterLessons(lessons, query) {
  const list = Array.isArray(lessons) ? lessons : [];
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return list;
  return list.filter((l) => matchesQuery(l, q));
}

/** Groups lessons in CHAPTER_META order (decisions first; all others into architecture), omitting empty chapters. */
export function groupByChapter(lessons) {
  const list = Array.isArray(lessons) ? lessons : [];
  const buckets = { decisions: [], architecture: [] };
  for (const item of list) {
    if (item?.chapter === "decisions") buckets.decisions.push(item);
    else buckets.architecture.push(item);
  }
  return CHAPTER_META
    .map((ch) => ({ id: ch.id, title: ch.title, items: buckets[ch.id] }))
    .filter((ch) => ch.items.length > 0);
}

/** Classifies the Learning page state into loading, error, empty, no-matches, or ready. */
export function learningViewState({ loading = false, error = null, lessons = [], filtered = [] } = {}) {
  const all = Array.isArray(lessons) ? lessons : [];
  const vis = Array.isArray(filtered) ? filtered : [];
  if (loading && all.length === 0) return "loading";
  if (error && all.length === 0) return "error";
  if (all.length === 0) return "empty";
  if (vis.length === 0) return "no-matches";
  return "ready";
}

/**
 * Safe static prompt instructing the Orchestrator to inspect candidates and refresh guides.
 * NEVER embeds untrusted text; only accepts a validated positive integer count.
 */
export function buildRefreshGuidesPrompt(candidatesCount) {
  const n = Number.isSafeInteger(candidatesCount) && candidatesCount > 0 ? candidatesCount : 0;
  const note = n > 0 ? ` (${n} new decision${n === 1 ? "" : "s"} to explain)` : "";
  return `Refresh this repository's Learning guides${note}: run \`bh learn candidates --json\` and create or refresh concise high-level Learning guides with \`bh learn write\` for new or changed decisions and knowledge.`;
}

/** Safe static prompt instructing the Orchestrator (with Scout) to scan core repo patterns. */
export function buildScanRepoPrompt() {
  return "Scan this repository with Scout to identify its core architecture, patterns, and design concepts, then write concise high-level Learning guides via `bh learn write` with verified https:// reference links.";
}

/** Safe slug-only prompt instructing the Orchestrator to refresh one Learning guide. */
export function buildRefreshLessonPrompt(slug) {
  if (!isValidSlug(slug)) {
    throw new Error(`Invalid learning guide slug: ${String(slug)}`);
  }
  return `Refresh the Learning guide "${slug}": inspect it with \`bh learn show ${slug} --json\`, verify against current repository decisions and architecture, and update it via \`bh learn write ${slug}\`.`;
}

/** Compact relative timestamp without Intl (e.g. "just now", "12m ago", "3h ago", "2d ago"). */
export function formatUpdated(iso, nowMs = Date.now()) {
  if (!iso) return "";
  const at = Date.parse(String(iso));
  if (!Number.isFinite(at)) return "";
  const sec = Math.max(0, Math.floor((nowMs - at) / 1000));
  if (sec < 45) return "just now";
  if (sec < 3600) return `${Math.max(1, Math.floor(sec / 60))}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 86400 * 30) return `${Math.floor(sec / 86400)}d ago`;
  if (sec < 86400 * 365) return `${Math.floor(sec / (86400 * 30))}mo ago`;
  return `${Math.floor(sec / (86400 * 365))}y ago`;
}

/** Primary provenance badge label for a lesson. */
export function primarySourceLabel(lesson) {
  const label = lesson?.sources?.[0]?.label;
  return typeof label === "string" && label.trim() ? label.trim() : "Repo concept";
}
