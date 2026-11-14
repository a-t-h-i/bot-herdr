QA gate, round 4, for task t-20261113-n9rt (plan p-20261113-bkli; its acceptance criteria are the bar). Risk: HIGH.

Round 3 (.bot-herdr/tasks/t-20261113-n9rt/reports/qa-gate3.md) sent it back. Dev's fixes are reported in .bot-herdr/tasks/t-20261113-n9rt/reports/dev-fix3.md and sit uncommitted in the working tree.
1. Check each round-3 finding and say whether it is addressed:
   - major: duplicate report and merge events in `stepEvents` (lib/tasks.mjs)
   - major: no usage in `bh task list --json`, which the task page (work.js) reads
   - minors: `recordUsage` can fail a turn; Codex input over-counted; stale-lock give-back now uses `linkSync` in core.mjs (look adversarially for a new race or a lock that is never released); `forBrief` off-by-one.
2. The tracker minors (chat.js polling and placement) and the dropped "N of M" button are deferred to the user on purpose. Note them only if they got worse.
3. Run `node mods/bot-herdr/engine/bh.mjs check` three times and report each run. Run `node --test test/store.test.mjs test/detail.test.mjs test/knowledge-inbox.test.mjs` if access allows it.

Out of scope: the .tmp-* files at the repo root and any .bot-herdr/ changes outside this task's folder.

Verdict: PASS or CHANGES_REQUIRED. Tag each finding critical, major, minor or info, with its file:line, expected vs observed, and a fix. Only critical and major findings block. Write .bot-herdr/tasks/t-20261113-n9rt/reports/qa-gate4.md, record it with `node mods/bot-herdr/engine/bh.mjs gate t-20261113-n9rt --verdict <V> --round 4 --file .bot-herdr/tasks/t-20261113-n9rt/reports/qa-gate4.md "<summary>"`, then `hc send` your parent the summary and the path. Do not edit production code.
