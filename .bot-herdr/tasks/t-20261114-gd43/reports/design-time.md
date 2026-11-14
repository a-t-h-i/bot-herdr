## Summary
Work page and tracker show only recorded turn time; the tracker adds a live part only for an active step whose agent is working now.

## Changes
- `mods/bot-herdr/work.js`: `workedOf` returns the task's `timeMs` when a number, else the sum of steps' stored `workedMs` — no `now - started`. The Work page's `stepTime(s)` returns the step's `timeMs` when a number, else its stored `workedMs`; "" when 0 and the step is not active. Both running-clock formulas removed.
- `mods/bot-herdr/steps.js`: new `stepWorked` (base `timeMs`, else `elapsedMs`, else `workedMs ?? 0`, plus `now - since` when the step is active and its agent is in `working`) and `taskWorked` (task `timeMs`, else `worked`, else the steps' times). `stepRow` and `trackerModel` take the `working` map of agent name (lower case) → current turn start.
- `mods/bot-herdr/chat.js`: `workingSince()` builds that map from `this.since[address]` for live agents whose status is `working`, keyed as `trackerActions` keys names; `trackerCard` passes it to `trackerModel`.
- `test/steps.test.mjs`: removed the assertion that a step's time counts from `started`; added the three required tests plus a done-step assertion of the same agent.

## Brief Check
- "An active step with `started` an hour ago, `timeMs` 120000 and no working agent shows 2 min, not 62" — met (`tracker: a step's time is its recorded time, not a clock from when it started`).
- "The same step whose agent has been working for 60 s shows 3 min" — met (`tracker: a step whose agent works now adds the part of that turn`).
- "A step with no `timeMs` (older engine) uses its stored `workedMs` and does not grow" — met (`tracker: an older engine's step uses its workedMs and does not grow`).
- Tracker header usage line untouched — met.
- No new dependencies; functions within 20 lines; no other refactors — met.
- `grep -n "Date.parse(s.started)" mods/bot-herdr/work.js mods/bot-herdr/steps.js` finds nothing — met.

## Verification
- `timeout 300 node --test test/steps.test.mjs` — 11 pass, 0 fail.
- `timeout 300 node mods/bot-herdr/engine/bh.mjs check` — PASS, 17 tests.
- `timeout 300 herdr-app check mods/bot-herdr` — check passed.
- `npx -y -p typescript@5 tsc -p mods/bot-herdr/jsconfig.json --noEmit` — no TS2304/TS2552 in work.js, steps.js, tracker.js, chat.js (other pre-existing TS errors in the file set unchanged).
- `grep -n "Date.parse(s.started)" mods/bot-herdr/work.js mods/bot-herdr/steps.js` — no matches (exit 1).

## Design choices
- live part gated on `s.status === "active"` as well as the `working` map: the map is keyed by agent name, so a finished step of the same agent would otherwise tick during that agent's next turn.
- `taskWorked` in `steps.js` prefers `task.timeMs`, then `task.worked`, then the steps' sum, so the tracker header shows the engine's own overlapping-once total like `workedOf` does.

## Knowledge Proposals
- Work page and tracker show recorded turn time only; the tracker's live part exists only for an active step whose agent is in the `working` map (agent name → turn start), built by `chat.js` `workingSince()` from `this.since`. A done step never grows.
