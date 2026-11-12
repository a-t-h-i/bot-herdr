# Scout report: how knowledge is located, read and written

## Summary
Knowledge is per project (`<git toplevel or cwd>/.bot-herdr/knowledge`), but four things carry it across projects: agent conversations keyed by agent name, the fixed `knowledge-scout` name, the global roster instructions, and a Knowledge page that can show or save another project's data for a few seconds. No `~/.bot-herdr/knowledge` exists on disk.

## Changes
None. Read-only scout.

## Brief Check
- 1. Every reader/writer and the folder it resolves to: **met** (table below).
- 2. Leak and wrong-place scenarios: **met** (ranked list below).
- 3. Global data that behaves like project knowledge: **met**.
- 4. On-disk check: **met**.

## Resolution rules (the base of everything)

- Project = `projectRoot()`: `git rev-parse --show-toplevel` of the process cwd, else the cwd; a path inside `.bot-herdr/worktrees/` maps back to its parent project (`mods/bot-herdr/engine/lib/core.mjs:37-47`).
- Knowledge store = `<project>/.bot-herdr/knowledge/<agent>.md`, `notes.json`, `archive/` (`engine/lib/knowledge.mjs:15-16`, `:61`).
- UI project = `projectDir()`: the space's folder unless the space is on another machine; else the focused terminal's cwd; else home (`mods/bot-herdr/bh.js:22-25`).

## 1. Readers and writers

| Who | Resolves to | From what | Where |
|---|---|---|---|
| Knowledge page load (list + each file) | `projectDir()` | space folder, else focused cwd, else home | `mods/bot-herdr/work.js:184`, `:204-209` |
| Knowledge page save / delete / note | `this.dir ?? projectDir()` | last reload's dir | `work.js:240` (`act`), `:376-392` (`saveKnowledge`, `deleteEntry`) |
| New-note dialog | `this.p.dir`, else bh's default | page's `this.dir` | `mods/bot-herdr/noteform.js:10`, `:59`; `work.js:1209` |
| Lead agent brief (composer) | `projectDir(this.space())` | space folder, else focused cwd, else home | `mods/bot-herdr/composer.js:9`, `:248-251` |
| `bh brief` (lead/child/panel) | `projectRoot()` of bh's cwd | agent's process cwd / git toplevel | `engine/bh.mjs:405`; brief text at `engine/lib/team.mjs:106` (`forBrief`) |
| Headless agent (`bh agent`, `runAgent`) | `projectRoot()` of `process.cwd()` | the terminal's cwd | `engine/lib/agent.mjs:162-163` |
| Child agent (`bh spawn`) | `flags.cwd ?? taskCwd(task) ?? root` | explicit cwd, task worktree, else project | `engine/bh.mjs:438`; `engine/lib/workspace.mjs:137-140` |
| `bh knowledge list/search/<agent>/add/note/write/unnote` | `projectRoot()` of bh's cwd | `projectDir()` when run from the UI; agent's cwd otherwise | `engine/bh.mjs:123`, `:278-318`; `engine/lib/knowledge.mjs:61-95` |
| `bh knowledge ask` (Scout) | `root`; Scout is started in `process.cwd()` | cwd of the bh call | `engine/bh.mjs:286-293` |
| `/bh-info` from the composer | `projectDir()` | as above | `mods/bot-herdr/composer.js:1201` |
| Classifier | reads no knowledge files | — | `engine/classifier/index.mjs:155` (only a category label) |

Assumption: the lead's terminal is started with a cwd equal to `projectDir()`; I did not find where the lead's `hc run --cwd` is set.

## 2. Leak and wrong-place scenarios (ranked by likelihood of what the person saw)

1. **A conversation keeps the previous project's knowledge.** Session state is keyed by agent name and terminal, not project: `engine/lib/agent.mjs:182` (`key = slug(who)-<terminal>`), `:183` (`DATA/sessions/<key>.json`). A resumed session is used as-is: `agent.mjs:224` (brief only when there is no session), `:253-254`. The same Orchestrator/Scout in project B resumes project A's conversation. **Fix:** add a hash of `root` to `key` at `agent.mjs:182`.

2. **`/bh-info` reuses a Scout from another project.** The name is fixed: `engine/bh.mjs:287`. It sends with `hc send knowledge-scout` (`bh.mjs:~290`) and only starts a new one when that send fails (`bh.mjs:293` uses `process.cwd()` at `:292`). Whatever Scout answers keeps the conversation (scenario 1). The question context is built from this project, but the answer's memory is not. **Fix:** name it `knowledge-scout-<hash of root>`, or only reuse when the existing one's cwd equals `root`.

3. **Space with no folder: knowledge goes to whatever terminal is focused.** `projectDir()` falls back to `focused()?.cwd`, then `home()` (`mods/bot-herdr/bh.js:22-25`). `projectRoot()` then takes that folder's git toplevel (`engine/lib/core.mjs:40`), so a focused terminal in any repo writes to that repo's `.bot-herdr`. **Fix:** when `space.folder` is empty, show the resolved path on the Knowledge page and refuse writes until a folder is set.

4. **Space on another machine.** `projectDir()` skips `space.folder` when `space.machine` is set (`bh.js:23`) and uses the local focused cwd instead, which is a path on the wrong machine (or a local folder with the same name). Unverified: what `focused().cwd` holds for a remote terminal. **Fix:** for `space.machine`, do not fall back to a local cwd; return null and disable knowledge actions.

5. **Knowledge page shows and saves another project after switching spaces.** On a switch, `reload()` returns early while busy (`work.js:182`); data is only re-fetched on the 4 s tick (`work.js:174`, `REFRESH_MS` at `:66`). The `dir` check at `:187` runs only before the awaits, so a late result from the old dir still fills `knowAll` and the editor (`:212`, `:218-226`). Edits and saves go to `this.dir`, which is the old project until the next tick (`work.js:240`). **Fix:** after each await, bail if `dir !== projectDir()`; make `act()` use `projectDir()` only when the page's data matches it.

6. **Non-git folder inside another repo, or home as a repo.** `projectRoot()` takes the git toplevel of any folder, so a non-git project inside a larger repo (or a cwd under a home-directory repo) writes into the outer repo's `.bot-herdr` (`core.mjs:40-42`). A non-git cwd falls back to itself (`core.mjs:42`), so it is correct there. **Fix:** stop at the nearest folder that has its own `.bot-herdr`, or use the space folder explicitly and not git's toplevel.

7. **Headless agent whose cwd differs from the space folder.** The agent's project is whatever `process.cwd()` is when `runAgent` starts (`agent.mjs:162-163`), and `hc run --cwd` sets that (`bh.mjs:444-455`). If the lead's cwd is not the space folder, its knowledge and tasks go elsewhere. **Fix:** pass the project root explicitly to `bh agent` (e.g. `--root`) and use it in place of `process.cwd()`.

8. **Child agents started with `hc run` from another project.** `bh spawn` writes into `flags.cwd ?? taskCwd ?? root` (`bh.mjs:438`), so a child started with `--cwd` of another repo reads and writes that repo's knowledge. Its brief uses the same `root` (`bh.mjs:24` template path, `team.mjs:60`). This is by design, but nothing warns about it. **Fix:** reject `--cwd` outside `root` unless the person allows it.

9. **Task worktrees.** `projectRoot()` maps `.bot-herdr/worktrees/…` back to the parent (`core.mjs:44-47`), so worktree agents read and write the parent's knowledge. `taskCwd()` returns `g.path` (`workspace.mjs:137-140`). If a worktree path is outside `.bot-herdr/worktrees/`, the mapping is skipped and knowledge lands in the worktree's own `.bot-herdr` (not verified: where `g.path` is set). **Fix:** compare with the task's `git.path` in `projectRoot()`, or always resolve to the main worktree with `git rev-parse --git-common-dir`.

10. **Replies and activity follow the terminal, not the project.** Replies are written to `DATA/replies/<terminal>.md` (`agent.mjs:273`) and activity to `DATA/activity/<terminal>.json` (`agent.mjs:196`, `:262`). A terminal reused in another space shows the old reply. Not knowledge, but it reads as cross-project. **Fix:** key these by `hash(root)+terminal`.

## 3. Global data under `<app home>/data/bot-herdr` that acts like project knowledge

- **Per-agent "instructions" in the roster**: `DATA/agents.json`, read at `engine/lib/team.mjs:16`; each agent's `instructions` go into every brief at `team.mjs:109-110`. They are global, so they follow the person into every project. Currently empty for all six agents (checked). **Fix:** show "applies to every project" in Settings, or store them per project.
- Legacy "extra arguments" were migrated into instructions (`team.mjs:19-22`), so an old value can appear in every project.
- **Sessions and briefs** (`DATA/sessions/`, `DATA/briefs/`): keyed by agent name and terminal (`agent.mjs:182-184`); see scenario 1. `briefs/*.md` are written with the knowledge in them (`agent.mjs:207-210`) and never tied to a project.
- **Replies and activity** (see scenario 10).
- The `knowledge-scout` name (`bh.mjs:287`) and its session are global.

## 4. On disk

- `C:/Users/athenkosi.hlubi/.bot-herdr/knowledge`: **does not exist**. No `.bot-herdr/knowledge` within depth 3 of home. Search to depth 7 found only the projects below and test leftovers.
- `Desktop/bot-herdr/.bot-herdr/knowledge/`: `orchestrator.md` (7 entries), `design.md` (10), `dev.md` (4), `qa.md` (1), `research.md` (1), `archive/`.
- `Desktop/WORK/WintrackDX/.bot-herdr/knowledge/`: `design.md` (2 entries), `dev.md` (5 entries), `archive/` (5 files). This is a separate repo, and its entries are not in the bot-herdr files above.
- `%TEMP%/bh-kv-p-*/.bot-herdr/knowledge`: 121 folders from the test `test/knowledge-view.test.mjs`. These are test leftovers, not a leak into a project.
- Not knowledge, but seen in passing: `DATA/config.json` stores the classifier API key in plain text. I did not copy it.

## Knowledge Proposals
- Knowledge is project-scoped on disk, but conversations, the Scout name, global roster instructions and the Knowledge page cache are not. Scenario 1 and 2 are the likeliest cause of "knowledge leaks between folders".

## Script Proposals
- None.

## Blockers
- Not verified: the lead's `hc run --cwd` (scenario 7), what `focused().cwd` holds for a remote terminal (scenario 4), where worktree `git.path` is set (scenario 9). These need a run, not reading.

## Verification
- `ls ~/.bot-herdr/knowledge` — missing (no leak into home).
- `find` of `.bot-herdr/knowledge` under home, depth 7 — 2 real projects + 121 temp test folders.
- Entry counts via `grep -c '^- '` on each file (above).
