// The agents running now. herdr's agents() lists a terminal only once its program reports a
// status (OSC 7501). A few harnesses never do (Antigravity's agy, roster.js QUIET): without this,
// the chat never read their replies, a message to the Orchestrator started a new one each time,
// and `@` never found them. Here their terminals are agents too, in the same shape, marked
// `quiet`, idle as far as anyone can tell. Pure, so `npm test` checks it without herdr.

import { QUIET } from "./roster.js";

/** Whether a terminal (or pane) runs a harness that never reports its status. */
export const isQuiet = (t, quiet = QUIET) => Boolean(t?.program && !t.program.shell && quiet.has(t.program.key));

/**
 * herdr's agents, then every pane running a quiet harness that they leave out, as AgentInfo:
 * `{address, pane, space, space_name, tab, tab_index, tab_name, status, app, program, title, seq,
 * pinned, focused, quiet: true}`.
 */
export function withQuiet({ agents = [], panes = [], spaces = [], quiet = QUIET } = {}) {
  const listed = new Set(agents.map((a) => a.address));
  const tabs = new Map();
  for (const s of spaces) for (const t of s.tabs ?? []) tabs.set(t.id, { space: s, tab: t });
  const extra = [];
  for (const p of panes) {
    if (!p?.terminal || listed.has(p.terminal) || !isQuiet(p, quiet)) continue;
    const at = tabs.get(p.tab);
    if (!at) continue;
    listed.add(p.terminal);
    extra.push({
      address: p.terminal,
      pane: p.pane,
      space: at.space.id,
      space_name: at.space.name ?? "",
      tab: p.tab,
      tab_index: at.tab.index ?? 0,
      tab_name: at.tab.name ?? "",
      status: p.status ?? "idle",
      app: p.app ?? null,
      program: p.program,
      title: p.title ?? "",
      seq: 0,
      pinned: false,
      focused: Boolean(p.focused),
      quiet: true,
    });
  }
  return extra.length ? [...agents, ...extra] : agents;
}

/** How long a quiet agent we wrote to counts as working, with no reply yet. */
export const QUIET_WORK_MS = 15 * 60 * 1000;

/** A quiet agent's status for the chat: working from our message until its reply (or a while). */
export function quietStatus(wait, now, limit = QUIET_WORK_MS) {
  return wait && now - (wait.at ?? now) < limit ? "working" : "idle";
}
