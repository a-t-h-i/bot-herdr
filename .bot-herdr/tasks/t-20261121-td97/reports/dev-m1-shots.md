# M1 follow-up — real screenshots from `bh ui-audit --shots` (dev-shots)

## Summary

`bh ui-audit --shots DIR` now opens its own window on a private herdr-core, draws every audited page
over the audit's own fixtures, switches the four key themes and saves `DIR/<page>-<theme>.png`.
The run captured 44 PNGs (11 pages × graphite, paper, ink, moss) with no live window, spaces or
agents in them, and removes its window, core and temp home whatever happens.

## Changes

- `mods/bot-herdr/engine/lib/ui-audit-shots.mjs` (new) — the shot stage: `keyThemes` (graphite,
  paper, then the two weakest text/focus presets from the contrast run), `shotPlan` (page × theme
  file names), `captureShots` (temp `HERDR_APP_HOME` + private core, launch detached, wait for
  `herdr-app status`, create the space, switch layout, per theme write the picker + appearance and
  per page `layout.select`, then `herdr-app shot`), and `finally` kill window → `hc server stop` →
  remove the temp folder. A window that cannot open or a failing command returns `skipped` and
  keeps whatever was already captured.
- `mods/bot-herdr/engine/lib/ui-audit-fixtures.mjs` — `shotFixtureSource()` generates the temp
  app's `audit-pages.js`: every audited page's props plus the same `SEEDS`/`DATA`/`ROSTER` the
  headless audit uses.
- `mods/bot-herdr/engine/lib/ui-audit.mjs` — imports `shotsStage` from the new module; the old
  per-theme/no-window code and its `keyThemes` are gone; the text report lists the PNG count.
- `test/ui-audit.test.mjs` — two tests: the shot plan is one `<page>-<theme>.png` for all 11 pages
  × 4 themes (44 unique names), and a run that cannot capture kills the window, stops the core and
  removes its temp home (spawn mocked; both "no window" and "command throws" cases).
- `.bot-herdr/tasks/t-20261121-td97/shots/m1/` (new) — 44 PNGs from the required run.
- No UI code changed and no audit target was touched.

How the temp window gets the fixtures without changing the real mod:

- the temp copy's `main.js` becomes a wrapper (`ShotPage`) that reads the block's `props.audit`,
  mounts the real `bot-main.js` with that page's props and seeds `inner.page` with the audit's
  state, so the first frame is the seeded page, never "Loading…";
- the temp copy's `bh.js` answers every call with a never-resolving promise, so no later load can
  replace the seeded fixture state with this empty temp project;
- the copied layout gets one block per audited page carrying its `audit` id, and the top pair is
  a bare light/dark theme so the picker's name is what shows.

## Brief Check

The brief has no separate "Done when" list; its Build items 1–6 and Checks:

1. **Temp app home, mod, layout, themes and the deterministic fixture project** — met.
   `stageApp` copies `mods/bot-herdr`, `themes/` and the repo layout into a
   `mkdtemp` home, folds in the fixture wrapper (`foldFixtures`) and writes
   `audit-pages.js`; `settings.json`, `shared.json` and `update-notes.json` are seeded. The window
   shows fixture tasks, plans, issues, lessons, metrics and the six-agent roster (see the PNGs).
2. **Suppress welcome/onboarding** — met. The real home shows the marker in `shared.json`
   (`"frame.welcomed":"finished"`), not `seen.json` (mod bookkeeping); the temp home writes that key
   and `update-notes.json` with the running app's version so no "Updated to … What changed" toast
   appears. No overlay is in any frame.
3. **Launch detached, wait for the window, 4 key themes × each audited page, `shot`** — met:
   44 PNGs. Navigation is `layout.select --stack pages --child <id>` (the mod registers no route
   command); the switch page is hidden from the top bar for its own shot so it is drawn once, as
   the audit page. Themes needed one extra fact: the copied layout has a light/dark theme pair and
   `app.theme` only sets the half `settings.json`'s `appearance` selects, so each theme calls
   `app.theme` *and* writes the picker name + appearance into the temp `settings.json` (live);
   without the appearance half, paper rendered dark.
4. **Kill the temp window, remove the temp home (try/finally, also on timeout); never touch the
   live config or window** — met. The run overrides `HERDR_APP_HOME`, `HOME`, `XDG_CONFIG_HOME`
   and `HC_SOCKET` to a private core and drops the caller's `HC_*` terminal vars, so the window,
   spaces and agents are its own; `finally` kills the window process group (SIGTERM, then SIGKILL),
   stops the temp core with `hc server stop` and removes the folder. Verified: no
   `/tmp/bh-ui-shots-*` remains and only the person's core (pid 25921) is running; the multi-minute
   command was run under `timeout` and still cleaned up (one `timeout` kill of a manual probe left
   nothing behind either).
5. **Record `shots: {dir, themes, files:[…]}`; keep `skipped` when no window can open** — met:
   success is `{dir, themes:[…], files:[44 absolute paths in page order]}`, `skipped` is absent;
   `launch` not-ready (no display) returns `{dir, themes, files: [], skipped: reason}`, and a
   failing command keeps its reason plus the files captured so far.
6. **Look at PNGs** — met: inspected tasks, tasks-board, settings, settings-general, issues,
   metrics, learning, plans, knowledge, chat, switch and chat/paper across graphite, paper, ink and
   moss. They show bot-herdr pages with fixture data in the right theme, the fixture space in the
   left rail, no welcome, no update toast and no live agents.
7. **Checks** — met; see Verification. `--page`/`--theme` filters still leave the shot plan on all
   pages × the key themes (same as before).

## Verification

- `node mods/bot-herdr/engine/bh.mjs check` — PASS (9 targeted tests: the two new shot tests plus the 7 existing audit tests)
- `npm test` — 605 pass, 1 skipped (pre-existing), 0 fail
- `/home/athi/.local/bin/herdr-app check mods/bot-herdr` — `check passed`; its generated `mods/bot-herdr/engine/lib/gpui-kit.d.ts` deleted afterwards
- `node mods/bot-herdr/engine/bh.mjs ui-audit --json --shots .bot-herdr/tasks/t-20261121-td97/shots/m1` — exit 0, `pass:false`, 35 findings (all 8 Fix rows: destinations 11>5, zeroCountChips 9, repeatedDefaultStrings 5, statsPerCard 8, selectionStyles 2, rawMachineText 4, decorativeIcons 3, agentColourFills 13; plus hexOutsideTokens 14, 11 visibleElements, 4 accentButtonsPerView, coverage, 7 features, 2 controlBorder), `renderErrors {}`, `shots: {themes: [graphite, paper, ink, moss], files: 44}`
- `read` on 12 PNGs — fixture data and theme checked visually; the knowledge page is chips-only because the audit seed itself sets no note body (the headless page is equally sparse)

## Notes

- The switch page is the top bar in normal use; its shot hides the top bar's copy
  (`layout.hide --id switch`) and selects a `switch-page` block, so the switch is drawn once as the
  audit's page.
- `shotPlan` page order is `AUDIT_PAGES` order and the JSON lists files in that order (the capture
  loop is theme-major for fewer theme switches).
- The shot stage adds ~75 s to a `ui-audit` run (44 frames at ~1.4 s each after the 2 s launch
  settle).

## Knowledge Proposals

- `herdr-app shot` needs a painted first frame: poll `herdr-app status` until it answers, then wait
  ~1.2 s before the first shot.
- `app.theme {name}` only sets the half of a layout's `{light,dark}` theme that `settings.json`'s
  `appearance` selects; to show a light preset, write `appearance: light` and `theme` into
  `settings.json` (it is live) as well as calling `app.theme`.
- The welcome is marked seen by `shared.json` `"frame.welcomed":"finished"`; `seen.json` is mod
  bookkeeping, not the app's first-run marker. `update-notes.json` `last_run` = the app version
  suppresses the "Updated to … What changed" toast.
- A temp `HERDR_APP_HOME` still uses the caller's herdr-core unless `HOME`, `XDG_CONFIG_HOME` and
  `HC_SOCKET` point at a fresh one; the app then starts its own core, which outlives the window and
  must be stopped with `hc server stop` (same env).
- `herdr-app check mods/bot-herdr` writes `mods/bot-herdr/engine/lib/gpui-kit.d.ts`; delete it after
  the check.
- A body copy of a top-bar layout block needs another id (`switch-page`): layout ids must be unique.

## Script Proposals

None: the shots are part of `bh ui-audit --shots`, which the audit's own checks already run.

## Blockers

None.
