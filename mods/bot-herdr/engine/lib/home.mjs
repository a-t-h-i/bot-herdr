// bh home: the redesign's Home page in one payload — what needs the user first, then every thread
// in review, the running fleet and today's spend. It reads the same stores as the Thread read
// model plus the question, approval and issue caches, and never reaches the network: a GitHub
// issue reaches Home from the local cache only. A badge missing from a store draws nothing.

import { join } from "node:path";
import { HEADLESS, findAgent } from "../../roster.js";
import { DATA, UsageError, listDir, readJson, readJsonl, store } from "./core.mjs";
import { fileKey } from "./agent.mjs";
import * as AP from "./approvals.mjs";
import * as GH from "./github.mjs";
import * as MX from "./metrics.mjs";
import * as Q from "./ask.mjs";
import * as T from "./tasks.mjs";
import { team } from "./team.mjs";
import { compactNumber, liveTerminals, logSkipped, oneLine, threadLine, listThreads } from "./thread.mjs";

const asList = (value) => (Array.isArray(value) ? value : []);

/** The programs herdr shows for a harness: a terminal running one of them is an agent. */
const AGENT_APPS = new Set(Object.values(HEADLESS).map((h) => h.app));

/** A terminal that is an agent: bot-herdr named it, or it runs a harness bot-herdr can start. */
const isAgentTerminal = (t) => Boolean(t.name) || AGENT_APPS.has(t.agent);

/** What needs you ranks above everything else: questions, blockers, reviews, approvals, issues. */
const NEED_RANK = { question: 0, blocker: 1, review: 2, approval: 3, issue: 4 };

/** The question sets the user has not answered yet, for this project (a task worktree reads its own). */
function openAskQuestions(root) {
  try {
    const project = Q.canonicalProjectDir(root);
    return Q.openQuestions().filter((q) => !q.cwd || Q.canonicalProjectDir(q.cwd) === project);
  } catch (e) {
    logSkipped("home", "questions", e);
    return [];
  }
}

/** Every thread's own needs-you items, each naming the thread it belongs to. */
function threadNeeds(threads) {
  return threads.flatMap((t) => t.needs.map((n) => ({ ...n, thread: t.id, title: t.title })));
}

/** A thread in the review state is a QA review on Home: one item, naming the thread it is on. */
function reviewNeeds(threads) {
  return threads
    .filter((t) => t.state === "review")
    .map((t) => ({ kind: "review", thread: t.id, ref: t.activeAgents[0] ?? null, title: t.title, text: t.summary.text, from: null, at: t.updated ?? null }));
}

/** One item per unanswered `bh ask` question set. */
function questionNeeds(questions) {
  return questions.map((q) => ({
    kind: "question",
    thread: q.plan ?? null,
    ref: q.id,
    title: q.title ?? "Question",
    text: oneLine(q.questions?.[0]?.text ?? q.title ?? "A question waits for you", 160),
    from: q.fromName ?? q.from ?? null,
    at: q.created ?? null,
  }));
}

/** Held approval cards: the approvals module's own list once it has one (M6), else nothing. */
function approvalNeeds(root) {
  if (typeof AP.listHeld !== "function") return [];
  try {
    return asList(AP.listHeld(root)).map((a) => ({
      kind: "approval",
      thread: a.task ?? null,
      ref: a.id ?? null,
      title: a.title ?? "An approval waits",
      text: oneLine(a.text ?? a.command ?? "An agent needs your answer", 160),
      from: a.from ?? a.agent ?? null,
      at: a.at ?? null,
    }));
  } catch (e) {
    logSkipped("home", "approvals", e);
    return [];
  }
}

/** Untriaged GitHub issues, from the local cache only: Home never makes a request. */
function issueNeeds(root) {
  try {
    const cache = GH.readCache(root) ?? {};
    const triage = GH.readTriage(root) ?? {};
    return asList(cache.issues)
      .filter((issue) => String(issue.state ?? "open").toLowerCase() === "open" && !(triage[String(issue.number)] ?? issue.triage))
      .slice(0, 20)
      .map((issue) => ({
        kind: "issue",
        thread: null,
        ref: `#${issue.number}`,
        title: `#${issue.number} ${issue.title ?? ""}`.trim(),
        text: oneLine(issue.title ?? "An untriaged issue", 160),
        from: issue.author ?? null,
        at: issue.updatedAt ?? issue.createdAt ?? null,
      }));
  } catch (e) {
    logSkipped("home", "issues", e);
    return [];
  }
}

/** Needs-you items ranked by kind, newest first inside a kind: what a person should look at first. */
export function rankNeeds(items) {
  return items
    .filter((item) => item.text)
    .sort((a, b) => (NEED_RANK[a.kind] ?? 9) - (NEED_RANK[b.kind] ?? 9) || String(b.at ?? "").localeCompare(String(a.at ?? "")));
}

/** The thread a live terminal is working on: its worktree's folder, else nothing. */
function taskOf(terminal, threads) {
  const cwd = String(terminal.cwd ?? "").replace(/\\/g, "/");
  if (!cwd) return null;
  return threads.find((t) => t.path && cwd.startsWith(String(t.path).replace(/\\/g, "/")))?.id ?? null;
}

/** A terminal's readable name: its spawn name, else its herdr tab's title (not a bare number), else its address. */
export function terminalName(t) {
  if (typeof t.name === "string" && t.name.trim()) return t.name;
  const where = String(t.where ?? "");
  const tab = where.slice(where.lastIndexOf(" / ") + 3).trim();
  return where.includes(" / ") && tab && !/^\d+$/.test(tab) ? tab : t.address;
}

/** The roster role a name maps to ("design-comments" → "design", "Orchestrator" → "orchestrator"), else null. */
export function roleOfName(name, agents = team().agents) {
  const word = String(name ?? "").toLowerCase();
  return (findAgent(agents, word) ?? findAgent(agents, word.replace(/-[^-]+$/, "")))?.role ?? null;
}

/** The agents running now: who, what they are doing, and which thread it belongs to. */
export function fleetAgents(terminals, threads, needsYou = []) {
  const needed = new Set(needsYou.map((n) => String(n.from ?? "").toLowerCase()).filter(Boolean));
  const agents = team().agents;
  return terminals
    .filter((t) => t.state === "live" && isAgentTerminal(t))
    .map((t) => {
      const name = terminalName(t);
      const activity = readJson(join(DATA, "activity", `${fileKey(t.address)}.json`), null);
      const state = needed.has(String(name).toLowerCase()) ? "needsYou" : t.status === "working" ? "working" : "idle";
      return {
        name: String(name),
        address: t.address,
        harness: t.agent ?? null,
        role: roleOfName(name, agents),
        state,
        status: t.status ?? null,
        summary: activity?.line ? oneLine(activity.line) : state === "working" ? "Working" : state === "needsYou" ? "Needs you" : "Idle",
        at: activity?.at ?? null,
        task: taskOf(t, threads),
        cwd: t.cwd ?? null,
      };
    })
    .sort((a, b) => (a.state === b.state ? a.name.localeCompare(b.name) : a.state === "working" ? -1 : b.state === "working" ? 1 : 0));
}

/** The Goals still in play, with the progress the goal row shows and what each has spent. */
export function runningGoals(threads, root) {
  return threads
    .filter((t) => t.goal && ["running", "waiting"].includes(t.goal.status))
    .map((t) => ({
      task: t.id,
      title: t.title,
      status: t.goal.status,
      state: t.state,
      passed: t.goal.passed,
      total: t.goal.total,
      iteration: t.goal.iteration,
      maxSpendUsd: t.goal.maxSpendUsd,
      spendUsd: T.usageTotals(T.usageOf(root, t.id)).costUsd,
      summary: t.summary.text,
    }));
}

/** The turns recorded on the project's tasks, which an older agent or a moved app home may miss. */
function projectUsage(root) {
  const dir = store(root, "tasks");
  return listDir(dir).filter((d) => d.isDirectory()).flatMap((d) => readJsonl(join(dir, d.name, "usage.jsonl")));
}

/** Today's spend across the fleet: the agent terminals' turns and the tasks' own, each turn once. */
export function todaySpend(at = new Date(), root = null) {
  const from = MX.windowOf("today", at).from?.toISOString() ?? null;
  const records = MX.dedupe([
    ...listDir(join(DATA, "usage")).filter((d) => d.isFile() && d.name.endsWith(".jsonl")).flatMap((d) => readJsonl(join(DATA, "usage", d.name))),
    ...(root ? projectUsage(root) : []),
  ]).filter((r) => r && (!from || String(r.at ?? "") >= from));
  const totals = T.usageTotals(records);
  return { window: "today", turns: records.length, costUsd: totals.costUsd, tokens: totals.tokens, minutes: totals.minutes };
}

/** "3 running · 1 needs you": a count of zero is not drawn, and each part pluralises. */
export function headerText(running, needs) {
  const parts = [];
  if (running) parts.push(`${running} running`);
  if (needs) parts.push(`${needs} need${needs === 1 ? "s" : ""} you`);
  return parts.join(" · ") || "All quiet";
}

/** The Home payload: needs you, then review, then the fleet, then today's spend. */
export function homeData(root, { at = new Date(), terminals = null } = {}) {
  const millis = at.getTime();
  const live = terminals ?? liveTerminals();
  const { threads, skipped } = listThreads(root, { at: millis, terminals: live });
  const questions = openAskQuestions(root);
  const needsYou = rankNeeds([...threadNeeds(threads), ...reviewNeeds(threads), ...questionNeeds(questions), ...approvalNeeds(root), ...issueNeeds(root)]);
  const fleet = { agents: fleetAgents(live, threads, needsYou), goals: runningGoals(threads, root) };
  const running = fleet.agents.filter((agent) => agent.state === "working").length;
  return {
    command: "home",
    at: new Date(millis).toISOString(),
    header: { running, needsYou: needsYou.length, text: headerText(running, needsYou.length) },
    needsYou,
    review: threads.filter((t) => t.state === "review"),
    fleet,
    spendToday: todaySpend(at, root),
    skipped,
  };
}

const needLine = (n) => `◆ ${n.kind}  ${n.thread ? `${n.thread}  ` : ""}${n.text}${n.ref ? ` (${n.ref})` : ""}`;

const fleetLine = (a) => `${a.state === "working" ? "●" : a.state === "needsYou" ? "◆" : "○"} ${a.name} (${a.harness ?? "agent"}) — ${a.summary}${a.task ? ` · ${a.task}` : ""}`;

const goalLine = (g) => `◎ ${g.task} ${g.title} — ${g.passed}/${g.total} DONE · iter ${g.iteration} · $${Number(g.spendUsd ?? 0).toFixed(2)}${g.summary ? ` — ${g.summary}` : ""}`;

function homeText(home) {
  const lines = [home.header.text];
  if (home.needsYou.length) lines.push("", "## Needs you", ...home.needsYou.slice(0, 10).map(needLine));
  if (home.review.length) lines.push("", "## Review", ...home.review.map(threadLine));
  if (home.fleet.agents.length) lines.push("", "## Fleet", ...home.fleet.agents.map(fleetLine));
  if (home.fleet.goals.length) lines.push("", "## Goals", ...home.fleet.goals.map(goalLine));
  lines.push("", `Today: $${Number(home.spendToday.costUsd ?? 0).toFixed(2)} · ${compactNumber(home.spendToday.tokens)} tokens`);
  return lines.join("\n");
}

/** `bh home [--json]`. */
export function runHomeCli({ root, sub, flags, out }) {
  if (sub && !String(sub).startsWith("-")) throw new UsageError("bh home [--json]");
  return out(flags, homeData(root), homeText);
}
