// Plans: an idea the Orchestrator plans with the panel (Dev, Design, QA, Research) in rounds,
// until nothing that changes the work is open. The user reads the draft and comments on any
// line; a ready plan becomes a task.
//
// .bot-herdr/plans/<id>/plan.json, plan.md, comments.json

import { rmSync } from "node:fs";
import { join } from "node:path";
import { listDir, newId, now, readJson, readText, store, titleFrom, writeJson, writeText } from "./core.mjs";
import { changeComment, commentById, nextCommentId } from "./tasks.mjs";
import * as Q from "./ask.mjs";

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

/**
 * Discards a plan, for `bh plan delete`: its folder, and its open question sets (answered ones stay).
 * A task made from the plan stays. Returns { deleted, questions } (questions: sets discarded).
 */
export function deletePlan(root, id) {
  if (!/^[\w-]+$/.test(String(id))) throw new Error(`No plan ${id}. \`bh plan list\` shows them.`);
  loadPlan(root, id);
  const questions = Q.discardOpenFor(id);
  rmSync(dir(root, id), { recursive: true, force: true });
  return { deleted: id, questions };
}

export function listPlans(root, { all = false } = {}) {
  return listDir(store(root, "plans"))
    .filter((d) => d.isDirectory())
    .map((d) => readJson(join(store(root, "plans"), d.name, "plan.json")))
    .filter((p) => p && (all || p.status !== "archived"))
    .sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
}

/** A new plan; `skills` is the classifier's picks per panel seat (contract #9 a). */
export function newPlan(root, { idea, title, skills = {}, issues = null, repo = null }) {
  return savePlan(root, {
    id: newId("p"),
    title: title?.trim() || titleFrom(idea),
    idea: String(idea ?? "").trim(),
    status: "grilling",
    round: 0,
    task: null,
    created: now(),
    skills,
    goal: null,
    ...(issues ? { issues } : {}),
    ...(repo ? { repo } : {}),
    markdown: "",
    comments: [],
  });
}

const CRITERIA_KINDS = new Set(["check", "command", "file", "qa"]);

/** Parses one criterion line (`[check|command|file|qa] text`, or plain text as `qa`). */
export function parseCriterionLine(raw) {
  let body = String(raw ?? "").trim();
  if (!body) return null;
  let required = true;
  if (/^\(optional\)\s+/i.test(body)) {
    required = false;
    body = body.replace(/^\(optional\)\s+/i, "").trim();
  } else if (/\s+\(optional\)$/i.test(body)) {
    required = false;
    body = body.replace(/\s+\(optional\)$/i, "").trim();
  }
  let kind = "qa";
  let text = body;
  const tag = /^\[(check|command|file|qa)\]\s+(.+)$/i.exec(body);
  if (tag) {
    kind = tag[1].toLowerCase();
    text = tag[2].trim();
  }
  if (!CRITERIA_KINDS.has(kind) || !text) return null;
  const item = { kind, text, required };
  if (kind === "command") {
    const split = /^(.*?)(?:\s*(?:→|->)\s*(.+))?$/.exec(text);
    const cmdRaw = String(split?.[1] ?? text).trim();
    const backtick = /^`([^`]+)`(?:\s|$)/.exec(cmdRaw);
    item.command = (backtick ? backtick[1] : cmdRaw.replace(/^`|`$/g, "")).trim();
    item.expect = String(split?.[2] ?? "exit 0").trim() || "exit 0";
  } else if (kind === "file") {
    const backtick = /`([^`]+)`/.exec(text);
    const plain = /^([^\s]+)(?:\s|$)/.exec(text);
    item.path = String(backtick?.[1] ?? plain?.[1] ?? "").replace(/[,;:]+$/, "").trim();
  }
  return item;
}

const UNTRUSTED_ISSUE_BLOCK = /<untrusted-github-issue\b[^>]*>[\s\S]*?<\/untrusted-github-issue>/gi;
const stripUntrusted = (md) => String(md ?? "").replace(UNTRUSTED_ISSUE_BLOCK, "");

/**
 * Extracts verifiable DONE criteria from `### Done criteria` / `## DONE Criteria` (falling back
 * to `## Acceptance criteria`). Strips `<untrusted-github-issue>` blocks first so external issue
 * text can never inject criteria. Preserves stable `c<n>` IDs across edits.
 */
export function criteriaFromMarkdown(md, existing = []) {
  const text = stripUntrusted(md);
  let at = text.search(/^#{2,3}\s+Done\s+criteria\s*$/im);
  if (at < 0) at = text.search(/^#{2,3}\s+Acceptance\s+criteria\s*$/im);
  if (at < 0) return [];
  const lines = text.slice(at).split("\n").slice(1);
  const parsed = [];
  for (const line of lines) {
    if (/^#{1,3}\s/.test(line)) break;
    const m = /^\s*(?:[-*]|\d+[.)])\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    const item = parseCriterionLine(m[1]);
    if (item) parsed.push(item);
  }
  const prev = Array.isArray(existing) ? existing : [];
  let maxId = prev.reduce((m, c) => Math.max(m, Number(/^c(\d+)$/.exec(String(c?.id ?? ""))?.[1] ?? 0)), 0);
  const used = new Set();
  return parsed.map((item) => {
    const match = prev.find((p) => p && p.kind === item.kind && p.text === item.text && !used.has(p.id));
    let id = match?.id ?? null;
    if (!id) {
      maxId += 1;
      id = `c${maxId}`;
    }
    used.add(id);
    return { id, ...item };
  });
}

/** A new draft: the round moves on, and the title, status and DONE criteria follow the draft's sections. */
export function writeDraft(plan, markdown, { status, title } = {}) {
  plan.markdown = String(markdown ?? "").trim() + "\n";
  plan.round = (plan.round ?? 0) + 1;
  const trusted = stripUntrusted(plan.markdown);
  const declared = /^##\s+Status\s*\n+\s*(GRILLING|READY)/im.exec(trusted)?.[1]?.toLowerCase();
  plan.status = status ?? declared ?? plan.status ?? "grilling";
  const named = /^##\s+Title\s*\n+\s*(.+)$/im.exec(trusted)?.[1]?.trim();
  if (title || named) plan.title = title || named;
  const criteria = criteriaFromMarkdown(plan.markdown, plan.goal?.criteria ?? []);
  if (criteria.length) {
    plan.goal = { criteria, maxSpendUsd: Number(plan.goal?.maxSpendUsd) > 0 ? Number(plan.goal.maxSpendUsd) : 15 };
  } else if (plan.goal) {
    plan.goal = { ...plan.goal, criteria: [] };
  }
  return plan;
}

export function comment(plan, { line = null, text }) {
  const c = { id: nextCommentId(plan.comments), line: line === null ? null : Number(line), quote: line === null ? "" : (plan.markdown.split("\n")[Number(line) - 1] ?? "").trim(), text: String(text).trim(), at: now(), open: true };
  plan.comments = [...(plan.comments ?? []), c];
  return c;
}

export const openComments = (plan) => (plan.comments ?? []).filter((c) => c.open);

export const editComment = (plan, id, text) => changeComment(plan.comments, id, text, `Plan ${plan.id}`);

export function resolveComment(plan, id) {
  const c = commentById(plan.comments, id, `Plan ${plan.id}`);
  c.open = false;
  return c;
}

export function deleteComment(plan, id) {
  const c = commentById(plan.comments, id, `Plan ${plan.id}`);
  plan.comments = plan.comments.filter((x) => x !== c);
  return c;
}

export function planLine(p) {
  return `${p.id}  ${p.status.padEnd(8)} round ${p.round}  ${p.title}`;
}
