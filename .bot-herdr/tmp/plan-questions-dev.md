1. [DEV] When the classifier picks skills for an agent from its role and the task, how should that picked set apply?
   - Restrict where possible — on Claude Code the picked skills and MCP servers are an allowlist (the rest are denied at launch) and Codex gets the same for MCP servers; every other harness only gets the picks named in its brief.
   - Name them in the brief — the picks are written into the agent's brief, and every installed skill stays usable, so a wrong pick costs nothing but also does not narrow anything.
   - Suggest in Settings — nothing is applied automatically: the classifier proposes a set for each agent and task, and the user ticks it to apply.

2. [DEV] Some harnesses report no token or cost numbers (omp, opencode, Gemini, Qwen). What should the dashboard show for those agents?
   - Show a dash — tokens and cost stay empty (—) where a harness reports none, and agents rank by time worked, which every harness records.
     ```mockup
     <style>
       body{margin:0;background:#262624;font:13px/1.45 -apple-system,Segoe UI,Roboto,sans-serif;color:#faf9f5}
       .app{display:flex;min-height:825px}
       .rail{width:190px;background:#1f1e1d;border-right:1px solid #3e3e38;padding:14px 10px;color:#b2afa7}
       .rail h1{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#91908a;margin:2px 8px 14px}
       .rail .p{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:7px;font-size:13.5px}
       .rail .p .dot{width:14px;height:14px;border-radius:4px;background:#3a3936}
       .rail .p.on{background:#4d4c49;color:#faf9f5}
       .rail .p.on .dot{background:#d97757}
       .main{flex:1;padding:22px 26px}
       .head{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:4px}
       h2{font-size:19px;margin:0;font-weight:600}
       .range{color:#91908a;font-size:12px}
       .chips{display:flex;gap:6px;margin:12px 0 18px}
       .chip{border:1px solid #3e3e38;border-radius:999px;padding:4px 11px;font-size:12px;color:#b2afa7}
       .chip.on{background:#3a3936;color:#faf9f5;border-color:#4a4a47}
       .cards{display:flex;gap:12px;margin-bottom:20px}
       .card{flex:1;background:#30302e;border:1px solid #3e3e38;border-radius:10px;padding:11px 13px}
       .card .k{color:#91908a;font-size:11.5px;text-transform:uppercase;letter-spacing:.08em}
       .card .v{font-size:19px;margin-top:5px}
       table{width:100%;border-collapse:collapse}
       th{text-align:left;color:#91908a;font-weight:500;font-size:11.5px;text-transform:uppercase;letter-spacing:.07em;padding:0 10px 8px;border-bottom:1px solid #3e3e38}
       td{padding:10px;border-bottom:1px solid #34342f}
       tr.me td{background:#33322f}
       .n{text-align:right}
       .mut{color:#91908a}
       .dash{color:#6f6e68}
       .bar{height:6px;border-radius:3px;background:#4a4a47;width:120px;display:inline-block;vertical-align:middle}
       .bar i{display:block;height:6px;border-radius:3px;background:#d97757}
       .note{color:#91908a;font-size:12px;margin-top:14px}
     </style>
     <div class="app">
       <div class="rail">
         <h1>bot-herdr</h1>
         <div class="p"><span class="dot"></span>Chat</div>
         <div class="p"><span class="dot"></span>Terminals</div>
         <div class="p"><span class="dot"></span>Tasks</div>
         <div class="p"><span class="dot"></span>Plans</div>
         <div class="p"><span class="dot"></span>Knowledge</div>
         <div class="p on"><span class="dot"></span>Usage</div>
         <div class="p"><span class="dot"></span>Settings</div>
       </div>
       <div class="main">
         <div class="head"><h2>Usage</h2><span class="range">last 30 days</span></div>
         <div class="chips"><span class="chip on">30 days</span><span class="chip">7 days</span><span class="chip">This task</span><span class="chip">By role</span></div>
         <div class="cards">
           <div class="card"><div class="k">Worked</div><div class="v">6h 12m</div></div>
           <div class="card"><div class="k">Turns</div><div class="v">151</div></div>
           <div class="card"><div class="k">Tokens reported</div><div class="v">3.4M</div></div>
           <div class="card"><div class="k">Cost reported</div><div class="v">$9.21</div></div>
         </div>
         <table>
           <tr><th>Agent</th><th>Harness</th><th>Time</th><th>Share</th><th class="n">Turns</th><th class="n">Tokens</th><th class="n">Cost</th></tr>
           <tr class="me"><td>Dev</td><td class="mut">claude</td><td>2h 41m</td><td><span class="bar"><i style="width:100%"></i></span></td><td class="n">58</td><td class="n">1.8M</td><td class="n">$4.60</td></tr>
           <tr><td>QA</td><td class="mut">claude</td><td>1h 48m</td><td><span class="bar"><i style="width:67%"></i></span></td><td class="n">31</td><td class="n">1.4M</td><td class="n">$3.90</td></tr>
           <tr><td>Dev-2</td><td class="mut">omp</td><td>1h 12m</td><td><span class="bar"><i style="width:45%"></i></span></td><td class="n">44</td><td class="n dash">—</td><td class="n dash">—</td></tr>
           <tr><td>Research</td><td class="mut">opencode</td><td>31m</td><td><span class="bar"><i style="width:19%"></i></span></td><td class="n">18</td><td class="n dash">—</td><td class="n dash">—</td></tr>
         </table>
         <div class="note">omp and opencode do not report tokens or cost; their agents are ranked by time worked.</div>
       </div>
     </div>
     ```
   - Estimate from time — tokens and cost are estimated from minutes worked for the harnesses that report nothing, so every agent has a number, marked as an estimate.
     ```mockup
     <style>
       body{margin:0;background:#262624;font:13px/1.45 -apple-system,Segoe UI,Roboto,sans-serif;color:#faf9f5}
       .app{display:flex;min-height:825px}
       .rail{width:190px;background:#1f1e1d;border-right:1px solid #3e3e38;padding:14px 10px;color:#b2afa7}
       .rail h1{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#91908a;margin:2px 8px 14px}
       .rail .p{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:7px;font-size:13.5px}
       .rail .p .dot{width:14px;height:14px;border-radius:4px;background:#3a3936}
       .rail .p.on{background:#4d4c49;color:#faf9f5}
       .rail .p.on .dot{background:#d97757}
       .main{flex:1;padding:22px 26px}
       .head{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:4px}
       h2{font-size:19px;margin:0;font-weight:600}
       .range{color:#91908a;font-size:12px}
       .chips{display:flex;gap:6px;margin:12px 0 18px}
       .chip{border:1px solid #3e3e38;border-radius:999px;padding:4px 11px;font-size:12px;color:#b2afa7}
       .chip.on{background:#3a3936;color:#faf9f5;border-color:#4a4a47}
       .cards{display:flex;gap:12px;margin-bottom:20px}
       .card{flex:1;background:#30302e;border:1px solid #3e3e38;border-radius:10px;padding:11px 13px}
       .card .k{color:#91908a;font-size:11.5px;text-transform:uppercase;letter-spacing:.08em}
       .card .v{font-size:19px;margin-top:5px}
       table{width:100%;border-collapse:collapse}
       th{text-align:left;color:#91908a;font-weight:500;font-size:11.5px;text-transform:uppercase;letter-spacing:.07em;padding:0 10px 8px;border-bottom:1px solid #3e3e38}
       td{padding:10px;border-bottom:1px solid #34342f}
       tr.me td{background:#33322f}
       .n{text-align:right}
       .mut{color:#91908a}
       .est{color:#b2afa7;border-bottom:1px dotted #6f6e68}
       .bar{height:6px;border-radius:3px;background:#4a4a47;width:120px;display:inline-block;vertical-align:middle}
       .bar i{display:block;height:6px;border-radius:3px;background:#d97757}
       .note{color:#91908a;font-size:12px;margin-top:14px}
       .tag{font-size:10px;color:#91908a;border:1px solid #4a4a47;border-radius:4px;padding:1px 4px;margin-left:6px}
     </style>
     <div class="app">
       <div class="rail">
         <h1>bot-herdr</h1>
         <div class="p"><span class="dot"></span>Chat</div>
         <div class="p"><span class="dot"></span>Terminals</div>
         <div class="p"><span class="dot"></span>Tasks</div>
         <div class="p"><span class="dot"></span>Plans</div>
         <div class="p"><span class="dot"></span>Knowledge</div>
         <div class="p on"><span class="dot"></span>Usage</div>
         <div class="p"><span class="dot"></span>Settings</div>
       </div>
       <div class="main">
         <div class="head"><h2>Usage</h2><span class="range">last 30 days</span></div>
         <div class="chips"><span class="chip on">30 days</span><span class="chip">7 days</span><span class="chip">This task</span><span class="chip">By role</span></div>
         <div class="cards">
           <div class="card"><div class="k">Worked</div><div class="v">6h 12m</div></div>
           <div class="card"><div class="k">Turns</div><div class="v">151</div></div>
           <div class="card"><div class="k">Tokens <span class="tag">some estimated</span></div><div class="v">~4.1M</div></div>
           <div class="card"><div class="k">Cost <span class="tag">some estimated</span></div><div class="v">~$11.30</div></div>
         </div>
         <table>
           <tr><th>Agent</th><th>Harness</th><th>Time</th><th>Share</th><th class="n">Turns</th><th class="n">Tokens</th><th class="n">Cost</th></tr>
           <tr class="me"><td>Dev</td><td class="mut">claude</td><td>2h 41m</td><td><span class="bar"><i style="width:100%"></i></span></td><td class="n">58</td><td class="n">1.8M</td><td class="n">$4.60</td></tr>
           <tr><td>QA</td><td class="mut">claude</td><td>1h 48m</td><td><span class="bar"><i style="width:67%"></i></span></td><td class="n">31</td><td class="n">1.4M</td><td class="n">$3.90</td></tr>
           <tr><td>Dev-2</td><td class="mut">omp</td><td>1h 12m</td><td><span class="bar"><i style="width:45%"></i></span></td><td class="n">44</td><td class="n est">~610k</td><td class="n est">~$1.70</td></tr>
           <tr><td>Research</td><td class="mut">opencode</td><td>31m</td><td><span class="bar"><i style="width:19%"></i></span></td><td class="n">18</td><td class="n est">~260k</td><td class="n est">~$1.10</td></tr>
         </table>
         <div class="note">Dotted numbers are estimated from time worked at the team's average rate: they are not what the harness reported.</div>
       </div>
     </div>
     ```
   - Hide them — the table lists only harnesses that report tokens and cost; agents on omp, opencode, Gemini and Qwen are left out of it entirely.
     ```mockup
     <style>
       body{margin:0;background:#262624;font:13px/1.45 -apple-system,Segoe UI,Roboto,sans-serif;color:#faf9f5}
       .app{display:flex;min-height:825px}
       .rail{width:190px;background:#1f1e1d;border-right:1px solid #3e3e38;padding:14px 10px;color:#b2afa7}
       .rail h1{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#91908a;margin:2px 8px 14px}
       .rail .p{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:7px;font-size:13.5px}
       .rail .p .dot{width:14px;height:14px;border-radius:4px;background:#3a3936}
       .rail .p.on{background:#4d4c49;color:#faf9f5}
       .rail .p.on .dot{background:#d97757}
       .main{flex:1;padding:22px 26px}
       .head{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:4px}
       h2{font-size:19px;margin:0;font-weight:600}
       .range{color:#91908a;font-size:12px}
       .chips{display:flex;gap:6px;margin:12px 0 18px}
       .chip{border:1px solid #3e3e38;border-radius:999px;padding:4px 11px;font-size:12px;color:#b2afa7}
       .chip.on{background:#3a3936;color:#faf9f5;border-color:#4a4a47}
       .cards{display:flex;gap:12px;margin-bottom:20px}
       .card{flex:1;background:#30302e;border:1px solid #3e3e38;border-radius:10px;padding:11px 13px}
       .card .k{color:#91908a;font-size:11.5px;text-transform:uppercase;letter-spacing:.08em}
       .card .v{font-size:19px;margin-top:5px}
       table{width:100%;border-collapse:collapse}
       th{text-align:left;color:#91908a;font-weight:500;font-size:11.5px;text-transform:uppercase;letter-spacing:.07em;padding:0 10px 8px;border-bottom:1px solid #3e3e38}
       td{padding:10px;border-bottom:1px solid #34342f}
       tr.me td{background:#33322f}
       .n{text-align:right}
       .mut{color:#91908a}
       .bar{height:6px;border-radius:3px;background:#4a4a47;width:120px;display:inline-block;vertical-align:middle}
       .bar i{display:block;height:6px;border-radius:3px;background:#d97757}
       .note{color:#91908a;font-size:12px;margin-top:14px}
       .skip{background:#30302e;border:1px dashed #4a4a47;border-radius:9px;padding:11px 13px;color:#b2afa7;margin-top:16px;font-size:12.5px}
     </style>
     <div class="app">
       <div class="rail">
         <h1>bot-herdr</h1>
         <div class="p"><span class="dot"></span>Chat</div>
         <div class="p"><span class="dot"></span>Terminals</div>
         <div class="p"><span class="dot"></span>Tasks</div>
         <div class="p"><span class="dot"></span>Plans</div>
         <div class="p"><span class="dot"></span>Knowledge</div>
         <div class="p on"><span class="dot"></span>Usage</div>
         <div class="p"><span class="dot"></span>Settings</div>
       </div>
       <div class="main">
         <div class="head"><h2>Usage</h2><span class="range">last 30 days</span></div>
         <div class="chips"><span class="chip on">30 days</span><span class="chip">7 days</span><span class="chip">This task</span></div>
         <div class="cards">
           <div class="card"><div class="k">Turns</div><div class="v">89</div></div>
           <div class="card"><div class="k">Tokens</div><div class="v">3.2M</div></div>
           <div class="card"><div class="k">Cost</div><div class="v">$8.50</div></div>
         </div>
         <table>
           <tr><th>Agent</th><th>Harness</th><th>Share</th><th class="n">Turns</th><th class="n">Tokens</th><th class="n">Cost</th></tr>
           <tr class="me"><td>Dev</td><td class="mut">claude</td><td><span class="bar"><i style="width:100%"></i></span></td><td class="n">58</td><td class="n">1.8M</td><td class="n">$4.60</td></tr>
           <tr><td>QA</td><td class="mut">claude</td><td><span class="bar"><i style="width:67%"></i></span></td><td class="n">31</td><td class="n">1.4M</td><td class="n">$3.90</td></tr>
         </table>
         <div class="skip">3 agents left out: Dev-2 and Research run on harnesses that report no tokens or cost.</div>
       </div>
     </div>
     ```
