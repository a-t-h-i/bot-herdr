## Goal
Step 5 of task t-20261118-ftrv: in Settings → Agents, an agent's **More** sheet lets the user tick which skills and MCP servers that agent may use, from what its harness has installed. No presets. Dev builds `bh tools` and the launch side in parallel against the contract below.

## Files
Change only `mods/bot-herdr/settings.js`: `agentMore` (settings.js:908), plus a small cache and fetch helper next to `MODEL_CACHE`/`fetchModels` (settings.js:60, :428). Reuse `chip(c, id, label, on, onClick)` (settings.js:1045) as used in `classifierMore` (settings.js:932), and the Refresh pattern of the model list (`ask`/`applyRefresh`, settings.js:411-448).
Leave alone: `roster.js` and everything under `engine/` (Dev's), `composer.js`, `toast.js`, `gpui-kit.d.ts`.

## Contract (do not change it)
- Roster entry has `skills: string[]` and `mcp: string[]` (names). Empty = no restriction (everything installed). Non-empty = only those. Dev makes `clean()` keep them; you save with the existing `this.save(list, cx)` mapping the entry to `{...a, skills: [...]}`.
- `bhJson(["tools", harness])` (add `"--refresh"` for Refresh) returns `{harness, supported, skills: [{name, description, source}], mcp: [{name, source}], error?}`. Until Dev's step lands, the command may fail: treat a failure like `{supported:false, skills:[], mcp:[], error}`.

## What to do
1. `TOOLS_CACHE = new Map()` keyed by harness; `fetchTools(harness, refresh)` via `bhJson(["tools", harness, ...(refresh ? ["--refresh"] : [])], { timeout: 60000 })`. Fetch when the More sheet opens for an agent whose harness isn't cached; `cx.notify()` when it arrives.
2. In `agentMore`, after the Instructions field and before the argv line, add two groups, each `this.label(c, …)` then a wrapping row of chips:
   - "Skills": one chip per `skills[].name`, `on` = included in `a.skills`. Clicking toggles the name in `a.skills` and saves.
   - "MCP servers": same for `mcp[].name` and `a.mcp`.
   - Under each label, one muted `TYPE.xs` line: "None ticked: it can use all of them." when the list is empty, else "Only the ticked ones."
3. A Refresh button next to the "Skills" label (same look as the model list's refresh) refetches with `--refresh`.
4. States: while loading, a muted "Looking for installed skills and MCP servers…"; `supported:false` → muted "<Harness name> isn't supported yet: Claude Code, Codex and OpenCode are." and no chips; an `error` → that text muted; supported but a list empty → "None installed." under that group.
5. A ticked name no longer installed still shows as a chip (on), so the user can untick it.

## Constraints
No new dependencies, no other files, no restyling of other sections. Keep functions at 20 lines or less; extract a `toolChips(c, a, kind, items)` helper for the two groups instead of repeating it.

## Done when
- With `bh tools` not yet available, the More sheet shows the unsupported/error text and nothing crashes.
- With it available, ticking chips updates the stored roster's `skills`/`mcp` (visible in the saved settings) and survives reopening the sheet.
- `herdr-app check mods/bot-herdr` passes; `npx -y -p typescript@5 tsc -p mods/bot-herdr/jsconfig.json --noEmit` shows no new TS2304/TS2552 in settings.js; `bh check` passes.

## If stuck
If `chip()` can't wrap or the More sheet has no room, stop and report with what you saw; don't invent a new control.
