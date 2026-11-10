// Toasts, one at a time, without drawing. `push` queues a message; the composer shows the first,
// then the next, never two together. A message already waiting is not queued twice (a repeat
// that brings an action gives it to the first), and when more are waiting the one on screen
// leaves sooner. Tested without herdr; composer.js draws them, toast.js stands in for herdr's
// own notifications.

export const KINDS = ["info", "success", "warning", "error"];
/** How long each kind stays, in ms. */
export const DURATION = { info: 3600, success: 3000, warning: 5000, error: 6000 };
/** The most that wait behind the one on screen; older ones are dropped. */
export const MAX_WAITING = 3;
/** How long the one on screen stays at most while others wait. */
export const HURRY_MS = 1600;
/** Where herdr's notifications are handed to the chat's composer ({ title, body, level, action, at }). */
export const TOAST_KEY = "bot-herdr.toast";

export function queue() {
  return { current: null, waiting: [], seq: 0 };
}

/** Queues a toast. Returns the queue's new toast, the one an action joined, or null. */
export function push(q, kind, message, { action = null, duration = null } = {}) {
  const text = String(message ?? "").trim();
  if (!text) return null;
  const level = KINDS.includes(kind) ? kind : "info";
  const same = q.current?.message === text ? q.current : q.waiting.find((t) => t.message === text);
  if (same) {
    if (action && !same.action) same.action = action;
    return same;
  }
  const item = { id: ++q.seq, kind: level, message: text, duration: duration ?? DURATION[level], ...(action ? { action } : {}) };
  if (!q.current) q.current = item;
  else q.waiting = [...q.waiting, item].slice(-MAX_WAITING);
  return item;
}

/** Takes the one on screen off; the next waiting one comes up. Returns it, or null. */
export function dismiss(q, id) {
  if (q.current?.id !== id) return q.current;
  q.current = q.waiting[0] ?? null;
  q.waiting = q.waiting.slice(1);
  return q.current;
}

/** How long the one on screen stays: its own time, or shorter while others wait. */
export function stayFor(q) {
  if (!q.current) return 0;
  return q.waiting.length ? Math.min(q.current.duration, HURRY_MS) : q.current.duration;
}

/** A herdr notification as one line: its title, and its body after a dot. */
export function noteText(n) {
  const title = String(n?.title ?? "").trim();
  const body = String(n?.body ?? "").trim();
  return title && body ? `${title} · ${body}` : title || body;
}

/**
 * The toast's size, from the words on it: one line as wide as it needs, up to `most`, then
 * wrapped. `measure(text, size)` is the text's width at a size (look.js textWidth).
 */
export function toastSize(item, most, measure) {
  const pad = 14 * 2;
  const icon = 16 + 10;
  const action = item.action ? Math.ceil(measure(item.action.label, 12)) + 20 + 10 : 0;
  const words = Math.ceil(measure(item.message, 13.5));
  const room = Math.max(80, most - pad - icon - action);
  const lines = Math.max(1, Math.ceil(words / room));
  const w = lines > 1 ? most : pad + icon + words + action;
  return { w: Math.max(120, Math.min(most, w)), h: 20 + lines * 19, lines };
}
