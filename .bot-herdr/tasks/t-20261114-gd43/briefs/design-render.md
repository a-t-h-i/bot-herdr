Goal: step 4 of task t-20261114-gd43. The app's Chat view shows "This view could not be rendered: interrupted". herdr stops a render that takes too long. The feed has about 300 entries, and the user's stack trace shows where the time goes:
roster.js `clean` ← `roster()` ← composer.js `roster()` ← `leadEntry()` ← `target()` ← `entryAt()` ← chat.js, inside a `map`.

The cause: chat.js `items(space)` (line 1026) runs `groupChildren(mine, (e) => this.childEntry(e))`. `childEntry` (line 1032) calls `this.composer.entryAt(e.from.address)` once for every agent entry. Each `entryAt` call (composer.js:473) does three things:
- it runs `target()`, which calls `leadEntry()`, then `roster()` (which rebuilds and cleans the whole roster), then `agents()`;
- it runs `leadEntry()` again;
- it runs `names()`, which calls `roster()` once more and `runningAs` for each roster entry over `agents()`.
`items()` is itself called up to three times per frame (chat.js:686, :879, :1041). So each frame rebuilds the roster about 300 × 3 × 3 times.

Files you own: mods/bot-herdr/chat.js, mods/bot-herdr/composer.js, and a new test file test/feed-items.test.mjs (or extend test/feed-thread.test.mjs if its helpers fit). Leave alone: roster.js, the engine, and every other file.

What to do:
1. composer.js: add `entriesByAddress()`. It returns a `Map` of running address → roster entry for this space, built in one pass: one `roster()`, one `agents()`, one `target()`; the lead's address maps to `leadEntry()`, and every other running roster agent maps to its entry, as `names()` finds them. Rewrite `entryAt(address)` as `this.entriesByAddress().get(address) ?? null`, so its results stay exactly the same.
2. chat.js `items(space)`: build `const byAddress = this.composer.entriesByAddress()` once, and pass it to the child test, so that `childEntry(e, byAddress)` reads `byAddress.get(e.from.address)` instead of calling `entryAt`. Keep the same rule: an entry is a child unless its entry is the lead, or, with no entry, unless `e.from.name === "Orchestrator"`.
3. chat.js: compute the feed once per frame. Cache the result of `items(space)` and reuse it while the space, `this.entries` (same array and same length, and the same last id) and the address→entry map (same addresses and the same lead) are unchanged; rebuild it otherwise. Make the three callers (686, 879, 1041) get the cached value.
4. Look at the other per-frame call sites of `entryAt` (chat.js:737 in `workers()`, :773). If they run per frame per agent, give them the same map; they are few, so leave them as they are if the map is not easy to reach.
5. Tests, each failing without its change:
   - `items()` over 300 agent entries calls `roster()` (or `entriesByAddress`) at most once per `items()` call. Use a stub composer that counts calls.
   - The child/lead result for a lead entry, a child entry and an entry with no running agent is the same as before.
   - The cache returns the same array on a second call with nothing changed, and a new one after an entry is added.

Constraints: no new dependencies, functions at or under 20 lines, no refactors beyond this. Don't add windowing or virtual scrolling; that is a separate decision. Use `node mods/bot-herdr/engine/bh.mjs …` for bh commands.

Done when:
- the new tests pass;
- `node mods/bot-herdr/engine/bh.mjs check` prints PASS;
- `herdr-app check mods/bot-herdr` passes;
- `npx -y -p typescript@5 tsc -p mods/bot-herdr/jsconfig.json --noEmit` shows no TS2304/TS2552 in your files;
- in your report, the number of `roster()` calls per `items()` call over 300 entries, before and after, from a quick count.

Report: write the report file this brief's footer names, record it with `bh report` (with `--step 4`), and `hc send` your parent the summary and the path.

If stuck: if the code doesn't match this brief, stop that part, finish the rest, and report it under Blockers.
