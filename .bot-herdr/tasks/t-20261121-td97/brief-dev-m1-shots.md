# Dev brief — M1 follow-up: real screenshots from `bh ui-audit --shots`

Task t-20261121-td97, step 1. The M1 audit is committed on the task branch (see `reports/dev-m1.md`). It currently records `shots: {skipped}` because `herdr-app shot` needs a window. The Orchestrator verified that a window CAN be opened in a temp home here (Wayland `WAYLAND_DISPLAY=wayland-0`):

```
H=$(mktemp -d); HERDR_APP_HOME=$H herdr-app &      # socket appears at $H/herdr-app.sock within ~5 s
HERDR_APP_HOME=$H herdr-app shot out.png           # works; captured a 1280x820 frame
```

But the frame showed the **Welcome to Herdr** onboarding dialog over an empty workspace, not bot-herdr.

## Build
Make `bh ui-audit --shots DIR` capture real bot-herdr pages itself:
1. Create a temp `HERDR_APP_HOME`, install the mod there (copy `mods/bot-herdr`, the `layouts/bot-herdr.json`, keys/themes as `install.mjs` does; reuse install.mjs helpers or the audit's existing temp-app code) with the deterministic fixture project (the same seeded fixtures the audit uses; the window's first frame must show data, not "Loading…" — wait for the async loads or poll `herdr-app status`).
2. Suppress the welcome/onboarding (look at the real `~/.config/herdr-app/seen.json`, `settings.json`, `view.json` for which keys mark it seen, read-only; and `herdr-app commands` for `app.welcome`, `app.theme`, layout/tab commands; `~/.config/herdr-app/AGENTS.md` documents the app).
3. Launch the window detached, wait for the socket, then for each of the 4 key themes (graphite, paper, plus the two contrast-edge presets the audit picks) switch the theme with `herdr-app do app.theme …`, and for each audited page navigate to it (`herdr-app do …` / the mod's own route command), then `herdr-app shot DIR/<page>-<theme>.png`. Each page × 4 themes.
4. Always kill the temp window and remove the temp home afterwards (try/finally, also on timeout). Never touch the live `~/.config/herdr-app` or the user's window: always pass the temp `HERDR_APP_HOME` explicitly.
5. Record `shots: {dir, themes, files:[…]}` in the JSON. If a window can't open (no display), keep the existing `skipped` path.
6. Look at a few PNGs yourself (read the image) to confirm they show bot-herdr pages with fixture data in the right theme.

Add a test for the shot plan (pages × themes file names, cleanup on failure) with the spawn mocked. No UI behaviour changes. Don't loosen any audit target.

## Checks
`node mods/bot-herdr/engine/bh.mjs check`, `npm test`, `/home/athi/.local/bin/herdr-app check mods/bot-herdr` (delete the generated `mods/bot-herdr/engine/lib/gpui-kit.d.ts` it writes), then `node mods/bot-herdr/engine/bh.mjs ui-audit --json --shots .bot-herdr/tasks/t-20261121-td97/shots/m1` (exit 0, pass:false, 8 Fix rows failing, shots listed).

Don't commit. Report to `.bot-herdr/tasks/t-20261121-td97/reports/dev-m1-shots.md` and `bh report t-20261121-td97 --step 1 --file <that> "<summary>"`.
