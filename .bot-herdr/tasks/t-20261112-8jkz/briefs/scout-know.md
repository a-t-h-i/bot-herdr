Goal: scouting for task t-20261112-8jkz. The person says "knowledge is not folder / repo scoped": what one project learns shows up in, or is written to, another. Find exactly how knowledge is located, read and written, and every way it can cross folders or repos. Read-only: edit nothing.

Files to start from (repo at C:/Users/athenkosi.hlubi/Desktop/bot-herdr):
- mods/bot-herdr/engine/lib/knowledge.mjs (kfile, store paths)
- mods/bot-herdr/engine/lib/core.mjs:36-55 (projectRoot, store)
- mods/bot-herdr/bh.js:22-25 (projectDir: space folder, else focused terminal cwd, else home)
- mods/bot-herdr/work.js:180-215 (Knowledge page load and its cache on this.dir)
- mods/bot-herdr/engine/lib/team.mjs:106 (knowledge in an agent's brief)
- mods/bot-herdr/composer.js:473 and :1201 (brief and `knowledge ask` cwd)
- mods/bot-herdr/engine/bh.mjs (the knowledge commands, `brief`, `spawn`), engine/lib/runner.mjs and engine/lib/agent.mjs (the cwd each agent runs in), engine/classifier/ (any knowledge use)

Answer, each with path:line:
1. For every reader and writer of knowledge (Knowledge page, agent briefs for lead/child/panel, `bh knowledge add|write|note|ask`, the classifier, `noteform.js`), which folder it resolves to and from what (space folder, focused terminal cwd, home, agent process cwd, git toplevel).
2. Concrete scenarios where knowledge leaks or lands in the wrong place: a space with no folder; a space on another machine; a non-git folder (falls back to cwd, or to home?); a folder nested in someone else's git repo; switching spaces while the Knowledge page is open; a headless agent whose cwd differs from the space folder; task worktrees; child agents started with `hc run`.
3. Anything kept globally under <app home>/data/bot-herdr (C:/Users/athenkosi.hlubi/.config/herdr-app/data/bot-herdr) that behaves like project knowledge (roster "instructions", notes, replies) and so follows the person into every project.
4. Look on disk: does C:/Users/athenkosi.hlubi/.bot-herdr/knowledge exist (a leak into home)? List any other .bot-herdr/knowledge folders under C:/Users/athenkosi.hlubi (depth 3 is enough) and what they hold (file names and entry counts only).

Report: findings ranked by how likely each one is what the person saw, each with path:line, then the smallest fix you would make for each (one or two lines). If something doesn't match this brief, say so; don't guess.
