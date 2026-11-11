Task t-20261111-b2gp, step 9: the visual refresh. Good work on steps 1-2; step 3 is dropped (board #3). Your own audit is .bot-herdr/reports/design-visual.md (§2 drift counts, §3 surface by surface, §4 order of cost, Notes "What done means"). The person chose: keep the paper, tighten it; compact; alive.

GOAL
Every page reads as one system: one type scale, one spacing set, three radii, one elevation rule, one hover/press/focus style, one loading and one empty treatment, with motion.

FILES
Change: mods/bot-herdr/look.js, chat.js, composer.js, switch.js, work.js, settings.js, toast.js, lightbox.js, pick.js, viewer.js, working.js. Leave alone: mods/bot-herdr/engine/** (Dev), test/contrast.test.mjs and test/fixtures/** (QA is writing them now), gpui-kit.d.ts, install.mjs, layouts/bot-herdr.json, themes/*.json.

WHAT TO DO
1. look.js tokens, exactly:
   TYPE = { xs: 10.5, sm: 12, md: 13.5, lg: 16, xl: 18 } with line heights { xs: 14, sm: 16, md: 20, lg: 22, xl: 24 }.
   SPACE = { 1: 2, 2: 4, 3: 8, 4: 12, 5: 16 } (16 only for page padding).
   Heights: ROW 28, CONTROL 28, CHIP 22, TARGET 28 (icon buttons and every click target at least 28).
   Radii: SIZE.radius 12 (panels, cards, composer, dialogs), SIZE.control 10 (fields, buttons), SIZE.nested 8 (rows, chips inside panels); pips/marks use a token PIP 3. rounded_full only for dots and the send/stop buttons.
   Elevation: shadow_md only for floating things (composer, toast, popovers, dialogs); cards and panels are border-only; nothing else casts a shadow.
   MOTION gains: hover 120 (colour), press 90 (1px sink: translate via top/margin, no transform; gpui-kit has none), pane 190, arrive 240 (opacity 0→1 with 6px rise), stagger 22 per row (cap at 8 rows), plus the existing policies. Every transition() literal in the files above comes from MOTION.
2. Replace every text_size, gap, px/py/p, h, rounded and duration literal in those files with the tokens. Body copy is TYPE.md everywhere (replies, bubbles, plan lines, knowledge cards, task steps, settings descriptions); headings TYPE.lg for section/page titles and TYPE.xl only for the page title; captions/meta TYPE.sm; kbd caps, tags and counts TYPE.xs.
3. Interaction helpers in look.js, used everywhere something is clickable: hoverable(el, c) (bg to c.hover, MOTION.hover), pressable(el) (.active() 1px sink), focusable(el, id) (tab_index(0) and a 2px accent focus ring via .focus(); check gpui-kit.d.ts:1062,1270,1276 for exact shapes). Every on_click element gets all three. If .focus() styling cannot be shown for keyboard focus, say so in the report.
4. One segmented control: switch.js, work.js:451-472 and work.js:765-798 use a single shared function; it draws from palette(), not t.chrome/t.border.
5. One empty state and one loading state component (title TYPE.lg, line TYPE.md muted, max width 460, optional action), used by Chat, Tasks, Plans, Knowledge and Settings. Knowledge shows loading while knowAll is null, never "No notes match." (work.js:1102). Errors use the same component with a retry action where a reload exists.
6. Reading width: chat reply and bubble text capped so lines stay near 75 characters at TYPE.md (about 600px); the plan document lines likewise. Remove the nested reply scroll (chat.js max_h(460) + overflow_y_scroll): long replies grow in the feed; same for the tasks widget in chat if it nests a scroll.
7. One source for agent colour: work.js:942 seat squares call agentHue/agentInk.
8. Lightbox: replace the ${tone}24 hex-suffix alpha with alpha().
9. Alive: new messages in the feed arrive with MOTION.arrive; list rows in Tasks, Knowledge cards and pane rows stagger in by MOTION.stagger when the page or pane opens (not on every re-render). Respect reduced motion if herdr settings expose it (check settings() in gpui-kit.d.ts); if not, report it.
10. Do not change any foreground/background colour pair from steps 1-2.

CONSTRAINTS
No new dependencies, no layout numbers from layouts/bot-herdr.json, no behaviour changes. Do not commit.

DONE WHEN
- grep over the files above finds no numeric literal in text_size(, rounded(, transition( durations, and every gap/px/py/h value is a token (list any exception with its reason).
- Distinct text sizes in use: 5. Distinct radii: 3 plus PIP and full.
- Every on_click element has hover, press and focus (count them in the report: before 58 on_click / 0 active / 0 focus).
- `node --test test/palette.test.mjs test/themes.test.mjs` passes, `npx tsc -p mods/bot-herdr/jsconfig.json` passes, `bh check` passes.
- Report lists what changed per file, the counts before/after, and anything you could not do.

IF STUCK
Stop that part, finish the rest, and report it. Never invent a workaround. Write the report to .bot-herdr/tasks/t-20261111-b2gp/reports/design.md (overwrite) and hc send t2z.
