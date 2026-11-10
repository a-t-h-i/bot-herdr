// Questions for the person: an agent asks with options (and mockups for what the person will
// see); the chat shows them as a card the person answers in one go; the answers reach the agent
// as a message. Kept with the person's data, so the chat reads them without the project.
//
// <app home>/data/bot-herdr/questions/<id>.json, and <id>-<q>-<o>.html for each mockup.

import { rmSync } from "node:fs";
import { join } from "node:path";
import { DATA, listDir, newId, now, readJson, writeJson, writeText } from "./core.mjs";

export const QDIR = join(DATA, "questions");

/**
 * Questions written the planner's way:
 *   1. [DEV] The question?
 *      - Short label — what choosing it means
 *      - Another (Recommended) — what it means
 *        ```mockup
 *        <style>…</style><div>…</div>
 *        ```
 * Text before the first question is kept as the intro.
 */
export function parseQuestions(md) {
  const lines = String(md ?? "").replace(/\r\n/g, "\n").split("\n");
  const questions = [];
  const intro = [];
  let q = null;
  let opt = null;
  let fence = null;
  for (const line of lines) {
    if (fence) {
      if (/^\s*```\s*$/.test(line)) {
        if (opt) opt.mockup = fence.join("\n");
        fence = null;
      } else fence.push(line.replace(/^\s{0,8}/, ""));
      continue;
    }
    if (/^\s*```\s*(mockup|html)\s*$/i.test(line)) {
      fence = [];
      continue;
    }
    const qm = /^\s?\d+[.)]\s+(?:\[([A-Z]+)\]\s*)?(.+?)\s*$/.exec(line);
    if (qm) {
      q = { seat: qm[1] ?? null, text: qm[2], options: [], multi: /\(pick (any|several|all that apply)\)/i.test(qm[2]) };
      questions.push(q);
      opt = null;
      continue;
    }
    const om = /^\s*[-*]\s+(.+?)\s*$/.exec(line);
    if (om && q) {
      const [label, ...meaning] = om[1].split(/\s+[—–-]{1,2}\s+/);
      const recommended = /\(Recommended\)/i.test(label);
      opt = { label: label.replace(/\s*\(Recommended\)\s*/i, "").trim(), meaning: meaning.join(" — ").trim(), recommended, mockup: null };
      q.options.push(opt);
      continue;
    }
    if (!q && line.trim()) intro.push(line);
  }
  return { intro: intro.join("\n").trim(), questions };
}

export function ask({ title, intro = "", questions, from, fromName = null, cwd = null, plan = null }) {
  if (!questions.length) throw new Error("No questions found. Number each question (1. …) and list its options under it (- Label — meaning).");
  const id = newId("q");
  questions.forEach((q, qi) => q.options.forEach((o, oi) => {
    if (!o.mockup) return;
    const html = /<html/i.test(o.mockup) ? o.mockup : `<!doctype html><html><head><meta charset="utf-8"><title>${o.label}</title></head><body>${o.mockup}</body></html>`;
    o.mockupFile = join(QDIR, `${id}-${qi + 1}-${oi + 1}.html`);
    writeText(o.mockupFile, html);
    delete o.mockup;
  }));
  const record = { id, title: title || "Questions", intro, questions, from, fromName, cwd, ...(plan ? { plan } : {}), status: "open", answers: null, created: now() };
  writeJson(join(QDIR, `${id}.json`), record);
  return record;
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

/** Every question set asked for a plan, open or answered, oldest first: the plan's conversation. */
export function forPlan(plan) {
  const read = (folder) => listDir(folder).filter((d) => d.isFile() && d.name.endsWith(".json")).map((d) => readJson(join(folder, d.name)));
  return [...read(QDIR), ...read(join(QDIR, "answered"))]
    .filter((q) => q && q.plan === plan)
    .sort((a, b) => String(a.created).localeCompare(String(b.created)));
}

/** The answers as the asking agent reads them. */
export function answersText(q) {
  const lines = [`The person answered your questions (${q.id}${q.title ? `: ${q.title}` : ""}):`];
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
