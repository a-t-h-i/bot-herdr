// What ended a turn badly, per harness: permanent quota exhaustion (and when it resets), a
// transient rate limit, a missing sign-in, an idle timeout, or a crash. Pure: no IO and no clock
// of its own (`nowMs` comes in), so every harness's signal is pinned by a test.
//
// The one rule that keeps this honest: assistant prose is never a quota signal. A turn is
// classified from the error the harness reported, its exit code, or (Claude Code headless, which
// exits 0 on a limit: anthropics/claude-code#79500) from the whole reply being Claude's own
// synthetic limit message. A paragraph that merely mentions "429" or "quota" stays a reply.

/** How long a quota with no parseable reset time is cooled down for. */
export const DEFAULT_QUOTA_COOLDOWN_MS = 30 * 60 * 1000;

/** A retry wait this long is not a throttle but an exhausted window: fail over, don't spin. */
export const LONG_WAIT_MS = 5 * 60 * 1000;

const UNIT_MS = { ms: 1, millisecond: 1, milliseconds: 1, s: 1000, second: 1000, seconds: 1000, m: 60_000, minute: 60_000, minutes: 60_000, h: 3_600_000, hour: 3_600_000, hours: 3_600_000 };

/** Every string and number inside a harness error, flattened for matching. */
function flatten(value, depth = 0) {
  if (value === null || value === undefined || depth > 3) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((v) => flatten(v, depth + 1)).join(" ");
  if (typeof value === "object") return Object.entries(value).map(([k, v]) => `${k} ${flatten(v, depth + 1)}`).join(" ");
  return String(value);
}

/** The wall clock in a time zone (or here), as the parts a clock time is read against. */
function clockParts(zone, nowMs) {
  if (!zone) {
    const d = new Date(nowMs);
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours(), minute: d.getMinutes(), second: d.getSeconds() };
  }
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const p = Object.fromEntries(fmt.formatToParts(new Date(nowMs)).map((x) => [x.type, x.value]));
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day), hour: Number(p.hour) % 24, minute: Number(p.minute), second: Number(p.second) };
}

/** Weekday numbers as `Date#getUTCDay` counts them, from a name's first three letters. */
const WEEKDAYS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

/**
 * A clock time's next occurrence ("resets 7:10pm (Africa/Johannesburg)", "resets Mon 12:00am"), in
 * ms from now. Groups: 1 weekday (or absent), 2 hour, 3 minute, 4 am/pm, 5 zone. Without am/pm the
 * hour is a 24-hour one ("resets 14:30"); an hour or minute outside its range is no time at all.
 */
function clockDelta(match, nowMs) {
  const weekday = String(match[1] ?? "").toLowerCase().slice(0, 3);
  const meridiem = String(match[4] ?? "").toLowerCase();
  const hour = Number(match[2]);
  const minute = Number(match[3] ?? 0);
  if (!Number.isInteger(hour) || hour < (meridiem ? 1 : 0) || hour > (meridiem ? 12 : 23) || minute > 59) return null;
  let here;
  try {
    here = clockParts(match[5] || null, nowMs);
  } catch {
    return null; // an unknown zone name: no clock to read
  }
  const at = meridiem ? (hour % 12) + (meridiem === "pm" ? 12 : 0) : hour;
  const target = Date.UTC(here.year, here.month - 1, here.day, at, minute, 0);
  const now = Date.UTC(here.year, here.month - 1, here.day, here.hour, here.minute, here.second);
  const wanted = WEEKDAYS[weekday];
  if (wanted === undefined) {
    const delta = target - now;
    return delta > 0 ? delta : delta + 86_400_000; // that time already passed today: it means tomorrow
  }
  const today = new Date(now).getUTCDay();
  let delta = target - now + ((wanted - today + 7) % 7) * 86_400_000;
  if (delta <= 0) delta += 7 * 86_400_000; // that weekday's time already passed this week: next week
  return delta;
}

/**
 * When a harness said it will be back: ISO timestamps, "try again after 60.5 seconds",
 * "Provider requested 1800000ms wait", "resets 7:10pm (Africa/Johannesburg)", and Qwen's
 * "will reset at 07-27 09:25:00 UTC". Milliseconds from `nowMs`, or null when nothing parses.
 */
export function parseResetTime(text, nowMs = Date.now()) {
  const s = String(text ?? "");
  const after = (ms) => (Number.isFinite(ms) && ms >= 0 ? Math.round(ms) : null);

  // A timestamp is a reset time only while it is still ahead: a past (or log-prefixed) one is the
  // turn's history, so the remaining parsers get their chance at the wait it mentions.
  const iso = /\b(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?(?:Z|[+-]\d{2}:?\d{2}))\b/.exec(s);
  if (iso) {
    const t = Date.parse(iso[1]);
    if (Number.isFinite(t) && t > nowMs) return after(t - nowMs);
  }

  // "Provider requested 1800000ms wait" / "1800000 ms wait"
  const requested = /\bprovider requested\s+(\d+)\s*ms(?:\s+wait)?/i.exec(s) ?? /\b(\d+)\s*ms\s+wait\b/i.exec(s);
  if (requested) return after(Number(requested[1]));

  // "try again after 60.5 seconds" / "retry in 30s" / "wait for 2 minutes"
  const wait = /\b(?:try again|retry|wait)\s+(?:after|in|for)?\s*(\d+(?:\.\d+)?)\s*(milliseconds?|ms|seconds?|s|minutes?|m|hours?|h)\b/i.exec(s);
  if (wait) {
    const unit = UNIT_MS[wait[2].toLowerCase()];
    if (unit) return after(Number(wait[1]) * unit);
  }

  // Qwen's "will reset at 07-27 09:25:00 UTC": this year, or next when long past.
  const dated = /(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\s*UTC\b/i.exec(s);
  if (dated) {
    const year = new Date(nowMs).getUTCFullYear();
    const at = (y) => Date.UTC(y, Number(dated[1]) - 1, Number(dated[2]), Number(dated[3]), Number(dated[4]), Number(dated[5]));
    let t = at(year);
    if (t < nowMs - 30 * 86_400_000) t = at(year + 1); // a date already well past is next year's
    return after(t - nowMs);
  }

  // "resets 7:10pm (Africa/Johannesburg)", "resets 14:30", "resets Mon 12:00am"
  const clock = /\bresets?\s+(?:(mon|tue|wed|thu|fri|sat|sun)[a-z]*\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?(?:\s*\(([\w/+.-]+)\))?/i.exec(s);
  if (clock) return after(clockDelta(clock, nowMs));

  return null;
}

/** A retry notice a harness attached to its turn (OpenCode's `_meta["opencode/retry"]`). */
function retryOf(meta) {
  if (!meta || typeof meta !== "object") return null;
  const r = meta.retry ?? (meta.nextRetryAt || meta.error?.status || Number(meta.status) === 429 ? meta : null);
  if (!r || typeof r !== "object") return null;
  const status = Number(r.error?.status ?? r.status ?? 0) || null;
  const next = typeof r.nextRetryAt === "string" ? Date.parse(r.nextRetryAt) : NaN;
  return { status, type: String(r.error?.type ?? r.type ?? ""), message: String(r.error?.message ?? r.message ?? ""), nextRetryAt: Number.isFinite(next) ? next : NaN };
}

/** The reset phrase a reason line quotes, or "". */
function hintOf(signal) {
  const m = /\bresets?\b[^\n.]{0,40}|will reset at [^\n.]{0,30}|try again after [^\n.]{0,30}|provider requested [^\n.]{0,30}/i.exec(signal);
  return m ? m[0].trim() : "";
}

const label = (kind) => ({ quota: "quota exhausted", rate_limit: "rate limited", auth: "not signed in", timeout: "timed out", crash: "crashed", unknown: "failed" })[kind];

/** The classified failure, with one plain reason line and when it will be back (if it said). */
function result(kind, harness, signal, { resetMs = null, nowMs, detail = "" } = {}) {
  const hint = detail || hintOf(signal);
  const retryable = kind === "rate_limit" || kind === "timeout" || kind === "crash";
  return {
    kind,
    retryable,
    resetAt: resetMs === null ? null : new Date(nowMs + resetMs).toISOString(),
    retryAfterMs: resetMs,
    reason: `${harness || "the harness"}: ${label(kind)}${hint ? ` (${hint})` : ""}`,
  };
}

// ── Per-harness signals ───────────────────────────────────────────────────────────────────

const AUTH = /(?:\b401\b|\b403\b)|\bunauthori[sz]ed\b|invalid api key|not logged in|please run \/login|auth_required|authentication (?:required|failed)|sign in to it/i;
const TIMEOUT = /no activity for|\btimed out\b|\btimeout\b|\bidle\b/i;

const CLAUDE_QUOTA = /You've hit your (?:session|weekly|5-hour|Opus|Sonnet|monthly|usage) limit\b|Credit balance is too low\b|API Error: Rate limit reached\b|\bspend limit\b/i;
const CLAUDE_RATE = /Server is temporarily limiting requests\b|Request rejected \(429\)|temporary capacity issue\b/i;
/**
 * Claude Code headless exits 0 on a limit, so the whole reply is this message (#79500). Anchored at
 * both ends: one short line, the phrase and only its own reset note — never a paragraph that opens
 * with the same words.
 */
const CLAUDE_SYNTHETIC = /^(?:You've hit your (?:session|weekly|5-hour|Opus|Sonnet|monthly|usage) limit(?:\s*[·:—-]\s*resets?\s+\S[^\n]{0,60})?|Credit balance is too low[.,!]?|API Error: Rate limit reached(?:\s*[·:—-]\s*[^\n]{0,90})?)$/i;
/** Longer than any synthetic limit line: a reply, not the harness's own message. */
const SYNTHETIC_MAX = 220;

const CODEX_QUOTA = /insufficient_quota|exceeded your current quota/i;
const CODEX_RATE = /rate_limit_exceeded|turn_rate_limit_exceeded|429 Too Many Requests|exceeded the rate limit|too many requests|try again after \d/i;

const OPENCODE_QUOTA = /API rate limited[^\n]*(?:subscription|quota|exhaust)|quota (?:has been )?(?:exhausted|exceeded)/i;
const OPENCODE_RATE = /API rate limited|rate.?limit/i;

const GEMINI_QUOTA = /exceeded your current quota|all accounts are rate limited|quota (?:has been )?(?:exhausted|exceeded)/i;
const GEMINI_RATE = /RESOURCE_EXHAUSTED|\b429\b|resource has been exhausted/i;
const LONG_WAIT = /provider requested\s+(\d+)\s*ms/i;

const QWEN_QUOTA = /quota/i;
const QWEN_RATE = /\b429\b|rate.?limit|too many requests|RESOURCE_EXHAUSTED/i;

const GENERIC_QUOTA = /insufficient_quota|quota exceeded|quota has been (?:exhausted|exceeded)|exceeded your current quota|usage limit (?:reached|exceeded)|you've hit your .*limit/i;
const GENERIC_RATE = /\b429\b|too many requests|rate.?limit|RESOURCE_EXHAUSTED/i;
const CRASH = /couldn't start|exited with\b|the agent stopped|process exited|ECONNRESET|EPIPE/i;

/** The whole reply, only when it is Claude's own short one-line limit message; otherwise "". */
function syntheticOf(harness, text) {
  const t = String(text ?? "").trim();
  return harness === "claude" && t && t.length <= SYNTHETIC_MAX && !t.includes("\n") && CLAUDE_SYNTHETIC.test(t) ? t : "";
}

/**
 * Classify one failed turn:
 * `{ kind: "quota"|"rate_limit"|"auth"|"timeout"|"crash"|"unknown", retryable, resetAt, retryAfterMs, reason }`.
 * `error` is the turn's error (a string, or a harness error object), `text` the reply the harness
 * gave, `exitCode` its process exit, and `meta` a retry notice (OpenCode's ACP `_meta`).
 */
export function classifyFailure({ harness, error = null, text = "", exitCode = null, meta = null, nowMs = Date.now() } = {}) {
  const h = String(harness ?? "").toLowerCase();
  const errorText = flatten(error).trim();
  const retry = retryOf(meta);
  // Claude Code's headless limit: the whole reply is the harness's own message, not prose.
  const synthetic = errorText ? "" : syntheticOf(h, text);
  const failed = Boolean(errorText) || (typeof exitCode === "number" && exitCode !== 0) || Boolean(synthetic);
  const metaSignal = retry && failed ? [retry.message, retry.type].filter(Boolean).join(" ") : "";
  // A retry notice is a failed turn's business: a turn that completed is never re-read as a limit.
  const signal = [errorText, metaSignal, synthetic, retry && failed ? flatten(meta) : ""].filter(Boolean).join("\n");
  const now = nowMs;
  if (!signal.trim()) return { kind: "unknown", retryable: false, resetAt: null, retryAfterMs: null, reason: `${h || "the harness"}: failed without a reason` };

  // Not signed in, or refused: nothing to retry, nothing to count against a quota.
  if (AUTH.test(signal)) return result("auth", h, signal, { nowMs: now });

  // A silent turn is over, not broken.
  if (TIMEOUT.test(signal)) return result("timeout", h, signal, { nowMs: now });

  if (h === "claude") {
    if (CLAUDE_QUOTA.test(signal)) return result("quota", h, signal, { resetMs: parseResetTime(signal, now) ?? DEFAULT_QUOTA_COOLDOWN_MS, nowMs: now });
    if (CLAUDE_RATE.test(signal)) return result("rate_limit", h, signal, { resetMs: parseResetTime(signal, now), nowMs: now });
  }

  if (h === "codex") {
    if (CODEX_QUOTA.test(signal)) return result("quota", h, signal, { resetMs: parseResetTime(signal, now) ?? DEFAULT_QUOTA_COOLDOWN_MS, nowMs: now });
    if (CODEX_RATE.test(signal)) return result("rate_limit", h, signal, { resetMs: parseResetTime(signal, now), nowMs: now });
  }

  if (h === "opencode" && retry && failed) {
    const rate = retry.status === 429 || /rate.?limit|quota|exhaust/i.test(`${retry.type} ${retry.message}`) || Number.isFinite(retry.nextRetryAt);
    if (rate) {
      const wait = Number.isFinite(retry.nextRetryAt) ? Math.max(0, retry.nextRetryAt - now) : parseResetTime(signal, now);
      const exhausted = /quota|exhaust|subscription/i.test(`${retry.type} ${retry.message}`) || (wait !== null && wait >= LONG_WAIT_MS);
      return result(exhausted ? "quota" : "rate_limit", h, signal, { resetMs: wait ?? (exhausted ? DEFAULT_QUOTA_COOLDOWN_MS : null), nowMs: now, detail: retry.message });
    }
  }
  if (h === "opencode") {
    const exhausted = OPENCODE_QUOTA.test(signal);
    if (exhausted) return result("quota", h, signal, { resetMs: parseResetTime(signal, now) ?? DEFAULT_QUOTA_COOLDOWN_MS, nowMs: now });
    if (OPENCODE_RATE.test(signal)) return result("rate_limit", h, signal, { resetMs: parseResetTime(signal, now), nowMs: now });
  }

  if (h === "gemini" || h === "antigravity") {
    const longWait = Number(LONG_WAIT.exec(signal)?.[1] ?? 0) >= LONG_WAIT_MS;
    if (GEMINI_RATE.test(signal) || GEMINI_QUOTA.test(signal) || longWait) {
      const exhausted = GEMINI_QUOTA.test(signal) || longWait;
      return result(exhausted ? "quota" : "rate_limit", h, signal, { resetMs: exhausted ? parseResetTime(signal, now) ?? DEFAULT_QUOTA_COOLDOWN_MS : parseResetTime(signal, now), nowMs: now });
    }
  }

  if (h === "qwen") {
    const permanent = QWEN_QUOTA.test(signal) && /(?:exhausted|exceeded)/i.test(signal) && /will reset|reset at/i.test(signal);
    if (permanent) return result("quota", h, signal, { resetMs: parseResetTime(signal, now) ?? DEFAULT_QUOTA_COOLDOWN_MS, nowMs: now });
    if (QWEN_RATE.test(signal)) return result("rate_limit", h, signal, { resetMs: parseResetTime(signal, now), nowMs: now });
  }

  // pi, Oh My Pi, any harness whose wording is not specific: the same words mean the same here.
  if (GENERIC_QUOTA.test(signal)) return result("quota", h, signal, { resetMs: parseResetTime(signal, now) ?? DEFAULT_QUOTA_COOLDOWN_MS, nowMs: now });
  if (GENERIC_RATE.test(signal)) return result("rate_limit", h, signal, { resetMs: parseResetTime(signal, now), nowMs: now });
  if (CRASH.test(signal) || (typeof exitCode === "number" && exitCode !== 0)) return result("crash", h, signal, { nowMs: now });
  return result("unknown", h, signal, { nowMs: now });
}
