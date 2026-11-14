// A task's steps and what they cost, without drawing: the agents a step names and a task or step's
// usage in one line. Pure, so `npm test` checks it; work.js draws both.
//
// Today's `bh task show --json` has steps (status, agent, workedMs, started, report) and the task's
// `board`; step 14 adds `steps[].events`, `agentName`, `elapsedMs` and the task's `done`/`total`.
// Both shapes are read here, so the switch is this file alone.

/** The agents a step names: "dev", "dev, qa", "design-toast & qa" or a list. */
export function stepAgents(s) {
  const raw = Array.isArray(s?.agent) ? s.agent : String(s?.agent ?? "").split(/\s*(?:,|&|\+|\band\b)\s*/);
  return [...new Set(raw.map((a) => String(a ?? "").trim()).filter(Boolean))];
}

/**
 * What a task or a step cost, in one line: "12.4k tokens · $1.23 · 38 min". A part that is 0 or
 * missing is left out (a harness that reports no tokens shows minutes only); "" when there is none.
 */
export function usageText(u) {
  const tokens = Number(u?.tokens) || 0;
  const cost = Number(u?.costUsd) || 0;
  const minutes = Math.round(Number(u?.minutes) || 0);
  return [
    tokens > 0 ? `${tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens)} tokens` : "",
    cost > 0 ? `$${cost.toFixed(2)}` : "",
    minutes > 0 ? `${minutes} min` : "",
  ].filter(Boolean).join(" · ");
}
