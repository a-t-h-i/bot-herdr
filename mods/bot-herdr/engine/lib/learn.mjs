// Learning guides: short, plain-English upskilling lessons about the concepts this repository
// uses and the decisions it carries, so the user can learn from their own project. User-facing
// only: a lesson is never injected into an agent's brief (that is .bot-herdr/knowledge).
//
// .bot-herdr/learn/index.json, <slug>.md, archive/<slug>-<ts>.md, export/<slug>.html|.pdf

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { QDIR, answeredForProject } from "./ask.mjs";
import { listDir, now, readJson, readText, store, withLock, writeJson, writeText } from "./core.mjs";
import { findBrowser } from "./media.mjs";

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const MAX_BODY_CHARS = 6000;
export const MAX_LINKS = 8;
export const CHAPTERS = ["decisions", "architecture"];
export const NO_BROWSER = "No Chrome, Edge, Chromium or Brave found to export PDF. Install one, set BH_BROWSER, or use Open HTML and print to PDF from your browser.";

const CHAPTER_LABELS = { decisions: "Decisions you made", architecture: "Core architecture & patterns" };
const UNSAFE_SCHEME = /^(?:javascript|data|vbscript|file):/i;
/** `[label](url)`: the url may hold one nested pair of parentheses (Wikipedia disambiguation). */
const MD_LINK = /\[([^\]]*)\]\(((?:[^()\s]|\([^()]*\))+)\)/g;

const dir = (root, ...parts) => store(root, "learn", ...parts);
const lockOf = (root) => dir(root, ".lock");
const compactTs = () => now().replace(/[-:.]/g, "");

/** Only `https://` addresses are ever saved, linked or opened: no other scheme is a lesson link. */
export function isSafeHttpsUrl(url) {
  const text = String(url ?? "").trim();
  if (!text || /[\s\u0000-\u001f\u007f]/.test(text)) return false;
  try {
    const parsed = new URL(text);
    return parsed.protocol === "https:" && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

/** A slug becomes a file name under the store, so only the allowlist may pass (no dots, no slashes). */
export function validateSlug(slug) {
  const text = String(slug ?? "");
  if (!SLUG_RE.test(text)) throw new Error(`Bad lesson slug ${JSON.stringify(text)}: use 1-64 lowercase letters, digits and dashes, starting with a letter or digit.`);
  return text;
}

/** Every lesson as the tab lists it, with a best-effort stale flag: a source changed after the lesson. */
export function listLessons(root) {
  const index = readIndex(root);
  const lessons = index.lessons
    .map((lesson) => ({ ...lesson, stale: isStale(root, lesson) }))
    .sort((a, b) => String(b.updated ?? "").localeCompare(String(a.updated ?? "")));
  const { candidates } = listCandidates(root);
  return { lessons, candidates, candidatesCount: candidates.length, updated: index.updated ?? null };
}

export function getLesson(root, slug) {
  const id = validateSlug(slug);
  const meta = readIndex(root).lessons.find((lesson) => lesson.slug === id);
  const markdown = readText(dir(root, `${id}.md`), "");
  if (!meta || !markdown) throw new Error(`No lesson ${id}. \`bh learn list\` shows them.`);
  return { ...meta, markdown };
}

/**
 * Saves a lesson, archiving the version before it when the slug exists. The index write and the
 * body write happen under one lock, so two writers can never lose each other's lesson.
 */
export function writeLesson(root, { slug, title, summary, markdown, chapter = "architecture", whyRepo = "", sources = [], links = [], readMins = null }) {
  const id = validateSlug(slug);
  const lesson = {
    slug: id,
    title: required(title, "A lesson title"),
    summary: required(summary, "A one-line summary"),
    chapter: chapterOf(chapter),
    whyRepo: String(whyRepo ?? "").trim(),
    sources: cleanSources(sources),
    links: cleanLinks(links),
    readMins: readMinutes(readMins, markdown),
  };
  const body = required(markdown, "The lesson body");
  assertSafeBody(body);
  return withLock(lockOf(root), () => {
    const index = readIndex(root);
    const before = index.lessons.find((lesson2) => lesson2.slug === id);
    const archived = archiveBody(root, id);
    const at = now();
    const meta = {
      ...lesson,
      read: before?.read ?? false,
      readAt: before?.readAt ?? null,
      created: before?.created ?? at,
      updated: at,
      stale: false,
    };
    writeText(dir(root, `${id}.md`), `${body.trimEnd()}\n`);
    index.lessons = [...index.lessons.filter((lesson2) => lesson2.slug !== id), meta];
    writeIndex(root, index);
    return { ok: true, slug: id, archived, lesson: meta };
  });
}

export function setLessonRead(root, slug, read = true) {
  const id = validateSlug(slug);
  return withLock(lockOf(root), () => {
    const index = readIndex(root);
    const lesson = index.lessons.find((entry) => entry.slug === id);
    if (!lesson) throw new Error(`No lesson ${id}. \`bh learn list\` shows them.`);
    lesson.read = Boolean(read);
    lesson.readAt = lesson.read ? now() : null;
    writeIndex(root, index);
    return { ok: true, slug: id, read: lesson.read, readAt: lesson.readAt };
  });
}

/** Takes a lesson out of the index and keeps its body in archive/, so the words are never lost. */
export function deleteLesson(root, slug) {
  const id = validateSlug(slug);
  return withLock(lockOf(root), () => {
    const index = readIndex(root);
    archiveBody(root, id);
    index.lessons = index.lessons.filter((lesson) => lesson.slug !== id);
    writeIndex(root, index);
    for (const file of [dir(root, `${id}.md`), dir(root, "export", `${id}.html`), dir(root, "export", `${id}.pdf`)]) rmSync(file, { force: true });
    return { ok: true, slug: id };
  });
}

/**
 * What the project has to learn from but no lesson explains yet: its answered questionnaires, its
 * plan decisions and its knowledge decisions/facts. `--all` keeps the ones already covered.
 */
export function listCandidates(root, { all = false } = {}) {
  const covered = new Set(readIndex(root).lessons.flatMap((lesson) => (lesson.sources ?? []).map((source) => source.ref)));
  const items = [...questionCandidates(root), ...planCandidates(root), ...knowledgeCandidates(root)]
    .map((candidate) => ({ ...candidate, covered: covered.has(candidate.ref) }))
    .sort((a, b) => String(b.at ?? "").localeCompare(String(a.at ?? "")));
  return { candidates: all ? items : items.filter((candidate) => !candidate.covered), total: items.length };
}

/** Loads a lesson and writes its standalone, printable HTML to learn/export/<slug>.html. */
export function exportLessonHtml(root, slug) {
  const lesson = getLesson(root, slug);
  const path = dir(root, "export", `${lesson.slug}.html`);
  writeText(path, renderLessonHtml(lesson, lesson.markdown));
  return { ok: true, slug: lesson.slug, path };
}

/** Exports the HTML, then prints it to PDF with a headless browser; no browser is a clear sentence. */
export function exportLessonPdf(root, slug, { findBrowserFn = findBrowser, spawnFn = spawnSync } = {}) {
  const html = exportLessonHtml(root, slug);
  const browser = findBrowserFn();
  if (!browser) return { ok: false, error: NO_BROWSER };
  const pdf = dir(root, "export", `${html.slug}.pdf`);
  rmSync(pdf, { force: true }); // only a PDF this run writes counts as an export
  const profile = mkdtempSync(join(tmpdir(), "bh-learn-"));
  try {
    const rootUser = process.platform === "linux" && process.getuid?.() === 0;
    const args = [
      "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-extensions",
      `--user-data-dir=${profile}`, "--print-to-pdf-no-header", `--print-to-pdf=${pdf}`,
      ...(rootUser ? ["--no-sandbox"] : []), pathToFileURL(html.path).href,
    ];
    const done = spawnFn(browser, args, { timeout: 45000, stdio: ["ignore", "ignore", "pipe"], encoding: "utf8", windowsHide: true });
    if (existsSync(pdf)) return { ok: true, slug: html.slug, path: pdf };
    const why = done?.error?.message ?? String(done?.stderr ?? "").trim().split("\n").pop() ?? "";
    return { ok: false, error: `Couldn't export the PDF${why ? `: ${why}` : "."}` };
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }
}

/**
 * The lesson as one self-contained page: no scripts, no remote assets, a strict CSP, every
 * untrusted field escaped, and only `https://` links made clickable. Prints as 1-2 crisp pages.
 */
export function renderLessonHtml(lesson, markdown) {
  const links = (lesson.links ?? []).filter((link) => link?.title && isSafeHttpsUrl(link.url));
  const sources = lesson.sources ?? [];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;">
<meta name="description" content="${escapeHtml(lesson.summary)}">
<title>${escapeHtml(lesson.title)}</title>
<style>${CSS}</style>
</head>
<body>
<main class="page">
<header>
<p class="eyebrow">Learning guide · ${escapeHtml(CHAPTER_LABELS[lesson.chapter] ?? "Core architecture & patterns")} · ${escapeHtml(lesson.readMins)} min read</p>
<h1>${escapeHtml(lesson.title)}</h1>
<p class="summary">${escapeHtml(lesson.summary)}</p>
</header>
${lesson.whyRepo ? `<section class="callout"><h2>Why this matters in this repo</h2>${paragraphs(lesson.whyRepo)}</section>` : ""}
<section class="body">
${renderBlocks(markdown)}
</section>
${links.length ? `<section class="links"><h2>Explore further</h2><ul>${links.map(linkItem).join("")}</ul></section>` : ""}
${sources.length ? `<section class="sources"><h2>Where this came from</h2><ul>${sources.map((source) => `<li>${escapeHtml(source.label || source.ref)} <span>(${escapeHtml(source.kind)})</span></li>`).join("")}</ul></section>` : ""}
<footer>Generated by bot-herdr from this project's plans, answers and knowledge. Learning guides are for you; they never reach an agent's brief.</footer>
</main>
</body>
</html>
`;
}

// --- the store ------------------------------------------------------------------------------

function readIndex(root) {
  const index = readJson(dir(root, "index.json"), null);
  return index && Array.isArray(index.lessons) ? index : { version: 1, updated: null, lessons: [] };
}

function writeIndex(root, index) {
  index.version = 1;
  index.updated = now();
  index.lessons.sort((a, b) => String(b.updated ?? "").localeCompare(String(a.updated ?? "")));
  writeJson(dir(root, "index.json"), index);
}

/** Moves the current body aside under a compact timestamp; null when there is none. */
function archiveBody(root, slug) {
  const file = dir(root, `${slug}.md`);
  if (!existsSync(file)) return null;
  const archived = dir(root, "archive", `${slug}-${compactTs()}.md`);
  writeText(archived, readText(file));
  return archived;
}

/** A lesson is stale when a source it names changed after the lesson was written (best effort). */
function isStale(root, lesson) {
  const updated = Date.parse(lesson.updated ?? "");
  if (!Number.isFinite(updated)) return false;
  return (lesson.sources ?? []).some((source) => {
    try {
      const file = sourceFile(root, source);
      return Boolean(file) && statSync(file).mtimeMs > updated;
    } catch {
      return false;
    }
  });
}

function sourceFile(root, source) {
  const ref = String(source?.ref ?? "");
  if (source?.kind === "question") return join(QDIR, "answered", `${ref}.json`);
  if (source?.kind === "plan") return store(root, "plans", ref, "plan.json");
  if (source?.kind === "knowledge") return store(root, "knowledge", ref.replace(/^knowledge[\\/]/, ""));
  return null;
}

// --- the candidates -------------------------------------------------------------------------

function questionCandidates(root) {
  return answeredForProject(root).map((q) => ({
    id: q.id,
    kind: "question",
    ref: q.id,
    label: q.title || q.id,
    summary: clip(answeredSummary(q), 420),
    at: q.answered || q.created || null,
  }));
}

function answeredSummary(q) {
  return (q.questions ?? []).map((question, i) => {
    const answer = q.answers?.[i] ?? {};
    const picked = (answer.picks ?? []).join(", ");
    const typed = String(answer.text ?? "").trim();
    const chose = [picked, typed].filter(Boolean).join(" — ") || "left to the team";
    return `${plain(question.text)} → ${plain(chose)}`;
  }).join("; ");
}

function planCandidates(root) {
  return listDir(store(root, "plans"))
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const plan = readJson(store(root, "plans", entry.name, "plan.json"));
      if (!plan) return [];
      const bullets = sectionBullets(readText(store(root, "plans", entry.name, "plan.md")), ["Decisions by domain", "Locked Decisions"]);
      if (!bullets.length) return [];
      return [{
        id: plan.id,
        kind: "plan",
        ref: plan.id,
        label: plan.title || plan.id,
        summary: clip(bullets.map(plain).join("; "), 420),
        at: plan.updated || plan.created || null,
      }];
    });
}

function knowledgeCandidates(root) {
  const folder = store(root, "knowledge");
  return listDir(folder)
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .flatMap((entry) => {
      const file = join(folder, entry.name);
      const bullets = sectionBullets(readText(file), ["Decisions", "Facts"]);
      if (!bullets.length) return [];
      return [{
        id: `knowledge/${entry.name}`,
        kind: "knowledge",
        ref: `knowledge/${entry.name}`,
        label: entry.name,
        summary: clip(bullets.map(plain).join("; "), 420),
        at: new Date(statSync(file).mtimeMs).toISOString(),
      }];
    });
}

/** The bullets under any of these `##`/`###` headings, in file order. */
function sectionBullets(markdown, titles) {
  const wanted = new Set(titles.map((title) => title.toLowerCase()));
  const bullets = [];
  let inside = false;
  for (const line of String(markdown ?? "").split("\n")) {
    const heading = /^#{1,4}\s+(.*?)\s*$/.exec(line);
    if (heading) {
      inside = wanted.has(heading[1].toLowerCase());
      continue;
    }
    const bullet = /^\s*[-*]\s+(.*\S)\s*$/.exec(line);
    if (inside && bullet) bullets.push(bullet[1]);
  }
  return bullets;
}

// --- validation -----------------------------------------------------------------------------

function required(value, what) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${what} is required.`);
  return text;
}

function chapterOf(chapter) {
  const text = String(chapter ?? "architecture");
  if (!CHAPTERS.includes(text)) throw new Error(`Chapter must be one of ${CHAPTERS.join(" or ")}.`);
  return text;
}

function readMinutes(readMins, markdown) {
  const given = Number(readMins);
  if (readMins !== null && readMins !== undefined && readMins !== "" && Number.isFinite(given) && given >= 1) return Math.round(given);
  const words = String(markdown ?? "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function cleanSources(sources) {
  if (sources === null || sources === undefined) return [];
  if (!Array.isArray(sources)) throw new Error("Sources must be a list of { kind, ref, label }.");
  return sources.map((source) => ({
    kind: String(source?.kind ?? "note").trim(),
    ref: required(source?.ref, "A source ref"),
    label: String(source?.label ?? source?.ref ?? "").trim(),
  }));
}

function cleanLinks(links) {
  if (links === null || links === undefined) return [];
  if (!Array.isArray(links)) throw new Error("Links must be a list of { title, url }.");
  if (links.length > MAX_LINKS) throw new Error(`At most ${MAX_LINKS} links per lesson; ${links.length} given.`);
  return links.map((link, i) => {
    const title = required(link?.title, `Link ${i + 1}: a title`);
    const url = String(link?.url ?? "").trim();
    if (!isSafeHttpsUrl(url)) throw new Error(`Link ${i + 1} ("${title}") is not an https:// URL: ${url}. Only https:// links are allowed.`);
    const note = String(link?.note ?? "").trim();
    return { title, url, ...(note ? { note } : {}) };
  });
}

/** A dangerous scheme in the body is refused at write time; the renderer would not link it anyway. */
function assertSafeBody(markdown) {
  const body = String(markdown);
  if (body.length > MAX_BODY_CHARS) throw new Error(`The lesson body is ${body.length} characters; keep it at or under ${MAX_BODY_CHARS}.`);
  for (const match of body.matchAll(MD_LINK)) {
    const url = match[2].replace(/\s+/g, "");
    if (UNSAFE_SCHEME.test(url)) throw new Error(`The lesson body links to "${url}": only https:// links are allowed.`);
  }
}

// --- the page -------------------------------------------------------------------------------

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const paragraph = (text) => `<p>${renderInline(text)}</p>`;
const paragraphs = (text) => String(text ?? "").split(/\n{2,}/).map((part) => paragraph(part.trim())).filter((html) => html !== "<p></p>").join("");

function linkItem(link) {
  const note = link.note ? `<span class="note">${escapeHtml(link.note)}</span>` : "";
  return `<li><a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.title)}</a>${note}</li>`;
}

function renderBlocks(markdown) {
  const blocks = [];
  let bullets = null;
  const flush = () => {
    if (bullets) blocks.push(`<ul>${bullets.map((bullet) => `<li>${renderInline(bullet)}</li>`).join("")}</ul>`);
    bullets = null;
  };
  for (const raw of String(markdown ?? "").replace(/\r\n/g, "\n").split("\n")) {
    const heading = /^(#{1,3})\s+(.*)$/.exec(raw.trim());
    const bullet = /^\s*[-*]\s+(.*\S)\s*$/.exec(raw);
    if (heading) {
      flush();
      const level = heading[1].length;
      blocks.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
    } else if (bullet) bullets = [...(bullets ?? []), bullet[1]];
    else if (!raw.trim()) flush();
    else {
      flush();
      blocks.push(paragraph(raw.trim()));
    }
  }
  flush();
  return blocks.join("\n");
}

/** Inline markdown: code, bold and safe links; everything else is escaped text. */
function renderInline(text) {
  return String(text ?? "").split(/(`[^`]+`)/).map((part) => (part.startsWith("`") && part.endsWith("`") && part.length > 2 ? `<code>${escapeHtml(part.slice(1, -1))}</code>` : renderText(part))).join("");
}

function renderText(text) {
  let html = "";
  let last = 0;
  for (const match of String(text).matchAll(MD_LINK)) {
    html += bold(escapeHtml(text.slice(last, match.index)));
    const url = match[2].trim();
    const label = escapeHtml(match[1] || url);
    html += isSafeHttpsUrl(url) ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
    last = match.index + match[0].length;
  }
  return html + bold(escapeHtml(text.slice(last)));
}

const bold = (html) => html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

/** Short, plain text for a candidate summary: markdown emphasis and code markers taken off. */
function plain(text) {
  return String(text ?? "").replace(/[*_`]/g, "").replace(/\s+/g, " ").trim();
}

function clip(text, max) {
  const value = String(text ?? "").trim();
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

const CSS = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; background: #f6efe4; color: #26201a; font: 16px/1.65 ui-sans-serif, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
.page { max-width: 48rem; margin: 0 auto; padding: 3rem 1.5rem 4rem; }
.eyebrow { margin: 0; letter-spacing: .12em; text-transform: uppercase; font-size: .72rem; color: #9a6a3a; }
h1 { font-family: ui-serif, Georgia, "Times New Roman", serif; font-size: 2.1rem; line-height: 1.2; margin: .5rem 0 .7rem; color: #1d1712; }
.summary { font-size: 1.08rem; color: #4a3f35; margin: 0 0 1.4rem; }
.callout { border-left: 4px solid #c98a3f; background: #fdf6ea; padding: 1rem 1.15rem; border-radius: .5rem; margin: 1.7rem 0; }
.callout h2, .links h2, .sources h2 { font-family: ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif; font-size: .78rem; text-transform: uppercase; letter-spacing: .1em; margin: 0 0 .45rem; color: #9a6a3a; }
.callout p { margin: 0 0 .5rem; }
.callout p:last-child { margin-bottom: 0; }
.body h1, .body h2, .body h3 { font-family: ui-serif, Georgia, "Times New Roman", serif; line-height: 1.25; margin: 1.9rem 0 .6rem; color: #1d1712; }
.body h1 { font-size: 1.5rem; } .body h2 { font-size: 1.3rem; } .body h3 { font-size: 1.12rem; }
.body p { margin: .8rem 0; }
.body ul { margin: .8rem 0; padding-left: 1.3rem; }
.body li { margin: .3rem 0; }
code { background: #efe3d2; border-radius: .3rem; padding: .1rem .35rem; font-size: .9em; }
a { color: #8a4a12; text-decoration-thickness: 1px; text-underline-offset: 2px; }
.links { margin-top: 2.5rem; border: 1px solid #e3d3bd; border-radius: .7rem; padding: 1.1rem 1.25rem; background: #fffaf2; }
.links ul { list-style: none; margin: 0; padding: 0; }
.links li { margin: .55rem 0; }
.links .note { display: block; color: #6b5c4c; font-size: .9rem; }
.sources { margin-top: 2rem; color: #6b5c4c; font-size: .85rem; }
.sources ul { margin: 0; padding-left: 1.1rem; }
footer { margin-top: 2.5rem; border-top: 1px solid #e3d3bd; padding-top: .8rem; color: #8a7864; font-size: .78rem; }
@media print {
  @page { size: A4; margin: 16mm; }
  body { background: #fff; color: #000; font-size: 10.5pt; line-height: 1.5; }
  .page { max-width: none; padding: 0; }
  h1 { font-size: 1.6rem; }
  .callout, .links { background: #fff; border: 1px solid #bbb; break-inside: avoid; }
  .body h1, .body h2, .body h3 { break-after: avoid; }
  a { color: #000; text-decoration: none; }
  a[href^="https://"]::after { content: " (" attr(href) ")"; font-size: .8em; color: #444; word-break: break-all; }
  .sources, footer { font-size: 9pt; }
}
`;
