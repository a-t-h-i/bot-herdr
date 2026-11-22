# QA M4+M5 Re-gate (qa-m45b, after dev-m45fix `d401a5c`)

## Summary

**CHANGES_REQUIRED.** Seven of the nine `qa-m45` majors (overlay focus/Esc, `settings-general` 104 < 110, `activityOf` inflected verbs, `springing()`, amber Home needs-you badge + one-shot arrival pulses, all 5 micro-interactions, untracking `engine/lib/gpui-kit.d.ts`) plus minors 14 & 17 are cleanly fixed, all 6 working animation cycles now pass, and every check (`tsc`, `npm test` 672/672, `herdr-app check`, `ui-audit` 0 render errors & all pages under baseline) is green. Two small code bugs block PASS: (1) `work.js:2839-2853` has no typing guard on the Knowledge card's `on_key_down`, so typing `e` or `Backspace`/`Delete` inside the card's own inline note box opens the editor or deletes the Knowledge entry; (2) `rowkeys.js:52-57` still triggers `Ctrl+1..5` when `typing: true` (contradicting the re-gate requirement that `?` and `Ctrl+1..5` do nothing while a text input has focus), and `threads.js:240` omits four secondary inputs (`composer.modelSearch`, `browseSearch`, `browseTyped`, `chat.commentBoxes`) so `?` still hijacks typing there.

## Changes

None (review only). Report written to `.bot-herdr/tasks/t-20261121-td97/reports/qa-m45b.md`; screenshots captured to `.bot-herdr/tasks/t-20261121-td97/shots/m45b/`.

## Findings

### Major (block PASS)

1. **[major] Knowledge card `on_key_down` fires `e` (Edit) and `Backspace`/`Delete` (Delete entry) while typing inside the card's inline note input — `mods/bot-herdr/work.js:2839-2854,2886-2887`.**
   - Clicking a Knowledge card opens `this.inlineBox(c)` inside that card's `v_flex()` (`work.js:2854,2887`) and focuses `this.inline` (the same occurs when editing an existing note inside `this.commentNote` at `work.js:2886`).
   - Per `mods/bot-herdr/gpui-kit.d.ts:740`, `on_key_down` fires while the element **or anything inside it** holds focus. Because `work.js:2839-2853` has no `if (this.typingCount > 0 || this.editing || this.commenting) return;` guard, typing `e` in an inline note jumps to the full-file Markdown editor (`openEditor(cx)`), and pressing `Backspace` or `Delete` immediately deletes the Knowledge entry (`this.deleteEntry(agent, e, cx)`).
   - Also, when a user Tabs onto a Knowledge card (where `handle.is_focused()` reveals Edit/Delete at `work.js:2810`) and then Tabs into the Edit/Delete icon buttons (`work.js:2863-2884`), `handle.is_focused()` becomes `false`; unless a non-Tab key previously added `key` to `actionsOn`, the action buttons can unmount as focus moves into them.
   - **Fix:** at the top of `work.js:2839`, return early when `this.typingCount > 0 || this.editing || Boolean(this.commenting)` (or when `!handle?.is_focused?.()`). Keep `actionsOn` active while focus moves from the card to its Edit/Delete buttons (e.g. set `actionsOn.add(key)` when Tabbing on the focused card, or keep action buttons mounted while their focus handles are focused).

2. **[major] `Ctrl+1..5` fires while a text input has focus, and `?` is not suppressed in four Threads/Chat text inputs — `mods/bot-herdr/rowkeys.js:52-57`, `test/rowkeys.test.mjs:46`, `mods/bot-herdr/threads.js:240`, `mods/bot-herdr/composer.js:192,198,200`, `mods/bot-herdr/chat.js:284`.**
   - `rowkeys.js:52-57` runs `destinationForKey(e)` before checking `typing`, so `Ctrl+1..5` switches destinations even when `typing: true` (pinned by `test/rowkeys.test.mjs:46`). Note: `brief-dev-m45fix.md:11-12` stated the focus guard on `?` only, while `brief-qa-m45b.md:13` explicitly requires both `?` and `Ctrl+1..5` to do nothing while a text input has focus.
   - Independently, even for `?`, `threads.js:240` (`typing`) does not track focus on `composer.modelSearch` (`composer.js:192`), `composer.browseSearch` (`composer.js:198`), `composer.browseTyped` (`composer.js:200`), or `chat.commentBoxes` (`chat.js:284`), so typing `?` in any of those inputs opens the keymap overlay.
   - **Fix:** guard both actions with `if (typing) return null;` at the top of `appKeyAction` (`rowkeys.js:53`) and update `test/rowkeys.test.mjs:46` to expect `null` for `Ctrl+2` when `typing: true`; track `focus`/`blur` on `modelSearch`, `browseSearch`, `browseTyped` (`composer.js`) and `commentBoxes` (`chat.js`) and include them in `threads.js:240`.

### Minor / Info (new & carry-over from `qa-m45` minors 10–18)

- **Addressed from `qa-m45`:**
  - **Minor 14 (28 px desktop targets):** Addressed — `filterChip` (`switch.js:140`), Knowledge Edit/Delete (`work.js:2865,2876`), and Settings `toggle` (`settings.js:1495-1505`) are now `TARGET` (28 px).
  - **Minor 17 (`Ctrl+.` resume calls `wakeGoal`):** Addressed — `switch.js:265-266` calls `wakeGoal({ id: g.task, title: g.title })` when `bh goal resume` exits 0.
- **Unaddressed from `qa-m45` (non-blocking, with exact fixes):**
  - **Minor 10 (`role("status")` agent state announcements):** `statusbar.js:40` still announces only machine/branch/agent count/palette hint. Fix: include the latest state-change or needs-you summary text in a `role("status")` element.
  - **Minor 11 (Legacy `roleWord` motions in `indicators.js`):** `chat.js:1224` and `indicators.js:111-271` still use non-120 ms `.frames()`/`.loop()` (gated by `reducedMotion()` in `roleWord`, not in exported `motion()`). Fix: gate `motion()` on `reducedMotion()` or retire `roleWord` in favour of `activityMark`.
  - **Minor 12 (`activityMark` slot whitespace):** `indicators.js:333-352` sizes `VERB_SLOT` to `"Waiting on Orchestrator"`, leaving noticeable whitespace between glyph, verb, and age (`shots/m45b/home-graphite.png`, `agents-fleet-graphite.png`). Fix: tighten `VERB_SLOT` or right-align the glyph inside `GLYPH_SLOT`.
  - **Minor 13 (Legacy sub-tab loading dots):** `issues.js:593`, `learning.js:322,644`, `metrics.js:133`, `settings.js:1105,1127,1206`, `work.js:922,1009,1647,2088,2567` still use `stateView(..., { loading: true })` instead of skeleton rows. Fix: replace with layout-matched skeletons.
  - **Minor 15 (M4fix copy trims):** `learning.js:268` ("N new decisions to explain") and `issues.js:560,831` (`fetchedAt`, `by @author`) remain trimmed. Fix: restore via tooltip or expandable metadata.
  - **Minor 16 (`ui-audit` Reduce-motion live check):** `animation.frozenGlyphs` stays `0` because `ui-audit.mjs` renders no Reduce-motion page. Fix: add a Reduce-motion pass in `ui-audit.mjs` so `frozenGlyphs > 0` is verified live.
  - **Minor 18 (`edge: true` focus ring shift):** `look.js:328-331` transitions `border_1()` / `border_b(2)` to 4-sided `border_2()` on focus, causing a 1–2 px inner shift. Fix: reserve 2 px border or offset padding by 1 px on focus.
- **New minor notes (non-blocking):**
  - `agents.js:79,124-125`: pressing `?` while the `Agents › Terminals` top strip has focus sets `KEYMAP_OPEN = true`, while `main.js:185,188` suppresses rendering during `terminals`; switching back to another destination later unexpectedly opens the overlay. Fix: ignore `keymap` in `agents.js:84` when `this.sub === "terminals"`.
  - `work.js:965`: `undoKnowledgeDelete` re-attaches removed notes with `u.entryKey` rather than `n.entry ?? u.entryKey`. Fix: pass `n.entry ?? u.entryKey` so custom note match prefixes are preserved verbatim.

## Brief Check

### `qa-m45` Majors 1–9
1. **Finding 1 (Global keys + view-local `?` and `Ctrl+1..5` + minor 17)** — **Not met** (new finding 2). `keys.json:4` (`"ctrl-.": "bot-herdr.goal"`, bare `"?"` removed), `switch.js:248-267` (dead `tab.select:N` removed, `wakeGoal` wired), `keymap.js:18-19` (`views` context, 0 collisions), and view-local handlers across all 5 destinations (`home.js:176`, `threads.js:241`, `agents.js:79`, `library.js:69`, `settings.js:511`) are wired cleanly, **but** `rowkeys.js:52-57` does not suppress `Ctrl+1..5` when `typing: true`, and `threads.js:240` omits `composer.modelSearch`/`browseSearch`/`browseTyped` and `chat.commentBoxes`.
2. **Finding 2 (Keymap overlay in one block + Esc close)** — **Met.** `main.js:167,183-189,280-332` gates drawing to `isMainPage()` (excluding `switch`, `status`, `toast`, `agents-tabs`, and inactive tabs), focuses `this.keymapHandle` on open, and closes on `Escape` or `?` via `on_key_down` (verified against `layouts/bot-herdr.json`).
3. **Finding 3 (`settings-general` < 110, no info dropped)** — **Met.** Reduce motion row + hint folded into `accessCard` (`settings.js:1152-1153`), `motionCard` removed, wrappers trimmed (`settings.js:847-878,1208-1212`) with zero information dropped. `ui-audit` reports `settings-general` at **104 < 110**; visually verified in `shots/m45b/settings-general-graphite.png`.
4. **Finding 4 (Knowledge Edit/Delete reachable by Tab + keys + minor 14)** — **Not met** (new finding 1). Outer card owns `track_focus(handle)`, `on_hover`, and `on_key_down` (`work.js:2831-2853`), and Edit/Delete (`work.js:2865,2876`), `filterChip` (`switch.js:140`), and Settings `toggle` (`settings.js:1495-1505`) are 28 px (`TARGET`), **but** `work.js:2839-2853` has no typing guard so typing `e` / `Backspace` / `Delete` inside the card's inline note box (`work.js:2886-2887`) opens the editor or deletes the entry.
5. **Finding 5 (`activityOf` inflected verbs)** — **Met.** `working.js:160-161` matches case-insensitive inflected verbs; tested in `test/working.test.mjs:53-64`; visually verified in `shots/m45b/home-graphite.png` and `agents-fleet-graphite.png` (`dev-m1` "Editing filters.ts" draws the Editing cycle `▅ Shaping`).
6. **Finding 6 (Every `.spring(` via `springing`)** — **Met.** `look.js:267-269` defines `springing()`; all 8 call sites (`toast.js:70`, `composer.js:1825-1863,1877,1978-2002`, `settings.js:1483`) go through it; `git grep -n "\.spring(" mods/bot-herdr` matches only `look.js:268`; tested in `test/working.test.mjs:66-79`.
7. **Finding 7 (Needs-you amber badge + single arrival pulse, never under Reduce motion)** — **Met.** `signals.js:37,54-80`, `home.js:71-93,328-338`, `agents.js:59-61`, `threads.js:126-137,406-416`, `switch.js:291-311,389-398`. Amber `5` badge visually confirmed in `shots/m45b/home-graphite.png` and `switch-graphite.png`; `HOME_NEEDS` protects count from `questions.js:publishCounts`; all 3 infinite `looping()` pulses replaced by one-shot `0.35 -> 1` arrival transitions (`MOTION.arrive`), suppressed on initial load and under Reduce motion.
8. **Finding 8 (Micro-interactions)** — **Met.**
   - Optimistic send: `composer.js:1299-1375`, `chat.js:398-423,921-940` — unacked message renders in `c.textMuted`, returns to `c.textPrimary` on `acked()`, and on error drops the pending entry, restores the draft, and shows the error via `this.say(..., "error")`.
   - 150 ms option fold: `peek.js:22,32,123-135,226-250` — folds unchosen options (`h(0)`, `opacity(0)`) over `MOTION.fold` (150 ms), instant under Reduce motion.
   - 2 s finish highlight: `look.js:272`, `signals.js:86-97`, `home.js:97-110,387,454,474-482`, `threads.js:144-157,418-425`, `work.js:503-532,1852-1860` — soft overlay held 2000 ms then faded via `MOTION.highlight`.
   - 5 s Undo: `work.js:100,887-971,2763-2777,2796` — immediate delete + 5 s inline `"Deleted · Undo"` restores exact `prevText` (and notes) for Knowledge entries and restores Knowledge notes; irreversible deletes (Task delete, Plan discard, Custom agent removal, Goal stop/clear) remain confirm dialogs.
   - `machinetext.js` Copy cue: `machinetext.js:46-89` — shows `"Copied"` inline for 1.5 s, no toast.
9. **Finding 9 (`mods/bot-herdr/engine/lib/gpui-kit.d.ts` untracked & gitignored)** — **Met.** Deleted in `d401a5c`, added to `.gitignore:5`, verified clean after `herdr-app check` + deletion.

### Non-regression & Audit Integrity
- **M4 items, 6 cycles, Reduce motion persistence** — **Met.** No regressions found in M4 pages, thread Conversation folding (`shots/m45b/thread-conversation-paper.png`), Library baselines (`119<142`, `69<71`, `50<142`, `94<95`), or Reduce motion persistence.
- **Audit counters untouched** — **Met.** `git diff --stat 9813c7b..HEAD -- mods/bot-herdr/engine/` shows only `mods/bot-herdr/engine/lib/gpui-kit.d.ts | 22762 ---`.
- **No test writes into repo tree** — **Met.** `git status --ignored -s data/` is empty after full `npm test`.

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
| Agents › Terminals | 4 | 5 | 5 | 4 | 5 | 5 | 4 | 4 |
| Library › Knowledge | 4 | 4 | 4 | 4 | 4 | 4 | **2** | 4 |
| Library › Learning | 4 | 4 | 4 | 4 | 4 | 4 | **3** | 4 |
| Library › Scripts | 4 | 5 | 4 | 4 | 5 | 4 | 4 | 4 |
| Library › Issues | 4 | 4 | 4 | 4 | 4 | 4 | **3** | 4 |
| Settings + Usage | 4 | 4 | 5 | 4 | 4 | 4 | **3** | 4 |
| Peek drawer | 5 | 5 | 4 | 5 | 5 | 4 | **3** | 5 |

**Cells below 4 and exact fixes:**
- **Library › Knowledge P7 (2):** `work.js:2839-2853` has no typing guard on the outer card's `on_key_down`, so typing `e` or `Backspace`/`Delete` in the card's inline note input (`work.js:2886-2887`) opens the editor or deletes the entry; also keep actions mounted when Tabbing from the card onto its Edit/Delete buttons (finding 1).
- **Pages with text inputs P7 (3):** `rowkeys.js:52-57` fires `Ctrl+1..5` even when `typing: true` (add `if (typing) return null;` at `rowkeys.js:53` and update `test/rowkeys.test.mjs:46`), and `threads.js:240` omits `composer.modelSearch`/`browseSearch`/`browseTyped` (`composer.js:192,198,200`) and `chat.commentBoxes` (`chat.js:284`) from `typing` so `?` still triggers while typing in them (finding 2).

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

## Verification

- `timeout 300 /home/athi/bot-herdr/node_modules/.bin/tsc --noEmit -p mods/bot-herdr/jsconfig.json` — exit 0 (clean)
- `timeout 300 node mods/bot-herdr/engine/bh.mjs check --base 9813c7b` — 673 tests run: 672 pass, 0 fail, 1 skipped; typecheck step reported missing `typescript` only because QA worktree lacks `node_modules` (verified clean above via main repo's `tsc`)
- `timeout 300 npm test` (solo run) — 673 tests, 672 pass, 0 fail, 1 skipped (exit 0, 141.9 s); `git status --ignored -s data/` empty
- `timeout 300 /home/athi/.local/bin/herdr-app check mods/bot-herdr` — `check passed: mods/bot-herdr` (exit 0), followed by `rm -f mods/bot-herdr/engine/lib/gpui-kit.d.ts`
- `timeout 600 env BH_APP_HOME=/tmp/qa-m45b-audit-home2 node mods/bot-herdr/engine/bh.mjs ui-audit --json --shots .bot-herdr/tasks/t-20261121-td97/shots/m45b` — exit 0, 104 PNGs saved; `renderErrors: {}`, every page under M1 baseline (`settings-general` 104 < 110, `library-knowledge` 119 < 142, `library-learning` 69 < 71, `library-scripts` 50 < 142, `library-issues` 94 < 95, `home` 166 < 167, `threads` 77 < 268, `peek` 127 < 268), all 8 Fix counters at target, `hexOutsideTokens: 0`, 16/16 themes contrast-clean, `keyboardPathCoverage: 1`, `accessibleLabelCoverage: 1`, `animation: { workingCycles: 2, glyphSlots: 2, ticks120: 2, frozenGlyphs: 0 }`; only failures are the 3 M6 features (`approvalCard`, `diffReview`, `viewModes`)
- `git diff --stat 9813c7b..HEAD -- mods/bot-herdr/engine/` — only `mods/bot-herdr/engine/lib/gpui-kit.d.ts` deleted
- `git grep -n -E "\.spring\(|looping\(|\.loop\(|\.frames\(" mods/bot-herdr` — `.spring(` only in `look.js:268`; zero needs-you `looping()` calls remain
- Screenshots visually inspected (`shots/m45b/`): `home-graphite`, `agents-fleet-graphite`, `settings-general-graphite`, `switch-graphite`, `threads-graphite`, `thread-conversation-paper`, `thread-plan-graphite`, `thread-steps-graphite`, `thread-changes-graphite`, `peek-graphite`, `library-knowledge-paper`, `library-learning-paper`, `library-scripts-paper`, `library-issues-paper`, `settings-graphite`, `settings-usage-paper`

## Knowledge Proposals

- In GPUI, `.on_key_down` on a card container also receives key events from any child `Input` inside that card (`gpui-kit.d.ts:740`); card-level single-key shortcuts (`e`, `Backspace`, `Delete`) must guard on input focus (`typingCount > 0 || editing || commenting`) so editing an inline comment cannot trigger card actions or delete the card.
