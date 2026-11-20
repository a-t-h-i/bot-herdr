// What a harness did not report, `bh metrics` estimates and marks: cost from tokens and prices,
// tokens from the uncached tokens per minute of reported turns, never a made-up number left
// unmarked. Nothing is written back into a usage file.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const M = await import(new URL("../mods/bot-herdr/engine/lib/metrics.mjs", import.meta.url));

const prices = {
  updated: "2026-11-01",
  models: {
    "gpt-5": { input: 10, output: 40, cacheRead: 1, cacheWrite: 12.5, source: "u", checked: "2026-11-01" },
    "claude-x": { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75, source: "u", checked: "2026-11-01" },
  },
  aliases: { "claude/default": "claude-x" },
};
const agents = [
  { role: "orchestrator", name: "Orchestrator", harness: "claude" },
  { role: "dev", name: "Dev", harness: "codex" },
];
const now = new Date(2026, 10, 20, 12);
const at = (hour = 10) => new Date(2026, 10, 20, hour).toISOString();
const near = (a, b) => typeof a === "number" && Math.abs(a - b) < 1e-6;
const one = (records) => M.metrics({ records, agents, prices, window: "7d", now }).agents.find((a) => a.id === "dev");

test("tokens reported and cost missing: priced from the model's table, cost estimated", () => {
  const a = one([{ at: at(), agent: "dev", role: "dev", harness: "codex", model: "gpt-5", input: 1000, output: 100, cacheRead: 500, ms: 60000, reported: { tokens: true, cost: false } }]);
  assert.ok(near(a.costUsd, (1000 * 10 + 100 * 40 + 500) / 1e6));
  assert.deepEqual(a.estimated, { tokens: false, cost: true });
});

test("time only: tokens at the reported rate of its model, split as those were, then priced", () => {
  const a = one([
    { at: at(9), agent: "dev", role: "dev", harness: "codex", model: "gpt-5", input: 1000, output: 100, ms: 60000, reported: { tokens: true, cost: false } },
    { at: at(10), agent: "dev", role: "dev", harness: "codex", model: "gpt-5", ms: 120000, reported: { tokens: false, cost: false } },
  ]);
  // 1100 tokens a minute; two minutes: 2200, split 10:1 like the reported turn
  assert.deepEqual(a.tokens, { input: 3000, output: 300, cacheRead: 0, cacheWrite: 0 });
  assert.ok(near(a.costUsd, 0.014 + 0.028));
  assert.deepEqual(a.estimated, { tokens: true, cost: true });
});

test("no reported turn on its model: the rate comes from all reported turns", () => {
  const a = one([
    { at: at(9), agent: "dev", role: "dev", harness: "claude", model: "claude-x", input: 600, output: 400, ms: 60000, reported: { tokens: true, cost: true }, costUsd: 0.5 },
    { at: at(10), agent: "dev", role: "dev", harness: "codex", model: "other", ms: 60000, reported: { tokens: false, cost: false } },
  ]);
  assert.deepEqual(a.tokens, { input: 1200, output: 800, cacheRead: 0, cacheWrite: 0 });
  assert.equal(a.costUsd, 0.5); // the time-only turn has no price: its cost stays out
  assert.deepEqual(a.estimated, { tokens: true, cost: false });
});

test("no price for the model: cost is the reported cost only, and null when there is none", () => {
  const a = one([{ at: at(), agent: "dev", role: "dev", harness: "codex", model: "mystery", input: 100, output: 10, ms: 60000, reported: { tokens: true, cost: false } }]);
  assert.equal(a.costUsd, null);
  assert.deepEqual(a.estimated, { tokens: false, cost: false });
  assert.deepEqual(a.tokens, { input: 100, output: 10, cacheRead: 0, cacheWrite: 0 });
});

test("the lead's claude with no model is priced through the claude/default alias", () => {
  const answer = M.metrics({
    records: [{ at: at(), agent: "orchestrator", role: "orchestrator", harness: "claude", model: null, input: 1000000, output: 0, ms: 60000, reported: { tokens: true, cost: false } }],
    agents, prices, window: "7d", now,
  });
  const lead = answer.agents[0];
  assert.equal(lead.id, "orchestrator");
  assert.equal(lead.costUsd, 15);
  assert.deepEqual(lead.estimated, { tokens: false, cost: true });
});

test("the user's prices override the engine's by model id and merge aliases", () => {
  const dir = mkdtempSync(join(tmpdir(), "bh-prices-"));
  const engine = join(dir, "engine");
  const data = join(dir, "data");
  mkdirSync(engine, { recursive: true });
  mkdirSync(data, { recursive: true });
  writeFileSync(join(engine, "prices.json"), JSON.stringify({ updated: "a", models: { m: { input: 1 }, n: { input: 2 } }, aliases: { x: "m" } }));
  writeFileSync(join(data, "prices.json"), JSON.stringify({ models: { m: { input: 9 } }, aliases: { y: "n" } }));
  const p = M.readPrices({ engine, data });
  assert.equal(p.models.m.input, 9);
  assert.equal(p.models.n.input, 2);
  assert.deepEqual(p.aliases, { x: "m", y: "n" });
  assert.equal(p.updated, "a");
  assert.deepEqual(M.readPrices({ engine, data: join(dir, "none") }).models.m, { input: 1 });
});

test("cacheWrite null costs its tokens at the input price", () => {
  const answer = M.metrics({
    records: [{ at: at(), agent: "dev", role: "dev", harness: "codex", model: "gpt-6.2-sol", input: 0, output: 0, cacheWrite: 1000, ms: 60000, reported: { tokens: true, cost: false } }],
    agents,
    prices: { models: { "gpt-6.2-sol": { input: 2, output: 10, cacheRead: 0.1, cacheWrite: null } }, aliases: {} },
    window: "7d", now,
  });
  assert.equal(answer.agents[0].costUsd, 0.002); // 1000 cache-write tokens at $2 per million
});

test("the shipped prices table has the models and default aliases", () => {
  const p = M.readPrices();
  assert.equal(p.updated, "2026-11-20");
  assert.equal(p.models["gpt-6.2-sol"].cacheWrite, null);
  assert.equal(p.aliases["claude/default"], "claude-opus-5-5");
  assert.equal(p.aliases["codex/default"], "gpt-6.2-sol");
});
