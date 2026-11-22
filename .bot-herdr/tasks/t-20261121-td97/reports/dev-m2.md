# M2 — Tokens and state language (dev-m2)

## Summary

`look.js` now owns the semantic token map, scales and state language, every preset gets them, and
all 14 hex literals outside it are gone. `controlBorder` now reads **3.08** (bot-herdr-light) and
**3.17** (bot-herdr-dark), all 16 themes are clean, and the audit reports `hexOutsideTokens = 0`
with `renderErrors` empty; the tsc jsconfig is scoped to the UI and the remaining pre-existing
findings are counted below (3,208; too many to annotate safely inside M2).

## Changes

- `mods/bot-herdr/look.js`
  - New token constants: `CLEAR`, `TILE_INK`, `STATE`, `AGENT_NAMES`, `COMMAND_HUES`, `ROLE_HUES`,
    `TYPE_SCALE`, `WEIGHT`, `SPACE_SCALE`, `RADIUS`.
  - `withTokens(base)` (private) wraps every palette: legacy keys stay as aliases, and every preset
    (own pair or derived) also carries `surface0/1/2`, `textPrimary/Secondary/Muted`, `accent`,
    `controlBorder`, the seven `state*` tokens and `agentHues` (7 agents).
  - `controlBorder` = the card's control line at ≥3:1 (`edgeDark` kept as its alias, as nothing
    draws the old bevel lip). Own pair gets the computed border; derived presets reuse theirs.
  - `stopInk`: the mark on a stop control (white where it reads, black on a pale stop fill).
  - `agentHue` now reads one `AGENT_HUES` table and adds the 7th agent, `advisor` (`#c4973b`);
    `orchestrator` stays the accent.
- `mods/bot-herdr/composer.js` — `CLEAR` imported from `look.js` (was the local hex); the stop
  button's square is `c.stopInk` instead of `#ffffff`.
- `mods/bot-herdr/indicators.js` — `ROLE_HUES` imported from `look.js` (local copy deleted).
- `mods/bot-herdr/pick.js` — harness tile ink is `TILE_INK` from `look.js`.
- `mods/bot-herdr/route.js` — the 9 command colours are `COMMAND_HUES` from `look.js`.
- `mods/bot-herdr/work.js` — `statusMark`/`markInside`/`statusTone`/`seatMark` draw through
  `stateTone(c, key)`; no layout or behaviour change.
- `mods/bot-herdr/tasksview.js` — `goalCriterionBadge` glyphs come from `STATE` (`✓` done,
  `✕` failed — was `✗`, `○` idle).
- `mods/bot-herdr/jsconfig.json` — `"include": ["*.js", "gpui-kit.d.ts"]`,
  `"exclude": ["engine"]`. Why: the config sits in `mods/bot-herdr`, so before this it checked
  `engine/**` under the gpui runtime's config (no Node types); that accounted for ~3,845 of the
  7,053 errors and is not UI code. `engine/` is exercised by the Node tests instead.
- `test/contrast.test.mjs` — the `ownTheme` exemption is gone: every one of the 16 presets checks
  `controlBorder >= 3:1`, and every `STATE` glyph at 3:1 on card and page.
- `test/ui-audit.test.mjs` — the "our pair must fail controlBorder" assertion is now the tighter
  "no theme may fail controlBorder" (all 16 rows).
- `test/themes.test.mjs` — the legacy-token loop skips the one structured token and asserts
  `agentHues` has 7 hues.
- `test/goal-ui.test.mjs` — FAIL badge glyph updated to the state language's `✕`.
- `.gitignore` — no change needed: `node_modules/` is already line 1 at HEAD
  (`git check-ignore -v node_modules/` → `.gitignore:1`). `npm install` added only typescript
  5.9.3 and `git status` stays clean of node_modules.

## Token table

| Token | Source / alias | Value (bot-herdr-light / bot-herdr-dark) |
| --- | --- | --- |
| `surface0` | `ground` | `#faf9f5` / `#262624` |
| `surface1` | `fill` | `#ffffff` / `#30302e` |
| `surface2` | `hover` | `#f4f3ef` / `#3f3f3d` |
| `textPrimary` | `ink` | `#141413` / `#faf9f5` |
| `textSecondary` | `muted` | `#6a6964` / `#bbb9b2` |
| `textMuted` | `faint` | `#6a6966` / `#abaaa4` |
| `accent` | `accent` (AA-repaired coral pair kept) | `#a25338` / `#e1987e` |
| `controlBorder` | `edgeDark` alias | `#939392` / `#7d7c7a` |
| `stateNeedsYou` | `warning` (amber) | `#aa4f0a` / `#fbbf24` |
| `stateReview` | `accent` | `#a25338` / `#e1987e` |
| `stateWorking` | `accent` | `#a25338` / `#e1987e` |
| `stateDone` | `success` (green) | `#047857` / `#34d399` |
| `stateFailed` | `danger` (red) | `#b91c1c` / `#f88a89` |
| `statePaused` | `muted` | `#6a6964` / `#bbb9b2` |
| `stateIdle` | `muted` | `#6a6964` / `#bbb9b2` |
| `agentHues.orchestrator` | accent | `#a25338` / `#e1987e` |
| `agentHues.dev` | fixed identity hue | `#5b8def` |
| `agentHues.design` | fixed identity hue | `#d6825a` |
| `agentHues.qa` | fixed identity hue | `#3fa877` |
| `agentHues.research` | fixed identity hue | `#a47bd6` |
| `agentHues.scout` | fixed identity hue | `#3ea3b5` |
| `agentHues.advisor` | fixed identity hue (new) | `#c4973b` |

`STATE` (glyph + state token + word): needsYou `◆` "Needs you", review `◇` "Review",
working `●` "Working", done `✓` "Done", failed `✕` "Failed", paused `‖` "Paused", idle `○` "Idle".
`stateTone(c, key)` resolves the live palette colour.

Scales exported (call-site migration is M3): `TYPE_SCALE = {metadata:12, body:13, title:15,
hero:20}`, `WEIGHT = {regular:400, semibold:600}`, `SPACE_SCALE = [4,8,12,16,24,32]`,
`RADIUS = {control:8, card:12}`. Existing `TYPE`/`LINE`/`SPACE`/`SIZE` are untouched.

## Hex literals (14 → 0)

| Was | Now | Visual |
| --- | --- | --- |
| composer.js:64 `CLEAR = "#00000000"` | `look.js` `CLEAR` | same (transparent) |
| composer.js:1881 stop square `#ffffff` | `c.stopInk` | same white on light presets; **dark presets now black** (the pale stop fill read white at 2.34:1), i.e. moved to the token |
| indicators.js:24 `ROLE_HUES` | `look.js` `ROLE_HUES` | same |
| pick.js:47 tile ink `#ffffff` | `TILE_INK` | same |
| route.js:8–16, 9 command hues | `COMMAND_HUES` | same |

Audit: `tokens.hexOutsideTokens = 0`, `tokens.files = []`.

## State language routing (colour/glyph only)

- Task status mark (`work.js statusMark`/`markInside`): done→`stateDone`, active→`stateWorking`,
  blocked→`stateNeedsYou`, pause bars→`statePaused`, open/cross→`stateIdle`. Open rings move
  `faint`→`muted` (the state token); radii/sizes unchanged.
- Task status pills (`statusTone`): active/done/blocked as before through state tokens; paused is
  now `statePaused` (muted) instead of amber, per the spec's Paused ‖ muted.
- Rail seat dots (`seatMark`): working dot `success`→`stateWorking` (accent, per "Working ●
  accent"), done tick `muted`→`stateDone` (green), idle ring `faint`→`stateIdle`.
- Task verdict badges (`tasksview.goalCriterionBadge`): PASS/FAIL/UNCHECKED glyphs from `STATE`;
  FAIL is `✕` instead of `✗`.
- SVG ring/tick idioms are kept (no layout change); M3 owns replacing them with the state glyphs
  in list rows.

## Contrast (controlBorder on the card)

| Theme | Before | After |
| --- | --- | --- |
| bot-herdr-light | `#d6d2c6` 1.51:1 | `#939392` **3.08:1** |
| bot-herdr-dark | `#1d1d1b` 1.28:1 | `#7d7c7a` **3.17:1** |

All other 14 presets stay 3.01–3.11:1. The audit (`ui-audit-spec.mjs:486`) and
`test/contrast.test.mjs` both read the same token threshold; neither was loosened and no theme is
skipped.

## tsc before / after

tsc 5.9.3 (local devDependency, installed with `npm install`).

| State | Command scope | `error TS` |
| --- | --- | --- |
| commit 37d74fb (temp worktree, old jsconfig) | whole `mods/bot-herdr` incl. engine | 6,595 |
| HEAD 3a8995f before M2 (old jsconfig) | whole `mods/bot-herdr` incl. engine | 7,053 |
| M2 after jsconfig scoping | UI `*.js` + `gpui-kit.d.ts`, engine excluded | **3,208** |

Per-file findings (UI-only), top offenders: work 650, settings 394, composer 391, chat 253,
issues 194, plandoc 127, feed 107, look 101, roster 84, learning 74, switch 65, tasksview 52,
viewer 48, route 48, indicators 48, metrics 42, resilienceview 40, main 37, issuesview 35,
mdedit 27, render-safe 26, pick 25, drawer 24, rest <25. By code: 2,667× TS7006 (implicit-any
parameters), 167× TS7031, 96× TS2339/TS7053, plus ~30 rows of `easing: string` not assignable to
`MotionEasing`.

M2-touched files add **no** findings (look 102→101, all others unchanged): the new token code
carries its own JSDoc on the two helpers that would have widened types. The remaining 3,208 are
pre-existing missing annotations across the whole mod (1,328 of them in files M2 touches). Adding
JSDoc to ~1,300 call sites is not a safe single-milestone change and is unrelated to tokens, so
this is the brief's documented fallback: count per file above, no new errors, no `@ts-nocheck`.
Recommend a dedicated typing pass (M3/M4 or a separate task) before making tsc a required gate.

## Verification

- `node mods/bot-herdr/engine/bh.mjs check` — PASS: 605 pass, 1 skipped (606 tests), exit 0
- `npm test` — 605 pass, 1 skipped, 0 fail (606), exit 0
- `/home/athi/.local/bin/herdr-app check mods/bot-herdr` — `check passed`, exit 0; generated
  `engine/lib/gpui-kit.d.ts` deleted (untracked)
- `npx tsc --noEmit -p mods/bot-herdr/jsconfig.json` — exit 2, 3,208 findings (pre-existing; see
  above); before scoping: 7,053 full tree, 6,595 at 37d74fb
- `node mods/bot-herdr/engine/bh.mjs ui-audit --json --shots .bot-herdr/tasks/t-20261121-td97/shots/m2`
  — exit 0; `hexOutsideTokens 0` (`files: []`); 16/16 themes with zero contrast failures;
  `renderErrors {}`; 44 PNGs (11 pages × graphite/paper/ink/moss). `pass:false` only for M3+
  targets: destinations 11/5, zero-count chips 9/0, repeated defaults 5/0, stats 8/1, selection
  styles 2/1, raw machine text 4/0, decorative icons 3/0, agent-colour fills 13/0, accent buttons
  ≤4/view, keyboard 92%, labels 85%, 7 P1 features absent (unchanged from M1).
- M1 vs M2 shots — `chat-paper.png` and `settings-graphite.png` are byte-identical;
  `tasks-graphite`, `plans-graphite`, `issues-paper` differ only in the relative "Updated 3h/4h"
  labels. Warm charcoal/coral look carried over unchanged (sidebar, tabs, composer, plan rail,
  status marks all visually the same).

## Brief Check

1. **Semantic token map** — met: `palette()` returns `surface0/1/2`, `textPrimary/Secondary/Muted`,
   `accent`, `controlBorder`, `state*` (7), `agentHues` (7 agents) for own and derived presets,
   with every legacy key kept as an alias; `STATE` exports glyph, colour token and word.
2. **Scales** — met: `TYPE_SCALE` 12/13/15/20, `WEIGHT` 400/600, `SPACE_SCALE`
   [4,8,12,16,24,32], `RADIUS` 8/12 exported; no call-site migration (M3's job).
3. **Zero hex outside look.js** — met: 14 replaced, audit 0.
4. **State language** — met: task marks, status pills and rail dots draw through `stateTone`, and
   verdict badges use `STATE` glyphs; colour/glyph only.
5. **Contrast** — met: both failing themes fixed at the token (3.08 / 3.17), `ownTheme` exemption
   removed and the test now requires all 16 to pass.
6. **tsc** — partially met: installed, baseline confirmed, jsconfig scoped to the UI and documented;
   the remaining 3,208 findings are pre-existing implicit-any noise, too many to fix safely in M2
   (brief's fallback), with counts above and zero new errors.

## Knowledge Proposals

- In `look.js`, a palette-wrapping function cannot run at module-init if it needs `reach`/`mix`
  while `rgb` is still a later `const` (TDZ): keep raw `LIGHT_BASE`/`DARK_BASE` first and export the
  wrapped pair after the colour helpers.
- gpui-kit's `.bg()`/`.text_color()` take `#${string}`; annotating a colour helper's JSDoc
  `@returns {string}` turns working calls into TS2345, while leaving the return unannotated keeps
  them as `any` and adds no findings.

## Blockers

None. tsc is not green yet (3,208 pre-existing findings) — reported per the brief's fallback rather
than hidden.
