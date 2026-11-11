QA gate for task t-20261111-b2gp (risk HIGH per bh classify qa-risk; review deep, test budget 0-6 new behavioural tests, a ceiling). Read the request and the agreed plan: bh task show t-20261111-b2gp, bh plan show p-20261111-9dkc (Acceptance criteria section), the board (bh board read t-20261111-b2gp), and the diff (git diff; new files under mods/bot-herdr and test/). Judge the repository, not the workers' reports.

WHAT CHANGED (by area)
- Palette (look.js, theme.js): contrast repair to WCAG AA under every theme, alpha tokens composited, derived surfaces for themes without colors, send button from solid/solid_foreground, softer bubble edge, agentInk. Test: test/contrast.test.mjs over test/fixtures/herdr-themes.json.
- Visual refresh across chat.js, composer.js, switch.js, work.js, settings.js, toast.js, lightbox.js, pick.js, viewer.js: tokens (TYPE/SPACE/radii/MOTION), clickable/pressable/focusable helpers, shared segmented + stateView, reading width caps, nested scrolls removed, arrive/stagger motion.
- Attach: OS dialogs removed; in-pane file browser on `bh files` (engine/lib/files.mjs).
- Toast close (composer.js toastView/dropToast, MOTION.toastOut).
- Plan pop-up: plandoc.js + main.js view registration; Plans page shows conversation only with a "View plan" tab.
- Markdown live-preview editor: mdblocks.js, mdedit.js; Knowledge editor uses it; viewer .md preview + Source toggle; viewer search (search.js).
- Models: engine/lib/models.mjs + `bh models`; Settings picker reads it.
- Engine: role files trimmed (global/worker/design/qa/dev), team.mjs, qa-risk diffPayload, pickScripts one question, scripts/lib/common.mjs on core.mjs.

FOCUS (deep)
1. Load safety: herdr-app check only renders the first view. A missing import already slipped through (InputState in composer.js; fixed). Write a small node script (in .bot-herdr/tmp, not committed) that, for every mods/bot-herdr/*.js file, lists identifiers used as `X.new(`, `X.markdown(`, or called as bare functions/components that are neither imported, declared in the file, nor JS globals, and report any hits as CRITICAL.
2. Data safety: MarkdownEditor/Knowledge save must write exactly what was typed (round trip, CRLF); the file browser must never attach paths the person did not pick; `bh files` and `bh models` must not hang or leave processes (timeouts, kill on ACP/app-server).
3. Brief trims: no rule a role relies on disappeared (compare git diff of engine/roles/*.md: every removed rule must exist elsewhere in the brief output of `bh brief <role> --mode child`). Hard rules, report format, knowledge-proposal rule, workers-never-commit, board use.
4. Acceptance criteria in the plan: check each; criteria the team reported as not possible (tsc not installed; reduced motion has no API; colour transitions impossible; Up/Down between multi-line blocks; code chips) are known — confirm the reasons hold, don't re-raise them as defects.
5. Regressions: chat feed scroll after removing nested scrolls, the composer's panes, Settings model field typed-id path, the Plans page Start task from the dialog.

DO NOT edit production code. Tests only within the budget, where they add confidence.

VERDICT
Write .bot-herdr/tasks/t-20261111-b2gp/reports/qa-gate.md with: Verdict (PASS or CHANGES_REQUIRED), findings ranked critical/major/minor with path:line and a concrete failure scenario, acceptance criteria table (met / not met / known-not-possible), tests you ran. Then hc send t2z.
