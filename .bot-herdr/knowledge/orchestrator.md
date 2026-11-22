# orchestrator: what I know about this project

## Facts
- bh in an agent shell resolves to the installed mod (~/.config/herdr-app/mods/bot-herdr/engine/bh.mjs), not the repo copy.
- A writing child worktree branches from the task last commit, so uncommitted task work is not in it: spawn with --shared to build on uncommitted work.
- test/bench/baseline.mjs records brief sizes, bh latency and spawn-to-first-prompt time on an isolated temp project (node test/bench/baseline.mjs <out.json>); use it before and after performance work.
- bh metrics reads every usage record; a record's cost is Claude Code's reported total_cost_usd, so the Orchestrator's long resumed session dominates spend ($718 reported over 7 days as of 2026-11-20).
- Headless children (gemini/antigravity Dev and QA) often end their turn while a long check (bh check, npm test, ui-audit) runs in the background, and never report; brief them to run checks in the foreground, and if hc wait returns done without a report, hc send them to re-run in the foreground and finish.
- The team roster (each agent's harness and model) is the user's to change in Settings › Team; bh team save refuses the Orchestrator. When a harness runs out of quota, ask the user to switch it there, then watch bh team for the change.
- A child whose harness failed (for example on quota) can leave its worktree open, which blocks a new spawn of that agent. Check it has no changes, then run bh merge <name> --task <id> --drop before spawning again.

## Standards
- gpui-kit declares no rotate or transform and .loop() takes no delay: check mods/bot-herdr/gpui-kit.d.ts (npx tsc -p mods/bot-herdr/jsconfig.json) before using a style method.
- node --check and bh check miss a missing import in a mod file; herdr-app check mods/bot-herdr loads the mod and catches it (only for the first view it draws). Run it after every mod change.
- To catch undefined names in mod files (herdr-app check only renders the first view): npx -y -p typescript@5 tsc -p mods/bot-herdr/jsconfig.json --noEmit and read TS2304/TS2552 outside engine/ (engine hits are Node timers, false positives).

## Decisions
- Commits must never include the trailer 'Co-authored-by: Claude <noreply@anthropic.com>'
- Headless ask handling ends the turn only after the bh ask tool call has finished (its result event, or ACP tool_call_update completed), never at its start or permission request.
- Every finished task ends with a git commit and push to origin/main, then a rebuild and install into the herdr app (node install.mjs; herdr-app check must pass). From the user, 2026-11-11.

## History
