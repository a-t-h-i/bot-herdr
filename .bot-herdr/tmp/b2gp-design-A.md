Task t-20261111-b2gp, next stage for design (same session): steps 8, 10, 13, 6, 17, then wire the markdown editor into Knowledge (part of step 11). Work in this order. Use the tokens and helpers you created in step 9 for everything new. A second Design agent (design-2) now owns viewer.js, settings.js, roster.js, models.js and a new mdedit.js; do not edit those files. You own chat.js, switch.js, work.js, composer.js, toast.js, look.js, and a new plandoc.js.

FIRST — the alpha fix I sent during step 9 is not in look.js yet (no compositing found). herdr's presets return border/selected/hover with alpha (graphite border #ffffff18, selected #ffffff17, hover #ffffff0e; paper #00000017) and rgb() drops it. In palette(), composite every 8-digit theme token over the surface it sits on (border and selected over raised/fill, hover over fill; otherwise over background) before using it, so every token palette() returns is an opaque #rrggbb. Then rerun node --test test/contrast.test.mjs test/palette.test.mjs test/themes.test.mjs; all must pass. Details: .bot-herdr/tasks/t-20261111-b2gp/reports/qa.md Findings.

STEP 8 — layout details
- Reply header: "Open terminal" and "Comment" show only while the message is hovered or one of them has keyboard focus (keep them always visible on a message where the agent stopped without replying, chat.js ~871). Use opacity with MOTION.hover, not layout changes, so nothing shifts.
- The page switch draws from palette() (already done in step 9 if so; confirm).
- Remove the "to" prefix in the user message meta row (chat.js ~755): show just the agent names and the time.

STEP 10 — Knowledge cards and chips, light mode
- Light mode (palette is light): card bg c.fill, 1px c.edge border, no tint fill (or alpha(hue, 0.04) at most), no shadow; the agent hue only on the dot, the name, and a 2px left accent bar. Hover: border to alpha(hue, 0.35), MOTION.hover.
- Filter chips: c.fill with c.edge border, hue dot; selected chip bg alpha(hue, 0.10), border alpha(hue, 0.35), text c.ink.
- Dark mode keeps a low tint (alpha(hue, 0.08)).
- Card text c.ink / c.muted, must stay ≥ 4.5:1 (it will: they sit on fill).

STEP 13 — toast close (composer.js toastView ~1059 and dropToast ~455)
- Cause (from the plan): in the "out" phase the shell shrinks to 40% x 45% over 300 ms but never fades, and is removed at 420 ms, so it stalls then pops.
- Fix: add MOTION.toastOut = 260. In "out": shell width and height go to 24 and 12 (a small pill at the composer edge), top to GAP + H (into the composer edge), opacity to 0, all with MOTION.toastOut and an ease-out curve; the body text fades in the first 120 ms. dropToast removes the toast after exactly MOTION.toastOut + 16. The open motion stays as is.

STEP 6 — attach pane file browser (composer.js ~1290-1300 and pickFiles ~521-552)
- Contract: board #1 (bh board read t-20261111-b2gp): `bh files <path> [--all] --json` via bhJson(["files", path, ...]) from bh.js. Local machine only (board #7): for a space with a machine, the pane shows one line "Browsing is for this machine. Drop files or type a path." plus a path field.
- Remove the PowerShell/osascript/zenity code in pickFiles entirely. "Attach document…" opens the browser inside the attach pane; "Attach folder" keeps herdr's pickFolder.
- Pane, 420 wide, max height 360: a path row (up button, the current folder path truncated from the left, a "Show hidden" toggle), a search field filtering the current folder's entries by name (case-insensitive substring, instant), a list (ROW height, folder icon / file icon, name, size for files muted), multi-select by clicking rows (checkbox at the left), Enter or double click on a folder opens it, a footer with "N selected" and an "Attach" primary button that calls addFiles(paths) and closes the pane. Start folder: the space's project folder (projectDir()).
- Loading uses your loading component; a listing error shows inline in the pane with the error sentence and a Retry; "truncated" shows "Showing the first 2000".
- Keyboard: arrows move, Space toggles, Enter opens folder / attaches selection, Backspace goes up, Esc closes.

STEP 17 — plan in a pop-up
- Plans page (work.js ~800-1050): stop drawing the document card in the main pane; the conversation and the composer take the column.
- A "View plan" tab centred on the composer's top edge, joined like the composer's panes (same surface, edge, 12px fillets, as in the person's screenshot: document icon, "View plan", a small chevron chip). Shown only when the selected plan has a draft.
- Clicking it opens a dialog (new plandoc.js, opened the way viewer.js openFile opens its dialog) at the reading width with an expand button that fills the window, Esc and outside-click close it. Inside: the plan document exactly as drawn today (move that code from work.js into plandoc.js), clicking a line to comment, the open comments, and the Start task button.

STEP 11 (your part) — after design-2 posts the MarkdownEditor contract on the board, replace the Knowledge file Textarea editor (work.js ~153, `this.editor`) with it. Saving writes exactly editor.value().

CONSTRAINTS
No new dependencies; check gpui-kit.d.ts before any style method; do not change colour pairs; do not commit.

DONE WHEN
- Each step's behaviour above is in place; node --test test/contrast.test.mjs test/palette.test.mjs test/themes.test.mjs passes; npx tsc -p mods/bot-herdr/jsconfig.json passes; bh check passes.
- A unit test for any pure helper you add (path parent/filter/selection logic for the browser) under test/.
- Report per step: what changed, what you could not do. Report to .bot-herdr/tasks/t-20261111-b2gp/reports/design.md (append a section per stage) and hc send t2z after step 17, and again after the Knowledge wiring if it waits for design-2.

IF STUCK
Stop that part, finish the rest, and report it. Never invent a workaround.
