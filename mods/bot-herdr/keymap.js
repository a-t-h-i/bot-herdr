// The app's keyboard map: the one table of keys that open things, as pure data. The `?` overlay
// draws it (main.js, while KEYMAP_OPEN is set by switch.js's "map" command), the audit's
// counters read the same table, and tests check it has no collisions (test/keymap.test.mjs).
// Contexts are the audited page ids where they exist.

/** The shared key that opens the map on any page (switch.js handles the "map" command). */
export const KEYMAP_OPEN = "bot-herdr.keymap-open";

/** One map row: the context it lives in, the keys that do the action, and the action in words. */
export function row(context, keys, action) {
  return { context: String(context ?? ""), keys: Array.isArray(keys) ? [...keys] : [], action: String(action ?? "") };
}

/** The map, in the spec's order: global bindings, view-local bot-herdr keys, then each page. */
export const KEYMAP = [
  row("global", ["Ctrl+Shift+P"], "Command palette (herdr's own binding)"),
  row("global", ["Ctrl+."], "Pause or resume the current goal"),
  row("views", ["Ctrl+1", "Ctrl+2", "Ctrl+3", "Ctrl+4", "Ctrl+5"], "Home, Threads, Agents, Library, Settings (in bot-herdr views)"),
  row("views", ["?"], "Show this map (in bot-herdr views)"),
  row("home", ["J", "K", "Home", "End"], "Move the pick through the rows"),
  row("home", ["Space"], "Peek the picked row"),
  row("home", ["Enter"], "Open the picked row"),
  row("threads", ["J", "K", "Home", "End"], "Move the pick through the list"),
  row("threads", ["Space"], "Peek the picked row"),
  row("threads", ["Enter"], "Open the picked row"),
  row("threads", ["Esc"], "Close the peek, then go back"),
  row("threads", ["1", "2", "3", "4", "5", "6", "7", "8", "9"], "Pick an option on a question card"),
  row("threads", ["Ctrl+Enter"], "Send the composer"),
  row("agents", ["J", "K", "Space", "Enter"], "Move, peek and open the fleet"),
];

/** The table entries of a map: hostile junk answers as no entries. */
const list = (map) => (Array.isArray(map) ? map : []).filter((r) => r && typeof r === "object");

/** Duplicate keys within one context: every context must read as one chord at a time. */
export function collisions(map = KEYMAP) {
  const rows = list(map);
  const out = [];
  for (const context of new Set(rows.map((r) => String(r.context ?? "")))) {
    const keys = rows.filter((r) => String(r.context ?? "") === context).flatMap((r) => Array.isArray(r.keys) ? r.keys : []);
    for (const key of new Set(keys)) {
      if (keys.filter((k) => k === key).length > 1) out.push({ context, keys: [key] });
    }
  }
  return out;
}

/** Every context the map names: "global" plus each page that takes keys. */
export function contexts(map = KEYMAP) {
  return [...new Set(list(map).map((r) => String(r.context ?? "")))].filter(Boolean);
}

/** The map as drawn: one row per entry, in table order, with keys as strings. */
export function overlayRows(map = KEYMAP) {
  return list(map)
    .filter((r) => Array.isArray(r.keys) && r.keys.length && typeof r.action === "string" && r.action)
    .map((r) => ({ context: String(r.context ?? ""), keys: r.keys.map((k) => String(k)), action: r.action }));
}
