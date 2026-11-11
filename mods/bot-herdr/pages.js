// The pages of the bot-herdr layout: a stack with the chat, herdr's terminals, the team's work
// (tasks, plans, knowledge) and the settings.
// Pure helpers plus the two calls that switch, shared by every view.

import { layout, run, setShared } from "herdr";

export const STACK = "pages";
export const PAGES = [
  { id: "chat", label: "Chat" },
  { id: "terminals", label: "Terminals" },
  { id: "tasks", label: "Tasks" },
  { id: "plans", label: "Plans" },
  { id: "knowledge", label: "Knowledge" },
  { id: "settings", label: "Settings" },
];
/** Set (to the time) when a view wants the composer to take the keyboard. */
export const FOCUS = "bot-herdr.focus";
/** Set (to the time) when we change herdr's focus ourselves, so the switch stays on Chat. */
export const HOLD = "bot-herdr.hold";
/** A message another page wants sent the chat's way ({ text, at }): the composer sends it. */
export const OUTGOING = "bot-herdr.outgoing";
/** A task to show open on the Tasks page: { id, at } (the chat's task widget sets it). */
export const OPEN_TASK = "bot-herdr.open-task";

export function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

/** The page that is showing, or null when this layout has no pages. */
export function activePage(root = layout()) {
  const stack = find(root, STACK);
  if (!stack) return null;
  return stack.active ?? stack.children?.[0]?.id ?? null;
}

export function showPage(id) {
  run("layout.select", { stack: STACK, child: id });
  if (id === "chat") setShared(FOCUS, Date.now());
}

/** Shows an agent's own terminal on the Terminals page. */
export function openTerminal(address) {
  run("layout.select", { stack: STACK, child: "terminals" });
  run("agent.focus", { terminal: address });
}

/** Sends a message as if typed in the chat (to the Orchestrator, unless it @s someone), and shows the chat. */
export function sendFromChat(text) {
  setShared(OUTGOING, { text, at: Date.now() });
  showPage("chat");
}

/** We are about to move herdr's focus (a new tab, another space): keep the Chat page up. */
export function hold() {
  setShared(HOLD, Date.now());
}
