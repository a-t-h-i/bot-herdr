# QA M4+M5 Re-gate Round 3 (qa-m45c, after dev-m45fix2 `469d970`)

## Summary

**PASS.** Both `qa-m45b` majors (Knowledge card key guard + Tab focus persistence for Edit/Delete; `appKeyAction` typing guard for `?` and `Ctrl+1..5` plus focus tracking on `composer.modelSearch`, `browseSearch`, `browseTyped`, and `chat.commentBoxes`) and both new minors (`agents.js` keymap under Terminals, `work.js` undo note prefix) are cleanly fixed with zero regressions and an empty diff in `mods/bot-herdr/engine/`. Every rubric cell across all 14 pages and all 6 animation cycles scores >= 4, and every verification check (`tsc`, `bh check`, solo `npm test` 673/673 + 1 skipped, `herdr-app check`, solo `ui-audit` 0 render errors & all pages under baseline, and 104 screenshots in `shots/m45c/`) passes.

## Changes

None (review only). Report written to `.bot-herdr/tasks/t-20261121-td97/reports/qa-m45c.md`; screenshots captured to `.bot-herdr/tasks/t-20261121-td97/shots/m45c/`.

## Brief Check

1. **`qa-m45b` Major 1 — Knowledge card key guard & Edit/Delete focus persistence:** **Met.**
   - `mods/bot-herdr/work.js:2846` guards the Knowledge card's `on_key_down` at the top with `cardKeysActive({ typingCount: this.typingCount, editing: this.editing, commenting: this.commenting })` (`mods/bot-herdr/rowkeys.js:64-66`). Because both `startInline("knowledge", ...)` (`work.js:765-767`) and `editInline("knowledge", ...)` (`work.js:774-775`) set `this.commenting` and focus `this.inline` (tracked in `this.typingCount` at `work.js:363,381`), typing `e`, `Backspace`, or `Delete` inside a Knowledge card's inline note input returns early and never opens the editor or deletes the entry.
   - `mods/bot-herdr/work.js:623-625,976-987,2811-2816,2837,2873,2885` pre-creates per-card `{ card, edit, del }` FocusHandles outside render and wires `.track_focus(handle)`, `.track_focus(editHandle)`, and `.track_focus(delHandle)` so `showActions` stays `true` while Tab moves from the card onto Edit and Delete.
   - Pinned by unit test in `test/rowkeys.test.mjs:50-56`.
2. **`qa-m45b` Major 2 — `?` and `Ctrl+1..5` suppressed while any text input has focus:** **Met.**
   - `mods/bot-herdr/rowkeys.js:52-58` returns `null` at the top of `appKeyAction` whenever `typing` is `true`, suppressing both `Ctrl+1..5` and `?`; pinned at `test/rowkeys.test.mjs:46-47`.
   - `focus`/`blur` tracking added on `composer.modelSearch` (`mods/bot-herdr/composer.js:192-199`), `composer.browseSearch` (`composer.js:205`), `composer.browseTyped` (`composer.js:207`), and every `chat.commentBoxes` `InputState` (`mods/bot-herdr/chat.js:222,286-287`), aggregated into `typing` at `mods/bot-herdr/threads.js:240-250` (along with `work.taskComposer?.focused` / `typingCount`).
   - Verified all other destination roots (`home.js:176`, `agents.js:79`, `library.js:68-69`, `settings.js:511`) pass their `typing` state into `appKeyAction`, and all remaining `InputState`/`TextareaState` instances belong to standalone modal overlays (`MoreSheet`, `PlanDoc`, `NoteForm`, `Pick`, `Viewer`) or `mdedit` (gated by `editing`).
3. **Two new minors from `qa-m45b`:** **Met.**
   - `mods/bot-herdr/agents.js:84-89`: ignores `app?.kind === "keymap"` when `this.sub === "terminals"`.
   - `mods/bot-herdr/work.js:938,967`: `deleteKnowledgeNote` records `n.entry ?? e.key` and `undoKnowledgeDelete` re-attaches removed notes with `n.entry ?? u.entryKey`.
4. **No regressions & clean engine diff:** **Met.**
   - `git diff 2c6c15c..469d970 -- mods/bot-herdr/engine/` is empty (0 bytes).
   - `git diff --stat 2c6c15c..469d970 -- . ':!.bot-herdr'` touches only the 7 allowed files (`agents.js`, `chat.js`, `composer.js`, `rowkeys.js`, `threads.js`, `work.js`, `test/rowkeys.test.mjs`).
   - `git diff --stat 9813c7b..HEAD -- mods/bot-herdr/engine/` shows only the deletion of `mods/bot-herdr/engine/lib/gpui-kit.d.ts`; `git status --ignored -s data/` is empty after full `npm test`.
   - All previously-Met M4+M5 items remain intact (overlay focus/Esc in `main.js:183-189,280-332`, `settings-general` at 104 < 110, `activityOf` inflected verbs & 6 working cycles, `.spring(` only in `look.js:268`, amber Home needs-you badge + single arrival pulses, all 5 micro-interactions, and all M4 pages under baseline).
5. **Rubric & carry-over minors:** **Met.** Every page cell and every animation cycle cell is >= 4; unaddressed minors 10–13, 15, 16, 18 carried over below.

## Rubric (1–5; PASS needs every cell >= 4)

### Pages

| Page | P1 needs-you | P2 one accent | P3 hide empty | P4 summary→detail | P5 agent colour | P6 machine folded | P7 keys & phone | Keep traits |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Home | 5 | 5 | 4 | 5 | 5 | 5 | 4 | 5 |
| Threads list | 5 | 5 | 5 | 5 | 5 | 5 | 4 | 5 |
| Thread › Conversation | 4 | 5 | 4 | 4 | 5 | 5 | 4 | 4 |
| Thread › Plan | 4 | 4 | 4 | 4 | 5 | 4 | 4 | 4 |
| Thread › Steps | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 |
| Thread › Changes | 4 | 5 | 4 | 4 | 5 | 5 | 4 | 4 |
| Agents › Fleet | 4 | 5 | 4 | 4 | 5 | 5 | 4 | 5 |
| Agents › Terminals | 4 | 5 | 5 | 4 | 5 | 5 | 4 | 4 |
| Library › Knowledge | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 |
| Library › Learning | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 |
| Library › Scripts | 4 | 5 | 4 | 4 | 5 | 4 | 4 | 4 |
| Library › Issues | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 |
| Settings + Usage | 4 | 4 | 5 | 4 | 4 | 4 | 4 | 4 |
| Peek drawer | 5 | 5 | 4 | 5 | 5 | 4 | 4 | 5 |

All 112 page cells >= 4.

### Working Animation Cycles (6 cycles)

| Cycle | Distinct | 120 ms steady | Zero layout shift | Frozen under Reduce motion |
| --- | --- | --- | --- | --- |
| Thinking (`⠁⠂⠄⡀⢀⠠⠐⠈`) | 5 | 5 | 4 | 5 |
| Reading / searching (`▖▘▝▗`) | 5 | 5 | 4 | 5 |
| Editing files (`▁▃▅▇▅▃`) | 5 | 5 | 4 | 5 |
| Running tests or checks (`▱▱▱`…`▰▰▰`) | 4 | 5 | 4 | 5 |
| Waiting on another agent (`· • ● •`) | 4 | 5 | 4 | 5 |
| Orchestrating (`◜◝◞◟`) | 4 | 5 | 4 | 5 |

All 24 animation cells >= 4.

## Minor / Info (carry-over from `qa-m45`, non-blocking)

- **Minor 10 (`role("status")` agent state announcements):** `statusbar.js:40` announces machine/branch/agent count/palette hint only; add the latest state-change or needs-you summary in a `role("status")` element.
- **Minor 11 (Legacy `roleWord` motions in `indicators.js`):** `chat.js:1224` and `indicators.js:111-271` still use non-120 ms `.frames()`/`.loop()` (gated by `reducedMotion()` in `roleWord`, not in exported `motion()`); gate `motion()` on `reducedMotion()` or retire `roleWord` in favour of `activityMark`.
- **Minor 12 (`activityMark` slot whitespace):** `indicators.js:333-352` sizes `VERB_SLOT` to `"Waiting on Orchestrator"`, leaving noticeable whitespace between glyph, verb, and age (`shots/m45c/home-graphite.png`, `agents-fleet-graphite.png`); tighten `VERB_SLOT` or right-align the glyph inside `GLYPH_SLOT`.
- **Minor 13 (Legacy sub-tab loading dots):** `issues.js:593`, `learning.js:322,644`, `metrics.js:133`, `settings.js:1105,1127,1206`, `work.js:922,1009,1647,2088,2567` still use `stateView(..., { loading: true })` instead of skeleton rows.
- **Minor 15 (M4fix copy trims):** `learning.js:268` ("N new decisions to explain") and `issues.js:560,831` (`fetchedAt`, `by @author`) remain trimmed; restore via tooltip or expandable metadata.
- **Minor 16 (`ui-audit` Reduce-motion live check):** `animation.frozenGlyphs` stays `0` because `ui-audit.mjs` renders no Reduce-motion page; add a Reduce-motion pass in `ui-audit.mjs` so `frozenGlyphs > 0` is verified live.
- **Minor 18 (`edge: true` focus ring shift):** `look.js:328-331` transitions `border_1()` / `border_b(2)` to 4-sided `border_2()` on focus, causing a 1–2 px inner shift; reserve 2 px border or offset padding by 1 px on focus.

## Verification

- `/home/athi/bot-herdr/node_modules/.bin/tsc --noEmit -p mods/bot-herdr/jsconfig.json` — exit 0 (clean)
- `timeout 300 /home/athi/.local/bin/herdr-app check mods/bot-herdr && rm -f mods/bot-herdr/engine/lib/gpui-kit.d.ts` — `check passed: mods/bot-herdr` (exit 0); regenerated `mods/bot-herdr/engine/lib/gpui-kit.d.ts` removed
- `node --test test/rowkeys.test.mjs` — 4/4 pass (exit 0)
- `node --test test/working.test.mjs` — 6/6 pass (exit 0)
- `timeout 300 node mods/bot-herdr/engine/bh.mjs check` — `NO CHECKS` on clean worktree; re-run with `--base 2c6c15c`: 674 tests run (673 pass, 0 fail, 1 skipped, 202.4 s); typecheck sub-step reported missing `typescript` only because the QA worktree lacks `node_modules` (verified clean above via main repo's `tsc`)
- `timeout 600 npm test` (solo run) — 674 tests, 673 pass, 0 fail, 1 skipped (exit 0, 183.2 s); `git status --ignored -s data/` empty
- `timeout 600 env BH_APP_HOME=$(mktemp -d) node mods/bot-herdr/engine/bh.mjs ui-audit --json --shots .bot-herdr/tasks/t-20261121-td97/shots/m45c` — exit 0, 104 PNGs saved (note: `library-knowledge` timed out on the spec pass while running concurrently with `bh check`; re-run solo below)
- `timeout 600 env BH_APP_HOME=$(mktemp -d) node mods/bot-herdr/engine/bh.mjs ui-audit --json` (solo run) — exit 0; `renderErrors: {}`, every page under M1 baseline (`settings-general` 104 < 110, `library-knowledge` 119 < 142, `library-learning` 69 < 71, `library-scripts` 50 < 142, `library-issues` 94 < 95, `home` 166 < 167, `threads` 77 < 268, `peek` 127 < 268), all 8 Fix counters at target, `hexOutsideTokens: 0`, 16/16 themes contrast-clean, `keyboardPathCoverage: 1`, `accessibleLabelCoverage: 1`, `animation: { workingCycles: 2, glyphSlots: 2, ticks120: 2, frozenGlyphs: 0 }`; only failures are the 3 M6 features (`approvalCard`, `diffReview`, `viewModes`)
- `git diff 2c6c15c..469d970 -- mods/bot-herdr/engine/` — empty (exit 0)
- `git diff --stat 2c6c15c..469d970 -- . ':!.bot-herdr'` — 7 files changed (`agents.js`, `chat.js`, `composer.js`, `rowkeys.js`, `threads.js`, `work.js`, `test/rowkeys.test.mjs`)
- `git grep -n -E "\.spring\(|looping\(" -- mods/bot-herdr/ ':!mods/bot-herdr/gpui-kit.d.ts'` — `.spring(` only in `look.js:268`; zero needs-you `looping()` calls remain
- Screenshots visually inspected (`shots/m45c/`): `home-graphite`, `home-paper`, `home-ink`, `home-moss`, `threads-graphite`, `threads-paper`, `thread-conversation-graphite`, `thread-conversation-paper`, `thread-plan-graphite`, `thread-plan-paper`, `thread-steps-graphite`, `thread-steps-paper`, `thread-changes-graphite`, `agents-fleet-graphite`, `agents-fleet-paper`, `agents-terminals-graphite`, `library-knowledge-graphite`, `library-knowledge-paper`, `library-knowledge-ink`, `library-knowledge-moss`, `library-learning-paper`, `library-scripts-paper`, `library-issues-graphite`, `library-issues-paper`, `settings-graphite`, `settings-paper`, `settings-general-graphite`, `settings-general-paper`, `settings-usage-graphite`, `settings-usage-paper`, `peek-graphite`, `peek-paper`, `switch-graphite`

## Knowledge Proposals

- Running `bh ui-audit` concurrently with the full `npm test` suite can cause transient per-page render timeouts on slow GPUs (only the MESA banner returns on stderr); run `bh ui-audit` solo for reliable `renderErrors` measurements.
