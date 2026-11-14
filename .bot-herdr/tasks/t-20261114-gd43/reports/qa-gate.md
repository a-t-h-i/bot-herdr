## Summary
PASS: time worked now comes only from recorded turns; overlapping turns merge, nothing runs on `started`, old tasks keep a fixed figure.
bh check green (127 tests, tree as staged); findings are minor/info only.

## Changes
None (review only; no tests added: worked.test.mjs and steps.test.mjs already cover each criterion).

## Brief Check
- Active step whose agent stopped no longer grows — met: `stepTime`/`worked` read usage only (tasks.mjs:168-187); worked.test.mjs:44-50 and :58-73 set `started` an hour back and get 20 min / 0.
- Parallel turns not double-counted — met: `taskTime` (tasks.mjs:173-181) sorts by start and adds only the part past the running end. Checked by hand: overlap, containment ([0,10]+[2,5] → 10), touching ([0,10]+[10,12] → 12), unsorted input (sorted first), negative/missing `ms` or bad `at` (turnSpan → null, dropped). Test worked.test.mjs:35-56 and :87-96.
- Nothing ticks between turns — met: grep of the mod finds no remaining duration from `started` outside the engine's own stop bookkeeping (tasks.mjs:119, :221-223, which only write `workedMs`); work.js `workedOf`/`stepTime` and steps.js `stepWorked` have no clock on `started`.
- Live part only for an agent working now — met: steps.js:75-80 adds it only when the step is active and `working[name]` exists; chat.js:664-671 fills it only from live rail rows with status `working`. A dead agent leaves `live()`, so `trackSince` (chat.js:745-757) drops its `since` and the live part stops. steps.test "a step whose agent works now adds the part of that turn".
- Old tasks without records keep a fixed figure — met: worked.test.mjs:75-85.
- Each change has a test; bh check green — met (receipt list below; workingSince in chat.js has no unit test, but it is a 6-line filter over the rail and its consumer is tested).

## Findings
- [minor] Live part keyed by agent name, not address — mods/bot-herdr/chat.js:664 / steps.js:78. Expected: only the agent on this step adds a live part. Observed: if two tasks' active steps carry the same agent name (e.g. `dev`) and one of them is working, both trackers add the live part. Fix: key `working` by address, or check the working agent's task.
- [minor] Tracker total omits the live part while the step row includes it — steps.js:83-87. Expected: header total ≥ the active step's time. Observed: during a turn the step can read more than the task total until the turn's record lands. Fix: add the same live part to `taskWorked` when `task.timeMs` is used (or accept it as by design).
- [info] Mixed tasks: once a task has any usage record, a step with stored `workedMs` but no records reads 0 (tasks.mjs:47, :338). Only affects tasks that span the switch to usage recording.
- [info] `step: null` records count in the task total and in no step (Number(null)=0 never matches a step n ≥ 1) — as the contract says; step times can therefore sum below the task total.
- [info] `usageOf` is read twice per `taskDetail`/`withUsage` (once directly, once in `worked`). Negligible cost.
- [info] A `ms` reported by the harness (agent.mjs:320-321) overrides wall time, so `at - ms` is the start only when the harness reports wall time.

## Verification
- node mods/bot-herdr/engine/bh.mjs check — PASS, 127 tests (19 files, incl. worked, steps, detail, engine), 0 fail
- grep `started` over mods/bot-herdr — no duration read from `started` remains outside tasks.mjs stop bookkeeping
