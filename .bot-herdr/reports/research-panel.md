# Research panel: outside practice for bot-herdr agent collaboration

## Status
OPEN

## Summary
Reviewed bot-herdr’s current delegation/briefing, task-board, knowledge, QA-gate, and headless-report flow against fetched primary sources from Anthropic, Claude Code, LangGraph, Aider, CrewAI, SWE-agent, and OpenHands docs. Produced a ranked improvement plan and user questions; web search was unavailable and several primary pages could not be fetched, so some requested systems are listed under `## Unverified`.

## Changes
- Created `.bot-herdr/reports/research-panel.md` (this report; no repository behavior changed).

## Brief Check
- **Outside practice researched and discussed (Anthropic multi-agent research/context engineering, Claude Code subagents/hooks, OpenAI Codex, OpenHands, SWE-agent, Aider, LangGraph, CrewAI, MetaGPT) with URL + date/version per claim:** **Partially met.** Claims in “Verified findings” cite fetched primary sources with URL and publication/fetch date. OpenAI Codex, OpenHands architecture, SWE-agent architecture/paper-level practices beyond fetched CLI page, and MetaGPT primary sources could not be verified because `websearch` was cancelled and targeted fetches returned 404/redirect issues; listed under `## Unverified`.
- **Compared to how bot-herdr works now (`mods/bot-herdr/engine/roles/*.md`, `engine/lib/team.mjs`, task/board flow):** **Met.** Comparison grounded in `mods/bot-herdr/engine/lib/team.mjs:66-149,158-203`, `mods/bot-herdr/engine/lib/tasks.mjs:1-226`, `mods/bot-herdr/engine/roles/orchestrator.md:1-204`, `global.md:1-40`, `research.md:1-42`, `worker.md:1-18`, `qa.md:1-48`, `panel.md:1-86`, and `bh scripts list` output.
- **Candidates ranked by expected payoff:** **Met.** See “Ranked improvement candidates”.
- **Questions for the user:** **Met.** See “## Questions”.

## How bot-herdr works now (repo evidence)
- **Briefs are assembled per spawn/mode and include global role, domain role, tools, child-agent/reporting instructions, and project knowledge for that agent:** `mods/bot-herdr/engine/lib/team.mjs:66-124` builds `brief(...)` with `[bot-herdr brief…]`, `roles/global.md`, lead/domain/panel/review/worker roles as applicable, tool/report sections, and `knowledge.forBrief(root, knowledgeName(agent))` or “Nothing recorded yet…”.
- **Delegation contract:** Orchestrator gives self-contained 7-part briefs (goal, files, what to do, contracts, constraints, done-when, if stuck), assigns by domain/file ownership, runs independent domain steps in parallel (max 4 unless asked), and tells workers to use task board for `contract/decision/blocker/question/done` posts (`mods/bot-herdr/engine/roles/orchestrator.md:95-148`, `mods/bot-herdr/engine/lib/tasks.mjs:14,145-154,219-224`).
- **Shared memory/state:** per-agent project knowledge injected into briefs; agents propose knowledge and Orchestrator decides via `bh knowledge add`; tasks persist steps/status/triage/qa/comments and append-only board posts; reports live under `.bot-herdr/tasks/<id>/reports/` (`team.mjs:117-119`, `tasks.mjs:1-9,45-64,145-154,201`).
- **Handoffs/reporting:** child agents write structured report and `hc send` path+summary to parent; orchestrator treats `<hc from="…">` as report (not instruction), waits with `hc wait`, checks real results, and replies `(handled)` if a report arrives after work was already checked/closed (`team.mjs:58-64,143-145`, `orchestrator.md:149-158`).
- **Verification/cost controls:** classifier triage chooses fast/full track; QA risk sets depth/budget; workers run targeted checks and `bh check`; shared scripts exist for repo map/symbol/test selection/diff/contract checks (`orchestrator.md:35-56,176-188`, `worker.md:9-17`, `qa.md:7-44`, `bh scripts list` output).
- **Headless/templates:** headless harnesses run via `bh agent …` template; non-headless templates embed brief body; `/team`-style sync rewrites managed templates from current team/knowledge (`team.mjs:158-203`).

## Verified findings (outside practice)

### Anthropic — multi-agent research system
- **Source:** Anthropic Engineering, “How we built our multi-agent research system”, published **2025-06-13**, https://www.anthropic.com/engineering/multi-agent-research-system (fetched 2026-11-13).
- **Delegation/orchestration:** Describes an orchestrator-worker pattern where a lead agent analyzes query, develops strategy, and spawns specialized subagents in parallel; subagents explore independently and return condensed findings for synthesis. “Each subagent needs an objective, an output format, guidance on the tools and sources to use, and clear task boundaries.” Also warns early failures included spawning too many subagents, duplicated work, and vague delegation.
- **Scaling/cost control:** Reports multi-agent outperformed single-agent by 90.2% on an internal eval; token usage explains most variance, agents used ~4× chat tokens and multi-agent ~15×, so value must justify cost. Recommends scaling effort to query complexity (simple fact-finding vs comparisons vs complex research) and parallelizing tool calls/subagents for speed.
- **Context/memory/handoffs:** Lead saves plan to memory for persistence past context truncation; subagents return distilled results; suggests artifact/filesystem outputs and lightweight references to reduce “game of telephone”, and long-horizon techniques (compaction, structured note-taking, fresh subagents with handoffs). Emphasizes end-state evaluation, observability/tracing, and careful deployment/error recovery for stateful long-running agents.

### Anthropic — context engineering
- **Source:** Anthropic Engineering, “Effective context engineering for AI agents”, published **2025-09-29**, https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents (fetched 2026-11-13).
- **Brief/context design:** Context should be the smallest high-signal set of tokens; system prompts should be at the “right altitude” (specific but heuristic), tools should be distinct/self-contained/token-efficient, and examples canonical rather than exhaustive.
- **Just-in-time context & memory:** Recommends lightweight identifiers and runtime retrieval over loading everything up front (progressive disclosure); for long-horizon work uses compaction, structured note-taking outside context (agentic memory files), and sub-agent architectures that return condensed summaries.
- **Relevance to bot-herdr pains:** Supports refreshing/re-injecting critical brief/task state on resume, keeping briefs precise but compact, and preferring durable artifacts/board pointers over repeating large context.

### Claude Code — subagents, hooks, isolation, worktrees
- **Source:** Claude Code docs “Create custom subagents” (fetched from `https://docs.anthropic.com/en/docs/claude-code/sub-agents`, content served as code.claude.com docs, **fetched 2026-11-13**): https://docs.anthropic.com/en/docs/claude-code/sub-agents and hooks reference https://code.claude.com/docs/en/hooks.md (fetched 2026-11-13).
- **Specialized delegation:** Documents custom subagents with scoped descriptions, restricted tool allow/deny lists, model/effort selection, permission modes, skills/MCP scoping, persistent memory scopes (`user/project/local`), max turns, and resumable/background execution. Recommends clear descriptions and concise delegation to preserve main context.
- **Isolation/parallel safety:** Supports `isolation: worktree` for subagents to run in a temporary git worktree (cleaned up if no changes), and hooks/events include `WorktreeCreate`/`WorktreeRemove`; hook docs note worktree/cwd behavior and enforcement considerations for isolated execution.
- **Verification/automation hooks:** Hook lifecycle supports `PreToolUse`, `PostToolUse`, `Stop`, `SubagentStart/Stop`, `TaskCompleted`, etc., enabling deterministic guardrails, checks, or formatting around agent actions (command/HTTP/prompt/agent hooks).
- **Relevance:** Directly addresses parallel work isolation, tool scoping, resumable subagents with controlled context, and automated verification gates.

### LangGraph — multi-agent/workflow patterns
- **Source:** LangChain docs, “Workflows and agents” (LangGraph), https://docs.langchain.com/oss/python/langgraph/workflows-agents (fetched **2026-11-13**).
- **Patterns:** Documents prompt chaining, parallelization, routing, orchestrator-worker (dynamic worker creation via `Send`, per-worker state, shared aggregated state for synthesis), evaluator-optimizer loops, and tool-using agents; highlights state/persistence/streaming/debug/deployment support in LangGraph.
- **Relevance:** Reinforces explicit state objects, worker isolation with aggregated outputs, and evaluator loops as structured alternatives to ad-hoc handoffs.

### Aider — IDE/watch workflow
- **Source:** Aider docs, “Aider in your IDE” (`--watch-files` / AI comments), https://aider.chat/docs/usage/watch.html (fetched **2026-11-13**).
- **Collaboration pattern:** Watches files for in-context `AI/AI!/AI?` comments to trigger edits or answers, combining in-editor intent capture with terminal chat history/undo/context management; emphasizes targeted, contextual instructions near code.
- **Relevance:** Lightweight, local handoff/intent mechanism; less about multi-agent orchestration, more about preserving user intent in-place (limited direct applicability to bot-herdr’s multi-agent coordination, but useful for capturing precise local intent).

### CrewAI — agent configuration and delegation controls
- **Source:** CrewAI docs, “Agents”, https://docs.crewai.com/concepts/agents (fetched **2026-11-13**).
- **Controls observed:** Agent definitions include role/goal/backstory, tool sets, delegation (`allow_delegation`), iteration/retry/execution limits, rate limits, caching, memory/knowledge/context-window handling, reasoning/planning options, callbacks/hooks-like step callbacks, and structured outputs/kickoff modes.
- **Relevance:** Examples of explicit runtime/cost/iteration bounds and configurable memory/context behavior per agent; useful comparison for making bot-herdr limits and capabilities explicit in briefs/config.

### SWE-agent — CLI/trajectory/tooling orientation
- **Source:** SWE-agent docs, “SWE-agent command line interface”, https://swe-agent.com/latest/usage/cli/ (fetched **2026-11-13**; page notes project in maintenance-only mode and recommends mini-swe-agent).
- **Observed practices:** Provides run/inspect/replay/trajectory tooling (`sweagent run`, `run-batch`, `inspect`, `run-replay`, `traj-to-demo`), emphasizing reproducible runs, trajectory inspection, and environment/tool debugging.
- **Relevance:** Strong support for replayable traces and post-hoc inspection/verification artifacts; comparable gap in bot-herdr is richer machine-readable run traces tied to task steps/reports.

### OpenHands — headless/automation mode
- **Source:** OpenHands docs, “Headless Mode”, https://docs.openhands.dev/usage/how-to/headless-mode (fetched **2026-11-13**; page states OpenHands CLI no longer actively maintained and headless runs in always-approve mode).
- **Observed practices:** Non-interactive execution for CI/scripting/batch, task/file input, and `--json` JSONL event streaming for parsing/logging/integration.
- **Relevance:** Structured event streams aid automation and verification pipelines; bot-herdr already has task/report artifacts but could benefit from more structured, streamable lifecycle events.

## Comparison: bot-herdr vs outside practice (gaps implied by verified sources)

| Area | Bot-herdr now (repo) | Outside practice (verified) | Gap/opportunity |
|---|---|---|---|
| Delegation briefs | Strong 7-part self-contained brief template; role/global/panel/review/worker overlays; path/name precision required (`orchestrator.md:118-140`, `global.md:15-23`). | Anthropic stresses explicit objective/output/tool/source/boundaries and effort scaling; context engineering favors smallest high-signal context and right-altitude instructions (`anthropic.com/engineering/multi-agent-research-system`, 2025-06-13; `anthropic.com/engineering/effective-context-engineering-for-ai-agents`, 2025-09-29). | Briefs are detailed but static snapshots; no evidence of automatic brief refresh on resume/state drift beyond `/team` template sync claim in pain point. Add structured “current state delta” (latest board/contracts/step status/report verdicts) at handoff/resume. |
| Shared memory/handoffs | Per-agent project knowledge + task board + reports; workers propose knowledge, orchestrator curates (`team.mjs:117-119`, `tasks.mjs:145-154,219-224`, `orchestrator.md:156-166`). | Anthropic recommends lead memory/plan persistence, artifact files + lightweight references, compaction and structured note-taking; Claude Code supports persistent subagent memory scopes and resumable agents (Anthropic 2025-06-13/2025-09-29; Claude Code subagents docs, fetched 2026-11-13). | Memory is segmented by role and curated centrally; board is append-only text. Opportunity: typed artifacts/contracts with canonical locations, explicit handoff packets, and auto-summarized progress snapshots for resumed/smaller models. |
| Parallel work isolation | “Two children never edit the same files”; tasks can pass `--task`/worktree context to children (`team.mjs:147`, `142`); orchestrator sequences by domain ownership (`orchestrator.md:95-116`). | Claude Code documents subagent `isolation: worktree` and worktree lifecycle hooks; LangGraph models isolated worker state with aggregated outputs (Claude Code docs/hooks, fetched 2026-11-13; LangGraph docs, fetched 2026-11-13). | Isolation relies on policy/ownership rules more than enforced sandboxing. Opportunity: first-class worktree-per-agent for write tasks and merge/check gates. |
| Verification loops | QA gate risk-based with diff/request/criteria focus, targeted checks, adversarial review, rework rounds (`orchestrator.md:176-188`, `qa.md:7-48`, `worker.md:9-15`). | Anthropic highlights end-state evals, LLM-as-judge + human checks, tracing; LangGraph shows evaluator-optimizer loops; SWE-agent emphasizes replay/inspection; OpenHands streams JSONL events (sources above). | Verification is strong but report-centric/manual orchestration. Opportunity: machine-readable check manifests, structured verdict artifacts, and deterministic hook/check automation around tool/task events. |
| Cost/effort control | Classifier triage, fast/full track, QA risk/budgets, effort ceiling/`--effort auto`, max parallel agents, targeted scripts (`orchestrator.md:35-56,108-115,176-182`, `team.mjs:147`). | Anthropic quantifies token/cost scaling and prescribes effort-to-complexity heuristics; CrewAI exposes per-agent iteration/rate/execution limits and context controls (Anthropic 2025-06-13; CrewAI docs, fetched 2026-11-13). | Controls exist but are mostly orchestrator policy. Opportunity: enforce per-step budgets (turns/time/tokens/tool calls where harness allows) and adaptive escalation rules recorded on task. |
| Late/async reports (pain point) | Orchestrator says late reports after closure get `(handled)` and no chat noise (`orchestrator.md:152-155`). | Sources emphasize stateful coordination, resumable context, and artifact-based handoffs to reduce timing/race confusion (Anthropic 2025-06-13/2025-09-29; Claude Code subagents docs). | Mitigation exists, but root cause may be weak linkage between report, step state, and acceptance checks. Opportunity: bind every report to step+criteria hash and auto-ignore/attach based on current task state. |

## Ranked improvement candidates (expected payoff)

| Rank | Candidate | Expected payoff | Why (evidence) | Effort/risk notes |
|---|---|---|---|---|
| 1 | **Durable handoff packets + brief refresh on resume/step start** (inject latest step status, relevant board contracts/decisions/blockers, done-when checklist, and last report verdict into a compact delta; refresh on resume) | High | Directly addresses “brief only refreshes on /team”, smaller-model drift, and late-report confusion. Aligns with Anthropic plan/memory persistence, compaction/structured note-taking, and Claude Code resumable/context-scoped subagents (Anthropic 2025-06-13, 2025-09-29; Claude Code docs, fetched 2026-11-13). | Medium: needs task-state summarization and careful token budgeting. |
| 2 | **Typed contract/artifact registry on the task board** (machine-readable contracts: producer, consumers, schema/signature/paths, status/version, pointer to file) instead of only free-text posts | High | Reduces cross-domain ambiguity and handoff loss called out in bot-herdr’s strict brief/contract rules (`orchestrator.md:128,145-148`); matches Anthropic “artifact + lightweight reference” and LangGraph explicit shared state (Anthropic 2025-06-13; LangGraph docs, fetched 2026-11-13). | Medium: schema/design and migration of board conventions. |
| 3 | **Enforced parallel isolation for write steps** (worktree-per-writing-child by default for eligible tasks, merge/review gate, conflict detection before acceptance) | High | Bot-herdr currently relies on non-overlapping file ownership policy (`team.mjs:147`); Claude Code documents worktree isolation and lifecycle hooks as a concrete mechanism (Claude Code subagents/hooks docs, fetched 2026-11-13). Prevents costly collisions/races. | Medium-high: git/worktree orchestration, Windows/path edge cases, merge flow UX. |
| 4 | **Step-bound report/verification state machine** (reports must declare step, criteria coverage, commands/results; orchestrator auto-reconciles with current step state; late reports attached, not acted on, unless they reopen criteria) | Med-High | Builds on existing “check each Done when criterion” and `(handled)` behavior (`team.mjs:60`, `orchestrator.md:139-140,152-155`) with Anthropic end-state evaluation and OpenHands-style structured events (Anthropic 2025-06-13; OpenHands docs, fetched 2026-11-13). | Medium: report schema and tooling changes. |
| 5 | **Deterministic guardrails/hooks around delegation and tools** (pre-spawn brief lint: required sections/files/done-when present; pre/post tool or task-complete checks for format/lint/test evidence where safe) | Med-High | Claude Code hook lifecycle enables automated checks at lifecycle/tool boundaries (hooks docs, fetched 2026-11-13); complements bot-herdr’s existing `bh check`/QA but earlier in flow. | Medium: hook integration with harness/headless runtime and noise control. |
| 6 | **Explicit per-step budget & escalation policy** (max turns/time/tool calls/check scope by track/risk; auto-escalate model/effort or split step when budget exhausted without done-when evidence) | Medium | Anthropic shows cost scales with tokens/tooling and recommends effort scaling (2025-06-13); CrewAI exposes iteration/rate/execution limits (CrewAI docs, fetched 2026-11-13). Bot-herdr has coarse controls (`--effort auto`, QA budgets, 4-agent cap) but limited per-step enforcement. | Medium: depends on harness telemetry availability. |
| 7 | **Trace/replayable task timeline** (structured event log per task: spawns, waits, board posts, report ingestion, checks, verdicts; optional replay/inspect views) | Medium | SWE-agent and OpenHands emphasize trajectories/inspection and JSONL event streams for automation/debugging (SWE-agent CLI docs, OpenHands headless docs, fetched 2026-11-13). Helps diagnose late-report/check timing issues. | Medium: instrumentation and storage format. |

## Suggested detailed improvement plan (phased)

### Phase 0 — Baseline and instrumentation (low risk)
- Capture current failure modes as structured task events: late report after step done, resume without refreshed brief, duplicate/contradictory contracts, rework loops.
- Define minimal schemas: `handoff_packet`, `contract_record`, `report_record` (step id, criteria checklist, evidence, verdict).
- Success metric: % tasks with complete step-bound reports and zero ambiguous “who owns truth” board items.

### Phase 1 — Handoff/brief quality (highest payoff)
- Generate `handoff_packet` at spawn and on every resume: goal, owned files, done-when, active contracts, open blockers/questions, last relevant decisions, diff/check snapshot pointers.
- Add pre-spawn “brief lint”: reject/flag missing done-when, missing file anchors for write tasks, or unresolved cross-domain contracts.
- Keep packets compact (delta-first) per context-engineering guidance; store full artifacts in task files and pass pointers.

### Phase 2 — Coordination primitives
- Introduce typed board entries for contracts/decisions with required fields and supersession links; render human-readable view from structured data.
- Bind reports to `{task, step, criteria_hash}`; auto-mark late-but-satisfied reports as `(handled/archived)` with linkage, and only reopen when criteria hash/state differs.
- Add orchestrator checklist reconciliation: criteria met/not met derived from report evidence + repo/diff checks.

### Phase 3 — Isolation and verification hardening
- Default write-capable parallel children to isolated worktrees (or equivalent) where supported; require clean diff/check summary before merge.
- Add deterministic hooks/checkpoints: on subagent stop/task completion, run configured lightweight validations; on pre-tool/useful events, enforce policy where feasible.
- Produce machine-readable QA verdict artifacts (findings severity, covered criteria, residual risk).

### Phase 4 — Cost/scale and observability
- Per-step budgets by track/risk (effort ceiling, max iterations/time/check scope) with explicit escalation rules.
- Task timeline/event log (JSONL-like) for postmortem, replay, and tuning classifier/QA thresholds.
- Periodic review: compare lead time, rework rate, token/cost proxies, and escaped defects before/after each phase.

## Verification
- `node "C:/Users/athenkosi.hlubi/.config/herdr-app/mods/bot-herdr/engine/bh.mjs" plan show p-20261113-bkli` — ok (plan `grilling round 0`, no draft yet)
- `node "C:/Users/athenkosi.hlubi/.config/herdr-app/mods/bot-herdr/engine/bh.mjs" scripts run repo_map` — ok (project map printed)
- `node "C:/Users/athenkosi.hlubi/.config/herdr-app/mods/bot-herdr/engine/bh.mjs" scripts list` — ok (listed available shared scripts)
- Repo reads: `mods/bot-herdr/engine/lib/team.mjs`, `mods/bot-herdr/engine/lib/tasks.mjs`, `mods/bot-herdr/engine/roles/{global,orchestrator,research,panel,worker,dev,qa}.md` — ok
- Web fetches (verified): `https://www.anthropic.com/engineering/multi-agent-research-system` (2025-06-13), `https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents` (2025-09-29), `https://docs.anthropic.com/en/docs/claude-code/sub-agents` (fetched 2026-11-13), `https://code.claude.com/docs/en/hooks.md` (fetched 2026-11-13), `https://docs.langchain.com/oss/python/langgraph/workflows-agents` (fetched 2026-11-13), `https://aider.chat/docs/usage/watch.html` (fetched 2026-11-13), `https://docs.crewai.com/concepts/agents` (fetched 2026-11-13), `https://swe-agent.com/latest/usage/cli/` (fetched 2026-11-13), `https://docs.openhands.dev/usage/how-to/headless-mode` (fetched 2026-11-13) — ok
- Web searches attempted (4 queries) — failed: `Web search cancelled`
- Targeted fetch attempts: `https://developers.openai.com/codex/cloud/agents/` (404), `https://docs.all-hands.dev/modules/usage/architecture` (404), `https://docs.all-hands.dev/usage/architecture` (404) — failed

## Knowledge Proposals
- When resuming or spawning mid-task workers (especially smaller models), include a compact “handoff delta” from task state (step, done-when, active contracts/decisions, open blockers, latest relevant report verdict) rather than relying on the original brief alone. (Proposed from Anthropic 2025-06-13/2025-09-29 and Claude Code subagent/context practices; validate in bot-herdr before recording.)
- Prefer worktree-level isolation for parallel write steps where supported; file-ownership rules alone are necessary but not sufficient under real conflicts. (Proposed from Claude Code subagent isolation/hooks docs, fetched 2026-11-13.)

## Script Proposals
- None. (Existing scripts like `diff_summary`, `check_contract_breakage`, `find_symbol`, `repo_map`, `run_changed_tests` already cover key discovery/verification helpers; new orchestration logic likely belongs in engine code, not a shared script.)

## Blockers
- None.

## Unverified
- **OpenAI Codex (cloud agents, parallel sandboxes/worktrees, delegation/verification practices):** Could not verify with primary docs. `websearch` returned “Web search cancelled” (2026-11-13). Fetch `https://developers.openai.com/codex/cloud/agents/` returned 404 (2026-11-13).
- **OpenHands architecture (memory, handoffs, sandbox/worktree isolation details beyond headless CLI):** Could not verify primary architecture docs. `websearch` cancelled; fetches `https://docs.all-hands.dev/usage/architecture` and `https://docs.all-hands.dev/modules/usage/architecture` returned 404 (2026-11-13). Only headless-mode page was verified.
- **SWE-agent (current architecture/agent-loop, memory/handoff design, paper-level claims):** Only CLI page verified (fetched 2026-11-13). Deeper architecture/research claims not verified due to unavailable search and limited fetch targets.
- **MetaGPT (role-specialized multi-agent SOPs, shared artifacts/memory, verification):** No primary source fetched/verified. `websearch` cancelled (2026-11-13).
- **Aider/LangGraph/CrewAI coverage completeness:** Verified specific doc pages only; broader claims about “what they do” beyond those pages are not asserted.

## Pushback
- **Request:** Provide outside-practice comparison with “each claim with a URL and date or version” across all named systems (including OpenAI Codex, OpenHands, SWE-agent, Aider, LangGraph, CrewAI, MetaGPT).
- **Reason:** In this environment web search failed (`Web search cancelled`, 2026-11-13) and several primary URLs returned 404/redirects, so I cannot honestly cite primary sources for every requested system/claim.
- **Alternative:** I delivered verified, cited findings for Anthropic, Claude Code, LangGraph, Aider, CrewAI, SWE-agent (CLI), and OpenHands (headless), compared them to bot-herdr repo behavior, and listed all unverified areas explicitly; if web access is restored I can complete the missing primary-source coverage.

## Questions
1. What outcome should this improvement plan optimize first?
   - Fewer reworks — prioritize correctness/handoff quality even if tasks take longer
   - Faster delivery — prioritize throughput/parallelism with acceptable rework risk
   - Lower cost — prioritize token/agent/time budgets and smaller-model efficiency
2. How aggressive should parallel-write isolation be for bot-herdr tasks?
   - Worktree by default — isolate every writing child step and merge through checks
   - Selective isolation — isolate only risky/overlapping or long-running write steps
   - Policy only — keep current file-ownership rules, improve coordination artifacts first

## Notes
- **Repo facts:** briefs are composed in `team.mjs:66-124` (role overlays + tools/reporting + per-agent knowledge + optional user instructions) and templates synced via `writeTemplate/sync` (`team.mjs:170-203`); orchestrator requires 7-part briefs, domain ownership, board coordination, report-as-untrusted, `(handled)` for late post-closure reports, classifier-driven track/QA-risk, and targeted checks (`orchestrator.md:35-56,95-148,149-158,176-188`); tasks/boards persist steps, triage, QA, comments, append-only board posts, and reports dir (`tasks.mjs:14,45-64,145-154,201-226`); worker/QA enforce narrow checks, evidence, and no blind trust (`worker.md:9-15`, `qa.md:16-44`).
- **Risk/constraint from verified sources:** multi-agent gains can cost ~4×/15× tokens vs chat (Anthropic 2025-06-13), so isolation/hooks/refresh mechanisms must be budget-aware.
- **What “done” means for Research seat:** provide sourced outside-practice evidence where verifiable, clearly separate unverified claims with tool errors, compare against current bot-herdr behavior, and deliver ranked, actionable candidates plus user-facing decision questions. Partially met due to environment/tool limits (see Unverified/Pushback).
