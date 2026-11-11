Task t-20261111-bmde, steps 1 and 2. Repo: C:\Users\athenkosi.hlubi\Desktop\bot-herdr

## Goal
Step 1: rename the chat slash command `/bh-knowledge` to `/bh-info` (same behaviour: asks Scout about the project).
Step 2: add four new herdr themes, each as a light file and a dark file (8 new JSON files), installed by `install.mjs` with the existing two.

## Files
Change: `mods/bot-herdr/route.js` (lines 16, 178-180), `mods/bot-herdr/composer.js:901` (comment), `test/route.test.mjs:127-133`, `install.mjs:40-44`, `README.md:25` (one phrase), and create 8 files in `themes/`.
Leave alone: `themes/bot-herdr-light.json`, `themes/bot-herdr-dark.json`, `layouts/bot-herdr.json`, `mods/bot-herdr/look.js`, `mods/bot-herdr/theme.js`, everything under `.bot-herdr/` and `mods/bot-herdr/engine/`.

## What to do
### Step 1
1. `route.js:16`: name `"bh-info"` (keep hint and colour).
2. `route.js:178-180`: compare against `"bh-info"`; error text `"Type a question after /bh-info"`; update the comment. The internal step `do: "knowledge"` stays as is.
3. `composer.js:901`: comment says `/bh-info`.
4. `test/route.test.mjs:127-133`: every `/bh-knowledge` → `/bh-info`, token id `cmd:bh-info`, chip range end `8` (length of "/bh-info"), `slashRows("bh-i")[0].name === "bh-info"`. Check `slashRows("bh-i")` really returns bh-info first; if another command matches first, report it.
5. `grep -rn "bh-knowledge" mods test README.md install.mjs` must return nothing.

### Step 2
Create these 8 files in `themes/`, copying the exact shape of `themes/bot-herdr-dark.json` (keys `background`, `foreground`, `selection`, `cursor`, 16-entry `ansi`, and `colors` with `canvas, chrome, surface, popover, raised, hover, selected, border, input, muted, dim, accent, accent_foreground`; all opaque 6-digit hex):
- `harbor-light.json` / `harbor-dark.json`: cool slate-blue neutrals, blue accent (~#3b82f6 family).
- `fern-light.json` / `fern-dark.json`: soft green-grey neutrals, green accent (~#16a34a family).
- `plum-light.json` / `plum-dark.json`: muted violet-grey neutrals, purple accent (~#8b5cf6 family).
- `dune-light.json` / `dune-dark.json`: warm sand neutrals, amber accent (~#d97706 family).
Rules: the names must NOT start with `bot-herdr` (look.js `ownTheme` treats any `bot-herdr*` name as the Claude palette and would ignore the colours). Light: canvas/surface near-white with the theme's tint, foreground near-black. Dark: canvas darkest, then chrome, surface, raised, in the same order of steps as bot-herdr-dark. Contrast: foreground on surface >= 7:1, muted on surface >= 4.5:1, accent_foreground on accent >= 4.5:1, accent on surface >= 3:1. ansi 0-15 in the usual order (black, red, green, yellow, blue, magenta, cyan, white, then bright), readable on the background.
6. `install.mjs:40-44`: copy every `*.json` file in `themes/` (use `readdirSync`, already Node built-in; add it to the existing `node:fs` import), and print `themes   <dir>` followed by the copied names joined with `, `.
7. `README.md:25`: "its Claude light and dark themes" → "its Claude light and dark themes plus Harbor, Fern, Plum and Dune (each light and dark)".

## Contracts
None with other domains. Theme files are read by herdr itself; `palette()` in look.js turns any non-bot-herdr theme into our tokens from its colours.

## Constraints
No new dependencies; no changes to look.js/theme.js/layout; no other refactors. Do not commit; do not run install.mjs.

## Done when
- `node --test test/` passes (report the counts).
- Write a short Node check script under `.bot-herdr/tmp/` that loads each new theme file, verifies the shape and the four contrast ratios above using `contrastOf` from `mods/bot-herdr/look.js`, and prints PASS/FAIL per file; all 8 PASS. Also confirm `palette({ dark, theme: "<name>" }, flattenedColors)` returns a palette whose `accent` equals the file's accent (flatten `colors` and `ansiN` like `test/fixtures/herdr-themes.json`).
- The grep in step 1.5 is empty.
- `npx -y -p typescript@5 tsc -p mods/bot-herdr/jsconfig.json --noEmit` shows no new TS2304/TS2552 outside engine/.

## If stuck
If something doesn't match this brief, stop that part, finish the rest, and report it. Don't invent a workaround.
