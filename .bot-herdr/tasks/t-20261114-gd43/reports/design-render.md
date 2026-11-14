## Summary
The chat's feed no longer rebuilds the roster per reply: who is a child is resolved from one address→entry map per feed pass, and the feed itself is cached per frame. Over 300 replies an `items()` call now does one `roster()` pass instead of 700 (2,100 to 3 per frame across the three callers).

## Changes
- `mods/bot-herdr/composer.js`: new `entriesByAddress()` — one `roster()`, one `agents()`, one `orchestratorOf()`; the lead's address maps to the lead entry, every other running roster entry to its address. `entryAt(address)` is now `entriesByAddress().get(address) ?? null`. Remaining `entryAt` callers (composer.js:1275, :1296) run per send, not per frame.
- `mods/bot-herdr/chat.js`:
  - `items(space)` builds the map once and passes it to the child test; the result is cached in `this.feedCache` and reused while the space, `this.entries` (same array, same length, same last id) and the map (same addresses, same lead) hold. The three callers (686, 879, 1041) take the cached value unchanged.
  - `childEntry(e, byAddress)` reads `byAddress.get(e.from.address)` instead of calling `entryAt` per entry; same rule (an entry is a child unless its entry is the lead, or, with no entry, unless the name is `Orchestrator`).
  - `workers()` and `railRows()` (step 4, the other per-frame `entryAt` callers) each build the map once and read from it.
  - Module helpers `lastId()` and `sameAddresses()`; `this.feedCache = null` in `init`.
- `test/feed-items.test.mjs` (new): loads `chat.js` through a small loader stub for `gpui-kit`/`gpui-base`/`herdr`/`fs/promises` (names scanned from the sources, so a new import needs nothing added), then drives `Chat.prototype.items` on a plain page object with a composer stub that counts lookups.
  - 300 agent entries: 1 lookup (previously one `entryAt` per entry).
  - lead entry stands alone, child entry folds, an entry with no running agent goes by its name (folded for `Dev`, not for `Orchestrator`).
  - the same array comes back on a second call, and a different one after an entry is added.

## Brief Check
- the new tests pass — met: `node --test test/feed-items.test.mjs` → 3 pass.
- `node mods/bot-herdr/engine/bh.mjs check` prints PASS — met: `PASS: 263 tests pass, 1 skipped; no lint or typecheck is set up`.
- `herdr-app check mods/bot-herdr` passes — met: `check passed: mods/bot-herdr`.
- tsc shows no TS2304/TS2552 in my files — met: the only TS2304/TS2552 hits are in `mods/bot-herdr/engine/**` (pre-existing, outside my files).
- roster() calls per `items()` over 300 entries, before and after — before 700 (900 when every reply is a child's; used a counting script that runs the old `entryAt` body against the real `Composer` methods with a counting `roster`), after 1. Per frame (three `items()` calls): 2,100 → 3.

## Verification
- `node --test test/feed-items.test.mjs` — 3 pass, 0 fail.
- `node mods/bot-herdr/engine/bh.mjs check` — PASS, 263 tests pass, 1 skipped.
- `herdr-app check mods/bot-herdr` — check passed.
- `npx -y -p typescript@5 tsc -p mods/bot-herdr/jsconfig.json --noEmit` — no TS2304/TS2552 outside `engine/`.
- Throwaway `/tmp/count2.mjs` (not committed): 300 replies over the real `Composer` methods → old `entryAt` path 700 `roster()` calls, new `entriesByAddress()` 1, and `entryAt("dev")/("lead")/("other")` → `Dev` / `Orchestrator` / `null` as before.

## Notes
- The test needs `chat.js`, which imports `gpui-kit`/`gpui-base`/`herdr` (herdr's runtime only). Instead of moving the logic out of `chat.js` (files I own are `chat.js`, `composer.js` and a new test), the test file registers a small loader stub that provides those names as callables and `fs/promises.exists`. It is ~35 lines, contained in that one test file and generated from the sources.
- `entriesByAddress()` itself is not covered by a direct test: `composer.js` imports the same herdr runtime and its `agents()` cannot be injected. It is verified by the counting script above and the typecheck.
- `mods/bot-herdr/gpui-kit.d.ts` shows as modified in `git status` with no content change (line endings); not mine, left untouched.
- Not done, by the brief: windowing/virtual scrolling of the feed.

## Knowledge Proposals
- A chat-page method can be unit-tested even though `chat.js` imports `gpui-kit`/`herdr`: register a loader stub for those specifiers (`test/feed-items.test.mjs`) and drive `Chat.prototype` on a plain object.
- `Composer.entriesByAddress()` is the one way to resolve running agents to roster entries in bulk; `entryAt()` is now a single lookup and must not be called per feed entry (300 entries × 3 calls per frame rebuilt the roster ~2,100 times and tripped herdr's render timeout).
