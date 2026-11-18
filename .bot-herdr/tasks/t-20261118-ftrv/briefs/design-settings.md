## Goal (step 2)
In Settings → Agents, let the user add, edit and remove their own agents. Dev is changing `roster.js` in parallel so `roster()` keeps custom agents (role "custom") after the six built-in roles and `blank()` returns a new one; you build the UI on top of that contract.

## Files
Change: `mods/bot-herdr/settings.js` only. Read (don't change) `mods/bot-herdr/composer.js` for step 5.
Leave alone: `roster.js`, `engine/**`, tests (Dev's).

## What to do
1. `FIELDS` (settings.js ~line 66): add `{ key: "does", placeholder: "One line: what this agent is for (the Orchestrator reads it)" }` after `name`. The field's existing change handler covers it (it trims values other than `name`).
2. Import `blank` from `./roster.js` (line 23).
3. Agents section (~line 565, `section === "agents"`): after the card rows, add one row with `this.button(c, "bh-add-agent", "plus", "Add agent", (_e, cx) => { const list = this.list(); this.save([...list, blank(list, this.known)], cx); cx.notify(); })`.
4. `agentMore(c, id)` (~line 902): when `a.role === "custom"`, put these first: a "Name" label with `this.field(c, inputs.name)`, then a "What it does" label with `this.field(c, inputs.does)`. Keep Arguments, Instructions and the command line as they are. At the end, for custom agents only, add `this.iconButton`-style danger action: use `actionButton(c, "bh-remove-agent-" + a.id, "Remove agent", onClick, { icon: "trash", tone: "danger" })` (check that `trash` exists in `mods/bot-herdr/icons`; if not, use an existing delete-like icon and say which). onClick: `this.save(this.list().filter((x) => x.id !== a.id), cx); cx.notify();`. The dialog already shows "This agent is no longer on the team." after removal.
5. Check, don't change: does an @mention of a custom agent's name in the chat composer reach it? Find how `composer.js` resolves @names (it uses the roster). Report what you found with `path:line`. If it would need a change, describe it in your report and don't make it.
6. Built-in roles: no Name, What it does or Remove controls (their names are fixed).

## Contracts
Custom roster entry: `{ id, role: "custom", name, harness, model, effort, args, instructions, does, lead: false }`. Add with `save([...list, blank(list, known)])`; remove with `save(list.filter(a => a.id !== id))`. Only role "custom" can be renamed or removed. `roster()` renames clashing names (" 2", " 3"), so the card shows whatever `list()` returns.

## Constraints
settings.js only, no new dependencies, no restyling of existing cards. Follow the existing patterns (`this.button`, `actionButton`, `this.label`, `this.field`). Functions stay at or under 20 lines.

## Done when
- `herdr-app check mods/bot-herdr` passes.
- `npx -y -p typescript@5 tsc -p mods/bot-herdr/jsconfig.json --noEmit` shows no new TS2304/TS2552 in settings.js.
- `bh check` passes.
- Your report lists `path:line` for the Add agent button, the custom-only dialog fields and the Remove action, and answers step 5.

## If stuck
If the code doesn't match this brief (e.g. `actionButton` takes other options, no dialog for the card), stop that part and report it; don't invent a workaround. If `roster()` still drops custom agents when you test, that's Dev's part in progress: note it, don't change roster.js.
