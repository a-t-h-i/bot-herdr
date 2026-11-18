## Summary
PASS — custom agents are kept in the roster with unique names and a 'does' line, appear in the Orchestrator's team list and hc templates, spawn with a worktree and the worker role, and Settings can add, edit and remove them.
Two minor findings that don't block: a removed or renamed custom agent leaves its old hc template behind, and an odd name can produce an odd handle.

## Changes
None (review only). Reviewed: mods/bot-herdr/roster.js, settings.js, engine/lib/team.mjs, engine/bh.mjs:676, test/roster.test.mjs. composer.js, toast.js and gpui-kit.d.ts belong to another task and were left alone.

## Brief Check
1. roster order + unique names — met. `roster.js:136-164`: the roles get their slugs and aliases first, then `uniqueName` runs in saved order. The new test `test/roster.test.mjs:41` covers role-name, alias and earlier-agent clashes. In the smoke test a custom agent named "QA" became "QA 2", listed after the six roles.
2. 'does' in the brief team list and the template description — met. In the smoke test the Orchestrator's brief listed "- Docs Helper (`bh spawn docs-helper`): Keeps the docs in step with the code.". The written template's frontmatter had `description: Keeps the docs in step with the code.`. An agent with no 'does' falls back to "an agent the user added."
3. spawns like Dev — met. `bh.mjs:676` sets `editing` for the `custom` role, which gives it a worktree. `team.mjs:89` adds the worker role. In the smoke test the child brief included worker.md for docs-helper and dev but not for research.
4. Settings — met by inspection and `herdr-app check`; nothing was rendered. Add agent is at `settings.js:569`. Name, What it does and Remove are gated on `role === "custom"` (`settings.js:912-920`). Built-in roles also can't be renamed in practice, because `roster()` forces their names.
5. @mention — met by Design's reading of `composer.js:435-450, 597-631`. Mentions use the same `roster()` output, which now includes custom agents. `findMember("@docs-helper")` resolved in the smoke test.

Focus areas: there are no security boundaries or locks involved (local settings only). Worktree isolation for custom agents reuses Dev's path, including the "already has an open worktree" guard. Old saved rosters stay compatible: a legacy custom lead is still taken as the Orchestrator, and agents saved without a 'does' value get `does: ""`.

## Findings
- [minor] A removed or renamed custom agent keeps its old hc template — `engine/lib/team.mjs:211-215`. Expected: after Remove, or a rename, the agent no longer shows in hc's template list. Observed: `sync()` only writes templates for the current roster and never deletes stale ones that carry MARK, so `<old-slug>.md` stays and hc can still start it (its brief then fails at `bh agent <old-slug>`). To reproduce: add an agent, save, remove it, then list the herdr-core templates folder. Fix: in `sync()`, delete marked templates whose names are not in the roster.
- [minor] A name made only of punctuation slugs to "agent", and its renamed copy can get a handle like "2" (`slug("??? 2") === "2"`). Cosmetic.
- [info] Design noted that the Name input keeps what was typed when the roster shows "Design 2" (design-agents report, Notes).

## Verification
- `node --test test/roster.test.mjs` — 13/13 pass
- `npm test` — 249 tests, 248 pass, 0 fail, 1 skipped (the task receipt's diff hash 582f85830faf differs from tree 4bf4d4ab…, so it was re-run)
- `herdr-app check mods/bot-herdr` — check passed
- Smoke script (temp BH_APP_HOME/XDG_CONFIG_HOME, removed afterwards): `team.team()`, `brief()` in lead and child mode, `findMember`, `writeTemplate` with two custom agents — all as described above
