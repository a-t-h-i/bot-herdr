# Herdr Harness Plugin — Design Language

Nov 21, 2026 · @Athenkosi Hlubi

## Purpose

This doc is the standard for redesigning bot-herdr's UI. The main goal is a calmer, less cluttered app that keeps its warm, plain-spoken character. It also adopts the patterns that the newest harnesses have settled on for running many agents at once, with Claude Code desktop as the main benchmark. Everything must be buildable in GPUI through the herdr-app mod API.

How the agents use it:

- **Orchestrator** reads the whole doc before planning, and cites section names in every task brief it hands down.
- **Dev and Design** treat Foundations and Components as hard rules and Principles as tie-breakers.
- **Anything new** (a token, a glyph, a component) is proposed in the change itself, never hard-coded around the system.
- **Herdr app conventions** apply on top: mods are JS files under `~/.config/herdr-app/mods/`, themes and layouts are files, and each shipped mod carries a RECIPE.md another agent could rebuild it from.

Scope: the desktop mod, the headless Herdr TUI on the VPS, and the mobile client. One state and thread model across all three; only density changes.

## Current flavour: keep it, cut the noise

bot-herdr already has a clear identity. The redesign keeps every trait below and removes the clutter around them (taken from the screenshots of 21 Nov).

**Keep**

| Trait | Where it shows today |
| --- | --- |
| Warm charcoal surfaces, one coral accent | Primary buttons, toggles, selected tab |
| Agents known by colour + letter avatar | Orchestrator O, Dev D, Design D, QA Q, Research R, Scout S, Advisor A |
| Plain-language copy | "What this agent should always do, in plain words" |
| Decisions as choice cards with mockups | Plans page |
| Typed board entries | contract, decision, blocker, question, done, note |
| Cost and autonomy always in reach | Spend caps; Ask / Guarded / Autonomous |

**Fix**

| Clutter | Example |
| --- | --- |
| 11 top-level destinations | 8 page tabs + Orchestrator tab + Files + Changes |
| Zero-count filters | "Blocked · 0", "question · 0", "Declined · 0" |
| Repeated non-information | "No effort setting for this harness." and "The harness's default", five times each |
| Every number on every card | Metrics: 6 stats and an unlabelled bar chart per agent, 8 cards |
| Four selection styles | Coral outline, grey fill, coral-tinted chip, dark pill |
| Raw machine text at full size | Contract JSON on Board, stack trace in Issues, 60-character branch name in the task header |
| Decorative icons | Three identical shield icons on Settings cards |
| Agent colour used as fill | Tinted chips on Knowledge and the Plans rail |

## Principles

When two rules conflict, the one higher on this list wins.

1. **What needs you comes first.** Questions, blockers and reviews rank above progress reports on every screen.
2. **One thing asks for attention per view.** At most one coral (primary) action is visible at a time.
3. **Hide what is empty, default or unsupported.** Zero counts, default values and settings a harness lacks are not drawn.
4. **Summary first, detail on demand.** Every object has three depths: a one-line row, a peek, the full view.
5. **Agent colour means identity, never decoration.** It colours the avatar and one dot, never fills, chips or whole cards.
6. **Machine text is folded.** JSON, stack traces, paths and branch names show as one muted mono line that expands.
7. **Every action has a keyboard path; every "needs you" has a phone path.**

## Navigation

The top bar drops from 11 destinations to four, plus Settings behind the gear. Home opens by default: what needs you on top, every running agent and goal below it.

[embedded content: bot-herdr navigation · 11 destinations to 5]

Inside a thread, a second row holds Conversation, Plan, Steps and Changes. Spaces stay in the left rail as they are now.

## Foundations

All styling goes through named tokens, mapped onto Herdr's theme presets. No hex values in mod code. Sample the starting values from the current build so the warm look carries over unchanged.

**Colour roles**

| Token | Used for | Never used for |
| --- | --- | --- |
| surface-0 / 1 / 2 | Page, card, input or hover | Status |
| text-primary / secondary / muted | Content, labels, metadata | Emphasis by colour |
| accent (coral) | The one primary action, focus ring, current selection | Decoration, headings |
| state-* | The state glyphs below | Backgrounds of whole cards |
| agent-* (7 hues) | Avatar and one presence dot | Chips, fills, tags, chart bars |

Theme presets return border, selected and hover as alpha colours. Composite them over their surface before checking contrast (4.5:1 for text, 3:1 for glyphs).

**State language** — one glyph, colour and word per state, the same on every page and surface:

| State | Glyph | Colour | Motion | Replaces today |
| --- | --- | --- | --- | --- |
| Needs you | ◆ | Amber | One pulse, then still | "question", "blocker" tags |
| Review | ◇ | Accent | None | "Testing" label, QA gate |
| Working | ● | Accent | Slow pulse | "active" pill, blue dot |
| Done | ✓ | Green | None | "done" pill |
| Failed | ✕ | Red | None | Error banners |
| Paused | ‖ | Muted | None | Pause button state |
| Idle | ○ | Muted | None | Hollow dot in the rail |

**Type** — the current UI sans for everything; mono only for code, ids, paths and terminals. Four sizes (12 metadata, 13 body, 15 titles, 20 hero numbers) and two weights (400, 600). Sentence case throughout.

**Space and shape** — 4 px grid (8, 12, 16, 24, 32). Card padding 16. Radius 8 on controls, 12 on cards. Borders, not shadows. Content column stays centred, as it is now.

**Icons** — 16 px stroke icons on navigation and icon-only buttons only. No icon in front of card titles or field labels.

**Numbers** — compact and consistent: 7.2M tokens, $0.13, 23m. Show "≈" once in a column header, not on every value. Pluralise correctly ("1 agent").

**Motion** — 150 ms fades for appear and disappear; only Working animates continuously; full timings are under Interaction and motion. GPUI's MotionProperty animates opacity, width, height, left and top only, so no colour transitions.

## Components

Each component has a default (quiet) form and an expanded form. Build the quiet form first.

| Component | Quiet form | Rules |
| --- | --- | --- |
| Tabs and selection | Accent text + 2 px underline | One selection style app-wide; segmented controls use a grey fill |
| Filter bar | Search + one Filter button | Chips appear only for active filters; counts only when above 0 |
| Thread row | State glyph, title, agent avatars, 5/6, age | Cost and tokens appear on hover or in the peek |
| Agent row | Avatar, name, state glyph, one-line summary | Harness and model shown in the peek, not the row |
| Peek panel | Recent output, any open question, reply box | Opens with Space, closes with Esc; reply without leaving the list |
| Question card | Options as cards, mockup thumbnail if any | Number keys pick; the chosen option gets a check, the rest fold away |
| Board entry | Type word (muted, no pill), author, time, first line | Full text and contracts expand in place |
| Machine text | One muted mono line, truncated in the middle | Expand and Copy buttons; never wraps at body size |
| Stat | One hero number + label | Secondary numbers in a tooltip or the detail view |
| Settings row | Label left, control right | Hide rows a harness can't use; show defaults as a placeholder, not text |
| Composer | One input line | Repo, branch and model chips appear on focus |
| Status bar | Machine, branch, agent count, palette hint | Nothing else; no buttons |
| Toast | One line + one action | Only for Needs you, Failed and Done-while-away |

## Interaction and motion

Every action gets a response within 100 ms, and every agent state change is visible without being loud. Claude Code desktop is the reference for feel: quiet at rest, clear on change.

**Micro-interactions**

| Moment | Response |
| --- | --- |
| Hover a row or button | Surface steps up one level; hidden secondary actions (cost, copy, open terminal) fade in |
| Press | Surface steps up a second level for the press; no bounce |
| Send a message | It appears in the thread at once (optimistic), muted until the agent acknowledges it |
| Answer a question card | The chosen option gets a check; the others fold away over 150 ms |
| A thread or step finishes | Glyph turns to ✓; the row holds a soft highlight for 2 s, then settles |
| Something needs you | One amber pulse on the glyph and the Home tab badge; a toast only if the window is unfocused |
| Loading a page | Skeleton rows in the final layout; never a centred spinner |
| Copy or save | The button label changes to "Copied" or "Saved" for 1.5 s; no toast |
| Destructive action | Do it, then offer Undo for 5 s; confirm dialogs only for irreversible actions |

**Working animations** — keep today's animations and add variety. Each activity gets its own glyph cycle, so you can tell what an agent is doing at a glance:

| Activity | Cycle (text frames) | Verb shown |
| --- | --- | --- |
| Thinking | ⠁ ⠂ ⠄ ⡀ ⢀ ⠠ ⠐ ⠈ | Thinking, Weighing, Mulling (rotates) |
| Reading / searching | ▖ ▘ ▝ ▗ | Reading, Scanning |
| Editing files | ▁ ▃ ▅ ▇ ▅ ▃ | Writing, Shaping |
| Running tests or checks | ▱▱▱ ▰▱▱ ▰▰▱ ▰▰▰ | Testing, Checking |
| Waiting on another agent | · • ● • | Waiting on QA |
| Orchestrating | ◜ ◝ ◞ ◟ | Coordinating |

Rules: one tick rate (120 ms); the glyph and verb sit in a fixed-width slot so nothing around them shifts; the verb rotates at most every 4 s; the agent avatar breathes (opacity 0.7 to 1.0) only while that agent is working.

**Timing** — 100 ms for hover, 150 ms for appear and fold, 250 ms for panels sliding in. Reduced motion: frames freeze on their first glyph and fades become instant.

## Accessibility and ease of use

You should be able to use bot-herdr fully by keyboard, by screen reader and on a phone, without colour being the only signal.

**Accessibility**

- **Contrast:** 4.5:1 for text, 3:1 for glyphs, borders of inputs and focus rings, checked in every theme preset.
- **Never colour alone:** state is glyph + colour + word; agent identity is letter + colour.
- **Visible focus:** a 2 px accent ring on whatever has keyboard focus, never removed on click.
- **Screen readers:** every interactive element gets a stable id, a role and a label through GPUI's AccessKit layer (see Building in GPUI). State changes are announced politely ("Dev needs you: plan question").
- **Targets:** at least 28 px tall on desktop and 44 px on the phone.
- **Scaling:** layouts hold at 90–150% UI scale and at a 1280 px wide window with no overlap or clipped text.
- **Reduced motion:** honoured as described under Interaction and motion.

**Keyboard map** (everything else lives in the palette)

| Keys | Action |
| --- | --- |
| Ctrl+Shift+P | Command palette |
| Ctrl+1 … Ctrl+5 | Home, Threads, Agents, Library, Settings |
| J / K | Move through any list |
| Space | Peek the selected thread or agent |
| Enter | Open it |
| Esc | Close the peek, panel or dialog; then go back |
| 1 … 9 | Pick an option on a question card |
| Ctrl+Enter | Send |
| Ctrl+. | Pause or resume the current goal |
| ? | Show this map |

**Ease of use**

- **Same place, same job:** primary action top right of a view; filters top left; composer always at the bottom of a thread.
- **Always know where you are:** the tab is underlined, and a thread shows a one-line breadcrumb (Threads › Learning tab › Plan).
- **Back works everywhere:** Esc and the mouse back button return to the previous view with its scroll and selection intact.
- **Empty states teach:** each one says what will appear here and offers the one action that starts it.
- **Errors say what to do:** "QA couldn't start: the Antigravity harness is offline. Retry or switch harness." Stack traces stay folded under Details.
- **Nothing important is hover-only:** anything shown on hover is also in the peek and reachable by keyboard.

## Building in GPUI

Every rule above has to be buildable with herdr-app's GPUI kit from a JS mod. These limits come from the agents' own Knowledge notes, and the design works within them.

| GPUI fact | So the design does this |
| --- | --- |
| No rotate or transform; `.loop()` takes no delay and runs there-and-back | Spinners swap text frames on a timer; nothing spins or scales |
| MotionProperty animates only opacity, width, height, left and top | No colour transitions: colours switch instantly, or two layers cross-fade by opacity |
| `transition()` only animates a later change of the property | Highlights use an overlay whose opacity changes after mount |
| `on_key_down` only fires on elements with `track_focus` | Every list, panel and dialog that takes keys owns a focus handle |
| Theme presets give border, selected and hover as #rrggbbaa | Composite over the surface before using or contrast-checking them |
| Checkbox is unstyled; `tooltip()` exists on div, flex and Button | Style our own checkbox; tooltips carry hover-only details |
| InputState placeholder is fixed at creation | One input state per placeholder target |
| GPUI builds an AccessKit tree from stable element ids when a screen reader connects | Key every row by its thread or agent id, never by list index |
| `herdr-app check` only renders the first view | Also run the `tsc` jsconfig check and render every page in the audit |

**Two non-negotiables**

1. **Renders never throw.** Bad or old data shows a fallback row and logs the error (open issue #1, "This view could not be re-rendered", came from a migration throwing inside `roster.js`).
2. **Accessibility support is checked first.** Milestone 1 confirms whether gpui-kit exposes role and label to mods. If it doesn't, the agents write that up as a request to herdr-app and carry on with everything else.

## Benchmarks

Claude Code desktop sets the bar for calm and clarity. The others each contribute one or two specific ideas.

| Harness | Take | Leave |
| --- | --- | --- |
| [Claude Code desktop](https://claude.com/blog/claude-code-desktop-redesign) and [agent view](https://rits.shanghai.nyu.edu/ai/anthropic-ships-agent-view-a-multi-session-dashboard-for-claude-code/) | Summary / Normal / Verbose views; state-grouped list with peek; the goal indicator with elapsed time and the judge's latest reason ([goal mode](https://flaviocopes.com/ai-glossary/goal-mode/)) | The session sidebar (you chose top tabs) |
| [Codex app](https://learn.chatgpt.com/docs/long-running-work) | Goal progress row above the composer with pause, resume, edit and clear; diff review with comments | Project-per-sidebar layout |
| [DeepSeek Harness](https://www.mindstudio.ai/blog/deepseek-harness-2-desktop-app/) | One switch that shows or hides the coding trajectory and diffs; named presets instead of loose toggles | Web-app look |
| [ZCode](https://flaviocopes.com/zcode/) | Each task keeps goal, changed files, terminal output and git state together; approval card with allow once / allow for this project / deny | Electron density |
| [Tern](https://tern.build/) | One review queue for every agent's changes; a header count such as "3 running · 1 needs you" | — |

## Features borrowed from leading harnesses

Threads are the biggest change: one task becomes one thread holding its conversation, plan, steps, board and changes. The rest builds on that. P1 ships with the redesign; P2 follows.

| Feature | Borrowed from | In bot-herdr | Priority |
| --- | --- | --- | --- |
| Threads per task, each in its own worktree | [Codex app](https://openai.com/index/introducing-the-codex-app/), [Amp](https://ampcode.com/manual), Tern | Chat, Plans and Tasks merge into the thread; "Git per task" picks its isolation | P1 |
| Goal row | Codex, Claude Code | Above the composer: ◎ goal, gate reached, elapsed time, retries left, the judge's last reason; pause, edit, clear | P1 |
| Home: needs you + fleet | Claude Code agent view, Tern | Needs you and Review on top; every running agent and goal below | P1 |
| One-line live summary per row | Claude Code agent view | A cheap model (e.g. Scout) rewrites each row at most every 15 s | P1 |
| Peek, inline reply, number-key answers | Claude Code agent view | Space opens a peek; plan questions answered with 1–9 | P1 |
| Three-choice approval card | ZCode | Allow once, allow for this project, deny | P1 |
| Diff review with inline comments | Codex app, Herdr's Redline mod | Changes panel inside the thread; comments go back to Dev | P1 |
| Summary / Normal / Verbose views | [Claude Code desktop](https://claude.com/blog/claude-code-desktop-redesign) | Normal by default: key steps as collapsed one-line cards | P1 |
| Child threads and a thread map | [Amp Thread Map](https://ampcode.com/news/thread-map), Herdr's Blobs mod | "2 child reports" becomes a tree under the parent thread | P2 |
| Handoff and fork | Amp | Start a new thread carrying only the context it needs | P2 |
| Queue and steer | [Amp Neo](https://thenewstack.io/?p=22822390) | Type while an agent works; the message queues or redirects it | P2 |
| Tiled agent panes | [Cursor 3](https://cursor.com/changelog/3-0) | Watch two or more agents side by side | P2 |

## Surfaces

Thread and agent state lives in Herdr's server, so every surface reads the same thing; only the density changes.

| Surface | Job | Shows | Drops |
| --- | --- | --- | --- |
| Desktop mod (GPUI) | Plan, review, steer | Everything | — |
| Phone (Herdr mobile) | Answer and unblock | Home's needs-you list, thread conversation, peek, approve / decline | Metrics, Settings, Library, tiling |
| Headless on the VPS | Keep agents running | Status bar line and the state glyphs over SSH | All panels |

## Goal prompt

The run keeps going until every check passes and QA signs off; the only automatic stop is the retry cap. So "complete" is defined as checks a script runs and a rubric QA scores, never as a judgement by the agent that did the work. Paste this as the Orchestrator's goal:

```text
GOAL
Redesign bot-herdr (mods/bot-herdr) to the design language in the doc
"Herdr Harness Plugin — Design Language". Keep working until COMPLETE is true.
Do not stop to ask me. For any open choice, use the doc's Defaults section.

LOOP — repeat until COMPLETE
1. Read the doc and progress.md. Take the earliest milestone not yet passed.
2. Plan the smallest change that turns one failing check green.
3. Dev and Design build it in the task worktree.
4. Run every check below and record the results in progress.md.
5. When a milestone's checks are all green, send QA the audit screenshots,
 the audit JSON and the diff. QA scores the rubric and returns PASS or FAIL
 with reasons. Only QA can pass a milestone.
6. PASS: commit, push, reinstall (node install.mjs), start the next milestone.
 FAIL: fix exactly what QA listed, then go back to step 2.

MILESTONES — in order, each one a gate
M1 Audit tooling. Build `bh ui-audit`: renders every page in every theme preset,
 saves screenshots, writes the metrics below as JSON. Confirm whether gpui-kit
 exposes accessibility role and label. M1 passes only if the audit FAILS on
 today's build for every row of the doc's Fix table.
M2 Tokens and state language.
M3 Quiet pass (principles 2, 3, 5, 6). No behaviour changes.
M4 Navigation: Home, Threads, Agents, Library, Settings; threads; peek; goal row.
M5 Interaction and motion; accessibility; keyboard map.
M6 Review panel, view modes, then the P2 features.

CHECKS — all must pass
- herdr-app check mods/bot-herdr, the tsc jsconfig check, bh check, npm test: exit 0
- ui-audit, across every page x theme:
 render errors = 0
 hex colours outside the token file = 0
 zero-count chips drawn = 0
 top-level destinations = 5
 accent (primary) buttons per view <= 1
 text contrast >= 4.5:1; glyphs, input borders, focus ring >= 3:1
 interactive elements with a keyboard path = 100%
 interactive elements with an accessible label = 100%
 (or logged as blocked by gpui-kit in M1)
 visible elements per page < the M1 baseline
 every P1 feature in the doc's Features table is present

QA RUBRIC — QA scores each page 1–5; PASS needs every score >= 4
- Each of the seven Principles
- Keeps every trait in the Keep table
- Working animations: each activity distinct, steady, no layout shift;
 reduced motion freezes them
QA writes a reason for every score below 4.

COMPLETE
All six milestones passed, all checks green on main, and QA PASS on a full
audit run of the final build.

STOP
If the same check fails with the same error as many times in a row as the
retry cap in Settings > Resilience, pause the goal and post a blocker:
the check, each attempt, and what would unblock it.

NEVER
- Edit, skip or loosen a check, the audit or the rubric to make it pass
- Delete or skip tests
- Let the agent that built a change be the one that passes it
- Change runtime behaviour before M4
- Remove information; fold it behind a peek, hover or expand instead
- Touch files outside mods/bot-herdr and its tests without a note in progress.md

PROGRESS
Keep progress.md current: milestone, checks table, QA's last verdict and
reasons, next step. The goal row reads from it.
```

## Decisions and defaults

Decided by Athi on 21 Nov:

| Question | Decision |
| --- | --- |
| Navigation | Slim top tabs: Home, Threads, Agents, Library, gear for Settings |
| What opens first | Home: needs-you on top, fleet overview below |
| Thread detail | Normal: key steps as collapsed one-line cards |
| Personality | Subtle character; keep the working animations and give them more variety |
| Who says "complete" | Scripted checks + QA only, fully autonomous |
| What stops a run | The retry cap only |

Defaults the agents use so a run never stalls (change any of them here):

- Metrics moves to Settings › Usage; Home's fleet shows today's spend total.
- GitHub issues appear in Home's needs-you list as items to triage.
- Design against the current default dark preset; every check still runs on all presets.
- Phone means the Herdr mobile client.
- The agents' Knowledge notes win over this doc on GPUI facts; this doc wins on design.

## Sources

- [Herdr app layouts and mods (Bitdoze)](https://www.bitdoze.com/herdr-app-layouts-mods/)
- [Herdr overview (Better Stack)](https://betterstack.com/community/guides/ai/herdr-ai-agent/)
- [GPUI accessibility guide (AccessKit)](https://docs.rs/crate/rgpui/0.2.2/source/src/_accessibility.rs)
- [Claude Code desktop redesign](https://claude.com/blog/claude-code-desktop-redesign)
- [Claude Code agent view (NYU Shanghai RITS)](https://rits.shanghai.nyu.edu/ai/anthropic-ships-agent-view-a-multi-session-dashboard-for-claude-code/)
- [Goal mode across harnesses (Flavio Copes)](https://flaviocopes.com/ai-glossary/goal-mode/)
- [Long-running work and goals (OpenAI)](https://learn.chatgpt.com/docs/long-running-work)
- [Introducing the Codex app (OpenAI)](https://openai.com/index/introducing-the-codex-app/)
- [DeepSeek Harness desktop app (MindStudio)](https://www.mindstudio.ai/blog/deepseek-harness-2-desktop-app/)
- [A deep dive into ZCode (Flavio Copes)](https://flaviocopes.com/zcode/)
- [Tern](https://tern.build/)
- [Amp manual](https://ampcode.com/manual) and [Thread Map](https://ampcode.com/news/thread-map)
- [Amp Neo CLI (The New Stack)](https://thenewstack.io/?p=22822390)
- [Cursor 3.0 changelog](https://cursor.com/changelog/3-0)
