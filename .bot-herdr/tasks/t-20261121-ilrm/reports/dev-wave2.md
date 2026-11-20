# dev-wave2 — install-time tools, batched triage, role prompts

## Summary
Implemented pinned, SHA256-verified install-time provisioning of rg/fd/ast-grep with an offline-safe app-home cache, batched effort+scripts classifier triage with repo layout, `.bot-herdr/`-clean `bh knowledge ask`, and retrieval guidance in the role prompts.
Tests added for both areas; `npm test` 366 pass/0 fail, `bh check` PASS, all edited `.mjs` pass `node --check`.

## Changes
- `mods/bot-herdr/engine/tools-manifest.json` (new): exact copy of Research's 18 verified targets (rg 15.2.0, fd 10.5.2, ast-grep 0.51.3); verified byte-identical to `.bot-herdr/tmp/ilrm-manifest-facts.json`.
- `mods/bot-herdr/engine/lib/install-tools.mjs` (new): `loadManifest`, `targetKey`, `sha256File`, `extractBinary` (tar.gz via `tar -xzf`; zip via unzip→python3→tar, Windows tar→PowerShell, no `shell: true`, zip-slip refused), `ensureTools` (cache marker, download+verify, per-tool `cached|downloaded|skipped|failed`, never throws).
- `install.mjs`: after copying the mod, provisions tools into `engine/bin` from `appHome/cache/bot-herdr-bin` unless `--skip-tools`; one `tools    …` line.
- `mods/bot-herdr/engine/bh.mjs`: `bh knowledge ask` uses `listProjectFiles` (500-line cap kept); `bh task new` passes `layout: C.repoLayout(root)`; `bh spawn` makes one `scoreEffortAndScripts` call for child briefs (effort only when `--effort auto`, scripts always), falls back to `keywordPick` on `null`, appends `## Suggested scripts` (max 3) to the first message, and shares `routedEffort` with the non-child auto path.
- `mods/bot-herdr/engine/classifier/index.mjs`: `repoLayout`, `scriptCandidates`, `scriptQuestion`, shared `scriptsFrom` validation, and `scoreEffortAndScripts` (one `c.ask("effort", { questions: { effort, fit } })` when both are wanted; `null` vs `[]` kept distinct).
- `mods/bot-herdr/engine/classifier/harness.mjs`: `choiceAnswer` accepts `choices` multi-picks (each valid key ≥0.8, first valid as `choice`), filters/clamps probability maps to valid keys, keeps multi-pick probabilities instead of collapsing to one; choice hint now asks for up to 3 keys ≥0.8.
- `mods/bot-herdr/engine/roles/{global,scout,worker,orchestrator}.md`: point at the cross-platform retrieval scripts (`repo_map`, `locate`, `search_code`, `find_files`, `find_symbol --body`, `outline_file`, `read_slice`, `ast_search`); removed Unix-only grep/find guidance.
- `test/install-tools.test.mjs`, `test/scripts-classifier.test.mjs` (new): manifest validation, tar.gz install/cache, checksum rejection, zip-slip refusal, offline fallback, Windows `.exe` + injected extractor, batched/null/none picks, hallucinated-index dropping, harness multi-pick, layout filtering/cap.
- `.bot-herdr/tasks/t-20261121-ilrm/baseline-after.json`: written by `node test/bench/baseline.mjs`.

## Brief Check
- All 18 verified manifest targets present: met (test asserts 3 tools × 6 targets, HTTPS URL, 64-hex sha, `binaryInArchive`; file byte-identical to facts JSON).
- `npm test` 0 failures including new tests: met — 367 tests, 366 pass, 0 fail, 1 pre-existing skip.
- `bh check` passes: met — PASS, 366 tests pass.
- `node --check` on every edited/created `.mjs`: met — install.mjs, install-tools.mjs, classifier/index.mjs, classifier/harness.mjs, bh.mjs, both new test files.
- `baseline-after.json` written with before/after numbers: met — below.

| metric | before | after |
| --- | --- | --- |
| briefBytes max growth | — | +328 (scout), +239 others, +156 panels |
| bh task list --json | 120.9 ms | 189.6 ms |
| bh task show --json | 81.2 ms | 121.4 ms |
| bh board read --json | 88.2 ms | 114.6 ms |
| bh team --json | 90.5 ms | 115.3 ms |
| bh tools claude | 88.6 ms | 118.8 ms |
| bh usage --json | 88.8 ms | 118.0 ms |
| spawnToPromptMs | 183 ms | 257 ms |

The latency gap is machine drift, not this change: a HEAD-only copy (`git archive HEAD`) benchmarked on this machine now gives 166.8 / 169.2 / 112.4 / 138.6 / 110.7 / 126.6 ms and spawnToPromptMs 292 ms — the same range as "after".

## Verification
- `node --check <each edited/created .mjs>` — all pass.
- `timeout 300 node --test test/install-tools.test.mjs test/scripts-classifier.test.mjs` — 14/14 pass.
- `timeout 300 npm test` — 367 tests, 366 pass, 0 fail, 1 skipped (pre-existing).
- `timeout 300 bh check` — PASS: 366 tests pass, 0 lint/typecheck configured.
- `node test/bench/baseline.mjs .bot-herdr/tasks/t-20261121-ilrm/baseline-after.json` — written; numbers above.
- Temp-home `node install.mjs` (real network) — `tools    rg downloaded, fd downloaded, ast-grep downloaded`; binaries report `ripgrep 15.2.0`, `fd 10.5.2`, `ast-grep 0.51.3`; second run `rg cached, fd cached, ast-grep cached`; temp home removed afterwards.
- `node install.mjs --skip-tools` in a temp `HERDR_APP_HOME` — completes without provisioning.

## Notes
- `repoLayout` lives in `classifier/index.mjs` (exported) and `bh.mjs` calls `C.repoLayout`; `bh.mjs` runs its CLI main on import, so a pure helper there could not be unit-tested without executing the CLI. Behaviour is exactly the brief's helper (cap 40, dirs up to 3 levels, excludes `.bot-herdr/` and `isNoise`).
- Chose "downloaded" rather than "installed" for the success status; `install.mjs` prints it in one concise line as required.
- No changes to `package.json`, UI files, or `engine/scripts/`.

## Knowledge Proposals
- Bundled binaries are cached at `join(appHome, "cache", "bot-herdr-bin", \`${tool}-${version}-${target}\`)` with a `.sha256` marker holding `version target sha`; `install.mjs` wipes the mod, so the cache is what makes reinstalls fast/offline-safe.
- `.zip` extraction order is `unzip` → `python3 -m zipfile` → `tar` off Windows, and `tar.exe` → PowerShell `Expand-Archive` on Windows; `.tar.gz` always uses `tar -xzf`. Never run extractors through a shell.

## Script Proposals
None.
