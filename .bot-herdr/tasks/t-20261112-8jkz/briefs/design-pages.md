Goal: steps 4, 5 and 6 (its buttons) of task t-20261112-8jkz. The person said the Tasks and Plans pages "look ugly af" and sent two GIFs of how they are supposed to look. Rebuild both pages, and the "View plan" pop-up, to match them, with Delete for a stopped task and Discard for a plan.

The target (study these first; they come from a web prototype of another project, so match the look and layout, and fill it with bot-herdr's own data):
- C:/Users/athenkosi.hlubi/Desktop/tasks-toast-light.gif and C:/Users/athenkosi.hlubi/Desktop/planning-light.gif
- Frames extracted to .bot-herdr/tasks/t-20261112-8jkz/gif/: tasks-toast-light-000.png (list + empty detail), -042.png (a running task), -098.png (a task with steps, comments, a toast); planning-light-000.png (the Plans page), -030.png and -075.png (the "Draft plan" side sheet, with a line being commented on).
- Today's pages: C:/Users/athenkosi.hlubi/.config/herdr-app/data/bot-herdr/pasted/pasted-20261112-122154.png (Plans) and pasted-20261112-122222.png (task detail). What is wrong with them, line by line: .bot-herdr/tasks/t-20261112-8jkz/reports/design-critique.md (read it; fix every point that still applies).

Files (repo C:/Users/athenkosi.hlubi/Desktop/bot-herdr/mods/bot-herdr):
- You own work.js and plandoc.js. You may add icons under icons/ (same 24px stroke style as icons/trash.svg): history.svg, file-plus.svg, pause.svg, play.svg, archive.svg, pointer.svg, or what you need.
- Use, don't change: look.js (design-sweep is adding `actionButton` there; it will message you and post a board contract), composer.js (the Composer class), media.js (mockupFile), lightbox.js (openLightbox), switch.js, bh.js.
- Leave every other file alone; design-sweep is changing the other UI files in parallel and dev-engine the engine.

Shared rules for both pages:
1. Every button is look.js `actionButton(c, id, label, onClick, { icon, tone, disabled, hint, tooltip })` (28px, one style). Until it lands, build layout first; check `bh board read t-20261112-8jkz` for the contract. Delete work.js's own button(), secondary() and chip() helpers (work.js:1295-1374) once nothing uses them. Status pills and seat tags are display-only tags, not buttons.
2. Section labels are one style everywhere: TYPE.sm semibold c.muted, followed by a 1px hairline (c.border) filling the rest of the row, as "Steps ———" in the GIF. Group labels in the task list: TYPE.xs uppercase letter-spaced c.muted with a count in a small pill, as "THIS SESSION 1".
3. No cards around whole sections; rows sit on the page background; selection is an accent tint with an accent edge (tasks-toast-light-042.png, the selected row).
4. Use the theme palette `c` and look.js tokens only (no raw hex), so every herdr theme still works; text keeps AA contrast (test/contrast.test.mjs must still pass).
5. Narrow windows: under 720px wide, a page shows its list or its detail, not both, with a Back link; nothing may get a negative or clipped width (critique "Narrow windows").

Tasks page (tasksView work.js:489, taskRow :553, mark :603, pips :617, taskDetail :623, trail :746):
6. Left column (LIST_W): a "Tasks" heading (TYPE.xl, semibold) with a segmented control on its right: "Tasks <n>" | "Archived <n>". Then the groups (SECTIONS work.js:35-38: "UNDER WAY", "FINISHED"). Each row: a status circle (empty ring = open/backlog, accent ring with a dot = active, muted ring with pause bars = paused, c.success filled check = done, muted x = abandoned; blocked keeps amber), the title (TYPE.md), a meta line in TYPE.sm c.muted ("active · fast track"), and on the right either step pips plus "k/n" (pill-shaped segments, accent for done) or, with no steps, the age. A thin vertical hairline separates the list from the detail.
7. No task open: the detail area shows a centred glyph and "Choose a task to see its steps, progress and comments." in c.muted.
8. Task open, top to bottom:
   a. An action row of actionButtons: Pause (icon pause) or Resume (icon play) as today (work.js:649-651); Archive or Unarchive (icon archive); and Delete (tone danger, icon trash) only when the status is not active. Delete is two-step: the first click turns it into "Delete for good?" for 5 s; a second click runs `bh task delete <id>` (contract below), then the list reloads and no task is open; on a non-zero exit show stderr's first line with the composer's say(..., "error") the way work.js shows other failures.
   b. Title row: the status circle and the title in TYPE.xl semibold.
   c. A row: a status pill (tinted: accent for active, c.success for done, muted otherwise), "<track> track" in c.muted, and a "Details" link that shows or hides: task id, started date, worked time, the branch or worktree line (work.js:657) and the request text with a leading "[task]" or "[plan]" tag removed.
   d. Pips and "k of n steps"; under it "worked <duration>" in TYPE.sm c.muted.
   e. "Steps": one row per step: a step circle (done = c.success filled check, active = accent ring with dot, todo = empty ring, blocked = amber), a muted "n.", the text (done steps in c.muted), and for the first todo step a small "next" tag. An active or done step shows on its right the agent (a 18px circle with the agent's initial in its colour, agentInk look.js:408, then its name, a c.success dot and "working" while active) and its time. More than one agent on a step (stepAgents work.js:55): a chevron expands one indented line per agent, as the child list in tasks-toast-light-042.png. Remove the animated dot trail (trail(), work.js:746-778).
   f. "Comments": the existing comments with their Resolve, Edit and Delete links (commentNote work.js:784); with none, "No comments yet. Comment on the task here or in the box below; the Orchestrator takes it into account." and an "Add comment" actionButton (icon comment) that opens the existing inline comment box for the task.
   g. Replace the bottom comment input and its Comment button (work.js:732-738) with a second Composer pinned at the bottom of the detail, made like planComposer (work.js:151-160): minRows 1, placeholder `Comment on ${task.title}…`, and its send runs the existing sendTaskComment path (work.js:337). The detail scrolls above it; nothing hides under it.

Plans page (plansView :829, viewPlanTab :867, planHead :925, previousList :973, planConversation :1015, planRail :1084):
9. A centred column (max 810px) with, at its top, the plan title in TYPE.lg semibold and a status pill (Grilling / Ready / Became a task / Archived) on the same line. Remove the header card, its map icon and the stepper (planHead's stepper, work.js:933-961).
10. The person's idea as a right-aligned bubble (as chat.js draws the person's messages, at most 70% of the column).
11. Each question set: a "Panel" label in accent with "<n> questions" in c.muted. Each question: a 2px left edge in the seat's colour, the seat's name as coloured text (not a pill), the question, then its options as inline text runs "**Label** — meaning" separated by a gap (no chips): the picked one with a check glyph in c.text, the rest c.muted. Options with mockups show 120x82 thumbnails in a row with numbered captions ("1. Header"), drawn with media.js mockupFile(file, cx) and opened large with openLightbox (as composer.js:2116-2132 does). The person's typed answer follows as "You: …" in c.muted. Questions still open show "Waiting for your answer in the chat" in c.muted.
12. Question sets from earlier rounds than the latest collapse to one line per question, as the auto-answered line in planning-light-000.png: a check, the seat name in its colour, the question, and the answer in semibold.
13. The conversation scrolls in the space above the composer with enough bottom padding that nothing sits under the View plan tab (critique: Plans first point).
14. The composer: planComposer.minRows 2 (from 8, work.js:154), placeholder "Describe what to plan, or answer the panel…". The View plan tab sits on the composer's top edge, centred, 28px tall, with a doc glyph.
15. The rail (planRail) at the page's right edge, as in planning-light-000.png: the round as a number in a 32px ring; then one pill per seat, 3 letters ("Orc", "Dev", "Des", "QA", "Res"), its text in the seat's colour, tinted fill when on and faint with no fill when off (click toggles, as today), a small badge with the number of that seat's still-open questions; a hairline; then icon actionButtons with tooltips: Other plans (history icon; toggles previousList), New plan (file-plus icon), Discard plan (trash, tone danger, the same two-step as Delete, running `bh plan delete <id>`; then the next plan opens, or the empty state).

The "View plan" pop-up (plandoc.js), as planning-light-030.png and -075.png:
16. A sheet on the right edge of the window, full height less SPACE[4] all round, about 45% wide (min 480px), over the dimmed page. Use openOverlay({ kind: "dialog", frame: "none", width: 1, height: 1 }) and draw the sheet at the right with the rest left clear (a click there closes it), if that works; if a dialog can't be placed that way, keep it centred and say so.
17. Header: "Draft plan" in TYPE.lg semibold, under it "round <n> · choose a line to comment on it" in c.muted; on the right, actionButtons: Start task (tone primary, only when ready, as plandoc.js:231-249), Archive or Unarchive, Discard (tone danger, two-step, `bh plan delete`), and Close with hint "Esc". The title is not repeated in the body (plandoc.js:230). The body scrolls under the header.
18. Commenting on a line, as planning-light-075.png: the chosen line gets a c.hover fill; below it a box with "Your comment" and a close x, a text area with an accent focus edge, the hint "Enter adds the comment · Esc cancels" in TYPE.xs c.muted, and an "Add comment" actionButton (icon send) on the right. Resolve, Edit and Delete on a comment are links in TYPE.sm, Delete in c.danger.

Also in work.js (step 2, the Knowledge page): reload() (work.js:181-230) must not show or save another project's knowledge after a space switch: after each await, stop if `dir !== projectDir()`; act() (work.js:238-246) runs in `this.dir` only when it equals projectDir(), otherwise reloads first and does nothing.

Contracts:
- From dev-engine (being built now): `bh task delete <id>`: exit 1 with "<id> is active: pause or finish it first." for an active task; otherwise deletes; prints "Deleted <id>." (+ " Its branch <b> is kept."); --json { deleted, branch }. `bh plan delete <id>`: deletes the plan and its open questions; prints "Discarded <id>."; --json { deleted, questions }.
- From design-sweep: look.js actionButton (signature above).
- Unchanged: every bh command the pages use today, and the question record shape (options[].mockupFile).

Constraints: no new dependency; no engine change; keep every piece of information and every action the pages have today (only Details hides some); functions at or under 20 lines and nesting at two blocks (split helpers); check gpui-kit.d.ts before using any style method (no transforms, no rotate, no blur).

Done when:
- Both pages and the sheet follow the GIF frames named above, item by item (say for each of 6-18 whether it is done).
- `npx -y -p typescript@5 tsc -p jsconfig.json --noEmit` (from mods/bot-herdr) shows no TS2304/TS2552 in work.js or plandoc.js.
- `herdr-app check mods/bot-herdr` (from the repo root) passes; `node "C:/Users/athenkosi.hlubi/.config/herdr-app/mods/bot-herdr/engine/bh.mjs" check` passes; `node --test test/` passes.
- If you can see your work without touching the person's own window and app home (for example a second herdr-app with HERDR_APP_HOME at a temp copy), take shots of both pages and the sheet and save them under .bot-herdr/tasks/t-20261112-8jkz/shots/; if you can't, say so. Never run node install.mjs against the real app home and never commit.
Report the design choices you made as `- <field>: <value>`.

If stuck: if the GIF needs something bot-herdr has no data for (Open in session, the Auto toggle, "Waiting on" approvals, auto-answer percentages, key hints other than Esc), leave it out. If anything in this brief doesn't match the code, stop that part, finish the rest, and report it.
