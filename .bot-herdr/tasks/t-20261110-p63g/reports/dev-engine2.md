## Summary
Implemented `bh knowledge ask` (step 8) to start/reuse Scout headless and extended the classifier (step 9) with `kind`/`model`/`key`/`accountId` config supporting `jev`, `laya`, `clef`, and `rules` (with harness-key kinds).
`npm test` passes (88 tests, 1 skipped), including new fake-harness/fetch-mocked coverage for both steps.

## Changes
- `mods/bot-herdr/engine/bh.mjs`: added `bh knowledge ask "<question>"` (gathers `.bot-herdr/knowledge/*` + repo file list, sends question to `knowledge-scout` via `hc send` to reuse or starts via `hc run --bg` with `bh agent scout --mode lead --name knowledge-scout`); extended `bh config` to round-trip classifier fields (`kind`, `model`, `key`, `accountId`, `baseUrl`) and updated HELP/status; `onHarness` handled as object/boolean.
- `mods/bot-herdr/engine/classifier/index.mjs`: added classifier `MODEL_KINDS` and config/target support for `kind` jev/laya/clef/rules (and harness-key kinds); implemented `askClef` (Cloudflare Workers AI REST) using the shared prompt/answer parsing; `makeClassifier` routes jev/laya through System One and clef through `askClef`, falling back to rules on error. Defaults keep prior behaviour.
- `mods/bot-herdr/engine/lib/team.mjs`: `hc()` uses `shell: true` on Windows so fake/`.cmd` `hc` shims resolve in tests (no behavior change on non-Windows).
- `test/knowledge-classifier.test.mjs`: new tests for classifier config round-trip (kind/model/key/accountId, key masked), per-kind target/adapter arg+URL building with mocked `fetch` (jev/laya via System One, clef), `route` on jev/laya/clef with mocked `fetch`, fallback-to-rules on failure per kind, and `bh knowledge ask` start+reuse with a fake `hc` writing brief/reply files.

## Brief Check
- `bh knowledge ask "…"` starts (or reuses) Scout headless; its answer appears as a chat reply; tested with a fake harness. — met — `bh knowledge ask` starts `knowledge-scout` via `hc run --bg … bh agent scout --mode lead --name knowledge-scout` when `hc send` misses, reuses via `hc send` when present; agent runs headless and replies through the normal reply-file path. `test/knowledge-classifier.test.mjs` ("bh knowledge ask...") with fake `hc` asserts start then reuse and brief/reply files written.
- `bh classify route "…"` works on each of jev/laya/clef kinds given a key (mocked in tests), and falls back to rules on error. — met — `test/knowledge-classifier.test.mjs` mocks `globalThis.fetch` and asserts `route` returns classifier result for `kind` jev/laya/clef given a key, and returns `by: "rules"` on fetch failure for each kind; adapter URL/arg building verified for clef and System One (laya).
- `npm test` passes. — met — `npm test` → 88 tests, 87 pass, 1 skipped, 0 fail.

## Verification
- `node --test test/knowledge-classifier.test.mjs` — pass (4/4)
- `npm test` — pass (88 tests, 87 pass, 1 skipped, 0 fail)
- `node "C:/Users/athenkosi.hlubi/.config/herdr-app/mods/bot-herdr/engine/bh.mjs" check` — pass (PASS: lint and typecheck pass, tests pass; 62/63 pass, 1 skipped)

## Knowledge Proposals
- `bh knowledge ask` uses a fixed agent name `knowledge-scout` and reuses it by `hc send` success; it includes `.bot-herdr/knowledge/*` and a `git ls-files` repo listing in the prompt/context.
- Classifier config now accepts `kind` (`jev`|`laya`|`clef`|`rules`|`<harness key>`), `model`, `key`, `accountId`, and optional `baseUrl`; jev/laya call System One `POST {baseUrl}/v1/systemone`, clef calls Cloudflare Workers AI `POST {baseUrl}/accounts/{accountId}/ai/run/{model}` with bearer key.

## Script Proposals
- (none)

## Blockers
- (none)

## Pushback
- (none)

## Notes (endpoints / sources used)
- **Jev/Laya (System One):** `POST {baseUrl}/v1/systemone` with `Authorization: Bearer <key>` and JSON `{ model?, state, questions }` returning `{ answers }` (existing client shape; Jev default `https://api.typesafe.ai`, model `jev-latest`; Laya same API, configurable `baseUrl`, default model `laya-latest`). Ref: TypeSafe System One API (api.typesafe.ai), as used by existing Jev hosts.
- **Clef (Cloudflare Workers AI):** `POST {baseUrl}/accounts/{accountId}/ai/run/{model}` with `Authorization: Bearer <key>`, body `{ messages: [{role:"user", content: <prompt>}] }`, reads reply from `result.response`/`result.output_text`/`result` and parses JSON answers in the System One answer shape. Default base `https://api.cloudflare.com/client/v4`, default model `@cf/meta/llama-3.1-8b-instruct`. Ref: Cloudflare Workers AI REST API docs (developers.cloudflare.com/workers-ai/get-started/rest-api/, checked 2026-05 pattern). Model id/availability may vary by account; adapter is shape-based and falls back to rules on error.
- Config keeps the contract keys exactly (`kind`, `model`, `key`, `accountId`) and also round-trips `baseUrl` to satisfy "configurable base URL" for Laya/local; keys are never echoed back (masked as boolean).
