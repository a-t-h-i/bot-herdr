// The skills an agent may use, in words, without drawing: the search over its skills and MCP
// servers, what was picked for the running task, a step's skills line and the harnesses that
// support picking. Pure, so `npm test` checks them; settings.js and work.js draw them.

/** More than this many skills and servers together, and a search box shows above them. */
export const SEARCH_OVER = 8;

/** The skills or servers whose name or description holds `query` (any case); all of them for an empty query. */
export function filterTools(items, query) {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return items ?? [];
  return (items ?? []).filter((t) => `${t?.name ?? ""} ${t?.description ?? ""}`.toLowerCase().includes(q));
}

/** The newest active task in `bh task list`, or null. */
export function newestActive(tasks) {
  const active = (tasks ?? []).filter((t) => t?.status === "active");
  const at = (t) => String(t.updated ?? t.created ?? "");
  return active.sort((a, b) => at(b).localeCompare(at(a)))[0] ?? null;
}

/**
 * What the classifier picked for agent `id` on `task`: { kind: "none" } with no task running,
 * { kind: "off" } when it picked nothing (off or failed: only pins apply), else { kind: "list",
 * names: [{ name, added }] }.
 */
export function pickedFor(task, id) {
  if (!task) return { kind: "none" };
  const entry = task.skills?.[id];
  if (!entry || entry.picked === null || entry.picked === undefined) return { kind: "off" };
  const added = entry.added ?? [];
  const names = [...entry.picked.map((name) => ({ name, added: false })), ...added.filter((n) => !entry.picked.includes(n)).map((name) => ({ name, added: true }))];
  return { kind: "list", names };
}

/** A step's skills line: "Skills: a, b (added)", "Skills: none", " (fallback)" after; null without skills. */
export function skillsLine(skills) {
  if (!skills) return null;
  const added = skills.added ?? [];
  const plain = [...new Set([...(skills.pinned ?? []), ...(skills.picked ?? [])])].filter((n) => !added.includes(n));
  const names = [...plain, ...[...new Set(added)].map((n) => `${n} (added)`)];
  return `Skills: ${names.length ? names.join(", ") : "none"}${skills.fallback ? " (fallback)" : ""}`;
}

/** The supported harnesses' names in a sentence ("Claude Code, Codex and OpenCode"), or null when unknown. */
export function supportedNames(list) {
  if (!Array.isArray(list)) return null;
  const names = list.filter((h) => h?.supported).map((h) => String(h.name ?? h.key));
  if (!names.length) return null;
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
