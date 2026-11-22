// The design language's numbers, in one place: a count in its shortest form (7.2M), a price
// ($0.13), a duration (23m), an age (4h) and a plural ("1 agent"). Pure, so `npm test` checks them.

/** A count in its shortest form: 7.2M, 830k, 12.4k, 512; "—" when it is not a number. */
export function compact(n) {
  const v = n === null || n === undefined || n === "" ? NaN : Number(n);
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  const trimmed = (x) => String(Math.round(x * 10) / 10);
  if (a >= 1e9) return `${sign}${trimmed(a / 1e9)}B`;
  if (a >= 1e6) return `${sign}${trimmed(a / 1e6)}M`;
  if (a >= 1e3) return `${sign}${trimmed(a / 1e3)}k`;
  return `${sign}${Math.round(a)}`;
}

/** A price with two decimals: "$0.13"; "" when there is none to show (never "$0.00"). */
export function usd(n) {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? `$${v.toFixed(2)}` : "";
}

/** A price for a column that always has one: "$0.00" for zero, "—" for no number at all. */
export function price(n) {
  const v = n === null || n === undefined || n === "" ? NaN : Number(n);
  return Number.isFinite(v) ? `$${v.toFixed(2)}` : "—";
}

/** Time worked in one short word: "0m", "<1m", "23m", "1h 18m". */
export function duration(ms) {
  const v = Number(ms);
  if (!Number.isFinite(v) || v <= 0) return "0m";
  const m = Math.floor(v / 60000);
  if (m < 1) return "<1m";
  const h = Math.floor(m / 60);
  return h ? (m % 60 ? `${h}h ${m % 60}m` : `${h}h`) : `${m}m`;
}

/** How old something is, in one short word: now, 40s, 3m, 4h, 3d. */
export function ago(iso, at = Date.now()) {
  const ms = at - Date.parse(iso ?? "");
  if (!Number.isFinite(ms)) return "";
  const s = Math.floor(ms / 1000);
  if (s < 30) return "now";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** A count with its noun, pluralised right: "1 agent", "2 agents". */
export function count(n, one, many = `${one}s`) {
  const v = Math.round(Number(n) || 0);
  return `${compact(v)} ${v === 1 ? one : many}`;
}

/** A column header that says its numbers are approximate: "≈ Tokens"; never "≈" on each value. */
export const estimatedHeader = (label, on) => (on ? `≈ ${label}` : label);
