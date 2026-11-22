# scout-m6 — M6 recon: approval cards, diff review, view modes, P2 starting points

## Summary
Recon done. M6's three UI features and all four P2 features are currently placeholders/absent: `bh approvals`, `bh review`, the approval-card hold path, the diff-review store, the Summary/Normal/Verbose toggle, and terminal tiling. The pieces that exist are the ACP permission handler, the Home approval row surface, the thread detail/sub-tabs, the composer outbox queue, the per-agent prompt queue, and herdr's single-pane terminal stage.

## Changes

### 1. Approval cards (Q1) — all missing
- `mods/bot-herdr/engine/lib/approvals.mjs:1-17` — `bh approvals` CLI is a placeholder (`implemented: false`); `maybeHoldPermission` (15-17) returns `{ handled: false }` with the comment "a card never holds a call until the approval UI lands". No `listHeld`.
- `mods/bot-herdr/engine/lib/runner.mjs:642-668` — the `session/request_permission` handler: computes `allow` via `acpAllowed` (495-502: kinds read/search/think/edit/fetch, or execute when the command matches `standardCommands()` or `allow`), calls the hold hook when `!allow && access !== "full"` (654), and otherwise rejects (666-667). Comment at 652-653: "until they land the hook says it handled nothing and the reject below is unchanged."
- `mods/bot-herdr/engine/lib/core.mjs:28-42` — DATA = `APP_HOME/data/bot-herdr` (28-32; APP_HOME = BH_APP_HOME or the herdr checkout or `~/.config/herdr-app`); `accessOf()` reads `DATA/config.json` → `agents.allow` ("commands the user allowed", 36-37) and `agents.access` ("standard"/"full", 41). No `.bot-herdr/config.json` exists anywhere (globs of the worktree and the main checkout `/home/athi/bot-herdr`).
- `mods/bot-herdr/engine/bh.mjs:81, 1073-1076` — the only approvals command is `bh approvals`.
- UI: `mods/bot-herdr/engine/lib/home.mjs:64-81` — `approvalNeeds` calls `AP.listHeld(root)` (66-67; not implemented → `[]`); `homeData` puts `approvalNeeds(root)` in `needsYou` (193); `mods/bot-herdr/home.js:29` — `KIND_WORDS` maps kind `approval` → "Approval" in the needs-you rows. `mods/bot-herdr/engine/lib/ui-audit-fixtures.mjs:349` — a Home fixture with an approval need. `mods/bot-herdr/RECIPE.md:157` — "The approval card, diff review comments and Summary/Normal/Verbose modes are not built yet".
- Modes: `mods/bot-herdr/engine/lib/resilience.mjs:16, 20` — `AUTONOMY = ["ask","guarded","autonomous"]`, default `guarded`; `mods/bot-herdr/settings.js:117-122` — Ask "Pauses for approval before autonomous retries or fallbacks", Guarded "Auto-retries and falls back within guardrail limits".
- Missing for a three-choice card (Allow once / Allow for this project / Deny) in Ask and Guarded modes:
  - the card component — no element renders today (no `bh-approval*` elements; marker `/^bh-approval/` at `mods/bot-herdr/engine/lib/ui-audit-spec.mjs:604` unused);
  - `maybeHoldPermission` + a held-permission store + `listHeld` for Home;
  - a project allowlist — "Allow for this project": the only allowlist that exists is the user-level `agents.allow` in `data/bot-herdr/config.json` (core.mjs:42, consumed by `acpAllowed` runner.mjs:501);
  - mapping to ACP option kinds: allow_once, allow_always (project), reject_once/reject_always (runner.mjs:664-665) — the card would translate "Allow once" → allow_once, "Allow for this project" → append to the project allowlist + allow_always, "Deny" → reject.

### 2. Diff review / review comments (Q2) — placeholder, nothing line-anchored
- `mods/bot-herdr/engine/lib/review-comments.mjs:1-9` — `bh review` is a placeholder (`implemented: false`); no data shape, no comments store, no line-anchored-to-diff anchoring, no routing to Dev.
- `mods/bot-herdr/engine/bh.mjs:82, 1078-1081` — `bh review` only.
- Changes sub-tab renders today: `mods/bot-herdr/threads.js:509, 625-648` — `changesBody`: empty state `bh-thread-changes-none` "No changes yet."; otherwise summary line ("N files · +X −Y" + branch machine line `bh-thread-changes-branch`), "Open diff" button (`bh-thread-changes-open` → the Changes window), and file rows `bh-thread-change-<path>` with `+added`/`−removed`. Data from `changesModel` (`mods/bot-herdr/threadview.js:218-234`): `files[{path, added, removed}]`, `available`, `truncated`, `branch`, `from`, `summary`.
- Engine diff data: `mods/bot-herdr/engine/lib/thread.mjs:435-463` — `changesOf`: git `diff --numstat` against the task's base commit; reason strings when unavailable.

### 3. Thread detail view modes (Q3)
- Toggle location: the thread detail header row in `mods/bot-herdr/threads.js:482-501` (`threadPage`: crumbs + Files button row, then the SUB_TAB strip `bh-thread-tabs` at 491-498) — a `bh-view-mode` segmented control fits there; marker `ui-audit-spec.mjs:606`.
- Conversation items: `mods/bot-herdr/threadview.js:171-194` — `conversationEntry` → `{ key, word ("reply"/"comment"/"note" via entryWord 163-168), from (or "the team"), to, at, first, more, machine, text }`; `conversation()` returns the newest `SHOWN_ENTRIES` (40, threadview.js:34). Render: `mods/bot-herdr/threads.js:531-560` — `entry()` head (word/from/→to/ago) + body (machine → `machineEntry` 553-560 for JSON/stack/path, else first line or expandable full text); IDs `bh-thread-entry-<key>`; quiet state `bh-thread-quiet` (threads.js:523).

### 4. P2 starting points (Q4)
- Child reports / parent-child threads: `mods/bot-herdr/engine/lib/thread.mjs:362, 364, 474-489` — detail has `children: asList(task.children).map(childPart)`; `childPart` = `{ name, agent, step, state, branch, mergedAt, stat }`; state "working" when a child is open (179); `agentsOnThread` includes child agents' names (201-203); plan rows have `children: []` (502).
- Fork/handoff: none in the engine — `handoff` appears in `goal.mjs` (`goalHandoff`) and compaction-between-rounds handoffs (`mods/bot-herdr/engine/lib/agent.mjs:390-415`); "fork" appears only as an animation glyph (`mods/bot-herdr/working.js:17`, `mods/bot-herdr/indicators.js:164-165`). Spec marks "Handoff and fork" as P2 (`design-language-spec.md:243`); plan bullet 7 lists `bh thread fork` (`.bot-herdr/plans/p-20261121-siir/plan.md:16`).
- Message queueing while an agent works:
  - UI composer: `mods/bot-herdr/composer.js:217` (`outboxQueue`), 1220-1234 (`sendText`/`flushOutbox` — cross-page sends queued while a send is in flight); placeholder at 1635 says "Enter steers it…".
  - Agent: `mods/bot-herdr/engine/lib/agent.mjs:292` (`const queue = []`), 801-831 (`drain()` runs queued prompts sequentially, `enqueue` pushes and shows "(Queued: it goes after this turn.)" when busy), 812-816 (the while-drain), 907-927 (first message and non-tty stdin lines enqueued).
- Agents › Terminals (`mods/bot-herdr/agents.js:1-5, 27-35, 115-116, 161`): Terminals is herdr's pane stage — the mod draws only the 40px strip (`SUB_TABS` Fleet|Terminals, line 27-30); panes are herdr's.
- Tiling 2+ panes: not supported today. `layouts/bot-herdr.json:182-235` — "terminals" column has "panes" (a `type:"row"`) with a single child "main" block (`tab:"active"`, `pane:{lone:true, ...}`). `mods/bot-herdr/gpui-kit.d.ts` has the building blocks (`Splitter` role at :192, `on_resize` at :1158, `resizable_panel()` at :1147) but the layout ships one active pane per stage; the spec lists "Tiled agent panes" as P2 (`design-language-spec.md:245`).

### 5. Feature markers (Q5) — `mods/bot-herdr/engine/lib/ui-audit-spec.mjs:597-607`
- `approvalCard` — label "Three-choice approval card", markers `/^bh-approval/` (604)
- `diffReview` — label "Diff review with inline comments", markers `/^bh-diff/, /^bh-review/` (605)
- `viewModes` — label "Summary / Normal / Verbose views", markers `/^bh-view-mode/` (606)
- Other features: threads (`/^bh-thread-/, /^bh-threads/`), goalRow (`/^bh-goal-row/, /^bh-goal-strip/`), homeNeedsYou (`/^bh-home-needs/, /^bh-home-row-/`), liveSummary (`/^bh-row-summary/`), peek (`/^bh-peek/, /^bh-answer-card/`)
- P2 markers: **none** — a grep of the spec for `p2|P2|child|tile|pane|queue|handoff|fork|map` returns no matches; the four P2 features have no markers yet.

## Brief Check (each "Done when" criterion: met or not, with evidence)
1. approvals.mjs: what exists — held-permission hook exists but is a no-op; no `listHeld`; `bh approvals` placeholder (bh.mjs:1073-1076). Project allowlist: none — `.bot-herdr/config.json` does not exist; existing allowlist is `agents.allow` in DATA/config.json (core.mjs:42, runner.mjs:501). What's missing for three-choice card: `maybeHoldPermission`, store/`listHeld`, card component, project-allowlist write path, Ask/Guarded pause behavior (settings.js:119; runner.mjs:654).
2. review-comments.mjs: placeholder; data shape none; no line-anchoring/Dev routing; Changes sub-tab renders today as diff stat (threads.js:625-648).
3. View-mode toggle: where it would go — threadPage header, threads.js:482-501 (`bh-view-mode`); conversation items — threadview.js:171-194 rendered at threads.js:531-560.
4. Child reports: thread.mjs:364/474-489. Fork/handoff: none (P2; working.js:17, goal.mjs). Queueing: composer.js:217,1220-1234; agent.mjs:292,801-831. Agents › Terminals: agents.js. Tiling 2+: not allowed — layouts/bot-herdr.json single "main" pane (P2).
5. Markers: approvalCard /^bh-approval/, diffReview /^bh-diff|/^bh-review/, viewModes /^bh-view-mode/; P2 markers: none in spec.

## Verification
- No commands run — read-only reconnaissance (grep/read). All claims are at the cited `file:line`s above. `bh`/`hc` CLIs and `bh check` were not available in this session (no shell tool), so verification is by code inspection.

## Knowledge Proposals
- None (read-only; nothing project-knowledge-worthy proposed to the Orchestrator beyond this report).

## Blockers / Pushback
- None. (The only "difficult" finding — "Allow for this project" has no store yet — is a finding, not a pushback request.)
