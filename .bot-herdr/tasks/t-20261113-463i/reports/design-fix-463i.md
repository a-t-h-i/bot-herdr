# design-fix-463i — QA's two blocking findings fixed

## Summary
The Settings More dialog now resolves the live page through a module-level page-id registry instead of serialized overlay props, so agent/harness/classifier dialogs draw and save. A missing file is detected with the runtime's `exists()` (its `fs/promises` has no `stat`) and shows "This file isn't there…".

## Changes
- `mods/bot-herdr/settings.js`
  - `PAGES` (module-level `Map`) + `pageSeq`; `Settings.init` sets `this.pageId` and registers itself (`PAGES.clear()` then `set`, so the map holds only the latest page — no teardown hook exists on `Settings`).
  - `openMore({ kind, key, pageId })` passes `pageId` in props: `{ view: "settings-more", kind, key, pageId }`; `disclosure` passes `this.pageId`.
  - `MoreSheet`: dropped `this.page`; added `page()` → `PAGES.get(this.p.pageId)`, resolved on every render. `heading` reads the agent via `page?.list()` (no method call when the page is missing); `body` keeps the "The settings page is no longer open." fallback.
- `mods/bot-herdr/viewer.js`
  - `FileView.init` catch: `const there = await exists(path).catch(() => true)`; present → "Couldn't read this file (too large, or not readable).", absent → "This file isn't there. It may have moved, or it lives in another folder." Dead `e?.code === "ENOENT"` branch removed (the runtime never sets `code`).
  - Import `{ readFile, exists }` from `fs/promises`.
- No other UI change; the Access card's `Repo history` row untouched; `engine/` and `test/` untouched.

## Brief Check
- **Registry shared between page and overlay (verified first)** — met. Throwaway `%TEMP%\df-463i` home, probe mod: page registers `pageId` in a module `Map`, overlay `init` reads it → `{"pageId":"page-1","found":true,"stamp":"live-page","greet":"hello-from-page","size":1}` (`out/realm.json`). One JS realm; kept the design.
- **Agent More shows its rows (screenshot)** — met. `shot-agent.png`: "Orchestrator" heading, Arguments, Instructions, `claude`.
- **Harness More shows its rows (screenshot)** — met. `shot-harness.png`: "Add a harness", Key/Name/Command fields, Add.
- **Classifier More shows its rows (screenshot)** — met. `shot-classifier3.png`: "Use it for" chips, three threshold fields 0.5 / 0.7 / 0.8.
- **Editing an agent's Arguments saves; re-open shows it** — met. Probe typed through the live `InputState` (`replace`, the same `change` the dialog's input fires) → `out/saved.json` reads back `args: "--e2e-args"` from the page's roster; the throwaway app home's `data/bot-herdr/agents.json` holds `"args": "--e2e-args"` (bh `team save` ran) and `herdr-core/templates/` was rewritten there; the reopened dialog shows `--e2e-args` and `claude --e2e-args` (`shot-edit.png`, also visible behind a later overlay in `shot-missing2.png`).
- **Missing file ref → "This file isn't there…"** — met. `shot-missing4.png` on `…/nope/missing.js`.
- **Real file still shows its text** — met. `shot-real.png`: `sample.js` with line numbers and syntax.
- **herdr-app check mods/bot-herdr** — met, `check passed`.
- **tsc: no TS2304/TS2552 outside engine/** — met (0 matched; 3442 other pre-existing errors).
- **bh check** — met, `PASS: lint and typecheck pass, tests pass.` (41 pass, 1 skipped).

## Verification
- `herdr-app check mods/bot-herdr` — `check passed: mods/bot-herdr`
- `npx -y -p typescript@5 tsc -p mods/bot-herdr/jsconfig.json --noEmit | grep -E "TS2304|TS2552" | grep -v engine/` — no output (0)
- `node …/engine/bh.mjs check` — PASS, 42 tests, 41 pass, 0 fail, 1 skipped
- Throwaway `HERDR_APP_HOME=%TEMP%\df-463i` + `APPDATA=%TEMP%\df-463i\appdata` window (started with `env -u BH_AGENT` so Settings' bh save isn't refused as an agent calling `bh team save`), mod copy of the repo, temp-only probe view in the copy (never in the repo): realm probe + the three dialogs + the edit round-trip + both viewer cases — screenshots `%TEMP%\df-463i\shot-{agent,harness,classifier3,edit,missing4,real}.png`, `out\*.json`
- Temp app and its space closed afterwards; the user's window still reports `overlays: []`, `errors: []`, layout `bot-herdr`, and only its original tabs.
- **Not executed:** a real pointer click on the card's More button (headless; no pointer automation on the display). The dialog was opened with the exact props `openMore` builds (`{view:"settings-more", kind, key, pageId}`) against a real `Settings`-registered id, and renders through the unchanged `MoreSheet`.

## Notes
- `Settings.init` clears the registry on register, so with two Settings pages at once (only possible in a layout with two settings blocks) the older page's open dialog falls back to "The settings page is no longer open." — the brief's chosen behaviour; seen only with stacked probe tabs.
- Probe artifact worth knowing: a herdr app started from an agent shell carries `BH_AGENT`, and its mods' `exec` then makes `bh team save` refuse. Not a product bug.

## Pushback
- **Request:** the brief's `stat(path)` from `fs/promises` — **Reason:** the mod runtime's `fs/promises` exports `readFile`, `writeFile`, `readdir`, `exists`, `unlink`, `rmdir`, `mkdir` only (`gpui-kit.d.ts` module declaration; `herdr-app check` rejects `import { stat }` with "Could not find export 'stat'"). — **Alternative:** used the runtime's own absence check, `exists(path)` (verified: `false` for the missing path, `true` for a real one), which is exactly the information `stat` was there to give. Implemented as `await exists(path).catch(() => true)`.

## Knowledge Proposals
- Overlay props are serialized (data only); the overlay still runs in the same module instance as the page, so a module-level `Map` is a valid handoff — pass an id in props, look the live page up in the map.
- The mod runtime's `fs/promises` has no `stat`; use `exists(path)` (boolean) or `herdr`'s `readTextFile` (null when absent). `readFile` rejects with a plain `Error`, no `code`.
- `InputState.set_value` does not fire `change`; `InputState.replace` does (one change, inserted at the caret) — the way to drive an input's change path from a probe.
