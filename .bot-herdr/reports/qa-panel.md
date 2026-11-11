## Status
OPEN

## Questions
1. When a herdr theme's own colour cannot reach 4.5:1 as text, what should the mod do?
   - Raise every text token — ink, muted, faint, accent and the accent label are all mixed toward the ink until they reach 4.5:1; quiet text becomes darker/lighter than the theme author chose
   - Raise body text only — ink and muted reach 4.5:1; faint (49 uses of hint text) keeps the theme's own colour even when it is under 3:1
   - Raise only what is unreadable — leave every theme colour untouched and fix only pairs under 3:1 (today that is faint on fill in win98 at 2.17:1 and on graphite at 2.70:1), so muted and accents stay at 3–4.5:1
2. If "Attach document…" cannot open an OS file dialog on Windows, which fix do we build?
   - Repair the OS dialog — keep PowerShell/zenity/osascript, give the dialog an owner window and show an error when it fails, so the person sees why (should also fix macOS/Linux)
   - Browse inside the app — a picker view in the composer that lists folders and files and attaches the chosen ones; no OS dialog at all, same on every platform
   - Folders only — use herdr's native `pickFolder` for everything and drop "Attach document…" from the menu

## Notes

### What coverage exists today (all of it)
- `test/themes.test.mjs:9-22` — own theme returns the LIGHT/DARK constants; one Graphite fixture maps ground/fill/ink/accent/danger and `mix`.
- `test/palette.test.mjs:1-20` — for exactly two themes (win98, graphite) asserts `edge` and `bubbleEdge` sit at 1.3–1.6:1 on their fill and `edgeDark` ≥ 3:1. **No test asserts a single text ratio** (ink, muted, faint, accent, accentInk, danger) and no test covers a third theme.
- Attachments: `test/route.test.mjs:98` covers `messageText("look", ["/x.png","/y"])` only. Nothing covers `pickFiles` (`mods/bot-herdr/composer.js:521`), `addFiles` (`composer.js:481`), `fromClipboard`/`previews` (`mods/bot-herdr/media.js:66,72`), or the Windows escape path. `test/files.test.mjs` is about markdown file links in the feed, unrelated to attaching.
- So all three parts of the ask are effectively untested at the point where they broke.

### Measured contrast failures (evidence, computed with the repo's own `contrastOf`)
Ran `palette()` over each installed theme file plus the two look.js constants; pairs are the tokens views actually use (`grep` counts: text `muted` 67×, `faint` 49×, `ink` 46×, `accent` 12×, `accentInk` 8×).

| theme | pair | ratio |
|---|---|---|
| win98 | `faint` on `fill` (#808080 on #dfdfdf) | 2.96 ✗ |
| win98 | `faint` on `ground` (#808080 on #c0c0c0) | 2.17 ✗ |
| graphite | `muted` on `fill` (#80838a on #2b2d31) | 3.56 ✗ |
| graphite | `faint` on `fill` | 2.70 ✗ |
| atom-one-dark | `muted` on `fill` (derived) | 3.56 ✗ |
| atom-one-dark | `accent` on `fill` (falls back to our Claude orange) | 4.24 ✗ |
| atom-one-dark | `accentInk` on `accent` (#ffffff on #d97757) | 3.12 ✗ |
| atom-one-dark | `danger` on `fill` | 4.14 ✗ |
| default LIGHT (own theme) | `faint` on `fill` (#918f8a on #ffffff) | 3.23 ✗ |
| default LIGHT | `accent` on `fill`, `accentInk` on `accent` | 3.90 ✗ |
| default DARK (own theme) | `faint` on `fill` | 3.83 ✗ |
| default DARK | `accentInk` on `accent` (#ffffff on #d97757) | 3.12 ✗ |
| default DARK | `stop` on `fill` | 3.21 ✗ |

So the complaint is not only about built-in themes: the default look fails WCAG AA for the send-button label, the faint hint text and the stop button. Any fix must cover `LIGHT`/`DARK` constants too (`look.js:3-55`), not just `palette()`'s derived branch.

### Where the fix belongs (for the owning agent)
- `mods/bot-herdr/look.js:191-211` builds every token; `muted` (`:198`) and `faint` (`:199`) are taken straight from `t.muted`/`t.dim` or mixed to a fixed 0.35/0.5 with no contrast check, while `readable()` at `look.js:112-127` already has exactly the "keep the hue, move toward ink until 4.5:1" machinery. Reusing it for muted/faint/accent is the smallest correct change.
- `accentInk: t.accent_foreground ?? base.accentInk` (`look.js:204`) ignores that herdr exposes `solid`/`solid_foreground` ("a primary button", `~/.config/herdr-app/AGENTS.md:975-977`) and that white on our own orange accent is 3.12:1. Fixing the label means either using the theme's `solid_foreground` or deriving the label colour like `readable()` does.
- `edge`/`bubbleEdge` are already constrained (`look.js:143-170,194-195,209`) and hold 1.41–1.45 on fill for win98 and atom-one-dark, so the existing palette test's `edge` assertions are the only thing behaving.

### Theme-fidelity risk the plan must not miss
`themes/atom-one-dark.json` (and any theme file with only the top-level `background/foreground/selection/cursor/ansi`) has **no `colors` block**. In `palette()` that makes `fill` fall back to our `DARK.fill` `#30302e`, `accent` fall back to our Claude orange, and `muted`/`faint` fall back to mixes — measured: an Atom-dark card at `#30302e` on an Atom background `#21252b`, with the Claude accent. That is the "looks wrong under a built-in theme" half of the complaint, and it is invisible to the current tests.

### How to check contrast across every herdr theme (proposal)
Problem: built-in presets (Graphite, Ink, Moss, Paper, anything the binary ships) are **not** files — `~/.config/herdr-app/themes/` holds only 4 JSON files; the rest come from `themes()` inside the app (`herdr.d.ts:279-281`). A node test cannot enumerate them.
Decision: generate one snapshot fixture and test it offline.
- Add `test/fixtures/herdr-themes.json`: one entry per theme, `{ name, light, colors }` exactly as `themes()` returns it (flattened names, `ansi0..15`). Generate it once from inside the app (temporary `console` dump in the mod or a dev-only Settings action), commit it, and refresh it when herdr adds themes.
- Add `test/contrast.test.mjs`: for every entry, compute `palette({dark: !light, theme: name}, colors)` and assert per-role minimums in one parameterised `for` loop — `ink` on `fill` and `ground` ≥ 4.5, `muted` on `fill`/`ground` ≥ 4.5 (or ≥ 3 if the quiet-text answer above says so), `faint` on `fill`/`ground` per the same answer, `accentInk` on `accent` ≥ 4.5, `stop`/`danger`/`warning` on `fill` ≥ 4.5 as text, `edge`/`bubbleEdge` 1.3–1.6, `edgeDark` ≥ 3. Plus the same loop over `LIGHT` and `DARK`, since they fail too.
- This is one test file, ~1 loop per role, and it turns the machine-specific theme list into CI-covered behaviour. It also catches the `no colors block` fallback case as soon as a new fixture is dumped.
- Do **not** have the test read `~/.config/herdr-app/themes/*.json` at run time: the path is per-machine (`$HERDR_APP_HOME`), and `test/` already runs with synthetic `BH_APP_HOME` dirs (`test/engine.test.mjs:11,25`). Keep the fixtures in-repo.

### Attachment bug — what I could and couldn't verify
- `mods/bot-herdr/composer.js:521-541` is the only "Attach document…" path: on Windows it spawns `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; … $d.ShowDialog() -eq 'OK' …"`. On macOS osascript, else zenity/kdialog. `exec` is `herdr.d.ts:10-15`, timeout capped at 600000 ms — the 600000 passed at `composer.js:533` is exactly at the cap.
- The host exposes **no file picker** to mods: `herdr.d.ts:37-39` has `pickFolder` only, and the `feedbackPickImages` helpers (`herdr.d.ts:323-326`) are frame-only. So there is nothing to switch to without either repairing the spawned command or building an in-app browser. That is why question 2 decides the shape.
- Verified on this machine: `powershell.exe` exists, is STA, and WinForms loads (`Add-Type System.Windows.Forms` + `[Screen]::PrimaryScreen` succeeded). So "PowerShell is missing / MTA" is **not** the cause here. Remaining plausible causes: the dialog opens with no owner window (behind the herdr window — user-visible as "it doesn't open"), or herdr's `exec` child has no interactive window station, in which case `ShowDialog` returns without ever drawing and `r.code === 0` with empty stdout makes `composer.js:536` return silently — no message, no attachment, nothing. That silent path is a real defect either way: a failed or cancelled pick is indistinguishable from success.
- I did not run the dialog (headless turn, and it would block on a human click), so the root cause still needs one observation from the person: does the menu item do nothing at all, show no dialog, or show a dialog behind the window? `[INFERENCE]` for causes; the silent-return defect is read from code.
- Tests that can guard this without the OS: extract the command construction (`pickerCommand(platform)`) and its output parsing (`parsePickerOutput(stdout)`) into pure functions and test the split/trim/filter (`composer.js:533-536` currently does `r.stdout.split(/\r?\n/).map(trim).filter(Boolean)`) plus the "code 0 but no paths" outcome surfacing a message. Do not mock `exec` to walk the whole spawn chain.

### Test suite: slow and flaky
- `npm test` → 100 tests, 99 pass, 1 skipped, 0 fail, **17.2 s** (`node --test test/*.test.mjs`). No flakiness seen in this run.
- The 17 s is almost all process spawning: `test/round5.test.mjs:144` git-isolation **5.7 s**, `:176` **2.8 s**, task/plan comment tests **2.2–3.0 s** each. Every one spawns the real `bh` CLI (`round5.test.mjs:134`) and, for git, real `git init/commit/worktree`.
- Fragility, not flake: those tests need `git` and `bh` on PATH and write under `tmpdir()`; `test/headless.test.mjs:107,122,138` uses `setTimeout` to sequence fake harness output — timing-based, could go flaky on a loaded machine.
- One test is skipped because no headless browser is installed (`bh mockup draws a page…`), so mockup drawing — a feature the user can see — is unverified in CI. Worth naming, not fixing here.
- Recommendation: leave the suite shape alone; the contrast test above is additive and takes milliseconds. If the plan needs a faster loop, the lever is `round5`'s git tests, not the rest.

### Part 3 (features review) from QA's seat
- **Cache hit rates are not measurable today.** `runner.mjs` takes `usage` from no harness: `claudeTurn` (`runner.mjs:139-180`), `codexTurn` (`:184-213`), `piTurn` (`:217-236`) parse only text/session/tool events. So any plan that claims better cache hits needs a small addition first — capture `usage` (Claude `stream-json` reports `cache_read_input_tokens`/`cache_creation_input_tokens`) into the session state, then it becomes testable.
- The cache-friendly part already exists and is tested: the brief goes in once, on the first turn, and later turns resume the harness session — `runner.mjs:141-147`, `:191-193`, `:219`, covered by `test/headless.test.mjs:208-231`. Any "token efficiency" change that re-sends the brief per turn would show up there.
- Performance: no timing/benchmark tests exist and none are warranted; `bh check` plus the narrow test is the gate.

### Done, from my seat
Contrast verified by one parameterised test over a committed snapshot of every theme, including the default LIGHT/DARK, and it fails loudly on the 13 pairs in the table above. Attach-document has a test for picker-output parsing and a visible message on failure/cancel, with the OS dialog confirmed by hand on this machine. No new dependency, no new test framework.
