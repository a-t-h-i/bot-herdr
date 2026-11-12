QA gate for task t-20261112-8jkz (risk HIGH: deep). Review the uncommitted diff in C:/Users/athenkosi.hlubi/Desktop/bot-herdr (git diff plus the untracked mods/bot-herdr/button.js and icons/*.svg). Ignore mods/bot-herdr/gpui-kit.d.ts (line endings only) and .bot-herdr/ files other than this task's.

The user's requests:
1. Knowledge was not folder/repo scoped.
2. The Tasks and Plans pages "look ugly af": they must look like the user's GIFs C:/Users/athenkosi.hlubi/Desktop/tasks-toast-light.gif and planning-light.gif (every frame extracted under .bot-herdr/tasks/t-20261112-8jkz/gif/all/).
3. Mockups on question cards must render reliably; agents on another machine struggled.
4. Sent images in the chat could not be opened or expanded.
5. Delete a stopped task; discard a plan.
6. Every button the same size on every page (Archive was smaller).
7. Agents must call them "the user", never "the person".

Acceptance criteria:
- Knowledge: the /bh-info Scout is per project (knowledge-scout-<6 hex of sha1(root)>, started with --cwd root); a saved conversation for another project starts over, one saved with no root keeps its session (existing sessions must survive); the Knowledge page never shows or saves another project's data after a space switch (work.js reload/act).
- Mockups: `bh ask --file` refuses a misplaced or unclosed mockup block with a fix-it message and writes nothing; it draws every mockup at ask time and reports "k of n mockups drawn." plus each failure; ``` and ~~~ fences with an info string work; scripts and <link> are stripped; findBrowser covers the extra install paths and the registry; Claude Code AskUserQuestion option previews become mockups; every agent's tools section explains the format; a mockup tile that can't draw shows the reason.
- Sent image chips open the lightbox (stepping through the message's images); file chips still open the viewer; a deleted image doesn't open an empty lightbox.
- `bh task delete <id>` refuses an active task, removes a worktree only through git (no --force; a refusal deletes nothing), deletes only .bot-herdr/tasks/<id>, keeps the branch, refuses ids that aren't plain names. `bh plan delete <id>` deletes only that plan and only its open question sets; a task made from it stays. Both pages make Delete/Discard two-step (5 s confirm).
- Every button is button.js actionButton, 28px; documented exceptions only: settings.js:753 (chevron inside a field) and settings.js:846 (slider tick labels).
- Tasks page, Plans page and the plan sheet follow the GIF frames (see the briefs in .bot-herdr/tasks/t-20261112-8jkz/briefs/design-pages*.md for the itemised list); nothing clips under the composer or View plan tab; narrow windows (<720px) show list or detail, never a negative width; theme tokens only, contrast test passes.
- No "the person" left in agent-facing text, messages or UI (identifiers personOnly/asksPerson and the classifier's "one person can just do it" are fine).

Reports with what each agent did and verified: .bot-herdr/tasks/t-20261112-8jkz/reports/ (dev-engine.md, design-img.md, design-sweep.md, buttons.md, design-pages.md).

Focus for the deep review: the two delete paths (path traversal, wrong folder, partial failure, worktree with changes, a task whose git.path points outside the project), the session resume rule (Windows path forms of root; a lost conversation would be a regression), the parser change (a valid questions file that used to work must still work), button/tone accessibility (focus, disabled), and work.js state bugs (stale selection after delete/archive, the knowledge reload race, timers left running from the sheet's slide).

Commands: `node --test test/*.test.mjs`, `node "C:/Users/athenkosi.hlubi/.config/herdr-app/mods/bot-herdr/engine/bh.mjs" check`, `herdr-app check mods/bot-herdr`, and from mods/bot-herdr `npx -y -p typescript@5 tsc -p jsconfig.json --noEmit` (only TS2304/TS2552 outside engine/ matter). Never run `bh ask` without BH_APP_HOME pointing at a temp folder; never run node install.mjs; don't commit.

Verdict: PASS or CHANGES_REQUIRED, findings ranked critical/major/minor with path:line and a concrete failure scenario each; write it to .bot-herdr/tasks/t-20261112-8jkz/reports/qa-gate.md and send me the verdict line.
