Goal (step 1 of task t-20261120-n1rc): record "before" baselines so step 14 can show the speed and token gains of this task, and make `npm test` pass on Linux.

Files
- Change: `mods/bot-herdr/engine/lib/media.mjs` (only `findBrowser` and what it calls).
- Create: `test/bench/baseline.mjs` (not picked up by `npm test`, which only runs `test/*.test.mjs`).
- Create: `.bot-herdr/tasks/t-20261120-n1rc/baseline-before.json` (the output of the script).
- Leave alone: every other file. In particular do not touch `engine/lib/agent.mjs`, `engine/lib/runner.mjs`, `settings.js`, `README.md`, `test/headless.test.mjs`.

What to do
1. Fix the failing test `test/mockup-browser.test.mjs:42` ("findBrowser on Windows: today's installs come before Beta and Dev, and PATH comes last"). It fails on Linux because `findBrowser` builds Windows paths with `path.join`, which uses `/` here. When `platform === "win32"`, build those paths with `path.win32.join` (import `win32` from `node:path` or use `path.win32`). Do not change the test.
2. Write `test/bench/baseline.mjs`, a plain Node script (`node test/bench/baseline.mjs [out.json]`), standard library only, that prints and writes JSON with these keys:
   - `briefBytes`: `{ "<role>/<mode>": bytes }` for roles orchestrator, dev, design, qa, research, scout and modes lead (orchestrator only), child, panel, review (qa only). Build each brief in-process with the same function `bh spawn` uses (`engine/lib/team.mjs` `brief`, see `team.mjs:93-130`); also record `briefTokensApprox` = bytes / 3.6, rounded.
   - `bhMs`: median wall-clock ms over 5 runs for each of `bh task list --json`, `bh task show <id>`, `bh board read <id>`, `bh team --json`, `bh tools claude`, `bh usage --json`, run as `node mods/bot-herdr/engine/bh.mjs …` (the repo copy, not the installed mod) with `cwd` a temp project. If one of these commands takes no `--json`, use the plain form and say so.
   - The temp project: `fs.mkdtemp` under `os.tmpdir()`, `git init`, then seeded with 50 tasks with 20 usage records each, created through the real `bh` commands or the engine's own store functions (`engine/lib/tasks.mjs` `newTask`/`recordUsage` or equivalents). Set `HOME` to a temp folder for the child processes so the user's real config is never read or written. Delete the temp folders at the end.
   - `spawnToPromptMs`: time from starting the agent runner to the moment the first prompt is handed to the harness, using the fake harness the existing tests use (look in `test/headless.test.mjs` and `test/fixtures/` for it). If there is no way to do it without editing a file outside this brief, put `null` and explain why in your report.
   - `node`, `platform`, `at` (ISO time), `commit` (`git rev-parse HEAD`).
3. Run it once and save the output to `.bot-herdr/tasks/t-20261120-n1rc/baseline-before.json`.

Constraints
- No new dependency. No refactor. Functions at or under 20 lines.
- Never read or write the user's real `~/.config`, `~/.claude` or data folders from the script.

Done when
- `node --test test/mockup-browser.test.mjs` passes, and `npm test` shows no failures (report the pass/skip counts).
- `node test/bench/baseline.mjs /tmp/b.json` exits 0 and writes JSON with every key above.
- `.bot-herdr/tasks/t-20261120-n1rc/baseline-before.json` exists.
- `git status` shows only the three files above as yours.

If stuck: if `brief` cannot be called in-process without side effects, or the store cannot be seeded without touching real config, stop that part, finish the rest and report it as a blocker. Never invent a workaround.
