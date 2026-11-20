1. Where should the agents' browser show in the app?
   - A Browser page — a new page in the switch (beside Chat, Terminals…), full width, one tab per agent's browser
     ```mockup
     <style>
     body{margin:0;font:14px/1.5 system-ui;background:#16181d;color:#e6e8ec}
     .app{display:flex;height:640px}
     .rail{width:56px;background:#1c1f26;border-right:1px solid #2a2e37;display:flex;flex-direction:column;align-items:center;gap:8px;padding-top:12px}
     .ic{width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#9aa1ad;font-size:12px}
     .ic.on{background:#2b3140;color:#fff}
     .main{flex:1;display:flex;flex-direction:column}
     .tabs{display:flex;gap:4px;padding:8px 12px 0;border-bottom:1px solid #2a2e37}
     .tab{padding:8px 14px;border-radius:8px 8px 0 0;color:#9aa1ad;display:flex;gap:8px;align-items:center}
     .tab.on{background:#1c1f26;color:#fff}
     .dot{width:8px;height:8px;border-radius:50%}
     .bar{display:flex;gap:8px;align-items:center;padding:8px 12px;background:#1c1f26;border-bottom:1px solid #2a2e37}
     .url{flex:1;background:#16181d;border:1px solid #2a2e37;border-radius:8px;padding:6px 10px;color:#c9ced6}
     .btn{padding:6px 12px;border-radius:8px;background:#3d63dd;color:#fff;font-weight:600}
     .ghost{padding:6px 12px;border-radius:8px;border:1px solid #2a2e37;color:#c9ced6}
     .view{flex:1;margin:12px;border-radius:8px;background:#fff;color:#222;padding:24px}
     .view h2{margin:0 0 8px}.row{height:12px;background:#e5e7eb;border-radius:4px;margin:10px 0;width:70%}
     .status{padding:6px 12px;color:#9aa1ad;font-size:12px;border-top:1px solid #2a2e37}
     </style>
     <div class="app"><div class="rail"><div class="ic">Chat</div><div class="ic">Term</div><div class="ic on">Web</div><div class="ic">Tasks</div><div class="ic">Plans</div></div>
     <div class="main"><div class="tabs"><div class="tab on"><span class="dot" style="background:#4cc38a"></span>QA · localhost:5173</div><div class="tab"><span class="dot" style="background:#e5a33d"></span>Research · docs.rs</div></div>
     <div class="bar"><span class="ghost">←</span><span class="ghost">↻</span><span class="url">http://localhost:5173/checkout</span><span class="ghost">Open in Chrome</span><span class="btn">Take over</span></div>
     <div class="view"><h2>Checkout</h2><div class="row"></div><div class="row" style="width:50%"></div><div class="row" style="width:60%"></div></div>
     <div class="status">QA is driving · clicked "Pay now" 2s ago</div></div></div>
     ```
   - A pane beside the chat — opens to the right of the chat when an agent starts browsing, so you read the chat and watch the page at once
     ```mockup
     <style>
     body{margin:0;font:14px/1.5 system-ui;background:#16181d;color:#e6e8ec}
     .app{display:flex;height:640px}
     .chat{width:520px;border-right:1px solid #2a2e37;display:flex;flex-direction:column;padding:16px;gap:12px}
     .msg{background:#1c1f26;border-radius:8px;padding:10px 12px}
     .who{font-weight:600;display:flex;gap:8px;align-items:center}.dot{width:8px;height:8px;border-radius:50%}
     .muted{color:#9aa1ad}
     .comp{margin-top:auto;border:1px solid #2a2e37;border-radius:8px;padding:10px;color:#9aa1ad}
     .pane{flex:1;display:flex;flex-direction:column}
     .bar{display:flex;gap:8px;align-items:center;padding:8px 12px;background:#1c1f26;border-bottom:1px solid #2a2e37}
     .url{flex:1;background:#16181d;border:1px solid #2a2e37;border-radius:8px;padding:6px 10px;color:#c9ced6}
     .btn{padding:6px 12px;border-radius:8px;background:#3d63dd;color:#fff;font-weight:600}
     .ghost{padding:6px 12px;border-radius:8px;border:1px solid #2a2e37;color:#c9ced6}
     .view{flex:1;margin:12px;border-radius:8px;background:#fff;color:#222;padding:24px}
     .row{height:12px;background:#e5e7eb;border-radius:4px;margin:10px 0;width:70%}
     </style>
     <div class="app"><div class="chat">
     <div class="msg"><div class="who"><span class="dot" style="background:#4cc38a"></span>QA</div><div>Opening the checkout flow to test the coupon field.</div></div>
     <div class="msg"><div class="who"><span class="dot" style="background:#4cc38a"></span>QA</div><div class="muted">Typed SAVE10 · clicked Apply</div></div>
     <div class="comp">Message the team…</div></div>
     <div class="pane"><div class="bar"><span class="who"><span class="dot" style="background:#4cc38a"></span>QA</span><span class="url">localhost:5173/checkout</span><span class="ghost">Open in Chrome</span><span class="btn">Take over</span><span class="ghost">✕</span></div>
     <div class="view"><h2 style="margin:0 0 8px">Checkout</h2><div class="row"></div><div class="row" style="width:40%"></div></div></div></div>
     ```
   - Only a link — no view in the app; the chat shows "QA is browsing localhost:5173" and a button opens that same browser window on your desktop
     ```mockup
     <style>
     body{margin:0;font:14px/1.5 system-ui;background:#16181d;color:#e6e8ec}
     .chat{width:720px;margin:24px auto;display:flex;flex-direction:column;gap:12px}
     .msg{background:#1c1f26;border-radius:8px;padding:10px 12px}
     .who{font-weight:600;display:flex;gap:8px;align-items:center}.dot{width:8px;height:8px;border-radius:50%}
     .card{border:1px solid #2a2e37;border-radius:8px;padding:12px;display:flex;align-items:center;gap:12px}
     .muted{color:#9aa1ad}.btn{margin-left:auto;padding:6px 12px;border-radius:8px;background:#3d63dd;color:#fff;font-weight:600}
     </style>
     <div class="chat"><div class="msg"><div class="who"><span class="dot" style="background:#4cc38a"></span>QA</div><div>Testing the coupon field now.</div></div>
     <div class="card"><div><div style="font-weight:600">QA is browsing</div><div class="muted">localhost:5173/checkout · 14 steps</div></div><span class="btn">Show browser window</span></div></div>
     ```
2. How do you take over the browser from an agent?
   - Click and type in the app — the view inside herdr takes your mouse and keys; "Take over" pauses the agent until you hand it back
   - Switch to a real window — "Take over" pauses the agent and brings its Chrome window to the front; you work there, then hand back
   - Watch only — you can see what it does and tell it in the chat; no taking control
