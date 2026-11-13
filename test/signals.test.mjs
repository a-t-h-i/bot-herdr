// The signals the tab bar and the pages show about work in flight: how many questions are open
// where, what the panel's seats are doing, and how long a "resume asked" mark stands.

import { test } from "node:test";
import assert from "node:assert/strict";
import { openCounts, seatStates, awaited, RESUME_MS, boardTone, boardAge, boardRows, BOARD_SHOWN } from "../mods/bot-herdr/signals.js";

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

test("signals: a board entry's tone follows its kind", () => {
  assert.equal(boardTone("blocker"), "warning");
  assert.equal(boardTone("question"), "warning");
  assert.equal(boardTone("done"), "success");
  assert.equal(boardTone("contract"), "accent");
  assert.equal(boardTone("decision"), "accent");
  assert.equal(boardTone("note"), "muted");
  assert.equal(boardTone(null), "muted");
});

test("signals: a board entry's age is now, minutes, hours, then its day", () => {
  const at = "2026-11-13T12:00:00.000Z";
  const now = Date.parse(at);
  assert.equal(boardAge(at, now + 30000), "now");
  assert.equal(boardAge(at, now + 3 * 60000), "3m");
  assert.equal(boardAge(at, now + 2 * 3600000), "2h");
  // Past a day it is the entry's own day, not a count: 26 hours later it still reads 13 Nov.
  assert.equal(boardAge(at, now + 26 * 3600000), "Nov 13");
  assert.equal(boardAge("2026-01-05T08:00:00.000Z", Date.parse("2026-02-01T00:00:00.000Z")), "Jan 5");
  assert.equal(boardAge("nonsense", now), "");
});

test("signals: the board newest first, ten at a time until asked for all of it", () => {
  const board = Array.from({ length: 13 }, (_, i) => ({ n: i + 1, kind: "note", text: `entry ${i + 1}` }));
  const ten = boardRows(board, false);
  assert.equal(ten.rows.length, BOARD_SHOWN);
  assert.deepEqual(ten.rows.map((e) => e.n), [13, 12, 11, 10, 9, 8, 7, 6, 5, 4]);
  assert.equal(ten.rest, 3);
  const all = boardRows(board, true);
  assert.equal(all.rows.length, 13);
  assert.equal(all.rows[12].n, 1);
  assert.deepEqual(boardRows([], false), { rows: [], rest: 0 });
  assert.deepEqual(boardRows(null, true), { rows: [], rest: 0 });
});
