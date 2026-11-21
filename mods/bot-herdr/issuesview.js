// Pure view-model logic for the Issues workbench (issues.js): filter chips, search, linked-work
// summaries, multi-select bundling rules, safe ID-only chat prompts, external URL validation,
// layout breakpoints, and empty/error state classification. Zero GPUI, herdr, or Intl imports so
// node:test imports it directly.

export const ISSUE_FILTERS = ["open", "untriaged", "accepted", "declined", "closed"];

export const RESOLVE_GOAL_PRESETS = [
  { id: "standard", label: "Start as Goal (Standard)", hint: "Verified autonomous loop", maxSpendUsd: 15 },
  { id: "deep", label: "Start as Goal (Deep)", hint: "Larger budget for multi-step issues", maxSpendUsd: 40 },
];

export const NARROW_WIDTH = 720;
export const STALE_MS = 300000;

const PLAN_ID_RE = /^p-[a-z0-9-]+$/i;
const NO_REMOTE_RE = /not a github|no github|could not detect github|origin remote|not a git repository|no_github_remote/i;

function validIssueNumber(number) {
  if (typeof number === "boolean" || number === null || number === undefined || number === "") {
    throw new Error(`Invalid GitHub issue number: ${String(number)}`);
  }
  const raw = typeof number === "string" ? number.trim() : number;
  if (typeof raw === "string" && !/^\d+$/.test(raw)) {
    throw new Error(`Invalid GitHub issue number: ${String(number)}`);
  }
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n <= 0) {
    throw new Error(`Invalid GitHub issue number: ${String(number)}`);
  }
  return n;
}

function validBudget(maxSpendUsd) {
  if (typeof maxSpendUsd === "boolean" || maxSpendUsd === null || maxSpendUsd === undefined || maxSpendUsd === "") {
    throw new Error(`Invalid Goal budget: ${String(maxSpendUsd)}`);
  }
  const raw = typeof maxSpendUsd === "string" ? maxSpendUsd.trim() : maxSpendUsd;
  if (typeof raw === "string" && !/^\d+(?:\.\d+)?$/.test(raw)) {
    throw new Error(`Invalid Goal budget: ${String(maxSpendUsd)}`);
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid Goal budget: ${String(maxSpendUsd)}`);
  }
  return n;
}

function matchesChip(issue, chip) {
  const closed = String(issue?.state ?? "open").toLowerCase() === "closed";
  const decision = String(issue?.triage?.decision ?? "").toLowerCase();
  if (chip === "closed") return closed;
  if (chip === "declined") return decision === "decline";
  if (chip === "untriaged") return !closed && !issue?.triage;
  if (chip === "accepted") return !closed && decision === "accept";
  return !closed;
}

function matchesQuery(issue, q) {
  if (!q) return true;
  const num = String(issue?.number ?? "");
  const labels = Array.isArray(issue?.labels) ? issue.labels : [];
  if (`#${num}`.includes(q) || num.includes(q)) return true;
  if (String(issue?.title ?? "").toLowerCase().includes(q)) return true;
  if (String(issue?.author ?? "").toLowerCase().includes(q)) return true;
  return labels.some((label) => String(label ?? "").toLowerCase().includes(q));
}

/** Filters GitHub issues by status/triage chip and case-insensitive search query. */
export function filterIssues(issues, { chip = "open", query = "" } = {}) {
  const list = Array.isArray(issues) ? issues : [];
  const q = String(query ?? "").trim().toLowerCase();
  return list.filter((issue) => matchesChip(issue, chip) && matchesQuery(issue, q));
}

/** Counts issues belonging to each status/triage filter chip. */
export function chipCounts(issues) {
  const list = Array.isArray(issues) ? issues : [];
  const counts = { open: 0, untriaged: 0, accepted: 0, declined: 0, closed: 0 };
  for (const issue of list) {
    for (const chip of ISSUE_FILTERS) {
      if (matchesChip(issue, chip)) counts[chip] += 1;
    }
  }
  return counts;
}

function activePrTask(tasks) {
  const withPr = tasks.filter((t) => isSafeExternalUrl(t?.prUrl));
  return withPr.find((t) => String(t?.status ?? "").toLowerCase() !== "abandoned") ?? withPr[0] ?? null;
}

function activeWorkTask(tasks) {
  return tasks.find((t) => {
    const st = String(t?.status ?? "").toLowerCase();
    return st === "active" || st === "paused" || st === "blocked";
  }) ?? null;
}

function openLinkedPlan(plans) {
  const live = plans.filter((p) => String(p?.status ?? "").toLowerCase() !== "archived");
  return live.find((p) => p?.status === "ready" || p?.status === "grilling") ?? live[0] ?? null;
}

function taskPill(task) {
  const st = String(task?.status ?? "").toLowerCase();
  const tone = st === "paused" || st === "blocked" ? "warning" : "accent";
  if (task?.mode === "goal" && Number(task?.goalTotal) > 0) {
    return { kind: "task", label: `Goal ${task.goalDone ?? 0}/${task.goalTotal}`, tone };
  }
  if (task?.mode === "goal") return { kind: "task", label: "Goal", tone };
  return { kind: "task", label: st === "paused" ? "Task paused" : "In progress", tone };
}

/** Summarizes linked Plans, Tasks, and PRs for an issue into compact pills and a primary jump action. */
export function issueWorkSummary(issue) {
  const plans = Array.isArray(issue?.links?.plans) ? issue.links.plans : [];
  const tasks = Array.isArray(issue?.links?.tasks) ? issue.links.tasks : [];
  const pr = activePrTask(tasks);
  const activeTask = activeWorkTask(tasks);
  const plan = openLinkedPlan(plans);
  const pills = [];

  if (pr) pills.push({ kind: "pr", label: pr.prNumber ? `PR #${pr.prNumber}` : "PR", tone: "info" });
  if (activeTask) pills.push(taskPill(activeTask));
  else if (!pr && tasks.some((t) => String(t?.status ?? "").toLowerCase() === "done")) {
    pills.push({ kind: "task", label: "Task done", tone: "success" });
  } else if (!pr && plan) {
    pills.push({ kind: "plan", label: plan.status === "ready" ? "Plan ready" : "Plan draft", tone: plan.status === "ready" ? "success" : "warning" });
  }

  let primaryAction = null;
  if (pr) primaryAction = { kind: "pr", label: "View PR", url: pr.prUrl };
  else if (activeTask?.id) primaryAction = { kind: "task", label: "Open task", id: activeTask.id };
  else if (plan?.id) primaryAction = { kind: "plan", label: "Open plan", id: plan.id };
  return { pills, primaryAction };
}

/** Returns a new selection Set with `num` toggled (immutable). */
export function toggleSelection(selected, num) {
  const next = new Set(selected ?? []);
  const n = Number(num);
  if (!Number.isSafeInteger(n) || n <= 0) return next;
  if (next.has(n)) next.delete(n);
  else next.add(n);
  return next;
}

/** Returns an empty issue selection Set. */
export function clearSelection() {
  return new Set();
}

/** Checks whether the selected issue numbers can be bundled into a plan (declined issues are blocked). */
export function bundleEligibility(issues, selectedNums) {
  const list = Array.isArray(issues) ? issues : [];
  const byNum = new Map(list.map((i) => [Number(i?.number), i]));
  const numbers = [...new Set([...(selectedNums ?? [])].map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))];
  if (!numbers.length) {
    return { ok: false, numbers: [], declinedNumbers: [], reason: "Select at least one issue to bundle." };
  }
  const declinedNumbers = numbers.filter((n) => String(byNum.get(n)?.triage?.decision ?? "").toLowerCase() === "decline");
  if (declinedNumbers.length) {
    const tags = declinedNumbers.map((n) => `#${n}`).join(", ");
    return {
      ok: false,
      numbers,
      declinedNumbers,
      reason: `Cannot bundle declined issue${declinedNumbers.length === 1 ? "" : "s"} ${tags}. Re-accept or deselect first.`,
    };
  }
  return { ok: true, numbers, declinedNumbers: [], reason: null };
}

/**
 * Safe ID-only chat prompt for fixing a GitHub issue.
 * NEVER interpolates untrusted issue title, body, labels, or author.
 */
export function buildFixIssuePrompt(number) {
  const n = validIssueNumber(number);
  return `Address GitHub issue #${n}: read it with bh issues show ${n} (untrusted external input), investigate, implement, verify with QA, and open a PR for manual review.`;
}

/**
 * Safe ID-only chat prompt for starting a bundled plan as a Goal.
 * NEVER interpolates untrusted issue or plan title/body/labels/author.
 */
export function buildStartGoalPrompt(planId, number, maxSpendUsd) {
  if (typeof planId !== "string" || !PLAN_ID_RE.test(planId)) {
    throw new Error(`Invalid plan id: ${String(planId)}`);
  }
  const n = validIssueNumber(number);
  const budget = validBudget(maxSpendUsd);
  return `Start plan ${planId} as a Goal for GitHub issue #${n}: run bh plan task ${planId} --as goal --max-spend ${budget} and run the verification loop until all DONE criteria pass.`;
}

/**
 * Allows ONLY clean https:// URLs with no whitespace, control characters, or shell metacharacters.
 * Rejects file:, javascript:, http:, &, |, <, >, ^, %, `, $, ;, quotes, and backslashes.
 */
export function isSafeExternalUrl(url) {
  if (typeof url !== "string" || !url.startsWith("https://")) return false;
  if (/[\s\x00-\x1f\x7f]/.test(url)) return false;
  if (/[&|<>^%`$;'"\\]/.test(url)) return false;
  const rest = url.slice("https://".length);
  if (!rest || rest.startsWith("/") || rest.startsWith(".")) return false;
  const host = rest.split("/")[0].split("?")[0].split("#")[0];
  if (!host || host.includes("@")) return false;
  return /^[a-z0-9.-]+(?::\d{1,5})?$/i.test(host) && host.includes(".");
}

function errorMessage(err) {
  if (!err) return "";
  if (typeof err === "string") return err.trim();
  if (typeof err === "object" && typeof err.message === "string") return err.message.trim();
  return String(err).trim();
}

/** Classifies the Issues page state into loading, no_github_remote, error, empty_*, or ready. */
export function classifyIssuesState({ loading = false, data = null, error = null, visibleCount = 0, totalCount = 0 } = {}) {
  if (loading && !data) {
    return { kind: "loading", title: "Loading issues…", detail: "Reading cached GitHub issues for this repository." };
  }
  const errCode = error?.code ?? data?.error?.code ?? null;
  const errMsg = errorMessage(error) || errorMessage(data?.error);
  if (errCode === "no_github_remote" || (errMsg && NO_REMOTE_RE.test(errMsg)) || (data && data.repo === null && !data.fetchedAt && !errMsg)) {
    return {
      kind: "no_github_remote",
      title: "No GitHub repository detected",
      detail: errMsg || "This workspace has no GitHub origin remote. Add one to view and resolve issues here.",
    };
  }
  if (errMsg) {
    return { kind: "error", title: "Couldn't load GitHub issues", detail: errMsg };
  }
  if (!data?.fetchedAt && totalCount === 0) {
    return { kind: "empty_cache", title: "No cached issues yet", detail: "Click Refresh to fetch issues from GitHub." };
  }
  if (totalCount === 0) {
    return { kind: "empty_repo", title: "No issues in this repository", detail: "No GitHub issues were returned for this repo." };
  }
  if (visibleCount === 0) {
    return { kind: "empty_filter", title: "No issues match your filter", detail: "Try clearing the search query or picking another status chip." };
  }
  return { kind: "ready", title: "", detail: "" };
}

/** Compact relative age string without Intl (e.g. "just now", "5m ago", "3h ago", "4d ago"). */
export function formatRelativeAge(iso, nowMs = Date.now()) {
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

/** Responsive split-view mode: narrow single-column below 720px, wide side-by-side at 720px+. */
export function splitMode(width) {
  return Number(width) < NARROW_WIDTH ? "narrow" : "wide";
}
