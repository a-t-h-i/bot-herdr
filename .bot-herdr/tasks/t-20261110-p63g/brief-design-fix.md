# Design brief — fix round for steps 10–13, plus the chat/Settings wiring of steps 8–9 (t-20261110-p63g)

## Goal
The first pass at steps 10–13 was reviewed against the code and several parts do not do what was asked. Fix exactly the gaps below, then wire two engine features (already built and tested) into the views. Typings for every gpui call are in `mods/bot-herdr/gpui-kit.d.ts`: read the doc comment of an API there before you use it; never call an API through `?.` to hide that it may not exist.

## Files
- Change: `mods/bot-herdr/chat.js`, `mods/bot-herdr/feed.js`, `mods/bot-herdr/indicators.js`, `mods/bot-herdr/working.js`, `mods/bot-herdr/composer.js`, `mods/bot-herdr/route.js`, `mods/bot-herdr/settings.js`, `mods/bot-herdr/work.js` (only items 8 and 9 below), `test/*.test.mjs`.
- Leave alone: `mods/bot-herdr/engine/**`, `toast.js`, `look.js`, `roster.js`.

## What to do

### A. Chat scroll (step 12) — today it is worse than before
`chat.js` `scroll()` (~:481) moves `this.back` (a count of whole entries) once per `WHEEL_STEP = 18` px, so the feed now jumps a whole message every 18 px of wheel. Replace it with a real pixel offset:

1. In `feed.js` add and export a pure function, with tests in the existing feed test (`test/agents-reply.test.mjs` has "the feed: reply files, what is kept and what is shown"):
   `export function scrollBy(state, delta, heights, total, fallback = 120)` where `state = { back, px }`, `delta` is pixels (positive = towards older messages), `heights` is an array where `heights[i]` is the pixel height (entry plus the 14 px gap) of the entry that is `i` entries up from the newest (`undefined` when not measured yet; use `fallback`), and `total` is the number of entries. It returns the new `{ back, px }`:
   - `px += delta`.
   - while `px >= h(back)` and `back < total - 1`: `px -= h(back); back += 1`.
   - while `px < 0` and `back > 0`: `back -= 1; px += h(back)`.
   - if `back === 0` and `px < 0`: `px = 0` (pinned to the newest).
   - if `back === total - 1`: `px = Math.min(px, 0)` is wrong — instead clamp `px` to `Math.max(0, Math.min(px, h(back) - 1))`.
   Invariant: `0 <= px < h(back)` except at the oldest entry where it is clamped. Test: small deltas change only `px`; crossing a height moves `back` by one and keeps the remainder; scrolling back down returns to `{ back: 0, px: 0 }`; unmeasured heights use `fallback`.
2. In `chat.js`: keep `this.back`, add `this.px = 0` and `this.heights = new Map()` (entry id → height). Delete `WHEEL_STEP` and `this.wheel`. `scroll(e, total, cx)` builds `heights` for the current space from the map and calls `scrollBy({ back: this.back, px: this.px }, e.delta.y, heights, total)`; check the sign of `e.delta.y` against the old code (the old code did `this.back + steps` with `steps` from `+e.delta.y`, keep that direction). Set both, `cx.notify()` only when something changed. Wherever `this.back = 0` is set today (`add()` ~:105, the "newest" pill ~:757) also set `this.px = 0`.
3. Measure: in `entry(c, e, width)` wrap or extend the entry's outer element with `.on_size_change((size) => { this.heights.set(e.id, size.height + 14); })` (no `cx.notify()` there). Confirm in `gpui-kit.d.ts` that `on_size_change` is allowed on that element; `chat.js` already uses it on `#bh-chat`.
4. Draw the offset: the feed (`#bh-feed`, ~:436) is bottom-anchored with `justify_end` and `overflow_hidden`. Shift the inner column down by `this.px` pixels so its bottom part is clipped: make the inner column `.absolute().bottom(-this.px).left(Math.round((this.size.width - width) / 2))` inside `#bh-feed` (the feed is itself absolutely positioned, so it is the containing box). Do not animate this property. If negative `bottom` is refused by the typings, use `.relative().top(this.px)` on the column instead and say which you used.
5. The "newer messages" pill (`newer()`, ~:739) must not scroll away with the column: draw it as a child of `#bh-feed` itself, `.absolute().bottom(8)` centred, when `this.back > 0 || this.px > 0`. Pass `this.back > 0 || this.px > 0` (not just `view.back > 0`) to `this.composer.render(...)` and use the same test for the working line.
6. Tasks widget (`#bh-tasks-widget-list`, ~:260): replace `cx?.stop_propagation?.()` with `cx.stop_propagation()` (it exists: `gpui-kit.d.ts:320`). Also add `.on_scroll_wheel((_e, cx) => cx.stop_propagation())` on the outer `#bh-tasks-widget` so a wheel over the widget's header never scrolls the feed.

### B. Flow dots on the active step (step 5 carry-over, in the tasks widget ~:293)
7. The two dots added at `.absolute().left(12).top(8)` sit on top of the checkbox and use `delay` inside `.loop(...)`, which `LoopPolicy` does not have. Replace them: the active step row becomes `[agent icon 12 px] [three 3 px dots] [checkbox mark] [title]` is NOT wanted either. Do this instead: keep `[mark] [title]`, and under the active step's title draw a 2 px high track the width of the title column with one 12 px wide accent segment travelling left to right: `div().relative().h(2).mt(2).rounded(1).bg(alpha(c.accent, 0.15)).overflow_hidden().child(div().absolute().top(0).w(12).h(2).rounded(1).bg(c.accent).loop("left", { from: -12, to: 200, period: 2400, easing: "linear" }))`. `alpha` is exported from `indicators.js`. Only the active step has it; the task's own row has no animation (already so).

### C. Working verbs (step 11)
8. `indicators.js`: the added `.opacity(0).transition("opacity", …).opacity(1)` chains (in `shimmer()` and `roleWord()`) do nothing: the last `.opacity(1)` wins and `transition` only animates a later change. Remove them. Remove the now unused `typed` import/export only if nothing else uses it (`grep typed test/ mods/`); if a test uses it, leave it.
9. Real crossfade, in `chat.js` `working()` (~:698): it already keeps `this.drawnFx`. When the indicator's `fx` differs from the one drawn last frame, set `this.verbShown = false`, then `cx.timer.after(16, (cx) => { this.verbShown = true; cx.notify(); })`, the same pattern `this.turnShown` uses in that function. Wrap the `roleWord(...)` child in `div().flex_none().opacity(this.verbShown === false ? 0 : 1).transition("opacity", { duration: 420, easing: "ease-out" })`. `working()` needs `cx`; if it does not get one today, use `this.cx` (set at the top of `render`).
10. `working.js` verbs: replace these (they are vague or repeat across roles): oracle `Settling` → `Deciding`; agent `Moving` → `Running`, `Steady` → `Busy`, `Proceeding` → `Carrying on`; dev `Shaping` → `Refactoring`, `Composing` → `Coding`; research `Reviewing` → `Studying`, `Sorting` → `Researching`; qa `Reviewing` → `Inspecting`. Keep the `fx` of each row. Update any test that lists verbs.

### D. Composer fold (step 13)
11. `composer.js` `slim()`: while folded the text input is not drawn, so typing does nothing. In `chat.js` `#bh-feed` `on_mouse_down` handler (~:450) the fold is triggered; keep that. Make growing back on typing work: on `#bh-chat` add `.on_key_down` only if the typings have it; otherwise make the slim bar itself the click target (already so) and say in your report that typing while folded needs a click first. Do not invent an API.
12. The slim bar must show the draft when there is one. `isFolded()` refuses to fold when `this.text.trim()` is non-empty, so `slim()`'s draft branch is dead: change `isFolded()` to allow folding with a draft (drop the `!this.text.trim()` term, keep `!this.files.length`), so a draft folds to one truncated line and comes back intact on click.

### E. Wiring step 8: `/bh-knowledge <question>` in the chat
13. `route.js` `COMMANDS` (:7): add `{ name: "bh-knowledge", hint: "Ask about this project: its knowledge and code", color: "#3fa796" }`.
14. In `route.js` where `/task` and `/plan` are handled (~:171-180), `/bh-knowledge <question>` returns a route that the composer turns into running the engine command `bh knowledge ask "<question>"` from the project folder (follow how `work.js` runs engine commands: `this.act([...])` / `bhJson([...], { cwd })`; reuse the same helper, do not write a new process spawner). The command prints JSON with `--json`: `{ started, reused, name: "knowledge-scout" }`. The answer arrives in the chat by the normal reply path; add the person's question to the feed as their own message, and on failure show a composer toast with the error. An empty question shows the hint "Type a question after /bh-knowledge" and sends nothing.
15. Tests in `test/route.test.mjs`: `/bh-knowledge what is X` routes to the knowledge ask with the question `what is X`; bare `/bh-knowledge` gives the hint.

### F. Wiring step 9: classifier choices in Settings
16. `settings.js` `openClassifierModels()` (~:285): under the "Without a harness" heading there is one option, `{ value: "api|", label: "Jev API", … }`. Make it three: `{ value: "kind|jev", label: "Jev", note: "TypeSafe System One" }`, `{ value: "kind|laya", label: "Laya", note: "TypeSafe System One, or your own base URL" }`, `{ value: "kind|clef", label: "Clef", note: "Cloudflare Workers AI: needs an account id" }`, plus `{ value: "kind|rules", label: "Rules only", note: "no model: the built-in rules decide" }`. Picking one saves through the existing `this.config(patch, cx)` with `{ kind: "<jev|laya|clef|rules>", harness: "" }` (look at how the "api|" pick clears the harness today at ~:305 and keep that part). Read `bh config --json` output first (run it) to see the exact keys the engine reports: `kind`, `model`, `key` (boolean), `accountId`, `baseUrl`.
17. In `classifierCard()` (~:710): the picked label shows the kind's label; when kind is `clef` show an "Account id" text field (saves `{ accountId }`), when kind is `laya` show a "Base URL" field (saves `{ baseUrl }`); copy the existing model/key field code in that card for the look and the save-on-change behaviour.

### G. Plans seats and step marks (carry-overs)
18. `work.js` seat icons (~:880, `bh-seat-${seat}`): add `.tooltip(name)` to the seat element (`gpui-kit.d.ts:947`; it is wired on plain `div`/`h_flex`/`v_flex`).
19. Leave the step checkbox marks as drawn.

## Contracts
- Engine: `bh knowledge ask "<question>" --json` → `{ started: boolean, reused: boolean, name: "knowledge-scout" }`, exit code non-zero with a message on stderr when Scout cannot start.
- Engine config keys for the classifier: `kind` (`"jev" | "laya" | "clef" | "rules" | "<harness key>"`), `model`, `key`, `accountId`, `baseUrl`. Keep them letter for letter.

## Constraints
- No new dependencies. No engine edits. No commits. No refactors beyond the items above.
- Every colour through the existing palette (`colors()`), except the command colour in item 13.
- You cannot see the app. For anything you could not confirm from `gpui-kit.d.ts`, say so in the report rather than claiming it works.

## Done when
- `npm test` passes, including the new `scrollBy` and `/bh-knowledge` route tests.
- `grep -n "WHEEL_STEP\|this.wheel\|stop_propagation?" mods/bot-herdr/chat.js` prints nothing.
- `grep -n "opacity(0)" mods/bot-herdr/indicators.js` prints nothing.
- `grep -n "bh-knowledge" mods/bot-herdr/route.js` and `grep -n "kind|clef" mods/bot-herdr/settings.js` each print a line.
- Each lettered section A–G is answered in your report as met / not met with the `file:line` that does it.

## If stuck
When the code or the typings contradict an item, stop that item, finish the others, and report what you found with the `file:line`. Never work around it with a guessed API.
