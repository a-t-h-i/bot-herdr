## Summary
Settings → Agents now adds custom agents (primary "Add agent" row under the cards), edits their Name and What it does in the More dialog, and removes them with a danger action there. Built-in roles keep exactly the old dialog.

## Changes
- `mods/bot-herdr/settings.js:65` — `FIELDS` gains `{ key: "does", placeholder: "One line: what this agent is for (the Orchestrator reads it)" }` after `name`; the existing change handler trims it and saves `does` onto the entry.
- `mods/bot-herdr/settings.js:23` — imports `blank` from `./roster.js`.
- `mods/bot-herdr/settings.js:569-573` — Add agent row after the card rows in `section === "agents"`: `this.button(c, "bh-add-agent", "plus", "Add agent", …)` → `this.save([...this.list(), blank(this.list(), this.known)], cx)`. The card appears on the next render: the render-time roster check (`settings.js:509-515`) calls `sync()`, which builds the new entry's inputs.
- `mods/bot-herdr/settings.js:913-916` — custom-only Name and "What it does" fields, above Arguments/Instructions; Arguments, Instructions and the command line unchanged for every role.
- `mods/bot-herdr/settings.js:923-929` — `removeAgent(c, a)`: `actionButton(c, "bh-remove-agent-" + a.id, "Remove agent", …, { icon: "trash", tone: "danger" })`, `this.save(this.list().filter((x) => x.id !== a.id), cx)`; wired at `settings.js:920` for custom only. `mods/bot-herdr/icons/trash.svg` exists, so no substitute icon.
- Built-in roles: `custom = a.role === "custom"` (`settings.js:912`) gates all three, so they get no Name, What it does or Remove; their "This agent is no longer on the team." path is unchanged.

## Brief Check
- "Add agent" control with the brief's exact id/handler — met (`settings.js:569`), only the "agents" section, after the cards.
- Custom dialog fields first, Arguments/Instructions/command line kept — met (`settings.js:914-919`).
- Remove action for custom agents only, trash icon, danger tone, filter-by-id save — met (`settings.js:920,923-929`).
- Built-in roles unchanged — met (gate at `settings.js:912`).
- Step 5 answered — below.

## Verification
- `herdr-app check mods/bot-herdr` — `check passed: mods/bot-herdr`.
- `npx -y -p typescript@5 tsc -p mods/bot-herdr/jsconfig.json --noEmit` filtered to settings.js — no TS2304/TS2552 (jsconfig itself is far from clean; pre-existing TS7006/TS7031 etc. throughout work.js/working.js/settings.js).
- `bh check` — FAIL on an unrelated Windows flake: `test/agents-reply.test.mjs:24` "every turn's reply is logged…" dies with `EPERM: operation not permitted, rename …\t9.jsonl.<pid>.tmp -> …\t9.jsonl` at `engine/lib/core.mjs:82` (`writeText`); 247 pass, 1 skip. Same failure twice in the full suite; `node --test test/agents-reply.test.mjs` alone — 5/5 pass. Not caused by settings.js (no engine/test changes here).
- Roster contract smoke test (`node --input-type=module`, Dev's current roster.js): `blank([], known)` → `{ id, role: "custom", name: "Agent 1", …, does: "" }`; `roster([blank], known)` → roles `orchestrator,design,dev,qa,research,scout,custom`; a custom agent named "Design" comes back as "Design 2"; removing it leaves 7 (six roles + 0). So add/edit/remove reach a roster that keeps them.
- Visual: no rendered proof — `herdr-app status` says "the window hung up" (app not running) and starting the desktop window is out of bounds here; the UI was checked through `herdr-app check` only.

## Step 5 — @mention of a custom agent (read-only finding)
It already reaches it; no change needed.
- `composer.js:267-269` — `roster()` = `roster(shared(ROSTER_KEY), known)`, same roster Settings writes.
- `composer.js:435-450` — `startables()` maps every roster entry with `!a.lead && runnable(a, known) && !runningAs(...)` to a start row `{ name: a.name, handle: slug(a.name), run: argvOf(a, known), … }`; custom entries pass the same filter (role is irrelevant there).
- `composer.js:597-608` — `mentionContext()` passes those as `known` to `mentionRows` (`route.js:70`), which turns each into a `kind: "start"` row (`route.js:112-121`); `composer.js:594` renders them.
- `composer.js:610-613` — `mentionMatch(word)` resolves a typed `@name` against those rows, and `composer.js:616-631` (`tokenizeTyped`) converts it to the agent's token.
- Running custom agents are addressed by `names()` (`composer.js:456-466`), which iterates `this.roster()` too, so a running one resolves as `kind: "agent"`.
Caveat: a custom agent whose harness is not installed is not offered (same rule as the built-in roles).

## Notes
- Clashing rename: if the user renames a custom agent to a built-in's name, `roster()` returns "Design 2" and the card shows it, but the dialog's Name input keeps what was typed (`sync()` only re-syncs `model`, deliberately, so typing isn't fought). Cosmetic; say the word and I'll re-seed the name field on dialog open.
- `bh check` red is the EPERM harness flake above, not a code failure.
