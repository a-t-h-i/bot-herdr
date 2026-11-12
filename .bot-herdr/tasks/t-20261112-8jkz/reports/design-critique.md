# Design critique: Tasks and Plans pages

Line numbers are in mods/bot-herdr/. "Shot 1" is the Plans screenshot, "shot 2" the task-detail screenshot. Nothing under mods/ or test/ was edited.

## Tasks page (work.js)

- Pause is a 28px solid button (work.js:650, button() at 1336) and Archive a 22px outlined chip (work.js:652, chip() at 1316) in one row: two heights, two styles (shot 2, top right).
- The title is 16px (work.js:646) and step text 13.5px (work.js:706): the title barely outranks the steps, so the page has no strong heading.
- The meta line joins id, status, track, worked and started in one 12px muted run with middots, and the status has no colour (work.js:647).
- The request is shown raw, internal "[task]" tag included (work.js:629-632, 659-660; shot 2 "[task] fix the toast notification").
- Agent name and step time are 10.5px faint (work.js:715), the smallest and faintest text in the detail, though the agent is the useful part.
- An active step adds a full-width animated trail of dots under its title (work.js:709-713, 746-778; loops at 770 and 774), so the step doubles in height and the agent sits at the far end in 10.5px.
- Section labels disagree: "STEPS" and "YOUR COMMENTS" are 12px semibold, hand-capitalised (work.js:682, 729); the list's group labels are 10.5px uppercase (work.js:531).
- The open row barely shows: its edge is #e3e0d7 on white and the page is #faf9f5, about 1.3:1 (work.js:570-571; look.js:3-6).
- The facts line (status · track · branch) is one truncating run, so at LIST_W 340 (work.js:39, 592) the branch is cut first and the pips and count compete with it (work.js:593-595).
- Paused and blocked share the amber "!" mark (work.js:608), so a paused task reads as an error.
- Done and open steps differ by mark and text colour (work.js:706-707, 606-613), with no status word.
- The comment box is at the foot of the detail, names no step, and its Comment button is the same solid style as Pause (work.js:732-738).
- The detail is a fixed-height pane (work.js:497 paneH, 543), so with one step the lower half is empty (shot 2).
- There is no Delete for a stopped task; Resume and Pause only (work.js:649-652). Open request from the person; see Proposals.

## Plans page (work.js)

- The conversation's scroll area ends at the composer's top edge (work.js:851-860), so the DEV card's option chips are cut under the View plan tab with no fade or scroll cue (shot 1, chips at the cut line).
- The View plan tab is 22px (work.js:867-870), sits on the cut line, and its expand glyph is in a 16px well (work.js:886).
- The composer is pinned to 8 rows (work.js:154, minRows; composer.js:1372-1379), so about 160px of empty text box shows before anything is typed.
- That fixed composer leaves the conversation little room: at a 400px-high window the column is 300px (work.js:849) and only about 60px is left above the tab.
- A flex spacer pushes the rail to the far edge (work.js:862), leaving a gap between the column and the controls they drive (shot 1).
- Seat icons do not say their role: Dev is a file, Design an image, QA a check, Research an info mark (work.js:1086-1090); the 28px seat buttons are identified by tooltip only (work.js:1109).
- An off seat is only a faint tint (work.js:1117-1119); nothing says what off means.
- "Previous" (chevron, work.js:1131-1137) and "New plan" (plus, work.js:1138-1144) are unlabelled icon buttons; "New plan" also exists as text (work.js:1001-1011).
- The stepper repeats the status: the "Task" stage (work.js:933-935) and the "Became a task" pill (work.js:950) say the same thing.
- The stepper is fine print under a 16px title: stage labels 10.5px (work.js:959), dots 10px (955), connectors 2px (961).
- The title truncates to one line (work.js:949) and goes to "…" at narrower widths.
- Each question shows its seat twice, as a pill (work.js:1060) and a seat-coloured left edge (1057-1058), and the card header adds a second name (1042-1044).
- Answer chips are 22px (work.js:1064) and look like buttons but are display-only; the recommended star has no label (1068); the picked answer is only a 12% wash (1065).

## View plan pop-up (plandoc.js)

- The title appears twice, in the header (plandoc.js:177) and again in the body (230).
- Start task and Archive sit in the scrolling body (231-267), so they scroll away with the plan.
- Expand and close are icon-only with no tooltip or label (plandoc.js:178-211).
- Resolve, Edit and Delete are the same 10.5px faint links (plandoc.js:26-39, 47-49); Delete has no danger tone though danger exists (look.js:20).
- Three primary-button treatments: Start task (plandoc.js:231-249), the inline Comment (plandoc.js:347-366, no lip, opacity hover), and button() (work.js:1336). plandoc.js rebuilds the button rather than calling it.
- The hint "Click any line to comment on it." is 10.5px (plandoc.js:270).

## Shared

- Four button treatments on one screen: solid (work.js:1336), outlined 28px (secondary() 1295), outlined 22px chip (chip() 1316), and text links.
- 10.5px text is the default for labels: age (work.js:585), agent (715), group labels (531), stage labels (959), comment links (plandoc.js:28).
- Hit targets: chips at 22px (work.js:652, 870, 1064) are below TARGET 28px (look.js:92).
- Layout uses hard-coded numbers: 37 (work.js:547), 96 (497), 110 (849), 52 (837), 250 (838), 340 (39); these break at other window sizes (see Narrow windows).
- Several things animate at once on one page: the active-mark pulse (work.js:611), trail dots (770, 774), the plan pill (switch.js:77), "Reading the code" (work.js:1079).
- Neither page has a heading of its own; the tab bar names the page, and it is hidden when the page is its own block (work.js:459-460).

## Narrow windows

- Tasks: the list is fixed at 340 (work.js:505) inside content that can be 320 (work.js:417), so it overflows the column at the narrowest widths.
- Tasks: the detail is `width - LIST_W - 37` (work.js:547): 175px at a 600px window, negative below about 425px, so the detail vanishes.
- Plans: with previous plans open, a 600px window leaves the column 222px (work.js:838-839) while the composer keeps its 320px minimum (composer.js:1409), so it overflows by about 100px.

## Proposals (information I changed or moved)

- Delete for a stopped task (the person's open comment, work.js:649-652 has none): not drawn, since the toast task is active. Placement: A beside Archive when paused or abandoned; B in the panel's action row; C in the detail's card header.
- Resume for a paused task (work.js:649) is not drawn for the same reason.
- "Start task" appears only when a plan is ready (plandoc.js:231) and plan Archive lives in the pop-up (plandoc.js:250-267). The mockups keep both there; none appears on the Plans page.
- "Previous" (work.js:1131) is an always-on index in B, "Other plans" as a link in A, a tile in C.
- The "[task]" prefix should become a label or be stripped (work.js:659-660).
- Composer minRows 8 → about 3 (work.js:154).
- Section labels: one style for all (STEPS, COMMENTS, group labels).

## Directions

- **A, Calm document:** one reading column, plain rows, text links instead of boxes. You get quiet and a reading flow at the cost of seeing fewer items at once.
- **B, Dense board with panel:** a table of tasks beside a detail panel, and plans in three panes. You see the most at once, but it needs a wide window.
- **C, Card dashboard:** every item is a card with a soft shadow, tasks as a row above the detail, plans as a card grid. Grouping is clearest, but it takes the most space and the most visual weight.

## Data notes

- The toast task's record changed after the screenshot: task.json now reads paused and archived, with its step todo (updated 12:26; shot at 12:22). The mockups follow the screenshot (active, step shown with design-toast).
- The brief says the step is "done"; the screenshot and the record say it is not. Flagged for the Orchestrator.
- Sample values in the mockups: ages and times for tasks other than the toast, and the comment text on the toast step. Task titles, worked times and the plan's question text come from the repo.
