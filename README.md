# bot-herdr

A [herdr](https://github.com/herdrdev/herdr-app) desktop mod: a team of coding agents you talk to in one chat. Every agent runs on whatever harness and model you set up in herdr (Claude Code, Codex, pi, Oh My Pi, Gemini, …). An Orchestrator plans and hands work to Design, Dev, QA, Research and Scout, which can start child agents of their own. Tasks, plans, knowledge, shared scripts and a classifier come with it.

herdr mods are JavaScript that describe native GPUI elements, so everything here is drawn natively. There is no web view.

It has four pages, switched from the top bar:

- **Chat**: one conversation with every agent, the composer, and agents' questions for you.
- **Terminals**: herdr's own panes, to work in any agent's CLI directly.
- **Tasks**: the task board, the plans and what each agent knows about the project.
- **Settings**: the team (harness, model and effort per agent), harnesses and the classifier.

## Install

You need herdr, herdr-core (`hc`) and node 20 or later on your PATH.

```sh
git clone https://github.com/a-t-h-i/bot-herdr && cd bot-herdr
node install.mjs --switch
```

This copies `mods/bot-herdr` into herdr's app home (`~/.config/herdr-app`, or `$HERDR_APP_HOME`). It also adds the `bot-herdr` layout, its Claude light and dark themes, a few harnesses herdr's own table doesn't start from its menus (Oh My Pi, Droid, Qwen Code, Aider, Goose, Auggie, Cline: see `programs.json`), and **ctrl+shift+m** for the chat. Then it runs `herdr-app check` on the mod and switches the window to the layout. `ctrl+shift+l` cycles layouts.

Run `node install.mjs` again after a `git pull`. A layout from before the Tasks page is replaced (yours is kept as `bot-herdr.json.old`); otherwise your layout stays unless you pass `--force`. Harness entries are only added, never changed.

## The team

| Agent | Does |
|---|---|
| **Orchestrator** | Gets every message that names no one. Answers small things itself; for larger work it starts a task or a plan, hands steps to the others, checks the results, runs the QA gate and commits. |
| **Design** | Everything in the browser: pages, components, styling, client logic, accessibility. |
| **Dev** | Server side: APIs, data, integrations, security. |
| **QA** | The quality gate: review and tests, as deep as the change's risk. |
| **Research** | Outside facts (libraries, versions, APIs), each with a source. |
| **Scout** | Reads the code and explains how something works. |

You can add your own agents beside them. Each one's role prompt is in `mods/bot-herdr/engine/roles/`.

## Settings

The agents are a grid of cards, three to a row. Each card has:

- **Harness**: any harness herdr finds installed.
- **Model**: pick from the harness's list (Claude Code, Codex and Antigravity have theirs built in; pi and Oh My Pi are asked with `--list-models`), or type any id.
- **Effort**: a slider over the levels that harness and model take. Default leaves it to the harness.
- **Extra arguments**, added to the command as typed.

Each card shows the exact command. A change applies the next time that agent starts, and also updates its herdr-core template (`hc templates` lists the team, and `hc run --bg dev "…"` starts Dev with its role and model).

| Harness | Model | Effort |
|---|---|---|
| Claude Code | `--model` | `--effort` (low to max, per model) |
| Codex | `-m` | `-c model_reasoning_effort=` (minimal to xhigh) |
| pi, Oh My Pi | `--model` | `--thinking` (off to xhigh) |
| Gemini, Qwen Code, opencode | `-m` | none: use extra arguments |
| anything else | `--model` | none: use extra arguments |

**Harnesses**: a harness herdr doesn't know can be added by its command; it is written to herdr's `programs.json` and listed everywhere within a minute.

**Classifier**: a fast model (Jev, on OpenCode Zen, TypeSafe, OpenRouter or the Vercel AI Gateway) makes the small calls: who answers a message that names no one, a task's size and track, each step's effort, how deep QA goes and which shared scripts help. It is off until you turn it on and give it a key (or set the host's key in your environment). Plain rules decide when it's off. The effort on each card is the ceiling: routing only lowers it.

## Chat

Your messages are on the right, with who they went to; agents' replies are on the left under their names, as Markdown. The feed is per space and kept across restarts.

An agent's reply is the file it writes at the end of each turn with `bh reply` (`<app home>/data/bot-herdr/replies/<its address>.md`). An agent that stops without one, or that waits for you in its terminal, gets a line with **Open terminal**.

**Questions**: an agent asks with `bh ask` (numbered questions, options with what each means, a recommendation, and HTML mockups for anything you'll see). They show as a card above the composer: pick options, type your own answer, open a mockup in your browser, then **Send answers**. Anything left open is the agent's call.

## The composer

- **Enter** sends, **Shift+Enter** starts a new line.
- A plain message goes to the space's **Orchestrator**, started in a tab of that name on the first message. With the classifier on, a message that clearly belongs to one agent (a styling question to Design) goes there instead, and the chat says so.
- **@** reaches anyone: the team (started if not running), any running agent, child agents under their parents, `@all`, or `@new-<harness>` for a plain one.
- **/task** hands the message to the team as a task; **/plan** has the panel plan it first. **/new**, **/settings**, **/all**, **/stop**, **/peek** and **/team** (send the brief again) work as before; any other `/command` goes to the agent as typed.
- Attach files by dropping them, "Attach document…" or "Attach folder…".

Each agent is briefed once, in front of its first message from here (a terminal label, `bot-herdr.briefed3`, remembers): its role, the team and how to start them as child agents, the bh tool, the project's knowledge and how to reply.

## Tasks page

- **Tasks**: a board of Backlog, In progress and Completed. A task opens to its steps, with who did each and for how long. **Resume** hands it back to the Orchestrator; **Archive** hides it.
- **Plans**: the panel's drafts. Read one, comment on it (the Orchestrator revises the draft), **Start task** once it is ready.
- **Knowledge**: what each agent is told about the project. The Orchestrator adds what agents learn; you can edit and save it.

The page shows the project of the space you are looking at.

## The bh tool

Everything above lives in one command line, so every harness can use it: `node <app home>/mods/bot-herdr/engine/bh.mjs` (the briefs call it `bh`). `bh help` lists it all:

- `bh task new|list|show|steps|step|status|archive`, `bh board post|read`: tasks, their steps (with active time) and a board for contracts, decisions, blockers and questions between agents.
- `bh plan new|show|write|comment|task`: the planning panel's drafts.
- `bh knowledge [add|note|write|search]`: one file per agent.
- `bh scripts [run|save|pick]`, `bh check`: shared scripts (repo map, symbol search, tests for what changed, failure digests, …) and lint, typecheck and tests for the change.
- `bh spawn <agent> --name <n> --task <id> --step <n> "<brief>"`: starts a team member as a child agent with `hc run`, with its harness, model, effort (`--effort auto` lets the classifier lower it) and role.
- `bh ask`, `bh reply`, `bh classify route|triage|effort|qa-risk`, `bh brief`, `bh sync`.

A project's tasks, plans, knowledge and scripts are kept in its `.bot-herdr/` folder. Your own data (the team, the classifier settings, replies and questions) is in `<app home>/data/bot-herdr/`.

## Files

| Path | What |
|---|---|
| `mods/bot-herdr/main.js` | picks the view from the block's props |
| `mods/bot-herdr/chat.js`, `composer.js` | the chat page and the composer |
| `mods/bot-herdr/work.js` | the Tasks page |
| `mods/bot-herdr/settings.js` | the Settings page |
| `mods/bot-herdr/switch.js`, `pages.js` | the page switch |
| `mods/bot-herdr/roster.js`, `models.js` | the team, harness flags and model lists (tested) |
| `mods/bot-herdr/route.js`, `feed.js`, `brief.js` | what a send does, the feed, the fallback brief (tested) |
| `mods/bot-herdr/bh.js` | how the mod runs the bh tool |
| `mods/bot-herdr/engine/` | the bh tool: `lib/`, `classifier/`, `roles/`, `scripts/` (tested) |
| `mods/bot-herdr/look.js`, `icons/` | colours, sizes, motion; Lucide icons (ISC licence) and the fillet shapes |
| `layouts/bot-herdr.json`, `themes/` | herdr's main layout with the switch and the pages; the Claude-style palette |
| `programs.json` | harnesses the installer adds to herdr's table |
| `test/*.test.mjs` | `npm test` |

## Not checked yet

This was written without a running herdr, so `herdr-app check` and a first look in the app are the real test. Most likely to need a tweak: the effort slider's dragging, the model list's look, and the question card's height in a short window. Agents on another machine write replies and questions there, so those don't show here yet; open their terminal.
