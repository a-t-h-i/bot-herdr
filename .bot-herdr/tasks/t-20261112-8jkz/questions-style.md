Pick a look for each page. The options come in the same order on both pages (calm, dense, cards), and you can mix them. Whichever you pick, buttons become one size everywhere, a stopped task gets Delete and a plan gets Discard.

1. [DESIGN] Which style for the Tasks page?
   - Calm document — a task list on the left, the open task as one quiet reading column with plain rows
     ```mockup
     <style>
     html,body{margin:0;padding:0;background:#faf9f5}
     .frame{position:relative;width:1200px;height:825px;overflow:hidden;background:#faf9f5;color:#141413;font-family:"Segoe UI",system-ui,sans-serif;font-size:14px;line-height:1.45}
     .frame *{box-sizing:border-box;margin:0;padding:0}
     .i{width:16px;height:16px;flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
     .top{height:56px;display:flex;align-items:center;gap:20px;padding:0 24px;border-bottom:1px solid #e3e0d7}
     .tabs{display:flex;gap:4px}
     .tab{display:flex;align-items:center;gap:8px;height:32px;padding:0 12px;border-radius:10px;color:#6a6964;border:1px solid transparent}
     .tab.on{color:#141413;font-weight:600;background:#ffffff;border-color:#e3e0d7}
     .grow{flex:1}
     .ib{width:32px;height:32px;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#6a6964;border:1px solid #e3e0d7;background:#ffffff}
     .body{display:flex;height:769px}
     .list{width:300px;flex:none;padding:22px 16px 22px 24px;border-right:1px solid #e3e0d7;display:flex;flex-direction:column;gap:2px}
     .seg{display:flex;gap:18px;padding-bottom:12px;margin-bottom:12px;border-bottom:1px solid #e3e0d7;color:#6a6964}
     .seg .on{color:#141413;font-weight:600;border-bottom:2px solid #a25338;padding-bottom:10px}
     .grp{font-size:13px;font-weight:600;color:#6a6964;padding:12px 10px 6px}
     .row{display:flex;flex-direction:column;gap:4px;padding:14px 10px;border-radius:10px;border:1px solid transparent}
     .row.on{background:#ffffff;border-color:#d6d2c6}
     .r1{display:flex;align-items:center;gap:10px}
     .r1 .t{flex:1;min-width:0;font-size:15px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
     .r1 .a{font-size:13px;color:#6a6964;flex:none}
     .r2{font-size:13px;color:#6a6964;padding-left:26px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
     .r3{font-size:13px;color:#6a6964;padding-left:26px;display:flex;align-items:center;gap:8px}
     .pips{display:flex;gap:4px}
     .pips i{width:7px;height:7px;border-radius:4px;background:#e3e0d7}
     .pips i.on{background:#a25338}
     .mk{width:18px;height:18px;flex:none;border-radius:5px;border:1.5px solid #6a6964;display:flex;align-items:center;justify-content:center;color:#ffffff}
     .mk.done{background:#a25338;border-color:#a25338}
     .mk.done .i{width:12px;height:12px;stroke-width:3}
     .mk.active{border-color:#a25338}
     .mk.active b{width:7px;height:7px;border-radius:2px;background:#a25338}
     .mk.pause{border-color:#aa4f0a;color:#aa4f0a;font-weight:700;font-size:13px}
     .doc{flex:1;min-width:0;padding:30px 56px 26px;display:flex;flex-direction:column;gap:22px}
     .head{display:flex;align-items:center;gap:16px}
     h1{flex:1;font-size:24px;font-weight:600;line-height:1.25}
     .btn{height:32px;padding:0 14px;border-radius:10px;font-size:14px;font-weight:500;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
     .btn.solid{background:#a25338;color:#ffffff;border-bottom:2px solid #82422d}
     .btn.line{border:1px solid #d6d2c6;background:#ffffff;color:#141413}
     .facts{display:flex;gap:30px;flex-wrap:wrap}
     .facts dt{font-size:13px;color:#6a6964}
     .facts dd{font-size:15px;margin-top:2px}
     .branch{display:flex;align-items:center;gap:8px;font-size:14px;color:#6a6964}
     h3{font-size:13px;font-weight:600;color:#6a6964;margin-bottom:8px}
     .quote{border-left:3px solid #a25338;padding:2px 0 2px 16px;font-size:16px;line-height:1.5}
     .steps{list-style:none;border-top:1px solid #e3e0d7}
     .step{display:flex;gap:12px;align-items:flex-start;padding:14px 4px;border-bottom:1px solid #e3e0d7}
     .step .n{width:20px;flex:none;color:#6a6964;font-size:14px;padding-top:1px}
     .step .sb{flex:1;min-width:0;display:flex;flex-direction:column;gap:8px}
     .step .st{font-size:15px;line-height:1.45}
     .step .tm{flex:none;font-size:13px;color:#6a6964;padding-top:1px}
     .trail{display:flex;align-items:center;gap:10px;font-size:13px}
     .dots{flex:1;display:flex;gap:6px;align-items:center}
     .dots i{width:5px;height:5px;border-radius:3px;background:#d6825a}
     .trail b{font-weight:600;color:#a16447;flex:none}
     .cmt{display:flex;gap:12px;align-items:flex-start;padding:4px 0}
     .cmt .bar{width:3px;align-self:stretch;border-radius:2px;background:#a25338;flex:none}
     .cmt p{flex:1;font-size:14px;color:#6a6964}
     .lk{font-size:13px;color:#6a6964;flex:none}
     .lk.del{color:#b91c1c}
     .addc{display:flex;gap:12px;align-items:center;margin-top:auto}
     .field{flex:1;height:36px;border:1px solid #e3e0d7;border-radius:10px;background:#ffffff;padding:0 12px;display:flex;align-items:center;color:#6a6964;font-size:14px}
     .note{font-size:13px;color:#6a6964}
     </style>
     <div class="frame">
       <div class="top">
         <div class="tabs">
           <span class="tab on"><svg class="i" viewBox="0 0 24 24"><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/></svg>Tasks</span>
           <span class="tab"><svg class="i" viewBox="0 0 24 24"><path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/></svg>Plans</span>
           <span class="tab"><svg class="i" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>Knowledge</span>
         </div>
         <div class="grow"></div>
         <span class="ib"><svg class="i" viewBox="0 0 24 24"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg></span>
       </div>
       <div class="body">
         <aside class="list">
           <div class="seg"><span class="on">Tasks</span><span>Archived</span></div>
           <div class="grp">Under way · 2</div>
           <div class="row on">
             <div class="r1"><span class="mk active"><b></b></span><span class="t">Toast dismissal animation</span><span class="a">1h</span></div>
             <div class="r2">active · fast track</div>
             <div class="r3"><span class="pips"><i class="on"></i><i></i></span>0/1 steps</div>
           </div>
           <div class="row">
             <div class="r1"><span class="mk active"><b></b></span><span class="t">Scoped knowledge, plan/task pages, mockups</span><span class="a">now</span></div>
             <div class="r2">active · full track</div>
             <div class="r3"><span class="pips"><i class="on"></i><i></i><i></i><i></i><i></i></span>0/5 steps</div>
           </div>
           <div class="grp">Finished · 2</div>
           <div class="row">
             <div class="r1"><span class="mk done"><svg class="i" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg></span><span class="t">Fix browser back, popup backdrop</span><span class="a">1d</span></div>
             <div class="r2">done · worked 4m</div>
           </div>
           <div class="row">
             <div class="r1"><span class="mk done"><svg class="i" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg></span><span class="t">Fix per-agent model selection</span><span class="a">2d</span></div>
             <div class="r2">done · worked &lt;1m</div>
           </div>
         </aside>
         <main class="doc">
           <div class="head">
             <h1>Toast dismissal animation</h1>
             <span class="btn solid">Pause</span>
             <span class="btn line">Archive</span>
           </div>
           <dl class="facts">
             <div><dt>Task</dt><dd>t-20261111-zud8</dd></div>
             <div><dt>Status</dt><dd>active</dd></div>
             <div><dt>Track</dt><dd>fast</dd></div>
             <div><dt>Worked</dt><dd>16h 43m</dd></div>
             <div><dt>Started</dt><dd>11/11/2026</dd></div>
           </dl>
           <div class="branch">
             <svg class="i" viewBox="0 0 24 24"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>
             Branch toast-dismissal-animation, from main
           </div>
           <section>
             <h3>Request</h3>
             <p class="quote">[task] fix the toast notification. It should dissapear as smoothly as it appeared.</p>
           </section>
           <section>
             <h3>Steps · 1</h3>
             <ol class="steps">
               <li class="step">
                 <span class="n">1.</span>
                 <div class="sb">
                   <div class="st">Make the toast's dismissal mirror its appearance in both paths: composer toast and corner toast</div>
                   <div class="trail"><span class="dots"><i style="opacity:.2"></i><i style="opacity:.3"></i><i style="opacity:.4"></i><i style="opacity:.5"></i><i style="opacity:.6"></i><i style="opacity:.7"></i><i style="opacity:.8"></i><i style="opacity:.9"></i><i style="opacity:1"></i><i style="opacity:1"></i><i style="opacity:1"></i><i style="opacity:1"></i><i style="opacity:1"></i><i style="opacity:1"></i><i style="opacity:1"></i><i style="opacity:1"></i><i style="opacity:1"></i><i style="opacity:1"></i></span><b>design-toast</b></div>
                 </div>
                 <span class="tm">16h 43m</span>
               </li>
             </ol>
           </section>
           <section>
             <h3>Comments</h3>
             <div class="cmt"><span class="bar"></span><p>Sample comment on step 1: the corner toast should fade the same way.</p><span class="lk">Resolve</span><span class="lk">Edit</span><span class="lk del">Delete</span></div>
           </section>
           <div class="addc"><span class="field">Comment</span><span class="btn solid">Comment</span></div>
         </main>
       </div>
     </div>
     ```
   - Board with side panel — tasks as a table with track, steps, worked and age columns; the open task in a panel beside it
     ```mockup
     <style>
     html,body{margin:0;padding:0;background:#faf9f5}
     .frame{position:relative;width:1200px;height:825px;overflow:hidden;background:#faf9f5;color:#141413;font-family:"Segoe UI",system-ui,sans-serif;font-size:14px;line-height:1.4}
     .frame *{box-sizing:border-box;margin:0;padding:0}
     .i{width:16px;height:16px;flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
     .top{height:52px;display:flex;align-items:center;gap:16px;padding:0 20px;border-bottom:1px solid #e3e0d7}
     .seg{display:flex;gap:2px;padding:3px;border-radius:10px;background:#ebe9e2}
     .seg span{height:28px;padding:0 12px;border-radius:8px;display:flex;align-items:center;gap:7px;color:#6a6964;font-size:14px}
     .seg span.on{background:#ffffff;color:#141413;font-weight:600}
     .grow{flex:1}
     .ib{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#6a6964}
     .body{display:flex;height:773px}
     .board{width:600px;flex:none;border-right:1px solid #e3e0d7;display:flex;flex-direction:column}
     .bhead,.brow{display:grid;grid-template-columns:18px 1fr 74px 92px 84px 40px;gap:10px;align-items:center;padding:0 16px}
     .bhead{height:34px;font-size:13px;color:#6a6964;border-bottom:1px solid #e3e0d7}
     .bgrp{height:30px;display:flex;align-items:center;gap:8px;padding:0 16px;font-size:13px;font-weight:600;color:#6a6964;background:#f4f3ef;border-bottom:1px solid #e3e0d7}
     .brow{height:48px;border-bottom:1px solid #ebe9e2}
     .bfoot{margin-top:auto;height:44px;display:flex;align-items:center;padding:0 16px;border-top:1px solid #e3e0d7;font-size:13px;color:#6a6964;background:#faf9f5}
     .bfoot b{font-weight:600;color:#a25338;margin-left:6px}
     .brow.on{background:#efede5;border-left:3px solid #a25338;padding-left:13px}
     .brow .tt{font-size:14px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
     .brow.fin .tt{color:#6a6964;font-weight:400}
     .brow .c{font-size:13px;color:#6a6964;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
     .brow .c.ink{color:#141413}
     .pips{display:flex;gap:4px;align-items:center}
     .pips i{width:7px;height:7px;border-radius:4px;background:#e3e0d7}
     .pips i.on{background:#a25338}
     .mk{width:18px;height:18px;border-radius:5px;border:1.5px solid #6a6964;display:flex;align-items:center;justify-content:center;color:#ffffff}
     .mk.done{background:#a25338;border-color:#a25338}
     .mk.done .i{width:12px;height:12px;stroke-width:3}
     .mk.active{border-color:#a25338}
     .mk.active b{width:7px;height:7px;border-radius:2px;background:#a25338}
     .panel{flex:1;min-width:0;padding:20px 24px 22px;display:flex;flex-direction:column;gap:14px}
     .phead{display:flex;align-items:center;gap:12px}
     h1{flex:1;font-size:20px;font-weight:600;line-height:1.25}
     .btn{height:30px;padding:0 12px;border-radius:9px;font-size:14px;font-weight:500;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
     .btn.solid{background:#a25338;color:#ffffff;border-bottom:2px solid #82422d}
     .btn.line{border:1px solid #d6d2c6;background:#ffffff;color:#141413}
     .meta{font-size:13px;color:#6a6964}
     .branch{display:flex;align-items:center;gap:7px;font-size:13px;color:#6a6964}
     .req{border:1px solid #e3e0d7;border-radius:10px;background:#ffffff;padding:12px 14px;font-size:15px;line-height:1.45}
     .sh{display:flex;align-items:center;gap:10px;font-size:13px;font-weight:600;color:#6a6964;padding-bottom:6px;border-bottom:1px solid #e3e0d7}
     .sh .n{font-weight:400}
     .srow{display:grid;grid-template-columns:18px 1fr 64px;gap:10px;align-items:start;padding:12px 0;border-bottom:1px solid #ebe9e2}
     .srow .st{font-size:14px;line-height:1.4}
     .srow .ag{font-size:13px;color:#a16447;font-weight:600;padding-top:1px}
     .srow .tm{font-size:13px;color:#6a6964;text-align:right;padding-top:1px}
     .trail{display:flex;align-items:center;gap:8px;margin-top:8px;font-size:13px}
     .dots{flex:1;display:flex;gap:6px;align-items:center}
     .dots i{width:5px;height:5px;border-radius:3px;background:#d6825a}
     .cmt{display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px solid #ebe9e2;font-size:14px;color:#6a6964}
     .cmt .bar{width:3px;align-self:stretch;border-radius:2px;background:#a25338;flex:none}
     .cmt p{flex:1}
     .lk{font-size:13px;color:#6a6964;flex:none}
     .lk.del{color:#b91c1c}
     .addc{display:flex;gap:10px;align-items:center;margin-top:auto}
     .field{flex:1;height:34px;border:1px solid #e3e0d7;border-radius:9px;background:#ffffff;padding:0 12px;display:flex;align-items:center;color:#6a6964;font-size:14px}
     </style>
     <div class="frame">
       <div class="top">
         <div class="seg">
           <span class="on"><svg class="i" viewBox="0 0 24 24"><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/></svg>Tasks</span>
           <span><svg class="i" viewBox="0 0 24 24"><path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/></svg>Plans</span>
           <span><svg class="i" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>Knowledge</span>
         </div>
         <div class="grow"></div>
         <span class="ib"><svg class="i" viewBox="0 0 24 24"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg></span>
       </div>
       <div class="body">
         <section class="board">
           <div class="bhead"><span></span><span>Task</span><span>Track</span><span>Steps</span><span>Worked</span><span>Age</span></div>
           <div class="bgrp">Under way · 2</div>
           <div class="brow on"><span class="mk active"><b></b></span><span class="tt">Toast dismissal animation</span><span class="c ink">fast</span><span class="pips"><i class="on"></i><i></i><span class="c">0/1</span></span><span class="c">16h 43m</span><span class="c">1h</span></div>
           <div class="brow"><span class="mk active"><b></b></span><span class="tt">Scoped knowledge, plan/task pages, mockups</span><span class="c ink">full</span><span class="pips"><i class="on"></i><i></i><i></i><i></i><i></i><span class="c">0/5</span></span><span class="c">&lt;1m</span><span class="c">now</span></div>
           <div class="bgrp">Finished · 2</div>
           <div class="brow fin"><span class="mk done"><svg class="i" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg></span><span class="tt">Fix browser back, popup backdrop</span><span class="c">fast</span><span class="c">2/2</span><span class="c">4m</span><span class="c">1d</span></div>
           <div class="brow fin"><span class="mk done"><svg class="i" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg></span><span class="tt">Fix per-agent model selection</span><span class="c">full</span><span class="c">3/3</span><span class="c">&lt;1m</span><span class="c">2d</span></div>
           <div class="bfoot">Archived tasks are hidden here. <b>Show archived</b></div>
         </section>
         <section class="panel">
           <div class="phead">
             <h1>Toast dismissal animation</h1>
             <span class="btn solid">Pause</span>
             <span class="btn line">Archive</span>
           </div>
           <div class="meta">t-20261111-zud8 · active · fast track · worked 16h 43m · started 11/11/2026</div>
           <div class="branch"><svg class="i" viewBox="0 0 24 24"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>Branch toast-dismissal-animation (from main)</div>
           <div class="req">[task] fix the toast notification. It should dissapear as smoothly as it appeared.</div>
           <div class="sh">Steps <span class="n">1</span></div>
           <div class="srow">
             <span class="mk active"><b></b></span>
             <div>
               <div class="st">1. Make the toast's dismissal mirror its appearance in both paths: composer toast and corner toast</div>
               <div class="trail"><span class="dots"><i style="opacity:.2"></i><i style="opacity:.3"></i><i style="opacity:.4"></i><i style="opacity:.5"></i><i style="opacity:.6"></i><i style="opacity:.7"></i><i style="opacity:.8"></i><i style="opacity:.9"></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span><b style="color:#a16447;font-weight:600">design-toast</b></div>
             </div>
             <span class="tm">16h 43m</span>
           </div>
           <div class="sh" style="margin-top:6px">Comments <span class="n">1</span></div>
           <div class="cmt"><span class="bar"></span><p>Sample comment on step 1: the corner toast should fade the same way.</p><span class="lk">Resolve</span><span class="lk">Edit</span><span class="lk del">Delete</span></div>
           <div class="addc"><span class="field">Comment</span><span class="btn solid">Comment</span></div>
         </section>
       </div>
     </div>
     ```
   - Card dashboard — tasks as cards across the top; the open task as a card of grouped boxes below
     ```mockup
     <style>
     html,body{margin:0;padding:0;background:#faf9f5}
     .frame{position:relative;width:1200px;height:825px;overflow:hidden;background:#f4f3ef;color:#141413;font-family:"Segoe UI",system-ui,sans-serif;font-size:14px;line-height:1.4}
     .frame *{box-sizing:border-box;margin:0;padding:0}
     .i{width:16px;height:16px;flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
     .top{height:60px;display:flex;align-items:center;gap:10px;padding:0 24px;background:#faf9f5}
     .pt{height:34px;padding:0 14px;border-radius:17px;display:flex;align-items:center;gap:8px;color:#6a6964;background:#faf9f5;border:1px solid #e3e0d7}
     .pt.on{background:#ffffff;color:#141413;font-weight:600;border-color:#d6d2c6}
     .grow{flex:1}
     .ib{width:34px;height:34px;border-radius:17px;display:flex;align-items:center;justify-content:center;color:#6a6964;background:#ffffff;border:1px solid #e3e0d7}
     .cards{display:flex;gap:16px;padding:4px 24px 0}
     .tc{width:276px;height:132px;flex:none;background:#ffffff;border:1px solid #e3e0d7;border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:8px;box-shadow:0 1px 2px rgba(20,20,19,.06)}
     .tc.on{border:2px solid #a25338;padding:13px 15px}
     .tc .r{display:flex;align-items:center;gap:10px}
     .tc .t{flex:1;min-width:0;font-size:15px;font-weight:600;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
     .tc .f{font-size:13px;color:#6a6964;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
     .tc .p{display:flex;gap:4px;align-items:center;font-size:13px;color:#6a6964;margin-top:auto}
     .tc .p i{width:7px;height:7px;border-radius:4px;background:#e3e0d7}
     .tc .p i.on{background:#a25338}
     .mk{width:18px;height:18px;flex:none;border-radius:5px;border:1.5px solid #6a6964;display:flex;align-items:center;justify-content:center;color:#ffffff}
     .mk.done{background:#a25338;border-color:#a25338}
     .mk.done .i{width:12px;height:12px;stroke-width:3}
     .mk.active{border-color:#a25338}
     .mk.active b{width:7px;height:7px;border-radius:2px;background:#a25338}
     .detail{margin:16px 24px 0;height:582px;background:#ffffff;border:1px solid #e3e0d7;border-radius:14px;padding:22px 26px;display:flex;flex-direction:column;gap:16px;box-shadow:0 1px 2px rgba(20,20,19,.06)}
     .dh{display:flex;align-items:center;gap:12px}
     h1{flex:1;font-size:22px;font-weight:600;line-height:1.25}
     .btn{height:32px;padding:0 14px;border-radius:10px;font-size:14px;font-weight:500;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
     .btn.solid{background:#a25338;color:#ffffff;border-bottom:2px solid #82422d}
     .btn.line{border:1px solid #d6d2c6;background:#ffffff;color:#141413}
     .tiles{display:flex;gap:10px}
     .tile{flex:1;background:#faf9f5;border:1px solid #e3e0d7;border-radius:10px;padding:8px 12px}
     .tile .k{font-size:13px;color:#6a6964}
     .tile .v{font-size:15px;font-weight:500}
     .grid{flex:1;min-height:0;display:flex;gap:16px}
     .col{flex:1;min-width:0;display:flex;flex-direction:column;gap:12px}
     .box{background:#faf9f5;border:1px solid #e3e0d7;border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:8px}
     .box h3{font-size:13px;font-weight:600;color:#6a6964}
     .stp{background:#ffffff;border:1px solid #e3e0d7;border-radius:10px;padding:12px 14px;display:flex;gap:12px;align-items:flex-start}
     .stp .sb{flex:1;min-width:0;display:flex;flex-direction:column;gap:8px}
     .stp .st{font-size:15px;line-height:1.4}
     .stp .tm{font-size:13px;color:#6a6964;flex:none;padding-top:1px}
     .trail{display:flex;align-items:center;gap:8px;font-size:13px}
     .dots{flex:1;display:flex;gap:6px;align-items:center}
     .dots i{width:5px;height:5px;border-radius:3px;background:#d6825a}
     .trail b{font-weight:600;color:#a16447;flex:none}
     .chip{display:inline-flex;align-items:center;height:28px;padding:0 10px;border-radius:14px;border:1px solid #e3e0d7;background:#ffffff;font-size:13px;color:#6a6964}
     .row{display:flex;gap:8px;flex-wrap:wrap}
     .cm{font-size:14px;color:#6a6964;display:flex;gap:10px;align-items:flex-start}
     .cm .bar{width:3px;align-self:stretch;border-radius:2px;background:#a25338;flex:none}
     .cm p{flex:1}
     .lk{font-size:13px;color:#6a6964;flex:none}
     .lk.del{color:#b91c1c}
     .addc{display:flex;gap:10px;align-items:center;margin-top:auto}
     .field{flex:1;height:34px;border:1px solid #e3e0d7;border-radius:10px;background:#ffffff;padding:0 12px;display:flex;align-items:center;color:#6a6964;font-size:14px}
     </style>
     <div class="frame">
       <div class="top">
         <span class="pt on"><svg class="i" viewBox="0 0 24 24"><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/></svg>Tasks</span>
         <span class="pt"><svg class="i" viewBox="0 0 24 24"><path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/></svg>Plans</span>
         <span class="pt"><svg class="i" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>Knowledge</span>
         <div class="grow"></div>
         <span class="ib"><svg class="i" viewBox="0 0 24 24"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg></span>
       </div>
       <div class="cards">
         <div class="tc on">
           <div class="r"><span class="mk active"><b></b></span><span class="t">Toast dismissal animation</span></div>
           <div class="f">active · fast track · 1h</div>
           <div class="p"><i class="on"></i><i></i><span style="margin-left:6px">0/1 steps</span></div>
         </div>
         <div class="tc">
           <div class="r"><span class="mk active"><b></b></span><span class="t">Scoped knowledge, plan/task pages, mockups</span></div>
           <div class="f">active · full track · now</div>
           <div class="p"><i class="on"></i><i></i><i></i><i></i><i></i><span style="margin-left:6px">0/5 steps</span></div>
         </div>
         <div class="tc">
           <div class="r"><span class="mk done"><svg class="i" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg></span><span class="t">Fix browser back, popup backdrop</span></div>
           <div class="f">done · worked 4m · 1d</div>
         </div>
         <div class="tc">
           <div class="r"><span class="mk done"><svg class="i" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg></span><span class="t">Fix per-agent model selection</span></div>
           <div class="f">done · worked &lt;1m · 2d</div>
         </div>
       </div>
       <div class="detail">
         <div class="dh">
           <h1>Toast dismissal animation</h1>
           <span class="btn solid">Pause</span>
           <span class="btn line">Archive</span>
         </div>
         <div class="tiles">
           <div class="tile"><div class="k">Task</div><div class="v">t-20261111-zud8</div></div>
           <div class="tile"><div class="k">Status</div><div class="v">active</div></div>
           <div class="tile"><div class="k">Track</div><div class="v">fast</div></div>
           <div class="tile"><div class="k">Worked</div><div class="v">16h 43m</div></div>
           <div class="tile"><div class="k">Started</div><div class="v">11/11/2026</div></div>
         </div>
         <div class="grid">
           <div class="col">
             <div class="box">
               <h3>Steps · 1</h3>
               <div class="stp">
                 <span class="mk active"><b></b></span>
                 <div class="sb">
                   <div class="st">1. Make the toast's dismissal mirror its appearance in both paths: composer toast and corner toast</div>
                   <div class="trail"><span class="dots"><i style="opacity:.2"></i><i style="opacity:.3"></i><i style="opacity:.4"></i><i style="opacity:.5"></i><i style="opacity:.6"></i><i style="opacity:.7"></i><i style="opacity:.8"></i><i style="opacity:.9"></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span><b>design-toast</b></div>
                 </div>
                 <span class="tm">16h 43m</span>
               </div>
             </div>
             <div class="box">
               <h3>Request</h3>
               <div style="font-size:15px;line-height:1.45">[task] fix the toast notification. It should dissapear as smoothly as it appeared.</div>
             </div>
           </div>
           <div class="col">
             <div class="box">
               <h3>Branch</h3>
               <div style="font-size:14px">toast-dismissal-animation, from main</div>
             </div>
             <div class="box" style="flex:1">
               <h3>Comments</h3>
               <div class="cm"><span class="bar"></span><p>Sample comment on step 1: the corner toast should fade the same way.</p><span class="lk">Resolve</span><span class="lk">Edit</span><span class="lk del">Delete</span></div>
               <div class="addc"><span class="field">Comment</span><span class="btn solid">Comment</span></div>
             </div>
           </div>
         </div>
       </div>
     </div>
     ```

2. [DESIGN] Which style for the Plans page?
   - Calm document — one centred column: title, stage, the panel as chips, then the conversation and the composer
     ```mockup
     <style>
     html,body{margin:0;padding:0;background:#faf9f5}
     .frame{position:relative;width:1200px;height:825px;overflow:hidden;background:#faf9f5;color:#141413;font-family:"Segoe UI",system-ui,sans-serif;font-size:14px;line-height:1.45}
     .frame *{box-sizing:border-box;margin:0;padding:0}
     .i{width:16px;height:16px;flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
     .top{height:56px;display:flex;align-items:center;gap:20px;padding:0 24px;border-bottom:1px solid #e3e0d7}
     .tabs{display:flex;gap:4px}
     .tab{display:flex;align-items:center;gap:8px;height:32px;padding:0 12px;border-radius:10px;color:#6a6964;border:1px solid transparent}
     .tab.on{color:#141413;font-weight:600;background:#ffffff;border-color:#e3e0d7}
     .grow{flex:1}
     .ib{width:32px;height:32px;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#6a6964;border:1px solid #e3e0d7;background:#ffffff}
     .col{width:800px;margin:0 auto;padding:18px 0 14px;height:769px;display:flex;flex-direction:column;gap:12px}
     .lnk{font-size:14px;color:#6a6964;display:flex;align-items:center;gap:6px}
     .lnk.acc{color:#a25338;font-weight:500}
     .head{display:flex;flex-direction:column;gap:10px}
     h1{font-size:22px;font-weight:600;line-height:1.3}
     .status{display:flex;align-items:center;gap:10px;font-size:14px;color:#1d4ed8;font-weight:500}
     .dot{width:8px;height:8px;border-radius:4px;background:#1d4ed8}
     .stages{display:flex;gap:14px;font-size:13px;color:#6a6964;align-items:center}
     .stages span{display:flex;align-items:center;gap:5px}
     .stages .i{width:13px;height:13px;stroke:#a25338;stroke-width:2.6}
     .stages .sep{width:16px;height:1px;background:#d6d2c6}
     .panel{display:flex;align-items:center;gap:8px;padding:8px 0;border-top:1px solid #e3e0d7;border-bottom:1px solid #e3e0d7;flex-wrap:wrap}
     .panel .lab{font-size:13px;color:#6a6964;margin-right:6px}
     .seat{height:28px;padding:0 11px;border-radius:14px;border:1px solid #e3e0d7;display:flex;align-items:center;gap:7px;font-size:13px;color:#141413;background:#ffffff}
     .seat i{width:8px;height:8px;border-radius:4px}
     .round{margin-left:auto;font-size:13px;color:#6a6964}
     .round b{font-size:16px;color:#141413;font-weight:600}
     .idea{align-self:flex-end;max-width:700px;background:#efede5;border:1px solid #dcd8cc;border-radius:12px;padding:10px 16px;font-size:14px;line-height:1.45}
     .label{font-size:13px;font-weight:600;color:#6a6964}
     .qs{display:flex;flex-direction:column;gap:10px}
     .q{display:flex;flex-direction:column;gap:6px;border-left:2px solid #d6825a;padding-left:14px}
     .q .qt{font-size:15px;line-height:1.45}
     .q .who{font-size:13px;font-weight:600;color:#a16447;margin-right:6px}
     .chips{display:flex;gap:8px;flex-wrap:wrap}
     .ch{height:28px;padding:0 12px;border-radius:14px;border:1px solid #e3e0d7;display:flex;align-items:center;gap:6px;font-size:14px;color:#6a6964;background:#ffffff}
     .ch.on{background:rgba(162,83,56,.12);border-color:#a25338;color:#141413;font-weight:600}
     .ch.on .i{width:13px;height:13px;stroke:#a25338;stroke-width:2.6}
     .ch.rec{}
     .ans{font-size:14px;color:#6a6964}
     .also{display:flex;flex-direction:column;gap:4px;font-size:14px}
     .also div{display:flex;gap:8px}
     .also .k{color:#6a6964;width:130px;flex:none}
     .also .v{color:#141413}
     .viewrow{display:flex;justify-content:flex-end;margin-top:auto}
     .vp{height:30px;padding:0 12px;border-radius:10px;border:1px solid #e3e0d7;display:flex;align-items:center;gap:8px;font-size:14px;color:#141413;background:#ffffff}
     .comp{border:1px solid #e3e0d7;border-radius:12px;background:#ffffff;padding:12px 16px 8px;display:flex;flex-direction:column;gap:8px}
     .ph{font-size:15px;color:#6a6964;height:34px}
     .tools{display:flex;align-items:center;gap:12px;font-size:13px;color:#6a6964}
     .tools .grow{flex:1}
     .send{width:32px;height:32px;border-radius:10px;background:#a25338;display:flex;align-items:center;justify-content:center;color:#ffffff}
     </style>
     <div class="frame">
       <div class="top">
         <div class="tabs">
           <span class="tab"><svg class="i" viewBox="0 0 24 24"><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/></svg>Tasks</span>
           <span class="tab on"><svg class="i" viewBox="0 0 24 24"><path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/></svg>Plans</span>
           <span class="tab"><svg class="i" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>Knowledge</span>
         </div>
         <div class="grow"></div>
         <span class="ib"><svg class="i" viewBox="0 0 24 24"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg></span>
       </div>
       <div class="col">
         <div class="head">
           <h1>Theme contrast, in-app file browser, visual refresh and measured engine wins</h1>
           <div class="status"><span class="dot"></span>Became a task<span style="flex:1"></span><span class="lnk">Other plans · 2</span><span class="lnk acc"><svg class="i" viewBox="0 0 24 24"><path d="M5 12h14"/><path d="M12 5v14"/></svg>New plan</span></div>
           <div class="stages">
             <span><svg class="i" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>Idea</span><span class="sep"></span>
             <span><svg class="i" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>Questions</span><span class="sep"></span>
             <span><svg class="i" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>Draft</span><span class="sep"></span>
             <span><svg class="i" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>Ready</span><span class="sep"></span>
             <span><svg class="i" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>Task</span>
           </div>
         </div>
         <div class="panel">
           <span class="lab">Panel</span>
           <span class="seat"><i style="background:#a25338"></i>Orchestrator</span>
           <span class="seat"><i style="background:#5b8def"></i>Dev</span>
           <span class="seat"><i style="background:#d6825a"></i>Design</span>
           <span class="seat"><i style="background:#3fa877"></i>QA</span>
           <span class="seat"><i style="background:#a47bd6"></i>Research</span>
           <span class="round">Round <b>11</b></span>
         </div>
         <div class="idea">Three parts. (1) Fix the contrast issue seen with herdr's built-in themes: with other themes the contrast is off (screenshots show low-contrast secondary text like timestamps, 'Comment', 'Open terminal', agent names, inline code chips and user bubbles). (2) Attaching a document fails to open a file explorer. (3) Review the current features: what could be improved, what can be removed, what visual layout would be best, performance improvements, token efficiency, cache hit rates, etc.</div>
         <div class="label">The panel asked</div>
         <div class="qs">
           <div class="q">
             <div class="qt"><span class="who">DESIGN</span>How far should the contrast fix go? (Measured today: timestamps and "Comment" at 2.2–3.4:1 on win98 and atom-one-dark, agent names at 1.6:1 on win98, and our own send button at 3.1:1; AA needs 4.5:1.)</div>
             <div class="chips"><span class="ch">Failing text only</span><span class="ch">AA everywhere, theme kept</span><span class="ch">Always our palette</span></div>
             <div class="ans">You: The borders are also too sharp on the text bubbles compared to bot-herdr's theme.</div>
           </div>
           <div class="q">
             <div class="qt"><span class="who">DEV</span>How should "Attach document…" pick files? (herdr gives mods a folder picker but no file picker; ours runs a PowerShell dialog that opens fine outside the app, so inside herdr it most likely appears behind the window, and every failure is silent today.)</div>
             <div class="chips"><span class="ch">Repair the system dialog</span><span class="ch on"><svg class="i" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>Browse inside the app</span><span class="ch">Both</span></div>
           </div>
         </div>
         <div class="also">
           <div><span class="k">DESIGN</span><span class="v">Which layout should the app settle on? Keep it, tidy details</span></div>
           <div><span class="k">ORCHESTRATOR</span><span class="v">What should this plan build from the features review? Measured wins</span></div>
           <div><span class="k">Visual design</span><span class="v">Keep the paper, tighten it · Compact · Alive</span></div>
           <div><span class="k">Contrast scope</span><span class="v">AA everywhere, theme kept</span></div>
         </div>
         <div class="comp">
           <div class="ph">Describe what to plan, or how to change the plan</div>
           <div class="tools">
             <svg class="i" viewBox="0 0 24 24"><path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"/></svg>
             <span>bot-herdr</span><span>main</span><span>Claude Opus 5.5 xhigh</span>
             <span class="grow"></span>
             <span class="vp"><svg class="i" viewBox="0 0 24 24"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>View plan<svg class="i" viewBox="0 0 24 24" style="width:14px;height:14px"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg></span>
             <span class="send"><svg class="i" viewBox="0 0 24 24"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/></svg></span>
           </div>
         </div>
       </div>
     </div>
     ```
   - Three panes — your plans on the left, the conversation in the middle, round, seats and View plan on the right
     ```mockup
     <style>
     html,body{margin:0;padding:0;background:#faf9f5}
     .frame{position:relative;width:1200px;height:825px;overflow:hidden;background:#faf9f5;color:#141413;font-family:"Segoe UI",system-ui,sans-serif;font-size:14px;line-height:1.4}
     .frame *{box-sizing:border-box;margin:0;padding:0}
     .i{width:16px;height:16px;flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
     .top{height:52px;display:flex;align-items:center;gap:16px;padding:0 20px;border-bottom:1px solid #e3e0d7}
     .seg{display:flex;gap:2px;padding:3px;border-radius:10px;background:#ebe9e2}
     .seg span{height:28px;padding:0 12px;border-radius:8px;display:flex;align-items:center;gap:7px;color:#6a6964;font-size:14px}
     .seg span.on{background:#ffffff;color:#141413;font-weight:600}
     .grow{flex:1}
     .ib{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#6a6964}
     .body{display:flex;height:773px}
     .index{width:236px;flex:none;border-right:1px solid #e3e0d7;padding:16px 12px;display:flex;flex-direction:column;gap:4px}
     .index .hd{font-size:13px;font-weight:600;color:#6a6964;padding:0 8px 8px}
     .ip{padding:10px 10px;border-radius:9px;border:1px solid transparent;display:flex;flex-direction:column;gap:5px}
     .ip.on{background:#ffffff;border-color:#d6d2c6}
     .ip .t{font-size:14px;font-weight:500;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
     .ip .s{font-size:13px;color:#6a6964;display:flex;align-items:center;gap:7px}
     .dot{width:7px;height:7px;border-radius:4px;flex:none}
     .new{margin-top:auto;padding:10px 10px;font-size:14px;color:#a25338;font-weight:500;display:flex;align-items:center;gap:7px}
     .mid{flex:1;min-width:0;padding:16px 22px 18px;display:flex;flex-direction:column;gap:14px}
     .mh{display:flex;align-items:flex-start;gap:12px}
     h1{flex:1;font-size:17px;font-weight:600;line-height:1.3}
     .pill{height:24px;padding:0 10px;border-radius:12px;display:flex;align-items:center;font-size:13px;font-weight:500;color:#1d4ed8;background:rgba(29,78,216,.1);border:1px solid rgba(29,78,216,.28);white-space:nowrap}
     .btn{height:30px;padding:0 11px;border-radius:9px;font-size:14px;font-weight:500;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;border:1px solid #d6d2c6;background:#ffffff;color:#141413}
     .stg{display:flex;align-items:center;gap:6px;font-size:13px;color:#6a6964}
     .stg .d{width:10px;height:10px;border-radius:5px;background:#a25338;flex:none}
     .stg .ln{flex:1;height:2px;border-radius:1px;background:#a25338;min-width:8px}
     .stg span.l{white-space:nowrap}
     .conv{flex:1;min-height:0;display:flex;flex-direction:column;gap:12px;overflow:hidden}
     .idea{align-self:flex-end;max-width:520px;background:#efede5;border:1px solid #dcd8cc;border-radius:12px;padding:10px 14px;font-size:14px;line-height:1.45}
     .set{background:#ffffff;border:1px solid #e3e0d7;border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:12px}
     .set .sh{display:flex;align-items:center;gap:8px;font-size:13px;color:#6a6964}
     .av{width:22px;height:22px;border-radius:11px;background:rgba(162,83,56,.16);border:1px solid rgba(162,83,56,.45);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;color:#a25338}
     .q{display:flex;flex-direction:column;gap:7px}
     .q .qt{font-size:14px;line-height:1.4;display:flex;gap:8px}
     .sp{height:20px;padding:0 7px;border-radius:10px;display:inline-flex;align-items:center;font-size:13px;font-weight:600;flex:none;align-self:flex-start;margin-top:1px}
     .chips{display:flex;gap:6px;flex-wrap:wrap}
     .ch{height:28px;padding:0 10px;border-radius:14px;border:1px solid #e3e0d7;display:flex;align-items:center;gap:6px;font-size:13px;color:#6a6964}
     .ch.on{background:rgba(162,83,56,.12);border-color:#a25338;color:#141413;font-weight:600}
     .ch.on .i{width:13px;height:13px;stroke:#a25338;stroke-width:2.6}
     .ans{font-size:13px;color:#6a6964}
     .also{font-size:13px;color:#6a6964;display:flex;flex-direction:column;gap:4px;padding:2px 2px}
     .also b{font-weight:600;color:#141413}
     .comp{border:1px solid #e3e0d7;border-radius:12px;background:#ffffff;padding:12px 14px 8px;display:flex;flex-direction:column;gap:8px}
     .ph{font-size:14px;color:#6a6964;height:62px}
     .tools{display:flex;align-items:center;gap:10px;font-size:13px;color:#6a6964}
     .send{width:30px;height:30px;border-radius:9px;background:#a25338;display:flex;align-items:center;justify-content:center;color:#ffffff}
     .side{width:264px;flex:none;border-left:1px solid #e3e0d7;padding:16px 18px;display:flex;flex-direction:column;gap:16px}
     .sec{font-size:13px;font-weight:600;color:#6a6964;padding-bottom:6px;border-bottom:1px solid #e3e0d7}
     .rd{display:flex;align-items:baseline;gap:10px}
     .rd b{font-size:30px;font-weight:600;line-height:1}
     .rd span{font-size:13px;color:#6a6964}
     .seatr{display:flex;align-items:center;gap:10px;height:36px;font-size:14px}
     .seatr .ic{width:24px;height:24px;border-radius:7px;display:flex;align-items:center;justify-content:center;border:1px solid}
     .seatr .ic .i{width:14px;height:14px}
     .seatr .nm{flex:1}
     .tg{width:30px;height:16px;border-radius:8px;background:#a25338;position:relative;flex:none}
     .tg::after{content:"";position:absolute;right:2px;top:2px;width:12px;height:12px;border-radius:6px;background:#ffffff}
     .act{display:flex;flex-direction:column;gap:8px}
     .btn.full{justify-content:center;width:100%}
     .btn.solid{background:#a25338;color:#ffffff;border-color:#a25338;border-bottom:2px solid #82422d}
     </style>
     <div class="frame">
       <div class="top">
         <div class="seg">
           <span><svg class="i" viewBox="0 0 24 24"><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/></svg>Tasks</span>
           <span class="on"><svg class="i" viewBox="0 0 24 24"><path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/></svg>Plans</span>
           <span><svg class="i" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>Knowledge</span>
         </div>
         <div class="grow"></div>
         <span class="ib"><svg class="i" viewBox="0 0 24 24"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg></span>
       </div>
       <div class="body">
         <aside class="index">
           <div class="hd">Plans</div>
           <div class="ip on">
             <div class="t">Theme contrast, in-app file browser, visual refresh and measured engine wins</div>
             <div class="s"><span class="dot" style="background:#1d4ed8"></span>Became a task · round 11</div>
           </div>
           <div class="ip">
             <div class="t">Polish bot-herdr's pages and fix agent replies, questions and the classifier</div>
             <div class="s"><span class="dot" style="background:#1d4ed8"></span>Became a task · round 3</div>
           </div>
           <div class="new"><svg class="i" viewBox="0 0 24 24"><path d="M5 12h14"/><path d="M12 5v14"/></svg>New plan</div>
         </aside>
         <section class="mid">
           <div class="mh">
             <h1>Theme contrast, in-app file browser, visual refresh and measured engine wins</h1>
             <span class="pill">Became a task</span>
           </div>
           <div class="stg"><span class="d"></span><span class="l">Idea</span><span class="ln"></span><span class="d"></span><span class="l">Questions</span><span class="ln"></span><span class="d"></span><span class="l">Draft</span><span class="ln"></span><span class="d"></span><span class="l">Ready</span><span class="ln"></span><span class="d"></span><span class="l">Task</span></div>
           <div class="conv">
             <div class="idea">Three parts. (1) Fix the contrast issue seen with herdr's built-in themes: with other themes the contrast is off (screenshots show low-contrast secondary text like timestamps, 'Comment', 'Open terminal', agent names, inline code chips and user bubbles). (2) Attaching a document fails to open a file explorer. (3) Review the current features: what could be improved, what can be removed, what visual layout would be best, performance improvements, token efficiency, cache hit rates, etc.</div>
             <div class="set">
               <div class="sh"><span class="av">T</span>The panel · round 11</div>
               <div class="q"><div class="qt"><span class="sp" style="background:rgba(214,130,90,.16);color:#a16447">DESIGN</span>How far should the contrast fix go? (Measured today: timestamps and "Comment" at 2.2–3.4:1 on win98 and atom-one-dark, agent names at 1.6:1 on win98, and our own send button at 3.1:1; AA needs 4.5:1.)</div>
                 <div class="chips"><span class="ch">Failing text only</span><span class="ch">AA everywhere, theme kept</span><span class="ch">Always our palette</span></div>
                 <div class="ans">You: The borders are also too sharp on the text bubbles compared to bot-herdr's theme.</div></div>
               <div class="q"><div class="qt"><span class="sp" style="background:rgba(91,141,239,.16);color:#4b71bd">DEV</span>How should "Attach document…" pick files? (herdr gives mods a folder picker but no file picker; ours runs a PowerShell dialog that opens fine outside the app, so inside herdr it most likely appears behind the window, and every failure is silent today.)</div>
                 <div class="chips"><span class="ch">Repair the system dialog</span><span class="ch on"><svg class="i" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>Browse inside the app</span><span class="ch">Both</span></div></div>
             </div>
             <div class="also">
               <div><b>DESIGN</b> Which layout should the app settle on? Keep it, tidy details</div>
               <div><b>ORCHESTRATOR</b> What should this plan build from the features review? Measured wins</div>
               <div><b>Visual design</b> Keep the paper, tighten it · Compact · Alive · <b>Contrast scope</b> AA everywhere, theme kept</div>
             </div>
           </div>
           <div class="comp">
             <div class="ph">Describe what to plan, or how to change the plan</div>
             <div class="tools">
               <svg class="i" viewBox="0 0 24 24"><path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"/></svg>
               <span>bot-herdr</span><span>main</span><span>Claude Opus 5.5 xhigh</span>
               <span class="grow" style="flex:1"></span>
               <span class="send"><svg class="i" viewBox="0 0 24 24"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/></svg></span>
             </div>
           </div>
         </section>
         <aside class="side">
           <div class="rd"><b>11</b><span>round</span></div>
           <div class="sec">Panel</div>
           <div class="seatr"><span class="ic" style="border-color:rgba(162,83,56,.45);background:rgba(162,83,56,.14);color:#a25338"><svg class="i" viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M9.6 9.5a2.5 2.5 0 0 1 4.8.9c0 1.6-2.4 2-2.4 3.4"/><path d="M12 16.5h.01"/></svg></span><span class="nm">Orchestrator</span><span class="tg"></span></div>
           <div class="seatr"><span class="ic" style="border-color:rgba(91,141,239,.45);background:rgba(91,141,239,.14);color:#4b71bd"><svg class="i" viewBox="0 0 24 24"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg></span><span class="nm">Dev</span><span class="tg"></span></div>
           <div class="seatr"><span class="ic" style="border-color:rgba(214,130,90,.45);background:rgba(214,130,90,.14);color:#a16447"><svg class="i" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg></span><span class="nm">Design</span><span class="tg"></span></div>
           <div class="seatr"><span class="ic" style="border-color:rgba(63,168,119,.45);background:rgba(63,168,119,.14);color:#33805c"><svg class="i" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg></span><span class="nm">QA</span><span class="tg"></span></div>
           <div class="seatr"><span class="ic" style="border-color:rgba(164,123,214,.45);background:rgba(164,123,214,.14);color:#8564ab"><svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg></span><span class="nm">Research</span><span class="tg"></span></div>
           <div class="sec" style="margin-top:6px">Draft</div>
           <div class="act">
             <span class="btn full"><svg class="i" viewBox="0 0 24 24"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>View plan<svg class="i" viewBox="0 0 24 24" style="width:13px;height:13px"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg></span>
           </div>
         </aside>
       </div>
     </div>
     ```
   - Card dashboard — header card with a stage bar, seats as tiles, questions and answers in side-by-side cards
     ```mockup
     <style>
     html,body{margin:0;padding:0;background:#faf9f5}
     .frame{position:relative;width:1200px;height:825px;overflow:hidden;background:#f4f3ef;color:#141413;font-family:"Segoe UI",system-ui,sans-serif;font-size:14px;line-height:1.4}
     .frame *{box-sizing:border-box;margin:0;padding:0}
     .i{width:16px;height:16px;flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
     .top{height:60px;display:flex;align-items:center;gap:10px;padding:0 24px;background:#faf9f5}
     .pt{height:34px;padding:0 14px;border-radius:17px;display:flex;align-items:center;gap:8px;color:#6a6964;background:#faf9f5;border:1px solid #e3e0d7}
     .pt.on{background:#ffffff;color:#141413;font-weight:600;border-color:#d6d2c6}
     .grow{flex:1}
     .ib{width:34px;height:34px;border-radius:17px;display:flex;align-items:center;justify-content:center;color:#6a6964;background:#ffffff;border:1px solid #e3e0d7}
     .sh{box-shadow:0 1px 2px rgba(20,20,19,.06)}
     .card{background:#ffffff;border:1px solid #e3e0d7;border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:10px}
     .hd{margin:0 24px;height:96px;display:flex;flex-direction:column;gap:10px;padding:12px 20px}
     .hrow{display:flex;align-items:center;gap:12px}
     .tile-ic{width:38px;height:38px;border-radius:11px;background:rgba(29,78,216,.1);border:1px solid rgba(29,78,216,.28);color:#1d4ed8;display:flex;align-items:center;justify-content:center;flex:none}
     .tile-ic .i{width:20px;height:20px}
     h1{flex:1;font-size:18px;font-weight:600;line-height:1.3;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
     .pill{height:26px;padding:0 12px;border-radius:13px;display:flex;align-items:center;font-size:13px;font-weight:600;color:#1d4ed8;background:rgba(29,78,216,.1);border:1px solid rgba(29,78,216,.28);white-space:nowrap}
     .track{display:flex;gap:10px;align-items:flex-end}
     .stp{flex:1;display:flex;flex-direction:column;gap:6px}
     .stp b{height:8px;border-radius:4px;background:#a25338;display:block}
     .stp span{font-size:13px;color:#6a6964}
     .stp span.now{color:#a25338;font-weight:600}
     .rail{margin:12px 24px 0;display:flex;gap:10px;height:64px}
     .rd{width:112px;flex:none;justify-content:center;padding:10px 14px}
     .rd b{font-size:22px;font-weight:600;line-height:1}
     .rd span{font-size:13px;color:#6a6964}
     .seat{flex:1;padding:10px 12px;flex-direction:row;align-items:center;gap:10px;min-width:0}
     .seat .ic{width:32px;height:32px;border-radius:10px;display:flex;align-items:center;justify-content:center;border:1px solid;flex:none}
     .seat .ic .i{width:16px;height:16px}
     .seat .nm{font-size:14px;font-weight:600;line-height:1.2}
     .seat .st{font-size:13px;color:#6a6964}
     .bodyg{margin:12px 24px 0;display:flex;gap:14px;height:296px}
     .left{flex:1;min-width:0;display:flex;flex-direction:column;gap:12px}
     .right{width:400px;flex:none;display:flex;flex-direction:column;gap:12px}
     .idea{align-self:flex-end;max-width:86%;background:#efede5;border:1px solid #dcd8cc;border-radius:14px;padding:10px 14px;font-size:14px;line-height:1.45}
     .pan{flex:1;min-height:0}
     .lab{font-size:13px;font-weight:600;color:#6a6964;display:flex;align-items:center;gap:8px}
     .av{width:22px;height:22px;border-radius:11px;background:rgba(162,83,56,.16);border:1px solid rgba(162,83,56,.45);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;color:#a25338}
     .q{display:flex;flex-direction:column;gap:6px;background:#faf9f5;border:1px solid #e3e0d7;border-radius:11px;padding:8px 12px}
     .q .qt{font-size:14px;line-height:1.4;display:flex;gap:8px;align-items:flex-start}
     .sp{height:20px;padding:0 7px;border-radius:10px;display:inline-flex;align-items:center;font-size:13px;font-weight:600;flex:none;margin-top:1px}
     .chips{display:flex;gap:6px;flex-wrap:wrap}
     .ch{height:28px;padding:0 10px;border-radius:14px;border:1px solid #e3e0d7;display:flex;align-items:center;gap:6px;font-size:13px;color:#6a6964;background:#ffffff}
     .ch.on{background:rgba(162,83,56,.12);border-color:#a25338;color:#141413;font-weight:600}
     .ch.on .i{width:13px;height:13px;stroke:#a25338;stroke-width:2.6}
     .ans{font-size:13px;color:#6a6964}
     .ansc{display:flex;flex-direction:column;gap:8px;flex:1}
     .at{background:#faf9f5;border:1px solid #e3e0d7;border-radius:11px;padding:7px 12px;display:flex;flex-direction:column;gap:2px}
     .at .k{font-size:13px;color:#6a6964}
     .at .v{font-size:14px;font-weight:500}
     .cwrap{margin:0 24px;display:flex;flex-direction:column;align-items:flex-start;margin-top:10px}
     .vtab{height:30px;padding:0 14px;border-radius:12px 12px 0 0;background:#ffffff;border:1px solid #e3e0d7;border-bottom:none;display:flex;align-items:center;gap:8px;font-size:14px;font-weight:500}
     .comp{width:100%;background:#ffffff;border:1px solid #e3e0d7;border-radius:14px;padding:14px 16px 10px;display:flex;flex-direction:column;gap:8px;box-shadow:0 1px 2px rgba(20,20,19,.06)}
     .ph{font-size:14px;color:#6a6964;height:30px}
     .tools{display:flex;align-items:center;gap:10px;font-size:13px;color:#6a6964}
     .send{width:32px;height:32px;border-radius:10px;background:#a25338;display:flex;align-items:center;justify-content:center;color:#ffffff}
     </style>
     <div class="frame">
       <div class="top">
         <span class="pt"><svg class="i" viewBox="0 0 24 24"><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/></svg>Tasks</span>
         <span class="pt on"><svg class="i" viewBox="0 0 24 24"><path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/></svg>Plans</span>
         <span class="pt"><svg class="i" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>Knowledge</span>
         <div class="grow"></div>
         <span class="ib"><svg class="i" viewBox="0 0 24 24"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg></span>
       </div>
       <div class="hd card sh">
         <div class="hrow">
           <span class="tile-ic"><svg class="i" viewBox="0 0 24 24"><path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/></svg></span>
           <h1>Theme contrast, in-app file browser, visual refresh and measured engine wins</h1>
           <span class="pill">Became a task</span>
         </div>
         <div class="track">
           <div class="stp"><b></b><span>Idea</span></div>
           <div class="stp"><b></b><span>Questions</span></div>
           <div class="stp"><b></b><span>Draft</span></div>
           <div class="stp"><b></b><span>Ready</span></div>
           <div class="stp"><b></b><span>Task</span></div>
         </div>
       </div>
       <div class="rail">
         <div class="rd card"><b>11</b><span>round</span></div>
         <div class="seat card sh"><span class="ic" style="border-color:rgba(162,83,56,.45);background:rgba(162,83,56,.14);color:#a25338"><svg class="i" viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M9.6 9.5a2.5 2.5 0 0 1 4.8.9c0 1.6-2.4 2-2.4 3.4"/><path d="M12 16.5h.01"/></svg></span><span><div class="nm">Orchestrator</div><div class="st">on</div></span></div>
         <div class="seat card sh"><span class="ic" style="border-color:rgba(91,141,239,.45);background:rgba(91,141,239,.14);color:#4b71bd"><svg class="i" viewBox="0 0 24 24"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg></span><span><div class="nm">Dev</div><div class="st">on</div></span></div>
         <div class="seat card sh"><span class="ic" style="border-color:rgba(214,130,90,.45);background:rgba(214,130,90,.14);color:#a16447"><svg class="i" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg></span><span><div class="nm">Design</div><div class="st">on</div></span></div>
         <div class="seat card sh"><span class="ic" style="border-color:rgba(63,168,119,.45);background:rgba(63,168,119,.14);color:#33805c"><svg class="i" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg></span><span><div class="nm">QA</div><div class="st">on</div></span></div>
         <div class="seat card sh"><span class="ic" style="border-color:rgba(164,123,214,.45);background:rgba(164,123,214,.14);color:#8564ab"><svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg></span><span><div class="nm">Research</div><div class="st">on</div></span></div>
         <div class="seat card sh" style="flex:none;width:112px;justify-content:center"><svg class="i" viewBox="0 0 24 24" style="color:#6a6964"><path d="m15 18-6-6 6-6"/></svg><span class="st" style="color:#141413;font-weight:500">Previous</span></div>
         <div class="seat card sh" style="flex:none;width:124px;justify-content:center;color:#a25338;white-space:nowrap"><svg class="i" viewBox="0 0 24 24"><path d="M5 12h14"/><path d="M12 5v14"/></svg><span style="font-weight:500">New plan</span></div>
       </div>
       <div class="idea" style="margin:12px 24px 0 auto;width:880px;max-width:none">Three parts. (1) Fix the contrast issue seen with herdr's built-in themes: with other themes the contrast is off (screenshots show low-contrast secondary text like timestamps, 'Comment', 'Open terminal', agent names, inline code chips and user bubbles). (2) Attaching a document fails to open a file explorer. (3) Review the current features: what could be improved, what can be removed, what visual layout would be best, performance improvements, token efficiency, cache hit rates, etc.</div>
       <div class="bodyg">
         <div class="left">
           <div class="card sh pan">
             <div class="lab"><span class="av">T</span>The panel asked · round 11</div>
             <div class="q"><div class="qt"><span class="sp" style="background:rgba(214,130,90,.16);color:#a16447">DESIGN</span>How far should the contrast fix go? (Measured today: timestamps and "Comment" at 2.2–3.4:1 on win98 and atom-one-dark, agent names at 1.6:1 on win98, and our own send button at 3.1:1; AA needs 4.5:1.)</div>
               <div class="chips"><span class="ch">Failing text only</span><span class="ch">AA everywhere, theme kept</span><span class="ch">Always our palette</span></div>
               <div class="ans">You: The borders are also too sharp on the text bubbles compared to bot-herdr's theme.</div></div>
             <div class="q"><div class="qt"><span class="sp" style="background:rgba(91,141,239,.16);color:#4b71bd">DEV</span>How should "Attach document…" pick files? (herdr gives mods a folder picker but no file picker; ours runs a PowerShell dialog that opens fine outside the app, so inside herdr it most likely appears behind the window, and every failure is silent today.)</div>
               <div class="chips"><span class="ch">Repair the system dialog</span><span class="ch on"><svg class="i" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>Browse inside the app</span><span class="ch">Both</span></div></div>
           </div>
         </div>
         <div class="right">
           <div class="card sh ansc">
             <div class="at"><span class="k">DESIGN · Which layout should the app settle on?</span><span class="v">Keep it, tidy details</span></div>
             <div class="at"><span class="k">ORCHESTRATOR · What should this plan build from the features review?</span><span class="v">Measured wins</span></div>
             <div class="at"><span class="k">Visual design · direction, density, motion</span><span class="v">Keep the paper, tighten it · Compact · Alive</span></div>
             <div class="at"><span class="k">Contrast scope</span><span class="v">AA everywhere, theme kept</span></div>
           </div>
         </div>
       </div>
       <div class="cwrap">
         <span class="vtab"><svg class="i" viewBox="0 0 24 24"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>View plan<svg class="i" viewBox="0 0 24 24" style="width:13px;height:13px;color:#6a6964"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg></span>
       </div>
       <div style="margin:0 24px;position:absolute;left:0;right:0;top:692px">
         <div class="comp">
           <div class="ph">Describe what to plan, or how to change the plan</div>
           <div class="tools">
             <svg class="i" viewBox="0 0 24 24"><path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"/></svg>
             <span>bot-herdr</span><span>main</span><span>Claude Opus 5.5 xhigh</span>
             <span style="flex:1"></span>
             <span class="send"><svg class="i" viewBox="0 0 24 24"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/></svg></span>
           </div>
         </div>
       </div>
     </div>
     ```
