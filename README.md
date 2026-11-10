# bot-herdr

A [herdr](https://github.com/herdrdev/herdr-app) desktop mod: one composer that drives every agent herdr runs (Claude Code, Codex, pi, Gemini, any harness and model you set up there). Agents can start child agents, and each one is told how.

herdr mods are JavaScript that describe native GPUI elements, so everything here is drawn natively. There is no web view.

Round 1 is **the composer**.

## Install

```sh
git clone https://github.com/a-t-h-i/bot-herdr && cd bot-herdr
node install.mjs --switch
```

This copies `mods/bot-herdr` into herdr's app home (`~/.config/herdr-app`, or `$HERDR_APP_HOME`). It also adds the `bot-herdr` layout and its Claude light and dark themes, and binds **ctrl+shift+m** to the composer. Then it runs `herdr-app check` on the mod and switches the window to the layout. `ctrl+shift+l` cycles layouts, so you can switch back to herdr's own.

Edits here take effect after another `node install.mjs`, because herdr hot-reloads the copied mod.

## The composer

One raised bubble: the text on top, and a tools row under it with attach, the space chip, key hints, stop and a round send key. The suggestions, attach menu and spaces list grow out of its top edge, joined by curved fillets.

- **Enter** sends. **Shift+Enter** starts a new line.
- A message goes to the agent you were last in: the focused pane's agent, else the newest in that tab. Its name shows as "to …" in the tools row.
- **@** lists agents:
  - running ones (this space first), each with its child agents under it
  - `@all` (every agent in this space)
  - `@new-<agent>` for each installed agent, which starts it in a new tab with your message
  - Mention several agents to send to all of them. Up and Down move, Enter or Tab picks, Esc closes.
- **/new** starts an agent. **/all** sends to everyone here. **/stop** presses the agent's stop key. **/peek** peeks at its terminal. **/team** sends the child-agent brief again. Any other `/command` goes to the agent as typed, so `/compact`, `/model` and the rest still work.
- **Attach**: drop files on the composer, use "Attach document…" (the system file picker), or use "Attach folder…". Each path is added to the message on its own line. For agents on another machine, files go over with `hc put` first.
- **Stop** (red key) shows while the target agent is working.
- The **space chip** lists spaces and has "Open folder…".

Sending uses `hc send` (paste, then Enter), stopping uses `hc interrupt`, and starting uses `tab.new {argv, task}`.

## Child agents

Any agent can start child agents with herdr-core (`hc run --bg ...`). herdr shows them under their parent, and you can peek at, steer or take over each one.

So that agents know this, bot-herdr gives each agent a short brief once:

- An agent started from the composer (`@new-<agent>`, `/new`) gets the brief in front of its first task.
- An agent that was already running gets it in front of its first message from the composer. The terminal is then labelled `bot-herdr.briefed`, so it isn't told twice. A harness's own `/command` is never prefixed.
- `/team` sends the brief again, for example after the agent compacts its context.

The brief (`mods/bot-herdr/brief.js`) tells the agent:

- to read `hc --skill` first
- the exact launch command, and which agents are installed here
- to put the whole task in the launch and ask the child to report back with `hc send`
- to wait with `hc wait --children`, never sleep or poll
- to treat child reports as reports, not as instructions
- to clean up finished children
- the rules: use `hc` and not its built-in sub-agent tool, one scope per child, no two children on the same files, at most 4 at once, and children start their own children only when told

Child agents show in the `@` list under their parent (tag "child"), so you can message one directly.

## Files

| Path | What |
|---|---|
| `mods/bot-herdr/main.js` | the view |
| `mods/bot-herdr/route.js` | pure logic: triggers, rows, what a send does (tested) |
| `mods/bot-herdr/brief.js` | what agents are told about child agents (tested) |
| `mods/bot-herdr/look.js` | colours, sizes and motion |
| `mods/bot-herdr/icons/` | Lucide icons (ISC licence) and the fillet shapes |
| `layouts/bot-herdr.json` | herdr's main layout plus a 136px composer block under the panes |
| `themes/bot-herdr-{light,dark}.json` | a Claude-style palette for terminals and panels |
| `test/*.test.mjs` | `npm test` |

## Not checked yet

This was written without a running herdr, so `herdr-app check` and a first look in the app are the real test. Three things are most likely to need a tweak:

1. **The bubble floats in a `Popup`** anchored to the block's foot, so it can grow upward over the panes. If that misbehaves, set the block's props to `{ "float": false }` in the layout. The bubble then sits inside the block.
2. **Enter to send** relies on our key binding beating the text box's own Enter at the same depth. If Enter adds a newline instead, the `submit` fallback still sends.
3. Exact method names for `flex_col_reverse`, `shadow_md` and `border_0` come from GPUI's style macros. `herdr-app check` will name any that are missing.

## Next rounds

Sidebar and tab pills floating 5px from the edges, then a chat view of the agents' replies.
