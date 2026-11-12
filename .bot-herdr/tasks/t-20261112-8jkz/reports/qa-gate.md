# QA gate — t-20261112-8jkz (deep, run by the Orchestrator)

The configured qa-gate harness (Claude Code) hit its 5-hour limit before its
first action (resets 19:20); the Orchestrator ran this gate instead.

## Verdict: PASS

## Commands (all run 2026-11-12 ~16:00)
- `node --test test/*.test.mjs` — 177 tests, 176 pass, 1 skipped, 0 failing.
- `bh check` — PASS (lint, typecheck, tests).
- `herdr-app check mods/bot-herdr` — check passed.
- `tsc -p mods/bot-herdr/jsconfig.json --noEmit` — no TS2304/TS2552 outside engine/.

## Review (code read, focus areas from the risk report)

**Delete paths (tasks.mjs:122-138, plans.mjs:38-44)** — id regex `/^[\w-]+$/`
blocks traversal on both; `deleteTask` refuses active tasks and removes a
worktree via `git worktree remove` with no `--force`; a git refusal throws a
fix-it line and the task folder is not deleted. `deletePlan` deletes only the
plan's folder plus its open question sets (`discardOpenFor`); answered sets and
made tasks stay. Tests cover both, including the refused-id case.

**Session scoping (agent.mjs:165-168, core.mjs:37-48)** — `resumeState` resets
on harness change, keeps a no-root (pre-change) session, resets when root
differs. Worktree paths fold back to the parent project root. `project-scope`
tests cover all branches.

**Ask parser (ask.mjs)** — misplaced, duplicate and unclosed mockup fences
become warnings; `bh ask --file` refuses the whole file (exit 1, nothing
written, bh.mjs:86/381). Mockups are drawn at ask time with per-failure
reporting; scripts and `<link>` stripped before writing.

**work.js state** — every async continuation re-checks `dir !== projectDir()`
before touching state (loadPlans 405/409, loadKnowledge 415/422, run 450/454),
so a space switch mid-load can't show or save another project's data. Delete
opens the neighbour and sets `stayClosed`; all timers are `cx.timer.*`
(framework-managed).

**Buttons** — one `actionButton` (28px) across pages; remaining `clickable(`
uses in chat.js/composer.js are chips, rows and toggles, not buttons;
documented exceptions in settings.js (chevron in a field, slider tick labels).

**Wording** — no "the person" in roles, engine, team.mjs, work.js, plandoc.js.

## Findings
- Critical: none.
- Major: none.
- Minor 1: alternating two projects with the same agent name in the same
  terminal resets the conversation each switch (one session file under DATA,
  names unchanged so pre-change sessions survive — deliberate, announced with
  a "another project" line). A per-project file name would preserve both.
- Minor 2: the Tasks/Plans rebuild was verified by check + tests + code read;
  no click-through of the running app against the GIFs (the user will see it).
- Minor 3: gpui-kit.d.ts doc comments still say "the person" — the host app's
  own type docs, not bot-herdr's words; out of scope by the brief.
