Goal: step 2 of task t-20261114-gd43 ("Fix the time worked timer"). The user reports that a task's time worked starts when the task is planned, never stops even after the agents stop, and is far too large. The UI copies the engine's old formula: a step's stored `workedMs` plus `now - started` for as long as the step is `active`. So a step whose agent died or stopped keeps ticking. Dev is changing the engine to report time from the agents' turns only (contract below). Your part: the UI shows that number and adds a live part only while the step's agent is working right now.

Files you own: mods/bot-herdr/work.js, mods/bot-herdr/steps.js, mods/bot-herdr/tracker.js, mods/bot-herdr/chat.js, test/steps.test.mjs. Leave alone: everything under mods/bot-herdr/engine/ and the engine tests.

What to do:
1. work.js: `workedOf` (line 107) returns the task's `timeMs` when it is a number. Otherwise it falls back to the sum of the steps' stored `workedMs`, with no `now - started` part. The step time helper (around line 1258-1261) shows the step's `timeMs` when it is a number, else its stored `workedMs`, again with no running part, and shows "" when that is 0 and the step is not active. Remove both running-clock formulas.
2. steps.js `stepRow` (line 75): the base time is `s.timeMs`, else `s.elapsedMs`, else `s.workedMs ?? 0`, with no `now - started` part. Add a live part only when the model is told the step's agent is working now. Pass that in the way `asking` is passed today, as a map from agent name (lower case) to the ms its current turn started at. `chat.js` builds it from `this.since[address]` (status `working`, `at`) for live agents, mapped to names as `trackerActions` maps them. The time is then `base + (now - since)` for a working agent, and `base` otherwise.
3. The tracker header's usage line already shows minutes from usage. Leave it as it is.
4. Tests in test/steps.test.mjs, each failing without its change:
   - An active step with `started` an hour ago, `timeMs` 120000 and no working agent shows 2 min, not 62.
   - The same step whose agent has been working for 60 s shows 3 min.
   - A step with no `timeMs` (older engine) uses its stored `workedMs` and does not grow.

Contract (from Dev, on the task board as entry 1):
`bh task list --json` and `bh task show --json` give each step `timeMs` (the sum of its agents' turn times) and the task `timeMs` (overlapping turns counted once). Nothing in `timeMs` grows between turns, and a running turn is not in it. The installed engine may still lack `timeMs`, so fall back as above.

Constraints: no new dependencies, functions at or under 20 lines, no other refactors. gpui-kit has no rotate or transform. Use `node mods/bot-herdr/engine/bh.mjs …` for bh commands.

Done when: `timeout 300 node --test test/steps.test.mjs` passes, `node mods/bot-herdr/engine/bh.mjs check` prints PASS, `herdr-app check mods/bot-herdr` passes, and `npx -y -p typescript@5 tsc -p mods/bot-herdr/jsconfig.json --noEmit` shows no TS2304/TS2552 in your files. `grep -n "Date.parse(s.started)" mods/bot-herdr/work.js mods/bot-herdr/steps.js` finds nothing.

Report: write the report file this brief's footer names, record it with `bh report` (with `--step 2`), and `hc send` your parent the summary and the path.

If stuck: if the code doesn't match this brief, stop that part, finish the rest, and report it under Blockers.
