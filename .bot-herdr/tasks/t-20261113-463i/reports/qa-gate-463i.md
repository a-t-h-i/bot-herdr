# QA gate — t-20261113-463i

## Summary
Verdict: **CHANGES_REQUIRED**. The viewer fix works for a real file (text renders), but a missing file shows "Couldn't read this file…" instead of "This file isn't there…", and the Settings More modal cannot work at all: overlay props are serialized, so the live `Settings` instance arrives as plain data without its methods — agent More crashes the render, harness/classifier More show "The settings page is no longer open.".

## Changes
None. Review only (probe mods and screenshots were made in a throwaway `HERDR_APP_HOME`, never in the repo or the user's app home).

## Findings

### [critical] Settings More modal never draws the page's rows — `mods/bot-herdr/settings.js:88-95, 1052-1113`
**What breaks.** `openMore` puts the live `Settings` instance in `props` (`page: this`, settings.js:95). Overlay props cross a serialization boundary: plain data survives, functions and prototypes do **not**. So in `MoreSheet`, `page.agentMore` / `harnessMore` / `classifierMore` / `list` are all undefined:
- kind `agent`: `MoreSheet.heading` calls `this.page?.list().find(...)` (settings.js:1066) → `TypeError: not a function` → the overlay shows *"This view could not be rendered / not a function at heading"*.
- kind `harness` / `classifier`: body returns the fallback *"The settings page is no longer open."* — no rows, nothing to save.

**Expected.** The dialog shows the same rows as the card and saves through the page.

**Observed.** Reproduced with the repo's own `MoreSheet` (copied to a temp mod so props behave exactly as in production):
```
{"pageType":"object","marker":"page-marker","inputs":{"a":"state-from-page"},
 "call":"no-greet","agentMore":"ERR not a function"}
```
and the two renderings: harness kind → "Add a harness" + "The settings page is no longer open."; agent kind → render crash box.

**Reproduce.** Temp home, block `{ "mod": "<copy of bot-herdr>", "props": { "variant": "harness" | "agent" } }`; a probe `init` opens `MoreSheet` with `props: { view: "settings-more", kind, key, page: <instance> }`.
Evidence: `%TEMP%\hq-463i\shot-sheet-harness.png`, `%TEMP%\hq-463i\shot-sheet-agent.png`, `%TEMP%\hq-463i\out\sheet.json`.

**Fix direction (not applied).** Props can carry data only. Pass a key (`kind`, agent id) and resolve the live page inside the mod, e.g. a module-level registry the page registers itself in (`const PAGES = new Map()` in settings.js, `Settings.init` registering itself), or have the sheet own its own `InputState`s and call `bh` directly. Do not put the instance in props.

### [major] Missing file shows the wrong message — `mods/bot-herdr/viewer.js:79-82`
`readFile` in the mod runtime is not node's `fs/promises`: it rejects with a plain `Error` **with no `code`**:

```
{"missing":{"code":null,"name":"Error","ctor":"Error",
  "msg":"cannot read `Desktop\\bot-herdr\\nope\\missing.js`: The system cannot find the file specified. (os error 2)"}}
```
(probe: `%TEMP%\hq-463i\out\fs.json`)

So `e?.code === "ENOENT"` is always false and the ENOENT branch is dead code. Screenshot `shot-missing.png`: **"Couldn't read this file (too large, or not readable)."** where the acceptance requires "This file isn't there. It may have moved, or it lives in another folder.".

Fix direction: detect absence without `code` — `readTextFile(path)` (returns null when absent) or `stat`/`access` first, or match the runtime's message; keep the catch for everything else.

### [minor] A binary above the read limit reports "Couldn't read…" — `mods/bot-herdr/viewer.js:74-82`
Small NUL-bearing binary → "This is not a text file. Open it in its app." (correct, `shot-smallbin.png`). `herdr-app.exe` (above the shim's read cap) → "Couldn't read this file (too large, or not readable)." (`shot-binary.png`). The wording covers it, but a large PNG/zip misses the "not a text file" branch. Old `readTextFile` was worse here (it said "isn't there"), so not a regression.

### [info] The installed mod copy is stale
`~/.config/herdr-app/mods/bot-herdr/{viewer,settings,main}.js` still contain `readTextFile` and no `MoreSheet`; `node install.mjs` must run (after the fixes) before the user's window shows anything new.

## Brief Check
- **A file ref opens the popup with the file's text** — met. Real file rendered with syntax and the header line (`shot-text.png`, viewer.js at line 70).
- **Missing file → "This file isn't there…"** — not met (`shot-missing.png`).
- **Unreadable → "Couldn't read this file…"** — met (that path is what missing/big files show).
- **Binary → "This is not a text file"** — met for ordinary binaries; minor gap above the read cap.
- **Every Settings card one fixed height** — met. Rendered page: all four cards in a row end on the same line and every More sits on the common foot (`shot-settings.png`).
- **More / Add / Advanced open a `frame: "none"` dialog, view `settings-more` → `MoreSheet`** — met; the dialog opens centered over a dimmed page with its own title and X.
- **…that shows the same rows, saves through the page** — not met; see [critical].
- **Closes on Esc, its X, or a click beside it** — not executed. X is `closeOverlay`; Esc and click-beside are the framework's for a non-modal `dialog` (`herdr.d.ts` OverlaySpec/closeOverlay); the dialog did close with `herdr-app do overlay.close`. No defect found in the code.

## Verification
- `node "…/engine/bh.mjs" check` — PASS (lint + typecheck + 41 pass / 1 skipped).
- `herdr-app check mods/bot-herdr` — `check passed: mods/bot-herdr`.
- `npx -y -p typescript@5 tsc -p mods/bot-herdr/jsconfig.json --noEmit` — 3443 pre-existing errors, **0 `TS2304`/`TS2552` outside `engine/`**.
- `node --test` — 187 tests, 186 pass, 1 skipped, 0 fail (includes the pwha task's `repo-history.test.mjs`; not this task's).
- Temp `HERDR_APP_HOME=%TEMP%\hq-463i` app instance, probe mod (props boundary) — data survives, methods dropped (`out\sheet.json`).
- Same instance, real repo `FileView` on `mods/bot-herdr/viewer.js:70` — text renders (`shot-text.png`).
- Same instance, nonexistent path — "Couldn't read this file (too large, or not readable)." (`shot-missing.png`).
- Same instance, 23-byte file with NUL bytes — "This is not a text file. Open it in its app." (`shot-smallbin.png`).
- Same instance, `herdr-app.exe` — "Couldn't read this file (too large, or not readable)." (`shot-binary.png`).
- Same instance, runtime `fs/promises.readFile` error shape — `{code: null, name: "Error", msg: "cannot read `…`: The system cannot find the file specified. (os error 2)"}` (`out\fs.json`).
- Same instance, repo `MoreSheet` with a serialized page — harness: fallback message; agent: `heading` throws (`shot-sheet-harness.png`, `shot-sheet-agent.png`).
- Same instance, repo `Settings` page — cards share one height, More on a common foot (`shot-settings.png`).
- Temp window killed; the user's app (`C:\…\.config\herdr-app`, layout `bot-herdr`) still answers `herdr-app status` with no overlays and no errors.

## Knowledge Proposals
- Overlay `props` are serialized (JSON-shaped): plain data survives, functions/prototypes do not. Never pass a live view instance to `openOverlay`; pass a key and look the instance up in a module-level registry.
- In the mod runtime, `fs/promises.readFile` rejects with a plain `Error` and no `code` (`cannot read \`<path>\`: … (os error N)`); absence must be detected with `readTextFile`/`stat`, not `e.code === "ENOENT"`.

## Script Proposals
None.

## Blockers
None.
