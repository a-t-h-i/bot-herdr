## Summary
An agent's More sheet now has Skills and MCP servers chip groups (from `bh tools <harness>`), with Refresh, loading/unsupported/error/empty states; ticking saves `skills`/`mcp` on the roster entry.
Built to contract #8; `bh tools` doesn't exist yet in this tree, so the sheet currently shows the error text.

## Changes
- `mods/bot-herdr/settings.js`
  - `TOOLS_CACHE`, `TOOLS_ASKING`, `NO_TOOLS`, `fetchTools(harness, refresh)` next to `MODEL_CACHE`; a failed `bhJson` becomes `{harness, supported:false, skills:[], mcp:[], error}`.
  - `Settings.loadTools(harness, cx, refresh)`: one fetch per harness per session (again on Refresh); `cx.notify()` when it arrives.
  - `Settings.toolsMore(c, a)`: states plus the two groups; `Settings.toolChips(c, a, kind, items)`: the note line, "None installed.", wrapping `chip()` row; toggling goes through `this.change(a.id, {[kind]: [...]})` → `save()`.
  - `agentMore`: `toolsMore` sits between Instructions and the argv line.
  - `MoreSheet.init`: starts `loadTools` for an agent sheet (using the dialog's cx, so its `notify` redraws the sheet). This is the one line outside the named functions; it's where "fetch when the sheet opens" can get a cx.

## Brief Check
- No `bh tools` yet → error text, no crash: met. `bh tools claude --json` exits non-zero ("Unknown command tools"), `bhJson` returns null, and the sheet shows "Couldn't ask which skills and MCP servers are installed." I didn't draw it in the app.
- Ticking updates the stored roster and survives reopening: met in code, not run. The chip state comes from `a.skills`/`a.mcp` via `list()` (the shared roster), and is saved through `change` → `save` → `bh team save`. It only persists once Dev's `clean()` keeps the fields.
- `herdr-app check mods/bot-herdr`: passed. tsc shows no TS2304/TS2552 in settings.js. `bh check` passed.

## Verification
- `herdr-app check mods/bot-herdr` — check passed
- `npx -y -p typescript@5 tsc -p mods/bot-herdr/jsconfig.json --noEmit | grep settings.js | grep TS2304|TS2552` — nothing
- `bh check` — PASS: 248 tests pass, 1 skipped

## Design choices
- Refresh: `actionButton` `refresh-cw`, tone quiet (same as the pick list's). It sits in a row beside the "Skills" label, not as the label's `right`, because the label is 22px high and the button is 28px.
- Chip ids: `bh-skills-<name>` / `bh-mcp-<name>`
- "None installed.": `TYPE.sm`, muted. The notes are `TYPE.xs`, muted.
- An `error` is checked before `supported`, so a failed call shows its error rather than the unsupported line.

## Knowledge Proposals
- `herdr-app check mods/bot-herdr` rewrites `mods/bot-herdr/gpui-kit.d.ts` in a worktree. Restore it with `git checkout -- mods/bot-herdr/gpui-kit.d.ts` before handing off. I did that here.
