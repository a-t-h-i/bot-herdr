// Questions for the user: an agent asks with options (and mockups for what the user will
// see); the chat shows them as a card the user answers in one go; the answers reach the agent
// as a message. Kept with the user's data, so the chat reads them without the project.
//
// <app home>/data/bot-herdr/questions/<id>.json, and <id>-<q>-<o>.html for each mockup.

import { rmSync } from "node:fs";
import { join } from "node:path";
import { DATA, listDir, newId, now, readJson, writeJson, writeText } from "./core.mjs";
import { drawMockup } from "./media.mjs";

export const QDIR = join(DATA, "questions");

const MOCKUP_OPEN = /^\s*(```|~~~)\s*(mockup|html)\b.*$/i;
const QUESTION = /^\s?\d+[.)]\s+(?:\[([A-Z]+)\]\s*)?(.+?)\s*$/;
const OPTION = /^\s*[-*]\s+(.+?)\s*$/;

/**
 * Questions written the planner's way:
 *   1. [DEV] The question?
 *      - Short label — what choosing it means
 *      - Another (Recommended) — what it means
 *        ```mockup
 *        <style>…</style><div>…</div>
 *        ```
 * Text before the first question is kept as the intro. A mockup block (``` or ~~~, then `mockup`
 * or `html`) goes under the option it shows and closes with the same fence on a line of its own.
 * A block that can't be kept is dropped, and `warnings` says where and why.
 */
export function parseQuestions(md) {
  const lines = String(md ?? "").replace(/\r\n/g, "\n").split("\n");
  const s = { questions: [], intro: [], warnings: [], q: null, opt: null, fence: null };
  for (const line of lines) {
    if (s.fence) fenceLine(s, line);
    else readLine(s, line);
  }
  if (s.fence) s.warnings.push(`${spot(s)}: a mockup block is never closed; end it with a line of ${s.fence.marker} and nothing else. It is dropped.`);
  return { intro: s.intro.join("\n").trim(), questions: s.questions, warnings: s.warnings };
}

/** Where the parser is, for a warning. */
function spot(s) {
  if (!s.q) return "Before the first question";
  return `Question ${s.questions.length}${s.opt ? `, option "${s.opt.label}"` : ""}`;
}

function readLine(s, line) {
  const open = MOCKUP_OPEN.exec(line);
  const qm = QUESTION.exec(line);
  const om = OPTION.exec(line);
  if (open) s.fence = { marker: open[1], body: [] };
  else if (qm) addQuestion(s, qm);
  else if (om && s.q) addOption(s, om[1]);
  else if (!s.q && line.trim()) s.intro.push(line);
}

function addQuestion(s, qm) {
  s.q = { seat: qm[1] ?? null, text: qm[2], options: [], multi: /\(pick (any|several|all that apply)\)/i.test(qm[2]) };
  s.questions.push(s.q);
  s.opt = null;
}

function addOption(s, text) {
  const [label, ...meaning] = text.split(/\s+[—–-]{1,2}\s+/);
  s.opt = { label: label.replace(/\s*\(Recommended\)\s*/i, "").trim(), meaning: meaning.join(" — ").trim(), recommended: /\(Recommended\)/i.test(label), mockup: null };
  s.q.options.push(s.opt);
}

function fenceLine(s, line) {
  if (line.trim() !== s.fence.marker) {
    s.fence.body.push(line.replace(/^\s{0,8}/, ""));
    return;
  }
  placeMockup(s, s.fence.body.join("\n"));
  s.fence = null;
}

/** A closed block goes under the option above it; one that can't be kept is warned about and dropped. */
function placeMockup(s, html) {
  if (!s.opt) s.warnings.push(`${spot(s)}: a mockup block sits under the question, not under an option. Put it right under the option line it shows.`);
  else if (s.opt.mockup !== null) s.warnings.push(`${spot(s)}: two mockup blocks; only the first is kept.`);
  else s.opt.mockup = html;
}

/** A mockup as the page will load it: scripts and <link> tags are taken out, nothing else changes. */
export function sanitizeMockup(html) {
  return String(html).replace(/<script\b[\s\S]*?<\/script\s*>/gi, "").replace(/<link\b[^>]*>/gi, "");
}

function writeMockup(id, qi, oi, o) {
  const body = sanitizeMockup(o.mockup);
  const html = /<html/i.test(body) ? body : `<!doctype html><html><head><meta charset="utf-8"><title>${o.label}</title></head><body>${body}</body></html>`;
  o.mockupFile = join(QDIR, `${id}-${qi + 1}-${oi + 1}.html`);
  writeText(o.mockupFile, html);
  delete o.mockup;
}

export function ask({ title, intro = "", questions, from, fromName = null, cwd = null, plan = null }) {
  if (!questions.length) throw new Error("No questions found. Number each question (1. …) and list its options under it (- Label — meaning).");
  const id = newId("q");
  questions.forEach((q, qi) => q.options.forEach((o, oi) => {
    if (o.mockup) writeMockup(id, qi, oi, o);
  }));
  const record = { id, title: title || "Questions", intro, questions, from, fromName, cwd, ...(plan ? { plan } : {}), status: "open", answers: null, created: now() };
  writeJson(join(QDIR, `${id}.json`), record);
  return record;
}

/**
 * Draws every mockup of a question record now, so its card shows pictures at once. One that won't
 * draw is listed in `failed` with its reason, and the rest still draw. Returns { drawn, failed }.
 */
export function drawMockups(record, draw = drawMockup) {
  const drawn = [];
  const failed = [];
  record.questions.forEach((q, qi) => q.options.forEach((o) => {
    if (!o.mockupFile) return;
    const at = { question: qi + 1, option: o.label };
    const r = tryDraw(draw, o.mockupFile);
    if (r.error) failed.push({ ...at, error: r.error });
    else drawn.push({ ...at, image: r.image });
  }));
  return { drawn, failed };
}

function tryDraw(draw, file) {
  try {
    return draw(file);
  } catch (e) {
    return { error: e.message };
  }
}

export function loadQuestion(id) {
  const q = readJson(join(QDIR, `${id}.json`)) ?? readJson(join(QDIR, "answered", `${id}.json`));
  if (!q) throw new Error(`No question ${id}.`);
  return q;
}

export function openQuestions() {
  return listDir(QDIR)
    .filter((d) => d.isFile() && d.name.endsWith(".json"))
    .map((d) => readJson(join(QDIR, d.name)))
    .filter((q) => q && q.status === "open")
    .sort((a, b) => String(a.created).localeCompare(String(b.created)));
}

/**
 * Discards a plan's open question sets: each record and its mockup files (<id>-*). Answered ones
 * stay, they are the record of what was decided. Returns how many sets were discarded.
 */
export function discardOpenFor(plan) {
  const open = openQuestions().filter((q) => q.plan === plan);
  for (const q of open) {
    for (const d of listDir(QDIR)) if (d.isFile() && d.name.startsWith(`${q.id}-`)) rmSync(join(QDIR, d.name), { force: true });
    rmSync(join(QDIR, `${q.id}.json`), { force: true });
  }
  return open.length;
}

/** Every question set asked for a plan, open or answered, oldest first: the plan's conversation. */
export function forPlan(plan) {
  const read = (folder) => listDir(folder).filter((d) => d.isFile() && d.name.endsWith(".json")).map((d) => readJson(join(folder, d.name)));
  return [...read(QDIR), ...read(join(QDIR, "answered"))]
    .filter((q) => q && q.plan === plan)
    .sort((a, b) => String(a.created).localeCompare(String(b.created)));
}

/** The answers as the asking agent reads them. */
export function answersText(q) {
  const lines = [`The user answered your questions (${q.id}${q.title ? `: ${q.title}` : ""}):`];
  q.questions.forEach((x, i) => {
    const a = q.answers?.[i] ?? {};
    const picked = [...(a.picks ?? [])].join(", ");
    const typed = (a.text ?? "").trim();
    const what = [picked, typed].filter(Boolean).join(" — ") || "(left for you to decide: pick the best option and say which)";
    lines.push(`${i + 1}. ${x.seat ? `[${x.seat}] ` : ""}${x.text}\n   → ${what}`);
  });
  return lines.join("\n");
}

export function answer(id, answers) {
  const q = loadQuestion(id);
  q.answers = answers;
  q.status = "answered";
  q.answered = now();
  // Answered ones move aside, so the chat only reads what is still open.
  writeJson(join(QDIR, "answered", `${id}.json`), q);
  rmSync(join(QDIR, `${id}.json`), { force: true });
  return q;
}
