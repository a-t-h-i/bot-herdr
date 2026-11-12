## Summary
The critique is in `reports/design-critique.md` (Tasks and Plans, with path:line for each problem), and six mockups are in `mockups/`, one per direction per page.
Three directions: A Calm document, B Dense board with panel, C Card dashboard; each draws both pages at 1200x825 and was rendered in headless Edge.

## Changes
- `.bot-herdr/tasks/t-20261112-8jkz/reports/design-critique.md`: what is wrong on each page, one line each with path:line, the narrow-window breaks, the proposals (what I moved or dropped), one line per direction, and data notes.
- `mockups/tasks-A.html`, `tasks-B.html`, `tasks-C.html`, `plans-A.html`, `plans-B.html`, `plans-C.html`: HTML fragments, one `<style>` block each, no scripts, no external URLs.
- Nothing under `mods/` or `test/` was edited. Preview PNGs are in `.bot-herdr/tmp/design-mock/` (untracked).

## Directions
- **A, Calm document:** one reading column, plain rows, text links instead of boxes. Quiet and easy to read; fewer items visible at once.
- **B, Dense board with panel:** a task table beside a detail panel; plans in three panes. Most on screen at once; needs a wide window.
- **C, Card dashboard:** every item is a card with a soft shadow; tasks as a card row above the detail; plans as a card grid. Clearest grouping; most space and visual weight.

## Brief Check
1. Critique written, path:line per problem, narrow-window breaks, proposals, direction lines: **met**.
2. Six mockups, two per direction, named as asked: **met**.
3. HTML fragment rules (one style block, no html/head/body, no script, no external fonts, images or URLs, 1200x825, text 13px+): **met**. Checked by grep and by viewing each render.
4. LIGHT palette from look.js, font stack "Segoe UI", system-ui, sans-serif: **met**. Agent name colours are look.js's `agentInk` values (computed from look.js).
5. Real content: toast task (active, fast track, one step by design-toast, branch toast-dismissal-animation from main), plus "Scoped knowledge, plan/task pages, mockups" (active), "Fix browser back, popup backdrop" and "Fix per-agent model selection" (done, from task.json). Plan "Theme contrast, in-app file browser, visual refresh and measured engine wins" (round 11, became a task, seats, DESIGN and DEV questions with the person's answers, the other two sets summarised, composer): **met**.
6. Everything the pages show is kept, or listed as a proposal in the critique (Resume for a paused task, Delete for a stopped task, plan Start task and Archive stay in the pop-up). Comment text on the toast step is a sample: the record has no task comments.
7. One line per direction in the critique: **met**.

Done when: six HTML files and the critique exist; each opens in Edge without a page error; this report lists the three directions. **met**.

## Verification
- `msedge --headless=new --screenshot ... --window-size=1200,825` on all six — exit 0; each PNG viewed. The only stderr line is a Chromium task-manager log, not a page error. One background render hung on exit: stopped, re-run with a timeout.
- `grep` over the six: no `<html`, `<head`, `<body`, `<script`, `http`, `url(`, `@import`, `xmlns`, `transform`, `gradient`, `rotate`, `filter`, `<link`, `inset`: **none found**.
- `grep` font-size: every value 13px or larger (12px in B and C fixed to 13px).
- Shadows: `box-shadow: 0 1px 2px rgba(20,20,19,.06)` only in tasks-C and plans-C, which gpui-kit draws as `shadow_sm` (gpui-kit.d.ts:18462). Inset shadows (A's tab underline, B's row marker) were turned into borders.

## Knowledge Proposals
- gpui-kit has no line clamp (no match for "clamp" in its API): two-line titles must wrap or use `truncate()` (d.ts:19690) / `text_ellipsis()` (d.ts:19094).
- `bg()` takes a `Color` only (d.ts:1321), so the `Background.linear_gradient` (d.ts:20392) cannot be applied to an element: no gradients.
- gpui-kit has `shadow_sm` / `shadow_md` (d.ts:18462, 18450), `absolute()` (d.ts:1447), `border_dashed()` (d.ts:1665) and `grid()` (d.ts:4664), but no grid column template (only `col_span_full`, d.ts:2725): B's table would be fixed-width flex columns.
- The Plans composer is pinned to 8 rows (work.js:154): a cause of the empty box above the text.

## Script Proposals
None.

## Blockers
None blocking the choice. Decision for the Orchestrator, not me:
- The toast task changed after the screenshot: `.bot-herdr/tasks/t-20261111-zud8/task.json` now reads paused and archived, with its one step `todo` (updated 12:26, screenshot 12:22). The brief says the step is "done by design-toast"; the screenshot and the record say it is not. I drew it as the screenshot shows (active). A paused, archived task is also the case the open comment about deleting a stopped task needs, so the stopped-task states still need a design once a direction is picked.
- Delete for a stopped task is not drawn, because the toast task is active. Placement is proposed in the critique (A beside Archive, B in the panel's action row, C in the header card).
