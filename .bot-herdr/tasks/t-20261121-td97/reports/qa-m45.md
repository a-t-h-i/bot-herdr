# QA M4 Re-check + M5 Gate (qa-m45)

## Summary

**CHANGES_REQUIRED.** M4 findings 1, 2 (baselines/REPLACES), 3–6 and audit integrity are fixed, except M4fix broke keyboard reachability of Knowledge card Edit/Delete (`work.js:2684-2685`). M5 fails the gate on several code defects: global keybindings in `keys.json`/`switch.js` are unwired or collide with herdr, the `?` keymap overlay draws inside every mod block and has no `Esc` close, `settings-general` regressed over its M1 baseline (122 > 110), `activityOf` misclassifies `"Editing …"` as Thinking, `.spring()` animations bypass Reduce motion, Home's needs-you badge is dead code and row glyphs loop continuously, several spec micro-interactions are missing, and a 22k-line generated `mods/bot-herdr/engine/lib/gpui-kit.d.ts` was committed.

## Changes

None (review only). Report written to `.bot-herdr/tasks/t-20261121-td97/reports/qa-m45.md`; screenshots captured to `.bot-herdr/tasks/t-20261121-td97/shots/m5/`.

## Findings

### Major (block PASS)

1. **[major] Global keybindings (`Ctrl+.`, `?`, `Ctrl+1..5`) do not work as wired — `keys.json:4-5`, `mods/bot-herdr/switch.js:246-256`.**
   - `keys.json` binds `"ctrl-.": "goal"` and `"?": "map"` without the `bot-herdr.` prefix. Per `gpui-kit.d.ts:22345` (`"<mod>.<command>" delivers <command> to that mod's nextCommand()`), bare `"goal"` and `"map"` never reach `Switch`'s `nextCommand()` loop.
   - `switch.js:254-255` parses `/^tab\.select:(\d+)$/` inside `nextCommand()`. Built-in herdr bindings (`~/.config/herdr-app/keys.json:26-30`: `"ctrl-1"`…`"ctrl-5"` → `"tab.select:1"`…`"tab.select:5"`) execute in herdr's own terminal tab switcher and are never sent to a mod's `nextCommand()`. Worse, `install.mjs:176-181` never overwrites existing keys, so `ctrl-1..5` collides with herdr's `keys.json`.
   - Binding bare `"?"` in `keys.json` `"global"` (once fixed to `bot-herdr.map`) would hijack typing `?` in terminals and inputs (herdr's own `keys.json:45-47` uses `ctrl-?` / `ctrl-shift-?`, never bare `?`, in `"global"`).
   - **Fix:** prefix `keys.json` `"ctrl-.": "bot-herdr.goal"`. Handle bare `"?"` in view-local `on_key_down` when no input is focused (or bind `"ctrl-shift-?"` / document `?` as view-local in `rowkeys.js` + `threads.js`/`home.js`/`agents.js`/`library.js`/`settings.js`). For `Ctrl+1..5`, either bind `bot-herdr.home`…`bot-herdr.settings` (deciding with the user/Orchestrator whether `install.mjs` should override `tab.select:1..5` in `bot-herdr` layout) or listen on view-local `on_key_down` for `ctrl+1..5`; remove dead `tab.select:N` parsing from `switch.js:254`.

2. **[major] Keymap `?` overlay renders in every mod block simultaneously and cannot be closed with `Esc` — `mods/bot-herdr/main.js:264,270-302`.**
   - `BotHerdr.render()` renders `keymapOverlayCard` for *every* `BotHerdr` instance when `shared(KEYMAP_OPEN)` is true — including the 42 px `switch` top bar and 28 px `status` bottom bar (`layouts/bot-herdr.json:103,243`), drawing clipped duplicate overlays in 3 blocks at once.
   - `keymapOverlayCard` has only `.on_click(() => setShared(KEYMAP_OPEN, false))` — no `track_focus`, no `on_key_down`, and no `Esc` close.
   - **Fix:** guard rendering in `main.js:264` to the active main page view (not `switch`/`status`/`toast`), give the overlay a focus handle (`track_focus`) focused on open, and handle `escape` (and `?` toggle) in `on_key_down` to clear `KEYMAP_OPEN`.

3. **[major] `settings-general` regressed over its M1 baseline (122 > 110) — `mods/bot-herdr/settings.js:1179,1187,1192-1202`.**
   - `dev-m5.md` claimed this was "pre-existing M5-era debt"; in M4 (`qa-m4.md`) `settings-general` passed under 110. Adding a separate `motionCard` (`bh-motion`) added ~12 elements, pushing `settings-general` to 122 vs the M1 baseline of 110 (`ui-audit` FAIL).
   - **Fix:** move the `Reduce motion` row into the existing `Access` (or `General`) card so it doesn't add a third card header/wrapper, and trim redundant subtext/wrappers until `settings-general < 110` without dropping information.

4. **[major] Knowledge card Edit/Delete buttons are unreachable by keyboard (M4fix regression) — `mods/bot-herdr/work.js:2684-2712`.**
   - `.on_hover(...)` and `.on_key_down(...)` were attached to the inner header `h_flex()` (lines 2678–2686), which has no `tab_index` or `track_focus`. Only the outer card `bh-know-card-...` is focusable. In GPUI, key events bubble up from the focused node and never descend into children, so pressing a key on the focused card never reveals Edit/Delete. Hovering the card body also fails to reveal them (only the 16 px top header line triggers `.on_hover`).
   - **Fix:** move `.on_hover` and `.on_key_down` onto the outer focusable card `v_flex` (`work.js:2663-2675`), and also reveal actions on focus / `Enter` or provide a keyboard shortcut while focused; raise button size from `CHIP` (22 px) to `TARGET` (28 px).

5. **[major] `activityOf` misclassifies present-participle activity summaries as Thinking — `mods/bot-herdr/working.js:160-161`.**
   - `EDITS = /^(Edit|Write)\b/` and `READS = /^(Read|Search|Find|List|Fetch|Search the web)\b/` fail on `"Editing filters.ts"` (the audit's own fixture, `ui-audit-fixtures.mjs:356`), `"Writing …"`, `"Reading …"`, `"Searching …"`. Visually confirmed in `shots/m5/home-graphite.png` and `shots/m5/agents-fleet-graphite.png`: `dev-m1` ("Editing filters.ts") draws the Thinking cycle (`⠁ Thinking` / `⠁ Mulling`) instead of the Editing cycle (`▁ Writing` / `Shaping`).
   - **Fix:** match inflected verbs too (`EDITS = /^(Edit|Editing|Write|Writing)\b/i`, `READS = /^(Read|Reading|Search|Searching|Find|Finding|List|Listing|Fetch|Fetching|Search the web)\b/i`) and add a unit test in `test/working.test.mjs` covering `"Editing filters.ts"` → `"editing"` and `"Reading foo.js"` → `"reading"`.

6. **[major] `.spring(...)` animations bypass `reducedMotion()` — `mods/bot-herdr/toast.js:77`, `mods/bot-herdr/composer.js:1821-1824,1848,1958-1961`, `mods/bot-herdr/settings.js:1485`.**
   - None of the 8 `.spring()` call sites route through a `look.js` helper, so toasts, the composer send button, and even the Reduce motion switch knob itself still animate with spring physics when Reduce motion is on.
   - **Fix:** add a `springing(el, prop, opts)` helper in `look.js` (no-op when `reducedMotion()` is true) and route all `.spring()` calls through it.

7. **[major] Needs-you pulse violates spec and Home tab badge is dead code — `mods/bot-herdr/switch.js:293-297,319,376`, `mods/bot-herdr/home.js:277`, `mods/bot-herdr/threads.js:361`.**
   - `switch.js:295` reads `counts["home"]` from `OPEN_COUNTS`, but `openCounts()` (`signals.js:40-48`) only returns `{ chat, plans }` — `counts.home` is always `undefined`, so the Home tab badge never renders or pulses. Even if populated, `switch.js:376` colours it `c.accent`/`c.textMuted` instead of amber (`stateNeedsYou`).
   - `home.js:277`, `threads.js:361`, and `switch.js:376` all use `looping()` (infinite continuous pulse), violating the spec ("One amber pulse, then still" / "only Working animates continuously").
   - **Fix:** publish the total needs-you count to `OPEN_COUNTS.home` (or compute `home` count from `bh home` / open questions), render the Home tab badge in `c.stateNeedsYou` (amber), and trigger a single opacity pulse on new needs-you arrivals (via state transition + timer) rather than infinite `.loop()`.

8. **[major] Missing spec micro-interactions (optimistic muted state, 150 ms option fold, 2 s finish highlight, 5 s Undo, machineLine Copy cue).**
   - `MOTION.fold` (`look.js:272`) and `MOTION.highlight` (`look.js:282`) are defined with **zero callers** in the codebase.
   - `chat.js:886-930`: sent messages appear optimistically but at full contrast, never muted until acked.
   - `peek.js:211`: answering a question card unmounts unchosen options instantly instead of folding them over 150 ms.
   - Thread/step finish: no 2 s soft highlight overlay on `✓` anywhere (`threads.js`, `work.js`, `home.js`).
   - Destructive actions: no 5 s Undo pattern anywhere; all deletes use 2-step confirm (`work.js:1388-1419,2541-2550,2698-2701`, `settings.js:1767-1775`).
   - `machinetext.js:71-76`: Copy button has no 1.5 s `"Copied"` label feedback.

9. **[major] Generated `mods/bot-herdr/engine/lib/gpui-kit.d.ts` (22,762 lines) should NOT be tracked.**
   - Byte-identical (`cmp` exit 0) to `mods/bot-herdr/gpui-kit.d.ts`. `mods/bot-herdr/jsconfig.json:38-39` includes only `gpui-kit.d.ts` at `mods/bot-herdr/` and excludes `engine`. It is an auto-generated side effect of `herdr-app check mods/bot-herdr`.
   - **Fix:** `git rm mods/bot-herdr/engine/lib/gpui-kit.d.ts` and add `mods/bot-herdr/engine/lib/gpui-kit.d.ts` to `.gitignore`.

### Minor / Info

10. **[minor] `role("status")` regions do not announce agent state changes** (`statusbar.js:40` only announces `machine, branch, N agents, palette hint`; none announces `"Dev needs you: plan question"`).
11. **[minor] Chat working line still uses legacy `roleWord` motions** (`chat.js:1224`, `indicators.js:178,180,184,260,268`) with non-120 ms `.frames(..., 280/600/160)` and `.spin(1800/2800)` (it does respect `reducedMotion()` via `roleWord`, though exported `motion()` would bypass it if called directly).
12. **[minor] Visual gap in `activityMark` fixed-width slots (`indicators.js:333-352`)**: `VERB_SLOT` sized to `"Waiting on Orchestrator"` (~130 px) left-aligned next to a 31 px glyph slot leaves large whitespace between `⠁`, `Thinking`, and `15h` (`shots/m5/home-graphite.png`, `agents-fleet-graphite.png`).
13. **[minor] Legacy sub-tabs still use centred pulsing-dot `stateView(..., { loading: true })` instead of skeletons** (`issues.js:593`, `learning.js:322,644`, `metrics.js:133`, `settings.js:1105,1127,1206`, `work.js:922,1009,1647,2088,2567`).
14. **[minor] Desktop hit targets below 28 px**: `filterChip` (`switch.js:140`, `CHIP = 22 px`), Knowledge card Edit/Delete (`work.js:2689,2704`, `CHIP = 22 px`), Settings switch (`settings.js:1464`, `H = 20 px`).
15. **[minor] M4fix trims dropped minor details** (`learning.js:268` dropped `"N new decisions to explain"`; `issues.js:560,831` dropped `fetchedAt` and `by @author`).
16. **[minor] `ui-audit` animation check never renders a Reduce-motion page** (`frozenGlyphs` is always `0` in the live audit; frozen rendering is only unit-tested on synthetic spec text).
17. **[minor] `switch.js:263-272` (`Ctrl+.` goal resume) does not call `wakeGoal`** (unlike `threads.js:507`).
18. **[minor] Focus ring on `edge: true` controls (`look.js:320-322`)** transitions from 1 px border (or 2 px bottom-only) to 4-sided `border_2()`, causing 1–2 px inner shift on focus.

## Brief Check

### M4 Re-check
1. **qa-m4 finding 1 (raw machine text in thread Conversation)** — **Met.** `threadview.js:184` uses `machineKind`, `threads.js:457,472-479` draws `machineLine` (verified in `shots/m5/thread-conversation-paper.png`), `looksMachine` (`ui-audit-spec.mjs:465-466`) only exempts truncated text when `< 13px` or mono (`font_family`), `test/ui-audit.test.mjs:184-194` and `test/threads-view.test.mjs:53-54` test it, and `ui-audit` reports `rawMachineText 0`.
2. **qa-m4 finding 2 (`REPLACES` 1:1 & Library baselines)** — **Partially met (Knowledge defect, finding 4).** `REPLACES` (`ui-audit.mjs:277-280`) maps 1:1 (`library-knowledge` 119 < 142, `library-learning` 69 < 71, `library-scripts` 50 < 142, `library-issues` 94 < 95). However, hiding Knowledge Edit/Delete broke keyboard reachability (`work.js:2684-2685`).
3. **qa-m4 finding 6 (`APP_HOME` + `.gitignore`) & minor findings 3–5** — **Met.** `appHomeRoot` in `core.mjs:19-31` + test in `test/engine.test.mjs:42-55`; `data/bot-herdr/logs/` in `.gitignore:4`. Minor 3 (goal row state word `home.js:374-376`), minor 4 (one selection idiom per control type `switch.js:36-89`, tightened audit `ui-audit-spec.mjs:358-378`), and minor 5 (centred Library strip `library.js:77,82-85`) are all addressed.
4. **Audit not loosened** — **Met.** `ui-audit-baseline.json` unchanged; `ui-audit.mjs` tightened `REPLACES` to 1:1; `ui-audit-spec.mjs` tightened `looksMachine` and `collectSelection` and kept `isInteractive`/`hasKeyboardPath`/`hasAccessibleLabel` untouched.

### M5 Pass Criteria
1. **Six working cycles (120 ms tick, fixed-width slot, <= 4 s verb rotation, breathing avatar)** — **Not met** (finding 5: `activityOf` misclassifies `"Editing filters.ts"` as Thinking; minor findings 11–12).
2. **Reduce motion (persisted toggle + `settings().reduced_motion`, one helper)** — **Not met** (finding 3: `motionCard` broke `settings-general` baseline 122 > 110; finding 6: 8 `.spring()` sites bypass `reducedMotion()`). Toggle itself persists via `setShared` (`gpui-kit.d.ts:22701`) and honours `settings().reduced_motion` (`main.js:49`).
3. **Micro-interactions table** — **Not met** (findings 7–8):

| Spec moment | Status | Evidence (`file:line`) |
| --- | --- | --- |
| Hover a row or button (step +1; secondary fade in) | Partial | `look.js:296-298` `hoverable()`; Knowledge reveal broken on header-only `work.js:2684`; thread rows show no cost/copy on hover |
| Press (step +2; no bounce) | Present | `look.js:90,307-312,354` `c.pressed` + `pressable`/`pressTone` |
| Send a message (optimistic, muted until acked) | Partial | Optimistic add `chat.js:395-399`; **missing** muted/unacked state (`chat.js:886-930`) |
| Answer a question card (✓; others fold over 150 ms) | Partial | `✓` + hide `peek.js:211,223`; **missing** 150 ms fold (`MOTION.fold` unused) |
| Thread or step finishes (✓ + 2 s soft highlight overlay) | Missing | Static `✓` only; **missing** 2 s overlay (`MOTION.highlight` unused) |
| Something needs you (one amber pulse on glyph & Home badge; unfocused toast) | Broken | Infinite `.loop()` (`home.js:277`, `threads.js:361`), dead Home badge (`switch.js:295`/`signals.js:40-48`), unfocused toast present only on terminal blocked (`chat.js:487`) |
| Loading a page (skeletons, never centred spinner) | Partial | Skeletons on Home/Threads/Agents/Scripts (`home.js:186`, `threads.js:315,424,540`, `agents.js:163`, `scripts.js:103`); legacy sub-tabs still use pulsing dot `stateView(..., { loading: true })` (`issues.js:593`, `learning.js:322`, `metrics.js:133`, `settings.js:1105`, `work.js:1009`) |
| Copy or save ("Copied"/"Saved" 1.5 s; no toast) | Partial | `scripts.js:19,135-144` ("Copied" 1.5 s); `settings.js:128,485,748` ("Saved" cue 2.5 s); **missing** on `machinetext.js:71-76` |
| Destructive action (do it + Undo 5 s; confirm only if irreversible) | Missing | Zero 5 s Undo; all deletes use 2-step confirm (`work.js:1388-1419,2541-2550,2698-2701`, `settings.js:1767-1775`) |

4. **Accessibility + keyboard** — **Not met** (findings 1, 2, 4, 10, 14, 18). Audit reports real `keyboardPathCoverage 1.0` and `accessibleLabelCoverage 1.0` (unloosened), and view-local `J/K/Home/End/Space/Enter/Esc/1–9/Ctrl+Enter` are wired on Home/Threads/Agents/Composer, but global `Ctrl+1..5`/`Ctrl+.`/`?` are broken or colliding, the `?` overlay draws in every block without `Esc`, and Knowledge Edit/Delete is keyboard-unreachable.
5. **No test writes into the repo tree** — **Met.** `git status --ignored -s data/` empty after full `npm test`.

## Rubric (1–5; PASS needs every cell >= 4)

### Pages

| Page | P1 needs-you | P2 one accent | P3 hide empty | P4 summary→detail | P5 agent colour | P6 machine folded | P7 keys & phone | Keep traits |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Home | 5 | 5 | 4 | 5 | 5 | 5 | **3** | 5 |
| Threads list | 5 | 5 | 5 | 5 | 5 | 5 | **3** | 5 |
| Thread › Conversation | 4 | 5 | 4 | 4 | 5 | 5 | **3** | 4 |
| Thread › Plan | 4 | 4 | 4 | 4 | 5 | 4 | **3** | 4 |
| Thread › Steps | 4 | 4 | 4 | 4 | 4 | 4 | **3** | 4 |
| Thread › Changes | 4 | 5 | 4 | 4 | 5 | 5 | **3** | 4 |
| Agents › Fleet | 4 | 5 | 4 | 4 | 5 | 5 | **3** | 5 |
| Agents › Terminals | 4 | 5 | 5 | 4 | 5 | 5 | **3** | 4 |
| Library › Knowledge | 4 | 4 | 4 | 4 | 4 | 4 | **2** | 4 |
| Library › Learning | 4 | 4 | 4 | 4 | 4 | 4 | **3** | 4 |
| Library › Scripts | 4 | 5 | 4 | 4 | 5 | 4 | **3** | 4 |
| Library › Issues | 4 | 4 | 4 | 4 | 4 | 4 | **3** | 4 |
| Settings + Usage | 4 | 4 | **3** | 4 | 4 | 4 | **3** | 4 |
| Peek drawer | 5 | 5 | 4 | 5 | 5 | 4 | **3** | 5 |

**Cells below 4 and exact fixes:**
- **All pages P7 (3):** global bindings broken (`keys.json:4-5`, `switch.js:248-255`) and `?` overlay renders in every mod block with no `Esc` (`main.js:264-302`) — apply fixes in findings 1 and 2. Additionally: Home needs-you badge dead (`switch.js:295`, `signals.js:40-48`, finding 7); Settings toggle spring ignores Reduce motion (`settings.js:1485`, finding 6).
- **Library › Knowledge P7 (2):** Edit/Delete `.on_key_down`/`.on_hover` on inner non-focusable `h_flex` (`work.js:2684-2685`) — move handlers to outer focusable `bh-know-card-...` and raise targets to 28 px (finding 4).
- **Settings + Usage P3 (3):** `settings-general` draws 122 elements > M1 baseline 110 after adding `motionCard` (`settings.js:1179,1187,1192-1202`) — fold Reduce motion into the existing Access/General card (finding 3).

### Working Animation Cycles (6 cycles)

| Cycle | Distinct | 120 ms steady | Zero layout shift | Frozen under Reduce motion |
| --- | --- | --- | --- | --- |
| Thinking (`⠁⠂⠄⡀⢀⠠⠐⠈`) | 5 | 5 | 4 | 5 |
| Reading / searching (`▖▘▝▗`) | **3** | 5 | 4 | 5 |
| Editing files (`▁▃▅▇▅▃`) | **2** | 5 | 4 | 5 |
| Running tests or checks (`▱▱▱`…`▰▰▰`) | 4 | 5 | 4 | 5 |
| Waiting on another agent (`· • ● •`) | 4 | 5 | 4 | 5 |
| Orchestrating (`◜◝◞◟`) | 4 | 5 | 4 | 5 |

**Cells below 4 and exact fixes:**
- **Reading / searching Distinct (3)** and **Editing files Distinct (2):** `working.js:160-161` regexes `READS = /^(Read|Search|Find|List|Fetch|Search the web)\b/` and `EDITS = /^(Edit|Write)\b/` fail on present-participle lines like `"Editing filters.ts"` (`shots/m5/home-graphite.png` shows `⠁ Thinking`, `agents-fleet-graphite.png` shows `⠁ Mulling`), collapsing Editing and Reading into Thinking. Fix regexes in `working.js:160-161` to accept `-ing` forms and add unit tests in `test/working.test.mjs`.

## Verification

- `node_modules/.bin/tsc --noEmit -p mods/bot-herdr/jsconfig.json` — exit 0, no findings
- `node mods/bot-herdr/engine/bh.mjs check --base 5fc282c` — `PASS: 668 tests pass, 1 skipped, typecheck passes` (exit 0)
- `npm test` — 669 tests, 668 pass, 1 skipped, 0 fail (exit 0); `git status --ignored -s data/` empty
- `/home/athi/.local/bin/herdr-app check mods/bot-herdr` — `check passed: mods/bot-herdr` (exit 0); `cmp mods/bot-herdr/gpui-kit.d.ts mods/bot-herdr/engine/lib/gpui-kit.d.ts` exit 0 (tracked duplicate from M5)
- `env BH_APP_HOME=/tmp/qa-m45-audit-home node mods/bot-herdr/engine/bh.mjs ui-audit --json --shots .../shots/m5` — exit 0, `pass: false`, 104 PNGs written. Fix counters all at target (`topLevelDestinations 5`, `zeroCountChips 0`, `repeatedDefaultStrings 0`, `statsPerCard 1`, `selectionStyles 1`, `rawMachineText 0`, `decorativeIcons 0`, `agentColourFills 0`), `hexOutsideTokens 0`, 16/16 themes contrast-clean, `keyboardPathCoverage 1`, `accessibleLabelCoverage 1`, `animation { workingCycles: 2, glyphSlots: 2, ticks120: 2, frozenGlyphs: 0 }`. Real failure: `settings-general` 122 > 110 (plus M6 features `approvalCard`/`diffReview`/`viewModes`). Note: `settings` hit a transient `interrupted` during parallel load; solo re-run `env BH_APP_HOME=/tmp/qa-m45-audit-home node mods/bot-herdr/engine/bh.mjs ui-audit --page settings --json` passed cleanly (`258` elements < 292, `keyboardPath 1`, `accessibleLabel 1`, `renderError: null`).
- Screenshots inspected (`shots/m5/`): `home-graphite`, `threads-graphite`, `thread-conversation-paper`, `thread-plan-graphite`, `thread-steps-graphite`, `thread-changes-graphite`, `agents-fleet-graphite`, `agents-terminals-graphite`, `library-knowledge-paper`, `library-learning-paper`, `library-scripts-paper`, `library-issues-paper`, `settings-graphite`, `settings-general-graphite`, `settings-usage-paper`, `peek-graphite`.

## Knowledge Proposals

- `keys.json` mod bindings require the `"bot-herdr.<cmd>"` prefix to reach `nextCommand()`; built-in herdr commands (`tab.select:N`) never route to a mod's `nextCommand()`, and bare `"?"` in `"global"` collides with typing `?` in terminals/inputs.
- `BotHerdr.render()` in `main.js` runs in every `bot-herdr` layout block (`switch`, `status`, active page); any full-page overlay keyed off `shared(...)` must gate on the active page view so it does not render clipped duplicates in top/bottom bars.
- In GPUI, `.on_key_down` on a non-focusable child of a `focusable` card never receives key events when the outer card holds focus (events bubble up, never down).
- `mods/bot-herdr/engine/lib/gpui-kit.d.ts` is generated by `herdr-app check mods/bot-herdr` and duplicates `mods/bot-herdr/gpui-kit.d.ts`; it should be gitignored, not tracked.
