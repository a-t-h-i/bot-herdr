// bot-herdr: one mod, several views, picked by the layout block's props.
//   { "view": "chat" }      the chat page: every agent's replies and the composer (chat.js)
//   { "view": "switch" }    the Chat / Terminals / Settings switch in the top bar (switch.js)
//   { "view": "work", "tab": "tasks" | "plans" | "knowledge" }   the team's work (work.js)
//   { "view": "pick" }      a dropdown list, opened as a popup by Settings (pick.js)
//   { "view": "settings" }  the agents: harness, model, effort (settings.js)

import { View } from "gpui-kit";
import { props } from "herdr";
import { Chat } from "./chat.js";
import { Switch } from "./switch.js";
import { Settings } from "./settings.js";
import { Work } from "./work.js";
import { Pick } from "./pick.js";

const VIEWS = { chat: Chat, switch: Switch, work: Work, settings: Settings, pick: Pick };

export default class BotHerdr extends View {
  init(given, cx) {
    const p = given?.view ? given : props() ?? given ?? {};
    this.page = new (VIEWS[p.view] ?? Chat)();
    this.page.init(p, cx);
  }

  render(cx) {
    return this.page.render(cx);
  }
}
