## Summary
PASS: CLI starts now carry deny flags. `withInstalled` and Settings read a fresh listing. A failed `bh tools` falls back to the original argv, and agents with no picks are left alone.
Round 2 findings: the minor one (synced-skill naming) is now verified live by the worker, and the info item "CLI starts get no deny flags" is fixed. The two other info items are unchanged and out of scope.

## Changes
None (review only). I wrote a throwaway script in %TEMP%\qa3.

## Brief Check
1. composer.js `launchArgv` (composer.js:531) and its use in the CLI `start` step (composer.js:1268): **met**. Every producer of a start step builds `run` as `argvOf(entry, this.known)` (composer.js:431, 442, 527). Rebuilding it with `installed` therefore only adds the limit flags. I ran a copy of the method with real `argvOf` and a stubbed bhJson:
   - With picks and a good listing, it added `--settings {"permissions":{"deny":["Skill(skill:pdf)"]}}`.
   - A failed listing returned `run` unchanged, and so did `supported:false`.
   - Agents with no picks, or with no skills/mcp fields at all, were untouched.
   - `bhJson` cannot throw: `bh()` catches spawn and timeout errors, and parse errors give null.
   - The headless path is unchanged.
2. team.mjs `withInstalled` reads with `refresh: true`: **met**. `team()` runs several times per command (spawn, brief, and sync calls brief once per agent). A fresh in-process listing costs about 9 ms (5 runs each for claude and codex), so the extra cost is negligible. The cache write is atomic (tmp file + rename, core.mjs:71).
3. settings.js `loadTools` always passes `--refresh`: **met**. The in-memory TOOLS_CACHE still stops repeat fetches within a session.
4. Launch latency: **acceptable**. The extra time is one `node bh.mjs tools` spawn, about 0.2 s, and only for agents with picks.

## Findings
- [minor] The limits fail open: if `bh tools` fails or times out, the agent starts with no deny flags and only the brief holds it to its picks. Any hang delays the tab by up to 60 s with no feedback. This matches the brief's stated fallback, so it is not blocking. — composer.js:533
- [info] Round 2 info items are unchanged: claude.ai and plugin MCP servers are not listed, and project entries are keyed on cwd.

## Verification
- bh check — PASS: 257 tests, 256 pass, 1 skipped (full suite, current tree)
- node --check composer.js / settings.js — ok
- node %TEMP%\qa3\la.mjs (launchArgv copy + real argvOf, stubbed bhJson) — 5/5 cases as expected
- node %TEMP%\qa3-time.mjs (listTools refresh ×5) — claude 8.5 ms, codex 9.8 ms average
- node engine/bh.mjs tools claude --refresh --json — supported:true, 13 skills incl. docx, 0 MCP
- herdr-app check — not re-run; I relied on the worker's claim [INFERENCE]
