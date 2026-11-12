# Buttons: every button in design-sweep's files

Paths are mods/bot-herdr/. "Today" is the drawn height before this change; "auto" means no height is set (the text line). Target: 28px (CONTROL) for every button. work.js and plandoc.js belong to design-pages and are not listed.

## Converted: one line per button

| # | path:line | What it is | Today | Becomes |
|---|---|---|---|---|
| 1 | chat.js:244 | "Comment" under each message (quiet, comment icon) | auto | actionButton quiet, 28 |
| 2 | chat.js:271 | "Cancel" while editing a comment (link helper) | 22 | actionButton quiet, 28 |
| 3 | chat.js:486 | "Open in Tasks" in a task card (quiet, icon) | auto | actionButton quiet, 28 |
| 4 | chat.js:490 | "Pause" / "Resume" in a task card | auto | actionButton secondary, 28 |
| 5 | chat.js:829 | Sent file chip, clickable when it has a path (display-only chips stay 22) | 22 | 28, same look |
| 6 | chat.js:877 | "Open terminal" under a message (link helper, fades in) | 22 | actionButton quiet, 28 |
| 7 | chat.js:953 | "Open in browser" under a failed mockup (link helper) | 22 | actionButton quiet, 28 |
| 8 | chat.js:962 | "Open in browser" under a picture (link helper) | 22 | actionButton quiet, 28 |
| 9 | chat.js:975 | "Open terminal" on a note (link helper) | 22 | actionButton quiet, 28 |
| 10 | chat.js:1028 | "n of N" next-turn control in the working line | 22 | actionButton quiet, 28 |
| 11 | chat.js:1042 | "Jump to latest" / "n newer" | 22 | actionButton secondary, 28 |
| 12 | composer.js:365 | Effort level chips in the model pane (one per level) | 22 | 28, same look |
| 13 | composer.js:988 | "Show hidden" toggle in the browser | 22 | 28, same look |
| 14 | composer.js:998 | Browser's primary: Attach / Open / Open this folder | 28 | actionButton primary, 28 |
| 15 | composer.js:1038 | Browser "up" icon button (helper `iconButton`) | 28 | actionButton quiet icon, 28 |
| 16 | composer.js:1040 | Browser "close" icon button (helper `iconButton`) | 28 | actionButton quiet icon, 28 |
| 17 | composer.js:1554 | Remove (x) on an attachment, image or file (helper `remove`) | 22 | actionButton quiet icon, 28 |
| 18 | composer.js:1669 | Toast action | 28 | actionButton secondary, 28 |
| 19 | composer.js:1688 | Attach (paperclip) icon button in the toolbar (helper `iconButton`) | 28 | actionButton quiet icon, 28 |
| 20 | composer.js:1689 | Space picker in the toolbar (keeps its folder, name, branch, chevron) | 22 | 28 |
| 21 | composer.js:1708 | Lead model picker in the toolbar (keeps its harness mark, name, effort) | 22 | 28 |
| 22 | composer.js:2014, 2019, 2025, 2026 | Question card links (helper `link`): "‹ Back", "Dismiss", "Keep" (quiet); "Dismiss" confirm (danger) | 22 | actionButton, 28 |
| 23 | composer.js:2030 | Question card minimise (chevron, tooltip kept) | 22 | actionButton quiet icon, 28 |
| 24 | composer.js:2109 | Expand (zoom) on a question's mockup tile | 22 | actionButton secondary icon, 28 |
| 25 | composer.js:2103 | "Open in browser" on a question's mockup tile (helper `link`) | 22 | actionButton quiet, 28 |
| 26 | settings.js:564 | `disclosure`: "More" / "Less" / "Advanced" / "Add" (helper; 3 call sites) | 22 | actionButton quiet, 28 |
| 27 | settings.js:988 | `chip`: "Use it for" feature toggles (filter toggle) | 22 | 28, same look |
| 28 | settings.js:1008 | `iconButton` helper (no call sites today; danger tone when asked) | 28 | actionButton icon, 28 |
| 29 | settings.js:1012 | `button` helper: "Add" harness (primary, plus icon) | 28 | actionButton primary, 28 |
| 30 | viewer.js:43 | `button` helper: file header (find, open in its app, close) and find-bar close (4 call sites) | 28 | actionButton quiet, 28 |
| 31 | viewer.js:228 | Find: previous match (chevron) | 28 | actionButton quiet icon, 28 |
| 32 | viewer.js:229 | Find: next match (chevron) | 28 | actionButton quiet icon, 28 |
| 33 | viewer.js:230 | Find: "Aa" case-sensitive toggle | 28 | kept as is (already 28, own toggle look) |
| 34 | switch.js:36 | `segmented` items: page switch (switch.js), file mode (viewer.js:165), settings (settings.js:529, 605). work.js:476 and 509 are design-pages' | 22 | 28; track 28 with no vertical inset |
| 35 | switch.js:160 | `stateView` retry action (secondary) | 28 | actionButton secondary, 28 |
| 36 | noteform.js:73 | `chip`: "For" agent and "Section" choice chips (2 rows) | 22 | 28, same look |
| 37 | noteform.js:123 | "Cancel" (secondary) | 28 | actionButton secondary, 28 |
| 38 | noteform.js:124 | "Add note" (primary; disabled while the note is empty) | 28 | actionButton primary, 28 |
| 39 | pick.js:175 | Effort chips in the picker | 22 | 28, same look |
| 40 | pick.js:202 | Refresh (icon) in the picker header | 22 | actionButton quiet icon, 28 |
| 41 | lightbox.js:71 | `round` helper: close, previous, next (3 call sites; was rounded_full) | 28 | actionButton quiet icon, 28 |
| 42 | lightbox.js:142 | "Open in browser" (quiet, icon) | 28 | actionButton quiet, 28 |
| 43 | lightbox.js:147 | "Choose this" (primary) | 28 | actionButton primary, 28 |

## Not converted: blockers

- settings.js:753 `modelField` chevron (opens the model list) is 22px, inside a 28px field with a 1px border. At 28 it would sit on the field's edge. It stays 22 until the field's height or the field's layout is decided.
- settings.js:846 slider stop labels (the effort names under the track) are 16px slots in the slider's layout. At 28 they would break the slider. They are tick labels, not buttons, and stay 16px.

## Kept: not buttons, or already 28 with their own look

- chat.js:456 task row header (expands the task): a list row, auto height (about 24px).
- chat.js:798 "Show more · N more lines" / "Show less": a text link inside a message.
- chat.js:912 picture tile (opens the lightbox): an image tile.
- chat.js: `commentRow` reply actions (Reply, Edit, Resolve, Delete) are drawn by `commentRow` in work.js, not here.
- composer.js:383 model rows, 952 browser rows, 1883 spaces menu rows, 2273 suggestion rows, 2320 menu items: list rows, ROW (28).
- composer.js:2074 question option tiles and 2132 option rows: the answers themselves, not buttons; rows at least 28.
- composer.js:1497 composer "slim" bar (click to grow it back): an input-like bar.
- composer.js:1570 attachment image thumbnail (opens large): an image tile.
- composer.js:2245 questions bar (put away questions): already CONTROL (28), a bar.
- composer.js send key and stop key: round, 28 (TARGET), each drawn in layers for their animation; kept.
- settings.js:707 `select` and settings.js:912 classifier model trigger: input-like dropdown fields, already CONTROL (28).
- settings.js:957 `toggle`: a 36x20 form switch, not a button.
- viewer.js:268 find hit rows; pick.js:223 picker option rows: list rows, ROW (28).
- toast.js:59 toast card (the whole card is the target): a clickable surface.
- mdedit.js:158 markdown block (press to edit): a clickable surface.
- Display-only tags, not buttons, unchanged: settings.js:615 label row (CHIP), settings.js:869 harness tags (CHIP), composer.js:1540 mention token (CHIP), composer.js:2114 option number tile, composer.js:2151 option label row, composer.js:2295 command letter tile, lightbox.js:104 glyph tile (all CHIP).

## Counts: before and after

Converted entries, 1 to 43 (43 entries; a helper counts once, and its call sites are in the note beside it):

| Drawn height | Before | After |
|---|---|---|
| 28px | 17 | 43 |
| 22px | 23 | 0 |
| auto | 3 | 0 |

Not converted (blockers above): 1 at 22px (settings.js:753), 1 at 16px (settings.js:846).
