## Summary
Implemented Tasks/Plans/Knowledge UI updates in `mods/bot-herdr`: task/step status marks, task description expand+markdown, basic step flow dots, Tasks widget no-blink on task names, plan seats as colored icons, plan composer-at-bottom wired to plan comments, and knowledge sticky-note board with search/chips.
Some spec details are partial due to missing UI primitives/complexity (see Blockers).

## Changes
- `mods/bot-herdr/chat.js` — Tasks widget: task-row mark no longer pulses when active; step marks pulse only for active steps; added blocked `!` state; added small animated flow dots on active step rows.
- `mods/bot-herdr/work.js` — Added state/helpers and reworked views: Tasks page uses rounded-square status checkboxes, task request shown as Markdown with Show more/less (no mid-sentence cut), active step rows have pulsing checkbox + flow dots, task-row marks do not blink; Plans page rail seats render as colored agent icons (toggling kept), plan comment composer embedded at bottom and sends via existing `bh plan comment` + orchestrator notification path (old bottom input removed); Knowledge page rebuilt as sticky-note cards in columns with agent tint/tilt (straightens on hover), search-as-you-type and agent chips filtering, per-entry notes/comment inline, delete with confirm, and edit affordance to open the agent file editor (save/cancel preserved).

## Brief Check
- Tasks page: checkboxes per the spec, long descriptions expand in full Markdown, flow dots on the active step, no blink on task names (page and widget). — met (partial evidence): status marks implemented as rounded squares (accent+tick done, pulsing inner active step, amber `!` blocked) and task marks are static/non-blinking in widget and Tasks list; task description renders as Markdown with Show more/less; simple animated flow dots added on active step rows (widget/detail). Not implemented with a gpui-base `Checkbox` component (not found in codebase) and dots do not originate from an agent icon element.
- Plans page: comment box is the composer at the bottom; seats show coloured icons with names on hover. — met (partial): embedded `Composer` renders at bottom of plan page and its send is routed to existing plan comment path; seats are colored per agent with icons and remain toggleable. Hover tooltip showing agent name not implemented (no tooltip control available); icon choice limited to shipped icons.
- Knowledge page: sticky notes with tilt/straighten, search-as-you-type narrows notes, chips filter by agent, edit/delete/notes still work. — met: entries render as tinted sticky-note cards in multi-column layout with slight tilt and hover-straighten styling, search input filters cards, agent chips toggle/filter authors, inline note/comment, note removal, delete-with-confirm, and edit opens full file editor for the selected agent with save/cancel.
- `npm test` still passes (palette tests included); your visual checklist review with the person happens at the QA step, not now. — not met (unrelated failure remains): `bh check` ran palette/theme/other suites successfully but one unrelated template test failed (`test/quiet.test.mjs` expects agy template command string; environment/template state differs). Icon-shipping test now passes after replacing missing icons.

## Verification
- `node "C:/Users/athenkosi.hlubi/.config/herdr-app/mods/bot-herdr/engine/bh.mjs" check` — fail (1 unrelated test): `templates: an agy agent's says ready...` in `test/quiet.test.mjs` expects `command: agy --model gemini-3.8-flash-high` but current template shows `command: node .../bh.mjs agent design --mode child`; palette tests and other suites including `every icon the views name is shipped` passed.

## Blockers
- `gpui-base` `Checkbox`/tooltip primitives not found in this mod codebase; used custom read-only visual marks and icon seats without hover name tooltip. Flow animation implemented as local animated dots on active step rows (gpui position/opacity loops), not a path from agent icon to task title.
- Plans composer reuse is pragmatic (embedded `Composer` with overridden `send` to call plan-comment path) and may need visual/behavior polish vs chat composer integration.

## Knowledge Proposals
- Mods can override `Composer.send` to repurpose the composer UI for non-chat actions, but must preserve expected state resets (`input`, `files`, `pane`) to avoid stuck UI.
