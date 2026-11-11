Task t-20261111-b2gp, step 4. Plan: bh plan show p-20261111-9dkc. Your panel proposal: .bot-herdr/reports/qa-panel.md ("How to check contrast across every herdr theme"). Board contract #2 describes the repaired palette (bh board read t-20261111-b2gp).

GOAL
Lock in the contrast fix: one test over every herdr theme plus our own light/dark pair, so a later change (the visual refresh comes next) cannot lower a ratio.

FILES
Create: test/fixtures/herdr-themes.json, test/contrast.test.mjs. Leave every other file alone (Design is editing mods/bot-herdr/*.js right now; Dev is editing mods/bot-herdr/engine/**).

WHAT TO DO
1. Build test/fixtures/herdr-themes.json: an array of { name, light, colors } where colors uses herdr's flattened names exactly as theme() returns them (background, canvas, chrome, surface, popover, raised, hover, selected, border, input, foreground, muted, dim, accent, accent_foreground, solid, solid_foreground, ansi0..ansi15). Sources, in order:
   a. The four theme files in C:/Users/athenkosi.hlubi/.config/herdr-app/themes/*.json and the repo's themes/*.json: map each file's top-level and `colors` block to those names (a `colors` block wins over top-level, like herdr; a file with no `colors` block gets only what its top level gives, which is the case the palette must handle).
   b. herdr's built-in presets (graphite, ink, moss, paper): find their colour values in herdr's docs (C:/Users/athenkosi.hlubi/.config/herdr-app/AGENTS.md) or in strings of the installed binary (%LOCALAPPDATA%/Programs/herdr-app/herdr-app.exe). Use only values you can read verbatim; add a "source" field per entry. If a preset's values cannot be found, leave it out and list it in your report. Never invent colours. The graphite fixture in test/themes.test.mjs is acceptable as graphite's source if nothing better exists.
2. test/contrast.test.mjs: one parameterised loop over every fixture entry plus { LIGHT } and { DARK } from mods/bot-herdr/look.js, computing palette({ dark: !light, theme: name }, colors) the way test/palette.test.mjs does. Assert with contrastOf, each failure message naming theme, pair, colours and ratio:
   - ≥ 4.5 on both fill and ground: ink, muted, faint, accent, danger, stop, info, success, warning, and agentInk(c, n) for n in orchestrator, dev, design, qa, research, scout.
   - ≥ 4.5: accentInk on accent.
   - ≥ 3: edgeDark on fill.
   - bubbleEdge on bubble within ±0.05 of our own pair's ratio for that polarity (LIGHT 1.22, DARK 1.43, computed from LIGHT/DARK in the test, not hard-coded).
3. Run it. It must pass against the current working tree (Design finished steps 1-2). If a pair fails, do not change look.js: report the pair under Findings.

DONE WHEN
- `node --test test/contrast.test.mjs` passes and runs in under 1 s; `bh check` passes.
- Your report lists every fixture entry with its source and any preset left out.

IF STUCK
Stop that part, finish the rest, and report it. Do not commit.
