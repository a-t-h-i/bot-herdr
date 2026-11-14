QA gate for step 4 of task t-20261114-gd43. Steps 1-3 (the timer) already passed QA and are committed (ce8f4bc); review only the staged step-4 change.

The bug: the app's Chat view failed with "This view could not be rendered: interrupted". The feed has about 300 entries, and for every agent entry chat.js `childEntry` called composer.js `entryAt`, which rebuilt the roster several times.

The change: composer.js `entriesByAddress()` does one pass over the roster and the running agents, and `entryAt` delegates to it. chat.js `items(space)` builds that map once per call and caches its result (keyed by space, the entries array, the last id, and the map's addresses and lead). `workers()` and `railRows()` use the map too. New tests: test/feed-items.test.mjs. Report: .bot-herdr/tasks/t-20261114-gd43/reports/design-render.md. After install, the live app's Chat view renders again (the Orchestrator checked this with a screenshot, and `herdr-app status` shows no errors).

Look adversarially at:
- whether `entryAt` gives exactly the same answer as before in every case (the lead at its target address, an agent whose tab name matches, no running agent, two roster agents with one name);
- stale cache: an entry's text changing in place, an entry removed or trimmed (the KEEP cap) while the last id stays the same, a space switch, an agent starting or stopping, the lead changing in Settings;
- anything that still calls `entryAt` or `roster()` per entry, per frame.

Use `node mods/bot-herdr/engine/bh.mjs …` for bh commands. Verdict: PASS or CHANGES_REQUIRED. Tag each finding critical, major, minor or info, with its file:line, expected vs observed, and a fix. Write .bot-herdr/tasks/t-20261114-gd43/reports/qa-render.md, record it with `node mods/bot-herdr/engine/bh.mjs gate t-20261114-gd43 --verdict <V> --round 2 --file .bot-herdr/tasks/t-20261114-gd43/reports/qa-render.md "<summary>"`, then `hc send` your parent the summary and the path. Do not edit production code.
