Steps 12 (feed) and 16 are accepted and committed (669d681). Next: step 15 of task t-20261113-n9rt, the live task tracker card in the chat. This is the user's own request, with their own mockup. Same rules: UI files only, not plandoc.js, do not commit. Record your report with `node mods/bot-herdr/engine/bh.mjs report t-20261113-n9rt --step 15 --file .bot-herdr/tasks/t-20261113-n9rt/reports/design-tracker.md "<summary>"`, then `hc send` me one line.

## Reference
Look at the user's mockup first: `.bot-herdr/plans/p-20261113-bkli/work/tracker-reference.jpg` (open it with your image reader). Match its layout and feel: a raised card; a header with the task title, a chip with the working agents and `done/total` on the right; a timeline of steps whose status circles are joined by one vertical line; each step row has its agent's badge, its title and its time on the right; a step opens (chevron) to show its events on a branch of the line, each event's text on the left and a muted detail on the right (`cart.ts:142`, `+18 −3`, `214/214` in the mockup); the active step shows a live action word in accent ("Writing") and its elapsed time; a step that needs the user has a dashed amber ring and an amber "Approval" pill (ours reads "Needs you").

## Data
- The contract is on the board (entry #15): `bh task show <id> --json` will give each step `events` (`{ at, kind: board|report|check|merge, text, detail, from }`), `agentName`, `elapsedMs`, and the task `done`/`total`. Dev builds it as step 14 now; until it lands, derive what you can from today's JSON (`steps[].status`, `agent`, `report`, `workedMs`, `started`; `board`; `children`) behind one function `trackerModel(task)` in a pure module, so switching to `events` later is one change. Write tests for `trackerModel` with a fixture in both shapes.
- Live action: map the step's agent (`agentName`) to its live terminal as the rail does and read `doing[address]`; turn the tool line into a word: Edit/Write → "Editing", Bash/Run → "Running", Read/Grep/Glob → "Reading", test commands → "Running tests", else "Working".
- Needs you: the step is `blocked`, or an open question comes from that step's agent; the pill opens that question the way the rail's Answer does (`answerFromRail`).

## Placement (decided; the plan lists it so the user can overrule it)
1. A tracker entry `{ kind: "tracker", task: <id> }` is added to the feed the first time the chat's task poll sees a task become `active` (the chat already loads tasks for its tasks widget: reuse that load, no new timer). It is drawn from the live task each render, so it updates in place.
2. One card per task. When the task is `done`, the card folds to one line: a check, the title, `done/total`, the total time; a click opens it again.
3. The rail gets a `TASKS` group under its agents: each active task as `title · done/total`; a click scrolls the feed to its card.

## Motion (gpui-kit animates opacity, width, height, left, top only; no rotate; check gpui-kit.d.ts)
4. The connector line under a step grows down (height transition, `MOTION.row`) when the step finishes; the check fades in; an opened step's events slide open (height + opacity); the action word shimmers with the moving band the working line uses (`indicators.js`).
5. The active ring: a pulsing ring (opacity loop as chat.js does) with a small accent dot travelling down the connector line below it (`top` loop). No spinning.
6. Dashed ring: `border_dashed()` in `c.warning`.

## Constraints
No new tokens (a card is `c.fill` with a 1 px `c.edge`, radius 12, like the rail); agent badges from `railview.js agentBadge`; no new dependency; no new timer; functions at or under 20 lines; keep feed.js and look.js import-free. The tracker drawing in a new `tracker.js` (gpui) and the model in a pure module.

## Done when
- This task (t-20261113-n9rt) draws as a card in the chat: 22 steps on a timeline, done ones checked, active ones pulsing with their agent's action word and elapsed time, step 6 opening to show its report event (and its board posts), the header showing `done/22` and the working agents.
- A blocked step shows the dashed amber ring and a Needs you pill; a finished task folds to one line and opens on click.
- The rail lists active tasks and a click scrolls to the card.
- Tests for `trackerModel` (both data shapes), the action word mapping, and the fold rule; `herdr-app check mods/bot-herdr` passes; tsc no new TS2304/TS2552/TS2339 in touched files; `bh check` PASS.
- In your report, describe the card at 1200 px, or draw it with the project's headless mockup renderer as you did for the rail.
