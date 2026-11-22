// The design language's machine text and numbers, checked as pure rules: what folds, how a long
// line keeps both ends, how a markdown body splits at its fences, and how a number reads short.

import { test } from "node:test";
import assert from "node:assert/strict";
import { fenced, machineKind, middleTruncate, splitFences } from "../mods/bot-herdr/machinefold.js";
import { ago, compact, count, duration, estimatedHeader, price, usd } from "../mods/bot-herdr/numbers.js";

const STACK = "TypeError: cannot read properties of undefined (reading 'id')\n    at renderIssue (mods/bot-herdr/issues.js:512:18)\n    at render (mods/bot-herdr/main.js:246:12)";
const CONTRACT = '{\n  "command": "ui-audit",\n  "exit": { "pass": false },\n  "failures": [{ "check": "zeroCountChips", "value": 0 }]\n}';

test("machineKind: JSON, stack traces, paths and branch names fold; prose and short text do not", () => {
  assert.equal(machineKind(CONTRACT), "json");
  assert.equal(machineKind(STACK), "stack");
  assert.equal(machineKind("redesign-bot-herdr-ui-to-design-language-dev-m1"), "path");
  assert.equal(machineKind("redesign-bot-herdr-ui-to-design-language-dev-m1", { branch: true }), "branch");
  assert.equal(machineKind("Which selection style should the filter chips use?"), null);
  assert.equal(machineKind("short"), null);
  assert.equal(machineKind(null), null);
});

test("middleTruncate: one line that keeps its head and its tail, and survives odd input", () => {
  assert.equal(middleTruncate("  a\n  b  "), "a b");
  const long = "/tmp/bot-herdr/worktrees/redesign-bot-herdr-ui-to-design-language-dev-m1";
  const folded = middleTruncate(long, 40);
  assert.equal(folded.length, 40);
  assert.ok(folded.startsWith("/tmp/bot-herdr"));
  assert.ok(folded.endsWith("-dev-m1"));
  assert.ok(folded.includes("…"));
  assert.equal(middleTruncate(long), long.length > 96 ? middleTruncate(long, 96) : long);
  assert.equal(middleTruncate(undefined), "");
  assert.equal(middleTruncate("abcdefgh", 9), "abcdefgh");
});

test("splitFences: prose and fenced code apart, an unclosed fence to the end, CRLF tolerated", () => {
  const parts = splitFences(`When a reply fails it is drawn at full size.\r\n\r\n\`\`\`\n${STACK}\n\`\`\`\n\nThen it is quiet.`);
  assert.deepEqual(parts.map((p) => p.kind), ["prose", "code", "prose"]);
  assert.equal(parts[1].text, STACK);
  assert.deepEqual(splitFences("no fences here").map((p) => p.kind), ["prose"]);
  const open = splitFences("before\n```json\n{\"a\": 1}");
  assert.deepEqual(open.map((p) => p.kind), ["prose", "code"]);
  assert.equal(open[1].lang, "json");
  assert.deepEqual(splitFences(""), []);
  assert.deepEqual(splitFences(null), []);
});

test("fenced: a code block fenced wider than any backticks inside it", () => {
  assert.equal(fenced("a"), "```\na\n```");
  assert.ok(fenced("x ``` y").startsWith("````"));
  assert.ok(fenced("```\ninner\n```").startsWith("````"));
});

test("numbers: counts, prices and durations read short and honest", () => {
  assert.equal(compact(7200000), "7.2M");
  assert.equal(compact(830000), "830k");
  assert.equal(compact(12400), "12.4k");
  assert.equal(compact(512), "512");
  assert.equal(compact(1449000000), "1.4B");
  assert.equal(compact(null), "—");
  assert.equal(usd(0.13), "$0.13");
  assert.equal(usd(0), "");
  assert.equal(price(0), "$0.00");
  assert.equal(price(null), "—");
  assert.equal(duration(23 * 60000), "23m");
  assert.equal(duration(78 * 60000), "1h 18m");
  assert.equal(duration(2 * 3600000), "2h");
  assert.equal(duration(0), "0m");
  assert.equal(duration(30000), "<1m");
});

test("numbers: ages, plurals and one ≈ in a column header", () => {
  const now = Date.parse("2026-11-21T12:00:00Z");
  assert.equal(ago("2026-11-21T11:59:50Z", now), "now");
  assert.equal(ago("2026-11-21T11:59:20Z", now), "40s");
  assert.equal(ago("2026-11-21T09:00:00Z", now), "3h");
  assert.equal(ago("2026-11-16T12:00:00Z", now), "5d");
  assert.equal(ago(null, now), "");
  assert.equal(count(1, "agent"), "1 agent");
  assert.equal(count(2, "agent"), "2 agents");
  assert.equal(count(0, "question"), "0 questions");
  assert.equal(estimatedHeader("Tokens", true), "≈ Tokens");
  assert.equal(estimatedHeader("Tokens", false), "Tokens");
});
