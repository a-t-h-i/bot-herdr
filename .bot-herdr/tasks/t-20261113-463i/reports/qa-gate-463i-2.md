# QA gate round 2 — t-20261113-463i

## Summary
Verdict: **PASS**. Round 1's critical (serialized `page` in overlay props) and major (missing file message) are fixed and reproduce correctly; the new `pageId` registry renders agent/harness/classifier dialogs and their edits save through the page. Two new minor defects (fallback title, duplicate dialogs on a fast double click) do not block.

## Changes
None. Review only; probes ran in a throwaway `HERDR_APP_HOME=%TEMP%\hq2-463i` + redirected `APPDATA`, never in the repo or the user's app home.

## Findings

### [minor] A More dialog whose Settings page went away retitles itself "Classifier" — `mods/bot-herdr/settings.js:1082-1089`
With `page` undefined, `heading` falls through to `this.p.kind === "harness" ? "Add a harness" : "Classifier"`, so an **agent** dialog (kind `agent`) shows the Classifier icon and title over the body "The settings page is no longer open.". No crash, no `status.errors`. Reproduced: `%TEMP%\hq2-463i\shot-r1a.png` (before) → `shot-r1b.png` (same overlay after a forced repaint). Expected: keep the agent's name / "Add a harness" from `kind`+`key`, only the body falling back.

### [minor] A fast double click on More opens two identical stacked dialogs — `mods/bot-herdr/settings.js:95-104`
`openOverlay` does not dedupe: probe opened two agent dialogs → `status.overlays: ["bot-herdr","bot-herdr"]`, both render the rows, each needs its own close (`shot-double.png`). No crash. Old behaviour (toggle `this.more`) was idempotent, so this is a new, small UX regression. Not blocking.

### [info] The installed mod copy still predates the fix — `~/.config/herdr-app/mods/bot-herdr/{settings,viewer,main}.js`
`grep -c MoreSheet settings.js` → 0; `grep -c exists viewer.js` → 0. The user's live window shows neither fix until `node install.mjs` (`npm run install-mod`). Carry-over from round 1.

### [info] A binary above the runtime's read cap still says "Couldn't read this file…" — `mods/bot-herdr/viewer.js:70-80`
Unchanged by the fix and already accepted in round 1 (small NUL-bearing file → "This is not a text file. Open it in its app.", `shot-bin.png`).

## Brief Check
Round-2 asks:
- **Critical repro re-run — More draws the page's rows** — met. Agent: "Orchestrator", Arguments/Instructions, `claude --qa-args` (`shot-agent.png`); harness: Key/Name/Command + Add (`shot-harness.png`); classifier: chips + 0.5/0.7/0.8 (`shot-classifier.png`). No `status.errors` in any.
- **Saves through the page** — met. Typing `--qa-args` through the page's live `InputState` (the same `change` the dialog's input fires) → `out/saved.json`: `{"id":"orchestrator","args":"--qa-args"}`, and the dialog shows `--qa-args` / `claude --qa-args` (`shot-save.png`).
- **Missing file message** — met. `shot-missing.png`: "This file isn't there. It may have moved, or it lives in another folder."
- **Real file text** — met, both `/` and `\` paths: `look.js` with line numbers and syntax (`shot-p1.png`, `shot-real.png`).
- **Dialog open when the Settings page is closed/reopened** — met as graceful degradation: after a second `Settings.init` (new `pageId`), the still-open overlay repaints to "The settings page is no longer open.", no crash, no errors (`shot-r1a.png` → `shot-r1b.png`), with the title defect above.
- **Two quick More clicks** — met (no crash); two dialogs, see minor.
- **Esc/X close** — X path is `closeOverlay(props()?.overlay ?? this.p.overlay)`, identical to `viewer.js`/`lightbox.js`; the overlay closes on `overlay.close` and `status.overlays` returns to `[]`. Esc is `.on_key_down` with `e.key === "escape"` + `stop_propagation`, matching `lightbox.js:75-79` and `viewer.js:142`; not dispatched (headless, no key automation).

Carried acceptance from round 1:
- **A file ref opens the popup with the file's text** — met.
- **Unreadable → "Couldn't read this file…"** — met (present-but-unreadable branch intact).
- **Binary → "This is not a text file"** — met for ordinary binaries (`shot-bin.png`).
- **Every Settings card one fixed height** — met; six cards, one row height, More on a common foot (`shot-settings.png`).
- **More / Add / Advanced open a `frame: "none"` dialog, view `settings-more` → MoreSheet** — met (`openMore`, settings.js:95-104; `main.js:27` registers `MoreSheet`).
- **…that shows the same rows, saves through the page** — met, see above.
- **Closes on Esc, its X, or a click beside it** — X verified as above; Esc and click-beside are code-level (framework dialog).

## Verification
- `node "…/engine/bh.mjs" check` — PASS: lint/typecheck, 42 tests, 41 pass, 1 skipped, 0 fail.
- `herdr-app check mods/bot-herdr` — `check passed: mods/bot-herdr` (repo files, no probe).
- `git diff --stat HEAD -- mods/bot-herdr` — 3 files, +149/−40; `test/` and `engine/` untouched, so the engine's destructive/concurrency/isolation bullets name files this diff does not change.
- Throwaway `HERDR_APP_HOME=%TEMP%\hq2-463i` + `APPDATA=%TEMP%\hq2-463i\appdata`, mod copy byte-identical to the repo for `settings.js`/`viewer.js` (probe only adds `probe-qa.js` + a `main.js` registration): agent/harness/classifier dialogs, save, missing/real/backslash/binary file, reopen, double click — screenshots and JSON in `%TEMP%\hq2-463i` (`shot-*.png`, `out\saved.json`, `out\reopen.json`, `out\path.json`).
- `herdr-app status` (throwaway) — `overlays: []`, `errors: []` after every scenario; window closed afterwards.
- `herdr-app status` (user's home) — layout `bot-herdr`, `overlays: []`, `errors: []`; `grep -c "qa-"` in its `view.json` → 0 (untouched).
- `git status --porcelain -- mods/ test/` — only `main.js`, `settings.js`, `viewer.js`.

## Knowledge Proposals
- `Settings.init` clears the page registry, so only the newest Settings page resolves: a More dialog left open across a Settings page re-creation falls back to "The settings page is no longer open." (and, today, is retitled "Classifier" for agent/harness kinds). Intentional; worth one line in the knowledge base beside round 1's "overlay props are serialized".

## Script Proposals
None.

## Blockers
None.
