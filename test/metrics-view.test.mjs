// The Metrics page's numbers (time, tokens, cost, the ≈ and — marks, card columns) and the page
// switch's fit, which puts the tabs that do not fit behind More.

import { test } from "node:test";
import assert from "node:assert/strict";
import { formatTime, formatTokens, formatCost, tokenLines, cells, columnsFor, barHeights, dailyLabel, ESTIMATED_TIP } from "../mods/bot-herdr/metricsview.js";
import { fitTabs } from "../mods/bot-herdr/tabfit.js";

const FIXTURE = {
  timeMs: 12000000, turns: 1234, tasks: 4, steps: 19, costUsd: 1.789,
  tokens: { input: 1000000, output: 200000, cacheRead: 2500000, cacheWrite: 200000 },
  estimated: { tokens: true, cost: false },
};

test("metrics: time reads compactly, as the design language's numbers do", () => {
  assert.equal(formatTime(12000000), "3h 20m");
  assert.equal(formatTime(45 * 60000), "45m");
  assert.equal(formatTime(2 * 3600000), "2h");
  assert.equal(formatTime(0), "0m");
});

test("metrics: tokens and cost", () => {
  assert.equal(formatTokens(1200000), "1.2M");
  assert.equal(formatTokens(830000), "830k");
  assert.equal(formatTokens(512), "512");
  assert.equal(formatTokens(1449000000), "1.4B");
  assert.equal(formatCost(1.789), "$1.79");
  assert.equal(formatCost(null), "—");
  assert.deepEqual(tokenLines(FIXTURE.tokens), { main: "1.2M", cached: "+ 2.7M cached" });
  assert.equal(tokenLines({ input: 5, output: 5 }).cached, null);
});

test("metrics: an estimated number says ≈ once, in its column header, and keeps a tooltip", () => {
  const [time, turns, tokens, cost] = cells(FIXTURE);
  assert.equal(time.value, "3h 20m");
  assert.equal(turns.value, (1234).toLocaleString());
  assert.equal(tokens.value, "1.2M");
  assert.equal(tokens.label, "≈ Tokens");
  assert.equal(tokens.tip, ESTIMATED_TIP);
  assert.equal(cost.value, "$1.79");
  assert.equal(cost.label, "Cost");
  assert.equal(cost.tip, null);
  const none = cells({ ...FIXTURE, costUsd: null, estimated: { tokens: false, cost: true } });
  assert.equal(none[2].value, "1.2M");
  assert.equal(none[2].label, "Tokens");
  assert.equal(none[3].value, "—");
  assert.equal(none[3].tip, null);
  assert.equal(cells({ ...FIXTURE, estimated: { cost: true } })[3].label, "≈ Cost");
});

test("metrics: the real bh metrics shape (30 days, unpriced agent, large numbers)", () => {
  const agent = { timeMs: 37440000, turns: 257, tasks: 0, steps: 0, costUsd: 732.29, harness: null,
    tokens: { input: 800000, output: 43000, cacheRead: 140000000, cacheWrite: 2900000 }, estimated: { tokens: true, cost: true },
    daily: Array.from({ length: 30 }, (_, i) => ({ day: `2026-10-${String(i + 1).padStart(2, "0")}`, timeMs: i === 25 ? 3600000 : 0, turns: 0 })) };
  const [time, , tokens, cost] = cells(agent);
  assert.equal(time.value, "10h 24m");
  assert.equal(tokens.value, "843k");
  assert.equal(tokens.sub, "+ 142.9M cached");
  assert.equal(cost.value, "$732.29");
  assert.equal(cost.label, "≈ Cost");
  assert.equal(cells({ ...agent, costUsd: null })[3].value, "—");
  assert.equal(barHeights(agent.daily, 44).length, 30);
});

test("metrics: unreported tokens and cost read —, never 0 or $0.00", () => {
  const agent = { name: "dev", timeMs: 60000, turns: 1, tasks: 0, steps: 0, tokens: null, costUsd: null, estimated: { tokens: false, cost: false } };
  const [, , tokens, cost] = cells(agent);
  assert.deepEqual([tokens.value, tokens.sub, tokens.tip], ["—", null, null]);
  assert.deepEqual([cost.value, cost.tip], ["—", null]);
  const totals = { ...FIXTURE, costUsd: null, estimated: { tokens: false, cost: false } };
  assert.deepEqual([cells(totals)[3].value, cells(totals)[3].tip], ["—", null]);
  const both = cells({ ...agent, estimated: { tokens: true, cost: true } });
  assert.deepEqual([both[2].value, both[2].tip, both[3].value, both[3].tip], ["—", null, "—", null]);
});

test("metrics: card columns by width, bars by the busiest day", () => {
  assert.equal(columnsFor(1200), 3);
  assert.equal(columnsFor(899), 2);
  assert.equal(columnsFor(599), 1);
  const daily = [{ timeMs: 0 }, { timeMs: 30 * 60000 }, { timeMs: 60 * 60000 }];
  assert.deepEqual(barHeights(daily, 44), [2, 22, 44]);
  assert.equal(dailyLabel(daily), "Daily time worked, oldest first: 0m, 30m, 1h");
});

test("fitTabs: all fit; one overflows into More; the open last tab stays shown", () => {
  const widths = [100, 100, 100, 100];
  assert.deepEqual(fitTabs(widths, 400, 0), { shown: [0, 1, 2, 3], more: [] });
  assert.deepEqual(fitTabs(widths, 380, 0, { more: 60 }), { shown: [0, 1, 2], more: [3] });
  assert.deepEqual(fitTabs(widths, 380, 3, { more: 60 }), { shown: [0, 1, 3], more: [2] });
  assert.deepEqual(fitTabs(widths, 380, 3, { gap: 4, more: 60 }), { shown: [0, 1, 3], more: [2] });
});
