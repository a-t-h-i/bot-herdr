# bot-herdr

A [herdr](https://github.com/herdrdev/herdr-app) desktop mod: a team of coding agents you talk to in one chat. Every agent runs on whatever harness and model you set up in herdr (Claude Code, Codex, pi, Oh My Pi, Gemini, …). An Orchestrator plans and hands work to Design, Dev, QA, Research and Scout, which can start child agents of their own. Tasks, plans, knowledge, shared scripts and a classifier come with it.

herdr mods are JavaScript that describe native GPUI elements, so everything here is drawn natively. There is no web view.

Agents run **headless** by default: each message runs the harness in its own non-interactive mode (Claude Code `-p`, `codex exec`, pi's JSON mode, or the Agent Client Protocol for Gemini, opencode and Qwen Code), so its answer comes straight back to the chat. Each agent still has its herdr terminal, which shows what it is doing; `/cli` there opens the harness's full CLI on the same conversation.

Its pages are switched from the top bar:

- **Chat**: one conversation with every agent, the composer, and agents' questions for you.
- **Terminals**: herdr's own panes, to work in any agent's terminal directly.
- **Tasks**, **Plans**, **Knowledge**: the task board, the planning panel's drafts and what each agent knows about the project.
- **Settings**: the team (harness, model and effort per agent), how agents run, harnesses and the classifier.

## Install

You need herdr, herdr-core (`hc`) and node 20 or later on your PATH.

```sh
git clone https://github.com/a-t-h-i/bot-herdr && cd bot-herdr
node install.mjs --switch
```

This copies `mods/bot-herdr` into herdr's app home (`~/.config/herdr-app`, or `$HERDR_APP_HOME`). It also adds the `bot-herdr` layout, its Claude light and dark themes plus Harbor, Fern, Plum and Dune (each light and dark), a few harnesses herdr's own table doesn't start from its menus (Oh My Pi, Droid, Qwen Code, Aider, Goose, Auggie, Cline: see `programs.json`), and **ctrl+shift+m** for the chat. Then it runs `herdr-app check` on the mod and switches the window to the layout. `ctrl+shift+l` cycles layouts.

Pick any other herdr theme (Graphite, Ink, Moss, Paper, Atom One Dark, Herdr 98 or a theme file of your own) in herdr's settings and every bot-herdr page follows it.

Run `node install.mjs` again after a `git pull`. A layout from before the Tasks, Plans and Knowledge pages is replaced (yours is kept as `bot-herdr.json.old`); otherwise your layout stays unless you pass `--force`. Harness entries are only added, never changed.

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

Each card shows the exact command. A change applies to an agent's next message when it runs headless (the next time it starts when it runs as its CLI), and also updates its herdr-core template (`hc templates` lists the team, and `hc run --bg dev "…"` starts Dev with its role and model).

| Harness | Model | Effort |
|---|---|---|
| Claude Code | `--model` | `--effort` (low to max, per model) |
| Codex | `-m` | `-c model_reasoning_effort=` (minimal to xhigh) |
| pi, Oh My Pi | `--model` | `--thinking` (off to xhigh) |
| Gemini, Qwen Code, opencode | `-m` | none: use extra arguments |
| anything else | `--model` | none: use extra arguments |

**How agents run**:

- **Headless** (the default) or **As their CLI**. Headless works for Claude Code, Codex, pi, Oh My Pi, Gemini, opencode and Qwen Code; any other harness runs as its CLI.
  - Antigravity (`agy`) runs as its CLI: its headless mode hangs without a terminal. It takes its first message after `-i`, and since it never reports a status to herdr, the chat counts its terminal as an agent anyway and shows it working from your message until its reply.
- **Access**: what a headless agent may do without asking, since no one is there to approve a prompt mid-turn.
  - **Standard** (the default): edit files in the project, read and search, run `bh` (which runs the project's lint, typecheck and tests with `bh check`) and `hc`, and read git. Anything else is refused and the agent tells you what it needed. Add commands under **Also allow** (`npm test, git add, git commit`).
  - **Full access**: anything, without asking. Only for a folder or machine you're happy to let agents loose in.
  - Claude Code and the ACP harnesses follow the list; Codex runs commands in its workspace-write sandbox; pi and Oh My Pi have no permission system and run as they would in a terminal.
  - Headless agents can't change these settings, the team or the harness table themselves: `bh` refuses them there.
- **Git isolation**: **Off** (the default; tasks work in the project folder), **Branch** (each new task gets a git branch named after it, checked out in the project folder) or **Worktree** (each new task gets its own worktree and branch under `.bot-herdr/worktrees/`, and every agent of the task runs there, apart from your checkout). `bh task new --branch|--worktree|--no-git` decides for one task. If git can't (not a repository, no commit yet), the task says why and runs without.

**Harnesses**: a harness herdr doesn't know can be added by its command; it is written to herdr's `programs.json` and listed everywhere within a minute.

**Classifier**: a fast model (Jev, on OpenCode Zen, TypeSafe, OpenRouter or the Vercel AI Gateway) makes the small calls: who answers a message that names no one, a task's size and track, each step's effort, how deep QA goes and which shared scripts help. It is off until you turn it on and give it a key (or set the host's key in your environment). Plain rules decide when it's off. The effort on each card is the ceiling: routing only lowers it.

## Chat

Your messages are on the right, with who they went to; a long one folds after twelve lines, with **Show more**. Agents' replies are on the left under their names, as Markdown. The feed is per space and kept across restarts.

**Mockups**: a ```` ```mockup ```` (or ```` ```html ````) block in a reply is drawn as a picture by a browser you already have (Chrome, Edge, Chromium or Brave, run headless; `BH_BROWSER` picks one). Click it to open it large, with the reply's other mockups beside it and **Open in browser**. With no browser found, the card says so and opens the page in your browser instead.

**Working**: one agent at a time, under the last message: its role's word ("Planning", "Writing", "Checking"…) shimmers in its colour beside a small motion that acts out the job, then its name and what it is doing. With several at work they take turns every few seconds (click **1 of 3** for the next). The word changes every 30 to 60 seconds.

**Toasts** rise out of the composer's top edge, one at a time, and sink back in. herdr's own notifications (an agent needs you or finished) come the same way while the chat shows (the layout names this mod as its `toast`); on another page they show in herdr's corner, drawn the same.

A headless agent's reply is its own last message of the turn, saved for the chat by its terminal; while it works, the chat shows what it is doing ("Dev: Read src/app.tsx"). An agent run as its CLI replies with `bh reply`, which writes the same file (`<app home>/data/bot-herdr/replies/<its address>.md`). An agent that stops without one, or that waits for you in its terminal, gets a line with **Open terminal**.

In a headless agent's terminal you can type to it too: **Enter** sends, **Esc** stops the turn (so does **/stop** in the chat), `/cli` opens the full CLI on the same conversation, `/new` starts a fresh one, `/exit` quits.

**Questions**: an agent asks with `bh ask` (numbered questions, options with what each means, a recommendation, and HTML mockups for anything you'll see). They grow out of the composer's top, one at a time: who asks and about what, **‹ Back**, where you are (**2 of 3**) and **Dismiss**. Click an option to answer and move on, or type your own answer and press **Enter**. Mockups show as a grid of pictures; the corner button opens them large, where **Choose this** (or Enter) picks one. **Esc** puts the questions away behind a bar (**Answer questions · 2 left**) that brings them back. Your answers go back together after the last question.

## The composer

- **Enter** sends, **Shift+Enter** starts a new line.
- A plain message goes to the space's **Orchestrator**, started in a tab of that name on the first message. With the classifier on, a message that clearly belongs to one agent (a styling question to Design) goes there instead, and the chat says so.
- **@** reaches anyone: the team (started if not running), any running agent, child agents under their parents, `@all`, or `@new-<harness>` for a plain one.
- **/task** hands the message to the team as a task; **/plan** has the panel plan it first. **/new**, **/settings**, **/all**, **/stop**, **/peek** and **/team** (send the brief again) work as before; any other `/command` goes to the agent as typed.
- Attach files by dropping them, "Attach document…" or "Attach folder…". Paste an image (or files copied in your file manager) to attach it: images show a preview on the composer that opens large on a click.

Each agent is briefed once: a headless one as its system prompt (Claude Code, pi) or in front of its first turn, one run as its CLI in front of its first message from here (a terminal label, `bot-herdr.briefed3`, remembers). The brief has its role, the team and how to start them as child agents, the bh tool, the project's knowledge and how to reply.

## Tasks, Plans and Knowledge

- **Tasks**: a list (under way, then finished; **Archived** switches to the archived ones) beside the chosen task: its steps with who did each and for how long, its branch or worktree, and your comments. Click a step to comment on it; the comment goes to the Orchestrator and stays under the step. **Resume** hands the task back to the Orchestrator; **Archive** hides it.
- **Plans**: the panel's drafts. Click any line to comment on it, or comment on the whole plan (the Orchestrator revises the draft), **Start task** once it is ready.
- **Knowledge**: what each agent is told about the project. The Orchestrator adds what agents learn; you can edit and save it.

Each page shows the project of the space you are looking at.

## The bh tool

Everything above lives in one command line, so every harness can use it: `node <app home>/mods/bot-herdr/engine/bh.mjs` (the briefs call it `bh`). `bh help` lists it all:

- `bh task new|list|show|steps|step|status|comment|resolve|archive`, `bh board post|read`: tasks, their steps (with active time), the person's comments, and a board for contracts, decisions, blockers and questions between agents.
- `bh plan new|show|write|comment|task`: the planning panel's drafts.
- `bh knowledge [add|note|write|search]`: one file per agent.
- `bh scripts [run|save|pick]`, `bh check`: shared scripts (repo map, symbol search, tests for what changed, failure digests, …) and lint, typecheck and tests for the change.
- `bh spawn <agent> --name <n> --task <id> --step <n> "<brief>"`: starts a team member as a child agent with `hc run`, with its harness, model, effort (`--effort auto` lets the classifier lower it) and role. A headless harness starts as `bh agent`, so `hc wait --children` sees each of its turns end.
- `bh agent <agent> [--mode lead|child] [-- "<first message>"]`: runs an agent headless in the current terminal (what the chat and `bh spawn` start).
- `bh ask`, `bh reply`, `bh classify route|triage|effort|qa-risk`, `bh brief`, `bh sync`, `bh access`.
- `bh mockup <file.html>`, `bh clip`, `bh preview <image>`: pictures for the chat (a mockup drawn by a headless browser, the clipboard's image, a copy herdr can show).

A project's tasks, plans, knowledge and scripts are kept in its `.bot-herdr/` folder. Your own data (the team, the classifier settings, replies and questions) is in `<app home>/data/bot-herdr/`.

## Files

| Path | What |
|---|---|
| `mods/bot-herdr/main.js` | picks the view from the block's props |
| `mods/bot-herdr/chat.js`, `composer.js` | the chat page and the composer |
| `mods/bot-herdr/work.js` | the Tasks, Plans and Knowledge pages |
| `mods/bot-herdr/settings.js` | the Settings page |
| `mods/bot-herdr/switch.js`, `pages.js` | the page switch |
| `mods/bot-herdr/roster.js`, `models.js` | the team, harness flags and model lists (tested) |
| `mods/bot-herdr/route.js`, `feed.js`, `brief.js` | what a send does, the feed, the fallback brief (tested) |
| `mods/bot-herdr/bh.js` | how the mod runs the bh tool |
| `mods/bot-herdr/engine/` | the bh tool: `lib/`, `classifier/`, `roles/`, `scripts/` (tested) |
| `mods/bot-herdr/engine/lib/runner.mjs`, `agent.mjs` | headless turns for each harness, and the agent terminal (tested against fake harnesses) |
| `mods/bot-herdr/pick.js` | the dropdown list Settings opens as a popup |
| `mods/bot-herdr/lightbox.js`, `media.js` | a picture opened large; mockups and images for the chat |
| `mods/bot-herdr/toast.js`, `toasts.js` | herdr's notifications; the toast queue (tested) |
| `mods/bot-herdr/indicators.js`, `working.js` | the working words and their motions (`icons/fx/`); which one shows (tested) |
| `mods/bot-herdr/drawer.js`, `doc.js` | the questions drawer's steps; a plan in pieces to comment on (tested) |
| `mods/bot-herdr/engine/lib/workspace.mjs`, `media.mjs` | git isolation for tasks; drawing mockups and the clipboard (tested) |
| `mods/bot-herdr/look.js`, `icons/` | colours, sizes, motion; Lucide icons (ISC licence) and the fillet shapes |
| `layouts/bot-herdr.json`, `themes/` | herdr's main layout with the switch and the pages; the Claude-style palette |
| `programs.json` | harnesses the installer adds to herdr's table |
| `test/*.test.mjs` | `npm test` |

## Not checked yet

This was written without a running herdr, so `herdr-app check` and a first look in the app are the real test. Most likely to need a tweak: the effort slider's dragging, the model list's look, the questions drawer's height (worked out from the words), the toast's spring, and the working motions' exact positions. Agents on another machine write replies and questions there, so those don't show here yet; open their terminal.

Headless mode is tested against fake harnesses that print each one's JSON. Real ones may differ: the ACP harnesses' model setting, Oh My Pi (assumed to match pi), and Windows' quoting of long tool lists are the first places to look if an agent errors on its first message. Its terminal shows the harness's own error. Codex's sandbox may also keep it from reaching `hc` (child agents, reports to its parent) in standard access.
