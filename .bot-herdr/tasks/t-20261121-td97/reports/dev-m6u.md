# Dev report — M6 UI (`dev-m6u`)

## Summary
Implemented all M6 UI features (items 1–8) against `contract-m6.md`: three-choice approval cards in Peek and Thread Conversation, in-place diff review with inline comments, Summary/Normal/Verbose view modes with `v` keybinding, thread map with `forkOf`/`children`/`forks`, inline Fork handoff, composer Queue & Steer, and tiled agent panes via `layout.set` `{ terminal }` blocks. All checks pass (`tsc`, `herdr-app check`, `bh check`, `npm test`, live M6 engine+UI tests, and `bh ui-audit --json`).

## Changes
- `mods/bot-herdr/approvalcard.js` (new, lines 1–102): three-choice approval card (`bh-approval-<id>`, buttons `bh-approval-<id>-once|project|deny`), agent avatar + name, folded mono command (`machinetext.js`), `1`/`2`/`3` focus keys, primary only on first card's Allow once, `MOTION.fold` collapse.
- `mods/bot-herdr/diffreview.js` (new, lines 1–195): in-place diff viewer (`bh-diff-<path>`, `bh-diff-line-<path>-<new>`, `bh-review-comment-<id>`), mono lines, `c.stateDone`/`c.stateFailed` text with `+`/`−` gutter (no fills), muted line numbers, click/Enter inline comment editor (Enter saves, Esc cancels), comments with Remove.
- `mods/bot-herdr/threadmap.js` (new, lines 1–133): thread map tree (`bh-thread-map`, `bh-thread-map-<name|id>`) for parent, `children` (avatar, name, state glyph, step) and `forks` (title, state), Space peeks and Enter opens, hidden when empty; clickable muted `"Forked from <title>"` (`bh-thread-fork-of`).
- `mods/bot-herdr/threadview.js` (lines 163–169, 328–567): pure hostile-input-safe helpers for approvals (`APPROVAL_CHOICES`, `approvalRecord`, `approvalsList`, `approvalsForTask`, `approvalChoiceForKey`, `approvalAnswerArgs`), diff review (`diffModel`, `diffLineId`, `reviewCommentsList`, `openReviewCount`, `commentsForLine`, `reviewAddArgs`, `reviewRemoveArgs`, `reviewSendArgs`), view modes (`VIEW_MODES`, `viewModeOrDefault`, `nextViewMode`, `filterConversation`, `threadSummary`), thread map (`threadMapModel`), and fork (`forkPrefill`, `forkArgs`).
- `mods/bot-herdr/threads.js` (lines 10–35, 75–120, 200–255, 291–335, 550–980): wired approval cards at Conversation top, Summary/Normal/Verbose segmented control (`bh-view-mode`, `v` key), thread map + `Forked from` + Peek drawer on open threads, Fork header button (`bh-thread-fork`) + inline input (`bh-fork-input`), and expandable diff rows + inline comments + `Send to Dev · N` (`bh-review-send`) in Changes.
- `mods/bot-herdr/home.js` (lines 63–66, 142–160, 208–212, 361–367): approval rows peek `{ kind: "approval", id: n.ref, thread, item }` and refresh Home when answered.
- `mods/bot-herdr/peek.js` (lines 15–190, 245–265): loads `bh approvals list --json` for approval peeks, renders `renderApprovalCard`, answers via `bh approvals answer <id> once|project|deny` on click or keys `1`/`2`/`3`, folds over `MOTION.fold`.
- `mods/bot-herdr/composer.js` (lines 31–33, 217–220, 258–276, 1240–1390, 1614–1740, 2033–2036): bound `ctrl-enter` to `bot_herdr_steer`; Enter while working queues (`bh-queue-<n>` muted row above composer with Remove, delivered via `hc send` once idle); Ctrl+Enter / Steer button (`bh-steer`) runs `hc interrupt` then `hc send`; updated placeholder (`Enter queues, Ctrl+Enter steers…`).
- `mods/bot-herdr/signals.js` (lines 160–269): pure helpers for queue/steer (`composerSendMode`, `steerCommands`, `queueCommand`, `composerPlaceholder`) and tiled panes (`tileAddresses`, `isTiledLayout`, `withTiledPanes`).
- `mods/bot-herdr/agents.js` (lines 7–22, 116–185) & `layouts/bot-herdr.json` (lines 201–206): added `gap: 8` on `panes` row and **Tile** toggle (`bh-agents-tile`) in Agents › Terminals strip using Herdr's `layout.set` with `{ terminal: "<addr>" }` blocks (preserving `main` hidden while tiled).
- `mods/bot-herdr/chat.js` (line 1148): updated folded child group label from `"N child reports"` to `"N child threads"`.
- `mods/bot-herdr/keymap.js` (lines 27–30): added `V` (Cycle Summary, Normal and Verbose) and updated `Ctrl+Enter` description.
- `mods/bot-herdr/RECIPE.md` (lines 157–175): replaced "not built yet" note with documentation of all M6 features.
- `test/m6-ui.test.mjs` (new, lines 1–177): unit tests for all pure M6 UI helpers.

## Brief Check
1. **Three-choice approval card** — Met (`mods/bot-herdr/approvalcard.js:1-102`, `mods/bot-herdr/peek.js:90-190`, `mods/bot-herdr/home.js:145-156`, `mods/bot-herdr/threads.js:700-752`, `mods/bot-herdr/threadview.js:330-374`).
2. **Diff review with inline comments** — Met (`mods/bot-herdr/diffreview.js:1-195`, `mods/bot-herdr/threads.js:852-975`, `mods/bot-herdr/threadview.js:376-449`).
3. **Summary / Normal / Verbose** — Met (`mods/bot-herdr/threads.js:326-329, 552-561, 667-674, 738-785`, `mods/bot-herdr/threadview.js:451-482`, `mods/bot-herdr/keymap.js:28`).
4. **Child threads and a thread map** — Met (`mods/bot-herdr/threadmap.js:1-133`, `mods/bot-herdr/threads.js:607-680`, `mods/bot-herdr/threadview.js:484-530`, `mods/bot-herdr/chat.js:1148`).
5. **Handoff and fork** — Met (`mods/bot-herdr/threads.js:563-605, 654-658`, `mods/bot-herdr/threadview.js:532-542`).
6. **Queue and steer** — Met (`mods/bot-herdr/composer.js:258, 1240-1305, 1378-1382, 1665-1695, 1722-1735, 2034`, `mods/bot-herdr/signals.js:161-189`).
7. **Tiled agent panes** — Met using Herdr's documented `{ terminal }` layout blocks + `layout.set` (`mods/bot-herdr/agents.js:116-184`, `mods/bot-herdr/signals.js:191-269`, `layouts/bot-herdr.json:202-206`).
8. **Tests** — Met (`test/m6-ui.test.mjs:1-177`, 6/6 pass).

## Verification
- `/home/athi/bot-herdr/node_modules/.bin/tsc --noEmit -p mods/bot-herdr/jsconfig.json` — exit 0 (0 errors)
- `/home/athi/.local/bin/herdr-app check mods/bot-herdr` — exit 0 (`check passed: mods/bot-herdr`; removed regenerated `mods/bot-herdr/engine/lib/gpui-kit.d.ts`)
- `node mods/bot-herdr/engine/bh.mjs check` — exit 0 (`PASS: 679 tests pass, 1 skipped, typecheck passes`)
- `npm test` — exit 0 (`679 pass, 0 fail, 1 skipped`)
- `node --test test/m6-ui.test.mjs test/approvals.test.mjs test/review-comments.test.mjs test/thread-fork.test.mjs` (post-`fdf345c` engine merge) — exit 0 (`14 pass, 0 fail`)
- `node mods/bot-herdr/engine/bh.mjs approvals list --json`, `review list t-20261121-td97 --json`, `thread show t-20261121-td97 --json` — exit 0, JSON matches `contract-m6.md`
- `BH_APP_HOME=/tmp/bh-m6u-audit3 node mods/bot-herdr/engine/bh.mjs ui-audit --json` (post-`fdf345c`) — exit 0, `renderErrors: {}` (0), `hexOutsideTokens: 0`, `accentButtonsPerView: 1`, `keyboardPathCoverage: 1`, `accessibleLabelCoverage: 1`, all 8 Fix counters at target, 16/16 theme presets pass contrast, every page under M1 baseline (`thread-conversation` 131 < 228, `thread-changes` 90 < 167, `thread-plan` 72 < 101, `thread-steps` 94 < 167, `agents-terminals` 9 < 29), `viewModes: true`.

## Notes for Integration
- `ui-audit` reports `approvalCard: false` and `diffReview: false` only because `mods/bot-herdr/engine/lib/ui-audit-fixtures.mjs` (owned by `dev-m6e`, off-limits to `dev-m6u`) defines `DATA.approvals`, `DATA.reviewDiffs`, and `DATA.reviewComments` without yet assigning them in `SEEDS`. To flip both markers to `true` in `ui-audit-fixtures.mjs`:
  - In `SEEDS["thread-conversation"]`: `page.approvals = DATA.approvals.approvals;`
  - In `SEEDS["thread-changes"]`: `page.expandedDiffs = new Set([Object.keys(DATA.reviewDiffs)[0]]); page.diffs = new Map(Object.entries(DATA.reviewDiffs).map(([k, v]) => [k, { path: v.path, truncated: v.truncated, hunks: v.hunks.map((h) => ({ header: h.header, rows: h.lines.map((l, i) => ({ kind: l.kind, gutter: l.kind === "add" ? "+" : l.kind === "del" ? "−" : " ", oldLine: l.old, newLine: l.new, lineId: l.new ? "bh-diff-line-" + v.path + "-" + l.new : "bh-diff-line-" + v.path + "-del-" + (l.old ?? i), text: l.text, commentable: Boolean(l.new) })) })) }])); page.reviewComments = DATA.reviewComments.comments;` (or import `diffModel` from `threadview.js`).
