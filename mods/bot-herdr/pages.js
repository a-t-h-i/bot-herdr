// The pages of the bot-herdr layout: the top bar's five destinations (Home, Threads, Agents,
// Library, and Settings behind the gear), the sub-tab open inside a destination, and where a view
// that used to be its own destination is reached from now. Pure helpers plus the two calls that
// switch, shared by every view.

import { layout, run, shared, setShared } from "herdr";

export const STACK = "pages";
/** The outer stack: the five destinations, or herdr's own terminals (Agents › Terminals). */
export const STAGE = "stage";

/** The top bar's destinations, in order; Settings is the gear after them. */
export const PAGES = [
  { id: "home", icon: "page-home", label: "Home" },
  { id: "threads", icon: "page-chat", label: "Threads" },
  { id: "agents", icon: "users", label: "Agents" },
  { id: "library", icon: "page-library", label: "Library" },
  { id: "settings", icon: "page-settings", label: "Settings", gear: true },
];

/**
 * Where each view that used to be its own destination lives now: the destination, and the
 * sub-tab inside it. `showPage` takes both names, so a link anywhere in the app keeps working.
 */
const WHERE = {
  // The Orchestrator chat, a task and a plan are each a thread: Threads lists them and opens one.
  chat: ["threads"],
  tasks: ["threads"],
  plans: ["threads"],
  terminals: ["agents", "terminals"],
  knowledge: ["library", "knowledge"],
  learning: ["library", "learning"],
  scripts: ["library", "scripts"],
  issues: ["library", "issues"],
  metrics: ["settings", "usage"],
};

/** The sub-tab open inside a destination: { library: "issues", settings: "usage" }. */
export const SUB = "bot-herdr.sub";
/** Set (to the time) when a view wants the composer to take the keyboard. */
export const FOCUS = "bot-herdr.focus";
/** Set (to the time) when we change herdr's focus ourselves, so the switch stays on Threads. */
export const HOLD = "bot-herdr.hold";
/** A message another page wants sent the chat's way ({ text, at }): the composer sends it. */
export const OUTGOING = "bot-herdr.outgoing";
/** A task to show open on its thread: { id, at } (the chat's task widget sets it). */
export const OPEN_TASK = "bot-herdr.open-task";
/** The thread Threads should open: { id, at }; the id "orchestrator" is the Orchestrator's chat. */
export const OPEN_THREAD = "bot-herdr.open-thread";

/** The sub-tab `dest` is showing, or null when it does not remember one. */
export function subOf(dest, all = shared(SUB)) {
  const sub = all && typeof all === "object" ? all[/** @type {string} */ (dest)] : null;
  return typeof sub === "string" ? sub : null;
}

/** Remembers a destination's sub-tab, for when it is opened again. */
export function setSub(dest, sub) {
  const all = /** @type {Record<string, string> | null} */ (shared(SUB)) ?? {};
  if (!sub || all[dest] === sub) return;
  setShared(SUB, { ...(typeof all === "object" ? all : {}), [dest]: sub });
}

export function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

/** The destination that is showing, or null when this layout has no pages. */
export function activePage(root = layout()) {
  const stack = find(root, STACK);
  if (!stack) return null;
  return stack.active ?? stack.children?.[0]?.id ?? null;
}

/** What the stage holds: the destinations ("pages") or herdr's terminals. */
export function activeStage(root = layout()) {
  const stack = find(root, STAGE);
  if (!stack) return STACK;
  return stack.active ?? stack.children?.[0]?.id ?? STACK;
}

const VIEW_AT = {
  knowledge: ["library", "knowledge"],
  learning: ["library", "learning"],
  scripts: ["library", "scripts"],
  issues: ["library", "issues"],
  metrics: ["settings", "usage"],
};

/**
 * Whether a view is the one on screen: its destination is open and, when it lives in a sub-tab,
 * that sub-tab is the one showing. A view refreshes only while it is.
 */
export function viewShown(id, root = layout()) {
  const dest = activePage(root);
  if (dest === id) return true;
  const at = VIEW_AT[id];
  return Boolean(at) && at[0] === dest && subOf(at[0]) === at[1];
}

/**
 * Shows a destination, or the view that used to be one: "chat" opens the Orchestrator's thread
 * with the keyboard in its composer, "tasks" and "plans" the thread list, "issues" Library ›
 * Issues, "metrics" Settings › Usage.
 */
export function showPage(id) {
  const where = WHERE[id];
  const dest = where ? where[0] : id;
  const sub = where?.[1] ?? null;
  if (sub) setSub(dest, sub);
  if (id === "chat") setShared(OPEN_THREAD, { id: "orchestrator", at: Date.now() });
  run("layout.select", { stack: STAGE, child: sub === "terminals" ? "terminals" : STACK });
  run("layout.select", { stack: STACK, child: dest });
  if (id === "chat") setShared(FOCUS, Date.now());
}

/** Agents › Fleet | Terminals: Terminals is herdr's own pane stage, so the stage switches. */
export function showAgentsTab(id) {
  if (id === "terminals") {
    run("layout.select", { stack: STAGE, child: "terminals" });
    run("layout.select", { stack: STACK, child: "agents" });
    return;
  }
  run("layout.select", { stack: STAGE, child: STACK });
  run("layout.select", { stack: STACK, child: "agents" });
}

/** Settings, on one of its sections ("agents", "general", "usage", "resilience", "harnesses"). */
export function showSettings(section = null) {
  if (section) setSub("settings", section);
  showPage("settings");
}

/** Opens a thread on Threads (its Conversation); with no id, the thread list. */
export function openThread(id) {
  if (id) setShared(OPEN_THREAD, { id: String(id), at: Date.now() });
  showPage("threads");
}

/** Shows an agent's own terminal on Agents › Terminals. */
export function openTerminal(address) {
  showPage("terminals");
  run("agent.focus", { terminal: address });
}

/** Sends a message as if typed in the chat (to the Orchestrator, unless it @s someone), and shows the chat. */
export function sendFromChat(text) {
  setShared(OUTGOING, { text, at: Date.now() });
  showPage("chat");
}

/** Asks the Orchestrator to make an agreed plan a task and start it (Plans page and plan sheet). */
export const startPlanTask = (p) => sendFromChat(`The plan ${p.id} ("${p.title}") is agreed: make it a task (bh plan task ${p.id}) and start it.`);

/** Asks the Orchestrator to start an agreed Ready plan as a relentless Goal loop with a spend ceiling. */
export const startPlanGoal = (p, { maxSpendUsd = 15 } = {}) =>
  sendFromChat(`The plan ${p.id} ("${p.title}") is agreed as a Goal: start it with \`bh plan task ${p.id} --as goal --max-spend ${maxSpendUsd}\` and run the verification loop until all DONE criteria pass.`);

/** Wakes the Orchestrator when the user clicks Resume on a paused Goal in the Tasks workbench. */
export const wakeGoal = (t) =>
  sendFromChat(`Resume goal ${t.id} ("${t.title ?? t.id}"): check \`bh goal status ${t.id}\` and continue the verification loop.`);

/** We are about to move herdr's focus (a new tab, another space): keep the Threads page up. */
export function hold() {
  setShared(HOLD, Date.now());
}
