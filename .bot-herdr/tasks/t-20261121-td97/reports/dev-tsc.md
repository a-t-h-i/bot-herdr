# Dev report — make the UI typecheck real and green (t-20261121-td97, between M2 and M3)

## Summary
The UI typecheck now runs for real: `tsc --noEmit -p mods/bot-herdr/jsconfig.json` exits 0 with zero
errors (`noImplicitAny: false` plus 141 real fixes, no suppressions), and `bh check` runs it on any
change under `mods/bot-herdr/*.js`.

## Changes
- `mods/bot-herdr/jsconfig.json` — `"noImplicitAny": false` with a why line in the `// why` block
  (untyped JS, typed API surface). `strict: true` otherwise untouched.
- `mods/bot-herdr/look.js` — `MOTION`'s members and `SCRIM` typed as the shell's
  `TransitionPolicy` / `Color` (their `easing`/hex widened to `string`, which is what 34 of the
  TS2345s and every `bg(#…)` error came from); `Motion` typedef.
- `mods/bot-herdr/switch.js` — `segmented({grow = false, height = null})` and
  `stateView({line = null, action = null, loading = false})` defaults (21 TS2345: callers that
  omit them were rejected); `theme()` read as `Record<string, Color>`; `shared()` reads typed.
- `mods/bot-herdr/composer.js` — `Motion`/`ModelRow` typedefs; `minRows`/`placeholder` declared in
  `init` (work.js's page composers assign them); `modelRows` rows typed; `Number(bool) - Number(bool)`
  in the harness sort; 6 `shared()` envelope types; 3 error guards.
- `mods/bot-herdr/settings.js` — `savedFields` typed `[InputState, string][]` (the tuple literals
  inferred `(string | InputState)[][]`, which made `state.value()`/`field` unusable); the classifier
  option list typed; `e.bounds` typed at the one place that reads x/y; `shared()` reads typed.
- `mods/bot-herdr/{chat,work}.js` — `shared()` envelope types; chat's error guard.
- `mods/bot-herdr/bh.js`, `media.js` — error guards.
- `mods/bot-herdr/mdblocks.js` — `Block` typedef, so `out[0].lead = lead` types.
- `mods/bot-herdr/roster.js` — the JSDoc `@:` (a JSDoc *tag*, TS1003) becomes `"@"`.
- `mods/bot-herdr/route.js` — `mentionRows({leadName = ORCHESTRATOR_TAB})`: the required-looking
  destructured property now has the default `orchestratorOf` already applied (same result).
- `mods/bot-herdr/viewer.js` — `settings().font_family` (a `Record<string, unknown>`) cast at the
  one boundary that needs a string.
- `mods/bot-herdr/engine/scripts/check_changed.mjs` — when a changed file is `mods/bot-herdr/jsconfig.json`
  or a top-level `mods/bot-herdr/*.js` (the engine is excluded), push a `typecheck` check running the
  project's own `tsc --noEmit -p mods/bot-herdr/jsconfig.json`; when `node_modules/typescript` is
  absent it pushes a `missing` check instead, printing
  `## typecheck (…): cannot run (typescript is not installed: run npm install (needed for …))` and
  counting as a failure, so it can never read as green. `--json` carries `missing` on the entry.
- `test/windows-scripts.test.mjs` — one test: the UI check runs with those exact args; an engine
  `.mjs` change does not trigger it; without typescript it exits 1 with that message.

### Counts, before → after
| stage | errors | files |
| --- | --- | --- |
| as briefed (noImplicitAny on) | 3,208 | 46 |
| after `noImplicitAny: false` | 141 | 14 |
| now | 0 | 0 |

By code at the start: TS7006 2667, TS7031 167, TS2339 145, TS7053 75, TS2345 60, TS7022 30,
TS7018 20, TS7008 14, TS7005 10, TS7034 8, TS2353 3, and one each of TS2322, TS2362, TS2363,
TS2464, TS2538, TS2551, TS1003, TS7011.

By code after the decision (all fixed): TS2339 74, TS2345 60, one each of TS1003, TS2322, TS2362,
TS2363, TS2464, TS2538, TS2551. By file: composer 47, settings 30, work 25, chat 15, switch 8,
metrics 4, plandoc 3, toast 2, viewer 2, bh/mdblocks/media/roster/route 1 each.

### Suppressions
None. No `@ts-nocheck`, `@ts-ignore` or `@ts-expect-error` anywhere in `mods/bot-herdr/`
(`grep -c` = 0). The 48 added JSDoc annotations are casts/typedefs at boundaries the runtime leaves
untyped (`shared()` returns `unknown`, `theme()` returns `Record<string, string>`,
`settings()` returns `Record<string, unknown>`); each names the fields the mod actually reads.

### Behaviour
No runtime change, with one prescribed exception: six `catch (e)` sites went from
`String(e?.message ?? e)` to `e instanceof Error ? e.message : String(e)` (composer ×3, chat, bh,
media) as the brief asked. A thrown non-`Error` object that happens to carry `message` would now
stringify as `[object Object]`; everything else (Error, string, object without `message`) is
identical. The defaults added to `segmented`/`stateView`/`mentionRows` and the two
`Composer` fields are reached only through truthiness or `??`, so `null`/`false` reads exactly as
`undefined` did.

## Brief Check
- `noImplicitAny: false` in the mod's jsconfig with a why line, `strict` otherwise kept — **met**.
- Every remaining error fixed properly, no `@ts-nocheck`/`@ts-ignore`/`@ts-expect-error` — **met**,
  141 → 0, zero suppressions.
- No runtime behaviour change (or described instead) — **met**, one prescribed error-guard change
  described above.
- `bh check` runs the UI typecheck when files under `mods/bot-herdr/` (non-engine .js) changed —
  **met**: `## typecheck (mods/bot-herdr/jsconfig.json: the mod's UI): clean`, `Ran: 0 lint, 1 typecheck`.
- Uses the project's own `node_modules/.bin/tsc`, reports clearly when typescript isn't installed —
  **met** (via `resolveLocalBin`; the npx fallback is deliberately not taken for this check).
- Add or extend a test for that detection — **met**, `check_changed typechecks a mod's own UI project…`.
- All five checks in the brief, pasted below — **met**.

## Verification
- `npm install` — added typescript 5.9.3 to `node_modules` (gitignored, unchanged lockfile)
- `node_modules/.bin/tsc --noEmit -p mods/bot-herdr/jsconfig.json` — exit 0, no output
- `npx tsc --noEmit -p mods/bot-herdr/jsconfig.json` — exit 0
- `node mods/bot-herdr/engine/bh.mjs check` — PASS; run shows
  `## typecheck (mods/bot-herdr/jsconfig.json: the mod's UI): clean` and
  `Ran: 0 lint, 1 typecheck, 607 tests (full suite)`; `PASS: 606 tests pass, 1 skipped, typecheck passes`
- `npm test` — 607 tests, 606 pass, 1 skipped, 0 fail
- `node --test test/windows-scripts.test.mjs` — 11 tests, 11 pass
- `/home/athi/.local/bin/herdr-app check mods/bot-herdr` — `check passed` (the generated
  `mods/bot-herdr/engine/lib/gpui-kit.d.ts` was removed afterwards; `git status` clean of it)
- `node mods/bot-herdr/engine/bh.mjs ui-audit --json` — `renderErrors: {}`, 32 failures, byte-identical
  to a run of the same command on a tree exported from HEAD (`git archive` into /tmp): no new
  failures, none gone, pages/counts/contrast/a11y/features equal. `pass: false` is pre-existing
  (M1 visible-element baselines and the P1 feature list), unchanged by this work.

## Notes
- `ElementBounds` in the generated `gpui-kit.d.ts` loses its `import("gpui-kit").Point` base (the
  same file reproduced from `herdr-app` shows it too; an ambient module's `import()` heritage
  clause does not resolve, confirmed with a minimal repro), so `e.bounds.x/y` has no declared
  member. It is a one-site cast in settings.js, commented at the use.
- `TransitionPolicy`/`MotionEasing` are declared in the `gpui-shell` module, not `gpui-kit`.
- `node_modules` is gitignored: a worktree that has not run `npm install` gets a failing
  `check_changed` with the "run npm install" line rather than a silent skip. That is deliberate —
  a typecheck that cannot run must not report PASS.

## Knowledge Proposals
- herdr's `shared(key)` is declared `unknown`; each read is typed where it happens with a JSDoc cast
  naming the envelope's fields (`{ at, key, value, … }`).
- The generated `gpui-kit.d.ts` drops `ElementBounds`'s `Point` base (ambient-module `import()` in a
  heritage clause does not resolve), so `e.bounds.x/y` needs a cast; `TransitionPolicy` and
  `MotionEasing` live in the `gpui-shell` module, not `gpui-kit`.
- `mods/bot-herdr/jsconfig.json` runs with `noImplicitAny: false` (untyped JS over a typed API
  surface) and is typechecked by `bh check` through `node_modules/typescript` only.

## Script Proposals
- None.

## Blockers
- None.
