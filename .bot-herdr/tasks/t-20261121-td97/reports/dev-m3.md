# M3 — Quiet pass (dev-m3)

## Summary
Every M3 counter is at target and every page draws fewer elements than the M1 baseline: one selection
style (accent text + 2 px accent underline), no zero-count chip or unsupported setting, no agent
colour outside an avatar/dot, no icon in front of a title, and all JSON/stack/path text folded into one
muted mono line with copy. Zero runtime behaviour change: the same actions, commands and data, with the
removed details reachable behind a tooltip, an expand or a detail view.

## Changes

### New modules
- `mods/bot-herdr/machinefold.js` — the machine-text rules, pure (Node-tested): `machineKind` (json /
  stack / path / branch), `middleTruncate` (one line, both ends kept), `splitFences` (markdown body →
  prose + fenced code, unclosed fence runs to the end, CRLF), `fenced` (a code fence wider than any
  backtick run inside).
- `mods/bot-herdr/machinetext.js` — the drawing: `machineLine` (one muted mono line, middle-truncated,
  click-to-unfold with a tooltip and a focus ring, plus an icon-only Copy button that writes the exact
  text), `machineBody` (the whole text as a native markdown code block, so it keeps its own lines and
  scrolls), `markdownWithFoldedCode` (prose stays markdown, code becomes machine lines),
  `toggleMachine`. All colour from `c.*` tokens; sizes from `TYPE_SCALE`/`SPACE_SCALE`/`RADIUS`.
- `mods/bot-herdr/numbers.js` — one number language: `compact` (7.2M / 830k / 12.4k / 512 / —),
  `usd` ("$0.13", "" when none), `price` ("$0.00" for zero, "—" for missing), `duration`
  ("0m", "<1m", "23m", "1h 18m", "2h"), `ago` (now / 40s / 3m / 4h / 5d), `count` ("1 agent"),
  `estimatedHeader` ("≈ Tokens"). Pure, Node-tested.
- `mods/bot-herdr/icons/copy.svg` — the lucide copy glyph in the repo's icon idiom, for machine text's
  Copy button.
- `test/machinetext.test.mjs` — 6 tests over the new pure rules (folding, fences, number forms).

### Selection and chips (one style app-wide)
- `mods/bot-herdr/switch.js`
  - `segmented`: the `mark` parameter is gone. Every picked item is accent text over a 2 px accent
    underline (`border_b(2)` + accent), with a transparent underline on the rest so nothing moves; no
    fill, no all-round outline, no pill. A segmented control keeps its grey track. `bar` is a new hook
    that styles the strip itself before its items are added (the page switch makes it the top bar).
  - `pill`: a status word in its tone with an optional live dot — no wash, no border, no pill.
  - `filterChip` (new, shared) + `chipHasResults`: a filter chip shows its count only above zero and
    is not drawn at all when it has nothing behind it (unless it is the one being shown, so a filter
    never strands the view). Old duplicates in `work.js` and `issues.js` deleted.
  - `stateView`: the title is wrapped in a row only when a working dot sits before it (one element fewer
    on every empty/loading state).
- `mods/bot-herdr/Switch.render` — the top bar and its tab track are one element now: the tabs sit
  straight on herdr's bar (same chrome ground and hairline), picked one underlined. One element fewer
  and no second grey frame inside a frame.
- `mods/bot-herdr/work.js` — task/board/knowledge chips use the shared chip (zero counts hidden); the
  opened task row and the opened issue row step their surface to `c.hover` instead of a coral wash;
  knowledge agent chips are accent text + underline while a filter is on and plain text otherwise.

### Icons
- `mods/bot-herdr/button.js` — `face()` draws an icon only for an icon-only button: a labelled button
  says what it does (Foundations › Icons). Every labelled button across the app loses its glyph
  (New task, Verify now, Add agent, Accept, Decline, Refresh, New plan, …); icon-only buttons keep theirs.
- `mods/bot-herdr/issues.js` — the header icon before the repo name is gone.
- `mods/bot-herdr/settings.js` — `group()` no longer takes or draws a 26 px icon tile: the Access,
  Classifier, Provider health, Fallback chain and Guardrails cards are title + rows (the three shield
  icons and the two zaps from the Fix table).
- `mods/bot-herdr/learning.js` — the accent tile with the page icon before "Repo Learning Guide" is gone.

### Defaults and unsupported settings
- `mods/bot-herdr/settings.js` — the Effort field (label + slider) is drawn only for a harness that has
  effort levels: "No effort setting for this harness." and its label vanish for the five harnesses that
  have none. Defaults keep showing as the field's placeholder ("The harness's default"), never as text.

### Agent colour = identity, never fill
- `mods/bot-herdr/work.js` — the plans rail's seats are plain letters in the agent's ink with the state
  dot (no tint, no outlined chip); Knowledge's card wash and chip tint are gone (card = `c.fill`, hover
  = border only; the agent is one dot plus its name in `agentInk`, repaired for the card).
- `mods/bot-herdr/metrics.js` — the daily bars are a neutral `controlBorder` step (no agent hue), capped
  at 24 px wide so a single day is a bar, not a slab.

### Machine text folded (Principle 6)
- `mods/bot-herdr/work.js` — the task header's branch name is one `machineLine` ("branch …" middled,
  Copy, expand); board entries that are machine output (the `ui-audit` contract JSON) are one line that
  expands; other board text is markdown with its fenced code folded.
- `mods/bot-herdr/issues.js` — the issue body and comments are split at their fences: prose through
  `TextView.markdown` (still without `linkFiles()`, still read-only), each fenced block as one folded
  machine line. The stack trace no longer draws at body size.
- `machinetext.machineBody` renders the unfolded text as a markdown code block (mono, scrollable,
  selectable), so an expansion keeps its own line breaks instead of re-wrapping.

### Stats and numbers
- `mods/bot-herdr/metricsview.js` — `formatTime`/`formatTokens`/`formatCost` now delegate to
  numbers.js (compact forms); `estimated` (the per-value "≈") is gone: `cell.label` carries it once
  (`≈ Tokens`, `≈ Cost`); new `hero(m)` (the card's one number: cost) and `cardDetail(m)` (the rest of
  the numbers in one line for the card's tooltip).
- `mods/bot-herdr/metrics.js` — a card is avatar + name + harness, ONE hero number + its label, a
  "Daily time" caption with the bars, and Details. The other five numbers live in the card's tooltip
  and under Details (folded, drawn only when opened).
- `mods/bot-herdr/steps.js` — `usageText` reads "1.8M tokens · $1.32 · 52m" (was "1830.0k tokens ·
  $1.32 · 52 min").
- `mods/bot-herdr/tasksview.js` — `formatUsd`/`formatWorked` delegate to numbers.js (one money and one
  duration form in the app).
- `mods/bot-herdr/issues.js` — "N open" is not drawn at zero.

### State language
- `mods/bot-herdr/work.js` — `statusMark` draws the state language's one glyph in its tone (● working,
  ◆ needs you, ✓ done, ‖ paused, ○ idle) instead of an SVG ring plus its contents (`markInside`,
  `MARK_KIND` removed: one element, one glyph, no per-state drawing). The step row's "working" word uses
  the Working accent, not success.
- `mods/bot-herdr/work.js` — QA M2's nit: `seatMark`'s working dot no longer starts at
  `opacity(0.45)`; it breathes 0.75 → 1.0, which keeps every state token at ≥ 3:1 on card and page in
  all 16 presets (checked by compositing; see Verification).

### Migrated call sites (item 10)
In the components rewritten above, sizes, weights, spacing and radii now come from M2's
`TYPE_SCALE`/`WEIGHT`/`SPACE_SCALE`/`RADIUS` (segmented items, chips, pills, buttons, state view,
machine text, metric cards, settings cards, the knowledge and learning headers). The untouched blocks of
`work.js`, `issues.js` and `settings.js` still read `TYPE.*`/`SIZE.*`; see Pushback for why the
mechanical mapping was not applied there in this pass.

## Brief Check

1. **`accentButtonsPerView <= 1`** — met: max 1 per view (was 4 on tasks-board). Each page keeps its one
   primary action: New task (tasks, tasks-board), Resolve (issues), New note (knowledge), Refresh guides
   (learning), Add agent (settings); chat, plans, metrics, settings-general and switch have none.
   The coral washes the counter counted as buttons (opened rows, tinted chips) are gone; every other
   action is secondary or quiet.
2. **`zeroCountChips = 0`** — met (was 9). `chipHasResults` hides a chip with nothing behind it and a
   count is drawn only above zero; the chip currently shown is always kept, so a filter can never
   disappear with the view on it.
3. **`repeatedDefaultStrings = 0`** — met (was 5): the Effort field is not drawn for a harness without
   effort levels (was "No effort setting for this harness." five times). Defaults stay as placeholders.
4. **`selectionStyles = 1`** — met (was 2; one signature `accent-outline+accent-text`): the accent-tinted
   pill, the coral outline, the coral wash and the dark pill are gone. Tabs and chips are accent text
   over a 2 px accent underline; segmented controls are the same underline inside their grey track.
   Interpretation recorded below (Pushback): the audit counts one signature across every
   `aria_selected` node, so the segmented control's "grey fill" is its track, not its picked item.
5. **`agentColourFills = 0`** — met (was 13): plans rail seats, Knowledge chips and card washes,
   metrics bars. Agent colour now appears on avatars, the 6 px identity dots and names in `agentInk`.
6. **`decorativeIcons = 0`** — met (was 3: the Issues header icon and the two Settings card icons). All
   card/notice titles are text; icons remain on navigation and icon-only buttons, and labelled buttons
   no longer draw one.
7. **`rawMachineText = 0`** — met (was 4: branch name, contract JSON, issue stack trace). One shared
   `machinetext` component: one muted mono line, middle-truncated, Copy + click-to-expand.
8. **`statsPerCard` target** — met: 1 (was 8). A Metrics card is one hero number + label; the other five
   numbers are in the card's tooltip and under Details; the bars are labelled and neutral.
9. **Numbers** — met: `numbers.js` is the one helper module; pages read 7.2M / $0.13 / 23m / "1 agent";
   "≈" appears once in a column header (`≈ Tokens`, `≈ Cost`), never on the value.
10. **Type/space/radius call sites** — partly met: every component rewritten in this pass uses
    `TYPE_SCALE`/`WEIGHT`/`SPACE_SCALE`/`RADIUS`; the untouched blocks of the big page files still use
    the legacy names (see Pushback).
11. **`visibleElements < M1 baseline`** — met on all 11 pages, no baseline rewritten: chat 40/41,
    tasks 163/167, tasks-board 182/187, plans 100/101, issues 92/95, knowledge 139/142, learning 67/71,
    metrics 116/194, settings 255/292, settings-general 105/110, switch 28/29.
12. **QA M2 nit (seat dot)** — met: `seatMark` breathes 0.75 → 1.0 (no static 0.45); every state token
    composites to ≥ 3:1 on card and page in all 16 presets.

Rules: no runtime behaviour change (same clicks, commands, `bh` calls; removed details are behind
tooltip/expand/Details); `renderErrors = {}` and the `render-safe` boundary untouched; all colour via
tokens (`hexOutsideTokens = 0`); tests updated, never deleted or skipped; 16/16 themes clean.

## Verification
- `node_modules/.bin/tsc --noEmit -p mods/bot-herdr/jsconfig.json` — exit 0, no findings
- `node mods/bot-herdr/engine/bh.mjs check` — PASS: 612 tests pass, 1 skipped, typecheck passes
  (`Ran: 0 lint, 1 typecheck, 613 tests`)
- `npm test` — 613 tests, 612 pass, 1 skipped, 0 fail
- `/home/athi/.local/bin/herdr-app check mods/bot-herdr` — exit 0, `check passed` (generated
  `engine/lib/gpui-kit.d.ts` deleted; `git status` clean of it)
- `node mods/bot-herdr/engine/bh.mjs ui-audit --json --shots .bot-herdr/tasks/t-20261121-td97/shots/m3`
  — exit 0, `renderErrors {}`, 44 PNGs (11 pages × graphite/paper/ink/moss), 16/16 themes clean,
  `hexOutsideTokens 0`. Only M4/M5 findings remain: `topLevelDestinations 11` (M4),
  `keyboardPathCoverage 0.92` and `accessibleLabelCoverage 0.85` (M5, unchanged from M1), 7 P1 features
  (M4+).

### Counter before → after (audit JSON)

| Counter | M3 start | now | target |
| --- | --- | --- | --- |
| accentButtonsPerView (max/page) | 4 | **1** | ≤ 1 |
| zeroCountChips | 9 | **0** | 0 |
| repeatedDefaultStrings | 5 | **0** | 0 |
| statsPerCard | 8 | **1** | 1 |
| selectionStyles | 2 | **1** | 1 |
| rawMachineText | 4 | **0** | 0 |
| decorativeIcons | 3 | **0** | 0 |
| agentColourFills | 13 | **0** | 0 |
| topLevelDestinations | 11 | 11 | 5 (M4) |
| keyboardPathCoverage | 0.92 | 0.92 | 1 (M5) |
| accessibleLabelCoverage | 0.85 | 0.85 | 1 (M5) |

### Per page: what moved where

| Page | elements (M1 → now) | Moved |
| --- | --- | --- |
| chat | 41 → 40 | empty-state title lost its one-child row; composer unchanged |
| tasks | 167 → 163 | Done/Archived chips hidden (they had nothing behind them); the branch name folded into a mono line with Copy/expand; opened row no longer coral-washed; state glyphs replace ring+dot; New task lost its plus |
| tasks-board | 187 → 182 | as tasks, plus decision/blocker/note chips hidden, the board's type word is muted text (no pill), and the contract JSON is one folded mono line (expand → full text, Copy → clipboard) |
| plans | 101 → 100 | rail seats are letters + state dot (no tint); "New plan" lost its file glyph; the previously-open plan row keeps a surface step, not a coral wash |
| issues | 95 → 92 | Accepted/Declined chips hidden; header icon gone; a focused row steps its surface; body/comments split at fences and the stack trace folded; action buttons lost their glyphs |
| knowledge | 142 → 139 | agent chips are text + identity dot (no tint); cards are `c.fill` (no agent wash); the chip row loses its wrapping div |
| learning | 71 → 69 | hero icon tile gone; hero title/body on the type scale |
| metrics | 194 → 116 | a card is one hero number + label (five numbers folded into the tooltip and Details); bars neutral, labelled, ≤24 px; ≈ once per column |
| settings | 292 → 255 | "No effort setting…" rows gone (label and line) for five harnesses; card headers keep their title only |
| settings-general | 110 → 105 | Access/Classifier card icon tiles gone |
| switch | 29 → 28 | bar and tab track are one element: tabs sit on the bar, picked one underlined |

### Shots
`.bot-herdr/tasks/t-20261121-td97/shots/m3` — 44 PNGs. Compared with the M2 shots in
`worktrees/redesign-bot-herdr-ui-to-design-language/.bot-herdr/tasks/t-20261121-td97/shots/m2`:
same warm charcoal/coral character (ground, card fill, accent primary, avatars), visibly calmer
(no filled chips or washes, no card icons, one underlined selection, folded machine text). Checked
`settings`, `tasks`, `tasks-board`, `issues`, `metrics`, `knowledge`, `plans`, `switch` in
graphite/paper/ink/moss.

### Test changes (and why)
- `test/contrast.test.mjs` — the block pinning the agent-tinted Knowledge card and chip is replaced by the
  new design's guarantee: no tinted card or chip; the identity dot reads at 4.5:1 (agentInk) on the card
  and the page, and the agent's name likewise. Reason: `agentColourFills = 0`.
- `test/metrics-view.test.mjs` — duration and the ≈ marker follow the design language: `formatTime`
  returns "3h 20m" / "45m" / "2h" / "0m", `dailyLabel` reads "0m, 30m, 1h", and `cells()` no longer
  prefixes "≈" to each value: the tests assert `tokens.label === "≈ Tokens"` and `cost.label === "≈ Cost"`
  with clean values ("1.2M", "$732.29"). Reason: Foundations › Numbers ("≈ once in a column header").
- `test/machinetext.test.mjs` (new) — the folding and number rules as pure functions: machine kinds,
  middle truncation keeping both ends to an exact width, fence splitting (CRLF, unclosed fence, empty),
  fence widening, compact counts/prices/durations/ages/plurals, and the single header ≈.
- No test was deleted, skipped or loosened; `test/ui-audit.test.mjs`, `test/tasks-ui.test.mjs`,
  `test/issues-view.test.mjs`, `test/goal-ui.test.mjs`, `test/learning-view.test.mjs` pass unchanged.

## Knowledge Proposals
- `herdr-app check --print-spec` prints only the first frame, so a page whose rows animate in
  (`opacity(0)` first frame) shows them in the tree but not in `--shots` PNGs: judge those rows from the
  spec tree, not the screenshot.
- GPUI style methods on the same element cascade in call order, but `ui-audit-spec.style()` reads the
  first matching attribute, so applying `.bg()` twice on one element makes the audit read the first:
  give a shared builder one background (e.g. `segmented`'s optional `bar`) rather than overriding it.
- The audit's `sameColor` compares rgb only, so an accent at any alpha (`#eeeeef24`) counts as an accent
  fill: tinted washes read as accent buttons.
- gpui has no `whitespace_pre`: unfolded machine text keeps its line breaks by going through
  `TextView.markdown` with a fenced code block, sized and fenced from the text itself.

## Script Proposals
Two dev scripts were used and are left under `.bot-herdr/tasks/t-20261121-td97/scripts/` (not proposal
candidates, but they are how the work was done):
- `dump_spec.mjs` — prints the `herdr-app check --print-spec` tree of every audit page (or one), the way
  `bh ui-audit` renders it, for debugging a counter without changing the audit.
- `analyze.mjs` — explains each Fix-counter hit with its element id chain.

## Pushback
- **Request:** keep the segmented control's picked item as a grey fill, not an underline.
  **Reason:** `TARGETS.selectionStyles = 1` counts distinct `aria_selected` signatures across all pages;
  two idioms (tabs = accent text + underline, segmented = grey fill) is 2 signatures. With the audit
  frozen, one idiom must win. **Alternative:** pick the grey-fill idiom for everything (tabs become
  filled controls, no underline) — one line in `segmented` plus the chips; say which you want and it is
  a small follow-up. As shipped, the segmented track keeps the grey fill and the picked item is
  underlined like a tab.
- **Request:** finish the `TYPE_SCALE`/`SPACE_SCALE` call-site migration across `work.js`, `issues.js`
  and `settings.js` in M4 rather than here. **Reason:** the mapping is not cosmetic (10.5 → 12 grows
  every chip and pill, 18 → 15 and 13.5 → 13 shrink titles and rows), and those files hold ~1,000
  `TYPE.*` uses inside fixed-height rows (LIST_W/HEADER_H/CONTROL/CHIP heights) that M3's brief does not
  let me reflow; the components M3 rewrote are migrated, and a half-migrated page (odd sizes in one row)
  is worse than a page still on the old names until it is re-laid-out. **Alternative:** do the mechanical
  mapping in M4 together with the Threads/Home rewrite of those pages, or accept the current per-file
  split.
- **Note (not a blocker):** a machine line's unfold is reachable by Tab (it owns a `tab_index` and a focus
  ring) and its Copy is a real button, but Enter-on-a-div needs a view-owned focus handle
  (`track_focus`), which is M5's keyboard map; the audit's keyboard coverage is unchanged at 0.92.
- **Note (not a blocker):** `test/store.test.mjs`'s "thirty rounds of two writers" and "concurrent
  delete and status" tests timed out once each during this run under full-suite load and pass on their
  own and in the final full run; they are pre-existing lock-timing tests, untouched by M3.
