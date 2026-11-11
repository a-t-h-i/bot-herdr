// findMatches: every hit as a line and a column range, case as asked, CRLF counted as one ending.

import { test } from "node:test";
import assert from "node:assert/strict";
import { findMatches, around, step } from "../mods/bot-herdr/search.js";

test("an empty query matches nothing, a space query matches spaces", () => {
  assert.deepEqual(findMatches("some text\n", ""), []);
  assert.deepEqual(findMatches("some text\n", null), []);
  assert.deepEqual(findMatches("a  b", "  "), [{ line: 1, start: 1, end: 3 }]);
});

test("matching ignores case unless it is asked to care", () => {
  const text = "Model\nmodel\nMODEL\n";
  assert.deepEqual(findMatches(text, "model").map((m) => m.line), [1, 2, 3]);
  assert.deepEqual(findMatches(text, "model", { caseSensitive: true }).map((m) => m.line), [2]);
  assert.deepEqual(findMatches(text, "Model", { caseSensitive: true }), [{ line: 1, start: 0, end: 5 }]);
});

test("several matches on one line are several entries, in order", () => {
  assert.deepEqual(findMatches("a cat and a cat", "cat"), [
    { line: 1, start: 2, end: 5 },
    { line: 1, start: 12, end: 15 },
  ]);
});

test("CRLF line endings give the same lines and columns as LF", () => {
  const lf = "one ftwo\nthree ftwo\n";
  const crlf = "one ftwo\r\nthree ftwo\r\n";
  assert.deepEqual(findMatches(crlf, "ftwo"), findMatches(lf, "ftwo"));
  assert.deepEqual(findMatches(crlf, "ftwo"), [
    { line: 1, start: 4, end: 8 },
    { line: 2, start: 6, end: 10 },
  ]);
});

test("a line and a match can be cut for drawing, and stepping wraps", () => {
  assert.deepEqual(around("a cat sat", { start: 2, end: 5 }), { before: "a ", hit: "cat", after: " sat" });
  assert.equal(step(0, 3, 1), 1);
  assert.equal(step(2, 3, 1), 0);
  assert.equal(step(0, 3, -1), 2);
  assert.equal(step(0, 0), -1);
});
