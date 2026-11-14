1. [DESIGN] Your comment says tasks should be shown "like this", animated. Which do you mean? (Mockups are still pictures; each option says what moves.)
   - Grouped by phase — a task's steps grouped in phases as this plan lists them, each phase with a bar that fills as its steps finish; a finished phase folds away
     ```mockup
     <style>
     *{box-sizing:border-box}html,body{margin:0}
     body{width:1200px;height:825px;background:#262624;color:#faf9f5;font-family:system-ui,"Segoe UI",sans-serif;display:flex;justify-content:center;padding-top:40px}
     .col{width:660px;display:flex;flex-direction:column;gap:14px}
     h1{font-size:20px;margin:0 0 6px}
     .ph{background:#30302e;border:1px solid #4a4a47;border-radius:12px;padding:12px 14px}
     .hd{display:flex;align-items:center;gap:10px;font-size:13px;font-weight:600}
     .hd .n{margin-left:auto;font-weight:400;color:#bbb9b2;font-size:12px}
     .bar{height:6px;border-radius:3px;background:#3d3d3a;margin:10px 0 8px;overflow:hidden}
     .bar i{display:block;height:100%;background:#d97757;border-radius:3px}
     .st{display:flex;align-items:center;gap:10px;font-size:13px;padding:6px 2px;color:#faf9f5}
     .st.d{color:#bbb9b2}.dot{width:14px;height:14px;border-radius:50%;border:1.5px solid #6b6a65}
     .st.d .dot{background:#7fb27f;border-color:#7fb27f}.st.a .dot{border-color:#d97757;box-shadow:0 0 0 4px rgba(217,119,87,.2)}
     .who{margin-left:auto;font-size:12px;color:#bbb9b2}
     .fold{color:#bbb9b2;font-size:12px}
     </style>
     <div class="col"><h1>Make the team hand off, verify and show its work</h1>
     <div class="ph"><div class="hd">✓ Handoffs<span class="n">6 of 6 · folded</span></div></div>
     <div class="ph"><div class="hd">Verification<span class="n">2 of 4</span></div><div class="bar"><i style="width:50%"></i></div>
     <div class="st d"><span class="dot"></span>7. bh check reports what ran and keeps receipts</div>
     <div class="st d"><span class="dot"></span>8. The gate reads worktrees and untracked files</div>
     <div class="st a"><span class="dot"></span>9. Test selection finds the mod's own tests<span class="who">Dev · 4m</span></div>
     <div class="st"><span class="dot"></span>10. The QA gate gets criteria, reports and a stored verdict</div></div>
     <div class="ph"><div class="hd">Worktrees<span class="n">0 of 1</span></div><div class="bar"><i style="width:0"></i></div></div>
     <div class="ph"><div class="hd">Visibility<span class="n">0 of 6</span></div><div class="bar"><i style="width:0"></i></div></div>
     </div>
     ```
   - Live checklist — today's flat step list, but the active step glows and carries its agent and time, a finished step's check draws in, and the progress bar slides forward
     ```mockup
     <style>
     *{box-sizing:border-box}html,body{margin:0}
     body{width:1200px;height:825px;background:#262624;color:#faf9f5;font-family:system-ui,"Segoe UI",sans-serif;display:flex;justify-content:center;padding-top:40px}
     .col{width:660px;display:flex;flex-direction:column;gap:6px}
     h1{font-size:20px;margin:0 0 8px}
     .bar{height:6px;border-radius:3px;background:#3d3d3a;margin:4px 0 14px;overflow:hidden}.bar i{display:block;height:100%;width:40%;background:#d97757}
     .st{display:flex;align-items:center;gap:10px;font-size:13.5px;padding:8px 10px;border-radius:8px}
     .st.d{color:#bbb9b2}.dot{width:14px;height:14px;border-radius:50%;border:1.5px solid #6b6a65}
     .st.d .dot{background:#7fb27f;border-color:#7fb27f}
     .st.a{background:rgba(217,119,87,.10);border:1px solid rgba(217,119,87,.35)}.st.a .dot{border-color:#d97757;box-shadow:0 0 0 4px rgba(217,119,87,.2)}
     .who{margin-left:auto;font-size:12px;color:#bbb9b2}
     </style>
     <div class="col"><h1>Make the team hand off, verify and show its work</h1>
     <div style="font-size:12px;color:#bbb9b2">8 of 20 steps · worked 2h 10m</div><div class="bar"><i></i></div>
     <div class="st d"><span class="dot"></span>7. bh check reports what ran and keeps receipts<span class="who">Dev · 18m</span></div>
     <div class="st d"><span class="dot"></span>8. The gate reads worktrees and untracked files<span class="who">Dev · 25m</span></div>
     <div class="st a"><span class="dot"></span>9. Test selection finds the mod's own tests<span class="who">Dev · 4m · running tests</span></div>
     <div class="st"><span class="dot"></span>10. The QA gate gets criteria, reports and a stored verdict</div>
     <div class="st"><span class="dot"></span>11. Each writing child runs in its own worktree</div>
     <div class="st"><span class="dot"></span>12. Every agent turn's reply is kept</div>
     </div>
     ```
   - Board columns — steps as cards in To do, Working and Done; a card slides to the next column as its state changes
     ```mockup
     <style>
     *{box-sizing:border-box}html,body{margin:0}
     body{width:1200px;height:825px;background:#262624;color:#faf9f5;font-family:system-ui,"Segoe UI",sans-serif;padding:40px 60px}
     h1{font-size:20px;margin:0 0 18px}
     .cols{display:flex;gap:16px}.c{flex:1;background:#2b2b29;border:1px solid #4a4a47;border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:8px}
     .ch{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:#abaaa4;padding:2px 4px 4px}
     .k{background:#30302e;border:1px solid #4a4a47;border-radius:10px;padding:10px 12px;font-size:13px;line-height:18px}
     .k small{display:block;color:#bbb9b2;font-size:11.5px;margin-top:4px}
     .k.a{border-color:rgba(217,119,87,.6);box-shadow:0 0 0 3px rgba(217,119,87,.15)}
     </style>
     <h1>Make the team hand off, verify and show its work</h1>
     <div class="cols">
     <div class="c"><div class="ch">To do · 11</div><div class="k">10. The QA gate gets criteria, reports and a stored verdict<small>Dev</small></div><div class="k">11. Each writing child runs in its own worktree<small>Dev</small></div><div class="k">13. Agents rail beside the chat<small>Design</small></div></div>
     <div class="c"><div class="ch">Working · 1</div><div class="k a">9. Test selection finds the mod's own tests<small>Dev · 4m · running tests</small></div></div>
     <div class="c"><div class="ch">Done · 8</div><div class="k">8. The gate reads worktrees and untracked files<small>Dev · 25m</small></div><div class="k">7. bh check reports what ran<small>Dev · 18m</small></div></div>
     </div>
     ```
   - Something else — a picture or description you meant to attach; send it in the chat and I'll work it in
