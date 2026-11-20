// The Metrics page's words and numbers, without drawing: how time, tokens and cost read, which
// windows there are, how many card columns fit, and the daily bars' heights. Pure, so `npm test`
// checks them; metrics.js draws them.

/** The windows `bh metrics --window` takes, in the picker's order. */
export const WINDOWS = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "all", label: "All" },
];
export const DEFAULT_WINDOW = "7d";

/** The tooltip on a number the harness did not report. */
export const ESTIMATED_TIP = "Estimated: this harness does not report it";

/** Time worked: "3 h 20 min", "2 h", "45 min" ("0 min" under a minute). */
export function formatTime(ms) {
  const minutes = Math.floor(Math.max(0, Number(ms) || 0) / 60000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** A token count: "1.4B", "1.2M", "830k", or the number itself under a thousand. */
export function formatTokens(n) {
  const v = Math.max(0, Number(n) || 0);
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${Math.round(v / 1e3)}k`;
  return String(Math.round(v));
}

/** A cost in dollars: "$1.79"; "—" when there is none to show. */
export function formatCost(usd) {
  if (usd === null || usd === undefined || !Number.isFinite(Number(usd))) return "—";
  return `$${Number(usd).toFixed(2)}`;
}

/** A count in the locale's digits (the mod runtime has no Intl; toLocaleString falls back to plain digits). */
export const formatCount = (n) => Math.round(Math.max(0, Number(n) || 0)).toLocaleString();

/** "≈" before a number that is estimated; a missing number ("—") stays as it is. */
export const estimated = (text, on) => (on && text !== "—" ? `≈${text}` : text);

/** Uncached tokens (input + output) first, and the cached ones (read + write) as a second line, or null; "—" when none were reported. */
export function tokenLines(tokens, isEstimate = false) {
  if (tokens === null || tokens === undefined) return { main: "—", cached: null };
  const t = tokens;
  const cached = (Number(t.cacheRead) || 0) + (Number(t.cacheWrite) || 0);
  return {
    main: estimated(formatTokens((Number(t.input) || 0) + (Number(t.output) || 0)), isEstimate),
    cached: cached > 0 ? `+ ${formatTokens(cached)} cached` : null,
  };
}

/** The six numbers of a totals row or an agent card: { label, value, sub, tip }. */
export function cells(m) {
  const est = m?.estimated ?? {};
  const tokens = tokenLines(m?.tokens, est.tokens);
  const tip = (on) => (on ? ESTIMATED_TIP : null);
  return [
    { label: "Time worked", value: formatTime(m?.timeMs), sub: null, tip: null },
    { label: "Turns", value: formatCount(m?.turns), sub: null, tip: null },
    { label: "Tokens", value: tokens.main, sub: tokens.cached, tip: tip(est.tokens && m?.tokens != null) },
    { label: "Cost", value: estimated(formatCost(m?.costUsd), est.cost), sub: null, tip: tip(est.cost && m?.costUsd != null) },
    { label: "Tasks", value: formatCount(m?.tasks), sub: null, tip: null },
    { label: "Steps", value: formatCount(m?.steps), sub: null, tip: null },
  ];
}

/** Card columns for a page this wide: 3, 2 below 900px, 1 below 600px. */
export const columnsFor = (width) => (width < 600 ? 1 : width < 900 ? 2 : 3);

/** Each day's bar height in px: in proportion to the agent's busiest day; a day with none is a 2px stub. */
export function barHeights(daily, tallest, stub = 2) {
  const values = (daily ?? []).map((d) => Math.max(0, Number(d?.timeMs) || 0));
  const max = Math.max(0, ...values);
  return values.map((v) => (v > 0 && max > 0 ? Math.max(stub, Math.round((v / max) * tallest)) : stub));
}

/** The daily chart said in words, for a screen reader. */
export const dailyLabel = (daily) => `Daily time worked, oldest first: ${(daily ?? []).map((d) => formatTime(d?.timeMs)).join(", ")}`;

/** An agent's rank line on its card: "#1". */
export const rankOf = (i) => `#${i + 1}`;
