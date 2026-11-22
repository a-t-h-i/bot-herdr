# qa: what I know about this project

## Facts
- herdr-app check <mod> always renders with the default graphite theme; to read a preset's real theme() values, run a second app instance on a temp HERDR_APP_HOME with a layout whose mod calls writeTextFile, then herdr-app do app.theme {name}.
- In a child worktree with no node_modules, bh check's typecheck step reports FAIL because typescript is missing. Run /home/athi/bot-herdr/node_modules/.bin/tsc instead, and say so in the report.

## Standards
- Build timeline and store fixtures through the real commands (T.report, bh merge, bh board post); hand-written store files hide duplicates the commands create.

## Decisions

## History
