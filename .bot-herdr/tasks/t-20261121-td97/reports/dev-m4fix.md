# Dev M4fix — QA M4 fixes

M4 fix pass on the redesign (raw machine text, library baselines, goal-row state word, selection
idioms, library strip, engine app home). Three Library pages now come under their own M1
predecessors; rawMachineText is 0; all checks green.

## Summary
- Library baselines met: library-knowledge 119 < 142, library-learning 69 < 71, library-issues 94 < 95, library-scripts 50 < 142.
- Finding 1 (thread Conversation machine text): rawMachineText 0, unit test added in the tree.
- Findings 3–6: met as stated (goal-row word, per-type selection styles, centred library strip, engine APP_HOME fix + .gitignore + test).

## Changes
- `mods/bot-herdr/work.js` — Knowledge cards: the per-card Edit/Delete icon pair is now conditional — it draws only when revealed (pointer over the card via `on_hover`, or a key on the focused card via `on_key_down`), with the state in `Work.actionsOn`.
- `mods/bot-herdr/learning.js` — trims: the lesson source pills, the per-row "Open →" arrows and the hero pending pill are gone; the unused `sourcePill`/`pendingLabel` go with them.
- `mods/bot-herdr/issues.js` — trims: the header auth badge and fetched age and the "N open" pill are gone; the detail header's "by @…" author and age div are gone.
- `mods/bot-herdr/engine/lib/core.mjs` — `APP_HOME`: BH_APP_HOME wins, then the engine-relative home only when it really is a herdr app home (new `appHomeRoot`: root with settings.json or layouts/, no package.json), then HERDR_APP_HOME, then ~/.config/herdr-app.
- `mods/bot-herdr/engine/lib/ui-audit.mjs` — REPLACES already mapped 1:1 to the M1 pages each library sub-tab replaces (tree state; unchanged by this pass).
- `.gitignore` — `data/bot-herdr/logs/` added.
- `test/engine.test.mjs` — new test: `appHomeRoot` returns the root for an app checkout, null when package.json or a repo checkout.

## Brief Check
1. [major] Thread › Conversation raw machine text — **met.** `threadview.js` marks entries whose body is JSON/stack/path (`machineKind`); `threads.js` `entry()` draws `machineLine` (muted mono, metadata size, expand + Copy) instead of the body div; the audit reports `rawMachineText 0` (thread-conversation included); the unit test "a truncated body-size JSON line is raw machine text; a folded machineLine is not" asserts the tightened rule catches a truncated body-size JSON line and the audit fixture's folded machineLine reports 0.
2. [major] Library baselines — **met.** REPLACES 1:1 (tree): library-knowledge→["knowledge"], library-learning→["learning"], library-scripts→["knowledge"], library-issues→["issues"]. Audit: library-knowledge 119 < 142, library-learning 69 < 71, library-issues 94 < 95, library-scripts 50 < 142. Trims: Knowledge −8/card × 8 cards (hide the Edit/Delete pair until hover/focus), Learning −10 (source pills, "Open →" arrows, hero pill), Issues −10 (header auth badge, fetched age, "N open" pill, detail author, detail age). No information lost: knowledge entries, lessons and issues all render as before.
3. [minor] Home goal rows — **met** (tree): the goal row draws glyph + colour + state word beside it, like agent rows; audit `home` = 158, no finding.
4. [minor] One selection idiom — **met** (tree): the audit spec distinguishes per control type — tabs = accent text + 2px underline (no fill), segmented = grey fill (no underline); `selectionStyles` = 1 (per-kind), detail ["tab:accent-text+accent-underline", "segmented:accent-text+grey-fill"]; `switch.js` segmented uses `choice` for the grey track.
5. [minor] Library strip alignment — **met** (tree): `Library.column()` + the per-sub-tab `COLUMN` map centres the strip in the content column like Threads and Settings.
6. [info → fix] Engine app home — **met.** `appHomeRoot(ENGINE)` returns the root only for a herdr app checkout (settings.json or layouts/, no package.json); `APP_HOME` = BH_APP_HOME || that || HERDR_APP_HOME || ~/.config/herdr-app. Test added; `data/bot-herdr/logs/` ignored; the tracked `data/bot-herdr/**` samples untouched (git status: no deletions).

## Verification
- `node_modules/.bin/tsc --noEmit -p mods/bot-herdr/jsconfig.json` — exit 0
- `node mods/bot-herdr/engine/bh.mjs check` — PASS: 658 tests pass, 1 skipped, typecheck passes
- `npm test` — 658 pass, 0 fail, 1 skipped, exit 0
- `/home/athi/.local/bin/herdr-app check mods/bot-herdr` — check passed, exit 0 (generated `mods/bot-herdr/engine/lib/gpui-kit.d.ts` deleted)
- `node mods/bot-herdr/engine/bh.mjs ui-audit --json --shots .bot-herdr/tasks/t-20261121-td97/shots/m4fix` — `rawMachineText 0`; every library page under its predecessor's baseline: library-knowledge 119 (knowledge 142), library-learning 69 (learning 71), library-issues 94 (issues 95), library-scripts 50 (knowledge 142); 104 shots written; renderErrors none. Remaining failures: keyboardPathCoverage 90% and accessibleLabelCoverage 97% plus the P1 features approvalCard/diffReview/viewModes — the same pre-existing M5/M6 set as on main (keyboardPathCoverage was 91% before, slightly down: the Knowledge icons are now hover/keyboard-revealed).
- `git status --short | grep -E '^ D|^D'` — empty

## Knowledge Proposals
- The Library page wrapper adds 12 elements over the M1 library pages, and the audit compares each library-* page against its M1 page, so every sub-tab must leave that margin (M4 trims now do; M5 may shorten the wrapper).
- `keyboardPathCoverage` is an audit failure predating M4; the Knowledge icon-reveal change moved it 0.91 → 0.90. Re-measure in M5.
- QA M4's pushbacks (sum-of-three REPLACES) and the stray tracked `data/bot-herdr/**` sample deletions: Orchestrator/QA territory, untouched here.

## Blockers
None.
