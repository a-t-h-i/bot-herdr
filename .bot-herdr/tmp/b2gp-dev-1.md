Task t-20261111-b2gp, steps 5 and 7 (step 15 comes later in this same session). Plan: bh plan show p-20261111-9dkc. Your own earlier findings: .bot-herdr/reports/dev-panel.md §3.

GOAL
Step 5: a bh command the composer's new file browser lists folders with. Step 7: cut what spawned agents and the classifier spend, measurably.

FILES
Change: mods/bot-herdr/engine/bh.mjs, a new mods/bot-herdr/engine/lib/files.mjs, mods/bot-herdr/engine/roles/*.md, mods/bot-herdr/engine/lib/team.mjs, mods/bot-herdr/engine/classifier/qa-risk.mjs, mods/bot-herdr/engine/classifier/index.mjs, mods/bot-herdr/engine/lib/core.mjs, mods/bot-herdr/engine/scripts/**, new test/files.list.test.mjs, tests that assert brief/classifier text you change.
Leave alone: every file outside mods/bot-herdr/engine and test/, install.mjs, engine/lib/workspace.mjs (the person's uncommitted change), mods/bot-herdr/gpui-kit.d.ts.

STEP 5 — CONTRACT (Design builds the pane against exactly this)
Command: `bh files <path> [--all] --json`, run with node on this machine (the mod calls it via bh.js bh()).
stdout on success, exit 0:
  {"path":"<absolute, normalised>","parent":"<absolute or null at a root>","entries":[{"name":"a.md","path":"<absolute>","dir":false,"size":123,"mtime":1794390000000}],"truncated":false}
- Folders first, then files; each group sorted by name, case-insensitive (localeCompare with sensitivity "base").
- Names starting with "." hidden unless --all.
- At most 2000 entries; then "truncated": true.
- `~` and relative paths resolve against the home folder / cwd. On Windows, path "" or "/" lists the drive roots as dir entries (C:\, D:\ ...) with parent null.
- Entries whose stat fails (permissions, broken links) are skipped, never fatal.
On failure (missing path, not a folder, unreadable): exit 1, stdout {"error":"<one plain sentence>"}.
Put the logic in engine/lib/files.mjs as `listFolder(path, { all = false, limit = 2000 })`; bh.mjs only parses arguments and prints. Post this contract to the board: bh board post t-20261111-b2gp contract "<the contract above>" --from dev.

STEP 7 — WHAT TO DO
1. Briefs: merge rules repeated across engine/roles/global.md, worker.md and the role files (e.g. "Implementation" in dev.md:61 and worker.md:22; pace/handoff text in both global.md and worker.md). Each rule stays in exactly one file; nothing a role relies on disappears. Keep brief order in team.mjs: stable text first, knowledge and the person's instructions last. Target: `node mods/bot-herdr/engine/bh.mjs brief <role> --mode child | wc -c` for design, qa, dev about 12 KB (today 26 375 / 23 688 / 19 181). Record before/after for all six roles and all modes.
2. qa-risk (classifier/qa-risk.mjs:313-331): stop sending clip(diff, 60000). Send the diff summary the engine already computes (parseDiff / fileKind / diff_summary: files, kinds, added/removed lines) plus at most 12 000 chars of hunks, preferring hunks in non-test source files. Measure the prompt size on the same 60 KB diff before and after.
3. pickScripts (classifier/index.mjs:287-295): one question per step that returns the chosen script names (up to 3) instead of one yes/no question per candidate (up to 24). Keep the function's return shape.
4. Make engine/scripts/lib/common.mjs re-export or import sh, projectRoot and parseArgs from engine/lib/core.mjs instead of its own copies; behaviour unchanged.

CONSTRAINTS
No new dependencies. No behaviour change beyond the above. Do not commit.

DONE WHEN
- test/files.list.test.mjs covers: folders first and case-insensitive order, dot-files hidden and shown with --all, truncation at a small limit, missing path → exit 1 with {"error"}, a file path → error. It passes.
- Brief size table before/after in your report; design/qa/dev child briefs ≤ 13 KB.
- qa-risk prompt size before/after on a 60 KB diff in your report, after ≤ 25 000 chars.
- pickScripts asks one question; its tests (or new ones) pass.
- `bh check` and `npm test` pass.

IF STUCK
When something does not match this brief, stop that part, finish the rest, and report it. Never invent a workaround.
