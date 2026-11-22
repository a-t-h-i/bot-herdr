# Dev M4+M5 Fix Round Report (dev-m45fix)

## Summary

Cleared all 9 major findings (plus minor 14 and minor 17) from `reports/qa-m45.md`: global and view-local keys wired cleanly, keymap overlay gated to the active main page with focus + `Esc`/`?` close, `settings-general` brought under its 110 baseline (104), Knowledge Edit/Delete keyboard-reachable at 28 px, `activityOf` inflected verbs fixed, all `.spring()` calls routed through `springing()`, Home needs-you badge live in amber with one-shot arrival pulses, all 5 missing micro-interactions added, and `mods/bot-herdr/engine/lib/gpui-kit.d.ts` untracked and gitignored. All checks (`tsc`, `bh check`, `npm test`, `herdr-app check`, `ui-audit --shots`) are green.

## Changes

- `keys.json:1-6` — Prefixed `"ctrl-.": "bot-herdr.goal"` and removed bare `"?"` from global bindings.
- `.gitignore:5` & `git rm mods/bot-herdr/engine/lib/gpui-kit.d.ts` — Removed the 22k-line generated duplicate from git and ignored it.
- `mods/bot-herdr/rowkeys.js:29-56` — Added `DESTINATIONS`, `destinationForKey` (`Ctrl+1..5`), `opensKeymap` (`?`), and `appKeyAction` (suppressing `?` while typing).
- `mods/bot-herdr/keymap.js:15-31` — Updated `Ctrl+1..5` and `?` under context `"views"` labelled `"(in bot-herdr views)"`; `collisions()` remains empty.
- `mods/bot-herdr/switch.js:139-145,239-270,290-389` — Removed dead `tab.select:N` parsing, wired `wakeGoal` on `Ctrl+.` resume (minor 17), raised `filterChip` height to `TARGET` (28 px, minor 14), read `OPEN_COUNTS.home` (with `HOME_NEEDS` fallback), coloured Home tab badge in `c.stateNeedsYou`, and replaced `looping()` with a one-shot opacity arrival pulse (`0.35 → 1` via `MOTION.arrive`).
- `mods/bot-herdr/main.js:164-190,280-330` — Gated `keymapOverlayCard` to the active main page view (`isMainPage()`), attached `track_focus(this.keymapHandle)` focused on open, and closed on `Escape` or `?` via `on_key_down`.
- `mods/bot-herdr/home.js:56-125,175-190,326-465` — Wired view-local `Ctrl+1..5` & `?`, published `OPEN_COUNTS.home` + `HOME_NEEDS`, replaced `looping()` on needs-you rows with one-shot arrival pulse, and added 2 s finish highlight overlay (`MOTION.highlight`) on newly done rows.
- `mods/bot-herdr/threads.js:69-160,238-260,402-445,641` — Wired view-local `Ctrl+1..5` & `?`, replaced `looping()` on needs-you rows with one-shot arrival pulse, and added 2 s finish highlight overlay (`MOTION.highlight`) on newly finished threads.
- `mods/bot-herdr/agents.js:61-120` — Wired view-local `Ctrl+1..5` & `?` (on Fleet and Terminals strip) and kept `OPEN_COUNTS.home` / `HOME_NEEDS` updated from `bh home`.
- `mods/bot-herdr/library.js:33-105` — Added focus handle, input focus tracking across sub-tabs, and view-local `Ctrl+1..5` & `?`.
- `mods/bot-herdr/settings.js:207-245,502-535,789-793,848-875,1133-1225,1479-1518` — Wired view-local `Ctrl+1..5` & `?` with input focus tracking; folded `Reduce motion` into the `Access` card and removed `motionCard` plus redundant row/grid/card spacer wrappers (`settings-general`: 104 < 110); raised `toggle` hit target to `TARGET` (28 px, minor 14) and routed knob `.spring()` through `springing()`.
- `mods/bot-herdr/working.js:159-163` — Updated `READS` and `EDITS` regexes to case-insensitive inflected verbs (`Editing`, `Writing`, `Reading`, `Searching`, `Finding`, `Listing`, `Fetching`).
- `mods/bot-herdr/look.js:266-272` — Added `springing(el, property, policy)` (no-op under `reducedMotion()`) and `HIGHLIGHT_MS = 2000`.
- `mods/bot-herdr/toast.js:71-78` & `mods/bot-herdr/composer.js:1825-1880,1978-2002` — Routed all `.spring()` calls through `springing()`.
- `mods/bot-herdr/composer.js:1295-1370` & `mods/bot-herdr/chat.js:219-230,397-425,920-938` — Added optimistic send lifecycle (`pending: true` → `acked` / `failed`): un-acked messages render in `c.textMuted`, switching to `c.textPrimary` once acknowledged.
- `mods/bot-herdr/peek.js:22-35,62-75,123-160,223-256` — Folded unchosen question options (`height → 0`, `opacity → 0`) over `MOTION.fold` (150 ms) and instant under Reduce motion.
- `mods/bot-herdr/machinetext.js:46-90` — Copy button shows `"Copied"` inline for 1.5 s with no toast.
- `mods/bot-herdr/signals.js:34-98` — Added `HOME_NEEDS`, `needsYouCount`, `needsYouIds`, `withHomeCount`, `arrivedIds`, and `newlyDone`.
- `mods/bot-herdr/work.js:347-390,496-540,608-625,867-985,1819-1840,2735-2860` — Moved Knowledge card `on_hover`, `on_key_down`, and pre-created `track_focus` handle onto the outer focusable card (revealing Edit/Delete on hover, focus, or key; `e` edits, `Delete`/`Backspace` deletes), raised Edit/Delete buttons to `TARGET` (28 px), replaced Knowledge entry & note deletes with immediate delete + 5 s inline `"Deleted · Undo"`, and added 2 s finish highlight overlay (`MOTION.highlight`) on newly done step cards.
- `test/{keymap,rowkeys,signals,working}.test.mjs` — Updated `keymap.test.mjs` for `"views"` context and added unit tests for `activityOf`, `springing`, view-local `Ctrl+1..5`/`?`, `needsYouCount`, `arrivedIds`, and `newlyDone`.

### Deletes kept as confirm (irreversible)
- **Task delete** (`mods/bot-herdr/work.js:1386`, `taskDelete` → `bh task delete`): removes task directory, board, reports, and worktree/branch metadata.
- **Plan discard** (`mods/bot-herdr/work.js:2542`, `discardPlanButton` → `bh plan delete`, and `mods/bot-herdr/plandoc.js`): removes plan record and its open questions.
- **Custom agent removal** (`mods/bot-herdr/settings.js:1767`, `MoreSheet.removeButton`): removes custom agent configuration from the team roster.
- **Goal clear / stop** (`mods/bot-herdr/threads.js:492`, `bh goal stop`): terminates the Goal loop.

## Brief Check

- **Finding 1 (Global keys + minor 17)** — **Met.** `keys.json:4` uses `"bot-herdr.goal"`, bare `"?"` removed; view-local `?` and `Ctrl+1..5` wired via `rowkeys.js:52` across `home.js:176`, `threads.js:241`, `agents.js:79`, `library.js:69`, `settings.js:511`; dead `tab.select:N` removed from `switch.js`; `keymap.js:18-19` lists them as `"(in bot-herdr views)"` with 0 collisions; `switch.js:265` calls `wakeGoal` on resume.
- **Finding 2 (Keymap overlay)** — **Met.** `main.js:183,280-330` draws the overlay only in the active main page view, focuses `this.keymapHandle` on open, and closes on `Escape` or `?`.
- **Finding 3 (`settings-general` < 110)** — **Met.** Reduce motion folded into `accessCard` (`settings.js:1133-1134`), `motionCard` removed, wrappers trimmed without dropping copy; `ui-audit` reports `settings-general` at **104** (< 110).
- **Finding 4 (Knowledge Edit/Delete + minor 14)** — **Met.** Outer card owns `track_focus`, `on_hover`, and `on_key_down` (`work.js:2814-2836`); Edit/Delete buttons raised to `TARGET` (28 px); `filterChip` (`switch.js:140`) and Settings `toggle` (`settings.js:1495-1505`) raised to 28 px hit targets.
- **Finding 5 (`activityOf`)** — **Met.** Inflected case-insensitive regexes in `working.js:160-161`, verified by `test/working.test.mjs` (`"Editing filters.ts"`, `"Reading foo.js"`, `"Searching docs"`, `"Writing x"`) and visually confirmed in `shots/m5fix/home-graphite.png` & `agents-fleet-graphite.png` (`dev-m1` draws Editing cycle `▇ Shaping`).
- **Finding 6 (`spring()`)** — **Met.** `springing()` added in `look.js:267`; all `.spring(` sites routed through it (`git grep -n "\.spring(" mods/bot-herdr` matches only `look.js:268`).
- **Finding 7 (Needs-you badge & arrival pulse)** — **Met.** `OPEN_COUNTS.home` published via `signals.js:54-71` from `home.js:72-80` & `agents.js:63-65`; Home badge renders in `c.stateNeedsYou` (`switch.js:378`, confirmed amber `5` in `shots/m5fix/home-graphite.png`); all three needs-you `looping()` pulses replaced by one-shot arrival pulses (`home.js:330`, `threads.js:407`, `switch.js:374`).
- **Finding 8 (Micro-interactions)** — **Met.** Optimistic muted→primary send (`composer.js:1299`, `chat.js:921`), 150 ms `MOTION.fold` question option collapse (`peek.js:230-250`), 2 s `MOTION.highlight` done overlay (`home.js:105`, `threads.js:144`, `work.js:520`), 5 s inline `"Deleted · Undo"` for Knowledge entries & notes (`work.js:870-970,2766-2797`), and 1.5 s `"Copied"` label on `machineLine` (`machinetext.js:47-89`).
- **Finding 9 (`gpui-kit.d.ts`)** — **Met.** Untracked via `git rm -f mods/bot-herdr/engine/lib/gpui-kit.d.ts`, added to `.gitignore:5`, and deleted after `herdr-app check`.
- **Done-when grep (`git grep -n "\.spring(\|looping(" mods/bot-herdr`)** — **Met.** Only `look.js:250,268`, working breath/pulse (`switch.js:119,176`, `work.js:292`), and legacy loading dots (`switch.js:224`, `pick.js:214`).

## Verification

- `node_modules/.bin/tsc --noEmit -p mods/bot-herdr/jsconfig.json` — exit 0 (clean)
- `node mods/bot-herdr/engine/bh.mjs check` — `PASS: 672 tests pass, 1 skipped, typecheck passes` (exit 0)
- `npm test` — `673 tests, 672 pass, 0 fail, 1 skipped` (exit 0); `git status --ignored -s data/` empty
- `/home/athi/.local/bin/herdr-app check mods/bot-herdr` — `check passed: mods/bot-herdr` (exit 0), then deleted regenerated `mods/bot-herdr/engine/lib/gpui-kit.d.ts`
- `env BH_APP_HOME=/tmp/dev-m45fix-audit-home2 node mods/bot-herdr/engine/bh.mjs ui-audit --json --shots .bot-herdr/tasks/t-20261121-td97/shots/m5fix` — exit 0, 104 PNGs saved; 0 render errors, every page under its M1 baseline (`settings-general` 104 < 110, `library-knowledge` 119 < 142, `knowledge` 107 < 142, `home` 166 < 167, `threads` 77 < 268, `peek` 127 < 268), all 8 Fix counters at target, `hexOutsideTokens` 0, 16/16 themes contrast-clean, `keyboardPathCoverage` 1.0, `accessibleLabelCoverage` 1.0 (only remaining audit failures are the 3 M6 features: `approvalCard`, `diffReview`, `viewModes`).
- `git grep -n "\.spring(\|looping(" mods/bot-herdr` — `.spring(` only in `look.js:268`; zero needs-you `looping()` calls remain.

## Knowledge Proposals

- Calling `cx.focus_handle()` during `render()` throws in GPUI (`"cx.focus_handle() cannot run during render"`); dynamic per-card focus handles must be created in `init()`, async loads (`cx.spawn`), or a scheduled timer callback outside `render()`.
- In `.gitignore`, `node_modules/` with a trailing slash ignores directories but not a symlink named `node_modules`; remove any temporary symlink before handoff.
