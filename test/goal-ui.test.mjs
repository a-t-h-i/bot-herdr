// Step 5 UI pure view-model & GPUI static guard tests: Goal row/detail view-models, Start menu
// presets, Settings General & Resilience responsive 2-column grid breakpoint, zero global banners,
// and GPUI runtime invariants across work.js, plandoc.js, pages.js, settings.js, tasksview.js.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TV = await import(new URL("../mods/bot-herdr/tasksview.js", import.meta.url));

test("taskSummaryFallback, goalProgressModel, goalCriterionBadge, and detailTabCounts model Goal and GitHub metadata", () => {
  const raw = {
    id: "t-20261121-abcd",
    title: "Goal with issues",
    status: "active",
    mode: "goal",
    goal: {
      status: "running",
      iteration: 3,
      maxSpendUsd: 15,
      criteria: [
        { id: "c1", kind: "check", text: "bh check", verdict: "PASS" },
        { id: "c2", kind: "command", text: "node test", verdict: "FAIL", evidence: "exit 1" },
        { id: "c3", kind: "qa", text: "UX clean", verdict: "PENDING" },
      ],
      pendingAmendment: null,
    },
    github: { repo: "acme/app", issues: [{ number: 12 }, { number: 15 }], prNumber: 42, prUrl: "https://github.com/acme/app/pull/42" },
    iterations: [{ n: 1 }, { n: 2 }, { n: 3 }],
    steps: [{ n: 1, title: "Step 1", status: "active" }],
    plan: "p-20261121-1234",
  };

  const sum = TV.taskSummaryFallback(raw);
  assert.equal(sum.mode, "goal");
  assert.equal(sum.goal.done, 1);
  assert.equal(sum.goal.total, 3);
  assert.equal(sum.goal.iteration, 3);
  assert.deepEqual(sum.github.issues, [12, 15]);
  assert.equal(sum.github.prNumber, 42);

  const prog = TV.goalProgressModel(raw);
  assert.equal(prog.isGoal, true);
  assert.equal(prog.pct, 33);
  assert.equal(prog.label, "1/3 DONE · iter 3");
  assert.equal(prog.tone, "accent");

  assert.equal(TV.goalCriterionBadge({ verdict: "PASS" }).icon, "✓");
  assert.equal(TV.goalCriterionBadge({ verdict: "PENDING" }).icon, "…");
  assert.equal(TV.goalCriterionBadge({ verdict: "FAIL" }).icon, "✗");

  const tabs = TV.detailTabCounts(raw);
  assert.equal(tabs.isGoal, true);
  assert.equal(tabs.iterationsCount, 3);
  assert.equal(tabs.hasPlan, true);
});

test("allowedActionsFallback matches Goal done-lock and verify availability", () => {
  const runningGoal = { status: "active", mode: "goal", goal: { status: "running" } };
  const acts1 = TV.allowedActionsFallback(runningGoal);
  assert.equal(acts1.verify, true);
  assert.equal(acts1.done, false);

  const reachedGoal = { status: "active", mode: "goal", goal: { status: "reached" } };
  const acts2 = TV.allowedActionsFallback(reachedGoal);
  assert.equal(acts2.verify, true);
  assert.equal(acts2.done, true);

  const simpleTask = { status: "active", mode: "task" };
  const acts3 = TV.allowedActionsFallback(simpleTask);
  assert.equal(acts3.verify, false);
  assert.equal(acts3.done, true);
});

test("settingsGridColumns switches cleanly between 2 columns (>= 860px) and 1 column (< 860px)", () => {
  assert.equal(TV.settingsGridColumns(1140), 2);
  assert.equal(TV.settingsGridColumns(860), 2);
  assert.equal(TV.settingsGridColumns(859), 1);
  assert.equal(TV.settingsGridColumns(600), 1);
  assert.deepEqual(TV.GOAL_START_PRESETS.map((p) => p.maxSpendUsd), [15, 40]);
});

test("GPUI static guards: no forbidden APIs, zero global top banners, Settings 2-column grids, and Goal UI hooks wired", () => {
  const uiFiles = ["work.js", "plandoc.js", "pages.js", "settings.js", "tasksview.js", "issues.js", "issuesview.js"];
  for (const name of uiFiles) {
    const src = readFileSync(join(ROOT, "mods", "bot-herdr", name), "utf8");
    const codeOnly = src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(codeOnly, /\bCheckbox\b/, `${name}: GPUI Checkbox is unsupported`);
    assert.doesNotMatch(codeOnly, /\bIntl\b/, `${name}: Intl is unavailable in QuickJS/GPUI`);
    assert.doesNotMatch(codeOnly, /\bfs\.stat\b/, `${name}: fs.stat is unsupported`);
    assert.doesNotMatch(codeOnly, /\.(?:rotate|transform)\s*\(/, `${name}: .rotate/.transform unsupported in GPUI`);
  }

  const workSrc = readFileSync(join(ROOT, "mods", "bot-herdr", "work.js"), "utf8");
  const chatSrc = readFileSync(join(ROOT, "mods", "bot-herdr", "chat.js"), "utf8");
  assert.doesNotMatch(workSrc, /statusstrip\.js|StatusStrip/, "work.js must have zero global top status banners");
  assert.doesNotMatch(chatSrc, /statusstrip\.js|StatusStrip/, "chat.js must have zero global top status banners");
  assert.match(workSrc, /goalCriteriaStrip/);
  assert.match(workSrc, /taskIterationsTab/);
  assert.match(workSrc, /approve-amend/);
  assert.match(workSrc, /reject-amend/);
  assert.match(workSrc, /wakeGoal/);

  const settingsSrc = readFileSync(join(ROOT, "mods", "bot-herdr", "settings.js"), "utf8");
  assert.match(settingsSrc, /bh-general-grid/);
  assert.match(settingsSrc, /bh-resilience-grid/);
  assert.match(settingsSrc, /settingsGridColumns/);

  const planDocSrc = readFileSync(join(ROOT, "mods", "bot-herdr", "plandoc.js"), "utf8");
  assert.match(planDocSrc, /startMenuTrigger/);
  assert.match(planDocSrc, /startMenuPanel/);
  assert.match(planDocSrc, /issueChips/);
  assert.match(planDocSrc, /doneSection/);
});
