# Dev brief — make the UI typecheck real and green

Task t-20261121-td97 (between M2 and M3). The plan's acceptance criteria require `npx tsc --noEmit -p mods/bot-herdr/jsconfig.json` to exit 0, and pre-M1 was meant to wire it into `bh check` (`mods/bot-herdr/engine/scripts/check_changed.mjs`), but it never runs: check_changed only typechecks when a root `tsconfig.json` exists.

Today (jsconfig scoped to UI files in M2): 3,208 errors. 2,667 are TS7006 and about 290 more are TS7031/7053/7022/7018/7008, all implicit-any in untyped JS. About 250 are real (TS2339 145, TS2345 60, others). Worst files: work.js 650, settings.js 394, composer.js 391, chat.js 253, issues.js 194.

## Orchestrator decision
`mods/bot-herdr/jsconfig.json` is the mod's own file ("written once by gpui-shell, then yours"). Set `"noImplicitAny": false` there with a "// why" line: the mod is untyped JS and gpui-kit.d.ts types the API surface; implicit-any findings are annotation noise, not defects. Keep `strict: true` otherwise. Then **fix every remaining error properly**: real narrowing, JSDoc types where they clarify, guards for `unknown` errors (`e instanceof Error ? e.message : String(e)`). No `@ts-nocheck`, no `@ts-ignore`/`@ts-expect-error` unless one is truly unavoidable (then justify each in the report). No runtime behaviour change: these are type-level fixes. If a fix would change behaviour, describe it in the report instead of making it.

## Wire it in
Make `bh check` run the UI typecheck when files under `mods/bot-herdr/` (non-engine .js) changed, e.g. in check_changed.mjs detect `mods/bot-herdr/jsconfig.json` and run local `tsc --noEmit -p mods/bot-herdr/jsconfig.json`. It must use the project's own `node_modules/.bin/tsc` (run `npm install` first; node_modules is gitignored) and report clearly when typescript isn't installed. Add or extend a test for that detection.

## Checks (paste results)
`node_modules/.bin/tsc --noEmit -p mods/bot-herdr/jsconfig.json` (exit 0), `node mods/bot-herdr/engine/bh.mjs check` (must now show the typecheck ran), `npm test`, `/home/athi/.local/bin/herdr-app check mods/bot-herdr` (delete the generated `mods/bot-herdr/engine/lib/gpui-kit.d.ts`), `node mods/bot-herdr/engine/bh.mjs ui-audit --json` (renderErrors empty, no new failures versus before).

Don't commit. Report to `.bot-herdr/tasks/t-20261121-td97/reports/dev-tsc.md` (before/after counts by code and file, any suppressions with reasons, check results), then `bh report t-20261121-td97 --step 2 --file <that> "<summary>"`.
