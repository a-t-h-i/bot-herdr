// Unit tests for the Resilience UI pure helpers and static GPUI safety guards.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  RESILIENCE_DEFAULTS,
  normalizeStatus,
  formatRemaining,
  providerRows,
  cleanFallbackStep,
  addFallbackStep,
  removeFallbackStep,
  moveFallbackStep,
  parseBudgetNumber,
  stripModel,
} from "../mods/bot-herdr/resilienceview.js";

const modSrc = (name) => readFileSync(fileURLToPath(new URL(`../mods/bot-herdr/${name}`, import.meta.url)), "utf8");

test("normalizeStatus(): handles null, partial, and full payloads cleanly", () => {
  const empty = normalizeStatus(null);
  assert.deepEqual(empty.config, RESILIENCE_DEFAULTS);
  assert.deepEqual(empty.cooldowns, []);
  assert.deepEqual(empty.activeFailovers, []);
  assert.equal(empty.task, null);

  const partial = normalizeStatus({
    config: { autonomy: "invalid-mode", fallbacks: [{ harness: " codex ", model: " gpt-5.3-codex " }, { harness: "" }], guardrails: { maxTaskSpendUsd: 25 } },
    cooldowns: [{ key: "claude:opus", harness: "claude", model: "opus", kind: "quota", remainingMs: 840000 }],
  });
  assert.equal(partial.config.autonomy, "guarded");
  assert.deepEqual(partial.config.fallbacks, [{ harness: "codex", model: "gpt-5.3-codex", effort: "" }]);
  assert.equal(partial.config.guardrails.maxTaskSpendUsd, 25);
  assert.equal(partial.config.guardrails.requireCheckBeforeDone, true);
  assert.equal(partial.cooldowns.length, 1);
  assert.equal(partial.cooldowns[0].remainingMs, 840000);

  const full = normalizeStatus({
    config: {
      autonomy: "autonomous",
      fallbacks: [{ harness: "codex", model: "gpt-5.3-codex", effort: "high" }],
      guardrails: {
        requireCheckBeforeDone: false,
        maxTaskSpendUsd: 15,
        maxStepTurns: 30,
        maxStepRetries: 5,
        maxQaRounds: 2,
        maxConcurrentSpawns: 6,
        maxSpawnDepth: 2,
        requireGitIsolationInAutonomous: true,
        protectedPaths: [".git"],
      },
    },
    cooldowns: [{ key: "claude:opus", harness: "claude", model: "opus", kind: "quota", reason: "limit", remainingMs: 600000 }],
    activeFailovers: [{ agent: "dev", from: { harness: "claude", model: "opus" }, to: { harness: "codex", model: "gpt-5.3-codex" }, reason: "quota" }],
    task: { id: "t-1", status: "active", spendUsd: 1.84, maxTaskSpendUsd: 15, turns: 5, breaker: null },
  });
  assert.equal(full.config.autonomy, "autonomous");
  assert.equal(full.config.guardrails.requireCheckBeforeDone, false);
  assert.deepEqual(full.config.guardrails.protectedPaths, [".git"]);
  assert.equal(full.activeFailovers[0].to.harness, "codex");
  assert.equal(full.task.spendUsd, 1.84);
});

test("formatRemaining(): formats sub-minute, minutes, and hours+minutes without Intl", () => {
  assert.equal(formatRemaining(0), "<1m");
  assert.equal(formatRemaining(-5000), "<1m");
  assert.equal(formatRemaining(NaN), "<1m");
  assert.equal(formatRemaining(45_000), "<1m");
  assert.equal(formatRemaining(60_000), "1m");
  assert.equal(formatRemaining(840_000), "14m");
  assert.equal(formatRemaining(3_600_000), "1h");
  assert.equal(formatRemaining(8_100_000), "2h 15m");
});

test("providerRows(): maps installed harnesses to cooldown, active_fallback, and healthy", () => {
  const known = [
    { key: "claude", name: "Claude Code", installed: true },
    { key: "codex", name: "Codex", installed: true },
    { key: "gemini", name: "Gemini CLI", installed: true },
    { key: "qwen", name: "Qwen Code", installed: false },
  ];
  const cooldowns = [{ key: "claude:opus", harness: "claude", model: "opus", kind: "quota", reason: "quota", remainingMs: 840_000 }];
  const activeFailovers = [{ agent: "dev", from: { harness: "claude", model: "opus" }, to: { harness: "codex", model: "gpt-5.3-codex" }, reason: "quota" }];

  const rows = providerRows(known, cooldowns, activeFailovers);
  assert.deepEqual(rows.map((r) => r.key), ["claude", "codex", "gemini"]);
  assert.equal(rows[0].status, "cooldown");
  assert.equal(rows[0].remainingText, "14m");
  assert.equal(rows[0].cooldownKey, "claude:opus");
  assert.equal(rows[1].status, "active_fallback");
  assert.equal(rows[1].cooldownKey, null);
  assert.match(rows[1].detail, /dev/);
  assert.equal(rows[2].status, "healthy");
  assert.equal(rows[2].detail, "Ready");
});

test("fallback chain mutations & parseBudgetNumber(): pure, clamped, non-mutating", () => {
  assert.equal(cleanFallbackStep({ harness: "   " }), null);
  assert.deepEqual(cleanFallbackStep({ harness: " codex ", model: " gpt-5.3-codex ", effort: " high " }), {
    harness: "codex",
    model: "gpt-5.3-codex",
    effort: "high",
  });

  const base = Object.freeze([{ harness: "claude", model: "sonnet", effort: "" }]);
  const added = addFallbackStep(base, { harness: "codex", model: "gpt-5.3-codex", effort: "high" });
  assert.equal(base.length, 1);
  assert.equal(added.length, 2);
  assert.deepEqual(addFallbackStep(added, { harness: "" }), added);

  const movedUp = moveFallbackStep(added, 1, -1);
  assert.deepEqual(movedUp.map((s) => s.harness), ["codex", "claude"]);
  assert.deepEqual(added.map((s) => s.harness), ["claude", "codex"]);

  // Clamping at boundaries never throws or corrupts order.
  assert.deepEqual(moveFallbackStep(movedUp, 0, -5), movedUp);
  assert.deepEqual(moveFallbackStep(movedUp, 1, 5), movedUp);
  assert.deepEqual(moveFallbackStep(movedUp, 99, -1), movedUp);

  const removed = removeFallbackStep(movedUp, 0);
  assert.deepEqual(removed.map((s) => s.harness), ["claude"]);
  assert.equal(movedUp.length, 2);
  assert.deepEqual(removeFallbackStep(removed, -1), removed);

  assert.equal(parseBudgetNumber("$10", 5, { min: 0, max: 100 }), 10);
  assert.equal(parseBudgetNumber("0", 5, { min: 0, max: 100 }), 0);
  assert.equal(parseBudgetNumber("-3", 5, { min: 0, max: 100 }), 5);
  assert.equal(parseBudgetNumber("abc", 5, { min: 0, max: 100 }), 5);
  assert.equal(parseBudgetNumber("", 5, { min: 0, max: 100 }), 5);
  assert.equal(parseBudgetNumber("999", 5, { min: 0, max: 100 }), 100);
});

test("stripModel(): hidden when idle/normal and visible with exact badges on active triggers", () => {
  // Idle / normal: completely hidden.
  assert.equal(stripModel(null).visible, false);
  assert.equal(stripModel({ config: { autonomy: "guarded" }, cooldowns: [], activeFailovers: [], task: null }).visible, false);
  assert.equal(stripModel({ config: { autonomy: "ask" }, task: { id: "t-1", status: "done", spendUsd: 2.5, maxTaskSpendUsd: 10, breaker: null } }).visible, false);

  // Autonomous mode.
  const auto = stripModel({ config: { autonomy: "autonomous" } });
  assert.equal(auto.visible, true);
  assert.equal(auto.autonomyLabel, "Autonomous");
  // Pause needs a task to pause: an autonomous setting alone leaves the button off.
  assert.equal(auto.canPause, false);
  assert.equal(auto.canReset, false);
  assert.equal(stripModel({ config: { autonomy: "autonomous" }, task: { id: "t-1", status: "active" } }).canPause, true);
  assert.equal(stripModel({ config: { autonomy: "autonomous" }, task: { id: "t-1", status: "paused" } }).canPause, false);

  // Active failover + cooldown + active spend.
  const fo = stripModel({
    config: { autonomy: "guarded" },
    cooldowns: [{ key: "claude:opus", harness: "claude", model: "opus", kind: "quota", remainingMs: 840_000 }],
    activeFailovers: [{ agent: "dev", from: { harness: "claude", model: "opus" }, to: { harness: "codex", model: "gpt-5.3-codex" }, reason: "quota" }],
    task: { id: "t-2", status: "active", spendUsd: 1.84, maxTaskSpendUsd: 10, turns: 5, breaker: null },
  });
  assert.equal(fo.visible, true);
  assert.equal(fo.failoverText, "Fallback: Codex (Claude 14m)");
  assert.equal(fo.budgetText, "Budget $1.84 / $10");
  assert.equal(fo.canPause, true);
  assert.equal(fo.canReset, true);

  // Another model on the same CLI: the strip names the model that changed, not just the CLI.
  const sameCli = stripModel({
    config: { autonomy: "guarded" },
    cooldowns: [{ key: "claude:opus-1", harness: "claude", model: "opus-1", kind: "quota", remainingMs: 840_000 }],
    activeFailovers: [{ agent: "dev", from: { harness: "claude", model: "opus-1" }, to: { harness: "claude", model: "sonnet-1" }, reason: "quota" }],
  });
  assert.equal(sameCli.failoverText, "Fallback: Claude sonnet-1 (Claude 14m)");

  // Active failover using engine string keys ("harness:model") + cooldown + active spend.
  const foStr = stripModel({
    config: { autonomy: "guarded" },
    cooldowns: [{ key: "claude:opus", harness: "claude", model: "opus", kind: "quota", remainingMs: 840_000 }],
    activeFailovers: [{ agent: "dev", from: "claude:opus", to: "codex:default", reason: "quota" }],
    task: { id: "t-2", status: "active", spendUsd: 1.84, maxTaskSpendUsd: 10, turns: 5, breaker: null },
  });
  assert.equal(foStr.visible, true);
  assert.equal(foStr.failoverText, "Fallback: Codex (Claude 14m)");
  const strRows = providerRows(
    [{ key: "claude", name: "Claude Code", installed: true }, { key: "codex", name: "Codex", installed: true }],
    [],
    [{ agent: "dev", from: "claude:opus", to: "codex:gpt-5.3-codex", reason: "quota" }],
  );
  assert.equal(strRows[1].status, "active_fallback");
  assert.match(strRows[1].detail, /Claude/);

  // Cooldown only.
  const cd = stripModel({
    cooldowns: [{ key: "gemini", harness: "gemini", kind: "quota", remainingMs: 120_000 }],
  });
  assert.equal(cd.visible, true);
  assert.equal(cd.failoverText, "Cooldown: Gemini 2m");
  assert.equal(cd.canReset, true);

  // Breaker tripped: it shows, but Reset only clears cooldowns, so it stays off unless one is live.
  const br = stripModel({
    task: { id: "t-3", status: "paused", spendUsd: 10, maxTaskSpendUsd: 10, breaker: { kind: "spend", reason: "Spend cap reached" } },
  });
  assert.equal(br.visible, true);
  assert.equal(br.breakerText, "Breaker: Spend cap reached");
  assert.equal(br.canReset, false);
  assert.equal(br.canPause, false);
  const brCd = stripModel({
    cooldowns: [{ key: "claude:opus", harness: "claude", model: "opus", remainingMs: 60_000 }],
    task: { id: "t-3", status: "paused", spendUsd: 10, maxTaskSpendUsd: 10, breaker: { kind: "spend", reason: "Spend cap reached" } },
  });
  assert.equal(brCd.canReset, true);

  // Active task spend against cap alone triggers visibility.
  const budgetOnly = stripModel({
    config: { autonomy: "ask" },
    task: { id: "t-4", status: "active", spendUsd: 3.5, maxTaskSpendUsd: 10, breaker: null },
  });
  assert.equal(budgetOnly.visible, true);
  assert.equal(budgetOnly.budgetText, "Budget $3.50 / $10");
  assert.equal(budgetOnly.canPause, true);
  assert.equal(budgetOnly.canReset, false);
});

test("static GPUI guard: pure module has no runtime imports and UI files avoid forbidden APIs", () => {
  const pureSrc = modSrc("resilienceview.js");
  assert.doesNotMatch(pureSrc, /from\s+["'](?:gpui-kit|gpui-base|herdr)["']/);
  assert.doesNotMatch(pureSrc, /\bIntl\./);

  const forbidden = [
    { name: "Checkbox", re: /\bCheckbox\b/ },
    { name: "Intl.", re: /\bIntl\./ },
    { name: "fs.stat", re: /\bfs\.stat\b/ },
    { name: ".rotate(", re: /\.rotate\(/ },
    { name: ".transform(", re: /\.transform\(/ },
  ];
  for (const file of ["settings.js", "statusstrip.js", "chat.js", "work.js"]) {
    const src = modSrc(file);
    for (const rule of forbidden) {
      assert.doesNotMatch(src, rule.re, `${file} must not use forbidden API ${rule.name}`);
    }
  }
});
