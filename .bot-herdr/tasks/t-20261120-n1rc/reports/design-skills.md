## Summary
Points 1-5 of step 11 are done against contract #9. They are tested against a fixture in `test/skills-view.test.mjs`. npm test (286 pass, 0 fail), herdr-app check and tsc are clean.
Two things wait on the engine: `steps[].skills` must be in `bh task list` for the step line to show, and `bh tools --list` doesn't exist yet. Both are posted on the board as question #10.

## Changes
- `mods/bot-herdr/skillsview.js` (new, pure):
  - `SEARCH_OVER = 8` and `filterTools(items, query)`: case-insensitive substring on name and description.
  - `newestActive(tasks)` and `pickedFor(task, id)`: returns none / off / a list of `{ name, added }`.
  - `skillsLine(skills)`: pinned + picked + added, de-duplicated; added ones get " (added)"; "Skills: none" when all are empty; " (fallback)" appended; null when there is no `skills`.
  - `supportedNames(list)`: "Claude Code, Codex and OpenCode" from `bh tools --list`, or null.
- `settings.js` (MoreSheet):
  - The skills section is now labelled "Pinned by you", with the hint "Always allowed. The classifier adds skills for each task on top."
  - Under it, a read-only "Picked for the current task" section. It follows the newest active task from `bh task list` → `bh task show <id>` → `skills[<role or slug(name)>]`, shown as muted chips with " (added)" marks. Picked null shows "Classifier off: only your pins apply."; no active task shows "No task running.".
  - A "Search skills and MCP servers" field above the chips when skills and servers together number more than 8. It filters both lists; with no match the list reads "None match.".
  - The unsupported-harness note takes its names from `bhJson(["tools","--list"])`, asked once a session, and falls back to the fixed sentence.
- `work.js` `stepRow`: a muted TYPE.xs line under the step title from `skillsLine(s.skills)`; nothing when it is null.
- `test/skills-view.test.mjs`: 5 tests.

## Brief Check
1. "Pinned by you", the hint and "Picked for the current task" with the three states: met. The states are unit-tested (`pickedFor`) and checked with `herdr-app check`, but not drawn live.
2. Search above the chips when there are more than 8: met (`filterTools` tested; the field shows only above `SEARCH_OVER`).
3. The supported list comes from `bh tools --list`, with the fallback: met. Today the command answers with a harness object, so `supportedNames` returns null and the fixed text shows.
4. Step skills line: met in the UI (`skillsLine` tested). It shows only once `bh task list --all --json` carries `steps[].skills` (board #10).
5. Pure helpers tested: met.
- npm test: 286 pass, 0 fail. herdr-app check: passed. tsc: no TS2304 or TS2552 outside `engine/`.

## Verification
- `node --test test/skills-view.test.mjs`: 5 pass
- `npm test`: pass 286, fail 0
- `~/.local/bin/herdr-app check mods/bot-herdr`: check passed
- `tsc … | grep -E "TS2304|TS2552" | grep -v engine/`: empty

## Design choices
- picked chips: CHIP height, SPACE[3] padding, SIZE.nested radius, c.well, TYPE.xs, c.muted; not clickable
- search field: the dialog's existing `textField`
- step skills line: TYPE.xs, c.muted, indented to the step text like the report summary, one line truncated

## Notes
- The MCP section keeps its old hint ("Only the ticked ones." / "None ticked: …"), because the new hint is about skills the classifier adds. Tell me if MCP should get the new one too.
- A picked list that is empty shows "Nothing extra for this task." The brief didn't give a text for that case.

## Knowledge Proposals
- `bh task list --all --json` steps are a projection (n, title, agent, status, started, finished, workedMs, note, report, timeMs, usage). A new step field the Tasks page draws must be added there too, not only in `task show`.
