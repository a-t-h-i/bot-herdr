# orchestrator: what I know about this project

## Facts
- bh in an agent shell resolves to the installed mod (~/.config/herdr-app/mods/bot-herdr/engine/bh.mjs), not the repo copy.

## Standards
- gpui-kit declares no rotate or transform and .loop() takes no delay: check mods/bot-herdr/gpui-kit.d.ts (npx tsc -p mods/bot-herdr/jsconfig.json) before using a style method.
- node --check and bh check miss a missing import in a mod file; herdr-app check mods/bot-herdr loads the mod and catches it (only for the first view it draws). Run it after every mod change.
- To catch undefined names in mod files (herdr-app check only renders the first view): npx -y -p typescript@5 tsc -p mods/bot-herdr/jsconfig.json --noEmit and read TS2304/TS2552 outside engine/ (engine hits are Node timers, false positives).

## Decisions
- Commits must never include the trailer 'Co-authored-by: Claude <noreply@anthropic.com>'
- Headless ask handling ends the turn only after the bh ask tool call has finished (its result event, or ACP tool_call_update completed), never at its start or permission request.
- Every finished task ends with a git commit and push to origin/main, then a rebuild and install into the herdr app (node install.mjs; herdr-app check must pass). From the user, 2026-11-11.

## History
