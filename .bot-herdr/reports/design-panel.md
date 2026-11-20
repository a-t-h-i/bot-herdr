## Summary
Design panel round 1: two visual questions (Metrics layout, auto vs manual skill picks) with mockups, plus UI notes with path:line evidence.
No files changed outside .bot-herdr.

## Changes
- .bot-herdr/tmp/p-7rw6-design-q.md, .bot-herdr/reports/design-panel.md — panel answer

## Status
OPEN

## Questions
1. How should the new Metrics tab lay out who works the most?
   - Leaderboard table — totals on top, one sortable row per agent with an inline bar for the chosen measure (time, tokens, cost, tasks, steps)
     ```mockup
     <style>
     body{margin:0;font-family:system-ui,sans-serif;background:#f5f4ef;color:#141413}
     .page{padding:16px 24px}
     .tabs{display:flex;gap:2px;background:#ebe9e2;border-radius:8px;padding:2px;width:max-content;margin-bottom:16px}
     .tab{padding:5px 16px;font-size:12px;border-radius:6px;color:#6a6964}.tab.on{border-bottom:2px solid #a25338;color:#141413}
     .bar{display:flex;gap:8px;align-items:center;margin-bottom:12px}
     .seg{display:flex;background:#ebe9e2;border-radius:8px;padding:2px}.seg span{padding:4px 12px;font-size:12px;border-radius:6px;color:#6a6964}.seg .on{background:#fff;color:#141413}
     .kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:16px}
     .kpi{background:#fff;border:1px solid #e3e0d7;border-radius:10px;padding:12px 16px}.kpi b{display:block;font-size:20px;font-variant-numeric:tabular-nums}.kpi span{font-size:12px;color:#6a6964}
     table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e3e0d7;border-radius:10px;overflow:hidden;font-size:13.5px}
     th{text-align:left;font-size:12px;color:#6a6964;font-weight:500;padding:8px 16px;border-bottom:1px solid #e3e0d7}th.on{color:#141413}
     td{padding:10px 16px;border-bottom:1px solid #efede6;font-variant-numeric:tabular-nums}
     .who{display:flex;gap:8px;align-items:center}.av{width:22px;height:22px;border-radius:50%;color:#fff;font-size:11px;display:flex;align-items:center;justify-content:center}
     .track{width:220px;height:8px;background:#ebe9e2;border-radius:4px}.fill{height:8px;background:#a25338;border-radius:4px}
     </style>
     <div class="page">
     <div class="tabs"><span class="tab">Chat</span><span class="tab">Terminals</span><span class="tab">Tasks</span><span class="tab">Plans</span><span class="tab">Knowledge</span><span class="tab on">Metrics</span><span class="tab">Settings</span></div>
     <div class="bar"><div class="seg"><span>Today</span><span class="on">7 days</span><span>30 days</span><span>All</span></div><div style="flex:1"></div><div class="seg"><span class="on">Time</span><span>Tokens</span><span>Cost</span><span>Tasks</span><span>Steps</span></div></div>
     <div class="kpis"><div class="kpi"><b>14 h 20 min</b><span>Time worked</span></div><div class="kpi"><b>38.4M</b><span>Tokens</span></div><div class="kpi"><b>$52.10</b><span>Cost</span></div><div class="kpi"><b>23</b><span>Tasks</span></div><div class="kpi"><b>141</b><span>Steps</span></div></div>
     <table><tr><th>Agent</th><th class="on">Time ▾</th><th></th><th>Tokens</th><th>Cost</th><th>Tasks</th><th>Steps</th></tr>
     <tr><td><div class="who"><div class="av" style="background:#a25338">D</div>dev</div></td><td>5 h 40 min</td><td><div class="track"><div class="fill" style="width:100%"></div></div></td><td>16.2M</td><td>$21.80</td><td>19</td><td>58</td></tr>
     <tr><td><div class="who"><div class="av" style="background:#5a7fa8">D</div>design</div></td><td>3 h 55 min</td><td><div class="track"><div class="fill" style="width:69%"></div></div></td><td>9.8M</td><td>$13.40</td><td>12</td><td>34</td></tr>
     <tr><td><div class="who"><div class="av" style="background:#6b8f5a">Q</div>qa</div></td><td>2 h 30 min</td><td><div class="track"><div class="fill" style="width:44%"></div></div></td><td>6.1M</td><td>$8.20</td><td>15</td><td>27</td></tr>
     <tr><td><div class="who"><div class="av" style="background:#8a6bb0">O</div>orchestrator</div></td><td>1 h 25 min</td><td><div class="track"><div class="fill" style="width:25%"></div></div></td><td>4.3M</td><td>$6.10</td><td>23</td><td>14</td></tr>
     <tr><td><div class="who"><div class="av" style="background:#b08a3e">R</div>research</div></td><td>50 min</td><td><div class="track"><div class="fill" style="width:15%"></div></div></td><td>2.0M</td><td>$2.60</td><td>6</td><td>8</td></tr>
     </table></div>
     ```
   - Agent cards — one card per agent with its five numbers and a small daily-activity chart, busiest first
     ```mockup
     <style>
     body{margin:0;font-family:system-ui,sans-serif;background:#f5f4ef;color:#141413}
     .page{padding:16px 24px}
     .tabs{display:flex;gap:2px;background:#ebe9e2;border-radius:8px;padding:2px;width:max-content;margin-bottom:16px}
     .tab{padding:5px 16px;font-size:12px;border-radius:6px;color:#6a6964}.tab.on{border-bottom:2px solid #a25338;color:#141413}
     .seg{display:flex;background:#ebe9e2;border-radius:8px;padding:2px;width:max-content;margin-bottom:16px}.seg span{padding:4px 12px;font-size:12px;border-radius:6px;color:#6a6964}.seg .on{background:#fff;color:#141413}
     .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
     .card{background:#fff;border:1px solid #e3e0d7;border-radius:10px;padding:16px}
     .head{display:flex;gap:8px;align-items:center;font-weight:600;font-size:16px;margin-bottom:12px}.av{width:26px;height:26px;border-radius:50%;color:#fff;font-size:12px;display:flex;align-items:center;justify-content:center}
     .rank{margin-left:auto;font-size:12px;color:#6a6964;font-weight:400}
     .nums{display:grid;grid-template-columns:repeat(3,1fr);gap:8px 12px;margin-bottom:12px}.nums b{display:block;font-size:15px;font-variant-numeric:tabular-nums}.nums span{font-size:12px;color:#6a6964}
     .spark{display:flex;align-items:flex-end;gap:4px;height:44px;border-top:1px solid #efede6;padding-top:8px}.spark i{flex:1;background:#a25338;opacity:.8;border-radius:2px}
     </style>
     <div class="page">
     <div class="tabs"><span class="tab">Chat</span><span class="tab">Terminals</span><span class="tab">Tasks</span><span class="tab">Plans</span><span class="tab">Knowledge</span><span class="tab on">Metrics</span><span class="tab">Settings</span></div>
     <div class="seg"><span>Today</span><span class="on">7 days</span><span>30 days</span><span>All</span></div>
     <div class="grid">
     <div class="card"><div class="head"><div class="av" style="background:#a25338">D</div>dev<span class="rank">#1 · 40% of time</span></div><div class="nums"><div><b>5 h 40 min</b><span>Time</span></div><div><b>16.2M</b><span>Tokens</span></div><div><b>$21.80</b><span>Cost</span></div><div><b>19</b><span>Tasks</span></div><div><b>58</b><span>Steps</span></div></div><div class="spark"><i style="height:40%"></i><i style="height:70%"></i><i style="height:55%"></i><i style="height:100%"></i><i style="height:80%"></i><i style="height:30%"></i><i style="height:60%"></i></div></div>
     <div class="card"><div class="head"><div class="av" style="background:#5a7fa8">D</div>design<span class="rank">#2 · 27%</span></div><div class="nums"><div><b>3 h 55 min</b><span>Time</span></div><div><b>9.8M</b><span>Tokens</span></div><div><b>$13.40</b><span>Cost</span></div><div><b>12</b><span>Tasks</span></div><div><b>34</b><span>Steps</span></div></div><div class="spark"><i style="height:20%"></i><i style="height:50%"></i><i style="height:65%"></i><i style="height:45%"></i><i style="height:90%"></i><i style="height:35%"></i><i style="height:25%"></i></div></div>
     <div class="card"><div class="head"><div class="av" style="background:#6b8f5a">Q</div>qa<span class="rank">#3 · 17%</span></div><div class="nums"><div><b>2 h 30 min</b><span>Time</span></div><div><b>6.1M</b><span>Tokens</span></div><div><b>$8.20</b><span>Cost</span></div><div><b>15</b><span>Tasks</span></div><div><b>27</b><span>Steps</span></div></div><div class="spark"><i style="height:30%"></i><i style="height:25%"></i><i style="height:60%"></i><i style="height:40%"></i><i style="height:55%"></i><i style="height:70%"></i><i style="height:20%"></i></div></div>
     <div class="card"><div class="head"><div class="av" style="background:#8a6bb0">O</div>orchestrator<span class="rank">#4 · 10%</span></div><div class="nums"><div><b>1 h 25 min</b><span>Time</span></div><div><b>4.3M</b><span>Tokens</span></div><div><b>$6.10</b><span>Cost</span></div><div><b>23</b><span>Tasks</span></div><div><b>14</b><span>Steps</span></div></div><div class="spark"><i style="height:50%"></i><i style="height:45%"></i><i style="height:40%"></i><i style="height:60%"></i><i style="height:50%"></i><i style="height:30%"></i><i style="height:35%"></i></div></div>
     <div class="card"><div class="head"><div class="av" style="background:#b08a3e">R</div>research<span class="rank">#5 · 6%</span></div><div class="nums"><div><b>50 min</b><span>Time</span></div><div><b>2.0M</b><span>Tokens</span></div><div><b>$2.60</b><span>Cost</span></div><div><b>6</b><span>Tasks</span></div><div><b>8</b><span>Steps</span></div></div><div class="spark"><i style="height:10%"></i><i style="height:0%"></i><i style="height:40%"></i><i style="height:15%"></i><i style="height:20%"></i><i style="height:5%"></i><i style="height:30%"></i></div></div>
     </div></div>
     ```
   - Chart over time — a stacked daily bar chart (one colour per agent) for the chosen measure, with a compact leaderboard under it
     ```mockup
     <style>
     body{margin:0;font-family:system-ui,sans-serif;background:#f5f4ef;color:#141413}
     .page{padding:16px 24px}
     .tabs{display:flex;gap:2px;background:#ebe9e2;border-radius:8px;padding:2px;width:max-content;margin-bottom:16px}
     .tab{padding:5px 16px;font-size:12px;border-radius:6px;color:#6a6964}.tab.on{border-bottom:2px solid #a25338;color:#141413}
     .bar{display:flex;gap:8px;margin-bottom:12px}.seg{display:flex;background:#ebe9e2;border-radius:8px;padding:2px}.seg span{padding:4px 12px;font-size:12px;border-radius:6px;color:#6a6964}.seg .on{background:#fff;color:#141413}
     .panel{background:#fff;border:1px solid #e3e0d7;border-radius:10px;padding:16px;margin-bottom:12px}
     .chart{display:flex;align-items:flex-end;gap:24px;height:240px;border-bottom:1px solid #e3e0d7;padding:0 12px}
     .col{flex:1;display:flex;flex-direction:column-reverse;gap:2px}.col i{display:block;border-radius:2px}
     .days{display:flex;gap:24px;padding:6px 12px 0;font-size:12px;color:#6a6964}.days span{flex:1;text-align:center}
     .legend{display:flex;gap:16px;font-size:12px;color:#6a6964;margin-top:12px}.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px}
     .rows{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;font-size:13.5px}.rows b{font-variant-numeric:tabular-nums}
     </style>
     <div class="page">
     <div class="tabs"><span class="tab">Chat</span><span class="tab">Terminals</span><span class="tab">Tasks</span><span class="tab">Plans</span><span class="tab">Knowledge</span><span class="tab on">Metrics</span><span class="tab">Settings</span></div>
     <div class="bar"><div class="seg"><span>Today</span><span class="on">7 days</span><span>30 days</span></div><div style="flex:1"></div><div class="seg"><span>Time</span><span class="on">Tokens</span><span>Cost</span><span>Tasks</span><span>Steps</span></div></div>
     <div class="panel"><div class="chart">
     <div class="col"><i style="height:40px;background:#a25338"></i><i style="height:20px;background:#5a7fa8"></i><i style="height:14px;background:#6b8f5a"></i><i style="height:10px;background:#8a6bb0"></i></div>
     <div class="col"><i style="height:70px;background:#a25338"></i><i style="height:40px;background:#5a7fa8"></i><i style="height:20px;background:#6b8f5a"></i><i style="height:12px;background:#8a6bb0"></i><i style="height:8px;background:#b08a3e"></i></div>
     <div class="col"><i style="height:55px;background:#a25338"></i><i style="height:50px;background:#5a7fa8"></i><i style="height:30px;background:#6b8f5a"></i><i style="height:14px;background:#8a6bb0"></i></div>
     <div class="col"><i style="height:100px;background:#a25338"></i><i style="height:36px;background:#5a7fa8"></i><i style="height:22px;background:#6b8f5a"></i><i style="height:18px;background:#8a6bb0"></i><i style="height:20px;background:#b08a3e"></i></div>
     <div class="col"><i style="height:80px;background:#a25338"></i><i style="height:70px;background:#5a7fa8"></i><i style="height:28px;background:#6b8f5a"></i><i style="height:16px;background:#8a6bb0"></i></div>
     <div class="col"><i style="height:30px;background:#a25338"></i><i style="height:24px;background:#5a7fa8"></i><i style="height:36px;background:#6b8f5a"></i><i style="height:10px;background:#8a6bb0"></i></div>
     <div class="col"><i style="height:60px;background:#a25338"></i><i style="height:20px;background:#5a7fa8"></i><i style="height:10px;background:#6b8f5a"></i><i style="height:12px;background:#8a6bb0"></i><i style="height:14px;background:#b08a3e"></i></div>
     </div><div class="days"><span>Fri 14</span><span>Sat 15</span><span>Sun 16</span><span>Mon 17</span><span>Tue 18</span><span>Wed 19</span><span>Thu 20</span></div>
     <div class="legend"><span><i style="background:#a25338"></i>dev</span><span><i style="background:#5a7fa8"></i>design</span><span><i style="background:#6b8f5a"></i>qa</span><span><i style="background:#8a6bb0"></i>orchestrator</span><span><i style="background:#b08a3e"></i>research</span></div></div>
     <div class="panel rows"><div>dev <b>16.2M</b></div><div>design <b>9.8M</b></div><div>qa <b>6.1M</b></div><div>orchestrator <b>4.3M</b></div><div>research <b>2.0M</b></div></div>
     </div>
     ```
2. Once the classifier picks skills per agent, how should Settings show your manual picks next to the automatic ones?
   - One chip list, three states — each skill chip cycles Auto → Always → Never; the card shows a short count line
     ```mockup
     <style>
     body{margin:0;font-family:system-ui,sans-serif;background:#f5f4ef;color:#141413}
     .dlg{width:560px;margin:24px auto;background:#fff;border:1px solid #e3e0d7;border-radius:10px}
     .hd{display:flex;gap:8px;align-items:center;padding:12px 16px;border-bottom:1px solid #e3e0d7;font-size:16px;font-weight:600}.av{width:28px;height:28px;border-radius:50%;background:#5a7fa8;color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px}
     .bd{padding:16px}.lbl{font-size:12px;font-weight:500;color:#6a6964;margin-bottom:4px}.hint{font-size:10.5px;color:#6a6964;margin-bottom:8px}
     .chips{display:flex;flex-wrap:wrap;gap:4px}.chip{font-size:12px;padding:5px 10px;border-radius:14px;border:1px solid #e3e0d7;background:#fff}
     .chip.always{background:#a25338;color:#fff;border-color:#a25338}.chip.never{color:#6a6964;text-decoration:line-through;background:#ebe9e2}
     .chip small{opacity:.8;margin-left:4px}
     .key{display:flex;gap:16px;font-size:10.5px;color:#6a6964;margin-top:12px}
     </style>
     <div class="dlg"><div class="hd"><div class="av">D</div>design</div><div class="bd">
     <div class="lbl">Skills</div><div class="hint">Auto: the classifier picks per task. Click a chip to pin it on or off.</div>
     <div class="chips"><span class="chip always">dataviz<small>Always</small></span><span class="chip">plugin-authoring<small>Auto</small></span><span class="chip">run<small>Auto</small></span><span class="chip">code-review<small>Auto</small></span><span class="chip never">claude-api<small>Never</small></span><span class="chip">docx<small>Auto</small></span><span class="chip">pdf<small>Auto</small></span><span class="chip">simplify<small>Auto</small></span></div>
     <div class="key"><span>1 always</span><span>1 never</span><span>6 auto</span></div>
     </div></div>
     ```
   - Two sections — "Pinned by you" (ticked chips, as today) and a read-only "Picked for the current task" list from the classifier
     ```mockup
     <style>
     body{margin:0;font-family:system-ui,sans-serif;background:#f5f4ef;color:#141413}
     .dlg{width:560px;margin:24px auto;background:#fff;border:1px solid #e3e0d7;border-radius:10px}
     .hd{display:flex;gap:8px;align-items:center;padding:12px 16px;border-bottom:1px solid #e3e0d7;font-size:16px;font-weight:600}.av{width:28px;height:28px;border-radius:50%;background:#5a7fa8;color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px}
     .bd{padding:16px}.sec{margin-bottom:16px}.lbl{font-size:12px;font-weight:500;color:#6a6964;margin-bottom:4px}.hint{font-size:10.5px;color:#6a6964;margin-bottom:8px}
     .chips{display:flex;flex-wrap:wrap;gap:4px}.chip{font-size:12px;padding:5px 10px;border-radius:14px;border:1px solid #e3e0d7;background:#fff}.chip.on{background:#a25338;color:#fff;border-color:#a25338}
     .auto{font-size:13.5px;border:1px solid #efede6;border-radius:8px}.auto div{display:flex;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #efede6}.auto div:last-child{border:0}.auto span{font-size:12px;color:#6a6964}
     </style>
     <div class="dlg"><div class="hd"><div class="av">D</div>design</div><div class="bd">
     <div class="sec"><div class="lbl">Pinned by you</div><div class="hint">Always loaded, whatever the task.</div>
     <div class="chips"><span class="chip on">dataviz</span><span class="chip">plugin-authoring</span><span class="chip">run</span><span class="chip">code-review</span><span class="chip">claude-api</span><span class="chip">docx</span><span class="chip">simplify</span></div></div>
     <div class="sec"><div class="lbl">Picked for t-20261120-ab12 by the classifier</div>
     <div class="auto"><div>plugin-authoring<span>role: UI mod work</span></div><div>run<span>task asks to check it in the app</span></div></div></div>
     </div></div>
     ```

## Notes
- Tabs: pages are one list in `mods/bot-herdr/pages.js:8` (PAGES); the switch fits labels by narrowing padding then clipping (`switch.js:29-32`), so a 7th tab costs width on narrow windows. Metrics fits best between Knowledge and Settings; it needs a new `page-metrics` icon in `icons/` (none fits today) and a layout child `metrics` alongside the others.
- gpui-kit has no chart component: only `PathBuilder` + `window.paint_path` (gpui-kit.d.ts:20403-20510), `Progress/ProgressTrack/ProgressIndicator` (:20757-20776) and semantic `Table*` (:21008-21033). A leaderboard needs only Table + bars (cheap, accessible); time charts need hand-drawn paths and a text alternative. Put the aggregation in a pure module (no gpui imports) so Node tests can cover it.
- Data exists: every turn appends {agent, harness, model, task, step, tokens, cost, ms} to `.bot-herdr/usage/*.jsonl` (`engine/lib/agent.mjs:311-327`) and `bh usage` already sums per agent. Metrics should read one JSON command (e.g. `bh usage --json`), not parse files in the UI — DEV's seat. Note `bh usage` today reports input/output/cache split; "tokens" in the UI (`steps.js:18`) is a single total — pick one definition.
- Skill picks today: only inside the agent's More dialog (`settings.js:1143-1165`) as toggle chips, "None ticked: it can use all of them." The agent card (`settings.js:640-689`) shows no skills at all, and the Tasks/Plans pages never show which skills a step used (no "skill" in plandoc.js/work.js). Auto-assigned skills will be invisible unless a step row or plan doc shows them.
- Harness support message is hard-coded "Claude Code, Codex and OpenCode" (`settings.js:1151`); adding Gemini etc. must update it (better: derive from the engine's list in `engine/lib/tools.mjs:15`).
- UX friction seen: skill list is unsearchable flat chips — with plugins (`bh tools claude` lists ~30+) the dialog becomes a wall; tool discovery has no cache age shown, only a refresh button (`settings.js:1146`).
- Assumed: Metrics is read-only, no export, time windows Today/7d/30d/All. Design will follow existing tokens (look.js SPACE/TYPE/CONTROL, actionButton, segmented, agentBadge).

