// bh review: diff parsing and inline review comments on a task's changes.
// Comments live in .bot-herdr/tasks/<task>/review.json and route to Dev via the task board.

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { UsageError, bodyText, need, readJson, store, withLock, writeJson } from "./core.mjs";
import * as T from "./tasks.mjs";
import { taskBase } from "./thread.mjs";

export const MAX_DIFF_LINES = 2000;
const HUNK_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

const reviewFile = (root, taskId) => join(store(root, "tasks", taskId), "review.json");

/** Parses a git unified diff into hunks with add/del/ctx lines and old/new line numbers. */
export function parseUnifiedDiff(raw, maxLines = MAX_DIFF_LINES) {
  const hunks = [];
  let current = null;
  let oldLine = 0;
  let newLine = 0;
  let emitted = 0;
  let truncated = false;
  const rawLines = String(raw ?? "").split("\n");
  if (rawLines.length && rawLines[rawLines.length - 1] === "") rawLines.pop();
  for (const entry of rawLines) {
    const line = entry.replace(/\r$/, "");
    const header = HUNK_RE.exec(line);
    if (header) {
      if (emitted >= maxLines) { truncated = true; break; }
      oldLine = Number(header[1]);
      newLine = Number(header[2]);
      current = { header: line, lines: [] };
      hunks.push(current);
      continue;
    }
    if (!current || line.startsWith("\\")) continue;
    const parsed = parseHunkLine(line, oldLine, newLine);
    if (!parsed) continue;
    if (emitted >= maxLines) { truncated = true; break; }
    oldLine = parsed.nextOld;
    newLine = parsed.nextNew;
    current.lines.push(parsed.item);
    emitted++;
  }
  return { truncated, hunks: hunks.filter((h) => h.lines.length > 0) };
}

/** Converts one body line inside a unified diff hunk into its contract item and updated counters. */
function parseHunkLine(line, oldLine, newLine) {
  const prefix = line[0];
  if (prefix === "+") return { item: { kind: "add", old: null, new: newLine, text: line.slice(1) }, nextOld: oldLine, nextNew: newLine + 1 };
  if (prefix === "-") return { item: { kind: "del", old: oldLine, new: null, text: line.slice(1) }, nextOld: oldLine + 1, nextNew: newLine };
  if (prefix === " ") return { item: { kind: "ctx", old: oldLine, new: newLine, text: line.slice(1) }, nextOld: oldLine + 1, nextNew: newLine + 1 };
  return null;
}

/** Diff for one file against the task's base commit (same base as changesOf), capped at 2000 lines. */
export function diffFile(root, taskId, filePath, { maxLines = MAX_DIFF_LINES } = {}) {
  const task = T.loadTask(root, taskId);
  const path = String(filePath ?? "").trim();
  const { base, cwd } = taskBase(root, task);
  if (!base || !cwd || !path) return { path, truncated: false, hunks: [] };
  const r = spawnSync("git", ["diff", "--no-color", "-U3", base, "--", path], {
    cwd,
    encoding: "utf8",
    timeout: 30000,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error || r.status !== 0) return { path, truncated: false, hunks: [] };
  const { truncated, hunks } = parseUnifiedDiff(r.stdout ?? "", maxLines);
  return { path, truncated, hunks };
}

/** Reads valid comments from review.json, sorted oldest first. Corrupt or missing files return []. */
function readComments(file) {
  const saved = readJson(file, null);
  const raw = Array.isArray(saved?.comments) ? saved.comments : [];
  return raw
    .filter((c) => c && typeof c === "object" && !Array.isArray(c) && typeof c.id === "string")
    .sort((a, b) => (Number(a.at) || 0) - (Number(b.at) || 0) || String(a.id).localeCompare(String(b.id)));
}

/** All review comments for a task, oldest first. */
export function listComments(root, taskId) {
  const task = T.loadTask(root, taskId);
  return { comments: readComments(reviewFile(root, task.id)) };
}

/** Adds one open review comment anchored to `<path>:<line>` on the new side. */
export function addComment(root, taskId, { path, line, text }) {
  const task = T.loadTask(root, taskId);
  const cleanPath = String(path ?? "").trim();
  const lineNum = Number(line);
  const cleanText = String(text ?? "").trim();
  if (!cleanPath) throw new UsageError('bh review add <task> <path> <line> "<text>" [--json]');
  if (!Number.isInteger(lineNum) || lineNum < 1) throw new UsageError("line must be a positive integer.");
  if (!cleanText) throw new UsageError('bh review add <task> <path> <line> "<text>" [--json]');
  const file = reviewFile(root, task.id);
  return withLock(file, () => {
    const comments = readComments(file);
    const created = { id: `rc-${randomBytes(4).toString("hex")}`, at: Date.now(), path: cleanPath, line: lineNum, text: cleanText, state: "open" };
    comments.push(created);
    writeJson(file, { comments });
    return created;
  });
}

/** Removes one review comment by id. */
export function removeComment(root, taskId, id) {
  const task = T.loadTask(root, taskId);
  const target = String(id ?? "").trim();
  const file = reviewFile(root, task.id);
  return withLock(file, () => {
    const comments = readComments(file).filter((c) => c.id !== target);
    writeJson(file, { comments });
    return { ok: true };
  });
}

/** Posts all open review comments as one board note to Dev and marks them sent. */
export function sendComments(root, taskId) {
  const task = T.loadTask(root, taskId);
  const file = reviewFile(root, task.id);
  return withLock(file, () => {
    const comments = readComments(file);
    const open = comments.filter((c) => c.state === "open");
    if (!open.length) return { sent: 0, entry: null };
    const text = `Review comments:\n${open.map((c) => `- ${c.path}:${c.line} — ${c.text}`).join("\n")}`;
    const entry = T.post(root, task.id, { kind: "note", from: "user", to: "dev", text });
    const sentIds = new Set(open.map((c) => c.id));
    const next = comments.map((c) => (sentIds.has(c.id) ? { ...c, state: "sent" } : c));
    writeJson(file, { comments: next });
    return { sent: open.length, entry: entry.n };
  });
}

const commentLine = (c) => `${c.id}  [${c.state}]  ${c.path}:${c.line} — ${c.text}`;

/** `bh review diff|list|add|remove|send <task> […] [--json]`. */
export function runReviewCli({ root, sub, args, flags, out }) {
  if (sub === "diff") {
    const taskId = need(args[0], "bh review diff <task> <path> [--json]");
    const filePath = need(args[1], "bh review diff <task> <path> [--json]");
    const res = diffFile(root, taskId, filePath);
    return out(flags, res, (x) => `${x.path}: ${x.hunks.length} hunk${x.hunks.length === 1 ? "" : "s"}${x.truncated ? " (truncated)" : ""}`);
  }
  if (sub === "list") {
    const taskId = need(args[0], "bh review list <task> [--json]");
    const res = listComments(root, taskId);
    return out(flags, res, (x) => x.comments.map(commentLine).join("\n") || "No review comments.");
  }
  if (sub === "add") {
    const taskId = need(args[0], 'bh review add <task> <path> <line> "<text>" [--json]');
    const filePath = need(args[1], 'bh review add <task> <path> <line> "<text>" [--json]');
    const line = need(args[2], 'bh review add <task> <path> <line> "<text>" [--json]');
    const text = need(bodyText(flags, args.slice(3)), 'bh review add <task> <path> <line> "<text>" [--json]');
    const created = addComment(root, taskId, { path: filePath, line, text });
    return out(flags, created, commentLine);
  }
  if (sub === "remove") {
    const taskId = need(args[0], "bh review remove <task> <id> [--json]");
    const id = need(args[1], "bh review remove <task> <id> [--json]");
    const res = removeComment(root, taskId, id);
    return out(flags, res, () => `Removed comment ${id}.`);
  }
  if (sub === "send") {
    const taskId = need(args[0], "bh review send <task> [--json]");
    const res = sendComments(root, taskId);
    return out(flags, res, (x) => (x.sent ? `Sent ${x.sent} review comment${x.sent === 1 ? "" : "s"} to Dev (board #${x.entry}).` : "No open review comments."));
  }
  throw new UsageError('bh review diff|list|add|remove|send <task> […] [--json]');
}
