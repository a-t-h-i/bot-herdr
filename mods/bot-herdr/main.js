// bot-herdr: one mod, several views, picked by the layout block's props.
//   { "view": "chat" }      the chat page: every agent's replies and the composer (chat.js)
//   { "view": "switch" }    the Chat / Terminals / Settings switch in the top bar (switch.js)
//   { "view": "work", "tab": "tasks" | "plans" | "knowledge" }   the team's work (work.js)
//   { "view": "pick" }      a dropdown list, opened as a popup by Settings (pick.js)
//   { "view": "settings" }  the agents: harness, model, effort (settings.js)
//   { "view": "settings-more" }  a settings card's More, as a dialog (settings.js)
//   { "view": "lightbox" }  a picture opened large, as a dialog (lightbox.js)
//   { "view": "file" }      a file named in a message, opened read only, as a dialog (viewer.js)
//   { "view": "plan" }      a plan's draft opened in its own window (plandoc.js)
//   { "view": "note" }      a new knowledge note, as a dialog (noteform.js)
//   (no view)               herdr's notifications: the layout's "toast" mod (toast.js)

import { View } from "gpui-kit";
import { props } from "herdr";
import { Chat } from "./chat.js";
import { Switch } from "./switch.js";
import { Settings, MoreSheet } from "./settings.js";
import { Work } from "./work.js";
import { Pick } from "./pick.js";
import { Lightbox } from "./lightbox.js";
import { NoteForm } from "./noteform.js";
import { Toast, isNotification } from "./toast.js";
import { FileView } from "./viewer.js";
import { PlanDoc } from "./plandoc.js";

const VIEWS = { chat: Chat, switch: Switch, work: Work, settings: Settings, pick: Pick, lightbox: Lightbox, toast: Toast, file: FileView, plan: PlanDoc, note: NoteForm, "settings-more": MoreSheet };

export default class BotHerdr extends View {
  init(given, cx) {
    const p = given?.view ? given : props() ?? given ?? {};
    this.page = new (VIEWS[p.view] ?? (isNotification(p) ? Toast : Chat))();
    this.page.init(p, cx);
  }

  render(cx) {
    return this.page.render(cx);
  }
}
