## Summary
Renamed `/bh-knowledge` to `/bh-info` (route, error, comment, test) and added eight theme files — Harbor, Fern, Plum and Dune, each light and dark — with `install.mjs` now copying every `themes/*.json`.
All eight pass a shape + contrast check (fg≥7, muted≥4.5, accent_ink≥4.5, accent≥3) and reach `palette()` unchanged, so herdr's own accent survives into our tokens. `node --test test/*.test.mjs`: 144 pass, 0 fail, 1 skipped; `bh check` PASS.

## Changes
- `mods/bot-herdr/route.js`: command `bh-info` (same hint/colour), branch compares `"bh-info"`, error `"Type a question after /bh-info"`, comment updated; internal step `do: "knowledge"` unchanged.
- `mods/bot-herdr/composer.js:901`: comment says `/bh-info`.
- `test/route.test.mjs:127-133`: `/bh-info`, chip `cmd:bh-info` end `8`, `slashRows("bh-i")[0].name === "bh-info"`.
- `themes/{harbor,fern,plum,dune}-{light,dark}.json`: new, same shape as `bot-herdr-dark.json` (top-level `background/foreground/selection/cursor/ansi[16]` + `colors` with the 13 keys), all opaque 6-digit hex, names not starting with `bot-herdr` so `ownTheme` leaves them to `palette()`.
  - Harbor: slate-blue neutrals; accent `#1d4ed8` (light) / `#93c5fd` (dark).
  - Fern: green-grey neutrals; accent `#166534` / `#4ade80`.
  - Plum: violet-grey neutrals; accent `#5b21b6` / `#c4b5fd`.
  - Dune: sand neutrals; accent `#92400e` / `#f59e0b`.
  - Dark ladder follows the brief: canvas darkest → chrome → surface → raised; light: canvas tinted near-white, white surface, near-black foreground.
- `install.mjs:9,40-44`: `readdirSync` added to the `node:fs` import; copies every `themes/*.json` (sorted) and prints `themes   <dir> <names joined with ", ">`.
- `README.md:25`: "…its Claude light and dark themes plus Harbor, Fern, Plum and Dune (each light and dark), …".
- `.bot-herdr/tmp/theme-check.mjs`: checker (shape, the four ratios, `palette().accent === file accent` with herdr-style flattening).

Note: accents are the same family but darker in light mode (`#3b82f6` cannot hold 4.5:1 against the light hover/well surfaces `palette()` repairs against — #3b82f6 measures 3.7–4.1), and lighter in dark mode, so `onAll()` in `palette()` leaves them untouched.

## Brief Check
Step 1
- `route.js:16` named `bh-info`, hint and colour kept — met.
- `route.js:178-180` compares `"bh-info"`, error text and comment — met; `do: "knowledge"` unchanged.
- `composer.js:901` comment — met.
- `test/route.test.mjs:127-133` — met (`cmd:bh-info`, range end 8, `slashRows("bh-i")[0]` is `bh-info`; nothing else matches `bh-i` first, `rank()` puts the one prefix match ahead).
- `grep -rn "bh-knowledge" mods test README.md install.mjs` — empty (exit 1).
Step 2
- 8 files, exact shape, opaque hex — met (checker prints PASS for all 8).
- Light/dark ladder and tinted neutrals, accents in the requested families — met.
- Contrast: fg on surface 14.57–18.22, muted 5.46–7.06, accent_foreground on accent 6.70–10.84, accent on surface 6.70–9.71 — met.
- ansi 0-15 in the usual order, pattern of the existing light/dark files — met.
- `install.mjs:40-44` lists every `*.json` via `readdirSync`, prints names joined with `, ` — met (found 10 files).
- `README.md:25` phrase — met.
- Constraints: no new dependencies, no edits to look.js/theme.js/layout, install.mjs not run, nothing committed.

## Verification
- `node .bot-herdr/tmp/theme-check.mjs` — 8/8 PASS; palette accent equals file accent for each.
- `npm test` (`node --test test/*.test.mjs`) — tests 145, pass 144, fail 0, skipped 1.
- `bh check` — PASS (lint, typecheck, tests).
- `npx -y -p typescript@5 tsc -p mods/bot-herdr/jsconfig.json --noEmit` — no TS2304/TS2552 outside `engine/` (all 17 hits are in `engine/`).
- `grep -rn "bh-knowledge" mods test README.md install.mjs` — no output.
- `node -e "…readdirSync('themes')…"` — 10 names (bot-herdr pair + 8 new).

## Knowledge Proposals
- A herdr theme file's accent must clear 4.5:1 against the lightest light-mode surface / darkest dark-mode surface (herdr's `selected`, `hover`, `input`), because `palette()` repairs the accent with `onAll()` and a repaired accent no longer equals the theme's own.
- The `#3b82f6`-family accents requested for light themes cannot reach 4.5:1 on a tinted light `hover`/`well`; use the shade-700/800 member of the same family.

## Script Proposals
- `theme_check` — purpose: verify a herdr theme file's shape, contrast ratios and `palette()` result; usage: `bh scripts run theme_check <theme.json>…`. Current version lives at `.bot-herdr/tmp/theme-check.mjs`.

## Blockers
None.
