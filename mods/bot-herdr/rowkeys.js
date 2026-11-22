// Keyboard movement through a page's rows, without drawing: J / down and K / up move the pick,
// Home and End jump to the ends, and Enter opens the picked row. Pure, so `npm test` checks it;
// home.js and agents.js use it (the full map, Space to peek and Esc to go back, is the next step).

/** The key pressed, in one lowercase word (`e.key`, the name the shell prints). */
export const keyName = (e) => String(e?.key ?? "").toLowerCase();

/**
 * Where the pick moves for `key` in a list of `n` rows: down and up by one, wrapping at either
 * end; Home and End to the ends. -1 when the key moves nothing (Tab, Enter and the rest).
 */
export function nextPick(key, pick, n) {
  if (!(n > 0)) return -1;
  const k = String(key ?? "").toLowerCase();
  const at = Math.max(0, Math.min(Number(pick) || 0, n - 1));
  if (k === "j" || k === "down") return (at + 1) % n;
  if (k === "k" || k === "up") return (at - 1 + n) % n;
  if (k === "home") return 0;
  if (k === "end") return n - 1;
  return -1;
}

/** Whether the key opens the picked row. */
export const opensRow = (key) => ["enter", "return"].includes(String(key ?? "").toLowerCase());

/** Whether the key is a chord (Ctrl, Cmd or Alt held): chords belong to the app, not the row list. */
export const isChord = (e) => Boolean(e?.modifiers?.control || e?.modifiers?.platform || e?.modifiers?.alt);

/** The sidebar's places, in Ctrl+1..6 order. */
export const DESTINATIONS = ["chat", "home", "agents", "terminals", "library", "settings"];

/** Which top-bar destination Ctrl+1..6 picks inside a bot-herdr view, or null for any other key. */
export function destinationForKey(e) {
  const m = e?.modifiers;
  if (!(m?.control || m?.platform) || m?.alt || m?.shift) return null;
  const n = Number(e?.key);
  return Number.isInteger(n) && n >= 1 && n <= DESTINATIONS.length ? DESTINATIONS[n - 1] : null;
}

/** Whether the key opens or toggles the keyboard map (`?`, never as a Ctrl/Cmd/Alt chord). */
export function opensKeymap(e) {
  if (isChord(e)) return false;
  const key = String(e?.key ?? "");
  const ch = String(e?.key_char ?? "");
  return ch === "?" || key === "?" || (key === "/" && Boolean(e?.modifiers?.shift));
}

/**
 * View-local app keys shared by every destination root: Ctrl+1..6 switch destinations, and `?`
 * opens the keyboard map; both stand down while a text input has focus. Returns `{ kind, page? }` or null.
 */
export function appKeyAction(e, { typing = false } = {}) {
  if (typing) return null;
  const page = destinationForKey(e);
  if (page) return { kind: "page", page };
  if (opensKeymap(e)) return { kind: "keymap" };
  return null;
}

/**
 * Whether a Knowledge card's single-key shortcuts (`e`, `Backspace`, `Delete`) may fire:
 * never while any text input has focus, the Markdown editor is open, or an inline note box is open.
 */
export function cardKeysActive({ typingCount = 0, editing = false, commenting = null } = {}) {
  return !(typingCount > 0 || editing || Boolean(commenting));
}
