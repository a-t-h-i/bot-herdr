// bh approvals: approval cards for commands an agent may not run on its own.
// Held calls live under .bot-herdr/approvals/<id>.json at the project root (shared across worktrees).
// The project allowlist lives in .bot-herdr/config.json under agents.allow.

import { randomBytes } from "node:crypto";
import { existsSync, unwatchFile, watchFile } from "node:fs";
import { join } from "node:path";
import { UsageError, listDir, need, projectRoot, readJson, store, withLock, writeJson } from "./core.mjs";
import { resilienceConfig } from "./resilience.mjs";

export const ANSWERS = ["once", "project", "deny"];
const HOLD_AUTONOMIES = new Set(["ask", "guarded"]);
const WATCH_INTERVAL_MS = 500;
const SAFE_ID = /^[\w-]+$/;

const approvalsDir = (root) => store(root, "approvals");
const approvalFile = (root, id) => join(approvalsDir(root), `${id}.json`);
const projectConfigFile = (root) => store(root, "config.json");

/** True when a local OS process with this pid is still alive. */
export function isPidAlive(pid) {
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 0) return false;
  try {
    process.kill(n, 0);
    return true;
  } catch (e) {
    return e?.code === "EPERM";
  }
}

/** Commands allowed for this project (.bot-herdr/config.json → agents.allow), [] when missing or corrupt. */
export function projectAllow(root) {
  const cfg = readJson(projectConfigFile(root), null);
  const list = cfg && typeof cfg === "object" && !Array.isArray(cfg) ? cfg.agents?.allow : null;
  if (!Array.isArray(list)) return [];
  return list.map((x) => String(x ?? "").trim()).filter(Boolean);
}

/** Appends one exact command to .bot-herdr/config.json → agents.allow under lock, deduplicated. */
export function addProjectAllow(root, command) {
  const cmd = String(command ?? "").trim();
  if (!cmd) return projectAllow(root);
  const file = projectConfigFile(root);
  return withLock(file, () => {
    const raw = readJson(file, null);
    const saved = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const agents = saved.agents && typeof saved.agents === "object" && !Array.isArray(saved.agents) ? saved.agents : {};
    const current = Array.isArray(agents.allow) ? agents.allow.map((x) => String(x ?? "").trim()).filter(Boolean) : [];
    if (!current.includes(cmd)) current.push(cmd);
    writeJson(file, { ...saved, agents: { ...agents, allow: current } });
    return current;
  });
}

/** True when a parsed JSON value is a valid pending approval record whose holder pid is alive. */
function isLivePending(rec) {
  return Boolean(
    rec
    && typeof rec === "object"
    && !Array.isArray(rec)
    && typeof rec.id === "string"
    && rec.status === "pending"
    && isPidAlive(rec.pid),
  );
}

/** Pending approval records whose pid is still alive, oldest first. Corrupt files are skipped. */
export function listHeld(root) {
  const dir = approvalsDir(root);
  return listDir(dir)
    .filter((d) => d.isFile() && d.name.endsWith(".json"))
    .map((d) => readJson(join(dir, d.name), null))
    .filter(isLivePending)
    .sort((a, b) => (Number(a.at) || 0) - (Number(b.at) || 0) || String(a.id).localeCompare(String(b.id)));
}

/** Answers a pending approval (`once`, `project`, or `deny`), updating the store and allowlist. */
export function answerApproval(root, id, answer) {
  const cleanId = String(id ?? "").trim();
  if (!ANSWERS.includes(answer)) return { ok: false, error: `Answer must be one of: ${ANSWERS.join(", ")}.` };
  if (!SAFE_ID.test(cleanId)) return { ok: false, error: `No pending approval ${id}.` };
  const file = approvalFile(root, cleanId);
  return withLock(file, () => {
    const rec = readJson(file, null);
    if (!rec || typeof rec !== "object" || Array.isArray(rec) || rec.id !== cleanId) {
      return { ok: false, error: `No pending approval ${cleanId}.` };
    }
    if (rec.status !== "pending") {
      return { ok: false, error: `Approval ${cleanId} was already answered.` };
    }
    writeJson(file, { ...rec, status: "answered", answer, answeredAt: Date.now() });
    if (answer === "project" && rec.command) addProjectAllow(root, rec.command);
    return { id: cleanId, answer, ok: true };
  });
}

/** Maps a user's approval choice onto the matching ACP permission option. */
function pickOption(answer, options) {
  const list = Array.isArray(options) ? options : [];
  if (answer === "once") return list.find((o) => o.kind === "allow_once");
  if (answer === "project") return list.find((o) => o.kind === "allow_always") ?? list.find((o) => o.kind === "allow_once");
  return list.find((o) => o.kind === "reject_once") ?? list.find((o) => o.kind === "reject_always");
}

/** Delivers the chosen ACP permission outcome and posts the Refused tool line on deny. */
function deliverAnswer(answer, { req, call, options, send, on }) {
  const pick = pickOption(answer, options);
  const outcome = pick ? { outcome: "selected", optionId: pick.optionId } : { outcome: "cancelled" };
  try {
    send({ id: req.id, result: { outcome } });
  } catch {
    // Transport already closed; watcher has already been stopped.
  }
  if (answer === "deny") {
    try {
      on?.({ kind: "tool", line: `Refused (Agent access is standard): ${call?.title ?? call?.kind ?? "a tool"}` });
    } catch {
      // Never throw out of the file watcher.
    }
  }
}

/** Marks a still-pending approval record as answered deny; ignores missing or unreadable files. */
function markDenied(file) {
  if (!existsSync(file)) return;
  try {
    withLock(file, () => {
      const rec = readJson(file, null);
      if (!rec || typeof rec !== "object" || Array.isArray(rec) || rec.status !== "pending") return;
      writeJson(file, { ...rec, status: "answered", answer: "deny", answeredAt: Date.now() });
    });
  } catch {
    // Missing, unreadable, or locked: leave the store alone and still deliver the rejection.
  }
}

const agentRole = (agent) => (typeof agent === "string" ? agent : (agent?.role ?? agent?.id ?? (process.env.BH_AGENT || null)));
const agentFrom = (from, agent) => (from ?? (typeof agent === "object" ? (agent?.name ?? agent?.id ?? null) : agent ?? null) ?? (process.env.BH_NAME || process.env.BH_AGENT || null));

/**
 * The permission hook for `session/request_permission`: holds refused calls under `ask` or
 * `guarded` autonomy (when access is not `full`), watches the record file for an answer, and
 * replies with the chosen ACP option once answered. Under `autonomous` or `full`, returns
 * `{ handled: false }` so the existing reject path runs unchanged.
 */
export function maybeHoldPermission({
  req,
  call,
  options = [],
  command = "",
  access = "standard",
  root = null,
  agent = null,
  from = null,
  task = null,
  pid = process.pid,
  autonomy = null,
  interval = WATCH_INTERVAL_MS,
  send = () => {},
  on = () => {},
  onDone = null,
}) {
  if (access === "full") return { handled: false };
  const mode = autonomy ?? resilienceConfig().autonomy;
  if (!HOLD_AUTONOMIES.has(mode)) return { handled: false };
  const dirRoot = root ?? projectRoot();
  const id = `ap-${randomBytes(4).toString("hex")}`;
  const record = {
    id,
    task: task ?? process.env.BH_TASK ?? null,
    agent: agentRole(agent),
    from: agentFrom(from, agent),
    title: String(call?.title ?? "Run a command"),
    command: String(command ?? "").trim(),
    kind: String(call?.kind ?? "execute"),
    at: Date.now(),
    pid,
    status: "pending",
    answer: null,
    answeredAt: null,
  };
  const file = approvalFile(dirRoot, id);
  writeJson(file, record);
  const cancel = watchForAnswer(file, interval, (answer) => deliverAnswer(answer, { req, call, options, send, on }), onDone);
  return { handled: true, id, file, cancel };
}

/** Watches one approval file until answered, missing, or cancelled; returns an idempotent cancel(). */
function watchForAnswer(file, interval, onAnswer, onDone) {
  let done = false;
  const unwatch = () => {
    unwatchFile(file, check);
    process.off("exit", unwatch);
  };
  const settle = (answer) => {
    if (done) return;
    done = true;
    unwatch();
    try {
      onAnswer(answer);
    } finally {
      onDone?.();
    }
  };
  const cancel = () => {
    if (done) return;
    done = true;
    unwatch();
    markDenied(file);
    try {
      onAnswer("deny");
    } finally {
      onDone?.();
    }
  };
  const check = () => {
    if (done) return;
    if (!existsSync(file)) return cancel();
    const rec = readJson(file, null);
    if (!rec || typeof rec !== "object" || Array.isArray(rec)) return cancel();
    if (rec.status !== "answered" || !ANSWERS.includes(rec.answer)) return;
    settle(rec.answer);
  };
  watchFile(file, { interval }, check);
  process.once("exit", unwatch);
  return cancel;
}

const approvalLine = (a) => `${a.id}  ${a.from ?? a.agent ?? "agent"}  ${a.title}: ${a.command}`;

/** `bh approvals list|answer <id> once|project|deny [--json]`. */
export function runApprovalsCli({ root, sub, args, flags, out }) {
  const command = sub && !String(sub).startsWith("-") ? sub : "list";
  if (command === "list") {
    const approvals = listHeld(root);
    return out(flags, { approvals }, (x) => x.approvals.map(approvalLine).join("\n") || "No pending approvals.");
  }
  if (command === "answer") {
    const id = need(args[0], "bh approvals answer <id> once|project|deny [--json]");
    const choice = need(args[1], "bh approvals answer <id> once|project|deny [--json]");
    const result = answerApproval(root, id, choice);
    if (!result.ok) process.exitCode = 1;
    return out(flags, result, (x) => (x.ok ? `Approval ${x.id}: ${x.answer}.` : x.error));
  }
  throw new UsageError("bh approvals list|answer <id> once|project|deny [--json]");
}
