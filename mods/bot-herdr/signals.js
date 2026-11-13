// The small signals the tab bar and the pages show about work in flight, without drawing: how
// many questions are open where, what the panel's seats are doing, and how long a resume ask
// stands. Pure, so `npm test` checks them; switch.js, questions.js, chat.js and work.js use them.

/** How long a "resume asked" mark stands before it stops meaning anything. */
export const RESUME_MS = 10 * 60000;

/**
 * Where the tab bar reads how many questions are open, by tab (see `openCounts`). Kept here, not
 * in questions.js, so the tab bar reads it without importing the composer through it.
 */
export const OPEN_COUNTS = "bot-herdr.open-questions";

/**
 * Open questions split where the tabs show them: those asked for a plan go to the Plans tab, the
 * rest to the Chat.
 */
export function openCounts(list) {
  let plans = 0;
  let chat = 0;
  for (const q of list ?? []) {
    if (q?.plan) plans++;
    else chat++;
  }
  return { chat, plans };
}

/**
 * Each seat's state from the live terminals named `<seat>-panel`: "working" while it is at it,
 * "done" once it has finished a turn (an idle or asking agent has), "none" when it never started.
 */
export function seatStates(terminals, seats) {
  const out = {};
  for (const seat of seats ?? []) {
    const id = typeof seat === "string" ? seat : seat.id;
    const t = (terminals ?? []).find((x) => String(x?.name ?? "").toLowerCase() === `${id}-panel`);
    out[id] = !t || t.state !== "live" ? "none" : t.status === "working" ? "working" : "done";
  }
  return out;
}

/**
 * The resume marks still worth showing (task id → { at, status }): a task whose status changed
 * since the ask has answered it, and one asked over 10 minutes ago is forgotten.
 */
export function awaited(marks, tasks, now = Date.now()) {
  const out = {};
  for (const [id, mark] of Object.entries(marks ?? {})) {
    const at = Number(mark?.at ?? mark);
    const task = (tasks ?? []).find((t) => t?.id === id);
    if (!task || now - at >= RESUME_MS) continue;
    if (task.status === "active") continue;
    if (mark?.status && task.status !== mark.status) continue;
    out[id] = mark;
  }
  return out;
}

/** How many board entries show before "Show all". */
export const BOARD_SHOWN = 10;

/** A board entry's colour by its kind: blockers and questions warn, done succeeds, contract and decision accent, the rest mute. */
export function boardTone(kind) {
  const k = String(kind ?? "").toLowerCase();
  if (k === "blocker" || k === "question") return "warning";
  if (k === "done") return "success";
  if (k === "contract" || k === "decision") return "accent";
  return "muted";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** How old a board entry is, in one short word: "now", "3m", "2h", then its day ("Nov 12"). */
export function boardAge(at, now = Date.now()) {
  const ms = now - Date.parse(at ?? "");
  if (!Number.isFinite(ms)) return "";
  if (ms < 60000) return "now";
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m`;
  if (ms < 86400000) return `${Math.floor(ms / 3600000)}h`;
  const iso = String(at).slice(0, 10); // the day as the entry records it, so the text never drifts by timezone
  return `${MONTHS[Number(iso.slice(5, 7)) - 1] ?? ""} ${Number(iso.slice(8, 10))}`.trim();
}

/** A task's board newest first: the entries to draw, and how many wait behind "Show all". */
export function boardRows(board, all, limit = BOARD_SHOWN) {
  const newest = [...(board ?? [])].reverse();
  return { rows: all ? newest : newest.slice(0, limit), rest: Math.max(0, newest.length - limit) };
}
