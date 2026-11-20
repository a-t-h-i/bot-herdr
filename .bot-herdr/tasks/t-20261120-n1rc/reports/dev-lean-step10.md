## Summary
The metrics roll-up fix is in (ids are slug-form; display-name records join their agent), skill discovery covers Gemini, Qwen, Antigravity and pi, and the skills classifier is wired as an allowlist: one pick per task or plan, `--skill` for blocker additions, pins ∪ picked ∪ added enforced at launch (Claude Code skills+MCP, Codex MCP) and named in the brief elsewhere, with each step recording what its spawn was allowed.
`npm test` 337 tests (336 pass, 1 skip, 0 fail), `bh check` PASS; on the app's real data each agent now shows once, and `bh tools --list` answers every harness.

## Changes
- `mods/bot-herdr/engine/lib/metrics.mjs` — `idFor` slugs the role or the name before matching: ids are always `slug()`-form, a display name (`Design`, `Orchestrator`) rolls up to the roster id, and old spawn names still roll up to the longest roster id (`dev-lean` → dev). One test added in `test/metrics.test.mjs`.
- `mods/bot-herdr/engine/lib/tools.mjs` — `SUPPORTED` is now claude, codex, opencode, gemini, qwen, antigravity, pi; new readers `readGemini`, `readQwen`, `readAntigravity`, `readPi` (SKILL.md name/description, watched folders so the 24 h cache goes stale when one changes); `listHarnesses(known)` for `bh tools --list`.
- `mods/bot-herdr/engine/bh.mjs` — `bh tools --list` (every harness as `{ key, name, supported }`, saved names first); `bh task new` asks triage and skills in one classifier request and saves `skills` (`{ id: { picked, added } }`) for every non-lead agent; `bh plan new` makes one `pickSkills` call for the seats (dev, design, qa, research, custom agents) and saves the same shape on plan.json; `bh spawn … --skill <name>` (repeatable) appends to the task's or plan's `added` before launch, refuses without a task or plan, and records `steps[n].skills = { pinned, picked, added, fallback }` when it starts a step; helpers `skillRoles`, `skillRecord`, `pickedLine`; HELP lines for `--skill` and `tools --list`.
- `mods/bot-herdr/engine/classifier/index.mjs` — `features.skills` on by default; `triage` split into `triageQuestions`/`triageState`/`triageFrom` (same answers as before); `triageAndSkills(c, request, { roles })` asks triage and skills in one request; `pickSkills(c, request, roles)`; both cap each role at 40 candidates (descriptions clipped to 120), return only names from that role's candidates, at most 5, `none` → `[]`, and null when the feature is off or the model did not answer.
- `mods/bot-herdr/engine/lib/tasks.mjs` — `addSkills(record, id, names)` (pins-and-added record); `mods/bot-herdr/engine/lib/plans.mjs` — `newPlan` takes `skills`.
- `mods/bot-herdr/roster.js` — pure `allowedFor(agent, entry)`: `picked: null` → pins only, no pins = no restriction (today's behaviour); a `picked` array → pins ∪ picked ∪ added, with picked/added names split into skills or MCP servers by what the harness installs; `limitArgs` uses it (`denied` replaces `unticked`), so an empty allowlist denies everything installed.
- `mods/bot-herdr/engine/lib/team.mjs` — `withAllowlist(agent, entry)` attaches the entry and, when the picks restrict, the harness's installed names; `toolsSection` names the allowlist for every harness: `Use only these skills: a, b. If you need another, post a blocker naming it.` and the MCP line, or no section when there is no restriction.
- `mods/bot-herdr/engine/lib/agent.mjs` — each turn attaches the task's or plan's skills entry for the agent (`skillEntry()` + `withAllowlist`) before the brief and argv are made, so headless launches enforce the same allowlist.
- `mods/bot-herdr/engine/roles/worker.md` — one line: a missing skill goes to a `blocker`, never a workaround. `engine/roles/orchestrator.md` (Delegation) — a blocker naming a missing skill: re-spawn with `--skill <name>`.
- Tests: `test/skills-discovery.test.mjs` (7: gemini, qwen, antigravity, pi incl. `PI_CODING_AGENT_DIR`, omp unsupported, cache staleness for qwen, `bh tools --list`), `test/skills-allowlist.test.mjs` (8: allowedFor null/[]/union, claude and codex limitArgs, the brief sentence, `bh spawn --skill` on a task and on a plan, step record and `bh task list --all --json`), `test/skills-classifier.test.mjs` (6: own candidates only, cap 5 and `none`, one request for triage+skills, task new stores picks, classifier off stores null, plan new picks seats only and `plan show --json` keeps them).

## Brief Check
- Metrics fix: one row per agent — **met**. `BH_APP_HOME=/home/athi/.config/herdr-app node mods/bot-herdr/engine/bh.mjs metrics --window 7d`:
  ```
  Orchestrator (orchestrator): 624 min, 257 turns, ≈143772397 tokens, ≈$732.29, 0 tasks, 0 steps
  Dev (dev): 285 min, 45 turns, ≈143000668 tokens, ≈$28.66, 18 tasks, 8 steps
  Design (design): 214 min, 58 turns, ≈150842998 tokens, ≈$43.74, 17 tasks, 6 steps
  QA (qa): 156 min, 38 turns, ≈7741437 tokens, ≈$7.66, 25 tasks, 1 steps
  Research (research): 30 min, 2 turns, ≈124141 tokens, ≈$0.00, 2 tasks, 1 steps
  Scout (scout): 18 min, 6 turns, ≈4163275 tokens, ≈$0.13, 6 tasks, 0 steps
  knowledge-scout-869705 (knowledge-scout-869705): 0 min, 2 turns, 355611 tokens, $0.02, 0 tasks, 0 steps
  ```
- Step 9 harnesses supported and paths read — **met**:
  - claude (as before): `~/.claude/skills` (two folders down for synced), `<project>/.claude/skills`, installed plugin `skills` folders.
  - codex (as before): `$CODEX_HOME/skills` (or `~/.codex/skills`), `~/.agents/skills`, `<project>/.agents/skills`.
  - opencode (as before): `~/.config/opencode/skills`, `~/.claude/skills`, `~/.agents/skills`, `<project>/.opencode/skills`, `<project>/.claude/skills`, `<project>/.agents/skills`.
  - gemini — `~/.gemini/skills`, `<project>/.gemini/skills`, `~/.agents/skills`.
  - qwen — `~/.qwen/skills`, `<project>/.qwen/skills`, `~/.agents/skills`.
  - antigravity — `~/.gemini/config/skills`, `<project>/.agents/skills`.
  - pi — `<agent-dir>/skills` (`PI_CODING_AGENT_DIR`, default `~/.pi/agent`), `<project>/.pi/skills`, `~/.agents/skills`, `<project>/.agents/skills` (pi 1.6.0 `docs/configuration.md`, `docs/skills.md`).
  - omp — **unsupported**: no `omp` binary on this machine (not in `~/.local/share/mise/installs`, `which omp` empty), no docs installed to confirm a folder, so no reader.
  - `bh tools --list --json` on the app's data prints 24 harnesses; supported: claude, codex, pi, opencode, gemini, antigravity, qwen; everything else unsupported (cursor, copilot, amp, grok, aider, auggie, cline, crush, droid, dsh-tui, goose, hermes, kimi, kiro, omp, pig, qoder).
- Step 10 picks in one call and saved — **met** (tests; task.json/plan.json `skills`, `task show --json` / `plan show --json` include it).
- `--skill` appends, allowlist enforced and named, steps record it, `steps[].skills` in `bh task list --all --json` — **met** (tests; claude `--settings` deny list, codex `-c`, brief for other harnesses).
- `npm test` and `bh check` pass — **met**: `npm test` 337 tests, 336 pass, 1 skip (`bh mockup draws a page with a headless browser`: no headless browser here), 0 fail; `bh check` PASS.

## Verification
- `timeout 700 npm test` — exit 0: 337 tests, 336 pass, 1 skip, 0 fail.
- `timeout 700 node mods/bot-herdr/engine/bh.mjs check` — exit 0: PASS, 336 pass, 1 skipped, no lint or typecheck set up.
- `node --test test/skills-discovery.test.mjs test/skills-allowlist.test.mjs test/skills-classifier.test.mjs` — 21 pass, 0 fail.
- `BH_APP_HOME=/home/athi/.config/herdr-app node mods/bot-herdr/engine/bh.mjs tools --list --json` — 24 entries, `supported` true for the seven above.
- Real-data metrics run above — one row per agent (the duplicate "Design (Design)" / "QA (QA)" / lead-as-"Orchestrator" rows are gone; `knowledge-scout-869705` is the knowledge Scout's own terminal name, not a roster agent, so it stays its own row).

## Pushback
- **Request:** keep the two `test/tools.test.mjs` assertion changes (outside my file list). **Reason:** step 9 makes gemini supported, so the test's "unsupported" example had to become omp (which is left unsupported on purpose); and step 10's required sentence (`… skills: review, deploy. If you need another, post a blocker naming it.`) no longer matches the old exact-match regex. `npm test` cannot pass without them. **Alternative:** revert the file and the behaviour it tests is not available.
- **Note:** step 10's word `picked: null` means "pins only", so `--skill` additions take effect only when a picks array exists; with the classifier off nothing is restricted anyway, so no skill is lost.

## Knowledge Proposals
- Skill folders per harness read by `bh tools`: gemini `~/.gemini/skills` + `.gemini/skills` + `~/.agents/skills`; qwen `~/.qwen/skills` + `.qwen/skills` + `~/.agents/skills`; antigravity `~/.gemini/config/skills` + `.agents/skills`; pi `<agent-dir>/skills` (default `~/.pi/agent`, `PI_CODING_AGENT_DIR` overrides) + `.pi/skills` + `~/.agents/skills` + `.agents/skills`; omp has none known on this machine.
- The allowlist: `picked: null` keeps pins-only behaviour, a `picked` array (even `[]`) denies everything installed outside pins ∪ picked ∪ added; Claude Code enforces skills and MCP by `--settings` deny, Codex MCP by `-c`, every other harness by the brief's named list and the blocker rule.
- Usage roll-up ids are `slug()`-form: a record `agent` that is a display name (`Design`) or a spawn name (`design-polish`) belongs to the same agent; the rostered id is the longest roster id its slug starts with.

## Script Proposals
None.

## QA gate fixes (CHANGES_REQUIRED)
1. **Metrics unreported zeros (finding 1, engine half; contract #24).** `metrics.mjs` now returns `tokens: null` when no turn reported tokens and none could be estimated (per agent and in `totals`), and `costUsd: null` when nothing was reported or priced (totals included: `answerOf` no longer turns null into `0`). `test/metrics.test.mjs` gained the two cases. Repro run: `metrics()` with one time-only record (`reported: {tokens:false,cost:false}`, gemini, window today) now gives `agent.tokens null`, `agent.costUsd null`, `totals.tokens null`, `totals.costUsd null`; a reported-tokens turn on an unpriced model gives `{input:100,output:10,…}` with `costUsd null` and `totals.costUsd null`. The view half (showing "—") is Design's.
2. **Compaction marker ownership and handoff (finding 2).** The marker now carries `project` (the project root) and `kind` (`done` | `planned`), plus `plan` for a plan-to-task marker; `agent.mjs` consumes it only for `mode === "lead" && agent.lead` whose project root matches, and leaves it otherwise. The handoff for `planned` reads `Previous plan <plan title> became task <task title>; it starts now.`; for `done` it still reads `<title>: done.`. `test/compact.test.mjs` gained a non-Orchestrator lead test, a foreign-project test and the planned handoff test. Repro (a): after `bh task status <id> done`, `bh agent dev --mode lead -- "hello dev"` leaves `compact-pending.json` exactly as it was. Repro (b): after `bh plan task <plan>`, an Orchestrator turn on a harness whose compaction fails starts from `## Handoff / Previous plan Build feature became task Build feature; it starts now. / 1. Build it — todo / 2. Test it — todo`.
3. **Planned task skills and pinned + `--skill` (finding 3).** `bh plan task` copies `plan.skills` onto the new task, and every non-lead agent the plan did not cover gets `{ picked: null, added: [] }`. `allowedFor` (roster.js) now merges `entry.added` into the pins when `picked` is null and the agent has pins (`skills` and `mcp` kept apart), while no pins at all stays unrestricted. Tests: `test/skills-classifier.test.mjs` (plan new → plan task keeps dev's picks, scout gets null) and `test/skills-allowlist.test.mjs` (picked null + pin alpha + added beta → `limitArgs` denies only gamma). Repro (b): `limitArgs({… skills:["alpha"], allowed:{picked:null, added:["beta"]}})` → `--settings {"permissions":{"deny":["Skill(skill:gamma)"]}}`.
4. **Minors 4, 7, 8.** Skill questions are keyed `skills.<id>` (no collision with triage keys), and a choice must start with `<role>.` before its index is read (else `[]`); tests updated in `test/skills-classifier.test.mjs`. `team.mjs` `withInstalled`/`withAllowlist` use `projectRoot()` instead of `process.cwd()`. `bh plan new` tells `pickSkills` the seats are "a read-only planning seat: no write or deploy skills" (asserted from the fake classifier's prompt).

## QA round 2 fixes
1. **`bh metrics` CLI crash on `tokens: null` (major).** `metricLine` (bh.mjs) now prints `—` for tokens when `a.tokens` is null, like the cost; the plain line for QA's repro is `Dev (dev): 1 min, 1 turns, — tokens, —, 0 tasks, 0 steps`. QA's exact repro (one time-only gemini record in `DATA/usage/dev.jsonl`, then `node mods/bot-herdr/engine/bh.mjs metrics --window today`) now exits 0 with that line. Test added in `test/metrics.test.mjs` (own temp app/project, so the window holds only the time-only record): plain output matched, exit 0.
2. **`allowedFor` category leaks (minor 2).** Picked and added names are classified by which installed list holds them; the picked-array branch no longer adds every pick to `allowed.skills`, so an MCP pick stays MCP (`allowedFor(… { picked: ["github"] })` → `{ skills: [], mcp: ["github"] }`, and the brief reads `Use only these skills: none.` / `Use only these MCP servers: github.`). With `picked: null`, a `--skill` addition is merged only into the category it belongs to, and only when that category has pins: pins `skills: ["alpha"]` + added `github` → `{ skills: ["alpha"], mcp: null }` and `limitArgs` denies only `Skill(skill:beta)`. Both cases are tests in `test/skills-allowlist.test.mjs`.
3. **Stale comment (minor 3).** `metrics.mjs` no longer says totals always have a cost number; it states contract #4 as amended (null when nobody reported and nothing could be estimated).
4. **Test flake found while running the suite:** `test/tools.test.mjs`'s "new skill folder is read again" depended on the folder's mtime changing within the same millisecond; it now bumps the folder mtime with `utimesSync` (what installing a skill does) before asserting. This is a test-only determinism fix.
