// The failure classifier: what each of the 7 CLIs says when a turn runs out of quota, is
// throttled, needs a sign-in, goes silent, or dies — and what must never be mistaken for it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_QUOTA_COOLDOWN_MS, LONG_WAIT_MS, classifyFailure, parseResetTime } from "../mods/bot-herdr/engine/lib/failures.mjs";

const NOW = Date.parse("2026-11-21T12:00:00.000Z");
const at = (ms) => new Date(NOW + ms).toISOString();

test("Claude Code headless: a limit as the whole reply (exit 0) is a quota with its reset time", () => {
  const text = "You've hit your session limit · resets 7:10pm (Africa/Johannesburg)";
  const f = classifyFailure({ harness: "claude", error: null, text, exitCode: 0, nowMs: NOW });
  assert.equal(f.kind, "quota");
  assert.equal(f.retryable, false);
  assert.ok(f.retryAfterMs > 0 && f.retryAfterMs <= 24 * 3_600_000);
  assert.equal(f.resetAt, at(f.retryAfterMs));
  assert.match(f.reason, /claude: quota exhausted/);
  // and the fallback cooldown when a limit says no time
  const bare = classifyFailure({ harness: "claude", error: null, text: "Credit balance is too low", exitCode: 0, nowMs: NOW });
  assert.equal(bare.kind, "quota");
  assert.equal(bare.retryAfterMs, DEFAULT_QUOTA_COOLDOWN_MS);
});

test("Claude Code: weekly/monthly limits, throttle, and a missing sign-in are told apart", () => {
  assert.equal(classifyFailure({ harness: "claude", error: "You've hit your weekly limit · resets Mon 12:00am", nowMs: NOW }).kind, "quota");
  assert.equal(classifyFailure({ harness: "claude", error: "You've hit your monthly limit", nowMs: NOW }).kind, "quota");
  const throttle = classifyFailure({ harness: "claude", error: "API Error: Server is temporarily limiting requests (not your usage limit)", nowMs: NOW });
  assert.equal(throttle.kind, "rate_limit");
  assert.equal(throttle.retryable, true);
  const capacity = classifyFailure({ harness: "claude", error: "API Error: Request rejected (429) · this may be a temporary capacity issue.", nowMs: NOW });
  assert.equal(capacity.kind, "rate_limit");
  assert.equal(classifyFailure({ harness: "claude", error: "Not logged in · Please run /login", nowMs: NOW }).kind, "auth");
  assert.equal(classifyFailure({ harness: "claude", error: "API Error: 401 Unauthorized", nowMs: NOW }).kind, "auth");
});

test("Codex: turn.failed 429 is transient; insufficient quota is not", () => {
  const limited = classifyFailure({
    harness: "codex",
    error: "You've exceeded the rate limit, please slow down and try again after 60.6 seconds.",
    exitCode: 1,
    nowMs: NOW,
  });
  assert.equal(limited.kind, "rate_limit");
  assert.equal(limited.retryAfterMs, 60_600);
  assert.equal(limited.resetAt, at(60_600));
  assert.equal(classifyFailure({ harness: "codex", error: "turn_rate_limit_exceeded", nowMs: NOW }).kind, "rate_limit");
  assert.equal(classifyFailure({ harness: "codex", error: "exceeded retry limit, last status: 429 Too Many Requests", nowMs: NOW }).kind, "rate_limit");
  assert.equal(classifyFailure({ harness: "codex", error: '{"error":{"code":"insufficient_quota","message":"You exceeded your current quota"}}', nowMs: NOW }).kind, "quota");
  assert.equal(classifyFailure({ harness: "codex", error: "401 Unauthorized: CODEX_API_KEY is missing", nowMs: NOW }).kind, "auth");
});

test("OpenCode: the ACP retry notice and a plain rate-limit error", () => {
  const retry = { retry: { attempt: 1, nextRetryAt: new Date(NOW + 12_000).toISOString(), error: { type: "provider.rate-limit", message: "Rate limit exceeded", status: 429 } } };
  const transient = classifyFailure({ harness: "opencode", error: "Rate limit exceeded", meta: retry, nowMs: NOW });
  assert.equal(transient.kind, "rate_limit");
  assert.equal(transient.retryAfterMs, 12_000);

  // A provider asking for half an hour is an exhausted window, not a throttle.
  const long = { retry: { attempt: 3, nextRetryAt: new Date(NOW + 30 * 60_000).toISOString(), error: { type: "provider.rate-limit", message: "Rate limit exceeded", status: 429 } } };
  assert.equal(classifyFailure({ harness: "opencode", error: "the agent stopped", meta: long, nowMs: NOW }).kind, "quota");

  assert.equal(classifyFailure({ harness: "opencode", error: "quota has been exhausted for this key", nowMs: NOW }).kind, "quota");
  assert.equal(classifyFailure({ harness: "opencode", error: "Error: API rate limited. Check subscription status.", exitCode: 1, nowMs: NOW }).kind, "quota");
  assert.equal(classifyFailure({ harness: "opencode", error: "Error: API rate limited. Try again later.", exitCode: 1, nowMs: NOW }).kind, "rate_limit");
  assert.equal(classifyFailure({ harness: "opencode", error: "auth_required: sign in to opencode", nowMs: NOW }).kind, "auth");
});

test("Gemini CLI and Antigravity: RESOURCE_EXHAUSTED with a quota or a long wait is a quota", () => {
  const quota = classifyFailure({
    harness: "gemini",
    error: 'API Error: 429 - {"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details","status":"RESOURCE_EXHAUSTED"}}',
    nowMs: NOW,
  });
  assert.equal(quota.kind, "quota");
  const antigravity = classifyFailure({
    harness: "antigravity",
    error: "Error: Retry failed after 1 attempts: Provider requested 1800000ms wait, exceeds retry.maxDelayMs (300000ms)",
    nowMs: NOW,
  });
  assert.equal(antigravity.kind, "quota");
  assert.equal(antigravity.retryAfterMs, 1_800_000);
  assert.equal(classifyFailure({ harness: "antigravity", error: "All accounts are rate limited (HTTP 429)", nowMs: NOW }).kind, "quota");
  // the same wording without a 429 in it is still an exhausted window, not a throttle
  assert.equal(classifyFailure({ harness: "antigravity", error: "All accounts are rate limited", nowMs: NOW }).kind, "quota");
  assert.equal(classifyFailure({ harness: "gemini", error: "All accounts are rate limited", nowMs: NOW }).kind, "quota");
  // a plain transient 429 stays transient
  assert.equal(classifyFailure({ harness: "gemini", error: "API Error: 429 Too Many Requests", nowMs: NOW }).kind, "rate_limit");
});

test("Qwen Code: a 429 with a reset time fast-fails; without one it retries", () => {
  const permanent = classifyFailure({
    harness: "qwen",
    error: "Your token-plan 1-week quota has been exhausted. The quota will reset at 07-27 09:25:00 UTC.",
    nowMs: NOW,
  });
  assert.equal(permanent.kind, "quota");
  assert.equal(permanent.retryable, false);
  assert.equal(permanent.resetAt, "2027-07-27T09:25:00.000Z"); // well past this year: next year's date
  assert.equal(classifyFailure({ harness: "qwen", error: "429 Too Many Requests: slow down", nowMs: NOW }).kind, "rate_limit");
  assert.equal(classifyFailure({ harness: "qwen", error: "RESOURCE_EXHAUSTED: request refused", nowMs: NOW }).kind, "rate_limit");
});

test("pi, Oh My Pi and any other harness: quota, 429, auth, timeout and a crash", () => {
  assert.equal(classifyFailure({ harness: "pi", error: "insufficient_quota: your plan has run out", nowMs: NOW }).kind, "quota");
  assert.equal(classifyFailure({ harness: "omp", error: "429 Too Many Requests", nowMs: NOW }).kind, "rate_limit");
  assert.equal(classifyFailure({ harness: "pi", error: "invalid api key", nowMs: NOW }).kind, "auth");
  assert.equal(classifyFailure({ harness: "pi", error: "no activity for 30 minutes: stopped", nowMs: NOW }).kind, "timeout");
  assert.equal(classifyFailure({ harness: "pi", error: "couldn't start pi: spawn ENOENT", nowMs: NOW }).kind, "crash");
  assert.equal(classifyFailure({ harness: "custom", error: "something odd happened", exitCode: 1, nowMs: NOW }).kind, "crash");
});

test("assistant prose is never a quota: only a harness failure or Claude's whole-reply limit counts", () => {
  // An answer that talks about limits stays an answer.
  for (const text of [
    "I fixed the retry branch: the 429 quota error now fails over to the next model.",
    "You've hit your session limit before, so I added a cooldown reset in bh resilience. Everything passes.",
    "The logs show API Error: 429 Too Many Requests from yesterday; nothing failed today.",
  ]) {
    const f = classifyFailure({ harness: "pi", error: null, text, exitCode: 0, nowMs: NOW });
    assert.equal(f.kind, "unknown");
    assert.equal(f.retryable, false);
    // and a successful turn is never a failure, whatever its words
    assert.equal(classifyFailure({ harness: "claude", error: null, text: "All done: no limit problems.", exitCode: 0, nowMs: NOW }).kind, "unknown");
  }
  const none = classifyFailure({ harness: "claude", error: null, text: "", exitCode: 0, nowMs: NOW });
  assert.deepEqual(none, { kind: "unknown", retryable: false, resetAt: null, retryAfterMs: null, reason: "claude: failed without a reason" });
});

test("OpenCode: a retry notice from a turn that completed is never read as a failure", () => {
  const nowMs = NOW;
  const stale = { retry: { attempt: 2, nextRetryAt: new Date(nowMs + 1_800_000).toISOString(), error: { status: 429, message: "Rate limit exceeded" } } };
  for (const text of ["All done! Fixed the bug.", ""]) {
    const done = classifyFailure({ harness: "opencode", error: null, text, exitCode: null, meta: stale, nowMs });
    assert.equal(done.kind, "unknown", `a completed turn (${JSON.stringify(text)}) is not a limit`);
  }
  // the same notice on a turn that really failed is still classified
  assert.equal(classifyFailure({ harness: "opencode", error: "the agent stopped", meta: stale, nowMs }).kind, "quota");
});

test("Claude Code headless: only a whole short synthetic limit line is a quota, never prose", () => {
  const quota = (text) => classifyFailure({ harness: "claude", error: null, text, exitCode: 0, nowMs: NOW }).kind;
  // the harness's own message, exit 0, whole reply
  assert.equal(quota("You've hit your session limit · resets 7:10pm (Africa/Johannesburg)"), "quota");
  assert.equal(quota("You've hit your weekly limit · resets Mon 12:00am"), "quota");
  assert.equal(quota("Credit balance is too low"), "quota");
  assert.equal(quota("Credit balance is too low."), "quota");
  assert.equal(quota("API Error: Rate limit reached"), "quota");
  // an assistant answering with those words is an answer
  for (const text of [
    "You've hit your session limit before, so I added a cooldown reset in bh resilience. Everything passes.",
    "Credit balance is too low is what the log said yesterday; today it works.",
    "API Error: Rate limit reached was the whole result, so the retry branch took it.",
    "You've hit your weekly limit, so I lowered the batch size.\n\nLet me know if you want it lower.",
  ]) {
    const f = classifyFailure({ harness: "claude", error: null, text, exitCode: 0, nowMs: NOW });
    assert.equal(f.kind, "unknown", `prose must stay prose: ${JSON.stringify(text)}`);
    assert.equal(f.retryAfterMs, null);
  }
});

test("parseResetTime reads every shape the harnesses use", () => {
  assert.equal(parseResetTime("2026-11-21T12:30:00.000Z", NOW), 1_800_000);
  assert.equal(parseResetTime("try again after 60.5 seconds", NOW), 60_500);
  assert.equal(parseResetTime("Provider requested 1800000ms wait", NOW), 1_800_000);
  assert.equal(parseResetTime("quota will reset at 07-27 09:25:00 UTC", NOW), Date.parse("2027-07-27T09:25:00Z") - NOW);
  // 7:10pm in Johannesburg (UTC+2) is 17:10 UTC, 5 h 10 min from noon UTC
  assert.equal(parseResetTime("resets 7:10pm (Africa/Johannesburg)", NOW), 5 * 3_600_000 + 10 * 60_000);
  // a time already past today means tomorrow
  assert.equal(parseResetTime("resets 9:00am (Africa/Johannesburg)", NOW), 19 * 3_600_000);
  assert.equal(parseResetTime("nothing about a time", NOW), null);
  assert.equal(parseResetTime("resets 7:00pm (Not/AZone)", NOW), null);
  assert.ok(LONG_WAIT_MS >= 300_000);
});

test("parseResetTime: a named weekday is that weekday, not tomorrow", () => {
  // Saturday noon UTC: 12:00am Monday is two days on, not the next midnight
  assert.equal(parseResetTime("You've hit your weekly limit · resets Mon 12:00am (UTC)", NOW), 36 * 3_600_000);
  assert.equal(parseResetTime("resets Monday 12:00am (UTC)", NOW), 129_600_000);
  // two weekdays on from Saturday: this week's Wednesday has gone, so it is next week's
  assert.equal(parseResetTime("resets Wed 12:00pm (UTC)", NOW), 96 * 3_600_000);
});

test("parseResetTime: a 24-hour clock, and an impossible time is no time at all", () => {
  assert.equal(parseResetTime("resets 14:30 (UTC)", NOW), 2 * 3_600_000 + 30 * 60_000); // today, 14:30 UTC
  assert.equal(parseResetTime("resets 0:30 (UTC)", NOW), 12 * 3_600_000 + 30 * 60_000); // just past midnight, tomorrow
  assert.equal(parseResetTime("resets 99:99", NOW), null);
  assert.equal(parseResetTime("resets 24:00 (UTC)", NOW), null);
  assert.equal(parseResetTime("resets 13:30pm (UTC)", NOW), null);
  assert.equal(parseResetTime("resets 0:30am (UTC)", NOW), null);
  assert.equal(parseResetTime("resets 7:75pm (UTC)", NOW), null);
});

test("parseResetTime: a past or current timestamp is history, so the wait it mentions is read instead", () => {
  assert.equal(parseResetTime("[2026-11-21T11:59:59Z] Error: Provider requested 1800000ms wait", NOW), 1_800_000);
  assert.equal(parseResetTime("[2026-11-21T12:00:00Z] Error: Provider requested 1800000ms wait", NOW), 1_800_000);
  // a past timestamp on its own is not a future reset
  assert.equal(parseResetTime("2026-11-21T11:00:00Z", NOW), null);
  assert.equal(parseResetTime("2026-11-21T12:00:00Z", NOW), null);
});
