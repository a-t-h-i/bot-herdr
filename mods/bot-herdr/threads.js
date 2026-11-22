// Threads: one task, its plan and its conversation are one thread, and this is where they open.
// The thread list and the thread view land in the next step; until then this destination is the
// Orchestrator's chat, unchanged, so every conversation is still one key away. The seam for that
// step: this class owns the thread list and the chosen thread, `openThread` (pages.js) picks one,
// and the body below becomes the thread's Conversation | Plan | Steps | Changes sub-tabs.

import { Chat } from "./chat.js";
import { safeRender } from "./render-safe.js";
import { colors } from "./theme.js";
import { stateView } from "./switch.js";

export class Threads {
  init(given, cx) {
    this.chat = new Chat();
    this.chat.init({ ...(given ?? {}), view: "chat" }, cx);
  }

  /** The chat's own node, wrapped in this page's render-safe boundary. */
  render(cx) {
    const { node, error } = safeRender(this.chat, cx, {
      view: "threads",
      onError: (rec) => {
        try {
          console.error(`bot-herdr [render:${rec.view}]: ${rec.message}`);
        } catch {
          // Never throw while reporting.
        }
      },
    });
    if (error) return stateView(colors(), { id: "bh-threads-error", title: "This view could not be drawn", line: error.detail });
    return node;
  }
}
