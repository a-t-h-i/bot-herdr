// Unit tests for the Tasks workbench pure view helpers and static GPUI safety guards.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  DETAIL_TABS,
  STATUS_CHIPS,
  BOARD_KINDS,
  taskSummaryFallback,
  chipCounts,
  filterTasks,
  groupTasks,
  progressModel,
  gateBadge,
  allowedActionsFallback,
  stepActions,
  terminalForStep,
  detailTabCounts,
  filterBoard,
  nextRefreshAction,
  formatUsd,
  formatWorked,
  stepEventTone,
  conflictMessage,
  mutationError,
  chipForTask,
  nextOpenedOnChip,
  formatTaskSkills,
} from "../mods/bot-herdr/tasksview.js";
import { allowedActions } from "../mods/bot-herdr/engine/lib/tasks.mjs";

const modSrc = (name) => readFileSync(fileURLToPath(new URL(`../mods/bot-herdr/${name}`, import.meta.url)), "utf8");

test("constants: DETAIL_TABS, STATUS_CHIPS, BOARD_KINDS expose expected workbench keys", () => {
  assert.deepEqual(DETAIL_TABS, ["steps", "iterations", "board", "comments", "plan"]);
  assert.deepEqual(STATUS_CHIPS, ["active", "blocked", "done", "archived"]);
  assert.deepEqual(BOARD_KINDS, ["all", "contract", "decision", "blocker", "question", "done", "note"]);
});

test("taskSummaryFallback(): normalizes both lightweight --summary and full legacy payloads", () => {
  const summary = taskSummaryFallback({
    id: "t-20261121-abcd",
    title: "Fallback chains",
    status: "active",
    archived: false,
    track: "full",
    plan: "p-20261121-0001",
    created: "2026-11-21T01:00:00Z",
    updated: "2026-11-21T02:00:00Z",
    done: 3,
    total: 6,
    blocked: 1,
    openComments: 2,
    needsYou: true,
    running: true,
    activeAgents: ["dev-runner", "design-tasks"],
    spendUsd: 0.64,
    workedMs: 1440000,
    latestGate: { verdict: "pass", round: 2 },
  });
  assert.deepEqual(summary, {
    id: "t-20261121-abcd",
    title: "Fallback chains",
    status: "active",
    mode: "task",
    goal: null,
    github: null,
    archived: false,
    track: "full",
    plan: "p-20261121-0001",
    created: "2026-11-21T01:00:00Z",
    updated: "2026-11-21T02:00:00Z",
    done: 3,
    total: 6,
    blocked: 1,
    openComments: 2,
    needsYou: true,
    running: true,
    activeAgents: ["dev-runner", "design-tasks"],
    spendUsd: 0.64,
    workedMs: 1440000,
    latestGate: { verdict: "PASS", round: 2 },
  });

  const legacy = taskSummaryFallback({
    id: "t-20261121-leg1",
    title: "Legacy task",
    status: "active",
    track: "quick",
    created: "2026-11-21T01:00:00Z",
    steps: [
      { n: 1, status: "done", agent: "dev", workedMs: 300000 },
      { n: 2, status: "active", agent: "design & qa", workedMs: 600000 },
      { n: 3, status: "blocked", agent: "qa", workedMs: 0 },
      { n: 4, status: "skipped", agent: null, workedMs: 0 },
    ],
    comments: [
      { id: "c1", text: "Fix spacing", open: true },
      { id: "c2", text: "Done", open: false },
    ],
    usage: { tokens: 12000, costUsd: 0.42, minutes: 15 },
    timeMs: 900000,
    gates: [{ round: 1, verdict: "CHANGES_REQUIRED" }, { round: 2, verdict: "PASS" }],
  });
  assert.equal(legacy.done, 2);
  assert.equal(legacy.total, 4);
  assert.equal(legacy.blocked, 1);
  assert.equal(legacy.openComments, 1);
  assert.equal(legacy.needsYou, true);
  assert.equal(legacy.running, true);
  assert.deepEqual(legacy.activeAgents, ["design", "qa"]);
  assert.equal(legacy.spendUsd, 0.42);
  assert.equal(legacy.workedMs, 900000);
  assert.deepEqual(legacy.latestGate, { verdict: "PASS", round: 2 });

  const minimal = taskSummaryFallback({ id: "t-min" });
  assert.equal(minimal.title, "t-min");
  assert.equal(minimal.status, "backlog");
  assert.equal(minimal.done, 0);
  assert.equal(minimal.total, 0);
  assert.equal(minimal.latestGate, null);
});

test("chipCounts() & filterTasks(): counts and filters across all 4 chips, all, and search queries", () => {
  const tasks = [
    taskSummaryFallback({ id: "t-1", title: "Autonomous harness", status: "active", track: "full", activeAgents: ["dev-runner"] }),
    taskSummaryFallback({ id: "t-2", title: "Fix chat glitches", status: "active", blocked: 1, track: "quick", activeAgents: ["qa"] }),
    taskSummaryFallback({ id: "t-3", title: "Paused migration", status: "paused", track: "full" }),
    taskSummaryFallback({ id: "t-4", title: "Backlog polish", status: "backlog", needsYou: true }),
    taskSummaryFallback({ id: "t-5", title: "Completed retrieval", status: "done", track: "full" }),
    taskSummaryFallback({ id: "t-6", title: "Dropped experiment", status: "abandoned" }),
    taskSummaryFallback({ id: "t-7", title: "Old archived work", status: "done", archived: true, blocked: 1 }),
  ];

  assert.deepEqual(chipCounts(tasks), { active: 4, blocked: 3, done: 2, archived: 1 });

  assert.deepEqual(filterTasks(tasks, { chip: "active" }).map((t) => t.id), ["t-1", "t-2", "t-3", "t-4"]);
  assert.deepEqual(filterTasks(tasks, { chip: "blocked" }).map((t) => t.id), ["t-2", "t-3", "t-4"]);
  assert.deepEqual(filterTasks(tasks, { chip: "done" }).map((t) => t.id), ["t-5", "t-6"]);
  assert.deepEqual(filterTasks(tasks, { chip: "archived" }).map((t) => t.id), ["t-7"]);
  assert.equal(filterTasks(tasks, { chip: "all" }).length, 7);

  // Substring search by title, id, track, and activeAgents (case-insensitive).
  assert.deepEqual(filterTasks(tasks, { chip: "active", query: "HARNESS" }).map((t) => t.id), ["t-1"]);
  assert.deepEqual(filterTasks(tasks, { chip: "active", query: "t-3" }).map((t) => t.id), ["t-3"]);
  assert.deepEqual(filterTasks(tasks, { chip: "active", query: "quick" }).map((t) => t.id), ["t-2"]);
  assert.deepEqual(filterTasks(tasks, { chip: "active", query: "dev-runner" }).map((t) => t.id), ["t-1"]);
  assert.deepEqual(filterTasks(tasks, { chip: "done", query: "retrieval" }).map((t) => t.id), ["t-5"]);
});

test("groupTasks(): groups active/all cleanly and returns single group for blocked/done/archived", () => {
  const openA = taskSummaryFallback({ id: "t-1", status: "active" });
  const openB = taskSummaryFallback({ id: "t-2", status: "paused" });
  const doneA = taskSummaryFallback({ id: "t-3", status: "done" });
  const archA = taskSummaryFallback({ id: "t-4", status: "done", archived: true });

  assert.deepEqual(groupTasks([], "active"), []);

  const allGroups = groupTasks([openA, openB, doneA, archA], "all");
  assert.deepEqual(allGroups.map((g) => [g.id, g.label, g.items.length]), [
    ["open", "Under way", 2],
    ["done", "Finished", 1],
    ["archived", "Archived", 1],
  ]);

  const activeOnly = groupTasks([openA, openB], "active");
  assert.deepEqual(activeOnly.map((g) => [g.id, g.label, g.items.length]), [["open", "Under way", 2]]);

  assert.deepEqual(groupTasks([openB], "blocked").map((g) => g.label), ["Blocked"]);
  assert.deepEqual(groupTasks([doneA], "done").map((g) => g.label), ["Finished"]);
  assert.deepEqual(groupTasks([archA], "archived").map((g) => g.label), ["Archived"]);
});

test("progressModel(): computes compact bar percent, semantic tone, and fraction label", () => {
  assert.deepEqual(progressModel({ status: "active", done: 3, total: 6, blocked: 0 }), {
    done: 3, total: 6, pct: 50, tone: "accent", label: "3/6",
  });
  assert.deepEqual(progressModel({ status: "active", done: 1, total: 3, blocked: 1 }), {
    done: 1, total: 3, pct: 33, tone: "warning", label: "1/3",
  });
  assert.deepEqual(progressModel({ status: "paused", done: 2, total: 4 }), {
    done: 2, total: 4, pct: 50, tone: "warning", label: "2/4",
  });
  assert.deepEqual(progressModel({ status: "done", done: 6, total: 6 }), {
    done: 6, total: 6, pct: 100, tone: "success", label: "6/6",
  });
  assert.deepEqual(progressModel({ status: "backlog", done: 0, total: 0 }), {
    done: 0, total: 0, pct: 0, tone: "muted", label: "0/0",
  });
  assert.deepEqual(progressModel({ status: "abandoned", done: 1, total: 4 }), {
    done: 1, total: 4, pct: 25, tone: "muted", label: "1/4",
  });
});

test("gateBadge(): formats latestGate or legacy gates[] into label and tone", () => {
  assert.deepEqual(gateBadge({ latestGate: { verdict: "PASS", round: 2 } }), {
    label: "QA: PASS (r2)", tone: "success",
  });
  assert.deepEqual(gateBadge({ gates: [{ round: 1, verdict: "CHANGES_REQUIRED" }] }), {
    label: "QA: CHANGES_REQUIRED (r1)", tone: "warning",
  });
  assert.deepEqual(gateBadge({ latestGate: { verdict: "BLOCKED", round: 3 } }), {
    label: "QA: BLOCKED (r3)", tone: "danger",
  });
  assert.equal(gateBadge({ gates: [] }), null);
  assert.equal(gateBadge(null), null);
});

test("allowedActionsFallback(): prefers engine allowedActions and matches the engine across every state", () => {
  const fromEngine = allowedActionsFallback({
    status: "active",
    allowedActions: { pause: true, resume: false, done: false, verify: false, archive: false, unarchive: false, delete: false },
  });
  assert.deepEqual(fromEngine, { pause: true, resume: false, done: false, verify: false, archive: false, unarchive: false, delete: false });

  assert.deepEqual(allowedActionsFallback({ status: "active", archived: false }), {
    pause: true, resume: false, done: true, verify: false, archive: false, unarchive: false, delete: false,
  });
  assert.deepEqual(allowedActionsFallback({ status: "paused", archived: false }), {
    pause: false, resume: true, done: true, verify: false, archive: true, unarchive: false, delete: true,
  });
  assert.deepEqual(allowedActionsFallback({ status: "done", archived: true }), {
    pause: false, resume: false, done: false, verify: false, archive: false, unarchive: true, delete: true,
  });
});

test("allowedActionsFallback(): exact parity with the engine's allowedActions() for every status and archived", () => {
  for (const status of ["backlog", "active", "paused", "done", "abandoned"]) {
    for (const archived of [false, true]) {
      const task = { status, archived };
      assert.deepEqual(allowedActionsFallback(task), allowedActions(task), `${status} archived=${archived}`);
    }
  }
});

test("stepActions(): returns exact state transition buttons for every step status", () => {
  assert.deepEqual(stepActions({ status: "todo" }).map((a) => [a.label, a.to]), [
    ["Start", "start"],
    ["Mark done", "done"],
    ["Block", "block"],
    ["Skip", "skip"],
  ]);
  assert.deepEqual(stepActions({ status: "active" }).map((a) => [a.label, a.to]), [
    ["Mark done", "done"],
    ["Block", "block"],
    ["Skip", "skip"],
  ]);
  assert.deepEqual(stepActions({ status: "blocked" }).map((a) => [a.label, a.to]), [
    ["Resume", "start"],
    ["Mark done", "done"],
    ["Skip", "skip"],
  ]);
  assert.deepEqual(stepActions({ status: "done" }).map((a) => [a.label, a.to]), [["Reopen", "todo"]]);
  assert.deepEqual(stepActions({ status: "skipped" }).map((a) => [a.label, a.to]), [["Reopen", "todo"]]);
});

test("terminalForStep(): matches live terminal by child name, agentName, or agent and ignores dead ones", () => {
  const children = [
    { step: 2, name: "dev-runner", state: "open" },
    { step: 1, name: "dev-old", state: "merged" },
  ];
  const live = [
    { address: "t1", name: "dev-old", state: "gone" },
    { address: "t2", name: "dev-runner", state: "live", status: "working" },
    { address: "t3", name: "design-tasks", state: "live" },
    { id: "t4", name: "qa", state: "live" },
  ];

  // Prefers open child terminal for step 2.
  assert.deepEqual(terminalForStep({ n: 2, agent: "dev" }, children, live), { id: "t2", name: "dev-runner" });
  // Matches step.agentName.
  assert.deepEqual(terminalForStep({ n: 3, agentName: "design-tasks" }, children, live), { id: "t3", name: "design-tasks" });
  // Matches step.agent list (case-insensitive) and supports `id` fallback.
  assert.deepEqual(terminalForStep({ n: 4, agent: "Dev & QA" }, children, live), { id: "t4", name: "qa" });
  // Dead terminal is ignored.
  assert.equal(terminalForStep({ n: 1, agent: "dev-old" }, children, live), null);
  assert.equal(terminalForStep({ n: 5, agent: "unknown" }, children, live), null);
});

test("detailTabCounts() & filterBoard(): summarizes detail tabs and filters board kinds", () => {
  const detail = {
    done: 3,
    total: 6,
    plan: "p-20261121-0hfk",
    board: [
      { n: 1, kind: "contract", text: "Schema" },
      { n: 2, kind: "blocker", text: "Blocked on API" },
      { n: 3, kind: "contract", text: "CLI shape" },
      { n: 4, kind: "done", text: "Shipped" },
    ],
    comments: [
      { id: "c1", open: true, text: "Check padding" },
      { id: "c2", open: false, text: "Fixed" },
      { id: "c3", open: true, text: "Add shortcut" },
    ],
  };

  assert.deepEqual(detailTabCounts(detail), {
    stepsText: "3/6",
    isGoal: false,
    iterationsCount: 0,
    boardCount: 4,
    commentsCount: 3,
    openCommentsCount: 2,
    hasPlan: true,
  });
  assert.equal(detailTabCounts({ steps: [{ status: "done" }, { status: "todo" }] }).hasPlan, false);

  const contracts = filterBoard(detail.board, "contract");
  assert.equal(contracts.items.length, 2);
  assert.deepEqual(contracts.counts, { all: 4, contract: 2, decision: 0, blocker: 1, question: 0, done: 1, note: 0 });
  assert.equal(filterBoard(detail.board, "all").items.length, 4);
  assert.equal(filterBoard(detail.board, "question").items.length, 0);
});

test("nextRefreshAction(): queued refresh state machine never drops reloads while busy", () => {
  const s0 = { busy: false, queued: false };
  const r1 = nextRefreshAction(s0, "start");
  assert.deepEqual(r1, { state: { busy: true, queued: false }, action: "run" });

  // Reload requested while busy sets queued = true instead of dropping.
  const r2 = nextRefreshAction(r1.state, "start");
  assert.deepEqual(r2, { state: { busy: true, queued: true }, action: "defer" });

  // Multiple concurrent requests coalesce cleanly into one follow-up rerun.
  const r3 = nextRefreshAction(r2.state, "queue");
  assert.deepEqual(r3, { state: { busy: true, queued: true }, action: "defer" });

  // Finish triggers exactly one follow-up rerun.
  const r4 = nextRefreshAction(r3.state, "finish");
  assert.deepEqual(r4, { state: { busy: false, queued: false }, action: "rerun" });

  // Follow-up run finishes cleanly to idle.
  const r5 = nextRefreshAction(r4.state, "start");
  assert.equal(r5.action, "run");
  const r6 = nextRefreshAction(r5.state, "finish");
  assert.deepEqual(r6, { state: { busy: false, queued: false }, action: "idle" });
});

test("formatUsd(), formatWorked(), stepEventTone(), conflictMessage(): pure formatting and conflict detection", () => {
  assert.equal(formatUsd(0.64), "$0.64");
  assert.equal(formatUsd(0), "");
  assert.equal(formatWorked(0), "");
  assert.equal(formatWorked(30_000), "<1m");
  assert.equal(formatWorked(1_440_000), "24m");
  assert.equal(formatWorked(3_720_000), "1h 2m");

  assert.equal(stepEventTone({ kind: "check", text: "Checks passed" }), "success");
  assert.equal(stepEventTone({ kind: "check", text: "Checks failed" }), "danger");
  assert.equal(stepEventTone({ kind: "report" }), "accent");
  assert.equal(stepEventTone({ kind: "board", detail: "blocker" }), "warning");
  assert.equal(stepEventTone({ kind: "merge" }), "muted");

  assert.equal(conflictMessage({ code: 0, stdout: "" }), null);
  assert.match(conflictMessage({ code: 1, stdout: JSON.stringify({ error: "Stale write", conflict: true }), stderr: "" }), /Stale write/);
  assert.match(conflictMessage({ code: 1, stdout: "", stderr: "conflict: task updated since 2026-11-21" }), /changed elsewhere/i);
  assert.equal(conflictMessage({ code: 1, stdout: "", stderr: "network timeout" }), null);
});

test("conflictMessage()/mutationError(): only real --if-updated conflicts count, never a git 'conflict files' error", () => {
  const worktree = {
    code: 1,
    stdout: "",
    stderr: "bh: fatal: 'worktree' contains modified or conflict files\nCommit or discard its changes, then delete it again.",
  };
  assert.equal(conflictMessage(worktree), null, "a git worktree error is not a stale write");
  assert.deepEqual(mutationError(worktree), { conflict: false, message: "fatal: 'worktree' contains modified or conflict files" });

  const stale = { code: 1, stdout: JSON.stringify({ error: "Conflict: task t-1 was updated at 2026-11-21T03:00:00Z (expected 2026-11-21T02:00:00Z). Refresh and retry.", conflict: true, expected: "old", actual: "new" }), stderr: "" };
  assert.match(conflictMessage(stale), /^Conflict: task t-1 was updated at/);
  assert.deepEqual(mutationError(stale), { conflict: true, message: JSON.parse(stale.stdout).error });

  const engineText = { code: 1, stdout: "", stderr: "bh: Conflict: task t-1 was updated at 2026-11-21T03:00:00Z (expected old). Refresh and retry." };
  assert.match(conflictMessage(engineText), /changed elsewhere/i);
  assert.equal(mutationError(engineText).conflict, true);

  const failedCheck = { code: 1, stdout: "", stderr: "bh: Step 2 not marked done: the latest bh check failed (exit 1). Fix it and run bh check." };
  assert.equal(conflictMessage(failedCheck), null);
  assert.deepEqual(mutationError(failedCheck), { conflict: false, message: "Step 2 not marked done: the latest bh check failed (exit 1). Fix it and run bh check." });
  assert.deepEqual(mutationError({ code: 0, stdout: JSON.stringify({ ok: true }) }), { conflict: false, message: "" });
});

test("formatTaskSkills(): reads the real { picked, added } record and leaves out empty agents", () => {
  assert.equal(formatTaskSkills({ dev: { picked: ["docx"], added: ["pdf"] }, design: { picked: null, added: [] } }), "dev: docx, pdf");
  assert.equal(formatTaskSkills({ dev: { picked: ["docx"], added: ["docx", "pdf"] }, qa: { picked: null, added: ["audit"] } }), "dev: docx, pdf · qa: audit");
  assert.equal(formatTaskSkills({ dev: ["docx", " ", "pdf"], qa: [] }), "dev: docx, pdf", "an array value is tolerated");
  assert.equal(formatTaskSkills({}), "");
  assert.equal(formatTaskSkills(null), "");
});

test("chipForTask() & nextOpenedOnChip(): opened tasks land under their own chip and narrow chips stay put", () => {
  assert.equal(chipForTask({ status: "done", archived: false }), "done");
  assert.equal(chipForTask({ status: "abandoned", archived: false }), "done");
  assert.equal(chipForTask({ status: "done", archived: true }), "archived");
  assert.equal(chipForTask({ status: "active", archived: false }), "active");
  assert.equal(chipForTask({ status: "paused", archived: false }), "active");
  assert.equal(chipForTask(null), "active");

  const list = [{ id: "t-1" }, { id: "t-2" }];
  assert.equal(nextOpenedOnChip(list, null, false), "t-1", "desktop opens the first match");
  assert.equal(nextOpenedOnChip(list, "t-2", false), null, "desktop keeps the open task");
  assert.equal(nextOpenedOnChip(list, null, true), null, "narrow stays on the filtered list");
  assert.equal(nextOpenedOnChip(list, "t-1", true), null);
  assert.equal(nextOpenedOnChip([], null, false), null);
});

test("static GPUI guards: tasksview.js is pure and work.js obeys runtime & Tasks workbench invariants", () => {
  const pureSrc = modSrc("tasksview.js");
  assert.doesNotMatch(pureSrc, /from\s+["'](?:gpui-kit|gpui-base|herdr)["']/);
  assert.doesNotMatch(pureSrc, /\bIntl\./);

  const workSrc = modSrc("work.js");
  const forbidden = [
    { name: "Checkbox", re: /\bCheckbox\b/ },
    { name: "Intl.", re: /\bIntl\./ },
    { name: "fs.stat", re: /\bfs\.stat\b/ },
    { name: ".rotate(", re: /\.rotate\(/ },
    { name: ".transform(", re: /\.transform\(/ },
  ];
  for (const rule of forbidden) {
    assert.doesNotMatch(workSrc, rule.re, `work.js must not use forbidden API ${rule.name}`);
  }

  assert.match(workSrc, /\breloadQueued\b/);
  assert.match(workSrc, /"--summary"/);
  assert.match(workSrc, /"task",\s*"show"/);
  assert.match(workSrc, /"--if-updated"/);
  assert.doesNotMatch(workSrc, /\brenderStatusStrip\b/);
  assert.doesNotMatch(modSrc("chat.js"), /\brenderStatusStrip\b/);
  // Mutations ask for the structured payload, so a stale write is a conflict, not a guess at stderr.
  assert.match(workSrc, /actTask\(args, cx, done = null, updated = null\) \{\s*this\.run\(this\.withIfUpdated\(\[\.\.\.args, "--json"\]/);
  assert.match(workSrc, /this\.remove\(this\.withIfUpdated\(\["task", "delete", t\.id, "--json"\]/);
  // A failed mutation is kept in its own field: the list reload may not erase it.
  assert.match(workSrc, /this\.taskActionError = message \|\| null/);
  const loadFrom = workSrc.indexOf("async loadTasks(dir) {");
  assert.ok(loadFrom > 0, "loadTasks is still there");
  const loadBody = workSrc.slice(loadFrom, workSrc.indexOf("\n  /**", loadFrom));
  assert.doesNotMatch(loadBody, /this\.taskActionError\s*=/, "loadTasks() must not wipe a mutation error");
  // The chip click no longer teleports into a task on a narrow window.
  assert.match(workSrc, /nextOpenedOnChip\(next, this\.opened, this\.width < NARROW\)/);
  // A request starting with `--` rides in `--data=…` instead of being split into a flag.
  assert.match(workSrc, /bhJson\(\["task", "new", `--data=\$\{enc\(text\)\}`\]/);
  // Skills follow the real { picked, added } schema, and task-level checks are not invisible.
  assert.match(workSrc, /formatTaskSkills\(t\.skills\)/);
  assert.match(workSrc, /\.filter\(\(r\) => r\?\.step == null\)/);
  assert.match(workSrc, /this\.checkLine\(lastCheck\)/);
  // Chat's OPEN_TASK lands on the task's own chip, and unarchiving keeps a done task under Done.
  assert.match(workSrc, /this\.taskChip = chipForTask\(found\)/);
  assert.match(workSrc, /this\.taskChip = chipForTask\(\{ \.\.\.t, archived: false \}\)/);
  assert.match(workSrc, /\bopenWanted\b/);
  // The composer's Hide row belongs to the open box, not to a toast over the folded bar.
  assert.match(workSrc, /\.when\(!this\.taskComposer\.isFolded\(\),/);
  assert.doesNotMatch(workSrc, /\bresumeAsks\b/);
});
