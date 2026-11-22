# Dev brief — M4b Threads, Peek drawer, Goal row, Composer, Status bar, RECIPE.md

Task t-20261121-td97, step 4 (UI, part b of 2). M4a (5-destination nav, Home, Agents, Library, Settings › Usage, layout migration) is merged into this tree. You finish M4.

Read first:
- `.bot-herdr/tmp/design-language-spec.md`: **Navigation** (thread second row: Conversation, Plan, Steps, Changes), **Features borrowed** (Threads per task, Goal row, Peek / inline reply / number-key answers, One-line live summary), **Components** (Thread row, Peek panel, Question card, Board entry, Composer, Status bar), **Accessibility › Ease of use** (breadcrumb, back works everywhere, empty states teach, errors say what to do), **Building in GPUI**, **Goal prompt › NEVER**.
- `/home/athi/bot-herdr/.bot-herdr/plans/p-20261121-siir/plan.md`: step 5 and **Assumptions** (Peek = in-page right drawer ~380–420 px shared by Home, Threads and Agents, one focus tree; goal row from `bh goal progress --json`).
- Reports: `dev-m4-engine.md` (JSON shapes), `dev-m4a.md` (the seams it left you), `qa-m3.md`.
- `~/.config/herdr-app/AGENTS.md`: the **RECIPE.md** specification for shipped mods.

## Build
1. **Threads** (new `threads.js`): a thread list (state-grouped, Needs you first; thread rows per spec › Thread row; filter bar = search + one Filter button) from `bh thread list --json`; opening a thread shows a one-line breadcrumb (Threads › <title> › <sub-tab>) and the second-row sub-tabs **Conversation | Plan | Steps | Changes** from `bh thread show --json`. Conversation reuses today's chat/board rendering (board entries per spec › Board entry: type word muted, author, time, first line, expand in place). Plan reuses the plan doc view. Steps reuses the steps view. Changes moves the Changes panel here (diff stat; inline review comments come in M6). The Orchestrator chat becomes reachable as a thread or a pinned entry, so no capability is lost. Plans that aren't tasks yet show as threads too.
2. **Peek drawer** (new `peek.js`): in-page right drawer (~400 px), shared by Home, Threads and Agents. `Space` opens it for the selected row, `Esc` closes it. Contents per spec › Peek panel: recent output, any open question (as a Question card; number keys 1–9 pick), and a reply box that sends without leaving the list. Cost/tokens/harness/model live here, not in rows. One focus tree; rows keyed by stable id.
3. **Goal row** above the composer in a goal thread: ◎ goal, gate reached, elapsed, retries left, the judge's last reason; pause/resume, edit and clear actions (reusing existing goal commands). Data from `bh goal progress --json`.
4. **Composer**: one input line at rest; repo, branch and model chips appear on focus. Same send behaviour.
5. **Status bar**: machine, branch, agent count and palette hint. Nothing else, no buttons. Don't lose information: anything currently in the status strip moves to Home or the peek.
6. **Audit**: add the threads (list), thread-conversation, thread-plan, thread-steps, thread-changes and peek pages to the audit fixtures, compared against the M1 baseline of the pages they replace (chat, tasks, plans, tasks-board); state the mapping. Mark the P1 features that now exist as present in the audit's feature detection **only where the detection really finds them in the rendered spec** (e.g. goal row, peek, thread sub-tabs, home needs-you).
7. **`mods/bot-herdr/RECIPE.md`** (a DONE criterion): following AGENTS.md's recipe spec, how another agent rebuilds the redesigned mod, the layout, themes and tokens (look.js token map, state language, type/space/radius scales), the page map, the engine read models, the audit, and install's layout migration.
8. Every new view: render-safe boundary, tokens only, at most one accent action, `track_focus` + `role` + `accessibility_label`, keyboard reachable (J/K move, Space peek, Enter open, Esc back/close; the full key map is M5, but these four are needed for the peek now).
9. Tests: `test/render-resilience.test.mjs` fuzzes the new views with corrupt/legacy fixtures through the boundary (extend it; a DONE criterion). Update tests pinned to the old chat/tasks layout; never delete or skip.

## Checks (paste results)
`node_modules/.bin/tsc --noEmit -p mods/bot-herdr/jsconfig.json`, `node mods/bot-herdr/engine/bh.mjs check`, `npm test`, `/home/athi/.local/bin/herdr-app check mods/bot-herdr` (delete the generated `mods/bot-herdr/engine/lib/gpui-kit.d.ts`), `node mods/bot-herdr/engine/bh.mjs ui-audit --json --shots .bot-herdr/tasks/t-20261121-td97/shots/m4`, with every counter listed. Look at the shots, home/threads/peek especially, in all 4 themes.

Don't commit. Report to `.bot-herdr/tasks/t-20261121-td97/reports/dev-m4b.md` (an old → new map for chat/tasks/plans/board/changes/status strip proving nothing was lost, test changes, check results), then `bh report t-20261121-td97 --step 4 --file <that> "<summary>"`.
