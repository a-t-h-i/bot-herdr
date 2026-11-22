# Dev brief — M4 fixes from QA (qa-m4: CHANGES_REQUIRED)

Task t-20261121-td97, step 4. Fix exactly what `.bot-herdr/tasks/t-20261121-td97/reports/qa-m4.md` lists. Read it first; it gives `file:line` and fixes. You work in the shared task tree; another Dev (dev-m5) is doing M5 in its own worktree, so keep changes tight to these findings.

1. **[major] Thread › Conversation raw machine text** (`threads.js:456-457`, `threadview.js:180-181`): entries whose body is JSON, a stack trace or a path render through `machinetext.js` `machineLine` (one muted mono line, expand + Copy), using a shared detector. Then **tighten** `looksMachine` in `engine/lib/ui-audit-spec.mjs:415`: the `truncate` exemption applies only to mono/muted text, so a truncated body-size, non-mono line still counts. Add a fixture assertion that `thread-conversation` reports `rawMachineText 0` and a unit test that the tightened rule catches a truncated body-size JSON line.
2. **[major] Library baselines**: map `REPLACES` 1:1 in `engine/lib/ui-audit.mjs:276-279` (`library-knowledge → knowledge`, `library-learning → learning`, `library-issues → issues`, `library-scripts → knowledge`). Then bring each sub-tab under its own M1 baseline by trimming (QA suggests Knowledge's lone refresh row and the per-card edit/delete icon pair moved to hover/focus or the peek; keep them keyboard-reachable). No information lost.
3. **[minor] Home goal rows**: glyph + colour + **word** (state word next to the glyph, like agent rows).
4. **[minor] One selection idiom**: sub-tabs and segmented controls draw a filled pill *and* an underline. Spec › Components › Tabs and selection: tabs = accent text + 2 px underline (no fill); segmented controls = grey fill (no underline). Pick per control type and make the audit's selection-style counter see the difference if it doesn't today (tighten, never loosen).
5. **[minor] Library strip alignment**: centre the strip in the content column like Threads and Settings.
6. **[info → fix] Engine app home**: `engine/lib/core.mjs:16`. Use the engine-relative home only when it really is a herdr app home (e.g. has `settings.json` or `layouts/`, no `package.json`); otherwise `HERDR_APP_HOME` or `~/.config/herdr-app`. Add a test. Add `data/bot-herdr/logs/` to `.gitignore`. Don't touch the tracked `data/bot-herdr/**` samples.

## Checks (paste results)
`node_modules/.bin/tsc --noEmit -p mods/bot-herdr/jsconfig.json`, `node mods/bot-herdr/engine/bh.mjs check`, `npm test`, `/home/athi/.local/bin/herdr-app check mods/bot-herdr` (delete the generated `mods/bot-herdr/engine/lib/gpui-kit.d.ts`), `node mods/bot-herdr/engine/bh.mjs ui-audit --json --shots .bot-herdr/tasks/t-20261121-td97/shots/m4fix`: `rawMachineText 0`, and every page under its own predecessor's baseline (list them all). `git status` must show no deleted tracked files.

Don't commit. Report to `.bot-herdr/tasks/t-20261121-td97/reports/dev-m4fix.md`, then `bh report t-20261121-td97 --step 4 --file <that> "<summary>"`.
