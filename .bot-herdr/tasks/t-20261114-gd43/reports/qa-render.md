## Summary
PASS — step 4 (feed built once per frame) is correct: `entryAt` gives the same answer in every reachable case, the cache cannot go stale, and nothing asks the roster per entry any more.
Full suite green (263 pass, 1 skipped). 1 minor, 3 info findings; none block.

## Changes
None. Review only: no production code and no tests edited.

## Brief Check
- `entryAt` gives exactly the old answer — met. Old: target address → `leadEntry()`, else `names()[address]` → first roster entry with that name. New (`composer.js:477-489`): every roster entry at its `runningAs` address, then the lead at `orchestratorOf(...)`. `orchestratorOf` and `runningAs` use the same filter and sort (space, trimmed lower-case tab name, lowest seq), so the lead's own pass and the target override land on the same address. No running agent → empty map → null, as before. The lead at its target → the lead. A tab matching a roster name → that entry.
- Two roster agents with one name — the only divergence: new is last-wins, old was first-wins. It can't happen today, because `roster()` (`roster.js:142-148`) returns only the six stock roles with fixed, distinct names. See the minor finding.
- Stale cache — met. Every feed change replaces `this.entries` (`push` at `feed.js:62` copies the array and its KEEP slice; comments go through `setFeed`, which uses a new array from `onComments`/map; the rename at `chat.js:323` maps to a new array). No code edits an entry in place (grep found no `e.text =`-style assignment in chat.js). So text changing, a trim at KEEP and a removal all miss the cache on `entries` identity. A space switch misses on `space`. An agent starting or stopping changes the map's size or addresses. A lead change flips a `lead` flag at an address. The cache keys on everything `childEntry` reads (address presence and `lead`), so `items` can't differ from a rebuild. The cached array goes only to read-only callers (`shown` filters and slices it, `feedHeights` maps it, `showTaskCard` searches it), so none of them mutates it.
- Nothing per entry or per frame — met. `entriesByAddress` runs once each in `items`, `workers` and `railRows` per frame: three O(roster + agents) passes. `entryAt` is left only at `composer.js:1275` and `composer.js:1296` (per send), and `chat.js` no longer calls it.
- Round 1 findings (name-keyed live part; total lacks live part): not touched by step 4. They stay open as minor, outside this step.
- HIGH-risk focus areas (security, concurrency, isolation): this change is UI rendering only. It touches no auth, locks or worktree code, and the full suite (lock and worktree tests included) passes.

## Findings
- [minor] Duplicate roster names resolve to the last entry, not the first — `mods/bot-herdr/composer.js:484`. Expected: the first roster entry with the name, as the old `roster().find(a.name === name)` gave. Observed: `byAddress.set` overwrites, so the last one wins. Not reachable now, because `roster()` drops custom agents and the stock names are distinct. Fix: `if (running && !byAddress.has(running.address)) byAddress.set(...)`.
- [info] There's no test of `Composer.entriesByAddress` itself. `test/feed-items.test.mjs` stubs the composer, and bh check reports "No test found for: mods/bot-herdr/composer.js". The equivalence above is checked by reading the code. A small test with a lead, a named tab and an unknown address would pin it, if composer.js gets a harness.
- [info] The `at.last === lastId(...)` key at `chat.js:1050` adds nothing beyond `at.entries === this.entries`, since every change replaces the array. It's harmless; keep it or drop it.
- [info] The new tests are behavioural and lean: one lookup per 300 replies, fold rules, rebuilt on a new reply. No bloat. They don't cover a cache miss on an address or lead change. The code reads correctly there.

## Verification
- `node bh.mjs check` — PASS: ran the full suite (npm run test), 264 tests, 263 pass, 1 skipped, 0 fail (the step-4 receipt's diff hash d3a28262 does not match tree d95122b2, so I re-ran it)
- `git diff --cached` on chat.js and composer.js — read in full; callers, mutation and consumer paths grepped as cited above
- `node --test test/feed-items.test.mjs` on its own — not run (permission refused); the full suite covers it
