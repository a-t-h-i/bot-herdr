# Dev brief — M4+M5 fix round (from QA qa-m45, CHANGES_REQUIRED)

Task t-20261121-td97, step 5. Goal: clear every major finding in `.bot-herdr/tasks/t-20261121-td97/reports/qa-m45.md` (findings 1–9) so the M4+M5 gate passes. Read that report's findings 1–9 in full first: they give `file:line`, cause and fix for each. Spec: `.bot-herdr/tmp/design-language-spec.md` › **Interaction and motion**, **Accessibility and ease of use** (Keyboard map), **Building in GPUI**, Principle 3 and 7.

## Files
Change only: `keys.json`, `.gitignore`, `mods/bot-herdr/{main,switch,signals,home,threads,agents,library,settings,work,working,look,toast,composer,chat,peek,machinetext,rowkeys,keymap}.js`, `test/*.test.mjs`. Delete from git: `mods/bot-herdr/engine/lib/gpui-kit.d.ts`. Leave alone: `install.mjs`, everything under `mods/bot-herdr/engine/` (except that one deletion), `ui-audit-baseline.json`, herdr's own `~/.config/herdr-app/keys.json`.

## What to do (decisions are made; follow them)
1. **Global keys (finding 1).**
   - `keys.json`: `"ctrl-.": "bot-herdr.goal"`. Remove the bare `"?"` global binding.
   - `?` becomes view-local: in the page key handlers (`rowkeys.js` and the page roots in home/threads/agents/library/settings) `?` sets `KEYMAP_OPEN` true, only when no text input has focus.
   - `Ctrl+1..5` become view-local too: the same page key handlers call `showPage` for home/threads/agents/library/settings. Do NOT override herdr's `tab.select:N` and do not touch `install.mjs`. Delete the dead `tab.select:N` parsing in `switch.js`. Update `keymap.js` so `?` and `Ctrl+1..5` are listed as "in bot-herdr views", and keep `collisions()` clean.
   - Minor 17: `Ctrl+.` resume calls `wakeGoal` like `threads.js:507`.
2. **Keymap overlay (finding 2).** Draw it only in the main page view (never switch/status/toast blocks). Give it `track_focus` with focus on open; `escape` and `?` close it via `on_key_down`.
3. **settings-general under 110 (finding 3).** Move the Reduce motion row into the existing Access/General card; no new card. Trim wrappers, not information. Audit must show `settings-general` < 110.
4. **Knowledge Edit/Delete (finding 4).** `on_hover` and `on_key_down` on the outer focusable card; actions also show while the card has focus; buttons at `TARGET` (28 px). Minor 14: raise `filterChip` and the Settings switch hit area to 28 px too (visual size may stay, hit area not).
5. **activityOf (finding 5).** Use the regexes in the report (case-insensitive, inflected verbs). Tests: `"Editing filters.ts"` → editing, `"Reading foo.js"` → reading, `"Searching docs"` → reading, `"Writing x"` → editing.
6. **spring() (finding 6).** Add `springing(el, prop, opts)` in `look.js` (returns `el` unchanged when `reducedMotion()`); route all 8 `.spring(` call sites through it. `git grep -n "\.spring(" mods/bot-herdr` must show only `look.js`.
7. **Needs-you (finding 7).** Publish the needs-you total as `OPEN_COUNTS.home` in `signals.js` (from the Home read model already loaded); Home tab badge in `c.stateNeedsYou`. Replace the three `looping()` pulses with one pulse on arrival: remember the last seen needs-you ids; when a new one appears, animate opacity 0.35→1 once (MOTION timing), then still. No pulse under Reduce motion.
8. **Micro-interactions (finding 8).**
   - Optimistic send: an un-acked sent message draws in `textMuted` until the engine acks it, then `textPrimary`.
   - Answered question card (`peek.js`): unchosen options fold (height → 0) over `MOTION.fold` (150 ms); instant under Reduce motion.
   - Finish highlight: when a thread or step turns done, its row gets a soft overlay (opacity, not colour) for `MOTION.highlight` (2 s), then fades.
   - Undo: Knowledge entry delete and Knowledge note delete happen at once and show an inline "Deleted · Undo" for 5 s that restores the entry exactly. Every other delete stays a confirm (irreversible) — list which ones in your report.
   - `machinetext.js` Copy: label "Copied" for 1.5 s, no toast.
9. **gpui-kit.d.ts (finding 9).** `git rm --cached mods/bot-herdr/engine/lib/gpui-kit.d.ts`, delete the file, add the path to `.gitignore`.

## Constraints
No new dependencies. No loosening of the audit or tests; update tests, never delete or skip. No refactors beyond the findings. Don't commit.

## Done when
- Each of findings 1–9 is fixed as above; report says how, with `file:line`.
- `node_modules/.bin/tsc --noEmit -p mods/bot-herdr/jsconfig.json` clean; `node mods/bot-herdr/engine/bh.mjs check` PASS; `npm test` exit 0; `/home/athi/.local/bin/herdr-app check mods/bot-herdr` passes (then delete the regenerated `engine/lib/gpui-kit.d.ts`); `BH_APP_HOME=$(mktemp -d) node mods/bot-herdr/engine/bh.mjs ui-audit --json --shots .bot-herdr/tasks/t-20261121-td97/shots/m5fix` exit 0, every page under its baseline, keyboard and label coverage 1.0.
- `git grep -n "\.spring(\|looping(" mods/bot-herdr` lists only `look.js` and the Working cycles/breath.

## If stuck
If a GPUI capability the fix needs is missing (check `mods/bot-herdr/gpui-kit.d.ts`), stop that item, do the rest, and report it as a blocker. Never invent a workaround.

Report to `.bot-herdr/tasks/t-20261121-td97/reports/dev-m45fix.md`, then `bh report t-20261121-td97 --step 5 --file <that> "<summary>"`.
