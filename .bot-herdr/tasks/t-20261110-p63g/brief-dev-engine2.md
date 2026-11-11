# Dev brief — steps 8 and 9 of t-20261110-p63g (/bh-knowledge + classifier models)

## Goal
Own step 8 (`/bh-knowledge <question>` reaches Scout, which answers in the chat) and step 9 (classifier choices Jev, Laya, Clef). Steps 2–3 are done: headless templates route through `bh agent`, Antigravity runs on ACP (`roster.js` `HEADLESS.acp`), turns that say nothing write `(finished without a reply)` (`agent.mjs` `NO_REPLY`).

## Files
- Change: `mods/bot-herdr/engine/bh.mjs` (new subcommands), `mods/bot-herdr/engine/lib/knowledge.mjs`, `mods/bot-herdr/engine/classifier/*` (`harness.mjs`, plus the classify pipeline), `mods/bot-herdr/engine/lib/team.mjs` (Scout brief mode, only if needed), `test/*.test.mjs`.
- Leave alone: every view file (`settings.js` included — Design owns it), `roster.js` exports, `runner.mjs` unless the Scout path truly needs it.

## What to do
### Step 8 — `/bh-knowledge`
1. Add `bh knowledge ask "<question>"` (engine side): it starts the Scout agent headless if none is running (reuse the step‑1 `bh agent`/`runAgent` path; Scout may be any harness, including Antigravity over ACP), gives it a brief that includes the knowledge files under `.bot-herdr/knowledge/` and the repo, and its answer lands in the chat through the normal reply-file path (same as any agent reply).
2. Follow-ups: a second `bh knowledge ask` while Scout lives reuses the same agent (session continues), so "follow-ups work".
3. The chat composer's `/bh-knowledge` wiring is Design's (later step); you ship and test the engine command only.
4. Tests: with a fake Scout harness (see `test/headless.test.mjs` patterns), `bh knowledge ask` writes the brief and the reply file; a second ask reuses the session.

### Step 9 — classifier on Jev, Laya, Clef
5. Config: extend `bh config` with a classifier block, shape `classifier: { kind: "jev" | "laya" | "clef" | "rules" | "<harness key>", model: "", key: "", accountId: "" }`. Defaults keep today's behaviour. `bh config --data` must round-trip it (Settings UI is Design's later; keys land via config for now).
6. Laya: same System One client as Jev, its own model id and a configurable base URL (TypeSafe or local). Clef: a small adapter for Cloudflare Workers AI REST (`/accounts/<accountId>/ai/run/<model>`), auth bearer key. Check exact endpoints and model ids against their public docs while implementing; note what you used (URL + version/date) in your report.
7. On any classifier failure, fall back to the rule-based path exactly as today.
8. Tests: adapter arg/URL building per kind with mocked `fetch`; failure falls back to rules; no network in tests.

## Contracts
- Config shape above is the contract with Design's later Settings UI — keep the keys exactly.
- `bh knowledge ask` prints/logs nothing sensitive; the reply file path is `data/bot-herdr/replies/…` as today.

## Constraints
- No new dependencies (use `fetch`). Don't touch view files. Don't commit.
- No real network calls in tests; mock `fetch`.

## Done when
- `bh knowledge ask "…"` starts (or reuses) Scout headless; its answer appears as a chat reply; tested with a fake harness.
- `bh classify route "…"` works on each of jev/laya/clef kinds given a key (mocked in tests), and falls back to rules on error.
- `npm test` passes.

## If stuck
If Workers AI or System One details (endpoint, model id) can't be confirmed from public docs, implement the adapter behind the documented shape, mark the uncertain bits in your report, and don't guess silently.
