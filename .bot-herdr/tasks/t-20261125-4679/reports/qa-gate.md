## Summary
PASS: readable fleet names and roles are correct, the Graph view builds, and the 50ms dot timer stops when the graph is hidden, idle or motion is reduced.
Findings are minor or info only: a safe-but-fragile home↔thread import cycle, a timer started from render (idempotent), and a full graph rebuild every 50ms.

## Changes
None (review only).

## Brief Check
- Render-time state creation: met. `agentsgraph.js` and `agentsgraphlayout.js` only build elements or compute geometry; no handles, maps or timers. State (`panel`, `tick`, `ticker`, `details`) is created in the `Agents` constructor (agents.js:92-95). `tickWhileMoving` is called from `render` (agents.js:212) but is guarded by `this.ticker`, so it creates at most one timer.
- 50ms timer stopped when hidden or idle: met. `tickWhileMoving` (agents.js:304-316) cancels when `open && graph` is false, motion is reduced, or no agent is `working`. Each tick calls `cx.notify()`, so the next render runs and cancels it within one tick after the page hides or work stops. List view passes `on=false`, so it cancels there too.
- Circular import home.mjs ↔ thread.mjs: present, safe today. thread.mjs:15 imports `terminalName` from home.mjs, and home.mjs:16 imports from thread.mjs. Neither module uses the other's bindings at top level (home's top-level consts read only `HEADLESS`; `terminalName` is a hoisted function used only at call time), and bh.mjs loads both with dynamic `import()`. See finding 1.
- Names and roles: met. Spawn name → non-numeric tab title → address; role via `findAgent`, then the name without its last `-suffix`. Live `bh home --json`: `t63 Orchestrator orchestrator`, `t69 qa-gate qa`, `t64 Design design`. The new test covers the name, the tab title, the numeric tab and the null role.
- `herdr-app check mods/bot-herdr`: met (check passed).
- `node --test test/home.test.mjs test/agents-graph.test.mjs`: met (27 pass, 0 fail).

## Findings
1. [minor] Import cycle home.mjs ↔ thread.mjs — mods/bot-herdr/engine/lib/thread.mjs:15. It works only because `terminalName` is a hoisted function. A future top-level use of a thread export in home.mjs (or the reverse) would hit a TDZ error, depending on load order. Fix: move `terminalName` into thread.mjs, which home.mjs already imports, and re-export it from there.
2. [minor] Every 50ms tick re-renders the whole graph — mods/bot-herdr/agents.js:307 → agentsgraph.js `dotGrid`/`segment`. With a 1600px column, the dot grid plus the dotted edges is several hundred absolutely placed divs, rebuilt 20 times a second while anything works. This is a CPU cost, not a correctness problem. The grid could be cached by size, or the tick could be slowed.
3. [info] The timer is started from `render` (agents.js:212). This follows the existing `cx.timer.after` load-in-render pattern, and it is guarded and self-cancelling.
4. [info] `terminalIndex` now keys terminals by tab title too (thread.mjs:88). Two terminals with the same readable name (a spawn "design" and a tab "Design") collide, and the last one wins for reply targets.
5. [info] `herdr-app check` logs a WARN that a reload stranded 4 `cx.timer.every` tasks. This comes from the check's reload, and the check still passes. I did not determine whether it predates the task.
6. [info] Nothing is committed. Per dev-names' Pushback, the Orchestrator commits the seven task files and leaves the user's chat.js, feed.js, button.js, settings.js, gpui-kit.d.ts and feed-thread.test.mjs alone.

## Verification
- `node --test test/home.test.mjs test/agents-graph.test.mjs` — 27 pass, 0 fail
- `herdr-app check mods/bot-herdr` — check passed (one reload WARN, see finding 5)
- `node --test test/*thread*.test.mjs` — 30 pass, 0 fail
- `node --test test/agents-reply.test.mjs test/threads-view.test.mjs` — 13 pass, 0 fail
- `node mods/bot-herdr/engine/bh.mjs home --json` — t63 Orchestrator/orchestrator, t69 qa-gate/qa, t64 Design/design
- Full suite not re-run. Both receipts (exit 1) predate the current tree hash, and their 18 failures are in untouched areas (reported pre-existing). [INFERENCE]

## Knowledge Proposals
- Keep shared engine helpers in the module already imported (thread.mjs ← home.mjs), not the other way round, to avoid ESM cycles in engine/lib.
