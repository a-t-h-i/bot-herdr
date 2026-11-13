// The signals the tab bar and the pages show about work in flight: how many questions are open
// where, what the panel's seats are doing, and how long a "resume asked" mark stands.

import { test } from "node:test";
import assert from "node:assert/strict";
import { openCounts, seatStates, awaited, RESUME_MS } from "../mods/bot-herdr/signals.js";

test("signals: open questions split where the tabs show them, plan and chat", () => {
  const list = [
    { id: "q-1", from: "dev" },
    { id: "q-2", from: "dev", plan: "p-1" },
    { id: "q-3", from: "qa", plan: "p-1" },
    { id: "q-4", from: "design", plan: null },
  ];
  assert.deepEqual(openCounts(list), { chat: 2, plans: 2 });
  assert.deepEqual(openCounts([]), { chat: 0, plans: 0 });
  assert.deepEqual(openCounts(null), { chat: 0, plans: 0 });
});

test("signals: a seat reads working, done or not started from the live terminal named <seat>-panel", () => {
  const seats = [{ id: "dev" }, { id: "qa" }, { id: "design" }];
  const terminals = [
    { name: "Dev-Panel", state: "live", status: "working" },
    { name: "qa-panel", state: "live", status: "blocked" }, // finished its turn to ask
    { name: "design-panel", state: "gone", status: "working" }, // a dead terminal is not a running seat
    { name: "research-panel", state: "live", status: "working" },
  ];
  assert.deepEqual(seatStates(terminals, seats), { dev: "working", qa: "done", design: "none" });
  assert.deepEqual(seatStates([], ["dev"]), { dev: "none" });
  // A quiet harness reports no status while it works: that is not a claim either way.
  assert.deepEqual(seatStates([{ name: "dev-panel", state: "live", status: null }], ["dev"]), { dev: "done" });
});

test("signals: a resume mark stands until the task's status changes, or for 10 minutes", () => {
  const now = Date.UTC(2026, 10, 13, 12, 0, 0);
  const mark = { at: now, status: "backlog" };
  const marks = { t1: mark, t2: mark, t3: { at: now - RESUME_MS, status: "backlog" }, gone: mark };
  const tasks = [
    { id: "t1", status: "backlog" }, // unchanged: still asked
    { id: "t2", status: "active" }, // picked up: the ask was answered
    { id: "t3", status: "backlog" }, // too old
  ];
  assert.deepEqual(Object.keys(awaited(marks, tasks, now + 60000)), ["t1"]);
  // A status change in either direction drops it, and so does a task that went away.
  assert.deepEqual(awaited({ t1: mark }, [{ id: "t1", status: "paused" }], now), {});
  assert.deepEqual(awaited({ t1: mark }, [], now), {});
  assert.deepEqual(awaited({}, [{ id: "t1", status: "backlog" }], now), {});
});
