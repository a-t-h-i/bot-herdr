## Status
READY

## Title
Theme contrast, in-app file browser, visual refresh and measured engine wins

## Plan

### Steps
1. Make every text colour reach WCAG AA (4.5:1 text, 3:1 controls) under every herdr theme and our own pair, keeping each theme's character: quiet text, accent text, status colours, agent name colours and the send button (Design).
2. Fill missing surfaces for theme files with no `colors` block (atom-one-dark) from the theme itself, use the theme's `solid`/`solid_foreground` for the send button, and soften the bubble border to match bot-herdr's own theme (Design).
3. Draw inline code chips in replies ourselves, in the theme's colours, at AA (Design).
4. Add a committed snapshot of every herdr theme and one contrast test over it plus our light/dark pair (QA).
5. Add a `bh` command that lists a folder's entries for a space, including spaces on other machines (Dev).
6. Replace the system dialog behind "Attach document…" with a file browser in the attach pane: folders, files, search, multi-select, and a visible message when listing fails (Design).
7. Trim the agent briefs, the QA risk prompt and the script question, and merge the duplicated engine helpers (Dev).
8. Tidy the layout details: "Open terminal" and "Comment" on hover and focus, the page switch on `palette()`, no "to" prefix (Design).
9. Refresh the visual design of every page on one compact type scale, spacing set, radii, elevation and motion system, with focus and press states everywhere (Design).
10. Lighten the Knowledge cards and agent filter chips in light mode: white cards on the paper ground with the agent's colour as a dot and a thin accent, not a grey tinted fill (Design).
11. Replace the plain markdown editor (knowledge notes and `.md` files opened in the viewer) with a live-preview editor: every block shows rendered, and the block you click or move into turns into its source for editing (Design).
12. Add text search to the code viewer and editor: Ctrl+F opens a search field over the file, shows "3 of 12" with next and previous, and lists the matching lines with the match highlighted (Design).
13. Make the toast close as smoothly as it opens: the bubble shrinks back into the composer's top edge and fades out in one continuous motion, and is removed only once it is invisible (Design).
14. Confirm, with sources, how each harness reports the models it offers: Claude Code, Codex, pi, Oh My Pi, OpenCode, Gemini, Qwen Code and Antigravity (Research).
15. Add `bh models <harness>` that asks the installed harness on the space's machine for its real models and caches the answer (Dev).
16. Make each agent card's model picker show the harness's real models, with a refresh button and a clear note when the harness could not be asked (Design).
17. Take the plan document out of the Plans page's conversation: a "View plan" tab rises from the composer's top edge (document icon, label, chevron, as in the person's screenshot) and opens the plan in a pop-up window that can be expanded to fill the app, with line comments and Start task working there (Design).
18. Rerun the contrast test, `bh check`, QA gate, commit, push, `node install.mjs`, `herdr-app check`.

### Objective
The app is readable under every herdr theme, looks consistent and more polished on every page, attaching a document works through a browser inside the app, and spawned agents and the classifier spend fewer tokens.

### Scope and non-goals
- In (from the person): the visual design of the whole plugin, not only the backend.
- In (from the person): rendered markdown while editing knowledge and `.md` files; lighter Knowledge cards in light mode.
- In: `look.js` palette and new scale tokens, every view in `mods/bot-herdr` (chat, composer, switch, work, settings, toast, lightbox, pick, viewer), the attach pane, a new `bh` listing command, role files, `qa-risk`, `pickScripts`, engine helpers, tests.
- Out: herdr's chrome sizes (sidebar 268, top bar 42, status 28, Terminals padding 8 / gap 8 / radius 10); the system file dialog (removed, not repaired); recording cache-hit numbers (the person chose measured wins without it); any new dependency.

### Acceptance criteria
- `test/contrast.test.mjs` computes `palette()` for every theme in `test/fixtures/herdr-themes.json` plus LIGHT/DARK and asserts ≥ 4.5:1 for ink, muted, faint, accent text, accentInk on accent, danger/success/warning, every agent name colour and code chip text on their surfaces; ≥ 3:1 for controls; the bubble edge within the band our own themes use. It passes, and the 13+ failing pairs measured by QA and Design are among those checked.
- "Attach document…" opens a file list inside the pane; you can open folders, go up, search by name, pick several files and attach them; a listing error shows in the pane. A test covers the `bh` listing command (entries, folders first, hidden-file rule, a missing path).
- Average child brief size drops from 19–26 KB to about 12 KB (`bh brief <role> --mode child | wc -c` before and after); `qa-risk` sends no more than the diff summary plus a bounded hunk sample; `pickScripts` asks one question per step.
- `look.js` holds `TYPE` (10.5 / 12 / 13.5 / 16 / 18), spacing (2 / 4 / 8 / 12), radii (12 / 10 / 8) and all `MOTION` durations; a grep finds no `text_size`, `rounded` or transition-duration literal outside them; every clickable element has a press state, `tab_index` and a focus ring.
- Knowledge shows loading, not "No notes match.", while it loads; no scroll area nests inside the chat feed; the plan document and chat body stay near 75 characters per line.
- In light mode the Knowledge cards sit on `fill` (white) with at most a faint hue tint (≤ 0.04) and the hue only on the dot, name and a thin edge; filter chips follow the same rule; card text passes 4.5:1.
- Editing a knowledge note or opening a `.md` file shows rendered markdown (headings, lists, bold, links, code, tables); clicking a block edits its source in place, leaving it renders it again; saving writes plain markdown identical to what was typed; non-markdown files keep the code editor.
- In the file viewer and editor, Ctrl+F (and a search button) opens a search field; typing shows the match count, Enter and Shift+Enter move to the next and previous match, Esc closes it; matching is case-insensitive with a case toggle; a pure `findMatches(text, query, { caseSensitive })` has a unit test.
- The toast's close mirrors its open: no frame where the bubble stops while visible, no jump on removal; the bubble's opacity reaches 0 at or before the moment it is removed, and the close duration and the removal timer come from one `MOTION` value.
- `bh models <harness> --json` prints `[{ id, name }]` from the harness itself for every installed harness Research found a way to ask; picking a harness in Settings lists exactly those, and a refresh button asks again. When a harness cannot be asked, the picker says so and accepts a typed model id; `models.js` stops being the source of the list (at most a labelled fallback). Parsers for each harness's output have unit tests against recorded samples.
- The Plans page shows only the conversation and the composer; the plan document is not drawn there. A "View plan" tab sits centred on the composer's top edge, joined to it like the other panes, and shows only when the selected plan has a draft. Clicking it (or its shortcut) opens the plan in a pop-up over the app; the pop-up has an expand control to fill the window, closes on Esc and outside click, and keeps clicking a line to comment, the open comments and Start task.
- `bh check` passes, the QA gate passes, and the installed app passes `herdr-app check`.

### Affected areas
- UI (Design): `look.js`, `theme.js`, `chat.js`, `composer.js`, `switch.js`, `work.js`, `settings.js`, `toast.js`, `lightbox.js`, `pick.js`.
- Engine (Dev): `engine/bh.mjs` (listing command), `engine/roles/*.md`, `engine/lib/team.mjs`, `engine/classifier/qa-risk.mjs`, `engine/classifier/index.mjs`, `engine/lib/core.mjs`, `engine/scripts/lib/common.mjs`.
- Tests (QA): `test/palette.test.mjs`, new `test/contrast.test.mjs`, new `test/fixtures/herdr-themes.json`, a test for the listing command.

### Decisions by domain
- [DESIGN] From the person, contrast: AA everywhere, theme kept. Failing colours are raised with `readable()`, made polarity-aware (a light colour on a dark surface moves lighter), falling back to black or white only when the theme's ink itself cannot pass.
- [DESIGN] From the person: bubble borders under herdr's themes are too sharp next to bot-herdr's own; the bubble edge matches the softness of our own pair, and the palette test moves to that band.
- [DESIGN] From the person, look: keep the paper, tighten it. Warm ground, hairlines and one terracotta accent stay; the change is consistency: one type scale, one spacing set, three radii (12 panel, 10 control, 8 nested), one elevation rule, actions on hover.
- [DESIGN] From the person, density: compact. Type 10.5 / 12 / 13.5 / 16 / 18; spacing 2·4·8·12; rows 26–28; 28px click targets; body 13.5/20.
- [DESIGN] From the person, motion: alive. 120ms colour on hover, 90ms 1px sink on press, a 2px accent focus ring, panes at 190ms, new messages fade and rise over 240ms, rows stagger 22ms when a page or pane opens, the working line keeps its slide; all durations live in `MOTION` and every animation honours reduced motion.
- [DESIGN] From the person, layout: keep it and tidy the details.
- [DESIGN] The send button uses the theme's `solid`/`solid_foreground` when present; ours is darkened to pass 4.5:1.
- [DESIGN] From the person: markdown must be rendered while editing. gpui-kit has no rich-text editor (only the code `Editor` and read-only `TextView.markdown`), so the editor is built from those two: the file is split into blocks, each drawn with `TextView.markdown`, and the active block becomes an `Input` with its source. The file on disk stays plain markdown.
- [DESIGN] From the person: Knowledge cards and chips are too dark in light mode. Cards move to the "paper" rule: white panel, hairline edge, the agent hue only as dot, name and a thin accent; dark mode keeps a low tint.
- [DESIGN] From the person: search text in the code viewer/editor. gpui-kit's `EditorState` offers only `value`, `set_value` and events, with no find, selection or scroll-to-line, so the search is ours: a field above the editor and a list of matching lines (line number, the line with its match highlighted). Moving to a match scrolls the editor there if herdr's `Editor` allows it; if not, the list is how you move. If herdr's `Editor` already has its own Ctrl+F, we use that and only add the button.
- [DESIGN] From the person: the toast's close stalls, then vanishes. Cause: in the "out" phase (`composer.js:1066-1072`) the shell shrinks to 40% × 45% over 300ms but never fades (only the text does, `:1101-1102`), and it is removed at 420ms (`:460`), so it sits still for about 120ms and then pops. Fix: the shell also fades to 0, the shrink runs to the composer edge (width and height near 0, eased out, or the same springs as the rise), and removal waits for that one duration.
- [DEV] From the person: show the models a harness really offers, never a hard-coded list. Today `models.js` is the source and only pi, gemini and opencode carry a `lists` command (`roster.js:26-34`, `settings.js:341-349`). Discovery moves into one `bh models` command: Agent Client Protocol harnesses (Gemini, OpenCode, Qwen, Antigravity) report their models when a session starts; CLI harnesses use their own list command where one exists; the method per harness is whatever Research confirms. Results are cached per harness and machine, with a refresh to ask again.
- [DESIGN] From the person: the plan opens in a pop-up, not inside the planning chat. The document card now drawn in the Plans main pane (`work.js:999-1046`) moves into a dialog opened the way `viewer.js` opens files; the trigger is a tab fused to the composer's top edge, built like the composer's existing panes (same surface, edge and 12px fillets). The pop-up takes the plan's reading width (about 75 characters) and an expand control for full size.
- [DEV] From the person, attach: browse inside the app. The list comes from a new `bh` command so it works for spaces on other machines; the composer only draws what it returns. The PowerShell/osascript/zenity dialog code is removed.
- [DEV] From the person, review: measured wins only. Merge repeated rules across `global.md`, `worker.md` and role files; `qa-risk` gets the diff summary instead of up to 60 000 chars of raw diff; `pickScripts` asks one choice question; `engine/scripts` import `engine/lib/core.mjs` instead of their own copies. Brief order stays: stable text first, knowledge and instructions last.
- [QA] Built-in themes (graphite, ink, moss, paper) are compiled into herdr, so the test uses a snapshot dumped once from `themes()` and committed, never `~/.config` at run time.

### Assumptions
- [DESIGN] Unused tokens `edgeDark` (outside tests) and `scrim`, the orphan comment at `look.js:92`, and the second copy of seat colours at `work.js:942` are removed; agent colours come only from `agentHue`.
- [DESIGN] Keyboard focus is required whatever the style: every clickable element gets `tab_index` and a visible focus ring.
- [DESIGN] The contrast steps (1–3) land before the refresh (9); the refresh may not lower any ratio, and the contrast test reruns after it.
- [DEV] The listing command hides dot-files by default with a toggle, sorts folders first, and caps a folder at 2 000 entries.
- [ORCHESTRATOR] Order of work: Design runs steps 1–3, 6, 8–13, 16 and 17 in sequence; Research runs 14 first; Dev runs 5, 7 and 15 in parallel with Design; QA writes step 4 after step 2 lands, using Dev's listing contract for its test.

### Risks and open points
- Code chips come from herdr's `TextView.markdown`, which takes no colours. Step 3 means rendering inline code spans ourselves; if gpui-kit cannot do that cleanly, Design stops and reports, and chips stay herdr's.
- Whether `.focus()` fires on keyboard focus needs one check in the running app before the focus ring is promised everywhere.
- Raised colours make quiet text heavier on every theme; the compact scale's 10.5 size must still pass after that.
- The theme snapshot goes stale when herdr adds themes; refreshing it is a manual step.
- The live-preview editor is the largest new piece: multi-line blocks (code fences, tables, lists) must split and rejoin without changing the text, and keyboard movement between blocks needs care. A round-trip test (split then join gives the same file) guards it.
- Jumping the code editor to a match depends on an API herdr's `Editor` may not have; without it, search shows the matches in a list instead of moving the cursor.
- Some harnesses may offer no way to list models (Claude Code may be one); for those the picker can only take a typed id or a labelled built-in list. Asking an ACP harness starts it briefly, which can take seconds; the cache keeps that off the Settings page's first draw.
- The refresh touches every view file; it runs as one Design agent in sequence so no two agents edit the same file.
