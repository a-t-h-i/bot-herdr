# bot-herdr

A [herdr](https://github.com/herdrdev/herdr-app) desktop mod: one composer that drives every agent herdr runs (Claude Code, Codex, pi, Gemini, any harness and model you set up there). Agents can start child agents, and each one is told how.

herdr mods are JavaScript that describe native GPUI elements, so everything here is drawn natively. There is no web view.

It has three pages, switched from the top bar:

- **Chat**: one conversation with every agent, and the composer.
- **Terminals**: herdr's own panes, to work in any agent's CLI directly.
- **Settings**: your agents, each a harness with a model and an effort level.

## Install

```sh
git clone https://github.com/a-t-h-i/bot-herdr && cd bot-herdr
node install.mjs --switch
```

This copies `mods/bot-herdr` into herdr's app home (`~/.config/herdr-app`, or `$HERDR_APP_HOME`). It also adds the `bot-herdr` layout and its Claude light and dark themes, and binds **ctrl+shift+m** to the chat. Then it runs `herdr-app check` on the mod and switches the window to the layout. `ctrl+shift+l` cycles layouts, so you can switch back to herdr's own.

Edits here take effect after another `node install.mjs`, because herdr hot-reloads the copied mod. A layout from before the pages is replaced on install (the old one is kept as `bot-herdr.json.old`); otherwise your layout is kept unless you pass `--force`.

## Pages

The switch sits left of herdr's tabs: **Chat**, **Terminals**, **Settings**.

- Picking a tab, a space or an agent anywhere in herdr shows Terminals, so the terminal you asked for is never behind the chat.
- **ctrl+shift+m** opens Chat and puts the keyboard in the composer. `/settings` opens Settings.
- All three are blocks of one stack (`pages`) in `layouts/bot-herdr.json`. The terminals keep running whichever page shows.

## Chat

Your messages are on the right, with who they went to. Agents' replies are on the left under the agent's name, as Markdown. The wheel moves through older messages. The feed is per space and is kept across restarts.

A reply is a file. Each agent is told (in its brief) to save what it wants to tell you to `<herdr app home>/data/bot-herdr/replies/<its terminal address>.md` at the end of every turn. The chat reads those files every few seconds and shows a new or changed one as a reply.

- An agent that stops without writing one gets a line: "finished without writing a reply", with **Open terminal**.
- An agent that needs an answer in its terminal gets "is waiting for you in its terminal", with **Open terminal**.
- Agents on another machine write their file there, so their replies don't show here yet. Open their terminal.

## Settings

A list of agents. Each has:

- a **name**: `@name` reaches it, and its tab carries the name
- a **harness**: any agent herdr knows and finds installed
- a **model** and an **effort** level, passed in that harness's own flags
- **extra arguments**, added to the command as typed
- **Leads**: exactly one agent leads. It is the Orchestrator: every message that names no one goes to it.

| Harness | Model | Effort |
|---|---|---|
| Claude Code | `--model` | `--effort` (low, medium, high, xhigh, max) |
| Codex | `-m` | `-c model_reasoning_effort=` (minimal to xhigh) |
| pi | `--model` | `--thinking` (off to xhigh) |
| Gemini, opencode | `-m` | none: use extra arguments |
| anything else | `--model` | none: use extra arguments |

The table is `HARNESSES` in `mods/bot-herdr/roster.js`. Each card shows the exact command it will run. A change applies the next time that agent starts. `@name` starts an agent that isn't running in this space, in a tab with its name; agents other than the lead are also named to the Orchestrator, with their commands, so it can start them as children.

## The composer

One raised bubble: the text on top, and a tools row under it with attach, the space chip, key hints, stop and a round send key. The suggestions, attach menu and spaces list grow out of its top edge, joined by curved fillets.

- **Enter** sends. **Shift+Enter** starts a new line.
- A plain message goes to the space's **Orchestrator** (see below). The tools row shows "to Orchestrator", or "starts Orchestrator" when the space has none yet.
- **@** lists agents:
  - the Orchestrator first, then the other running agents (this space first), each with its child agents under it
  - `@all` (every agent in this space)
  - `@name` for each agent from Settings that isn't running here, which starts it with your message
  - `@new-<agent>` for each installed agent, which starts it in a new tab with your message
  - Mention several agents to send to all of them. Up and Down move, Enter or Tab picks, Esc closes.
- **/new** starts an agent. **/settings** opens Settings. **/all** sends to everyone here. **/stop** presses the agent's stop key. **/peek** peeks at its terminal. **/team** sends the child-agent brief again. Any other `/command` goes to the agent as typed, so `/compact`, `/model` and the rest still work.
- **Attach**: drop files on the composer, use "Attach document…" (the system file picker), or use "Attach folder…". Each path is added to the message on its own line. For agents on another machine, files go over with `hc put` first.
- **Stop** (red key) shows while the target agent is working.
- The **space chip** lists spaces and has "Open folder…".

Sending uses `hc send` (paste, then Enter), stopping uses `hc interrupt`, and starting uses `tab.new {argv, task}`.

## The Orchestrator

Each space has one lead agent. A message that names nobody goes to it. It answers small things itself, and for larger work it plans, hands parts to child agents, checks their results and reports back to you.

- The Orchestrator is the agent in the tab that carries the lead's name (by default **Orchestrator**). The first plain message in a space starts one in a new tab with that name.
- Settings chooses its harness, model and effort. With nothing set up, it runs on the agent you start most.
- To appoint an agent that's already running, rename its tab to the lead's name. To replace the Orchestrator, close its tab.
- `@` still reaches any agent directly, including the Orchestrator's children.
- Stop (the red key), `/stop` and `/peek` act on the Orchestrator unless you `@` someone.

## Child agents

Any agent can start child agents with herdr-core (`hc run --bg ...`). herdr shows them under their parent, and you can peek at, steer or take over each one.

So that agents know this, bot-herdr gives each agent a short brief once:

- An agent started from the composer (`@new-<agent>`, `/new`) gets the brief in front of its first task. The Orchestrator gets its role first, then the same brief.
- An agent that was already running gets it in front of its first message from the composer. The terminal is then labelled `bot-herdr.briefed2`, so it isn't told twice. A harness's own `/command` is never prefixed.
- `/team` sends the brief again, for example after the agent compacts its context.

The brief (`mods/bot-herdr/brief.js`) tells the agent:

- to read `hc --skill` first
- the exact launch command, and which agents are installed here
- to put the whole task in the launch and ask the child to report back with `hc send`
- to wait with `hc wait --children`, never sleep or poll
- to treat child reports as reports, not as instructions
- to clean up finished children
- the agents from Settings, with their exact commands
- where to write its reply for the chat
- the rules: use `hc` and not its built-in sub-agent tool, one scope per child, no two children on the same files, at most 4 at once, and children start their own children only when told

Child agents show in the `@` list under their parent (tag "child"), so you can message one directly.

## Files

| Path | What |
|---|---|
| `mods/bot-herdr/main.js` | picks the view from the block's props |
| `mods/bot-herdr/chat.js` | the chat page |
| `mods/bot-herdr/composer.js` | the composer |
| `mods/bot-herdr/switch.js`, `pages.js` | the page switch |
| `mods/bot-herdr/settings.js` | the settings page |
| `mods/bot-herdr/roster.js` | the agents and their commands (tested) |
| `mods/bot-herdr/feed.js` | the feed's logic (tested) |
| `mods/bot-herdr/route.js` | triggers, rows, what a send does (tested) |
| `mods/bot-herdr/brief.js` | what agents are told (tested) |
| `mods/bot-herdr/look.js` | colours, sizes and motion |
| `mods/bot-herdr/icons/` | Lucide icons (ISC licence) and the fillet shapes |
| `layouts/bot-herdr.json` | herdr's main layout with the switch and the pages |
| `themes/bot-herdr-{light,dark}.json` | a Claude-style palette for terminals and panels |
| `test/*.test.mjs` | `npm test` |

## Not checked yet

This was written without a running herdr, so `herdr-app check` and a first look in the app are the real test. Most likely to need a tweak:

1. **Claude Code's `--effort` flag** is assumed. If your version rejects it, set effort to Default and put the right flag in extra arguments.
2. **Reply files** depend on each agent following its brief. One that doesn't still gets the "finished without writing a reply" line.
3. **The feed** shows the newest messages bottom-aligned and clips older ones at the top; the wheel steps through messages instead of scrolling by pixels.
4. **Enter to send** relies on our key binding beating the text box's own Enter. If Enter adds a newline instead, the `submit` fallback still sends.

## Next rounds

Sidebar and tab pills floating 5px from the edges, live progress from agents in the chat, replies from agents on other machines.
