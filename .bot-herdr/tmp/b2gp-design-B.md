Task t-20261111-b2gp, steps 11 (component), 12 and 16. Plan: bh plan show p-20261111-9dkc. Board: bh board read t-20261111-b2gp (contracts #1 files, #2 palette; the bh models contract from dev; decision #7 local-only).

CONTEXT
Another Design agent ("design") has just finished a visual refresh: look.js now has TYPE, SPACE, radii, MOTION and helpers hoverable/pressable/focusable plus empty/loading components. Use them for everything you build; read look.js first. design owns chat.js, switch.js, work.js, composer.js, toast.js, look.js, plandoc.js: do not edit those. You own: a new mods/bot-herdr/mdedit.js, viewer.js, settings.js, roster.js, models.js, and tests you add.

STEP 11 — MarkdownEditor (new mods/bot-herdr/mdedit.js)
gpui-kit has no rich-text editor: only TextView.markdown (read-only render) and Input/Textarea/Editor. Build a live-preview editor from them:
- Split the text into blocks: a fenced code block, a table, a list (consecutive list lines), a blockquote run, a heading line, a paragraph (lines until a blank line). Blank lines separate blocks. Keep the exact original text of each block, so join(split(text)) === text for any input, including CRLF, trailing newline, and an unclosed fence.
- Every block renders with TextView.markdown, except the active block, which shows as a TextareaState (auto-grow) with its source. Clicking a rendered block makes it active; Esc or clicking elsewhere deactivates and re-renders it; Up at the first line / Down at the last line of the active block moves to the previous / next block. Enter twice at the end of a paragraph starts a new block. An empty document shows one empty active block with a placeholder.
- Export class MarkdownEditor with: constructor({ value = "", placeholder = "" }), value(): string, set_value(text): void, on("change", handler): void, render(c, cx, id): element. Pure helpers splitBlocks(text) and joinBlocks(blocks) exported for tests.
- Post the contract on the board: bh board post t-20261111-b2gp contract "<the API above>" --from design-2.
- test/mdedit.test.mjs: round trip on headings, lists, nested lists, fenced code with blank lines inside, tables, CRLF, no trailing newline, unclosed fence; editing one block changes only that block's text.

STEP 11 (viewer part) — viewer.js
A .md file opens rendered (the blocks rendered read-only with TextView.markdown, at the reading width) with a "Source" toggle that shows the existing read-only Editor. Other files keep the Editor.

STEP 12 — search in the viewer
- Ctrl+F (when the viewer has focus) and a search icon button in the viewer header open a search row: field, "3 of 12" count, previous/next buttons, a case-sensitive toggle ("Aa"), close. Enter / Shift+Enter next / previous, Esc closes.
- Pure findMatches(text, query, { caseSensitive = false }) → [{ line, start, end }] in a new mods/bot-herdr/search.js, tested in test/search.test.mjs (empty query, case, several matches on one line, CRLF).
- First check whether herdr's Editor already handles Ctrl+F itself (gpui-kit.d.ts Editor / EditorState, and try it if you can). If it does, keep its find and only add the button that triggers it, then skip the rest of this step and say so.
- Otherwise, under the search row show the matching lines (line number muted, the line with the match highlighted using c.accent at alpha 0.25 behind it), the current match marked; clicking a result makes it current. EditorState cannot scroll or select (only value/set_value/on), so the list is how the person moves; for a rendered .md, highlight inside the rendered blocks is not required, the list is enough.

STEP 16 — model picker (settings.js ~294-349, roster.js HARNESSES lists)
- The picker's list comes from `bh models <harness> [--command <exe>] --json` (via bhJson from bh.js), not from modelsOf()/models.js; drop the per-harness `lists` exec code in settings.js (~341-360) and the `lists` fields in roster.js if nothing else uses them.
- Ask when the picker opens or the harness changes; show the loading component inline while it runs; cache in memory per harness for the session.
- Header row in the dropdown: "From <harness>" when source is "harness", "Built-in list" when source is "builtin"; a refresh icon button that calls with --refresh; when the result has an error, one muted line with the error sentence.
- The field still accepts a typed model id (keep that path).
- For a space with a machine: a note "Model lists come from this machine" and the typed field (decision #7).
- Efforts: when the chosen model reports efforts, the effort picker offers exactly those; otherwise the harness's efforts from roster.js as today.
- Keep models.js (bh models uses it for the built-in fallback); remove only the code paths that no longer read it.

CONSTRAINTS
No new dependencies; check gpui-kit.d.ts before any style method (no transform/rotate; .loop() takes no delay); do not change colour pairs; do not commit.

DONE WHEN
- node --test test/mdedit.test.mjs test/search.test.mjs passes; node --test test/contrast.test.mjs passes; npx tsc -p mods/bot-herdr/jsconfig.json passes; bh check passes.
- The MarkdownEditor contract is on the board.
- Report per step to .bot-herdr/tasks/t-20261111-b2gp/reports/design-2.md and hc send t2z with the path.

IF STUCK
Stop that part, finish the rest, and report it. Never invent a workaround.
