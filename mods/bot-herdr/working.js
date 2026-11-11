// The working indicators' words, without drawing: each role's five verbs and motions, which one
// shows now, and whose turn it is when several agents work. Tested without herdr; indicators.js
// draws them.

/** Each role's indicators: `fx` names the motion below. */
export const INDICATORS = {
  oracle: [
    { fx: "lamp", verb: "Thinking" },
    { fx: "ripple", verb: "Considering" },
    { fx: "twinkle", verb: "Reflecting" },
    { fx: "breathe", verb: "Deciding" },
    { fx: "focus", verb: "Weighing" },
  ],
  planner: [
    { fx: "route", verb: "Planning" },
    { fx: "outline", verb: "Outlining" },
    { fx: "fork", verb: "Mapping" },
    { fx: "brackets", verb: "Arranging" },
    { fx: "stairs", verb: "Ordering" },
  ],
  scout: [
    { fx: "lens", verb: "Looking" },
    { fx: "radar", verb: "Searching" },
    { fx: "sonar", verb: "Tracing" },
    { fx: "spotlight", verb: "Scanning" },
    { fx: "needle", verb: "Finding" },
  ],
  research: [
    { fx: "page", verb: "Reading" },
    { fx: "bookmark", verb: "Gathering" },
    { fx: "highlight", verb: "Studying" },
    { fx: "skim", verb: "Comparing" },
    { fx: "riffle", verb: "Researching" },
  ],
  dev: [
    { fx: "type", verb: "Writing" },
    { fx: "braces", verb: "Editing" },
    { fx: "block", verb: "Refactoring" },
    { fx: "build", verb: "Building" },
    { fx: "code", verb: "Coding" },
  ],
  qa: [
    { fx: "scan", verb: "Checking" },
    { fx: "frame", verb: "Inspecting" },
    { fx: "pulse", verb: "Testing" },
    { fx: "tests", verb: "Verifying" },
    { fx: "stamp", verb: "Confirming" },
  ],
  design: [
    { fx: "sketch", verb: "Sketching" },
    { fx: "swatch", verb: "Styling" },
    { fx: "grid", verb: "Aligning" },
    { fx: "wave", verb: "Shaping" },
    { fx: "ruler", verb: "Adjusting" },
  ],
  agent: [
    { fx: "dots", verb: "Working" },
    { fx: "glide", verb: "Running" },
    { fx: "fade", verb: "Busy" },
    { fx: "march", verb: "Continuing" },
    { fx: "nudge", verb: "Carrying on" },
  ],
};

/** A team role (roster.js) as an indicator set. */
export function roleOf(role) {
  const key = String(role ?? "").toLowerCase();
  if (["orchestrator", "oracle", "master", "lead"].includes(key)) return "oracle";
  if (["planner", "panel"].includes(key)) return "planner";
  if (key === "scout") return "scout";
  if (key === "research" || key === "researcher") return "research";
  if (["dev", "backend", "worker"].includes(key)) return "dev";
  if (key === "qa") return "qa";
  if (["design", "designer", "frontend"].includes(key)) return "design";
  return "agent";
}

const MIN_MS = 30000;
const MAX_MS = 60000;
const slots = new Map();

/** A random index below `count`, never `not`, so a swap always shows something new. */
export function pickIndex(count, not, random = Math.random) {
  if (count < 2) return 0;
  const next = Math.floor(random() * (not === undefined ? count : count - 1));
  return not !== undefined && next >= not ? next + 1 : next;
}

/** The role's indicator now; after its 30 to 60 seconds, another. */
export function indicatorFor(role, now = Date.now(), random = Math.random) {
  const set = INDICATORS[role] ?? INDICATORS.agent;
  let slot = slots.get(role);
  if (!slot) {
    slot = { index: pickIndex(set.length, undefined, random), until: now + MIN_MS + random() * (MAX_MS - MIN_MS) };
    slots.set(role, slot);
  } else if (now >= slot.until) {
    slot.index = pickIndex(set.length, slot.index, random);
    slot.until = now + MIN_MS + random() * (MAX_MS - MIN_MS);
  }
  return set[slot.index] ?? set[0];
}

/** `#rrggbb` at an opacity, as `#rrggbbaa`. */
export function alpha(color, a) {
  const m = /^#?([0-9a-f]{6})/i.exec(String(color ?? ""));
  if (!m) return color;
  return `#${m[1]}${Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, "0")}`;
}

/** The frames of a word typed out letter by letter, with a caret, then held. */
export function typed(word) {
  const out = [];
  for (let i = 1; i <= word.length; i++) out.push(`${word.slice(0, i)}▍`);
  for (let i = 0; i < 4; i++) out.push(i % 2 ? word : `${word}▍`);
  return out;
}

/** Every motion name, for the tests. */
export const MOTIONS = Object.values(INDICATORS).flat().map((i) => i.fx);

/** How long one agent stays on the working line before the next takes its turn. */
export const TURN_MS = 4000;

/**
 * The one agent the working line shows when several work: the one shown before while it still
 * works (`was`, its address), moved on by `step` turns. The list keeps its order, so they come
 * round in turn. Returns { agent, index, count } or null when no one works.
 */
export function onTurn(list, was = null, step = 0) {
  if (!list.length) return null;
  const at = list.findIndex((a) => a.address === was);
  const index = ((at < 0 ? 0 : at) + step) % list.length;
  return { agent: list[index], index, count: list.length };
}
