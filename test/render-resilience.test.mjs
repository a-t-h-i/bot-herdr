// Fuzz and contract tests for Non-negotiable #1 ("Renders never throw"):
// covers render-safe.js (safeInit, safeRender, formatRenderError, isInterruptError, errorSignature),
// static invariants on main.js + render-safe.js, and corrupt/legacy fixtures passed through the
// pure view-model modules under safeRender.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  safeInit,
  safeRender,
  formatRenderError,
  isInterruptError,
  errorSignature,
} from "../mods/bot-herdr/render-safe.js";
import * as feed from "../mods/bot-herdr/feed.js";
import * as tasksview from "../mods/bot-herdr/tasksview.js";
import * as issuesview from "../mods/bot-herdr/issuesview.js";
import * as learningview from "../mods/bot-herdr/learningview.js";
import * as metricsview from "../mods/bot-herdr/metricsview.js";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function makeCircular() {
  const obj = { code: "E_CIRCULAR", nested: {} };
  obj.self = obj;
  obj.nested.back = obj;
  return obj;
}

function makeHostileObject() {
  return {
    get message() {
      throw new Error("hostile message getter");
    },
    get stack() {
      throw new Error("hostile stack getter");
    },
    toJSON() {
      throw new Error("hostile toJSON");
    },
    toString() {
      throw new Error("hostile toString");
    },
  };
}

function assertErrorRecord(rec, expectedPhase, expectedView) {
  assert.ok(rec && typeof rec === "object", "error record must be an object");
  assert.equal(rec.phase, expectedPhase);
  if (expectedView) assert.equal(rec.view, expectedView);
  assert.equal(typeof rec.at, "string");
  assert.ok(Number.isFinite(Date.parse(rec.at)), "at must be an ISO timestamp");
  assert.equal(typeof rec.title, "string");
  assert.ok(rec.title.length > 0, "title must be non-empty");
  assert.equal(typeof rec.message, "string");
  assert.ok(rec.message.length > 0, "message must be non-empty");
  assert.equal(typeof rec.detail, "string");
  assert.ok(rec.detail.length > 0, "detail must be non-empty");
  assert.ok(!/[\r\n]/.test(rec.detail), "detail must be folded to a single line");
  assert.equal(typeof rec.stack, "string");
  assert.equal(typeof rec.interrupted, "boolean");
}

test("static contracts: zero hardcoded hex literals and pure render-safe.js imports", () => {
  const mainSrc = readFileSync(join(ROOT, "mods", "bot-herdr", "main.js"), "utf8");
  const safeSrc = readFileSync(join(ROOT, "mods", "bot-herdr", "render-safe.js"), "utf8");
  const hexRe = /#[0-9a-fA-F]{3,8}\b/;

  assert.equal(hexRe.test(mainSrc), false, "main.js must contain zero hardcoded hex colours");
  assert.equal(hexRe.test(safeSrc), false, "render-safe.js must contain zero hardcoded hex colours");
  assert.equal(/from\s+["'](?:gpui-kit|gpui-base|herdr)["']/.test(safeSrc), false, "render-safe.js must have zero GPUI/herdr imports");
  assert.match(mainSrc, /export\s+const\s+VIEWS\b/, "main.js must export VIEWS");
  assert.match(mainSrc, /export\s+class\s+BotHerdr\b/, "main.js must export BotHerdr");
  assert.match(mainSrc, /export\s+default\s+BotHerdr\b/, "main.js must default-export BotHerdr");
});

test("isInterruptError classifies QuickJS interrupt errors without throwing on hostile inputs", () => {
  assert.equal(isInterruptError(new Error("interrupted")), true);
  assert.equal(isInterruptError(new Error("  Interrupted  ")), true);
  assert.equal(isInterruptError("interrupted"), true);
  assert.equal(isInterruptError({ message: "interrupted" }), true);

  for (const nonInterrupt of [
    new Error("something else"),
    new Error("interrupted by user"),
    "",
    "normal error",
    null,
    undefined,
    0,
    42,
    false,
    Symbol("interrupted"),
    Object.create(null),
    makeCircular(),
    makeHostileObject(),
  ]) {
    assert.equal(isInterruptError(nonInterrupt), false);
  }
});

test("formatRenderError normalises every throwable shape into a structured single-line fallback", () => {
  const nullProto = Object.create(null);
  nullProto.kind = "null-proto";

  const cases = [
    new Error("Cannot read properties of undefined\n  at brokenView"),
    new TypeError("   "),
    "raw string failure\nsecond line\t\twith tabs",
    "x".repeat(400),
    "",
    null,
    undefined,
    0,
    42,
    NaN,
    false,
    12345678901234567890n,
    Symbol("boom"),
    function namedFn() {},
    { reason: "bad payload", nested: { big: 9n, sym: Symbol("s") } },
    makeCircular(),
    nullProto,
    makeHostileObject(),
  ];

  for (const payload of cases) {
    const rec = formatRenderError(payload, { view: "work", phase: "render" });
    assertErrorRecord(rec, "render", "work");
    assert.equal(rec.interrupted, false);
    assert.ok(rec.detail.length <= 200, `detail exceeded fold cap: ${rec.detail.length}`);
  }

  const interruptRec = formatRenderError(new Error("interrupted"), { view: "chat", phase: "render" });
  assertErrorRecord(interruptRec, "render", "chat");
  assert.equal(interruptRec.interrupted, true);
  assert.match(interruptRec.title, /paused/i);

  // Hostile options must not throw either.
  for (const badOpts of [null, undefined, 42, "bad", makeHostileObject()]) {
    const rec = formatRenderError(new Error("boom"), badOpts);
    assertErrorRecord(rec, "render", "unknown");
  }
});

test("safeInit handles happy path, arbitrary throws, non-function factories, and throwing loggers", () => {
  const okPage = { initDone: true, render: () => "ok" };
  const ok = safeInit((p, cx) => ({ ...okPage, p, cx }), { view: "chat" }, { id: "cx" });
  assert.equal(ok.error, null);
  assert.equal(ok.page.initDone, true);
  assert.equal(ok.page.p.view, "chat");

  const hostileThrows = [
    new Error("init exploded"),
    new Error("interrupted"),
    "init string throw",
    null,
    undefined,
    makeCircular(),
    makeHostileObject(),
    Symbol("init-sym"),
  ];

  for (const thrown of hostileThrows) {
    const seen = [];
    const res = safeInit(() => {
      throw thrown;
    }, { view: "settings" }, {}, { onError: (rec) => seen.push(rec) });
    assert.equal(res.page, null);
    assertErrorRecord(res.error, "init", "settings");
    assert.equal(seen.length, 1);
    assert.equal(seen[0].message, res.error.message);
  }

  // Non-function factories and throwing onError callbacks must never throw.
  for (const badFactory of [null, undefined, {}, "Chat", 123]) {
    const res = safeInit(badFactory, makeHostileObject(), null, {
      onError() {
        throw new Error("logger crashed");
      },
    });
    assert.equal(res.page, null);
    assertErrorRecord(res.error, "init", "unknown");
  }
});

test("safeRender handles happy path, missing page/render, null element returns, and arbitrary throws", () => {
  const ok = safeRender({ render: (cx) => ({ tag: "div", cx }) }, { ok: true }, { view: "chat" });
  assert.equal(ok.error, null);
  assert.deepEqual(ok.node, { tag: "div", cx: { ok: true } });

  // Missing page, missing render method, or null/undefined return value.
  for (const badPage of [null, undefined, 42, {}, { render: "nope" }, { render: () => null }, { render: () => undefined }]) {
    const res = safeRender(badPage, {}, { view: "metrics" });
    assert.equal(res.node, null);
    assertErrorRecord(res.error, "render", "metrics");
  }

  // Arbitrary throws inside page.render, including QuickJS interrupt and circular payloads.
  const payloads = [
    new Error("render crash"),
    new Error("interrupted"),
    "render string error",
    null,
    undefined,
    makeCircular(),
    makeHostileObject(),
  ];
  for (const payload of payloads) {
    const logged = [];
    const res = safeRender({
      render() {
        throw payload;
      },
    }, {}, {
      view: "issues",
      onError(rec) {
        logged.push(rec);
        throw new Error("nested logger throw");
      },
    });
    assert.equal(res.node, null);
    assertErrorRecord(res.error, "render", "issues");
    assert.equal(logged.length, 1);
  }

  // Deduplication signature distinguishes view/phase/message cleanly.
  const a = formatRenderError(new Error("same"), { view: "chat", phase: "render" });
  const b = formatRenderError(new Error("same"), { view: "chat", phase: "render" });
  const c = formatRenderError(new Error("same"), { view: "work", phase: "render" });
  assert.equal(errorSignature(a), errorSignature(b));
  assert.notEqual(errorSignature(a), errorSignature(c));
});

test("fuzz pure view-model modules under safeRender with corrupt and legacy fixtures", () => {
  const corruptValues = [
    null,
    undefined,
    "",
    "not-an-array",
    0,
    NaN,
    true,
    {},
    [],
    [null, undefined, 42, "str", {}, makeCircular()],
    { steps: "corrupt", github: { issues: [null, undefined, { number: 7 }] }, goal: { criteria: "bad" } },
    { id: 99, status: null, mode: "goal", goal: null, usage: "legacy", tokens: "bad" },
    makeHostileObject(),
  ];

  const probes = [
    // feed.js
    ["feed:logEntries", (v) => feed.logEntries(v)],
    ["feed:groupChildren", (v) => feed.groupChildren(v, () => true)],
    ["feed:shown", (v) => feed.shown(v, "main", 0)],
    ["feed:segments", (v) => feed.segments(v)],
    ["feed:linkFiles", (v) => feed.linkFiles(v)],
    ["feed:linkTasks", (v) => feed.linkTasks(v)],
    ["feed:workerSignature", (v) => feed.workerSignature(v)],
    // tasksview.js
    ["tasks:taskSummaryFallback", (v) => tasksview.taskSummaryFallback(v)],
    ["tasks:chipCounts", (v) => tasksview.chipCounts(v)],
    ["tasks:filterTasks", (v) => tasksview.filterTasks(v, { query: "x", chip: "active" })],
    ["tasks:groupTasks", (v) => tasksview.groupTasks(v, "active")],
    ["tasks:progressModel", (v) => tasksview.progressModel(v)],
    ["tasks:gateBadge", (v) => tasksview.gateBadge(v)],
    ["tasks:goalProgressModel", (v) => tasksview.goalProgressModel(v)],
    ["tasks:detailTabCounts", (v) => tasksview.detailTabCounts(v)],
    ["tasks:filterBoard", (v) => tasksview.filterBoard(v, "all")],
    // issuesview.js
    ["issues:filterIssues", (v) => issuesview.filterIssues(v, { chip: "open", query: "bug" })],
    ["issues:chipCounts", (v) => issuesview.chipCounts(v)],
    ["issues:issueWorkSummary", (v) => issuesview.issueWorkSummary(v)],
    ["issues:bundleEligibility", (v) => issuesview.bundleEligibility(v, v)],
    ["issues:classifyIssuesState", (v) => issuesview.classifyIssuesState(v)],
    ["issues:formatRelativeAge", (v) => issuesview.formatRelativeAge(v)],
    // learningview.js
    ["learning:safeLinks", (v) => learningview.safeLinks(v)],
    ["learning:readProgress", (v) => learningview.readProgress(v)],
    ["learning:filterLessons", (v) => learningview.filterLessons(v, "arch")],
    ["learning:groupByChapter", (v) => learningview.groupByChapter(v)],
    ["learning:learningViewState", (v) => learningview.learningViewState(v)],
    ["learning:formatUpdated", (v) => learningview.formatUpdated(v)],
    ["learning:primarySourceLabel", (v) => learningview.primarySourceLabel(v)],
    // metricsview.js
    ["metrics:cells", (v) => metricsview.cells(v)],
    ["metrics:tokenLines", (v) => metricsview.tokenLines(v, true)],
    ["metrics:barHeights", (v) => metricsview.barHeights(v, 44)],
    ["metrics:dailyLabel", (v) => metricsview.dailyLabel(v)],
    ["metrics:formatCost", (v) => metricsview.formatCost(v)],
    ["metrics:formatTokens", (v) => metricsview.formatTokens(v)],
  ];

  let totalRuns = 0;
  let caughtCount = 0;
  for (const [view, fn] of probes) {
    for (const fixture of corruptValues) {
      totalRuns += 1;
      const result = safeRender({
        render() {
          const out = fn(fixture);
          return { rendered: out ?? "empty" };
        },
      }, {}, { view });

      if (result.error) {
        caughtCount += 1;
        assert.equal(result.node, null);
        assertErrorRecord(result.error, "render", view);
      } else {
        assert.ok(result.node && typeof result.node === "object");
      }
    }
  }

  assert.ok(totalRuns >= probes.length * corruptValues.length);
  assert.ok(caughtCount > 0, "corrupt fixtures should exercise the error boundary at least once");
});
