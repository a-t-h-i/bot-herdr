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

/**
 * The working animations: each activity its own glyph cycle and verbs, so a glance says what an
 * agent is doing. Every cycle is text frames on the one 120 ms tick (look.js TICK_MS); `slot`
 * is the glyph's fixed width in characters, so nothing beside it moves as the frames change.
 */
export const ACTIVITIES = {
  thinking: { frames: ["⠁", "⠂", "⠄", "⡀", "⢀", "⠠", "⠐", "⠈"], verbs: ["Thinking", "Weighing", "Mulling"] },
  reading: { frames: ["▖", "▘", "▝", "▗"], verbs: ["Reading", "Scanning"] },
  editing: { frames: ["▁", "▃", "▅", "▇", "▅", "▃"], verbs: ["Writing", "Shaping"] },
  testing: { frames: ["▱▱▱", "▰▱▱", "▰▰▱", "▰▰▰"], verbs: ["Testing", "Checking"] },
  waiting: { frames: ["·", "•", "●", "•"], verbs: ["Waiting"] },
  orchestrating: { frames: ["◜", "◝", "◞", "◟"], verbs: ["Coordinating"] },
};

/** The activities in the spec's order. */
export const ACTIVITY_NAMES = Object.keys(ACTIVITIES);

/** The glyph slot's width in characters: the widest frame of any cycle. */
export const GLYPH_CHARS = Math.max(...Object.values(ACTIVITIES).flatMap((a) => a.frames.map((f) => [...f].length)));

/** A verb shows for at least this long before the next takes its place. */
export const VERB_MS = 4000;

const TESTS = /\b(test|tests|check|lint|tsc|typecheck|vitest|jest|pytest|mocha|ui-audit|verify)\b/i;
const READS = /^(Read|Search|Find|List|Fetch|Search the web)\b/;
const EDITS = /^(Edit|Write)\b/;
const WAITS = /^(Wait|Waiting)\b|\b(hc wait|bh inbox|bh board read)\b/i;
const LEADS = /^(Start a subagent)\b|\b(bh spawn|bh brief|hc send|bh merge)\b/;

/**
 * What an agent is doing, from its latest activity line (runner.mjs toolLine: "Read src/a.js",
 * "Run npm test") and its role: one of ACTIVITY_NAMES. No line is thinking; an Orchestrator
 * between tools is coordinating.
 */
export function activityOf({ line = null, role = null } = {}) {
  const text = String(line ?? "").trim();
  const lead = roleOf(role) === "oracle";
  if (!text) return lead ? "orchestrating" : "thinking";
  if (WAITS.test(text)) return "waiting";
  if (LEADS.test(text)) return "orchestrating";
  if (/^Run\b/.test(text)) return TESTS.test(text) ? "testing" : lead ? "orchestrating" : "thinking";
  if (READS.test(text)) return "reading";
  if (EDITS.test(text)) return "editing";
  if (TESTS.test(text)) return "testing";
  return lead ? "orchestrating" : "thinking";
}

/**
 * The verb an activity shows at `now`: its verbs take turns on a VERB_MS clock, so a verb never
 * changes sooner than every 4 s. Waiting names who it waits on when `on` is given ("Waiting on QA").
 */
export function verbFor(activity, now = Date.now(), on = null) {
  const set = ACTIVITIES[activity] ?? ACTIVITIES.thinking;
  const verb = set.verbs[Math.floor(Math.max(0, Number(now) || 0) / VERB_MS) % set.verbs.length];
  return activity === "waiting" && on ? `${verb} on ${on}` : verb;
}

/** The longest verb any activity shows (waiting with its longest "on" name), for the verb slot's width. */
export function longestVerb(names = []) {
  const waits = names.map((n) => `Waiting on ${n}`);
  return [...Object.values(ACTIVITIES).flatMap((a) => a.verbs), ...waits].reduce((a, b) => (b.length > a.length ? b : a), "");
}

/** An activity's frames as drawn: the whole cycle, or only its first glyph while motion is reduced. */
export function framesFor(activity, reduced = false) {
  const set = ACTIVITIES[activity] ?? ACTIVITIES.thinking;
  return reduced ? [set.frames[0]] : set.frames.slice();
}

/** Who a waiting line names ("Wait on qa", "hc wait qa-m5"): the role's word, or null. */
export function waitingOn(line) {
  const m = /\b(?:wait(?:ing)?(?: on| for)?|hc wait)\s+@?([a-z][\w-]*)/i.exec(String(line ?? ""));
  if (!m) return null;
  const role = roleOf(m[1].split(/[-_]/)[0]);
  const names = { qa: "QA", dev: "Dev", design: "Design", scout: "Scout", research: "Research", planner: "Planner", oracle: "Orchestrator" };
  return names[role] ?? m[1];
}

/** The avatar's breathe while its agent works: opacity 0.7 to 1.0; null while it is not working. */
export function breatheFor(working) {
  return working ? { from: 0.7, to: 1, period: 2400, easing: "ease-in-out" } : null;
}
