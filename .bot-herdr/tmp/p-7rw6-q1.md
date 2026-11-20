1. [DEV] [QA] When the classifier picks skills for each agent from its role and the task (also for planning), how should its picks combine with the ones you tick in Settings?
   - Pins plus suggestions — your ticked skills apply as today (enforced on Claude Code); the classifier names a few task-relevant skills in the brief and denies nothing, so a wrong pick costs nothing.
   - Classifier allowlist — the classifier's picks plus your pins become the only skills allowed where the harness can enforce it (Claude Code, MCP on Codex); others just get them named in the brief.
   - Suggest only — nothing applies on its own: the classifier proposes a set per agent and task in Settings, and you tick it to apply.
2. [DEV] [QA] Only Claude Code reports tokens and cost; Codex reports tokens only, and OpenCode, Gemini, Qwen, pi and omp record only time today. What should the Metrics tab do about that?
   - Capture more, dash the rest — also read the usage OpenCode already sends (ACP usage updates); show "—" where a harness reports nothing, and rank by time worked, which every harness has.
   - Estimate — fill missing tokens and cost from time worked and a price table, marked as estimates.
   - Dash only — no new capture; show "—" where nothing is reported.
3. [DESIGN] How should the new Metrics tab show who works the most?
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
4. [ORCHESTRATOR] Team members start a fresh session on every spawn, but the Orchestrator keeps one chat session across all tasks, and every tool call re-reads it from cache (95% of the tokens recorded here are cached re-reads). How should the Orchestrator's session be handled?
   - Fresh per task — each new task or plan starts a new Orchestrator session; the board, plan and knowledge carry what it needs.
   - Compact between tasks — keep one session but compact it when a task completes, where the harness supports it.
   - Keep as is — the chat keeps one long session; token work stays on briefs and classifier calls.
