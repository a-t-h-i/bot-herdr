QA gate, round 3, for task t-20261113-n9rt ("Make the team hand off, verify and show its work reliably"; plan p-20261113-bkli, whose acceptance criteria are the bar). Risk: HIGH (concurrency, isolation, state).

What to review:
1. The gate-2 fixes (board entry 16, commit 2cd89b1 and before): guarded stale-lock takeover with token-verified release in mods/bot-herdr/engine/lib/core.mjs, and the commit-aware receipt `changeHash`. Check whether gate 2's two majors are really closed: a lost step update under contention, and a receipt hash that ignores HEAD. Run `node --test test/store.test.mjs` at least five times and report every run.
2. The uncommitted working-tree change for steps 14, 15, 20 and 21 (`git diff` plus the untracked mods/bot-herdr/steps.js, mods/bot-herdr/tracker.js, test/steps.test.mjs, test/detail.test.mjs, test/knowledge-inbox.test.mjs):
   - Step 14: `bh task show <id> --json` step `events` / `agentName` / `elapsedMs`, task `done` / `total` (contract on board entry 15). See lib/tasks.mjs `taskDetail`.
   - Step 20: per-turn usage captured from Claude `result` and Codex `turn.completed` events (lib/runner.mjs, lib/agent.mjs `recordUsage`), `bh usage [--task]` (minutes only for harnesses with no tokens), and `usageText` on the tracker and the task page.
   - Step 21: `bh knowledge inbox [--task]` and `K.forBrief` cutting by section.
   - Step 15: the tracker card (tracker.js, steps.js, chat.js `trackTask` / `loadTrackers` / `trackerCard`). It can't be rendered headless, so review its logic and its update path: one card per task, refreshed on the 5 s poll, folded when finished, "Needs you" opens the question.
   Reports: .bot-herdr/tasks/t-20261113-n9rt/reports/dev-finish.md and design-tracker.md.

Out of scope: the .tmp-* files at the repo root, and the changes under .bot-herdr/ outside this task's folder. Neither is this task's.

Checks to run: `node mods/bot-herdr/engine/bh.mjs check` and `herdr-app check mods/bot-herdr`. Use the repo engine (`node mods/bot-herdr/engine/bh.mjs …`); the installed `bh` lags this repo.

Verdict: PASS or CHANGES_REQUIRED, with each finding tagged critical, major, minor or info, its file:line, expected vs observed, and a fix. Only critical and major findings block. Write .bot-herdr/tasks/t-20261113-n9rt/reports/qa-gate3.md, record the verdict with `node mods/bot-herdr/engine/bh.mjs gate t-20261113-n9rt --verdict <V> --round 3 --file .bot-herdr/tasks/t-20261113-n9rt/reports/qa-gate3.md "<summary>"`, then `hc send` your parent the summary and the path. Do not edit production code; delete any temporary probe you add.
