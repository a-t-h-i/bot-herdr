## Goal (step 1)
Bring back the user's own ("custom") agents: the roster keeps them, they have a one-line "what it does", and the engine briefs, spawns and templates them. The user sets them up in Settings (Design does that UI in parallel, in settings.js); they apply to every project; the user can @mention them and the Orchestrator may delegate to them.

## Files
Change: `mods/bot-herdr/roster.js`, `mods/bot-herdr/engine/lib/team.mjs`, `mods/bot-herdr/engine/bh.mjs` (one line, see 5), `test/roster.test.mjs`.
Leave alone: `mods/bot-herdr/settings.js`, `composer.js`, and every other mod file (Design's).

## What to do
1. `roster.js` `clean()` (~line 112): add `does: String(a.does ?? "").trim(),`.
2. `roster.js` `roster()` (~line 132): after building `stock`, append the entries with `role === "custom"` that `take` did not use, in saved order, each with `lead: false`. Replace the comment "The team is the six roles: agents of the user's own aren't kept (nor reachable)." with one saying that the user's own agents follow the six roles. Make each custom name unique: when `slug(name)` equals a role's `slug(name)`, any role alias, or the slug of an earlier entry, append " 2", " 3"… (the first free one). Keep the function at about 20 lines; extract a helper `uniqueName(name, taken)` if needed.
3. `roster.js` `blank()`: add `does: ""` to the returned entry.
4. `team.mjs`:
   - line ~102 (members list) and lines ~189 and ~195 (template `description`): use `roleOf(a.role)?.does ?? (a.does || "an agent the user added.")` (template: `a.does || \`${agent.name}, an agent set up in bot-herdr.\``). Extract one helper `doesOf(agent)` in team.mjs and use it in all three places.
   - `brief()` line ~86: a custom agent that is not in panel/review mode also gets `role("worker")` (custom agents edit files like Dev): change the condition to `(r?.edits || agent.role === "custom") && !lead`.
5. `bh.mjs` line ~676: `editing` must also be true for a custom agent: `(Boolean(roleOf(a.role)?.edits) || a.role === "custom")`. Look for any other `roleOf(x.role)?.edits` use in `engine/` and apply the same rule there; list them in your report.
6. `test/roster.test.mjs`: update the "the team is the six roles only" test: the custom "Reviewer" is now kept (list.length 7, last entry role "custom", name "Reviewer", lead false) and `findAgent(list, "reviewer")?.name === "Reviewer"`. Add one test: a custom agent named "Dev", one named "frontend" and two named "Helper" come back as "Dev 2", "frontend 2", "Helper", "Helper 2"; and `blank()` has `does: ""`.

## Contracts
Custom roster entry: `{ id, role: "custom", name, harness, model, effort, args, instructions, does, lead: false }`. Settings adds with `save([...list, blank(list, known)])`, removes with `save(list.filter(a => a.id !== id))`, and edits `does` like `instructions`.

## Constraints
No new dependencies, no other files, no refactors beyond the above. Don't change the six roles' behaviour.

## Done when
- `node --test test/roster.test.mjs` passes, and `npm test` passes.
- `bh check` passes.
- `node -e` importing `roster` from `mods/bot-herdr/roster.js` with a saved custom agent returns 7 entries.
- `grep -n "aren't kept" mods/bot-herdr/roster.js` finds nothing.

## If stuck
If anything doesn't match this brief (a line moved, another place drops custom agents), stop that part and report it; don't invent a workaround.
