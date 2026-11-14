// `bh task show --json`: each step's events in order, its agent, its elapsed time and its usage.
// `bh task list --json`: usage on each task and on each of its steps (the task page reads this).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const lib = (name) => import(new URL(`../mods/bot-herdr/engine/${name}`, import.meta.url));
const ago = (ms) => new Date(Date.now() - ms).toISOString();

test("task detail: a step's report and merge show once each on its timeline", async () => {
  const T = await lib("lib/tasks.mjs");
  const root = mkdtempSync(join(tmpdir(), "bh-detail-"));
  const task = T.newTask(root, { request: "Show the work", steps: ["Build it", "Review it"] });
  T.updateTask(root, task.id, (t) => {
    T.moveStep(t, 1, "start", { agent: "dev" });
    T.moveStep(t, 1, "done");
    t.steps[0].workedMs = 120000;
    T.moveStep(t, 2, "start").started = ago(30000);
    t.children = [
      { name: "fix-x", agent: "dev", step: 1, state: "open" },
      { name: "di", agent: "design", step: 2, state: "open" },
    ];
  });
  // Every write below goes through the path its command uses.
  T.post(root, task.id, { kind: "contract", text: "POST /x takes { a }", from: "dev", step: 1 });
  T.report(root, task.id, { step: 1, summary: "Built the endpoint", file: "reports/dev.md", from: "dev" });
  T.recordCheck(root, task.id, { at: new Date().toISOString(), from: "dev", step: 1, command: "bh check", exit: 0, counts: { pass: 3, total: 4 }, ran: { tests: 4 } });
  T.recordUsage(root, task.id, { agent: "dev", step: 1, input: 10, output: 5, ms: 60000, at: new Date().toISOString() });
  // `bh merge`: the child merged, and the `done "Merged …"` post it writes next to it (bh.mjs:739-741).
  T.updateTask(root, task.id, (t) => Object.assign(t.children[0], { state: "merged", mergedAt: new Date().toISOString(), stat: { files: 2, added: 5, removed: 2 } }));
  T.post(root, task.id, { kind: "done", text: "Merged fix-x: 2 files, +5 −2", from: "dev", step: 1 });

  const detail = T.taskDetail(root, T.loadTask(root, task.id), T.board(root, task.id));
  const [one, two] = detail.steps;
  assert.deepEqual(one.events.map((e) => `${e.kind}:${e.detail}`).sort(), ["board:contract", "check:3/4 tests", "merge:+5 −2", "report:reports/dev.md"]);
  const kinds = one.events.map((e) => e.kind);
  assert.equal(kinds.filter((k) => k === "report").length, 1);
  assert.equal(kinds.filter((k) => k === "merge").length, 1);
  assert.deepEqual(one.events.map((e) => e.text).sort(), ["Built the endpoint", "Checks passed", "Merged fix-x", "POST /x takes { a }"]);
  assert.ok(one.events.every((e) => e.from === "dev"));
  assert.equal(one.agentName, "dev");
  assert.equal(two.agentName, "di"); // no agent yet: the open child's name
  assert.equal(one.timeMs, 60000); // its turn, not the 120000 its stored clock had
  assert.equal(one.elapsedMs, 60000); // the same number, with no running part
  assert.equal(two.elapsedMs, 0); // active for a minute, but no turn recorded: nothing counts
  assert.equal(detail.timeMs, 60000);
  assert.deepEqual(one.usage, { tokens: 15, costUsd: 0, minutes: 1 });
  assert.deepEqual(two.usage, { tokens: 0, costUsd: 0, minutes: 0 });
  assert.deepEqual(detail.usage, { tokens: 15, costUsd: 0, minutes: 1 });
  assert.equal(detail.done, 1);
  assert.equal(detail.total, 2);
});

test("task list: usage on the task and on each step, none on a step without a turn", async () => {
  const T = await lib("lib/tasks.mjs");
  const root = mkdtempSync(join(tmpdir(), "bh-list-"));
  const task = T.newTask(root, { request: "What it cost", steps: ["Build it", "Review it"] });
  T.recordUsage(root, task.id, { agent: "dev", step: 1, input: 10, output: 5, ms: 60000 });
  T.recordUsage(root, task.id, { agent: "dev", step: 1, input: 3, output: 1, cacheRead: 2, cacheWrite: 1, costUsd: 0.25, ms: 60000 });

  const [listed] = T.listTasks(root);
  assert.deepEqual(listed.usage, { tokens: 22, costUsd: 0.25, minutes: 2 });
  assert.deepEqual(listed.steps.map((s) => s.usage), [{ tokens: 22, costUsd: 0.25, minutes: 2 }, { tokens: 0, costUsd: 0, minutes: 0 }]);
  assert.deepEqual(listed.steps.map((s) => s.title), ["Build it", "Review it"]);
});
