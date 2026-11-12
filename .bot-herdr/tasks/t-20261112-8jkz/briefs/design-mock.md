Goal: groundwork for task t-20261112-8jkz. The person says the Tasks page and the Plans page "look ugly af" and wants them fixed. Before anything is built I will ask the person to pick a style, with one mockup per option. Your job: say concretely what is wrong today, and draw three distinct directions for each page as HTML mockups. Edit no file under mods/ or test/.

What the pages look like now (the person's screenshots, read them):
- Plans page: C:/Users/athenkosi.hlubi/.config/herdr-app/data/bot-herdr/pasted/pasted-20261112-122154.png
- Task detail: C:/Users/athenkosi.hlubi/.config/herdr-app/data/bot-herdr/pasted/pasted-20261112-122222.png

Code (repo at C:/Users/athenkosi.hlubi/Desktop/bot-herdr, read only):
- mods/bot-herdr/work.js: tasksView :489, taskRow :553, mark :603, taskDetail :623, trail :746, inputBox :807, plansView :829, viewPlanTab :867, hero :893, planHead :925, planConversation :1015, planRail :1084, secondary/chip/button/iconButton :1295-1374
- mods/bot-herdr/look.js: LIGHT :3, DARK :28, TYPE/LINE/SPACE/ROW/CONTROL :61-99, palette :275
- mods/bot-herdr/gpui-kit.d.ts: what can be drawn (check before using any style: no transforms, no rotate)
- mods/bot-herdr/plandoc.js: the "View plan" pop-up the Plans page opens

What to do:
1. Write .bot-herdr/tasks/t-20261112-8jkz/reports/design-critique.md: for each page, what is wrong, one line each with path:line (layout, clipping and overlap, hierarchy, spacing, inconsistent buttons and chips, the rail, the stepper, the step timeline, empty space, anything that breaks at a narrower window). Be specific: "the conversation is clipped under the View plan tab at work.js:NNN" rather than "layout issues".
2. Draw three directions, A, B and C, that differ in a way the person can see at a glance (for example: A a calm document layout, B a dense board/list with a side detail panel, C a card-based dashboard). Each direction gets two mockups, one per page, so six files:
   .bot-herdr/tasks/t-20261112-8jkz/mockups/tasks-A.html, tasks-B.html, tasks-C.html, plans-A.html, plans-B.html, plans-C.html
3. Each mockup is an HTML fragment: one <style> block and markup, no <html>/<head>, no scripts, no external fonts, images or URLs. It is drawn by headless Edge at 1200x825 and shown as a thumbnail, so make it fill that frame, keep text 13px or larger, and show the whole page (task list and detail; plan header, conversation, draft access, composer).
4. Use the LIGHT palette hex values from look.js and the font stack "Segoe UI", system-ui, sans-serif. Use only what gpui-kit can draw: flex rows and columns, padding, gaps, borders, corner radius, fills, text weight and size, simple inline SVG icons. No transforms, no gradients unless gpui-kit has them, no shadows unless gpui-kit has them (check the d.ts and say which you used).
5. Use the real content from the screenshots: the task "Toast dismissal animation" (t-20261111-zud8, active, fast track, one step done by design-toast, branch toast-dismissal-animation from main) plus two or three other plausible tasks in the list; the plan "Theme contrast, in-app file browser, visual refresh and measured engine wins" (round 11, became a task, the person's idea, the panel's DESIGN and DEV questions with option chips and the person's answers).
6. Keep every piece of information the pages show today (status, track, worked time, started date, branch, steps with agent and time, comments, Pause/Resume, Archive; plan stage, round, seats, questions and answers, View plan, the composer). You may move, group or restyle it; drop nothing without listing it in the critique as a proposal.
7. Add to design-critique.md one line per direction: its name (two to four words) and what it means for the person.

Done when: the six HTML files and design-critique.md exist; each mockup opens in Edge without errors (check one with: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --screenshot=<out.png> --window-size=1200,825 <file URL>, then look at the PNG) ; your report to me lists the three directions in one line each.

If stuck: if gpui-kit can't draw something a direction needs, change the direction rather than inventing a workaround, and say so.
