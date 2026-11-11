# design-2 — steps 11, 12, 16

## Summary

MarkdownEditor (live preview) and its pure block splitter, a `.md` preview with a Source toggle in the viewer, Ctrl+F search with a match list, and the model picker reading `bh models` instead of `modelsOf()`.
Tests pass; `npx tsc` cannot run on this machine (no TypeScript installed), so the typecheck criterion is unverified.

## Changes

- `mods/bot-herdr/mdblocks.js` (new): pure `splitBlocks(text)`, `joinBlocks(blocks)`, `withBody(blocks, i, value)`. Blocks are `{ type, text, body, gap }` (`lead` on the first), `joinBlocks(splitBlocks(t)) === t` for any text. Split from `mdedit.js` because node tests cannot load `gpui-kit` bare imports.
- `mods/bot-herdr/mdedit.js` (new): `MarkdownEditor` — `constructor({ value, placeholder })`, `value()`, `set_value(text)`, `on("change", handler)`, `render(c, cx, id)`. Rendered blocks are `TextView.markdown`; the active block is an auto-grow `Textarea` (`set_auto_grow(1, SIZE.maxRows)`). Click activates, blur/Esc deactivates, Enter twice at the end of a paragraph opens a new block (keeps the document's own line endings).
- `mods/bot-herdr/search.js` (new): `findMatches(text, query, { caseSensitive })` → `[{ line (1-based), start, end }]`, plus `around(line, match)` and `step(at, count, by)`.
- `mods/bot-herdr/viewer.js`: `.md` opens in Preview (blocks rendered with `TextView.markdown`, `max_w(SIZE.maxWidth)`), segmented Preview/Source toggle, search button in the header, Ctrl+F, search row (field, "3 of 12", prev/next, Aa, close), hit list with the hit drawn on `mix(ground, accent, 0.25)` (0.5 when current), Esc closes the search before the dialog.
- `mods/bot-herdr/icons/search.svg` (new): lucide search, same shape as the other icons.
- `mods/bot-herdr/settings.js`: model list from `bh models <harness> --command <exe>` via `bhJson`; module-level `MODEL_CACHE` per session; `ask/fetchModels` with waiters that reopen the popup; loading popup; header `From <name>` / `Built-in list`; `error` line; `--refresh` via the popup's refresh button; `effortsFor` uses the model's reported `efforts` first, else `effortsOf`; remote space shows "Model lists come from this machine; type a model id for this space." and no chevron; removed the `lists`/`exec` path and the `parseModelList`/`harnessOf`/`exec` imports.
- `mods/bot-herdr/pick.js`: `openPick` accepts `header`, `error`, `loading`, `refreshable`; exports `REFRESH` (`bot-herdr.pick-refresh`); refresh button posts it and closes (Settings reopens with fresh options).
- `mods/bot-herdr/roster.js`: dropped the `lists` fields from pi/gemini/opencode (nothing else read them).
- `test/mdedit.test.mjs`, `test/search.test.mjs` (new).

## Brief Check

- `node --test test/mdedit.test.mjs test/search.test.mjs` passes — met — 12/12 pass.
- `node --test test/contrast.test.mjs` passes — met — fail 0.
- `npx tsc -p mods/bot-herdr/jsconfig.json` passes — **not met** — no TypeScript in the project, `npx` or anywhere on PATH (`npx tsc` → "This is not the tsc command you are looking for"; `command -v tsc` empty). Adding the dependency needs approval. Boxed by `node --check` on every changed file and by stub-host smoke runs instead.
- `bh check` passes — met — "PASS: lint and typecheck pass, tests pass." (this project's check has no typechecker configured for `mods/*.js`).
- Contract on the board — met — #11 (MarkdownEditor API) and #12 (module split correction).
- Step 11: blocks (fence/table/list/quote/heading/paragraph), exact text, edited block only — met — `test/mdedit.test.mjs`; stub-host run showed an edit changing only its block and Enter-twice producing `…# Title\n\np2\n\n- a\n` (and CRLF `…# T\r\n\r\np2\r\n\r\nx\r\n\r\n`).
- Step 11: active block is a Textarea, click activates, Esc/blur deactivates — met by code; smoke run exercised activate/edit/Esc against a stubbed host. Not seen in the real app (headless, no GUI run).
- Step 11: Up at the first line / Down at the last line moves block — **partially met** — moves when the active block is one line (or empty); inside a multi-line block the keys stay the textarea's, because `TextareaState` exposes no caret position (gpui-kit.d.ts:21414-21439).
- Step 11 viewer: `.md` opens rendered at the reading width with a Source toggle; other files keep the Editor — met — `viewer.js` render paths smoke-run with a stub host.
- Step 12: Ctrl+F + header button, count, prev/next, Aa, close, Enter/Shift+Enter, Esc, hit list, click makes current — met — code + smoke run (`results` = two hits on line 3, `hit(1)` → `at: 1`). Checked first whether the built-in Editor has a find: `EditorState` exposes only `value/set_value/on/release` (gpui-kit.d.ts:21336-21349), nothing find-related in the typings, `keys.json` has no editor binding, and `strings herdr-app.exe` has no "find in"/"find next" text. Could not drive the GUI to confirm; ours is the fallback the brief allows.
- Step 16: picker from `bh models` (not `modelsOf`), asks on open and on harness change, loading inline, in-memory cache per harness — met — stub run recorded the call `bh models omp --command omp --json`, the waiter reopening, and the cache feeding `effortsFor`.
- Step 16: header `From <harness>` / `Built-in list`, refresh → `--refresh`, error line — met by code; `bh models claude --json` (builtin, no error) and `bh models pi --command pi --json` (builtin + error sentence) checked against the parser.
- Step 16: typed model id still works; remote-space note + typed field (decision #7) — met.
- Step 16: efforts exactly the model's when reported, else roster.js — met — stub run: `effortsFor('omp','a/b')` → `["low","high"]`, unknown model → roster's `["off",…,"xhigh"]`.
- Step 16: drop the `lists` exec path and the roster `lists` fields; keep models.js — met.

## Verification

- `node --test test/mdedit.test.mjs test/search.test.mjs` — 12 pass, 0 fail
- `node --test test/contrast.test.mjs` — pass
- `node .../bh.mjs check` — PASS (lint/typecheck step reports no typechecker set up; tests pass)
- `node --check` on settings.js, viewer.js, pick.js, mdedit.js, mdblocks.js, search.js, roster.js — ok
- stub-host smoke of `MarkdownEditor` (activate/edit/Esc/Enter-twice, LF + CRLF) — text round-trips, only the edited block changes
- stub-host smoke of `FileView.render` (preview, search open, Source, plain file) — no throw; `findMatches` two hits on line 3, stepping to `at: 1`
- stub-host smoke of `Settings` model path — args `models omp --command omp --json`, waiter reopened once, reported efforts used
- `node mods/bot-herdr/engine/bh.mjs models claude --json` / `models pi --command pi --json` — contract shape confirmed (builtin list; builtin + error sentence)
- `npx tsc -p mods/bot-herdr/jsconfig.json` — cannot run: no TypeScript installed

## Design choices

- Search hit highlight: the hit substring is drawn in its own span on `mix(ground, accent, 0.25)`; the current hit's span is `0.5` plus its row on `c.well`.
- Hit-row line numbers: `w(SPACE[5] * 3)` (48px) at `TYPE.xs`, mono for the line text.
- Search row sits under the header, above the content, inside the file frame; the hit list is capped at `ROW * SIZE.rowsShown` and scrolls.
- Model popup loading: header omitted while asking (no source yet), a pulse dot + "Asking the harness…" row in its place.
- Remote space: muted note under the Model field, chevron hidden, typed field only.

## Blockers

- `npx tsc -p mods/bot-herdr/jsconfig.json` cannot be run: no TypeScript compiler on this machine and installing one is a dependency change that needs approval. Everything else in the task's "Done when" is verified.

## Pushback

- **Request:** Up at the first line / Down at the last line moves between blocks.
  **Reason:** `TextareaState` has no caret/selection getter (`content()` returns text + tokens only), so "first line"/"last line" cannot be detected; moving on every Up/Down would break normal editing.
  **Alternative:** shipped the one-line-block rule (and empty blocks); for multi-line blocks an explicit key (Alt+Up/Down) could be added if the person wants it.

## Knowledge Proposals

- Node tests can only import mod files with no `gpui-kit`/`gpui-base`/`herdr` imports: pure logic goes in its own module (`mdblocks.js`, `search.js`) and the drawing file imports it.
- `bh check` on this repo reports "No typechecker or linter is set up" for `mods/*.js`; `npx tsc` is not available here.
