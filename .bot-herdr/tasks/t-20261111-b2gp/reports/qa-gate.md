## Summary
CHANGES_REQUIRED: the contrast repair misses surfaces the app actually draws (secondary label text below 4.5:1 in every theme, 3.73-4.46), `bh models --command` runs a comma-mangled command, and the chat task widget can no longer scroll. Everything else checked out: all 30 mod files load, `bh check` passes, `bh files`/`bh models` answer in <0.3s, markdown round trips exact, brief rules survived the trim.

## Changes
No production code changed (QA gate). Throwaway scripts under `.bot-herdr/tmp/loadsafe/` (not committed): `scan.mjs` (static undeclared-identifier scan + stubbed dynamic import of every `mods/bot-herdr/*.js`), `ratios2.mjs` (contrast of drawn surface pairs), `roundtrip.mjs` (splitBlocks/joinBlocks), `args.cmd` (fake harness). The base-commit worktree used for the brief comparison was removed.

## Brief Check
The brief's checkpoints, then the plan's acceptance criteria — evidence in `## Verification`.

| Criterion (plan p-20261111-9dkc) | Status |
|---|---|
| 1. `test/contrast.test.mjs` over every theme + own pair, AA text/controls, bubble edge band; the 13+ failing pairs are among those checked | **Partially met** — test passes, but it only checks `fill` and `ground`; pairs the app draws on `well`, `bubble` and `hover` are below 4.5:1 (finding 1) |
| 2. Attach document opens a browser in the pane (folders, up, search, multi-select, error line); a test covers `bh files` | Met for the command and the pure helpers (`test/files.list.test.mjs`, `test/browse.test.mjs`); attach only ever sends `browse.selected` + a typed path (composer.js:606-630). UI not run (not installed) |
| 3. Briefs 19-26 KB -> about 12 KB; `qa-risk` summary + bounded hunks; `pickScripts` one question | Met in substance: child briefs 26.9->13.9, 19.7->13.9, 24.0->13.5 KB; `diffPayload` caps at 12 000 chars (qa-risk.mjs:313); `pickScripts` asks one `choice` (classifier/index.mjs:291-306) |
| 4. `TYPE`/spacing/radii/`MOTION` in look.js; no `text_size`/`rounded`/duration literal outside them | Met for the view files in scope; `indicators.js` still holds literals (minor 3) |
| 5. Knowledge shows loading, not "No notes match." | Met — work.js:990 `knowAll == null` -> stateView loading |
| 6. No scroll area nests in the chat feed; plan and chat near 75 chars | Nested feed scroll removed, but the task widget lost its bound and its scroll (finding 3) |
| 7. Light-mode cards on `fill`, hue only on dot/name/edge, tint <= 0.04; chips the same | Cards met; filter chips use `alpha(hue, 0.1)` in light mode (minor 2) |
| 8. Rendered markdown while editing; save writes exactly what was typed | Met — 12/12 round trips exact incl. CRLF, unclosed fence, blank-only; `saveKnowledge` writes `editor.value()` (work.js:357-366) |
| 9. Ctrl+F search, count, next/prev, Esc, case toggle, `findMatches` unit test | Met in code (`search.js`, `viewer.js:216-292`) and tests (`test/search.test.mjs`, 5 cases); not run in the app |
| 10. Toast close mirrors open; one `MOTION` value drives duration and removal | Met — `MOTION.toastOut` (look.js:104) drives opacity, shrink and `dropToast`'s removal timer (composer.js:470) |
| 11. `bh models` prints the harness's models; picker lists them; refresh; typed id; parsers tested | Parsers/tests met (42 pass); `--command` is broken for a multi-word executable (finding 2) |
| 12. Plans page conversation only; View plan tab; pop-up, expand, Esc/outside, comments, Start task | Met in code (plandoc.js, main.js VIEWS.plan, work.js tab); not run in the app |
| 13. `bh check` passes, QA gate passes, `herdr-app check` passes | `bh check` PASS; gate = this report; `herdr-app check` not run yet (step 18 open, app not installed) |

Known-not-possible claims, reasons confirmed: no `typescript`/`tsc` in the repo; gpui-kit has no reduced-motion API (`grep reduced_motion|prefers` -> nothing); look.js:109 states "gpui animates no colours", so colour transitions are out; `TextView.markdown` colour limitation is the board's decision 3 (code chips stay herdr's).

## Verification
- `node <bh> check` — PASS: lint and typecheck pass, 97 tests, 96 pass, 1 skipped ("no headless browser here")
- `node .bot-herdr/tmp/loadsafe/scan.mjs` (static undeclared-identifier scan + `import()` of all 30 `mods/bot-herdr/*.js` with bare specifiers stubbed) — 0 modules failed; one hit, `chat.js:479 sendFromChat`, pre-existing at 861a7ac; no new missing import (the `InputState` class of bug does not recur)
- `node --test test/mdedit.test.mjs test/search.test.mjs test/browse.test.mjs test/files.list.test.mjs test/models.test.mjs test/contrast.test.mjs` — 42/42 pass
- `node .bot-herdr/tmp/loadsafe/roundtrip.mjs` — "all round trips exact" over 12 cases (empty, no final newline, CRLF, unclosed fence, table, blank-only, leading blanks)
- `node mods/bot-herdr/engine/bh.mjs files . --json` — exit 0, `{path,parent,entries,truncated}`, 0.28 s
- `… bh.mjs files C:/definitely-not-here --json` — exit 1, `{"error":"No such folder: …"}`
- `… bh.mjs files <a file> --json` — exit 1, `{"error":"Not a folder: …"}`
- `… bh.mjs models claude --json` — exit 0, `source:"builtin"`, `method:"none"`, 0.15 s
- `… bh.mjs models bogus --json` — exit 1, one-line message naming the known harnesses
- `… bh.mjs models pi --command no-such-exe-xyz --json` — exit 0, `source:"builtin"` + one sentence, no leftover process
- `… bh.mjs models pi --command "no-such-a no-such-b" --json` — **fails as a command**: error "'no-such-a' is not recognized" (the second word is never its own argument) — finding 2
- `… bh.mjs brief <role> --mode child | wc -c`, base 861a7ac vs now — orchestrator 21 286->18 994, design 26 935->13 864, dev 19 693->13 905, qa 23 971->13 451
- text greps of the four briefs — "commit" rule (leave committing to the Orchestrator), board use, report sections (`## Summary`/`## Changes`/`## Brief Check`/`## Verification`), knowledge-proposal rule and the hard rules are all present in each
- `node .bot-herdr/tmp/loadsafe/ratios2.mjs` over the 8 fixture themes + LIGHT/DARK — see finding 1 for the failing pairs
- grep for design literals in `mods/bot-herdr/*.js` — none in the changed view files; `indicators.js` retains them

## Findings

**[major] Secondary text is below AA on surfaces the app draws — `mods/bot-herdr/switch.js:29` + `:45`, `mods/bot-herdr/chat.js:769`, `mods/bot-herdr/chat.js:740`**
Expected: every text colour >= 4.5:1 under every herdr theme (acceptance criterion 1).
Observed: `palette()` repairs `muted`/`faint`/`accent` against `fill` and `ground` only, but the views draw them on `well`, `bubble` and `hover`:
- `segmented` off labels: `text_color(c.muted)` on `bg(c.well)` — graphite **4.25**, ink 4.33, moss 4.16, atom-one-dark 4.46, paper **3.73**, our own light **3.97** (own dark 8.12, win98 10.37). This is the page switch, the viewer's Preview/Source toggle and the task tab strips — always visible, so the default theme stays under AA.
- "Show more" fold link: `text_color(c.accent)` inside `bg(c.bubble)` — our own dark **3.89**, our own light 4.05, atom-one-dark 4.33.
- File chips in your own message: `bg(c.hover)` + `text_color(c.muted)` — graphite 4.05, ink 4.10, moss 4.02, atom-one-dark 4.04, our light 4.35.
- Knowledge card title: `agentInk(c, agent)` on `c.fill` in light mode — paper **4.35** for dev/design/qa/research/scout.
Reproduce: `node .bot-herdr/tmp/loadsafe/ratios2.mjs` (uses `palette()` from look.js over the committed fixture). The contrast test cannot see these because it only asserts on `fill` and `ground`.
Fix direction: repair `muted`/`faint`/`accent`/`agentInk` against the surfaces they are drawn on too (or lift `well`/`hover` toward `fill` so one repair covers both), and extend `test/contrast.test.mjs` with `well`, `bubble` and `hover` so the criterion is enforced.

**[major] `bh models … --command "<exe> <arg>"` runs a comma-joined command — `mods/bot-herdr/engine/lib/models.mjs:262` and `:270` -> `:236-238`**
Expected: `--command` (documented as `<exe>`) runs that executable with the harness's own arguments.
Observed: `modelsFor` splits the command into `exe` (`:262`) and passes the **array** to `ask(harness, exe)` (`:270`), which builds `argv = [command, ...spec.args]` — so `argv[0]` is an array, and `runner.launch` stringifies it with `Array#toString`, joining the words with commas. `cmd.exe` treats the comma as an argument separator, so only the first word runs.
Reproduce: `node mods/bot-herdr/engine/bh.mjs models pi --command "no-such-a no-such-b" --json` -> `"'no-such-a' is not recognized…"` (never mentions `no-such-b`). A working multi-word case hides it: `--command "cmd /c <path>.cmd"` "works" only because cmd splits the commas back.
Knock-on: on POSIX `spawn(array, args)` throws, so every `cli`/`acp`/`app-server` harness would answer `source:"builtin"` with a type error instead of asking the harness. Not reachable from Settings today (it passes `run[0]`, one token), but `bh models` is a documented CLI contract.
Also on the same path: a failed run reports the first stderr line, which can be a raw Node path — `models pi --command "node -e"` returned `"error": "node:internal/modules/cjs/loader:1520"`, not one plain sentence.
Fix direction: pass `exe.join(" ")` (or the trimmed string) into `ask`, and prefer the last non-empty stderr line/a mapped sentence for the error.

**[major] The chat task widget lost its height bound and its scroll, so extra tasks are unreachable — `mods/bot-herdr/chat.js:404-410` (was `max_h` + `overflow_y_scroll`)**
Expected: every task under way can be seen and paused/resumed.
Observed: the widget is `.absolute().top(SPACE[4]).left(SPACE[4]).w(WIDGET_W).overflow_hidden()` with no `max_h`, and its list has no scroll; its `on_scroll_wheel` still calls `cx.stop_propagation()` (chat.js:403). `overflow_hidden` without a height clips nothing, so the widget grows downward past the window/composer and the rows below the fold cannot be scrolled to — while the wheel is swallowed, so the feed cannot move either. It is a sibling of the feed (chat.js:662), not inside its scroll, so scrolling the feed does not reveal them.
Reproduce (reasoned, not run — app not installed): with more tasks than fit, the last rows sit under the composer/off-screen; wheel over the widget does nothing.
Fix direction: keep the "no nested scroll inside the feed" rule by bounding the widget (`max_h` of the old kind) and either scrolling inside it or capping to N rows with a "+N more" line that opens the task page.

**[minor] Light-mode knowledge filter chips tint the hue at 0.10, criterion says <= 0.04 — `mods/bot-herdr/work.js:1026`**
`.bg(on ? (light ? alpha(hue, 0.1) : alpha(hue, 0.16)) : c.fill)`. The cards themselves meet the rule (plain `c.fill`); the chips don't.

**[minor] The "no design literals outside the tokens" grep is not yet true — `mods/bot-herdr/indicators.js` (`text_size(11|12|13)`, `rounded(1|2|8)`, `gap(2|4|5)`, `h(16|18|22)`, `transition(..., {duration: 420})`)**
`indicators.js` is outside the plan's affected-areas list and has its own tests, so this is a scope call rather than a defect: either declare it exempt in the criterion or move those values to tokens.

**[info] Pre-existing `ReferenceError` in the paused-task path — `mods/bot-herdr/chat.js:479`**
`sendFromChat(...)` is called bare inside `Chat`, but chat.js imports only `FOCUS, OUTGOING, OPEN_TASK, activePage, openTerminal, showPage` from `./pages.js`; `pages.js:53` exports `sendFromChat`. Clicking Resume on a paused task throws. Identical at base 861a7ac (line 477), so it is not this task's, but the fix is one import and the line is inside a block this task re-indented.

**[info] `mods/bot-herdr/gpui-kit.d.ts` gains `ScrollHandle` and doc changes that no mod uses.** They match the installed herdr's own d.ts (8 mentions there, 5 at base), so they are a sync with the shipped API, not invention — just dead weight in this diff.

## Knowledge Proposals
- QA gate: a load-safety check of every view file needs the stubbed-bare-specifier `import()` plus a call-position scan; `herdr-app check` renders only the first view, so it cannot catch a missing import in a later page. Script is at `.bot-herdr/tmp/loadsafe/scan.mjs` if it should become `scripts/load_safety`.
- Contrast: `palette()` repairs tokens against `fill`/`ground`, so a new surface used as a text background (or a text token moved to `well`/`hover`/`bubble`) silently leaves AA. The test should enumerate surfaces, not tokens.

## Script Proposals
- `load_safety`: for every `mods/<mod>/*.js`, report identifiers called/constructed but not imported, declared or global, and import each file with bare specifiers stubbed. Would have caught the `InputState` bug and the `sendFromChat` one.

## Blockers
None for the review. `herdr-app check` and the in-app UI criteria (attach browser, plan pop-up, viewer search, toast motion, feed scroll) could not be exercised because the installed app still holds the pre-task build (`~/.config/herdr-app/mods/bot-herdr/engine/bh.mjs` has no `files`/`models` command); step 18 is still open and install is the Orchestrator's.

## Pushback
None.

## Round 2
Re-review of round 1 only: each finding below, then the one residual it exposed.

### Round 1 findings — state
- **[major] Contrast on well/bubble/hover/fill — addressed.** `palette()` now repairs `muted`, `faint`, `accent`, `info`, `success`, `warning`, `danger`/`stop` through `onAll()` against all five drawn surfaces `[fill, ground, hover, well, bubble]` (look.js `palette`), `agentInk` picks the harder of `ground`/`fill` (look.js:386-391), and LIGHT/DARK were retuned (muted `#6a6964`, faint `#6a6966`, accent `#a25338`, dark accent `#e1987e` with `accentInk: #141413`). `test/contrast.test.mjs` now iterates `fill, ground, well, bubble, hover` for all nine text tokens and both surfaces for `agentInk`. My own ratio script over the 8 fixture themes + the pair now reports a worst case of **4.50** for every pair I named in round 1 (segmented labels 4.53-5.00, "Show more" 4.68/4.89, file chips 4.52-5.54, agent names on fill 4.50-11.74). Verified by the measurements below.
- **[major] `bh models --command` array argv — addressed.** `commandWords()` (models.mjs) returns an existing path as one word and otherwise does a quote-aware split; `ask()` now spreads the words (`argv = [...command, ...spec.args]`); `errLine()` skips stack frames and `node:` internals. New behavioural test "a command of several words runs its executable with the rest as arguments" (test/models.test.mjs:124) runs a quoted two-word command and asserts the parsed models. CLI evidence: `models pi --command "node -e"` now answers `"it exited with code 9"` instead of a Node loader path; `commandWords("cmd /c echo alpha beta")` -> `["cmd","/c","echo","alpha","beta"]`.
- **[major] Task widget lost its bound and scroll — addressed.** chat.js:409 `max_h(Math.max(160, this.size.height - 220))` and `.overflow_y_scroll()` on `bh-tasks-widget-list` are back; the wheel still does not leak into the feed.
- **[minor] Light-mode chip tint 0.10 vs <= 0.04 — addressed.** work.js:1026 `alpha(hue, 0.04)`.
- **[info] `sendFromChat` ReferenceError — addressed.** chat.js:18 imports it from `./pages.js`.

### Residual finding from the same criterion
**[major] Agent names are still below AA on the tinted knowledge chips and cards under dark themes — `mods/bot-herdr/work.js:1026-1028` and `:1080-1082`, text at `:1027` and `:1091`**
Expected: every agent name colour >= 4.5:1 on the surface it is drawn on (acceptance criterion 1; the person named agent names explicitly).
Observed: `agentInk()` is repaired against `ground` and `fill`, but these two controls paint the agent's own hue *behind* the name — `alpha(hue, 0.16)` (chip) and `alpha(hue, 0.08)` (card), and `alpha(hue, 0.22)` / `alpha(hue, 0.12)` on hover. Because the tint moves the background toward the text hue, the repaired ratio falls back under 4.5 in dark mode:

| theme | chip at rest | chip hovered | card at rest | card hovered |
|---|---|---|---|---|
| atom-one-dark | 3.92-4.13 | 3.57-3.75 | 4.45-4.73 | 4.20-4.42 |
| our own dark | 4.05-4.17 | 3.65-3.74 | 4.62-4.68 | 4.31-4.42 |
| graphite / ink / moss | 4.80-5.12 | 4.29-4.62 | 5.41-5.80 | 5.11-5.48 |

So the hover state of the agent filter chips is under AA in **every** dark theme (3.57 worst, atom-one-dark/dev), and at rest two themes are under (3.92 / 4.05). Light mode is fine (ink on a 0.04 tint, 14-17:1).
Reproduce: composite `alpha(agentHue(agent), t)` over `ground` with `mix()` and read `contrastOf(agentInk(c, agent), bg)` — `.bot-herdr/tmp/loadsafe/card.mjs` does exactly this.
Fix direction (smallest): in dark mode use `c.ink` for the chip label (as light mode already does) and repair the name against the tinted card, or drop the hue tint under text to the level that keeps 4.5 (repair `agentInk` against `mix(ground, hue, 0.22)`); then add the composite surface to `test/contrast.test.mjs` so it cannot regress.

### Verification (round 2)
- `node <bh> check` — PASS: lint and typecheck pass, 98 tests, 97 pass, 1 skipped (headless browser)
- `node --test test/contrast.test.mjs test/models.test.mjs` — 22/22 pass (10 theme cases + 12 model cases)
- `node .bot-herdr/tmp/loadsafe/ratios2.mjs` (8 fixture themes + LIGHT/DARK) — every pair I named in round 1 now >= 4.50; worst 4.50
- `node .bot-herdr/tmp/loadsafe/card.mjs` — the tinted chip/card table above (the residual)
- `node .bot-herdr/tmp/loadsafe/scan.mjs` — 0 of 30 modules fail to load; the only static hits are class-method names (`briefFor`, `reroute`, …), `sendFromChat` is gone
- `node mods/bot-herdr/engine/bh.mjs models pi --command "node -e" --json` — exit 0, one plain sentence (`it exited with code 9`), no stack frame leaked
- `commandWords("cmd /c echo alpha beta")` — `["cmd","/c","echo","alpha","beta"]`

### Verdict (round 2)
**CHANGES_REQUIRED** — narrow. All three majors and both smaller items from round 1 are fixed and verified; one pair from the same contrast criterion remains: agent names on the tinted knowledge chips/cards in dark themes (3.92 at rest, 3.57 hovered). No other behaviour changed since round 1.

## Round 3
Re-check of the Round 2 residual only.

### Residual — addressed
**[was major] Agent names on the tinted Knowledge chips and cards in dark mode** — fixed in two places, both wired to what is drawn:
- `work.js:1027` chip label is now `c.ink` on any theme (light already was); the hue stays on the dot, the border and, on cards, the 2px bar. `work.js:1026`/`:1028` keep `alpha(hue, 0.16)` at rest and `alpha(hue, 0.22)` hovered.
- `work.js:1091` card name now uses the new `agentInkOn(c, agent, mix(c.ground, hue, 0.12))` (look.js), i.e. the hue repaired against the **hover** tint and drawn on both the 0.08 rest and 0.12 hover tints, so one value covers the pointer state.
- `test/contrast.test.mjs:50-65` now asserts both surfaces per agent and per theme: card name on `fill` (light) / `alpha(hue, 0.08 ~ 0.12)` (dark) at rest and hovered, and chip label `c.ink` on `alpha(hue, 0.04 ~ 0.22)` — exactly the pixels the view paints.

Measured over the 8 fixture themes plus our own pair, mirroring the view (`card2.mjs`):
- worst **card name**: 4.50 — our own dark, design, hovered tint (was 4.20-4.42).
- worst **chip label**: 4.79 — atom-one-dark, orchestrator, hovered tint (was **3.57**).
Everything else from Round 1/2 is unchanged and still at or above 4.50 (`ratios2.mjs`).

### Verification (round 3)
- `node .bot-herdr/tmp/loadsafe/card2.mjs` — worst card name **4.50**, worst chip label **4.79**
- `node --test test/contrast.test.mjs` — 10/10 pass (8 fixture themes + LIGHT/DARK, now with the tinted card and chip surfaces)
- `node .bot-herdr/tmp/loadsafe/ratios2.mjs` — unchanged: agentInk on fill >= 4.50, muted/well 4.53-10.37, accent/bubble 4.68-14.01
- `node <bh> check` — PASS: lint and typecheck pass, 97 pass, 1 skipped (headless browser), 0 fail

### Verdict (round 3)
**PASS.** Every finding from Rounds 1 and 2 is fixed and verified; the acceptance criteria that can be exercised without the installed app hold (contrast test, `bh check`, `bh files`, `bh models`, markdown round trip, brief sizes). Still outside this gate: `herdr-app check` and the in-app UI criteria (attach browser, plan pop-up, viewer search, toast motion, feed scroll) run after `node install.mjs`, step 18.
