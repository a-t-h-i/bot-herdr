## Status
OPEN

## Questions
1. How should the upgraded Tasks page be laid out and navigated?
   - Split list with detail tabs — Keep the list + detail split, add search/status filters and a `+ New task` button, replace wide pip strips with compact progress bars, and split the detail pane into `Steps` · `Board` · `Comments` · `Plan` tabs with expandable interactive step cards
     ```mockup
     <style>
       *{box-sizing:border-box;margin:0;padding:0}
       body{width:1200px;height:825px;overflow:hidden;background:#faf9f5;color:#141413;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:13.5px;line-height:20px}
       .shell{display:flex;flex-direction:column;height:825px}
       .topbar{height:44px;background:#f4f3ef;border-bottom:1px solid #e3e0d7;display:flex;align-items:center;padding:0 16px;gap:12px}
       .seg{display:inline-flex;background:#ebe9e2;padding:2px;border-radius:10px;gap:2px;align-items:center}
       .seg-item{height:28px;padding:0 12px;border-radius:8px;font-size:12px;font-weight:500;color:#6a6964;display:flex;align-items:center;gap:6px}
       .seg-item.on{background:#ffffff;color:#141413}
       .seg-item.line.on{background:transparent;border:1px solid #a25338;color:#141413}
       .cnt{font-size:10.5px;font-weight:600;color:#a25338}
       .page{flex:1;display:flex;max-width:1168px;width:100%;margin:0 auto;padding:16px 16px 0;gap:0;min-height:0}
       .list-col{width:330px;flex:none;display:flex;flex-direction:column;gap:10px;padding-right:16px;border-right:1px solid #e3e0d7;padding-bottom:16px}
       .list-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
       .h1{font-size:18px;font-weight:600}
       .btn{height:28px;padding:0 12px;border-radius:8px;font-size:12px;font-weight:500;display:inline-flex;align-items:center;gap:6px;border:1px solid #e3e0d7;background:#ffffff;color:#141413;white-space:nowrap}
       .btn.pri{background:#a25338;border-color:#a25338;color:#ffffff}
       .btn.dan{color:#b91c1c}
       .btn.qui{background:transparent;border-color:transparent;color:#6a6964}
       .search{height:28px;background:#ffffff;border:1px solid #e3e0d7;border-radius:10px;padding:0 10px;display:flex;align-items:center;gap:6px;font-size:12px;color:#6a6966}
       .chips{display:flex;gap:4px;flex-wrap:wrap}
       .chip{height:22px;padding:0 8px;border-radius:999px;font-size:11px;font-weight:500;background:#ebe9e2;color:#6a6964;display:inline-flex;align-items:center;gap:4px}
       .chip.on{background:#a2533820;color:#a25338;border:1px solid #a2533855}
       .grp{font-size:10.5px;font-weight:600;color:#6a6964;letter-spacing:.04em;margin-top:6px;display:flex;align-items:center;gap:6px}
       .grp span{background:#ebe9e2;padding:0 6px;border-radius:999px;font-weight:500}
       .row{padding:10px;border-radius:10px;border:1px solid transparent;display:flex;flex-direction:column;gap:6px}
       .row.on{background:#a2533818;border-color:#a2533855}
       .row-top{display:flex;align-items:center;gap:8px}
       .mark{width:16px;height:16px;border-radius:999px;flex:none;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700}
       .m-act{border:1.5px solid #a25338}.m-act i{width:6px;height:6px;border-radius:999px;background:#a25338;display:block}
       .m-blk{border:1.5px solid #aa4f0a;color:#aa4f0a}
       .m-done{background:#047857;color:#ffffff}
       .m-todo{border:1.5px solid #8a8882}
       .row-title{font-size:13.5px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1}
       .row-meta{display:flex;align-items:center;gap:8px;padding-left:24px;font-size:11.5px;color:#6a6964}
       .bar{flex:1;height:5px;border-radius:999px;background:#e3e0d7;overflow:hidden}
       .bar-fill{height:100%;background:#a25338;border-radius:999px}
       .bar-fill.warn{background:#aa4f0a}
       .bar-fill.ok{background:#047857}
       .detail{flex:1;display:flex;flex-direction:column;padding-left:18px;min-width:0}
       .d-head{display:flex;flex-direction:column;gap:10px;padding-bottom:12px;border-bottom:1px solid #e3e0d7}
       .d-title-row{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
       .d-title{font-size:18px;font-weight:600;line-height:24px;display:flex;align-items:center;gap:8px}
       .d-acts{display:flex;gap:6px;flex:none}
       .d-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:12px;color:#6a6964}
       .pill{height:20px;padding:0 8px;border-radius:999px;font-size:11px;font-weight:500;display:inline-flex;align-items:center;gap:5px}
       .p-acc{background:#a2533822;color:#a25338;border:1px solid #a2533844}
       .p-ok{background:#04785722;color:#047857;border:1px solid #04785744}
       .p-warn{background:#aa4f0a22;color:#aa4f0a;border:1px solid #aa4f0a44}
       .p-mut{background:#ebe9e2;color:#6a6964}
       .d-tabs{display:flex;align-items:center;justify-content:space-between;padding:12px 0 8px}
       .d-scroll{flex:1;overflow:hidden;display:flex;flex-direction:column;gap:8px}
       .step{background:#ffffff;border:1px solid #e3e0d7;border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:8px}
       .step.exp{border-color:#a2533866}
       .step-hd{display:flex;align-items:flex-start;gap:8px}
       .step-n{font-size:12px;color:#6a6964;width:18px;flex:none;margin-top:1px}
       .step-t{flex:1;font-size:13.5px;font-weight:500;color:#141413}
       .step-t.done{color:#6a6964}
       .step-r{display:flex;align-items:center;gap:8px;flex:none;font-size:12px;color:#6a6964}
       .av{width:18px;height:18px;border-radius:999px;font-size:10px;font-weight:600;display:inline-flex;align-items:center;justify-content:center}
       .av-dev{background:#5b8def28;border:1px solid #5b8def77;color:#1d4ed8}
       .av-des{background:#d6825a28;border:1px solid #d6825a77;color:#a25338}
       .av-qa{background:#3fa87728;border:1px solid #3fa87777;color:#047857}
       .step-body{margin-left:26px;padding-top:8px;border-top:1px solid #ebe9e2;display:flex;flex-direction:column;gap:8px}
       .ev{display:flex;align-items:center;gap:8px;font-size:12px;color:#6a6964}
       .ev b{color:#141413;font-weight:500}
       .step-foot{display:flex;align-items:center;justify-content:space-between;padding-top:4px}
       .step-ctl{display:flex;gap:6px}
       .slim-comp{margin:10px 0 12px;height:40px;background:#ffffff;border:1px solid #e3e0d7;border-radius:12px;padding:0 14px;display:flex;align-items:center;justify-content:space-between;color:#6a6966;font-size:13px;box-shadow:0 2px 6px rgba(0,0,0,.04)}
     </style>
     <div class="shell">
       <div class="topbar">
         <div class="seg">
           <div class="seg-item line">Chat</div>
           <div class="seg-item line">Terminals</div>
           <div class="seg-item line on">Tasks</div>
           <div class="seg-item line">Plans <span class="cnt">2</span></div>
           <div class="seg-item line">Knowledge</div>
           <div class="seg-item line">Metrics</div>
           <div class="seg-item line">Settings</div>
         </div>
       </div>
       <div class="page">
         <div class="list-col">
           <div class="list-head">
             <div class="h1">Tasks</div>
             <div class="btn pri">+ New task</div>
           </div>
           <div class="search">Search tasks…</div>
           <div class="chips">
             <div class="chip on">Active · 2</div>
             <div class="chip">Blocked · 1</div>
             <div class="chip">Done · 9</div>
             <div class="chip">Archived · 4</div>
           </div>
           <div class="grp">UNDER WAY <span>3</span></div>
           <div class="row on">
             <div class="row-top"><span class="mark m-act"><i></i></span><div class="row-title">Autonomous harness &amp; fallback chains</div></div>
             <div class="row-meta"><div class="bar"><div class="bar-fill" style="width:50%"></div></div><span>3/6</span><span>· $0.64</span><span>· 24m</span></div>
           </div>
           <div class="row">
             <div class="row-top"><span class="mark m-blk">!</span><div class="row-title">Fix intermittent chat feed glitches</div></div>
             <div class="row-meta"><div class="bar"><div class="bar-fill warn" style="width:33%"></div></div><span style="color:#aa4f0a">blocked</span><span>· 1/3</span></div>
           </div>
           <div class="row">
             <div class="row-top"><span class="mark m-act"><i></i></span><div class="row-title">Redesign Tasks page workbench</div></div>
             <div class="row-meta"><div class="bar"><div class="bar-fill" style="width:20%"></div></div><span>1/5</span><span>· 8m</span></div>
           </div>
           <div class="grp">FINISHED <span>9</span></div>
           <div class="row">
             <div class="row-top"><span class="mark m-done">✓</span><div class="row-title" style="color:#6a6964">Cross-platform code retrieval &amp; triage</div></div>
             <div class="row-meta"><div class="bar"><div class="bar-fill ok" style="width:100%"></div></div><span>6/6</span><span>· 31m</span></div>
           </div>
         </div>
         <div class="detail">
           <div class="d-head">
             <div class="d-title-row">
               <div class="d-title"><span class="mark m-act"><i></i></span>Autonomous harness &amp; fallback chains</div>
               <div class="d-acts">
                 <div class="btn">Pause</div>
                 <div class="btn">Archive</div>
                 <div class="btn dan">Delete</div>
               </div>
             </div>
             <div class="d-meta">
               <span class="pill p-acc">● active</span>
               <span class="pill p-ok">QA: PASS (r1)</span>
               <span>full track</span>
               <span>· branch feat/fallbacks</span>
               <span>· 18.4k tokens · $0.64 · 24 min</span>
               <span style="color:#a25338;font-weight:500">Details ▾</span>
             </div>
           </div>
           <div class="d-tabs">
             <div class="seg">
               <div class="seg-item on">Steps <span class="cnt">3/6</span></div>
               <div class="seg-item">Board <span class="cnt">14</span></div>
               <div class="seg-item">Comments <span class="cnt">2</span></div>
               <div class="seg-item">Full plan</div>
             </div>
             <div class="btn qui">Expand all</div>
           </div>
           <div class="d-scroll">
             <div class="step">
               <div class="step-hd">
                 <span class="mark m-done">✓</span><span class="step-n">1.</span>
                 <div class="step-t done">Define fallback chain config schema and rate-limit detector</div>
                 <div class="step-r"><span class="av av-dev">D</span><span>dev-core</span><span>· 9m</span><span class="btn qui" style="height:22px;padding:0 6px">Report</span></div>
               </div>
             </div>
             <div class="step exp">
               <div class="step-hd">
                 <span class="mark m-act"><i></i></span><span class="step-n">2.</span>
                 <div class="step-t">Wire runner failover &amp; cooldown state into headless agent turns</div>
                 <div class="step-r"><span class="av av-dev">D</span><span style="color:#1d4ed8;font-weight:500">dev-runner</span><span class="pill p-ok">working</span><span>· 11m</span></div>
               </div>
               <div class="step-body">
                 <div class="ev"><span class="pill p-ok">check</span><b>bh check passed</b><span>— 382/382 tests · 2m ago</span></div>
                 <div class="ev"><span class="pill p-acc">contract</span><b>dev-runner</b><span>— Cooldowns persist in data/bot-herdr/cooldowns.json with retryAfter ISO</span></div>
                 <div class="ev"><span class="pill p-mut">merge</span><b>Merged dev-schema</b><span>— +142 −18 lines</span></div>
                 <div class="step-foot">
                   <div class="step-ctl">
                     <div class="btn">Open terminal</div>
                     <div class="btn">Comment</div>
                     <div class="btn">Mark done</div>
                     <div class="btn">Block</div>
                   </div>
                   <span style="font-size:11.5px;color:#6a6964">8.2k tokens · $0.29</span>
                 </div>
               </div>
             </div>
             <div class="step">
               <div class="step-hd">
                 <span class="mark m-todo"></span><span class="step-n">3.</span>
                 <div class="step-t">Add Settings UI for fallback chains and guardrail budgets</div>
                 <div class="step-r"><span class="pill p-acc">next</span><span class="av av-des">D</span><span>Design</span></div>
               </div>
             </div>
             <div class="step">
               <div class="step-hd">
                 <span class="mark m-todo"></span><span class="step-n">4.</span>
                 <div class="step-t">Run QA verification gate and failure-injection tests</div>
                 <div class="step-r"><span class="av av-qa">Q</span><span>QA</span></div>
               </div>
             </div>
           </div>
           <div class="slim-comp">
             <span>Comment on Autonomous harness &amp; fallback chains… (click or type to expand)</span>
             <span style="font-size:11px;color:#a25338;font-weight:500">↵ Send</span>
           </div>
         </div>
       </div>
     </div>
     ```
   - Kanban board with detail drawer — Show tasks as visual columns (`Queued`, `Active`, `Blocked / Paused`, `Done`) with progress, active agents, and quick controls on each card; clicking a card opens its full Steps, Board, and Comments in a right slide-over drawer
     ```mockup
     <style>
       *{box-sizing:border-box;margin:0;padding:0}
       body{width:1200px;height:825px;overflow:hidden;background:#faf9f5;color:#141413;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:13.5px;line-height:20px}
       .shell{display:flex;flex-direction:column;height:825px;position:relative}
       .topbar{height:44px;background:#f4f3ef;border-bottom:1px solid #e3e0d7;display:flex;align-items:center;padding:0 16px}
       .seg{display:inline-flex;background:#ebe9e2;padding:2px;border-radius:10px;gap:2px}
       .seg-item{height:28px;padding:0 12px;border-radius:8px;font-size:12px;font-weight:500;color:#6a6964;display:flex;align-items:center;gap:6px}
       .seg-item.line.on{border:1px solid #a25338;color:#141413}
       .seg-item.on{background:#fff;color:#141413}
       .toolbar{padding:14px 20px 10px;display:flex;align-items:center;gap:10px}
       .h1{font-size:18px;font-weight:600;margin-right:8px}
       .search{height:28px;width:240px;background:#fff;border:1px solid #e3e0d7;border-radius:10px;padding:0 10px;display:flex;align-items:center;font-size:12px;color:#6a6966}
       .spacer{flex:1}
       .btn{height:28px;padding:0 12px;border-radius:8px;font-size:12px;font-weight:500;display:inline-flex;align-items:center;gap:6px;border:1px solid #e3e0d7;background:#fff;color:#141413}
       .btn.pri{background:#a25338;border-color:#a25338;color:#fff}
       .board{flex:1;display:flex;gap:14px;padding:4px 20px 18px;overflow:hidden}
       .col{flex:1;background:#f4f3ef;border:1px solid #e3e0d7;border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:10px;min-width:0}
       .col-hd{display:flex;align-items:center;justify-content:space-between;font-size:12px;font-weight:600;color:#6a6964;text-transform:uppercase;letter-spacing:.03em}
       .col-hd span{background:#ebe9e2;padding:1px 7px;border-radius:999px;font-size:11px}
       .card{background:#fff;border:1px solid #e3e0d7;border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px}
       .card.sel{border-color:#a25338;box-shadow:0 0 0 1px #a2533844}
       .c-title{font-size:13.5px;font-weight:600;line-height:19px}
       .bar{height:5px;border-radius:999px;background:#ebe9e2;overflow:hidden}
       .bar-f{height:100%;background:#a25338;border-radius:999px}
       .bar-f.warn{background:#aa4f0a}.bar-f.ok{background:#047857}
       .c-meta{display:flex;align-items:center;justify-content:space-between;font-size:11.5px;color:#6a6964}
       .pill{height:20px;padding:0 7px;border-radius:999px;font-size:10.5px;font-weight:500;display:inline-flex;align-items:center;gap:4px}
       .p-acc{background:#a2533822;color:#a25338}.p-warn{background:#aa4f0a22;color:#aa4f0a}.p-ok{background:#04785722;color:#047857}
       .avs{display:flex;gap:4px}
       .av{width:20px;height:20px;border-radius:999px;font-size:10px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;background:#5b8def28;color:#1d4ed8;border:1px solid #5b8def66}
       .av.des{background:#d6825a28;color:#a25338;border-color:#d6825a66}
       .av.qa{background:#3fa87728;color:#047857;border-color:#3fa87766}
       .scrim{position:absolute;inset:44px 0 0 0;background:rgba(0,0,0,.22);display:flex;justify-content:flex-end}
       .drawer{width:540px;height:100%;background:#faf9f5;border-left:1px solid #e3e0d7;box-shadow:-8px 0 24px rgba(0,0,0,.1);padding:16px 18px;display:flex;flex-direction:column;gap:12px}
       .dr-hd{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-bottom:10px;border-bottom:1px solid #e3e0d7}
       .dr-item{background:#fff;border:1px solid #e3e0d7;border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:6px}
       .dr-foot{margin-top:auto;background:#fff;border:1px solid #e3e0d7;border-radius:12px;padding:10px 12px;color:#6a6966;font-size:12.5px}
     </style>
     <div class="shell">
       <div class="topbar">
         <div class="seg">
           <div class="seg-item line">Chat</div><div class="seg-item line">Terminals</div><div class="seg-item line on">Tasks</div><div class="seg-item line">Plans</div><div class="seg-item line">Knowledge</div><div class="seg-item line">Settings</div>
         </div>
       </div>
       <div class="toolbar">
         <div class="h1">Tasks</div>
         <div class="search">Filter tasks…</div>
         <div class="seg"><div class="seg-item on">Board</div><div class="seg-item">Archived (4)</div></div>
         <div class="spacer"></div>
         <div class="btn pri">+ New task</div>
       </div>
       <div class="board">
         <div class="col">
           <div class="col-hd">Queued <span>2</span></div>
           <div class="card">
             <div class="c-title">Post-task self-improvement reflection loop</div>
             <div class="c-meta"><span class="pill p-acc">full track</span><span>0/4 steps</span></div>
           </div>
           <div class="card">
             <div class="c-title">Add protected-path guardrails in runner</div>
             <div class="c-meta"><span>fast track</span><span>0/2 steps</span></div>
           </div>
         </div>
         <div class="col">
           <div class="col-hd" style="color:#a25338">Active <span>2</span></div>
           <div class="card sel">
             <div class="c-title">Autonomous harness &amp; fallback chains</div>
             <div class="bar"><div class="bar-f" style="width:50%"></div></div>
             <div class="c-meta"><div class="avs"><span class="av">D</span><span class="av des">D</span></div><span>3/6 · $0.64 · 24m</span></div>
           </div>
           <div class="card">
             <div class="c-title">Redesign Tasks page workbench</div>
             <div class="bar"><div class="bar-f" style="width:20%"></div></div>
             <div class="c-meta"><div class="avs"><span class="av des">D</span></div><span>1/5 · 8m</span></div>
           </div>
         </div>
         <div class="col">
           <div class="col-hd" style="color:#aa4f0a">Blocked / Paused <span>1</span></div>
           <div class="card">
             <div class="c-title">Fix intermittent chat feed glitches</div>
             <div class="bar"><div class="bar-f warn" style="width:33%"></div></div>
             <div class="c-meta"><span class="pill p-warn">blocked · step 2</span><div class="btn" style="height:22px;padding:0 8px">Resume</div></div>
           </div>
         </div>
         <div class="col">
           <div class="col-hd" style="color:#047857">Done <span>9</span></div>
           <div class="card">
             <div class="c-title" style="color:#6a6964">Cross-platform code retrieval</div>
             <div class="bar"><div class="bar-f ok" style="width:100%"></div></div>
             <div class="c-meta"><span class="pill p-ok">QA PASS</span><span>6/6 · 31m</span></div>
           </div>
         </div>
       </div>
       <div class="scrim">
         <div class="drawer">
           <div class="dr-hd">
             <div>
               <div style="font-size:16px;font-weight:600">Autonomous harness &amp; fallback chains</div>
               <div style="font-size:12px;color:#6a6964">t-20261121-9k2a · active · 3/6 steps · $0.64 · 24m</div>
             </div>
             <div style="display:flex;gap:6px"><div class="btn">Pause</div><div class="btn">✕</div></div>
           </div>
           <div class="seg" style="align-self:flex-start">
             <div class="seg-item on">Steps (3/6)</div><div class="seg-item">Board (14)</div><div class="seg-item">Comments (2)</div>
           </div>
           <div class="dr-item">
             <div style="display:flex;justify-content:space-between;font-weight:500"><span>✓ 1. Fallback chain config &amp; rate-limit detector</span><span style="color:#6a6964;font-size:12px">9m</span></div>
             <div style="font-size:12px;color:#6a6964">Report: Added schema + unit tests (366 pass)</div>
           </div>
           <div class="dr-item" style="border-color:#a2533866">
             <div style="display:flex;justify-content:space-between;font-weight:500"><span>● 2. Wire runner failover &amp; cooldown state</span><span class="pill p-ok">dev-runner · working</span></div>
             <div style="font-size:12px;color:#6a6964">bh check passed (382/382 tests) · 2m ago</div>
             <div style="display:flex;gap:6px;margin-top:4px"><div class="btn">Open terminal</div><div class="btn">Comment</div><div class="btn">Mark done</div></div>
           </div>
           <div class="dr-item">
             <div style="display:flex;justify-content:space-between"><span>○ 3. Settings UI for fallbacks &amp; guardrails</span><span class="pill p-acc">next</span></div>
           </div>
           <div class="dr-foot">Comment on this task…</div>
         </div>
       </div>
     </div>
     ```
   - Full-width overview + split workbench — Start on a clean full-width task table with summary metrics (active, blocked, live agents, spend); clicking a task opens a full-page workbench with Steps on the left and the live Board + Comments + Composer docked side-by-side on the right
     ```mockup
     <style>
       *{box-sizing:border-box;margin:0;padding:0}
       body{width:1200px;height:825px;overflow:hidden;background:#faf9f5;color:#141413;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:13.5px;line-height:20px}
       .shell{display:flex;flex-direction:column;height:825px}
       .topbar{height:44px;background:#f4f3ef;border-bottom:1px solid #e3e0d7;display:flex;align-items:center;padding:0 16px}
       .seg{display:inline-flex;background:#ebe9e2;padding:2px;border-radius:10px;gap:2px}
       .seg-item{height:28px;padding:0 12px;border-radius:8px;font-size:12px;font-weight:500;color:#6a6964;display:flex;align-items:center}
       .seg-item.line.on{border:1px solid #a25338;color:#141413}
       .seg-item.on{background:#fff;color:#141413}
       .wrap{flex:1;max-width:1168px;width:100%;margin:0 auto;padding:14px 16px 12px;display:flex;flex-direction:column;gap:12px;min-height:0}
       .crumb{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:10px;border-bottom:1px solid #e3e0d7}
       .back{font-size:12.5px;font-weight:500;color:#6a6964}
       .title{font-size:18px;font-weight:600;display:flex;align-items:center;gap:10px}
       .btn{height:28px;padding:0 12px;border-radius:8px;font-size:12px;font-weight:500;display:inline-flex;align-items:center;gap:6px;border:1px solid #e3e0d7;background:#fff;color:#141413}
       .btn.pri{background:#a25338;border-color:#a25338;color:#fff}
       .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
       .stat{background:#fff;border:1px solid #e3e0d7;border-radius:10px;padding:8px 12px}
       .stat-k{font-size:11px;color:#6a6964}.stat-v{font-size:15px;font-weight:600;margin-top:2px}
       .split{flex:1;display:flex;gap:14px;min-height:0}
       .left{flex:1.25;display:flex;flex-direction:column;gap:8px;min-width:0}
       .right{flex:1;display:flex;flex-direction:column;gap:10px;min-width:0;background:#ffffff;border:1px solid #e3e0d7;border-radius:12px;padding:12px}
       .sec{font-size:11.5px;font-weight:600;color:#6a6964;text-transform:uppercase;letter-spacing:.04em}
       .step{background:#fff;border:1px solid #e3e0d7;border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:6px}
       .step.on{border-color:#a2533866}
       .s-hd{display:flex;align-items:center;gap:8px}
       .s-t{flex:1;font-weight:500}
       .pill{height:20px;padding:0 7px;border-radius:999px;font-size:10.5px;font-weight:500;display:inline-flex;align-items:center;gap:4px}
       .p-acc{background:#a2533822;color:#a25338}.p-ok{background:#04785722;color:#047857}.p-warn{background:#aa4f0a22;color:#aa4f0a}.p-mut{background:#ebe9e2;color:#6a6964}
       .b-row{padding:8px 0;border-bottom:1px solid #f0eee8;display:flex;flex-direction:column;gap:3px}
       .b-meta{display:flex;align-items:center;gap:6px;font-size:11.5px;color:#6a6964}
       .b-txt{font-size:13px;color:#141413}
       .comp{margin-top:auto;border:1px solid #e3e0d7;border-radius:10px;background:#faf9f5;padding:10px 12px;font-size:12.5px;color:#6a6966;display:flex;justify-content:space-between;align-items:center}
     </style>
     <div class="shell">
       <div class="topbar">
         <div class="seg">
           <div class="seg-item line">Chat</div><div class="seg-item line">Terminals</div><div class="seg-item line on">Tasks</div><div class="seg-item line">Plans</div><div class="seg-item line">Knowledge</div><div class="seg-item line">Settings</div>
         </div>
       </div>
       <div class="wrap">
         <div class="crumb">
           <div>
             <div class="back">‹ All tasks (3 active · 9 done)</div>
             <div class="title">Autonomous harness &amp; fallback chains <span class="pill p-acc">● active</span> <span class="pill p-ok">QA PASS</span></div>
           </div>
           <div style="display:flex;gap:6px"><div class="btn">Full plan</div><div class="btn">Pause</div><div class="btn">Archive</div></div>
         </div>
         <div class="stats">
           <div class="stat"><div class="stat-k">Progress</div><div class="stat-v">3 of 6 steps (50%)</div></div>
           <div class="stat"><div class="stat-k">Active agents</div><div class="stat-v" style="color:#1d4ed8">dev-runner · working</div></div>
           <div class="stat"><div class="stat-k">Checks &amp; Gate</div><div class="stat-v" style="color:#047857">382/382 pass · r1 PASS</div></div>
           <div class="stat"><div class="stat-k">Time &amp; Usage</div><div class="stat-v">24 min · $0.64 · 18.4k</div></div>
         </div>
         <div class="split">
           <div class="left">
             <div class="sec">Steps checklist</div>
             <div class="step">
               <div class="s-hd"><span style="color:#047857;font-weight:700">✓</span><div class="s-t" style="color:#6a6964">1. Fallback chain config schema &amp; rate-limit detector</div><span style="font-size:12px;color:#6a6964">9m · Report</span></div>
             </div>
             <div class="step on">
               <div class="s-hd"><span style="color:#a25338;font-weight:700">●</span><div class="s-t">2. Wire runner failover &amp; cooldown state into headless turns</div><span class="pill p-ok">dev-runner</span></div>
               <div style="font-size:12px;color:#6a6964;padding-left:18px">Latest check: 382/382 pass · Merged dev-schema (+142 −18)</div>
               <div style="display:flex;gap:6px;padding-left:18px;margin-top:4px"><div class="btn">Open terminal</div><div class="btn">Mark done</div><div class="btn">Comment</div></div>
             </div>
             <div class="step">
               <div class="s-hd"><span>○</span><div class="s-t">3. Add Settings UI for fallback chains &amp; guardrails</div><span class="pill p-acc">next</span></div>
             </div>
             <div class="step">
               <div class="s-hd"><span>○</span><div class="s-t">4. QA verification gate &amp; failure-injection tests</div><span style="font-size:12px;color:#6a6964">QA</span></div>
             </div>
             <div class="step">
               <div class="s-hd"><span>○</span><div class="s-t">5. Self-improvement review &amp; knowledge distillation</div><span style="font-size:12px;color:#6a6964">Orchestrator</span></div>
             </div>
           </div>
           <div class="right">
             <div style="display:flex;align-items:center;justify-content:space-between">
               <div class="seg"><div class="seg-item on">Live Board (14)</div><div class="seg-item">Comments (2)</div></div>
               <span style="font-size:11.5px;color:#6a6964">Newest first</span>
             </div>
             <div class="b-row">
               <div class="b-meta"><span class="pill p-acc">contract</span><b style="color:#1d4ed8">dev-runner</b><span>→ Design · 2m</span></div>
               <div class="b-txt">Cooldown state written to cooldowns.json with harness, reason, and retryAfter ISO.</div>
             </div>
             <div class="b-row">
               <div class="b-meta"><span class="pill p-ok">done</span><b style="color:#1d4ed8">dev-core</b><span>· 11m · Report</span></div>
               <div class="b-txt">Schema + parser complete; bh check PASS (366/366).</div>
             </div>
             <div class="b-row">
               <div class="b-meta"><span class="pill p-warn">blocker</span><b style="color:#a25338">design-ui</b><span>→ Orchestrator · 16m</span></div>
               <div class="b-txt">Claude hit usage limit; automatically failed over to Codex (o3-pro) and resumed step.</div>
             </div>
             <div class="b-row" style="border-bottom:none">
               <div class="b-meta"><span class="pill p-mut">decision</span><b style="color:#a25338">Orchestrator</b><span>· 22m</span></div>
               <div class="b-txt">Worktree isolation enabled for parallel dev + design steps.</div>
             </div>
             <div class="comp"><span>Comment on task or post guidance…</span><div class="btn pri" style="height:24px;padding:0 10px">Send</div></div>
           </div>
         </div>
       </div>
     </div>
     ```

2. Where should fallback chains, guardrails, and live failover status be shown?
   - Per-agent fallbacks + inline pills — Configure each agent's ordered fallback list inside its Settings `More` dialog (with a one-line summary on its card) and guardrails in `Settings → General`; show active failovers as subtle pills on the composer model chip and task step
     ```mockup
     <style>
       *{box-sizing:border-box;margin:0;padding:0}
       body{width:1200px;height:825px;overflow:hidden;background:#faf9f5;color:#141413;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:13.5px;line-height:20px}
       .wrap{display:flex;height:825px}
       .pane{flex:1;padding:20px 22px;display:flex;flex-direction:column;gap:14px;border-right:1px solid #e3e0d7}
       .pane:last-child{border-right:none;background:#faf9f5}
       .h2{font-size:15px;font-weight:600;color:#141413}
       .sub{font-size:12px;color:#6a6964}
       .card{background:#fff;border:1px solid #e3e0d7;border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px}
       .c-hd{display:flex;align-items:center;gap:10px}
       .av{width:28px;height:28px;border-radius:999px;background:#a2533822;border:1px solid #a2533866;color:#a25338;font-weight:600;display:flex;align-items:center;justify-content:center}
       .av.dev{background:#5b8def22;border-color:#5b8def66;color:#1d4ed8}
       .fld{height:28px;background:#faf9f5;border:1px solid #e3e0d7;border-radius:10px;padding:0 10px;display:flex;align-items:center;justify-content:space-between;font-size:12.5px}
       .lbl{font-size:11px;font-weight:500;color:#6a6964;margin-bottom:3px}
       .fb-line{font-size:12px;color:#6a6964;background:#f4f3ef;border-radius:8px;padding:6px 10px;display:flex;align-items:center;justify-content:space-between}
       .row{display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0eee8}
       .row:last-child{border-bottom:none}
       .seg{display:inline-flex;background:#ebe9e2;padding:2px;border-radius:10px;gap:2px}
       .seg-i{height:24px;padding:0 10px;border-radius:8px;font-size:11.5px;font-weight:500;color:#6a6964;display:flex;align-items:center}
       .seg-i.on{background:#fff;color:#141413}
       .tog{width:34px;height:18px;border-radius:999px;background:#a25338;position:relative}
       .tog::after{content:"";width:12px;height:12px;border-radius:999px;background:#fff;position:absolute;top:3px;right:3px}
       .pill{height:20px;padding:0 8px;border-radius:999px;font-size:11px;font-weight:500;display:inline-flex;align-items:center;gap:4px}
       .p-warn{background:#aa4f0a22;color:#aa4f0a;border:1px solid #aa4f0a44}
       .p-ok{background:#04785722;color:#047857}
       .chat-mock{margin-top:auto;display:flex;flex-direction:column;gap:12px}
       .msg{background:#fff;border:1px solid #e3e0d7;border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:6px}
       .comp{background:#fff;border:1px solid #e3e0d7;border-radius:12px;padding:12px 14px 8px;box-shadow:0 4px 12px rgba(0,0,0,.06);display:flex;flex-direction:column;gap:10px}
       .tools{display:flex;align-items:center;gap:8px}
       .chip{height:26px;padding:0 10px;border-radius:8px;background:#f4f3ef;font-size:12px;color:#6a6964;display:inline-flex;align-items:center;gap:6px}
       .chip.fb{background:#aa4f0a18;border:1px solid #aa4f0a44;color:#aa4f0a;font-weight:500}
       .send{width:28px;height:28px;border-radius:999px;background:#a25338;color:#fff;display:flex;align-items:center;justify-content:center;margin-left:auto;font-weight:700}
     </style>
     <div class="wrap">
       <div class="pane">
         <div><div class="h2">Settings → Agents &amp; General</div><div class="sub">Per-agent fallback summary on each card + Guardrails group in General</div></div>
         <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
           <div class="card">
             <div class="c-hd"><div class="av">O</div><div><b>Orchestrator</b> <span class="sub">Lead</span></div></div>
             <div><div class="lbl">Harness</div><div class="fld"><span>Claude Code</span><span>▾</span></div></div>
             <div><div class="lbl">Model</div><div class="fld"><span>claude-opus-4-6</span><span>▾</span></div></div>
             <div class="fb-line"><span>Fallback: <b>Codex</b> → <b>Gemini</b></span><span style="color:#a25338;font-weight:500">Edit ›</span></div>
           </div>
           <div class="card">
             <div class="c-hd"><div class="av dev">D</div><div><b>Dev</b></div></div>
             <div><div class="lbl">Harness</div><div class="fld"><span>Codex</span><span>▾</span></div></div>
             <div><div class="lbl">Model</div><div class="fld"><span>gpt-5.3-codex</span><span>▾</span></div></div>
             <div class="fb-line"><span>Fallback: <b>Claude Sonnet</b></span><span style="color:#a25338;font-weight:500">Edit ›</span></div>
           </div>
         </div>
         <div class="card">
           <div style="font-weight:600;margin-bottom:2px">Autonomy &amp; Guardrails</div>
           <div class="row"><div><div style="font-weight:500">Autonomy mode</div><div class="sub">When blocked or hit by usage limits</div></div><div class="seg"><div class="seg-i">Ask</div><div class="seg-i on">Guarded</div><div class="seg-i">Unattended</div></div></div>
           <div class="row"><div><div style="font-weight:500">Require bh check before step done</div><div class="sub">Block completion until tests &amp; lint pass</div></div><div class="tog"></div></div>
           <div class="row"><div><div style="font-weight:500">Task budget ceiling</div><div class="sub">Pause task automatically when exceeded</div></div><div class="fld" style="width:140px"><span>$10.00 / 60m</span></div></div>
           <div class="row"><div><div style="font-weight:500">Auto-pause after repeated failures</div><div class="sub">Circuit breaker on consecutive step errors</div></div><div class="fld" style="width:140px"><span>3 failures</span></div></div>
         </div>
       </div>
       <div class="pane">
         <div><div class="h2">Live Chat &amp; Tasks feedback</div><div class="sub">Quiet inline pills only where the failover applies</div></div>
         <div class="msg">
           <div style="display:flex;align-items:center;gap:8px"><b style="color:#a25338">Orchestrator</b><span class="sub">14:22</span><span class="pill p-warn">via Codex fallback</span></div>
           <div>Claude Code hit its usage window; switched to Codex (`gpt-5.3-codex`) and continued step 2 without interrupting the task.</div>
         </div>
         <div class="msg">
           <div style="display:flex;align-items:center;gap:8px;justify-content:space-between"><b>Step 2 · Wire runner failover</b><span class="pill p-ok">Guardrail: checks pass</span></div>
           <div class="sub">Budget used: $1.84 of $10.00 · 0 retries · 1 failover</div>
         </div>
         <div class="chat-mock">
           <div class="comp">
             <div style="color:#6a6966">Write a message, run a command, or ask an agent</div>
             <div class="tools">
               <div class="chip">📎</div>
               <div class="chip">bot-herdr · main ▾</div>
               <div class="chip fb">⚡ Codex (fallback · Claude 14m) ▾</div>
               <div class="send">↑</div>
             </div>
           </div>
         </div>
       </div>
     </div>
     ```
   - Dedicated Resilience tab + live status strip — Add a `Resilience` tab in Settings for fallback chains, provider quota/cooldown health, and guardrail budgets; show a slim live status strip above the composer and on Tasks whenever autonomy, budgets, or a failover are active
     ```mockup
     <style>
       *{box-sizing:border-box;margin:0;padding:0}
       body{width:1200px;height:825px;overflow:hidden;background:#faf9f5;color:#141413;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:13.5px;line-height:20px}
       .wrap{display:flex;height:825px}
       .pane{flex:1;padding:20px 22px;display:flex;flex-direction:column;gap:14px;border-right:1px solid #e3e0d7}
       .pane:last-child{border-right:none}
       .seg{display:inline-flex;background:#ebe9e2;padding:2px;border-radius:10px;gap:2px;align-self:flex-start}
       .seg-i{height:26px;padding:0 12px;border-radius:8px;font-size:12px;font-weight:500;color:#6a6964;display:flex;align-items:center}
       .seg-i.on{background:#fff;color:#141413}
       .card{background:#fff;border:1px solid #e3e0d7;border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px}
       .row{display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-radius:8px;background:#faf9f5;border:1px solid #e3e0d7}
       .sub{font-size:12px;color:#6a6964}
       .pill{height:20px;padding:0 8px;border-radius:999px;font-size:11px;font-weight:500;display:inline-flex;align-items:center;gap:4px}
       .p-ok{background:#04785722;color:#047857}.p-warn{background:#aa4f0a22;color:#aa4f0a}.p-acc{background:#a2533822;color:#a25338}
       .btn{height:24px;padding:0 10px;border-radius:8px;font-size:11.5px;font-weight:500;border:1px solid #e3e0d7;background:#fff;color:#141413;display:inline-flex;align-items:center}
       .strip{background:#ffffff;border:1px solid #aa4f0a55;border-radius:10px;padding:8px 12px;display:flex;align-items:center;gap:10px;font-size:12px}
       .comp{background:#fff;border:1px solid #e3e0d7;border-radius:12px;padding:12px 14px 8px;box-shadow:0 4px 12px rgba(0,0,0,.06);display:flex;flex-direction:column;gap:10px}
       .chip{height:26px;padding:0 10px;border-radius:8px;background:#f4f3ef;font-size:12px;color:#6a6964;display:inline-flex;align-items:center;gap:6px}
     </style>
     <div class="wrap">
       <div class="pane">
         <div class="seg">
           <div class="seg-i">Agents</div><div class="seg-i">General</div><div class="seg-i on">Resilience</div><div class="seg-i">Harnesses</div>
         </div>
         <div class="card">
           <div style="display:flex;justify-content:space-between;align-items:center"><b>Provider health &amp; cooldowns</b><div class="btn">Reset all</div></div>
           <div class="row"><div><b>Claude Code</b> <span class="sub">· usage limit</span></div><div style="display:flex;gap:8px;align-items:center"><span class="pill p-warn">Cooldown 14m</span><div class="btn">Retry now</div></div></div>
           <div class="row"><div><b>Codex</b> <span class="sub">· active fallback</span></div><span class="pill p-ok">Healthy</span></div>
           <div class="row"><div><b>Gemini CLI</b> <span class="sub">· standby</span></div><span class="pill p-ok">Healthy</span></div>
         </div>
         <div class="card">
           <div style="display:flex;justify-content:space-between;align-items:center"><b>Fallback chain</b><div class="btn">+ Add step</div></div>
           <div class="row"><span>1. Claude Code · claude-opus-4-6 (high)</span><span class="sub">Primary</span></div>
           <div class="row"><span>2. Codex · gpt-5.3-codex (high)</span><span class="pill p-acc">Active now</span></div>
           <div class="row"><span>3. Gemini CLI · gemini-2.5-pro</span><span class="sub">↑ ↓ ✕</span></div>
         </div>
         <div class="card">
           <b>Guardrails &amp; Autonomous budgets</b>
           <div class="sub">Max spend $10/task · Max 3 consecutive retries · Require bh check · Protected paths: .git, secrets/</div>
         </div>
       </div>
       <div class="pane">
         <div><b>Live workspace status strip</b><div class="sub">Docked just above the composer while autonomous guardrails or failovers are active</div></div>
         <div style="margin-top:auto;display:flex;flex-direction:column;gap:8px">
           <div class="strip">
             <span class="pill p-acc">Autonomous</span>
             <span class="pill p-warn">Fallback: Codex (Claude 14m)</span>
             <span class="sub">Budget $1.84 / $10</span>
             <div style="margin-left:auto;display:flex;gap:6px"><div class="btn">Pause</div><div class="btn">Reset</div></div>
           </div>
           <div class="comp">
             <div style="color:#6a6966">Orchestrator is working. Enter steers it…</div>
             <div style="display:flex;align-items:center;gap:8px">
               <div class="chip">📎</div><div class="chip">bot-herdr · main ▾</div><div class="chip">Codex · gpt-5.3-codex ▾</div>
               <div style="margin-left:auto;width:28px;height:28px;border-radius:999px;background:#9e3d3a;color:#fff;display:flex;align-items:center;justify-content:center">■</div>
             </div>
           </div>
         </div>
       </div>
     </div>
     ```
   - Global fallback order + quiet toasts — Keep one shared fallback order in `Settings → Harnesses` and compact guardrail switches in `Settings → General`; keep Chat and Tasks uncluttered by surfacing failovers only as composer toasts and task-board entries
     ```mockup
     <style>
       *{box-sizing:border-box;margin:0;padding:0}
       body{width:1200px;height:825px;overflow:hidden;background:#faf9f5;color:#141413;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:13.5px;line-height:20px}
       .wrap{display:flex;height:825px}
       .pane{flex:1;padding:20px 22px;display:flex;flex-direction:column;gap:14px;border-right:1px solid #e3e0d7}
       .pane:last-child{border-right:none}
       .seg{display:inline-flex;background:#ebe9e2;padding:2px;border-radius:10px;gap:2px;align-self:flex-start}
       .seg-i{height:26px;padding:0 12px;border-radius:8px;font-size:12px;font-weight:500;color:#6a6964;display:flex;align-items:center}
       .seg-i.on{background:#fff;color:#141413}
       .card{background:#fff;border:1px solid #e3e0d7;border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px}
       .sub{font-size:12px;color:#6a6964}
       .chain{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
       .node{height:30px;padding:0 12px;border-radius:8px;background:#faf9f5;border:1px solid #e3e0d7;display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:500}
       .arrow{color:#6a6964;font-weight:600}
       .row{display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f0eee8}
       .row:last-child{border-bottom:none}
       .tog{width:34px;height:18px;border-radius:999px;background:#a25338;position:relative}
       .tog::after{content:"";width:12px;height:12px;border-radius:999px;background:#fff;position:absolute;top:3px;right:3px}
       .toast{align-self:center;background:#fff;border:1px solid #e3e0d7;border-radius:12px;padding:10px 14px;box-shadow:0 6px 18px rgba(0,0,0,.08);display:flex;align-items:center;gap:10px;max-width:480px}
       .comp{background:#fff;border:1px solid #e3e0d7;border-radius:12px;padding:12px 14px 8px;box-shadow:0 4px 12px rgba(0,0,0,.06);display:flex;flex-direction:column;gap:10px}
       .chip{height:26px;padding:0 10px;border-radius:8px;background:#f4f3ef;font-size:12px;color:#6a6964;display:inline-flex;align-items:center;gap:6px}
       .pill{height:20px;padding:0 8px;border-radius:999px;font-size:11px;font-weight:500;background:#aa4f0a22;color:#aa4f0a}
     </style>
     <div class="wrap">
       <div class="pane">
         <div class="seg">
           <div class="seg-i">Agents</div><div class="seg-i">General</div><div class="seg-i on">Harnesses</div>
         </div>
         <div class="card">
           <b>Global fallback order</b>
           <div class="sub">When any agent's harness hits a usage limit or fails, fall through in order:</div>
           <div class="chain">
             <div class="node">1. Claude Code</div><span class="arrow">→</span>
             <div class="node">2. Codex</div><span class="arrow">→</span>
             <div class="node">3. Gemini CLI</div><span class="arrow">→</span>
             <div class="node" style="color:#6a6964;border-style:dashed">+ Add</div>
           </div>
         </div>
         <div class="card">
           <b>Guardrails (in General)</b>
           <div class="row"><span>Auto-continue on non-blocking errors</span><div class="tog"></div></div>
           <div class="row"><span>Require passing bh check before done</span><div class="tog"></div></div>
           <div class="row"><span>Pause task on 3 consecutive failures or $10 spend</span><div class="tog"></div></div>
         </div>
       </div>
       <div class="pane">
         <div><b>Minimal live chrome</b><div class="sub">No extra persistent bars — failovers show as composer toasts and board log rows</div></div>
         <div class="card">
           <div style="display:flex;align-items:center;gap:8px"><span class="pill">note</span><b>runner</b><span class="sub">· 2m ago on Task Board</span></div>
           <div>Claude Code hit rate limit; switched dev-runner to Codex automatically.</div>
         </div>
         <div style="margin-top:auto;display:flex;flex-direction:column;gap:10px">
           <div class="toast">
             <span style="color:#aa4f0a;font-weight:700">⚠</span>
             <div style="font-size:12.5px"><b>Switched to Codex</b> — Claude Code usage limit reached (retrying in 14m)</div>
           </div>
           <div class="comp">
             <div style="color:#6a6966">Write a message, run a command, or ask an agent</div>
             <div style="display:flex;align-items:center;gap:8px">
               <div class="chip">📎</div><div class="chip">bot-herdr · main ▾</div><div class="chip">Claude Code · Default ▾</div>
               <div style="margin-left:auto;width:28px;height:28px;border-radius:999px;background:#ebe9e2;color:#6a6966;display:flex;align-items:center;justify-content:center">↑</div>
             </div>
           </div>
         </div>
       </div>
     </div>
     ```

## Notes

### 1. Tasks page audit (`mods/bot-herdr/work.js`, `steps.js`, `signals.js`, `engine/lib/tasks.mjs`)
- **Broken board & step-event data path**: `work.js:422` only calls `bhJson(["task", "list", "--all"])`, which runs `listTasks()` (`tasks.mjs:79-86`) and omits `board`, `steps[].events`, `steps[].agentName`, and `checks`. Consequently `work.js:1203-1213` (`taskBoard`) always renders `"Nothing on the board yet."` even on tasks with active boards. The Tasks page must fetch `bh task show <opened> --json` (which runs `taskDetail()`, `tasks.mjs:385-394`) for the currently open task so the board, per-step `events` (board posts, reports, `bh check` receipts, worktree merges), and live open child names actually appear.
- **Rich engine data already stored but hidden in UI**: `t.gates` (`PASS` / `CHANGES_REQUIRED` / `BLOCKED` verdicts + report files), `t.qa` (risk), `t.triage`, `t.children` (open/merged worktrees), and `step.note` exist in `task.json` (`tasks.mjs:385-406`), yet `work.js` renders none of them.
- **Scroll & height bugs**: `work.js:774` wraps the page in an outer `overflow_y_scroll()` with `pb(SPACE[5])` (`work.js:784`), while `tasksView` (`work.js:833`) hardcodes `paneH = Math.max(320, this.height - 96)` instead of `this.height - PAGE_CHROME` (58px), causing double scrollbars and wasted bottom space (Plans avoids this at `work.js:750, 784, 1482`).
- **List & step presentation issues**:
  - `taskRowEnd` (`work.js:924-930`) draws up to 12 `pips` (~166px wide) inside a 340px row, leaving ~120px for the task title. Replacing list pips with a compact horizontal progress bar + `done/total` on the meta line restores title legibility.
  - `stepLine` (`work.js:1169-1187`) puts long real-world step titles (250–400 chars) in a single `h_flex().items_center()` next to metadata pills/buttons, vertically centering badges against multi-line blocks; `step.report.summary` (`work.js:1162`) is hard-truncated with no expand.
  - Clicking a step (`work.js:1255`) only opens a comment input; there is no step expansion for events/notes, no direct `Open terminal` jump for active child agents, and no UI controls to change step status (`done`/`block`/`skip`/`todo`).
  - `taskActions` (`work.js:990`) hides `Resume` from the header when `t.status === "paused"` (burying it inside `waitingBox` below progress), and offers no search/status filtering, no `+ New task` entry point, and no `Mark done` / `Abandon` action.
  - `taskComposer` (`work.js:944`) passes `inner + SIZE.gutter * 2` so it caps at `SIZE.maxWidth` (660px) inside wider detail panes, and cannot fold like Chat/Plans (`work.js:761` only checks `planBoxFolded()`).

### 2. Root causes of intermittent chat glitches (`mods/bot-herdr/chat.js`, `feed.js`, `composer.js`, `live.js`, `questions.js`, `engine/lib/agent.mjs`)
Every item below is a verified defect in the current codebase that should be fixed in the plan with pure-module regression tests:
1. **Page Up / Page Down throws `TypeError` (`chat.js:143, 511, 564-565, 657`)**: `init()`/`render()` assign `this.page = activePage()` (string), shadowing the prototype method `page(sign, total, cx)`. Rename the state field (e.g. `this.lastPage`).
2. **Stuck working indicator (`chat.js:355-405, 455-469`)**: Neither `poll()` nor `nextTurn()` calls `cx.notify()` when `this.workers()` changes without a new reply (especially when the last agent transitions to idle via `(handled)`, Stop, or `bh ask` → `list.length === 0`). Track a worker signature in `poll()` and call `cx.notify()` whenever the set of working agents changes.
3. **Duplicate replies from non-atomic `.jsonl` rewind (`engine/lib/agent.mjs:70`, `feed.js:41`, `chat.js:425`)**: `logReply()` rewrites `.jsonl` in-place with `writeText`; if `chat.js` polls mid-write and parses fewer lines, `logNew()` returns an older `at` and `chat.js:425` (`at !== this.logSeen[key]`) rewinds `logSeen` backwards, replaying prior replies as duplicates on the next poll. Fix both sides: advance `logSeen[key]` monotonically (`Date.parse(at) > Date.parse(prev)`) and make `logReply` append-only / atomic-rename (DEV). Also guard `.md` → `.jsonl` transition (`chat.js:365-380`) so the first logged turn doesn't duplicate a reply just shown from `.md`.
4. **Duplicate entry IDs once feed reaches `KEEP = 300` (`feed.js:64-66`)**: `push()` computes `id = ${entry.at.toString(36)}-${entries.length.toString(36)}`. At 300 entries `entries.length` stays constant at `300`, so two entries added in the same millisecond (e.g. `readLogs` loop at `chat.js:429`) get identical IDs, colliding on GPUI element IDs, `heights`, and arrival state. Use a monotonic sequence counter in `push()`.
5. **Forced scroll yank to bottom (`chat.js:183-189`)**: `add()` unconditionally resets `this.back = 0; this.px = 0` on every incoming reply/note — even when the user is scrolled up reading older messages or when an agent replies in a *different* space. Only snap to bottom on `kind === "me"` (or when already at bottom `back === 0 && px === 0`), and when scrolled up adjust `this.back` for same-space additions so the viewport stays anchored.
6. **Wrong-space attribution (`chat.js:391, 397, 451`)**: Exited agents' `.jsonl` turns (`agent?.space ?? this.space()`) and `blocked`/`silent` notes omit the agent's recorded space, dumping them into whichever space is currently focused. Store `space` on `this.waits[address]` and in `.jsonl` log entries (DEV).
7. **False `"finished without writing a reply"` notes (`chat.js:381-400`, `agent.mjs:51`)**: Turns that end via `bh ask` intentionally produce no reply file, yet `this.waits[address]` remains set and fires a bogus `"silent"` note after 8s while the question card is open. Clear/suppress `waits[address]` while `this.open.list` has an open question from `address`.
8. **Flicker & delayed collapse glitches**:
   - **History scroll flash (`chat.js:536-543`)**: `this.arrived` only tracks previously drawn entries, so scrolling up past `SHOWN = 40` treats older history as `fresh` and flashes it at `opacity: 0` for a frame. Only mark entries newly added via `add()` as arriving.
   - **Arrival clobber (`chat.js:539`)**: Unconditionally resetting `this.arriving` inside `render()` cancels in-flight 16ms arrival frames on any intervening re-render.
   - **Working-line double flicker (`chat.js:1042-1050`)**: `working()` schedules `cx.timer.after(16)` during `render()` and collides with `nextTurn()`; also never clears `this.drawnFx` when workers empty.
   - **Delayed composer collapse (`chat.js:584-588`, `composer.js:1503-1507`)**: `on_mouse_down` on `#bh-feed` and `#bc-box` toggles `composer.expanded` without calling `cx.notify()`, so the composer collapses unpredictably on a later unrelated re-render.
   - **Hover leave race (`chat.js:815-821`)**: Leaving entry A after entering entry B overwrites `this.hovered = null` unconditionally; guard with `else if (this.hovered === e.id) this.hovered = null`.
9. **Composer, `sendText`, and `OpenQuestions` races**:
   - `sendText` (`composer.js:1127-1136`) silently drops outgoing cross-page messages (Resume, plan/task comments) whenever `this.sending === true`, strips `@`/`/` tokens by restoring `.value()` instead of `.content()`, and can leak system prompt text into the user's input on error (`composer.js:1217`). Queue cross-page sends separately instead of mutating the user's textarea.
   - `reroute` (`composer.js:518`, up to 70s timeout) holds `this.sending = true` and delays `hooks.sent` (`composer.js:1212`), making submitted messages appear vanished until routing + `hc send` finish.
   - `adopt()` (`composer.js:542-553`) only runs inside `render()` and matches any newly born address in the space; move adoption into `poll()` and match by tab name/spawn tag.
   - `OpenQuestions` (`chat.js:145`, `work.js:363`) is instantiated per view so answering a question on Plans/Tasks leaves a stale card flashing on Chat for up to 2.5s; share dismissed IDs via `herdr` `shared()` state, and guard `work.js:382` polling with `activePage()`.
   - Quiet harnesses (`live.js:49-54`, `chat.js:446`): `delete this.waits[address]` misses remote addresses when `agent` is gone (`fileKey` `_` vs `/`), leaving quiet agents stuck `"working"` for 15 minutes.

### 3. Design & GPUI constraints the plan must respect
- **Design system**: Reuse `look.js` tokens (`LIGHT`/`DARK`/`palette()`), `button.js` (`actionButton`, 28px, tones `primary|secondary|danger|quiet`), `switch.js` (`segmented`, `pill`, `stateView`), and `settings.js` (`group`, `settingRow`, `toggle`, `choice`, `chipButton`, `MoreSheet`). Keep card grids uniform (`CARD_H = 320` in Settings) by placing detailed per-agent fallback editors inside `MoreSheet` or a dedicated tab.
- **GPUI-kit runtime limits (`mods/bot-herdr/gpui-kit.d.ts`)**:
  - `Checkbox` is unstyled — use `toggle`, `segmented`, or `chipButton`.
  - `InputState` placeholder is immutable after creation; `MotionProperty` only animates `opacity`, `width`, `height`, `left`, `top` (no color transitions); no CSS blur (use `SCRIM`); no `Intl` (use `Number#toLocaleString()`); no `fs.stat` (use `fs.exists`).
  - Avoid opening `pick.js` popups *inside* `MoreSheet` dialogs without verifying overlay focus/z-order; prefer inline selectors or top-level Settings tabs for fallback chain pickers.
- **Testability**: Put all new Tasks filtering/grouping/step-event formatting, Chat scroll-anchor/dedupe/wait-suppression helpers, and fallback-chain state logic in pure JS modules (no `gpui-kit`/`gpui-base`/`herdr` imports) so `npm test` and `bh check` verify them.
- **Backend contracts needed from DEV**:
  - Confirm `bh task show <id> --json` latency/payload for 4s polling (or lightweight `etag`/mtime check) so the Tasks page can refresh board + step events cleanly.
  - Provide JSON read/write commands (`bh` CLI) for fallback chain config, live provider cooldown/failover state, guardrail/autonomy config, and any self-improvement proposal queue so Settings, Chat, and Tasks never touch `.bot-herdr` files directly.
- **Definition of "Done" for Design**:
  - Tasks page renders live board, step events, QA gates, search/filters, expandable interactive steps, clean single-scroll layout (desktop + `<720px` narrow), and working `taskComposer` folding.
  - All listed Chat glitches fixed with pure unit tests and verified in both Light/Dark themes (zero scroll yank, zero stuck working indicator, PageUp/PageDown working, monotonic log cursor, unique feed IDs).
  - Fallback, guardrail, and autonomy UI adheres to `look.js` tokens with AA contrast (`4.5:1` text, `3:1` UI) and full keyboard reach (`focusable` / `tab_index(0)`).
