## Status
OPEN

## Summary
Reviewed `mods/bot-herdr/engine/` (`bh.mjs`, `lib/{agent,runner,team,tasks,knowledge,metrics,core}.mjs`, `classifier/index.mjs`, `roles/`), `chat.js`, `work.js`, `settings.js`, `roster.js`, and `install.mjs` for plan `p-20261121-0hfk`.
The request bundles four distinct pillars (chat bugfixes, autonomous fallback/guardrails, Tasks UI overhaul, and continual self-improvement); high payoff without complexity traps comes from sequencing stability and runtime fallback first, pairing every self-improvement tweak with a deterministic "guardrail ratchet," and keeping hard safety boundaries (`personOnly`, worktree isolation, spend/loop caps) in engine code rather than prompts.

## Changes
- `.bot-herdr/reports/advisor-panel.md` — planning panel strategic review, architecture trade-offs, and questions for `p-20261121-0hfk` (read-only; no repository code changed).

## Questions
1. [ADVISOR] How should continual self-improvement apply tweaks while making guardrails stronger instead of drifting?
   - Human-gated proposals — mine failures, QA findings and retries after each task into concrete diffs (role prompts, scripts, regression checks) queued for your approval before applying
   - Eval-gated guardrail ratchet — auto-apply low-risk project learning (knowledge, scripts, regression tests) after `bh check` and tests pass; require your approval for core roles or engine edits
   - Scoped auto-tweaks — automatically apply harness and prompt tweaks on an isolated branch when automated evals pass, auto-reverting on regression
   - Project learning only — keep core harness code and roles fixed; automate post-task knowledge curation, shared script extraction and project check rules inside `.bot-herdr/`

2. [ADVISOR] How should these four pillars (chat glitches, fallback/autonomy, Tasks UI, self-improvement) be scoped and sequenced?
   - Four phased tasks — ship sequentially as separate tasks: (1) chat stability, (2) fallback + autonomy guardrails, (3) interactive Tasks UI wired to live states, (4) self-improvement loop
   - Core now, self-improvement next — ship chat fixes, fallback/guardrails and Tasks UI in this plan; split continual self-improvement into a follow-up plan once live runs produce telemetry
   - Single integrated plan — keep all four pillars in this plan and execute them as ordered milestones under one overarching spec
   - Reliability first, defer UI — prioritize chat fixes, fallback and runtime guardrails now; defer Tasks UI polish and self-improvement until autonomous runs prove stable

## Notes

### 1. Continual Self-Improvement: The "Guardrail Ratchet" (Out-of-the-Box Approach)
- **Architectural split you must respect (`install.mjs:35-40` vs `.bot-herdr/`):**
  - `.bot-herdr/` (knowledge, scripts, task history) is per-project, git-tracked, and takes effect on the next turn.
  - `mods/bot-herdr/` (`engine/roles/*.md`, `engine/lib/`, `engine/scripts/`) is global across all projects and only takes effect after `node install.mjs` copies it into `~/.config/herdr-app/mods/bot-herdr`. Any "continual self-improvement" loop must clearly separate **project-level adaptation** from **mod/harness-level mutation**.
- **Core risk — Guardrail Erosion & Prompt Bloat:** Letting agents freely edit their own role prompts (`engine/roles/*.md`) creates a classic reward-hacking loop: agents "solve" friction by softening strict QA rules or adding ad-hoc prose until prompts bloat (and `bh metrics` already shows cached context dominates spend).
- **Creative high-leverage pattern — Evidence-Backed Guardrail Ratchet:**
  1. **Mine existing structured failure signals (zero new telemetry needed for v1):** `DATA/usage/*.jsonl` (`agent.mjs:372-395`), task `checks.jsonl` receipts (`bh.mjs:661-662`), `board.jsonl` blockers/gates (`tasks.mjs:217-245`, `qa.md`/`reviewer.md` `CHANGES_REQUIRED` rounds), refused commands (`runner.mjs:633`), and idle timeouts (`runner.mjs:231`).
  2. **Ratchet rule ("No prose without a check"):** When a post-task retrospective proposes a tweak (extending `bh knowledge inbox` at `bh.mjs:605-616` into a `bh improve` / retrospective inbox), every accepted failure pattern should graduate down the reliability ladder: **Prompt prose → Deterministic `bh` script / lint check → Regression test (`test/*.test.mjs`) → Engine invariant**.
  3. **Hard immutable boundary:** `personOnly()` (`bh.mjs:93-95`) already blocks headless agents (`BH_AGENT`) from changing team/config/access/harnesses. Never allow self-improvement to weaken `personOnly`, `claudeAccess`/`acpAllowed`, or QA gate enforcement (`reviewer.md:39`).

### 2. Autonomy & Usage-Limit Fallback: 80/20 Payoff vs Complexity Traps
- **What exists today (verified gaps):**
  - `roster.js:118-132` stores only one `{ harness, model, effort, args }` per agent — no fallback chain.
  - `runner.mjs` (`claudeTurn:315`, `codexTurn:394`, `piTurn:418`, `ended:465`, `Acp.turn:676-681`) returns raw error strings without classifying **quota/usage exhaustion** vs **transient 429/network** vs **auth/fatal** vs **idle timeout**.
  - `agent.mjs:405-475` runs one attempt and dumps `**Couldn't finish:**` on failure. Worse, when an agent switches harness (`agent.mjs:408-413`), it wipes `state.session` and starts a **cold, amnesiac conversation** — unlike `compactIfPending()` (`agent.mjs:347-369`), which builds a `## Handoff` digest (`agent.mjs:327-339`).
  - Live `bh team` runs mixed harnesses (`agy`, `pi --thinking xhigh`, `opencode`) and `bh access` currently has `git isolation off` with `access full` — dangerous for unattended autonomy unless autonomous runs enforce git isolation or explicit safety ceilings.
- **High-leverage, low-complexity v1 design (avoid multi-provider auction/routing traps):**
  1. **Structured error classifier in `runner.mjs`:** Categorize turn errors into `quota_exhausted` (usage/credits/session limit), `rate_limited` (retryable backoff), `timeout`, `auth`, and `error`.
  2. **Ordered fallback chain + cooldown:** Allow an ordered `fallbacks: [{ harness, model, effort }]` list per agent (or a team-level default fallback chain in Settings with per-agent override) in `roster.js` / `settings.js`. On `quota_exhausted`, mark the exhausted `(harness, model)` in a shared cooldown file under `DATA/` (e.g., 30–60 min or parsed reset time) so subsequent turns and child spawns skip straight to the healthy fallback instead of failing repeatedly, and notify chat/Tasks cleanly when operating on fallback.
  3. **Seamless cross-harness Handoff Digest:** Reuse and extend `handoff()` (`agent.mjs:327-339`) so a mid-turn or mid-task fallback automatically carries the task state, current step, recent board posts, `git status --short` / diff stat, and the failed turn's user prompt — preventing duplicate or contradictory work across harnesses.
  4. **Engine-enforced autonomy guardrails (YAGNI, high safety):**
     - Per-task **spend / turn / retry ceilings** (e.g., auto-pause task if cost > `$X`, turns > `N`, or identical `bh check` failure repeats 3× — thrash breaker).
     - **Autonomous `bh ask` policy:** Unattended runs stall forever on `bh ask` (`runner.mjs:293-302,445`). Either auto-pause + push a high-priority notification, or allow an explicit `--autonomous` policy that logs assumptions on low-risk decisions and pauses only on destructive/irreversible ones.
     - **Require git branch/worktree isolation** (or refuse autonomous mode without a clean commit/branch checkpoint) when `git isolation` is `off`, so autonomous runs are always one `git reset`/drop away from full rollback.

### 3. Tasks Page (`mods/bot-herdr/work.js`): High-Leverage Interactivity & Cohesion
- **Current bottlenecks verified in `work.js`:**
  - Polls full `bh task list --all` subprocess every 4s (`work.js:76,422`).
  - `taskBody()` (`work.js:962-979`) stacks actions, title, facts, progress, steps, board, plan, and comments in one long scroll with no filter/search bar, no "New task" action (empty state says `"Type /task in the chat"` at `work.js:826`), and clicking a step (`work.js:1255`) only opens a comment input.
- **Out-of-the-box synergy if sequenced after (or designed with) fallback & autonomy:**
  - Add **filter/search + status chips** (`Active`, `Blocked`, `Paused`, `Done`) and a **"+ New task"** composer trigger right in the list header.
  - Turn the detail pane into a clean **control cockpit** (sub-tabs or collapsible cards for **Steps**, **Board**, **Checks & Gate**, **Diff/Worktree**) with direct interactive controls:
    - Click an active step's agent chip to **open its live terminal** (`openTerminal`) and display its live `DATA/activity/<key>.json` status line.
    - Step-level quick actions: **unblock / retry / skip / mark done**, view step diff & `bh check` receipt verdict inline, and see active **fallback badge + budget progress** (turns/spend vs cap) when autonomous mode is active.
    - If self-improvement proposals are in scope, a dedicated **"Improvements" / Retro** section on finished tasks (or Knowledge tab) avoids inventing a whole new top-level page.

### 4. Intermittent Chat Glitches (`mods/bot-herdr/chat.js`, `feed.js`): Concrete Suspects Found
Before adding features on top of chat, several deterministic race/render defects in `chat.js` should be audited and fixed first:
- **Scroll yank while reading history (`chat.js:183-189`):** `add()` unconditionally sets `this.back = 0; this.px = 0;` on every incoming reply or system note, snapping the user away from older messages (should preserve scroll offset when `this.back > 0 || this.px > 0`, showing the existing `"newer"` pill instead).
- **Render-time state mutation & timer churn (`chat.js:526-543`, `724-731`, `455-469`):** `render()` mutates `this.back`/`this.px`/`this.arriving` and schedules `cx.timer.after(16, ...)` during draw; simultaneously `entry()` calls `cx?.notify()` inside `on_size_change` whenever markdown/mockups resize, and `nextTurn()` flashes `this.turnShown` on a 16ms timer — prime cause of scroll jitter, flicker, and stuck opacity/arrival frames.
- **Reply log polling races (`chat.js:355-452`):** `readLogs()` re-reads whole `.jsonl` files and filters strictly by ISO timestamp watermark (`logSeen` / `logFloor`). Same-millisecond entries, partial line writes mid-append, or `localStorage` desync can drop or duplicate replies; meanwhile `outcome()` (`chat.js:387`, `feed.js:174`) can fire a spurious `"finished without writing a reply"` note after 8s if status flickers or log flush lags. Moving to byte-offset/line-count + atomic turn `id` deduplication eliminates both dropped and duplicate replies.
- **Stale `feedCache` (`chat.js:676-684`):** Keyed only on `entries` reference + `lastId` + `sameAddresses`, which can miss subtle live-agent transitions or space switches.

### 5. Recommended Sequencing & YAGNI Cutlines
- **Why order matters:**
  1. **Chat stability first** — smallest blast radius, fixes daily frustration, and guarantees trustworthy observability before running longer autonomous sessions.
  2. **Fallback + runtime autonomy guardrails second** — solves the #1 operational blocker (quota exhaustion killing multi-step runs) and defines the state schema (`fallback`, `budget`, `gate`, `autonomy`) that the UI should display.
  3. **Tasks page overhaul third** — builds the interactive cockpit *once*, surfacing real fallback, budget, check receipt, and live-agent controls without rework.
  4. **Continual self-improvement fourth** — builds on clean telemetry, reliable multi-step execution, and an existing UI surface for reviewing proposals/ratchets.
- **YAGNI guardrails:** Do NOT build a custom LLM proxy/billing router, auto-install mod reloader, or unconstrained self-editing engine in v1. Reuse `agent.mjs`'s `handoff()`, `bh.mjs`'s `personOnly()` + check receipts + `knowledge inbox`, and `test/*.test.mjs`.

### 6. Advisor "Done when" Criteria for the Plan
- Explicit scope boundary deciding whether all four pillars live in one phased plan or split into ordered tasks/plans.
- Clear governance model for self-improvement that preserves `personOnly()` (`bh.mjs:93`), separates `.bot-herdr/` project adaptation from `mods/bot-herdr/` mod mutations, and pairs tweaks with verifiable checks/tests.
- Fallback behavior specifies exact trigger classification, cooldown/reset behavior, loop prevention, and cross-harness context handoff (tested with fake harnesses in `test/`).
- Autonomous mode defines hard engine-level stop conditions (turn/spend/thrash limits, `bh ask` behavior, git isolation requirement) rather than prompt-only instructions.
- Chat glitch fixes include deterministic reproduction tests in `test/` covering scroll preservation, reply-log deduplication/ordering, and silent-timeout races.
- Tasks UI changes stay native GPUI, respect the existing `work.js` refresh/focus patterns, and avoid adding new top-level pages unless explicitly approved.

## Brief Check
- Reviewed mod architecture (`engine/`, `roles/`, `chat.js`, `work.js`, `settings.js`, `roster.js`, `install.mjs`): met.
- Weighed scope, sequencing, YAGNI, and risk across self-improvement safety, autonomy/fallback payoff, Tasks UI, and chat glitches: met.
- Brought at most two sharp strategic questions in Planning Panel format with neutral options: met (2 questions, 4 options each).
- Read-only (no repository code changed) and written to `.bot-herdr/reports/advisor-panel.md`: met.

## Verification
- `node "/home/athi/.config/herdr-app/mods/bot-herdr/engine/bh.mjs" plan show p-20261121-0hfk` — verified round 0, no draft yet.
- `node "/home/athi/.config/herdr-app/mods/bot-herdr/engine/bh.mjs" scripts run repo_map` — verified 311 project files, 161 under `mods/bot-herdr/`.
- `node "/home/athi/.config/herdr-app/mods/bot-herdr/engine/bh.mjs" team` — verified live mixed-harness team (`agy`, `pi --thinking xhigh`, `opencode`).
- `node "/home/athi/.config/herdr-app/mods/bot-herdr/engine/bh.mjs" access` — verified `headless`, `access full`, `git isolation off`.
- Direct reads of `mods/bot-herdr/engine/bh.mjs`, `engine/lib/{agent,runner,team,tasks,core}.mjs`, `engine/classifier/index.mjs`, `engine/roles/{orchestrator,panel,qa,reviewer}.md`, `chat.js`, `work.js`, `settings.js`, `composer.js`, `roster.js`, `install.mjs`, `README.md`, `package.json` — verified every cited `path:line`.
