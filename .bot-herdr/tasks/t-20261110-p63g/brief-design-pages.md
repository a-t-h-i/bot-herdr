# Design brief — steps 5–7 of t-20261110-p63g (Tasks, Plans, Knowledge pages)

## Goal
Rebuild the Tasks, Plans and Knowledge pages for quick reading, and two widget fixes the person asked for. You own steps 5, 6 and 7.

## Files
- Change: `mods/bot-herdr/pages.js`, `mods/bot-herdr/chat.js` (only the tasks widget beside the feed: list at chat.js:256, blink marks), `mods/bot-herdr/look.js` (only to reuse/export existing helpers), `mods/bot-herdr/composer.js` (only to embed it on the Plans page), plus `work.js`/`route.js` if the step needs them.
- Leave alone: `mods/bot-herdr/engine/**` (Dev owns it this week), `roster.js`, `toast.js`, `working.js`, `viewer.js`/`lightbox.js`.
- Imitate: step 4's muted palette work in `look.js` (`contrastOf`, `palette()` mixing borders from fill+border).

## What to do
### Step 5 — Tasks page + tasks widget
1. Steps and tasks get real checkbox controls drawn on gpui-base `Checkbox` (behaviour + a11y; the look is ours). Look: rounded square radius 4 — accent fill and tick when done, pulsing inner square while active, amber `!` when blocked. Read-only, driven by status.
2. Full task description on the Tasks page: collapsed with a "Show more" toggle, rendered as Markdown, never cut off mid-sentence.
3. Work-flow animation: small dots sliding from the agent's icon to the task title (gpui animates position and opacity, not paths), placed on the **active step row**.
4. From the person, on both the tasks widget beside the chat (`chat.js` ~256, `bh-tasks-widget-list`) and the Tasks page list: the active **task's** mark must not blink — only the active **step's** mark blinks. Today the task name blinks; remove that.

### Step 6 — Plans page
5. The "comment on plan" input becomes the bot-herdr composer at the bottom of the plan page (reuse `composer.js`; same send path as chat).
6. Panel seats are colour-coded, shown as the agent's icon instead of its name, name on hover (tooltip).

### Step 7 — Knowledge page
7. Knowledge shown as sticky notes: tinted by the agent that wrote them, laid out in columns of varying height, a slight tilt that straightens on hover.
8. A search input narrows the notes as you type; agent chips filter by author.
9. Keep the existing edit, delete and notes affordances.

## Contracts
- Statuses come from the task board: todo / active / done / blocked — map them to the checkbox looks above.
- The composer on Plans writes plan comments through the existing plan-comment path; don't invent a new endpoint (ask Dev via the board if something's missing).
- Knowledge entries are per-agent files (`.bot-herdr/knowledge/<agent>.md`) with Facts/Standards/Decisions/History sections; the note cards represent entries, tint per agent.

## Constraints
- No new dependencies; gpui-base and gpui-kit only (gpui-component/Longbridge is a look reference, not code to copy).
- Any new colours go through `look.js` mixing (muted), so herdr built-in themes stay calm; bot-herdr's own themes must look unchanged.
- Don't touch `chat.js` scroll/feed logic beyond the tasks widget (chat scroll is step 12, not yours).

## Done when
- Tasks page: checkboxes per the spec, long descriptions expand in full Markdown, flow dots on the active step, no blink on task names (page and widget).
- Plans page: comment box is the composer at the bottom; seats show coloured icons with names on hover.
- Knowledge page: sticky notes with tilt/straighten, search-as-you-type narrows notes, chips filter by agent, edit/delete/notes still work.
- `npm test` still passes (palette tests included); your visual checklist review with the person happens at the QA step, not now.

## If stuck
If gpui-base lacks a control you need (tooltip, markdown block), stop that item, note it on the board as a `question`, finish the rest, and report. Don't add a dependency to fill the gap.
