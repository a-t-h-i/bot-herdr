# Dev brief — M4+M5 fix round 2 (from QA qa-m45b, CHANGES_REQUIRED)

Task t-20261121-td97, step 5. Goal: clear the two remaining majors in `.bot-herdr/tasks/t-20261121-td97/reports/qa-m45b.md` (Findings › Major 1 and 2) plus two new small minors, so the M4+M5 gate passes. Read that report's findings in full first. Spec: `.bot-herdr/tmp/design-language-spec.md` › **Accessibility and ease of use** (Keyboard map), Principle 7.

## Files
Change only: `mods/bot-herdr/{work,rowkeys,threads,composer,chat,agents}.js`, `test/*.test.mjs`. Leave alone everything else, in particular `install.mjs`, `mods/bot-herdr/engine/`, `ui-audit-baseline.json`.

## What to do
1. **Knowledge card keys (major 1), `mods/bot-herdr/work.js:2839-2854,2886-2887`.**
   - At the top of the card's `on_key_down` handler return early when `this.typingCount > 0 || this.editing || Boolean(this.commenting)`. Typing `e`, `Backspace` or `Delete` inside the card's inline note input must not open the editor nor delete the entry.
   - Keep Edit/Delete mounted while focus moves by Tab from the card onto its Edit/Delete buttons: show them while the card handle OR either button's focus handle is focused (track focus handles for the two buttons), not only via `actionsOn`.
   - Add a test pinning the guard (extract the guard as a small pure function if needed to test it, e.g. `cardKeysActive({ typingCount, editing, commenting })`).
2. **Typing suppresses global view keys (major 2).**
   - `mods/bot-herdr/rowkeys.js:52-57`: `appKeyAction` returns `null` first thing when `typing` is true, so neither `?` nor `Ctrl+1..5` fire while a text input has focus. Update `test/rowkeys.test.mjs:46` to expect `null` for `Ctrl+2` with `typing: true`.
   - Track `focus`/`blur` on `composer.modelSearch`, `composer.browseSearch`, `composer.browseTyped` (`composer.js:192,198,200`) and every `chat.commentBoxes` input (`chat.js:284`), the same way the inputs already counted in `threads.js:240` are tracked, and include them in that `typing` value.
3. **Minor: keymap under Terminals**, `mods/bot-herdr/agents.js:79-84`: ignore the `keymap` action when `this.sub === "terminals"`.
4. **Minor: Undo note prefix**, `mods/bot-herdr/work.js:965`: `undoKnowledgeDelete` re-attaches notes with `n.entry ?? u.entryKey`.

## Constraints
No new dependencies, no refactors beyond these items, no loosening of tests or the audit (update tests, never delete or skip). Don't commit.

## Done when
- Items 1–4 fixed; the report gives `file:line` for each.
- `node_modules/.bin/tsc --noEmit -p mods/bot-herdr/jsconfig.json` clean (use `/home/athi/bot-herdr/node_modules/.bin/tsc` if the worktree lacks node_modules); `node mods/bot-herdr/engine/bh.mjs check` PASS; `npm test` exit 0; `/home/athi/.local/bin/herdr-app check mods/bot-herdr` passes (then delete the regenerated `mods/bot-herdr/engine/lib/gpui-kit.d.ts`); `BH_APP_HOME=$(mktemp -d) node mods/bot-herdr/engine/bh.mjs ui-audit --json` exit 0 with every page under its baseline and keyboard/label coverage 1.0.

## If stuck
If GPUI lacks something a fix needs (check `mods/bot-herdr/gpui-kit.d.ts`), stop that item, do the rest, report it as a blocker. Never invent a workaround. Do NOT run `bh goal verify`.

Report to `.bot-herdr/tasks/t-20261121-td97/reports/dev-m45fix2.md`, then `bh report t-20261121-td97 --step 5 --file <that> "<summary>"`.
