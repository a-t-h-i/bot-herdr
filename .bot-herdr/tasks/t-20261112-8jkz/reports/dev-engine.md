# dev-engine report: t-20261112-8jkz

## Summary
Steps 2 and 3 are done: the Scout and conversations follow the project, and mockups are checked and drawn at `bh ask` time. The addendum (step 6) is done too: `bh task delete` and `bh plan delete`. Tests pass (176 of 177, 1 skipped), and `bh check` passes.

## Changes
Engine only, plus tests. Nothing committed; `node install.mjs` not run.

- `mods/bot-herdr/engine/bh.mjs`: `knowledge ask` names the Scout per project (`team.scoutName(root)`) and starts it with `--cwd root`. `ask --file` refuses a file with warnings (exit 1, nothing written), draws every mockup after `Q.ask`, and prints the count and failures (`--json` adds `drawn`, `failed`). `task delete` and `plan delete` sub-commands beside `archive`, their UsageError strings and help lines.
- `mods/bot-herdr/engine/lib/agent.mjs`: `resumeState(saved, { harness, root })` (exported): a saved conversation for another project starts over with the dim "is in another project now" line; one with no `root` keeps its session and takes the root. `root` is written into every state the agent creates, and the state is saved at startup. Question-tool cards go through `Q.drawMockups`.
- `mods/bot-herdr/engine/lib/ask.mjs`: `parseQuestions` returns `warnings` and accepts ``` / ~~~ fences with an info string; a block outside an option, or a second block under one option, is dropped with a warning. `sanitizeMockup` (scripts and `<link>` removed) is applied when mockups are written. `drawMockups(record, draw)` returns `{ drawn, failed }`. `discardOpenFor(plan)` removes a plan's open question sets.
- `mods/bot-herdr/engine/lib/media.mjs`: `findBrowser` adds the Windows installs (Beta, Dev, SxS, Edge Beta/Dev), Scoop, App Paths in the registry (HKCU then HKLM, injectable `reg`), PATH `msedge`/`chrome`; macOS Canary and Edge Beta; Linux `chrome-headless-shell` and three files. `appPathOf` parses `reg query` output. The no-browser message now ends with "Set BH_BROWSER to its path."
- `mods/bot-herdr/engine/lib/runner.mjs`: `previewMockup` (exported); `fromAskTool` carries each option's `preview` as its mockup.
- `mods/bot-herdr/engine/lib/team.mjs`: `scoutName(root)` (exported); the verbatim mockup tool line after the `bh ask` line.
- `mods/bot-herdr/engine/lib/tasks.mjs`: `deleteTask(root, id)`. Refuses active tasks; removes a worktree with `git worktree remove` (no force); deletes the task folder; keeps the branch.
- `mods/bot-herdr/engine/lib/plans.mjs`: `deletePlan(root, id)`: removes the plan folder and its open question sets; answered ones and tasks stay.
- `mods/bot-herdr/engine/roles/global.md`, `roles/panel.md`: the two wording changes from the brief.
- `test/knowledge-classifier.test.mjs`: the Scout test uses the per-project name and checks each project's `--cwd`.
- New: `test/mockup-questions.test.mjs`, `test/mockup-browser.test.mjs`, `test/project-scope.test.mjs`, `test/task-plan-delete.test.mjs`.

## Brief Check
Steps 2 and 3:
- Scout named per project, started in the project, reused by send: **met**. `knowledge-classifier` test (stand-in `hc`) and `project-scope` test.
- Conversation belongs to one project; no-root state keeps its session; file names under DATA unchanged: **met**. `project-scope` tests call `resumeState`. The runAgent wiring is not run headless (no harness here); checked by reading.
- `parseQuestions` fence variants, both warnings, `{ intro, questions, warnings }`: **met**. `mockup-questions` tests.
- Script/link stripping before writing: **met**.
- `bh ask --file` refuses a misplaced block (exit 1, nothing written, temp app home): **met**. Test and a real run.
- Draws every mockup after writing; "<k> of <n> mockups drawn." and failure lines; `--json` `drawn`, `failed`: **met**. Test with a failing browser (`BH_BROWSER` = node) and a real-browser test (skipped when no browser).
- `findBrowser` Scoop, registry App Path, `/opt/google/chrome/chrome`, all with injected probes: **met**. `mockup-browser` tests.
- `fromAskTool` text and HTML preview become mockups: **met**. `mockup-questions` test; both are written and drawn.
- Team tool line, global.md and panel.md wording: **met**.
- Contracts (`mockupFile`, `bh mockup --json`, PNG reuse): **met**, unchanged.

Addendum (step 6):
1. `bh task delete <id>`: active refused with `<id> is active: pause or finish it first.`; worktree removed without force, git's reason and `Commit or discard its changes, then delete it again.` on refusal with nothing deleted; folder removed; branch kept; reply and `--json { deleted, branch }`: **met**. Tests: active kept, paused and done deleted, refused worktree keeps the folder, reply text and JSON.
2. `bh plan delete <id>`: plan folder and only that plan's open question files (`.json`, `.html`, `.png`, `.page.html`) removed; answered ones kept; a task made from it stays; reply `Discarded <id>.`; `--json { deleted, questions }`: **met**. Test.
3. UsageError strings (both) and `bh help` next to archive: **met** (`bh help` output checked).
4. Tests as listed, temp `BH_APP_HOME`: **met**.

## Verification
- `node --test test/*.test.mjs` — 177 tests: 176 pass, 0 fail, 1 skipped (the headless-shell test; no such browser here). Note: `node --test test/` (the directory form) fails on this Node, so I used the glob that `package.json` uses.
- `node "…/bh.mjs" check` — PASS: lint and typecheck pass; 92 changed tests, 91 pass, 1 skipped.
- Real run, fresh temp `BH_APP_HOME`, `--as t0`, default browser search (Chrome): two questions, one with two mockups — `Asked (q-…, 2 questions). …` then `2 of 2 mockups drawn.`, exit 0; two PNGs beside the HTML.
- Real run, misplaced fence — exit 1, `Not asked: fix these in <file> and run bh ask again:` and the warning line; questions folder not created.
- Claude Code 2.1.322 (`C:/Users/athenkosi.hlubi/.local/bin/claude.exe`): AskUserQuestion has a per-option `preview`. Found by `grep -a` on the binary: "Preview content is rendered as markdown in a monospace box… When any option has a preview, the UI switches to a side-by-side layout… previews are only supported for single-select questions (not multiSelect)." A second variant reads "Preview content must be a self-contained HTML fragment (no <html>/<body> wrapper, no <script> or <style> tags — use inline style attributes instead)." Our runner passes HTML previews through unchanged, so a `<style>` block from an agent is kept; that is not what that variant asks for.

## Knowledge Proposals
- `bh ask --file` draws mockups at ask time and refuses misplaced blocks; the reply names unfinished mockups and their reasons.
- Knowledge is per project on disk; the Scout is `knowledge-scout-<sha1(root) first 6>`, and conversations belong to one project (`resumeState`).
- Claude Code 2.1.322 AskUserQuestion options carry `preview` (see Verification).

## Script Proposals
None.

## Blockers
None for the engine. Cross-domain, for Design:
- `mods/bot-herdr/composer.js:1198` labels the `/bh-info` question with the fixed name `knowledge-scout` in the feed. The Scout's real name is now per project (`--json` `name`). Cosmetic, but the feed will show a name that is not the one that answers.

## Pushback
- Not covered from scout-know, outside my files or not verified: the Knowledge page showing or saving another project after a space switch (`work.js`); a space with no folder falling back to the focused terminal; a space on another machine; task worktrees and the lead's `hc run --cwd`; replies and activity keyed by terminal rather than project (`agent.mjs:196, :273`). Scout's scenarios 3-5 and 7-10 remain open.

## Decisions I made (say if you want them changed)
- `drawn` in `--json` is an array of `{ question, option, image }`; `failed` is `{ question, option, error }` as asked.
- The refusal also applies to questions read from stdin (no `--file`); the message then says "fix these in the questions".
- Added a warning for a mockup block that is never closed (it would otherwise swallow the rest of the file). It is not in the brief.
- A preview that is only whitespace gives no mockup.
- `bh task delete` on an active task reports through the CLI's error path, so stderr reads `bh: <id> is active: pause or finish it first.`
