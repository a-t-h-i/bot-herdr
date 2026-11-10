// Plans: an idea the Orchestrator plans with the panel (Dev, Design, QA, Research) in rounds,
// until nothing that changes the work is open. The person reads the draft and comments on any
// line; a ready plan becomes a task.
//
// .bot-herdr/plans/<id>/plan.json, plan.md, comments.json

import { join } from "node:path";
import { listDir, newId, now, readJson, readText, store, titleFrom, writeJson, writeText } from "./core.mjs";

export const PLAN_STATUSES = ["grilling", "ready", "task", "archived"];

const dir = (root, id) => store(root, "plans", id);

export function loadPlan(root, id) {
  const plan = readJson(join(dir(root, id), "plan.json"));
  if (!plan) throw new Error(`No plan ${id}. \`bh plan list\` shows them.`);
  plan.markdown = readText(join(dir(root, id), "plan.md"));
  plan.comments = readJson(join(dir(root, id), "comments.json"), []);
  return plan;
}

export function savePlan(root, plan) {
  const { markdown, comments, ...meta } = plan;
  meta.updated = now();
  writeJson(join(dir(root, plan.id), "plan.json"), meta);
  if (markdown !== undefined) writeText(join(dir(root, plan.id), "plan.md"), markdown);
  if (comments !== undefined) writeJson(join(dir(root, plan.id), "comments.json"), comments);
  return { ...meta, markdown, comments };
}

export function listPlans(root, { all = false } = {}) {
  return listDir(store(root, "plans"))
    .filter((d) => d.isDirectory())
    .map((d) => readJson(join(store(root, "plans"), d.name, "plan.json")))
    .filter((p) => p && (all || p.status !== "archived"))
    .sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
}

export function newPlan(root, { idea, title }) {
  return savePlan(root, {
    id: newId("p"),
    title: title?.trim() || titleFrom(idea),
    idea: String(idea ?? "").trim(),
    status: "grilling",
    round: 0,
    task: null,
    created: now(),
    markdown: "",
    comments: [],
  });
}

/** A new draft: the round moves on, and the title and status follow the draft's own sections. */
export function writeDraft(plan, markdown, { status, title } = {}) {
  plan.markdown = String(markdown ?? "").trim() + "\n";
  plan.round = (plan.round ?? 0) + 1;
  const declared = /^##\s+Status\s*\n+\s*(GRILLING|READY)/im.exec(plan.markdown)?.[1]?.toLowerCase();
  plan.status = status ?? declared ?? plan.status ?? "grilling";
  const named = /^##\s+Title\s*\n+\s*(.+)$/im.exec(plan.markdown)?.[1]?.trim();
  if (title || named) plan.title = title || named;
  return plan;
}

export function comment(plan, { line = null, text }) {
  const c = { id: `c${(plan.comments?.length ?? 0) + 1}`, line: line === null ? null : Number(line), quote: line === null ? "" : (plan.markdown.split("\n")[Number(line) - 1] ?? "").trim(), text: String(text).trim(), at: now(), open: true };
  plan.comments = [...(plan.comments ?? []), c];
  return c;
}

export const openComments = (plan) => (plan.comments ?? []).filter((c) => c.open);

export function planLine(p) {
  return `${p.id}  ${p.status.padEnd(8)} round ${p.round}  ${p.title}`;
}
