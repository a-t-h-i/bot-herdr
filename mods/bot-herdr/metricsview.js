// The Metrics page's words and numbers, without drawing: how time, tokens and cost read, which
// windows there are, how many card columns fit, and the daily bars' heights. Pure, so `npm test`
// checks them; metrics.js draws them. Every number is formatted by numbers.js, so a page reads
// 7.2M, $0.13 and 23m the same way everywhere.

import { compact, price, duration, estimatedHeader } from "./numbers.js";

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

/** Time worked in the design language's short form: "3h 20m", "2h", "45m", "0m". */
export const formatTime = duration;

/** A token count: "1.4B", "1.2M", "830k", or the number itself under a thousand. */
export const formatTokens = compact;

/** A cost in dollars: "$1.79"; "—" when there is none to show. */
export function formatCost(usd) {
  if (usd === null || usd === undefined || !Number.isFinite(Number(usd))) return "—";
  return price(usd);
}

/** A count in the locale's digits (the mod runtime has no Intl; toLocaleString falls back to plain digits). */
export const formatCount = (n) => Math.round(Math.max(0, Number(n) || 0)).toLocaleString();

/** "≈" in the column header of a number the harness only estimates, never on each value. */
export const estimatedLabel = (label, on) => estimatedHeader(label, on);

/** Uncached tokens (input + output) first, and the cached ones (read + write) as a second line, or null; "—" when none were reported. */
export function tokenLines(tokens) {
  if (tokens === null || tokens === undefined) return { main: "—", cached: null };
  const t = tokens;
  const cached = (Number(t.cacheRead) || 0) + (Number(t.cacheWrite) || 0);
  return {
    main: formatTokens((Number(t.input) || 0) + (Number(t.output) || 0)),
    cached: cached > 0 ? `+ ${formatTokens(cached)} cached` : null,
  };
}

/** The six numbers of a totals row: { key, label, value, sub, tip }, each label carrying the ≈ once. */
export function cells(m) {
  const est = m?.estimated ?? {};
  const tokens = tokenLines(m?.tokens);
  const tip = (on) => (on ? ESTIMATED_TIP : null);
  const tokensEst = Boolean(est.tokens) && m?.tokens != null && tokens.main !== "—";
  return [
    { key: "time", label: "Time worked", value: formatTime(m?.timeMs), sub: null, tip: null },
    { key: "turns", label: "Turns", value: formatCount(m?.turns), sub: null, tip: null },
    { key: "tokens", label: estimatedLabel("Tokens", tokensEst), value: tokens.main, sub: tokens.cached, tip: tip(tokensEst) },
    { key: "cost", label: estimatedLabel("Cost", Boolean(est.cost) && m?.costUsd != null), value: formatCost(m?.costUsd), sub: null, tip: tip(est.cost && m?.costUsd != null) },
    { key: "tasks", label: "Tasks", value: formatCount(m?.tasks), sub: null, tip: null },
    { key: "steps", label: "Steps", value: formatCount(m?.steps), sub: null, tip: null },
  ];
}

/** The one number an agent's card leads with: what it cost, the number the spend caps watch. */
export function hero(m) {
  const est = Boolean(m?.estimated?.cost) && m?.costUsd != null;
  return { label: estimatedLabel("Cost", est), value: formatCost(m?.costUsd), tip: est ? ESTIMATED_TIP : null };
}

/** The rest of an agent's numbers in one quiet line for the card's tooltip, never on the card. */
export function cardDetail(m) {
  return cells(m)
    .filter((x) => x.key !== "cost")
    .map((x) => `${x.label}: ${x.value}${x.sub ? ` (${x.sub})` : ""}`)
    .join(" · ");
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

/** An agent's rank in the fleet, for the card's tooltip: "#1". */
export const rankOf = (i) => `#${i + 1}`;
