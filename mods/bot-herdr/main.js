// bot-herdr: one mod, three views, picked by the layout block's props.
//   { "view": "chat" }      the chat page: every agent's replies and the composer (chat.js)
//   { "view": "switch" }    the Chat / Terminals / Settings switch in the top bar (switch.js)
//   { "view": "settings" }  the agents: harness, model, effort (settings.js)

import { View } from "gpui-kit";
import { props } from "herdr";
import { Chat } from "./chat.js";
import { Switch } from "./switch.js";
import { Settings } from "./settings.js";

const VIEWS = { chat: Chat, switch: Switch, settings: Settings };

export default class BotHerdr extends View {
  init(given, cx) {
    const view = (given ?? props())?.view ?? props()?.view ?? "chat";
    this.page = new (VIEWS[view] ?? Chat)();
    this.page.init(given, cx);
  }

  render(cx) {
    return this.page.render(cx);
  }
}
