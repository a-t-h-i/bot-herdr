Steps 17 and 19 and the popover fix are accepted and committed (6bde894). Next: step 18 of task t-20261113-n9rt: the task page shows the board and links each step's report. Same rules: UI files only (Dev is in mods/bot-herdr/engine/**), not plandoc.js, do not commit. Record your report with `node C:/Users/athenkosi.hlubi/.config/herdr-app/mods/bot-herdr/engine/bh.mjs report t-20261113-n9rt --step 18 --file .bot-herdr/tasks/t-20261113-n9rt/reports/design-rail.md "<summary>"` if that installed copy knows `report`; otherwise use `node mods/bot-herdr/engine/bh.mjs report …`. Then `hc send` me one line.

## Data (exists now, from step 4)
- `bh task show <id> --json` has the whole board (`board: [{n, at, kind, from, to, text, step?, file?}]`) and each step's `report: { file, summary, from, at }` when the step was reported. Read it the way work.js already loads a task; no new backend.

## What to do (work.js task detail, `taskBody` / `taskSteps` / `stepLine`)
1. Step report: a step with `report` gets a quiet "Report" link on its line (file icon, `TYPE.sm`, `c.muted`, hover `c.ink`), placed before the time. A click opens the file with the viewer the page already uses for files (`openFile` in viewer.js, through the project path Work resolves); the report's `summary` shows as one muted line under the step title (`TYPE.sm`, indented to the title, `STEP_TEXT`).
2. Board section, after Steps and before Comments, with `sectionLabel(c, "Board")` and the count: newest first, the last 10 entries, then a "Show all N" quiet button that shows the rest (state kept per task in memory).
3. A board row: a kind pill (`pill` from switch.js) in a tone per kind: blocker and question `c.warning`, done `c.success`, contract and decision `c.accent`, note `c.muted`; then `from` in its agent's ink (`agentInk`), `→ to` when set, the age ("now", "3m", "2h", "Nov 12") in `c.faint`; then the text under it, wrapped (plain text; file paths in it link like the chat's `linkFiles`). An entry with a `file` gets the same "Report" link.
4. Motion: rows join with the same opacity stagger the steps use (`MOTION.row`, `MOTION.stagger`). Nothing else moves.

## Constraints
No new tokens, no new dependency, no new polling loop (reload with the task as today), functions at or under 20 lines; keep feed.js and look.js import-free; put pure helpers (kind → tone, age text, newest-first slice) in signals.js or a new pure module and test them.

## Done when
- On this task's page (t-20261113-n9rt), step 6 shows a Report link that opens `.bot-herdr/tasks/t-20261113-n9rt/reports/dev-store.md` and its summary line; the Board section lists the entries newest first with tones by kind, at most 10 until "Show all".
- Tests for the pure helpers; `herdr-app check mods/bot-herdr` passes; tsc shows no new TS2304/TS2552/TS2339 in files you touched; `bh check` PASS.
