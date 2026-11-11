// The questions drawer, without drawing: an agent's questions (bh ask) one at a time, growing out
// of the composer's top. Picking an option answers the question and moves on; typed words and
// Enter answer it too; after the last one every answer goes back together. Tested without herdr;
// composer.js draws it.

/** A fresh walk through one set of questions. */
export function start(q) {
  return { id: q.id, step: 0, answers: (q.questions ?? []).map(() => ({ picks: [], text: "" })) };
}

/** The question on screen, and where it is in the set. */
export function current(q, state) {
  const list = q?.questions ?? [];
  const step = Math.max(0, Math.min(list.length - 1, state?.step ?? 0));
  return { question: list[step] ?? null, step, count: list.length, last: step >= list.length - 1 };
}

/** Whether a question's options come with mockups: they show as a grid of pictures. */
export const hasMockups = (question) => (question?.options ?? []).some((o) => Boolean(o.mockupFile));

/** Columns for a grid of mockups: two for two or four, else three. */
export const gridCols = (n) => (n === 2 || n === 4 ? 2 : 3);

/** A multi-select option turned on or off; the question stays. */
export function toggle(state, label) {
  const a = state.answers[state.step];
  a.picks = a.picks.includes(label) ? a.picks.filter((x) => x !== label) : [...a.picks, label];
  return state;
}

/**
 * Answers the question on screen and moves on. `picks` and `text` replace what it had (a
 * multi-select keeps its picks when given none). Returns true when that was the last one.
 */
export function answer(q, state, { picks = null, text = "" } = {}) {
  const at = current(q, state);
  const a = state.answers[at.step];
  if (picks) a.picks = picks;
  a.text = String(text ?? "").trim();
  if (at.last) return true;
  state.step = at.step + 1;
  return false;
}

export function back(state) {
  state.step = Math.max(0, state.step - 1);
  return state;
}

/** The answers as bh answer takes them. */
export const payload = (state) => state.answers.map((a) => ({ picks: a.picks, text: a.text }));

/** What the chat shows as your reply: each question's picks and words, or the agent's call. */
export function summary(q, answers) {
  return (q.questions ?? []).map((x, i) => {
    const a = answers[i] ?? { picks: [], text: "" };
    const said = [a.picks.join(", "), a.text].filter(Boolean).join(" · ");
    return (q.questions.length > 1 ? `${i + 1}. ` : "") + (said || "your call");
  }).join("\n");
}

/** How many questions are left from the one on screen. */
export const left = (q, state) => Math.max(0, (q?.questions?.length ?? 0) - (state?.step ?? 0));
